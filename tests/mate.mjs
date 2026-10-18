// Mat : victoires forcées en 1 à 3 coups (et défaites forcées), score « mat en N » exact.
//
// Les positions (tests/data/mates.mjs) viennent de tests/mine-positions.mjs. La vérité vient du
// solveur INDÉPENDANT tests/solver.mjs (rules.js seul, énumération exhaustive, aucune heuristique) :
// « le camp au trait gagne en N coups » = il existe un coup tel que, quelle que soit la réponse,
// l'adversaire se retrouve sans coup légal au plus tard à son N-ième coup ; N est le PLUS PETIT possible.
//
// Vérifie, pour chaque position :
//   - mate.winner et mate.in du moteur = ceux du solveur ; le signe du score est le bon ;
//   - le coup proposé fait bien partie des coups gagnants selon le solveur (victoires) ;
//   - sur les positions SANS victoire forcée en 3 : le moteur n'annonce jamais un mat en 3 ou moins.
import { MATES, NO_MATE_IN_3 } from './data/mates.mjs';
import { analyseSync, MATE } from '../js/ai/search.js';
import { parsePos } from './helpers.mjs';
import { winningMoves } from './solver.mjs';

let bad = 0;
const fail = (m) => { bad++; console.log('ERR ' + m); };

for (const t of MATES) {
  const pos = parsePos(t.pos);
  const r = analyseSync(pos, { maxDepth: 12, maxTimeMs: 1e9 });
  const ok = r.mate && r.mate.winner === t.winner && r.mate.in === t.in;
  // Score numérique : positif pour les Blancs s'ils gagnent.
  const signOk = t.winner === 'w' ? r.score > MATE - 200 : r.score < -(MATE - 200);
  let moveOk = true;
  if (t.winner === pos.side) moveOk = winningMoves(pos.board, pos.side, t.in).includes(r.bestMoveNotation);
  if (!ok || !signOk || !moveOk) fail(`${t.pos} : attendu ${t.winner} gagne en ${t.in}, moteur ${JSON.stringify(r.mate)} score ${r.score} coup ${r.bestMoveNotation} (coup gagnant : ${moveOk})`);
  console.log(`${ok && signOk && moveOk ? 'OK ' : 'ERR'} ${t.pos.padEnd(34)} ${t.winner === pos.side ? 'victoire' : 'défaite '} en ${t.in} — moteur : ${r.mate ? r.mate.winner + ' en ' + r.mate.in : 'pas de mat'}, coup ${r.bestMoveNotation}, profondeur ${r.depth}`);
}

let falseMates = 0;
for (const p of NO_MATE_IN_3) {
  const r = analyseSync(parsePos(p), { maxDepth: 8, maxTimeMs: 1e9 });
  if (r.mate && r.mate.in <= 3) { falseMates++; fail(`mat annoncé en ${r.mate.in} alors que le solveur n'en trouve pas en 3 : ${p}`); }
}
console.log(`${falseMates === 0 ? 'OK ' : 'ERR'} ${NO_MATE_IN_3.length} positions sans victoire forcée en 3 : aucun faux « mat en ≤ 3 »`);

// Camp au trait déjà sans aucun coup légal (pion blanc en 1, bloqué sur la rangée du haut) : perdu en 0.
const dead = analyseSync(parsePos('w|1|'), { maxDepth: 3 });
const deadOk = dead.mate && dead.mate.winner === 'b' && dead.mate.in === 0 && dead.bestMove === null;
if (!deadOk) fail(`cas limite : ${JSON.stringify(dead.mate)} coup ${dead.bestMove}`);
console.log(`${deadOk ? 'OK ' : 'ERR'} cas limite (Blancs au trait sans coup légal) : ${JSON.stringify(dead.mate)}, pas de coup`);

console.log(bad === 0 ? 'RÉSULTAT : tout concorde.' : `RÉSULTAT : ${bad} échec(s).`);
process.exit(bad === 0 ? 0 : 1);
