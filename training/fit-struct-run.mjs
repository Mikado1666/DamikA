// DAMIKA — Étape 3.3 : pilote de l'apprentissage « tables + caractéristiques de structure » (appelé par fit.mjs quand
// --families, --features ou --combo est donné). Voir fit-struct.mjs pour la méthode.
//
//   node training/fit.mjs --data training/data/selfplay-nuit-1 --base training/models/v1b-l0.json \
//        --families F1,F2,F3,F4,F5,F6 --out training/models --tag s33
//   node training/fit.mjs … --combo sup,pair,wing --tag s33     (une famille « sur mesure » : liste de caractéristiques)
//
// Pour chaque famille : choix global / par phase de chaque poids par la perte de validation, choix de α, ajustement
// conjoint des tables et des poids, modèle écrit dans <out>/<tag>-<famille>.json, contrôle de cohérence avec l'évaluateur réel.
import fs from 'node:fs';
import path from 'node:path';
import { FEATURES, FEATURE_INDEX, normalizeTables, tablesToPlain } from '../js/ai/eval-learned.js';
import { makeTargets, meanLoss, minimizeK } from './fit-lib.mjs';
import {
  FAMILIES, PHASE_MIN, buildStructureColumns, makeLayout, baseThetaFromTables, evalAllX, thetaToModel, modelToTheta,
  checkEvaluatorConsistency, fitConfig, chooseConfig,
} from './fit-struct.mjs';

const fmt = (x, d = 6) => (Number.isFinite(x) ? x.toFixed(d) : String(x));

export async function runStructure({ D, args, Kt, e0, outDir, tag, say, dataDesc, seed, valFraction }) {
  const basePath = args.base || 'training/models/v1b-l0.json';
  const baseRaw = JSON.parse(fs.readFileSync(basePath, 'utf8'));
  const baseTables = tablesToPlain(baseRaw);
  const lambdas = String(args.lambda ?? '0').split(',').map(Number);
  const alphas = String(args.alphas ?? '1e-6,1e-5,1e-4,1e-3').split(',').map(Number);
  const threshold = Number(args['phase-threshold'] ?? 5e-5);
  // --freeze-tables : les tables restent celles de la base ; seuls les poids de structure sont appris (et K_m est le meilleur K
  // de la BASE sur la validation, pas celui de V0 : les tables n'étant pas réajustées, leur échelle est celle de la base).
  const freezeTables = args['freeze-tables'] !== undefined;

  // Familles demandées : --families F1,F2 (noms du registre) ; --features a,b ou --combo a,b = une famille sur mesure.
  const jobs = [];
  if (args.families) for (const f of String(args.families).split(',')) {
    if (!FAMILIES[f]) throw new Error(`famille inconnue : ${f} (connues : ${Object.keys(FAMILIES).join(', ')})`);
    jobs.push({ id: f, names: FAMILIES[f] });
  }
  for (const key of ['features', 'combo']) {
    if (args[key]) {
      const names = String(args[key]).split(',');
      for (const n of names) if (FEATURE_INDEX[n] === undefined) throw new Error(`caractéristique inconnue : ${n}`);
      jobs.push({ id: args[`${key}-name`] || (key === 'combo' ? 'combo' : 'custom'), names });
    }
  }
  if (!jobs.length) throw new Error('aucune famille demandée (--families, --features ou --combo)');

  say(`Étape 3/6 : colonnes de caractéristiques de structure (${FEATURES.length} caractéristiques × ${D.n} positions)…`);
  const t0 = performance.now();
  buildStructureColumns(D);
  say(`  calculées en ${((performance.now() - t0) / 1000).toFixed(1)} s`);

  const report = { data: dataDesc, base: basePath, seed, valFraction, Kt: Kt.K, threshold, alphas, runs: [] };

  for (const lambda of lambdas) {
    const t = makeTargets(D, lambda, Kt.K);
    const layout0 = makeLayout([]);
    const th0 = baseThetaFromTables(baseTables, layout0);
    const eBase = evalAllX(D, layout0, th0);
    const Km = args.km !== undefined ? { K: Number(args.km) }
      : freezeTables ? minimizeK((k) => meanLoss(D, eBase, t, k, D.valIdx)) : minimizeK((k) => meanLoss(D, e0, t, k, D.valIdx));
    say(`\nλ = ${lambda} : K_m (meilleur K de ${freezeTables ? 'la BASE (tables figées)' : 'V0'} sur la validation) = ${fmt(Km.K, 1)} cp${freezeTables ? ' — TABLES FIGÉES, seuls les poids de structure sont appris' : ''}`);

    // Baseline : V1b tel quel (tables arrondies du fichier), puis « témoin » = tables de V1b réajustées sans aucune caractéristique.
    const baseVal = meanLoss(D, eBase, t, Km.K, D.valIdx), baseTrain = meanLoss(D, eBase, t, Km.K, D.trainIdx);
    say(`  V1b (base) : perte de validation ${fmt(baseVal)}, apprentissage ${fmt(baseTrain)}`);
    const witness = freezeTables ? { valLoss: baseVal } : fitConfig(D, t, Km.K, baseTables, [], { alpha: 1e-6 });
    say(`  témoin (V1b réajusté sans caractéristique) : validation ${fmt(witness.valLoss)} (écart ${(witness.valLoss - baseVal).toExponential(1)})`);

    for (const job of jobs) {
      say(`\nÉtape 4/6 : famille ${job.id} (${job.names.join(', ')}) — λ = ${lambda} [${((performance.now() - t0) / 1000).toFixed(0)} s]`);
      const ch = chooseConfig(D, t, Km.K, baseTables, job.names, { alpha: 1e-6, threshold, say, freezeTables });
      if (ch.best.invalid) {
        say(`    ${job.id} : INVALIDE — l'ajustement dépasse la borne de mat (${ch.best.bound} > 29000) : candidat abandonné (poids trop grands, régulariser davantage)`);
        report.runs.push({ name: `${tag}${job.id}`, family: job.id, names: job.names, lambda, invalid: true, bound: ch.best.bound, trials: ch.trials });
        continue;
      }
      // Choix de α sur la validation pour la configuration retenue.
      let best = ch.best, bestAlpha = 1e-6;
      const alphaRows = [{ alpha: 1e-6, val: ch.best.valLoss }];
      for (const alpha of alphas.filter((a) => a !== 1e-6)) {
        const rr = fitConfig(D, t, Km.K, baseTables, ch.config, { alpha, freezeTables });
        alphaRows.push({ alpha, val: rr.valLoss });
        if (rr.valLoss < best.valLoss) { best = rr; bestAlpha = alpha; }
      }
      say(`    α retenu : ${bestAlpha} (pertes de validation : ${alphaRows.map((r) => `${r.alpha}→${fmt(r.val)}`).join(' ')})`);
      const cons = checkEvaluatorConsistency(D, best.layout, best.model);
      say(`    contrôle : l'évaluateur réel redonne exactement les évaluations de l'ajustement sur ${cons.checked} positions (${cons.bad} écart)`);
      if (cons.bad !== 0) throw new Error('incohérence évaluateur / ajustement');
      const gain = baseVal - best.valLoss;
      say(`    ${job.id} : perte de validation ${fmt(best.valLoss)} (V1b ${fmt(baseVal)} ; gain ${gain.toExponential(2)} nat/position${freezeTables ? '' : `, ${(witness.valLoss - best.valLoss).toExponential(2)} par rapport au témoin`} ; apprentissage ${fmt(best.trainLoss)} contre ${fmt(baseTrain)}) ; borne de mat ${best.bound}`);
      for (const ph of best.model.phases) {
        const w = ph.features ? Object.entries(ph.features).map(([k, v]) => `${k} ${v >= 0 ? '+' : ''}${v}`).join(', ') : '(aucun)';
        say(`      phase ≥ ${ph.minPieces} pièces : ${w}`);
      }
      const name = `${tag}${job.id}${lambdas.length > 1 ? `-l${String(lambda).replace('.', '')}` : ''}`;
      const file = path.join(outDir, `${name}.json`);
      const meta = {
        format: 'damika-tables', version: 2, name, family: job.id, features: undefined, lambda, Kt: Kt.K, Km: Km.K, alpha: bestAlpha,
        config: ch.config.map((c) => `${c.name}:${c.mode}`), valLoss: best.valLoss, baseValLoss: baseVal, base: path.basename(basePath), freezeTables, gamePower: D.weight[0] === 1 ? 0 : undefined,
        source: dataDesc,
      };
      delete meta.features;
      fs.writeFileSync(file, JSON.stringify({ ...meta, ...best.model }));
      say(`    modèle écrit : ${file}`);
      report.runs.push({
        name, family: job.id, names: job.names, lambda, Km: Km.K, config: meta.config, alpha: bestAlpha, baseVal, baseTrain,
        witnessVal: witness.valLoss, val: best.valLoss, train: best.trainLoss, bound: best.bound, trials: ch.trials, alphaRows,
        weights: best.model.phases.map((p) => ({ minPieces: p.minPieces, features: p.features || {} })),
      });
    }
  }
  fs.writeFileSync(path.join(outDir, `${tag}fit-struct-report.json`), JSON.stringify(report, null, 1));
  say(`\nTerminé en ${((performance.now() - t0) / 1000).toFixed(0)} s (hors lecture). Rapport : ${path.join(outDir, `${tag}fit-struct-report.json`)}`);
}
