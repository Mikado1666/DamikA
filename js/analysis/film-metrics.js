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
