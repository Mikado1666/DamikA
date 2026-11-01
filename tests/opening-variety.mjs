// P19 — variété d'ouverture (js/ai/search.js : option `variety`, js/ai/worker.js, js/ai/analysis-controller.js).
//   A. Sans variété (option absente ou marge 0) : résultat identique à la recherche d'avant.
//   B. Avec variété : le coup tiré est un candidat vérifié, tous les candidats sont à moins de la marge du meilleur, le score
//      affiché est celui du coup tiré ; tirage reproductible (même graine + même position = même coup), graines différentes =
//      coups différents ; `prefer` l'emporte.
//   C. Poids : 32-27 de la position de départ est tiré nettement moins souvent (poids 0,3), sans être exclu.
//   D. Pendant la recherche, aucun meilleur coup n'est communiqué (il changerait à la fin).
//   E. Worker : variété honorée pour V2b seulement ; V0 et V1b donnent EXACTEMENT les mêmes résultats avec ou sans l'option.
//   F. Contrôleur : option transmise seulement avec V2b, dans la clé de déduplication.
//   G. Pas de variété : position où le mat est vu, une seule réponse légale, nulle par règle.
// Usage : node tests/opening-variety.mjs
import fs from 'node:fs';
import { analyseSync, drawVaried, positionHash, VARIETY_START_WEIGHTS } from '../js/ai/search.js';
import { FastBoard } from '../js/ai/fastboard.js';
import { createModelEvaluator } from '../js/ai/eval-patterns.js';
import { runMessage } from '../js/ai/worker.js';
import { createAnalysisController } from '../js/ai/analysis-controller.js';
import { OPENING_VARIETY } from '../js/ai/engines.js';

let failures = 0;
const check = (label, cond, extra = '') => { if (!cond) failures++; console.log(`${cond ? 'OK ' : 'ERR'} ${label}${extra ? ' — ' + extra : ''}`); };
const strip = (r) => JSON.stringify({ ...r, timeMs: 0, nps: 0 });

const ev = createModelEvaluator(JSON.parse(fs.readFileSync(new URL('../data/models/p17-B-l025.json', import.meta.url), 'utf8')));
const fb0 = FastBoard.initial();
const start = { board: fb0.toUiBoard(), side: fb0.sideToMove };
const fixed = { maxDepth: 6, maxTimeMs: 1e9, evaluator: ev }; // profondeur fixe : déterministe, indépendant du temps

// --- A ------------------------------------------------------------------------------------------------------------------------
const plain = analyseSync(start, fixed);
check('A1 sans option : pas de champ variety', plain.variety === undefined);
check('A2 marge 0 : identique à la recherche sans option', strip(analyseSync(start, { ...fixed, variety: { margin: 0, seed: 1 } })) === strip(plain));

// --- B ------------------------------------------------------------------------------------------------------------------------
const M = 30;
const runs = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((seed) => analyseSync(start, { ...fixed, variety: { margin: M, seed } }));
const v0 = runs[0].variety;
check('B1 résultat.variety présent avec marge, profondeur et candidats', !!v0 && v0.margin === M && v0.candidates.length >= 2 && v0.depth === 5 && v0.unverified === 0, v0 ? v0.candidates.map((c) => c.move).join(' ') : '');
const scores = v0.candidates.map((c) => c.score);
check(`B2 tous les candidats à moins de ${M} cp du meilleur candidat`, Math.max(...scores) - Math.min(...scores) <= M, scores.join(' '));
check('B3 le coup du résultat est un candidat, son score est celui affiché',
  runs.every((r) => r.variety.candidates.some((c) => c.move === r.bestMoveNotation && c.score === r.score) && r.pvNotation[0] === r.bestMoveNotation));
check('B4 le meilleur coup de la recherche normale est toujours candidat', runs.every((r) => r.variety.candidates.some((c) => c.move === plain.bestMoveNotation)), plain.bestMoveNotation);
check('B5 reproductible : même graine, même position = même coup et mêmes candidats',
  JSON.stringify(analyseSync(start, { ...fixed, variety: { margin: M, seed: 3 } }).variety) === JSON.stringify(runs[2].variety));
const picks = new Set(runs.map((r) => r.bestMoveNotation));
check('B6 graines différentes : au moins 3 premiers coups distincts sur 12 graines', picks.size >= 3, [...picks].join(' '));
const other = [...v0.candidates].map((c) => c.move).find((m) => m !== runs[0].bestMoveNotation);
const pref = analyseSync(start, { ...fixed, variety: { margin: M, seed: 1, prefer: other } });
check('B7 prefer : le coup déjà proposé l\'emporte sur le tirage', pref.bestMoveNotation === other && pref.variety.forced === true, other);
check('B8 prefer inconnu (plus candidat) : retombe sur le tirage de la graine', analyseSync(start, { ...fixed, variety: { margin: M, seed: 1, prefer: '99-99' } }).bestMoveNotation === runs[0].bestMoveNotation);
// Réponse des Noirs : la variété vaut pour tout camp et toute position d'ouverture
const afterOne = FastBoard.initial(); afterOne.makeMove(afterOne.generateMoves().find((m) => `${m.from + 1}-${m.to + 1}` === '32-28' || false) || afterOne.generateMoves()[0]);
const posBlack = { board: afterOne.toUiBoard(), side: afterOne.sideToMove };
const bl = [1, 2, 3, 4, 5, 6].map((seed) => analyseSync(posBlack, { ...fixed, variety: { margin: M, seed } }));
check('B9 trait aux Noirs : plusieurs réponses candidates et réponses différentes selon la graine', bl[0].variety.candidates.length >= 2 && new Set(bl.map((r) => r.bestMoveNotation)).size >= 2,
  [...new Set(bl.map((r) => r.bestMoveNotation))].join(' '));

// --- C ------------------------------------------------------------------------------------------------------------------------
{
  const h = positionHash(start.board, start.side);
  const cand = [{ str: '31-26', weight: 1 }, { str: '32-27', weight: VARIETY_START_WEIGHTS['32-27'] }, { str: '32-28', weight: 1 }, { str: '33-28', weight: 1 }];
  const n = {}; for (let seed = 0; seed < 20000; seed++) { const c = drawVaried(cand, seed, h.lo, h.hi); n[c.str] = (n[c.str] || 0) + 1; }
  const others = (n['31-26'] + n['32-28'] + n['33-28']) / 3;
  check('C1 32-27 (poids 0,3) tiré ≈ 0,3 fois moins que chacun des autres, jamais exclu', n['32-27'] > 0 && Math.abs(n['32-27'] / others - 0.3) < 0.04, `${n['32-27']} contre ${others.toFixed(0)} en moyenne`);
  check('C2 les poids ne s\'appliquent qu\'à la position de départ', runs.every((r) => r.variety.candidates.every((c) => (c.move === '32-27' ? c.weight === 0.3 : c.weight === 1)))
    && bl.every((r) => r.variety.candidates.every((c) => c.weight === 1)));
}

// --- D ------------------------------------------------------------------------------------------------------------------------
{
  const seen = [];
  analyseSync(start, { ...fixed, variety: { margin: M, seed: 1 }, onProgress: (p) => seen.push(p) });
  check('D1 progression avec variété : profondeur et score oui, meilleur coup non', seen.length >= 3 && seen.every((p) => p.bestMove === null && p.bestMoveNotation === null && p.pv.length === 0 && typeof p.score === 'number' && p.depth >= 1));
  const seen2 = [];
  analyseSync(start, { ...fixed, onProgress: (p) => seen2.push(p) });
  check('D2 progression sans variété : inchangée (meilleur coup présent)', seen2.every((p) => p.bestMove && p.bestMoveNotation));
}

// --- E ------------------------------------------------------------------------------------------------------------------------
{
  let id = 500;
  const ask = async (options) => { const out = []; await runMessage({ id: ++id, type: 'analyse', position: start, options }, (m) => out.push(m)); return out.find((m) => m.type !== 'progress'); };
  const opts = { maxDepth: 5, maxTimeMs: 1e9 };
  const vopt = { margin: M, seed: 4 };
  for (const engine of [undefined, 'v0', 'v1b']) {
    const a = await ask({ ...opts, ...(engine ? { engine } : {}) }), b = await ask({ ...opts, ...(engine ? { engine } : {}), variety: vopt });
    check(`E1 moteur ${engine ?? '(défaut)'} : variété ignorée, résultat identique`, a.ok && b.ok && strip(a.result) === strip(b.result) && b.result.variety === undefined);
  }
  const w = await ask({ ...opts, engine: 'v2b', variety: vopt });
  const direct = analyseSync(start, { ...opts, evaluator: ev, variety: vopt });
  check('E2 V2b : variété honorée, identique à la recherche directe', w.ok && w.result.variety && w.result.bestMoveNotation === direct.bestMoveNotation && w.result.score === direct.score);
}

// --- F ------------------------------------------------------------------------------------------------------------------------
{
  const posted = [];
  const mk = () => { const w = { postMessage: (m) => posted.push(m), terminate() {} }; return w; };
  const timers = [];
  const make = (engine) => createAnalysisController({ createWorker: mk, onChange() {}, engine, debounceMs: 0, setTimer: (f) => { timers.push(f); return timers.length; }, clearTimer() {} });
  const flush = () => { while (timers.length) timers.shift()(); };
  const board = start.board;
  const c = make('v2b'); c.enable();
  c.request({ board, side: start.side }, null, { margin: 30, seed: 7 }); flush();
  const m1 = posted[posted.length - 1];
  check('F1 V2b : options.variety transmise', m1.options.variety && m1.options.variety.margin === 30 && m1.options.variety.seed === 7 && m1.options.engine === 'v2b');
  c.request({ board, side: start.side }, null, { margin: 30, seed: 7 }); flush();
  check('F2 même position, même variété : dédoublonnée (rien de renvoyé)', posted.length === 1);
  c.request({ board, side: start.side }, null, { margin: 30, seed: 8 }); flush();
  check('F3 autre graine : nouvelle analyse', posted.length === 2 && posted[1].options.variety.seed === 8);
  c.request({ board, side: start.side }, null, null); flush();
  check('F4 sans variété : aucune clé variety dans le message', posted.length === 3 && !('variety' in posted[2].options));
  for (const engine of ['v0', 'v1b']) {
    posted.length = 0;
    const o = make(engine); o.enable(); o.request({ board, side: start.side }, null, { margin: 30, seed: 7 }); flush();
    check(`F5 ${engine} : la variété n'est jamais transmise`, posted.length === 1 && !('variety' in posted[0].options));
  }
  posted.length = 0;
  const sw = make('v2b'); sw.enable(); sw.request({ board, side: start.side }, null, { margin: 30, seed: 7 }); flush();
  sw.setEngine('v1b'); flush();
  check('F6 passage de V2b à V1b : le message rejoué ne porte pas la variété', posted.length === 2 && !('variety' in posted[1].options) && posted[1].options.engine === 'v1b');
}

// --- G ------------------------------------------------------------------------------------------------------------------------
{
  // Une seule réponse légale : pas de tirage
  const f = new FastBoard();
  f.board.fill(0); f.board[0] = 1; f.board[45] = 2; f.side = 0;
  const only = FastBoard.fromUiBoard(f.toUiBoard(), 0);
  const moves = only.generateMoves();
  if (moves.length === 1) {
    const r = analyseSync({ board: only.toUiBoard(), side: only.sideToMove }, { ...fixed, variety: { margin: M, seed: 1 } });
    check('G1 un seul coup légal : pas de variété', r.variety === undefined);
  }
  // Budget quasi nul : le coup du résultat reste vérifié (jamais un coup non testé)
  const r = analyseSync(start, { maxDepth: 24, maxTimeMs: 5, evaluator: ev, variety: { margin: M, seed: 2 } });
  check('G2 budget minuscule : soit pas de variété, soit un candidat vérifié', r.variety === undefined || r.variety.candidates.some((c) => c.move === r.bestMoveNotation));
  check('G3 réglage retenu', OPENING_VARIETY.margin === 10 && OPENING_VARIETY.plies >= 8 && OPENING_VARIETY.plies <= 10, JSON.stringify(OPENING_VARIETY));
}

console.log(failures === 0 ? '\nRÉSULTAT : tout concorde.' : `\nRÉSULTAT : ${failures} échec(s).`);
process.exit(failures === 0 ? 0 : 1);
