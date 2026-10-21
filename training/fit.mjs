#!/usr/bin/env node
// DAMIKA — Étape 3.2 : apprend des tables d'évaluation (V1 : un jeu ; V1b : trois jeux selon le nombre de pièces)
// à partir de parties d'auto-jeu (training/arena.mjs selfplay). Méthode et formules : en-tête de fit-lib.mjs.
//
//   node training/fit.mjs --data training/data/selfplay-nuit-1 --out training/models
//
// Options : --lambda 0,0.5,1 (part du résultat final dans la cible)  --phases 1,3 (V1 et/ou V1b)
//   --alphas 1e-6,1e-5,… (régularisation vers V0, choisie sur la validation)  --seed 1  --val 0.15 (part de PARTIES)
//   --game-weight 0|0.5|1 (poids 1/longueur^p par partie)  --kt <cp> (impose K_t au lieu de le calibrer)
//   --tag <nom> (préfixe des fichiers)  --grids all|v1|none
//   --anchor <modèle.json> (3 phases, sans caractéristiques) : la régularisation, la baseline et K_m s'attachent aux tables de ce
//     modèle au lieu de V0 (réglage fin d'un modèle existant sur de nouvelles données ; exige --phases 3)
// Sorties : <out>/<tag->v1-l<λ>.json, <tag->v1b-l<λ>.json (tables en entiers, utilisables par `--evaluator learned:…`)
// et <out>/<tag->fit-report.json (tous les chiffres).
//
// ÉTAPE 3.3 — caractéristiques de STRUCTURE (V2) : --families F1,F2,… | --features a,b | --combo a,b  --base <V1b.json>
//   (voir fit-struct-run.mjs : choix global / par phase par la perte de validation, ajustement conjoint avec les tables)
// Plusieurs auto-jeux : --data dossier1,dossier2 (la séparation apprentissage / validation se fait par partie, par source).
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { evalBound, MAX_EVAL_BOUND, normalizeTables } from '../js/ai/eval-learned.js';
import {
  loadDataset, checkV0Identity, setGameWeights, v0Theta, evalAll, makeTargets, meanLoss, meanEntropy, minimizeK,
  fitNewton, thetaToTables, tablesToTheta, formatGrid, sanityReport, MAX_ABS_SCORE,
} from './fit-lib.mjs';

const args = {};
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i];
  if (a.startsWith('--')) args[a.slice(2)] = process.argv[++i];
}
const list = (s, def) => (s === undefined ? def : String(s).split(',').map(Number));
const dataFiles = String(args.data || 'training/data/selfplay-nuit-1').split(',').map((d) => (
  fs.existsSync(d) && fs.statSync(d).isDirectory() ? path.join(d, 'games.jsonl') : d));
const dataFile = dataFiles[0];
const dataDesc = dataFiles.map((f) => path.basename(path.dirname(f))).join(' + ');
const outDir = args.out || 'training/models';
const lambdas = list(args.lambda, [0, 0.5, 1]);
const phaseConfigs = list(args.phases, [1, 3]);
const alphas = list(args.alphas, [1e-6, 1e-5, 1e-4, 1e-3, 3e-3, 1e-2, 3e-2, 1e-1]);
const seed = Number(args.seed ?? 1);
const valFraction = Number(args.val ?? 0.15);
const gamePower = Number(args['game-weight'] ?? 0);
const tag = args.tag ? `${args.tag}-` : '';
const gridsMode = args.grids || 'all';
for (const f of dataFiles) if (!fs.existsSync(f)) { console.error(`Données introuvables : ${f}`); process.exit(2); }
fs.mkdirSync(outDir, { recursive: true });

const say = (s = '') => console.log(s);
const fmt = (x, d = 5) => (Number.isFinite(x) ? x.toFixed(d) : String(x));
const t0 = performance.now();
const since = () => `${((performance.now() - t0) / 1000).toFixed(0)} s`;

// Phases (nombre total de pièces) : 0 : ≥ 30, 1 : 15 à 29, 2 : < 15 — mêmes seuils que eval-learned.js.
const PHASE_MIN = [30, 15, 0];
const phaseOf = (n) => (n >= 30 ? 0 : n >= 15 ? 1 : 2);

say('Étape 1/6 : lecture et filtrage des parties…');
// Une seule source : lignes brutes (comportement et résultats inchangés) ; plusieurs : lignes étiquetées par leur source.
async function* allLines() {
  for (let src = 0; src < dataFiles.length; src++) {
    const rl = readline.createInterface({ input: fs.createReadStream(dataFiles[src]), crlfDelay: Infinity });
    for await (const line of rl) yield dataFiles.length === 1 ? line : { line, src };
  }
}
const D = await loadDataset(allLines(), { valFraction, seed });
const nTrainGames = D.gameIsVal.filter((v) => !v).length, nValGames = D.games - nTrainGames;
say(`  ${D.games} parties (${nTrainGames} apprentissage, ${nValGames} validation) ; ${D.positionsSeen} positions lues`);
say(`  retirées : ${D.droppedCapture} avec prise disponible, ${D.droppedMate} avec |score| ≥ ${MAX_ABS_SCORE} (mat) ; gardées : ${D.n} (${D.trainIdx.length} apprentissage, ${D.valIdx.length} validation) [${since()}]`);
const phaseCount = [0, 0, 0], phaseVal = [0, 0, 0];
for (let i = 0; i < D.n; i++) { phaseCount[phaseOf(D.pieces[i])]++; if (D.isVal[i]) phaseVal[phaseOf(D.pieces[i])]++; }
say(`  par phase (≥ 30 / 15–29 / < 15 pièces) : ${phaseCount.join(' / ')} positions (validation : ${phaseVal.join(' / ')})`);
const idv = checkV0Identity(D);
say(`  contrôle : les 100 caractéristiques redonnent exactement l'évaluation V0 sur ${idv.checked} positions (${idv.bad} écart)`);
if (idv.bad !== 0) { console.error('ERREUR : caractéristiques incohérentes avec V0'); process.exit(1); }
setGameWeights(D, gamePower);
if (gamePower !== 0) say(`  poids par partie : 1/longueur^${gamePower}`);

const theta0 = v0Theta();
// --anchor : un jeu de paramètres par phase, pris dans le modèle d'ancrage (même découpage que V1b : ≥ 30 / 15–29 / < 15 pièces).
let anchorTheta = null;
if (args.anchor !== undefined) {
  if (args.families !== undefined || args.features !== undefined || args.combo !== undefined) { console.error('--anchor ne se combine pas avec --families / --features / --combo'); process.exit(2); }
  if (phaseConfigs.length !== 1 || phaseConfigs[0] !== 3) { console.error('--anchor exige --phases 3'); process.exit(2); }
  const ph = normalizeTables(JSON.parse(fs.readFileSync(args.anchor, 'utf8')));
  if (ph.length !== 3 || ph.some((p, k) => p.minPieces !== PHASE_MIN[k]) || ph.some((p) => p.feat.some((v) => v !== 0))) { console.error('--anchor : modèle à 3 phases (30 / 15 / 0) sans caractéristiques de structure attendu'); process.exit(2); }
  anchorTheta = ph.map((p) => Float64Array.from([...p.man, ...p.king]));
  say(`  ANCRAGE : régularisation, baseline et K_m attachés à ${path.basename(args.anchor)} (et non à V0) ; « V0 » dans les lignes ci-dessous = ce modèle`);
}
const e0 = (() => {
  if (!anchorTheta) return evalAll(D, theta0);
  const es = anchorTheta.map((th) => evalAll(D, th));
  const out = new Float64Array(D.n);
  for (let i = 0; i < D.n; i++) out[i] = es[phaseOf(D.pieces[i])][i];
  return out;
})();

say('Étape 2/6 : calibration de la température K_t (score de recherche → probabilité de gain, sur les résultats)…');
const sc = new Float64Array(D.n); for (let i = 0; i < D.n; i++) sc[i] = D.score[i];
const resT = new Float64Array(D.n); for (let i = 0; i < D.n; i++) resT[i] = D.res[i];
const KtCal = minimizeK((k) => meanLoss(D, sc, resT, k, D.trainIdx));
say(`  K_t calibré = ${fmt(KtCal.K, 1)} cp (perte résultat↔σ(score/K_t) sur l'apprentissage : ${fmt(KtCal.loss)})`);
// --kt : température imposée (étude de sensibilité) ; sinon la valeur calibrée.
const Kt = args.kt !== undefined ? { K: Number(args.kt), loss: meanLoss(D, sc, resT, Number(args.kt), D.trainIdx) } : KtCal;
if (args.kt !== undefined) say(`  K_t IMPOSÉ par --kt : ${fmt(Kt.K, 1)} cp`);
const KtVal = meanLoss(D, sc, resT, Kt.K, D.valIdx);
say(`  validation : ${fmt(KtVal)}   (référence « aucune information » : ln 2 = 0,69315)`);

if (args.families !== undefined || args.features !== undefined || args.combo !== undefined) {
  const { runStructure } = await import('./fit-struct-run.mjs');
  await runStructure({ D, args, Kt, e0, outDir, tag, say, dataDesc: `${dataDesc} : ${D.games} parties, ${D.n} positions retenues, validation ${valFraction * 100} % des parties (graine ${seed})`, seed, valFraction });
  process.exit(0);
}

const report = { data: dataFile, games: D.games, trainGames: nTrainGames, valGames: nValGames, positions: D.n, train: D.trainIdx.length, val: D.valIdx.length,
  dropped: { capture: D.droppedCapture, mate: D.droppedMate }, phaseCount, phaseVal, seed, valFraction, gamePower, Kt: Kt.K, alphas, runs: [] };

const posByPhase = (idx) => {
  const sets = [[], [], []];
  for (let q = 0; q < idx.length; q++) sets[phaseOf(D.pieces[idx[q]])].push(idx[q]);
  return sets.map((s) => Int32Array.from(s));
};
const trainPh = posByPhase(D.trainIdx), valPh = posByPhase(D.valIdx);

const showTables = (name, tables, ref) => {
  say(`    ${name} — table des PIONS (valeurs en centipions, Blancs montent vers le haut ; en bas = rangée de départ)`);
  say(formatGrid(tables.man).split('\n').map((l) => '      ' + l).join('\n'));
  say(`    ${name} — table des DAMES`);
  say(formatGrid(tables.king).split('\n').map((l) => '      ' + l).join('\n'));
  if (ref) {
    say(`    ${name} — écart des PIONS par rapport à V0`);
    say(formatGrid(tables.man, { ref: ref.man }).split('\n').map((l) => '      ' + l).join('\n'));
    say(`    ${name} — écart des DAMES par rapport à V0`);
    say(formatGrid(tables.king, { ref: ref.king }).split('\n').map((l) => '      ' + l).join('\n'));
  }
  const s = sanityReport(tables);
  say(`    bon sens : pion par rangée parcourue 0→9 : ${s.manByAdvance.map((v) => (Number.isFinite(v) ? v.toFixed(0) : '-')).join(' ')} ; croissant : ${s.manMonotone ? 'oui' : 'NON'}`);
  say(`               dame : cœur ${s.kingCore.toFixed(0)}, couronne ${s.kingRing.toFixed(0)}, extérieur ${s.kingOuter.toFixed(0)}, bord ${s.kingEdge.toFixed(0)}`);
};
const v0t = thetaToTables(theta0);
if (gridsMode !== 'none') { say('\n  V0 (référence) :'); showTables('V0', v0t, null); }

for (const lambda of lambdas) {
  say(`\nÉtape 3/6 : λ = ${lambda} — baseline V0 (perte de V0 sur la validation, avec son meilleur K_m)…`);
  const t = makeTargets(D, lambda, Kt.K);
  const Km = minimizeK((k) => meanLoss(D, e0, t, k, D.valIdx));
  const hVal = meanEntropy(D, t, D.valIdx);
  const baseVal = Km.loss, baseTrain = meanLoss(D, e0, t, Km.K, D.trainIdx);
  const nullVal = meanLoss(D, new Float64Array(D.n), t, Km.K, D.valIdx);
  say(`  K_m (V0) = ${fmt(Km.K, 1)} cp ; perte V0 : validation ${fmt(baseVal)}, apprentissage ${fmt(baseTrain)} ; plancher théorique (entropie de la cible, inatteignable) ${fmt(hVal)} ; « éval = 0 partout » ${fmt(nullVal)}`);
  say(`  → information apportée par V0 sur la validation (perte « éval = 0 » − perte V0) : ${fmt(nullVal - baseVal)} nat/position`);

  for (const nph of phaseConfigs) {
    const name = `${nph === 1 ? 'v1' : 'v1b'}-l${String(lambda).replace('.', '')}`;
    say(`Étape 4/6 : ajustement ${name} (λ = ${lambda}, ${nph === 1 ? 'un jeu de tables' : '3 jeux selon le nombre de pièces'}) [${since()}]`);
    const subsets = nph === 1 ? [{ train: D.trainIdx, val: D.valIdx }] : [0, 1, 2].map((k) => ({ train: trainPh[k], val: valPh[k] }));
    const chosen = [];
    for (let s = 0; s < subsets.length; s++) {
      const sub = subsets[s];
      let init = null, best = null;
      const rows = [];
      for (const alpha of alphas) {
        const fit = fitNewton(D, t, sub.train, { theta0: anchorTheta ? anchorTheta[s] : theta0, K: Km.K, alpha, init });
        init = fit.theta; // convexe : le point de départ ne change pas le minimum, il l'atteint plus vite
        const th = Float64Array.from(fit.theta);
        const e = evalAll(D, th);
        const lv = meanLoss(D, e, t, Km.K, sub.val), lt = meanLoss(D, e, t, Km.K, sub.train);
        const l0v = meanLoss(D, e0, t, Km.K, sub.val);
        rows.push({ alpha, train: lt, val: lv, v0val: l0v, iterations: fit.iterations });
        if (!best || lv < best.val) best = { alpha, theta: th, val: lv, train: lt, v0val: l0v };
      }
      chosen.push({ ...best, rows, n: sub.train.length, nVal: sub.val.length });
      const label = nph === 1 ? 'tout' : `phase ${s} (≥ ${PHASE_MIN[s]} pièces)`;
      say(`    ${label} : ${sub.train.length} positions d'apprentissage, ${sub.val.length} de validation`);
      for (const r of rows) say(`      α = ${String(r.alpha).padEnd(6)} apprentissage ${fmt(r.train)}  validation ${fmt(r.val)}  (V0 : ${fmt(r.v0val)}) ${r.alpha === best.alpha ? '← retenu' : ''}  [${r.iterations} it.]`);
    }

    // Tables finales, arrondies à l'entier ; perte de validation GLOBALE recalculée avec les valeurs arrondies.
    const phaseTables = chosen.map((c) => thetaToTables(c.theta));
    const eRound = new Float64Array(D.n);
    for (let i = 0; i < D.n; i++) eRound[i] = 0;
    for (let s = 0; s < chosen.length; s++) {
      const th = tablesToTheta(phaseTables[s]);
      const e = evalAll(D, th);
      for (let i = 0; i < D.n; i++) if (nph === 1 || phaseOf(D.pieces[i]) === s) eRound[i] = e[i];
    }
    const valRound = meanLoss(D, eRound, t, Km.K, D.valIdx), trainRound = meanLoss(D, eRound, t, Km.K, D.trainIdx);
    say(`  ${name} : perte de validation ${fmt(valRound)} (V0 ${fmt(baseVal)} ; gain ${fmt(baseVal - valRound)} nat/position = ${fmt(((baseVal - valRound) / (nullVal - baseVal)) * 100, 1)} % de plus que ce que V0 apporte déjà) ; apprentissage ${fmt(trainRound)} (V0 ${fmt(baseTrain)})`);

    const model = nph === 1
      ? { man: phaseTables[0].man, king: phaseTables[0].king }
      : { phases: phaseTables.map((tb, s) => ({ minPieces: PHASE_MIN[s], man: tb.man, king: tb.king })) };
    const bound = Math.max(...phaseTables.map(evalBound));
    if (bound > MAX_EVAL_BOUND) say(`  ⚠ ${name} : l'évaluation pourrait atteindre ±${bound} > ${MAX_EVAL_BOUND} : le fichier serait REFUSÉ par l'évaluateur (zone des scores de mat) ; augmenter la régularisation`);
    const meta = { format: 'damika-tables', version: 1, name: `${tag}${name}`, lambda, Kt: Kt.K, Km: Km.K, alphas: chosen.map((c) => c.alpha),
      source: `${path.basename(path.dirname(dataFile))} : ${D.games} parties, ${D.n} positions retenues, validation ${valFraction * 100} % des parties (graine ${seed})`,
      valLoss: valRound, v0ValLoss: baseVal, gamePower, anchor: args.anchor !== undefined ? path.basename(args.anchor) : undefined };
    fs.writeFileSync(path.join(outDir, `${tag}${name}.json`), JSON.stringify({ ...meta, ...model }));
    if (gridsMode === 'all' || (gridsMode === 'v1' && nph === 1)) {
      if (nph === 1) showTables(name, phaseTables[0], v0t);
      else phaseTables.forEach((tb, s) => showTables(`${name} phase ${s}`, tb, s === 0 ? v0t : null));
    }
    report.runs.push({ name: `${tag}${name}`, lambda, phases: nph, Km: Km.K, v0Val: baseVal, v0Train: baseTrain, floor: hVal, nullVal,
      val: valRound, train: trainRound, perPhase: chosen.map((c) => ({ alpha: c.alpha, n: c.n, nVal: c.nVal, val: c.val, v0val: c.v0val, rows: c.rows })) });
  }
}

fs.writeFileSync(path.join(outDir, `${tag}fit-report.json`), JSON.stringify(report, null, 1));
say(`\nTerminé en ${since()}. Modèles et rapport dans ${outDir}/`);
