// DAMICK — Rendu Canvas du plateau (thème "bois", pièces avec relief, flèches, surbrillances)
import { squareToRC, rcToSquare } from '../engine/rules.js';

const LABEL_MARGIN = 26; // espace réservé aux numéros de case (hors damier)

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
    this.theme = 'walnut';
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

  // Anime le déplacement d'une pièce (et la disparition en fondu des pièces capturées).
  // path: liste de squares intermédiaires pour une capture multiple (from -> ...-> to)
  // capturedPieces: [{ square, piece }] — la pièce capturée au format {color,king}, nécessaire
  // pour le dessin en fondu car elle n'existe plus dans this.board au moment de l'animation.
  animateMove({ path, piece, capturedPieces = [] }) {
    return new Promise((resolve) => {
      if (this.animSpeedMs <= 0) { resolve(); return; }
      let settled = false;
      const settle = () => {
        if (settled) return;
        settled = true;
        resolve();
      };
      this.animation = {
        path,
        piece,
        capturedPieces,
        segment: 0,
        start: performance.now(),
        duration: this.animSpeedMs,
        resolve: settle,
      };
      // Filet de sécurité : si la boucle requestAnimationFrame est throttlée (onglet en
      // arrière-plan) l'animation peut ne jamais avancer ; on force la résolution après un
      // délai large pour ne jamais bloquer durablement les interactions.
      const maxWait = (path.length - 1) * this.animSpeedMs + 1500;
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
    for (let row = 0; row < 10; row++) {
      for (let col = 0; col < 10; col++) {
        const dark = (row + col) % 2 === 1;
        const [sr, sc] = this._screenRC(row, col);
        const x = LABEL_MARGIN + sc * c;
        const y = LABEL_MARGIN + sr * c;
        if (dark) {
          const g = ctx.createLinearGradient(x, y, x + c, y + c);
          g.addColorStop(0, '#7a4a28');
          g.addColorStop(1, '#5c3419');
          ctx.fillStyle = g;
        } else {
          const g = ctx.createLinearGradient(x, y, x + c, y + c);
          g.addColorStop(0, '#f1dfb8');
          g.addColorStop(1, '#e3caa0');
          ctx.fillStyle = g;
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
      drawPiece(ctx, cx, cy, c * 0.4, piece);
    }

    if (anim) {
      const now = performance.now();
      const t = Math.min(1, (now - anim.start) / anim.duration);
      const eased = 1 - Math.pow(1 - t, 3); // ease-out cubic

      // Pièces capturées : fondu progressif au fil des segments déjà franchis
      const segmentsDone = anim.segment;
      anim.capturedPieces.forEach(({ square, piece: capturedPiece }, idx) => {
        const [row, col] = squareToRC(square);
        const [cx, cy] = this._cellCenter(row, col);
        let alpha;
        if (idx < segmentsDone) alpha = 0;
        else if (idx === segmentsDone) alpha = 1 - eased;
        else alpha = 1;
        if (alpha <= 0.01) return;
        const scale = 1 - 0.35 * (idx <= segmentsDone ? eased : 0);
        drawPiece(ctx, cx, cy, c * 0.4, capturedPiece, { alpha, scale });
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
      drawPiece(ctx, x, y, c * 0.4 * bounce, anim.piece);
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
// seule pointe de flèche à l'arrivée et un petit jalon à chaque étape intermédiaire.
function drawMovePath(ctx, points, cell) {
  const headLen = cell * 0.2;
  const headWidth = cell * 0.13;
  const lineWidth = cell * 0.075;
  const outlineWidth = lineWidth + cell * 0.055;
  // La pièce a un rayon de cell*0.4 ; on fait pointer la flèche bien à l'intérieur de ce
  // disque pour que la pointe reste toujours masquée sous le pion, jamais visible devant.
  const pieceRadius = cell * 0.4;
  const tipInset = pieceRadius * 0.45;

  const last = points[points.length - 1];
  const beforeLast = points[points.length - 2];
  const endAngle = Math.atan2(last[1] - beforeLast[1], last[0] - beforeLast[0]);
  const tipX = last[0] - Math.cos(endAngle) * tipInset;
  const tipY = last[1] - Math.sin(endAngle) * tipInset;
  const shorten = headLen;
  const tipStopX = tipX - Math.cos(endAngle) * shorten;
  const tipStopY = tipY - Math.sin(endAngle) * shorten;

  const pathPoints = points.slice(0, -1).concat([[tipStopX, tipStopY]]);

  ctx.save();

  // Ombre douce sous tout le tracé, pour le détacher des cases claires comme sombres.
  ctx.shadowColor = 'rgba(0,0,0,0.45)';
  ctx.shadowBlur = cell * 0.06;
  ctx.shadowOffsetY = cell * 0.02;

  // Liseré sombre (contour) pour la lisibilité sur toutes les couleurs de case.
  ctx.strokeStyle = 'rgba(35,22,10,0.75)';
  ctx.lineWidth = outlineWidth;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  pathPoints.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
  ctx.stroke();

  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;

  // Corps du trait : dégradé doré, du départ vers l'arrivée.
  const grad = ctx.createLinearGradient(points[0][0], points[0][1], last[0], last[1]);
  grad.addColorStop(0, '#ffe9ad');
  grad.addColorStop(1, '#e8ab3c');
  ctx.strokeStyle = grad;
  ctx.lineWidth = lineWidth;
  ctx.beginPath();
  pathPoints.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
  ctx.stroke();

  // Jalons discrets sur chaque case de prise intermédiaire (ni départ ni arrivée).
  for (let i = 1; i < points.length - 1; i++) {
    const [x, y] = points[i];
    ctx.beginPath();
    ctx.arc(x, y, cell * 0.05, 0, Math.PI * 2);
    ctx.fillStyle = '#231609';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x, y, cell * 0.035, 0, Math.PI * 2);
    ctx.fillStyle = '#ffe9ad';
    ctx.fill();
  }

  // Pointe de flèche à l'arrivée (tirée en retrait via tipX/tipY, jamais au centre exact).
  const hx = tipX - Math.cos(endAngle) * headLen;
  const hy = tipY - Math.sin(endAngle) * headLen;
  const leftX = hx - Math.sin(endAngle) * headWidth;
  const leftY = hy + Math.cos(endAngle) * headWidth;
  const rightX = hx + Math.sin(endAngle) * headWidth;
  const rightY = hy - Math.cos(endAngle) * headWidth;

  ctx.beginPath();
  ctx.moveTo(tipX, tipY);
  ctx.lineTo(leftX, leftY);
  ctx.lineTo(rightX, rightY);
  ctx.closePath();
  ctx.strokeStyle = 'rgba(35,22,10,0.75)';
  ctx.lineWidth = cell * 0.03;
  ctx.lineJoin = 'round';
  ctx.stroke();
  ctx.fillStyle = '#f4c766';
  ctx.fill();

  ctx.restore();
}

export function drawPiece(ctx, cx, cy, r, piece, opts = {}) {
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
