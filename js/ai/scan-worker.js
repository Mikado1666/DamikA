// DAMIKA — Web Worker de Scan 3.1 (moteur de dames de Fabien Letouzey, GPL-3.0), compilé en WebAssembly.
// Binaires : assets/engines/scan/ (scan.js, scan.wasm, scan.data ; voir README.txt de ce dossier).
//
// Ce Worker parle le MÊME protocole de messages que js/ai/worker.js (moteur maison) : l'interface, le contrôleur
// js/ai/analysis-controller.js et l'affichage ne changent donc pas.
//
//   { id, type: 'analyse', position: { board, side }, history?, options?: { maxTimeMs, maxDepth } }
//        → { id, type: 'progress', ok: true, result }   à chaque ligne `info` de Scan
//        → { id, ok: true, result }                     à la fin (`done`) ; result = { score, mate, bestMove,
//          bestMoveNotation, pv, pvNotation, depth, nodes, nps, timeMs, stopped, drawRule, tablebase }
//   { type: 'stop' }   → interrompt l'analyse en cours (Scan envoie `done` à la fin de son itération) ; rien n'est renvoyé
//   { type: 'ping' }   → { id, ok: true, result: 'pong' }
//   Messages d'état (sans id) : { type: 'status', status: 'loading' } à la création, { type: 'status', status: 'ready',
//   engine: 'Scan 3.1b' } quand le moteur est prêt. Échec de chargement ou de protocole : { id, ok: false, error }.
//
// Chargement : à la PREMIÈRE utilisation seulement (le contrôleur ne crée ce Worker qu'à l'activation de l'analyse) ;
// une seule fois par Worker. Protocole Hub (voir js/ai/scan-protocol.js) : `hub` → `set-param` (tt-size, bb-size) AVANT
// `init` (un set-param tardif fait planter Scan) → `init` → `ready`. Position validée (51 caractères) avant l'envoi,
// légalité de chaque coup de Scan vérifiée avec js/engine/rules.js (jamais un coup illégal affiché).
//
// TEMPS : le build scan-wasm n'applique AUCUNE limite de temps (le `move-time` du Hub est ignoré, constaté en P25 : une
// recherche demandée à 1,5 s a duré 8 s) ; il ne s'arrête qu'à la profondeur demandée ou sur `stop`, lu seulement entre
// deux itérations (l'itération en cours ne peut pas être interrompue). Ce Worker applique donc le temps lui-même :
// `stop` dès que le temps est écoulé, ou dès que la prochaine itération a peu de chances de finir dans le temps (durée
// des itérations estimée sur les lignes `info`, TIME_GROWTH × la dernière), en re-vérifiant à chaque ligne `info`.
//
// Une recherche de Scan est découpée en itérations rendues au navigateur (build scan-wasm) : ce Worker lit donc ses
// messages pendant l'analyse. Une nouvelle position remplace l'analyse en cours (« la dernière gagne ») : `stop`, puis la
// nouvelle recherche dès le `done` de l'ancienne ; le résultat de l'ancienne est jeté.

import {
  toHubPosition, parseInfo, parseDone, buildResult, terminalResult, hasLegalMove, hubHistory,
} from './scan-protocol.js';

export const SCAN_DIR = '../../assets/engines/scan/';
export const SCAN_PARAMS = { 'tt-size': 22, 'bb-size': 3 }; // 2^22 entrées (≈ 64 Mo), tables de finale 3 pièces (celles du paquet)
export const DEFAULT_MAX_TIME_MS = 1500;
export const DEFAULT_MAX_DEPTH = 24;
// Contrôle du temps (voir l'en-tête) : une itération dure ≈ 1,4 à 2,7 fois la précédente (mesuré en P25) ; on prend 2,5.
export const TIME_GROWTH = 2.5;
// Tolérance sur la fin prévue de l'itération suivante avant de l'interdire (1,25 × le temps demandé).
export const TIME_SLACK = 1.25;

// Faut-il arrêter maintenant ? `elapsedMs` : temps écoulé depuis `go` ; `prevMs` : temps de la 1re ligne `info` de la
// profondeur précédente (0 si inconnue). Pure (testée sous Node).
export function shouldStopForTime(elapsedMs, prevMs, maxMs) {
  if (elapsedMs >= maxMs) return true;
  if (!(prevMs > 0)) return false;
  const delta = Math.max(0, elapsedMs - prevMs);
  return elapsedMs + delta * TIME_GROWTH > maxMs * TIME_SLACK;
}

// Session Hub au-dessus d'un moteur. `loadEngine(onLine)` → promesse de { send(ligne) } (les lignes de sortie du moteur
// arrivent par onLine, de façon synchrone pendant send() pour les commandes simples, plus tard pendant une recherche).
// `post(message)` envoie au fil principal. Séparé du Worker pour être testé sous Node avec un faux moteur.
export function createScanSession({ loadEngine, post }) {
  let engine = null;
  let loading = null;
  let engineName = 'Scan';
  let buffer = [];       // lignes reçues hors recherche (handshake, init, pos)
  let job = null;        // recherche en cours : { id, position, last, discard, stopSent, t0, maxMs, firstInfo }
  let queued = null;     // dernière demande reçue pendant qu'une autre tournait (ou pendant le chargement)

  function onLine(raw) {
    const line = String(raw).trim();
    if (!line) return;
    if (job) {
      const info = parseInfo(line);
      if (info) {
        job.last = info;
        if (!job.discard) post({ id: job.id, type: 'progress', ok: true, result: buildResult(job.position, info) });
        const elapsed = now() - job.t0;
        if (!job.firstInfo.has(info.depth)) job.firstInfo.set(info.depth, elapsed);
        if (!job.stopSent && shouldStopForTime(elapsed, job.firstInfo.get(info.depth - 1) ?? 0, job.maxMs)) requestStop(job);
        return;
      }
      const done = parseDone(line);
      if (done) { finish(done); return; }
    }
    buffer.push(line);
  }

  const now = () => performance.now();

  // Envoie `stop` une seule fois par recherche (pris en compte au début de la prochaine itération de Scan).
  function requestStop(j) {
    if (j.stopSent) return;
    j.stopSent = true;
    engine.send('stop');
  }

  function takeBuffer() { const b = buffer; buffer = []; return b; }

  function send(cmd) { buffer = []; engine.send(cmd); return takeBuffer(); }

  function fail(id, err) { post({ id, ok: false, error: String(err && err.message ? err.message : err) }); }

  async function ensureLoaded() {
    if (engine) return;
    if (!loading) {
      post({ type: 'status', status: 'loading' });
      loading = (async () => {
        engine = await loadEngine(onLine);
        const hello = send('hub');
        const id = hello.find((l) => l.startsWith('id '));
        if (id) {
          const name = /name=(\S+)/.exec(id)?.[1];
          const version = /version=(\S+)/.exec(id)?.[1];
          if (name) engineName = version ? `${name} ${version}` : name;
        }
        // Paramètres AVANT init.
        for (const [k, v] of Object.entries(SCAN_PARAMS)) send(`set-param name=${k} value=${v}`);
        const init = send('init');
        const err = init.find((l) => l.startsWith('error'));
        if (err) throw new Error(`Scan n'a pas pu s'initialiser : ${err}`);
        if (!init.includes('ready')) throw new Error('Scan n\'a pas répondu « ready » à init');
        post({ type: 'status', status: 'ready', engine: engineName });
      })();
      loading.catch(() => { engine = null; loading = null; });
    }
    await loading;
  }

  // Termine la recherche courante (ligne `done`).
  function finish(done) {
    const j = job;
    job = null;
    if (j && j.timer) clearTimeout(j.timer);
    if (j && !j.discard) {
      const stopped = j.stopRequested === true;
      const info = j.last ?? { depth: 0, score: 0, nodes: 0, timeS: 0, pv: [] };
      post({ id: j.id, ok: true, result: buildResult(j.position, info, { stopped, fallbackMove: done.move }) });
    }
    pump();
  }

  function start(msg) {
    const position = msg.position;
    if (!position || !Array.isArray(position.board) || (position.side !== 'w' && position.side !== 'b')) {
      fail(msg.id, 'position manquante ou invalide');
      return;
    }
    // Camp au trait sans coup : partie terminée, on ne la soumet jamais à Scan (le protocole l'interdit).
    if (!hasLegalMove(position.board, position.side)) {
      post({ id: msg.id, ok: true, result: terminalResult(position.side) });
      return;
    }
    let pos;
    try {
      pos = toHubPosition(position.board, position.side);
    } catch (err) {
      fail(msg.id, err);
      return;
    }
    const opts = msg.options || {};
    const depth = Number.isFinite(opts.maxDepth) ? Math.max(1, Math.round(opts.maxDepth)) : DEFAULT_MAX_DEPTH;
    const timeS = (Number.isFinite(opts.maxTimeMs) ? opts.maxTimeMs : DEFAULT_MAX_TIME_MS) / 1000;
    const hh = hubHistory(position, msg.history);
    let out = hh ? send(`pos pos=${hh.pos} moves="${hh.moves}"`) : send(`pos pos=${pos}`);
    if (hh && out.some((l) => l.startsWith('error'))) out = send(`pos pos=${pos}`); // historique refusé : position seule
    if (out.some((l) => l.startsWith('error'))) { fail(msg.id, `Scan a refusé la position : ${out.find((l) => l.startsWith('error'))}`); return; }
    send(`level depth=${depth}`); // pas de move-time : ignoré par ce build (voir TEMPS en tête de fichier)
    const j = {
      id: msg.id, position: { board: position.board, side: position.side }, last: null, discard: false, stopRequested: false,
      stopSent: false, t0: now(), maxMs: timeS * 1000, firstInfo: new Map(), timer: null,
    };
    job = j;
    // Filet : le temps est écoulé et Scan est encore dans une itération longue → `stop` dès qu'il rend la main.
    j.timer = setTimeout(() => { if (job === j) requestStop(j); }, j.maxMs);
    buffer = [];
    engine.send('go analyze'); // les `info` et le `done` arrivent par onLine
  }

  // Lance la demande en attente si le moteur est libre ; sinon demande l'arrêt de la recherche en cours.
  function pump() {
    if (!engine || !queued) return;
    if (job) {
      job.discard = true; // résultat périmé : jeté ; on attend le `done` pour lancer la demande en attente
      requestStop(job);
      return;
    }
    const msg = queued;
    queued = null;
    try {
      start(msg);
    } catch (err) {
      job = null;
      fail(msg.id, err);
    }
  }

  async function handle(msg) {
    if (!msg || typeof msg !== 'object') return;
    if (msg.type === 'ping') { post({ id: msg.id, ok: true, result: 'pong' }); return; }
    if (msg.type === 'stop') {
      queued = null;
      if (job) { job.discard = true; job.stopRequested = true; requestStop(job); }
      return;
    }
    if (msg.type !== 'analyse') { post({ id: msg.id, ok: false, error: `type de message inconnu : ${msg.type}` }); return; }
    queued = msg; // la dernière demande gagne
    try {
      await ensureLoaded();
    } catch (err) {
      if (queued === msg) queued = null;
      fail(msg.id, err);
      return;
    }
    pump();
  }

  return { handle, get busy() { return job !== null; }, get engineName() { return engineName; } };
}

// --- Vrai Worker : chargement du WebAssembly ----------------------------------------------------------------------

// Charge assets/engines/scan/scan.js (module ES émis par Emscripten) et renvoie { send }. Les fichiers sont cherchés à
// côté de scan.js (locateFile) : scan.wasm et scan.data.
async function loadScanWasm(onLine) {
  const base = new URL(SCAN_DIR, import.meta.url);
  const mod = await import(new URL('scan.js', base).href);
  const Module = await mod.default({
    print: onLine,
    printErr: () => {},
    locateFile: (path) => new URL(path, base).href,
  });
  return { send: (line) => Module.ccall('scan_command', null, ['string'], [line]) };
}

if (typeof WorkerGlobalScope !== 'undefined' && self instanceof WorkerGlobalScope) {
  const session = createScanSession({ loadEngine: loadScanWasm, post: (m) => self.postMessage(m) });
  self.onmessage = (e) => { session.handle(e.data); };
}
