// perft sur positions aléatoires (dames comprises) : moteur rapide vs rules.js, profondeur 1 à 3.
// Valide makeMove/unmakeMove sur plusieurs demi-coups d'affilée, là où diff.mjs n'en vérifie qu'un.
// Usage : node tests/perft-positions.mjs [--positions N] [--depth D] [--seed S]
import { FastBoard } from '../js/ai/fastboard.js';
import { initialBoard, generateLegalMoves, applyCaptureSequence, applySimpleMove } from '../js/engine/rules.js';
import { perftRules } from './oracle.mjs';

const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf(`--${name}`); return i >= 0 ? Number(args[i + 1]) : def; };
const N = opt('positions', 3000), DEPTH = opt('depth', 3);
let seed = opt('seed', 99);
const rnd = () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const randInt = (n) => Math.floor(rnd() * n);

function randomPosition(i) {
  if (i % 3 === 0) { // milieu de partie aléatoire
    let board = initialBoard(), side = 'w';
    const plies = randInt(120);
    for (let p = 0; p < plies; p++) {
      const { captures, simples } = generateLegalMoves(board, side);
      const all = captures.length ? captures : simples;
      if (!all.length) break;
      const mv = all[randInt(all.length)];
      board = captures.length ? applyCaptureSequence(board, board[mv[0].from], mv).board : applySimpleMove(board, board[mv.from], mv).board;
      side = side === 'w' ? 'b' : 'w';
    }
    return { board, side };
  }
  const board = new Array(51).fill(null);
  const n = 3 + randInt(20), kingRate = [0, 0.3, 0.7][randInt(3)];
  for (let k = 0; k < n; k++) {
    const sq = 1 + randInt(50); if (board[sq]) continue;
    const color = rnd() < 0.5 ? 'w' : 'b', row = Math.floor((sq - 1) / 5);
    let king = rnd() < kingRate;
    if (!king && ((color === 'w' && row === 0) || (color === 'b' && row === 9))) king = true;
    board[sq] = { color, king };
  }
  return { board, side: rnd() < 0.5 ? 'w' : 'b' };
}

let bad = 0, nodes = 0;
for (let i = 0; i < N; i++) {
  const { board, side } = randomPosition(i);
  const fb = FastBoard.fromUiBoard(board, side);
  for (let d = 1; d <= DEPTH; d++) {
    const a = fb.perft(d), b = perftRules(board, side, d);
    nodes += a;
    if (a !== b) {
      bad++;
      if (bad <= 5) console.log(`DIVERGENCE position ${i}, prof. ${d} : rapide ${a} vs rules.js ${b} — ${JSON.stringify(board.map((p, sq) => p ? `${sq}${p.color}${p.king ? 'K' : ''}` : null).filter(Boolean))} trait ${side}`);
      break;
    }
  }
  // Le plateau doit être intact après perft (unmakeMove).
  if (JSON.stringify(fb.toUiBoard()) !== JSON.stringify(board) || fb.sideToMove !== side) { bad++; console.log(`plateau altéré après perft, position ${i}`); }
}
console.log(`${N} positions, profondeur 1 à ${DEPTH}, ${nodes} nœuds comparés : ${bad === 0 ? 'aucune divergence.' : bad + ' divergence(s).'}`);
process.exit(bad === 0 ? 0 : 1);
