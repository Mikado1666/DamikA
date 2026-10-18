// Test différentiel : liste des coups du moteur rapide (js/ai/fastboard.js) vs rules.js.
//
// Usage : node tests/diff.mjs [--games N] [--positions N] [--seed S] [--pdn dossier-ou-fichier]
//   --games      parties aléatoires jouées depuis la position initiale (défaut 300)
//   --positions  positions aléatoires posées pièce par pièce, riches en dames (défaut 20000)
//   --pdn        fichier .pdn ou dossier de .pdn à rejouer (défaut : tests/pdn-local/ s'il existe).
//                Ce dossier est ignoré par git : les PDN contiennent des noms de joueurs.
//
// Pour chaque position :
//   1. même ensemble de coups « tous chemins » (clé = départ, chemin d'arrivées, pièces prises) ;
//   2. même nombre de coups après dédoublonnage (départ, arrivée, ensemble de pièces prises) ;
//   3. makeMove donne exactement le plateau qu'applyCaptureSequence/applySimpleMove de rules.js,
//      et unmakeMove restitue exactement le plateau d'avant.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FastBoard } from '../js/ai/fastboard.js';
import {
  initialBoard, generateLegalMoves, applyCaptureSequence, applySimpleMove,
} from '../js/engine/rules.js';
import { parsePdn } from '../js/pdn/parser.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : def;
};
const N_GAMES = Number(opt('games', 300));
const N_POSITIONS = Number(opt('positions', 20000));
const SEED = Number(opt('seed', 12345));
const PDN_ARG = opt('pdn', null);

// --- PRNG reproductible --------------------------------------------------------------------
function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = mulberry32(SEED);
const randInt = (n) => Math.floor(rnd() * n);

// --- Utilitaires ---------------------------------------------------------------------------
function boardToString(board, side) {
  const w = [], b = [];
  for (let sq = 1; sq <= 50; sq++) {
    const p = board[sq];
    if (!p) continue;
    (p.color === 'w' ? w : b).push((p.king ? 'K' : '') + sq);
  }
  return `${side.toUpperCase()}:W${w.join(',')}:B${b.join(',')}`;
}
const boardKey = (board) => board.map((p) => (p ? (p.color + (p.king ? 'K' : 'm')) : '.')).join('');

const keyRulesCapture = (seq) =>
  `x${seq[0].from}:${seq.map((s) => s.to).join('>')}:${seq.map((s) => s.capturedThisStep).sort((a, b) => a - b).join(',')}`;
const keyRulesSimple = (m) => `s${m.from}-${m.to}`;
const dedupKeyRules = (seq) =>
  `${seq[0].from}>${seq[seq.length - 1].to}|${seq.map((s) => s.capturedThisStep).sort((a, b) => a - b).join(',')}`;

// --- Comparaison d'une position --------------------------------------------------------------
const stats = { positions: 0, withCapture: 0, withKingCapture: 0, multiCapture: 0, multiPath: 0, moves: 0 };
const divergences = [];
const MAX_REPORTED = 8;

function report(kind, board, side, detail) {
  const entry = { kind, position: boardToString(board, side), detail };
  if (divergences.length < 1000) divergences.push(entry);
}

function comparePosition(board, side, origin) {
  stats.positions++;
  const rules = generateLegalMoves(board, side);
  const fb = FastBoard.fromUiBoard(board, side);

  // 1. Ensemble « tous chemins ».
  const rulesKeys = [
    ...rules.captures.map(keyRulesCapture),
    ...rules.simples.map(keyRulesSimple),
  ].sort();
  const fastUi = fb.generateUiMoves();
  const fastKeys = [
    ...fastUi.captures.map(keyRulesCapture),
    ...fastUi.simples.map(keyRulesSimple),
  ].sort();

  if (rules.mustCapture !== fastUi.mustCapture || rules.maxCapture !== fastUi.maxCapture) {
    report('mustCapture/maxCapture', board, side, { origin, rules: [rules.mustCapture, rules.maxCapture], fast: [fastUi.mustCapture, fastUi.maxCapture] });
  }
  if (rulesKeys.length !== fastKeys.length || rulesKeys.some((k, i) => k !== fastKeys[i])) {
    const rs = new Set(rulesKeys), fs_ = new Set(fastKeys);
    report('liste de coups', board, side, {
      origin,
      onlyInRules: rulesKeys.filter((k) => !fs_.has(k)),
      onlyInFast: fastKeys.filter((k) => !rs.has(k)),
    });
    return; // inutile d'aller plus loin sur une position divergente
  }

  // Statistiques de couverture.
  if (rules.mustCapture) {
    stats.withCapture++;
    if (rules.maxCapture > 1) stats.multiCapture++;
    if (rules.captures.some((s) => board[s[0].from].king)) stats.withKingCapture++;
  }
  stats.moves += rulesKeys.length;

  // 2. Dédoublonnage.
  const dedupRules = rules.mustCapture
    ? new Set(rules.captures.map(dedupKeyRules)).size
    : rules.simples.length;
  if (rules.mustCapture && dedupRules !== rules.captures.length) stats.multiPath++;
  const fastDeduped = fb.generateMoves(true);
  if (fastDeduped.length !== dedupRules) {
    report('dédoublonnage', board, side, { origin, rules: dedupRules, fast: fastDeduped.length });
    return;
  }

  // 3. makeMove / unmakeMove contre applyCaptureSequence / applySimpleMove.
  const before = boardKey(fb.toUiBoard());
  for (const m of fb.generateMoves(false)) {
    let expected;
    if (m.caps.length > 0) {
      const seq = rules.captures.find((s) => keyRulesCapture(s) === keyRulesCapture(
        // clé de la rafle du moteur rapide, au format rules.js
        m.caps.map((c, k) => ({ from: k === 0 ? m.from + 1 : m.path[k - 1] + 1, to: m.path[k] + 1, capturedThisStep: c + 1 })),
      ));
      expected = applyCaptureSequence(board, board[seq[0].from], seq).board;
    } else {
      expected = applySimpleMove(board, board[m.from + 1], { from: m.from + 1, to: m.to + 1 }).board;
    }
    fb.makeMove(m);
    const got = boardKey(fb.toUiBoard());
    if (got !== boardKey(expected) || fb.sideToMove === side) {
      report('makeMove', board, side, { origin, move: `${m.from + 1}>${m.path ? m.path.map((x) => x + 1).join('>') : m.to + 1}`, got, expected: boardKey(expected) });
      fb.unmakeMove();
      return;
    }
    fb.unmakeMove();
    if (boardKey(fb.toUiBoard()) !== before || fb.sideToMove !== side) {
      report('unmakeMove', board, side, { origin, move: moveLabel(m) });
      return;
    }
  }
}
const moveLabel = (m) => `${m.from + 1}>${(m.path ?? [m.to]).map((x) => x + 1).join('>')}`;

// --- Source 1 : parties aléatoires -------------------------------------------------------------
function randomGames(n) {
  for (let g = 0; g < n; g++) {
    let board = initialBoard();
    let side = 'w';
    for (let ply = 0; ply < 400; ply++) {
      comparePosition(board, side, `partie aléatoire ${g}, demi-coup ${ply}`);
      const { captures, simples } = generateLegalMoves(board, side);
      const all = captures.length ? captures : simples;
      if (all.length === 0) break;
      const mv = all[randInt(all.length)];
      board = captures.length
        ? applyCaptureSequence(board, board[mv[0].from], mv).board
        : applySimpleMove(board, board[mv.from], mv).board;
      side = side === 'w' ? 'b' : 'w';
    }
  }
}

// --- Source 2 : positions aléatoires (beaucoup de dames, rafles longues) ------------------------------
function randomPositions(n) {
  for (let i = 0; i < n; i++) {
    const board = new Array(51).fill(null);
    const nPieces = 2 + randInt(i % 2 === 0 ? 14 : 36); // alterne positions clairsemées / denses
    const kingRate = [0, 0.3, 0.7, 1][randInt(4)];
    for (let k = 0; k < nPieces; k++) {
      const sq = 1 + randInt(50);
      if (board[sq]) continue;
      const color = rnd() < 0.5 ? 'w' : 'b';
      let king = rnd() < kingRate;
      // Un pion ne peut pas se trouver sur sa rangée de promotion.
      const row = Math.floor((sq - 1) / 5);
      if (!king && ((color === 'w' && row === 0) || (color === 'b' && row === 9))) king = true;
      board[sq] = { color, king };
    }
    comparePosition(board, rnd() < 0.5 ? 'w' : 'b', `position aléatoire ${i}`);
  }
}

// --- Source 3 : parties PDN ----------------------------------------------------------------------------
function collectPdnFiles(target) {
  if (!target || !fs.existsSync(target)) return [];
  if (fs.statSync(target).isFile()) return [target];
  return fs.readdirSync(target).filter((f) => f.toLowerCase().endsWith('.pdn')).map((f) => path.join(target, f));
}

const pdnStats = { files: 0, games: 0, plies: 0, unplayable: [] };
function replayPdn(files) {
  for (const file of files) {
    pdnStats.files++;
    const games = parsePdn(fs.readFileSync(file, 'utf8'));
    games.forEach((game, gi) => {
      pdnStats.games++;
      let board = initialBoard();
      let side = 'w';
      comparePosition(board, side, `PDN ${path.basename(file)} #${gi} départ`);
      for (let k = 0; k < game.moves.length; k++) {
        const notation = game.moves[k].notation;
        const nums = notation.split(/[x-]/).map(Number);
        const from = nums[0], to = nums[nums.length - 1];
        const isCapture = notation.includes('x');
        const { captures, simples } = generateLegalMoves(board, side);
        let played = null;
        if (isCapture) {
          const cands = captures.filter((s) => s[0].from === from && s[s.length - 1].to === to);
          // Notation avec chemin complet (27x18x9) : départage les candidates.
          const exact = cands.find((s) => nums.length > 2 && s.map((x) => x.to).join('x') === nums.slice(1).join('x'));
          played = exact ?? cands[0] ?? null;
          if (played) board = applyCaptureSequence(board, board[from], played).board;
        } else {
          played = simples.find((m) => m.from === from && m.to === to) ?? null;
          if (played) board = applySimpleMove(board, board[from], played).board;
        }
        if (!played) {
          pdnStats.unplayable.push(`${path.basename(file)} partie ${gi} coup ${k + 1} (${notation}) : illégal selon rules.js`);
          break;
        }
        side = side === 'w' ? 'b' : 'w';
        pdnStats.plies++;
        comparePosition(board, side, `PDN ${path.basename(file)} #${gi} après ${k + 1} demi-coups`);
      }
    });
  }
}

// --- Exécution -------------------------------------------------------------------------------------------
console.log(`Test différentiel (graine ${SEED})`);
let t0 = performance.now();
randomGames(N_GAMES);
console.log(`  parties aléatoires : ${N_GAMES} parties — ${((performance.now() - t0) / 1000).toFixed(1)} s`);
t0 = performance.now();
randomPositions(N_POSITIONS);
console.log(`  positions aléatoires : ${N_POSITIONS} — ${((performance.now() - t0) / 1000).toFixed(1)} s`);

const pdnTarget = PDN_ARG ?? path.join(here, 'pdn-local');
const pdnFiles = collectPdnFiles(pdnTarget);
if (pdnFiles.length > 0) {
  t0 = performance.now();
  replayPdn(pdnFiles);
  console.log(`  PDN : ${pdnStats.files} fichier(s), ${pdnStats.games} partie(s), ${pdnStats.plies} demi-coups — ${((performance.now() - t0) / 1000).toFixed(1)} s`);
  for (const u of pdnStats.unplayable) console.log(`    ! ${u}`);
} else {
  console.log(`  PDN : aucun fichier trouvé dans ${pdnTarget} (déposer des .pdn dans tests/pdn-local/ ou --pdn)`);
}

console.log(`Couverture : ${stats.positions} positions, ${stats.moves} coups comparés ; positions avec prise : ${stats.withCapture} ` +
  `(rafle multiple : ${stats.multiCapture}, prise par une dame : ${stats.withKingCapture}, chemins redondants : ${stats.multiPath})`);

const byKind = {};
for (const d of divergences) byKind[d.kind] = (byKind[d.kind] ?? 0) + 1;
if (divergences.length === 0) {
  console.log('RÉSULTAT : aucune divergence.');
} else {
  console.log(`RÉSULTAT : ${divergences.length} divergence(s) — ${JSON.stringify(byKind)}`);
  for (const d of divergences.slice(0, MAX_REPORTED)) {
    console.log(`\n[${d.kind}] ${d.position}\n  origine : ${d.detail.origin}`);
    console.log('  ' + JSON.stringify({ ...d.detail, origin: undefined }));
  }
}
if (pdnStats.unplayable.length > 0) console.log(`(${pdnStats.unplayable.length} coup(s) PDN illégal(aux) selon rules.js — à examiner)`);
process.exit(divergences.length === 0 ? 0 : 1);
