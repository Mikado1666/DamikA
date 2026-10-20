// Étape 4.1 — OUTIL DE MESURE (pas un test réussi/échoué) : la jauge d'évaluation de l'appli (BAR_SCALE_CP = 100, paliers
// d'avantage) a été réglée en regardant les scores de V0. V1b affiche-t-il des scores sur la même échelle ?
//
// Méthode. On tire des positions réelles dans les parties d'auto-jeu de la nuit 1 (V0 contre V0, profondeur 8, 8 000
// parties ; échantillon stratifié : un tiers d'ouvertures, de milieux de partie et de finales), on les analyse à profondeur FIXE avec V0 puis V1b (même recherche, même profondeur,
// seul l'évaluateur change : résultat indépendant de la vitesse de la machine), et on compare :
//   1. échelle : rapport RMS des scores (V1b / V0) et pente de régression, globalement et par phase (nombre de pièces) ;
//   2. ce que l'utilisateur VOIT : palier d'avantage identique, niveau de lumière identique, écart de part de blanc de la barre ;
//   3. sens prédictif : échelle K (centipions par e-fold) qui ajuste au mieux P(victoire) = 1 / (1 + e^(-score / K)) sur les
//      résultats des parties, pour chaque moteur (si K est le même, 1 cp de V1b « vaut » 1 cp de V0 pour prédire l'issue).
// Intervalles à 95 % par rééchantillonnage (bootstrap) sur les parties.
//
// Usage : node tests/gauge-calibration.mjs [--n 800] [--depth 8] [--seed 4141] [--out fichier.json] [--data dossier]
// Lecture seule : ne modifie rien dans training/ (le dossier de données est seulement lu).
import fs from 'node:fs';
import path from 'node:path';
import { FastBoard } from '../js/ai/fastboard.js';
import { analyseSync } from '../js/ai/search.js';
import { loadEvaluator, V1B_MODEL_PATH } from '../js/ai/engines.js';
import { barFraction, advantageTier, BAR_SCALE_CP, ADVANTAGE_TIERS } from '../js/ai/analysis-format.js';
import { findMove } from '../training/game.mjs';
import { mulberry32 } from './helpers.mjs';

const args = process.argv.slice(2);
const opt = (name, d) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : d; };
const N = Number(opt('n', 800)), DEPTH = Number(opt('depth', 8)), SEED = Number(opt('seed', 4141));
const DATA = opt('data', 'training/data/selfplay-nuit-1'), OUT = opt('out', null);

// --- Positions ------------------------------------------------------------------------------------------------------------
const gamesPath = path.join(DATA, 'games.jsonl');
if (!fs.existsSync(gamesPath)) { console.log(`Aucune donnée (${gamesPath}) : mesure impossible.`); process.exit(0); }
const lines = fs.readFileSync(gamesPath, 'utf8').split('\n').filter(Boolean);
const rnd = mulberry32(SEED);
const order = lines.map((_, i) => i);
for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }

// Échantillon STRATIFIÉ par phase (nombre de pièces) : un tiers d'ouvertures, un tiers de milieux de partie, un tiers de
// finales. Une partie fournit au plus une position par phase (rejouée en entier ; positions d'une même partie corrélées,
// d'où le bootstrap par partie plus bas).
const BINS = [
  { name: 'ouverture (≥ 30 pièces)', test: (n) => n >= 30 },
  { name: 'milieu (15 à 29 pièces)', test: (n) => n >= 15 && n < 30 },
  { name: 'finale (< 15 pièces)', test: (n) => n < 15 },
];
const quota = Math.ceil(N / BINS.length);
const taken = BINS.map(() => 0);
const positions = [];
for (const gi of order) {
  if (taken.every((t) => t >= quota)) break;
  const rec = JSON.parse(lines[gi]);
  if (rec.moves.length < 24) continue;
  const y = rec.result === '1-0' ? 1 : rec.result === '0-1' ? 0 : 0.5;
  const fb = FastBoard.initial();
  const candidates = BINS.map(() => []); // plies possibles par phase
  const snaps = new Map();
  let ok = true;
  for (let k = 0; k < rec.moves.length - 2 && ok; k++) {
    if (k >= 8) {
      const n = [...fb.board].filter((v) => v !== 0).length;
      const bi = BINS.findIndex((b) => b.test(n));
      if (taken[bi] < quota) { candidates[bi].push(k); snaps.set(k, { n, board: fb.toUiBoard(), side: fb.sideToMove }); }
    }
    const m = findMove(fb.generateMoves(), rec.moves[k]);
    if (!m) ok = false; else fb.makeMove(m);
  }
  if (!ok) continue;
  candidates.forEach((cs, bi) => {
    if (!cs.length || taken[bi] >= quota) return;
    const ply = cs[Math.floor(rnd() * cs.length)];
    const sn = snaps.get(ply);
    if (FastBoard.fromUiBoard(sn.board, sn.side).generateMoves().length === 0) return;
    positions.push({ game: gi, ply, pieces: sn.n, y, position: { board: sn.board, side: sn.side } });
    taken[bi]++;
  });
}

// --- Analyses -----------------------------------------------------------------------------------------------------------
const E1 = await loadEvaluator('v1b');
const t0 = performance.now();
const rows = positions.map((p, k) => {
  const a = analyseSync(p.position, { maxDepth: DEPTH, maxTimeMs: 1e9 });
  const b = analyseSync(p.position, { maxDepth: DEPTH, maxTimeMs: 1e9, evaluator: E1 });
  if ((k + 1) % 100 === 0) console.error(`  ${k + 1}/${positions.length} positions (${((performance.now() - t0) / 1000).toFixed(0)} s)`);
  return { game: p.game, ply: p.ply, pieces: p.pieces, y: p.y, s0: a.score, m0: a.mate, s1: b.score, m1: b.mate };
});
if (OUT) fs.writeFileSync(OUT, JSON.stringify({ N, DEPTH, SEED, data: DATA, model: V1B_MODEL_PATH, BAR_SCALE_CP, rows }));

// --- Statistiques -------------------------------------------------------------------------------------------------------------
const pct = (x, d = 1) => `${(100 * x).toFixed(d)} %`;
const f2 = (x) => (Number.isFinite(x) ? x.toFixed(2) : '—');
const quantile = (arr, q) => { const s = [...arr].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(q * s.length))]; };
const hasMate = (r) => r.m0 !== null || r.m1 !== null;

function rmsRatio(rs) { // RMS(V1b) / RMS(V0) sur les positions sans mat
  const q = rs.filter((r) => !hasMate(r));
  let n0 = 0, n1 = 0;
  for (const r of q) { n0 += r.s0 * r.s0; n1 += r.s1 * r.s1; }
  return Math.sqrt(n1 / n0);
}
function slope(rs) { // pente de V1b = b × V0, par les moindres carrés sans ordonnée
  const q = rs.filter((r) => !hasMate(r));
  let sxy = 0, sxx = 0;
  for (const r of q) { sxy += r.s0 * r.s1; sxx += r.s0 * r.s0; }
  return sxy / sxx;
}
function pearson(rs) {
  const q = rs.filter((r) => !hasMate(r));
  const n = q.length;
  const mx = q.reduce((s, r) => s + r.s0, 0) / n, my = q.reduce((s, r) => s + r.s1, 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (const r of q) { sxy += (r.s0 - mx) * (r.s1 - my); sxx += (r.s0 - mx) ** 2; syy += (r.s1 - my) ** 2; }
  return sxy / Math.sqrt(sxx * syy);
}
// Bootstrap par PARTIE (les positions d'une même partie ne sont pas indépendantes).
function bootstrap(rs, stat, B = 400) {
  const byGame = new Map();
  for (const r of rs) { if (!byGame.has(r.game)) byGame.set(r.game, []); byGame.get(r.game).push(r); }
  const games = [...byGame.values()];
  const brnd = mulberry32(99);
  const vals = [];
  for (let b = 0; b < B; b++) {
    const sample = [];
    for (let i = 0; i < games.length; i++) sample.push(...games[Math.floor(brnd() * games.length)]);
    const v = stat(sample);
    if (Number.isFinite(v)) vals.push(v);
  }
  vals.sort((a, c) => a - c);
  return [vals[Math.floor(0.025 * vals.length)], vals[Math.floor(0.975 * vals.length)]];
}
function fitK(rs, field) { // K qui minimise la perte logistique des résultats ; positions sans mat
  const q = rs.filter((r) => !hasMate(r));
  const loss = (K) => {
    let s = 0;
    for (const r of q) {
      const p = Math.min(1 - 1e-9, Math.max(1e-9, 1 / (1 + Math.exp(-r[field] / K))));
      s -= r.y * Math.log(p) + (1 - r.y) * Math.log(1 - p);
    }
    return s / q.length;
  };
  let lo = 20, hi = 5000;
  for (let it = 0; it < 80; it++) { // section dorée
    const a = lo + (hi - lo) * 0.382, b = lo + (hi - lo) * 0.618;
    if (loss(a) < loss(b)) hi = b; else lo = a;
  }
  const K = (lo + hi) / 2;
  return { K, loss: loss(K) };
}

const bins = BINS.map((b) => ({ name: b.name, test: (r) => b.test(r.pieces) }));

console.log(`Calibration de la jauge — ${rows.length} positions de ${new Set(rows.map((r) => r.game)).size} parties (${DATA}), profondeur fixe ${DEPTH}, graine ${SEED}`);
console.log(`Jauge actuelle : BAR_SCALE_CP = ${BAR_SCALE_CP} ; paliers (dixièmes de pion affichés) : ${ADVANTAGE_TIERS.map((t) => `${t.name} ≥ ${t.fromTenths}`).join(', ')}`);
const nm = rows.filter(hasMate).length;
console.log(`Positions avec un mat annoncé par au moins un moteur : ${nm} (${pct(nm / rows.length)}) — exclues de l'échelle, comptées à part ; V0 seul ${rows.filter((r) => r.m0 && !r.m1).length}, V1b seul ${rows.filter((r) => r.m1 && !r.m0).length}, les deux ${rows.filter((r) => r.m0 && r.m1).length}`);

console.log('\n1. ÉCHELLE (positions sans mat)');
console.log('   ensemble                    n     RMS V0  RMS V1b  rapport V1b/V0  [IC 95 %]        pente   corrélation');
for (const b of [{ name: 'toutes les positions', test: () => true }, ...bins]) {
  const rs = rows.filter(b.test);
  const q = rs.filter((r) => !hasMate(r));
  const rms0 = Math.sqrt(q.reduce((s, r) => s + r.s0 * r.s0, 0) / q.length), rms1 = Math.sqrt(q.reduce((s, r) => s + r.s1 * r.s1, 0) / q.length);
  const ic = bootstrap(rs, rmsRatio);
  console.log(`   ${b.name.padEnd(28)}${String(q.length).padStart(4)}  ${rms0.toFixed(0).padStart(7)}  ${rms1.toFixed(0).padStart(7)}  ${f2(rmsRatio(rs)).padStart(14)}  [${f2(ic[0])} ; ${f2(ic[1])}]   ${f2(slope(rs)).padStart(6)}  ${f2(pearson(rs)).padStart(6)}`);
}
const abs0 = rows.filter((r) => !hasMate(r)).map((r) => Math.abs(r.s0)), abs1 = rows.filter((r) => !hasMate(r)).map((r) => Math.abs(r.s1));
console.log(`   quantiles de |score| (centipions) V0 : médiane ${quantile(abs0, 0.5)}, 75 % ${quantile(abs0, 0.75)}, 90 % ${quantile(abs0, 0.9)}, 95 % ${quantile(abs0, 0.95)}`);
console.log(`   quantiles de |score| (centipions) V1b: médiane ${quantile(abs1, 0.5)}, 75 % ${quantile(abs1, 0.75)}, 90 % ${quantile(abs1, 0.9)}, 95 % ${quantile(abs1, 0.95)}`);

console.log('\n2. CE QUE L\'UTILISATEUR VOIT (même position, V0 contre V1b)');
{
  const tier = (s, m) => advantageTier({ score: s, mate: m });
  let sameName = 0, sameLight = 0, sameSide = 0, far = 0, farBigBand = 0;
  const fracDiff = [];
  for (const r of rows) {
    const t0_ = tier(r.s0, r.m0), t1_ = tier(r.s1, r.m1);
    if (t0_.name === t1_.name && t0_.side === t1_.side) sameName++;
    if (t0_.light === t1_.light) sameLight++;
    if (t0_.side === t1_.side) sameSide++;
    if (Math.abs(t0_.light - t1_.light) >= 2) far++;
    fracDiff.push(Math.abs(barFraction({ score: r.s0, mate: r.m0 }) - barFraction({ score: r.s1, mate: r.m1 })));
  }
  const n = rows.length;
  console.log(`   même palier (nom + camp) : ${pct(sameName / n)} · même niveau de lumière : ${pct(sameLight / n)} · même camp en avantage : ${pct(sameSide / n)} · niveaux de lumière à 2 crans ou plus d'écart : ${pct(far / n)}`);
  console.log(`   écart de part de blanc de la barre : médiane ${pct(quantile(fracDiff, 0.5))}, 90 % des positions sous ${pct(quantile(fracDiff, 0.9))}, maximum ${pct(Math.max(...fracDiff))}`);
  for (const b of bins) {
    const rs = rows.filter(b.test);
    let sn = 0;
    for (const r of rs) { const a = tier(r.s0, r.m0), c = tier(r.s1, r.m1); if (a.name === c.name && a.side === c.side) sn++; }
    console.log(`     ${b.name.padEnd(26)} même palier : ${pct(sn / rs.length)} (${rs.length} positions)`);
  }
}

console.log('\n3. SENS PRÉDICTIF (échelle K de P(victoire) = 1 / (1 + e^(-score / K)), résultats des parties, positions sans mat)');
{
  const all = rows;
  const k0 = fitK(all, 's0'), k1 = fitK(all, 's1');
  const ratio = (rs) => fitK(rs, 's1').K / fitK(rs, 's0').K;
  const ic = bootstrap(all, ratio, 200);
  console.log(`   toutes positions : K(V0) = ${k0.K.toFixed(0)} cp (perte ${k0.loss.toFixed(4)}) · K(V1b) = ${k1.K.toFixed(0)} cp (perte ${k1.loss.toFixed(4)}) · K(V1b)/K(V0) = ${f2(k1.K / k0.K)} [${f2(ic[0])} ; ${f2(ic[1])}]`);
  for (const b of bins) {
    const rs = rows.filter(b.test);
    const a = fitK(rs, 's0'), c = fitK(rs, 's1');
    console.log(`     ${b.name.padEnd(26)} K(V0) = ${a.K.toFixed(0).padStart(4)}  K(V1b) = ${c.K.toFixed(0).padStart(4)}  rapport ${f2(c.K / a.K)}  (${rs.filter((r) => !hasMate(r)).length} positions)`);
  }
  console.log(`   (lecture : K = 415 cp pour V0 signifie qu'un pion d'avance donne ≈ ${pct(1 / (1 + Math.exp(-100 / 415)), 0)} de victoire ; la jauge, elle, est volontairement plus pentue : ±1 pion = ${pct(1 / (1 + Math.exp(-100 / BAR_SCALE_CP)), 0)} de la barre)`);
}
