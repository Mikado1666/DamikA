// DAMIKA — Étape 3.2 : apprentissage des tables d'évaluation (V1 / V1b), bibliothèque de fonctions.
// Node pur, aucune dépendance. La ligne de commande est training/fit.mjs ; tests/fit.mjs vérifie ces fonctions.
//
// MODÈLE. L'évaluation est LINÉAIRE en 100 paramètres θ (table des pions, table des dames) :
//     eval(position) = Σ_k  x_k · θ_k        avec x_k ∈ {−1, 0, +1}
// où x_k = [pièce blanche en i] − [pièce noire en 49 − i] pour la case i de la table concernée (la symétrie
// miroir exacte est donc contenue dans les caractéristiques : un seul jeu de paramètres pour les deux camps).
// Probabilité prédite que les Blancs « gagnent » (résultat attendu, nulle = 0,5) :  p = σ(eval / K),
// σ(z) = 1/(1+e^−z). Perte = entropie croisée avec une cible t ∈ [0 ; 1] :  CE = −t·ln p − (1−t)·ln(1−p).
// Comme p est une fonction logistique d'une quantité linéaire en θ, la perte est CONVEXE en θ : un seul minimum,
// que la méthode de Newton (IRLS) atteint en quelques itérations, sans hasard (reproductible à l'identique).
//
// CIBLE.  t = λ·résultat + (1 − λ)·σ(score de recherche / K_t)
//   - résultat : 1 / 0,5 / 0 du point de vue des Blancs (partie entière, même valeur pour toutes ses positions) ;
//   - score de recherche : centipions, profondeur 8, de l'auto-jeu ; K_t = température qui rend le score de
//     recherche le mieux calibré sur les RÉSULTATS (K_t = argmin de la perte « résultat contre σ(score/K) »).
// MODÈLE. K_m = température du modèle = celle qui minimise la perte de V0 sur la validation (« meilleur K de V0 ») ;
// elle est FIGÉE pour le modèle appris : sans cela, multiplier toutes les tables par c et K par c donnerait la même
// perte (échelle non identifiable) et les valeurs apprises perdraient leur sens en centipions.
//
// RÉGULARISATION. Objectif = perte moyenne + α · Σ_k ((θ_k − θ⁰_k) / S)², avec θ⁰ = tables de V0 et S = 100 (un pion) :
// on tire vers V0 les cases rarement vues (les caractéristiques jamais vues, par exemple un pion sur sa rangée de
// promotion, restent exactement à V0). α est choisi sur la VALIDATION.
//
// VALIDATION. 15 % des PARTIES (jamais des positions isolées : les positions d'une partie sont très corrélées),
// tirées par une fonction de hachage de (graine, numéro de partie) : indépendant de l'ordre du fichier.

import crypto from 'node:crypto';
import { createEvaluator } from '../js/ai/eval.js';
import { v0Tables } from '../js/ai/eval-learned.js';

export const NPARAM = 100; // 0..49 table des pions, 50..99 table des dames
export const MAX_ABS_SCORE = 29000; // au-delà : mat (exclu)
const CODE = { '.': 0, w: 1, b: 2, W: 3, B: 4 };

// --- Petits outils numériques -------------------------------------------------------------------------------------------
const sigmoid = (z) => 1 / (1 + Math.exp(-z));
// softplus(z) = ln(1 + e^z), stable pour |z| grand.
const softplus = (z) => (z > 0 ? z + Math.log1p(Math.exp(-z)) : Math.log1p(Math.exp(z)));
// Entropie croisée avec cible t quand z = eval/K :  −t ln σ(z) − (1−t) ln(1−σ(z)) = softplus(z) − t·z.
const ce = (z, t) => softplus(z) - t * z;
// Entropie de la cible (plancher de la perte) : H(t).
const entropy = (t) => (t <= 0 || t >= 1 ? 0 : -t * Math.log(t) - (1 - t) * Math.log(1 - t));

export function splitIsValidation(seed, gameId, valFraction) {
  const h = crypto.createHash('sha1').update(`${seed}:val:${gameId}`).digest();
  return h.readUInt32LE(0) / 4294967296 < valFraction;
}

// --- Jeu de données ------------------------------------------------------------------------------------------------------------
// Lit des lignes JSONL d'auto-jeu (arena.mjs selfplay) et ne garde que les positions CALMES, HORS OUVERTURE
// (déjà absentes de `p`), sans mat : r[6] = 0 (pas de prise disponible) et |score| < 29 000.
// `lines` : itérable (éventuellement asynchrone) de lignes de texte, OU d'objets { line, src } quand les parties viennent de
// plusieurs auto-jeux (src = numéro de la source : 0, 1, …). Les numéros de parties de deux sources peuvent coïncider : la
// clé de partie (séparation apprentissage / validation) devient « src:numéro » pour src > 0 (inchangée pour la source 0).
export async function loadDataset(lines, { valFraction = 0.15, seed = 1, maxAbsScore = MAX_ABS_SCORE } = {}) {
  // Tableaux extensibles (doublement) : on ne sait pas à l'avance combien de positions seront gardées.
  let cap = 1 << 20, n = 0;
  let boards = new Uint8Array(cap * 50);
  let res = new Float32Array(cap), score = new Float32Array(cap), gameOf = new Int32Array(cap), pieces = new Uint8Array(cap);
  let plyOf = new Int16Array(cap);
  const grow = () => {
    cap *= 2;
    const nb = new Uint8Array(cap * 50); nb.set(boards); boards = nb;
    const f = (a, T) => { const x = new T(cap); x.set(a); return x; };
    res = f(res, Float32Array); score = f(score, Float32Array); gameOf = f(gameOf, Int32Array);
    pieces = f(pieces, Uint8Array); plyOf = f(plyOf, Int16Array);
  };
  const gameIds = [], gameIsVal = [];
  let positionsSeen = 0, droppedCapture = 0, droppedMate = 0;
  for await (const item of lines) {
    const line = typeof item === 'string' ? item : item.line;
    const src = typeof item === 'string' ? 0 : item.src;
    if (!line.trim()) continue;
    const g = JSON.parse(line);
    if (!g.p) continue;
    const gi = gameIds.length;
    const key = src === 0 ? g.game : `${src}:${g.game}`;
    gameIds.push(key);
    gameIsVal.push(splitIsValidation(seed, key, valFraction));
    const r = g.result === '1-0' ? 1 : g.result === '0-1' ? 0 : 0.5;
    for (const row of g.p) {
      positionsSeen++;
      if (row[6] === 1) { droppedCapture++; continue; }
      if (Math.abs(row[4]) >= maxAbsScore) { droppedMate++; continue; }
      if (n === cap) grow();
      const s = row[0];
      let np = 0;
      for (let i = 0; i < 50; i++) { const c = CODE[s[i]]; boards[n * 50 + i] = c; if (c !== 0) np++; }
      res[n] = r; score[n] = row[4]; gameOf[n] = gi; pieces[n] = np; plyOf[n] = row[2];
      n++;
    }
  }
  const D = {
    n, games: gameIds.length, boards: boards.subarray(0, n * 50), res: res.subarray(0, n), score: score.subarray(0, n),
    gameOf: gameOf.subarray(0, n), pieces: pieces.subarray(0, n), ply: plyOf.subarray(0, n), gameIds, gameIsVal,
    positionsSeen, droppedCapture, droppedMate, seed, valFraction,
  };
  buildFeatures(D);
  D.isVal = new Uint8Array(n);
  D.valIdx = []; D.trainIdx = [];
  for (let i = 0; i < n; i++) { if (gameIsVal[gameOf[i]]) { D.isVal[i] = 1; D.valIdx.push(i); } else D.trainIdx.push(i); }
  D.valIdx = Int32Array.from(D.valIdx); D.trainIdx = Int32Array.from(D.trainIdx);
  D.weight = new Float64Array(n).fill(1); // poids des positions (1 par défaut ; voir setGameWeights)
  return D;
}

// Caractéristiques éparses : feat[off[i] .. off[i+1]) = indices k signés (+(k+1) ou −(k+1)).
function buildFeatures(D) {
  const { n, boards } = D;
  const acc = new Int8Array(NPARAM);
  const off = new Int32Array(n + 1);
  let cap = n * 24, m = 0;
  let feat = new Int16Array(cap);
  for (let p = 0; p < n; p++) {
    const b = p * 50;
    for (let i = 0; i < 50; i++) {
      switch (boards[b + i]) {
        case 1: acc[i]++; break;            // pion blanc en i       : + table des pions[i]
        case 2: acc[49 - i]--; break;       // pion noir en i        : − table des pions[49 − i]
        case 3: acc[50 + i]++; break;       // dame blanche en i
        case 4: acc[50 + 49 - i]--; break;  // dame noire en i
        default: break;
      }
    }
    off[p] = m;
    if (m + NPARAM > cap) { cap *= 2; const nf = new Int16Array(cap); nf.set(feat); feat = nf; }
    for (let k = 0; k < NPARAM; k++) {
      const v = acc[k];
      if (v !== 0) { feat[m++] = v > 0 ? k + 1 : -(k + 1); acc[k] = 0; } // |v| ≤ 1 : un seul pion blanc en i, un seul noir en 49 − i
    }
  }
  off[n] = m;
  D.feat = feat.subarray(0, m);
  D.off = off;
}

// Poids par partie : chaque partie compte pour 1/longueur^power (power 0 = toutes les positions comptent pareil ;
// 1 = chaque partie pèse pareil), normalisés pour que le poids moyen vaille 1 sur l'ensemble d'apprentissage.
export function setGameWeights(D, power) {
  const len = new Float64Array(D.games);
  for (let i = 0; i < D.n; i++) len[D.gameOf[i]]++;
  let sum = 0, cnt = 0;
  for (const i of D.trainIdx) { sum += 1 / Math.pow(len[D.gameOf[i]], power); cnt++; }
  const norm = cnt / sum;
  for (let i = 0; i < D.n; i++) D.weight[i] = power === 0 ? 1 : norm / Math.pow(len[D.gameOf[i]], power);
}

export function v0Theta() {
  const t = v0Tables();
  return Float64Array.from([...t.man, ...t.king]);
}

// Évaluation (centipions, point de vue des Blancs) de toutes les positions pour les paramètres θ.
export function evalAll(D, theta, out = new Float64Array(D.n)) {
  const { off, feat } = D;
  for (let p = 0; p < D.n; p++) {
    let e = 0;
    for (let a = off[p]; a < off[p + 1]; a++) { const f = feat[a]; e += f > 0 ? theta[f - 1] : -theta[-f - 1]; }
    out[p] = e;
  }
  return out;
}

// Vérifie sur un échantillon que les caractéristiques éparses redonnent exactement V0 (preuve d'additivité).
export function checkV0Identity(D, sample = 20000) {
  const ev = createEvaluator();
  const e0 = evalAll(D, v0Theta());
  const step = Math.max(1, Math.floor(D.n / sample));
  let bad = 0, checked = 0;
  const board = new Int8Array(50);
  for (let p = 0; p < D.n; p += step) {
    for (let i = 0; i < 50; i++) board[i] = D.boards[p * 50 + i];
    if (ev(board) !== e0[p]) bad++;
    checked++;
  }
  return { checked, bad };
}

// --- Cibles et pertes ----------------------------------------------------------------------------------------------------------
export function makeTargets(D, lambda, Kt) {
  const t = new Float64Array(D.n);
  for (let i = 0; i < D.n; i++) t[i] = lambda * D.res[i] + (1 - lambda) * sigmoid(D.score[i] / Kt);
  return t;
}

// Perte moyenne (pondérée) de `e` (évaluations, centipions) contre les cibles t, sur les positions idx, température K.
export function meanLoss(D, e, t, K, idx) {
  let s = 0, w = 0;
  for (let q = 0; q < idx.length; q++) {
    const i = idx[q];
    s += D.weight[i] * ce(e[i] / K, t[i]);
    w += D.weight[i];
  }
  return s / w;
}
export function meanEntropy(D, t, idx) {
  let s = 0, w = 0;
  for (let q = 0; q < idx.length; q++) { const i = idx[q]; s += D.weight[i] * entropy(t[i]); w += D.weight[i]; }
  return s / w;
}

// Minimum d'une fonction f(K) sur [lo, hi] : balayage logarithmique grossier puis section dorée autour du meilleur.
export function minimizeK(f, lo = 20, hi = 5000, grid = 40) {
  let bestI = 0, bestV = Infinity;
  const ks = [];
  for (let i = 0; i < grid; i++) {
    const k = lo * Math.pow(hi / lo, i / (grid - 1));
    ks.push(k);
    const v = f(k);
    if (v < bestV) { bestV = v; bestI = i; }
  }
  let a = Math.log(ks[Math.max(0, bestI - 1)]), b = Math.log(ks[Math.min(grid - 1, bestI + 1)]);
  const gr = (Math.sqrt(5) - 1) / 2;
  let c = b - gr * (b - a), d = a + gr * (b - a), fc = f(Math.exp(c)), fd = f(Math.exp(d));
  for (let it = 0; it < 40; it++) {
    if (fc < fd) { b = d; d = c; fd = fc; c = b - gr * (b - a); fc = f(Math.exp(c)); }
    else { a = c; c = d; fc = fd; d = a + gr * (b - a); fd = f(Math.exp(d)); }
  }
  const k = Math.exp((a + b) / 2);
  return { K: k, loss: f(k) };
}

// --- Méthode de Newton (IRLS) pour un sous-ensemble de positions ----------------------------------------------------
// Minimise  (1/W)·Σ w_i·CE(σ(e_i/K), t_i)  +  α·Σ ((θ_k − θ⁰_k)/S)²  sur les positions idx (apprentissage).
// θ⁰ = point d'attache de la régularisation (V0). Retourne { theta, objective, iterations, converged }.
export function fitNewton(D, t, idx, { theta0, K, alpha, S = 100, init = null, maxIter = 40, tol = 1e-10 }) {
  const P = NPARAM;
  const { off, feat, weight } = D;
  const theta = Float64Array.from(init || theta0);
  const penW = 2 * alpha / (S * S); // coefficient du terme quadratique dans le gradient / la hessienne
  let W = 0;
  for (let q = 0; q < idx.length; q++) W += weight[idx[q]];

  const objective = (th) => {
    let s = 0;
    for (let q = 0; q < idx.length; q++) {
      const p = idx[q];
      let e = 0;
      for (let a = off[p]; a < off[p + 1]; a++) { const f = feat[a]; e += f > 0 ? th[f - 1] : -th[-f - 1]; }
      s += weight[p] * ce(e / K, t[p]);
    }
    let r = 0;
    for (let k = 0; k < P; k++) { const d = (th[k] - theta0[k]) / S; r += d * d; }
    return s / W + alpha * r;
  };

  const g = new Float64Array(P);
  const H = new Float64Array(P * P);
  const delta = new Float64Array(P);
  const trial = new Float64Array(P);
  let fcur = objective(theta);
  let iterations = 0, converged = false;
  const K2 = K * K;

  for (let it = 0; it < maxIter; it++) {
    g.fill(0); H.fill(0);
    for (let q = 0; q < idx.length; q++) {
      const p = idx[q];
      const a0 = off[p], a1 = off[p + 1];
      let e = 0;
      for (let a = a0; a < a1; a++) { const f = feat[a]; e += f > 0 ? theta[f - 1] : -theta[-f - 1]; }
      const pr = sigmoid(e / K);
      const r = (pr - t[p]) * weight[p] / K;          // dCE/de
      const h = pr * (1 - pr) * weight[p] / K2;        // d²CE/de²
      for (let a = a0; a < a1; a++) {
        const fa = feat[a], ka = (fa > 0 ? fa : -fa) - 1, sa = fa > 0 ? 1 : -1;
        g[ka] += r * sa;
        const row = ka * P, hs = h * sa;
        for (let b = a; b < a1; b++) { // triangle supérieur (les indices sont croissants dans une position)
          const fb = feat[b];
          H[row + ((fb > 0 ? fb : -fb) - 1)] += fb > 0 ? hs : -hs;
        }
      }
    }
    for (let k = 0; k < P; k++) {
      g[k] = g[k] / W + penW * (theta[k] - theta0[k]);
      for (let l = k; l < P; l++) H[k * P + l] /= W;
      H[k * P + k] += penW + 1e-12;
    }
    // Résolution de H·δ = −g (Cholesky sur le triangle supérieur).
    solveSPD(H, g, delta, P);
    // Recherche linéaire (Armijo) : la perte étant convexe, le pas complet est presque toujours accepté.
    let step = 1, accepted = false, gd = 0;
    for (let k = 0; k < P; k++) gd += g[k] * delta[k];
    for (let ls = 0; ls < 30; ls++) {
      for (let k = 0; k < P; k++) trial[k] = theta[k] + step * delta[k];
      const fn = objective(trial);
      if (fn <= fcur + 1e-4 * step * gd) { theta.set(trial); const dec = fcur - fn; fcur = fn; accepted = true; iterations = it + 1; if (dec < tol) converged = true; break; }
      step /= 2;
    }
    if (!accepted || converged) { converged = converged || !accepted; break; }
  }
  return { theta, objective: fcur, iterations, converged };
}

// Résout A x = −g pour A symétrique définie positive (triangle supérieur de A rempli, row-major P×P) ; x → `out`.
function solveSPD(A, g, out, P) {
  // A = Uᵀ·U (Cholesky), U triangulaire supérieure stockée dans une copie.
  const U = new Float64Array(P * P);
  for (let i = 0; i < P; i++) {
    for (let j = i; j < P; j++) {
      let s = A[i * P + j];
      for (let k = 0; k < i; k++) s -= U[k * P + i] * U[k * P + j];
      if (i === j) {
        if (s <= 0) s = 1e-12; // garde-fou numérique (ne devrait pas arriver : le terme de régularisation est > 0)
        U[i * P + i] = Math.sqrt(s);
      } else U[i * P + j] = s / U[i * P + i];
    }
  }
  // Uᵀ·y = −g
  const y = new Float64Array(P);
  for (let i = 0; i < P; i++) {
    let s = -g[i];
    for (let k = 0; k < i; k++) s -= U[k * P + i] * y[k];
    y[i] = s / U[i * P + i];
  }
  // U·x = y
  for (let i = P - 1; i >= 0; i--) {
    let s = y[i];
    for (let k = i + 1; k < P; k++) s -= U[i * P + k] * out[k];
    out[i] = s / U[i * P + i];
  }
}

// --- Tables, grilles, contrôles de bon sens -----------------------------------------------------------------------
export const thetaToTables = (theta) => ({ man: Array.from(theta.slice(0, 50), Math.round), king: Array.from(theta.slice(50), Math.round) });
export const tablesToTheta = (t) => Float64Array.from([...t.man, ...t.king]);

// Case i (0..49) → (rangée, colonne) sur le damier 10×10 (rangée 0 = en haut = promotion des Blancs).
export const rowOf = (i) => Math.floor(i / 5);
export const colOf = (i) => 2 * (i % 5) + (rowOf(i) % 2 === 0 ? 1 : 0);

// Grille 10×10 (texte) d'une table de 50 valeurs ; les cases claires (jamais jouées) sont des points.
export function formatGrid(table, { width = 5, ref = null } = {}) {
  const lines = [];
  for (let r = 0; r < 10; r++) {
    let line = '';
    for (let c = 0; c < 10; c++) {
      if ((r + c) % 2 === 0) { line += '·'.padStart(width); continue; }
      const i = r * 5 + (c - (r % 2 === 0 ? 1 : 0)) / 2;
      const v = ref ? table[i] - ref[i] : table[i];
      line += (ref && v > 0 ? '+' + v : String(v)).padStart(width);
    }
    lines.push(line);
  }
  return lines.join('\n');
}

// Résumés de bon sens d'un jeu de tables (point de vue des Blancs : la rangée 9 est la rangée de départ).
export function sanityReport(tables) {
  const adv = (i) => 9 - rowOf(i); // rangées parcourues par un pion blanc
  const manByAdv = Array.from({ length: 10 }, () => []);
  for (let i = 0; i < 50; i++) manByAdv[adv(i)].push(tables.man[i]);
  const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN);
  const dist = (i) => Math.max(Math.abs(rowOf(i) - 4.5), Math.abs(colOf(i) - 4.5));
  const ring = (lo, hi) => { const v = []; for (let i = 0; i < 50; i++) if (dist(i) > lo && dist(i) <= hi) v.push(tables.king[i]); return avg(v); };
  const edge = []; for (let i = 0; i < 50; i++) if (colOf(i) === 0 || colOf(i) === 9 || rowOf(i) === 0 || rowOf(i) === 9) edge.push(tables.king[i]);
  return {
    manByAdvance: manByAdv.map(avg),                         // moyenne de la table des pions par rangée parcourue (0 → 9)
    manMonotone: manByAdv.slice(1, 9).every((v, k, arr) => k === 0 || avg(v) >= avg(arr[k - 1]) - 1e-9),
    kingCore: ring(-1, 1.5), kingRing: ring(1.5, 2.5), kingOuter: ring(2.5, 99), kingEdge: avg(edge),
  };
}
