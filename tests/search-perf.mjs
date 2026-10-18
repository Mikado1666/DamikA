// Performance de la recherche : nœuds/seconde et profondeur atteinte avec la limite par défaut
// (1 seconde), sur la position initiale, trois milieux de partie et deux finales. Machine au repos.
// Chaque mesure : meilleur de 3 (le premier passage chauffe le JIT).
// Usage : node tests/search-perf.mjs [--ms 1000]
import { FastBoard } from '../js/ai/fastboard.js';
import { analyseSync } from '../js/ai/search.js';
import { mulberry32, toPosition, parsePos, fmt } from './helpers.mjs';

const args = process.argv.slice(2);
const i0 = args.indexOf('--ms');
const MS = i0 >= 0 ? Number(args[i0 + 1]) : 1000;
const rnd = mulberry32(2024);

function midgame(plies) {
  const fb = FastBoard.initial();
  for (let p = 0; p < plies; p++) {
    const moves = fb.generateMoves();
    if (!moves.length) break;
    fb.makeMove(moves[Math.floor(rnd() * moves.length)]);
  }
  return toPosition(fb);
}

const positions = [
  ['position initiale', toPosition(FastBoard.initial())],
  ['milieu de partie A (20 demi-coups)', midgame(20)],
  ['milieu de partie B (30 demi-coups)', midgame(30)],
  ['milieu de partie C (40 demi-coups)', midgame(40)],
  ['finale pions (6 contre 6)', parsePos('w|31,36,38,41,43,46|5,9,12,14,18,20')],
  ['finale à dames (3D+2P contre 3D+2P)', parsePos('w|K5,K28,K46,33,38|K1,K23,K50,12,17')],
];

console.log(`limite de temps : ${MS} ms, profondeur max 64 (valeurs par défaut de analyse())`);
console.log('position                              | table | profondeur | nœuds       | nœuds/s');
for (const [name, pos] of positions) {
  for (const useTT of [true, false]) {
    let best = null;
    for (let r = 0; r < 3; r++) {
      const res = analyseSync(pos, { maxTimeMs: MS, useTT });
      if (!best || res.depth > best.depth || (res.depth === best.depth && res.nps > best.nps)) best = res;
    }
    console.log(`${name.padEnd(37)} | ${useTT ? 'oui  ' : 'non  '} | ${String(best.depth).padStart(10)} | ${fmt(best.nodes).padStart(11)} | ${fmt(best.nps).padStart(9)}`);
  }
}
