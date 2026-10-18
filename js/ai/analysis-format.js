// DAMIKA — Mise en forme de l'analyse pour l'affichage (étage 2b). Fonctions PURES : aucun accès au
// DOM, au Worker ni à l'état de l'appli, pour pouvoir les tester sous Node (tests/analysis-format.mjs).
//
// Entrées : le résultat de js/ai/search.js (analyse / message 'analyse' du worker) :
//   { score, mate, bestMove, bestMoveNotation, pv, pvNotation, depth, … }
//   score : centipions, point de vue des BLANCS ; mate : null ou { winner: 'w'|'b', in: N }.

// Profondeur minimale avant d'afficher la flèche du meilleur coup et la ligne « Meilleur » : avant,
// le coup change à chaque itération et la flèche clignoterait. La barre et le score n'attendent pas.
export const MIN_DEPTH_FOR_MOVE = 4;

// ÉCHELLE de la sigmoïde de la jauge, en centipions : part de blanc = 1 / (1 + e^(-cp / BAR_SCALE_CP)).
// Une seule constante, réglable : plus elle est petite, plus la jauge réagit à un petit avantage.
// Avec 100 : ±0,5 pion ≈ 62 %, ±1 ≈ 73 %, ±2 ≈ 88 %, ±3 ≈ 95 % (on voit à peu près qui a le dessus
// dès ±0,5). L'ancienne valeur était 250 (±1 pion ≈ 60 %).
export const BAR_SCALE_CP = 100;

// Part de blanc dans la barre, de 0 (tout sombre) à 1 (tout blanc). Antisymétrique et EXACTE :
// barFraction(-r) === 1 - barFraction(r). Un mat forcé remplit la barre entièrement.
export function barFraction(result) {
  if (!result) return 0.5;
  if (result.mate) return result.mate.winner === 'w' ? 1 : 0;
  const s = result.score;
  if (!Number.isFinite(s)) return 0.5;
  if (s === 0) return 0.5;
  const f = 1 / (1 + Math.exp(-Math.abs(s) / BAR_SCALE_CP));
  return s > 0 ? f : 1 - f;
}

// Score en pions, du point de vue des Blancs : « +0,8 », « −1,3 », « 0,0 » (virgule française,
// vrai signe moins comme le compteur de temps de l'appli). Une valeur qui s'arrondit à 0,0 n'a pas de signe.
export function formatScore(scoreCp) {
  if (!Number.isFinite(scoreCp)) return '—';
  const tenths = Math.round(Math.abs(scoreCp) / 10); // dixièmes de pion
  const text = `${Math.floor(tenths / 10)},${tenths % 10}`;
  if (tenths === 0) return text;
  return (scoreCp > 0 ? '+' : '−') + text;
}

const SIDE_NAME = { w: 'Blancs', b: 'Noirs' };

// Mat forcé : « Mat en 3 — les Blancs gagnent ». in = 0 : le camp au trait n'a plus de coup, la
// partie est finie (« Partie terminée — les Noirs gagnent »).
export function formatMate(mate) {
  const who = `les ${SIDE_NAME[mate.winner]} gagnent`;
  if (mate.in === 0) return `Partie terminée — ${who}`;
  return `Mat en ${mate.in} — ${who}`;
}

// Texte principal de l'affichage : le score en pions, ou le mat.
export function formatHeadline(result) {
  if (!result) return '';
  return result.mate ? formatMate(result.mate) : formatScore(result.score);
}

// Mention discrète sous/à côté du score : « indicatif · prof. 9 ». Pas de profondeur pour une
// partie terminée (rien n'a été cherché).
export function formatMeta(result) {
  if (!result) return '';
  if (result.mate && result.mate.in === 0) return '';
  return `indicatif · prof. ${result.depth}`;
}

// Cases à relier par la flèche pour un coup au format de rules.js (rafle : liste d'étapes
// { from, to, capturedThisStep… } ; coup simple : { from, to }). Même forme que `lastMove.squares`
// de main.js : [départ, ...arrivées].
export function moveSquares(uiMove) {
  if (!uiMove) return null;
  if (Array.isArray(uiMove)) {
    if (uiMove.length === 0) return null;
    return [uiMove[0].from, ...uiMove.map((step) => step.to)];
  }
  return [uiMove.from, uiMove.to];
}

// Ligne principale compacte : { best: '32-28', rest: ['18-22', '27x18', …], truncated: bool }.
// maxMoves = nombre total de coups montrés (le meilleur coup compris).
export function formatLine(pvNotation, maxMoves = 5) {
  if (!pvNotation || pvNotation.length === 0) return null;
  return {
    best: pvNotation[0],
    rest: pvNotation.slice(1, maxMoves),
    truncated: pvNotation.length > maxMoves,
  };
}

// Paliers d'avantage (barème de Mickaël), en pions, sur la valeur de score AFFICHÉE (arrondie au
// dixième : texte et couleur ne se contredisent jamais) :
//   égal ≤ 0,2 · mini > 0,2 · petit ≥ 0,5 · naissant ≥ 0,7 · avantage ≥ 0,9 · bel ≥ 1,5 · gros > 2
// `fromTenths` = seuil en dixièmes de pion affichés (> 0,2 s'écrit donc 3, > 2 s'écrit 21) ; les
// paliers sont rangés du plus fort au plus faible. `light` = niveau de lumière de la jauge et de la
// plaque (0 = équilibre, or sans halo de camp ; 1 à 5 = du faible au très marqué) ; « petit » et
// « naissant » partagent le niveau 2 (0,5 et 0,7 sont trop proches pour se distinguer à l'œil).
export const ADVANTAGE_TIERS = [
  { name: 'gros', fromTenths: 21, light: 5 },
  { name: 'bel', fromTenths: 15, light: 4 },
  { name: 'avantage', fromTenths: 9, light: 3 },
  { name: 'naissant', fromTenths: 7, light: 2 },
  { name: 'petit', fromTenths: 5, light: 2 },
  { name: 'mini', fromTenths: 3, light: 1 },
  { name: 'egal', fromTenths: 0, light: 0 },
];

// Palier d'un résultat : { name, side: 'white' | 'black' | 'even', light }. Un mat est toujours à son
// vainqueur, au niveau de lumière maximal (son rendu est à part).
export function advantageTier(result) {
  if (!result) return { name: 'egal', side: 'even', light: 0 };
  if (result.mate) return { name: 'mat', side: result.mate.winner === 'w' ? 'white' : 'black', light: 5 };
  if (!Number.isFinite(result.score)) return { name: 'egal', side: 'even', light: 0 };
  const tenths = Math.round(Math.abs(result.score) / 10);
  const tier = ADVANTAGE_TIERS.find((t) => tenths >= t.fromTenths);
  if (tier.light === 0) return { name: tier.name, side: 'even', light: 0 };
  return { name: tier.name, side: result.score > 0 ? 'white' : 'black', light: tier.light };
}

// Camp qui a l'avantage : 'white', 'black' ou 'even' (≤ 0,2 pion affiché).
export function scoreSide(result) {
  return advantageTier(result).side;
}

// Gros changement de la jauge (déclenche l'impulsion lumineuse) : écart de part de blanc >= seuil.
// 0,20 avec l'échelle 100 ≈ 0,85 pion près de l'équilibre (0 → +1 ou −0,5 → +0,5 déclenchent ;
// +1 → +2 non). Il était de 0,12 avec l'échelle 250 : la jauge est plus pentue, il fallait le relever.
export const BIG_SWING = 0.20;
export function isBigSwing(prevFraction, nextFraction, threshold = BIG_SWING) {
  if (!Number.isFinite(prevFraction) || !Number.isFinite(nextFraction)) return false;
  return Math.abs(nextFraction - prevFraction) >= threshold;
}

// Repères de la jauge à 0, ±0,5, ±1, ±2 pions : [{ k, white }] (k en pions), `white` = part de blanc
// (0..1) à laquelle tombe ce score, calculée avec barFraction() donc exacte quelle que soit l'échelle.
export const TICK_PAWNS = [-2, -1, -0.5, 0, 0.5, 1, 2];
export function tickFractions() {
  return TICK_PAWNS.map((k) => ({ k, white: barFraction({ score: k * 100, mate: null }) }));
}

// Zone d'équilibre de la jauge (bande dorée centrale) : de la part de blanc d'un score juste en
// dessous du palier « mini » (−24 cp, qui s'affiche −0,2) à celle de +24 cp. Calculée avec
// barFraction() donc fidèle à l'échelle ; symétrique : low === 1 - high.
export function equalZoneFractions() {
  const mini = ADVANTAGE_TIERS.find((t) => t.name === 'mini');
  const edge = mini.fromTenths * 10 - 6; // 24 cp : dernier score affiché 0,2
  return { low: barFraction({ score: -edge, mate: null }), high: barFraction({ score: edge, mate: null }) };
}

// Faut-il montrer le meilleur coup (flèche + ligne) pour ce résultat ?
export function shouldShowMove(result) {
  return !!result && !!result.bestMove && !(result.mate && result.mate.in === 0) && result.depth >= MIN_DEPTH_FOR_MOVE;
}

// Empreinte d'une position (plateau + camp au trait) : sert à ne pas relancer une analyse pour une
// position déjà analysée (par exemple quand on ne fait que sélectionner une pièce).
export function positionKey(board, side) {
  let key = side === 'b' ? 'b' : 'w';
  for (let sq = 1; sq <= 50; sq++) {
    const p = board[sq];
    key += p ? (p.color === 'w' ? (p.king ? 'W' : 'w') : (p.king ? 'B' : 'b')) : '.';
  }
  return key;
}
