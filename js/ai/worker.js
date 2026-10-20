// DAMIKA — Web Worker du moteur : expose js/ai/fastboard.js et js/ai/search.js par messages, pour ne
// jamais figer l'interface.
//
// Utilisation (module worker, ES modules natifs, pas de build) :
//   const w = new Worker('js/ai/worker.js', { type: 'module' });
//   w.postMessage({ id: 1, type: 'moves', position: { board, side } });
//   w.onmessage = (e) => e.data;  // { id, ok: true, result } ou { id, ok: false, error }
//
// `position` = { board, side } au format de l'interface : board = tableau de 51 éléments
// (index 1..50), null ou { color: 'w'|'b', king }, side = 'w' | 'b'. Omise, c'est la position
// initiale (utile pour perft).
//
// Requêtes
//   { type: 'ping' }                        → 'pong'
//   { type: 'moves', position }             → { captures, simples, mustCapture, maxCapture }, même
//                                             format que rules.js generateLegalMoves()
//   { type: 'perft', depth, position? }     → { nodes, ms }
//   { type: 'divide', depth, position? }    → [{ move: '32-28', nodes }, …]
//   { type: 'analyse', position, history?, options? } → progression puis résultat (voir ci-dessous)
//   { type: 'stop' }                        → interrompt l'analyse en cours
//
// Analyse : options = { maxDepth, maxTimeMs, useTT } (voir js/ai/search.js). `history` (facultatif, absent =
// comportement sans historique) = { positions | hashes, quiet, endgame? } : positions de la partie AVANT la position
// analysée, du plus ancien au plus récent ({ board, side } ou hashes [[lo, hi]]), limitées aux `quiet`
// dernières (demi-coups consécutifs sans coup de pion ni prise), pour la répétition de position (3e
// occurrence) et la règle des 25 coups (voir search.js, normalizeHistory). `endgame` = { plies, limit, diag } : état de
// la finale à la position analysée pour les limites FMJD 6.3 / 6.4 (16 et 5 coups ; js/engine/rules.js, endgameState) ;
// absent, la finale éventuelle est supposée apparaître à la position analysée. Le worker répond :
//   - après CHAQUE profondeur terminée : { id, type: 'progress', ok: true, result }
//     (result = { score, mate, bestMove, bestMoveNotation, pv, pvNotation, depth, nodes, nps, timeMs, stopped,
//                 drawRule })  drawRule : null, 'quiet', 'repetition', 'endgame16', 'endgame5' ou 'diagonal5' (la position
//                 analysée est déjà nulle par règle)
//   - une fois la recherche finie : { id, ok: true, result } (même forme, `stopped: true` si interrompue).
// score : centipions, point de vue des Blancs. mate : null ou { winner: 'w'|'b', in: N }.
//
// LIMITE : une recherche en cours est synchrone et ne lit pas sa file de messages. Le worker cède la
// main entre deux profondeurs ; un 'stop' est donc pris en compte à la fin de la profondeur en cours
// (ou à la limite de temps maxTimeMs, qui interrompt la recherche en plein milieu). Pour une
// interruption immédiate, le fil principal peut appeler worker.terminate().

import { FastBoard } from './fastboard.js';
import { analyse } from './search.js';

function boardFrom(position) {
  return position ? FastBoard.fromUiBoard(position.board, position.side) : FastBoard.initial();
}

// Requêtes immédiates (synchrones). 'analyse' et 'stop' passent par runMessage().
export function handleMessage(msg) {
  try {
    switch (msg.type) {
      case 'ping':
        return { id: msg.id, ok: true, result: 'pong' };
      case 'moves':
        return { id: msg.id, ok: true, result: boardFrom(msg.position).generateUiMoves() };
      case 'perft': {
        const fb = boardFrom(msg.position);
        const t0 = performance.now();
        const nodes = fb.perft(msg.depth);
        return { id: msg.id, ok: true, result: { nodes, ms: performance.now() - t0 } };
      }
      case 'divide':
        return { id: msg.id, ok: true, result: boardFrom(msg.position).perftDivide(msg.depth) };
      default:
        return { id: msg.id, ok: false, error: `type de message inconnu : ${msg.type}` };
    }
  } catch (err) {
    return { id: msg.id, ok: false, error: String(err && err.message ? err.message : err) };
  }
}

// Analyse en cours (une seule à la fois) : { id, stop }.
let currentJob = null;

async function runAnalyse(msg, post) {
  // Une nouvelle analyse remplace la précédente, qui s'arrête à son prochain point de cession.
  if (currentJob) currentJob.stop = true;
  const job = { id: msg.id, stop: false };
  currentJob = job;
  try {
    if (!msg.position || !msg.position.board) throw new Error('position manquante ou invalide');
    const result = await analyse(msg.position, {
      ...(msg.options || {}),
      history: msg.history ?? undefined,
      onProgress: (p) => post({ id: msg.id, type: 'progress', ok: true, result: p }),
      shouldStop: () => job.stop,
    });
    post({ id: msg.id, ok: true, result });
  } catch (err) {
    post({ id: msg.id, ok: false, error: String(err && err.message ? err.message : err) });
  } finally {
    if (currentJob === job) currentJob = null;
  }
}

// Point d'entrée complet : toutes les requêtes. `post(réponse)` envoie un message à l'appelant.
// Retourne une promesse, résolue quand la requête est entièrement traitée.
export async function runMessage(msg, post) {
  if (msg.type === 'analyse') return runAnalyse(msg, post);
  if (msg.type === 'stop') {
    const running = currentJob !== null;
    if (running) currentJob.stop = true;
    post({ id: msg.id, ok: true, result: running ? 'stopping' : 'idle' });
    return undefined;
  }
  post(handleMessage(msg));
  return undefined;
}

// L'écouteur n'est installé que dans un vrai contexte de worker (pas lors d'un import par Node).
if (typeof WorkerGlobalScope !== 'undefined' && self instanceof WorkerGlobalScope) {
  self.onmessage = (e) => { runMessage(e.data, (d) => self.postMessage(d)); };
}
