// Étape 4.1 — choix du moteur d'analyse de l'appli (V0 / V1b). Tests Node, aucun navigateur (le menu de réglages, lui,
// se vérifie à la main : docs/SESSION_DERNIERE.md, « Comment tester en 3 minutes »).
//   A. V0 par défaut : l'analyse par le Worker, sans option puis avec engine:'v0', redonne EXACTEMENT les résultats de
//      tests/data/golden-scores.json (score, mat, meilleur coup ; 60 positions, profondeur 7).
//   B. V1b : chargement (une seule fois, par la constante V1B_MODEL_PATH), copie data/models identique au modèle
//      d'entraînement, symétrie miroir exacte (évaluateur et recherche), scores bornés, erreurs (moteur inconnu, modèle
//      illisible ou trop grand).
//   C. Analyse par le Worker avec V1b = analyseSync avec l'évaluateur du fichier ; V1b change bien les scores.
//   D. Contrôleur : pas de clé engine pour V0, engine:'v1b' sinon, setEngine relance la bonne position, réponses périmées
//      ignorées, erreurs transmises.
//   E. Vrai fil d'exécution (worker_threads) : V0 et V1b, moteur inconnu.
//   F. Affichage : ligne « Évaluation indicative… » inchangée pour V0, « · moteur V1b » ajouté pour V1b.
// Usage : node tests/engine-select.mjs
import fs from 'node:fs';
import { Worker } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';
import { runMessage } from '../js/ai/worker.js';
import { analyseSync } from '../js/ai/search.js';
import { FastBoard, WM, BM, WK, BK } from '../js/ai/fastboard.js';
import { mirrorBoard } from '../js/ai/eval.js';
import { createTableEvaluator, normalizeTables, evalBound, MAX_EVAL_BOUND } from '../js/ai/eval-learned.js';
import { ENGINES, DEFAULT_ENGINE, V1B_MODEL_PATH, isEngineId, loadEvaluator } from '../js/ai/engines.js';
import { createAnalysisController } from '../js/ai/analysis-controller.js';
import { formatMeta } from '../js/ai/analysis-format.js';
import { mulberry32, randomFastPosition, toPosition } from './helpers.mjs';

let failures = 0;
const check = (label, cond, extra = '') => {
  if (!cond) failures++;
  console.log(`${cond ? 'OK ' : 'ERR'} ${label}${extra ? ' — ' + extra : ''}`);
};
const strip = (r) => JSON.stringify({ ...r, timeMs: 0, nps: 0 });
const rejects = async (promise) => { try { await promise; return null; } catch (e) { return String(e.message); } };

// Analyse par le Worker (appel direct de runMessage) : message final, ou null.
let nextId = 100;
async function viaWorker(position, options, deps) {
  const out = [];
  await runMessage({ id: ++nextId, type: 'analyse', position, options }, (m) => out.push(m), deps);
  return out.find((m) => m.type !== 'progress');
}

const dataModelUrl = new URL(`../${V1B_MODEL_PATH}`, import.meta.url);
const trainingModelUrl = new URL('../training/models/v1b-l0.json', import.meta.url);
const ref = JSON.parse(fs.readFileSync(new URL('./data/golden-scores.json', import.meta.url), 'utf8'));

// --- A. V0 par défaut : identique aux scores de référence -------------------------------------------------------------------
{
  check('A0 moteur par défaut = V0, et V0 est un moteur connu', DEFAULT_ENGINE === 'v0' && isEngineId('v0'));
  for (const [label, options] of [['sans option engine', {}], ["avec engine:'v0'", { engine: 'v0' }]]) {
    let same = 0;
    const bad = [];
    for (const g of ref.positions) {
      const m = await viaWorker(g.pos, { maxDepth: ref.depth, maxTimeMs: 1e9, ...options });
      if (m && m.ok && m.result.score === g.score && JSON.stringify(m.result.mate) === JSON.stringify(g.mate) && m.result.bestMoveNotation === g.best) same++;
      else bad.push(g.i);
    }
    check(`A1 V0 ${label} : ${same}/${ref.positions.length} positions identiques à tests/data/golden-scores.json (score, mat, meilleur coup, profondeur ${ref.depth})`,
      same === ref.positions.length, bad.length ? `écarts : ${bad.join(',')}` : '');
  }
}

// --- B. V1b : chargement, symétrie, bornes, erreurs --------------------------------------------------------------------------
const E1 = await loadEvaluator('v1b');
const modelJson = JSON.parse(fs.readFileSync(trainingModelUrl, 'utf8'));
{
  check('B1 V1b se charge depuis V1B_MODEL_PATH : un évaluateur (fonction)', typeof E1 === 'function', V1B_MODEL_PATH);
  check('B1 chargé une seule fois : même évaluateur au second appel', (await loadEvaluator('v1b')) === E1);
  let readerCalled = false;
  const noRead = async () => { readerCalled = true; return {}; };
  check('B1 V0 (ou aucun nom) : null, rien à injecter, aucun fichier lu', (await loadEvaluator('v0', noRead)) === null && (await loadEvaluator(undefined, noRead)) === null && !readerCalled);
  check('B1 data/models/v1b-l0.json est IDENTIQUE (octet pour octet) à training/models/v1b-l0.json',
    Buffer.compare(fs.readFileSync(dataModelUrl), fs.readFileSync(trainingModelUrl)) === 0);

  const msgs = [];
  for (const bad of ['v2', 'toString', '__proto__', 'V1B', '', null, 42]) msgs.push(await rejects(loadEvaluator(bad)));
  check('B2 moteur inconnu (v2, toString, __proto__, V1B, vide, null, 42) : refusé', msgs.every((m) => m && m.includes('inconnu')), msgs.map(String).join(' | ').slice(0, 120));
  check("B2 isEngineId n'accepte que v0 et v1b", ['v0', 'v1b'].every(isEngineId) && ['toString', '__proto__', 'V0', ' v0', null, undefined, 0].every((x) => !isEngineId(x)));
  check('B2 chaque moteur a un libellé de menu et un nom court', Object.keys(ENGINES).join() === 'v0,v1b' && Object.values(ENGINES).every((e) => e.label && e.short));

  const garbage = await rejects(loadEvaluator('v1b', async () => ({ man: [1, 2, 3] })));
  check('B3 modèle illisible (tables incomplètes) : refusé avec un message', !!garbage, String(garbage).slice(0, 90));
  const huge = await rejects(loadEvaluator('v1b', async () => ({ man: Array(50).fill(9000), king: Array(50).fill(9000) })));
  check('B3 modèle trop grand (borne de mat dépassée) : refusé', !!huge && huge.includes('29000'), String(huge).slice(0, 90));
  const unreadable = await rejects(loadEvaluator('v1b', async () => { throw new Error('HTTP 404'); }));
  check('B3 fichier introuvable : l\'erreur remonte', unreadable === 'HTTP 404');
  check('B3 après des échecs, le chargement normal fonctionne encore', (await loadEvaluator('v1b')) === E1);
}
{
  // Même évaluation que le modèle d'entraînement construit directement (rien n'est perdu au chargement).
  const direct = createTableEvaluator(modelJson);
  const rnd = mulberry32(2024);
  let diff = 0;
  for (let i = 0; i < 3000; i++) { const fb = randomFastPosition(rnd, i); if (direct(fb.board) === E1(fb.board)) continue; diff++; }
  check('B4 évaluateur chargé = évaluateur construit à partir de training/models/v1b-l0.json (3 000 positions)', diff === 0, `${diff} écart(s)`);
  const base = new FastBoard();
  check('B4 plateau vide : évaluation nulle', E1(base.board) === 0);
}
{
  // Symétrie miroir EXACTE de l'évaluateur (rotation de 180° + échange des couleurs), 6 000 positions.
  const rnd = mulberry32(11);
  let asym = 0;
  for (let i = 0; i < 6000; i++) { const fb = randomFastPosition(rnd, i); if (E1(fb.board) !== -E1(mirrorBoard(fb.board))) asym++; }
  check('B5 évaluateur V1b : symétrie miroir exacte (6 000 positions)', asym === 0, `${asym} asymétrie(s)`);
  check('B5 position initiale : évaluation nulle', E1(FastBoard.initial().board) === 0);

  // Symétrie de la RECHERCHE (profondeur 3) : valide aussi le générateur de coups et la quiescence avec cet évaluateur.
  let bad = 0;
  const NS = 150;
  for (let i = 0; i < NS; i++) {
    const fb = randomFastPosition(rnd, i);
    const mirror = new FastBoard();
    mirror.board.set(mirrorBoard(fb.board));
    mirror.side = fb.side ^ 1;
    const r1 = analyseSync(toPosition(fb), { maxDepth: 3, maxTimeMs: 1e9, evaluator: E1 });
    const r2 = analyseSync(toPosition(mirror), { maxDepth: 3, maxTimeMs: 1e9, evaluator: E1 });
    if (r1.score !== -r2.score) bad++;
  }
  check(`B5 recherche V1b profondeur 3 : score(p) = -score(miroir) sur ${NS} positions`, bad === 0, `${bad} écart(s)`);
}
{
  // Bornes : l'évaluation reste sous la borne exacte de son modèle, elle-même sous la zone des scores de mat.
  const bound = Math.max(...normalizeTables(modelJson).map(evalBound));
  check(`B6 borne exacte de |évaluation| du modèle = ${bound} ≤ ${MAX_EVAL_BOUND} (zone des mats)`, bound <= MAX_EVAL_BOUND);
  const rnd = mulberry32(5);
  let worst = 0;
  for (let i = 0; i < 20000; i++) { const fb = randomFastPosition(rnd, i); worst = Math.max(worst, Math.abs(E1(fb.board))); }
  // Positions « extrêmes » : tout le plateau en dames d'un camp contre pions de l'autre, etc.
  for (let i = 0; i < 4000; i++) {
    const fb = new FastBoard();
    const kindW = [WM, WK][i % 2], kindB = [BM, BK][(i >> 1) % 2];
    for (let k = 0; k < 20; k++) { const sq = Math.floor(rnd() * 50); if (!fb.board[sq]) fb.board[sq] = rnd() < 0.5 ? kindW : kindB; }
    worst = Math.max(worst, Math.abs(E1(fb.board)));
  }
  check(`B6 évaluation maximale observée sur 24 000 positions (dont extrêmes) = ${worst} ≤ borne ${bound}`, worst <= bound);

  let nonMate = 0, mates = 0, oob = 0;
  for (let i = 0; i < 80; i++) {
    const fb = randomFastPosition(rnd, i);
    const m = await viaWorker(toPosition(fb), { maxDepth: 5, maxTimeMs: 1e9, engine: 'v1b' });
    if (!m.ok) { oob++; continue; }
    const { score, mate } = m.result;
    if (mate === null) { nonMate++; if (Math.abs(score) > bound) oob++; } else { mates++; if (Math.abs(score) <= MAX_EVAL_BOUND) oob++; }
  }
  check(`B6 recherche V1b (profondeur 5, 80 positions) : ${nonMate} scores bornés par ${bound}, ${mates} mats nettement hors bornes`, oob === 0, `${oob} hors bornes`);
}

// --- C. Analyse par le Worker avec V1b ---------------------------------------------------------------------------------------
{
  let same = 0, differ = 0;
  const sample = ref.positions.filter((g) => g.i % 5 === 0).slice(0, 12);
  for (const g of sample) {
    const m = await viaWorker(g.pos, { maxDepth: 6, maxTimeMs: 1e9, engine: 'v1b' });
    const direct = analyseSync(g.pos, { maxDepth: 6, maxTimeMs: 1e9, evaluator: createTableEvaluator(modelJson) });
    if (m.ok && strip(m.result) === strip(direct)) same++;
    const v0 = analyseSync(g.pos, { maxDepth: 6, maxTimeMs: 1e9 });
    if (m.ok && m.result.score !== v0.score) differ++;
  }
  check(`C1 Worker engine:'v1b' = analyseSync avec l'évaluateur du fichier (${same}/${sample.length} résultats complets identiques : score, mat, coup, ligne, nœuds)`, same === sample.length);
  check(`C1 l'option engine change réellement le résultat (score différent de V0 sur ${differ}/${sample.length} positions)`, differ >= Math.ceil(sample.length * 0.75));

  // Alterner V0 / V1b dans le MÊME Worker : la table de transposition ne doit rien garder d'un moteur à l'autre.
  const g = sample[3];
  const a = await viaWorker(g.pos, { maxDepth: 6, maxTimeMs: 1e9 });
  const b = await viaWorker(g.pos, { maxDepth: 6, maxTimeMs: 1e9, engine: 'v1b' });
  const a2 = await viaWorker(g.pos, { maxDepth: 6, maxTimeMs: 1e9, engine: 'v0' });
  const b2 = await viaWorker(g.pos, { maxDepth: 6, maxTimeMs: 1e9, engine: 'v1b' });
  check('C2 alternance V0 → V1b → V0 → V1b dans un même Worker : chaque résultat est reproductible', strip(a.result) === strip(a2.result) && strip(b.result) === strip(b2.result));

  const unknown = await viaWorker(g.pos, { maxDepth: 3, engine: 'v9' });
  check('C3 moteur inconnu : réponse d\'erreur claire, pas d\'exception', unknown.ok === false && /inconnu/.test(unknown.error), unknown.error);
  const failing = await viaWorker(g.pos, { maxDepth: 3, engine: 'v1b' }, { loadEvaluator: async () => { throw new Error('modèle introuvable (HTTP 404)'); } });
  check('C3 modèle illisible : réponse d\'erreur (le contrôleur la transmet à l\'interface)', failing.ok === false && /404/.test(failing.error), failing.error);
  const out = [];
  await runMessage({ id: 900, type: 'analyse', position: g.pos, options: { maxDepth: 4, maxTimeMs: 1e9, engine: 'v1b' } }, (m) => out.push(m));
  check('C4 progression à chaque profondeur avec V1b (4 messages) puis résultat final', out.filter((m) => m.type === 'progress').length === 4 && out.at(-1).ok === true && out.every((m) => m.id === 900));
}

// --- D. Contrôleur -----------------------------------------------------------------------------------------------------------
{
  const makeClock = () => {
    let now = 0, nextTimer = 1;
    const timers = new Map();
    return {
      setTimer: (fn, ms) => { const id = nextTimer++; timers.set(id, { at: now + ms, fn }); return id; },
      clearTimer: (id) => { timers.delete(id); },
      advance(ms) {
        const end = now + ms;
        for (;;) {
          const due = [...timers.entries()].filter(([, t]) => t.at <= end).sort((x, y) => x[1].at - y[1].at)[0];
          if (!due) break;
          now = due[1].at; timers.delete(due[0]); due[1].fn();
        }
        now = end;
      },
    };
  };
  const makeHarness = (opts = {}) => {
    const clock = makeClock(), workers = [], events = [];
    const createWorker = () => {
      const w = {
        sent: [], terminated: false, onmessage: null, onerror: null,
        postMessage(m) { this.sent.push(m); },
        terminate() { this.terminated = true; },
        reply(data) { if (!this.terminated && this.onmessage) this.onmessage({ data }); },
      };
      workers.push(w);
      return w;
    };
    const ctl = createAnalysisController({ createWorker, onChange: (s) => events.push(s), setTimer: clock.setTimer, clearTimer: clock.clearTimer, ...opts });
    return { ctl, clock, workers, events };
  };
  const fb = FastBoard.initial();
  const posA = { board: fb.toUiBoard(), side: 'w' };
  fb.makeMove(fb.generateMoves()[0]);
  const posB = { board: fb.toUiBoard(), side: 'b' };
  const res = (depth) => ({ score: depth, mate: null, bestMove: { from: 1, to: 2 }, depth });

  {
    const h = makeHarness();
    h.ctl.enable(); h.ctl.request(posA); h.clock.advance(150);
    check('D1 V0 (défaut) : options du message = { maxTimeMs, maxDepth } SANS clé engine (message d\'avant l\'étape 4.1)',
      h.ctl.engine === 'v0' && JSON.stringify(h.workers[0].sent[0].options) === JSON.stringify({ maxTimeMs: 1500, maxDepth: 24 }));
  }
  {
    const h = makeHarness({ engine: 'v1b' });
    h.ctl.enable(); h.ctl.request(posA); h.clock.advance(150);
    check("D2 contrôleur créé avec engine:'v1b' : le message porte options.engine = 'v1b'", h.ctl.engine === 'v1b' && h.workers[0].sent[0].options.engine === 'v1b');
    const h2 = makeHarness({ engine: 'v9' });
    check("D2 moteur initial invalide : retour à V0", h2.ctl.engine === 'v0');
  }
  {
    // Analyse terminée, puis changement de moteur : même Worker réutilisé, même position renvoyée avec le nouveau moteur.
    const h = makeHarness();
    h.ctl.enable(); h.ctl.request(posA); h.clock.advance(150);
    const w = h.workers[0], id1 = w.sent[0].id;
    w.reply({ id: id1, ok: true, result: res(9) });
    h.ctl.setEngine('v1b');
    check("D3 setEngine('v1b') : phase 'waiting', rien envoyé avant la fin du debounce", h.events.at(-1).phase === 'waiting' && w.sent.length === 1);
    h.clock.advance(150);
    const m = w.sent[1];
    check("D3 même Worker (analyse finie), même position, options.engine = 'v1b', nouvel identifiant",
      h.workers.length === 1 && !w.terminated && w.sent.length === 2 && m.options.engine === 'v1b' && m.position.side === 'w' && m.id !== id1 && JSON.stringify(m.position.board) === JSON.stringify(w.sent[0].position.board));
    w.reply({ id: id1, type: 'progress', ok: true, result: res(4) });
    check('D3 réponse de l\'ancien moteur (ancien identifiant) ignorée', h.events.at(-1).phase === 'waiting');
    w.reply({ id: m.id, type: 'progress', ok: true, result: res(3) });
    check('D3 réponse du nouveau moteur prise en compte', h.events.at(-1).phase === 'thinking' && h.events.at(-1).result.depth === 3);
    w.reply({ id: m.id, ok: true, result: res(9) }); // analyse terminée : le Worker sera réutilisé
    h.ctl.setEngine('v1b');
    const n = h.events.length, s = w.sent.length;
    h.clock.advance(1000);
    check('D4 setEngine du moteur déjà actif : aucun événement, aucun envoi', h.events.length === n && w.sent.length === s);
    h.ctl.request(posA);
    check('D4 même position, même moteur : toujours dédoublonnée', h.events.length === n && w.sent.length === s);
    h.ctl.setEngine('v0');
    h.clock.advance(150);
    check("D5 retour à V0 : le message n'a plus de clé engine", !('engine' in w.sent.at(-1).options) && w.sent.length === s + 1);
  }
  {
    // Changement de moteur pendant une analyse EN COURS : Worker détruit, nouveau Worker, position conservée.
    const h = makeHarness();
    h.ctl.enable(); h.ctl.request(posB); h.clock.advance(150);
    const w1 = h.workers[0], id1 = w1.sent[0].id;
    w1.reply({ id: id1, type: 'progress', ok: true, result: res(3) });
    h.ctl.setEngine('v1b');
    check('D6 analyse en cours : ancien Worker détruit au changement de moteur', w1.terminated);
    w1.reply({ id: id1, ok: true, result: res(10) });
    check('D6 réponse tardive de l\'ancien Worker ignorée', h.events.at(-1).phase === 'waiting');
    h.clock.advance(150);
    const w2 = h.workers[1];
    check("D6 nouveau Worker : position conservée (trait aux Noirs), engine 'v1b'", h.workers.length === 2 && w2.sent.length === 1 && w2.sent[0].position.side === 'b' && w2.sent[0].options.engine === 'v1b');
    check('D6 jamais deux Workers vivants', h.workers.filter((w) => !w.terminated).length === 1);
  }
  {
    // Historique transmis : conservé quand on change de moteur.
    const h = makeHarness();
    const hist = { quiet: 2, positions: [posA, posB] };
    h.ctl.enable(); h.ctl.request(posB, hist); h.clock.advance(150);
    h.workers[0].reply({ id: h.workers[0].sent[0].id, ok: true, result: res(9) });
    h.ctl.setEngine('v1b'); h.clock.advance(150);
    const m = h.workers[0].sent[1];
    check("D7 historique de la partie conservé au changement de moteur", m.history && m.history.quiet === 2 && m.history.positions.length === 2 && m.options.engine === 'v1b');
  }
  {
    // Interrupteur coupé : rien ne part, et le choix vaut pour la prochaine activation.
    const h = makeHarness();
    h.ctl.setEngine('v1b');
    h.clock.advance(1000);
    check('D8 analyse coupée : setEngine ne crée aucun Worker et ne lance rien', h.workers.length === 0 && h.events.length === 0 && h.ctl.engine === 'v1b');
    h.ctl.enable(); h.ctl.request(posA); h.clock.advance(150);
    check("D8 à l'activation suivante, le message porte le moteur choisi", h.workers[0].sent[0].options.engine === 'v1b');
    h.ctl.disable();
    h.ctl.setEngine('v0'); h.clock.advance(1000);
    check('D8 après désactivation, setEngine ne relance rien', h.workers[0].terminated && h.workers.length === 1 && h.events.at(-1).phase === 'off');
    h.ctl.enable(); h.ctl.request(posA); h.clock.advance(150);
    check('D8 réactivation : nouvelle analyse avec V0, sans clé engine', h.workers.length === 2 && !('engine' in h.workers[1].sent[0].options));
  }
  {
    const h = makeHarness();
    let threw = false;
    try { h.ctl.setEngine('v9'); } catch { threw = true; }
    check('D9 moteur inconnu : setEngine lève une erreur, le moteur reste V0', threw && h.ctl.engine === 'v0');
    h.ctl.enable(); h.ctl.request(posA); h.clock.advance(150);
    h.workers[0].reply({ id: h.workers[0].sent[0].id, ok: false, error: 'modèle introuvable (HTTP 404)' });
    check("D10 erreur du Worker : phase 'error' avec le message (l'interface s'en sert pour le repli sur V0)", h.events.at(-1).phase === 'error' && h.events.at(-1).error === 'modèle introuvable (HTTP 404)');
    const h2 = makeHarness();
    h2.ctl.enable(); h2.ctl.request(posA); h2.clock.advance(150);
    h2.workers[0].onerror({ message: 'x' });
    check("D10 erreur du fil du Worker : phase 'error' avec son message", h2.events.at(-1).phase === 'error' && h2.events.at(-1).error === 'x');
    check("D10 les autres phases n'ont pas de clé error", h.events.filter((e) => e.phase !== 'error').every((e) => !('error' in e)));
  }
  {
    // Repli sur V0 après une erreur (comme main.js) : setEngine('v0') relance la même position, sans clé engine.
    const h = makeHarness({ engine: 'v1b' });
    h.ctl.enable(); h.ctl.request(posB); h.clock.advance(150);
    h.workers[0].reply({ id: h.workers[0].sent[0].id, ok: false, error: 'boum' });
    h.ctl.setEngine('v0');
    h.clock.advance(150);
    const w = h.workers[0];
    check('D11 repli sur V0 après une erreur : même position renvoyée sans clé engine', h.ctl.engine === 'v0' && w.sent.length === 2 && w.sent[1].position.side === 'b' && !('engine' in w.sent[1].options));
  }
}

// --- E. Vrai fil d'exécution (worker_threads) --------------------------------------------------------------------------------
{
  const w = new Worker(fileURLToPath(new URL('./worker-thread-shim.mjs', import.meta.url)));
  const msgs = [];
  let notify = null;
  w.on('message', (m) => { msgs.push(m); if (notify) notify(); });
  w.on('error', (e) => { console.log('ERR erreur du fil : ' + e.message); failures++; });
  const waitFor = (pred, timeoutMs = 30000) => new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('délai dépassé')), timeoutMs);
    const look = () => { const hit = msgs.find(pred); if (hit) { clearTimeout(t); notify = null; resolve(hit); } };
    notify = look;
    look();
  });
  await waitFor((m) => m.type === 'ready');
  const g = ref.positions[7];
  w.postMessage({ id: 1, type: 'analyse', position: g.pos, options: { maxDepth: 6, maxTimeMs: 1e9 } });
  const r0 = await waitFor((m) => m.id === 1 && m.type !== 'progress');
  w.postMessage({ id: 2, type: 'analyse', position: g.pos, options: { maxDepth: 6, maxTimeMs: 1e9, engine: 'v1b' } });
  const r1 = await waitFor((m) => m.id === 2 && m.type !== 'progress');
  w.postMessage({ id: 3, type: 'analyse', position: g.pos, options: { maxDepth: 6, maxTimeMs: 1e9, engine: 'v9' } });
  const r9 = await waitFor((m) => m.id === 3 && m.type !== 'progress');
  w.postMessage({ id: 4, type: 'analyse', position: g.pos, options: { maxDepth: 6, maxTimeMs: 1e9 } });
  const r0b = await waitFor((m) => m.id === 4 && m.type !== 'progress');
  check('E1 vrai fil, V0 : résultat identique à analyseSync (et à l\'étape d\'avant)', r0.ok && strip(r0.result) === strip(analyseSync(g.pos, { maxDepth: 6, maxTimeMs: 1e9 })));
  check('E1 vrai fil, V1b : le modèle se charge depuis le disque, résultat identique à analyseSync avec l\'évaluateur', r1.ok && strip(r1.result) === strip(analyseSync(g.pos, { maxDepth: 6, maxTimeMs: 1e9, evaluator: createTableEvaluator(modelJson) })));
  check('E1 vrai fil : moteur inconnu = erreur, puis V0 refonctionne comme avant', r9.ok === false && /inconnu/.test(r9.error) && r0b.ok && strip(r0b.result) === strip(r0.result));
  await w.terminate();
}

// --- F. Affichage ----------------------------------------------------------------------------------------------------------
{
  const r = { score: 80, mate: null, depth: 9 };
  check('F1 V0 : « Évaluation indicative · profondeur 9 » inchangé', formatMeta(r) === 'Évaluation indicative · profondeur 9' && formatMeta(r, null) === formatMeta(r));
  check('F1 V1b : « … · moteur V1b » ajouté', formatMeta(r, 'V1b') === 'Évaluation indicative · profondeur 9 · moteur V1b');
  check('F1 partie terminée ou pas de résultat : rien, avec ou sans nom de moteur', formatMeta({ score: 0, mate: { winner: 'w', in: 0 }, depth: 0 }, 'V1b') === '' && formatMeta(null, 'V1b') === '');
}

console.log(failures === 0 ? 'RÉSULTAT : tout concorde.' : `RÉSULTAT : ${failures} échec(s).`);
process.exit(failures === 0 ? 0 : 1);
