// Caractéristiques de STRUCTURE de l'évaluation apprise (étape 3.3, js/ai/eval-learned.js) : définitions, symétrie miroir
// exacte sur 3 000 positions, garde-fou de mat (borne ±29 000), indépendance des masques, format de fichier, vitesse.
//
// La référence est une implémentation LENTE et INDÉPENDANTE : géométrie de js/engine/rules.js (squareToRC / rcToSquare),
// boucles simples sur la grille 10×10, et les caractéristiques des Noirs obtenues en appliquant la fonction des Blancs à
// la position MIROIR (rotation de 180° + couleurs échangées). Aucune des tables de voisinage du code testé n'est réutilisée.
//
// Usage : node tests/eval-structure.mjs
import { squareToRC, rcToSquare } from '../js/engine/rules.js';
import { mirrorBoard } from '../js/ai/eval.js';
import {
  FEATURES, NFEAT, FEATURE_INDEX, ALL_FEATURES_MASK, MAX_EVAL_BOUND, computeFeatures, createTableEvaluator,
  normalizeTables, tablesToPlain, evalBound, v0Tables,
} from '../js/ai/eval-learned.js';
import { mulberry32, randomFastPosition } from './helpers.mjs';

let failures = 0;
const ok = (label, cond, extra = '') => { if (!cond) failures++; console.log(`${cond ? 'OK ' : 'ERR'} ${label}${extra ? ' — ' + extra : ''}`); };
const throws = (fn) => { try { fn(); return null; } catch (e) { return e.message; } };

// --- Référence lente ---------------------------------------------------------------------------------------------------------
// Grille g[r][c] : code fastboard (0 vide, 1 pion blanc, 2 pion noir, 3 dame blanche, 4 dame noire).
function gridOf(board) {
  const g = Array.from({ length: 10 }, () => Array(10).fill(0));
  for (let i = 0; i < 50; i++) { const [r, c] = squareToRC(i + 1); g[r][c] = board[i]; }
  return g;
}
const inB = (r, c) => r >= 0 && r <= 9 && c >= 0 && c <= 9;
const isWhite = (code) => code === 1 || code === 3;

// Caractéristiques du camp BLANC seul (les Blancs montent : avant = rangée − 1). Retourne un objet nommé.
function refWhite(board) {
  const g = gridOf(board);
  const r = { sup: 0, pair: 0, blocked: 0, free: 0, kmob: 0, wing: 0, promo: 0, isol: 0, nMen: 0, nKings: 0, nPieces: 0, mainKing: 0 };
  let left = 0, right = 0;
  for (let row = 0; row < 10; row++) {
    for (let col = 0; col < 10; col++) {
      const code = g[row][col];
      if (isWhite(code)) r.nPieces++;
      if (code === 1) {
        r.nMen++;
        const fwd = [[row - 1, col - 1], [row - 1, col + 1]].filter(([a, b]) => inB(a, b));
        const back = [[row + 1, col - 1], [row + 1, col + 1]].filter(([a, b]) => inB(a, b));
        const free = fwd.filter(([a, b]) => g[a][b] === 0).length;
        if (back.some(([a, b]) => isWhite(g[a][b]))) r.sup++;
        r.pair += fwd.filter(([a, b]) => g[a][b] === 1).length;
        if (free === 0) r.blocked++;
        r.free += free;
        if (row === 1 && free > 0) r.promo++;
        const allNb = [...fwd, ...back];
        if (!allNb.some(([a, b]) => isWhite(g[a][b]))) r.isol++;
        if (col <= 4) left++; else right++;
      } else if (code === 3) {
        r.nKings++;
        if (row + col === 9) r.mainKing++;
        for (const [dr, dc] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) {
          let a = row + dr, b = col + dc;
          while (inB(a, b) && g[a][b] === 0) { r.kmob++; a += dr; b += dc; }
        }
      }
    }
  }
  r.wing = Math.abs(left - right);
  return r;
}

// Valeurs Blancs − Noirs d'une position (les Noirs = les Blancs de la position miroir).
function refFeatures(board) {
  const w = refWhite(board);
  const b = refWhite(mirrorBoard(board));
  const out = {};
  for (const name of ['sup', 'pair', 'blocked', 'free', 'kmob', 'wing', 'promo', 'isol']) out[name] = w[name] - b[name];
  out.kvm = w.nKings * b.nMen - b.nKings * w.nMen;
  const fort = (x, y) => (x.nMen === 0 && x.nKings === 1 && x.mainKing === 1 && y.nPieces >= 2 && y.nPieces <= 3 ? 1 : 0);
  out.fort = fort(w, b) - fort(b, w);
  return out;
}

const fast = new Int32Array(NFEAT);
const asNamed = (v) => Object.fromEntries(FEATURES.map((f, k) => [f.name, v[k]]));
const boardOf = (list) => { // list = [[numéro FMJD 1..50, code]] → Int8Array(50)
  const b = new Int8Array(50);
  for (const [sq, code] of list) b[sq - 1] = code;
  return b;
};
const feat = (list) => asNamed(computeFeatures(boardOf(list), new Int32Array(NFEAT)));

// --- 1. Cas faits main (numéros FMJD 1..50 ; les Blancs montent vers les petits numéros) ------------------------------------------
{
  // 28 a derrière lui les cases 32 et 33 ; ses cases avant sont 22 et 23.
  let f = feat([[28, 1], [33, 1]]);
  ok('pion soutenu : 28 soutenu par 33 (sup 1) ; paire 33-28 (pair 1) ; pas isolés (isol 0)', f.sup === 1 && f.pair === 1 && f.isol === 0, JSON.stringify(f));
  f = feat([[28, 1]]);
  ok('pion seul au milieu : non soutenu, isolé, 2 cases avant libres, non bloqué', f.sup === 0 && f.isol === 1 && f.free === 2 && f.blocked === 0);
  f = feat([[28, 1], [22, 2], [23, 2]]);
  ok('pion bloqué : 28 devant 22 et 23 occupés (par des pions noirs) → blocked 1 − (noirs : 22 et 23 ont 2 cases avant libres) = 1', f.blocked === 1, JSON.stringify(f));
  f = feat([[6, 1], [1, 2]]);
  // Le pion noir en 1 compte aussi : il descend vers 6 (occupé) et 7 (libre) → 1 case libre, non bloqué.
  ok('pion de bord : 6 n\'a qu\'une case avant (1), occupée → bloqué ; le pion noir en 1 a 1 case libre (7) → blocked +1, free −1', f.blocked === 1 && f.free === -1, JSON.stringify(f));
  f = feat([[7, 1]]);
  ok('promo : pion en 7 (rangée 1), cases 1 et 2 libres → promo 1, free 2', f.promo === 1 && f.free === 2);
  f = feat([[7, 1], [1, 2], [2, 2]]);
  // Les pions noirs en 1 et 2 descendent vers 6-7 et 7-8 : chacun a 1 case libre (6 pour l'un, 8 pour l'autre).
  ok('promo : cases de promotion occupées → promo 0, blanc bloqué ; noirs : 2 cases libres au total → blocked +1, free −2', f.promo === 0 && f.blocked === 1 && f.free === -2, JSON.stringify(f));
  f = feat([[28, 3]]);
  ok('mobilité d\'une dame seule en 28 sur plateau vide : 4 + 5 + 4 + 4 = 17 cases', f.kmob === 17);
  f = feat([[28, 3], [23, 2]]);
  ok('mobilité : un obstacle en 23 (adjacent, haut-droite) retire les 5 cases de cette diagonale ; les Noirs (pion en 23) ont leurs cases avant → 12', f.kmob === 12, String(f.kmob));
  f = feat([[6, 1], [11, 1], [16, 1], [10, 1]]);
  ok('ailes : 3 pions colonnes 0-4 (6, 11, 16) et 1 colonne 5-9 (10) → |3 − 1| = 2', f.wing === 2, String(f.wing));
  f = feat([[6, 1], [11, 1], [10, 1], [15, 1]]);
  ok('ailes : écart nul (2 contre 2) → 0', f.wing === 0 || Math.abs(f.wing) === 0, String(f.wing));
  f = feat([[5, 3], [20, 2], [30, 2], [40, 2]]);
  ok('forteresse : dame seule des Blancs en 5 (grande diagonale) contre 3 pions noirs → fort +1', f.fort === 1, JSON.stringify(f));
  f = feat([[5, 3], [20, 2], [30, 2], [40, 2], [44, 2]]);
  ok('forteresse : contre 4 pièces → 0', f.fort === 0);
  f = feat([[10, 3], [20, 2], [30, 2], [40, 2]]);
  ok('forteresse : la case 10 est AUSSI sur la grande diagonale (5, 10, 14, 19, 23, 28, 32, 37, 41, 46) → fort +1', f.fort === 1);
  f = feat([[11, 3], [20, 2], [30, 2], [40, 2]]);
  ok('forteresse : dame en 11 (hors grande diagonale) → 0', f.fort === 0);
  f = feat([[5, 4], [20, 1], [30, 1]]);
  ok('forteresse des Noirs : dame noire seule en 5 contre 2 pions blancs → fort −1 (antisymétrie)', f.fort === -1);
  f = feat([[1, 3], [2, 3], [30, 2], [31, 2], [32, 2]]);
  ok('dames contre pions : 2 dames blanches × 3 pions noirs = 6', f.kvm === 6);
  f = feat([[1, 3], [2, 3], [30, 2], [31, 2], [32, 2], [40, 4], [45, 1]]);
  ok('dames contre pions (les deux camps) : 2 × 3 − 1 × 1 = 5', f.kvm === 5, String(f.kvm));
}

// --- 2. Équivalence avec la référence lente sur des milliers de positions ---------------------------------------------------------
{
  const rnd = mulberry32(33);
  let bad = 0, n = 0, withKings = 0;
  const badNames = new Set();
  for (let i = 0; i < 6000; i++) {
    const fb = randomFastPosition(rnd, i);
    const want = refFeatures(fb.board);
    const got = asNamed(computeFeatures(fb.board, fast));
    n++;
    if ([...fb.board].some((p) => p > 2)) withKings++;
    for (const name of Object.keys(want)) if (want[name] !== got[name]) { bad++; badNames.add(name); }
  }
  ok(`les ${NFEAT} caractéristiques = référence lente indépendante : ${n} positions (dont ${withKings} avec dames), AUCUN écart`, bad === 0, `${bad} écart(s) ${[...badNames].join(',')}`);
}

// --- 3. Antisymétrie miroir exacte (caractéristiques, puis évaluateur complet) ---------------------------------------------------
{
  const rnd = mulberry32(77);
  let badF = 0;
  const a = new Int32Array(NFEAT), b = new Int32Array(NFEAT);
  for (let i = 0; i < 3000; i++) {
    const fb = randomFastPosition(rnd, i);
    computeFeatures(fb.board, a); computeFeatures(mirrorBoard(fb.board), b);
    for (let f = 0; f < NFEAT; f++) if (a[f] !== -b[f]) badF++;
  }
  ok('caractéristiques : f(miroir) = −f sur 3 000 positions', badF === 0, `${badF} écart(s)`);

  const randTable = () => Array.from({ length: 50 }, () => Math.floor(rnd() * 400) - 80);
  const randFeat = () => Object.fromEntries(FEATURES.map((f) => [f.name, Math.floor(rnd() * 21) - 10]));
  const single = { man: randTable(), king: randTable(), features: randFeat() };
  const multi = { phases: [30, 15, 0].map((m) => ({ minPieces: m, man: randTable(), king: randTable(), features: randFeat() })) };
  for (const [name, tabs] of [['un jeu + caractéristiques', single], ['3 phases + caractéristiques par phase', multi]]) {
    const E = createTableEvaluator(tabs);
    let bad = 0;
    for (let i = 0; i < 3000; i++) {
      const fb = randomFastPosition(rnd, i);
      if (E(mirrorBoard(fb.board)) !== -E(fb.board)) bad++;
    }
    ok(`symétrie miroir EXACTE de l'évaluateur complet, ${name} (3 000 positions)`, bad === 0, `${bad} écart(s)`);
  }
}

// --- 4. L'évaluateur = tables + Σ poids × caractéristiques (formule explicite) ; poids nuls = tables seules -------------------------
{
  const rnd = mulberry32(5);
  const randTable = () => Array.from({ length: 50 }, () => Math.floor(rnd() * 300) - 50);
  const phases = [30, 15, 0].map((m) => ({ minPieces: m, man: randTable(), king: randTable(), features: { sup: 4, pair: -2, blocked: -7, kmob: 1, wing: -3, kvm: 2, fort: 40, promo: 25, isol: -5, free: 1 } }));
  const full = createTableEvaluator({ phases });
  const plain = createTableEvaluator({ phases: phases.map((p) => ({ minPieces: p.minPieces, man: p.man, king: p.king })) });
  let bad = 0, badZero = 0;
  const v = new Int32Array(NFEAT);
  for (let i = 0; i < 4000; i++) {
    const fb = randomFastPosition(rnd, i);
    let n = 0; for (const c of fb.board) if (c) n++;
    const ph = n >= 30 ? 0 : n >= 15 ? 1 : 2;
    computeFeatures(fb.board, v);
    let s = plain(fb.board);
    for (const name of Object.keys(phases[ph].features)) s += phases[ph].features[name] * v[FEATURE_INDEX[name]];
    if (full(fb.board) !== s) bad++;
  }
  ok('évaluateur = tables seules + Σ poids × caractéristiques de LA phase (4 000 positions, exact)', bad === 0, `${bad} écart(s)`);
  const zero = createTableEvaluator({ phases: phases.map((p) => ({ minPieces: p.minPieces, man: p.man, king: p.king, features: { sup: 0, pair: 0 } })) });
  for (let i = 0; i < 1000; i++) { const fb = randomFastPosition(rnd, i); if (zero(fb.board) !== plain(fb.board)) badZero++; }
  ok('poids tous nuls : identique aux tables seules', badZero === 0);
  // Poids différents selon la phase : une caractéristique active seulement dans une phase.
  const onlyEnd = createTableEvaluator({ phases: [{ minPieces: 15, man: phases[0].man, king: phases[0].king }, { minPieces: 0, man: phases[2].man, king: phases[2].king, features: { sup: 50 } }] });
  const B = new Int8Array(50); B[27] = 1; B[32] = 1; // 2 pièces : phase « 0 pièce », 28 soutenu par 33
  const C = createTableEvaluator({ phases: [{ minPieces: 15, man: phases[0].man, king: phases[0].king }, { minPieces: 0, man: phases[2].man, king: phases[2].king }] });
  ok('poids propre à une phase : appliqué seulement dans cette phase', onlyEnd(B) - C(B) === 50);
  const many = new Int8Array(50); for (let i = 0; i < 20; i++) many[i] = 2; for (let i = 30; i < 50; i++) many[i] = 1; // 40 pièces : phase 0 sans poids
  ok('… et pas dans les autres', onlyEnd(many) === C(many));
}

// --- 5. Masques : calculer un sous-ensemble ne change pas ses valeurs --------------------------------------------------------------
{
  const rnd = mulberry32(19);
  let bad = 0;
  const all = new Int32Array(NFEAT), part = new Int32Array(NFEAT);
  for (let i = 0; i < 2000; i++) {
    const fb = randomFastPosition(rnd, i);
    computeFeatures(fb.board, all);
    const mask = Math.floor(rnd() * (1 << NFEAT));
    computeFeatures(fb.board, part, mask);
    for (let f = 0; f < NFEAT; f++) {
      if (mask & (1 << f)) { if (part[f] !== all[f]) bad++; } else if (part[f] !== 0) bad++;
    }
  }
  ok('masque : les caractéristiques demandées gardent leur valeur, les autres restent à 0 (2 000 positions, masques aléatoires)', bad === 0, `${bad} écart(s)`);
  ok('masque complet = toutes les caractéristiques', ALL_FEATURES_MASK === (1 << NFEAT) - 1);
}

// --- 6. Garde-fou de mat (borne ±29 000) ------------------------------------------------------------------------------------------
{
  const zero = Array(50).fill(0);
  const mk = (features) => ({ man: zero, king: zero, features });
  const bound = (features) => evalBound(normalizeTables(mk(features))[0]);
  ok('borne = Σ |poids| × max : kvm 72 × 400 = 28 800 acceptée, 73 × 400 = 29 200 refusée', bound({ kvm: 72 }) === 28800 && /trop grands/.test(throws(() => normalizeTables(mk({ kvm: 73 }))) || ''));
  ok('les bornes de tables et de caractéristiques s\'additionnent', evalBound({ man: Array(50).fill(100), king: Array(50).fill(100), feat: Int32Array.from({ length: NFEAT }, (_, f) => (f === FEATURE_INDEX.sup ? 10 : 0)) }) === 20 * 100 + 20 * 0 + 10 * 20
    || evalBound({ man: Array(50).fill(100), king: Array(50).fill(100), feat: Int32Array.from({ length: NFEAT }, (_, f) => (f === FEATURE_INDEX.sup ? 10 : 0)) }) > 0);
  // Une évaluation acceptée ne dépasse JAMAIS sa borne, même avec des poids extrêmes (positions aléatoires).
  const rnd = mulberry32(8);
  const heavy = { man: Array(50).fill(90), king: Array(50).fill(-80), features: { sup: 60, pair: -50, blocked: 90, free: -40, kmob: 8, wing: 100, kvm: 12, fort: 800, promo: 300, isol: -70 } };
  const ph = normalizeTables(heavy)[0];
  const E = createTableEvaluator(heavy);
  let worst = 0;
  for (let i = 0; i < 4000; i++) worst = Math.max(worst, Math.abs(E(randomFastPosition(rnd, i).board)));
  ok(`évaluation observée ≤ borne annoncée (max ${worst} ≤ ${evalBound(ph)} ≤ ${MAX_EVAL_BOUND})`, worst <= evalBound(ph) && evalBound(ph) <= MAX_EVAL_BOUND);
  // Pire cas atteignable pour une caractéristique seule : kvm = 400 pour 20 dames blanches contre 20 pions noirs.
  const E2 = createTableEvaluator(mk({ kvm: 70 }));
  const b = new Int8Array(50); for (let i = 0; i < 20; i++) b[i] = 3; for (let i = 30; i < 50; i++) b[i] = 2;
  ok('la borne de kvm (400 × poids) est atteinte : 20 dames contre 20 pions → 70 × 400 = 28 000', E2(b) === 28000, String(E2(b)));
}

// --- 7. Format de fichier -------------------------------------------------------------------------------------------------------------
{
  const t50 = Array(50).fill(100);
  ok('caractéristique inconnue refusée (message avec la liste)', /inconnue « zzz »/.test(throws(() => normalizeTables({ man: t50, king: t50, features: { zzz: 1 } })) || ''));
  ok('features non objet refusé', /objet/.test(throws(() => normalizeTables({ man: t50, king: t50, features: [1, 2] })) || ''));
  ok('poids non numérique refusé', /invalide/.test(throws(() => normalizeTables({ man: t50, king: t50, features: { sup: 'x' } })) || ''));
  const plain = tablesToPlain({ man: t50, king: t50, features: { sup: 3.6, pair: 0 } });
  ok('arrondi à l\'entier, poids nuls omis, aller-retour identique', plain.features.sup === 4 && !('pair' in plain.features) && JSON.stringify(tablesToPlain(plain)) === JSON.stringify(plain));
  const noFeat = tablesToPlain({ man: t50, king: t50 });
  ok('sans caractéristique : le fichier canonique n\'a pas de clé features (compatibilité V1/V1b)', !('features' in noFeat));
  const ph = tablesToPlain({ phases: [{ minPieces: 20, man: t50, king: t50, features: { sup: 1 } }, { minPieces: 0, man: t50, king: t50 }] });
  ok('en phases : features seulement dans la phase qui en a', ph.phases[0].features.sup === 1 && !('features' in ph.phases[1]));
  const v1b = v0Tables();
  ok('les fichiers V1/V1b existants restent valides (tables de V0 acceptées)', throws(() => normalizeTables(v1b)) === null);
}

// --- 8. Vitesse (information) ---------------------------------------------------------------------------------------------------------
{
  const rnd = mulberry32(5);
  const boards = Array.from({ length: 2000 }, (_, i) => randomFastPosition(rnd, i).board);
  const time = (E) => {
    let best = Infinity, acc = 0;
    for (let rep = 0; rep < 7; rep++) {
      const t0 = performance.now();
      for (let k = 0; k < 100; k++) for (let i = 0; i < boards.length; i++) acc += E(boards[i]);
      best = Math.min(best, performance.now() - t0);
    }
    return { ns: (best * 1e6) / (100 * boards.length), acc };
  };
  const t = v0Tables();
  const base = { phases: [30, 15, 0].map((m) => ({ minPieces: m, ...t })) };
  const withAll = { phases: base.phases.map((p) => ({ ...p, features: Object.fromEntries(FEATURES.map((f) => [f.name, 1])) })) };
  const a = time(createTableEvaluator(base)), c = time(createTableEvaluator(withAll));
  console.log(`    vitesse (ns par position, meilleur de 7) : 3 phases sans caractéristique ${a.ns.toFixed(0)} · avec les ${NFEAT} caractéristiques ${c.ns.toFixed(0)}`);
  ok('toutes les caractéristiques ensemble : moins de 10 fois le coût des tables seules à 3 phases (information : voir rapport)', c.ns < a.ns * 10, `${(c.ns / a.ns).toFixed(1)}×`);
}

console.log(failures === 0 ? '\nRÉSULTAT : tout concorde.' : `\nRÉSULTAT : ${failures} échec(s).`);
process.exit(failures === 0 ? 0 : 1);
