// DAMIKA — Évaluation apprise « à tables » (étage 3.2). Aucun accès au DOM, aucune dépendance : utilisable
// dans le Worker comme sous Node.
//
// IDÉE. L'évaluation V0 (eval.js) est en réalité une SOMME DE VALEURS PAR CASE : chaque pion blanc en i
// vaut manValue[i], chaque dame blanche en i vaut kingValue[i], et une pièce noire en i vaut ce que vaut
// la pièce blanche en 49 − i (symétrie miroir : rotation de 180° + échange des couleurs), signe inversé.
// Au lieu de calculer ces valeurs par formules (avancement, centre, tempo…), on peut donc les APPRENDRE
// directement : deux tables de 50 entiers (pion, dame), évaluées sans surcoût de vitesse.
//
// Format des tables (centipions entiers, point de vue des Blancs, cases 0..49 comme fastboard.js) :
//   { man: [50 entiers], king: [50 entiers] }                         // un seul jeu (« V1 »)
//   { phases: [{ minPieces, man, king }, …] }                         // jeux par phase (« V1b »)
// En mode `phases`, le jeu utilisé est le PREMIER dont minPieces ≤ nombre total de pièces sur le plateau
// (les deux camps) ; les phases sont rangées de la plus grande valeur de minPieces à la plus petite, et la
// dernière doit avoir minPieces = 0. Le nombre de pièces est le même pour une position et son miroir : la
// symétrie exacte  evalWhite(p) = -evalWhite(miroir(p))  est donc conservée dans les deux modes.
//
// Les tables sont des entiers : la somme est exacte (aucun arrondi flottant), donc la recherche reste
// déterministe. Le fichier peut contenir d'autres clés (format, nom, méta-données) : elles sont ignorées.
//
// ÉTAPE 3.3 — CARACTÉRISTIQUES DE STRUCTURE (« V2 »). Une table par case est LINÉAIRE : elle ne voit pas les formations.
// Chaque phase peut donc aussi porter un objet `features` : { nom: poids entier en centipions, … } ; l'évaluation vaut
//     éval = Σ cases (tables)  +  Σ_f  poids_f × ( f(Blancs) − f(Noirs) )
// où f est un COMPTEUR entier calculé sur le tableau fastboard (voir FEATURES et computeFeatures : aucune génération de
// coups). Les Noirs sont traités comme les Blancs d'une position retournée (rotation de 180° + échange des couleurs) :
// f(Noirs) est la même fonction appliquée dans leur propre sens de marche, donc evalWhite(miroir) = −evalWhite exactement.
// Un poids absent vaut 0 ; si aucun poids n'est non nul, l'évaluateur est celui des tables seules (aucun surcoût).
//   { phases: [{ minPieces, man, king, features: { sup: 3, blocked: -5 } }, …] }

import { createEvaluator, EVAL_WEIGHTS } from './eval.js';

export const TABLE_SIZE = 50;
// Garde-fou : la recherche réserve les scores au-delà de ±29 900 aux mats (MATE = 30 000) et range les scores de
// sa table de transposition sur 16 bits : une évaluation ne doit jamais s'en approcher. On exige donc que la borne
// EXACTE de |éval| (voir evalBound) reste ≤ 29 000, ce que les tables apprises respectent largement (≈ 6 000 à 19 000).
export const MAX_EVAL_BOUND = 29000;
const LIMIT = 1e6; // simple contrôle de bon sens avant le calcul de la borne (une valeur de 10 000 pions est une erreur)

// --- Caractéristiques de structure ------------------------------------------------------------------------------------------
// Chaque caractéristique est une DIFFÉRENCE Blancs − Noirs de compteurs entiers ; `max` majore sa valeur absolue (sert à la
// borne de mat, voir evalBound). Seuls les compteurs NON linéaires en « pièce sur case » apportent quelque chose de plus que
// les tables : un nombre de pions par aile, ou de pions au centre, est une somme de valeurs par case, donc déjà dans les tables.
//   sup      pions SOUTENUS : une pièce alliée (pion ou dame) sur l'une des deux cases juste derrière eux          (F1 connexité)
//   pair     paires de pions voisins (deux pions alliés en diagonale, comptées une fois)                           (F1 connexité)
//   blocked  pions BLOQUÉS : toutes leurs cases avant existantes sont occupées (par n'importe quelle pièce)        (F2 blocage)
//   free     cases avant LIBRES des pions (0, 1 ou 2 par pion) ; NB : « pions ayant au moins une case avant libre »
//            = nombre de pions − blocked, donc redondant avec blocked + les tables ; free distingue 1 case de 2    (F3 mobilité)
//   kmob     mobilité des dames : cases vides le long des 4 diagonales, jusqu'au premier obstacle                  (F3 mobilité)
//   wing     déséquilibre des ailes : | pions colonnes 0-4 − pions colonnes 5-9 |                                  (F4 ailes)
//   kvm      interaction dames / pions : dames Blancs × pions Noirs − dames Noirs × pions Blancs                   (F5 dames)
//   fort     « forteresse » : une dame SEULE sur la grande diagonale (cases 5-46) face à 2 ou 3 pièces             (F5 dames)
//   promo    pions à un pas de la promotion avec au moins une case de promotion libre                              (F6 idée du jeu)
//   isol     pions ISOLÉS : aucune pièce alliée sur les 4 cases diagonales voisines                                (F6 idée du jeu)
export const FEATURES = [
  { name: 'sup', max: 20 }, { name: 'pair', max: 40 }, { name: 'blocked', max: 20 }, { name: 'free', max: 40 },
  { name: 'kmob', max: 360 }, { name: 'wing', max: 20 }, { name: 'kvm', max: 400 }, { name: 'fort', max: 1 },
  { name: 'promo', max: 5 }, { name: 'isol', max: 20 },
];
export const NFEAT = FEATURES.length;
export const FEATURE_INDEX = Object.fromEntries(FEATURES.map((f, k) => [f.name, k]));
const F_SUP = 0, F_PAIR = 1, F_BLOCKED = 2, F_FREE = 3, F_KMOB = 4, F_WING = 5, F_KVM = 6, F_FORT = 7, F_PROMO = 8, F_ISOL = 9;
export const ALL_FEATURES_MASK = (1 << NFEAT) - 1;

// Géométrie du damier 10×10 sur les cases 0..49 (identique à eval.js / fastboard.js) : case i → rangée floor(i / 5),
// colonne 2·(i % 5) + (rangée paire ? 1 : 0). Les Blancs montent (rangée décroissante), les Noirs descendent.
// Voisins diagonaux ; 50 = hors damier (la case 50 d'un tableau « rembourré » est toujours vide).
const NB = new Uint8Array(4 * 50).fill(50); // 0 = haut-gauche, 1 = haut-droite, 2 = bas-gauche, 3 = bas-droite
const FWD_L = new Uint8Array(100), FWD_R = new Uint8Array(100), BACK_L = new Uint8Array(100), BACK_R = new Uint8Array(100);
const NFWD = new Uint8Array(100);   // nombre de cases avant existantes d'un pion (couleur × 50 + case)
const PENULT = new Uint8Array(100); // 1 si un pion de cette couleur sur cette case est à un pas de la promotion
const WING_SIDE = new Uint8Array(50); // 0 : colonnes 0-4, 1 : colonnes 5-9
const MAIN_DIAG = new Uint8Array(50); // grande diagonale (cases FMJD 5, 10, 14, 19, 23, 28, 32, 37, 41, 46)
(function initGeometry() {
  const rowOf = (i) => (i / 5) | 0;
  const colOf = (i) => 2 * (i % 5) + (rowOf(i) % 2 === 0 ? 1 : 0);
  const idx = (r, c) => (r < 0 || r > 9 || c < 0 || c > 9 || (r + c) % 2 === 0 ? 50 : r * 5 + ((c - (r % 2 === 0 ? 1 : 0)) >> 1));
  for (let i = 0; i < 50; i++) {
    const r = rowOf(i), c = colOf(i);
    NB[i] = idx(r - 1, c - 1); NB[50 + i] = idx(r - 1, c + 1); NB[100 + i] = idx(r + 1, c - 1); NB[150 + i] = idx(r + 1, c + 1);
    // Blancs (couleur 0) : avant = haut, arrière = bas ; Noirs (couleur 1) : l'inverse.
    FWD_L[i] = NB[i]; FWD_R[i] = NB[50 + i]; BACK_L[i] = NB[100 + i]; BACK_R[i] = NB[150 + i];
    FWD_L[50 + i] = NB[100 + i]; FWD_R[50 + i] = NB[150 + i]; BACK_L[50 + i] = NB[i]; BACK_R[50 + i] = NB[50 + i];
    NFWD[i] = (FWD_L[i] < 50 ? 1 : 0) + (FWD_R[i] < 50 ? 1 : 0);
    NFWD[50 + i] = (FWD_L[50 + i] < 50 ? 1 : 0) + (FWD_R[50 + i] < 50 ? 1 : 0);
    PENULT[i] = r === 1 ? 1 : 0;       // Blancs : rangée 1 (la promotion est en rangée 0)
    PENULT[50 + i] = r === 8 ? 1 : 0;  // Noirs : rangée 8 (la promotion est en rangée 9)
    WING_SIDE[i] = c <= 4 ? 0 : 1;
    MAIN_DIAG[i] = r + c === 9 ? 1 : 0;
  }
})();

// Tableau rembourré : copie du plateau + une case 50 toujours vide (évite tout test de bord dans les boucles).
const PAD = new Int8Array(51);
const ACC = new Int32Array(2 * NFEAT);
const WINGS = new Int32Array(4);
const CNT = new Int32Array(5); // nombre de pièces par code fastboard (1 pion blanc, 2 pion noir, 3 dame blanche, 4 dame noire)
// Tables de consultation « sans branchement » (les données du damier rendent les tests if très mal prédits) :
const OCC = new Uint8Array([0, 1, 1, 1, 1]);      // case occupée ? (par code)
const OWN = new Uint8Array(10);                    // OWN[couleur * 5 + code] : la pièce de ce code est-elle de cette couleur ?
for (let col = 0; col < 2; col++) for (let c = 1; c <= 4; c++) OWN[col * 5 + c] = ((c + 1) & 1) === col ? 1 : 0;
const ISMAN = new Uint8Array(10);                  // ISMAN[couleur * 5 + code] : pion allié ?
for (let col = 0; col < 2; col++) ISMAN[col * 5 + col + 1] = 1;
// Résultat de scanPad : somme de la table (SUMS[0]).
const SUMS = new Int32Array(1);
// Liste compacte des cases occupées (construite SANS branchement par listOccupied) : on ne boucle ensuite que sur les pièces,
// sans le test « case vide ? » dont le résultat, aléatoire d'une case à l'autre, est mal prédit par le processeur.
const LIST = new Uint8Array(51);
function listOccupied(P) {
  let n = 0;
  for (let i = 0; i < 50; i++) { LIST[n] = i; n += OCC[P[i]]; }
  return n;
}
const ZERO_V = new Int32Array(5 * TABLE_SIZE);

// UNE passe sur les 50 cases qui calcule à la fois la somme de la table V (tableau « code × 50 + case » de pieceValueTable,
// celui de la phase choisie) → SUMS[0], et les caractéristiques de structure demandées par `mask` (bit f) →
// out[f] = Blancs − Noirs (Int32Array(NFEAT)). Une passe sur les 50 cases coûte ≈ 45 à 80 ns : on en limite le nombre.
// P : plateau ; si mask ≠ 0 il doit être « rembourré » (51 cases, la 51e vide : PAD). Un pion est le code 1 (blanc) ou 2 (noir),
// une dame 3 ou 4 ; la couleur est (code + 1) & 1. L'apprentissage (computeFeatures) appelle la MÊME fonction : une seule
// définition des caractéristiques pour l'évaluateur et pour l'ajustement.
function scanPad(P, mask, V, out, n) {
  let s = 0;
  if (mask === 0) {
    for (let i = 0; i < 50; i++) s += V[P[i] * 50 + i];
    SUMS[0] = s;
    return;
  }
  for (let k = 0; k < 2 * NFEAT; k++) ACC[k] = 0;
  WINGS[0] = 0; WINGS[1] = 0; WINGS[2] = 0; WINGS[3] = 0;
  CNT[1] = 0; CNT[2] = 0; CNT[3] = 0; CNT[4] = 0;
  let mainK0 = 0, mainK1 = 0;
  const mBlock = mask & ((1 << F_BLOCKED) | (1 << F_FREE) | (1 << F_PROMO));
  const mSup = mask & ((1 << F_SUP) | (1 << F_ISOL));
  const needMan = mBlock | mSup | (mask & ((1 << F_PAIR) | (1 << F_WING)));
  const needCnt = mask & ((1 << F_KVM) | (1 << F_FORT));
  for (let j = 0; j < n; j++) { // les n pièces (LIST rempli par listOccupied)
    const i = LIST[j];
    const c = P[i];
    s += V[c * 50 + i];
    if (needCnt !== 0) CNT[c]++;
    const col = (c + 1) & 1;
    const o = col * NFEAT;
    if (c <= 2) { // pion
      if (needMan === 0) continue;
      const k = col * 50 + i;
      const fl = FWD_L[k], fr = FWD_R[k];
      if (mBlock !== 0) {
        const free = NFWD[k] - (OCC[P[fl]] + OCC[P[fr]]); // case hors damier = case 50 = vide, mais non comptée dans NFWD
        ACC[o + F_BLOCKED] += free === 0 ? 1 : 0;
        ACC[o + F_FREE] += free;
        ACC[o + F_PROMO] += free > 0 ? PENULT[k] : 0;
      }
      if (mask & (1 << F_PAIR)) ACC[o + F_PAIR] += ISMAN[col * 5 + P[fl]] + ISMAN[col * 5 + P[fr]];
      if (mSup !== 0) {
        const oc = col * 5;
        const supported = OWN[oc + P[BACK_L[k]]] | OWN[oc + P[BACK_R[k]]];
        ACC[o + F_SUP] += supported;
        // isolé : ni soutenu, ni aucune pièce alliée sur les deux cases avant
        ACC[o + F_ISOL] += (supported | OWN[oc + P[fl]] | OWN[oc + P[fr]]) ^ 1;
      }
      if (mask & (1 << F_WING)) WINGS[col * 2 + WING_SIDE[i]]++;
    } else { // dame
      if (MAIN_DIAG[i] === 1) { if (col === 0) mainK0++; else mainK1++; }
      if (mask & (1 << F_KMOB)) {
        let m = 0;
        for (let d = 0; d < 4; d++) {
          let q = NB[d * 50 + i];
          while (q < 50 && P[q] === 0) { m++; q = NB[d * 50 + q]; }
        }
        ACC[o + F_KMOB] += m;
      }
    }
  }
  SUMS[0] = s;
  // Les caractéristiques non demandées valent 0 (certains compteurs partagés peuvent avoir été touchés au passage).
  for (let f = 0; f < NFEAT; f++) out[f] = (mask & (1 << f)) !== 0 ? ACC[f] - ACC[NFEAT + f] : 0;
  if (mask & (1 << F_WING)) out[F_WING] = Math.abs(WINGS[0] - WINGS[1]) - Math.abs(WINGS[2] - WINGS[3]);
  if (needCnt !== 0) {
    const nM0 = CNT[1], nM1 = CNT[2], nK0 = CNT[3], nK1 = CNT[4];
    if (mask & (1 << F_KVM)) out[F_KVM] = nK0 * nM1 - nK1 * nM0;
    if (mask & (1 << F_FORT)) {
      const w = nM0 === 0 && nK0 === 1 && mainK0 === 1 && nM1 + nK1 >= 2 && nM1 + nK1 <= 3 ? 1 : 0;
      const b = nM1 === 0 && nK1 === 1 && mainK1 === 1 && nM0 + nK0 >= 2 && nM0 + nK0 <= 3 ? 1 : 0;
      out[F_FORT] = w - b;
    }
  }
}

// Valeurs des caractéristiques d'un plateau fastboard (Int8Array(50)) : out[f] = Blancs − Noirs (Int32Array(NFEAT)).
// Utilisée par l'évaluateur ET par l'apprentissage (training/fit-struct.mjs) : une seule définition, donc aucun écart possible.
export function computeFeatures(board, out, mask = ALL_FEATURES_MASK) {
  PAD.set(board);
  PAD[50] = 0;
  out.fill(0);
  scanPad(PAD, mask, ZERO_V, out, listOccupied(PAD));
  return out;
}

function toTable(arr, label) {
  if (!Array.isArray(arr) && !ArrayBuffer.isView(arr)) throw new Error(`${label} : tableau attendu`);
  if (arr.length !== TABLE_SIZE) throw new Error(`${label} : ${TABLE_SIZE} valeurs attendues (reçu ${arr.length})`);
  const out = new Int32Array(TABLE_SIZE);
  for (let i = 0; i < TABLE_SIZE; i++) {
    const v = Number(arr[i]);
    if (!Number.isFinite(v) || Math.abs(v) > LIMIT) throw new Error(`${label}[${i}] invalide : ${arr[i]} (|valeur| ≤ ${LIMIT} : l'évaluation d'une position ne doit pas atteindre les scores de mat)`);
    out[i] = Math.round(v);
  }
  return out;
}

// Poids de caractéristiques d'une phase : { nom: nombre } → Int32Array(NFEAT) (valeurs arrondies, noms contrôlés).
function toFeatureWeights(obj, label) {
  const w = new Int32Array(NFEAT);
  if (obj === undefined || obj === null) return w;
  if (typeof obj !== 'object' || Array.isArray(obj)) throw new Error(`${label} : objet { nom: poids } attendu`);
  for (const [name, v] of Object.entries(obj)) {
    const f = FEATURE_INDEX[name];
    if (f === undefined) throw new Error(`${label} : caractéristique inconnue « ${name} » (connues : ${FEATURES.map((x) => x.name).join(', ')})`);
    const x = Number(v);
    if (!Number.isFinite(x) || Math.abs(x) > LIMIT) throw new Error(`${label}.${name} invalide : ${v}`);
    w[f] = Math.round(x);
  }
  return w;
}

// Forme canonique : [{ minPieces, man: Int32Array(50), king: Int32Array(50), feat: Int32Array(NFEAT) }, …] (valeurs arrondies).
export function normalizeTables(tables) {
  if (!tables || typeof tables !== 'object') throw new Error('tables : objet attendu');
  let raw;
  if (Array.isArray(tables.phases)) {
    if (tables.phases.length === 0) throw new Error('phases : au moins un jeu de tables');
    raw = tables.phases;
  } else {
    raw = [{ minPieces: 0, man: tables.man, king: tables.king, features: tables.features }];
  }
  const phases = raw.map((ph, k) => {
    const minPieces = ph.minPieces === undefined && raw.length === 1 ? 0 : ph.minPieces;
    if (!Number.isInteger(minPieces) || minPieces < 0) throw new Error(`phases[${k}].minPieces : entier ≥ 0 attendu`);
    return {
      minPieces, man: toTable(ph.man, `phases[${k}].man`), king: toTable(ph.king, `phases[${k}].king`),
      feat: toFeatureWeights(ph.features, `phases[${k}].features`),
    };
  });
  phases.forEach((ph, k) => {
    const bound = evalBound(ph);
    if (bound > MAX_EVAL_BOUND) {
      throw new Error(`phases[${k}] : l'évaluation pourrait atteindre ±${bound} (> ${MAX_EVAL_BOUND}, zone des scores de mat) : tables ou poids trop grands`);
    }
  });
  for (let k = 1; k < phases.length; k++) {
    if (phases[k].minPieces >= phases[k - 1].minPieces) throw new Error('phases : minPieces doit être strictement décroissant');
  }
  if (phases[phases.length - 1].minPieces !== 0) throw new Error('phases : la dernière phase doit avoir minPieces = 0');
  return phases;
}

// Borne de |éval| pour un jeu { man, king, feat? } : borne des tables (ci-dessous) + Σ |poids_f| × max_f pour les
// caractéristiques de structure (chacune est une différence de compteurs bornée par FEATURES[f].max).
// Borne EXACTE (plus petite valeur sûre, par construction) de |éval| pour un jeu de tables { man, king } : au plus
// 20 pièces par camp, une pièce blanche en i apporte max(pion[i], dame[i]) au mieux, une pièce noire en j apporte au
// mieux −min(pion[49 − j], dame[49 − j]) ; on prend les 20 meilleurs apports de chaque camp (sans exiger des cases
// distinctes, donc c'est une borne supérieure, atteinte quand les meilleures cases ne se recouvrent pas). Par symétrie
// miroir le minimum est l'opposé du maximum.
export function evalBound(ph) {
  const top20 = (a) => a.sort((x, y) => y - x).slice(0, 20).reduce((s, v) => s + v, 0);
  const white = [], black = [];
  for (let i = 0; i < TABLE_SIZE; i++) {
    white.push(Math.max(0, ph.man[i], ph.king[i]));
    black.push(Math.max(0, -ph.man[TABLE_SIZE - 1 - i], -ph.king[TABLE_SIZE - 1 - i]));
  }
  let bound = top20(white) + top20(black);
  if (ph.feat) for (let f = 0; f < NFEAT; f++) bound += Math.abs(ph.feat[f]) * FEATURES[f].max;
  return bound;
}

// Version « JSON » de la forme canonique (tableaux ordinaires), pour écrire des fichiers et calculer des empreintes.
export function tablesToPlain(tables) {
  const phases = normalizeTables(tables);
  // `features` n'apparaît que si au moins un poids est non nul (les fichiers « tables seules » restent inchangés).
  const featObj = (ph) => {
    const o = {};
    for (let f = 0; f < NFEAT; f++) if (ph.feat[f] !== 0) o[FEATURES[f].name] = ph.feat[f];
    return Object.keys(o).length ? o : undefined;
  };
  if (phases.length === 1) {
    const out = { man: Array.from(phases[0].man), king: Array.from(phases[0].king) };
    const fo = featObj(phases[0]);
    if (fo) out.features = fo;
    return out;
  }
  return {
    phases: phases.map((p) => {
      const out = { minPieces: p.minPieces, man: Array.from(p.man), king: Array.from(p.king) };
      const fo = featObj(p);
      if (fo) out.features = fo;
      return out;
    }),
  };
}

// Valeur d'une pièce selon son code fastboard (0 vide, 1 pion blanc, 2 pion noir, 3 dame blanche, 4 dame noire)
// et sa case : V[code * 50 + case]. Une pièce noire en i = l'opposé de la pièce blanche en 49 − i.
function pieceValueTable(ph) {
  const V = new Int32Array(5 * TABLE_SIZE);
  for (let i = 0; i < TABLE_SIZE; i++) {
    V[1 * TABLE_SIZE + i] = ph.man[i];
    V[2 * TABLE_SIZE + i] = -ph.man[49 - i];
    V[3 * TABLE_SIZE + i] = ph.king[i];
    V[4 * TABLE_SIZE + i] = -ph.king[49 - i];
  }
  return V; // les cases vides (code 0) valent 0
}

// Retourne evalWhite(board) : centipions entiers, point de vue des Blancs, `board` = Int8Array(50) fastboard.
// Même contrat que createEvaluator() de eval.js : s'injecte dans search.js via l'option `evaluator`.
export function createTableEvaluator(tables) {
  const phases = normalizeTables(tables);
  const tabs = phases.map(pieceValueTable);

  // Caractéristiques de structure : seules celles dont le poids est non nul dans AU MOINS une phase sont calculées.
  let mask = 0;
  for (const ph of phases) for (let f = 0; f < NFEAT; f++) if (ph.feat[f] !== 0) mask |= 1 << f;

  if (tabs.length === 1 && mask === 0) {
    const V = tabs[0];
    return function evalWhite(board) {
      let s = 0;
      for (let i = 0; i < 50; i++) s += V[board[i] * 50 + i];
      return s;
    };
  }

  // Plusieurs phases et/ou caractéristiques : on compte les pièces (passe très légère) pour choisir la phase, puis UNE passe
  // fusionnée (scanPad) donne la somme de la table de cette phase et les caractéristiques demandées.
  const phaseOfCount = new Uint8Array(51);
  for (let n = 0; n <= 50; n++) {
    let k = 0;
    while (phases[k].minPieces > n) k++; // la dernière phase (minPieces = 0) arrête toujours la boucle
    phaseOfCount[n] = k;
  }
  const W = phases.map((ph) => ph.feat);
  const active = [];
  for (let f = 0; f < NFEAT; f++) if (mask & (1 << f)) active.push(f);
  const out = new Int32Array(NFEAT);

  return function evalWhite(board) {
    let P = board;
    if (mask !== 0) { PAD.set(board); P = PAD; } // les caractéristiques lisent la case 50 (toujours vide)
    if (mask === 0) {
      let n = 0;
      for (let i = 0; i < 50; i++) n += OCC[P[i]];
      scanPad(P, 0, tabs[phaseOfCount[n]], out, n);
      return SUMS[0];
    }
    const n = listOccupied(P);
    const ph = phaseOfCount[n];
    scanPad(P, mask, tabs[ph], out, n);
    let s = SUMS[0];
    if (mask !== 0) { const w = W[ph]; for (let a = 0; a < active.length; a++) { const f = active[a]; s += w[f] * out[f]; } }
    return s;
  };
}

// Tables équivalentes à l'évaluation V0 (ou à tout évaluateur ADDITIF par case) : on évalue une pièce seule
// sur chaque case. Sert de point de départ de l'apprentissage et de preuve que V0 est bien une somme de tables
// (tests/eval-learned.mjs compare les deux sur des milliers de positions).
export function v0Tables(weights = EVAL_WEIGHTS) {
  const ev = createEvaluator(weights);
  const man = [], king = [];
  for (let i = 0; i < TABLE_SIZE; i++) {
    const b = new Int8Array(50);
    b[i] = 1; man.push(ev(b));   // pion blanc seul en i
    b[i] = 3; king.push(ev(b));  // dame blanche seule en i
  }
  return { man, king };
}
