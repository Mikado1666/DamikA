// Fabrique les jeux de positions de test (tests/data/tactics.mjs, tests/data/mates.mjs) à l'aide du
// solveur indépendant tests/solver.mjs (rules.js seul). Reproductible (graine fixe). À relancer
// seulement pour régénérer les jeux ; les tests lisent les fichiers produits.
// Usage : node tests/mine-positions.mjs [--seed S]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initialBoard, generateLegalMoves, applyCaptureSequence, applySimpleMove } from '../js/engine/rules.js';
import { mulberry32, formatPos } from './helpers.mjs';
import { children, other, material, rootValues, shortestWin, shortestLoss } from './solver.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const seedArg = args.indexOf('--seed');
const rnd = mulberry32(seedArg >= 0 ? Number(args[seedArg + 1]) : 31337);
const randInt = (n) => Math.floor(rnd() * n);

// --- Positions candidates ---------------------------------------------------------------------------------------------
function randomMidgame() {
  let board = initialBoard(), side = 'w';
  const plies = 12 + randInt(60);
  for (let p = 0; p < plies; p++) {
    const { captures, simples } = generateLegalMoves(board, side);
    const all = captures.length ? captures : simples;
    if (!all.length) return null;
    const mv = all[randInt(all.length)];
    board = captures.length ? applyCaptureSequence(board, board[mv[0].from], mv).board : applySimpleMove(board, board[mv.from], mv).board;
    side = other(side);
  }
  return { board, side };
}
function randomSparse(nW, nB, kingRate) {
  const board = new Array(51).fill(null);
  const place = (n, color) => {
    for (let k = 0; k < n;) {
      const sq = 1 + randInt(50);
      if (board[sq]) continue;
      const row = Math.floor((sq - 1) / 5);
      let king = rnd() < kingRate;
      if (!king && ((color === 'w' && row === 0) || (color === 'b' && row === 9))) king = true;
      board[sq] = { color, king };
      k++;
    }
  };
  place(nW, 'w');
  place(nB, 'b');
  return { board, side: rnd() < 0.5 ? 'w' : 'b' };
}

// --- Tactiques ---------------------------------------------------------------------------------------------------------------
// Critère : à profondeur 5 ET 7 (matériel pur, prises prolongées), un coup unique est meilleur que tous
// les autres d'au moins 1 pion, ET gagne au moins 1 pion de matériel par rapport à la position de départ.
function mineTactics() {
  const quota = { cascade: 7, sacrifice: 7, dame: 6 };
  const found = { cascade: [], sacrifice: [], dame: [] };
  let tried = 0;
  const t0 = Date.now();
  while (Date.now() - t0 < 240000 && Object.keys(quota).some((k) => found[k].length < quota[k])) {
    const useSparse = rnd() < 0.5;
    const cand = useSparse ? randomSparse(3 + randInt(6), 3 + randInt(6), [0, 0.3, 0.6][randInt(3)]) : randomMidgame();
    if (!cand) continue;
    tried++;
    const { board, side } = cand;
    const kids = children(board, side);
    if (kids.length < 2) continue;
    const labels = kids.map((k) => k.label);
    if (new Set(labels).size !== labels.length) continue; // coups ambigus (même départ/arrivée) : écartés
    const base = side === 'w' ? material(board) : -material(board);
    const v5 = rootValues(board, side, 5).sort((a, b) => b.value - a.value);
    if (v5[0].value - v5[1].value < 1 || v5[0].value - base < 1) continue;
    const v7 = rootValues(board, side, 7).sort((a, b) => b.value - a.value);
    if (v7[0].label !== v5[0].label || v7[0].value - v7[1].value < 1 || v7[0].value - base < 1) continue;

    const best = kids.find((k) => k.label === v7[0].label);
    const from = Number(best.label.split(/[x-]/)[0]);
    const moverIsKing = board[from].king;
    let category;
    if (best.capturedCount >= 3) category = 'cascade';
    else if (best.capturedCount === 0 && children(best.board, other(side)).some((r) => r.capturedCount > 0)) category = 'sacrifice';
    else if (moverIsKing) category = 'dame';
    else continue;
    if (found[category].length >= quota[category]) continue;
    found[category].push({
      pos: formatPos(board, side),
      best: v7[0].label,
      category,
      gain: v7[0].value - base,
      margin: v7[0].value - v7[1].value,
      baseline: base,
    });
  }
  console.log(`tactiques : ${tried} positions examinées en ${((Date.now() - t0) / 1000).toFixed(0)} s —`,
    Object.fromEntries(Object.entries(found).map(([k, v]) => [k, v.length])));
  return Object.values(found).flat();
}

// --- Mats ------------------------------------------------------------------------------------------------------------------------------
function mineMates() {
  const wins = { 1: [], 2: [], 3: [] }, losses = { 1: [], 2: [], 3: [] }, none = [];
  const quotaWin = 4, quotaLoss = 2, quotaNone = 40;
  const t0 = Date.now();
  let tried = 0;
  const full = () => [1, 2, 3].every((n) => wins[n].length >= quotaWin && losses[n].length >= quotaLoss) && none.length >= quotaNone;
  while (Date.now() - t0 < 300000 && !full()) {
    const { board, side } = randomSparse(1 + randInt(4), 1 + randInt(3), [0, 0.4, 1][randInt(3)]);
    tried++;
    if (children(board, side).length === 0) continue;
    const w = shortestWin(board, side, 3);
    const l = w === null ? shortestLoss(board, side, 3) : null;
    const pos = formatPos(board, side);
    if (w !== null) { if (wins[w].length < quotaWin) wins[w].push({ pos, winner: side, in: w }); }
    else if (l !== null) { if (losses[l].length < quotaLoss) losses[l].push({ pos, winner: other(side), in: l }); }
    else if (none.length < quotaNone) none.push({ pos });
  }
  console.log(`mats : ${tried} positions examinées en ${((Date.now() - t0) / 1000).toFixed(0)} s —`,
    { victoires: [1, 2, 3].map((n) => wins[n].length), defaites: [1, 2, 3].map((n) => losses[n].length), sansMat: none.length });
  return { mates: [...[1, 2, 3].flatMap((n) => wins[n]), ...[1, 2, 3].flatMap((n) => losses[n])], none };
}

const header = (what) => `// GÉNÉRÉ par tests/mine-positions.mjs (${what}) — ne pas éditer à la main.\n// Format de position : "trait|Blancs|Noirs", cases FMJD 1..50, préfixe K = dame.\n`;
fs.mkdirSync(path.join(here, 'data'), { recursive: true });

const tactics = mineTactics();
fs.writeFileSync(path.join(here, 'data', 'tactics.mjs'),
  header('tactiques, validées par tests/solver.mjs') + `export const TACTICS = ${JSON.stringify(tactics, null, 2)};\n`);
const { mates, none } = mineMates();
fs.writeFileSync(path.join(here, 'data', 'mates.mjs'),
  header('mats forcés en 1 à 3 coups et positions sans mat en 3, validés par tests/solver.mjs') +
  `export const MATES = ${JSON.stringify(mates, null, 2)};\nexport const NO_MATE_IN_3 = ${JSON.stringify(none.map((n) => n.pos), null, 2)};\n`);
console.log('écrit tests/data/tactics.mjs et tests/data/mates.mjs');
