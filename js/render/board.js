// DAMICK — Rendu Canvas du plateau (damier à thèmes, pièces "classiques" plates, flèche cyan)
import { squareToRC, rcToSquare } from '../engine/rules.js';

const LABEL_MARGIN = 26; // espace réservé aux numéros de case (hors damier)

// Thèmes de damier — cases en aplat (pas de gradient), 3e couleur pour la case sombre
// en surbrillance (cases du dernier coup joué). Repris de l'artefact de référence
// (voir ARTEFACT_REFERENCE_DESIGN.md §2.1).
export const BOARD_THEMES = {
  bois: { label: 'Bois', light: '#d4bc8a', dark: '#8B5E1A', darkHL: '#b07820' },
  ardoise: { label: 'Ardoise', light: '#9aa0b8', dark: '#6a7090', darkHL: '#8090b0' },
  vert: { label: 'Vert', light: '#7a9a78', dark: '#4a6a48', darkHL: '#5a8a58' },
  beige: { label: 'Beige', light: '#e8d0a8', dark: '#b07848', darkHL: '#c89050' },
};
const DEFAULT_BOARD_THEME = 'bois';

// Styles de pièces — chaque entrée référence sa fonction de rendu (déclarations `function`
// plus bas dans ce fichier ; le hoisting les rend disponibles ici). "Classique" reste le
// style par défaut.
export const PIECE_STYLES = {
  classique: { label: 'Classique', render: drawPieceClassique },
  relief: { label: 'Relief', render: drawPieceRelief },
  boisGrave: { label: 'Bois gravé', render: drawPieceWood },
};
const DEFAULT_PIECE_STYLE = 'classique';

export class BoardRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.flipped = false; // false = vue Blancs en bas
    this.size = 0; // taille CSS du plateau (carré)
    this.cell = 0;
    this.dpr = window.devicePixelRatio || 1;
    this._pulsePhase = 0;
    this._animFrame = null;

    // état d'affichage
    this.board = null;
    this.selectedSquare = null;
    this.legalTargets = []; // squares où la pièce sélectionnée peut aller
    this.mandatorySquares = new Set();
    this.lastMove = null; // { squares: [depart, ...étapes..., arrivée] }
    this.showArrow = true;
    this.showCoords = true;
    this.boardTheme = DEFAULT_BOARD_THEME;
    this.pieceStyle = DEFAULT_PIECE_STYLE;
    this.animation = null; // { from, to, piece, capturedSquares, start, duration, resolve }
    this.animSpeedMs = 260;

    this._resizeObserver = new ResizeObserver(() => this.resize());
    this._resizeObserver.observe(canvas.parentElement);
    this.resize();
    this._loopPulse();
  }

  destroy() {
    if (this._animFrame) cancelAnimationFrame(this._animFrame);
    this._resizeObserver.disconnect();
  }

  resize() {
    const parent = this.canvas.parentElement;
    const available = Math.min(parent.clientWidth, parent.clientHeight || parent.clientWidth);
    this.size = Math.max(280, Math.floor(available));
    const px = this.size + LABEL_MARGIN * 2;
    this.dpr = window.devicePixelRatio || 1;
    this.canvas.width = px * this.dpr;
    this.canvas.height = px * this.dpr;
    this.canvas.style.width = px + 'px';
    this.canvas.style.height = px + 'px';
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.cell = this.size / 10;
    this.render();
  }

  setState({ board, selectedSquare, legalTargets, mandatorySquares, lastMove }) {
    this.board = board;
    this.selectedSquare = selectedSquare ?? null;
    this.legalTargets = legalTargets ?? [];
    this.mandatorySquares = mandatorySquares ?? new Set();
    this.lastMove = lastMove ?? null;
    this.render();
  }

  setFlipped(flipped) {
    this.flipped = flipped;
    this.render();
  }

  setBoardTheme(name) {
    if (!BOARD_THEMES[name]) return;
    this.boardTheme = name;
    this.render();
  }

  setPieceStyle(name) {
    if (!PIECE_STYLES[name]) return;
    this.pieceStyle = name;
    this.render();
  }

  // Anime le déplacement d'une pièce (et la disparition nette des pièces capturées, au
  // moment où le tracé passe par leur case).
  // path: liste de squares intermédiaires pour une capture multiple (from -> ...-> to)
  // capturedPieces: [{ square, piece }] — la pièce capturée au format {color,king}, nécessaire
  // pour le dessin car elle n'existe plus dans this.board au moment de l'animation.
  animateMove({ path, piece, capturedPieces = [] }) {
    return new Promise((resolve) => {
      if (this.animSpeedMs <= 0) { resolve(); return; }
      let settled = false;
      const settle = () => {
        if (settled) return;
        settled = true;
        resolve();
      };
      // Rythme plus vif sur une prise (voir ARTEFACT_REFERENCE_DESIGN.md §2.4).
      const duration = capturedPieces.length > 0
        ? Math.max(140, this.animSpeedMs * 0.7)
        : this.animSpeedMs;
      this.animation = {
        path,
        piece,
        capturedPieces,
        segment: 0,
        start: performance.now(),
        duration,
        resolve: settle,
      };
      // Filet de sécurité : si la boucle requestAnimationFrame est throttlée (onglet en
      // arrière-plan) l'animation peut ne jamais avancer ; on force la résolution après un
      // délai large pour ne jamais bloquer durablement les interactions.
      const maxWait = (path.length - 1) * duration + 1500;
      setTimeout(() => {
        if (this.animation && this.animation.resolve === settle) this.animation = null;
        settle();
      }, maxWait);
    });
  }

  // Convertit row/col logique -> position à l'écran selon l'orientation
  _screenRC(row, col) {
    if (this.flipped) return [9 - row, 9 - col];
    return [row, col];
  }

  _cellCenter(row, col) {
    const [sr, sc] = this._screenRC(row, col);
    return [
      LABEL_MARGIN + sc * this.cell + this.cell / 2,
      LABEL_MARGIN + sr * this.cell + this.cell / 2,
    ];
  }

  squareAtPoint(x, y) {
    const gx = x - LABEL_MARGIN;
    const gy = y - LABEL_MARGIN;
    if (gx < 0 || gy < 0 || gx >= this.size || gy >= this.size) return null;
    let col = Math.floor(gx / this.cell);
    let row = Math.floor(gy / this.cell);
    if (this.flipped) { row = 9 - row; col = 9 - col; }
    return rcToSquare(row, col);
  }

  // Résout la case cliquée à partir d'une fraction (0..1) de la boîte du canvas telle que
  // rendue à l'écran (ex: (clientX-rect.left)/rect.width). Insensible au devicePixelRatio,
  // au zoom navigateur ou à tout arrondi entre canvas.width et la taille CSS réelle —
  // seule la position relative dans la boîte visible compte.
  squareAtFraction(xFrac, yFrac) {
    const totalPx = this.size + LABEL_MARGIN * 2;
    return this.squareAtPoint(xFrac * totalPx, yFrac * totalPx);
  }

  _loopPulse() {
    this._pulsePhase = (Date.now() % 1400) / 1400;
    this.render();
    this._animFrame = requestAnimationFrame(() => this._loopPulse());
  }

  render() {
    if (!this.board) return;
    this._advanceAnimation();
    const ctx = this.ctx;
    const s = this.size;
    ctx.clearRect(0, 0, s + LABEL_MARGIN * 2, s + LABEL_MARGIN * 2);

    this._drawFrame();
    this._drawSquares();
    if (this.showCoords) this._drawCoords();
    this._drawHighlights();
    if (this.showArrow && this.lastMove) this._drawLastMoveArrow();
    this._drawPieces();
    if (this.selectedSquare != null) this._drawSelection();
  }

  _advanceAnimation() {
    const anim = this.animation;
    if (!anim) return;
    const now = performance.now();
    let t = (now - anim.start) / anim.duration;
    if (t >= 1) {
      anim.segment += 1;
      if (anim.segment >= anim.path.length - 1) {
        this.animation = null;
        anim.resolve();
        return;
      }
      anim.start = now;
      t = 0;
    }
  }

  _drawFrame() {
    const ctx = this.ctx;
    const s = this.size;
    const g = ctx.createLinearGradient(0, 0, s, s);
    g.addColorStop(0, '#3a2418');
    g.addColorStop(1, '#241209');
    ctx.fillStyle = g;
    roundRect(ctx, LABEL_MARGIN - 8, LABEL_MARGIN - 8, s + 16, s + 16, 6);
    ctx.fill();
    ctx.strokeStyle = 'rgba(212,175,105,0.35)';
    ctx.lineWidth = 1;
    roundRect(ctx, LABEL_MARGIN - 8, LABEL_MARGIN - 8, s + 16, s + 16, 6);
    ctx.stroke();
  }

  _drawSquares() {
    const ctx = this.ctx;
    const c = this.cell;
    const theme = BOARD_THEMES[this.boardTheme] || BOARD_THEMES[DEFAULT_BOARD_THEME];
    const lastSquares = this.lastMove?.squares ? new Set(this.lastMove.squares) : null;
    for (let row = 0; row < 10; row++) {
      for (let col = 0; col < 10; col++) {
        const dark = (row + col) % 2 === 1;
        const [sr, sc] = this._screenRC(row, col);
        const x = LABEL_MARGIN + sc * c;
        const y = LABEL_MARGIN + sr * c;
        if (dark) {
          const sq = rcToSquare(row, col);
          ctx.fillStyle = lastSquares && lastSquares.has(sq) ? theme.darkHL : theme.dark;
        } else {
          ctx.fillStyle = theme.light;
        }
        ctx.fillRect(x, y, c, c);
      }
    }
  }

  _drawCoords() {
    const ctx = this.ctx;
    const c = this.cell;
    ctx.fillStyle = 'rgba(230,210,175,0.75)';
    ctx.font = `${Math.max(9, c * 0.22)}px 'Segoe UI', sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let row = 0; row < 10; row++) {
      for (let col = 0; col < 10; col++) {
        if ((row + col) % 2 !== 1) continue;
        const sq = rcToSquare(row, col);
        if (col === (this.flipped ? 9 : 0)) {
          const [sr] = this._screenRC(row, col);
          ctx.textAlign = 'left';
          ctx.fillText(String(sq), 6, LABEL_MARGIN + sr * c + c / 2);
        }
        if (row === (this.flipped ? 0 : 9)) {
          const [, sc] = this._screenRC(row, col);
          ctx.textAlign = 'center';
          ctx.fillText(String(sq), LABEL_MARGIN + sc * c + c / 2, LABEL_MARGIN + this.size + 14);
        }
      }
    }
  }

  _drawHighlights() {
    const ctx = this.ctx;
    const c = this.cell;

    // Cases obligées de capturer : halo pulsant ambre
    const pulse = 0.5 + 0.5 * Math.sin(this._pulsePhase * Math.PI * 2);
    for (const sq of this.mandatorySquares) {
      const [row, col] = squareToRC(sq);
      const [cx, cy] = this._cellCenter(row, col);
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, c * 0.46, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(255,140,40,${0.55 + 0.35 * pulse})`;
      ctx.lineWidth = 3;
      ctx.shadowColor = 'rgba(255,140,40,0.8)';
      ctx.shadowBlur = 8 + 6 * pulse;
      ctx.stroke();
      ctx.restore();
    }

    // Cases d'arrivée possibles pour la pièce sélectionnée
    for (const sq of this.legalTargets) {
      const [row, col] = squareToRC(sq);
      const [cx, cy] = this._cellCenter(row, col);
      ctx.beginPath();
      ctx.arc(cx, cy, c * 0.14, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(120,220,180,0.55)';
      ctx.fill();
    }
  }

  _drawSelection() {
    const ctx = this.ctx;
    const c = this.cell;
    const [row, col] = squareToRC(this.selectedSquare);
    const [sr, sc] = this._screenRC(row, col);
    const x = LABEL_MARGIN + sc * c;
    const y = LABEL_MARGIN + sr * c;
    ctx.save();
    ctx.strokeStyle = '#ffd76a';
    ctx.lineWidth = 3;
    ctx.shadowColor = 'rgba(255,215,106,0.7)';
    ctx.shadowBlur = 10;
    ctx.strokeRect(x + 2, y + 2, c - 4, c - 4);
    ctx.restore();
  }

  _drawLastMoveArrow() {
    const squares = this.lastMove.squares;
    if (!squares || squares.length < 2) return;
    const points = squares.map((sq) => {
      const [row, col] = squareToRC(sq);
      return this._cellCenter(row, col);
    });
    drawMovePath(this.ctx, points, this.cell);
  }

  _drawPieces() {
    const ctx = this.ctx;
    const c = this.cell;
    const anim = this.animation;
    const renderPiece = (PIECE_STYLES[this.pieceStyle] || PIECE_STYLES[DEFAULT_PIECE_STYLE]).render;
    const skip = new Set();
    if (anim) {
      skip.add(anim.path[0]);
      for (const cp of anim.capturedPieces) skip.add(cp.square);
    }

    for (let sq = 1; sq <= 50; sq++) {
      if (skip.has(sq)) continue;
      const piece = this.board[sq];
      if (!piece) continue;
      const [row, col] = squareToRC(sq);
      const [cx, cy] = this._cellCenter(row, col);
      renderPiece(ctx, cx, cy, c * 0.4, piece);
    }

    if (anim) {
      const now = performance.now();
      const t = Math.min(1, (now - anim.start) / anim.duration);
      // Easing quadratique in-out (ARTEFACT_REFERENCE_DESIGN.md §2.4), à la place de
      // l'ease-out cubique précédent.
      const eased = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;

      // Pièces capturées : disparition nette au moment où le tracé passe par leur case
      // (pas de fondu progressif étalé sur tout le coup).
      const segmentsDone = anim.segment;
      anim.capturedPieces.forEach(({ square, piece: capturedPiece }, idx) => {
        const [row, col] = squareToRC(square);
        const [cx, cy] = this._cellCenter(row, col);
        let alpha;
        if (idx < segmentsDone) alpha = 0;
        else if (idx === segmentsDone) alpha = eased < 0.5 ? 1 : 0;
        else alpha = 1;
        if (alpha <= 0.01) return;
        renderPiece(ctx, cx, cy, c * 0.4, capturedPiece, { alpha });
      });

      const fromSq = anim.path[anim.segment];
      const toSq = anim.path[anim.segment + 1];
      const [fr, fc] = squareToRC(fromSq);
      const [tr, tc] = squareToRC(toSq);
      const [x1, y1] = this._cellCenter(fr, fc);
      const [x2, y2] = this._cellCenter(tr, tc);
      const x = x1 + (x2 - x1) * eased;
      const y = y1 + (y2 - y1) * eased;
      const bounce = 1 + Math.sin(eased * Math.PI) * 0.08;
      renderPiece(ctx, x, y, c * 0.4 * bounce, anim.piece);
    }
  }
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// Dessine le tracé du dernier coup : un simple segment pour un déplacement, ou une
// polyligne passant par chaque case d'atterrissage pour une prise multiple, avec une
// seule pointe de flèche à l'arrivée et un point plein à chaque étape intermédiaire.
// Style repris de l'artefact de référence (ARTEFACT_REFERENCE_DESIGN.md §2.3) : trait
// cyan fin et semi-transparent plutôt que le doré épais à liseré précédent.
function drawMovePath(ctx, points, cell) {
  if (!points || points.length < 2) return;
  const headLen = cell * 0.28;
  const lineWidth = cell * 0.1;
  // La pointe doit affleurer le bord du pion (rayon cell*0.4) sans jamais le dépasser :
  // contrainte gardée de l'implémentation précédente, l'artefact d'origine ne la gérait
  // pas (sa pointe visait le centre exact de la case, ce qui la faisait dépasser du pion).
  const pieceRadius = cell * 0.4;
  const tipInset = pieceRadius * 0.92;

  const last = points[points.length - 1];
  const beforeLast = points[points.length - 2];
  const angle = Math.atan2(last[1] - beforeLast[1], last[0] - beforeLast[0]);
  const tipX = last[0] - Math.cos(angle) * tipInset;
  const tipY = last[1] - Math.sin(angle) * tipInset;
  const shorten = headLen * 0.6;
  const ex = tipX - Math.cos(angle) * shorten;
  const ey = tipY - Math.sin(angle) * shorten;

  ctx.save();
  ctx.globalAlpha = 0.72;
  ctx.strokeStyle = '#5bc8ff';
  ctx.fillStyle = '#5bc8ff';
  ctx.lineWidth = lineWidth;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  ctx.beginPath();
  ctx.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length - 1; i++) ctx.lineTo(points[i][0], points[i][1]);
  ctx.lineTo(ex, ey);
  ctx.stroke();

  for (let i = 1; i < points.length - 1; i++) {
    ctx.beginPath();
    ctx.arc(points[i][0], points[i][1], cell * 0.06, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.beginPath();
  ctx.moveTo(tipX, tipY);
  ctx.lineTo(tipX - headLen * Math.cos(angle - 0.42), tipY - headLen * Math.sin(angle - 0.42));
  ctx.lineTo(tipX - headLen * Math.cos(angle + 0.42), tipY - headLen * Math.sin(angle + 0.42));
  ctx.closePath();
  ctx.fill();

  ctx.restore();
}

// Style "Classique" (plat) — repris de l'artefact de référence (voir
// ARTEFACT_REFERENCE_DESIGN.md §2.2) : disque uni avec ombre portée, liseré fin,
// couronne en glyphe unicode pour les dames. `piece` est { color: 'w'|'b', king: bool }
// (l'artefact utilisait un entier ; on garde le format objet déjà en place dans Damick).
function drawPieceClassique(ctx, cx, cy, r, piece, opts = {}) {
  const { alpha = 1, scale = 1 } = opts;
  const radius = r * scale;
  const isWhite = piece.color === 'w';

  ctx.save();
  ctx.globalAlpha = alpha;

  ctx.shadowColor = 'rgba(0,0,0,0.5)';
  ctx.shadowBlur = radius * 0.2;
  ctx.shadowOffsetX = radius * 0.1;
  ctx.shadowOffsetY = radius * 0.1;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fillStyle = isWhite ? '#ffffff' : '#111111';
  ctx.fill();

  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;
  ctx.strokeStyle = isWhite ? '#999999' : '#444444';
  ctx.lineWidth = Math.max(1, radius * 0.075);
  ctx.stroke();

  if (piece.king) {
    ctx.font = `bold ${Math.round(radius)}px serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = isWhite ? '#333333' : '#cccccc';
    ctx.fillText('♛', cx, cy + radius * 0.03);
  }

  ctx.restore();
}

// Style "Relief" — le rendu biseauté d'origine de Damick (gradient radial, anneau
// intérieur, ombre ellipsoïdale), conservé comme option plutôt que remplacé (retour
// Mickaël A1 : voir RETOURS_SESSION_2026-09-16.md).
function drawPieceRelief(ctx, cx, cy, r, piece, opts = {}) {
  const { alpha = 1, scale = 1 } = opts;
  const radius = r * scale;
  ctx.save();
  ctx.globalAlpha = alpha;

  // Ombre portée
  ctx.beginPath();
  ctx.ellipse(cx, cy + radius * 0.22, radius * 0.92, radius * 0.55, 0, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.fill();

  const isWhite = piece.color === 'w';
  const base = isWhite
    ? ['#faf3e2', '#ddc79a']
    : ['#3a3430', '#131110'];
  const rim = isWhite ? '#8a7550' : '#000000';

  const grad = ctx.createRadialGradient(cx - radius * 0.35, cy - radius * 0.4, radius * 0.1, cx, cy, radius);
  grad.addColorStop(0, base[0]);
  grad.addColorStop(1, base[1]);

  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.lineWidth = radius * 0.09;
  ctx.strokeStyle = rim;
  ctx.globalAlpha = alpha * 0.7;
  ctx.stroke();
  ctx.globalAlpha = alpha;

  // Anneau intérieur (relief)
  ctx.beginPath();
  ctx.arc(cx, cy, radius * 0.72, 0, Math.PI * 2);
  ctx.strokeStyle = isWhite ? 'rgba(140,115,75,0.55)' : 'rgba(255,255,255,0.12)';
  ctx.lineWidth = radius * 0.06;
  ctx.stroke();

  if (piece.king) {
    ctx.beginPath();
    ctx.arc(cx, cy, radius * 0.42, 0, Math.PI * 2);
    const kg = ctx.createRadialGradient(cx, cy - radius * 0.15, radius * 0.05, cx, cy, radius * 0.42);
    kg.addColorStop(0, '#ffe9a8');
    kg.addColorStop(1, '#c9962e');
    ctx.fillStyle = kg;
    ctx.fill();
    ctx.lineWidth = radius * 0.05;
    ctx.strokeStyle = '#8a6412';
    ctx.stroke();
  }

  ctx.restore();
}

// Style "Bois gravé" — pièces dorées/noires avec anneaux concentriques gravés (retour
// Mickaël A2). Palette et rayons d'anneaux repris de sa description (RETOURS_SESSION_
// 2026-09-16.md §A2) ; le code de l'artefact source n'étant pas disponible ici, ce rendu
// est une réimplémentation d'après cette description, pas un portage littéral.
function drawPieceWood(ctx, cx, cy, r, piece, opts = {}) {
  const { alpha = 1, scale = 1 } = opts;
  const radius = r * scale;
  const isWhite = piece.color === 'w';

  ctx.save();
  ctx.globalAlpha = alpha;

  // Ombre portée
  ctx.beginPath();
  ctx.ellipse(cx, cy + radius * 0.2, radius * 0.9, radius * 0.5, 0, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  ctx.fill();

  const stops = isWhite
    ? ['#ffffff', '#fefaea', '#f5e090', '#c89030', '#6a3a00']
    : ['#4a4a4a', '#333333', '#202020', '#101010', '#000000'];
  const grad = ctx.createRadialGradient(cx - radius * 0.3, cy - radius * 0.35, radius * 0.05, cx, cy, radius);
  stops.forEach((color, i) => grad.addColorStop(i / (stops.length - 1), color));

  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.lineWidth = Math.max(1, radius * 0.06);
  ctx.strokeStyle = isWhite ? '#6a3a00' : '#000000';
  ctx.stroke();

  // Anneaux gravés concentriques
  [0.83, 0.65, 0.47, 0.28].forEach((f) => {
    ctx.beginPath();
    ctx.arc(cx, cy, radius * f, 0, Math.PI * 2);
    ctx.strokeStyle = isWhite ? 'rgba(106,58,0,0.35)' : 'rgba(255,255,255,0.12)';
    ctx.lineWidth = Math.max(0.75, radius * 0.02);
    ctx.stroke();
  });

  if (piece.king) {
    ctx.font = `bold ${Math.round(radius * 0.9)}px serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = isWhite ? '#6a3a00' : '#d4af69';
    ctx.fillText('♛', cx, cy + radius * 0.03);
  }

  ctx.restore();
}
