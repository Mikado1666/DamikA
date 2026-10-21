// Convertisseur de parties réelles (training/td-positions.mjs) : positions échantillonnées contre rules.js.
// On fabrique un PDN synthétique de parties aléatoires LÉGALES (rules.js seul ; rafles notées tantôt « 27x9 », tantôt avec le chemin
// complet « 27x18x9 »), avec des Elo variés, on lance le convertisseur, puis on REJOUE chaque partie avec rules.js pour vérifier que
// chaque position écrite (plateau, camp, demi-coup, compteur « sans prise ni coup de pion », absence de prise obligatoire, hors
// ouverture, nombre par partie, ordre chronologique) est exactement celle de la partie, et que le filtre Elo (modes any / both) est juste.
//
// Usage : node tests/td-positions.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { initialBoard, generateLegalMoves, applyCaptureSequence, applySimpleMove } from '../js/engine/rules.js';
import { mulberry32 } from './helpers.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
let failures = 0;
const ok = (label, cond, extra = '') => { if (!cond) failures++; console.log(`${cond ? 'OK ' : 'ERR'} ${label}${extra ? ' — ' + extra : ''}`); };
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'damika-tdpos-'));
const outRel = 'training/data/test-td-positions';

// --- Parties aléatoires légales (rules.js) --------------------------------------------------------------------------------------
const rnd = mulberry32(2024);
const pick = (a) => a[Math.floor(rnd() * a.length)];
function randomGame(maxPlies) {
  let board = initialBoard(), side = 'w';
  const tokens = [];
  let fullPath = false;
  for (let i = 0; i < maxPlies; i++) {
    const { captures, simples } = generateLegalMoves(board, side);
    if (captures.length === 0 && simples.length === 0) break;
    const piece = (from) => board[from];
    if (captures.length) {
      const seq = pick(captures);
      const from = seq[0].from, to = seq[seq.length - 1].to;
      // Chemin complet (« 27x18x9 ») pour environ une rafle sur deux : le convertisseur doit alors choisir la bonne rafle.
      // (Rafle ambiguë « même départ et arrivée, pièces prises différentes » : chemin complet obligatoire, comme dans le PDN réel.)
      const ambiguous = captures.some((o) => o !== seq && o[0].from === from && o[o.length - 1].to === to);
      fullPath = ambiguous || (seq.length > 1 && rnd() < 0.5);
      tokens.push(fullPath ? `${from}x${seq.map((s) => s.to).join('x')}` : `${from}x${to}`);
      board = applyCaptureSequence(board, piece(from), seq).board;
    } else {
      const m = pick(simples);
      tokens.push(`${m.from}-${m.to}`);
      board = applySimpleMove(board, piece(m.from), m).board;
    }
    side = side === 'w' ? 'b' : 'w';
  }
  return tokens;
}
// Une partie de test : coups légaux, Elo choisis, résultat quelconque (seule la légalité des coups compte ici).
const specs = [];
const eloCases = [[2300, 2250], [2100, 2400], [2099, 2500], [2200, null], [null, 2300], [null, null], [1900, 2000], [2150, 2150]];
for (let g = 0; g < 48; g++) {
  const [w, b] = eloCases[g % eloCases.length];
  specs.push({ moves: randomGame(40 + Math.floor(rnd() * 120)), w, b, result: pick(['1-0', '0-1', '1/2-1/2']) });
}
// PDN : une ligne de balises, une ligne de coups ; sans commentaire (c'est la forme de sortie de td-clean).
let pdn = '';
specs.forEach((sp, g) => {
  pdn += `[Event "Essai ${g}"]\n[White "Joueur A ${g}"]\n[Black "Joueur B ${g}"]\n`;
  if (sp.w !== null) pdn += `[WhiteRating "${sp.w}"]\n`;
  if (sp.b !== null) pdn += `[BlackElo "${sp.b}"]\n`;
  pdn += `[Result "${sp.result}"]\n\n`;
  const body = [];
  sp.moves.forEach((m, i) => body.push(i % 2 === 0 ? `${i / 2 + 1}. ${m}` : m));
  pdn += `${body.join(' ')} ${sp.result}\n\n`;
});
const pdnFile = path.join(tmp, 'essai.pdn');
fs.writeFileSync(pdnFile, pdn);

const run = (extra, out = outRel) => spawnSync(process.execPath, ['training/td-positions.mjs', pdnFile, '--out', out, '--min-elo', '2100', '--per-game', '5', '--min-ply', '16', ...extra], { cwd: root, encoding: 'utf8' });

// --- Référence indépendante : positions de la partie g, recalculées avec rules.js ---------------------------------------------------
const CH = (c) => (c === null ? '.' : c.color === 'w' ? (c.king ? 'W' : 'w') : (c.king ? 'B' : 'b'));
function referencePositions(tokens) {
  let board = initialBoard(), side = 'w', quiet = 0;
  const out = new Map(); // ply → { board, side, quiet } pour les positions calmes
  for (let i = 0; i < tokens.length; i++) {
    const { captures, simples } = generateLegalMoves(board, side);
    if (!captures.length) out.set(i, { board: Array.from({ length: 50 }, (_, k) => CH(board[k + 1])).join(''), side, quiet });
    const t = /^(\d+)([-x])(\d+)((?:x\d+)*)$/.exec(tokens[i]);
    const from = Number(t[1]);
    const piece = board[from];
    if (t[2] === 'x') {
      const wanted = t[4] ? [Number(t[3]), ...t[4].split('x').filter(Boolean).map(Number)] : null;
      const seq = captures.find((s) => s[0].from === from && (wanted ? s.length === wanted.length && s.every((st, j) => st.to === wanted[j]) : s[s.length - 1].to === Number(t[3])));
      board = applyCaptureSequence(board, piece, seq).board;
      quiet = 0;
    } else {
      board = applySimpleMove(board, piece, simples.find((m) => m.from === from && m.to === Number(t[3]))).board;
      quiet = piece.king ? quiet + 1 : 0;
    }
    side = side === 'w' ? 'b' : 'w';
  }
  return out;
}

// --- Mode par défaut (any) -----------------------------------------------------------------------------------------------------------------
let r = run([]);
ok('convertisseur : code de sortie 0', r.status === 0, r.stderr.trim().slice(0, 200));
const sum = JSON.parse(fs.readFileSync(path.join(root, outRel, 'summary.json'), 'utf8'));
const minOf = (sp) => { const v = [sp.w, sp.b].filter((x) => x !== null); return v.length ? Math.min(...v) : null; };
const expectAny = specs.map((sp, g) => ({ sp, g })).filter(({ sp }) => minOf(sp) !== null && minOf(sp) >= 2100);
ok(`filtre Elo « any » : ${expectAny.length} parties attendues`, sum.gamesKept === expectAny.length, `convertisseur : ${sum.gamesKept}`);
ok('aucune partie sans coup retrouvé (unmatched = 0)', sum.unmatched === 0);
const lines = fs.readFileSync(path.join(root, outRel, 'games.jsonl'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
ok('une ligne par partie retenue, numéros = ordre du fichier', lines.map((l) => l.game).join() === expectAny.map((e) => e.g).join());
let badBoard = 0, badMeta = 0, badOrder = 0, tooMany = 0, early = 0, capt = 0, positions = 0, resultBad = 0;
for (const line of lines) {
  const sp = specs[line.game];
  const ref = referencePositions(sp.moves);
  if (line.result !== sp.result) resultBad++;
  if (line.p.length > 5) tooMany++;
  let last = -1;
  for (const [board, side, ply, quiet, score, depth, cap] of line.p) {
    positions++;
    const e = ref.get(ply);
    if (!e) { capt++; continue; } // position avec prise obligatoire (ou hors partie) : ne doit pas figurer
    if (board !== e.board) badBoard++;
    if (side !== e.side || quiet !== e.quiet || score !== 0 || depth !== 0 || cap !== 0) badMeta++;
    if (ply < 16) early++;
    if (ply <= last) badOrder++;
    last = ply;
  }
  // Nombre de positions : min(5, candidates calmes hors ouverture)
  const cands = [...ref.keys()].filter((p) => p >= 16).length;
  if (line.p.length !== Math.min(5, cands)) badMeta++;
}
ok(`${positions} positions : plateaux identiques à rules.js`, positions > 0 && badBoard === 0, `${badBoard} écart(s)`);
ok('camp, demi-coup, compteur « sans prise ni coup de pion » et champs fixes exacts ; au plus 5 par partie ; toutes les candidates si moins de 5', badMeta === 0 && tooMany === 0, `${badMeta} écart(s)`);
ok('aucune position avec prise obligatoire', capt === 0, `${capt}`);
ok('aucune position dans l\'ouverture (demi-coup < 16)', early === 0);
ok('positions en ordre chronologique strict', badOrder === 0);
ok('résultat de la partie recopié', resultBad === 0);
ok('aucun nom de joueur écrit dans la sortie', !/Joueur/.test(fs.readFileSync(path.join(root, outRel, 'games.jsonl'), 'utf8')) && !/Joueur/.test(fs.readFileSync(path.join(root, outRel, 'summary.json'), 'utf8')));
const hasCapturePath = specs.some((sp) => sp.moves.some((m) => /^\d+x\d+x\d+/.test(m)));
ok('le jeu d\'essai contient des rafles notées avec le chemin complet', hasCapturePath);

// --- Reproductibilité et mode both ---------------------------------------------------------------------------------------------------------
const first = fs.readFileSync(path.join(root, outRel, 'games.jsonl'), 'utf8');
run([]);
ok('deux exécutions : sortie identique octet pour octet', fs.readFileSync(path.join(root, outRel, 'games.jsonl'), 'utf8') === first);
r = run(['--elo-mode', 'both']);
const sumBoth = JSON.parse(fs.readFileSync(path.join(root, outRel, 'summary.json'), 'utf8'));
const expectBoth = specs.filter((sp) => sp.w !== null && sp.b !== null && Math.min(sp.w, sp.b) >= 2100).length;
ok(`filtre Elo « both » : ${expectBoth} parties attendues`, r.status === 0 && sumBoth.gamesKept === expectBoth, `convertisseur : ${sumBoth.gamesKept}`);
r = run([], 'documentation/interdit');
ok('sortie hors des dossiers ignorés par git : refusée', r.status === 1);

fs.rmSync(path.join(root, outRel), { recursive: true, force: true });
fs.rmSync(tmp, { recursive: true, force: true });
console.log(failures === 0 ? '\nRÉSULTAT : tout concorde.' : `\nRÉSULTAT : ${failures} échec(s).`);
process.exit(failures === 0 ? 0 : 1);
