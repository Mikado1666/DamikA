// Démonstration rapide des limites de finale FMJD 6.3 (16 coups) et 6.4 (5 coups) : AUCUN test, juste de quoi voir la
// règle agir (moins de 3 secondes). Usage : node tests/endgame-demo.mjs
// Les vrais tests sont dans tests/endgame-rules.mjs.
import { analyseSync } from '../js/ai/search.js';
import { GameState } from '../training/game.mjs';
import { moveToString } from '../js/ai/fastboard.js';
import { parsePos } from './helpers.mjs';

const hist = (plies, limit, diag = -1) => ({ quiet: 0, positions: [], endgame: { plies, limit, diag } });
const show = (label, text, h) => {
  const r = analyseSync(parsePos(text), { maxDepth: 8, maxTimeMs: 1e9, history: h });
  const verdict = r.mate ? `mat en ${r.mate.in} (${r.mate.winner === 'w' ? 'Blancs' : 'Noirs'})` : `score ${String(r.score).padStart(4)}`;
  console.log(`  ${label.padEnd(54)} ${verdict.padEnd(22)} partie déjà nulle : ${r.drawRule ?? 'non'}`);
};

console.log('Art. 6.4 — 2 dames blanches contre 1 dame noire (5 coups de chaque camp = 10 demi-coups), analyse à profondeur 8 :');
show('finale qui vient d\'apparaître (aucun historique)', 'w|K1,K2|K46', null);
for (const n of [6, 8, 9, 10]) show(`${n} demi-coups déjà joués depuis l'apparition`, 'w|K1,K2|K46', hist(n, 10));

console.log('\nArt. 6.3 — 3 dames blanches contre 1 dame noire (16 coups de chaque camp = 32 demi-coups) :');
show('finale qui vient d\'apparaître', 'w|K1,K2,K3|K46', null);
for (const n of [20, 24, 31, 32]) show(`${n} demi-coups déjà joués`, 'w|K1,K2,K3|K46', hist(n, 32));

console.log('\nClause de la grande diagonale (texte 2024) — la dame noire seule est en 46, au bout de la grande diagonale :');
show('seule sur la diagonale (aucune autre pièce dessus), depuis 0', 'w|K1,K2,K3|K46', hist(0, 32, 0));
show('… depuis 10 demi-coups : 5 coups de chaque camp écoulés', 'w|K1,K2,K3|K46', hist(10, 32, 10));
show('une dame blanche est aussi sur la diagonale (en 28) : plus de clause', 'w|K1,K2,K28|K46', hist(10, 32, -1));

console.log('\nLa PERTE au dernier coup prime sur la nulle (les Blancs bloquent la dame noire en jouant 20-14 au 32e demi-coup) :');
show('31 demi-coups déjà joués : le coup 20-14 est le 32e', 'w|K10,K20,K46|K5', hist(31, 32));

console.log('\nUne partie jouée par le moteur depuis 2 dames contre 1 (profondeur 2, même règle que l\'analyse) :');
const p = parsePos('w|K1,K2|K46');
const st = new GameState({ board: p.board, side: p.side });
const played = [];
for (;;) {
  const end = st.terminal(300);
  if (end) { console.log(`  coups : ${played.join(' ')}\n  fin : ${end.reason} (${end.result}) après ${st.plies} demi-coups`); break; }
  const r = analyseSync({ board: st.fb.toUiBoard(), side: st.fb.sideToMove }, { maxDepth: 2, maxTimeMs: 1e9, history: st.history() });
  const m = st.fb.generateMoves().find((x) => moveToString(x) === r.bestMoveNotation);
  played.push(r.bestMoveNotation);
  st.apply(m);
}
