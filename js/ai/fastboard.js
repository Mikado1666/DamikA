// DAMIKA — Moteur rapide Dames Internationales 10x10 (FMJD), destiné à la recherche (alpha-bêta).
//
// Ce module ne remplace PAS js/engine/rules.js : celui-ci reste le moteur de l'interface et sert
// d'oracle aux tests (tests/). Ici : plateau compact, tables précalculées, makeMove/unmakeMove
// sans copie du plateau. Aucune dépendance, aucun accès au DOM (utilisable dans un Worker).
//
// Représentation
//   - board : Int8Array(50), index 0..49 = case FMJD 1..50 moins 1 (rangée 1 en haut).
//   - codes : 0 vide, 1 pion blanc, 2 pion noir, 3 dame blanche, 4 dame noire.
//   - side  : 0 = Blancs (jouent en premier, montent vers l'index 0), 1 = Noirs.
//
// Dans ce fichier les cases sont toujours des index 0..49. Seules les fonctions de conversion
// avec l'interface (fromUiBoard, toUiBoard, moveToUi…) passent en numérotation FMJD 1..50.

export const EMPTY = 0, WM = 1, BM = 2, WK = 3, BK = 4;
export const WHITE = 0, BLACK = 1;

// Couleur d'un code de pièce (indexé par le code) : 0 Blancs, 1 Noirs. Index 0 (vide) inutilisé.
const COLOR_OF = Int8Array.of(-1, 0, 1, 0, 1);

// --- Tables précalculées ----------------------------------------------------------
// Géométrie identique à rules.js : (row + col) impair, rangée 0 en haut.
const ROW = new Int8Array(50);
const COL = new Int8Array(50);
const SQ_AT = new Int8Array(100).fill(-1);
(function buildGeometry() {
  let n = 0;
  for (let row = 0; row < 10; row++) {
    for (let col = 0; col < 10; col++) {
      if ((row + col) % 2 === 1) {
        ROW[n] = row;
        COL[n] = col;
        SQ_AT[row * 10 + col] = n;
        n++;
      }
    }
  }
})();

// Directions : 0 NW, 1 NE, 2 SW, 3 SE (même ordre que rules.js).
const DR = [-1, -1, 1, 1];
const DC = [-1, 1, -1, 1];

// RAYS[sq * 4 + d] = cases de la diagonale partant de sq dans la direction d, de la plus proche
// à la plus lointaine (liste vide si le bord est immédiat).
const RAYS = new Array(200);
(function buildRays() {
  for (let sq = 0; sq < 50; sq++) {
    for (let d = 0; d < 4; d++) {
      const ray = [];
      let r = ROW[sq] + DR[d], c = COL[sq] + DC[d];
      while (r >= 0 && r <= 9 && c >= 0 && c <= 9) {
        ray.push(SQ_AT[r * 10 + c]);
        r += DR[d];
        c += DC[d];
      }
      RAYS[sq * 4 + d] = Int8Array.from(ray);
    }
  }
})();

// Un pion Blanc avance vers le haut (directions 0 et 1), un Noir vers le bas (2 et 3).
const FORWARD_FIRST_DIR = [0, 2];
// Rangée de promotion : 0 pour les Blancs, 9 pour les Noirs.
const PROMOTION_ROW = [0, 9];

const EMPTY_ARRAY = Object.freeze([]);

// Capacités des piles d'annulation (plies imbriqués, pièces prises cumulées).
const MAX_PLY = 1024;
const MAX_CAPS_STACK = MAX_PLY * 20;

// --- Coup ------------------------------------------------------------------------------
// { from, to, caps, path, promo, lo, hi } — toutes les cases sont des index 0..49.
//   caps  : cases des pièces prises, dans l'ordre de la rafle (vide pour un coup simple)
//   path  : cases d'arrivée de chaque saut (null pour un coup simple) ; to = dernier élément
//   promo : true si le coup promeut un pion en dame
//   lo/hi : masque binaire des pièces prises (cases 0-24 dans lo, 25-49 dans hi), sert à
//           reconnaître deux rafles qui aboutissent à la même position.

// Règle des 25 coups (FMJD, Annexe 1, art. 6.2) : « If during 25 successive moves for each player, only
// the kings have moved, without any man moving or without any capture, the game is considered drawn. »
// = 25 coups de chaque camp = 50 demi-coups consécutifs sans coup de pion ni prise.
export const DRAW_QUIET_PLIES = 50;

export class FastBoard {
  constructor() {
    this.board = new Int8Array(50);
    this.side = WHITE;
    // Demi-coups consécutifs sans coup de pion ni prise (seules les dames ont bougé, sans capturer).
    // Mis à jour par makeMove/unmakeMove ; à poser à la main (ou via fromUiBoard) pour une position
    // reprise en cours de partie.
    this.quiet = 0;
    this._stkQuiet = new Int16Array(MAX_PLY);

    // Pièces prises dans la rafle en cours d'exploration : elles restent sur le plateau (donc
    // bloquantes) jusqu'à la fin du coup et ne peuvent pas être sautées deux fois.
    this._dead = new Uint8Array(50);
    this._pathStk = new Int8Array(64);
    this._capStk = new Int8Array(64);
    this._found = [];
    this._maxLen = 0;
    this._me = 0;

    // Piles d'annulation de makeMove/unmakeMove.
    this._sp = 0;
    this._stkFrom = new Int8Array(MAX_PLY);
    this._stkTo = new Int8Array(MAX_PLY);
    this._stkPiece = new Int8Array(MAX_PLY);
    this._stkNcap = new Int8Array(MAX_PLY);
    this._cp = 0;
    this._capSq = new Int8Array(MAX_CAPS_STACK);
    this._capPiece = new Int8Array(MAX_CAPS_STACK);
  }

  static initial() {
    const fb = new FastBoard();
    for (let i = 0; i < 20; i++) fb.board[i] = BM;
    for (let i = 30; i < 50; i++) fb.board[i] = WM;
    return fb;
  }

  // --- Génération des coups --------------------------------------------------------------
  // Retourne la liste des coups légaux du camp au trait (prise obligatoire, grande prise).
  // dedupe (défaut true) : deux rafles de même départ, même arrivée et mêmes pièces prises (dans
  // un ordre différent) donnent la même position et ne comptent que pour un seul coup.
  // dedupe = false : tous les chemins distincts (sert aux tests différentiels).
  generateMoves(dedupe = true) {
    const board = this.board;
    const me = this.side;
    this._me = me;
    this._found = [];
    this._maxLen = 0;

    for (let sq = 0; sq < 50; sq++) {
      const p = board[sq];
      if (p === EMPTY || COLOR_OF[p] !== me) continue;
      // La pièce est soulevée pendant la recherche : sa case d'origine est libre pour elle
      // (une dame peut repasser par là) et elle n'occupe que sa case courante.
      board[sq] = EMPTY;
      this._captureDfs(sq, sq, p, 0);
      board[sq] = p;
    }

    if (this._maxLen > 0) {
      const found = this._found;
      return dedupe ? dedupeMoves(found) : found;
    }

    const moves = [];
    for (let sq = 0; sq < 50; sq++) {
      const p = board[sq];
      if (p === EMPTY || COLOR_OF[p] !== me) continue;
      if (p > 2) this._kingSimple(sq, moves);
      else this._manSimple(sq, p, moves);
    }
    return moves;
  }

  _manSimple(sq, p, out) {
    const me = COLOR_OF[p];
    const first = FORWARD_FIRST_DIR[me];
    for (let d = first; d < first + 2; d++) {
      const ray = RAYS[sq * 4 + d];
      if (ray.length === 0) continue;
      const to = ray[0];
      if (this.board[to] !== EMPTY) continue;
      out.push({
        from: sq, to, caps: EMPTY_ARRAY, path: null,
        promo: ROW[to] === PROMOTION_ROW[me], lo: 0, hi: 0,
      });
    }
  }

  _kingSimple(sq, out) {
    const board = this.board;
    for (let d = 0; d < 4; d++) {
      const ray = RAYS[sq * 4 + d];
      for (let i = 0; i < ray.length; i++) {
        const to = ray[i];
        if (board[to] !== EMPTY) break;
        out.push({ from: sq, to, caps: EMPTY_ARRAY, path: null, promo: false, lo: 0, hi: 0 });
      }
    }
  }

  // Recherche en profondeur des rafles. `cur` = case courante de la pièce qui prend, `depth` =
  // nombre de pièces déjà prises. Seules les rafles de longueur maximale sont conservées.
  _captureDfs(origin, cur, piece, depth) {
    const board = this.board;
    const dead = this._dead;
    const me = this._me;
    let extended = false;

    if (piece <= 2) {
      // Pion : saute une pièce adverse adjacente, dans les 4 directions (prise en arrière incluse).
      for (let d = 0; d < 4; d++) {
        const ray = RAYS[cur * 4 + d];
        if (ray.length < 2) continue;
        const a = ray[0];
        const pa = board[a];
        if (pa === EMPTY || dead[a] === 1 || COLOR_OF[pa] === me) continue;
        const land = ray[1];
        if (board[land] !== EMPTY) continue; // une pièce déjà prise occupe encore sa case
        extended = true;
        dead[a] = 1;
        this._capStk[depth] = a;
        this._pathStk[depth] = land;
        this._captureDfs(origin, land, piece, depth + 1);
        dead[a] = 0;
      }
    } else {
      // Dame volante : glisse sur les cases vides, saute la première pièce rencontrée si elle est
      // adverse et non déjà prise, atterrit sur n'importe quelle case vide au-delà.
      for (let d = 0; d < 4; d++) {
        const ray = RAYS[cur * 4 + d];
        const len = ray.length;
        let i = 0;
        while (i < len && board[ray[i]] === EMPTY) i++;
        if (i >= len) continue;
        const a = ray[i];
        if (dead[a] === 1 || COLOR_OF[board[a]] === me) continue;
        dead[a] = 1;
        this._capStk[depth] = a;
        for (let j = i + 1; j < len && board[ray[j]] === EMPTY; j++) {
          extended = true; // une case d'atterrissage existe : la prise est possible
          this._pathStk[depth] = ray[j];
          this._captureDfs(origin, ray[j], piece, depth + 1);
        }
        dead[a] = 0;
      }
    }

    if (extended || depth === 0) return;
    // Fin de rafle : aucune prise supplémentaire possible depuis `cur`.
    if (depth < this._maxLen) return;
    if (depth > this._maxLen) {
      this._maxLen = depth;
      this._found = [];
    }
    let lo = 0, hi = 0;
    const caps = new Array(depth);
    const path = new Array(depth);
    for (let k = 0; k < depth; k++) {
      const c = this._capStk[k];
      caps[k] = c;
      path[k] = this._pathStk[k];
      if (c < 25) lo |= 1 << c; else hi |= 1 << (c - 25);
    }
    this._found.push({
      from: origin, to: cur, caps, path,
      promo: piece <= 2 && ROW[cur] === PROMOTION_ROW[me], lo, hi,
    });
  }

  // --- Jouer / annuler un coup --------------------------------------------------------------
  makeMove(m) {
    const board = this.board;
    const sp = this._sp;
    const piece = board[m.from];
    this._stkFrom[sp] = m.from;
    this._stkTo[sp] = m.to;
    this._stkPiece[sp] = piece;
    const caps = m.caps;
    this._stkNcap[sp] = caps.length;
    this._stkQuiet[sp] = this.quiet;
    this.quiet = (piece <= 2 || caps.length > 0) ? 0 : this.quiet + 1; // coup de pion (promotion comprise) ou prise
    let cp = this._cp;
    for (let k = 0; k < caps.length; k++) {
      const c = caps[k];
      this._capSq[cp] = c;
      this._capPiece[cp] = board[c];
      board[c] = EMPTY;
      cp++;
    }
    this._cp = cp;
    board[m.from] = EMPTY; // avant l'écriture de `to` : from peut être égal à to (rafle en boucle)
    board[m.to] = m.promo ? piece + 2 : piece;
    this.side ^= 1;
    this._sp = sp + 1;
  }

  unmakeMove() {
    const board = this.board;
    const sp = --this._sp;
    this.side ^= 1;
    this.quiet = this._stkQuiet[sp];
    board[this._stkTo[sp]] = EMPTY;
    board[this._stkFrom[sp]] = this._stkPiece[sp];
    let cp = this._cp;
    for (let k = this._stkNcap[sp]; k > 0; k--) {
      cp--;
      board[this._capSq[cp]] = this._capPiece[cp];
    }
    this._cp = cp;
  }

  // --- perft ---------------------------------------------------------------------------------
  // Nombre de feuilles à la profondeur donnée (comptage en bloc au dernier niveau).
  perft(depth) {
    if (depth <= 0) return 1;
    const moves = this.generateMoves();
    if (depth === 1) return moves.length;
    let nodes = 0;
    for (let k = 0; k < moves.length; k++) {
      this.makeMove(moves[k]);
      nodes += this.perft(depth - 1);
      this.unmakeMove();
    }
    return nodes;
  }

  // perft détaillé par coup racine (pour localiser une divergence).
  perftDivide(depth) {
    const out = [];
    for (const m of this.generateMoves()) {
      this.makeMove(m);
      out.push({ move: moveToString(m), nodes: this.perft(depth - 1) });
      this.unmakeMove();
    }
    return out;
  }

  // --- Conversion depuis / vers la position de l'interface ---------------------------------------
  // Format interface : tableau de 51 éléments (index 1..50), null ou { color: 'w'|'b', king }.
  static fromUiBoard(uiBoard, sideToMove, quiet = 0) {
    const fb = new FastBoard();
    fb.quiet = quiet;
    for (let sq = 1; sq <= 50; sq++) {
      const p = uiBoard[sq];
      if (!p) continue;
      fb.board[sq - 1] = p.color === 'w' ? (p.king ? WK : WM) : (p.king ? BK : BM);
    }
    fb.side = sideToMove === 'b' ? BLACK : WHITE;
    return fb;
  }

  toUiBoard() {
    const out = new Array(51).fill(null);
    for (let i = 0; i < 50; i++) {
      const p = this.board[i];
      if (p !== EMPTY) out[i + 1] = { color: COLOR_OF[p] === 0 ? 'w' : 'b', king: p > 2 };
    }
    return out;
  }

  get sideToMove() {
    return this.side === WHITE ? 'w' : 'b';
  }

  // Coups légaux au format de rules.js generateLegalMoves() : { captures: [séquences d'étapes
  // { from, to, capturedThisStep, promoted }], simples: [{ from, to }], mustCapture, maxCapture }.
  // Tous les chemins sont listés (dedupe = false), comme rules.js.
  generateUiMoves() {
    const moves = this.generateMoves(false);
    if (moves.length > 0 && moves[0].caps.length > 0) {
      return {
        captures: moves.map(moveToUi),
        simples: [],
        mustCapture: true,
        maxCapture: moves[0].caps.length,
      };
    }
    return { captures: [], simples: moves.map(moveToUi), mustCapture: false, maxCapture: 0 };
  }
}

// Retire les rafles qui aboutissent à la même position (même départ, arrivée, pièces prises).
function dedupeMoves(moves) {
  if (moves.length < 2) return moves;
  const out = [];
  for (let i = 0; i < moves.length; i++) {
    const m = moves[i];
    let duplicate = false;
    for (let j = 0; j < out.length; j++) {
      const o = out[j];
      if (o.from === m.from && o.to === m.to && o.lo === m.lo && o.hi === m.hi) { duplicate = true; break; }
    }
    if (!duplicate) out.push(m);
  }
  return out;
}

// Coup au format interface (cases 1..50). Rafle : tableau d'étapes ; coup simple : { from, to }.
export function moveToUi(m) {
  if (m.caps.length === 0) return { from: m.from + 1, to: m.to + 1 };
  const steps = [];
  let from = m.from;
  for (let k = 0; k < m.caps.length; k++) {
    steps.push({
      from: from + 1,
      to: m.path[k] + 1,
      capturedThisStep: m.caps[k] + 1,
      promoted: k === m.caps.length - 1 && m.promo,
    });
    from = m.path[k];
  }
  return steps;
}

// Notation FMJD : tiret pour un coup simple, "x" pour une prise (départ×arrivée).
export function moveToString(m) {
  return `${m.from + 1}${m.caps.length > 0 ? 'x' : '-'}${m.to + 1}`;
}
