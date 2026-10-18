// Symétrie de l'évaluation et de la recherche.
//   1. evalWhite(p) = -evalWhite(miroir(p)) sur un grand nombre de positions aléatoires
//      (miroir = rotation de 180° + échange des couleurs).
//   2. evalWhite ne dépend pas du camp au trait.
//   3. Position initiale : évaluation nulle.
//   4. Le score de recherche (profondeur 3, point de vue des Blancs) est lui aussi antisymétrique :
//      cela valide à la fois le générateur de coups, la quiescence et l'évaluation.
// Usage : node tests/eval-symmetry.mjs [--positions N] [--search N] [--seed S]
import { FastBoard } from '../js/ai/fastboard.js';
import { evalWhite, mirrorBoard, createEvaluator, EVAL_WEIGHTS } from '../js/ai/eval.js';
import { analyseSync } from '../js/ai/search.js';
import { mulberry32, randomFastPosition, toPosition } from './helpers.mjs';

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? Number(args[i + 1]) : d; };
const N = opt('positions', 100000), NS = opt('search', 1500), rnd = mulberry32(opt('seed', 7));

let bad = 0;
const fail = (msg) => { bad++; if (bad <= 10) console.log('ERR ' + msg); };

for (let i = 0; i < N; i++) {
  const fb = randomFastPosition(rnd, i);
  const a = evalWhite(fb.board), b = evalWhite(mirrorBoard(fb.board));
  if (a !== -b) fail(`symétrie : eval=${a}, eval(miroir)=${b}, position ${i}`);
  const other = FastBoard.fromUiBoard(fb.toUiBoard(), fb.sideToMove === 'w' ? 'b' : 'w');
  if (evalWhite(other.board) !== a) fail(`dépend du trait, position ${i}`);
}
console.log(`${bad === 0 ? 'OK ' : 'ERR'} évaluation : ${N} positions, antisymétrie exacte + indépendance du trait`);

if (evalWhite(FastBoard.initial().board) !== 0) fail('position initiale non nulle');
else console.log('OK  position initiale : évaluation = 0');

// Un autre jeu de poids (celui de l'étage 3) doit rester symétrique.
const alt = createEvaluator({ ...EVAL_WEIGHTS, man: 90, king: 280, tempo: 3, advance: [1, 2, 3, 4, 5, 6, 7, 8, 9], centerCoreMan: 9, backRank: 2 });
let badAlt = 0;
for (let i = 0; i < 20000; i++) {
  const fb = randomFastPosition(rnd, i);
  if (alt(fb.board) !== -alt(mirrorBoard(fb.board))) badAlt++;
}
if (badAlt) fail(`poids alternatifs : ${badAlt} asymétries`); else console.log('OK  poids alternatifs (createEvaluator) : symétrie exacte');

// Recherche : score (point de vue des Blancs) de la position et de son miroir.
const before = bad;
for (let i = 0; i < NS; i++) {
  const fb = randomFastPosition(rnd, i);
  const mirror = new FastBoard();
  mirror.board.set(mirrorBoard(fb.board));
  mirror.side = fb.side ^ 1;
  const r1 = analyseSync(toPosition(fb), { maxDepth: 3, maxTimeMs: 1e9 });
  const r2 = analyseSync(toPosition(mirror), { maxDepth: 3, maxTimeMs: 1e9 });
  if (r1.score !== -r2.score) fail(`recherche : score ${r1.score} vs miroir ${r2.score}, position ${i}`);
}
console.log(`${bad === before ? 'OK ' : 'ERR'} recherche profondeur 3 : ${NS} positions, score(p) = -score(miroir)`);

console.log(bad === 0 ? 'RÉSULTAT : tout concorde.' : `RÉSULTAT : ${bad} échec(s).`);
process.exit(bad === 0 ? 0 : 1);
