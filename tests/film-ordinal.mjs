// P48E / P48G — ordinaux français (js/analysis/film-ordinal.js) : « 1er », puis « 2e », « 3e » … « 41e » (chiffres + « e », sans exposant), entrées invalides.
//   node tests/film-ordinal.mjs
import fs from 'node:fs';
import { ordinal, ordinalCoup } from '../js/analysis/film-ordinal.js';

let failures = 0;
const ok = (label, cond, extra = '') => { if (!cond) failures++; console.log(`${cond ? 'OK ' : 'ERR'} ${label}${extra ? ' — ' + extra : ''}`); };

ok('1 → « 1er »', ordinal(1) === '1er');
ok('2 à 10 : chiffres + « e » (2e, 3e … 10e)', [2, 3, 4, 5, 6, 7, 8, 9, 10].every((n) => ordinal(n) === `${n}e`), [2, 3, 10].map(ordinal).join(' '));
ok('11, 12, 20, 21, 41, 100, 1000 : chiffres + « e »', [11, 12, 20, 21, 41, 100, 1000].every((n) => ordinal(n) === `${n}e`));
ok('jamais « 2ème », « 41ème », « 21er », ni exposant, ni mot en lettres', [1, 2, 3, 10, 11, 21, 41, 100].every((n) => !/ème|nd\b|ᵉ|<sup/.test(ordinal(n)) && !/^(premier|deuxième|troisième)/i.test(ordinal(n))) && ordinal(21) === '21e' && ordinal(101) === '101e');
ok('entrées invalides : null', [0, -1, -20, 2.5, NaN, Infinity, '3', '', null, undefined, {}, [], true].every((x) => ordinal(x) === null), String([0, -1, 2.5, NaN, '3', null, undefined].map(ordinal)));
ok('ordinalCoup : « 1er coup », « 2e coup », « 3e coup », « 41e coup »', ordinalCoup(1) === '1er coup' && ordinalCoup(2) === '2e coup' && ordinalCoup(3) === '3e coup' && ordinalCoup(41) === '41e coup');
ok('ordinalCoup avec `capital` : les chiffres restent tels quels', ordinalCoup(2, { capital: true }) === '2e coup' && ordinalCoup(1, { capital: true }) === '1er coup');
ok('ordinalCoup, entrée invalide : « coup » seul', ordinalCoup(0) === 'coup' && ordinalCoup(NaN) === 'coup' && ordinalCoup(null, { capital: true }) === 'Coup');
ok('jamais « demi-coup » ni « érosion »', ![1, 2, 11, 41].some((n) => /demi-coup|érosion/i.test(ordinalCoup(n))));
// aucun ordinal en lettres dans les fichiers de l'écran d'analyse
const files = ['js/film.js', 'film.html', 'js/analysis/film-story.js', 'js/analysis/film-game.js', 'js/analysis/film-ordinal.js'];
const words = /\b(deuxième|troisième|quatrième|cinquième|sixième|septième|huitième|neuvième|dixième)\b/i;
ok('aucun ordinal en lettres (deuxième … dixième) dans les fichiers de l\'écran d\'analyse', files.every((f) => !words.test(fs.readFileSync(new URL('../' + f, import.meta.url), 'utf8'))), files.filter((f) => words.test(fs.readFileSync(new URL('../' + f, import.meta.url), 'utf8'))).join(', '));

console.log(failures ? `\n${failures} échec(s)` : '\nTout est vert.');
process.exit(failures ? 1 : 0);
