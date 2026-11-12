// DAMIKA — Formules du « Film de la partie » (P29, partagées en P31) : fonctions PURES, sans DOM, sans Worker, sans fs,
// utilisables par Node (training/scan-arena/p29-report.mjs, tests/film-metrics.mjs) ET par le navigateur (js/film.js).
// UNE seule définition : ne jamais recopier ces formules ailleurs.
//
// Entrées : pour chaque position, 14 scores de Scan (profondeurs 1 à 14, en PIONS, point de vue des BLANCS, scores de
// tables ou de mat plafonnés à ±15). La valeur d'une position V est la moyenne des profondeurs 11 à 14.
// Perte d'un coup L = V avant − V après, du point de vue du camp qui joue (en pions). Mode d'emploi des constantes :
// docs/SESSION_DERNIERE.md, sections P28 / P29 / P31.

export const METRICS_VERSION = 1;   // à incrémenter si une formule OU la façon de mesurer (profondeurs, plafond…) change : invalide le cache local

// ---- mesure ----
export const DEPTH_REF = 14;        // profondeur de la recherche (une seule recherche par position, on lit les itérations)
export const DEPTH_FROM = 11;       // V = moyenne des profondeurs DEPTH_FROM à DEPTH_REF
export const CAP = 15;              // plafond (en pions) des scores de tables de finale (|score Hub| ≥ 80) et de mat
export const MIN_PIECES = 7;        // pas d'analyse avec 6 pièces ou moins au total (« finale ≤ 6 pièces »)
export const MIN_PLIES = 10;        // moins de 10 demi-coups : rien à analyser

// ---- formules (P29) ----
export const FLOOR = 0.30;          // plancher d affichage : sous 0,3 pion on parle d érosion, pas de faute (p95 du bruit en position calme : 0,03 à 0,07 ; palier « mini » de la jauge : > 0,2). Sans ce plancher (0,10) le nombre de fautes MONTE (A 20 → 26, B 237 → 377).
export const K_V = 0.15;            // pente en |V| : p95 du bruit ≈ 0,15·|V| (0,19 à |V|≈0,7 ; 0,46 à 3 ; 0,73 à 5,5 ; 1,3 à 8,5 ; 2,2 à 12)
export const PHASE = (pieces) => (pieces < 10 ? 1.2 : pieces < 16 ? 0.45 : pieces < 22 ? 0.35 : pieces < 30 ? 0.2 : 0); // p95 par nombre de pièces
export const thresholdOf = (absVb, pieces) => Math.max(FLOOR, K_V * absVb, PHASE(pieces));
export const TIER_LIGHT = 2, TIER_MAJOR = 4; // L/seuil < 2 : légère ; 2 à 4 : faute ; ≥ 4 : majeure
export const WIN_ABS = 2.0, WIN_REL = 0.5;   // « largement gagnant » : avant ≥ 2,0 ET après ≥ max(2,0 ; 0,5 × avant)
export const KEEP = 0.6, LEVELS = [3, 5, 7, 9, 11]; // latence : fenêtre d = profondeurs (d, d+1), stable si les deux perdent ≥ KEEP × seuil
export const SAN_VISION = 5;                // latence ≤ 5 : « faute de calcul » ; au-delà : « piège profond »
export const TOP_N = 3;                     // nombre de plus grosses pertes listées par camp

// ---- affichage de la courbe d'évaluation (P41) : AUCUNE influence sur la mesure ni sur les seuils de faute ----
export const EVAL_SCALE = 1.5;              // échelle verticale douce : y = v / (|v| + EVAL_SCALE), entre −1 et +1 (petits écarts lisibles)
export const evalY = (v) => v / (Math.abs(v) + EVAL_SCALE);
export const EVAL_TICKS = [0.5, 1, 2];      // lignes graduées (± pions), paliers du barème de la jauge
export const EVAL_ZONE = 0.2;               // bande d'équilibre : −0,2 à +0,2
export const TURN_MARGIN = 0.5;             // tournant : l'évaluation reste, jusqu'à la fin, à plus de 0,5 pion du côté de l'adversaire
export const TURN_TIERS = ['faute', 'majeure']; // gravités qui peuvent être « le tournant »
export const PHASE_OPENING_MIN = 30, PHASE_MIDDLE_MIN = 20; // pièces sur le damier : ouverture ≥ 30, milieu de partie 20 à 29, finale < 20
export const phaseName = (pieces) => (pieces >= PHASE_OPENING_MIN ? 'ouverture' : pieces >= PHASE_MIDDLE_MIN ? 'milieu' : 'finale');

export const r2 = (x) => (x === null || x === undefined ? null : Math.round(x * 100) / 100);
const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;

// Score en pions déjà ramené au point de vue des Blancs ; plafonné à ±CAP quand il vient des tables ou d'un mat.
export const capPawns = (pawns, special) => (special ? Math.sign(pawns) * CAP : pawns);

// Valeur d'une position (moyenne des profondeurs DEPTH_FROM à DEPTH_REF) à partir de ses 14 scores.
export const positionValue = (scores) => mean(scores.slice(DEPTH_FROM - 1, DEPTH_REF));

// { profondeur: pions (vue des Blancs) } → 14 scores. Comme en P28 : une profondeur sans ligne `info` reprend la
// dernière valeur connue, les profondeurs initiales manquantes prennent la première disponible. null si Scan n'a rien dit.
export function scoresFromDepths(byDepth) {
  const sc = []; let last = null; let missing = 0;
  for (let d = 1; d <= DEPTH_REF; d++) {
    if (byDepth[d] !== undefined) last = byDepth[d]; else if (last !== null) missing++;
    sc.push(last);
  }
  const first = sc.find((x) => x !== null);
  if (first === undefined) return null;
  for (let d = 0; d < DEPTH_REF; d++) if (sc[d] === null) { sc[d] = first; missing++; }
  return { scores: sc, missing };
}

// Classement d'un coup. m = { side: 'w'|'b', pieces (position AVANT le coup), same (coup joué = meilleur coup de Scan),
// scoresBefore, scoresAfter (14 scores chacun, vue des Blancs) }.
// Retourne { moverBefore, moverAfter, L (arrondi), Lraw, thr, ratio, candidate, bruit, largementGagnant, signaled,
// [gravite, latence, type], scoresBefore, scoresAfter (vue du camp qui joue) }.
export function classifyMove(m) {
  const sg = m.side === 'w' ? 1 : -1; // vue du camp qui joue
  const b = m.scoresBefore, a = m.scoresAfter;
  const vb = sg * positionValue(b), va = sg * positionValue(a);
  const L = vb - va;
  const single = {}; for (let d = 3; d <= 12; d++) single[d] = sg * (b[d - 1] - a[d - 1]);
  const thr = thresholdOf(Math.abs(vb), m.pieces);
  const r = { moverBefore: r2(vb), moverAfter: r2(va), L: r2(L), Lraw: L, thr: r2(thr), ratio: r2(L / thr) };
  r.candidate = L >= thr && !m.same;
  r.bruit = L >= thr && m.same;
  r.largementGagnant = vb >= WIN_ABS && va >= Math.max(WIN_ABS, WIN_REL * vb);
  r.signaled = r.candidate && !r.largementGagnant;
  if (r.signaled) {
    r.gravite = L >= TIER_MAJOR * thr ? 'majeure' : L >= TIER_LIGHT * thr ? 'faute' : 'légère';
    // latence : fenêtre d = niveaux (d, d+1) ; stable si LES DEUX profondeurs perdent ≥ 0,6 × seuil ; latence = plus petit d dont toutes les fenêtres suivantes (jusqu'à 11) sont stables
    const stable = (d) => Math.min(single[d], single[d + 1]) >= KEEP * thr;
    let lat = null;
    for (let i = LEVELS.length - 1; i >= 0; i--) { if (stable(LEVELS[i])) lat = LEVELS[i]; else break; }
    r.latence = lat;
    r.type = lat === null ? 'instable' : lat <= SAN_VISION ? 'faute de calcul' : 'piège profond';
  }
  r.scoresBefore = b.map((x) => r2(sg * x));
  r.scoresAfter = a.map((x) => r2(sg * x));
  return r;
}

// Courbe d'érosion : cumul, par camp, des pertes qui ne sont PAS des fautes de gravité faute ou majeure (les légères
// restent dans l'érosion). `rows` : lignes de coups dans l'ordre (champs ply, side, L, signaled, gravite, skipped ; une ligne
// `pending` arrête la courbe). Retourne [[ply, cumBlancs, cumNoirs], …].
export function erosionCurve(rows) {
  const cum = { w: 0, b: 0 }; const courbe = [];
  for (const r of rows) {
    if (r.pending) break;
    if (!r.skipped && r.L > 0 && !(r.signaled && r.gravite !== 'légère')) cum[r.side] += r.L;
    courbe.push([r.ply, r2(cum.w), r2(cum.b)]);
  }
  return courbe;
}

// Les n plus grosses pertes d'un camp (perte > 0), de la plus grosse à la plus petite.
export function topLosses(rows, side, n = TOP_N) {
  return rows.filter((r) => !r.pending && !r.skipped && r.side === side && r.L > 0).sort((x, y) => y.L - x.L).slice(0, n)
    .map((r) => ({ ply: r.ply, no: r.moveNo, joue: r.played, meilleur: r.best, L: r.L, gravite: r.signaled ? r.gravite : (r.largementGagnant && r.candidate ? 'gagnant' : null), type: r.type ?? null }));
}

// Valeur de chaque position avant un coup (une par demi-coup), null si inconnue.
export function valueSeries(recs, plies) {
  const out = [];
  for (let k = 0; k < plies; k++) out.push(recs[k]?.scores ? r2(positionValue(recs[k].scores)) : null);
  return out;
}

// ---- P41 : phases et tournant (fonctions pures, affichage seulement) ----

// Phases d'une partie à partir du nombre de pièces de chaque position (tableau de n+1 entrées, null = inconnu).
// Retourne des segments { phase, from, to } sur les indices de position (to inclus) ; une position inconnue interrompt le segment.
export function phaseSegments(pieces) {
  const out = [];
  pieces.forEach((n, i) => {
    if (n === null || n === undefined) return;
    const ph = phaseName(n), last = out[out.length - 1];
    if (last && last.phase === ph && last.to === i - 1) last.to = i; else out.push({ phase: ph, from: i, to: i });
  });
  return out;
}

// Le tournant : la PREMIÈRE faute signalée de gravité « faute » ou « majeure » (rows de buildMoveRows) après laquelle
// l'évaluation reste, jusqu'à la fin de la partie, à plus de TURN_MARGIN pion du côté de l'adversaire. `evals` : valeur de
// chaque position (n+1), vue des Blancs, null si non analysée (ignorée). Aucune ligne en attente (`pending`) : analyse
// complète exigée, sinon null (un tournant calculé sur une partie à moitié mesurée serait faux). Aucune faute qui répond :
// null (pas de repère). Retourne la ligne de coup { ply, moveNo, side, played, gravite, L } ou null.
export function turningPoint(rows, evals) {
  if (rows.some((r) => r.pending)) return null;
  for (const r of rows) {
    if (!r.signaled || !TURN_TIERS.includes(r.gravite)) continue;
    let seen = 0, held = true;
    for (let q = r.ply + 1; q < evals.length; q++) {
      const v = evals[q];
      if (v === null || v === undefined) continue;
      seen++;
      if (!((r.side === 'w' ? -v : v) > TURN_MARGIN)) { held = false; break; }
    }
    if (held && seen > 0) return { ply: r.ply, moveNo: r.moveNo, side: r.side, played: r.played, gravite: r.gravite, L: r.L };
  }
  return null;
}

// ---- P42 : difficulté d'une faute (affichage seulement, à partir de la latence déjà calculée par classifyMove) ----
// La latence est comptée en interne en « coups de chaque camp » (3, 5, 7, 9, 11) ; pour le joueur on parle en COUPS À LUI :
// arrondi supérieur de la moitié (3 → 2, 5 → 3, 7 → 4, 9 → 5, 11 → 6).
export const latencyToMoves = (lat) => Math.ceil(lat / 2);
// { label, points (0 à 5 : 1 pour la latence la plus courte, 5 pour la plus longue, 0 si instable), moves, text } ou null
// si la faute n'a pas de type. `type` : 'faute de calcul' | 'piège profond' | 'instable' (valeurs de classifyMove).
export function difficultyOf(type, latence) {
  if (type === 'instable' || latence === null || latence === undefined) {
    if (type !== 'instable') return null;
    return { label: 'Difficile à juger', points: 0, moves: null, text: 'Même le moteur hésite sur ce coup : à regarder de près.' };
  }
  const moves = latencyToMoves(latence), points = LEVELS.indexOf(latence) + 1;
  if (type === 'faute de calcul') return { label: 'Bévue visible', points, moves, text: `La punition se voit en calculant ${moves} coups à l'avance : à ne pas rater.` };
  if (type === 'piège profond') return { label: 'Piège profond', points, moves, text: `Il fallait calculer ${moves} coups à l'avance : difficile à trouver devant le damier.` };
  return null;
}

// ---- P42B : verdict d'un coup ordinaire (ni faute signalée) affiché dans la carte du bas ----
export const GOOD_LOSS = 0.1; // perte (pions) sous laquelle un coup est « Bon coup » ; à partir de là (sans être une faute) : « Petite imprécision »
// m = { same (coup joué = meilleur coup de Scan), L (perte en pions, vue du camp qui joue ; négative = gain) }
export function moveVerdict(m) {
  if (m.same) return { kind: 'best', label: 'Meilleur coup' };
  if (m.L < GOOD_LOSS) return { kind: 'good', label: 'Bon coup' };
  return { kind: 'small', label: 'Petite imprécision' };
}
