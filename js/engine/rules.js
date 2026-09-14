// DAMICK — Moteur de règles Dames Internationales 10x10 (FMJD)
// Plateau: cases jouables numérotées 1..50 (notation FMJD), rangée 1 en haut.
// Couleurs: 'w' = Blancs (bas, jouent en premier, avancent vers rangée 1)
//           'b' = Noirs (haut, avancent vers rangée 10)

export const WHITE = 'w';
export const BLACK = 'b';

const DIRS = [
  { dr: -1, dc: -1, name: 'NW' },
  { dr: -1, dc: 1, name: 'NE' },
  { dr: 1, dc: -1, name: 'SW' },
  { dr: 1, dc: 1, name: 'SE' },
];

// --- Correspondance case <-> (row, col) ---------------------------------
// row/col: 0..9, row 0 = rangée du haut. Cases jouables: (row+col) impair.
const SQUARE_TO_RC = new Array(51);
const RC_TO_SQUARE = {};
(function buildTables() {
  let n = 1;
  for (let row = 0; row < 10; row++) {
    for (let col = 0; col < 10; col++) {
      if ((row + col) % 2 === 1) {
        SQUARE_TO_RC[n] = [row, col];
        RC_TO_SQUARE[row * 10 + col] = n;
        n++;
      }
    }
  }
})();

export function squareToRC(sq) {
  return SQUARE_TO_RC[sq];
}
export function rcToSquare(row, col) {
  if (row < 0 || row > 9 || col < 0 || col > 9) return null;
  return RC_TO_SQUARE[row * 10 + col] ?? null;
}

function inBounds(row, col) {
  return row >= 0 && row <= 9 && col >= 0 && col <= 9;
}

// --- Position initiale ----------------------------------------------------
export function initialBoard() {
  const board = new Array(51).fill(null);
  for (let sq = 1; sq <= 20; sq++) board[sq] = { color: BLACK, king: false };
  for (let sq = 31; sq <= 50; sq++) board[sq] = { color: WHITE, king: false };
  return board;
}

function cloneBoard(board) {
  const out = new Array(51).fill(null);
  for (let i = 1; i <= 50; i++) {
    out[i] = board[i] ? { ...board[i] } : null;
  }
  return out;
}

function opponent(color) {
  return color === WHITE ? BLACK : WHITE;
}

// Rangée de promotion pour chaque couleur (row index 0..9)
function promotionRow(color) {
  return color === WHITE ? 0 : 9;
}

// --- Génération des captures (récursive, gère dames volantes) -------------
// Retourne une liste de séquences maximales. Chaque séquence est un tableau
// d'étapes: { from, to, captured: [squares...] } — 'captured' cumulé pas à pas
// est aussi fourni via 'capturedThisStep'.
function findCaptureSequences(board, fromSquare, piece, deadSet) {
  const [row, col] = squareToRC(fromSquare);
  const sequences = [];

  if (!piece.king) {
    // Pion : capture dans les 4 directions, saut simple par-dessus une pièce adverse.
    for (const { dr, dc } of DIRS) {
      const midRow = row + dr, midCol = col + dc;
      const landRow = row + 2 * dr, landCol = col + 2 * dc;
      if (!inBounds(landRow, landCol)) continue;
      const midSq = rcToSquare(midRow, midCol);
      const landSq = rcToSquare(landRow, landCol);
      if (midSq == null || landSq == null) continue;
      const midPiece = board[midSq];
      if (!midPiece || midPiece.color === piece.color) continue;
      if (deadSet.has(midSq)) continue; // déjà capturée dans cette séquence
      if (board[landSq] != null && !deadSet.has(landSq)) continue; // case occupée

      // Simuler le saut
      const nextBoard = board; // on ne clone pas, on utilise deadSet + déplacement virtuel
      const newDead = new Set(deadSet);
      newDead.add(midSq);

      // Promotion en cours de capture : si le pion atteint la dernière rangée,
      // il devient dame et DOIT continuer la capture comme une dame si possible (règle FMJD).
      let continuationPiece = piece;
      let promotedNow = false;
      if (landRow === promotionRow(piece.color)) {
        continuationPiece = { ...piece, king: true };
        promotedNow = true;
      }

      const subSequences = simulateAndRecurse(
        nextBoard,
        fromSquare,
        landSq,
        midSq,
        continuationPiece,
        newDead
      );

      if (subSequences.length === 0) {
        sequences.push([{ from: fromSquare, to: landSq, capturedThisStep: midSq, promoted: promotedNow }]);
      } else {
        for (const sub of subSequences) {
          sequences.push([{ from: fromSquare, to: landSq, capturedThisStep: midSq, promoted: promotedNow }, ...sub]);
        }
      }
    }
  } else {
    // Dame volante : parcourt la diagonale, saute une seule pièce adverse,
    // peut atterrir sur n'importe quelle case vide au-delà.
    for (const { dr, dc } of DIRS) {
      let r = row + dr, c = col + dc;
      // Avancer sur les cases vides avant une éventuelle pièce
      while (inBounds(r, c)) {
        const sq = rcToSquare(r, c);
        const occ = sq != null ? board[sq] : undefined;
        if (occ == null || (deadSet.has(sq))) {
          r += dr;
          c += dc;
          continue;
        }
        break;
      }
      if (!inBounds(r, c)) continue;
      const enemySq = rcToSquare(r, c);
      const enemyPiece = enemySq != null ? board[enemySq] : null;
      if (!enemyPiece || enemyPiece.color === piece.color || deadSet.has(enemySq)) continue;

      // Cases d'atterrissage possibles : après la pièce ennemie, tant que c'est vide
      let lr = r + dr, lc = c + dc;
      const landings = [];
      while (inBounds(lr, lc)) {
        const lsq = rcToSquare(lr, lc);
        if (lsq == null) break;
        if (board[lsq] != null && !deadSet.has(lsq)) break;
        landings.push(lsq);
        lr += dr;
        lc += dc;
      }

      for (const landSq of landings) {
        const newDead = new Set(deadSet);
        newDead.add(enemySq);
        const subSequences = simulateAndRecurse(board, fromSquare, landSq, enemySq, piece, newDead);
        if (subSequences.length === 0) {
          sequences.push([{ from: fromSquare, to: landSq, capturedThisStep: enemySq, promoted: false }]);
        } else {
          for (const sub of subSequences) {
            sequences.push([{ from: fromSquare, to: landSq, capturedThisStep: enemySq, promoted: false }, ...sub]);
          }
        }
      }
    }
  }

  return sequences;
}

function simulateAndRecurse(board, originalFrom, landSq, capturedSq, movingPiece, deadSet) {
  // Construit un plateau temporaire où la pièce a "sauté" à landSq,
  // la case de départ d'origine est vide, et les pièces mortes restent
  // visuellement présentes (bloquantes) mais non-recapturables (gérées via deadSet).
  const tmp = cloneBoard(board);
  tmp[originalFrom] = null;
  tmp[landSq] = movingPiece;
  return findCaptureSequences(tmp, landSq, movingPiece, deadSet);
}

// --- Génération des coups simples (sans capture) ---------------------------
function findSimpleMoves(board, fromSquare, piece) {
  const [row, col] = squareToRC(fromSquare);
  const moves = [];
  if (!piece.king) {
    const forwardDirs = piece.color === WHITE
      ? DIRS.filter(d => d.dr === -1)
      : DIRS.filter(d => d.dr === 1);
    for (const { dr, dc } of forwardDirs) {
      const r = row + dr, c = col + dc;
      if (!inBounds(r, c)) continue;
      const sq = rcToSquare(r, c);
      if (sq != null && board[sq] == null) {
        moves.push({ from: fromSquare, to: sq });
      }
    }
  } else {
    for (const { dr, dc } of DIRS) {
      let r = row + dr, c = col + dc;
      while (inBounds(r, c)) {
        const sq = rcToSquare(r, c);
        if (sq == null || board[sq] != null) break;
        moves.push({ from: fromSquare, to: sq });
        r += dr;
        c += dc;
      }
    }
  }
  return moves;
}

// --- API principale ---------------------------------------------------------

// Retourne { captures: [sequences maximales...], simples: [moves...], mustCapture: bool }
export function generateLegalMoves(board, color) {
  const allCaptureSequences = [];
  for (let sq = 1; sq <= 50; sq++) {
    const piece = board[sq];
    if (!piece || piece.color !== color) continue;
    const seqs = findCaptureSequences(board, sq, piece, new Set());
    for (const s of seqs) allCaptureSequences.push(s);
  }

  if (allCaptureSequences.length > 0) {
    // Règle de la grande prise : on ne garde que les séquences de longueur maximale.
    const maxLen = Math.max(...allCaptureSequences.map(s => s.length));
    const best = allCaptureSequences.filter(s => s.length === maxLen);
    return { captures: best, simples: [], mustCapture: true, maxCapture: maxLen };
  }

  const simples = [];
  for (let sq = 1; sq <= 50; sq++) {
    const piece = board[sq];
    if (!piece || piece.color !== color) continue;
    simples.push(...findSimpleMoves(board, sq, piece));
  }
  return { captures: [], simples, mustCapture: false, maxCapture: 0 };
}

// Applique une séquence de capture (issue de generateLegalMoves) sur le board, retourne un nouveau board.
export function applyCaptureSequence(board, piece, sequence) {
  const b = cloneBoard(board);
  const originSquare = sequence[0].from;
  b[originSquare] = null;
  let current = { ...piece };
  const capturedSquares = [];
  for (const step of sequence) {
    capturedSquares.push(step.capturedThisStep);
    b[step.capturedThisStep] = null;
    if (step.promoted) current = { ...current, king: true };
    b[step.to] = current;
  }
  return { board: b, capturedSquares, finalSquare: sequence[sequence.length - 1].to, finalPiece: current };
}

// Applique un coup simple, gère la promotion en fin de coup.
export function applySimpleMove(board, piece, move) {
  const b = cloneBoard(board);
  b[move.from] = null;
  let finalPiece = { ...piece };
  if (!finalPiece.king) {
    const [landRow] = squareToRC(move.to);
    if (landRow === promotionRow(piece.color)) finalPiece = { ...finalPiece, king: true };
  }
  b[move.to] = finalPiece;
  return { board: b, finalSquare: move.to, finalPiece };
}

// --- Compteur de temps (théorie des finales) --------------------------------
// Rang compté depuis la rangée de départ de chaque camp (1 à 4), multiplié par le nb
// de pions sur ce rang, sommé. Ne concerne que les pions (pas de dames sur le plateau).
export function hasAnyKing(board) {
  for (let sq = 1; sq <= 50; sq++) {
    if (board[sq] && board[sq].king) return true;
  }
  return false;
}

export function computeTempoScores(board) {
  // Blancs partent rangée 10 (row 9), avancent vers row 0 : rang = 10 - (row+1) ... on définit
  // rang 1 = la rangée de départ (rows 6-9 pour Blancs), rang 4 = la plus avancée avant promotion (rows 3? )
  // Pour Blancs : row 9->rang1, row8->rang1? Non : chaque rangée = un rang distinct (4 rangées de pions de départ: rows 6,7,8,9)
  // On calcule le rang comme distance (en rangées) depuis la rangée de départ du camp, +1.
  let whiteScore = 0;
  let blackScore = 0;
  for (let sq = 1; sq <= 50; sq++) {
    const piece = board[sq];
    if (!piece || piece.king) continue;
    const [row] = squareToRC(sq);
    if (piece.color === WHITE) {
      // Rangées Blancs : départ row 9 (rang1) ... row 6 (rang4), au-delà (rows 0-5) rang continue 5..10
      const rank = 10 - row; // row9->1, row8->2 ... row0->10
      whiteScore += rank;
    } else {
      const rank = row + 1; // row0->1 ... row9->10
      blackScore += rank;
    }
  }
  return { whiteScore, blackScore };
}

export function computeTempoDifferential(board, sideToMove) {
  if (hasAnyKing(board)) return null; // désactivé dès qu'une dame est présente
  const { whiteScore, blackScore } = computeTempoScores(board);
  let diff = whiteScore - blackScore;
  if (sideToMove === BLACK) diff -= 1;
  return diff;
}

// --- Comptage des pièces -----------------------------------------------------
export function countPieces(board) {
  let white = 0, black = 0, whiteKings = 0, blackKings = 0;
  for (let sq = 1; sq <= 50; sq++) {
    const p = board[sq];
    if (!p) continue;
    if (p.color === WHITE) { white++; if (p.king) whiteKings++; }
    else { black++; if (p.king) blackKings++; }
  }
  return { white, black, whiteKings, blackKings };
}

// --- Classe Game : encapsule l'état de la partie en cours -------------------
export class DraughtsGame {
  constructor() {
    this.board = initialBoard();
    this.sideToMove = WHITE;
    this.history = []; // { board avant, move joué (description), sideToMove avant }
    this.future = []; // pour redo
  }

  get legalMoves() {
    return generateLegalMoves(this.board, this.sideToMove);
  }

  // pieces obligées de capturer (pour surbrillance)
  get mandatorySquares() {
    const { captures } = this.legalMoves;
    const set = new Set();
    for (const seq of captures) set.add(seq[0].from);
    return set;
  }

  isGameOver() {
    const { captures, simples } = this.legalMoves;
    return captures.length === 0 && simples.length === 0;
  }

  winner() {
    if (!this.isGameOver()) return null;
    return this.sideToMove === WHITE ? BLACK : WHITE;
  }

  // Joue un coup simple {from,to}
  playSimpleMove(move) {
    const piece = this.board[move.from];
    const { board: newBoard, finalPiece } = applySimpleMove(this.board, piece, move);
    this._commit(newBoard, {
      type: 'simple', from: move.from, to: move.to, piece,
      promoted: finalPiece.king && !piece.king,
    });
  }

  // Joue une séquence de capture (un élément de legalMoves.captures)
  playCaptureSequence(sequence) {
    const piece = this.board[sequence[0].from];
    const { board: newBoard, capturedSquares, finalPiece } = applyCaptureSequence(this.board, piece, sequence);
    this._commit(newBoard, {
      type: 'capture', from: sequence[0].from, to: sequence[sequence.length - 1].to,
      path: sequence.map(s => s.to), captured: capturedSquares, piece,
      promoted: finalPiece.king && !piece.king,
    });
  }

  _commit(newBoard, moveInfo) {
    this.history.push({ board: this.board, sideToMove: this.sideToMove, move: moveInfo });
    this.future = [];
    this.board = newBoard;
    this.sideToMove = opponent(this.sideToMove);
  }

  undo() {
    if (this.history.length === 0) return false;
    const prev = this.history.pop();
    this.future.push({ board: this.board, sideToMove: this.sideToMove, move: prev.move });
    this.board = prev.board;
    this.sideToMove = prev.sideToMove;
    return true;
  }

  redo() {
    if (this.future.length === 0) return false;
    const next = this.future.pop();
    this.history.push({ board: this.board, sideToMove: this.sideToMove, move: next.move });
    this.board = next.board;
    this.sideToMove = next.sideToMove;
    return true;
  }
}
