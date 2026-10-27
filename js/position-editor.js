// DAMIKA — Éditeur de position : fonctions PURES (aucun accès au DOM), testées sous Node (tests/position-editor.mjs).
// Plateau au format de js/engine/rules.js : tableau de 51 cases (index 1..50), null ou { color: 'w'|'b', king: bool }.
import { DraughtsGame, WHITE, BLACK, initialBoard, generateLegalMoves } from './engine/rules.js';

export const TOOLS = ['wm', 'bm', 'wk', 'bk', 'erase'];
export const MAX_PIECES_PER_SIDE = 20;
const WHITE_PROMOTION_ROW = [1, 2, 3, 4, 5]; // rangée du haut : les pions blancs y deviennent dames
const BLACK_PROMOTION_ROW = [46, 47, 48, 49, 50];

export const emptyBoard = () => new Array(51).fill(null);
export const startBoard = () => initialBoard();
export const cloneBoard = (board) => board.map((p) => (p ? { ...p } : null));

const pieceOfTool = (tool) => (tool === 'wm' ? { color: WHITE, king: false }
  : tool === 'bm' ? { color: BLACK, king: false }
    : tool === 'wk' ? { color: WHITE, king: true }
      : tool === 'bk' ? { color: BLACK, king: true } : null);

// Pose (ou efface) une pièce : renvoie un NOUVEAU plateau. Poser la même pièce sur une case qui la porte déjà l'efface
// (geste le plus simple pour corriger une erreur sans changer d'outil). Case hors 1..50 : plateau inchangé.
export function applyTool(board, sq, tool) {
  if (!Number.isInteger(sq) || sq < 1 || sq > 50 || !TOOLS.includes(tool)) return board;
  const out = cloneBoard(board);
  const piece = pieceOfTool(tool);
  const cur = out[sq];
  out[sq] = !piece || (cur && cur.color === piece.color && cur.king === piece.king) ? null : piece;
  return out;
}

const plural = (n, s) => `${n} ${s}${n > 1 ? 's' : ''}`;

// Validation avant analyse. Renvoie { ok, errors: [messages en français] }.
export function validatePosition(board, side) {
  const errors = [];
  if (side !== WHITE && side !== BLACK) errors.push('Choisissez le camp au trait (Blancs ou Noirs).');
  if (!Array.isArray(board) || board.length !== 51) return { ok: false, errors: ['Plateau invalide.'] };
  if (board[0]) errors.push('Une pièce est posée hors du damier.');
  let white = 0, black = 0;
  for (let sq = 1; sq <= 50; sq++) {
    const p = board[sq];
    if (!p) continue;
    if (p.color === WHITE) white++; else if (p.color === BLACK) black++; else errors.push(`Pièce inconnue en case ${sq}.`);
  }
  if (white === 0) errors.push('Il faut au moins une pièce blanche.');
  if (black === 0) errors.push('Il faut au moins une pièce noire.');
  if (white > MAX_PIECES_PER_SIDE) errors.push(`Trop de pièces blanches : ${white} (20 au maximum).`);
  if (black > MAX_PIECES_PER_SIDE) errors.push(`Trop de pièces noires : ${black} (20 au maximum).`);
  const badWhite = WHITE_PROMOTION_ROW.filter((s) => board[s] && board[s].color === WHITE && !board[s].king);
  if (badWhite.length) errors.push(`Un pion blanc ne peut pas être sur la rangée de promotion des Blancs (${plural(badWhite.length, 'case')} : ${badWhite.join(', ')}) : il serait déjà une dame.`);
  const badBlack = BLACK_PROMOTION_ROW.filter((s) => board[s] && board[s].color === BLACK && !board[s].king);
  if (badBlack.length) errors.push(`Un pion noir ne peut pas être sur la rangée de promotion des Noirs (${plural(badBlack.length, 'case')} : ${badBlack.join(', ')}) : il serait déjà une dame.`);
  if (errors.length === 0) {
    const { captures, simples } = generateLegalMoves(board, side);
    if (captures.length === 0 && simples.length === 0) errors.push(`Les ${side === WHITE ? 'Blancs' : 'Noirs'} n'ont aucun coup possible : la partie serait déjà terminée.`);
  }
  return { ok: errors.length === 0, errors };
}

// Partie jouable depuis la position éditée : historique et futur vides, trait choisi. Lance si la position est invalide.
export function buildGameFromPosition(board, side) {
  const v = validatePosition(board, side);
  if (!v.ok) throw new Error(v.errors.join(' '));
  const game = new DraughtsGame();
  game.board = cloneBoard(board);
  game.sideToMove = side;
  game.history = [];
  game.future = [];
  return game;
}
