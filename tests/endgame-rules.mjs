// Limites de finale FMJD 6.3 (16 coups) et 6.4 (5 coups), clause de la grande diagonale comprise (texte 2024).
// Règle complète : en-tête de js/engine/rules.js ; seconde implémentation (moteur rapide) : js/ai/fastboard.js.
// Tests Node, aucun navigateur, aucun match. Usage : node tests/endgame-rules.mjs
//   A. Familles de finale, exhaustif sur tous les effectifs (0 à 4 pièces de chaque sorte et de chaque camp).
//   B. Comptage, sur des suites de plateaux écrites à la main (rules.js) : déclenchement au bon demi-coup, un coup de
//      moins = pas de nulle, prise qui ne relance rien, passage de la famille 1 à la famille 2 (le maximum de 16 reste),
//      sortie de la finale (compteur remis à zéro) et nouvelle apparition, grande diagonale (5 coups, seulement si la dame
//      seule l'occupe SEULE, seulement en famille 1, le plus court des deux délais gagne).
//   C. Moteur rapide contre rules.js, coup pour coup, sur des parties aléatoires (positions de finale et de milieu
//      de partie qui y entrent par des prises) : mêmes états à chaque demi-coup, unmakeMove restitue tout.
//   D. Symétrie Blancs / Noirs (rotation de 180° + échange des couleurs).
//   E. Dans la recherche : nulle au bon demi-coup, priorité de la perte (mat au dernier coup), racine, table de
//      transposition, élagage.
//   F. Chaîne appli → contrôleur → Worker (analysisHistory, DraughtsGame, historique transmis).
//   G. Auto-jeu (training/game.mjs) : même règle que le Worker, motifs enregistrés, vérification avec rules.js.
import {
  FastBoard, moveToUi, moveToString, endgameFamilyOfCounts as fastFamily, ENDGAME_REASONS,
  DRAW_ENDGAME16_PLIES, DRAW_ENDGAME5_PLIES, DRAW_DIAGONAL_PLIES,
} from '../js/ai/fastboard.js';
import {
  DraughtsGame, applySimpleMove, applyCaptureSequence, generateLegalMoves, endgameFamily, endgameFamilyOfCounts as rulesFamily,
  endgameStep, endgameStateAfter, endgameDrawReason, loneKingAloneOnLongDiagonal, LONG_DIAGONAL,
  ENDGAME_PLIES_16, ENDGAME_PLIES_5, ENDGAME_DIAGONAL_PLIES, ENDGAME_REASONS as RULES_REASONS,
} from '../js/engine/rules.js';
import { analyseSync, searchFixedDepth, normalizeHistory } from '../js/ai/search.js';
import { analysisHistory } from '../js/ai/analysis-format.js';
import { runMessage } from '../js/ai/worker.js';
import { createAnalysisController } from '../js/ai/analysis-controller.js';
import { GameState, playGame, verifyGame, makePlayer, resolveWeights, moveNotation, ENDGAME_RULES_ID } from '../training/game.mjs';
import { mulberry32, parsePos, toPosition } from './helpers.mjs';

let failures = 0;
const ok = (label, cond, extra = '') => { if (!cond) failures++; console.log(`${cond ? 'OK ' : 'ERR'} ${label}${extra ? ' — ' + extra : ''}`); };
const J = (x) => JSON.stringify(x);

// --- Outils ------------------------------------------------------------------------------------------------------------
// Plateau de l'interface (51 cases) depuis des listes de cases : { wm, wk, bm, bk }.
function boardOf({ wm = [], wk = [], bm = [], bk = [] }) {
  const b = new Array(51).fill(null);
  wm.forEach((s) => { b[s] = { color: 'w', king: false }; });
  wk.forEach((s) => { b[s] = { color: 'w', king: true }; });
  bm.forEach((s) => { b[s] = { color: 'b', king: false }; });
  bk.forEach((s) => { b[s] = { color: 'b', king: true }; });
  return b;
}
// Position miroir : rotation de 180° (case s ↔ 51 − s) et échange des couleurs.
function mirrorUi(board) {
  const out = new Array(51).fill(null);
  for (let s = 1; s <= 50; s++) if (board[s]) out[51 - s] = { color: board[s].color === 'w' ? 'b' : 'w', king: board[s].king };
  return out;
}
// Applique un coup du moteur rapide sur un plateau de l'interface (avec rules.js).
function applyUi(board, m) {
  const ui = moveToUi(m);
  if (Array.isArray(ui)) return applyCaptureSequence(board, board[ui[0].from], ui).board;
  return applySimpleMove(board, board[ui.from], ui).board;
}
// Une partie « prudente » : prise obligatoire jouée ; sinon premier coup (ou celui choisi par `pick`) qui ne donne
// aucune prise à l'adversaire. Retourne la liste des plateaux (position de départ comprise) ; fb avance en parallèle.
function walk(fb, plies, pick = null) {
  const boards = [fb.toUiBoard()];
  for (let i = 0; i < plies; i++) {
    const moves = fb.generateMoves();
    if (moves.length === 0) break;
    let chosen = null;
    if (moves[0].caps.length > 0) chosen = moves[0];
    else {
      const safe = moves.filter((m) => {
        fb.makeMove(m);
        const reply = fb.generateMoves();
        const gives = reply.length > 0 && reply[0].caps.length > 0;
        fb.unmakeMove();
        return !gives;
      });
      const pool = safe.length ? safe : moves;
      chosen = (pick && pick(pool, fb)) || pool[0];
    }
    fb.makeMove(chosen);
    boards.push(fb.toUiBoard());
  }
  return boards;
}
const statesOf = (boards) => { let st = null; return boards.map((b) => (st = endgameStep(st, b))); };
const reasonsOf = (states) => states.map((s) => endgameDrawReason(s));
const firstDraw = (states) => { const i = reasonsOf(states).findIndex((r) => r !== null); return i; };

// --- A. Familles ------------------------------------------------------------------------------------------------------
{
  // Attendu, écrit à la main d'après le texte (un camp = une dame seule ; l'autre : (pions, dames)).
  const A = [[0, 3], [1, 2], [2, 1]], B = [[0, 2], [1, 1], [0, 1]];
  const expected = (wm, wk, bm, bk) => {
    const against = (m, k) => (A.some(([a, b]) => a === m && b === k) ? 1 : B.some(([a, b]) => a === m && b === k) ? 2 : 0);
    const whiteLone = wm === 0 && wk === 1, blackLone = bm === 0 && bk === 1;
    if (whiteLone && blackLone) return 2;
    if (blackLone) return against(wm, wk);
    if (whiteLone) return against(bm, bk);
    return 0;
  };
  let combos = 0, badFast = 0, badRules = 0, badBoard = 0, badMoteur = 0;
  const counts = { 0: 0, 1: 0, 2: 0 };
  for (let wm = 0; wm <= 4; wm++) for (let wk = 0; wk <= 4; wk++) for (let bm = 0; bm <= 4; bm++) for (let bk = 0; bk <= 4; bk++) {
    combos++;
    const e = expected(wm, wk, bm, bk);
    counts[e]++;
    if (fastFamily(wm, wk, bm, bk) !== e) badFast++;
    if (rulesFamily(wm, wk, bm, bk) !== e) badRules++;
    // Plateaux réels : pièces sur des cases quelconques (pions hors rangée de promotion), même verdict de bout en bout.
    const used = [];
    const take = (n, from) => Array.from({ length: n }, () => { const s = from + used.length; used.push(s); return s; });
    const board = boardOf({ wm: take(wm, 26), wk: take(wk, 31), bm: take(bm, 11), bk: take(bk, 16) });
    if (endgameFamily(board) !== e) badBoard++;
    const st = FastBoard.fromUiBoard(board, 'w').egState();
    const famFromState = st === null ? 0 : st.limit === ENDGAME_PLIES_16 ? 1 : 2;
    if (famFromState !== e) badMoteur++;
  }
  ok(`A1 familles : ${combos} effectifs, moteur rapide = texte (écrit à la main)`, badFast === 0, `${badFast} écart(s)`);
  ok('A1 … rules.js = texte', badRules === 0, `${badRules} écart(s)`);
  ok('A1 … sur de vrais plateaux, rules.js et FastBoard donnent le même verdict', badBoard === 0 && badMoteur === 0, `${badBoard} / ${badMoteur} écart(s)`);
  ok(`A1 répartition : ${counts[1]} effectifs en famille 1 (3 + 3 : trois compositions, dame seule blanche ou noire), ${counts[2]} en famille 2 (3 + 3 − 1 : dame contre dame compté une fois)`, counts[1] === 6 && counts[2] === 5);
  ok('A2 constantes : 16 coups = 32 demi-coups, 5 coups = 10, diagonale = 10, identiques dans les deux moteurs',
    ENDGAME_PLIES_16 === 32 && ENDGAME_PLIES_5 === 10 && ENDGAME_DIAGONAL_PLIES === 10
    && DRAW_ENDGAME16_PLIES === 32 && DRAW_ENDGAME5_PLIES === 10 && DRAW_DIAGONAL_PLIES === 10 && J(ENDGAME_REASONS) === J(RULES_REASONS));
  ok('A3 grande diagonale : 10 cases FMJD 5, 10, 14, 19, 23, 28, 32, 37, 41, 46 (symétrique par rotation de 180°)',
    J(LONG_DIAGONAL) === J([5, 10, 14, 19, 23, 28, 32, 37, 41, 46]) && LONG_DIAGONAL.every((s) => LONG_DIAGONAL.includes(51 - s)));
}

// --- B. Comptage sur des plateaux écrits à la main ----------------------------------------------------------------------
{
  const seq = (board, n) => Array.from({ length: n }, () => board);
  const twoKings = boardOf({ wk: [1, 2], bk: [46] });                 // famille 2 (art. 6.4)
  const threeKings = boardOf({ wk: [1, 2, 3], bk: [45] });            // famille 1 (art. 6.3), dame seule hors diagonale
  const s1 = statesOf(seq(twoKings, 14));
  ok('B1 art. 6.4 : le compteur vaut 0 à la position où la finale apparaît, puis +1 par demi-coup', J(s1[0]) === J({ plies: 0, limit: 10, diag: -1 }) && s1[9].plies === 9 && s1[10].plies === 10);
  ok('B1 … 9 demi-coups écoulés : pas de nulle ; 10 (5 coups de chaque camp) : nulle « endgame5 »', reasonsOf(s1)[9] === null && reasonsOf(s1)[10] === 'endgame5' && firstDraw(s1) === 10);
  const s2 = statesOf(seq(threeKings, 40));
  ok('B2 art. 6.3 : 31 demi-coups écoulés : pas de nulle ; 32 (16 coups de chaque camp) : nulle « endgame16 »', reasonsOf(s2)[31] === null && reasonsOf(s2)[32] === 'endgame16' && firstDraw(s2) === 32);
  for (const [name, b] of [['dame + pion contre dame', boardOf({ wk: [1], wm: [30], bk: [45] })], ['dame contre dame', boardOf({ wk: [1], bk: [45] })]]) {
    ok(`B3 art. 6.4, ${name} : 10 demi-coups`, firstDraw(statesOf(seq(b, 14))) === 10);
  }
  for (const [name, b] of [['2 dames + 1 pion', boardOf({ wk: [1, 2], wm: [30], bk: [45] })], ['1 dame + 2 pions', boardOf({ wk: [1], wm: [30, 31], bk: [45] })]]) {
    ok(`B3 art. 6.3, ${name} contre une dame : 32 demi-coups`, firstDraw(statesOf(seq(b, 36))) === 32);
  }
  // Camp des Noirs : même verdict (la règle ne dépend pas de la couleur).
  ok('B3 Noirs qui ont l\'avantage : mêmes délais', firstDraw(statesOf(seq(mirrorUi(twoKings), 14))) === 10 && firstDraw(statesOf(seq(mirrorUi(threeKings), 40))) === 32);

  // Une prise pendant les 16 coups : le compteur continue, le maximum de 16 coups reste valable (texte 2024).
  const fromThree = [...seq(threeKings, 5), ...seq(boardOf({ wk: [1, 2], bk: [45] }), 35)];
  const s4 = statesOf(fromThree);
  ok('B4 3 dames → 2 dames (prise) au 5e demi-coup : le compteur CONTINUE (pas de remise à 0)', s4[5].plies === 5 && s4[6].plies === 6);
  ok('B4 … la limite reste 16 coups : pas de nulle à 10 demi-coups, nulle à 32', s4[9].limit === 32 && reasonsOf(s4)[10] === null && firstDraw(s4) === 32);
  ok('B4 … famille 2 sans passage par la famille 1 : limite 10 (contre-épreuve)', statesOf(seq(boardOf({ wk: [1, 2], bk: [45] }), 14))[0].limit === 10);

  // Sortie de la finale : compteur remis à zéro ; nouvelle apparition : on repart de cette position.
  const away = boardOf({ wk: [1, 2], bk: [45, 46] });                  // 2 dames contre 2 dames : pas une finale
  const s5 = statesOf([...seq(threeKings, 20), away, away, ...seq(twoKings, 12)]);
  ok('B5 sortie de la finale (aucune famille) : état nul', s5[20] === null && s5[21] === null);
  ok('B5 … nouvelle apparition : le compteur repart de 0 avec la limite de la NOUVELLE famille (5 coups)', J(s5[22]) === J({ plies: 0, limit: 10, diag: -1 }) && firstDraw(s5) === 32 && reasonsOf(s5)[32] === 'endgame5');
  const s5b = statesOf([...seq(threeKings, 20), away, ...seq(twoKings, 12)]);
  ok('B5 … la nulle tombe 10 demi-coups après la nouvelle apparition, pas 32 après la première', firstDraw(s5b) === 31 && reasonsOf(s5b)[31] === 'endgame5');

  // Grande diagonale : la dame seule d'un camp occupe SEULE la grande diagonale (famille 1) → 5 coups.
  const lone = (sq) => boardOf({ wk: [1, 2, 3], bk: [sq] });
  const s6 = statesOf(seq(lone(28), 14));
  ok('B6 dame seule sur la grande diagonale, personne d\'autre dessus : 10 demi-coups (« diagonal5 »), pas 32', J(s6[0]) === J({ plies: 0, limit: 32, diag: 0 }) && reasonsOf(s6)[9] === null && reasonsOf(s6)[10] === 'diagonal5' && firstDraw(s6) === 10);
  ok('B6 … une autre pièce sur la diagonale (la dame n\'y est plus seule) : pas de clause, 32 demi-coups', firstDraw(statesOf(seq(boardOf({ wk: [1, 2, 23], bk: [28] }), 40))) === 32);
  ok('B6 … dame seule HORS de la diagonale : 32 demi-coups', firstDraw(statesOf(seq(lone(45), 40))) === 32);
  ok('B6 … la dame sur la diagonale mais le camp a aussi un pion : ce n\'est pas la dame SEULE (famille 1 : 1 dame + 2 pions contre dame seule)', !loneKingAloneOnLongDiagonal(boardOf({ wk: [1], wm: [30, 31], bk: [28], bm: [20] })));
  // Elle monte sur la diagonale en cours de route : 5 coups à partir de ce moment, ou 16 depuis l'apparition si c'est plus court.
  const offDiag = lone(45), onDiag = lone(28);
  const s7 = statesOf([...seq(offDiag, 20), ...seq(onDiag, 14)]);
  ok('B7 monte sur la diagonale au 20e demi-coup : diag 0 à cet instant, nulle 10 demi-coups après (30e)', s7[19].diag === -1 && s7[20].diag === 0 && firstDraw(s7) === 30 && reasonsOf(s7)[30] === 'diagonal5');
  const s8 = statesOf([...seq(offDiag, 28), ...seq(onDiag, 14)]);
  ok('B7 monte au 28e demi-coup : les 10 demi-coups iraient au 38e, la limite de 16 coups (32e) tombe avant', firstDraw(s8) === 32 && reasonsOf(s8)[32] === 'endgame16');
  const s9 = statesOf([...seq(onDiag, 6), ...seq(offDiag, 3), ...seq(onDiag, 14)]);
  ok('B7 quitte la diagonale puis y revient : le compte de 5 coups repart de 0 au retour', s9[5].diag === 5 && s9[6].diag === -1 && s9[9].diag === 0 && firstDraw(s9) === 19);
  const s10 = statesOf([...seq(onDiag, 4), ...seq(boardOf({ wk: [1, 2], bk: [28] }), 40)]);
  ok('B8 la clause ne vaut qu\'en famille 1 : après une prise (2 dames contre dame), plus de clause, la limite de 16 coups reste', s10[3].diag === 3 && s10[4].diag === -1 && firstDraw(s10) === 32);
  ok('B8 dame contre dame sur la diagonale : famille 2, limite 5 coups, pas de clause', J(statesOf(seq(boardOf({ wk: [1], bk: [28] }), 3))[0]) === J({ plies: 0, limit: 10, diag: -1 }));
  ok('B9 hors finale : null, jamais de nulle', statesOf(seq(boardOf({ wk: [1, 2, 3, 4], bk: [45] }), 50)).every((s) => s === null));
  ok('B10 endgameDrawReason(null) = null ; endgameStateAfter([]) = null', endgameDrawReason(null) === null && endgameStateAfter([]) === null);
}

// --- C. Moteur rapide contre rules.js, coup pour coup ---------------------------------------------------------------------
const SQUARES_FOR_MEN = { w: Array.from({ length: 45 }, (_, i) => 6 + i), b: Array.from({ length: 45 }, (_, i) => 1 + i) }; // hors rangée de promotion
function randomPosition(rnd, kind) {
  const pickFree = (list, used) => { for (;;) { const s = list[Math.floor(rnd() * list.length)]; if (!used.has(s)) { used.add(s); return s; } } };
  const all = Array.from({ length: 50 }, (_, i) => i + 1);
  const used = new Set();
  const spec = { wm: [], wk: [], bm: [], bk: [] };
  if (kind === 'family') {
    const comps = [[0, 3], [1, 2], [2, 1], [0, 2], [1, 1], [0, 1]];
    const [m, k] = comps[Math.floor(rnd() * comps.length)];
    const loneWhite = rnd() < 0.5;
    const att = loneWhite ? 'b' : 'w', lon = loneWhite ? 'w' : 'b';
    spec[`${lon}k`].push(pickFree(all, used));
    for (let i = 0; i < k; i++) spec[`${att}k`].push(pickFree(all, used));
    for (let i = 0; i < m; i++) spec[`${att}m`].push(pickFree(SQUARES_FOR_MEN[att], used));
  } else { // petit effectif quelconque (entre dans une famille par des prises, en sort, promeut…)
    const n = 3 + Math.floor(rnd() * 5);
    for (let i = 0; i < n; i++) {
      const color = rnd() < 0.5 ? 'w' : 'b';
      if (rnd() < 0.5) spec[`${color}k`].push(pickFree(all, used));
      else spec[`${color}m`].push(pickFree(SQUARES_FOR_MEN[color], used));
    }
  }
  return { board: boardOf(spec), side: rnd() < 0.5 ? 'w' : 'b' };
}
{
  const rnd = mulberry32(6364);
  const stats = { walks: 0, plies: 0, entries: 0, exits: 0, a2b: 0, promos: 0, diagOn: 0, draws: 0 };
  let badState = 0, badBoard = 0, badUnmake = 0, badReason = 0, badCount = 0;
  for (let g = 0; g < 700; g++) {
    const pos = randomPosition(rnd, g % 2 === 0 ? 'family' : 'small');
    const fb = FastBoard.fromUiBoard(pos.board, pos.side);
    let board = pos.board;
    let ref = endgameStep(null, board);
    if (J(fb.egState()) !== J(ref)) badState++;
    const saved = [J(fb.egState())];
    let plies = 0;
    for (; plies < 90; plies++) {
      const moves = fb.generateMoves();
      if (moves.length === 0) break;
      const m = moves[Math.floor(rnd() * moves.length)];
      const famBefore = endgameFamily(board);
      fb.makeMove(m);
      board = applyUi(board, m);
      const prev = ref;
      ref = endgameStep(ref, board);
      if (J(fb.egState()) !== J(ref)) badState++;
      if (J(fb.toUiBoard()) !== J(board)) badBoard++;
      if (fb.egDrawReason() !== ENDGAME_REASONS.indexOf(endgameDrawReason(ref))) badReason++;
      const cnt = [0, 0, 0, 0, 0];
      for (let i = 0; i < 50; i++) cnt[fb.board[i]]++;
      if (fb.np !== cnt[1] + cnt[2] + cnt[3] + cnt[4] || fb.cnt[1] !== cnt[1] || fb.cnt[2] !== cnt[2] || fb.cnt[3] !== cnt[3] || fb.cnt[4] !== cnt[4]) badCount++;
      if (!prev && ref) stats.entries++;
      if (prev && !ref) stats.exits++;
      if (famBefore === 1 && endgameFamily(board) === 2) stats.a2b++; // passage de la famille 1 à la famille 2 par une prise
      if (m.promo && ref) stats.promos++;
      if (ref && ref.diag > 0) stats.diagOn++;
      saved.push(J(fb.egState()));
      if (endgameDrawReason(ref)) { stats.draws++; }
    }
    // Retour arrière complet : chaque état est restitué à l'identique.
    for (let p = plies - 1; p >= 0; p--) { fb.unmakeMove(); if (J(fb.egState()) !== saved[p]) badUnmake++; }
    stats.walks++; stats.plies += plies;
  }
  ok(`C1 ${stats.walks} parties aléatoires (${stats.plies} demi-coups) : état de finale de FastBoard = rules.js à chaque demi-coup`, badState === 0, `${badState} écart(s)`);
  ok('C1 … plateaux identiques, motif de nulle identique, effectifs tenus à jour', badBoard === 0 && badReason === 0 && badCount === 0, `${badBoard} / ${badReason} / ${badCount}`);
  ok('C1 … unmakeMove restitue l\'état de finale à chaque demi-coup (partie entière annulée)', badUnmake === 0, `${badUnmake} écart(s)`);
  ok(`C2 la mesure est significative : ${stats.entries} apparitions, ${stats.exits} sorties, ${stats.a2b} passages famille 1 → 2 par une prise, ${stats.promos} promotions en finale, ${stats.diagOn} positions « dame seule sur la diagonale », ${stats.draws} nulles`,
    stats.entries >= 30 && stats.exits >= 30 && stats.a2b >= 5 && stats.promos >= 5 && stats.diagOn >= 20 && stats.draws >= 20);
  // Plateau rempli à la main (aucun appel à fromUiBoard) : les effectifs sont comptés au premier makeMove.
  const manual = new FastBoard();
  manual.board[0] = 3; manual.board[1] = 3; manual.board[45] = 4;
  manual.makeMove(manual.generateMoves()[0]);
  ok('C3 plateau rempli à la main : effectifs et état de finale corrects dès le premier coup', manual.np === 3 && manual.eg === 1 && manual.egLim === 10);
}

// --- D. Symétrie Blancs / Noirs ------------------------------------------------------------------------------------------
{
  const rnd = mulberry32(2024);
  let seqs = 0, bad = 0, badFb = 0;
  for (let g = 0; g < 300; g++) {
    const pos = randomPosition(rnd, g % 2 === 0 ? 'family' : 'small');
    const fb = FastBoard.fromUiBoard(pos.board, pos.side);
    const boards = walk(fb, 70, (pool) => pool[Math.floor(rnd() * pool.length)]);
    const mirrored = boards.map(mirrorUi);
    const a = statesOf(boards), b = statesOf(mirrored);
    seqs++;
    if (J(a) !== J(b)) bad++;
    // Même chose avec le moteur rapide : on le rejoue sur la position miroir avec les coups miroirs.
    const fm = FastBoard.fromUiBoard(mirrored[0], pos.side === 'w' ? 'b' : 'w');
    const fo = FastBoard.fromUiBoard(boards[0], pos.side);
    if (J(fm.egState()) !== J(fo.egState())) badFb++;
  }
  ok(`D1 symétrie : ${seqs} parties, suites d'états identiques pour la position et pour son miroir (rotation de 180° + échange des couleurs)`, bad === 0, `${bad} écart(s)`);
  ok('D1 … et pour le moteur rapide à la position de départ', badFb === 0);
  ok('D2 la clause de la diagonale est symétrique (case s ↔ 51 − s) : dame seule en 5 ou en 46, 10 demi-coups dans les deux cas',
    firstDraw(statesOf(Array.from({ length: 14 }, () => boardOf({ wk: [20, 21, 22], bk: [5] })))) === 10
    && firstDraw(statesOf(Array.from({ length: 14 }, () => boardOf({ wk: [20, 21, 22], bk: [46] })))) === 10
    && firstDraw(statesOf(Array.from({ length: 14 }, () => mirrorUi(boardOf({ wk: [20, 21, 22], bk: [5] }))))) === 10);
}

// --- E. Dans la recherche -----------------------------------------------------------------------------------------------------
const H = (plies, limit, diag = -1) => ({ quiet: 0, positions: [], endgame: { plies, limit, diag } });
const run = (pos, history, depth = 8) => analyseSync(pos, { maxDepth: depth, maxTimeMs: 1e9, history });
{
  const pos = parsePos('w|K1,K2|K46'); // 2 dames contre 1 : famille 2 (5 coups)
  const free = run(pos);
  ok('E1 sans historique : la finale « apparaît » à la racine (compteur 0) : l\'avantage des 2 dames est affiché (horizon 8 < 10)', free.score > 0 && free.drawRule === null, `score ${free.score}`);
  const r8 = run(pos, H(8, 10)), r9 = run(pos, H(9, 10)), r10 = run(pos, H(10, 10));
  ok('E1 8 demi-coups écoulés : le seuil (10) tombe dans l\'horizon : tous les coups mènent à la nulle, score 0', r8.score === 0 && r8.mate === null, `score ${r8.score}`);
  ok('E1 9 demi-coups écoulés : score 0', r9.score === 0);
  ok('E1 10 demi-coups à la racine : partie déjà nulle (drawRule = endgame5), la recherche rend quand même un coup', r10.drawRule === 'endgame5' && r10.bestMove !== null);
  ok('E1 … 9 demi-coups : drawRule = null', r9.drawRule === null);
  const r5 = run(pos, H(0, 10));
  ok('E1 compteur 0 donné explicitement = pas d\'historique', r5.score === free.score && r5.bestMoveNotation === free.bestMoveNotation);
  const r6 = run(pos, H(20, 32));
  ok('E2 art. 6.3 conservé après un passage de la famille 1 à la 2 (limite 32) : à 20 demi-coups écoulés, rien à 10', r6.score > 0 && r6.drawRule === null, `score ${r6.score}`);
  const r7 = run(pos, H(26, 32));
  ok('E2 … à 26 demi-coups écoulés, le seuil de 32 est dans l\'horizon : score 0', r7.score === 0);
  const r32 = run(parsePos('w|K1,K2,K3|K45'), H(32, 32));
  ok('E3 3 dames contre une : 32 demi-coups à la racine : drawRule = endgame16', r32.drawRule === 'endgame16');
  const rd = run(parsePos('w|K1,K2,K3|K28'), H(10, 32, 10));
  ok('E3 dame seule sur la diagonale depuis 10 demi-coups : drawRule = diagonal5', rd.drawRule === 'diagonal5');
  ok('E3 … à 9 : rien', run(parsePos('w|K1,K2,K3|K28'), H(9, 32, 9)).drawRule === null);
}
{
  // Priorité de la perte : le dernier coup bloque (ou prend) la dernière pièce adverse : mat, pas nulle.
  // Dame noire seule en 5 (coin de la grande diagonale) ; dames blanches en 10, 20 et 46. Les Blancs jouent 20-14 :
  // la dame noire n'a plus de coup (10 est occupée et 14 derrière elle aussi) : elle a perdu.
  const pos = parsePos('w|K10,K20,K46|K5');
  const fresh = run(pos, null, 6);
  ok('E4 position de blocage en 1 coup : mat en 1 pour les Blancs sans historique', fresh.mate && fresh.mate.winner === 'w' && fresh.mate.in === 1 && fresh.bestMoveNotation === '20-14', J(fresh.mate));
  const last = run(pos, H(31, 32), 6);
  ok('E4 le coup qui bloque est le 32e demi-coup : la PERTE l\'emporte sur la nulle des 16 coups (mat en 1)', last.mate && last.mate.winner === 'w' && last.mate.in === 1 && last.bestMoveNotation === '20-14', J(last.mate));
  const last5 = run(parsePos('w|K10,K20|K5'), H(9, 10), 6);
  ok('E4 art. 6.4 : même priorité (2 dames contre une, le blocage est le 10e demi-coup) : mat en 1', last5.mate && last5.mate.winner === 'w' && last5.mate.in === 1, J(last5.mate));
  // Pas de blocage possible au dernier coup : tout mène à la nulle.
  const none = run(parsePos('w|K1,K2,K3|K45'), H(31, 32), 6);
  ok('E4 contre-épreuve : 3 dames contre une, aucun blocage possible au 32e demi-coup : score 0, pas de mat', none.mate === null && none.score === 0, `score ${none.score}`);
  // Au bord de la limite : le sacrifice 3-12, 45x7 (prise obligatoire), 1x12 gagne la dame seule en 3 demi-coups.
  const sac = parsePos('w|K1,K2,K3|K45');
  const sacFree = run(sac, null, 6);
  ok('E4 le sacrifice gagne en 2 coups sans historique (3-12, prise obligatoire, 1x12)', sacFree.mate && sacFree.mate.in === 2 && sacFree.bestMoveNotation === '3-12', J(sacFree.mate));
  const sac29 = run(sac, H(29, 32), 6);
  ok('E4 … la reprise est le 32e demi-coup (29 écoulés à la racine) : elle gagne encore (perte prioritaire)', sac29.mate && sac29.mate.in === 2, J(sac29.mate));
  const sac30 = run(sac, H(30, 32), 6);
  ok('E4 … la reprise serait le 33e demi-coup : la partie est nulle avant (la prise noire du 32e demi-coup clôt les 16 coups), score 0', sac30.mate === null && sac30.score === 0, `score ${sac30.score}`);
  // Priorité côté auto-jeu et vérification.
  const st = new GameState({ board: pos.board, side: 'w' });
  st.fb.eg = 31; // 31 demi-coups écoulés (essai : on fixe le compteur de la partie)
  st.apply(st.fb.generateMoves().find((m) => moveToString(m) === '20-14'));
  const t = st.terminal(300);
  ok('E5 auto-jeu : le 32e demi-coup bloque la dernière dame : « noMoves » (perte des Noirs), pas « endgame16 »', t && t.reason === 'noMoves' && t.result === '1-0', J(t));
}
{
  // Table de transposition et élagage : mêmes scores avec et sans, à des compteurs proches de la limite.
  const rnd = mulberry32(555);
  let n = 0, mismTT = 0, mismPrune = 0;
  for (let i = 0; n < 60; i++) {
    const pos = randomPosition(rnd, 'family');
    const fb0 = FastBoard.fromUiBoard(pos.board, pos.side);
    if (fb0.generateMoves().length === 0) continue;
    const st = fb0.egState();
    const plies = Math.floor(rnd() * st.limit);
    const diag = st.diag >= 0 ? Math.min(plies, Math.floor(rnd() * 10)) : -1;
    const hist = H(plies, st.limit, diag);
    const a = analyseSync(toPosition(fb0), { maxDepth: 7, maxTimeMs: 1e9, useTT: false, history: hist });
    const b = analyseSync(toPosition(fb0), { maxDepth: 7, maxTimeMs: 1e9, useTT: true, history: hist });
    n++;
    if (a.score !== b.score || J(a.mate) !== J(b.mate)) mismTT++;
    if (n <= 25) {
      const f1 = FastBoard.fromUiBoard(pos.board, pos.side), f2 = FastBoard.fromUiBoard(pos.board, pos.side);
      const x = searchFixedDepth(f1, 5, { prune: false, useTT: false, history: hist });
      const y = searchFixedDepth(f2, 5, { prune: true, useTT: true, history: hist });
      if (x.score !== y.score) mismPrune++;
    }
  }
  ok(`E6 table de transposition : ${n} positions de finale, compteurs quelconques (diagonale comprise) : score avec table = score sans table (profondeur 7)`, mismTT === 0, `${mismTT} écart(s)`);
  ok('E6 élagage + table = négamax pur (profondeur 5, 25 positions)', mismPrune === 0, `${mismPrune} écart(s)`);
  ok('E7 historique : normalizeHistory conserve endgame valide, rejette limite ou compteur invalides, et accepte un historique réduit à endgame',
    J(normalizeHistory({ endgame: { plies: 3, limit: 10, diag: -1 } }).endgame) === J({ plies: 3, limit: 10, diag: -1 })
    && normalizeHistory({ endgame: { plies: 3, limit: 11, diag: -1 } }).endgame === null
    && normalizeHistory({ endgame: { plies: -1, limit: 10 } }).endgame === null
    && normalizeHistory({ endgame: { plies: 3, limit: 32 } }).endgame.diag === -1
    && normalizeHistory({ quiet: 0, positions: [] }).endgame === null && normalizeHistory(null) === null);
}

// --- F. Chaîne appli → contrôleur → Worker --------------------------------------------------------------------------------
async function viaWorker(msg) {
  const out = [];
  await runMessage({ id: 1, ...msg }, (d) => out.push(d));
  return out[out.length - 1];
}
{
  // analysisHistory + DraughtsGame sur une vraie suite de coups (rules.js) : état de la finale à la position affichée.
  const start = parsePos('w|K1,K6,K11|K46');
  const fb = FastBoard.fromUiBoard(start.board, 'w');
  const game = new DraughtsGame();
  game.board = start.board; game.sideToMove = 'w'; game.history = [];
  let fine = true;
  for (let i = 0; i < 40; i++) {
    const moves = fb.generateMoves();
    if (!moves.length || moves[0].caps.length) { fine = fb.eg >= 0; break; }
    const safe = moves.filter((m) => { fb.makeMove(m); const r = fb.generateMoves(); const g = r.length && r[0].caps.length; fb.unmakeMove(); return !g; });
    const m = (safe.length ? safe : moves)[0];
    const ui = moveToUi(m);
    game.playSimpleMove(ui);
    fb.makeMove(m);
    const h = analysisHistory(game.history, game.board);
    if (J(h.endgame ?? null) !== J(fb.egState())) fine = false;
    if (J(game.endgameState()) !== J(fb.egState())) fine = false;
    if ((game.endgameDraw() ?? null) !== (ENDGAME_REASONS[fb.egDrawReason()] ?? null)) fine = false;
  }
  ok('F1 analysisHistory(entries, plateau) et DraughtsGame.endgameState() = état de FastBoard à chaque demi-coup (3 dames contre une, 40 demi-coups)', fine);
  ok('F1 … la partie a bien atteint la nulle des 16 coups (32 demi-coups) : DraughtsGame.endgameDraw() = endgame16', game.endgameDraw() === 'endgame16' && game.history.length === 40);
  ok('F1 analysisHistory sans plateau courant : pas de clé endgame (comportement d\'avant)', !('endgame' in analysisHistory(game.history)) && !('endgame' in analysisHistory([], null)));
  ok('F1 hors finale (position initiale) : pas de clé endgame', !('endgame' in analysisHistory([], new DraughtsGame().board)));

  // Worker
  const pos = parsePos('w|K1,K2|K46');
  const w0 = await viaWorker({ type: 'analyse', position: pos, options: { maxDepth: 8, maxTimeMs: 1e9 } });
  const w1 = await viaWorker({ type: 'analyse', position: pos, history: H(9, 10), options: { maxDepth: 8, maxTimeMs: 1e9 } });
  const w2 = await viaWorker({ type: 'analyse', position: pos, history: H(10, 10), options: { maxDepth: 4, maxTimeMs: 1e9 } });
  ok('F2 Worker sans historique : résultat d\'avant (avantage affiché, aucune nulle)', w0.ok && w0.result.score > 0 && w0.result.drawRule === null);
  ok('F2 Worker avec history.endgame (quiet 0, aucune position) : la nulle de finale est vue (score 0)', w1.ok && w1.result.score === 0 && w1.result.drawRule === null);
  ok('F2 Worker : drawRule = endgame5 pour 10 demi-coups écoulés', w2.ok && w2.result.drawRule === 'endgame5');
  const direct = run(pos, H(9, 10));
  ok('F2 Worker = recherche directe (même historique)', w1.result.score === direct.score && w1.result.bestMoveNotation === direct.bestMoveNotation);
}
{
  // Contrôleur : l'état de finale part avec la requête même à quiet = 0, et fait partie de la clé de déduplication.
  const sent = [], timers = [];
  const ctl = createAnalysisController({
    createWorker: () => ({ postMessage: (m) => sent.push(m), terminate() {}, onmessage: null, onerror: null }),
    onChange() {}, setTimer: (f) => { timers.push(f); return timers.length; }, clearTimer() {},
  });
  const pos = parsePos('w|K1,K2|K46');
  ctl.enable();
  ctl.request(pos);
  timers.shift()();
  ok('F3 contrôleur : sans historique, pas de clé history (message d\'avant)', sent.length === 1 && !('history' in sent[0]));
  ctl.request(pos, { positions: [], quiet: 0, endgame: { plies: 4, limit: 10, diag: -1 } });
  timers.shift()();
  ok('F3 contrôleur : quiet = 0 mais état de finale → history envoyé avec endgame (et sans position)', sent.length === 2 && sent[1].history.quiet === 0 && sent[1].history.positions.length === 0 && J(sent[1].history.endgame) === J({ plies: 4, limit: 10, diag: -1 }));
  ctl.request(pos, { positions: [], quiet: 0, endgame: { plies: 4, limit: 10, diag: -1 } });
  ok('F3 contrôleur : même position et même état de finale → rien de relancé', timers.length === 0);
  ctl.request(pos, { positions: [], quiet: 0, endgame: { plies: 5, limit: 10, diag: -1 } });
  ok('F3 contrôleur : même position, compteur de finale différent → nouvelle requête', timers.length === 1);
  timers.shift()();
  ok('F3 … et la requête porte le nouveau compteur', sent.length === 3 && sent[2].history.endgame.plies === 5);
  ctl.request(pos, { positions: [], quiet: 0 });
  timers.shift()();
  ok('F3 contrôleur : retour à « sans état » → plus de history', sent.length === 4 && !('history' in sent[3]));
}

// --- G. Auto-jeu (training/game.mjs) ----------------------------------------------------------------------------------------
{
  const player = (depth = 2) => makePlayer({ name: 'v0', weights: resolveWeights('v0'), depth });
  const start = parsePos('w|K1,K2|K46'); // 2 dames contre 1 : 5 coups
  const g = playGame({ white: player(), black: player(), start: { board: start.board, side: 'w' }, maxPlies: 300 });
  ok('G1 partie jouée depuis 2 dames contre une : nulle « endgame5 » après exactement 10 demi-coups', g.reason === 'endgame5' && g.result === '1/2' && g.plies === 10, `${g.reason} ${g.plies}`);
  const v = verifyGame(g, 300, { start: { board: start.board, side: 'w' } });
  ok('G1 … la vérification avec rules.js seul est d\'accord (motif, résultat, nombre de coups)', v.ok, v.error || '');
  const v0 = verifyGame(g, 300, { start: { board: start.board, side: 'w' }, endgameRules: false });
  ok('G1 … sans les règles de finale (anciennes parties), la même partie serait déclarée « terminée alors qu\'elle continue »', !v0.ok);
  // Parties jouées par la recherche (profondeur 2 et 4) depuis plusieurs finales : l'issue dépend de l'évaluation, donc on ne
  // fige pas laquelle ; en revanche rules.js, seul, doit TOUJOURS être d'accord sur le motif, le résultat et le nombre de coups.
  const starts = ['w|K1,K2,K3|K28', 'w|K1,K2,K3|K45', 'w|K1,K2,K3|K46', 'w|K1,K6|K45', 'b|K50,K49|K5', 'w|K1,K2,30|K45', 'w|K1,31,32|K45'];
  let all = 0, agree = 0; const reasons = {};
  for (const t of starts) for (const depth of [2, 4]) {
    const p = parsePos(t);
    const game = playGame({ white: player(depth), black: player(depth), start: { board: p.board, side: p.side }, maxPlies: 300 });
    const vv = verifyGame(game, 300, { start: { board: p.board, side: p.side } });
    all++; if (vv.ok) agree++;
    reasons[game.reason] = (reasons[game.reason] || 0) + 1;
    if (!vv.ok) console.log('   désaccord', t, depth, game.reason, game.plies, vv.error);
  }
  ok(`G2 ${all} parties de finale jouées par la recherche (motifs obtenus : ${J(reasons)}) : rules.js d'accord à chaque fois`, agree === all);
  // Même chose avec l'exploration de l'auto-jeu (coups tirés au hasard près du meilleur : le fils porte aussi l'état de finale).
  let expAgree = 0, expAll = 0;
  for (const t of ['w|K1,K2,K3|K46', 'w|K1,K2|K45', 'b|K50,K49,K48|K5']) for (const seed of [1, 2, 3]) {
    const p = parsePos(t);
    const game = playGame({ white: player(3), black: player(3), start: { board: p.board, side: p.side }, maxPlies: 300, explore: { prob: 1, margin: 60 }, rng: mulberry32(seed), record: true });
    expAll++;
    if (verifyGame(game, 300, { start: { board: p.board, side: p.side } }).ok) expAgree++;
  }
  ok(`G2 avec exploration de l'auto-jeu (prob 1) : ${expAll} parties de finale, rules.js d'accord à chaque fois`, expAgree === expAll);

  // Parties SCÉNARISÉES (coups choisis, sans recherche) : le moment exact de la nulle, de bout en bout (GameState puis rules.js).
  const DIAG0 = new Set(LONG_DIAGONAL.map((q) => q - 1));
  const scripted = (text, pick, maxPlies) => {
    const p = parsePos(text);
    const gs = new GameState({ board: p.board, side: p.side });
    const mv = [];
    let end = null;
    // On évite de répéter une position (sinon la 3e occurrence, art. 6.1, interromprait la partie avant la limite testée).
    const seen = new Set([`${gs.fb.side}${gs.fb.board.join('')}`]);
    const keyAfter = (m) => { gs.fb.makeMove(m); const k = `${gs.fb.side}${gs.fb.board.join('')}`; gs.fb.unmakeMove(); return k; };
    for (let i = 0; i < maxPlies; i++) {
      end = gs.terminal(300);
      if (end) break;
      const legal = gs.fb.generateMoves();
      const safe = legal.filter((m) => { gs.fb.makeMove(m); const r = gs.fb.generateMoves(); const bad = r.length && r[0].caps.length; gs.fb.unmakeMove(); return !bad; });
      let pool = safe.length ? safe : legal;
      const fresh = pool.filter((m) => !seen.has(keyAfter(m)));
      if (fresh.length) pool = fresh;
      const chosen = (pick && pick(pool, gs.fb)) || pool[0];
      mv.push(moveNotation(chosen, legal));
      gs.apply(chosen);
      seen.add(`${gs.fb.side}${gs.fb.board.join('')}`);
    }
    end = end || gs.terminal(300);
    return { rec: { moves: mv, result: end.result, reason: end.reason, plies: gs.plies }, start: { board: p.board, side: p.side } };
  };
  // La dame noire seule reste sur la grande diagonale ; les dames blanches restent hors de la diagonale.
  const keepOnDiagonal = (pool, fb) => pool.find((m) => (fb.side === 1 ? DIAG0.has(m.to) : !DIAG0.has(m.to))) || null;
  // La dame seule évite la grande diagonale (sinon la clause des 5 coups pourrait s'appliquer avant les 16 coups).
  const avoidDiagonal = (lone) => (pool, fb) => pool.find((m) => !(fb.side === lone && DIAG0.has(m.to))) || null;
  const sA = scripted('w|K1,K2,K3|K45', avoidDiagonal(1), 100);
  ok('G3 art. 6.3 scénarisé : 3 dames contre une dame hors diagonale, coups prudents : nulle « endgame16 » au 32e demi-coup exactement', sA.rec.reason === 'endgame16' && sA.rec.plies === 32, `${sA.rec.reason} ${sA.rec.plies}`);
  ok('G3 … et rules.js, seul, rejoue la partie à l\'identique', verifyGame(sA.rec, 300, { start: sA.start }).ok);
  const sB = scripted('w|K1,K2|K46', null, 100);
  ok('G3 art. 6.4 scénarisé : nulle « endgame5 » au 10e demi-coup exactement', sB.rec.reason === 'endgame5' && sB.rec.plies === 10, `${sB.rec.reason} ${sB.rec.plies}`);
  ok('G3 … vérifié par rules.js', verifyGame(sB.rec, 300, { start: sB.start }).ok);
  const sC = scripted('w|K1,K2,K3|K28', keepOnDiagonal, 100);
  ok('G3 grande diagonale scénarisée : la dame seule reste seule sur la diagonale : nulle « diagonal5 » au 10e demi-coup', sC.rec.reason === 'diagonal5' && sC.rec.plies === 10, `${sC.rec.reason} ${sC.rec.plies}`);
  ok('G3 … vérifié par rules.js', verifyGame(sC.rec, 300, { start: sC.start }).ok);
  const sD = scripted('b|K50,K49,K48|K5', avoidDiagonal(0), 100);
  ok('G3 Noirs qui ont l\'avantage (3 dames noires contre une dame blanche seule) : mêmes 32 demi-coups', sD.rec.reason === 'endgame16' && sD.rec.plies === 32, `${sD.rec.reason} ${sD.rec.plies}`);
  const wrongRec = { ...sA.rec, plies: 31, moves: sA.rec.moves.slice(0, 31) };
  ok('G3 une partie enregistrée qui s\'arrête UN demi-coup trop tôt est refusée par la vérification (la partie continue)', !verifyGame(wrongRec, 300, { start: sA.start }).ok);
  ok('G4 l\'identifiant des règles écrit dans l\'identité des runs existe', typeof ENDGAME_RULES_ID === 'string' && ENDGAME_RULES_ID.length > 3);

  // Le Worker d'analyse et l'auto-jeu appliquent la MÊME règle : l'historique d'une partie d'auto-jeu, passé à l'analyse,
  // donne un drawRule identique au motif de fin de la partie.
  const st = new GameState({ board: start.board, side: 'w' });
  let same = true;
  for (let i = 0; i < 12; i++) {
    const t = st.terminal(300);
    const r = analyseSync({ board: st.fb.toUiBoard(), side: st.fb.sideToMove }, { maxDepth: 1, maxTimeMs: 1e9, history: st.history() });
    if ((t && t.reason !== 'noMoves' ? t.reason : null) !== (r.drawRule ?? null)) same = false;
    if (t) break;
    const moves = st.fb.generateMoves();
    const safe = moves.filter((m) => { st.fb.makeMove(m); const rr = st.fb.generateMoves(); const gv = rr.length && rr[0].caps.length; st.fb.unmakeMove(); return !gv; });
    st.apply((safe.length ? safe : moves)[0]);
  }
  ok('G5 le motif de nulle de GameState.terminal() = drawRule de l\'analyse, position par position', same);
}

console.log(failures === 0 ? '\nRÉSULTAT : tout concorde.' : `\nRÉSULTAT : ${failures} échec(s).`);
process.exit(failures === 0 ? 0 : 1);
