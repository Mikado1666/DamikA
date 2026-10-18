// perft depuis la position initiale : moteur rapide vs valeurs de référence vs rules.js.
// Usage : node tests/perft.mjs [profondeurMax=8] [profondeurMaxRules=5]
//
// Valeurs de référence (dames internationales 10x10, position initiale, Blancs au trait) :
//   World Draughts Forum, fil « Perft » (https://damforum.nl/viewtopic.php?t=2308), 5-7 juillet 2008 :
//   Ed Gilbert et Feike Boomstra obtiennent des résultats IDENTIQUES jusqu'à la profondeur 11 ;
//   Gérard Taillé confirme « OK for all node counters » sur la position initiale. Convention de
//   comptage de Gilbert : deux rafles qui aboutissent à la même position (même départ, même
//   arrivée, mêmes pièces prises dans un autre ordre) ne comptent que pour un seul coup.
//   (Les valeurs de BertTuyt divergent dès la profondeur 8 ; lui-même soupçonnait l'absence de
//   dédoublonnage — elles ne servent pas de référence.)
import { FastBoard } from '../js/ai/fastboard.js';
import { initialBoard } from '../js/engine/rules.js';
import { perftRules } from './oracle.mjs';

const REFERENCE = [1, 9, 81, 658, 4265, 27117, 167140, 1049442, 6483961, 41022423, 258895763, 1665861398];

const maxDepth = Number(process.argv[2] ?? 8);
const maxDepthRules = Number(process.argv[3] ?? 5);

let failures = 0;
console.log('perft depuis la position initiale');
console.log('prof. | référence      | moteur rapide  | rules.js       | temps rapide | nœuds/s');
for (let depth = 1; depth <= maxDepth; depth++) {
  const fb = FastBoard.initial();
  const t0 = performance.now();
  const nodes = fb.perft(depth);
  const ms = performance.now() - t0;
  let rulesCell = '(non calculé)';
  if (depth <= maxDepthRules) {
    const r = perftRules(initialBoard(), 'w', depth);
    rulesCell = String(r);
    if (r !== nodes) failures++;
  }
  if (nodes !== REFERENCE[depth]) failures++;
  const ok = nodes === REFERENCE[depth] ? 'OK ' : 'ERR';
  console.log(
    `${String(depth).padStart(5)} | ${String(REFERENCE[depth]).padStart(14)} | ${String(nodes).padStart(14)} ${ok} | ${rulesCell.padStart(14)} | ${ms.toFixed(0).padStart(9)} ms | ${Math.round(nodes / (ms / 1000)).toLocaleString('fr-FR')}`
  );
}
console.log(failures === 0 ? 'RÉSULTAT : tout concorde.' : `RÉSULTAT : ${failures} divergence(s).`);
process.exit(failures === 0 ? 0 : 1);
