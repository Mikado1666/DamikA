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

import { createEvaluator, EVAL_WEIGHTS } from './eval.js';

export const TABLE_SIZE = 50;
// Garde-fou : la recherche réserve les scores au-delà de ±29 900 aux mats (MATE = 30 000) et range les scores de
// sa table de transposition sur 16 bits : une évaluation ne doit jamais s'en approcher. On exige donc que la borne
// EXACTE de |éval| (voir evalBound) reste ≤ 29 000, ce que les tables apprises respectent largement (≈ 6 000 à 19 000).
export const MAX_EVAL_BOUND = 29000;
const LIMIT = 1e6; // simple contrôle de bon sens avant le calcul de la borne (une valeur de 10 000 pions est une erreur)

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

// Forme canonique : [{ minPieces, man: Int32Array(50), king: Int32Array(50) }, …] (valeurs arrondies).
export function normalizeTables(tables) {
  if (!tables || typeof tables !== 'object') throw new Error('tables : objet attendu');
  let raw;
  if (Array.isArray(tables.phases)) {
    if (tables.phases.length === 0) throw new Error('phases : au moins un jeu de tables');
    raw = tables.phases;
  } else {
    raw = [{ minPieces: 0, man: tables.man, king: tables.king }];
  }
  const phases = raw.map((ph, k) => {
    const minPieces = ph.minPieces === undefined && raw.length === 1 ? 0 : ph.minPieces;
    if (!Number.isInteger(minPieces) || minPieces < 0) throw new Error(`phases[${k}].minPieces : entier ≥ 0 attendu`);
    return { minPieces, man: toTable(ph.man, `phases[${k}].man`), king: toTable(ph.king, `phases[${k}].king`) };
  });
  phases.forEach((ph, k) => {
    const bound = evalBound(ph);
    if (bound > MAX_EVAL_BOUND) {
      throw new Error(`phases[${k}] : l'évaluation pourrait atteindre ±${bound} (> ${MAX_EVAL_BOUND}, zone des scores de mat) : tables trop grandes`);
    }
  });
  for (let k = 1; k < phases.length; k++) {
    if (phases[k].minPieces >= phases[k - 1].minPieces) throw new Error('phases : minPieces doit être strictement décroissant');
  }
  if (phases[phases.length - 1].minPieces !== 0) throw new Error('phases : la dernière phase doit avoir minPieces = 0');
  return phases;
}

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
  return top20(white) + top20(black);
}

// Version « JSON » de la forme canonique (tableaux ordinaires), pour écrire des fichiers et calculer des empreintes.
export function tablesToPlain(tables) {
  const phases = normalizeTables(tables);
  if (phases.length === 1) return { man: Array.from(phases[0].man), king: Array.from(phases[0].king) };
  return { phases: phases.map((p) => ({ minPieces: p.minPieces, man: Array.from(p.man), king: Array.from(p.king) })) };
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

  if (tabs.length === 1) {
    const V = tabs[0];
    return function evalWhite(board) {
      let s = 0;
      for (let i = 0; i < 50; i++) s += V[board[i] * 50 + i];
      return s;
    };
  }

  // Plusieurs phases : on compte les pièces, on choisit le jeu de tables, puis on somme.
  const phaseOfCount = new Uint8Array(51);
  for (let n = 0; n <= 50; n++) {
    let k = 0;
    while (phases[k].minPieces > n) k++; // la dernière phase (minPieces = 0) arrête toujours la boucle
    phaseOfCount[n] = k;
  }
  return function evalWhite(board) {
    let n = 0;
    for (let i = 0; i < 50; i++) if (board[i] !== 0) n++;
    const V = tabs[phaseOfCount[n]];
    let s = 0;
    for (let i = 0; i < 50; i++) s += V[board[i] * 50 + i];
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
