// DAMIKA — Web Worker du moteur rapide : expose js/ai/fastboard.js par messages, pour ne jamais
// figer l'interface.
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

import { FastBoard } from './fastboard.js';

function boardFrom(position) {
  return position ? FastBoard.fromUiBoard(position.board, position.side) : FastBoard.initial();
}

// Cœur du worker, séparé de l'écouteur de messages pour pouvoir être appelé directement (tests Node).
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

// L'écouteur n'est installé que dans un vrai contexte de worker (pas lors d'un import par Node).
if (typeof WorkerGlobalScope !== 'undefined' && self instanceof WorkerGlobalScope) {
  self.onmessage = (e) => self.postMessage(handleMessage(e.data));
}
