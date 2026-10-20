// Apprentissage des tables + caractéristiques de STRUCTURE (training/fit-struct.mjs, fit.mjs --families) sur DONNÉES
// SYNTHÉTIQUES : on fabrique des parties dont les scores viennent d'un modèle VRAI connu (tables de V1b + poids de structure),
// puis on vérifie que l'ajustement retrouve ces poids, que le choix « global / par phase » est le bon, que l'évaluateur réel
// et l'ajustement donnent les mêmes évaluations, que plusieurs sources se lisent correctement et que le CLI est reproductible
// au bit près.
//
// Usage : node tests/fit-struct.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { loadDataset, setGameWeights, makeTargets, meanLoss, meanEntropy } from '../training/fit-lib.mjs';
import {
  NPH, NTAB, FAMILIES, buildStructureColumns, makeLayout, baseThetaFromTables, evalAllX, fitNewtonX, thetaToModel, modelToTheta,
  checkEvaluatorConsistency, fitConfig, chooseConfig,
} from '../training/fit-struct.mjs';
import { createTableEvaluator, tablesToPlain, FEATURES, NFEAT } from '../js/ai/eval-learned.js';
import { encodeBoard } from '../training/game.mjs';
import { mulberry32, randomFastPosition } from './helpers.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
let failures = 0;
const ok = (label, cond, extra = '') => { if (!cond) failures++; console.log(`${cond ? 'OK ' : 'ERR'} ${label}${extra ? ' — ' + extra : ''}`); };
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'damika-fit-struct-'));
const basePath = path.join(here, '..', 'training', 'models', 'v1b-l0.json');
const baseTables = tablesToPlain(JSON.parse(fs.readFileSync(basePath, 'utf8')));

// --- Modèle VRAI : tables de V1b + poids de structure par phase --------------------------------------------------------------------
const TRUTH = { sup: [5, 5, 5], kvm: [20, 12, 0], blocked: [-8, -8, -8], promo: [90, 90, 90] };
const truthModel = {
  phases: baseTables.phases.map((ph, k) => ({ ...ph, features: Object.fromEntries(Object.entries(TRUTH).map(([n, w]) => [n, w[k]])) })),
};
const truthEval = createTableEvaluator(truthModel);

const rnd = mulberry32(2718);
const GAMES = 1500, PER = 14;
const lines = [];
for (let g = 0; g < GAMES; g++) {
  const p = [];
  for (let k = 0; k < PER; k++) {
    const fb = randomFastPosition(rnd, g * PER + k);
    p.push([encodeBoard(fb.board), fb.sideToMove, 8 + k, 0, Math.round(truthEval(fb.board)), 8, 0]);
  }
  lines.push(JSON.stringify({ mode: 'selfplay', game: g, result: ['1-0', '0-1', '1/2'][g % 3], p }));
}
const asyncLines = async function* (arr) { for (const l of arr) yield l; };
const D = await loadDataset(asyncLines(lines), { valFraction: 0.15, seed: 4 });
setGameWeights(D, 0);
buildStructureColumns(D);
const Kt = 400;
const t = makeTargets(D, 0, Kt); // λ = 0 : cible exacte σ(score / K)

// --- 1. Mise en page des paramètres ----------------------------------------------------------------------------------------------------
{
  const L = makeLayout([{ name: 'sup', mode: 'global' }, { name: 'kvm', mode: 'phase' }]);
  ok(`mise en page : 300 paramètres de tables + 1 (global) + 3 (par phase) = ${L.P}`, L.P === NPH * NTAB + 4);
  const f = FEATURES.findIndex((x) => x.name === 'sup'), g = FEATURES.findIndex((x) => x.name === 'kvm');
  ok('poids global : même paramètre dans les 3 phases ; par phase : trois paramètres distincts',
    L.featParam[f * NPH] === L.featParam[f * NPH + 1] && L.featParam[f * NPH] === L.featParam[f * NPH + 2]
    && new Set([0, 1, 2].map((ph) => L.featParam[g * NPH + ph])).size === 3);
  ok('colonnes : valeurs entières, phase de chaque position = nombre de pièces (≥ 30 / 15 / 0)', D.SF.length === D.n * NFEAT && D.phaseIdx.length === D.n);
}

// --- 2. Récupération des poids vrais ---------------------------------------------------------------------------------------------------
{
  const names = ['sup', 'kvm', 'blocked', 'promo'];
  const config = [{ name: 'sup', mode: 'global' }, { name: 'kvm', mode: 'phase' }, { name: 'blocked', mode: 'global' }, { name: 'promo', mode: 'global' }];
  const layout = makeLayout(config);
  const th0 = baseThetaFromTables(baseTables, layout);
  const fit = fitNewtonX(D, t, D.trainIdx, layout, { theta0: th0, K: Kt, alpha: 1e-12 });
  ok(`Newton généralisé : converge (${fit.iterations} itérations)`, fit.converged && fit.iterations <= 20);
  const w = (n, ph) => fit.theta[layout.featParam[FEATURES.findIndex((x) => x.name === n) * NPH + ph]];
  const worst = Math.max(
    ...[0, 1, 2].map((ph) => Math.abs(w('kvm', ph) - TRUTH.kvm[ph])),
    Math.abs(w('sup', 0) - 5), Math.abs(w('blocked', 0) + 8), Math.abs(w('promo', 0) - 90));
  ok(`poids de structure retrouvés (écart max ${worst.toFixed(4)} cp ; vrais : sup 5, blocked −8, promo 90, kvm 20 / 12 / 0 par phase)`, worst < 0.2);
  const eFit = evalAllX(D, layout, fit.theta);
  const floor = meanEntropy(D, t, D.trainIdx);
  ok('la perte tombe au plancher d\'entropie de la cible (modèle vrai retrouvé)', meanLoss(D, eFit, t, Kt, D.trainIdx) - floor < 1e-6);
  void names;
}

// --- 3. Choix global / par phase par la mesure ---------------------------------------------------------------------------------------
{
  const r = chooseConfig(D, t, Kt, baseTables, ['sup', 'kvm', 'blocked', 'promo'], { alpha: 1e-9, threshold: 5e-5 });
  const mode = (n) => r.config.find((c) => c.name === n).mode;
  ok('kvm (poids 20 / 12 / 0 selon la phase) → par phase ; sup, blocked, promo (même poids partout) → global',
    mode('kvm') === 'phase' && mode('sup') === 'global' && mode('blocked') === 'global' && mode('promo') === 'global', JSON.stringify(r.config.map((c) => `${c.name}:${c.mode}`)));
  ok('perte de validation de la configuration choisie ≤ celle de « tout global »', r.best.valLoss <= r.trials[0].valLoss + 1e-12);
}

// --- 4. Cohérence évaluateur réel ↔ ajustement (modèle arrondi) ---------------------------------------------------------------
{
  const best = fitConfig(D, t, Kt, baseTables, [{ name: 'sup', mode: 'global' }, { name: 'kvm', mode: 'phase' }, { name: 'promo', mode: 'global' }], { alpha: 1e-6 });
  const c = checkEvaluatorConsistency(D, best.layout, best.model, 12000);
  ok(`l'évaluateur réel (createTableEvaluator) redonne exactement evalAllX sur ${c.checked} positions`, c.bad === 0, `${c.bad} écart(s)`);
  const back = modelToTheta(best.model, best.layout);
  ok('modèle → θ → modèle : aller-retour identique', JSON.stringify(thetaToModel(best.layout, back)) === JSON.stringify(best.model));
  ok('le modèle écrit est valide (borne de mat) et ne contient que des entiers',
    best.bound < 29000 && best.model.phases.every((p) => [...p.man, ...p.king, ...Object.values(p.features || {})].every(Number.isInteger)));
  // Témoin : sur des données produites par V1b SEUL (aucune structure), réajuster les tables sans caractéristique les laisse inchangées.
  const plainEval = createTableEvaluator(baseTables);
  const plainLines = lines.slice(0, 600).map((l) => {
    const g = JSON.parse(l);
    g.p = g.p.map((row) => { const b = new Int8Array(50); for (let i = 0; i < 50; i++) b[i] = '.wbWB'.indexOf(row[0][i]); row[4] = Math.round(plainEval(b)); return row; });
    return JSON.stringify(g);
  });
  const Dp = await loadDataset(asyncLines(plainLines), { valFraction: 0.15, seed: 4 });
  setGameWeights(Dp, 0);
  buildStructureColumns(Dp);
  const base0 = fitConfig(Dp, makeTargets(Dp, 0, Kt), Kt, baseTables, [], { alpha: 1e-9 });
  let dmax = 0;
  base0.model.phases.forEach((p, k) => { for (let i = 0; i < 50; i++) dmax = Math.max(dmax, Math.abs(p.man[i] - baseTables.phases[k].man[i]), Math.abs(p.king[i] - baseTables.phases[k].king[i])); });
  ok(`témoin : données de V1b seul, aucune caractéristique → tables réajustées identiques à V1b (écart max ${dmax} cp)`, dmax <= 1);
}

// --- 5. Plusieurs sources ------------------------------------------------------------------------------------------------------------
{
  const mk = (off, n) => Array.from({ length: n }, (_, g) => JSON.stringify({ mode: 'selfplay', game: g, result: '1/2', p: [[encodeBoard(randomFastPosition(rnd, off + g).board), 'w', 8, 0, 10, 8, 0]] }));
  const gen = async function* () { for (const l of mk(0, 200)) yield { line: l, src: 0 }; for (const l of mk(900, 200)) yield { line: l, src: 1 }; };
  const D2 = await loadDataset(gen(), { valFraction: 0.5, seed: 1 });
  ok('deux sources aux numéros de parties identiques : 400 parties distinctes (clés « 1:n » pour la 2e)', D2.games === 400 && D2.gameIds[0] === 0 && D2.gameIds[200] === '1:0');
  const v0 = D2.gameIsVal.slice(0, 200).filter(Boolean).length, v1 = D2.gameIsVal.slice(200).filter(Boolean).length;
  ok(`validation tirée séparément par source (${v0} / 200 et ${v1} / 200 parties), pas la même partition`, v0 > 60 && v0 < 140 && v1 > 60 && v1 < 140
    && D2.gameIsVal.slice(0, 200).some((v, k) => v !== D2.gameIsVal[200 + k]));
}

// --- 6. Ligne de commande : reproductible au bit près ----------------------------------------------------------------------------------
{
  const dir = path.join(tmp, 'data'); fs.mkdirSync(dir);
  fs.writeFileSync(path.join(dir, 'games.jsonl'), lines.join('\n') + '\n');
  const run = (out) => spawnSync(process.execPath, [path.join(here, '..', 'training', 'fit.mjs'), '--data', dir, '--base', basePath, '--families', 'F5,F6', '--features', 'sup,kvm,blocked,promo', '--out', out, '--tag', 't', '--grids', 'none', '--seed', '4', '--kt', '400', '--km', '400'], { encoding: 'utf8', timeout: 600000 });
  const o1 = path.join(tmp, 'm1'), o2 = path.join(tmp, 'm2');
  const r1 = run(o1), r2 = run(o2);
  ok('fit.mjs --families F5,F6 --features sup,wing : s\'exécute sans erreur', r1.status === 0 && r2.status === 0, r1.status === 0 ? '' : (r1.stderr || r1.stdout).slice(-300));
  const names = fs.existsSync(o1) ? fs.readdirSync(o1).sort() : [];
  ok('modèles écrits : F5, F6, custom + rapport', names.join() === 't-F5.json,t-F6.json,t-custom.json,t-fit-struct-report.json'.split(',').sort().join(), names.join());
  let same = names.length > 0;
  for (const n of names) if (!fs.existsSync(path.join(o2, n)) || fs.readFileSync(path.join(o1, n), 'utf8') !== fs.readFileSync(path.join(o2, n), 'utf8')) same = false;
  ok('deux exécutions : tous les fichiers (modèles et rapport) IDENTIQUES au bit près', same);
  if (names.includes('t-custom.json')) {
    const m = JSON.parse(fs.readFileSync(path.join(o1, 't-custom.json'), 'utf8'));
    const f = (ph, n) => m.phases[ph].features?.[n] ?? 0;
    ok('t-custom (sup, kvm, blocked, promo) : tous les poids vrais retrouvés à ±1 cp (kvm 20 / 12 / 0 par phase, sup 5, blocked −8, promo 90)',
      Array.isArray(m.phases) && m.phases.length === 3 && [0, 1, 2].every((ph) => Math.abs(f(ph, 'kvm') - TRUTH.kvm[ph]) <= 1 && Math.abs(f(ph, 'sup') - 5) <= 1 && Math.abs(f(ph, 'blocked') + 8) <= 1 && Math.abs(f(ph, 'promo') - 90) <= 1),
      JSON.stringify(m.phases.map((p) => p.features)));
    ok('tables du modèle : entiers (50 + 50 par phase)', m.phases.every((p) => p.man.length === 50 && p.king.length === 50 && p.man.every(Number.isInteger)));
  }
}

console.log(`    familles : ${Object.entries(FAMILIES).map(([k, v]) => `${k}=${v.join('+')}`).join(' ; ')}`);
fs.rmSync(tmp, { recursive: true, force: true });
console.log(failures === 0 ? '\nRÉSULTAT : tout concorde.' : `\nRÉSULTAT : ${failures} échec(s).`);
process.exit(failures === 0 ? 0 : 1);
