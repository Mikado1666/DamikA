// DAMIKA — Évaluation par MOTIFS (P14) : évaluation de base (tables apprises, ex. n123) + Σ valeurs de motifs.
// Module VOISIN de eval-learned.js : n'en change ni le format ni le comportement ; aucun accès au DOM.
//
// Un motif = un petit groupe de k cases voisines (numéros FMJD 1..50). Son état = la configuration de ces cases, 4 états par case
// (0 vide, 1 pion blanc, 2 pion noir, 3 dame de l'un ou l'autre camp) → un indice de 0 à 4^k − 1 → un poids entier (centipions),
// par phase de jeu (nombre de pièces : ≥ 30 / 15-29 / < 15, comme les tables).
//   éval(Blancs) = base(plateau) + Σ_p T[phase][p][indice du motif p sur le plateau]
//                                − Σ_p T[phase][p][indice du motif p sur le plateau MIROIR]
// Le plateau miroir = rotation de 180° (case i ↔ 49 − i en index 0..49) + couleurs échangées (dames : un seul état, inchangé) :
// l'évaluation des Noirs est la même fonction appliquée à la position miroir, donc éval(miroir) = −éval EXACTEMENT.
// Les indices des deux vues sont calculés en UNE passe sur les pièces (une case vide ajoute 0 à l'indice).
//
// Format de fichier : le fichier des tables de base ({ phases } ou { man, king }) + un champ
//   patterns: { cells: [[cases FMJD], …], minPieces: [30, 15, 0], tables: [ phase ][ motif ] → tableau de 4^k entiers }
// Les fichiers sans `patterns` restent des tables ordinaires (createModelEvaluator les passe à createTableEvaluator).
import { createTableEvaluator, normalizeTables, tablesToPlain, evalBound, pieceValueTable, MAX_EVAL_BOUND } from './eval-learned.js';

export const PATTERN_PHASE_MIN = [30, 15, 0];

// Jeux de motifs (cases FMJD ; Blancs en bas, ils montent vers les petits numéros).
// A (P14, petit) : 12 motifs de 5 cases.
//   6 « losanges » (une case + ses 4 voisines diagonales) autour de 22, 23, 27, 28, 32, 33 : tout le centre, avec recouvrement ;
//   2 zigzags d'aile : 16-21-26-31-36 (gauche) et 15-20-25-30-35 (droite) ;
//   2 lignes de fond : 46-50 (ligne arrière des Blancs) et 1-5 (promotion, ligne arrière des Noirs) ;
//   2 motifs sur l'axe 25-30-35 et ses voisines : {25, 29, 30, 34, 35} et {24, 25, 29, 30, 34}.
export const PATTERN_SETS = {
  A: [
    [27, 21, 22, 31, 32], [28, 22, 23, 32, 33], [22, 17, 18, 27, 28], [23, 18, 19, 28, 29], [32, 27, 28, 37, 38], [33, 28, 29, 38, 39],
    [16, 21, 26, 31, 36], [15, 20, 25, 30, 35], [46, 47, 48, 49, 50], [1, 2, 3, 4, 5], [25, 29, 30, 34, 35],
    [24, 25, 29, 30, 34],
  ],
  // Remarque (P17) : un motif et sa rotation de 180° (mêmes cases à l'ordre près : p ↔ 51 − p) sont REDONDANTS, car l'évaluation
  // des Noirs lit la même table sur le plateau miroir : l'un des deux suffit. A en contient 3 paires (losanges 28 / 23, ailes
  // [16,…] / [15,…], lignes de fond [46-50] / [1-5]) : 9 motifs distincts sur 12. B et C n'en ont aucune (un représentant par
  // paire) et couvrent, avec leur rotation, les 50 cases.
  // B (P17) : k = 5, 23 motifs distincts :
  //   12 losanges (case + 4 voisines diagonales) centrés en 27-34 et 37-40 (avec la rotation : tous les centres des rangées 3 à 8) ;
  //   5 rangées entières (26-30, 31-35, 36-40, 41-45, 46-50) ; ailes [16,21,26,31,36] et [20,25,30,35,40] ;
  //   les 2 motifs d'axe de A ; 2 zigzags centraux [17,22,27,32,37] et [19,24,29,34,39].
  B: [
    [27, 21, 22, 31, 32], [28, 22, 23, 32, 33], [29, 23, 24, 33, 34], [30, 24, 25, 34, 35],
    [31, 26, 27, 36, 37], [32, 27, 28, 37, 38], [33, 28, 29, 38, 39], [34, 29, 30, 39, 40],
    [37, 31, 32, 41, 42], [38, 32, 33, 42, 43], [39, 33, 34, 43, 44], [40, 34, 35, 44, 45],
    [46, 47, 48, 49, 50], [41, 42, 43, 44, 45], [36, 37, 38, 39, 40], [31, 32, 33, 34, 35], [26, 27, 28, 29, 30],
    [16, 21, 26, 31, 36], [20, 25, 30, 35, 40], [25, 29, 30, 34, 35], [24, 25, 29, 30, 34],
    [17, 22, 27, 32, 37], [19, 24, 29, 34, 39],
  ],
  // C (P17) : k = 6, 14 « briques » de 6 cases (3 cases d'une rangée + 3 cases de la rangée voisine, chaque case du haut touchant
  // une case du bas) : 2 coins de la ligne de fond noire, 3 briques par bande de rangées 1-2 et 2-3, 3 en bande 3-4, 1 en bande 4-5
  // (centre), et 2 briques d'aile (26-27-31-32-36-37 et 29-30-34-35-39-40).
  C: [
    [1, 2, 3, 6, 7, 8], [3, 4, 5, 8, 9, 10],
    [6, 7, 8, 11, 12, 13], [7, 8, 9, 12, 13, 14], [8, 9, 10, 13, 14, 15],
    [11, 12, 13, 16, 17, 18], [12, 13, 14, 17, 18, 19], [13, 14, 15, 18, 19, 20],
    [16, 17, 18, 21, 22, 23], [17, 18, 19, 22, 23, 24], [18, 19, 20, 23, 24, 25],
    [21, 22, 23, 26, 27, 28],
    [26, 27, 31, 32, 36, 37], [29, 30, 34, 35, 39, 40],
  ],
};

// État d'une case selon le code fastboard (0 vide, 1 pion blanc, 2 pion noir, 3 dame blanche, 4 dame noire).
const STATE_W = new Int32Array([0, 1, 2, 3, 3]); // vue des Blancs
const STATE_B = new Int32Array([0, 2, 1, 3, 3]); // vue du plateau miroir (couleurs échangées)

// Précalculs d'un jeu de motifs : listes, par case (index 0..49), des (motif, multiplicateur 4^j) pour les deux vues.
export function buildPatternSet(cells) {
  const np = cells.length;
  const size = new Int32Array(np);
  const wList = Array.from({ length: 50 }, () => []);
  const bList = Array.from({ length: 50 }, () => []);
  cells.forEach((cs, p) => {
    if (!Array.isArray(cs) || cs.length < 1 || cs.length > 7) throw new Error(`motif ${p} : 1 à 7 cases attendues`);
    if (new Set(cs).size !== cs.length) throw new Error(`motif ${p} : cases en double`);
    size[p] = 4 ** cs.length;
    cs.forEach((sq, j) => {
      if (!Number.isInteger(sq) || sq < 1 || sq > 50) throw new Error(`motif ${p} : case ${sq} invalide (1 à 50)`);
      const c0 = sq - 1, mult = 4 ** j;
      wList[c0].push([p, mult]);          // la pièce en c0 compte dans la vue des Blancs
      bList[49 - c0].push([p, mult]);     // la pièce en 49 − c0 est en c0 sur le plateau miroir
    });
  });
  const flat = (lists) => {
    const start = new Int32Array(51), pat = [], mul = [];
    for (let i = 0; i < 50; i++) { start[i] = pat.length; for (const [p, m] of lists[i]) { pat.push(p); mul.push(m); } }
    start[50] = pat.length;
    return { start, pat: Uint8Array.from(pat), mul: Int32Array.from(mul) };
  };
  const total = Array.from(size).reduce((a, b) => a + b, 0);
  return { np, size, cells, W: flat(wList), B: flat(bList), total };
}

const phaseTable = new Uint8Array(51);
for (let n = 0; n <= 50; n++) { let k = 0; while (PATTERN_PHASE_MIN[k] > n) k++; phaseTable[n] = k; }
export const patternPhaseOfCount = (n) => phaseTable[n];

// UNE définition des indices, partagée par l'évaluateur et l'apprentissage. Retourne une fonction
// (board, iw, ib) → nombre de pièces, qui remplit iw[p] (indice du motif p sur le plateau) et ib[p] (sur le plateau miroir).
// Boucle PAR MOTIF, sans branchement (les tests « case vide ? » sont mal prédits sur un damier : plus lents que des lectures
// systématiques) : deux lectures du plateau par case de motif, une pour chaque vue.
export function makePatternIndexer(set) {
  const { np, cells } = set;
  const pstart = new Int32Array(np + 1);
  cells.forEach((cs, p) => { pstart[p + 1] = pstart[p] + cs.length; });
  const total = pstart[np];
  const CW = new Uint8Array(total), CB = new Uint8Array(total), SH = new Uint8Array(total);
  cells.forEach((cs, p) => cs.forEach((sq, j) => { CW[pstart[p] + j] = sq - 1; CB[pstart[p] + j] = 50 - sq; SH[pstart[p] + j] = 2 * j; }));
  return function indexes(board, iw, ib) {
    let n = 0;
    for (let i = 0; i < 50; i++) n += OCCUPIED[board[i]];
    for (let p = 0; p < np; p++) {
      let a = 0, b = 0;
      for (let q = pstart[p], end = pstart[p + 1]; q < end; q++) {
        a |= STATE_W[board[CW[q]]] << SH[q];
        b |= STATE_B[board[CB[q]]] << SH[q];
      }
      iw[p] = a; ib[p] = b;
    }
    return n;
  };
}
const OCCUPIED = new Uint8Array([0, 1, 1, 1, 1]);

// Contrôle et mise sous forme de travail d'un champ `patterns`. Retourne { set, tables: Int32Array[phase][motif] (offset dans
// un tableau plat par phase), flat: Int32Array[phase] (np × size selon motif), bounds }.
export function normalizePatterns(patterns, basePhases) {
  if (!patterns || typeof patterns !== 'object') throw new Error('patterns : objet attendu');
  const set = buildPatternSet(patterns.cells);
  const mp = patterns.minPieces || PATTERN_PHASE_MIN;
  if (mp.length !== 3 || mp.some((v, k) => v !== PATTERN_PHASE_MIN[k])) throw new Error('patterns.minPieces : 30, 15, 0 attendus');
  if (!Array.isArray(patterns.tables) || patterns.tables.length !== 3) throw new Error('patterns.tables : 3 phases attendues');
  const offs = new Int32Array(set.np + 1);
  for (let p = 0; p < set.np; p++) offs[p + 1] = offs[p] + set.size[p];
  const flat = patterns.tables.map((ph, k) => {
    if (!Array.isArray(ph) || ph.length !== set.np) throw new Error(`patterns.tables[${k}] : ${set.np} motifs attendus`);
    const f = new Int16Array(set.total); // |poids| ≤ 29 000 (garde-fou) : tient sur 16 bits, tables 2 fois plus petites (cache)
    ph.forEach((t, p) => {
      if (t.length !== set.size[p]) throw new Error(`patterns.tables[${k}][${p}] : ${set.size[p]} valeurs attendues (reçu ${t.length})`);
      for (let i = 0; i < t.length; i++) {
        const v = Number(t[i]);
        if (!Number.isFinite(v) || Math.abs(v) > 1e6) throw new Error(`patterns.tables[${k}][${p}][${i}] invalide : ${t[i]}`);
        if (Math.abs(Math.round(v)) > 32000) throw new Error(`patterns.tables[${k}][${p}][${i}] : |poids| > 32 000`);
        f[offs[p] + i] = Math.round(v);
      }
    });
    return f;
  });
  // Borne EXACTE de la contribution des motifs, par phase : Σ_p (max − min de la table du motif) majore |Σ T[W] − Σ T[B]|.
  // (La borne ne suppose rien sur les configurations atteignables : elle est sûre.) Bornes totales = base + motifs.
  const patBound = flat.map((f) => {
    let b = 0;
    for (let p = 0; p < set.np; p++) {
      let mx = -Infinity, mn = Infinity;
      for (let i = offs[p]; i < offs[p + 1]; i++) { if (f[i] > mx) mx = f[i]; if (f[i] < mn) mn = f[i]; }
      b += mx - mn;
    }
    return b;
  });
  const bounds = patBound.map((pb, k) => pb + evalBound(basePhases[Math.min(k, basePhases.length - 1)]));
  bounds.forEach((b, k) => {
    if (b > MAX_EVAL_BOUND) throw new Error(`patterns : l'évaluation pourrait atteindre ±${b} en phase ${k} (> ${MAX_EVAL_BOUND}, zone des scores de mat)`);
  });
  return { set, flat, offs, bounds, patBound };
}

// Évaluateur de RÉFÉRENCE (P14) : lent mais simple ; les tests (tests/eval-patterns.mjs) le comparent à l'évaluateur rapide
// ci-dessous, qui doit donner EXACTEMENT les mêmes scores. `model` = fichier des tables de base + `patterns`.
// Sans `patterns` : exactement createTableEvaluator.
export function createReferenceModelEvaluator(model) {
  if (!model || !model.patterns) return createTableEvaluator(tablesToPlain(model));
  const plain = tablesToPlain(model);
  const base = createTableEvaluator(plain);
  const { set, flat, offs } = normalizePatterns(model.patterns, normalizeTables(plain));
  const np = set.np;
  const iw = new Int32Array(np), ib = new Int32Array(np);
  const indexes = makePatternIndexer(set);
  return function evalWhite(board) {
    const n = indexes(board, iw, ib);
    const T = flat[phaseTable[n]];
    let s = base(board);
    for (let p = 0; p < np; p++) { const o = offs[p]; s += T[o + iw[p]] - T[o + ib[p]]; }
    return s;
  };
}

// Évaluateur RAPIDE (P16). Mêmes scores que la référence, au point près (entiers). Le code est GÉNÉRÉ pour le jeu de motifs
// (cases et décalages écrits en dur : plus aucune lecture de tableau de géométrie), en UNE passe :
//   - les 50 cases sont lues une seule fois dans des variables locales ; le nombre de pièces donne la phase ;
//   - l'état d'une case (0 vide, 1 pion blanc, 2 pion noir, 3 dame) s'obtient par arithmétique (c − (c >> 2)), l'état vu du
//     plateau miroir par échange des deux bits ; aucun test « case vide ? » (mal prédit) ;
//   - la somme des tables de base (V[code × 50 + case], phase choisie) est faite dans la même fonction.
// Conditions : base SANS caractéristiques de structure et sans phases autres que 30 / 15 / 0 (ou une seule phase) ; sinon (ou si
// `new Function` est refusé, par exemple par une politique de sécurité du navigateur) createModelEvaluator retombe sur la référence.
export function createFastModelEvaluator(model) { // retourne null si l'évaluateur rapide ne s'applique pas
  const plain = tablesToPlain(model);
  const phases = normalizeTables(plain);
  if (phases.some((ph) => ph.feat.some((w) => w !== 0))) return null;
  if (phases.length !== 1 && (phases.length !== 3 || phases.some((ph, k) => ph.minPieces !== PATTERN_PHASE_MIN[k]))) return null;
  const { set, flat, offs } = normalizePatterns(model.patterns, phases);
  const np = set.np, total = set.total;
  const T = new Int16Array(3 * total);
  for (let k = 0; k < 3; k++) T.set(flat[k], k * total);
  const Vtabs = [0, 1, 2].map((k) => pieceValueTable(phases[Math.min(k, phases.length - 1)]));
  const V = new Int32Array(3 * 250);
  for (let k = 0; k < 3; k++) V.set(Vtabs[k], k * 250);
  // Cases lues par chaque vue : vue Blancs → case sq − 1 ; vue miroir → case 50 − sq (index fastboard).
  const needW = new Set(), needB = new Set();
  set.cells.forEach((cs) => cs.forEach((sq) => { needW.add(sq - 1); needB.add(50 - sq); }));
  const L = [];
  for (let i = 0; i < 50; i++) L.push(`const c${i} = b[${i}];`);
  L.push('const n = ' + Array.from({ length: 50 }, (_, i) => `((c${i} + 3) >> 2)`).join(' + ') + ';');
  L.push('const ph = (n < 30 ? 1 : 0) + (n < 15 ? 1 : 0);');
  L.push('const to = ph * ' + total + ', vo = ph * 250;');
  for (const i of needW) L.push(`const w${i} = c${i} - (c${i} >> 2);`);
  for (const i of needB) { const src = needW.has(i) ? `w${i}` : `(c${i} - (c${i} >> 2))`; L.push(`const b${i} = ((${src} & 1) << 1) | (${src} >> 1);`); }
  let acc = '';
  set.cells.forEach((cs, p) => {
    const iw = cs.map((sq, j) => `(w${sq - 1} << ${2 * j})`).join(' | ');
    const ib = cs.map((sq, j) => `(b${50 - sq} << ${2 * j})`).join(' | ');
    acc += ` + T[to + ${offs[p]} + (${iw})] - T[to + ${offs[p]} + (${ib})]`;
  });
  L.push('return ' + Array.from({ length: 50 }, (_, i) => `V[vo + c${i} * 50 + ${i}]`).join(' + ') + acc + ';');
  const factory = new Function('T', 'V', 'return function evalWhite(b) {' + L.join(' ') + '};');
  return factory(T, V);
}

export function createModelEvaluator(model) {
  if (!model || !model.patterns) return createTableEvaluator(tablesToPlain(model));
  let fast = null;
  try { fast = createFastModelEvaluator(model); } catch (e) { if (e instanceof EvalError) fast = null; else throw e; } // EvalError : `new Function` refusé
  return fast || createReferenceModelEvaluator(model);
}

// Description lisible d'une configuration (indice → « .wbD » dans l'ordre des cases du motif).
export function describeConfig(cells, index) {
  return cells.map((sq, j) => `${sq}:${'.wbD'[Math.floor(index / 4 ** j) % 4]}`).join(' ');
}
