// Apprentissage des tables d'évaluation (training/fit-lib.mjs, training/fit.mjs) sur DONNÉES SYNTHÉTIQUES :
// on fabrique des parties dont les scores viennent de tables CONNUES, puis on vérifie que l'ajustement les
// retrouve, que la séparation apprentissage / validation se fait par parties, que tout est reproductible, etc.
//
// Usage : node tests/fit.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  loadDataset, checkV0Identity, v0Theta, evalAll, makeTargets, meanLoss, meanEntropy, minimizeK, fitNewton,
  thetaToTables, formatGrid, sanityReport, splitIsValidation, setGameWeights, NPARAM,
} from '../training/fit-lib.mjs';
import { encodeBoard, resolveEvaluator } from '../training/game.mjs';
import { createTableEvaluator } from '../js/ai/eval-learned.js';
import { mulberry32, randomFastPosition } from './helpers.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
let failures = 0;
const ok = (label, cond, extra = '') => { if (!cond) failures++; console.log(`${cond ? 'OK ' : 'ERR'} ${label}${extra ? ' — ' + extra : ''}`); };
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'damika-fit-'));

// --- Données synthétiques ---------------------------------------------------------------------------------------------------------
// Tables « vraies » = V0 + perturbation aléatoire (entiers) ; le score de chaque position = son évaluation vraie.
const rnd = mulberry32(99);
const theta0 = v0Theta();
const thetaStar = Float64Array.from(theta0, (v) => v + Math.round((rnd() - 0.5) * 120));
const star = (board) => { // évaluation avec thetaStar, calculée à part (indépendante du code testé)
  let e = 0;
  for (let i = 0; i < 50; i++) {
    switch (board[i]) {
      case 1: e += thetaStar[i]; break;
      case 2: e -= thetaStar[49 - i]; break;
      case 3: e += thetaStar[50 + i]; break;
      case 4: e -= thetaStar[50 + 49 - i]; break;
      default: break;
    }
  }
  return e;
};
const GAMES = 2400, PER = 12;
const lines = [];
const extra = { capture: 0, mate: 0 };
for (let g = 0; g < GAMES; g++) {
  const p = [];
  const result = ['1-0', '0-1', '1/2'][g % 3];
  for (let k = 0; k < PER; k++) {
    const fb = randomFastPosition(rnd, g * PER + k);
    p.push([encodeBoard(fb.board), fb.sideToMove, 8 + k, 0, Math.round(star(fb.board)), 8, 0]);
  }
  // Positions à écarter : une avec prise disponible, une avec un score de mat.
  const fb1 = randomFastPosition(rnd, 5000 + g);
  p.push([encodeBoard(fb1.board), 'w', 30, 0, 100, 8, 1]); extra.capture++;
  p.push([encodeBoard(fb1.board), 'w', 31, 0, 29500, 8, 0]); extra.mate++;
  lines.push(JSON.stringify({ mode: 'selfplay', game: g, result, p }));
}
const asyncLines = async function* (arr) { for (const l of arr) yield l; };

const D = await loadDataset(asyncLines(lines), { valFraction: 0.15, seed: 3 });

// --- Lecture et filtres --------------------------------------------------------------------------------------------------------
ok(`filtres : ${GAMES * PER} positions gardées, ${extra.capture} « prise disponible » et ${extra.mate} mats écartés`,
  D.n === GAMES * PER && D.droppedCapture === extra.capture && D.droppedMate === extra.mate && D.positionsSeen === GAMES * (PER + 2));
ok('caractéristiques : redonnent exactement l\'évaluation V0 (contrôle sur échantillon)', checkV0Identity(D, 5000).bad === 0);
{
  const bad = []; for (let i = 0; i < D.n; i++) if ((D.gameIsVal[D.gameOf[i]] ? 1 : 0) !== D.isVal[i]) bad.push(i);
  ok('séparation par PARTIES : aucune partie à cheval entre apprentissage et validation', bad.length === 0);
  const nv = D.gameIsVal.filter(Boolean).length;
  ok(`validation ≈ 15 % des parties (${nv}/${GAMES})`, Math.abs(nv / GAMES - 0.15) < 0.03);
  ok('positions de validation = positions des parties de validation', D.valIdx.length === nv * PER && D.valIdx.length + D.trainIdx.length === D.n);
  // Le tirage ne dépend ni de l'ordre ni du contenu du fichier : seulement de (graine, numéro de partie).
  const same = D.gameIds.every((id, k) => splitIsValidation(3, id, 0.15) === D.gameIsVal[k]);
  ok('tirage de validation = fonction pure de (graine, numéro de partie)', same);
  ok('autre graine : autre découpage', D.gameIds.some((id, k) => splitIsValidation(4, id, 0.15) !== D.gameIsVal[k]));
}

// --- Récupération de tables connues ------------------------------------------------------------------------------------
const Kt = 400;
const tgt = makeTargets(D, 0, Kt); // λ = 0 : cible = σ(score/K), sans bruit
{
  const e0 = evalAll(D, theta0);
  const floor = meanEntropy(D, tgt, D.trainIdx);
  const lossV0 = meanLoss(D, e0, tgt, Kt, D.trainIdx);
  const fit = fitNewton(D, tgt, D.trainIdx, { theta0, K: Kt, alpha: 1e-12 });
  const eFit = evalAll(D, fit.theta);
  const lossFit = meanLoss(D, eFit, tgt, Kt, D.trainIdx);
  ok(`Newton : la perte tombe au plancher d'entropie (${lossFit.toFixed(6)} pour ${floor.toFixed(6)}), V0 était à ${lossV0.toFixed(6)}`, lossFit - floor < 1e-6 && lossV0 - floor > 1e-4);
  ok(`Newton : convergence en peu d'itérations (${fit.iterations})`, fit.iterations <= 15 && fit.converged);
  // Cases observées : récupérées à moins de 1 cp. Les cases jamais vues (ex. pion blanc sur la rangée de promotion) restent à V0.
  const seen = new Uint8Array(NPARAM);
  for (let a = 0; a < D.feat.length; a++) seen[Math.abs(D.feat[a]) - 1] = 1;
  let worst = 0, unseenMoved = 0, nSeen = 0;
  for (let k = 0; k < NPARAM; k++) {
    if (seen[k]) { nSeen++; worst = Math.max(worst, Math.abs(fit.theta[k] - thetaStar[k])); }
    else if (Math.abs(fit.theta[k] - theta0[k]) > 1e-6) unseenMoved++;
  }
  ok(`récupération des tables vraies : écart max ${worst.toFixed(3)} cp sur ${nSeen} paramètres observés`, worst < 1);
  ok('paramètres jamais observés : restent exactement à V0', unseenMoved === 0, `${NPARAM - nSeen} non observés`);
  // Reproductibilité : même entrée, même sortie, au bit près.
  const fit2 = fitNewton(D, tgt, D.trainIdx, { theta0, K: Kt, alpha: 1e-12 });
  ok('reproductible : deux ajustements identiques au bit près', fit.theta.every((v, k) => v === fit2.theta[k]));
  // Le point de départ ne change pas le minimum (problème convexe).
  const fit3 = fitNewton(D, tgt, D.trainIdx, { theta0, K: Kt, alpha: 1e-12, init: Float64Array.from(theta0, (v) => v + 80) });
  // (Les paramètres jamais observés n'ont aucun gradient : ils restent là où on les a posés au départ, d'où la restriction.)
  ok('convexe : un autre point de départ mène au même minimum (paramètres observés)', fit.theta.every((v, k) => !seen[k] || Math.abs(v - fit3.theta[k]) < 0.05));
  // Validation : la perte V0 y est plus haute que celle des tables apprises.
  ok('validation : tables apprises meilleures que V0', meanLoss(D, eFit, tgt, Kt, D.valIdx) < meanLoss(D, e0, tgt, Kt, D.valIdx) - 1e-4);
}

// --- Régularisation vers V0 ---------------------------------------------------------------------------------------------------
{
  const dev = (alpha) => {
    const f = fitNewton(D, tgt, D.trainIdx, { theta0, K: Kt, alpha });
    let m = 0; for (let k = 0; k < NPARAM; k++) m = Math.max(m, Math.abs(f.theta[k] - theta0[k]));
    return m;
  };
  const d0 = dev(1e-9), d1 = dev(1e-2), d2 = dev(1e1);
  ok(`L2 vers V0 : plus α est grand, plus on reste près de V0 (écart max ${d0.toFixed(1)} → ${d1.toFixed(1)} → ${d2.toFixed(2)} cp)`, d0 > d1 && d1 > d2 && d2 < 2);
}

// --- Pondération par partie ------------------------------------------------------------------------------------------------------
{
  // Parties de longueurs inégales : avec power = 1, chaque partie pèse pareil ; poids moyen d'apprentissage = 1.
  const L = [];
  for (let g = 0; g < 300; g++) {
    const n = g % 2 ? 4 : 20, p = [];
    for (let k = 0; k < n; k++) { const fb = randomFastPosition(rnd, g * 31 + k); p.push([encodeBoard(fb.board), fb.sideToMove, 8 + k, 0, 10, 8, 0]); }
    L.push(JSON.stringify({ game: g, result: '1/2', p }));
  }
  const D2 = await loadDataset(asyncLines(L), { valFraction: 0.2, seed: 1 });
  setGameWeights(D2, 1);
  const perGame = new Float64Array(D2.games);
  for (let i = 0; i < D2.n; i++) perGame[D2.gameOf[i]] += D2.weight[i];
  const tr = [...Array(D2.games).keys()].filter((g) => !D2.gameIsVal[g]);
  const spread = Math.max(...tr.map((g) => perGame[g])) - Math.min(...tr.map((g) => perGame[g]));
  let mean = 0; for (const i of D2.trainIdx) mean += D2.weight[i]; mean /= D2.trainIdx.length;
  ok('poids 1/longueur : chaque partie d\'apprentissage pèse pareil, poids moyen = 1', spread < 1e-6 && Math.abs(mean - 1) < 1e-9, `écart ${spread.toExponential(1)}`);
}

// --- Utilitaires -------------------------------------------------------------------------------------------------------------------------
{
  const m = minimizeK((k) => (Math.log(k) - Math.log(300)) ** 2 + 1);
  ok(`minimizeK retrouve le minimum (300) : ${m.K.toFixed(2)}`, Math.abs(m.K - 300) < 0.5 && Math.abs(m.loss - 1) < 1e-6);
  const g = formatGrid(Array.from({ length: 50 }, (_, i) => i)).split('\n');
  const cells = (l) => l.trim().split(/\s+/);
  ok('grille 10×10 : 10 lignes, 50 cases foncées numérotées 0..49 (rangée 0 : colonnes impaires)', g.length === 10 && g.flatMap(cells).filter((x) => x !== '·').length === 50
    && cells(g[0])[0] === '·' && cells(g[0])[1] === '0' && cells(g[1])[0] === '5' && cells(g[9])[8] === '49');
  const rep = sanityReport(thetaToTables(theta0));
  ok('contrôle de bon sens sur V0 : pion croissant avec l\'avancement, dame plus forte au centre qu\'au bord', rep.manMonotone && rep.kingCore > rep.kingEdge, JSON.stringify({ c: rep.kingCore, e: rep.kingEdge }));
  const gm = formatGrid(thetaToTables(theta0).man, { ref: thetaToTables(theta0).man });
  ok('grille d\'écarts : V0 contre V0 = que des zéros', gm.split('\n').flatMap(cells).filter((x) => x !== '·').every((x) => x === '0'));
}

// --- Ligne de commande ---------------------------------------------------------------------------------------------------------------
{
  const dir = path.join(tmp, 'data'); fs.mkdirSync(dir);
  fs.writeFileSync(path.join(dir, 'games.jsonl'), lines.join('\n') + '\n');
  const out = path.join(tmp, 'models');
  const r = spawnSync(process.execPath, [path.join(here, '..', 'training', 'fit.mjs'), '--data', dir, '--out', out, '--lambda', '0,1', '--phases', '1,3', '--alphas', '1e-6,1e-2', '--grids', 'none'], { encoding: 'utf8', timeout: 300000 });
  ok('fit.mjs : s\'exécute sans erreur', r.status === 0, r.status === 0 ? '' : (r.stderr || r.stdout).slice(-300));
  const files = fs.existsSync(out) ? fs.readdirSync(out).sort() : [];
  ok('fit.mjs : 4 modèles + rapport écrits', files.join() === 'fit-report.json,v1-l0.json,v1-l1.json,v1b-l0.json,v1b-l1.json', files.join());
  if (files.includes('v1b-l0.json')) {
    const ev = resolveEvaluator(`learned:${path.join(out, 'v1b-l0.json')}`);
    ok('les modèles écrits sont chargeables par l\'arène (learned:) et utilisables', ev.kind === 'tables' && Array.isArray(ev.tables.phases) && ev.tables.phases.length === 3 && Number.isFinite(createTableEvaluator(ev.tables)(new Int8Array(50))));
    const m1 = JSON.parse(fs.readFileSync(path.join(out, 'v1-l0.json'), 'utf8'));
    ok('v1-l0 : tables d\'entiers (50 + 50)', m1.man.length === 50 && m1.king.length === 50 && m1.man.every(Number.isInteger) && m1.king.every(Number.isInteger));
    const rep = JSON.parse(fs.readFileSync(path.join(out, 'fit-report.json'), 'utf8'));
    ok('rapport : perte de validation de V1 inférieure à celle de V0 (cible λ = 0 exacte)', rep.runs.find((x) => x.name === 'v1-l0').val < rep.runs.find((x) => x.name === 'v1-l0').v0Val);
  }
}

fs.rmSync(tmp, { recursive: true, force: true });
console.log(failures === 0 ? '\nRÉSULTAT : tout concorde.' : `\nRÉSULTAT : ${failures} échec(s).`);
process.exit(failures === 0 ? 0 : 1);
