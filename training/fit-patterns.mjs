#!/usr/bin/env node
// DAMIKA — P14 : apprend des tables de MOTIFS (js/ai/eval-patterns.js) par-dessus un modèle de base FIGÉ (ex. n123), sur les
// RÉSULTATS de parties réelles (training/data/td-positions-2100).
//
//   node training/fit-patterns.mjs --data training/data/td-positions-2100 --base training/models/n123-l0.json --set A \
//        --lambda 0.5,1 --reg 10,30,100,300,1000 --tag p14-A --out training/models
//
// Modèle : logit = (éval_base(position) + Σ_p T[phase][p][indice]  −  Σ_p T[phase][p][indice du miroir]) / K_t   (K_t = 154,4 cp,
//   comme P11), cible t = λ·résultat + (1−λ)·σ(éval_base / K_t) ; perte = entropie croisée. Les poids u = T / K_t sont appris
//   (unités de logit), arrondis en centipions entiers à la fin ; la perte de validation est recalculée sur le modèle ARRONDI.
// Optimiseur : Adam par lots (taille --batch, pas --lr), mélange déterministe (graine --seed), régularisation L2 vers 0 exprimée
//   en « pseudo-observations » c : pénalité (c / (2 N)) Σ u² ajoutée à la perte moyenne (un poids vu moins de ~4c fois est tiré
//   vers 0), c choisi sur la validation parmi --reg ; ARRÊT ANTICIPÉ : arrêt quand la perte de validation n'a pas baissé depuis
//   --patience époques, on garde les meilleurs poids.
// Séparation apprentissage / validation : PAR PARTIE (--val 0,15, graine --seed 1) par loadDataset, comme fit.mjs.
// Sorties : <out>/<tag>-l<λ>.json (tables de base + champ `patterns`, utilisable par `--evaluator learned:…`),
//   <out>/<tag>-report.json (toutes les pertes, courbes, 10 configurations les plus marquantes).
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { createTableEvaluator, tablesToPlain } from '../js/ai/eval-learned.js';
import {
  PATTERN_SETS, PATTERN_PHASE_MIN, buildPatternSet, makePatternIndexer, patternPhaseOfCount, createModelEvaluator, describeConfig,
} from '../js/ai/eval-patterns.js';
import { loadDataset } from './fit-lib.mjs';

const args = {};
for (let i = 2; i < process.argv.length; i++) { const a = process.argv[i]; if (a.startsWith('--')) args[a.slice(2)] = process.argv[++i]; }
const list = (s, d) => (s === undefined ? d : String(s).split(',').map(Number));
const dataFile = (() => { const d = args.data || 'training/data/td-positions-2100'; return fs.existsSync(d) && fs.statSync(d).isDirectory() ? path.join(d, 'games.jsonl') : d; })();
const basePath = args.base || 'training/models/n123-l0.json';
const setName = args.set || 'A';
const lambdas = list(args.lambda, [0.5, 1]);
const regs = list(args.reg, [10, 30, 100, 300, 1000]);
const seed = Number(args.seed ?? 1), valFraction = Number(args.val ?? 0.15);
const lr = Number(args.lr ?? 0.02), batch = Number(args.batch ?? 4096), maxEpochs = Number(args.epochs ?? 40), patience = Number(args.patience ?? 3);
const K = Number(args.kt ?? 154.4);
const tag = args.tag || 'p14-A', outDir = args.out || 'training/models';
const minOcc = Number(args['min-occ'] ?? 1000);
if (!PATTERN_SETS[setName]) { console.error(`jeu de motifs inconnu : ${setName} (connus : ${Object.keys(PATTERN_SETS).join(', ')})`); process.exit(2); }
if (!fs.existsSync(dataFile)) { console.error(`données introuvables : ${dataFile}`); process.exit(2); }
fs.mkdirSync(outDir, { recursive: true });
const say = (s = '') => console.log(s);
const t0 = performance.now(), since = () => `${((performance.now() - t0) / 1000).toFixed(0)} s`;
const sigmoid = (x) => 1 / (1 + Math.exp(-x));
const ce = (z, t) => (z > 0 ? z + Math.log1p(Math.exp(-z)) : Math.log1p(Math.exp(z))) - t * z; // perte d'un logit z, cible t

say(`P14 — motifs ${setName} sur ${path.basename(path.dirname(dataFile))}, base ${path.basename(basePath)}, K_t = ${K} cp`);
const rl = readline.createInterface({ input: fs.createReadStream(dataFile), crlfDelay: Infinity });
const D = await loadDataset(rl, { valFraction, seed });
say(`  ${D.games} parties, ${D.n} positions retenues (${D.trainIdx.length} apprentissage, ${D.valIdx.length} validation) [${since()}]`);
{ // aucune partie de validation dans l'apprentissage
  const trainGames = new Set(); for (const i of D.trainIdx) trainGames.add(D.gameOf[i]);
  let leak = 0; for (const i of D.valIdx) if (trainGames.has(D.gameOf[i])) leak++;
  if (leak) { console.error(`ERREUR : ${leak} positions de validation dans des parties d'apprentissage`); process.exit(1); }
  say(`  contrôle : ${trainGames.size} parties d'apprentissage, ${D.games - trainGames.size} de validation, aucune en commun`);
}

const basePlain = tablesToPlain(JSON.parse(fs.readFileSync(basePath, 'utf8')));
const baseEval = createTableEvaluator(basePlain);
const cells = PATTERN_SETS[setName];
const set = buildPatternSet(cells), np = set.np;
const indexes = makePatternIndexer(set);
const offs = new Int32Array(np + 1); for (let p = 0; p < np; p++) offs[p + 1] = offs[p] + set.size[p];
const PER = set.total, NPAR = 3 * PER;
say(`  ${np} motifs, ${set.total} configurations par phase, ${NPAR} poids (3 phases)`);

// Positions : évaluation de la base, indices des deux vues (Uint16), phase.
const n = D.n;
const E0 = new Float32Array(n), IW = new Uint16Array(n * np), IB = new Uint16Array(n * np), PH = new Uint8Array(n);
{
  const b = new Int8Array(50), iw = new Int32Array(np), ib = new Int32Array(np);
  for (let i = 0; i < n; i++) {
    for (let k = 0; k < 50; k++) b[k] = D.boards[i * 50 + k];
    E0[i] = baseEval(b);
    const cnt = indexes(b, iw, ib);
    PH[i] = patternPhaseOfCount(cnt);
    for (let p = 0; p < np; p++) { IW[i * np + p] = iw[p]; IB[i * np + p] = ib[p]; }
  }
}
say(`  indices et évaluation de base calculés [${since()}]`);
const phCount = [0, 0, 0]; for (let i = 0; i < n; i++) phCount[PH[i]]++;
say(`  positions par phase (≥ 30 / 15-29 / < 15 pièces) : ${phCount.join(' / ')}`);

const report = { data: dataFile, base: basePath, set: setName, cells, seed, valFraction, K, lr, batch, patience, games: D.games, positions: n, params: NPAR, runs: [] };

function rng(a) { return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

const logit = (i, u) => { // (éval_base + motifs) / K en unités de logit
  let z = E0[i] / K;
  const base = PH[i] * PER, o = i * np;
  for (let p = 0; p < np; p++) z += u[base + offs[p] + IW[o + p]] - u[base + offs[p] + IB[o + p]];
  return z;
};
function meanLoss(idx, u, t) { let s = 0; for (let q = 0; q < idx.length; q++) { const i = idx[q]; s += ce(logit(i, u), t[i]); } return s / idx.length; }

// Occurrences d'apprentissage de chaque configuration (les deux vues comptent).
const occ = new Int32Array(NPAR);
for (const i of D.trainIdx) { const base = PH[i] * PER, o = i * np; for (let p = 0; p < np; p++) { occ[base + offs[p] + IW[o + p]]++; occ[base + offs[p] + IB[o + p]]++; } }

function train(t, c, label) {
  const u = new Float64Array(NPAR), m = new Float64Array(NPAR), v = new Float64Array(NPAR), g = new Float64Array(NPAR);
  const train = Int32Array.from(D.trainIdx), N = train.length;
  const rand = rng(seed * 7919 + Math.round(c));
  let best = { val: Infinity, u: null, epoch: 0 }, step = 0, bad = 0;
  const curve = [];
  const b1 = 0.9, b2 = 0.999, eps = 1e-8;
  for (let epoch = 1; epoch <= maxEpochs; epoch++) {
    for (let i = N - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); const x = train[i]; train[i] = train[j]; train[j] = x; }
    for (let s = 0; s < N; s += batch) {
      const e = Math.min(N, s + batch), bs = e - s;
      g.fill(0);
      for (let q = s; q < e; q++) {
        const i = train[q];
        const r = (sigmoid(logit(i, u)) - t[i]) / bs;
        const base = PH[i] * PER, o = i * np;
        for (let p = 0; p < np; p++) { g[base + offs[p] + IW[o + p]] += r; g[base + offs[p] + IB[o + p]] -= r; }
      }
      step++;
      const c1 = 1 - Math.pow(b1, step), c2 = 1 - Math.pow(b2, step), reg = c / N;
      for (let k = 0; k < NPAR; k++) {
        const gk = g[k] + reg * u[k]; // pénalité (c / (2N)) Σ u²  → gradient (c / N) u
        m[k] = b1 * m[k] + (1 - b1) * gk; v[k] = b2 * v[k] + (1 - b2) * gk * gk;
        u[k] -= lr * (m[k] / c1) / (Math.sqrt(v[k] / c2) + eps);
      }
    }
    const val = meanLoss(D.valIdx, u, t), tr = meanLoss(D.trainIdx.length > 400000 ? D.trainIdx.filter((_, q) => q % 5 === 0) : D.trainIdx, u, t);
    curve.push({ epoch, val, train: tr });
    if (val < best.val - 1e-9) { best = { val, u: Float64Array.from(u), epoch }; bad = 0; } else bad++;
    if (!Number.isFinite(val)) { say(`  ${label} : DIVERGENCE (perte non finie) à l'époque ${epoch}`); return { diverged: true, curve }; }
    if (bad >= patience) break;
  }
  return { best, curve, epochs: curve.length };
}

for (const lambda of lambdas) {
  const t = new Float64Array(n);
  for (let i = 0; i < n; i++) t[i] = lambda * D.res[i] + (1 - lambda) * sigmoid(E0[i] / K);
  const zero = new Float64Array(NPAR);
  const baseVal = meanLoss(D.valIdx, zero, t), baseTrain = meanLoss(D.trainIdx, zero, t);
  say(`\nλ = ${lambda} : n123 seul : perte de validation ${baseVal.toFixed(6)}, apprentissage ${baseTrain.toFixed(6)}`);
  const rows = [];
  let winner = null;
  for (const c of regs) {
    const r = train(t, c, `c = ${c}`);
    if (r.diverged) { rows.push({ c, diverged: true }); continue; }
    const gain = baseVal - r.best.val;
    say(`  c = ${String(c).padStart(5)} : meilleure validation ${r.best.val.toFixed(6)} (époque ${r.best.epoch}/${r.epochs}) → gain ${gain.toExponential(2)} nat/position [${since()}]`);
    rows.push({ c, val: r.best.val, gain, epoch: r.best.epoch, epochs: r.epochs, curve: r.curve });
    if (!winner || r.best.val < winner.val) winner = { c, val: r.best.val, u: r.best.u, epoch: r.best.epoch };
  }
  if (!winner) { say('  aucun réglage n\'a convergé'); report.runs.push({ lambda, baseVal, rows, failed: true }); continue; }

  // Poids entiers (centipions) ; perte de validation du modèle ARRONDI ; contrôle contre l'évaluateur réel.
  const W = new Int32Array(NPAR); for (let k = 0; k < NPAR; k++) W[k] = Math.round(winner.u[k] * K);
  const uR = Float64Array.from(W, (x) => x / K);
  const valR = meanLoss(D.valIdx, uR, t), trR = meanLoss(D.trainIdx, uR, t);
  const tables = [0, 1, 2].map((ph) => cells.map((cs, p) => Array.from(W.subarray(ph * PER + offs[p], ph * PER + offs[p + 1]))));
  const name = `${tag}-l${String(lambda).replace('.', '')}`;
  const model = { ...basePlain, format: 'damika-patterns', version: 1, name, lambda, K, c: winner.c, base: path.basename(basePath),
    valLoss: valR, baseValLoss: baseVal, patterns: { cells, minPieces: PATTERN_PHASE_MIN, tables } };
  let evaluator, invalid = null;
  try { evaluator = createModelEvaluator(model); } catch (e) { invalid = e.message; }
  let maxAbs = 0, nz = 0; for (let k = 0; k < NPAR; k++) { maxAbs = Math.max(maxAbs, Math.abs(W[k])); if (W[k] !== 0) nz++; }
  say(`  → retenu c = ${winner.c} (époque ${winner.epoch}) ; arrondi en centipions : validation ${valR.toFixed(6)} (gain ${(baseVal - valR).toExponential(2)}), |poids| max ${maxAbs} cp, ${nz}/${NPAR} poids non nuls`);
  if (invalid) { say(`  MODÈLE INVALIDE : ${invalid}`); report.runs.push({ lambda, baseVal, rows, c: winner.c, invalid }); continue; }
  let bad = 0, chk = 0;
  const b = new Int8Array(50);
  for (let q = 0; q < D.valIdx.length; q += 50) { const i = D.valIdx[q]; for (let k = 0; k < 50; k++) b[k] = D.boards[i * 50 + k]; chk++; const z = logit(i, uR) * K; if (Math.abs(evaluator(b) - z) > 1e-6 * Math.max(1, Math.abs(z)) + 0.51 * np * 0 ) bad++; }
  say(`  contrôle : l'évaluateur réel redonne l'évaluation de l'ajustement sur ${chk} positions de validation (${bad} écart)`);
  if (bad) throw new Error('incohérence évaluateur / ajustement');
  fs.writeFileSync(path.join(outDir, `${name}.json`), JSON.stringify(model));
  say(`  modèle écrit : ${path.join(outDir, `${name}.json`)}`);

  // Les 10 configurations les plus marquantes (au moins --min-occ occurrences d'apprentissage) : plus grand |poids|.
  const top = [];
  for (let ph = 0; ph < 3; ph++) for (let p = 0; p < np; p++) for (let x = 0; x < set.size[p]; x++) {
    const k = ph * PER + offs[p] + x;
    if (occ[k] >= minOcc && W[k] !== 0) top.push({ phase: ph, pattern: p, cells: cells[p], config: describeConfig(cells[p], x), weight: W[k], occurrences: occ[k] });
  }
  top.sort((a, b2) => Math.abs(b2.weight) - Math.abs(a.weight));
  report.runs.push({ lambda, baseVal, baseTrain, rows, c: winner.c, epoch: winner.epoch, valRounded: valR, trainRounded: trR, maxAbs, nonZero: nz,
    bounds: undefined, file: `${name}.json`, top: top.slice(0, 40) });
}
fs.writeFileSync(path.join(outDir, `${tag}-report.json`), JSON.stringify(report, null, 1));
say(`\nTerminé en ${since()}. Rapport : ${path.join(outDir, `${tag}-report.json`)}`);
