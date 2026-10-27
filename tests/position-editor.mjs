// Éditeur de position (js/position-editor.js) : validation, construction de la partie, cas de référence. Node, aucun navigateur.
import { applyTool, emptyBoard, startBoard, validatePosition, buildGameFromPosition } from '../js/position-editor.js';
import { generateLegalMoves, applyCaptureSequence, countPieces } from '../js/engine/rules.js';
import { analyseSync } from '../js/ai/search.js';

let failures = 0;
const ok = (label, cond, extra = '') => { if (!cond) failures++; console.log(`${cond ? 'OK ' : 'ERR'} ${label}${extra ? ' — ' + extra : ''}`); };
const put = (b, list) => list.reduce((acc, [sq, tool]) => applyTool(acc, sq, tool), b);
const err = (b, side = 'w') => validatePosition(b, side).errors.join(' ');

// --- pose / effacement ---------------------------------------------------------------------------------------------
const b = put(emptyBoard(), [[28, 'wk'], [14, 'bm']]);
ok('pose dame blanche et pion noir', b[28].king && b[28].color === 'w' && !b[14].king && b[14].color === 'b');
ok("applyTool ne modifie pas le plateau d'origine", emptyBoard()[28] === null);
ok('même pièce reposée = effacée', applyTool(b, 28, 'wk')[28] === null);
ok('une autre pièce remplace', applyTool(b, 28, 'bm')[28].color === 'b');
ok('gomme', applyTool(b, 14, 'erase')[14] === null);
ok('case hors damier ignorée', applyTool(b, 0, 'wm') === b && applyTool(b, 51, 'wm') === b);

// --- validation ----------------------------------------------------------------------------------------------------
ok('position initiale valide', validatePosition(startBoard(), 'w').ok);
ok('plateau vide refusé (une pièce par camp)', validatePosition(emptyBoard(), 'w').errors.length >= 2);
ok('pas de pièce noire refusé', /au moins une pièce noire/.test(err(put(emptyBoard(), [[28, 'wk']]))));
ok('pion blanc sur la rangée de promotion refusé', /promotion des Blancs/.test(err(put(emptyBoard(), [[3, 'wm'], [30, 'bm']]))));
ok('pion noir sur la rangée de promotion refusé', /promotion des Noirs/.test(err(put(emptyBoard(), [[48, 'bm'], [30, 'wm']]))));
ok('dame sur la rangée de promotion acceptée', validatePosition(put(emptyBoard(), [[3, 'wk'], [48, 'bk']]), 'w').ok);
let full = emptyBoard();
for (let s = 16; s <= 36; s++) full = applyTool(full, s, 'wm'); // 21 pions blancs
full = applyTool(full, 40, 'bm');
ok('plus de 20 pièces par camp refusé', /Trop de pièces blanches : 21/.test(err(full)));
ok('20 pièces par camp acceptées', validatePosition(applyTool(full, 36, 'erase'), 'w').ok);
ok('trait manquant refusé', !validatePosition(b, null).ok);
const stuck = put(emptyBoard(), [[6, 'wm'], [1, 'bm']]);
ok('camp sans coup refusé', /aucun coup possible/.test(err(stuck)), err(stuck));
ok('pièce hors damier (index 0) refusée', (() => { const x = put(emptyBoard(), [[28, 'wk'], [14, 'bm']]); x[0] = { color: 'w', king: false }; return !validatePosition(x, 'w').ok; })());

// --- construction de la partie -------------------------------------------------------------------------------------
const g = buildGameFromPosition(startBoard(), 'b');
ok('partie construite : trait, historique et futur', g.sideToMove === 'b' && g.history.length === 0 && g.future.length === 0 && countPieces(g.board).white === 20);
ok('la partie ne partage pas le plateau édité', (() => { const src = startBoard(); const gg = buildGameFromPosition(src, 'w'); gg.board[31] = null; return src[31] !== null; })());
ok('position invalide : buildGame lève', (() => { try { buildGameFromPosition(emptyBoard(), 'w'); return false; } catch { return true; } })());
ok('jouable : un coup puis annulation', (() => { const gg = buildGameFromPosition(startBoard(), 'w'); gg.playSimpleMove(gg.legalMoves.simples[0]); const a = gg.history.length === 1 && gg.sideToMove === 'b'; gg.undo(); return a && gg.sideToMove === 'w' && gg.history.length === 0; })());

// --- cas de référence : dame blanche en 28, pions noirs 14 et 37, pion blanc 46 ---------------------------------------
const ref = put(emptyBoard(), [[28, 'wk'], [14, 'bm'], [37, 'bm'], [46, 'wm']]);
ok('cas de référence valide', validatePosition(ref, 'w').ok);
const game = buildGameFromPosition(ref, 'w');
const { captures, mustCapture } = game.legalMoves;
const ends = captures.map((s) => `${s[0].from}x${s[s.length - 1].to}`).sort();
ok('prise obligatoire', mustCapture);
ok('exactement 3 prises : 28x5, 28x10, 28x41', JSON.stringify(ends) === JSON.stringify(['28x10', '28x41', '28x5']), ends.join(' '));
ok('un seul pion pris à chaque prise', captures.every((s) => s.length === 1));
for (const s of captures) {
  const after = applyCaptureSequence(game.board, game.board[28], s).board;
  const taken = s[0].capturedThisStep;
  const other = taken === 14 ? 37 : 14;
  ok(`après ${s[0].from}x${s[0].to} : le pion ${taken} est pris, le pion ${other} reste`, after[taken] === null && !!after[other] && after[other].color === 'b' && !!after[46]);
}
const res = analyseSync({ board: game.board, side: game.sideToMove }, { maxDepth: 6, maxTimeMs: 3000 });
ok("l'analyse propose une des 3 prises", ['28x5', '28x10', '28x41'].includes(res.bestMoveNotation), `meilleur : ${res.bestMoveNotation}, profondeur ${res.depth}`);
// Un pion blanc en 5 est sur la rangée de promotion des Blancs : REFUSÉ par la validation demandée.
const withFive = applyTool(ref, 5, 'wm');
ok('pion blanc en 5 refusé avec un message clair', !validatePosition(withFive, 'w').ok && /promotion des Blancs/.test(validatePosition(withFive, 'w').errors[0]));
const withKing5 = applyTool(ref, 5, 'wk');
const caps5 = generateLegalMoves(withKing5, 'w').captures.map((s) => `${s[0].from}x${s[s.length - 1].to}`).sort();
ok('dame blanche en 5 (variante) : position valide', validatePosition(withKing5, 'w').ok, caps5.join(' '));

console.log(failures === 0 ? '\nTous les contrôles passent.' : `\n${failures} ÉCHEC(S)`);
process.exit(failures === 0 ? 0 : 1);
