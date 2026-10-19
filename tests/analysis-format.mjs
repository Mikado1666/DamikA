// Fonctions pures de l'affichage de l'analyse (js/ai/analysis-format.js) : barre, score, mat, coups.
import {
  barFraction, formatScore, formatMate, formatHeadline, formatMeta, moveSquares, formatLine,
  shouldShowMove, positionKey, BAR_SCALE_CP, MIN_DEPTH_FOR_MOVE,
  scoreSide, isBigSwing, tickFractions, equalZoneFractions, ADVANTAGE_TIERS, advantageTier, TICK_PAWNS, BIG_SWING,
} from '../js/ai/analysis-format.js';
import { analyseSync } from '../js/ai/search.js';
import { FastBoard } from '../js/ai/fastboard.js';

let failures = 0;
const eq = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failures++;
  console.log(`${ok ? 'OK ' : 'ERR'} ${label}${ok ? '' : ` — obtenu ${JSON.stringify(got)}, attendu ${JSON.stringify(want)}`}`);
};
const ok = (label, cond, extra = '') => { if (!cond) failures++; console.log(`${cond ? 'OK ' : 'ERR'} ${label}${extra ? ' — ' + extra : ''}`); };

// --- Barre ----------------------------------------------------------------------------------------------
eq('barre : score nul = 50 %', barFraction({ score: 0, mate: null }), 0.5);
{
  // Cibles de l'échelle 100 : ±0,5 pion ≈ 62 %, ±1 ≈ 73 %, ±2 ≈ 88 %, ±3 ≈ 95 %.
  const near = (cp, target) => Math.abs(barFraction({ score: cp, mate: null }) - target) < 0.005;
  ok('barre : +0,5 ≈ 62 %, +1 ≈ 73 %, +2 ≈ 88 %, +3 ≈ 95 %', near(50, 0.62) && near(100, 0.73) && near(200, 0.88) && near(300, 0.95),
    [50, 100, 200, 300].map((c) => barFraction({ score: c, mate: null }).toFixed(3)).join(' / '));
  ok('barre : −0,5 ≈ 38 %, −1 ≈ 27 %, −2 ≈ 12 %, −3 ≈ 5 %', near(-50, 0.38) && near(-100, 0.27) && near(-200, 0.12) && near(-300, 0.05));
  ok('échelle : constante unique BAR_SCALE_CP = 100', BAR_SCALE_CP === 100);
}
ok('barre : strictement croissante', [-5000, -1000, -250, -100, 0, 100, 250, 1000, 5000].map((s) => barFraction({ score: s, mate: null })).every((v, i, a) => i === 0 || v > a[i - 1]));
ok('barre : toujours dans ]0 ; 1[ hors mat, même pour ±29000',
  [-29000, -1e6, 1e6, 29000].every((s) => { const f = barFraction({ score: s, mate: null }); return f >= 0 && f <= 1; }));
ok('barre : ±29000 sans mat reste lisible (pas exactement 0/1 à 1000)', barFraction({ score: 1000, mate: null }) < 1 && barFraction({ score: -1000, mate: null }) > 0);
eq('barre : mat des Blancs = 1', barFraction({ score: 29990, mate: { winner: 'w', in: 3 } }), 1);
eq('barre : mat des Noirs = 0', barFraction({ score: -29990, mate: { winner: 'b', in: 3 } }), 0);
eq('barre : résultat absent = 50 %', barFraction(null), 0.5);
eq('barre : score non fini = 50 %', barFraction({ score: NaN, mate: null }), 0.5);
{
  let asym = 0;
  for (let s = -3000; s <= 3000; s += 7) {
    if (barFraction({ score: -s, mate: null }) !== 1 - barFraction({ score: s, mate: null })) asym++;
  }
  eq('barre : antisymétrie EXACTE (score opposé = barre opposée) sur 858 valeurs', asym, 0);
}

// --- Score ---------------------------------------------------------------------------------------------------
eq('score : 80 → +0,8', formatScore(80), '+0,8');
eq('score : -130 → −1,3', formatScore(-130), '−1,3');
eq('score : 0 → 0,0 (sans signe)', formatScore(0), '0,0');
eq('score : 4 → 0,0 (arrondi, sans signe)', formatScore(4), '0,0');
eq('score : -4 → 0,0 (arrondi, sans signe)', formatScore(-4), '0,0');
eq('score : 5 → +0,1 (arrondi à la hausse)', formatScore(5), '+0,1');
eq('score : 100 → +1,0', formatScore(100), '+1,0');
eq('score : 1234 → +12,3', formatScore(1234), '+12,3');
eq('score : -1999 → −20,0', formatScore(-1999), '−20,0');
eq('score : NaN → —', formatScore(NaN), '—');
{
  let bad = 0;
  for (let s = -2500; s <= 2500; s += 3) {
    const a = formatScore(s), b = formatScore(-s);
    const flip = (t) => (t[0] === '+' ? '−' + t.slice(1) : t[0] === '−' ? '+' + t.slice(1) : t);
    if (b !== flip(a)) bad++;
  }
  eq('score : symétrie du texte (opposé = signe inversé) sur 1 667 valeurs', bad, 0);
}

// --- Mat ---------------------------------------------------------------------------------------------------------
eq('mat : Blancs en 3', formatMate({ winner: 'w', in: 3 }), 'Mat en 3 — les Blancs gagnent');
eq('mat : Noirs en 1', formatMate({ winner: 'b', in: 1 }), 'Mat en 1 — les Noirs gagnent');
eq('mat : partie terminée (in = 0)', formatMate({ winner: 'b', in: 0 }), 'Partie terminée — les Noirs gagnent');
eq('titre : score normal', formatHeadline({ score: 80, mate: null }), '+0,8');
eq('titre : mat', formatHeadline({ score: 29990, mate: { winner: 'w', in: 2 } }), 'Mat en 2 — les Blancs gagnent');
eq('titre : absent', formatHeadline(null), '');
eq('mention : indicatif + profondeur', formatMeta({ score: 0, mate: null, depth: 9 }), 'Évaluation indicative · profondeur 9');
eq('mention : partie terminée = rien', formatMeta({ score: -30000, mate: { winner: 'w', in: 0 }, depth: 0 }), '');

// --- Coups -----------------------------------------------------------------------------------------------------------------
eq('flèche : coup simple', moveSquares({ from: 32, to: 28 }), [32, 28]);
eq('flèche : rafle à deux sauts', moveSquares([{ from: 27, to: 18, capturedThisStep: 22 }, { from: 18, to: 9, capturedThisStep: 13 }]), [27, 18, 9]);
eq('flèche : absent', moveSquares(null), null);
eq('flèche : rafle vide', moveSquares([]), null);
eq('ligne : 5 coups max', formatLine(['32-28', '18-22', '27x18', '12x23', '37-32', '23-29']), { best: '32-28', rest: ['18-22', '27x18', '12x23', '37-32'], truncated: true });
eq('ligne : courte', formatLine(['32-28', '18-22']), { best: '32-28', rest: ['18-22'], truncated: false });
eq('ligne : un seul coup', formatLine(['27x9']), { best: '27x9', rest: [], truncated: false });
eq('ligne : vide', formatLine([]), null);

// --- Seuil de profondeur ---------------------------------------------------------------------------------------------------------
ok('seuil : profondeur minimale = 4', MIN_DEPTH_FOR_MOVE === 4);
const base = { score: 10, mate: null, bestMove: { from: 32, to: 28 } };
eq('flèche masquée aux profondeurs 1 à 3', [1, 2, 3].map((d) => shouldShowMove({ ...base, depth: d })), [false, false, false]);
eq('flèche affichée dès la profondeur 4', [4, 5, 12].map((d) => shouldShowMove({ ...base, depth: d })), [true, true, true]);
eq('flèche masquée sans coup', shouldShowMove({ ...base, bestMove: null, depth: 8 }), false);
eq('flèche masquée si partie terminée', shouldShowMove({ ...base, mate: { winner: 'w', in: 0 }, depth: 8 }), false);
eq('flèche masquée sans résultat', shouldShowMove(null), false);

// --- Empreinte de position ------------------------------------------------------------------------------------------------------------
{
  const fb = FastBoard.initial();
  const b1 = fb.toUiBoard();
  const b2 = fb.toUiBoard();
  eq('empreinte : même position = même clé', positionKey(b1, 'w'), positionKey(b2, 'w'));
  ok('empreinte : le trait compte', positionKey(b1, 'w') !== positionKey(b1, 'b'));
  b2[32] = { color: 'w', king: true };
  ok('empreinte : une dame au lieu d\'un pion change la clé', positionKey(b1, 'w') !== positionKey(b2, 'w'));
  ok('empreinte : longueur fixe (1 + 50)', positionKey(b1, 'w').length === 51);
}

// --- Camp qui a l'avantage (couleur de la plaque) ------------------------------------------------------------------------------------
eq('avantage : +100 → Blancs', scoreSide({ score: 100, mate: null }), 'white');
eq('avantage : -100 → Noirs', scoreSide({ score: -100, mate: null }), 'black');
eq('avantage : 0 → équilibre', scoreSide({ score: 0, mate: null }), 'even');
eq('avantage : ±24 → équilibre (affiche 0,2)', [scoreSide({ score: 24, mate: null }), scoreSide({ score: -24, mate: null })], ['even', 'even']);
eq('avantage : ±20 → équilibre (affiche 0,2)', [scoreSide({ score: 20, mate: null }), scoreSide({ score: -20, mate: null })], ['even', 'even']);
eq('avantage : ±25 → un camp (affiche 0,3)', [scoreSide({ score: 25, mate: null }), scoreSide({ score: -25, mate: null })], ['white', 'black']);
eq('avantage : ±30 → un camp', [scoreSide({ score: 30, mate: null }), scoreSide({ score: -30, mate: null })], ['white', 'black']);
eq('avantage : mat des Noirs → Noirs', scoreSide({ score: -29990, mate: { winner: 'b', in: 2 } }), 'black');
eq('avantage : partie terminée, Blancs vainqueurs → Blancs', scoreSide({ score: 30000, mate: { winner: 'w', in: 0 } }), 'white');
eq('avantage : absent / non fini → équilibre', [scoreSide(null), scoreSide({ score: NaN, mate: null })], ['even', 'even']);
{
  let bad = 0, mismatch = 0;
  for (let s = -300; s <= 300; s++) {
    const a = scoreSide({ score: s, mate: null }), b = scoreSide({ score: -s, mate: null });
    if ((a === 'white' && b !== 'black') || (a === 'black' && b !== 'white') || (a === 'even' && b !== 'even')) bad++;
    // La plaque est « équilibre » exactement quand le texte affiché est 0,0 / ±0,1 / ±0,2.
    const shown = formatScore(s).replace('−', '').replace('+', '');
    const tiny = ['0,0', '0,1', '0,2'].includes(shown);
    if ((a === 'even') !== tiny) mismatch++;
  }
  eq('avantage : symétrie (score opposé = camp opposé) sur 601 valeurs', bad, 0);
  eq('avantage : « équilibre » correspond exactement à un texte 0,0 à ±0,2', mismatch, 0);
  ok('constantes documentées', BIG_SWING === 0.2);
}

// --- Paliers d'avantage (barème de Mickaël) : lumière 0 à 5, jamais de texte --------------------------------------------------------------
{
  // Barème écrit ICI en toutes lettres (indépendamment de ADVANTAGE_TIERS) : valeur affichée en dixièmes de pion.
  const baremeName = (shownTenths) => {
    if (shownTenths <= 2) return 'egal';        // ≤ 0,2
    if (shownTenths > 20) return 'gros';        // > 2
    if (shownTenths >= 15) return 'bel';        // ≥ 1,5
    if (shownTenths >= 9) return 'avantage';    // ≥ 0,9
    if (shownTenths >= 7) return 'naissant';    // ≥ 0,7
    if (shownTenths >= 5) return 'petit';       // ≥ 0,5
    return 'mini';                              // > 0,2
  };
  const LIGHT = { egal: 0, mini: 1, petit: 2, naissant: 2, avantage: 3, bel: 4, gros: 5 };
  let badName = 0, badLight = 0, badSym = 0, badMono = 0, checked = 0;
  let prevLight = -1;
  for (let cp = 0; cp <= 800; cp++) {
    const tenths = Math.round(cp / 10);
    const expected = baremeName(tenths);
    const t = advantageTier({ score: cp, mate: null }), tn = advantageTier({ score: -cp, mate: null });
    checked++;
    if (t.name !== expected) badName++;
    if (t.light !== LIGHT[expected]) badLight++;
    if (tn.name !== t.name || tn.light !== t.light) badSym++;
    if (t.side !== 'even' && (t.side !== 'white' || tn.side !== 'black')) badSym++;
    if (t.light < prevLight) badMono++;
    prevLight = t.light;
  }
  eq(`paliers : nom conforme au barème sur ${checked} valeurs (0 à 8 pions)`, badName, 0);
  eq('paliers : niveau de lumière conforme (0, 1, 2, 2, 3, 4, 5)', badLight, 0);
  eq('paliers : symétrie exacte (score opposé = même palier, camp opposé)', badSym, 0);
  eq("paliers : la lumière ne diminue jamais quand l'avantage grandit", badMono, 0);
  // Valeurs frontières, lues dans le barème : valeur affichée → palier.
  const at = (cp) => advantageTier({ score: cp, mate: null }).name;
  eq('frontières basses : 0,2 égal / 0,3 mini / 0,4 mini / 0,5 petit', [at(20), at(30), at(40), at(50)], ['egal', 'mini', 'mini', 'petit']);
  eq('frontières : 0,6 petit / 0,7 naissant / 0,8 naissant / 0,9 avantage', [at(60), at(70), at(80), at(90)], ['petit', 'naissant', 'naissant', 'avantage']);
  eq('frontières hautes : 1,4 avantage / 1,5 bel / 2,0 bel / 2,1 gros', [at(140), at(150), at(200), at(210)], ['avantage', 'bel', 'bel', 'gros']);
  eq('frontières par arrondi : 24 cp (0,2) égal, 25 cp (0,3) mini, 204 cp (2,0) bel, 205 cp (2,1) gros', [at(24), at(25), at(204), at(205)], ['egal', 'mini', 'bel', 'gros']);
  eq('palier : mat = camp vainqueur, lumière 5', [advantageTier({ score: 29990, mate: { winner: 'w', in: 3 } }), advantageTier({ score: -29990, mate: { winner: 'b', in: 1 } })],
    [{ name: 'mat', side: 'white', light: 5 }, { name: 'mat', side: 'black', light: 5 }]);
  eq('palier : absent / non fini = égal', [advantageTier(null), advantageTier({ score: NaN, mate: null })], [{ name: 'egal', side: 'even', light: 0 }, { name: 'egal', side: 'even', light: 0 }]);
  ok('barème : 7 paliers rangés du plus fort au plus faible, niveaux de lumière 0 à 5 tous présents',
    ADVANTAGE_TIERS.length === 7 && ADVANTAGE_TIERS.every((t, i, a) => i === 0 || t.fromTenths < a[i - 1].fromTenths)
    && Math.max(...ADVANTAGE_TIERS.map((t) => t.light)) === 5 && Math.min(...ADVANTAGE_TIERS.map((t) => t.light)) === 0
    && new Set(ADVANTAGE_TIERS.map((t) => t.light)).size === 6);
}

// --- Gros changement de la jauge ----------------------------------------------------------------------------------------------------------
eq('swing : 0,50 → 0,50 : non', isBigSwing(0.5, 0.5), false);
eq('swing : 0,50 → 0,69 : non (< 20 points)', isBigSwing(0.5, 0.69), false);
eq('swing : 0,50 → 0,71 : oui (≥ 20 points ; pas de test pile à 0,70 : flottants)', isBigSwing(0.5, 0.71), true);
eq('swing : symétrique (baisse)', isBigSwing(0.71, 0.5), true);
eq('swing : vers un mat (0,6 → 1) : oui', isBigSwing(0.6, 1), true);
eq('swing : valeur absente : non', [isBigSwing(null, 0.5), isBigSwing(0.5, NaN), isBigSwing(undefined, undefined)], [false, false, false]);
{
  // Cohérence avec l'échelle : le seuil se déclenche pour ~1 pion près de l'équilibre, pas pour de petits mouvements.
  const f = (cp) => barFraction({ score: cp, mate: null });
  eq('swing : 0 → +1 pion : oui ; −0,5 → +0,5 : oui', [isBigSwing(f(0), f(100)), isBigSwing(f(-50), f(50))], [true, true]);
  eq('swing : 0 → +0,5 : non ; +1 → +2 : non ; +2 → +3 : non', [isBigSwing(f(0), f(50)), isBigSwing(f(100), f(200)), isBigSwing(f(200), f(300))], [false, false, false]);
  eq('swing : 0 → −1 pion : oui (symétrie)', isBigSwing(f(0), f(-100)), true);
}

// --- Repères de la jauge ------------------------------------------------------------------------------------------------------------------------
{
  const t = tickFractions();
  eq('repères : 7 traits, ±0,5 ±1 ±2 et le centre', t.map((x) => x.k), [-2, -1, -0.5, 0, 0.5, 1, 2]);
  eq('repères : TICK_PAWNS est la source', TICK_PAWNS, [-2, -1, -0.5, 0, 0.5, 1, 2]);
  eq('repères : le zéro est au milieu', t.find((x) => x.k === 0).white, 0.5);
  ok('repères : strictement croissants', t.every((x, i) => i === 0 || x.white > t[i - 1].white));
  ok('repères : symétriques (k et -k se complètent à 1 exactement)', [0.5, 1, 2].every((k) => t.find((x) => x.k === -k).white === 1 - t.find((x) => x.k === k).white));
  ok('repères : calculés avec barFraction (même échelle que la jauge)', t.every((x) => x.white === barFraction({ score: x.k * 100, mate: null })));
  ok('repères : tombent aux cibles ±0,5 ≈ 62 %, ±1 ≈ 73 %, ±2 ≈ 88 %', Math.abs(t.find((x) => x.k === 0.5).white - 0.62) < 0.005 && Math.abs(t.find((x) => x.k === 1).white - 0.73) < 0.005 && Math.abs(t.find((x) => x.k === 2).white - 0.88) < 0.005);
}

// --- Zone d'équilibre dorée ------------------------------------------------------------------------------------------------------------------
{
  const z = equalZoneFractions();
  ok('zone : symétrique autour de 50 % (low = 1 - high, exact)', z.low === 1 - z.high && z.low < 0.5 && z.high > 0.5);
  ok('zone : bornes = barFraction de ∓24 cp (dernier score affiché 0,2)', z.high === barFraction({ score: 24, mate: null }) && advantageTier({ score: 24, mate: null }).name === 'egal' && advantageTier({ score: 25, mate: null }).name === 'mini');
  ok('zone : étroite mais visible (entre 4 % et 15 % de la hauteur)', z.high - z.low > 0.04 && z.high - z.low < 0.15, `${((z.high - z.low) * 100).toFixed(1)} %`);
}

// --- Intégration avec le vrai moteur : le format du résultat est bien celui qu'on suppose ------------------------------------------------
{
  const fb = FastBoard.initial();
  const r = analyseSync({ board: fb.toUiBoard(), side: 'w' }, { maxDepth: 6, maxTimeMs: 1e9 });
  ok('moteur : titre, mention, flèche et ligne utilisables', formatHeadline(r).length > 0 && formatMeta(r).includes('profondeur 6')
    && moveSquares(r.bestMove).length >= 2 && formatLine(r.pvNotation).best === r.bestMoveNotation && shouldShowMove(r), `${formatHeadline(r)} · ${r.bestMoveNotation}`);
  // Partie terminée : pion blanc bloqué en 1 (aucun coup légal pour les Blancs).
  const dead = analyseSync({ board: (() => { const b = new Array(51).fill(null); b[1] = { color: 'w', king: false }; return b; })(), side: 'w' }, { maxDepth: 3 });
  eq('moteur : partie terminée → texte de fin, pas de flèche', [formatHeadline(dead), shouldShowMove(dead)], ['Partie terminée — les Noirs gagnent', false]);
}

console.log(failures === 0 ? 'RÉSULTAT : tout concorde.' : `RÉSULTAT : ${failures} échec(s).`);
process.exit(failures === 0 ? 0 : 1);
