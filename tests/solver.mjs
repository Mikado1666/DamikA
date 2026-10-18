// Solveur INDÉPENDANT du moteur rapide et de la recherche : il n'utilise que rules.js (l'oracle).
// Il sert à construire et à vérifier les positions de test tactiques et de mat.
//   - materialSearch : minimax alpha-bêta sur le seul matériel (pion 1, dame 3), avec prolongation
//     tant qu'une prise est obligatoire (pour ne pas juger une position au milieu d'une série d'échanges).
//   - winIn / lostIn : victoire forcée en N coups, par énumération exhaustive (aucune heuristique).
import { generateLegalMoves, applyCaptureSequence, applySimpleMove } from '../js/engine/rules.js';

export const other = (side) => (side === 'w' ? 'b' : 'w');

// Coups légaux de `side` : [{ label: '32-28' | '27x9', board: plateau après le coup, seq|move }].
export function children(board, side) {
  const { captures, simples } = generateLegalMoves(board, side);
  if (captures.length) {
    return captures.map((seq) => ({
      label: `${seq[0].from}x${seq[seq.length - 1].to}`,
      board: applyCaptureSequence(board, board[seq[0].from], seq).board,
      capturedCount: seq.length,
    }));
  }
  return simples.map((m) => ({
    label: `${m.from}-${m.to}`,
    board: applySimpleMove(board, board[m.from], m).board,
    capturedCount: 0,
  }));
}

export function material(board) {
  let s = 0;
  for (let sq = 1; sq <= 50; sq++) {
    const p = board[sq];
    if (!p) continue;
    s += (p.color === 'w' ? 1 : -1) * (p.king ? 3 : 1);
  }
  return s;
}

const LOSS = 1000;
const EXT_MAX = 10;

// Valeur matérielle (point de vue de `side`) à profondeur donnée, prises forcées prolongées.
export function materialSearch(board, side, depth, alpha = -1e9, beta = 1e9, ply = 0, ext = 0) {
  const kids = children(board, side);
  if (kids.length === 0) return -(LOSS - ply);
  if (depth <= 0 && (kids[0].capturedCount === 0 || ext >= EXT_MAX)) {
    return side === 'w' ? material(board) : -material(board);
  }
  let best = -1e9;
  for (const k of kids) {
    const v = -materialSearch(k.board, other(side), depth - 1, -beta, -alpha, ply + 1, depth <= 0 ? ext + 1 : ext);
    if (v > best) best = v;
    if (best > alpha) alpha = best;
    if (alpha >= beta) break;
  }
  return best;
}

// Valeur de chaque coup à la racine : [{ label, value }], point de vue de `side`.
// Fenêtre complète pour CHAQUE coup (pas d'élagage entre coups racine) : valeurs exactes.
export function rootValues(board, side, depth) {
  return children(board, side).map((k) => ({
    label: k.label,
    value: -materialSearch(k.board, other(side), depth - 1, -1e9, 1e9, 1, 0),
  }));
}

// `side` (au trait) peut-il forcer la victoire en au plus n de ses propres coups ?
// Victoire = l'adversaire n'a plus de coup légal (plus de pièces, ou bloqué).
export function winIn(board, side, n) {
  if (n <= 0) return false;
  for (const k of children(board, side)) {
    const reply = children(k.board, other(side));
    if (reply.length === 0) return true;
    if (n > 1 && reply.every((r) => winIn(r.board, side, n - 1))) return true;
  }
  return false;
}

// Coups gagnants en au plus n coups : labels.
export function winningMoves(board, side, n) {
  const out = [];
  for (const k of children(board, side)) {
    const reply = children(k.board, other(side));
    if (reply.length === 0 || (n > 1 && reply.every((r) => winIn(r.board, side, n - 1)))) out.push(k.label);
  }
  return out;
}

// `side` (au trait) est-il perdu en au plus n coups de l'adversaire ? (aucun coup = perdu en 0)
export function lostIn(board, side, n) {
  const kids = children(board, side);
  if (kids.length === 0) return true;
  if (n <= 0) return false;
  return kids.every((k) => winIn(k.board, other(side), n));
}

// Plus petit n (1..max) tel que le camp au trait gagne en n coups, sinon null.
export function shortestWin(board, side, max = 3) {
  for (let n = 1; n <= max; n++) if (winIn(board, side, n)) return n;
  return null;
}
// Plus petit n (1..max) tel que le camp au trait soit perdu en n coups de l'adversaire, sinon null.
export function shortestLoss(board, side, max = 3) {
  for (let n = 1; n <= max; n++) if (lostIn(board, side, n)) return n;
  return null;
}
