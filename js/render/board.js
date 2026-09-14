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
    this.lastMove = null; // { from, to } ou { path: [...] }
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
    const ctx = this.ctx;
    const { from, to } = this.lastMove;
    if (from == null || to == null) return;
    const [fr, fc] = squareToRC(from);
    const [tr, tc] = squareToRC(to);
    const [x1, y1] = this._cellCenter(fr, fc);
    const [x2, y2] = this._cellCenter(tr, tc);
    drawArrow(ctx, x1, y1, x2, y2, this.cell * 0.14, 'rgba(255,235,150,0.85)');
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

function drawArrow(ctx, x1, y1, x2, y2, headSize, color) {
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const shorten = headSize * 1.4;
  const ex = x2 - Math.cos(angle) * shorten;
  const ey = y2 - Math.sin(angle) * shorten;

  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = headSize * 0.55;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(ex, ey);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(x2, y2);
  ctx.lineTo(ex - headSize * Math.cos(angle - Math.PI / 6), ey - headSize * Math.sin(angle - Math.PI / 6));
  ctx.lineTo(ex - headSize * Math.cos(angle + Math.PI / 6), ey - headSize * Math.sin(angle + Math.PI / 6));
  ctx.closePath();
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
