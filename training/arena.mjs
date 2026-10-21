#!/usr/bin/env node
// DAMIKA — Étage 3.1 : arène (match entre deux évaluateurs) et auto-jeu, en parallèle (worker_threads).
// Aucune interface, aucun accès à l'appli. Mode d'emploi complet : training/README.md.
//
//   node training/arena.mjs match    --a v0 --b learned:training/models/v1.json --depth 6 --pairs 200 --out training/data/m1
//   node training/arena.mjs selfplay --evaluator v0 --depth 8 --games 5000 --out training/data/sp1
//
// Reprise : relancer EXACTEMENT la même commande. Les résultats sont ajoutés à <out>/games.jsonl (une
// partie = une ligne ; un match écrit les deux parties d'une paire en une seule écriture). Au démarrage,
// le script relit le fichier, ignore une dernière ligne tronquée par un arrêt brutal, retire une éventuelle
// paire à moitié écrite, et ne rejoue que ce qui manque. Ctrl+C : arrêt immédiat et propre (les tâches en
// cours sont perdues et seront rejouées à la reprise).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Worker } from 'node:worker_threads';
import { resolveEvaluator, DEFAULT_MAX_PLIES, ENDGAME_RULES_ID } from './game.mjs';
import { matchStats, formatMatchStats } from './stats.mjs';
import { preventSleep } from './sleep.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const FORMAT_VERSION = 1;

// --- Ligne de commande ---------------------------------------------------------------------------------------------
const BOOL_FLAGS = new Set(['no-verify', 'allow-sleep', 'help']);
function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      if (BOOL_FLAGS.has(key)) out[key] = true;
      else { out[key] = argv[++i]; if (out[key] === undefined) die(`option --${key} sans valeur`); }
    } else out._.push(a);
  }
  return out;
}
function die(msg) { console.error(`Erreur : ${msg}`); process.exit(2); }
const num = (args, key, def, { min = -Infinity, int = false } = {}) => {
  if (args[key] === undefined) return def;
  const v = Number(args[key]);
  if (!Number.isFinite(v) || v < min || (int && !Number.isInteger(v))) die(`--${key} invalide : ${args[key]}`);
  return v;
};

function usage() {
  console.log(`Usage :
  node training/arena.mjs match    --a <évaluateur> --b <évaluateur> --depth <n> --pairs <n> --out <dossier>
  node training/arena.mjs selfplay --evaluator <évaluateur> --depth <n> --games <n> --out <dossier>
Évaluateur : v0 | poids.json (clés de EVAL_WEIGHTS) | learned:<tables.json> (étage 3.2 : { man, king } ou { phases }).

Options communes : --seed <n> (1)  --workers <n> (cœurs−1)  --open-plies <K> (8)  --open-threshold <pions> (0.5)
  --probe-depth <n> (4)  --max-plies <n> (300)  --nodes <n> (budget de nœuds, déterministe)  --time <ms> (budget de
  temps, NON reproductible)  --progress-sec <s> (30)  --no-verify (pas de contrôle rules.js)  --allow-sleep
Match : --depth-a / --depth-b (profondeurs différentes).
Auto-jeu : --explore-prob <p> (0.08)  --explore-margin <cp> (30)`);
}

// --- Lecture / reprise du fichier de résultats -----------------------------------------------------------------
// Lit games.jsonl en flux ; ne garde que ce qu'il faut (identifiants, résultats), jamais les parties.
function scanResults(file, mode) {
  const res = { ids: new Set(), w: 0, d: 0, l: 0, pairScores: [], gamesCount: 0, whiteWins: 0, blackWins: 0, draws: 0, positions: 0, orphans: [] };
  if (!fs.existsSync(file)) return { res, goodBytes: 0, size: 0 };
  const fd = fs.openSync(file, 'r');
  const size = fs.fstatSync(fd).size;
  const buf = Buffer.alloc(1 << 20);
  let leftover = Buffer.alloc(0);
  let offset = 0, goodBytes = 0;
  const pairs = new Map(); // pair -> { 0: a, 1: a }
  const lineOffsets = [];  // pour réécrire sans les orphelins
  const handle = (line, start, end) => {
    if (!line.endsWith('}')) return false;
    if (mode === 'match') {
      const m = /^\{"mode":"match","pair":(\d+),"g":([01]),"a":(0\.5|0|1),/.exec(line);
      if (!m) return false;
      const p = Number(m[1]);
      const e = pairs.get(p) || {};
      e[m[2]] = Number(m[3]);
      pairs.set(p, e);
      lineOffsets.push({ p, start, end });
    } else {
      const m = /^\{"mode":"selfplay","game":(\d+),.*?"opening":(\d+),"result":"([^"]+)","reason":"[^"]+","plies":(\d+)/.exec(line);
      if (!m) return false;
      res.ids.add(Number(m[1]));
      res.gamesCount++;
      if (m[3] === '1-0') res.whiteWins++; else if (m[3] === '0-1') res.blackWins++; else res.draws++;
      res.positions += Math.max(0, Number(m[4]) - Number(m[2]));
    }
    return true;
  };
  let pos = 0;
  while (pos < size) {
    const n = fs.readSync(fd, buf, 0, buf.length, pos);
    if (n <= 0) break;
    pos += n;
    let chunk = leftover.length ? Buffer.concat([leftover, buf.subarray(0, n)]) : Buffer.from(buf.subarray(0, n));
    let base = offset;
    let start = 0, nl;
    while ((nl = chunk.indexOf(10, start)) !== -1) {
      const line = chunk.toString('utf8', start, nl);
      if (line.length > 0 && handle(line, base + start, base + nl + 1)) goodBytes = base + nl + 1;
      else if (line.length > 0) { /* ligne corrompue au milieu : ignorée, signalée plus bas */ }
      else goodBytes = base + nl + 1;
      start = nl + 1;
    }
    leftover = chunk.subarray(start);
    offset = base + start;
  }
  fs.closeSync(fd);
  if (mode === 'match') {
    for (const [p, e] of pairs) {
      if (e[0] !== undefined && e[1] !== undefined) {
        res.ids.add(p);
        for (const a of [e[0], e[1]]) { if (a === 1) res.w++; else if (a === 0) res.l++; else res.d++; }
        res.pairScores.push((e[0] + e[1]) / 2);
        res.gamesCount += 2;
      } else res.orphans.push(p);
    }
    res.lineOffsets = lineOffsets;
  }
  return { res, goodBytes, size };
}

// Réécrit le fichier sans les lignes des paires incomplètes (cas rare : arrêt brutal entre deux lignes).
function dropOrphans(file, res) {
  const orphan = new Set(res.orphans);
  const keep = res.lineOffsets.filter((x) => !orphan.has(x.p));
  const fd = fs.openSync(file, 'r');
  const tmp = `${file}.tmp`;
  const out = fs.openSync(tmp, 'w');
  for (const { start, end } of keep) {
    const b = Buffer.alloc(end - start);
    fs.readSync(fd, b, 0, b.length, start);
    fs.writeSync(out, b);
  }
  fs.closeSync(fd); fs.closeSync(out);
  fs.renameSync(tmp, file);
}

// --- Programme principal --------------------------------------------------------------------------------------------
async function main() {
  const args = parseArgs(process.argv.slice(2));
  const mode = args._[0];
  if (args.help || !mode) { usage(); process.exit(mode ? 0 : 2); }
  if (mode !== 'match' && mode !== 'selfplay') die(`mode inconnu « ${mode} » (match ou selfplay)`);
  if (!args.out) die('--out <dossier> est obligatoire');
  if (args.depth === undefined && (mode === 'selfplay' || (args['depth-a'] === undefined || args['depth-b'] === undefined))) {
    die('--depth <n> est obligatoire (profondeur fixe)');
  }

  const depthA = num(args, 'depth-a', num(args, 'depth', undefined, { min: 1, int: true }), { min: 1, int: true });
  const depthB = num(args, 'depth-b', num(args, 'depth', undefined, { min: 1, int: true }), { min: 1, int: true });
  const total = mode === 'match' ? num(args, 'pairs', undefined, { min: 1, int: true }) : num(args, 'games', undefined, { min: 1, int: true });
  if (total === undefined) die(mode === 'match' ? '--pairs <n> est obligatoire' : '--games <n> est obligatoire');
  const seed = num(args, 'seed', 1, { int: true });
  const workersN = num(args, 'workers', Math.max(1, os.availableParallelism() - 1), { min: 1, int: true });
  const progressSec = num(args, 'progress-sec', 30, { min: 0.1 });

  // Évaluateurs
  let specA, specB;
  if (mode === 'match') {
    if (!args.a || !args.b) die('--a et --b sont obligatoires en mode match');
    specA = args.a; specB = args.b;
  } else {
    if (!args.evaluator) die('--evaluator est obligatoire en mode selfplay');
    specA = args.evaluator; specB = args.evaluator;
  }
  let evA, evB;
  try { evA = resolveEvaluator(specA); evB = resolveEvaluator(specB); } catch (e) { die(e.message); }
  // Nom = étiquette + empreinte du CONTENU du fichier : il entre dans l'identité du run, donc modifier le fichier
  // de poids ou de tables sous le même nom empêche de « reprendre » un run avec un autre évaluateur.
  const nameOf = (ev) => `${ev.label}#${ev.id}`;
  const evData = (ev) => (ev.kind === 'tables' ? { kind: 'tables', tables: ev.tables } : { kind: 'weights', weights: ev.weights });
  const cfg = {
    mode,
    a: { name: nameOf(evA), ...evData(evA) },
    b: { name: nameOf(evB), ...evData(evB) },
    depthA, depthB,
    maxNodes: args.nodes !== undefined ? num(args, 'nodes', Infinity, { min: 1 }) : null,
    maxTimeMs: args.time !== undefined ? num(args, 'time', 1e9, { min: 1 }) : null,
    seed,
    open: {
      plies: num(args, 'open-plies', 8, { min: 0, int: true }),
      thresholdCp: Math.round(num(args, 'open-threshold', 0.5, { min: 0 }) * 100),
      probeDepth: num(args, 'probe-depth', 4, { min: 0, int: true }),
    },
    explore: mode === 'selfplay'
      ? { prob: num(args, 'explore-prob', 0.08, { min: 0 }), margin: num(args, 'explore-margin', 30, { min: 0 }) }
      : null,
    maxPlies: num(args, 'max-plies', DEFAULT_MAX_PLIES, { min: 10, int: true }),
    verify: !args['no-verify'],
  };
  // « Identité » du run : tout ce qui change les parties. Le nombre total, les workers, la verbosité n'en font pas partie.
  const identity = {
    version: FORMAT_VERSION, mode, a: cfg.a.name, b: cfg.b.name, depthA, depthB, maxNodes: cfg.maxNodes, maxTimeMs: cfg.maxTimeMs,
    seed, open: cfg.open, explore: cfg.explore, maxPlies: cfg.maxPlies,
    // Règles de nulle appliquées aux parties (limites de finale 6.3 / 6.4) : un run commencé avec d'autres règles ne se
    // reprend pas (et verify.mjs sait quelles règles appliquer à des parties anciennes, sans ce champ).
    endgameRules: ENDGAME_RULES_ID,
  };

  const out = path.resolve(args.out);
  fs.mkdirSync(out, { recursive: true });
  const metaFile = path.join(out, 'meta.json');
  const gamesFile = path.join(out, 'games.jsonl');
  if (fs.existsSync(metaFile)) {
    const old = JSON.parse(fs.readFileSync(metaFile, 'utf8'));
    if (JSON.stringify(old.identity) !== JSON.stringify(identity)) {
      die(`${out} contient déjà un autre run (réglages différents). Utilise un autre --out, ou supprime ce dossier.\n  ancien : ${JSON.stringify(old.identity)}\n  actuel : ${JSON.stringify(identity)}`);
    }
  }
  fs.writeFileSync(metaFile, JSON.stringify({ identity, cfgNote: 'poids ou tables complets dans weights-*.json / tables-*.json', created: new Date().toISOString() }, null, 2));
  const saveEv = (ev, side) => fs.writeFileSync(path.join(out, `${ev.kind === 'tables' ? 'tables' : 'weights'}-${side}.json`), JSON.stringify(ev.kind === 'tables' ? ev.tables : ev.weights, null, 1));
  saveEv(evA, 'a');
  if (mode === 'match') saveEv(evB, 'b');

  // Reprise
  const { res, goodBytes, size } = scanResults(gamesFile, mode);
  if (size > goodBytes) { fs.truncateSync(gamesFile, goodBytes); console.log(`Reprise : ligne finale tronquée retirée (${size - goodBytes} octets).`); }
  if (mode === 'match' && res.orphans.length) { dropOrphans(gamesFile, res); console.log(`Reprise : ${res.orphans.length} paire(s) incomplète(s) retirée(s), elles seront rejouées.`); }
  const done = res.ids;
  const pending = [];
  for (let i = 0; i < total; i++) if (!done.has(i)) pending.push(i);
  const unit = mode === 'match' ? 'paires' : 'parties';
  const gamesPerJob = mode === 'match' ? 2 : 1;

  // Journal
  const logDir = path.join(here, 'logs');
  fs.mkdirSync(logDir, { recursive: true });
  const logFile = path.join(logDir, `${path.basename(out)}.log`);
  const log = (msg) => {
    const line = `[${new Date().toTimeString().slice(0, 8)}] ${msg}`;
    console.log(line);
    try { fs.appendFileSync(logFile, line + '\n'); } catch { /* journal facultatif */ }
  };
  log(`${mode} — ${cfg.a.name}${mode === 'match' ? ` (prof. ${depthA}) contre ${cfg.b.name} (prof. ${depthB})` : ` (prof. ${depthA})`} ; graine ${seed} ; `
    + `${workersN} worker(s) ; sortie ${out}`);
  log(`déjà fait : ${done.size}/${total} ${unit} ; à jouer : ${pending.length}`);

  const state = { w: res.w, d: res.d, l: res.l, pairScores: [...res.pairScores], games: res.gamesCount,
    whiteWins: res.whiteWins, blackWins: res.blackWins, draws: res.draws, positions: res.positions, doneJobs: done.size };

  const summary = () => {
    if (mode === 'match') return { text: formatMatchStats(matchStats(state.pairScores, state)), stats: matchStats(state.pairScores, state) };
    const g = state.games;
    return {
      text: `Parties : ${g}  (Blancs ${state.whiteWins}, nulles ${state.draws}, Noirs ${state.blackWins})  positions enregistrées : ${state.positions}`,
      stats: { games: g, whiteWins: state.whiteWins, draws: state.draws, blackWins: state.blackWins, positions: state.positions },
    };
  };
  const writeSummary = (interrupted) => {
    const s = summary();
    fs.writeFileSync(path.join(out, 'summary.json'), JSON.stringify({ identity, total, doneJobs: state.doneJobs, interrupted, ...s.stats }, null, 2));
    return s.text;
  };

  if (pending.length === 0) {
    log('Rien à faire : tout est déjà joué.');
    console.log(writeSummary(false));
    return;
  }

  // Priorité système abaissée : le PC reste utilisable pendant le calcul.
  try { os.setPriority(0, os.constants.priority.PRIORITY_BELOW_NORMAL); } catch (e) { log(`priorité non abaissée (${e.message})`); }
  const sleepGuard = args['allow-sleep'] ? null : preventSleep();
  if (sleepGuard) setTimeout(() => log(`veille Windows : ${sleepGuard.ok ? 'bloquée pendant le calcul' : `NON bloquée (${sleepGuard.reason}), voir training/README.md`}`), 3000).unref();

  // Exécuteur
  const t0 = Date.now();
  const queue = [...pending];
  const retries = new Map();
  const slots = [];
  let stopping = false, finished = false, doneThisSession = 0, fatal = null;

  const progress = () => {
    const el = (Date.now() - t0) / 1000;
    const gamesDone = doneThisSession * gamesPerJob;
    const rate = el > 0 ? (gamesDone / el) * 3600 : 0;
    const remainingGames = (total - state.doneJobs) * gamesPerJob;
    const eta = rate > 0 ? (remainingGames / rate) * 3600 : Infinity;
    const etaTxt = Number.isFinite(eta) ? `${Math.floor(eta / 3600)} h ${String(Math.floor((eta % 3600) / 60)).padStart(2, '0')} min` : '?';
    let wdl;
    if (mode === 'match') {
      const n = state.w + state.d + state.l;
      wdl = `A +${state.w} =${state.d} -${state.l}${n ? ` (${(((state.w + state.d / 2) / n) * 100).toFixed(1)} %)` : ''}`;
    } else wdl = `Blancs ${state.whiteWins} / nulles ${state.draws} / Noirs ${state.blackWins}`;
    log(`${unit} ${state.doneJobs}/${total} | ${Math.round(rate)} parties/h | ${wdl} | reste ~${etaTxt} | mém. ${(process.memoryUsage().rss / 2 ** 20).toFixed(0)} Mo`);
  };
  const timer = setInterval(progress, progressSec * 1000);

  const shutdown = async (code, interrupted) => {
    if (finished) return;
    finished = true;
    clearInterval(timer);
    await Promise.all(slots.map((s) => s.worker.terminate().catch(() => {})));
    progress();
    console.log(writeSummary(interrupted));
    if (interrupted) log(`Arrêt demandé : relance la même commande pour reprendre (${state.doneJobs}/${total} ${unit} faites).`);
    if (sleepGuard) sleepGuard.stop();
    process.exit(code);
  };
  process.on('SIGINT', () => {
    if (stopping) process.exit(130);
    stopping = true;
    log('Ctrl+C reçu : arrêt en cours (les tâches non terminées seront rejouées à la reprise)…');
    shutdown(130, true);
  });

  const append = (lines) => {
    // Une seule écriture pour toutes les lignes de la tâche (une paire = deux lignes).
    fs.appendFileSync(gamesFile, lines.map((l) => JSON.stringify(l)).join('\n') + '\n');
  };
  const record = (lines) => {
    for (const l of lines) {
      state.games++;
      if (mode === 'match') { if (l.a === 1) state.w++; else if (l.a === 0) state.l++; else state.d++; }
      else {
        if (l.result === '1-0') state.whiteWins++; else if (l.result === '0-1') state.blackWins++; else state.draws++;
        state.positions += l.p ? l.p.length : 0;
      }
    }
    if (mode === 'match') state.pairScores.push((lines[0].a + lines[1].a) / 2);
    state.doneJobs++;
    doneThisSession++;
  };

  const next = (slot) => {
    if (stopping || finished) return;
    if (queue.length === 0) {
      if (slots.every((s) => s.job === null)) shutdown(fatal ? 1 : 0, false);
      return;
    }
    slot.job = queue.shift();
    slot.worker.postMessage({ type: 'job', index: slot.job });
  };
  const spawn = (slot) => {
    const w = new Worker(path.join(here, 'worker.mjs'), { workerData: { cfg } });
    slot.worker = w;
    w.on('message', (m) => {
      if (m.type === 'ready') { next(slot); return; }
      if (m.type === 'done') {
        append(m.lines); record(m.lines);
        slot.job = null;
        next(slot);
      } else if (m.type === 'fail') {
        const n = (retries.get(m.index) || 0) + 1;
        retries.set(m.index, n);
        log(`ERREUR sur la tâche ${m.index} (tentative ${n}) : ${m.error.split('\n')[0]}`);
        slot.job = null;
        if (n >= 2) { fatal = m.error; queue.length = 0; log(`Abandon : erreur répétée.\n${m.error}`); }
        else queue.unshift(m.index);
        next(slot);
      }
    });
    w.on('error', (e) => log(`worker en erreur : ${e.message}`));
    w.on('exit', (code) => {
      if (stopping || finished) return;
      const lost = slot.job;
      slot.job = null;
      if (lost !== null) {
        const n = (retries.get(lost) || 0) + 1;
        retries.set(lost, n);
        log(`Un worker s'est arrêté (code ${code}) pendant la tâche ${lost} : relance et nouvelle tentative (${n}/3).`);
        if (n >= 3) { fatal = `tâche ${lost} : le worker plante à chaque essai`; queue.length = 0; log(`Abandon : ${fatal}`); }
        else queue.unshift(lost);
      }
      spawn(slot);
    });
  };
  // Crochet de test : simule Ctrl+C (le gestionnaire est celui du vrai signal) au bout de N ms.
  if (process.env.ARENA_TEST_SIGINT_AFTER_MS) setTimeout(() => process.emit('SIGINT'), Number(process.env.ARENA_TEST_SIGINT_AFTER_MS)).unref();
  for (let i = 0; i < Math.min(workersN, queue.length); i++) {
    const slot = { worker: null, job: null };
    slots.push(slot);
    spawn(slot);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
