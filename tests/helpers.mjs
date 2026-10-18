// Outils communs aux tests de l'étage 2a (recherche / évaluation).
import { FastBoard, WM, BM, WK, BK, WHITE } from '../js/ai/fastboard.js';

export function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Position aléatoire (FastBoard) : alterne parties jouées au hasard (milieux de partie réalistes)
// et placements libres (beaucoup de dames, finales). Un pion n'est jamais sur sa rangée de promotion.
export function randomFastPosition(rnd, i) {
  const randInt = (n) => Math.floor(rnd() * n);
  if (i % 3 === 0) {
    const fb = FastBoard.initial();
    const plies = randInt(100);
    for (let p = 0; p < plies; p++) {
      const moves = fb.generateMoves();
      if (!moves.length) break;
      fb.makeMove(moves[randInt(moves.length)]);
    }
    // makeMove empile des annulations ; on repart d'un plateau « neuf » pour ne pas accumuler.
    return FastBoard.fromUiBoard(fb.toUiBoard(), fb.sideToMove);
  }
  const fb = new FastBoard();
  const n = 3 + randInt(i % 2 === 0 ? 10 : 26);
  const kingRate = [0, 0.2, 0.5, 1][randInt(4)];
  for (let k = 0; k < n; k++) {
    const sq = randInt(50);
    if (fb.board[sq]) continue;
    const white = rnd() < 0.5;
    const row = Math.floor(sq / 5);
    let king = rnd() < kingRate;
    if (!king && ((white && row === 0) || (!white && row === 9))) king = true;
    fb.board[sq] = white ? (king ? WK : WM) : (king ? BK : BM);
  }
  fb.side = rnd() < 0.5 ? WHITE : 1;
  return fb;
}

// Position FastBoard -> position au format de l'interface { board, side }.
export function toPosition(fb) {
  return { board: fb.toUiBoard(), side: fb.sideToMove };
}

export function fmt(n) {
  return Math.round(n).toLocaleString('fr-FR');
}

// --- Format texte des positions des jeux de test : "w|31,32,K5|1,2" (trait | Blancs | Noirs) ---------------
// Cases en numérotation FMJD 1..50, préfixe K = dame.
export function formatPos(uiBoard, side) {
  const w = [], b = [];
  for (let sq = 1; sq <= 50; sq++) {
    const p = uiBoard[sq];
    if (p) (p.color === 'w' ? w : b).push((p.king ? 'K' : '') + sq);
  }
  return `${side}|${w.join(',')}|${b.join(',')}`;
}

export function parsePos(text) {
  const [side, w, b] = text.split('|');
  const board = new Array(51).fill(null);
  const put = (list, color) => {
    for (const t of list.split(',').filter(Boolean)) {
      const king = t.startsWith('K');
      board[Number(king ? t.slice(1) : t)] = { color, king };
    }
  };
  put(w, 'w');
  put(b, 'b');
  return { board, side };
}
