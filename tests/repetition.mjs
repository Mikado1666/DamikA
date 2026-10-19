// Nulles par règle dans le moteur d'analyse : répétition de position et règle des 25 coups.
// Règles : FMJD, Annexe 1, art. 6.1 (3e occurrence, même camp au trait) et 6.2 (25 coups de chaque camp
// = 50 demi-coups de dames seules, sans coup de pion ni prise). Sources : docs/SESSION_DERNIERE.md.
// Les limites de finale (art. 6.3 : 16 coups, 6.4 : 5 coups) ne sont PAS implémentées.
//
// Usage : node tests/repetition.mjs
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { FastBoard, WK, BK, DRAW_QUIET_PLIES } from '../js/ai/fastboard.js';
import { analyseSync, normalizeHistory, positionHash } from '../js/ai/search.js';
import { analysisHistory } from '../js/ai/analysis-format.js';
import { runMessage } from '../js/ai/worker.js';
import { createAnalysisController } from '../js/ai/analysis-controller.js';
import { mulberry32, parsePos, randomFastPosition, toPosition } from './helpers.mjs';

let failures = 0;
const ok = (label, cond, extra = '') => { if (!cond) failures++; console.log(`${cond ? 'OK ' : 'ERR'} ${label}${extra ? ' — ' + extra : ''}`); };
const run = (pos, history, depth = 8) => analyseSync(pos, { maxDepth: depth, maxTimeMs: 1e9, history });

// --- 1. Compteur de demi-coups sans coup de pion ni prise (FastBoard.quiet) ----------------------------------------
{
  const rnd = mulberry32(31);
  let walks = 0, resetsOk = true, restoreOk = true, incOk = true;
  for (let i = 0; i < 300; i++) {
    const fb = FastBoard.fromUiBoard(randomFastPosition(rnd, i).toUiBoard(), 'w');
    const trail = [];
    for (let p = 0; p < 60; p++) {
      const moves = fb.generateMoves();
      if (!moves.length) break;
      const m = moves[Math.floor(rnd() * moves.length)];
      const before = fb.quiet, piece = fb.board[m.from];
      fb.makeMove(m);
      const irreversible = piece <= 2 || m.caps.length > 0;
      if (irreversible && fb.quiet !== 0) resetsOk = false;
      if (!irreversible && fb.quiet !== before + 1) incOk = false;
      trail.push(before);
    }
    const end = fb.quiet;
    for (let p = trail.length - 1; p >= 0; p--) { fb.unmakeMove(); if (fb.quiet !== trail[p]) restoreOk = false; }
    walks++;
    if (fb.quiet !== 0 || end < 0) restoreOk = false;
  }
  ok(`compteur : remis à 0 par un coup de pion / une prise / une promotion (${walks} parties aléatoires)`, resetsOk);
  ok('compteur : +1 par coup de dame sans prise', incOk);
  ok('compteur : unmakeMove restitue exactement la valeur d\'avant', restoreOk);
  const fb = FastBoard.fromUiBoard(parsePos('w|K1,K2|K46').board, 'w', 7);
  ok('compteur : fromUiBoard(…, quiet) pose la valeur de départ', fb.quiet === 7);
  ok(`seuil officiel = 50 demi-coups (25 coups de chaque camp)`, DRAW_QUIET_PLIES === 50);
}

// --- (a) Cycle : 1 dame contre 1 dame -----------------------------------------------------------------------------------
// Dame blanche en 1, dame noire en 45, trait aux Blancs. Avant l'étape 2 le moteur annonçait −10 (léger avantage
// noir) en profondeur 8 ; les deux camps peuvent tourner en rond (répétition sur le chemin) : nulle, 0.
{
  const pos = parsePos('w|K1|K45');
  const r = run(pos);
  ok('(a) 1D contre 1D en cycle : score 0, pas de mat', r.score === 0 && r.mate === null, `score ${r.score}`);
  const r2 = run(parsePos('w|K50|K6'));
  ok('(a) position symétrique (rotation de 180°) : score 0 aussi', r2.score === 0, `score ${r2.score}`);
}

// --- (b) Règle des 25 coups ------------------------------------------------------------------------------------------------
{
  const pos = parsePos('w|K1,K2|K46'); // 2 dames contre 1 : avantage affiché tant que le compteur est à 0
  const r0 = run(pos, { quiet: 0, positions: [] });
  ok('(b) compteur 0 : l\'avantage des 2 dames est affiché', r0.score > 0, `score ${r0.score}`);
  const r47 = run(pos, { quiet: 47, positions: [] });
  const r48 = run(pos, { quiet: 48, positions: [] });
  const r49 = run(pos, { quiet: 49, positions: [] });
  ok('(b) compteur 48 : le seuil (50) tombe dans l\'horizon, la position vaut nulle (0)', r48.score === 0 && r48.mate === null, `score ${r48.score}`);
  ok('(b) compteur 49 : nulle (0)', r49.score === 0, `score ${r49.score}`);
  ok('(b) compteur 47 : nulle aussi (seuil atteint dans l\'horizon)', r47.score === 0, `score ${r47.score}`);
  const r50 = run(pos, { quiet: 50, positions: [] });
  ok('(b) compteur 50 à la racine : drawRule = quiet (partie nulle) ; la recherche rend quand même un coup', r50.drawRule === 'quiet' && r50.bestMove !== null);
  ok('(b) compteur 0 : drawRule = null', r0.drawRule === null);
  // Une prise remet le compteur à 0 : un mat par prise reste un mat même à compteur 48.
  const rm = run(parsePos('w|K6,K11,K16|K50'), { quiet: 48, positions: [] });
  ok('(b) prise immédiate possible : le mat n\'est pas masqué par le compteur', rm.mate && rm.mate.winner === 'w', JSON.stringify(rm.mate));
}

// --- (c) Répétition : le camp qui gagne évite la répétition --------------------------------------------------------
{
  const pos = parsePos('w|K1,K2|K46');
  const base = run(pos);
  const X = base.bestMoveNotation;
  const fb = FastBoard.fromUiBoard(pos.board, pos.side);
  const mv = fb.generateMoves().find((m) => `${m.from + 1}-${m.to + 1}` === X);
  ok('(c) coup de référence trouvé', !!mv, X);
  fb.makeMove(mv);
  const C = toPosition(fb); // position après X, Noirs au trait
  const R = pos;
  const once = run(pos, { quiet: 3, positions: [C, R, R] });  // C une seule fois dans l'historique : 2e occurrence, pas nulle
  ok('(c) position vue 1 fois avant : sa 2e occurrence n\'est PAS nulle (art. 6.1 : 3e fois)', once.bestMoveNotation === X && once.score === base.score, `${once.bestMoveNotation} ${once.score}`);
  const twice = run(pos, { quiet: 3, positions: [C, R, C] }); // C deux fois : X ferait la 3e occurrence
  ok('(c) 3e occurrence : le coup qui la ferait vaut 0, le moteur en choisit un autre', twice.bestMoveNotation !== X, `${twice.bestMoveNotation} (avant : ${X})`);
  ok('(c) … et conserve un avantage (> 0) sans dépasser le score d\'avant', twice.score > 0 && twice.score <= base.score, `score ${twice.score} / ${base.score}`);
  // Mauvais camp au trait (même plateau, trait inverse) : position différente, aucun effet.
  const Cw = { board: C.board, side: 'w' };
  const wrong = run(pos, { quiet: 3, positions: [Cw, R, Cw] });
  ok('(c) même plateau mais autre camp au trait : pas une répétition', wrong.bestMoveNotation === X && wrong.score === base.score);
  // Les hashes (pré-calculés) donnent le même résultat que les positions.
  const hh = [C, R, C].map((p) => positionHash(p.board, p.side));
  const viaHash = run(pos, { quiet: 3, hashes: hh.map((h) => [h.lo, h.hi]) });
  const viaObj = run(pos, { quiet: 3, hashes: hh });
  ok('(c) historique en hashes ([lo, hi] ou { lo, hi }) = historique en positions', viaHash.bestMoveNotation === twice.bestMoveNotation && viaHash.score === twice.score && viaObj.score === twice.score);
  // Hors fenêtre : un historique plus long que le compteur est tronqué (avant un coup irréversible, rien ne se répète).
  const trunc = run(pos, { quiet: 1, positions: [C, R, C] });
  ok('(c) positions antérieures au compteur ignorées', trunc.bestMoveNotation === X && trunc.score === base.score);
}

// --- (d) Aucune régression hors répétition / compteur élevé -----------------------------------------------------
{
  const ref = JSON.parse(fs.readFileSync(fileURLToPath(new URL('./data/golden-scores.json', import.meta.url)), 'utf8'));
  let same = 0, bad = [];
  for (const g of ref.positions) {
    const r = analyseSync(g.pos, { maxDepth: ref.depth, maxTimeMs: 1e9 });
    if (r.score === g.score && JSON.stringify(r.mate) === JSON.stringify(g.mate) && r.bestMoveNotation === g.best) same++;
    else bad.push(g.i);
  }
  ok(`(d) ${ref.positions.length} positions (dont ${ref.positions.filter((g) => g.hasKing).length} avec dames) : scores, mats et meilleur coup IDENTIQUES à ceux d'avant l'étape 2`, same === ref.positions.length, bad.length ? `écarts : ${bad.join(',')}` : '');
  const g0 = ref.positions[0];
  const a = analyseSync(g0.pos, { maxDepth: 6, maxTimeMs: 1e9 });
  const b = analyseSync(g0.pos, { maxDepth: 6, maxTimeMs: 1e9, history: { quiet: 0, positions: [] } });
  const c = analyseSync(g0.pos, { maxDepth: 6, maxTimeMs: 1e9, history: null });
  ok('(d) historique absent / vide / nul : même résultat', a.score === b.score && a.score === c.score && a.bestMoveNotation === b.bestMoveNotation);
  ok('(d) normalizeHistory(null) = null (rétrocompatible)', normalizeHistory(null) === null);
}

// --- Table de transposition : même score avec et sans table, historique compris ------------------------------
{
  const rnd = mulberry32(4242);
  let n = 0, mism = 0;
  for (let i = 0; n < 30; i++) {
    const fb0 = randomFastPosition(rnd, i);
    if (![...fb0.board].some((p) => p > 2)) continue;
    const fb = FastBoard.fromUiBoard(fb0.toUiBoard(), fb0.sideToMove);
    const hist = [];
    for (let j = 0, k = Math.floor(rnd() * 14); j < k; j++) {
      const ms = fb.generateMoves().filter((m) => m.caps.length === 0 && fb.board[m.from] > 2);
      if (!ms.length) break;
      hist.push(toPosition(fb));
      fb.makeMove(ms[Math.floor(rnd() * ms.length)]);
    }
    const hh = { positions: hist, quiet: hist.length };
    const a = analyseSync(toPosition(fb), { maxDepth: 7, maxTimeMs: 1e9, useTT: false, history: hh });
    const b = analyseSync(toPosition(fb), { maxDepth: 7, maxTimeMs: 1e9, useTT: true, history: hh });
    n++;
    if (a.score !== b.score) mism++;
  }
  ok(`TT : ${n} finales à dames avec historique, score avec table = score sans table`, mism === 0, `${mism} écart(s)`);
}

// --- (e) Historique transmis par le Worker et par le contrôleur ------------------------------------------------------
async function viaWorker(msg) {
  const out = [];
  await runMessage({ id: 1, ...msg }, (d) => out.push(d));
  return out[out.length - 1];
}
{
  const pos = parsePos('w|K1,K2|K46');
  const base = run(pos);
  const fb = FastBoard.fromUiBoard(pos.board, pos.side);
  fb.makeMove(fb.generateMoves().find((m) => `${m.from + 1}-${m.to + 1}` === base.bestMoveNotation));
  const C = toPosition(fb);
  const history = { quiet: 3, positions: [C, pos, C] };
  const w0 = await viaWorker({ type: 'analyse', position: pos, options: { maxDepth: 8, maxTimeMs: 1e9 } });
  const w1 = await viaWorker({ type: 'analyse', position: pos, history, options: { maxDepth: 8, maxTimeMs: 1e9 } });
  const direct = run(pos, history);
  ok('(e) Worker sans historique : résultat d\'avant', w0.ok && w0.result.bestMoveNotation === base.bestMoveNotation && w0.result.score === base.score && w0.result.drawRule === null);
  ok('(e) Worker avec historique : même résultat que la recherche directe, et différent de « sans »', w1.ok && w1.result.bestMoveNotation === direct.bestMoveNotation && w1.result.score === direct.score && w1.result.bestMoveNotation !== w0.result.bestMoveNotation, `${w1.result.bestMoveNotation} ≠ ${w0.result.bestMoveNotation}`);
  const w2 = await viaWorker({ type: 'analyse', position: pos, history: { quiet: 50, positions: [] }, options: { maxDepth: 4, maxTimeMs: 1e9 } });
  ok('(e) Worker : drawRule = quiet pour un compteur à 50', w2.ok && w2.result.drawRule === 'quiet');
}
{
  // Contrôleur : l'historique part avec la requête, et un historique différent relance l'analyse.
  const sent = [];
  const timers = [];
  const fakeWorker = () => ({ postMessage: (m) => sent.push(m), terminate() {}, onmessage: null, onerror: null });
  const ctl = createAnalysisController({
    createWorker: fakeWorker, onChange() {}, setTimer: (f) => { timers.push(f); return timers.length; }, clearTimer() {},
  });
  const pos = parsePos('w|K1,K2|K46');
  const prev = parsePos('b|K1,K3|K46');
  ctl.enable();
  ctl.request(pos);
  timers.shift()();
  ok('(e) contrôleur : sans historique, le message n\'a pas de clé history', sent.length === 1 && !('history' in sent[0]));
  ctl.request(pos, { positions: [prev], quiet: 1 });
  timers.shift()();
  ok('(e) contrôleur : même position mais historique différent → nouvelle requête avec history', sent.length === 2 && sent[1].history && sent[1].history.quiet === 1 && sent[1].history.positions.length === 1 && sent[1].history.positions[0].side === 'b');
  ctl.request(pos, { positions: [prev], quiet: 1 });
  ok('(e) contrôleur : même position et même historique → rien de relancé', timers.length === 0);
  ctl.request(pos, { positions: [], quiet: 0 });
  timers.shift()();
  ok('(e) contrôleur : quiet = 0 → pas de history dans le message', sent.length === 3 && !('history' in sent[2]));
}
{
  // analysisHistory : depuis DraughtsGame.history.
  const B = (n) => `board${n}`;
  const king = { type: 'simple', piece: { king: true }, promoted: false };
  const man = { type: 'simple', piece: { king: false }, promoted: false };
  const cap = { type: 'capture', piece: { king: true }, promoted: false };
  const promo = { type: 'simple', piece: { king: false }, promoted: true };
  const e = (n, move, side = 'w') => ({ board: B(n), sideToMove: side, move });
  const h1 = analysisHistory([e(0, man), e(1, king, 'b'), e(2, king), e(3, king, 'b')]);
  ok('analysisHistory : 3 coups de dame de suite après un coup de pion → quiet 3, positions des 3 derniers', h1.quiet === 3 && h1.positions.map((p) => p.board).join() === 'board1,board2,board3');
  ok('analysisHistory : un coup de pion en dernier → quiet 0', analysisHistory([e(0, king), e(1, man)]).quiet === 0);
  ok('analysisHistory : une prise ou une promotion remet à 0', analysisHistory([e(0, king), e(1, cap)]).quiet === 0 && analysisHistory([e(0, king), e(1, promo)]).quiet === 0);
  ok('analysisHistory : partie vide → quiet 0', analysisHistory([]).quiet === 0 && analysisHistory([]).positions.length === 0);
  const many = Array.from({ length: 80 }, (_, k) => e(k, king, k % 2 ? 'b' : 'w'));
  ok('analysisHistory : plafonné à 50', analysisHistory(many).quiet === 50 && analysisHistory(many).positions.length === 50);
}

console.log(failures === 0 ? '\nRÉSULTAT : tout concorde.' : `\nRÉSULTAT : ${failures} échec(s).`);
process.exit(failures === 0 ? 0 : 1);
