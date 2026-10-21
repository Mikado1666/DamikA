#!/usr/bin/env node
// DAMIKA — Étape 3.4 : enchaînement AUTOMATIQUE de ce qui suit la nuit 2 (docs/SESSION_DERNIERE.md, §3.3, bloc
// « À FAIRE APRÈS LA NUIT 2 »). Aucun lien avec l'appli, aucune dépendance (Node seul).
//
//   node training/chain-nuit2.mjs [--dry-run]
//
// 1. ATTEND que training/data/selfplay-nuit-2/summary.json existe ET dise « terminée » (interrupted = false, toutes les
//    parties faites) : test toutes les 60 s. Un summary.json d'une nuit INTERROMPUE (Ctrl+C) ne déclenche rien.
// 2. verify.mjs sur la nuit 2 (parties rejouées avec rules.js) : au moindre problème, ARRÊT NET (rien d'autre n'est lancé).
// 3. Réentraînement sur nuit 1 + nuit 2, mêmes réglages que V1b (λ = 0, 3 phases) → training/models/n12-l0.json
//    (fit.mjs l'écrit sous le nom n12-v1b-l0.json ; le script en fait la copie n12-l0.json).
// 4. Matchs d'arène : n12 contre V1b profondeur 6 graine 777 (400 paires), n12 contre V1b profondeur 8 graine 888 (400 paires),
//    n12 contre V0 profondeur 8 graine 999 (400 paires).
// 5. Test à TEMPS ÉGAL du bloc (commande existante : F1 `s33-F1.json` contre V1b, 100 ms par coup, 200 paires, graine 777).
//    NB : c'est le test de F1, pas de n12 (la commande du bloc n'a pas de variante n12).
// Chaque étape est journalisée dans training/logs/chain-nuit2.log ; l'état (étapes terminées) est dans
// training/logs/chain-nuit2.state.json : RELANCER LE SCRIPT saute les étapes terminées (et un match interrompu reprend où il
// en était, c'est arena.mjs qui reprend). Une étape qui échoue n'empêche pas celles qui n'en dépendent pas ; le script rend
// un code de sortie 1 s'il y a eu un échec, et la relance ne rejoue que les étapes non terminées.
// La mise en veille de Windows est bloquée pendant toute la durée (sleep.mjs), attente comprise.
//
// Options : --dry-run (affiche le plan et les commandes, ne lance RIEN, n'écrit rien) · --workers <n> (6) · --poll-sec <s> (60)
//   --nuit <dossier> (training/data/selfplay-nuit-2) · --state <fichier> · --log <fichier> · --stop-after <étape> (essais)
//   --allow-sleep (ne pas bloquer la veille).
// Ne modifie jamais le dossier de la nuit 2 : il n'est que LU (summary.json, puis games.jsonl par verify et fit).
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
const WORKERS = String(opt('workers', '6'));
const POLL_MS = Number(opt('poll-sec', '60')) * 1000;
const NUIT1 = 'training/data/selfplay-nuit-1';
const NUIT2 = opt('nuit', 'training/data/selfplay-nuit-2').replace(/\\/g, '/');
const LOG_FILE = path.resolve(ROOT, opt('log', 'training/logs/chain-nuit2.log'));
const STATE_FILE = path.resolve(ROOT, opt('state', 'training/logs/chain-nuit2.state.json'));
const STOP_AFTER = opt('stop-after', null);
const NODE = process.execPath;
const V1B = 'learned:training/models/v1b-l0.json';
const N12 = 'learned:training/models/n12-l0.json';

// --- Plan : une étape = un identifiant, une commande (tableau d'arguments, sans shell), des dépendances ----------------
const arenaMatch = (id, a, b, depth, pairs, seed, extra = []) => ({
  id, title: `match ${id}`, deps: [], argv: ['training/arena.mjs', 'match', '--a', a, '--b', b, '--depth', String(depth), ...extra,
    '--pairs', String(pairs), '--seed', String(seed), '--workers', WORKERS, '--out', `training/data/chain-${id}`],
});
const STEPS = [
  { id: 'verify', title: 'verify.mjs sur la nuit 2 (rules.js)', deps: [], argv: ['training/verify.mjs', NUIT2], haltOnFail: true },
  {
    id: 'fit', title: 'réentraînement nuit 1 + nuit 2 → training/models/n12-l0.json', deps: ['verify'],
    argv: ['training/fit.mjs', '--data', `${NUIT1},${NUIT2}`, '--lambda', '0', '--phases', '3', '--tag', 'n12', '--grids', 'none'],
    // fit.mjs nomme sa sortie n12-v1b-l0.json : copie sous le nom demandé.
    after() {
      const from = path.join(ROOT, 'training/models/n12-v1b-l0.json'), to = path.join(ROOT, 'training/models/n12-l0.json');
      if (!fs.existsSync(from)) throw new Error('fit.mjs n\'a pas écrit training/models/n12-v1b-l0.json');
      fs.copyFileSync(from, to);
      return 'copié vers training/models/n12-l0.json';
    },
  },
  { ...arenaMatch('n12-v1b-d6-s777', N12, V1B, 6, 400, 777), deps: ['fit'] },
  { ...arenaMatch('n12-v1b-d8-s888', N12, V1B, 8, 400, 888), deps: ['fit'] },
  { ...arenaMatch('n12-v0-d8-s999', N12, 'v0', 8, 400, 999), deps: ['fit'] },
  // Commande EXISTANTE du bloc §3.3 (point 2) : F1 contre V1b à temps égal.
  {
    ...arenaMatch('F1-v1b-t100', 'learned:training/models/s33-F1.json', V1B, 30, 200, 777, ['--time', '100']),
    title: 'test à TEMPS ÉGAL F1 contre V1b (commande du bloc §3.3)', deps: [],
  },
];
if (STOP_AFTER && !STEPS.some((s) => s.id === STOP_AFTER)) { console.error(`--stop-after : étape inconnue (${STEPS.map((s) => s.id).join(', ')})`); process.exit(2); }

const shown = (s) => `node ${s.argv.map((a) => (/[\s"]/.test(a) ? `"${a}"` : a)).join(' ')}`;

// --- État (reprise) et journal --------------------------------------------------------------------------------------------
function readState() {
  try { return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); } catch { return { steps: {} }; }
}
function writeState(st) {
  fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
  fs.writeFileSync(`${STATE_FILE}.tmp`, JSON.stringify(st, null, 1));
  fs.renameSync(`${STATE_FILE}.tmp`, STATE_FILE);
}
const stamp = () => new Date().toLocaleString('fr-FR', { hour12: false });
function log(msg) {
  const line = `[${stamp()}] ${msg}`;
  console.log(line);
  if (!DRY) { fs.mkdirSync(path.dirname(LOG_FILE), { recursive: true }); fs.appendFileSync(LOG_FILE, `${line}\n`); }
}

// --- Nuit 2 terminée ? ----------------------------------------------------------------------------------------------------
// Lecture seule de summary.json. Retourne { done, why }.
function nightStatus() {
  const f = path.resolve(ROOT, NUIT2, 'summary.json');
  if (!fs.existsSync(f)) return { done: false, why: 'summary.json absent (nuit 2 en cours)' };
  let s;
  try { s = JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return { done: false, why: 'summary.json illisible (en cours d\'écriture ?)' }; }
  if (s.interrupted !== false) return { done: false, why: 'summary.json présent mais la nuit 2 a été INTERROMPUE (relancer sa commande pour la terminer)' };
  if (typeof s.total === 'number' && typeof s.doneJobs === 'number' && s.doneJobs < s.total) return { done: false, why: `summary.json incomplet (${s.doneJobs}/${s.total})` };
  return { done: true, why: `terminée (${s.games ?? s.doneJobs} parties)` };
}

// --- Dry run ------------------------------------------------------------------------------------------------------------------
if (DRY) {
  const st = readState();
  console.log('MODE --dry-run : rien n\'est lancé, rien n\'est écrit.\n');
  console.log(`Dossier de travail : ${ROOT}`);
  console.log(`Nuit 2 : ${NUIT2}  → ${(() => { const n = nightStatus(); return `${n.done ? 'TERMINÉE' : 'pas prête'} (${n.why})`; })()}`);
  console.log(`Attente : test toutes les ${POLL_MS / 1000} s de ${path.join(NUIT2, 'summary.json')} (interrupted = false et toutes les parties faites)`);
  console.log(`Journal : ${path.relative(ROOT, LOG_FILE)} · État de reprise : ${path.relative(ROOT, STATE_FILE)} · workers des matchs : ${WORKERS}`);
  console.log(`Veille Windows : ${flag('allow-sleep') ? 'NON bloquée (--allow-sleep)' : 'bloquée pendant toute la durée (sleep.mjs)'}\n`);
  STEPS.forEach((s, i) => {
    const done = st.steps[s.id]?.done;
    console.log(`Étape ${i + 1}/${STEPS.length} — ${s.title}${done ? '  [DÉJÀ TERMINÉE : sautée à la relance]' : ''}`);
    console.log(`   ${shown(s)}`);
    if (s.deps.length) console.log(`   (nécessite : ${s.deps.join(', ')})`);
    if (s.haltOnFail) console.log('   (en cas d\'erreur : ARRÊT NET, aucune autre étape)');
    if (s.after) console.log('   (puis : copie training/models/n12-v1b-l0.json → training/models/n12-l0.json)');
  });
  const missing = ['training/models/v1b-l0.json', 'training/models/s33-F1.json', `${NUIT1}/games.jsonl`].filter((f) => !fs.existsSync(path.resolve(ROOT, f)));
  console.log(missing.length ? `\nATTENTION fichiers introuvables : ${missing.join(', ')}` : '\nFichiers d\'entrée présents : v1b-l0.json, s33-F1.json, nuit 1.');
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
  log(`=== chain-nuit2 démarré (pid ${process.pid}) — veille Windows : ${flag('allow-sleep') ? sleepInfo.reason : 'blocage en cours d\'armement'} ===`);
  const state = readState();

  // 1. Attente de la fin de la nuit 2 (inutile si tout ce qui en dépend est déjà fait).
  const needNight = !state.steps.verify?.done; // tout le reste en dépend, sauf le test à temps égal (qui attend quand même : machine au repos)
  if (needNight) {
    let polls = 0;
    for (;;) {
      const n = nightStatus();
      if (n.done) { log(`Nuit 2 ${n.why} : on enchaîne.`); break; }
      if (polls++ % 10 === 0) log(`En attente de la nuit 2 : ${n.why}`);
      if (interrupted) process.exit(130);
      await new Promise((r) => setTimeout(r, POLL_MS));
    }
    await new Promise((r) => setTimeout(r, 5000)); // laisse le processus de la nuit 2 finir de se fermer
  }

  const failed = new Set();
  let halted = false;
  for (const step of STEPS) {
    if (interrupted) break;
    if (state.steps[step.id]?.done) { log(`✓ ${step.title} : déjà terminée (reprise), sautée.`); if (STOP_AFTER === step.id) break; continue; }
    if (halted) { log(`— ${step.title} : non lancée (arrêt net après l'échec de verify).`); continue; }
    const blocking = step.deps.filter((d) => failed.has(d) || !state.steps[d]?.done);
    if (blocking.length) { log(`— ${step.title} : non lancée (dépend de ${blocking.join(', ')}, non terminée).`); failed.add(step.id); continue; }
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
      if (step.haltOnFail) { halted = true; log('ARRÊT NET : la vérification de la nuit 2 a échoué, aucune autre étape ne sera lancée. Corriger puis relancer le script.'); }
    }
    if (STOP_AFTER === step.id) { log(`--stop-after ${step.id} : arrêt volontaire.`); break; }
  }

  // Récapitulatif (dernières lignes de chaque étape terminée : pour un match, le score, l'Elo et l'intervalle).
  log('=== RÉCAPITULATIF ===');
  for (const step of STEPS) {
    const s = state.steps[step.id];
    log(`${s?.done ? '✔' : failed.has(step.id) ? '✘' : '·'} ${step.title}`);
    if (s?.done && (step.id.startsWith('n12-') || step.id.startsWith('F1-'))) {
      for (const l of s.tail.filter((x) => /Elo|score|Score|paires|Victoires|victoires|V\/N\/D/.test(x)).slice(-4)) log(`     ${l.trim()}`);
    }
  }
  log(failed.size || halted ? `=== terminé AVEC ÉCHEC(S) : ${[...failed].join(', ')} — relancer le script pour reprendre ===` : '=== tout est terminé ===');
  sleepInfo.stop();
  process.exit(failed.size || halted ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
