// perft de référence calculé avec rules.js (l'oracle), mêmes conventions de comptage que le
// moteur rapide : deux rafles de même départ, même arrivée et mêmes pièces prises = un seul coup.
import { generateLegalMoves, applyCaptureSequence, applySimpleMove } from '../js/engine/rules.js';

function dedupedMoves(board, side) {
  const { captures, simples } = generateLegalMoves(board, side);
  const seen = new Map();
  for (const seq of captures) {
    const caps = seq.map((s) => s.capturedThisStep).sort((a, b) => a - b).join(',');
    const key = `${seq[0].from}>${seq[seq.length - 1].to}|${caps}`;
    if (!seen.has(key)) seen.set(key, seq);
  }
  return [...[...seen.values()].map((capture) => ({ capture })), ...simples.map((simple) => ({ simple }))];
}

export function perftRules(board, side, depth) {
  if (depth <= 0) return 1;
  const moves = dedupedMoves(board, side);
  if (depth === 1) return moves.length;
  const next = side === 'w' ? 'b' : 'w';
  let n = 0;
  for (const m of moves) {
    const nb = m.capture
      ? applyCaptureSequence(board, board[m.capture[0].from], m.capture).board
      : applySimpleMove(board, board[m.simple.from], m.simple).board;
    n += perftRules(nb, next, depth - 1);
  }
  return n;
}
