#!/usr/bin/env node
// DAMIKA — Nuit 4, étape 1 : positions de PARTIES RÉELLES (Turbo Dambase propre) au format d'auto-jeu, pour training/fit.mjs.
//   node training/td-positions.mjs [td-propre.pdn] [--out training/data/td-positions-2100] [--min-elo 2100] [--per-game 12]
//        [--min-ply 16] [--seed 1] [--limit n] [--count-only]
// Entrée : tests/pdn-local/td-propre/td-propre.pdn (sortie de td-clean.mjs : légale, unique, résultat cohérent). Lecture en flux.
// Filtre : minimum des Elo présents ≥ --min-elo (2100) ; une partie sans aucun Elo est exclue (--elo-mode both : exige les deux Elo).
// Positions : rejeu avec FastBoard (validé contre rules.js par tests/diff.mjs) ; on garde au plus --per-game positions tirées au
// hasard (graine, numéro de partie) parmi celles qui sont HORS OUVERTURE (ply ≥ --min-ply demi-coups déjà joués) et CALMES (aucune prise
// obligatoire au trait). Toutes les parties pèsent donc pareil, sans passer par le poids de partie. Cible = résultat RÉEL (λ = 1 à
// l'apprentissage) : le champ « score » vaut 0 et n'est PAS utilisé (aucun score de recherche sur des parties humaines).
// Sortie (dossier ignoré par git : training/data/) : games.jsonl (une ligne par partie : { mode:'td', game, result, plies, p:[[plateau,
// camp, ply, quiet, 0, 0, 0], …] } — même format que l'auto-jeu, donc lisible par fit.mjs sans changement), summary.json.
// AUCUN nom de joueur n'est écrit : seul le numéro de partie (ordre du fichier) identifie une partie.
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';
import { FastBoard } from '../js/ai/fastboard.js';
import { encodeBoard, mulberry32, seedOf } from './game.mjs';
import { TAG_RE, parseMovetext } from './td-lib.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const flag = (n) => args.includes(`--${n}`);
const valued = new Set(['--out', '--min-elo', '--per-game', '--min-ply', '--seed', '--limit', '--elo-mode']);
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 && i + 1 < args.length ? args[i + 1] : d; };
const positional = args.filter((a, i) => !a.startsWith('--') && !(i > 0 && valued.has(args[i - 1])));
const FILE = path.resolve(ROOT, positional[0] || 'tests/pdn-local/td-propre/td-propre.pdn');
const OUT = path.resolve(ROOT, opt('out', 'training/data/td-positions-2100'));
const MIN_ELO = Number(opt('min-elo', 2100));
const PER_GAME = Number(opt('per-game', 12));
const MIN_PLY = Number(opt('min-ply', 16));
const SEED = Number(opt('seed', 1));
const LIMIT = Number(opt('limit', Infinity));
const COUNT_ONLY = flag('count-only');
// --elo-mode any (défaut) : minimum des Elo PRÉSENTS (au moins un Elo ; ≈ 207 000 parties à 2100, le chiffre du rapport td-clean) ;
// --elo-mode both : les deux Elo doivent être présents (≈ 153 000 parties à 2100). Une partie sans aucun Elo est toujours exclue.
const ELO_MODE = opt('elo-mode', 'any');
if (!['any', 'both'].includes(ELO_MODE)) { console.error('--elo-mode : any ou both'); process.exit(2); }

// Garde-fou : la sortie doit rester dans un dossier ignoré par git.
const relOut = path.relative(ROOT, OUT).replace(/\\/g, '/');
if (!COUNT_ONLY && (relOut.startsWith('..') || !(relOut.startsWith('training/data/') || relOut.startsWith('tests/pdn-local/')))) {
  console.error(`Sortie refusée (${relOut}) : doit être sous training/data/ ou tests/pdn-local/ (dossiers ignorés par git).`); process.exit(1);
}

const eloOf = (t, a, b) => { const v = [t[a], t[b]].find((x) => x && /^\d+$/.test(x)); return v ? Number(v) : null; };
const st = { read: 0, noElo: 0, belowElo: 0, kept: 0, unmatched: 0, ambiguous: 0, positions: 0, noPosition: 0, results: {}, eloBins: {} };
const t0 = Date.now();

let sink = null;
if (!COUNT_ONLY) { fs.mkdirSync(OUT, { recursive: true }); sink = fs.createWriteStream(path.join(OUT, 'games.jsonl')); }

// Rejoue une partie ; renvoie la liste des positions échantillonnées, ou null si un coup ne se retrouve pas.
function sample(moves, gameIndex) {
  const fb = FastBoard.initial();
  const cand = []; // [plateau, camp, ply, quiet, 0, 0, 0]
  for (let i = 0; i < moves.length; i++) {
    const legal = fb.generateMoves();
    if (legal.length === 0) return null;
    const mv = moves[i];
    const wantCap = mv.sep === 'x';
    // Notation « 49x32x19x2 » (chemin complet) : mv.to est la 1re case d'arrivée, mv.via les suivantes ; sinon départ×arrivée.
    const dest = mv.via.length ? mv.via[mv.via.length - 1] : mv.to;
    let found = legal.filter((m) => m.from === mv.from - 1 && m.to === dest - 1 && (m.caps.length > 0) === wantCap);
    if (found.length > 1 && mv.via.length) {
      const wanted = [mv.to, ...mv.via];
      const byPath = found.filter((m) => m.path.length === wanted.length && m.path.every((sq, j) => sq + 1 === wanted[j]));
      if (byPath.length) found = byPath;
    }
    if (found.length === 0) return null;
    if (found.length > 1) st.ambiguous++;
    if (i >= MIN_PLY && legal[0].caps.length === 0) cand.push([encodeBoard(fb.board), fb.sideToMove, i, fb.quiet, 0, 0, 0]);
    fb.makeMove(found[0]);
  }
  if (cand.length <= PER_GAME) return cand;
  // Tirage sans remise reproductible (mélange partiel de Fisher-Yates), puis ordre chronologique.
  const rng = mulberry32(seedOf(SEED, 'td', gameIndex));
  for (let k = 0; k < PER_GAME; k++) {
    const j = k + Math.floor(rng() * (cand.length - k));
    [cand[k], cand[j]] = [cand[j], cand[k]];
  }
  return cand.slice(0, PER_GAME).sort((a, b) => a[2] - b[2]);
}

async function handle(g) {
  const idx = st.read++; // numéro de partie (ordre du fichier, à partir de 0)
  const t = Object.fromEntries(g.tags);
  const w = eloOf(t, 'WhiteRating', 'WhiteElo'), b = eloOf(t, 'BlackRating', 'BlackElo');
  if (w === null && b === null) { st.noElo++; return; }
  if (ELO_MODE === 'both' && (w === null || b === null)) { st.noElo++; return; }
  const min = Math.min(...[w, b].filter((x) => x !== null));
  if (min < MIN_ELO) { st.belowElo++; return; }
  const bin = `${Math.floor(min / 100) * 100}`;
  st.eloBins[bin] = (st.eloBins[bin] || 0) + 1;
  st.kept++;
  if (COUNT_ONLY) return;
  const parsed = parseMovetext(g.body.join('\n'));
  const res = t.Result || parsed.result;
  const p = sample(parsed.moves, idx);
  if (p === null) { st.unmatched++; st.kept--; return; }
  if (p.length === 0) { st.noPosition++; return; }
  st.results[res] = (st.results[res] || 0) + 1;
  st.positions += p.length;
  if (!sink.write(`${JSON.stringify({ mode: 'td', game: idx, result: res, plies: parsed.moves.length, p })}\n`)) await new Promise((r) => sink.once('drain', r));
}

const rl = readline.createInterface({ input: fs.createReadStream(FILE, { encoding: 'utf8', highWaterMark: 1 << 20 }), crlfDelay: Infinity });
let cur = null, first = true, stop = false, lastLog = 0;
const flush = async () => { if (cur && cur.tags.length) { if (st.read >= LIMIT) { stop = true; } else await handle(cur); } cur = null; };
for await (let line of rl) {
  if (first) { line = line.replace(/^﻿/, ''); first = false; }
  const tag = TAG_RE.exec(line);
  if (tag) {
    if (!cur || cur.body.some((l) => l.trim())) { await flush(); if (stop) break; cur = { tags: [], body: [] }; }
    cur.tags.push([tag[1], tag[2]]);
  } else if (cur) cur.body.push(line);
  if (st.read >= lastLog + 100000) { lastLog = st.read - (st.read % 100000); console.log(`[${Math.round((Date.now() - t0) / 1000)} s] ${st.read} parties lues, ${st.kept} retenues`); }
}
rl.close();
if (!stop) await flush();
if (sink) await new Promise((r) => sink.end(r));

const summary = {
  input: path.relative(ROOT, FILE).replace(/\\/g, '/'), minElo: MIN_ELO, eloMode: ELO_MODE, perGame: PER_GAME, minPly: MIN_PLY, seed: SEED, limit: Number.isFinite(LIMIT) ? LIMIT : null,
  gamesRead: st.read, noElo: st.noElo, belowElo: st.belowElo, gamesKept: st.kept, unmatched: st.unmatched, ambiguousCaptures: st.ambiguous,
  gamesWithoutPosition: st.noPosition, positions: st.positions, results: st.results, eloBins: st.eloBins, seconds: Math.round((Date.now() - t0) / 1000), countOnly: COUNT_ONLY,
};
if (!COUNT_ONLY) fs.writeFileSync(path.join(OUT, 'summary.json'), JSON.stringify(summary, null, 1));
console.log(JSON.stringify(summary, null, 1));
if (st.unmatched > 0) { console.error(`ERREUR : ${st.unmatched} partie(s) dont un coup n'a pas été retrouvé par le moteur rapide.`); process.exit(1); }
process.exit(0);
