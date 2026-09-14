import {
  DraughtsGame, WHITE, BLACK, countPieces, computeTempoDifferential, hasAnyKing,
} from './engine/rules.js';
import { BoardRenderer } from './render/board.js';

const game = new DraughtsGame();
const canvas = document.getElementById('board-canvas');
const renderer = new BoardRenderer(canvas);

// --- état d'interaction -----------------------------------------------------
let selectedSquare = null;
let isAnimating = false;
let autoplayTimer = null;
let isPlaying = false;

// --- éléments DOM -------------------------------------------------------------
const el = {
  countWhite: document.querySelector('#count-white .count-value'),
  countBlack: document.querySelector('#count-black .count-value'),
  tempoPanel: document.getElementById('tempo-panel'),
  tempoValue: document.getElementById('tempo-value'),
  tempoBarFill: document.getElementById('tempo-bar-fill'),
  tempoCaption: document.getElementById('tempo-caption'),
  statusLine: document.getElementById('status-line'),
  moveList: document.getElementById('move-list'),
  btnFirst: document.getElementById('btn-first'),
  btnPrev: document.getElementById('btn-prev'),
  btnPlay: document.getElementById('btn-play'),
  btnNext: document.getElementById('btn-next'),
  btnLast: document.getElementById('btn-last'),
  btnUndo: document.getElementById('btn-undo'),
  btnRedo: document.getElementById('btn-redo'),
  btnFlip: document.getElementById('btn-flip'),
  btnFullscreen: document.getElementById('btn-fullscreen'),
  speedSelect: document.getElementById('speed-select'),
  easterEgg: document.getElementById('easter-egg'),
};

renderer.animSpeedMs = Number(el.speedSelect.value);

// --- notation d'un coup --------------------------------------------------------
function moveNotation(moveInfo) {
  if (moveInfo.type === 'simple') return `${moveInfo.from}-${moveInfo.to}`;
  return [moveInfo.from, ...moveInfo.path].join('x');
}

// --- rendu global de l'UI ------------------------------------------------------
function refreshUI() {
  const counts = countPieces(game.board);
  el.countWhite.textContent = String(counts.white);
  el.countBlack.textContent = String(counts.black);

  const kingPresent = hasAnyKing(game.board);
  if (kingPresent) {
    el.tempoPanel.classList.add('disabled');
    el.tempoValue.textContent = '—';
    el.tempoCaption.textContent = 'Désactivé (dame présente)';
  } else {
    el.tempoPanel.classList.remove('disabled');
    const diff = computeTempoDifferential(game.board, game.sideToMove);
    el.tempoValue.textContent = diff > 0 ? `+${diff}` : String(diff);
    const pct = Math.max(0, Math.min(100, 50 + diff * 4));
    el.tempoBarFill.style.width = `${pct}%`;
    el.tempoCaption.textContent = diff === 0
      ? 'Blancs et Noirs à égalité'
      : diff > 0
        ? `Blancs : +${diff} temps d'avance`
        : `Noirs : +${-diff} temps d'avance`;
  }

  const gameOver = game.isGameOver();
  if (gameOver) {
    const w = game.winner();
    el.statusLine.textContent = w === WHITE ? 'Les Blancs gagnent — plus aucun coup possible pour les Noirs' : 'Les Noirs gagnent — plus aucun coup possible pour les Blancs';
  } else {
    const { mustCapture } = game.legalMoves;
    el.statusLine.textContent = `Trait aux ${game.sideToMove === WHITE ? 'Blancs' : 'Noirs'}${mustCapture ? ' — prise obligatoire' : ''}`;
  }

  renderMoveList();
  updateNavButtons();
  renderBoardState();
}

function renderBoardState() {
  const { mustCapture, captures } = game.legalMoves;
  let legalTargets = [];
  const mandatorySquares = mustCapture ? game.mandatorySquares : new Set();
  if (selectedSquare != null) {
    if (mustCapture) {
      legalTargets = captures.filter(seq => seq[0].from === selectedSquare).map(seq => seq[0].to);
    } else {
      legalTargets = game.legalMoves.simples.filter(m => m.from === selectedSquare).map(m => m.to);
    }
  }
  const lastEntry = game.history[game.history.length - 1];
  const lastMove = lastEntry ? { from: lastEntry.move.from, to: lastEntry.move.to } : null;

  renderer.setState({
    board: game.board,
    selectedSquare,
    legalTargets,
    mandatorySquares,
    lastMove,
  });
}

function renderMoveList() {
  el.moveList.innerHTML = '';
  const plies = game.history.map((h, i) => ({ idx: i, move: h.move, color: h.sideToMove }));
  for (let i = 0; i < plies.length; i += 2) {
    const row = document.createElement('li');
    row.className = 'move-row';
    const num = document.createElement('span');
    num.className = 'move-num';
    num.textContent = `${i / 2 + 1}.`;
    row.appendChild(num);

    const whitePly = plies[i];
    const blackPly = plies[i + 1];
    row.appendChild(makePlySpan(whitePly));
    row.appendChild(blackPly ? makePlySpan(blackPly) : emptyPly());
    el.moveList.appendChild(row);
  }
  const current = el.moveList.querySelector('.move-ply.current');
  if (current) current.scrollIntoView({ block: 'nearest' });
}

function makePlySpan(ply) {
  const span = document.createElement('span');
  span.className = 'move-ply';
  span.textContent = moveNotation(ply.move);
  if (ply.idx === game.history.length - 1) span.classList.add('current');
  span.addEventListener('click', () => jumpToPly(ply.idx));
  return span;
}
function emptyPly() {
  const span = document.createElement('span');
  span.className = 'move-ply empty';
  span.textContent = '–';
  return span;
}

function jumpToPly(targetIdx) {
  // targetIdx = index du dernier coup joué que l'on veut voir affiché
  const currentIdx = game.history.length - 1;
  if (targetIdx === currentIdx) return;
  let guard = 200;
  while (game.history.length - 1 > targetIdx && guard-- > 0) game.undo();
  while (game.history.length - 1 < targetIdx && guard-- > 0) game.redo();
  selectedSquare = null;
  refreshUI();
}

function updateNavButtons() {
  el.btnUndo.disabled = game.history.length === 0;
  el.btnRedo.disabled = game.future.length === 0;
  el.btnPrev.disabled = game.history.length === 0;
  el.btnNext.disabled = game.future.length === 0;
  el.btnFirst.disabled = game.history.length === 0;
  el.btnLast.disabled = game.future.length === 0;
}

// --- interaction plateau : clic / sélection / coup unique ----------------------
canvas.addEventListener('click', async (e) => {
  if (isAnimating || game.isGameOver()) return;
  const rect = canvas.getBoundingClientRect();
  const x = (e.clientX - rect.left);
  const y = (e.clientY - rect.top);
  const scaleX = canvas.width / renderer.dpr / rect.width;
  const scaleY = canvas.height / renderer.dpr / rect.height;
  const sq = renderer.squareAtPoint(x * scaleX, y * scaleY);
  if (sq == null) return;

  const { mustCapture, captures, simples } = game.legalMoves;
  const piece = game.board[sq];

  if (selectedSquare == null) {
    // "Coup unique" : si un seul coup légal amène sur la case cliquée, on le joue direct.
    const movesToSquare = mustCapture
      ? captures.filter(seq => seq[0].to === sq)
      : simples.filter(m => m.to === sq);
    if (movesToSquare.length === 1 && !(piece && piece.color === game.sideToMove)) {
      await playMove(mustCapture ? { type: 'capture', seq: movesToSquare[0] } : { type: 'simple', move: movesToSquare[0] });
      return;
    }
    if (piece && piece.color === game.sideToMove) {
      if (mustCapture && !game.mandatorySquares.has(sq)) return; // pièce sans prise possible
      selectedSquare = sq;
      renderBoardState();
    }
    return;
  }

  // Une pièce est déjà sélectionnée
  if (piece && piece.color === game.sideToMove) {
    if (mustCapture && !game.mandatorySquares.has(sq)) { selectedSquare = null; renderBoardState(); return; }
    selectedSquare = sq;
    renderBoardState();
    return;
  }

  if (mustCapture) {
    const seq = captures.find(s => s[0].from === selectedSquare && s[0].to === sq);
    if (seq) { await playMove({ type: 'capture', seq }); return; }
  } else {
    const mv = simples.find(m => m.from === selectedSquare && m.to === sq);
    if (mv) { await playMove({ type: 'simple', move: mv }); return; }
  }
  selectedSquare = null;
  renderBoardState();
});

async function playMove(action) {
  isAnimating = true;
  const from = action.type === 'capture' ? action.seq[0].from : action.move.from;
  const piece = game.board[from];
  const path = action.type === 'capture'
    ? [from, ...action.seq.map(s => s.to)]
    : [action.move.from, action.move.to];
  const capturedPieces = action.type === 'capture'
    ? action.seq.map(s => ({ square: s.capturedThisStep, piece: game.board[s.capturedThisStep] }))
    : [];

  selectedSquare = null;
  await renderer.animateMove({ path, piece, capturedPieces });

  if (action.type === 'capture') game.playCaptureSequence(action.seq);
  else game.playSimpleMove(action.move);

  isAnimating = false;
  refreshUI();

  if (isPlaying) scheduleAutoplayStep();
}

// --- undo / redo / navigation ---------------------------------------------------
el.btnUndo.addEventListener('click', () => { stopAutoplay(); game.undo(); selectedSquare = null; refreshUI(); });
el.btnRedo.addEventListener('click', () => { stopAutoplay(); game.redo(); selectedSquare = null; refreshUI(); });
el.btnPrev.addEventListener('click', () => { stopAutoplay(); game.undo(); selectedSquare = null; refreshUI(); });
el.btnNext.addEventListener('click', () => { stopAutoplay(); game.redo(); selectedSquare = null; refreshUI(); });
el.btnFirst.addEventListener('click', () => { stopAutoplay(); while (game.undo()) {} selectedSquare = null; refreshUI(); });
el.btnLast.addEventListener('click', () => { stopAutoplay(); while (game.redo()) {} selectedSquare = null; refreshUI(); });

el.btnPlay.addEventListener('click', () => { isPlaying ? stopAutoplay() : startAutoplay(); });

function startAutoplay() {
  if (game.future.length === 0) return;
  isPlaying = true;
  el.btnPlay.textContent = '⏸';
  scheduleAutoplayStep();
}
function stopAutoplay() {
  isPlaying = false;
  el.btnPlay.textContent = '▶';
  if (autoplayTimer) { clearTimeout(autoplayTimer); autoplayTimer = null; }
}
function scheduleAutoplayStep() {
  if (!isPlaying) return;
  if (game.future.length === 0) { stopAutoplay(); return; }
  autoplayTimer = setTimeout(() => {
    game.redo();
    refreshUI();
    if (game.future.length === 0) stopAutoplay();
    else scheduleAutoplayStep();
  }, Math.max(220, renderer.animSpeedMs + 260));
}

// --- vitesse d'animation ---------------------------------------------------------
el.speedSelect.addEventListener('change', () => {
  renderer.animSpeedMs = Number(el.speedSelect.value);
});

// --- flip / plein écran -----------------------------------------------------------
let flipped = false;
function toggleFlip() {
  flipped = !flipped;
  renderer.setFlipped(flipped);
}
el.btnFlip.addEventListener('click', toggleFlip);
el.btnFullscreen.addEventListener('click', () => {
  if (!document.fullscreenElement) document.getElementById('app').requestFullscreen?.();
  else document.exitFullscreen?.();
});

// --- raccourcis clavier -------------------------------------------------------------
window.addEventListener('keydown', (e) => {
  if (e.target && (e.target.isContentEditable || e.target.tagName === 'SELECT' || e.target.tagName === 'INPUT')) return;
  switch (e.key) {
    case 'ArrowLeft': e.preventDefault(); stopAutoplay(); game.undo(); selectedSquare = null; refreshUI(); break;
    case 'ArrowRight': e.preventDefault(); stopAutoplay(); game.redo(); selectedSquare = null; refreshUI(); break;
    case ' ': e.preventDefault(); isPlaying ? stopAutoplay() : startAutoplay(); break;
    case 'f': case 'F': toggleFlip(); break;
    default: break;
  }
});

// --- easter egg discret -------------------------------------------------------------
let eggClicks = 0;
el.easterEgg.addEventListener('click', () => {
  eggClicks += 1;
  if (eggClicks >= 5) {
    el.easterEgg.textContent = 'fait avec ♥ par Mick';
    el.easterEgg.style.color = 'var(--gold)';
    eggClicks = 0;
  }
});

// --- Service Worker (offline) ---------------------------------------------------------
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}

refreshUI();
