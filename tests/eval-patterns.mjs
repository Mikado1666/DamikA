// P14 — évaluation par MOTIFS (js/ai/eval-patterns.js) : comparaison avec une implémentation NAÏVE (plateau miroir construit
// explicitement par mirrorBoard de eval.js, indice de chaque motif recalculé case par case), antisymétrie miroir exacte,
// repli sur les tables ordinaires sans `patterns`, garde-fou de borne, validations de format, vitesse (information).
// Usage : node tests/eval-patterns.mjs
import fs from 'node:fs';
import { mirrorBoard } from '../js/ai/eval.js';
import { createTableEvaluator, tablesToPlain } from '../js/ai/eval-learned.js';
import { PATTERN_SETS, createModelEvaluator, createReferenceModelEvaluator, createFastModelEvaluator, normalizePatterns, buildPatternSet, PATTERN_PHASE_MIN } from '../js/ai/eval-patterns.js';
import { FastBoard } from '../js/ai/fastboard.js';
import { mulberry32, randomFastPosition } from './helpers.mjs';

let failures = 0;
const ok = (label, cond, extra = '') => { if (!cond) failures++; console.log(`${cond ? 'OK ' : 'ERR'} ${label}${extra ? ' — ' + extra : ''}`); };
const throws = (fn) => { try { fn(); return null; } catch (e) { return e.message; } };

const base = JSON.parse(fs.readFileSync(new URL('../training/models/n123-l0.json', import.meta.url), 'utf8'));
const cells = PATTERN_SETS.A;
const rnd = mulberry32(14);
const randTables = (amp) => PATTERN_PHASE_MIN.map(() => cells.map((cs) => Array.from({ length: 4 ** cs.length }, () => Math.floor(rnd() * (2 * amp + 1)) - amp)));
const model = (tables) => ({ ...tablesToPlain(base), patterns: { cells, minPieces: PATTERN_PHASE_MIN, tables } });

// --- Référence naïve ---------------------------------------------------------------------------------------------------------
const stateOf = (code) => (code === 0 ? 0 : code === 1 ? 1 : code === 2 ? 2 : 3);
function naiveIndex(board, cs) { let idx = 0; cs.forEach((sq, j) => { idx += stateOf(board[sq - 1]) * 4 ** j; }); return idx; }
function naiveEval(board, tables, baseEval, cells = PATTERN_SETS.A) {
  let n = 0; for (let i = 0; i < 50; i++) if (board[i]) n++;
  const ph = n >= 30 ? 0 : n >= 15 ? 1 : 2;
  const m = mirrorBoard(board);
  let s = baseEval(board);
  cells.forEach((cs, p) => { s += tables[ph][p][naiveIndex(board, cs)] - tables[ph][p][naiveIndex(m, cs)]; });
  return s;
}

const FastBoardInitial = () => FastBoard.initial().board;
const baseEval = createTableEvaluator(tablesToPlain(base));
const tables = randTables(40);
const E = createModelEvaluator(model(tables));

{ // 1. Équivalence avec la référence naïve
  let bad = 0, n = 0, kings = 0;
  const r = mulberry32(99);
  for (let i = 0; i < 6000; i++) {
    const fb = randomFastPosition(r, i);
    n++; if ([...fb.board].some((c) => c > 2)) kings++;
    if (E(fb.board) !== naiveEval(fb.board, tables, baseEval)) bad++;
  }
  ok(`évaluateur = référence naïve (plateau miroir explicite) : ${n} positions (dont ${kings} avec dames), AUCUN écart`, bad === 0, `${bad} écart(s)`);
}
{ // 2. Antisymétrie miroir exacte
  let bad = 0;
  const r = mulberry32(5);
  for (let i = 0; i < 4000; i++) { const b = randomFastPosition(r, i).board; if (E(b) !== -E(mirrorBoard(b))) bad++; }
  ok('éval(miroir) = −éval sur 4 000 positions', bad === 0, `${bad} écart(s)`);
}
{ // 3. Tables toutes nulles = tables de base ; sans patterns = createTableEvaluator
  const Z = createModelEvaluator(model(PATTERN_PHASE_MIN.map(() => cells.map((cs) => new Array(4 ** cs.length).fill(0)))));
  const N = createModelEvaluator(tablesToPlain(base));
  let bad = 0; const r = mulberry32(8);
  for (let i = 0; i < 2000; i++) { const b = randomFastPosition(r, i).board; if (Z(b) !== baseEval(b) || N(b) !== baseEval(b)) bad++; }
  ok('motifs nuls ou absents : identique aux tables de base (2 000 positions)', bad === 0, `${bad} écart(s)`);
}
{ // 4. Cas faits main : position initiale (symétrique : motifs miroirs s'annulent si les tables le sont), pion seul
  const b = new Int8Array(50); b[27] = 1; // pion blanc en 28 : touche les losanges 27-28...
  const hand = PATTERN_PHASE_MIN.map(() => cells.map((cs) => new Array(4 ** cs.length).fill(0)));
  const p = cells.findIndex((cs) => cs[0] === 28); // losange centré en 28 : case 28 = indice j = 0, pion blanc = état 1 → indice 1
  hand[2][p][1] = 7;
  const H = createModelEvaluator(model(hand));
  ok('motif centré en 28 : pion blanc seul en 28 → +7 par rapport aux tables (phase < 15 pièces)', H(b) - baseEval(b) === 7, String(H(b) - baseEval(b)));
  const bm = mirrorBoard(b); // pion NOIR en 23 : vue miroir = pion blanc en 28 → −7
  ok('même motif : pion noir seul en 23 → −7', H(bm) - baseEval(bm) === -7, String(H(bm) - baseEval(bm)));
}
{ // 5. Garde-fou et validations
  const huge = randTables(0).map((ph) => ph.map((t) => { t[1] = 100000; return t; }));
  const e1 = throws(() => createModelEvaluator(model(huge)));
  const mid = randTables(0).map((ph) => ph.map((t) => { t[1] = 4000; return t; })); // 12 motifs × 4 000 : au-dessus de 29 000 une fois sommés
  const e2 = throws(() => createModelEvaluator(model(mid)));
  ok('garde-fou de borne : somme des écarts max − min > 29 000 refusée', e2 && /mat/.test(e2), e2 || 'accepté');
  ok('garde-fou : un motif de +100 000 est refusé', e1 && /mat|32 000/.test(e1), e1 || 'accepté');
  ok('case invalide refusée', /invalide/.test(throws(() => buildPatternSet([[0, 1, 2]])) || ''));
  ok('motifs en double refusés', /double/.test(throws(() => buildPatternSet([[1, 1]])) || ''));
  ok('taille de table fausse refusée', /attendues/.test(throws(() => createModelEvaluator(model(tables.map((ph) => ph.map((t) => t.slice(1)))))) || ''));
  const info = normalizePatterns(model(tables).patterns, [{ minPieces: 0, man: new Int32Array(50), king: new Int32Array(50), feat: new Int32Array(30) }]);
  ok(`jeu A : ${cells.length} motifs, ${info.set.total * 3} poids au total`, info.set.total * 3 === cells.length * 1024 * 3, String(info.set.total * 3));
}
{ // 5. P16 : l'évaluateur RAPIDE (code généré) = l'évaluateur de RÉFÉRENCE (P14, lent), score pour score
  const CODE = { '.': 0, w: 1, b: 2, W: 3, B: 4 };
  const real = [];
  for (const dir of ['selfplay-nuit-1', 'selfplay-nuit-2']) {
    const f = new URL(`../training/data/${dir}/games.jsonl`, import.meta.url);
    if (!fs.existsSync(f)) continue;
    for (const line of fs.readFileSync(f, 'utf8').split(String.fromCharCode(10)).slice(0, 300)) {
      if (!line) continue;
      const g = JSON.parse(line);
      for (let k = 0; k < g.p.length; k += 3) { const b = new Int8Array(50); for (let i = 0; i < 50; i++) b[i] = CODE[g.p[k][0][i]]; real.push(b); }
    }
  }
  const trained = new URL('../training/models/p14-A-l05.json', import.meta.url);
  const models = [['tables aléatoires ±40', model(tables)], ['tables aléatoires ±300', model(randTables(300))]];
  if (fs.existsSync(trained)) models.push(['p14-A-l05 (entraîné)', JSON.parse(fs.readFileSync(trained, 'utf8'))]);
  const oneMan = Array.from({ length: 50 }, (_, i) => 100 + i), oneKing = Array.from({ length: 50 }, (_, i) => 300 - i);
  for (const name of ['B', 'C']) { // P17 : jeux plus grands (B : 23 motifs de 5 cases ; C : 14 briques de 6 cases)
    const S = PATTERN_SETS[name], t = PATTERN_PHASE_MIN.map(() => S.map((cs) => Array.from({ length: 4 ** cs.length }, () => Math.floor(rnd() * 401) - 200)));
    models.push([`jeu ${name} (${S.length} motifs de ${S[0].length} cases, tables aléatoires ±200)`, { ...tablesToPlain(base), patterns: { cells: S, minPieces: PATTERN_PHASE_MIN, tables: t } }]);
  }
  models.push(['base à UNE phase ({man, king})', { man: oneMan, king: oneKing, patterns: { cells, minPieces: PATTERN_PHASE_MIN, tables: randTables(25) } }]);
  for (const [name, m] of models) {
    const fast = createFastModelEvaluator(m), ref = createReferenceModelEvaluator(m);
    ok(`${name} : évaluateur rapide disponible`, typeof fast === 'function');
    let bad = 0, n = 0, kings = 0, noKings = 0; const phases = [0, 0, 0];
    const check = (b) => {
      n++; const hasK = b.some((c) => c > 2); if (hasK) kings++; else noKings++;
      let c = 0; for (let i = 0; i < 50; i++) if (b[i]) c++; phases[c >= 30 ? 0 : c >= 15 ? 1 : 2]++;
      if (fast(b) !== ref(b) || fast(b) !== -fast(mirrorBoard(b)) || (!m.man && fast(b) !== naiveEval(b, m.patterns.tables, baseEval, m.patterns.cells))) bad++; // + référence naïve (base n123)
    };
    const r = mulberry32(2026);
    for (let i = 0; i < 20000; i++) check(randomFastPosition(r, i).board);
    for (const b of real) check(b);
    ok(`${name} : rapide = référence ET antisymétrie exacte, ${n} positions (${kings} avec dames, ${noKings} sans ; phases ≥30 / 15-29 / <15 : ${phases.join(' / ')})`, bad === 0 && kings > 1000 && noKings > 1000 && phases.every((x) => x > 500), `${bad} écart(s)`);
  }
  // repli : une base AVEC caractéristiques de structure n'a pas d'évaluateur rapide ; createModelEvaluator retombe sur la référence
  const withFeat = { ...tablesToPlain(base), phases: tablesToPlain(base).phases.map((ph) => ({ ...ph, features: { sup: 1 } })), patterns: model(tables).patterns };
  ok('base avec caractéristiques : pas d’évaluateur rapide, repli sur la référence (mêmes scores)', createFastModelEvaluator(withFeat) === null
    && createModelEvaluator(withFeat)(FastBoardInitial()) === createReferenceModelEvaluator(withFeat)(FastBoardInitial()));
}
{ // 6. Vitesse (information)
  const r = mulberry32(3); const boards = Array.from({ length: 2000 }, (_, i) => randomFastPosition(r, i).board);
  const time = (f) => { let best = Infinity, acc = 0; for (let rep = 0; rep < 7; rep++) { const t0 = performance.now(); for (let k = 0; k < 100; k++) for (let i = 0; i < boards.length; i++) acc += f(boards[i]); best = Math.min(best, performance.now() - t0); } return best * 1e6 / (100 * boards.length) + acc * 0; };
  const R = createReferenceModelEvaluator(model(tables));
  const a = time(baseEval), b = time(E), c = time(R);
  console.log(`    vitesse (ns par position) : n123 ${a.toFixed(0)} · n123 + ${cells.length} motifs : rapide ${b.toFixed(0)} (×${(b / a).toFixed(2)}), référence ${c.toFixed(0)} (×${(c / a).toFixed(2)})`);
}
console.log(failures === 0 ? '\nRÉSULTAT : tout concorde.' : `\nRÉSULTAT : ${failures} échec(s).`);
process.exit(failures === 0 ? 0 : 1);
