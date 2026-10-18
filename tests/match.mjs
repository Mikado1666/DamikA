// Force : matchs automatiques.
//   1. Moteur (profondeur D) contre un joueur aléatoire : 100 parties, couleurs alternées. Attendu :
//      aucune défaite (victoire ou nulle). Nulle = limite de demi-coups atteinte (le moteur V0 n'a ni
//      détection de répétition ni règle des 25 coups : certaines finales ne sont pas converties).
//   2. Profondeur N+1 contre profondeur N : 100 parties (50 ouvertures aléatoires de 8 demi-coups,
//      chacune jouée avec les deux couleurs). Attendu : la plus profonde domine (plus de victoires que de défaites).
// Les coups du moteur sont lus dans le format de l'interface (bestMove) puis retrouvés dans les coups
// de fastboard : cela teste aussi la cohérence de ce format.
// Usage : node tests/match.mjs [--depth D] [--games N] [--cap PLIES] [--seed S]
import { FastBoard } from '../js/ai/fastboard.js';
import { analyseSync } from '../js/ai/search.js';
import { mulberry32 } from './helpers.mjs';

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? Number(args[i + 1]) : d; };
const DEPTH = opt('depth', 4), GAMES = opt('games', 100), CAP = opt('cap', 300), rnd = mulberry32(opt('seed', 808));
const randInt = (n) => Math.floor(rnd() * n);

// Retrouve dans `moves` le coup décrit au format interface (départ, ensemble des pièces prises).
function findMove(moves, ui) {
  const steps = Array.isArray(ui) ? ui : [ui];
  const from = steps[0].from - 1;
  const caps = Array.isArray(ui) ? new Set(ui.map((s) => s.capturedThisStep - 1)) : new Set();
  const to = steps[steps.length - 1].to - 1;
  return moves.find((m) => m.from === from && m.to === to && m.caps.length === caps.size && m.caps.every((c) => caps.has(c)));
}

const enginePlayer = (depth) => (fb) => {
  const r = analyseSync({ board: fb.toUiBoard(), side: fb.sideToMove }, { maxDepth: depth, maxTimeMs: 1e9 });
  const m = findMove(fb.generateMoves(), r.bestMove);
  if (!m) throw new Error('coup du moteur introuvable parmi les coups légaux : ' + JSON.stringify(r.bestMove));
  return m;
};
const randomPlayer = (fb) => {
  const moves = fb.generateMoves();
  return moves[randInt(moves.length)];
};

// Joue une partie. Retourne 'w', 'b' ou 'draw'.
function playGame(white, black, opening = []) {
  const fb = FastBoard.initial();
  for (const mv of opening) {
    const m = fb.generateMoves().find((x) => `${x.from}>${x.to}>${x.lo}>${x.hi}` === mv);
    fb.makeMove(m);
  }
  let plies = opening.length;
  while (plies < CAP) {
    const moves = fb.generateMoves();
    if (moves.length === 0) return fb.side === 0 ? 'b' : 'w'; // le camp au trait n'a plus de coup : il a perdu
    const m = (fb.side === 0 ? white : black)(fb);
    fb.makeMove(m);
    plies++;
  }
  return 'draw';
}

function randomOpening(len) {
  const fb = FastBoard.initial();
  const keys = [];
  for (let i = 0; i < len; i++) {
    const moves = fb.generateMoves();
    if (!moves.length) break;
    const m = moves[randInt(moves.length)];
    keys.push(`${m.from}>${m.to}>${m.lo}>${m.hi}`);
    fb.makeMove(m);
  }
  return keys;
}

let bad = 0;

// --- 1. contre le hasard ------------------------------------------------------------------------------------------------
{
  const engine = enginePlayer(DEPTH);
  let win = 0, draw = 0, loss = 0;
  const t0 = performance.now();
  for (let g = 0; g < GAMES; g++) {
    const engineWhite = g % 2 === 0;
    const res = engineWhite ? playGame(engine, randomPlayer) : playGame(randomPlayer, engine);
    if (res === 'draw') draw++; else if ((res === 'w') === engineWhite) win++; else loss++;
  }
  if (loss > 0) bad++;
  console.log(`${loss === 0 ? 'OK ' : 'ERR'} moteur (prof. ${DEPTH}) contre hasard : ${GAMES} parties — ${win} victoires, ${draw} nulles (limite ${CAP} demi-coups), ${loss} défaites (${((performance.now() - t0) / 1000).toFixed(0)} s)`);
}

// --- 2. N+1 contre N --------------------------------------------------------------------------------------------------------------------
for (const [deep, shallow] of [[3, 2], [4, 3], [5, 4]]) {
  const pd = enginePlayer(deep), ps = enginePlayer(shallow);
  let win = 0, draw = 0, loss = 0;
  const t0 = performance.now();
  for (let g = 0; g < GAMES / 2; g++) {
    const opening = randomOpening(8);
    for (const deepWhite of [true, false]) {
      const res = deepWhite ? playGame(pd, ps, opening) : playGame(ps, pd, opening);
      if (res === 'draw') draw++; else if ((res === 'w') === deepWhite) win++; else loss++;
    }
  }
  const dominates = win > loss;
  if (!dominates) bad++;
  const score = ((win + draw / 2) / GAMES * 100).toFixed(1);
  console.log(`${dominates ? 'OK ' : 'ERR'} profondeur ${deep} contre ${shallow} : ${GAMES} parties — ${win} victoires, ${draw} nulles, ${loss} défaites → score ${score} % (${((performance.now() - t0) / 1000).toFixed(0)} s)`);
}

console.log(bad === 0 ? 'RÉSULTAT : tout concorde.' : `RÉSULTAT : ${bad} échec(s).`);
process.exit(bad === 0 ? 0 : 1);
