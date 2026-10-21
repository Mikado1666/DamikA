#!/usr/bin/env node
// DAMIKA — Étape 3.5 : enchaînement AUTOMATIQUE de la NUIT 3 (auto-jeu avec les règles de finale 6.3 / 6.4, puis
// réentraînement et matchs). Aucun lien avec l'appli, aucune dépendance (Node seul).
//
//   node training/chain-nuit3.mjs [--dry-run]
//
// 1. choose  : choisit le meilleur modèle d'après le match n12 contre V1b (training/data/chain-n12-v1b-d8-s888) :
//              n12-l0.json si l'IC95 de l'Elo est ENTIÈREMENT > 0, sinon v1b-l0.json. Décision et chiffres journalisés.
// 2. selfplay: 8000 parties, profondeur 8, graine 3, règles 6.3 / 6.4 actives (arena.mjs les applique et les écrit dans
//              l'identité du run) → training/data/selfplay-nuit-3. Reprend où il en était si on relance le script.
// 3. verify  : verify.mjs sur la nuit 3 (rejeu avec rules.js, règles de finale comprises). Échec = ARRÊT NET.
// 4. fit-n3  : réentraînement nuit 3 seule → training/models/n3-l0.json
//    fit-n123: réentraînement nuits 1 + 2 + 3 → training/models/n123-l0.json
//    ATTENTION (journalisé) : les nuits 1 et 2 ont été jouées SANS les règles de finale 6.3 / 6.4 ; la nuit 3 AVEC.
// 5. matchs  : chaque candidat contre le meilleur modèle, profondeur 6 graine 777 puis profondeur 8 graine 888, 400 paires.
// Récapitulatif final : ligne « MODÈLE LE PLUS FORT, Elo, IC95 ».
// Journal : training/logs/chain-nuit3.log ; état : training/logs/chain-nuit3.state.json (relancer le script saute les étapes
// terminées ; auto-jeu et matchs reprennent où ils en étaient). Veille Windows bloquée pendant toute la durée.
//
// Options : --dry-run (plan, commandes, heures estimées ; ne lance ni n'écrit RIEN) · --workers <n> (7) · --state · --log
//   --stop-after <étape> (essais) · --allow-sleep · --games <n> (8000, essais seulement).
// Ne modifie jamais les dossiers des nuits 1 et 2 ni des matchs existants : ils ne sont que LUS.
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { preventSleep } from './sleep.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const flag = (n) => argv.includes(`--${n}`);
const opt = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 && i + 1 < argv.length ? argv[i + 1] : d; };

const DRY = flag('dry-run');
const WORKERS = String(opt('workers', '7'));
const GAMES = String(opt('games', '8000'));
const LOG_FILE = path.resolve(ROOT, opt('log', 'training/logs/chain-nuit3.log'));
const STATE_FILE = path.resolve(ROOT, opt('state', 'training/logs/chain-nuit3.state.json'));
const STOP_AFTER = opt('stop-after', null);
const NODE = process.execPath;
const NUIT1 = 'training/data/selfplay-nuit-1';
const NUIT2 = 'training/data/selfplay-nuit-2';
const NUIT3 = 'training/data/selfplay-nuit-3';
const DECISION_MATCH = 'training/data/chain-n12-v1b-d8-s888';
const V1B_FILE = 'training/models/v1b-l0.json';
const N12_FILE = 'training/models/n12-l0.json';
const CANDIDATES = [{ id: 'n3', file: 'training/models/n3-l0.json' }, { id: 'n123', file: 'training/models/n123-l0.json' }];
const MATCHES = [{ depth: 6, seed: 777 }, { depth: 8, seed: 888 }];
const PAIRS = 400;
// Estimations de durée (training/README.md : profondeur 8 ≈ 1 140 parties/h à 8 cœurs ; matchs de la nuit 2 à 6 workers :
// profondeur 6 ≈ 5 min, profondeur 8 ≈ 40 min pour 400 paires).
const SELFPLAY_PER_HOUR = 1140 * (Number(WORKERS) / 8);

const fmtElo = (x) => `${x >= 0 ? '+' : '−'}${Math.abs(x).toFixed(1)}`;

// --- Choix du meilleur modèle (lecture seule du match de décision) -------------------------------------------------------
function decideBest() {
  const f = path.resolve(ROOT, DECISION_MATCH, 'summary.json');
  if (!fs.existsSync(f)) throw new Error(`${DECISION_MATCH}/summary.json introuvable`);
  const s = JSON.parse(fs.readFileSync(f, 'utf8'));
  if (s.interrupted !== false) throw new Error('le match de décision n12 contre V1b est INTERROMPU');
  const numbers = `n12 contre V1b, profondeur ${s.identity.depthA}, graine ${s.identity.seed}, ${s.pairs} paires : ${fmtElo(s.elo)} Elo [${fmtElo(s.eloLo)} ; ${fmtElo(s.eloHi)}] (V/N/D ${s.w}/${s.d}/${s.l})`;
  const n12Wins = s.eloLo > 0;
  const file = n12Wins ? N12_FILE : V1B_FILE;
  return { name: n12Wins ? 'n12-l0' : 'v1b-l0', file, why: `${numbers} → IC95 ${n12Wins ? 'entièrement > 0 : n12 retenu' : 'contient 0 ou est négatif : v1b-l0 retenu'}` };
}
// Le meilleur modèle : décision déjà enregistrée dans l'état (reprise cohérente), sinon calculée à la volée.
function bestModel(state) {
  const d = state.decision || decideBest();
  return { name: d.name, file: d.file, spec: `learned:${d.file}` };
}

// --- Plan : une étape = un identifiant, une commande, des dépendances, une durée estimée ---------------------------------
const matchDir = (cand, m) => `training/data/chain3-${cand.id}-d${m.depth}-s${m.seed}`;
function buildSteps(state) {
  const best = bestModel(state);
  const fit = (id, data, tag, out) => ({
    id, title: `réentraînement ${data.length === 1 ? 'nuit 3 seule' : 'nuits 1 + 2 + 3'} → ${out}`, deps: ['verify'], estMin: 1,
    argv: ['training/fit.mjs', '--data', data.join(','), '--lambda', '0', '--phases', '3', '--tag', tag, '--grids', 'none'],
    after() { // fit.mjs nomme sa sortie <tag>-v1b-l0.json : copie sous le nom demandé
      const from = path.join(ROOT, `training/models/${tag}-v1b-l0.json`), to = path.join(ROOT, out);
      if (!fs.existsSync(from)) throw new Error(`fit.mjs n'a pas écrit training/models/${tag}-v1b-l0.json`);
      fs.copyFileSync(from, to);
      return `copié vers ${out}`;
    },
  });
  const steps = [
    { id: 'choose', title: 'choix du meilleur modèle (match de décision n12 contre V1b)', deps: [], estMin: 0, internal: true },
    {
      id: 'selfplay', title: `auto-jeu ${GAMES} parties, profondeur 8, graine 3, règles 6.3/6.4 (${best.name}) → ${NUIT3}`, deps: ['choose'], haltOnFail: true,
      estMin: Math.round(Number(GAMES) / SELFPLAY_PER_HOUR * 60),
      argv: ['training/arena.mjs', 'selfplay', '--evaluator', best.spec, '--depth', '8', '--games', GAMES, '--seed', '3', '--workers', WORKERS, '--out', NUIT3],
      after() { // on exige un summary.json complet (une nuit interrompue ne doit pas passer pour terminée)
        const s = JSON.parse(fs.readFileSync(path.resolve(ROOT, NUIT3, 'summary.json'), 'utf8'));
        if (s.interrupted !== false || (typeof s.total === 'number' && s.doneJobs < s.total)) throw new Error('auto-jeu incomplet (summary.json : interrompu)');
        return `${s.games ?? s.doneJobs} parties`;
      },
    },
    { id: 'verify', title: 'verify.mjs sur la nuit 3 (rules.js, règles de finale)', deps: ['selfplay'], haltOnFail: true, estMin: 1, argv: ['training/verify.mjs', NUIT3] },
    fit('fit-n3', [NUIT3], 'n3', CANDIDATES[0].file),
    fit('fit-n123', [NUIT1, NUIT2, NUIT3], 'n123', CANDIDATES[1].file),
  ];
  for (const m of MATCHES) for (const c of CANDIDATES) {
    steps.push({
      id: `match-${c.id}-d${m.depth}-s${m.seed}`, title: `match ${c.id} contre ${best.name}, profondeur ${m.depth}, graine ${m.seed}, ${PAIRS} paires`, deps: [`fit-${c.id}`],
      estMin: m.depth === 6 ? 5 : 40, outDir: matchDir(c, m), candidate: c.id, depth: m.depth,
      argv: ['training/arena.mjs', 'match', '--a', `learned:${c.file}`, '--b', best.spec, '--depth', String(m.depth), '--pairs', String(PAIRS),
        '--seed', String(m.seed), '--workers', WORKERS, '--out', matchDir(c, m)],
    });
  }
  return steps;
}

const shown = (s) => (s.argv ? `node ${s.argv.map((a) => (/[\s"]/.test(a) ? `"${a}"` : a)).join(' ')}` : '(interne)');

// --- État (reprise) et journal --------------------------------------------------------------------------------------------
function readState() { try { return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); } catch { return { steps: {} }; } }
function writeState(st) {
  fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
  fs.writeFileSync(`${STATE_FILE}.tmp`, JSON.stringify(st, null, 1));
  fs.renameSync(`${STATE_FILE}.tmp`, STATE_FILE);
}
const stamp = (d = new Date()) => d.toLocaleString('fr-FR', { hour12: false });
function log(msg) {
  const line = `[${stamp()}] ${msg}`;
  console.log(line);
  if (!DRY) { fs.mkdirSync(path.dirname(LOG_FILE), { recursive: true }); fs.appendFileSync(LOG_FILE, `${line}\n`); }
}

// --- Récapitulatif : modèle le plus fort -----------------------------------------------------------------------------------
function readMatch(dir) {
  try { const s = JSON.parse(fs.readFileSync(path.resolve(ROOT, dir, 'summary.json'), 'utf8')); return s.interrupted === false ? s : null; } catch { return null; }
}
function strongestLine(steps, best) {
  const rows = [];
  for (const st of steps.filter((s) => s.candidate)) {
    const s = readMatch(st.outDir);
    if (s) rows.push({ cand: st.candidate, depth: st.depth, seed: s.identity.seed, elo: s.elo, lo: s.eloLo, hi: s.eloHi });
  }
  const deep = rows.filter((r) => r.depth === 8);
  const shallow = (c) => rows.find((r) => r.cand === c && r.depth === 6);
  // Un candidat bat le meilleur modèle si son IC95 est entièrement > 0 à profondeur 8 ET que son Elo est > 0 à profondeur 6.
  const winners = deep.filter((r) => r.lo > 0 && (shallow(r.cand)?.elo ?? 0) > 0).sort((a, b) => b.elo - a.elo);
  if (winners.length) {
    const w = winners[0];
    return `MODÈLE LE PLUS FORT : ${w.cand}-l0 (training/models/${w.cand}-l0.json), Elo ${fmtElo(w.elo)} IC95 [${fmtElo(w.lo)} ; ${fmtElo(w.hi)}] contre ${best.name} (profondeur 8, graine ${w.seed}, ${PAIRS} paires)`;
  }
  if (!deep.length) return `MODÈLE LE PLUS FORT : ${best.name} (aucun match de profondeur 8 terminé : candidats non évalués)`;
  const top = [...deep].sort((a, b) => b.elo - a.elo)[0];
  return `MODÈLE LE PLUS FORT : ${best.name} (${best.file}), référence Elo 0 : aucun candidat ne le bat de façon significative (meilleur candidat : ${top.cand}-l0 ${fmtElo(top.elo)} IC95 [${fmtElo(top.lo)} ; ${fmtElo(top.hi)}], profondeur 8, graine ${top.seed})`;
}

// --- Dry run ------------------------------------------------------------------------------------------------------------------
if (DRY) {
  const st = readState();
  console.log('MODE --dry-run : rien n\'est lancé, rien n\'est écrit.\n');
  console.log(`Dossier de travail : ${ROOT}`);
  console.log(`Journal : ${path.relative(ROOT, LOG_FILE)} · État de reprise : ${path.relative(ROOT, STATE_FILE)} · workers : ${WORKERS}`);
  console.log(`Veille Windows : ${flag('allow-sleep') ? 'NON bloquée (--allow-sleep)' : 'bloquée pendant toute la durée (sleep.mjs)'}`);
  try {
    const b = bestModel(st);
    console.log(`Meilleur modèle : ${b.name} — ${st.decision ? 'décision déjà enregistrée' : decideBest().why}\n`);
  } catch (e) { console.log(`Meilleur modèle : impossible à décider (${e.message})`); process.exit(1); }
  console.log('AVERTISSEMENT : les nuits 1 et 2 ont été jouées SANS les règles de finale 6.3 / 6.4 ; la nuit 3 sera jouée AVEC (le journal le rappellera).\n');
  const steps = buildSteps(st);
  let t = new Date();
  let total = 0;
  steps.forEach((s, i) => {
    const done = st.steps[s.id]?.done;
    if (!done) { t = new Date(t.getTime() + s.estMin * 60000); total += s.estMin; }
    console.log(`Étape ${i + 1}/${steps.length} — ${s.title}${done ? '  [DÉJÀ TERMINÉE : sautée à la relance]' : `  — fin estimée ${stamp(t)} (~${s.estMin} min)`}`);
    console.log(`   ${shown(s)}`);
    if (s.deps.length) console.log(`   (nécessite : ${s.deps.join(', ')})`);
    if (s.haltOnFail) console.log('   (en cas d\'erreur : ARRÊT NET, aucune autre étape)');
  });
  console.log(`\nDurée totale estimée si lancé maintenant : ~${(total / 60).toFixed(1)} h, fin vers ${stamp(t)} (estimation d'après training/README.md et les durées des matchs de la nuit 2 ; à ±20 %).`);
  const missing = [V1B_FILE, N12_FILE, `${NUIT1}/games.jsonl`, `${NUIT2}/games.jsonl`, `${DECISION_MATCH}/summary.json`].filter((f) => !fs.existsSync(path.resolve(ROOT, f)));
  console.log(missing.length ? `ATTENTION fichiers introuvables : ${missing.join(', ')}` : 'Fichiers d\'entrée présents.');
  if (fs.existsSync(path.resolve(ROOT, NUIT3))) console.log(`NB : ${NUIT3} existe déjà : l'auto-jeu REPRENDRA (même commande) au lieu de repartir de zéro.`);
  process.exit(missing.length ? 1 : 0);
}

// --- Exécution réelle ---------------------------------------------------------------------------------------------------------
let child = null;
let interrupted = false;
process.on('SIGINT', () => { interrupted = true; log('Ctrl+C : arrêt demandé (relancer le script pour reprendre)…'); if (!child) process.exit(130); });
process.on('exit', () => { try { child?.kill(); } catch { /* déjà terminé */ } });

function runStep(step) {
  return new Promise((resolve) => {
    const tail = [];
    const t0 = Date.now();
    log(`▶ ${step.title}`);
    log(`   ${shown(step)}`);
    child = spawn(NODE, step.argv, { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    const sink = (chunk) => {
      const text = String(chunk);
      process.stdout.write(text);
      fs.appendFileSync(LOG_FILE, text);
      for (const l of text.split(/\r?\n/)) if (l.trim()) { tail.push(l); if (tail.length > 40) tail.shift(); }
    };
    child.stdout.on('data', sink);
    child.stderr.on('data', sink);
    child.on('error', (e) => { child = null; resolve({ ok: false, code: -1, tail: [...tail, `lancement impossible : ${e.message}`], seconds: (Date.now() - t0) / 1000 }); });
    child.on('exit', (code) => { child = null; resolve({ ok: code === 0, code, tail, seconds: (Date.now() - t0) / 1000 }); });
  });
}

async function main() {
  const sleepInfo = flag('allow-sleep') ? { reason: 'non demandée (--allow-sleep)', stop() {} } : preventSleep();
  log(`=== chain-nuit3 démarré (pid ${process.pid}) — veille Windows : ${flag('allow-sleep') ? sleepInfo.reason : 'blocage en cours d\'armement'} ===`);
  log('AVERTISSEMENT : les nuits 1 et 2 ont été jouées SANS les règles de finale 6.3 / 6.4 ; la nuit 3 est jouée AVEC. Le réentraînement n123 mélange donc deux régimes de règles (n3 seul : données homogènes).');
  const state = readState();

  const failed = new Set();
  let halted = false;
  let steps = buildSteps(state);
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    if (interrupted) break;
    if (state.steps[step.id]?.done) { log(`✓ ${step.title} : déjà terminée (reprise), sautée.`); if (STOP_AFTER === step.id) break; continue; }
    if (halted) { log(`— ${step.title} : non lancée (arrêt net).`); continue; }
    const blocking = step.deps.filter((d) => failed.has(d) || !state.steps[d]?.done);
    if (blocking.length) { log(`— ${step.title} : non lancée (dépend de ${blocking.join(', ')}, non terminée).`); failed.add(step.id); continue; }

    if (step.internal) { // choose : la décision est figée dans l'état, le plan est reconstruit avec elle
      try {
        const d = decideBest();
        state.decision = { name: d.name, file: d.file, why: d.why };
        state.steps.choose = { done: true, at: new Date().toISOString(), note: d.why };
        writeState(state);
        log(`✔ Meilleur modèle : ${d.name} — ${d.why}`);
        steps = buildSteps(state);
      } catch (e) { failed.add('choose'); halted = true; log(`✘ choix du meilleur modèle impossible : ${e.message}. ARRÊT NET.`); }
      if (STOP_AFTER === step.id) break;
      continue;
    }
    const res = await runStep(step);
    let note = '';
    if (res.ok && step.after) { try { note = step.after(); log(`   ${note}`); } catch (e) { res.ok = false; res.tail.push(String(e.message)); } }
    if (res.ok) {
      state.steps[step.id] = { done: true, at: new Date().toISOString(), seconds: Math.round(res.seconds), note, tail: res.tail.slice(-14) };
      writeState(state);
      log(`✔ ${step.title} : terminée en ${Math.round(res.seconds / 60)} min.`);
    } else {
      failed.add(step.id);
      log(`✘ ${step.title} : ÉCHEC (code ${res.code}${interrupted ? ', interrompue' : ''}). Dernières lignes :\n    ${res.tail.slice(-8).join('\n    ')}`);
      if (step.haltOnFail) { halted = true; log(`ARRÊT NET : « ${step.id} » est indispensable à la suite. Corriger puis relancer le script.`); }
    }
    if (STOP_AFTER === step.id) { log(`--stop-after ${step.id} : arrêt volontaire.`); break; }
  }

  log('=== RÉCAPITULATIF ===');
  for (const step of steps) {
    const s = state.steps[step.id];
    log(`${s?.done ? '✔' : failed.has(step.id) ? '✘' : '·'} ${step.title}`);
    if (step.candidate) {
      const m = readMatch(step.outDir);
      if (m) log(`     ${fmtElo(m.elo)} Elo [${fmtElo(m.eloLo)} ; ${fmtElo(m.eloHi)}] — V/N/D ${m.w}/${m.d}/${m.l} sur ${m.pairs} paires`);
    }
  }
  log(strongestLine(steps, bestModel(state)));
  log(failed.size || halted ? `=== terminé AVEC ÉCHEC(S) : ${[...failed].join(', ')} — relancer le script pour reprendre ===` : '=== tout est terminé ===');
  sleepInfo.stop();
  process.exit(failed.size || halted ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
