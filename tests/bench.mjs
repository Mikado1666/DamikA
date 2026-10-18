// Mesure de vitesse du moteur rapide en perft (nœuds/seconde), machine au repos de préférence.
// Usage : node tests/bench.mjs
// Trois positions : initiale (pions), milieu de partie issu d'une partie aléatoire, finale à dames.
import { FastBoard } from '../js/ai/fastboard.js';
import { initialBoard, generateLegalMoves, applyCaptureSequence, applySimpleMove } from '../js/engine/rules.js';
import { perftRules } from './oracle.mjs';

function timePerft(label, fb, depth, repeat = 3) {
  fb.perft(Math.max(1, depth - 2)); // échauffement du JIT
  let best = Infinity, nodes = 0;
  for (let r = 0; r < repeat; r++) {
    const t0 = performance.now();
    nodes = fb.perft(depth);
    best = Math.min(best, performance.now() - t0);
  }
  console.log(`${label.padEnd(34)} prof. ${depth} : ${String(nodes).padStart(11)} nœuds, ${best.toFixed(0).padStart(6)} ms (meilleur de ${repeat}) → ${Math.round(nodes / (best / 1000)).toLocaleString('fr-FR')} nœuds/s`);
  return nodes / (best / 1000);
}

timePerft('position initiale', FastBoard.initial(), 8);

// Milieu de partie : 30 demi-coups aléatoires (graine fixe).
let seed = 2024;
const rnd = () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
let board = initialBoard(), side = 'w';
for (let p = 0; p < 30; p++) {
  const { captures, simples } = generateLegalMoves(board, side);
  const all = captures.length ? captures : simples;
  if (!all.length) break;
  const mv = all[Math.floor(rnd() * all.length)];
  board = captures.length ? applyCaptureSequence(board, board[mv[0].from], mv).board : applySimpleMove(board, board[mv.from], mv).board;
  side = side === 'w' ? 'b' : 'w';
}
timePerft('milieu de partie (30 demi-coups)', FastBoard.fromUiBoard(board, side), 7);

// Finale à dames : 3 dames + 2 pions contre 3 dames + 2 pions, position fixe.
const endgame = new Array(51).fill(null);
for (const [sq, color, king] of [[5, 'w', true], [28, 'w', true], [46, 'w', true], [33, 'w', false], [38, 'w', false],
  [1, 'b', true], [23, 'b', true], [50, 'b', true], [12, 'b', false], [17, 'b', false]]) endgame[sq] = { color, king };
timePerft('finale à dames (3D+2P contre 3D+2P)', FastBoard.fromUiBoard(endgame, 'w'), 6);

// Comparaison avec l'oracle rules.js (profondeur 5 depuis la position initiale).
const t0 = performance.now();
const n = perftRules(initialBoard(), 'w', 5);
const ms = performance.now() - t0;
console.log(`${'rules.js (oracle)'.padEnd(34)} prof. 5 : ${String(n).padStart(11)} nœuds, ${ms.toFixed(0).padStart(6)} ms → ${Math.round(n / (ms / 1000)).toLocaleString('fr-FR')} nœuds/s`);
