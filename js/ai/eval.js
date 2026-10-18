// DAMIKA — Évaluation statique (V0) des positions de dames internationales 10x10.
//
// Unité : le centipion (100 = la valeur d'un pion). L'évaluation est calculée du point de vue des
// BLANCS (positif = les Blancs sont mieux) et ne dépend PAS du camp au trait : cela garantit la
// symétrie exacte  evalWhite(p) = -evalWhite(miroir(p)),  où le miroir est la rotation du plateau
// de 180° avec échange des couleurs (la case i devient 49 - i, sur les index 0..49 de fastboard).
// evalSideToMove() en donne la version « point de vue du camp au trait », celle dont la recherche
// (négamax) a besoin.
//
// Tous les poids sont dans EVAL_WEIGHTS ci-dessous, et seulement là : l'étage 3 (apprentissage)
// pourra les remplacer en passant un autre objet à createEvaluator().
//
// Ce que la V0 mesure : matériel, avancement des pions, centre, défense de la dernière rangée,
// tempo. Elle ne comprend PAS les structures (voir la liste des limites dans docs/SESSION_DERNIERE.md).

import { EMPTY, WM, BM, WK, BK, WHITE } from './fastboard.js';

export const EVAL_WEIGHTS = {
  // --- Matériel -------------------------------------------------------------------------
  // En dames internationales une dame vaut environ trois pions (elle est volante).
  man: 100,
  king: 300,

  // --- Avancement des pions -------------------------------------------------------------
  // Bonus selon le nombre de rangées parcourues depuis la rangée de départ du camp
  // (indice 0 = case de la dernière rangée de son camp, indice 8 = juste avant la promotion).
  // Non linéaire : un pion proche de la promotion vaut nettement plus que le même pion au milieu.
  advance: [0, 0, 2, 4, 6, 9, 13, 18, 26],

  // --- Tempo (théorie des temps) ----------------------------------------------------------
  // Points par rangée parcourue, pour chaque pion, de façon linéaire. C'est la même grandeur que
  // « avancement » (somme des rangées parcourues) mais avec son propre poids, réglable à part :
  // c'est ce qui sert de balancier dans les fins de partie fermées.
  tempo: 1,

  // --- Centre ---------------------------------------------------------------------------
  // Une case est « cœur » si elle est à moins de 1,5 case du centre du plateau, « couronne » si
  // elle est à moins de 2,5 cases. Pion et dame ont des bonus distincts.
  centerCoreMan: 5,
  centerRingMan: 2,
  centerCoreKing: 10,
  centerRingKing: 4,

  // --- Défense de la dernière rangée ------------------------------------------------------
  // Bonus par pion resté sur sa rangée de départ la plus reculée (la rangée où l'adversaire
  // promeut) : il empêche l'adversaire de former une dame facilement.
  backRank: 6,
};

// Géométrie (identique à fastboard.js : rangée r = floor(index / 5)).
const rowOf = (i) => (i / 5) | 0;
const colOf = (i) => {
  const r = rowOf(i);
  return 2 * (i % 5) + (r % 2 === 0 ? 1 : 0);
};

// Retourne evalWhite(board) : évaluation en centipions, point de vue des Blancs.
// `board` = Int8Array(50) au format fastboard (codes 0..4).
export function createEvaluator(weights = EVAL_WEIGHTS) {
  // Tables par case et par code de pièce, précalculées une fois pour toutes. Les valeurs sont
  // celles d'une pièce BLANCHE ; une pièce noire en i vaut ce que vaut une blanche en 49 - i
  // (c'est précisément ce qui rend l'évaluation symétrique).
  const manValue = new Int32Array(50);   // pion blanc sur la case i
  const kingValue = new Int32Array(50);  // dame blanche sur la case i
  for (let i = 0; i < 50; i++) {
    const adv = 9 - rowOf(i); // rangées parcourues par un pion blanc
    const d = Math.max(Math.abs(rowOf(i) - 4.5), Math.abs(colOf(i) - 4.5));
    const core = d <= 1.5, ring = !core && d <= 2.5;
    let v = weights.man + weights.tempo * adv;
    if (adv <= 8) v += weights.advance[adv];
    if (adv === 0) v += weights.backRank;
    if (core) v += weights.centerCoreMan; else if (ring) v += weights.centerRingMan;
    manValue[i] = v;
    let k = weights.king;
    if (core) k += weights.centerCoreKing; else if (ring) k += weights.centerRingKing;
    kingValue[i] = k;
  }

  return function evalWhite(board) {
    let score = 0;
    for (let i = 0; i < 50; i++) {
      const p = board[i];
      if (p === EMPTY) continue;
      switch (p) {
        case WM: score += manValue[i]; break;
        case BM: score -= manValue[49 - i]; break;
        case WK: score += kingValue[i]; break;
        case BK: score -= kingValue[49 - i]; break;
      }
    }
    return score;
  };
}

export const evalWhite = createEvaluator();

// Point de vue du camp au trait (side = 0 Blancs, 1 Noirs) : ce que lit le négamax.
export function evalSideToMove(board, side) {
  const s = evalWhite(board);
  return side === WHITE ? s : -s;
}

// Position miroir : rotation de 180° avec échange des couleurs (pour les tests de symétrie).
// Renvoie un nouveau tableau ; le camp au trait est échangé par l'appelant.
export function mirrorBoard(board) {
  const out = new Int8Array(50);
  for (let i = 0; i < 50; i++) {
    const p = board[i];
    if (p === EMPTY) continue;
    // 1 <-> 2 (pions), 3 <-> 4 (dames)
    out[49 - i] = p === WM ? BM : p === BM ? WM : p === WK ? BK : WK;
  }
  return out;
}
