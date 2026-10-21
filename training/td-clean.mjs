#!/usr/bin/env node
// DAMIKA — Chantier A : jeu de données PROPRE à partir de Turbo Dambase (lecture du fichier complet en flux, écriture d'un PDN filtré).
//   node training/td-clean.mjs [entrée.pdn] [--out dossier] [--workers n] [--limit n] [--report docs/SESSION_DERNIERE.md] [--no-report]
// Défaut : tests/pdn-local/td-complet/td-complet.pdn → tests/pdn-local/td-propre/ (td-propre.pdn + rapport.txt). Ces dossiers sont
// ignorés par git : les noms de joueurs (balises White/Black…) sont conservés dans le PDN de sortie, EN LOCAL SEULEMENT. Le rapport,
// lui, ne contient aucun nom. Aucun filtre sur l'Elo, pas de livre d'ouvertures, pas d'apprentissage.
// Une partie est exclue pour le PREMIER motif rencontré, dans cet ordre :
//   1. position de départ ([Setup]/[FEN])      2. variantes (…) dans les coups      3. illégale (rejeu rules.js)
//   4. résultat absent ou « * »                5. balise Result ≠ résultat écrit dans les coups
//   6. « plus de coup » incohérent avec le résultat (le camp bloqué doit avoir perdu)      7. doublon (empreinte = séquence de coups)
// Le doublon est testé en dernier : seules les parties qui passent 1 à 6 comptent comme première occurrence.
// Sortie : tags d'origine (dans l'ordre) + Result garanti, coups ré-écrits sans commentaire ni annotation (!?+#).
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
const REASONS = [
  ['setup', 'position de départ ([Setup]/[FEN])'],
  ['variation', 'variantes (…) dans les coups'],
  ['illegal', 'illégale (rejeu rules.js)'],
  ['noresult', 'résultat absent ou « * »'],
  ['tagtext', 'balise Result ≠ résultat des coups'],
  ['nomove', '« plus de coup » incohérent avec le résultat'],
  ['dup', 'doublon (séquence de coups déjà gardée)'],
];
const ELO_TAGS = [['WhiteRating', 'WhiteElo'], ['BlackRating', 'BlackElo']];

// =============================================================================================================================
// Worker : classe un lot de parties (tout sauf le doublon, décidé dans l'ordre du fichier par le programme principal).
// =============================================================================================================================
if (!isMainThread) {
  parentPort.on('message', ({ n, games }) => {
    const out = games.map((g) => {
      const t = Object.fromEntries(g.tags);
      const year = /^(\d{4})\./.exec(t.Date || '')?.[1] || null;
      const elos = ELO_TAGS.map((names) => { const v = Number(names.map((k) => t[k]).find((x) => x && /^\d+$/.test(x))); return v > 0 ? v : null; }).filter((v) => v !== null);
      const o = { year, elo: elos.length ? Math.min(...elos) : null };
      if (t.Setup !== undefined || t.FEN !== undefined) { o.why = 'setup'; return o; }
      const parsed = parseMovetext(g.b);
      if (parsed.hasVariation) { o.why = 'variation'; return o; }
      const r = replay(parsed);
      if (!r.ok) { o.why = 'illegal'; return o; }
      const tagRes = t.Result && t.Result !== '?' ? t.Result : null;
      const res = tagRes || parsed.result;
      if (!res || res === '*') { o.why = 'noresult'; return o; }
      if (tagRes && parsed.result && tagRes !== parsed.result) { o.why = 'tagtext'; return o; }
      if (r.noMoves && res !== (r.loser === 'w' ? '0-1' : '1-0')) { o.why = 'nomove'; return o; }
      const clean = parsed.moves.map((m) => m.text.replace(/[!?+#]+$/, ''));
      o.hash = crypto.createHash('sha1').update(clean.join(' ')).digest('base64').slice(0, 16);
      o.plies = clean.length;
      // Texte PDN complet de la partie gardée.
      const tags = g.tags.filter(([k]) => k !== 'Result').concat([['Result', res]]);
      const mt = [];
      clean.forEach((m, i) => mt.push(i % 2 === 0 ? `${i / 2 + 1}. ${m}` : m));
      mt.push(res);
      const wrapped = []; let lineStr = '';
      for (const w of mt) { if (lineStr && lineStr.length + 1 + w.length > 78) { wrapped.push(lineStr); lineStr = w; } else lineStr = lineStr ? `${lineStr} ${w}` : w; }
      if (lineStr) wrapped.push(lineStr);
      o.pdn = `${tags.map(([k, v]) => `[${k} "${v}"]`).join('\n')}\n\n${wrapped.join('\n')}\n\n`;
      return o;
    });
    parentPort.postMessage({ n, out });
  });
} else {
  main().catch((e) => { console.error(e); process.exit(1); });
}

// =============================================================================================================================
async function main() {
  const args = process.argv.slice(2);
  const flag = (n) => args.includes(`--${n}`);
  const optVal = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 && i + 1 < args.length ? args[i + 1] : d; };
  const valued = new Set(['--workers', '--limit', '--report', '--out']);
  const positional = args.filter((a, i) => !a.startsWith('--') && !(i > 0 && valued.has(args[i - 1])));
  const FILE = path.resolve(ROOT, positional[0] || 'tests/pdn-local/td-complet/td-complet.pdn');
  const OUT = path.resolve(ROOT, optVal('out', 'tests/pdn-local/td-propre'));
  const REPORT = path.resolve(ROOT, optVal('report', 'docs/SESSION_DERNIERE.md'));
  const WORKERS = Math.max(1, Number(optVal('workers', Math.max(1, os.cpus().length - 1))));
  const LIMIT = Number(optVal('limit', Infinity));
  const t0 = Date.now();
  const fmtDur = (ms) => { const s = Math.round(ms / 1000); return s >= 3600 ? `${Math.floor(s / 3600)} h ${String(Math.floor((s % 3600) / 60)).padStart(2, '0')} min` : s >= 60 ? `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, '0')} s` : `${s} s`; };

  // Garde-fou : la sortie doit rester dans un dossier ignoré par git (données nominatives).
  const relOut = path.relative(ROOT, OUT).replace(/\\/g, '/');
  if (relOut.startsWith('..') || !(relOut.startsWith('tests/pdn-local/') || relOut.startsWith('training/data/'))) {
    console.error(`Sortie refusée (${relOut}) : doit être sous tests/pdn-local/ ou training/data/ (dossiers ignorés par git).`); process.exit(1);
  }
  fs.mkdirSync(OUT, { recursive: true });
  const outFile = path.join(OUT, 'td-propre.pdn');
  const sink = fs.createWriteStream(outFile);

  const st = { read: 0, kept: 0, plies: 0, why: Object.fromEntries(REASONS.map(([k]) => [k, 0])), elo: {}, decades: {}, keptDecades: {} };
  const seen = new Set();
  const eloBin = (e) => (e === null ? 'inconnu' : `${Math.floor(e / 100) * 100}`);
  const decOf = (y) => (y ? `${Math.floor(Number(y) / 10) * 10}` : 'inconnue');
  const absorb = (out) => {
    for (const o of out) {
      let why = o.why;
      if (!why) { if (seen.has(o.hash)) why = 'dup'; else seen.add(o.hash); }
      if (why) { st.why[why]++; continue; }
      st.kept++; st.plies += o.plies;
      const b = eloBin(o.elo); st.elo[b] = (st.elo[b] || 0) + 1;
      const d = decOf(o.year); st.decades[d] = (st.decades[d] || 0) + 1;
      sink.write(o.pdn);
    }
  };

  // --- Pool de workers, lots absorbés dans l'ordre du fichier ----------------------------------------------------------
  const done = new Map();
  let nextToAbsorb = 0, inflight = 0, lastProgress = 0, freeSlot = null, batchNo = 0;
  const idle = []; const workers = [];
  for (let i = 0; i < WORKERS; i++) {
    const w = new Worker(SELF);
    w.on('message', ({ n, out }) => {
      done.set(n, out); inflight--; idle.push(w);
      while (done.has(nextToAbsorb)) {
        const o = done.get(nextToAbsorb); done.delete(nextToAbsorb); nextToAbsorb++;
        absorb(o);
        const processed = nextToAbsorb * BATCH;
        if (Math.floor(processed / PROGRESS_EVERY) > lastProgress) {
          lastProgress = Math.floor(processed / PROGRESS_EVERY);
          console.log(`[${fmtDur(Date.now() - t0)}] ~${processed} parties traitées · gardées ${st.kept}`);
        }
      }
      if (freeSlot) { const f = freeSlot; freeSlot = null; f(); }
    });
    w.on('error', (e) => { console.error('erreur worker :', e); process.exit(1); });
    workers.push(w); idle.push(w);
  }
  const dispatch = async (games) => {
    while (idle.length === 0) await new Promise((r) => { freeSlot = r; });
    const w = idle.pop(); inflight++; w.postMessage({ n: batchNo++, games });
  };

  // --- Lecture en flux (même découpage en parties que td-full.mjs) -------------------------------------------------------
  const rl = readline.createInterface({ input: fs.createReadStream(FILE, { encoding: 'utf8', highWaterMark: 1 << 20 }), crlfDelay: Infinity });
  let cur = null, batch = [], first = true, stop = false;
  const flushGame = async () => {
    if (!cur) return;
    const g = cur; cur = null;
    if (!g.hasTag && !g.body.some((l) => l.trim())) return;
    if (st.read >= LIMIT) { stop = true; return; }
    st.read++;
    batch.push({ tags: g.tags, b: g.body.join('\n') });
    if (batch.length >= BATCH) { await dispatch(batch); batch = []; }
  };
  for await (let line of rl) {
    if (first) { line = line.replace(/^﻿/, ''); first = false; }
    const tag = TAG_RE.exec(line);
    if (tag) {
      if (!cur || cur.body.some((l) => l.trim())) { await flushGame(); if (stop) break; cur = { tags: [], hasTag: true, body: [] }; }
      cur.tags.push([tag[1], tag[2]]);
    } else {
      if (!cur) cur = { tags: [], hasTag: false, body: [] };
      cur.body.push(line);
    }
  }
  rl.close();
  if (!stop) await flushGame();
  if (batch.length) await dispatch(batch);
  while (inflight > 0 || nextToAbsorb < batchNo) await new Promise((r) => setTimeout(r, 50));
  await new Promise((r) => sink.end(r));
  await Promise.all(workers.map((w) => w.terminate()));
  const elapsed = Date.now() - t0;

  // --- Rapport (aucun nom de joueur) -------------------------------------------------------------------------------------
  const pct = (a, b) => (b ? `${(100 * a / b).toFixed(1)} %` : '–');
  const keyNum = (a, b) => (a[0] === 'inconnu' || a[0] === 'inconnue' ? 1 : b[0] === 'inconnu' || b[0] === 'inconnue' ? -1 : Number(a[0]) - Number(b[0]));
  const excluded = st.read - st.kept;
  const L = [];
  L.push(`Entrée : ${path.relative(ROOT, FILE).replace(/\\/g, '/')} · sortie : ${relOut}/td-propre.pdn (${(fs.statSync(outFile).size / 1e6).toFixed(0)} Mo, local, jamais commité) · ${WORKERS} worker(s).`);
  L.push('');
  L.push(`### Bilan : ${st.read} parties lues · **${st.kept} gardées** (${pct(st.kept, st.read)}) · ${excluded} exclues.`);
  L.push('');
  L.push('### Exclusions (premier motif rencontré, dans cet ordre)');
  for (const [k, label] of REASONS) L.push(`- ${label} : ${st.why[k]}`);
  L.push('');
  L.push(`### Parties gardées : longueur moyenne ${(st.plies / Math.max(1, st.kept) / 2).toFixed(1)} coups complets`);
  L.push('');
  L.push('### Elo (minimum des deux joueurs, tranches de 100 ; « inconnu » = aucun Elo)');
  for (const [k, v] of Object.entries(st.elo).sort(keyNum)) L.push(`- ${k === 'inconnu' ? 'inconnu' : `${k}–${Number(k) + 99}`} : ${v} (${pct(v, st.kept)})`);
  L.push('');
  L.push('### Décennies (balise Date)');
  for (const [k, v] of Object.entries(st.decades).sort(keyNum)) L.push(`- ${k === 'inconnue' ? 'date inconnue' : `${k}s`} : ${v} (${pct(v, st.kept)})`);
  L.push('');
  L.push(`### Temps : **${fmtDur(elapsed)}** (${(st.read / (elapsed / 1000)).toFixed(0)} parties/s)`);

  const text = L.join('\n');
  console.log(`\n${text.replace(/\*\*/g, '')}`);
  fs.writeFileSync(path.join(OUT, 'rapport.txt'), text.replace(/\*\*/g, '') + '\n');
  if (!flag('no-report')) {
    const heading = '## Jeu de données propre Turbo Dambase (chantier A)';
    const section = `${heading} — résultats (${new Date().toLocaleDateString('fr-FR')}, \`node training/td-clean.mjs\`, sans noms de joueurs)\n\n${text}\n`;
    let doc = fs.existsSync(REPORT) ? fs.readFileSync(REPORT, 'utf8') : '';
    const eol = doc.includes('\r\n') ? '\r\n' : '\n';
    const body = section.replace(/\n/g, eol);
    const re = new RegExp(`${heading}[^\\n]*\\r?\\n[\\s\\S]*?(?=\\r?\\n## |$)`);
    doc = re.test(doc) ? doc.replace(re, () => body.trimEnd()) : `${doc.trimEnd()}${eol}${eol}${body}`;
    fs.writeFileSync(REPORT, doc);
    console.log(`\nRapport écrit dans ${path.relative(ROOT, REPORT).replace(/\\/g, '/')}.`);
  }
  process.exit(0);
}
