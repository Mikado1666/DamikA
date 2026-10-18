// Tactique : 20 positions (tests/data/tactics.mjs) où le meilleur coup est connu.
//
// Comment ces positions sont validées (voir aussi docs/SESSION_DERNIERE.md) :
//   - elles sont fabriquées par tests/mine-positions.mjs avec le solveur INDÉPENDANT tests/solver.mjs
//     (rules.js seul : ni fastboard.js ni search.js) ;
//   - critère : à profondeur 5 puis 7 (matériel pur, prises forcées prolongées), UN coup est meilleur
//     que tous les autres d'au moins 1 pion et gagne au moins 1 pion par rapport à la position de départ ;
//   - ce test REVÉRIFIE, à chaque exécution, avec un minimax pur SANS aucun élagage (autre code que le
//     solveur alpha-bêta qui a servi à miner), que le coup annoncé est unique meilleur à profondeur 5.
// Le moteur (search.js) doit alors trouver ce coup. Il n'a pas accès au solveur.
// Usage : node tests/tactics.mjs [--depth D] [--time MS]
import { TACTICS } from './data/tactics.mjs';
import { analyseSync } from '../js/ai/search.js';
import { parsePos } from './helpers.mjs';
import { children, other, material } from './solver.mjs';

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? Number(args[i + 1]) : d; };
const MAX_DEPTH = opt('depth', 8), MAX_TIME = opt('time', 5000);

// Minimax pur : aucune coupure, aucune table. Matériel, prises prolongées (dix prolongations au plus).
function pure(board, side, depth, ply, ext) {
  const kids = children(board, side);
  if (kids.length === 0) return -(1000 - ply);
  if (depth <= 0 && (kids[0].capturedCount === 0 || ext >= 10)) return side === 'w' ? material(board) : -material(board);
  let best = -1e9;
  for (const k of kids) {
    const v = -pure(k.board, other(side), depth - 1, ply + 1, depth <= 0 ? ext + 1 : ext);
    if (v > best) best = v;
  }
  return best;
}

let bad = 0;
console.log('catégorie  | position | solution | gain | résultat du moteur');
for (const [idx, t] of TACTICS.entries()) {
  const pos = parsePos(t.pos);
  // 1. Re-vérification indépendante (minimax pur, profondeur 5).
  const vals = children(pos.board, pos.side)
    .map((k) => ({ label: k.label, v: -pure(k.board, other(pos.side), 4, 1, 0) }))
    .sort((a, b) => b.v - a.v);
  const solverOk = vals[0].label === t.best && vals[0].v - vals[1].v >= 1;

  // 2. Le moteur : quel coup à quelle profondeur ?
  const perDepth = [];
  const r = analyseSync(pos, { maxDepth: MAX_DEPTH, maxTimeMs: MAX_TIME, onProgress: (p) => perDepth.push(p.bestMoveNotation) });
  const found = r.bestMoveNotation === t.best;
  // profondeur minimale à partir de laquelle le moteur joue (et garde) le bon coup
  let from = perDepth.length + 1;
  for (let d = perDepth.length; d >= 1 && perDepth[d - 1] === t.best; d--) from = d;
  if (!solverOk || !found) bad++;
  console.log(`${String(idx + 1).padStart(2)} ${t.category.padEnd(9)} | ${t.pos} | ${t.best} | +${t.gain} | ` +
    `${found ? 'trouvé' : 'RATÉ'} dès la profondeur ${found ? from : '-'} (atteinte : ${r.depth}), solveur ${solverOk ? 'confirmé' : 'NON CONFIRMÉ'}` +
    `${found ? '' : ' — moteur joue ' + r.bestMoveNotation + ' [' + perDepth.join(' ') + ']'}`);
}
console.log(bad === 0 ? `RÉSULTAT : ${TACTICS.length}/${TACTICS.length} positions résolues.` : `RÉSULTAT : ${bad} échec(s) sur ${TACTICS.length}.`);
process.exit(bad === 0 ? 0 : 1);
