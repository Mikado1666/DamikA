#!/usr/bin/env node
// DAMIKA — Validation d'un échantillon de parties Turbo Dambase (export PDN) avec rules.js, LECTURE SEULE.
//   node training/td-check.mjs [fichier.pdn] [--no-report] [--report docs/SESSION_DERNIERE.md]
// Défaut : tests/pdn-local/td-echantillon-1000.pdn (dossier ignoré par git : ne jamais le commiter ni le copier ailleurs).
// 1. Lit le PDN avec un lecteur INDÉPENDANT de js/pdn/parser.js (BOM, CRLF, commentaires {…}, numéros de coups, résultat dans
//    le texte des coups) ; le résultat est ensuite comparé à parsePdn() (nombre de parties et de coups) pour dire si un écart
//    vient de NOTRE lecture.
// 2. Rejoue chaque partie depuis la position initiale avec rules.js (generateLegalMoves). Parties avec [Setup]/[FEN] : comptées
//    à part, ignorées.
// 3. Signale toute partie illégale : numéro (ordre dans le fichier, à partir de 1), coup, raison. Aucun nom de joueur n'est
//    jamais affiché ni écrit.
// 4. Statistiques, puis rapport dans docs/SESSION_DERNIERE.md (section « Échantillon Turbo Dambase », remplacée à chaque exécution).
// Ne modifie ni le moteur ni l'appli. Code de sortie 0 même s'il y a des parties illégales (c'est un constat, pas un test).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initialBoard, generateLegalMoves, applyCaptureSequence, applySimpleMove } from '../js/engine/rules.js';
import { parsePdn } from '../js/pdn/parser.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const flag = (n) => args.includes(`--${n}`);
const optVal = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 && i + 1 < args.length ? args[i + 1] : d; };
const positional = args.filter((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1] === '--report'));
const FILE = path.resolve(ROOT, positional[0] || 'tests/pdn-local/td-echantillon-1000.pdn');
const REPORT = path.resolve(ROOT, optVal('report', 'docs/SESSION_DERNIERE.md'));

// --- Lecture du PDN --------------------------------------------------------------------------------------------------------
const text = fs.readFileSync(FILE, 'utf8').replace(/^﻿/, '').replace(/\r\n?/g, '\n');
const RESULTS = new Set(['1-0', '0-1', '1/2-1/2', '*']);

function readGames(src) {
  const games = [];
  let cur = null;
  const flush = () => { if (cur && (Object.keys(cur.tags).length || cur.body.length)) games.push(cur); cur = null; };
  for (const line of src.split('\n')) {
    const tag = /^\s*\[(\w+)\s+"(.*)"\]\s*$/.exec(line);
    if (tag) {
      if (!cur || cur.body.some((l) => l.trim())) { flush(); cur = { tags: {}, body: [] }; } // nouvelle partie dès qu'une balise suit du texte de coups
      cur.tags[tag[1]] = tag[2];
    } else {
      if (!cur) cur = { tags: {}, body: [] };
      cur.body.push(line);
    }
  }
  flush();
  return games.map((g) => {
    // Texte de coups : commentaires {…} (éventuellement sur plusieurs lignes) et variantes (…) retirés, puis jetons.
    const noComments = g.body.join('\n').replace(/\{[^}]*\}/g, ' ').replace(/;[^\n]*/g, ' ');
    let depth = 0;
    let hasVariation = false;
    let raw = '';
    for (const ch of noComments) { // variantes (…), imbriquées ou non : ignorées (seule la ligne principale est rejouée)
      if (ch === '(') { depth++; hasVariation = true; raw += ' '; } else if (ch === ')') { depth = Math.max(0, depth - 1); raw += ' '; } else if (depth === 0) raw += ch;
    }
    const moves = [];
    let result = null;
    for (const tok of raw.split(/\s+/)) {
      if (!tok) continue;
      if (RESULTS.has(tok)) { result = tok; continue; }
      const t = tok.replace(/^\d+\.(\.\.)?/, ''); // « 12. », « 12... » ou collé : « 12.32-28 »
      if (!t || /^\$\d+$/.test(t)) continue;
      const m = /^(\d{1,2})([-x])(\d{1,2})((?:x\d{1,2})*)[!?+#]*$/.exec(t);
      if (m) moves.push({ text: t, from: Number(m[1]), sep: m[2], to: Number(m[3]), via: m[4] ? m[4].split('x').filter(Boolean).map(Number) : [] });
      else moves.push({ text: t, bad: true });
    }
    return { tags: g.tags, moves, result, hasVariation };
  });
}

// --- Rejeu avec rules.js ---------------------------------------------------------------------------------------------------
function replay(g) {
  let board = initialBoard();
  let side = 'w';
  let ambiguous = 0;
  for (let i = 0; i < g.moves.length; i++) {
    const mv = g.moves[i];
    const no = `${Math.floor(i / 2) + 1}${i % 2 ? '...' : '.'} ${mv.text}`;
    if (mv.bad) return { ok: false, ply: i + 1, no, why: 'jeton non reconnu comme un coup' };
    const { captures, simples } = generateLegalMoves(board, side);
    if (captures.length === 0 && simples.length === 0) return { ok: false, ply: i + 1, no, why: 'la partie devrait être terminée (aucun coup légal)' };
    const piece = board[mv.from];
    if (!piece) return { ok: false, ply: i + 1, no, why: `case de départ ${mv.from} vide` };
    if (piece.color !== side) return { ok: false, ply: i + 1, no, why: `pièce en ${mv.from} de la mauvaise couleur (trait aux ${side === 'w' ? 'Blancs' : 'Noirs'})` };
    if (mv.sep === 'x') {
      if (captures.length === 0) return { ok: false, ply: i + 1, no, why: 'prise notée (x) mais aucune prise légale' };
      let cands = captures.filter((s) => s[0].from === mv.from && s[s.length - 1].to === mv.to);
      if (mv.via.length) { // chemin complet noté : cases d'arrivée de chaque étape
        const wanted = [mv.to, ...mv.via];
        cands = captures.filter((s) => s[0].from === mv.from && s.length === wanted.length && s.every((st, j) => st.to === wanted[j]));
      }
      if (cands.length === 0) {
        const same = captures.filter((s) => s[0].from === mv.from);
        return { ok: false, ply: i + 1, no, why: same.length ? `prise ${mv.from}x${mv.to} impossible (autres prises de cette pièce vers ${[...new Set(same.map((s) => s[s.length - 1].to))].join(', ')})` : `la pièce en ${mv.from} n'a pas de prise (prises légales : ${[...new Set(captures.map((s) => `${s[0].from}x${s[s.length - 1].to}`))].join(', ')})` };
      }
      if (new Set(cands.map((s) => s.map((x) => x.capturedThisStep).sort((a, b) => a - b).join(','))).size > 1) ambiguous++;
      board = applyCaptureSequence(board, piece, cands[0]).board;
    } else {
      if (captures.length > 0) return { ok: false, ply: i + 1, no, why: `coup simple alors qu'une prise est obligatoire (prises légales : ${[...new Set(captures.map((s) => `${s[0].from}x${s[s.length - 1].to}`))].join(', ')})` };
      const found = simples.find((m) => m.from === mv.from && m.to === mv.to);
      if (!found) return { ok: false, ply: i + 1, no, why: `coup ${mv.from}-${mv.to} non légal pour cette pièce` };
      board = applySimpleMove(board, piece, found).board;
    }
    side = side === 'w' ? 'b' : 'w';
  }
  const end = generateLegalMoves(board, side);
  const noMoves = end.captures.length === 0 && end.simples.length === 0;
  return { ok: true, plies: g.moves.length, ambiguous, noMoves, loser: noMoves ? side : null };
}

// --- Exécution -------------------------------------------------------------------------------------------------------------
const games = readGames(text);
const ours = parsePdn(text);
const stats = { total: games.length, legal: 0, illegal: 0, setup: 0, plies: 0, ambiguous: 0, elo: 0, results: {}, resultsLegal: {}, noMovesMismatch: 0, noMovesEnd: 0, noResultTag: 0, variations: 0, tagVsText: 0 };
const illegal = [];
const firstMoves = new Map();
games.forEach((g, idx) => {
  const n = idx + 1;
  const result = g.tags.Result || g.result || '?';
  stats.results[result] = (stats.results[result] || 0) + 1;
  if (!g.tags.Result) stats.noResultTag++;
  if (g.hasVariation) stats.variations++;
  if (g.tags.Result && g.result && g.tags.Result !== g.result) stats.tagVsText++;
  if (g.tags.WhiteRating || g.tags.BlackRating || g.tags.WhiteElo || g.tags.BlackElo) stats.elo++;
  if (g.tags.Setup !== undefined || g.tags.FEN !== undefined) { stats.setup++; return; }
  const r = replay(g);
  if (!r.ok) { stats.illegal++; illegal.push({ n, ...r }); return; }
  stats.legal++;
  stats.plies += r.plies;
  stats.ambiguous += r.ambiguous;
  stats.resultsLegal[result] = (stats.resultsLegal[result] || 0) + 1;
  if (r.noMoves) {
    stats.noMovesEnd++;
    const expected = r.loser === 'w' ? '0-1' : '1-0';
    if (result !== expected) stats.noMovesMismatch++;
  }
  if (g.moves.length) {
    const k = g.moves[0].text;
    const e = firstMoves.get(k) || { n: 0, '1-0': 0, '1/2-1/2': 0, '0-1': 0, other: 0 };
    e.n++; if (e[result] !== undefined) e[result]++; else e.other++;
    firstMoves.set(k, e);
  }
});

// Comparaison avec NOTRE lecture (parsePdn) : même nombre de parties, même nombre de coups ?
let readingDiffs = 0;
const readingNote = [];
if (ours.length !== games.length) readingNote.push(`parsePdn() lit ${ours.length} parties contre ${games.length} pour le lecteur indépendant`);
for (let i = 0; i < Math.min(ours.length, games.length); i++) {
  if (ours[i].moves.length !== games[i].moves.length) { readingDiffs++; if (readingNote.length < 8) readingNote.push(`partie ${i + 1} : ${ours[i].moves.length} coups lus par parsePdn() contre ${games[i].moves.length}`); }
}

const avgPlies = stats.legal ? stats.plies / stats.legal : 0;
const pct = (a, b) => (b ? `${(100 * a / b).toFixed(1)} %` : '–');
const topFirst = [...firstMoves.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, 10);

const lines = [];
const P = (s = '') => lines.push(s);
P(`Fichier : ${path.relative(ROOT, FILE).replace(/\\/g, '/')} (lecture seule, jamais commité).`);
P();
P('### Résultat');
P(`- Parties lues : **${stats.total}** · rejouées depuis la position initiale : ${stats.legal + stats.illegal} · **légales : ${stats.legal}** · **illégales : ${stats.illegal}** · avec position de départ ([Setup]/[FEN]) : ${stats.setup} (comptées à part, ignorées).`);
P(`- Longueur moyenne des parties légales : **${(avgPlies / 2).toFixed(1)} coups complets** (${avgPlies.toFixed(1)} demi-coups ; ${stats.plies} demi-coups au total).`);
P(`- Parties avec au moins un Elo : **${stats.elo}** sur ${stats.total}.`);
P(`- Répartition des résultats (toutes parties, balise Result) : ${Object.entries(stats.results).sort().map(([k, v]) => `${k} : ${v} (${pct(v, stats.total)})`).join(' · ')}.`);
P(`- Cohérence : balise Result ≠ résultat écrit dans le texte des coups : ${stats.tagVsText} partie(s) ; parties légales finies sur « plus de coup » : ${stats.noMovesEnd}, dont ${stats.noMovesMismatch} avec un résultat ne correspondant pas au camp bloqué ; parties contenant des variantes (…) ignorées : ${stats.variations} ; rafles ambiguës (même départ et arrivée, pièces prises différentes, la première retenue) : ${stats.ambiguous}.`);
P(`- Lecture par l'appli (parsePdn) : ${readingNote.length ? `${readingDiffs} partie(s) dont le nombre de coups diffère du lecteur indépendant (${readingNote.join(' ; ')}${readingDiffs > readingNote.length ? ' ; …' : ''})` : 'même nombre de parties et même nombre de coups pour chaque partie'}.`);
P();
P('### Les 10 premiers coups Blancs les plus fréquents (parties légales)');
P('| Coup | Parties | Fréquence | Blancs gagnent | Nulles | Noirs gagnent |');
P('|---|---|---|---|---|---|');
for (const [k, e] of topFirst) P(`| ${k} | ${e.n} | ${pct(e.n, stats.legal)} | ${e['1-0']} (${pct(e['1-0'], e.n)}) | ${e['1/2-1/2']} (${pct(e['1/2-1/2'], e.n)}) | ${e['0-1']} (${pct(e['0-1'], e.n)}) |`);
P();
P(`### Parties illégales (${illegal.length})`);
if (!illegal.length) P('Aucune.');
for (const x of illegal.slice(0, 60)) P(`- partie n° ${x.n}, coup ${x.no} (demi-coup ${x.ply}) : ${x.why}`);
if (illegal.length > 60) P(`- … et ${illegal.length - 60} autres (liste complète à l'écran à chaque exécution).`);

// --- Sortie écran ----------------------------------------------------------------------------------------------------------
console.log(lines.join('\n').replace(/\*\*/g, ''));
if (illegal.length > 60) for (const x of illegal.slice(60)) console.log(`- partie n° ${x.n}, coup ${x.no} : ${x.why}`);

// --- Rapport ---------------------------------------------------------------------------------------------------------------
if (!flag('no-report')) {
  const heading = '## Échantillon Turbo Dambase';
  const stamp = new Date().toLocaleDateString('fr-FR');
  const section = `${heading} (${stamp}, \`node training/td-check.mjs\`, sans noms de joueurs)\n\n${lines.join('\n')}\n`;
  let doc = fs.existsSync(REPORT) ? fs.readFileSync(REPORT, 'utf8') : '';
  const eol = doc.includes('\r\n') ? '\r\n' : '\n';
  const body = section.replace(/\n/g, eol);
  const re = new RegExp(`${heading}[^\\n]*\\r?\\n[\\s\\S]*?(?=\\r?\\n## |$)`);
  doc = re.test(doc) ? doc.replace(re, () => body.trimEnd()) : `${doc.trimEnd()}${eol}${eol}${body}`;
  fs.writeFileSync(REPORT, doc);
  console.log(`\nRapport écrit dans ${path.relative(ROOT, REPORT).replace(/\\/g, '/')} (section « Échantillon Turbo Dambase »).`);
}
