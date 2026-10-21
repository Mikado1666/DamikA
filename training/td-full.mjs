#!/usr/bin/env node
// DAMIKA — Validation du fichier COMPLET Turbo Dambase (≈ 1 Go, ≈ 763 000 parties) avec rules.js, LECTURE SEULE, en STREAMING.
//   node training/td-full.mjs [fichier.pdn] [--workers n] [--limit n] [--no-report] [--report docs/SESSION_DERNIERE.md]
//                             [--detail training/data/td-complet-detail.txt]
// Défaut : tests/pdn-local/td-complet/td-complet.pdn (dossier ignoré par git : ne JAMAIS le commiter ni le copier ailleurs).
// - Lecture ligne à ligne par flux (jamais readFileSync) ; les parties sont envoyées par lots à des worker_threads
//   (cœurs − 1 par défaut) qui les lisent (td-lib.mjs, indépendant de js/pdn/parser.js) et les rejouent avec rules.js.
// - Les résultats sont agrégés DANS L'ORDRE du fichier (déterministe), progression toutes les 50 000 parties.
// - Doublons : empreinte = séquence de coups seule (annotations !?+# retirées), parmi les parties légales ; la première
//   occurrence (ordre du fichier) est la partie « unique » retenue pour les statistiques sur parties uniques.
// - Parties avec [Setup]/[FEN] : comptées à part, jamais rejouées.
// - Rapport : section « Turbo Dambase complet » de docs/SESSION_DERNIERE.md (sans aucun nom de joueur) ; liste complète des
//   illégales (numéro, coup, raison ; sans nom) dans le fichier de détail (training/data/, ignoré par git).
// Ne modifie ni le moteur, ni les règles, ni l'appli. Aucun jeu de données filtré n'est créé.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import readline from 'node:readline';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { Worker, isMainThread, parentPort } from 'node:worker_threads';
import { TAG_RE, parseMovetext, replay } from './td-lib.mjs';

const SELF = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(SELF), '..');
const BATCH = 1000;
const PROGRESS_EVERY = 50000;
const EXPECTED = 763399;
const KEEP_TAGS = new Set(['Date', 'Result', 'WhiteRating', 'BlackRating', 'WhiteElo', 'BlackElo', 'Setup', 'FEN']);

// =============================================================================================================================
// Worker : lit et rejoue un lot de parties.
// =============================================================================================================================
if (!isMainThread) {
  parentPort.on('message', ({ n, games }) => {
    const out = games.map((g) => {
      const t = g.t;
      const o = { elo: !!(t.WhiteRating || t.BlackRating || t.WhiteElo || t.BlackElo), res: t.Result || '?', year: /^(\d{4})\./.exec(t.Date || '')?.[1] || null };
      if (t.Setup !== undefined || t.FEN !== undefined) { o.k = 'S'; return o; }
      const parsed = parseMovetext(g.b);
      o.res = t.Result || parsed.result || '?';
      o.tagVsText = !!(t.Result && parsed.result && t.Result !== parsed.result);
      o.variation = parsed.hasVariation;
      const r = replay(parsed);
      if (!r.ok) { o.k = 'I'; o.ply = r.ply; o.no = r.no; o.kind = r.kind; o.why = r.why; return o; }
      o.k = 'L';
      o.plies = r.plies;
      o.amb = r.ambiguous;
      o.noMoves = r.noMoves;
      o.loser = r.loser;
      o.first = parsed.moves.length ? parsed.moves[0].text.replace(/[!?+#]+$/, '') : '';
      o.hash = crypto.createHash('sha1').update(parsed.moves.map((m) => m.text.replace(/[!?+#]+$/, '')).join(' ')).digest('base64').slice(0, 16);
      return o;
    });
    parentPort.postMessage({ n, out });
  });
} else {
  main().catch((e) => { console.error(e); process.exit(1); });
}

// =============================================================================================================================
// Programme principal.
// =============================================================================================================================
async function main() {
  const args = process.argv.slice(2);
  const flag = (n) => args.includes(`--${n}`);
  const optVal = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 && i + 1 < args.length ? args[i + 1] : d; };
  const valued = new Set(['--workers', '--limit', '--report', '--detail']);
  const positional = args.filter((a, i) => !a.startsWith('--') && !(i > 0 && valued.has(args[i - 1])));
  const FILE = path.resolve(ROOT, positional[0] || 'tests/pdn-local/td-complet/td-complet.pdn');
  const REPORT = path.resolve(ROOT, optVal('report', 'docs/SESSION_DERNIERE.md'));
  const DETAIL = path.resolve(ROOT, optVal('detail', 'training/data/td-complet-detail.txt'));
  const WORKERS = Math.max(1, Number(optVal('workers', Math.max(1, os.cpus().length - 1))));
  const LIMIT = Number(optVal('limit', Infinity));
  const t0 = Date.now();
  const fmtDur = (ms) => { const s = Math.round(ms / 1000); return s >= 3600 ? `${Math.floor(s / 3600)} h ${String(Math.floor((s % 3600) / 60)).padStart(2, '0')} min` : s >= 60 ? `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, '0')} s` : `${s} s`; };

  // --- Agrégats ----------------------------------------------------------------------------------------------------------
  const st = {
    read: 0, legal: 0, illegal: 0, setup: 0, eventTags: 0, noTagGames: 0, elo: 0, tagVsText: 0, variations: 0, ambiguous: 0,
    noMovesEnd: 0, noMovesMismatch: 0, pliesLegal: 0, unique: 0, duplicates: 0, pliesUnique: 0,
    resultsAll: {}, resultsUnique: {}, decades: {}, kinds: {}, first: new Map(),
  };
  const seen = new Set();
  const illegalFirst = [];
  fs.mkdirSync(path.dirname(DETAIL), { recursive: true });
  const detail = fs.createWriteStream(DETAIL);
  detail.write('# Parties illégales du fichier complet Turbo Dambase : numéro (ordre du fichier, à partir de 1) ; coup ; demi-coup ; catégorie ; raison. Aucun nom de joueur.\n');

  const absorb = (start, out) => {
    out.forEach((o, i) => {
      const n = start + i + 1;
      st.resultsAll[o.res] = (st.resultsAll[o.res] || 0) + 1;
      if (o.elo) st.elo++;
      const dec = o.year ? `${Math.floor(Number(o.year) / 10) * 10}` : 'inconnue';
      st.decades[dec] = (st.decades[dec] || 0) + 1;
      if (o.k === 'S') { st.setup++; return; }
      if (o.tagVsText) st.tagVsText++;
      if (o.variation) st.variations++;
      if (o.k === 'I') {
        st.illegal++;
        st.kinds[o.kind] = (st.kinds[o.kind] || 0) + 1;
        if (illegalFirst.length < 20) illegalFirst.push({ n, no: o.no, ply: o.ply, kind: o.kind, why: o.why });
        detail.write(`${n} ; ${o.no} ; ${o.ply} ; ${o.kind} ; ${o.why}\n`);
        return;
      }
      st.legal++;
      st.pliesLegal += o.plies;
      st.ambiguous += o.amb;
      if (o.noMoves) { st.noMovesEnd++; if (o.res !== (o.loser === 'w' ? '0-1' : '1-0')) st.noMovesMismatch++; }
      if (seen.has(o.hash)) { st.duplicates++; return; }
      seen.add(o.hash);
      st.unique++;
      st.pliesUnique += o.plies;
      st.resultsUnique[o.res] = (st.resultsUnique[o.res] || 0) + 1;
      if (o.first) {
        const e = st.first.get(o.first) || { n: 0, '1-0': 0, '1/2-1/2': 0, '0-1': 0, other: 0 };
        e.n++; if (e[o.res] !== undefined) e[o.res]++; else e.other++;
        st.first.set(o.first, e);
      }
    });
  };

  // --- Pool de workers + lots en ordre ----------------------------------------------------------------------------------
  const pending = new Map(); // n → { start, resolve }
  const done = new Map(); // n → out (reçus hors ordre)
  let nextToAbsorb = 0;
  let inflight = 0;
  let lastProgress = 0;
  let freeSlot = null;
  const workers = [];
  const idle = [];
  const meta = new Map(); // n → start
  for (let i = 0; i < WORKERS; i++) {
    const w = new Worker(SELF);
    w.on('message', ({ n, out }) => {
      done.set(n, out);
      inflight--;
      idle.push(w);
      while (done.has(nextToAbsorb)) {
        const start = meta.get(nextToAbsorb);
        absorb(start, done.get(nextToAbsorb));
        done.delete(nextToAbsorb); meta.delete(nextToAbsorb);
        nextToAbsorb++;
        const processed = start + BATCH;
        if (Math.floor(processed / PROGRESS_EVERY) > lastProgress) {
          lastProgress = Math.floor(processed / PROGRESS_EVERY);
          const el = Date.now() - t0;
          console.log(`[${fmtDur(el)}] ${Math.min(processed, st.read)} parties traitées · légales ${st.legal} · illégales ${st.illegal} · Setup/FEN ${st.setup} · ${(processed / (el / 1000)).toFixed(0)} parties/s`);
        }
      }
      if (freeSlot) { const f = freeSlot; freeSlot = null; f(); }
    });
    w.on('error', (e) => { console.error('erreur worker :', e); process.exit(1); });
    workers.push(w); idle.push(w);
  }
  let batchNo = 0;
  const dispatch = async (games, start) => {
    while (idle.length === 0) await new Promise((r) => { freeSlot = r; });
    const w = idle.pop();
    const n = batchNo++;
    meta.set(n, start);
    inflight++;
    w.postMessage({ n, games });
  };

  // --- Lecture en flux ---------------------------------------------------------------------------------------------------
  const rl = readline.createInterface({ input: fs.createReadStream(FILE, { encoding: 'utf8', highWaterMark: 1 << 20 }), crlfDelay: Infinity });
  let cur = null; // { t: tags retenus, hasTag, body: [] }
  let batch = [];
  let batchStart = 0;
  let first = true;
  let stop = false;
  const flushGame = async () => {
    if (!cur) return;
    const g = cur; cur = null;
    if (!g.hasTag && !g.body.some((l) => l.trim())) return; // ligne(s) vide(s) isolées : pas une partie
    if (!g.hasTag) st.noTagGames++;
    if (st.read >= LIMIT) { stop = true; return; }
    st.read++;
    batch.push({ t: g.t, b: g.body.join('\n') });
    if (batch.length >= BATCH) { await dispatch(batch, batchStart); batchStart += batch.length; batch = []; }
  };
  for await (let line of rl) {
    if (first) { line = line.replace(/^﻿/, ''); first = false; }
    const tag = TAG_RE.exec(line);
    if (tag) {
      if (!cur || cur.body.some((l) => l.trim())) { await flushGame(); if (stop) break; cur = { t: {}, hasTag: true, body: [] }; }
      if (tag[1] === 'Event') st.eventTags++;
      if (KEEP_TAGS.has(tag[1])) cur.t[tag[1]] = tag[2];
    } else {
      if (!cur) cur = { t: {}, hasTag: false, body: [] };
      cur.body.push(line);
    }
  }
  rl.close();
  if (!stop) await flushGame();
  if (batch.length) { await dispatch(batch, batchStart); batchStart += batch.length; batch = []; }
  while (inflight > 0 || nextToAbsorb < batchNo) await new Promise((r) => setTimeout(r, 50));
  await new Promise((r) => detail.end(r));
  await Promise.all(workers.map((w) => w.terminate()));
  const elapsed = Date.now() - t0;

  // --- Rapport -----------------------------------------------------------------------------------------------------------
  const pct = (a, b) => (b ? `${(100 * a / b).toFixed(1)} %` : '–');
  const sortedObj = (o) => Object.entries(o).sort((a, b) => b[1] - a[1]);
  const lines = [];
  const P = (s = '') => lines.push(s);
  const fileSize = fs.statSync(FILE).size;
  P(`Fichier : ${path.relative(ROOT, FILE).replace(/\\/g, '/')} (${(fileSize / 1e6).toFixed(0)} Mo, lecture seule en flux, jamais commité) · ${WORKERS} worker(s) · lots de ${BATCH} parties.`);
  P();
  P('### 1. Parties lues');
  P(`- **${st.read}** parties lues (attendu : ${EXPECTED}) → ${st.read === EXPECTED ? '**identique**' : `**ÉCART de ${st.read - EXPECTED}**`}. Contrôle indépendant : ${st.eventTags} balises [Event] ; parties sans aucune balise : ${st.noTagGames}.`);
  P();
  P('### 2. Légalité (rejeu avec rules.js depuis la position initiale)');
  P(`- **Légales : ${st.legal}** · **illégales : ${st.illegal}** · avec position de départ ([Setup]/[FEN], comptées à part, ignorées) : **${st.setup}**.`);
  if (st.illegal) {
    P('- Décompte par type de raison :');
    for (const [k, v] of sortedObj(st.kinds)) P(`  - ${k} : ${v}`);
    P('- Les 20 premières illégales :');
    for (const x of illegalFirst) P(`  - partie n° ${x.n}, coup ${x.no} (demi-coup ${x.ply}) : ${x.why}`);
    P(`- Liste complète (numéro, coup, raison ; sans noms) : \`${path.relative(ROOT, DETAIL).replace(/\\/g, '/')}\` (ignoré par git).`);
  } else P('- Aucune partie illégale.');
  P(`- Cohérence : balise Result ≠ résultat écrit dans les coups : ${st.tagVsText} ; parties légales finies sur « plus de coup » : ${st.noMovesEnd}, dont ${st.noMovesMismatch} avec un résultat incohérent avec le camp bloqué ; parties avec variantes (…) (ignorées) : ${st.variations} ; rafles ambiguës (même départ et arrivée, pièces prises différentes) : ${st.ambiguous}.`);
  P();
  P('### 3. Doublons (empreinte = séquence de coups seule, parmi les parties légales)');
  P(`- **Uniques : ${st.unique}** · **doublons : ${st.duplicates}** (${pct(st.duplicates, st.legal)} des parties légales).`);
  P();
  P('### 4. Résultats, longueur, Elo, dates');
  P(`- Résultats, toutes parties : ${sortedObj(st.resultsAll).map(([k, v]) => `${k} : ${v} (${pct(v, st.read)})`).join(' · ')}.`);
  P(`- Résultats, parties légales uniques : ${sortedObj(st.resultsUnique).map(([k, v]) => `${k} : ${v} (${pct(v, st.unique)})`).join(' · ')}.`);
  P(`- Longueur moyenne : **${(st.pliesLegal / Math.max(1, st.legal) / 2).toFixed(1)} coups complets** sur les parties légales (${(st.pliesLegal / Math.max(1, st.legal)).toFixed(1)} demi-coups) ; ${(st.pliesUnique / Math.max(1, st.unique) / 2).toFixed(1)} sur les uniques.`);
  P(`- Parties avec au moins un Elo : **${st.elo}** (${pct(st.elo, st.read)}).`);
  P(`- Décennies (balise Date, toutes parties) : ${Object.entries(st.decades).sort((a, b) => (a[0] === 'inconnue' ? 1 : b[0] === 'inconnue' ? -1 : Number(a[0]) - Number(b[0]))).map(([k, v]) => `${k === 'inconnue' ? 'date inconnue' : `${k}s`} : ${v}`).join(' · ')}.`);
  P();
  P('### 5. Les 10 premiers coups Blancs les plus fréquents (parties légales uniques)');
  P('| Coup | Parties | Fréquence | Blancs gagnent | Nulles | Noirs gagnent |');
  P('|---|---|---|---|---|---|');
  for (const [k, e] of [...st.first.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, 10)) {
    P(`| ${k} | ${e.n} | ${pct(e.n, st.unique)} | ${e['1-0']} (${pct(e['1-0'], e.n)}) | ${e['1/2-1/2']} (${pct(e['1/2-1/2'], e.n)}) | ${e['0-1']} (${pct(e['0-1'], e.n)}) |`);
  }
  P();
  P('### 6. Temps de traitement');
  P(`- **${fmtDur(elapsed)}** (${(st.read / (elapsed / 1000)).toFixed(0)} parties/s, ${WORKERS} worker(s)).`);

  console.log(`\n${lines.join('\n').replace(/\*\*/g, '')}`);
  if (!flag('no-report')) {
    const heading = '## Turbo Dambase complet';
    const section = `${heading} (${new Date().toLocaleDateString('fr-FR')}, \`node training/td-full.mjs\`, sans noms de joueurs)\n\n${lines.join('\n')}\n`;
    let doc = fs.existsSync(REPORT) ? fs.readFileSync(REPORT, 'utf8') : '';
    const eol = doc.includes('\r\n') ? '\r\n' : '\n';
    const body = section.replace(/\n/g, eol);
    const re = new RegExp(`${heading}[^\\n]*\\r?\\n[\\s\\S]*?(?=\\r?\\n## |$)`);
    doc = re.test(doc) ? doc.replace(re, () => body.trimEnd()) : `${doc.trimEnd()}${eol}${eol}${body}`;
    fs.writeFileSync(REPORT, doc);
    console.log(`\nRapport écrit dans ${path.relative(ROOT, REPORT).replace(/\\/g, '/')} (section « Turbo Dambase complet »).`);
  }
  process.exit(0);
}
