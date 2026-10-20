// DAMIKA — Étape 3.3 : apprentissage des tables ET de caractéristiques de STRUCTURE (V2). Node pur, aucune dépendance.
// S'appuie sur fit-lib.mjs (lecture des parties, pertes, calibration) et sur js/ai/eval-learned.js (les caractéristiques
// elles-mêmes : UNE seule définition, celle de l'évaluateur, donc aucun écart possible entre ce qu'on apprend et ce qu'on joue).
//
// MODÈLE (même méthode qu'à l'étape 3.2) :  éval = Σ_cases tables(phase)  +  Σ_f  poids_f(phase) × x_f
// où x_f = f(Blancs) − f(Noirs) est le compteur de structure f (valeurs entières, parfois grandes : jusqu'à ± 400).
// Les 3 phases (≥ 30, 15–29, < 15 pièces) sont celles de V1b. Chaque caractéristique reçoit SOIT un poids GLOBAL (le même
// dans les 3 phases : 1 paramètre), SOIT un poids PAR PHASE (3 paramètres) : le choix se fait par la mesure
// (perte de validation, voir chooseConfig). L'ajustement est TOUJOURS conjoint : tables et poids sont réajustés ensemble,
// car une caractéristique est corrélée à des sommes de tables.
// Perte et cible inchangées : entropie croisée entre σ(éval / K_m) et λ·résultat + (1−λ)·σ(score de recherche / K_t) (λ = 0 :
// le score de recherche), Newton (IRLS) déterministe, L2 vers les tables de V1b (poids de structure ramenés vers 0).
import { NFEAT, FEATURES, FEATURE_INDEX, computeFeatures, normalizeTables, evalBound, MAX_EVAL_BOUND, createTableEvaluator } from '../js/ai/eval-learned.js';
import { meanLoss } from './fit-lib.mjs';

export const NPH = 3;                      // trois phases, comme V1b
export const PHASE_MIN = [30, 15, 0];
export const NTAB = 100;                   // paramètres de tables par phase (50 pions + 50 dames)
export const FAMILIES = {
  F1: ['sup', 'pair'],                     // connexité
  F2: ['blocked'],                         // blocage
  F3: ['free', 'kmob'],                    // mobilité
  F4: ['wing'],                            // équilibre des ailes
  F5: ['kvm', 'fort'],                     // dames
  F6: ['promo', 'isol'],                   // idées du jeu
};
export const phaseOfPieces = (n) => (n >= 30 ? 0 : n >= 15 ? 1 : 2);

// Colonnes de caractéristiques de TOUTES les positions : SF[p * NFEAT + f] (Int16) et indice de phase de chaque position.
export function buildStructureColumns(D) {
  const SF = new Int16Array(D.n * NFEAT);
  const board = new Int8Array(50), out = new Int32Array(NFEAT);
  const phase = new Uint8Array(D.n);
  for (let p = 0; p < D.n; p++) {
    const b = p * 50;
    for (let i = 0; i < 50; i++) board[i] = D.boards[b + i];
    computeFeatures(board, out);
    const o = p * NFEAT;
    for (let f = 0; f < NFEAT; f++) SF[o + f] = out[f];
    phase[p] = phaseOfPieces(D.pieces[p]);
  }
  D.SF = SF;
  D.phaseIdx = phase;
  return SF;
}

// Mise en page des paramètres : [0, 300) tables des 3 phases (phase × 100 + k), puis pour chaque caractéristique retenue
// 1 paramètre (global) ou 3 (par phase). specs = [{ name, mode: 'global' | 'phase' }].
export function makeLayout(specs) {
  const featParam = new Int32Array(NFEAT * NPH).fill(-1);
  let P = NPH * NTAB;
  const params = []; // description lisible : { name, phase | null }
  for (const sp of specs) {
    const f = FEATURE_INDEX[sp.name];
    if (f === undefined) throw new Error(`caractéristique inconnue : ${sp.name}`);
    if (sp.mode === 'global') {
      for (let ph = 0; ph < NPH; ph++) featParam[f * NPH + ph] = P;
      params.push({ name: sp.name, phase: null, index: P });
      P++;
    } else {
      for (let ph = 0; ph < NPH; ph++) { featParam[f * NPH + ph] = P; params.push({ name: sp.name, phase: ph, index: P }); P++; }
    }
  }
  return { P, featParam, specs: specs.map((s) => ({ ...s })), params, active: specs.map((s) => FEATURE_INDEX[s.name]) };
}

// Tables de départ (V1b) : θ0[ph × 100 + k], poids de structure à 0.
export function baseThetaFromTables(tables, layout) {
  const phases = normalizeTables(tables);
  if (phases.length !== NPH || phases.some((ph, k) => ph.minPieces !== PHASE_MIN[k])) {
    throw new Error(`le modèle de base doit avoir les 3 phases ${PHASE_MIN.join(' / ')} (V1b)`);
  }
  if (phases.some((ph) => ph.feat.some((w) => w !== 0))) throw new Error('le modèle de base ne doit pas déjà contenir de caractéristiques');
  const th = new Float64Array(layout.P);
  for (let ph = 0; ph < NPH; ph++) {
    for (let i = 0; i < 50; i++) { th[ph * NTAB + i] = phases[ph].man[i]; th[ph * NTAB + 50 + i] = phases[ph].king[i]; }
  }
  return th;
}

// Évaluation (centipions, point de vue des Blancs) de toutes les positions pour θ.
export function evalAllX(D, layout, theta, out = new Float64Array(D.n)) {
  const { off, feat, SF, phaseIdx } = D;
  const { featParam, active } = layout;
  for (let p = 0; p < D.n; p++) {
    const ph = phaseIdx[p], base = ph * NTAB;
    let e = 0;
    for (let a = off[p]; a < off[p + 1]; a++) { const f = feat[a]; e += f > 0 ? theta[base + f - 1] : -theta[base - f - 1]; }
    const o = p * NFEAT;
    for (let j = 0; j < active.length; j++) { const f = active[j], v = SF[o + f]; if (v !== 0) e += theta[featParam[f * NPH + ph]] * v; }
    out[p] = e;
  }
  return out;
}

// --- Newton (IRLS) généralisé --------------------------------------------------------------------------------------------------
const sigmoid = (z) => 1 / (1 + Math.exp(-z));
const softplus = (z) => (z > 0 ? z + Math.log1p(Math.exp(-z)) : Math.log1p(Math.exp(z)));

// Minimise (1/W)·Σ w_i·CE(σ(e_i/K), t_i) + α·Σ((θ_k − θ⁰_k)/S)² sur les positions idx. Même algorithme que fitNewton de
// fit-lib.mjs (convexe, déterministe), avec des entrées (indice de paramètre, valeur) de valeurs quelconques.
export function fitNewtonX(D, t, idx, layout, { theta0, K, alpha, S = 100, init = null, maxIter = 40, tol = 1e-10, freezeTables = false }) {
  const P = layout.P;
  const { off, feat, SF, phaseIdx, weight } = D;
  const { featParam, active } = layout;
  const theta = Float64Array.from(init || theta0);
  const penW = 2 * alpha / (S * S);
  let W = 0;
  for (let q = 0; q < idx.length; q++) W += weight[idx[q]];
  const PI = new Int32Array(NTAB + NTAB + 64), PV = new Float64Array(NTAB + NTAB + 64); // entrées de la position courante
  // freezeTables : les tables restent EXACTEMENT à theta0 ; leur contribution à l'évaluation est une constante par position
  // (EC) et seuls les poids de structure sont ajustés (problème minuscule, très stable, utile quand la cible contient des
  // résultats de parties : on n'abîme pas les tables apprises sur les scores de recherche).
  let EC = 0;

  // Rassemble les entrées de la position p dans PI / PV ; retourne leur nombre.
  const gather = (p) => {
    const ph = phaseIdx[p], base = ph * NTAB;
    let m = 0;
    EC = 0;
    for (let a = off[p]; a < off[p + 1]; a++) {
      const f = feat[a];
      const k = f > 0 ? base + f - 1 : base - f - 1;
      const v = f > 0 ? 1 : -1;
      if (freezeTables) EC += theta0[k] * v; else { PI[m] = k; PV[m] = v; m++; }
    }
    const o = p * NFEAT;
    for (let j = 0; j < active.length; j++) { const f = active[j], v = SF[o + f]; if (v !== 0) { PI[m] = featParam[f * NPH + ph]; PV[m] = v; m++; } }
    return m;
  };

  const objective = (th) => {
    let s = 0;
    for (let q = 0; q < idx.length; q++) {
      const p = idx[q];
      const m = gather(p);
      let e = EC;
      for (let a = 0; a < m; a++) e += th[PI[a]] * PV[a];
      const z = e / K;
      s += weight[p] * (softplus(z) - t[p] * z);
    }
    let r = 0;
    for (let k = 0; k < P; k++) { const d = (th[k] - theta0[k]) / S; r += d * d; }
    return s / W + alpha * r;
  };

  const g = new Float64Array(P), H = new Float64Array(P * P), delta = new Float64Array(P), trial = new Float64Array(P);
  let fcur = objective(theta), iterations = 0, converged = false;
  const K2 = K * K;
  for (let it = 0; it < maxIter; it++) {
    g.fill(0); H.fill(0);
    for (let q = 0; q < idx.length; q++) {
      const p = idx[q];
      const m = gather(p);
      let e = EC;
      for (let a = 0; a < m; a++) e += theta[PI[a]] * PV[a];
      const pr = sigmoid(e / K);
      const r = (pr - t[p]) * weight[p] / K;
      const h = pr * (1 - pr) * weight[p] / K2;
      for (let a = 0; a < m; a++) {
        const ia = PI[a], va = PV[a];
        g[ia] += r * va;
        const hv = h * va;
        for (let b = a; b < m; b++) {
          const ib = PI[b];
          if (ia <= ib) H[ia * P + ib] += hv * PV[b]; else H[ib * P + ia] += hv * PV[b];
        }
      }
    }
    for (let k = 0; k < P; k++) {
      g[k] = g[k] / W + penW * (theta[k] - theta0[k]);
      for (let l = k; l < P; l++) H[k * P + l] /= W;
      H[k * P + k] += penW + 1e-12;
    }
    solveSPD(H, g, delta, P);
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

// Cholesky sur le triangle supérieur de A (P×P, ligne par ligne) : résout A x = −g.
function solveSPD(A, g, out, P) {
  const U = new Float64Array(P * P);
  for (let i = 0; i < P; i++) {
    for (let j = i; j < P; j++) {
      let s = A[i * P + j];
      for (let k = 0; k < i; k++) s -= U[k * P + i] * U[k * P + j];
      if (i === j) { if (s <= 0) s = 1e-12; U[i * P + i] = Math.sqrt(s); } else U[i * P + j] = s / U[i * P + i];
    }
  }
  const y = new Float64Array(P);
  for (let i = 0; i < P; i++) { let s = -g[i]; for (let k = 0; k < i; k++) s -= U[k * P + i] * y[k]; y[i] = s / U[i * P + i]; }
  for (let i = P - 1; i >= 0; i--) { let s = y[i]; for (let k = i + 1; k < P; k++) s -= U[i * P + k] * out[k]; out[i] = s / U[i * P + i]; }
}

// --- θ ↔ modèle (fichier) -------------------------------------------------------------------------------------------------------------
// Modèle arrondi (entiers) au format de eval-learned.js : { phases: [{ minPieces, man, king, features }] }.
export function thetaToModel(layout, theta) {
  const phases = [];
  for (let ph = 0; ph < NPH; ph++) {
    const man = [], king = [];
    for (let i = 0; i < 50; i++) { man.push(Math.round(theta[ph * NTAB + i])); king.push(Math.round(theta[ph * NTAB + 50 + i])); }
    const features = {};
    for (const sp of layout.specs) {
      const f = FEATURE_INDEX[sp.name];
      const w = Math.round(theta[layout.featParam[f * NPH + ph]]);
      if (w !== 0) features[sp.name] = w;
    }
    const out = { minPieces: PHASE_MIN[ph], man, king };
    if (Object.keys(features).length) out.features = features;
    phases.push(out);
  }
  return { phases };
}

// θ arrondi (entiers) tel que l'ÉVALUATEUR le verra : on relit le modèle arrondi pour recalculer les pertes.
export function modelToTheta(model, layout) {
  const norm = normalizeTables(model);
  const th = new Float64Array(layout.P);
  for (let ph = 0; ph < NPH; ph++) {
    for (let i = 0; i < 50; i++) { th[ph * NTAB + i] = norm[ph].man[i]; th[ph * NTAB + 50 + i] = norm[ph].king[i]; }
    for (const sp of layout.specs) { const f = FEATURE_INDEX[sp.name]; th[layout.featParam[f * NPH + ph]] = norm[ph].feat[f]; }
  }
  return th;
}

// Contrôle de cohérence : l'évaluateur RÉEL (createTableEvaluator sur le modèle arrondi) donne exactement les mêmes évaluations
// que evalAllX sur un échantillon de positions. Retourne le nombre d'écarts (doit être 0).
export function checkEvaluatorConsistency(D, layout, model, sample = 20000) {
  const E = createTableEvaluator(model);
  const th = modelToTheta(model, layout);
  const e = evalAllX(D, layout, th);
  const step = Math.max(1, Math.floor(D.n / sample));
  const board = new Int8Array(50);
  let bad = 0, checked = 0;
  for (let p = 0; p < D.n; p += step) {
    for (let i = 0; i < 50; i++) board[i] = D.boards[p * 50 + i];
    if (E(board) !== e[p]) bad++;
    checked++;
  }
  return { checked, bad };
}

// --- Ajustement d'une configuration + choix global / par phase ------------------------------------------------------------------
// Borne de mat du modèle ARRONDI (sans passer par normalizeTables, qui REFUSE les modèles trop grands : ici on veut un nombre).
function modelBound(model) {
  let worst = 0;
  for (const ph of model.phases) {
    const feat = new Int32Array(NFEAT);
    for (const [name, w] of Object.entries(ph.features || {})) feat[FEATURE_INDEX[name]] = w;
    worst = Math.max(worst, evalBound({ man: ph.man, king: ph.king, feat }));
  }
  return worst;
}

// config = [{ name, mode }]. Retourne { layout, fit, theta, model, valLoss, trainLoss, bound, invalid } ; les pertes sont celles du
// modèle ARRONDI (entiers), calculées d'après les mêmes sommes que l'évaluateur. Un modèle dont la borne de mat dépasse 29 000
// est INVALIDE (l'évaluateur le refuserait) : valLoss = +∞, il ne sera jamais retenu.
// freezeTables : seuls les poids de structure sont ajustés (les tables restent celles de baseTables).
export function fitConfig(D, t, K, baseTables, config, { alpha = 1e-6, init = null, freezeTables = false } = {}) {
  const layout = makeLayout(config);
  const theta0 = baseThetaFromTables(baseTables, layout);
  const initial = init ? (() => { const x = Float64Array.from(theta0); for (let k = 0; k < Math.min(init.length, x.length); k++) x[k] = init[k]; return x; })() : null;
  const fit = fitNewtonX(D, t, D.trainIdx, layout, { theta0, K, alpha, init: initial, freezeTables });
  const model = thetaToModel(layout, fit.theta);
  const bound = modelBound(model);
  if (bound > MAX_EVAL_BOUND) return { layout, fit, theta: fit.theta, model, valLoss: Infinity, trainLoss: Infinity, bound, invalid: true };
  const e = evalAllX(D, layout, modelToTheta(model, layout));
  return { layout, fit, theta: fit.theta, model, valLoss: meanLoss(D, e, t, K, D.valIdx), trainLoss: meanLoss(D, e, t, K, D.trainIdx), bound, invalid: false };
}

// Choix par la mesure : on part de poids GLOBAUX pour toutes les caractéristiques de la famille ; pour chacune, on essaie un
// poids PAR PHASE et on le garde seulement si la perte de validation baisse d'au moins `threshold` (par position, en nats).
// Retourne { best, config, trials } (best = résultat de fitConfig de la configuration retenue ; best.invalid si même « tout
// global » dépasse la borne de mat).
export function chooseConfig(D, t, K, baseTables, names, { alpha = 1e-6, threshold = 5e-5, say = () => {}, freezeTables = false } = {}) {
  let config = names.map((name) => ({ name, mode: 'global' }));
  let best = fitConfig(D, t, K, baseTables, config, { alpha, freezeTables });
  const trials = [{ config: config.map((c) => `${c.name}:${c.mode}`).join(' '), valLoss: best.valLoss, trainLoss: best.trainLoss, invalid: best.invalid }];
  say(`      tout global : perte de validation ${best.valLoss.toFixed(6)}${best.invalid ? ` — INVALIDE (borne de mat ${best.bound} > ${MAX_EVAL_BOUND})` : ''}`);
  for (const name of names) {
    const cand = config.map((c) => (c.name === name ? { name, mode: 'phase' } : c));
    const r = fitConfig(D, t, K, baseTables, cand, { alpha, freezeTables });
    trials.push({ config: cand.map((c) => `${c.name}:${c.mode}`).join(' '), valLoss: r.valLoss, trainLoss: r.trainLoss, invalid: r.invalid });
    const gain = best.valLoss - r.valLoss;
    const take = !r.invalid && (best.invalid || gain >= threshold);
    say(`      ${name} par phase : ${r.valLoss.toFixed(6)}${r.invalid ? ` (INVALIDE : borne ${r.bound})` : ` (gain ${gain.toExponential(2)})`} ${take ? '→ retenu' : '→ global conservé'}`);
    if (take) { config = cand; best = r; }
  }
  return { best, config, trials };
}
