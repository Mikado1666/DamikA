import {
  DraughtsGame, WHITE, BLACK, countPieces, computeTempoDifferential, hasAnyKing,
} from './engine/rules.js';
import { BoardRenderer } from './render/board.js';
import { parsePdn } from './pdn/parser.js';
import { loadGameFromPdn } from './pdn/loader.js';
import { serializeToPdn, serializeToTxt } from './pdn/serializer.js';

let game = new DraughtsGame();
const canvas = document.getElementById('board-canvas');
const renderer = new BoardRenderer(canvas);

// --- état d'interaction -----------------------------------------------------
let selectedSquare = null;
let isAnimating = false;
let autoplayTimer = null;
let isPlaying = false;

// --- état de partie / bibliothèque -------------------------------------------
let headers = { Event: 'Partie libre' };
let library = []; // parties parsées disponibles (import multi-parties)
let libraryActiveIndex = -1;

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
  fileInput: document.getElementById('pdn-file-input'),
  btnImport: document.getElementById('btn-import'),
  btnPaste: document.getElementById('btn-paste'),
  btnCopy: document.getElementById('btn-copy'),
  exportDropdown: document.getElementById('export-dropdown'),
  btnExport: document.getElementById('btn-export'),
  exportMenu: document.getElementById('export-menu'),
  btnExportPdn: document.getElementById('btn-export-pdn'),
  btnExportTxt: document.getElementById('btn-export-txt'),
  tabMoves: document.getElementById('tab-moves'),
  tabLibrary: document.getElementById('tab-library'),
  panelMoves: document.getElementById('panel-moves'),
  panelLibrary: document.getElementById('panel-library'),
  libraryList: document.getElementById('library-list'),
  libraryEmpty: document.getElementById('library-empty'),
  libraryCount: document.getElementById('library-count'),
  toast: document.getElementById('toast'),
  dropzoneOverlay: document.getElementById('dropzone-overlay'),
};

renderer.animSpeedMs = Number(el.speedSelect.value);

// --- notation d'un coup --------------------------------------------------------
function moveNotation(moveInfo) {
  if (moveInfo.type === 'simple') return `${moveInfo.from}-${moveInfo.to}`;
  return [moveInfo.from, ...moveInfo.path].join('x');
}

// Liste complète des coups de la partie (déjà joués + à venir via redo), dans l'ordre
// chronologique — indépendante de la position de navigation actuelle.
function fullMoveList(g) {
  return [...g.history.map((h) => h.move), ...[...g.future].reverse().map((f) => f.move)];
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
  const moves = fullMoveList(game);
  const currentIdx = game.history.length - 1;
  for (let i = 0; i < moves.length; i += 2) {
    const row = document.createElement('li');
    row.className = 'move-row';
    const num = document.createElement('span');
    num.className = 'move-num';
    num.textContent = `${i / 2 + 1}.`;
    row.appendChild(num);

    row.appendChild(makePlySpan(moves[i], i, currentIdx));
    row.appendChild(moves[i + 1] ? makePlySpan(moves[i + 1], i + 1, currentIdx) : emptyPly());
    el.moveList.appendChild(row);
  }
  const current = el.moveList.querySelector('.move-ply.current');
  if (current) current.scrollIntoView({ block: 'nearest' });
}

function makePlySpan(moveInfo, idx, currentIdx) {
  const span = document.createElement('span');
  span.className = 'move-ply';
  span.textContent = moveNotation(moveInfo);
  if (idx === currentIdx) span.classList.add('current');
  span.addEventListener('click', () => jumpToPly(idx));
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
  stopAutoplay();
  const currentIdx = game.history.length - 1;
  if (targetIdx === currentIdx) return;
  let guard = 4000;
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
  if (rect.width === 0 || rect.height === 0) return;
  const xFrac = (e.clientX - rect.left) / rect.width;
  const yFrac = (e.clientY - rect.top) / rect.height;
  const sq = renderer.squareAtFraction(xFrac, yFrac);
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

// --- toast (notifications discrètes) -------------------------------------------------
let toastTimer = null;
function showToast(message, kind = 'info') {
  el.toast.textContent = message;
  el.toast.className = `toast${kind === 'error' ? ' toast-error' : kind === 'success' ? ' toast-success' : ''}`;
  el.toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.toast.hidden = true; }, 4500);
}

// --- en-têtes de partie (bandeau meta + bandeaux joueurs) ----------------------------
function syncHeaderFieldsFromState() {
  const chipDefaults = { Event: 'Partie libre', Site: '—', Date: '—', Round: '—' };
  document.querySelectorAll('.meta-chip[data-field]').forEach((elm) => {
    const key = elm.dataset.field;
    elm.textContent = headers[key] || chipDefaults[key] || '—';
  });
  const whiteName = document.querySelector('.player-name[data-field="White"]');
  const blackName = document.querySelector('.player-name[data-field="Black"]');
  if (whiteName) whiteName.textContent = headers.White || 'Joueur Blancs';
  if (blackName) blackName.textContent = headers.Black || 'Joueur Noirs';
  const whiteElo = document.querySelector('.meta-field[data-field="WhiteElo"]');
  const blackElo = document.querySelector('.meta-field[data-field="BlackElo"]');
  if (whiteElo) whiteElo.textContent = headers.WhiteElo ? `Elo ${headers.WhiteElo}` : 'Elo —';
  if (blackElo) blackElo.textContent = headers.BlackElo ? `Elo ${headers.BlackElo}` : 'Elo —';
  const whiteTitle = document.querySelector('.meta-field[data-field="WhiteTitle"]');
  const blackTitle = document.querySelector('.meta-field[data-field="BlackTitle"]');
  if (whiteTitle) whiteTitle.textContent = headers.WhiteTitle || '—';
  if (blackTitle) blackTitle.textContent = headers.BlackTitle || '—';
  const whiteScore = document.querySelector('.stat-value[data-field="WhiteScore"]');
  const blackScore = document.querySelector('.stat-value[data-field="BlackScore"]');
  if (whiteScore) whiteScore.textContent = headers.WhiteScore || '—';
  if (blackScore) blackScore.textContent = headers.BlackScore || '—';
}

document.querySelectorAll('.meta-chip[data-field], .player-name[data-field], .meta-field[data-field], .stat-value[data-field]').forEach((elm) => {
  elm.addEventListener('blur', () => {
    const key = elm.dataset.field;
    let val = elm.textContent.trim();
    if (key.endsWith('Elo') && /^Elo\s/.test(val)) val = val.replace(/^Elo\s*/, '').trim();
    if (val && val !== '—') headers[key] = val;
    else delete headers[key];
    syncHeaderFieldsFromState();
  });
});

// --- bibliothèque (import multi-parties) ----------------------------------------------
function renderLibrary() {
  el.libraryList.innerHTML = '';
  el.libraryEmpty.hidden = library.length > 0;
  el.libraryCount.hidden = library.length === 0;
  el.libraryCount.textContent = String(library.length);
  library.forEach((entry, idx) => {
    const li = document.createElement('li');
    li.className = `library-item${idx === libraryActiveIndex ? ' active' : ''}`;
    const title = document.createElement('div');
    title.className = 'library-item-title';
    title.textContent = `${entry.headers.White || 'Blancs'} — ${entry.headers.Black || 'Noirs'}`;
    const meta = document.createElement('div');
    meta.className = 'library-item-meta';
    meta.textContent = [entry.headers.Event, `${entry.moves.length} coups`, entry.result]
      .filter(Boolean).join(' · ');
    li.append(title, meta);
    li.addEventListener('click', () => {
      libraryActiveIndex = idx;
      loadParsedGame(entry);
      renderLibrary();
    });
    el.libraryList.appendChild(li);
  });
}

function switchTab(tab) {
  el.tabMoves.classList.toggle('active', tab === 'moves');
  el.tabLibrary.classList.toggle('active', tab === 'library');
  el.panelMoves.hidden = tab !== 'moves';
  el.panelLibrary.hidden = tab !== 'library';
}
el.tabMoves.addEventListener('click', () => switchTab('moves'));
el.tabLibrary.addEventListener('click', () => switchTab('library'));

// --- chargement d'une partie parsée (PDN) ----------------------------------------------
function loadParsedGame(parsedGame) {
  stopAutoplay();
  const { game: newGame, headers: newHeaders, result, warnings, loadedMoves, totalMoves } = loadGameFromPdn(parsedGame);
  game = newGame;
  headers = { ...newHeaders, Result: result };
  selectedSquare = null;
  syncHeaderFieldsFromState();
  refreshUI();
  if (warnings.length) {
    showToast(`Import partiel : ${loadedMoves}/${totalMoves} coups chargés — ${warnings[0]}`, 'error');
  } else if (loadedMoves > 0) {
    showToast(`Partie importée (${loadedMoves} coup${loadedMoves > 1 ? 's' : ''}).`, 'success');
  }
}

async function importFiles(fileList) {
  const files = Array.from(fileList);
  let allGames = [];
  for (const file of files) {
    try {
      const text = await file.text();
      allGames = allGames.concat(parsePdn(text));
    } catch {
      showToast(`Impossible de lire le fichier "${file.name}".`, 'error');
    }
  }
  if (allGames.length === 0) {
    showToast('Aucune partie valide trouvée dans le fichier.', 'error');
    return;
  }
  library = allGames;
  libraryActiveIndex = 0;
  renderLibrary();
  loadParsedGame(allGames[0]);
  if (allGames.length > 1) switchTab('library');
}

el.btnImport.addEventListener('click', () => el.fileInput.click());
el.fileInput.addEventListener('change', () => {
  if (el.fileInput.files.length) importFiles(el.fileInput.files);
  el.fileInput.value = '';
});

// Glisser-déposer un fichier PDN sur l'appli
let dragCounter = 0;
window.addEventListener('dragenter', (e) => {
  if (!e.dataTransfer || !Array.from(e.dataTransfer.types).includes('Files')) return;
  e.preventDefault();
  dragCounter += 1;
  el.dropzoneOverlay.hidden = false;
});
window.addEventListener('dragover', (e) => {
  if (!e.dataTransfer || !Array.from(e.dataTransfer.types).includes('Files')) return;
  e.preventDefault();
});
window.addEventListener('dragleave', () => {
  dragCounter = Math.max(0, dragCounter - 1);
  if (dragCounter === 0) el.dropzoneOverlay.hidden = true;
});
window.addEventListener('drop', (e) => {
  if (e.dataTransfer && Array.from(e.dataTransfer.types).includes('Files')) e.preventDefault();
  dragCounter = 0;
  el.dropzoneOverlay.hidden = true;
  if (e.dataTransfer?.files?.length) importFiles(e.dataTransfer.files);
});

// --- copier / coller (presse-papier) ---------------------------------------------------
function currentGamePayload() {
  return { headers, moves: fullMoveList(game), result: headers.Result || '*' };
}

el.btnPaste.addEventListener('click', async () => {
  try {
    const text = await navigator.clipboard.readText();
    const games = parsePdn(text);
    if (games.length === 0) { showToast('Presse-papier : aucun PDN reconnu.', 'error'); return; }
    library = games;
    libraryActiveIndex = 0;
    renderLibrary();
    loadParsedGame(games[0]);
    if (games.length > 1) switchTab('library');
  } catch {
    showToast('Impossible de lire le presse-papier (autorisation refusée ?).', 'error');
  }
});

el.btnCopy.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(serializeToPdn(currentGamePayload()));
    showToast('Partie copiée dans le presse-papier (PDN).', 'success');
  } catch {
    showToast('Impossible de copier dans le presse-papier.', 'error');
  }
});

// --- export PDN / TXT --------------------------------------------------------------------
function downloadText(filename, content, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function safeFilename() {
  const w = (headers.White || 'Blancs').replace(/[^\w-]+/g, '_');
  const b = (headers.Black || 'Noirs').replace(/[^\w-]+/g, '_');
  return `${w}_vs_${b}`;
}

el.btnExport.addEventListener('click', () => { el.exportMenu.hidden = !el.exportMenu.hidden; });
window.addEventListener('click', (e) => {
  if (!el.exportDropdown.contains(e.target)) el.exportMenu.hidden = true;
});
el.btnExportPdn.addEventListener('click', () => {
  downloadText(`${safeFilename()}.pdn`, serializeToPdn(currentGamePayload()), 'application/x-pdn');
  el.exportMenu.hidden = true;
  showToast('Export PDN téléchargé.', 'success');
});
el.btnExportTxt.addEventListener('click', () => {
  downloadText(`${safeFilename()}.txt`, serializeToTxt(currentGamePayload()), 'text/plain');
  el.exportMenu.hidden = true;
  showToast('Export TXT téléchargé.', 'success');
});

syncHeaderFieldsFromState();

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
