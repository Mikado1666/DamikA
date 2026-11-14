// P49 — Visite guidée (js/analysis/film-tour.js) : étapes sautées, numérotation « N sur M », textes sans mots interdits, libellé du tournant en ordinal.
//   node tests/film-tour.mjs
import { TOUR_TEXT, TOUR_ORDER, buildTour, etapeLabel, tournantLabel, allTourTexts } from '../js/analysis/film-tour.js';

let failures = 0;
const ok = (label, cond, extra = '') => { if (!cond) failures++; console.log(`${cond ? 'OK ' : 'ERR'} ${label}${extra ? ' — ' + extra : ''}`); };
const all = Object.fromEntries(TOUR_ORDER.map((id) => [id, true]));

ok('ordre : récit, courbe, pastilles, tournant, damier, phases, pertes', TOUR_ORDER.join() === 'recit,courbe,pastilles,tournant,damier,phases,pertes');
const full = buildTour(all);
ok('tout affichable : 7 étapes numérotées 1..7 sur 7', full.length === 7 && full.every((s, i) => s.n === i + 1 && s.m === 7 && s.label === `Étape ${i + 1} sur 7`));
ok('première / dernière étape, libellé du bouton « Suivant » puis « Terminer »', full[0].first && !full[0].last && full[6].last && full[0].nextLabel === 'Suivant' && full[5].nextLabel === 'Suivant' && full[6].nextLabel === 'Terminer');

const sans = buildTour({ ...all, pastilles: false, tournant: false, pertes: false });
ok('étapes sautées : M recalculé, numérotation continue', sans.map((s) => s.id).join() === 'recit,courbe,damier,phases' && sans.every((s, i) => s.n === i + 1 && s.m === 4), sans.map((s) => s.label).join(' | '));
ok('la dernière étape restante devient « Terminer »', sans[3].last && sans[3].nextLabel === 'Terminer');
ok('fonction accepte aussi un prédicat', buildTour((id) => id === 'courbe').length === 1 && buildTour((id) => id === 'courbe')[0].label === 'Étape 1 sur 1');
ok('aucune étape affichable : liste vide', buildTour({}).length === 0 && buildTour(() => false).length === 0 && buildTour(null).length === 0);
ok('cas réel par défaut (courbe d\'évaluation, sans « trois plus grosses pertes ») : 6 étapes', buildTour({ ...all, pertes: false }).length === 6);

ok('chaque étape a un titre et un texte non vides', full.every((s) => s.titre && s.texte));
ok('textes de l\'énoncé (récit, courbe, tournant, damier) conservés', TOUR_TEXT.etapes.recit.texte.startsWith('Commence ici.') && TOUR_TEXT.etapes.courbe.texte.includes('Plus la pente est raide') && TOUR_TEXT.etapes.tournant.texte.includes('C\'est là qu\'elle s\'est vraiment jouée') && TOUR_TEXT.etapes.damier.texte.includes('◀ ▶'));
const banned = /demi-coup|érosion/i;
ok('aucun mot interdit (« demi-coup », « érosion ») dans les textes', allTourTexts().every((t) => !banned.test(t)));
ok('aucun ordinal en lettres, aucun « ème »', allTourTexts().every((t) => !/ème|\b(deuxième|troisième|quatrième|cinquième)\b/i.test(t)));

ok('libellé du tournant : « Le tournant · 4e coup »', tournantLabel(4) === 'Le tournant · 4e coup', tournantLabel(4));
ok('libellé du tournant : « 1er coup », « 41e coup »', tournantLabel(1) === 'Le tournant · 1er coup' && tournantLabel(41) === 'Le tournant · 41e coup');
ok('libellé du tournant : jamais de notation (tiret, point, « x »)', !/\d+\.|\d-\d|\dx\d/.test(tournantLabel(6)));
ok('libellé du tournant : entrée invalide → « Le tournant · coup »', tournantLabel(0) === 'Le tournant · coup' && tournantLabel(null) === 'Le tournant · coup');
ok('etapeLabel', etapeLabel(3, 6) === 'Étape 3 sur 6');

console.log(failures ? `\n${failures} échec(s)` : '\nTout est vert.');
process.exit(failures ? 1 : 0);
