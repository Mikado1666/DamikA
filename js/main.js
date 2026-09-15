import {
  DraughtsGame, WHITE, BLACK, countPieces, computeTempoDifferential, hasAnyKing,
} from './engine/rules.js';
import { BoardRenderer, BOARD_THEMES, PIECE_STYLES } from './render/board.js';
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
  tempoDelta: document.getElementById('tempo-delta'),
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
  speedSlider: document.getElementById('speed-slider'),
  speedValue: document.getElementById('speed-value'),
  btnToggleArrow: document.getElementById('btn-toggle-arrow'),
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
  themeDropdown: document.getElementById('theme-dropdown'),
  btnTheme: document.getElementById('btn-theme'),
  themeMenu: document.getElementById('theme-menu'),
  boardThemeOptions: document.getElementById('board-theme-options'),
  pieceStyleOptions: document.getElementById('piece-style-options'),
  boardWrap: document.querySelector('.board-wrap'),
  playersRail: document.querySelector('.players-rail'),
  panelTabs: document.querySelector('.panel-tabs'),
  blackCard: document.querySelector('.player-card[data-side="black"]'),
  whiteCard: document.querySelector('.player-card[data-side="white"]'),
};

// --- notation d'un coup --------------------------------------------------------
function moveNotation(moveInfo) {
  if (moveInfo.type === 'simple') return `${moveInfo.from}-${moveInfo.to}`;
  // Notation FMJD : seules les cases de départ et d'arrivée sont notées pour une rafle,
  // pas les étapes intermédiaires (ex. 30x19x28 s'écrit 30x28).
  return `${moveInfo.from}x${moveInfo.to}`;
}

// Liste complète des coups de la partie (déjà joués + à venir via redo), dans l'ordre
// chronologique — indépendante de la position de navigation actuelle.
function fullMoveList(g) {
  return [...g.history.map((h) => h.move), ...[...g.future].reverse().map((f) => f.move)];
}

// Case d'arrivée RÉELLE d'une séquence de capture : `seq[0].to` n'est que le landing du
// PREMIER saut, pas la destination finale dès que la prise a plusieurs étapes (bug D2 —
// RETOURS_SESSION_2026-09-16.md : clic sans effet sur la vraie case d'arrivée quand deux
// séquences de même longueur partent de la même pièce vers des cases différentes).
function captureFinalTo(seq) {
  return seq[seq.length - 1].to;
}

// --- rendu global de l'UI ------------------------------------------------------
function refreshUI() {
  const counts = countPieces(game.board);
  el.countWhite.textContent = String(counts.white);
  el.countBlack.textContent = String(counts.black);

  // Compteur de temps (théorie des finales) : ligne compacte dans le rail joueurs,
  // juste +N/−N coloré, sans préfixe "Blancs"/"Noirs" (retour Mickaël A8).
  const kingPresent = hasAnyKing(game.board);
  el.tempoDelta.classList.remove('positive', 'negative', 'disabled');
  if (kingPresent) {
    el.tempoDelta.textContent = '—';
    el.tempoDelta.classList.add('disabled');
    el.tempoDelta.title = 'Compteur de temps désactivé (dame présente)';
  } else {
    const diff = computeTempoDifferential(game.board, game.sideToMove);
    el.tempoDelta.textContent = diff > 0 ? `+${diff}` : diff < 0 ? `−${-diff}` : '0';
    if (diff > 0) el.tempoDelta.classList.add('positive');
    else if (diff < 0) el.tempoDelta.classList.add('negative');
    el.tempoDelta.title = 'Compteur de temps (théorie des finales)';
  }

  const gameOver = game.isGameOver();
  if (gameOver) {
    const w = game.winner();
    el.statusLine.textContent = w === WHITE ? 'Les Blancs gagnent — plus aucun coup possible pour les Noirs' : 'Les Noirs gagnent — plus aucun coup possible pour les Blancs';
  } else {
    // Le halo pulsant sur les pièces concernées suffit déjà à signaler la prise
    // obligatoire (retour Mickaël A5) — plus besoin de le répéter dans le texte d'état.
    el.statusLine.textContent = `Trait aux ${game.sideToMove === WHITE ? 'Blancs' : 'Noirs'}`;
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
      legalTargets = captures.filter(seq => seq[0].from === selectedSquare).map(captureFinalTo);
    } else {
      legalTargets = game.legalMoves.simples.filter(m => m.from === selectedSquare).map(m => m.to);
    }
  }
  const lastEntry = game.history[game.history.length - 1];
  const lastMove = lastEntry
    ? { squares: lastEntry.move.type === 'capture' ? [lastEntry.move.from, ...lastEntry.move.path] : [lastEntry.move.from, lastEntry.move.to] }
    : null;

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
// Écoute 'pointerdown' plutôt que 'click' : le clic natif du navigateur n'est synthétisé
// que si mousedown et mouseup se résolvent sur le même élément sans le moindre aléa
// (constaté en test : un clic pourtant net sur le canvas peut ne produire AUCUN évènement
// 'click'). 'pointerdown' se déclenche dès l'appui, de façon fiable, souris comme tactile.
canvas.addEventListener('pointerdown', async (e) => {
  if (e.pointerType === 'mouse' && e.button !== 0) return; // ignorer clic droit/molette
  if (isAnimating || game.isGameOver()) return;
  const rect = canvas.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return;
  const xFrac = (e.clientX - rect.left) / rect.width;
  const yFrac = (e.clientY - rect.top) / rect.height;
  const sq = renderer.squareAtFraction(xFrac, yFrac);
  if (sq == null) return;

  const { mustCapture, captures, simples } = game.legalMoves;
  const piece = game.board[sq];

  // Coups légaux partant de la case cliquée (pour le "coup unique" au clic sur la pièce).
  const movesFromSquare = () => (mustCapture
    ? captures.filter(seq => seq[0].from === sq)
    : simples.filter(m => m.from === sq));

  if (selectedSquare == null) {
    // "Coup unique" : si un seul coup légal amène sur la case cliquée, on le joue direct.
    const movesToSquare = mustCapture
      ? captures.filter(seq => captureFinalTo(seq) === sq)
      : simples.filter(m => m.to === sq);
    if (movesToSquare.length === 1 && !(piece && piece.color === game.sideToMove)) {
      await playMove(mustCapture ? { type: 'capture', seq: movesToSquare[0] } : { type: 'simple', move: movesToSquare[0] });
      return;
    }
    if (piece && piece.color === game.sideToMove) {
      if (mustCapture && !game.mandatorySquares.has(sq)) return; // pièce sans prise possible
      // "Coup unique" côté départ : si cette pièce n'a qu'un seul coup possible, on le joue
      // directement au lieu d'exiger un second clic sur la destination.
      const ownMoves = movesFromSquare();
      if (ownMoves.length === 1) {
        await playMove(mustCapture ? { type: 'capture', seq: ownMoves[0] } : { type: 'simple', move: ownMoves[0] });
        return;
      }
      selectedSquare = sq;
      renderBoardState();
    }
    return;
  }

  // Une pièce est déjà sélectionnée
  if (piece && piece.color === game.sideToMove) {
    if (mustCapture && !game.mandatorySquares.has(sq)) { selectedSquare = null; renderBoardState(); return; }
    const ownMoves = movesFromSquare();
    if (ownMoves.length === 1) {
      await playMove(mustCapture ? { type: 'capture', seq: ownMoves[0] } : { type: 'simple', move: ownMoves[0] });
      return;
    }
    selectedSquare = sq;
    renderBoardState();
    return;
  }

  if (mustCapture) {
    const seq = captures.find(s => s[0].from === selectedSquare && captureFinalTo(s) === sq);
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
  autoplayTimer = setTimeout(async () => {
    // Ne pas démarrer un nouveau coup si l'utilisateur a arrêté la lecture pendant
    // la pause (mais un coup déjà entamé — voir plus bas — va jusqu'au bout une fois
    // son animation lancée, pour éviter qu'une pièce s'arrête visuellement à mi-chemin).
    if (!isPlaying || game.future.length === 0) return;
    // La pile `future` contient encore le coup à venir tel que joué à l'origine — on
    // l'anime AVANT de faire avancer l'état du moteur (`game.redo()`), exactement comme
    // le fait `playMove()` pour un coup joué à la souris. Auparavant cette boucle
    // appelait `game.redo()` puis `refreshUI()` directement, sans jamais passer par
    // `renderer.animateMove()` : la pièce sautait instantanément d'une case à l'autre en
    // lecture automatique, quelle que soit la vitesse choisie (retour Mickaël A6, bug
    // distinct découvert après validation du curseur).
    const moveInfo = game.future[game.future.length - 1].move;
    const path = moveInfo.type === 'capture'
      ? [moveInfo.from, ...moveInfo.path]
      : [moveInfo.from, moveInfo.to];
    const capturedPieces = moveInfo.type === 'capture'
      ? moveInfo.captured.map(sq => ({ square: sq, piece: game.board[sq] }))
      : [];
    isAnimating = true;
    await renderer.animateMove({ path, piece: moveInfo.piece, capturedPieces });
    isAnimating = false;
    game.redo();
    refreshUI();
    if (game.future.length === 0) stopAutoplay();
    else scheduleAutoplayStep();
  }, Math.max(220, renderer.animSpeedMs + 260));
}

// --- vitesse d'animation (curseur continu ×¼ → ×8, retour Mickaël A6) -----------------
// 6 paliers sur l'échelle 1-10 (palier ×½ ajouté entre ×¼ et ×1 après le premier test —
// retour Mickaël A6, 2e passe).
const SPEED_BASELINE_MS = 260; // durée à ×1, reprend l'ancien défaut "Rapide"
function speedFromSlider(v) {
  const multiplier = v <= 1 ? 0.25 : v <= 3 ? 0.5 : v <= 5 ? 1 : v <= 7 ? 2 : v <= 9 ? 4 : 8;
  const label = v <= 1 ? '×¼' : v <= 3 ? '×½' : v <= 5 ? '×1' : v <= 7 ? '×2' : v <= 9 ? '×4' : '×8';
  return { ms: Math.round(SPEED_BASELINE_MS / multiplier), label };
}
function applySpeedSlider() {
  const { ms, label } = speedFromSlider(Number(el.speedSlider.value));
  renderer.animSpeedMs = ms;
  el.speedValue.textContent = label;
}
el.speedSlider.addEventListener('input', applySpeedSlider);
applySpeedSlider();

// --- flèche du dernier coup (bouton toggle, retour Mickaël A7) -----------------------
el.btnToggleArrow.addEventListener('click', () => {
  renderer.showArrow = !renderer.showArrow;
  el.btnToggleArrow.classList.toggle('active', renderer.showArrow);
  renderer.render();
});
el.btnToggleArrow.classList.toggle('active', renderer.showArrow);

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
  // Libellés de secours pour le `title` : les champs s'enroulent maintenant au lieu
  // d'être tronqués (retour Mickaël A9), mais un très long texte (ex. une URL de Site)
  // profite quand même d'un `title` — le texte complet une fois rempli, sinon le nom
  // du champ.
  const chipLabels = { Event: 'Événement', Site: 'Lieu', Date: 'Date', Round: 'Ronde' };
  document.querySelectorAll('.meta-chip[data-field]').forEach((elm) => {
    const key = elm.dataset.field;
    const val = headers[key] || chipDefaults[key] || '—';
    elm.textContent = val;
    elm.title = val !== '—' ? val : chipLabels[key];
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

// --- thème du damier / style des pions ------------------------------------------------
function renderThemeOptions(container, entries, activeId, onPick) {
  container.innerHTML = '';
  Object.entries(entries).forEach(([id, def]) => {
    const btn = document.createElement('button');
    btn.className = `dropdown-item${id === activeId ? ' active' : ''}`;
    btn.textContent = def.label;
    btn.addEventListener('click', () => {
      onPick(id);
      el.themeMenu.hidden = true;
      renderThemeOptions(el.boardThemeOptions, BOARD_THEMES, renderer.boardTheme, (v) => renderer.setBoardTheme(v));
      renderThemeOptions(el.pieceStyleOptions, PIECE_STYLES, renderer.pieceStyle, (v) => renderer.setPieceStyle(v));
    });
    container.appendChild(btn);
  });
}
renderThemeOptions(el.boardThemeOptions, BOARD_THEMES, renderer.boardTheme, (v) => renderer.setBoardTheme(v));
renderThemeOptions(el.pieceStyleOptions, PIECE_STYLES, renderer.pieceStyle, (v) => renderer.setPieceStyle(v));

el.btnTheme.addEventListener('click', () => { el.themeMenu.hidden = !el.themeMenu.hidden; });
window.addEventListener('click', (e) => {
  if (!el.themeDropdown.contains(e.target)) el.themeMenu.hidden = true;
});

// --- alignement précis de la mise en page (retour Mickaël A10, priorité du jour) -------
// 3 exigences, calculées à partir des dimensions RÉELLEMENT RENDUES (getBoundingClientRect)
// plutôt que du CSS flexbox seul : le bloc 2a (damier) vit dans `.board-stage`, qui grandit
// (flex-grow) pour occuper tout l'espace vertical restant dans `.board-column`, et centre
// le canvas EN SON SEIN — la position du canvas dépend donc de tout l'espace que
// `.board-stage` a fini par occuper, pas seulement de sa propre taille. Un correctif CSS
// pur (justify-content, align-items…) sur ces conteneurs flex-grow entrerait en boucle de
// rétroaction avec le calcul de leur propre taille. On applique donc les 2 corrections
// verticales via `transform: translateY(...)`, qui ne participe pas au calcul de mise en
// page flex — aucune boucle, correction purement visuelle appliquée après coup.
function resetLayoutTransforms() {
  el.boardWrap.style.transform = '';
  el.playersRail.style.transform = '';
}

function alignLayout() {
  // On repart d'une position neutre avant de mesurer, sinon une correction précédente
  // fausserait la mesure suivante (dérive cumulative).
  resetLayoutTransforms();

  const canvasRect = canvas.getBoundingClientRect();
  const panelTabsRect = el.panelTabs.getBoundingClientRect();
  // Exigence 2 : le haut du CADRE DÉCORATIF (bloc 2a — retour Mickaël, même référence que
  // l'exigence 1 : le bord visuellement le plus évident du plateau, pas le canvas complet
  // ni le carré de cases seul) doit tomber exactement sur le haut du bloc 3. Le cadre est
  // inséré de `--frame-inset` par rapport au bord du canvas (posé par board.js, cf.
  // _drawFrame()) — sans ce décalage on alignait le bord du CANVAS (qui inclut une marge
  // vide de plus par-dessus le cadre) sur le bloc 3, ce qui plaçait le cadre visible trop
  // bas et ne semblait "pas appliqué" à l'écran malgré un delta calculé correctement.
  const frameInset = parseFloat(getComputedStyle(document.querySelector('.board-column')).getPropertyValue('--frame-inset')) || 0;
  const frameTop = canvasRect.top + frameInset;
  const deltaTop = panelTabsRect.top - frameTop;
  el.boardWrap.style.transform = `translateY(${deltaTop}px)`;

  // Exigence 3 : le milieu de l'écart entre les cartes Noirs/Blancs (bloc 1) doit tomber
  // exactement sur le centre vertical du damier. On remesure le canvas APRÈS avoir appliqué
  // la correction de l'exigence 2 ci-dessus, pour viser sa position finale réelle.
  const canvasRectAligned = canvas.getBoundingClientRect();
  const boardCenterY = canvasRectAligned.top + canvasRectAligned.height / 2;
  const blackRect = el.blackCard.getBoundingClientRect();
  const whiteRect = el.whiteCard.getBoundingClientRect();
  const gapMidY = (blackRect.bottom + whiteRect.top) / 2;
  const deltaRail = boardCenterY - gapMidY;
  el.playersRail.style.transform = `translateY(${deltaRail}px)`;
}

// Recalculé à chaque changement de taille du damier (redimensionnement de fenêtre) — même
// signal que celui qui pilote déjà `--frame-px` dans board.js — ainsi qu'à chaque
// changement de hauteur des cartes joueurs ou du bandeau d'onglets (ex. un nom de joueur
// qui passe sur 2 lignes).
const layoutResizeObserver = new ResizeObserver(() => alignLayout());
[canvas, el.blackCard, el.whiteCard, el.panelTabs].forEach((elm) => layoutResizeObserver.observe(elm));
// Filet de sécurité : le premier appel du ResizeObserver n'est pas garanti immédiat (et un
// simple redimensionnement de fenêtre n'implique pas toujours un changement de taille des
// éléments observés au pixel près) — un appel direct au chargement plus un écouteur sur
// l'évènement natif 'resize' couvrent les cas que le ResizeObserver seul pourrait manquer.
alignLayout();
window.addEventListener('resize', alignLayout);

syncHeaderFieldsFromState();

// --- easter egg discret (déplacé du footer vers le nom "DAMICK" du bandeau, A4) ------
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
// Désactivé tant que le chantier "liseuse PC" est en itération active : un Service Worker
// qui sert une version en cache a fait perdre du temps de debug à plusieurs reprises (le
// correctif était bien déployé côté serveur mais l'onglet continuait de charger l'ancien
// bundle mis en cache). On désenregistre activement tout SW déjà installé chez un visiteur
// précédent pour que ça se répare tout seul, sans manipulation DevTools de sa part.
// À réactiver (remettre navigator.serviceWorker.register('sw.js')) une fois la liseuse PC
// stabilisée et prête pour le support hors-ligne.
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then((regs) => {
    for (const reg of regs) reg.unregister();
  }).catch(() => {});
}

refreshUI();
