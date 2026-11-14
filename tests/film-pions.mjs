// P48G — « pion(s) » de l'écran d'analyse (js/analysis/film-pions.js) : accord selon la valeur ARRONDIE à l'affichage, chiffre rond du récit.
//   node tests/film-pions.mjs
import { pionsLabel, pionsRond, pionsEntier, arrondiAffiche } from '../js/analysis/film-pions.js';

let failures = 0;
const ok = (label, cond, extra = '') => { if (!cond) failures++; console.log(`${cond ? 'OK ' : 'ERR'} ${label}${extra ? ' — ' + extra : ''}`); };

ok('0,7 → « 0,7 pion » ; 1,0 → « 1,0 pion » ; 1,9 → « 1,9 pion »', pionsLabel(0.7) === '0,7 pion' && pionsLabel(1.0) === '1,0 pion' && pionsLabel(1.9) === '1,9 pion', [0.7, 1.0, 1.9].map((v) => pionsLabel(v)).join(' | '));
ok('1,96 s\'affiche « 2,0 » (une décimale) donc PLURIEL', pionsLabel(1.96) === '2,0 pions', pionsLabel(1.96));
ok('2,0 → « 2,0 pions » ; 2,6 → « 2,6 pions »', pionsLabel(2.0) === '2,0 pions' && pionsLabel(2.6) === '2,6 pions');
ok('deux décimales (infobulle) : 2,58 → « 2,58 pions » ; 1,96 → « 1,96 pion » (reste sous 2 à l\'affichage) ; 1,999 → « 2,00 pions »', pionsLabel(2.58, 2) === '2,58 pions' && pionsLabel(1.96, 2) === '1,96 pion' && pionsLabel(1.999, 2) === '2,00 pions');
ok('valeur négative : le signe est ajouté par l\'appelant, l\'accord suit la valeur absolue', pionsLabel(-2.6) === '2,6 pions' && pionsLabel(-0.7) === '0,7 pion');
ok('entrée non numérique : jamais « NaN »', pionsLabel(NaN) === '0,0 pion' && pionsLabel(undefined) === '0,0 pion' && pionsLabel(null) === '0,0 pion');
ok('arrondiAffiche', arrondiAffiche(-1.96, 1) === 2 && arrondiAffiche(1.94, 1) === 1.9);
ok('pionsRond : 2,6 → « l\'équivalent de 3 pions » (exemple de Mickaël)', pionsRond(2.6) === 'l\'équivalent de 3 pions');
ok('pionsRond : minimum 1, singulier seulement pour 1', pionsRond(0.2) === 'l\'équivalent de 1 pion' && pionsRond(0.9) === 'l\'équivalent de 1 pion' && pionsRond(1.4) === 'l\'équivalent de 1 pion' && pionsRond(1.5) === 'l\'équivalent de 2 pions' && pionsRond(2.4) === 'l\'équivalent de 2 pions');
ok('pionsRond : valeur négative ou non numérique', pionsRond(-2.6) === 'l\'équivalent de 3 pions' && pionsEntier(NaN) === 1 && pionsEntier(undefined) === 1);
ok('aucune décimale dans le texte du récit', !/\d,\d/.test(pionsRond(2.58)) && !/\d\.\d/.test(pionsRond(2.58)));

console.log(failures ? `\n${failures} échec(s)` : '\nTout est vert.');
process.exit(failures ? 1 : 0);
