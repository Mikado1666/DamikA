// DAMIKA — Cycle de vie de l'analyse dans l'interface (étage 2b). Aucun accès au DOM ni à l'état de
// l'appli : le contrôleur reçoit des positions, parle à UN Web Worker (js/ai/worker.js) et rend compte
// par un rappel. main.js ne fait que l'afficher. Le Worker est injecté (`createWorker`) pour pouvoir
// tester tout cela sous Node avec un faux Worker (tests/analysis-controller.mjs).
//
// Règles
//   - Un seul Worker à la fois : créé à l'activation, détruit à la désactivation.
//   - Chaque nouvelle position remplace l'analyse en cours, après un court délai (debounce). Si une
//     analyse est EN COURS à ce moment-là, le Worker est détruit (terminate) puis recréé au besoin :
//     un Worker occupé ne lit pas ses messages avant la fin de sa profondeur en cours.
//   - Chaque requête porte un identifiant ; toute réponse d'une requête périmée est ignorée.
//   - Une position identique à la précédente (plateau + trait + historique transmis) ne relance rien.
//   - Le contrôleur ne lit que la position qu'on lui donne : il ne touche ni à la partie ni à la sauvegarde.
//   - Moteur d'analyse (étape 4.1, js/ai/engines.js) : 'v0' par défaut, 'v1b' (évaluation apprise). Le moteur
//     est transmis au Worker dans options.engine, SEULEMENT s'il n'est pas V0 (message identique à celui d'avant
//     l'étape 4.1 pour V0). setEngine() relance l'analyse de la dernière position demandée avec le nouveau moteur.
//
// Rappel onChange({ phase, result, error? }) :
//   phase 'off'      : désactivé (result = null)
//   phase 'waiting'  : nouvelle position, analyse pas encore démarrée / en cours de démarrage
//   phase 'thinking' : au moins une profondeur terminée, la recherche continue (result = dernière profondeur)
//   phase 'done'     : recherche terminée (result = résultat final)
//   phase 'error'    : le Worker a échoué (result = null ; error = message du Worker s'il en a donné un)

import { positionKey } from './analysis-format.js';
import { DEFAULT_ENGINE, isEngineId } from './engines.js';

export const DEFAULT_DEBOUNCE_MS = 150;
export const DEFAULT_MAX_TIME_MS = 1500;
export const DEFAULT_MAX_DEPTH = 24;

export function createAnalysisController({
  createWorker,
  onChange,
  debounceMs = DEFAULT_DEBOUNCE_MS,
  maxTimeMs = DEFAULT_MAX_TIME_MS,
  maxDepth = DEFAULT_MAX_DEPTH,
  engine: initialEngine = DEFAULT_ENGINE,
  setTimer = setTimeout,
  clearTimer = clearTimeout,
}) {
  let enabled = false;
  let worker = null;
  let timer = null;
  let seq = 0;            // identifiant de la dernière requête envoyée
  let currentId = 0;      // identifiant de la requête dont on attend les réponses (0 = aucune)
  let running = false;    // une requête a été envoyée et sa réponse finale n'est pas arrivée
  let currentKey = null;  // empreinte de la position demandée en dernier
  let pending = null;     // position en attente de l'expiration du debounce
  let last = null;        // dernière position demandée (copie), pour la relancer quand le moteur change
  let engine = isEngineId(initialEngine) ? initialEngine : DEFAULT_ENGINE;

  const emit = (phase, result = null, error = null) => onChange({ phase, result, ...(error ? { error } : {}) });

  function killWorker() {
    if (worker) {
      worker.onmessage = null;
      worker.onerror = null;
      worker.terminate();
      worker = null;
    }
    running = false;
    currentId = 0;
  }

  function ensureWorker() {
    if (worker) return worker;
    worker = createWorker();
    const mine = worker;
    mine.onmessage = (e) => {
      if (mine !== worker) return;
      const msg = e.data;
      if (!msg || msg.id !== currentId) return; // réponse d'une requête périmée
      if (msg.ok === false) {
        running = false;
        emit('error', null, msg.error ?? 'erreur du Worker');
        return;
      }
      if (msg.type === 'progress') {
        emit('thinking', msg.result);
      } else {
        running = false;
        emit('done', msg.result);
      }
    };
    mine.onerror = (e) => {
      if (mine !== worker) return;
      running = false;
      emit('error', null, (e && e.message) || 'erreur du Worker');
    };
    return worker;
  }

  function send() {
    timer = null;
    if (!enabled || !pending) return;
    const { history, ...position } = pending;
    pending = null;
    let w;
    try {
      w = ensureWorker();
    } catch (err) {
      running = false;
      emit('error', null, String(err && err.message ? err.message : err));
      return;
    }
    currentId = ++seq;
    running = true;
    w.postMessage({
      id: currentId,
      type: 'analyse',
      position,
      ...(history ? { history } : {}),
      options: { maxTimeMs, maxDepth, ...(engine !== DEFAULT_ENGINE ? { engine } : {}) },
    });
  }

  // position = { board, side } au format de l'interface (game.board, game.sideToMove).
  // history (facultatif) = { positions: [{ board, side }], quiet } : cf. analysisHistory() dans
  // analysis-format.js. Absent ou quiet = 0 : rien n'est transmis (comportement d'avant).
  function request(position, history = null) {
    if (!enabled) return;
    const hist = history && history.quiet > 0 && history.positions && history.positions.length > 0 ? history : null;
    const key = positionKey(position.board, position.side)
      + (hist ? `|${hist.quiet}|${hist.positions.map((p) => positionKey(p.board, p.side)).join(',')}` : '');
    if (key === currentKey) return; // même position : rien à refaire
    currentKey = key;
    if (timer !== null) { clearTimer(timer); timer = null; }
    if (running) killWorker(); // analyse en cours : arrêt immédiat (recréé au prochain envoi)
    currentId = 0;
    // Copie : la position reste figée jusqu'à l'envoi, même si l'appelant remplace son plateau.
    pending = {
      board: position.board.map((p) => (p ? { color: p.color, king: !!p.king } : null)),
      side: position.side,
      history: hist ? {
        quiet: hist.quiet,
        positions: hist.positions.map((p) => ({
          board: p.board.map((q) => (q ? { color: q.color, king: !!q.king } : null)),
          side: p.side,
        })),
      } : null,
    };
    last = pending;
    emit('waiting');
    timer = setTimer(send, debounceMs);
  }

  return {
    get enabled() { return enabled; },

    enable() {
      if (enabled) return;
      enabled = true;
      ensureWorker();
      emit('waiting');
    },

    disable() {
      if (!enabled) return;
      enabled = false;
      if (timer !== null) { clearTimer(timer); timer = null; }
      pending = null;
      last = null;
      currentKey = null;
      killWorker();
      emit('off');
    },

    request,

    get engine() { return engine; },

    // Change de moteur : si l'analyse est active, la dernière position demandée est relancée avec le nouveau
    // moteur (analyse en cours = Worker détruit, comme pour un changement de position).
    setEngine(id) {
      if (!isEngineId(id)) throw new Error(`moteur d'analyse inconnu : ${String(id)}`);
      if (id === engine) return;
      engine = id;
      currentKey = null; // même position, autre moteur : à refaire
      if (enabled && last) request({ board: last.board, side: last.side }, last.history);
    },
  };
}
