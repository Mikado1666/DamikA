import {
  DraughtsGame, WHITE, BLACK, countPieces, computeTempoDifferential, hasAnyKing,
} from './engine/rules.js';
import { BoardRenderer, BOARD_THEMES, PIECE_STYLES } from './render/board.js';
import { parsePdn } from './pdn/parser.js';
import { loadGameFromPdn } from './pdn/loader.js';
import { serializeToPdn, serializeToTxt, serializeLibraryToPdn } from './pdn/serializer.js';
import { saveLibraryState, loadLibraryState } from './pdn/storage.js';

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
// true dès que `library` change sans passage par "Sauvegarder la bibliothèque" — sert de
// garde-fou avant toute action qui remplacerait la bibliothèque active (coller, ouvrir un
// fichier bibliothèque). Indépendant de la sauvegarde automatique localStorage plus bas :
// une bibliothèque peut être fidèlement restaurée après reload tout en restant "non
// sauvegardée dans un fichier".
let libraryDirty = false;

// --- registre photos joueurs (Bloc 1) ------------------------------------------------
// Table nom de joueur -> URL/dataURL de photo, indépendante de la partie/bibliothèque en
// cours : une fois une photo associée à un nom (upload ou URL Toernooibase), elle
// réapparaît automatiquement pour toute future partie référençant ce même nom, sans
// ressaisie (aucun identifiant Toernooibase disponible dans les PDN pour automatiser
// davantage — cf. CLAUDE.md). Clé = la valeur BRUTE de headers.White/Black (avec la
// virgule "Nom, Prénom" telle que le PDN l'encode), pas la version affichée sans virgule :
// c'est la chaîne stable qui revient à l'identique d'un import à l'autre pour un même
// joueur d'une même source.
// URL du Worker Cloudflare de recherche Toernooibase (bouton "Récupérer sur Toernooibase"
// du popover photo) — à mettre à jour ici après chaque redéploiement du Worker (voir
// worker/ et CLAUDE.md, section "Backend Toernooibase"). Le script Node
// (resolve-toernooibase-players.mjs + fetch-toernooibase-photos.mjs) reste le chemin de
// secours documenté si ce Worker devient indisponible.
const TOERNOOIBASE_WORKER_URL = 'https://damika-toernooibase-photos.shell-green.workers.dev';

const PLAYER_PHOTO_STORAGE_KEY = 'damika:player-photo-registry';
let playerPhotoRegistry = {};
try {
  playerPhotoRegistry = JSON.parse(localStorage.getItem(PLAYER_PHOTO_STORAGE_KEY)) || {};
} catch {
  playerPhotoRegistry = {};
}
function savePlayerPhotoRegistry() {
  try {
    localStorage.setItem(PLAYER_PHOTO_STORAGE_KEY, JSON.stringify(playerPhotoRegistry));
  } catch {
    // quota dépassé ou localStorage indisponible : la photo reste affichée pour la session
    // en cours, simplement pas persistée — pas un cas bloquant pour la fonctionnalité.
  }
}

// Pré-remplissage automatique (chantier scripts/fetch-toernooibase-photos.mjs) : table
// séparée, JAMAIS persistée dans playerPhotoRegistry ni dans son localStorage — rechargée
// intégralement depuis data/player-photos.json à chaque démarrage. La garder distincte du
// registre manuel évite un piège de fraîcheur : si elle était fusionnée une bonne fois dans
// playerPhotoRegistry (puis persistée), une future mise à jour du fichier JSON (le script
// relancé avec une meilleure photo, par ex.) resterait invisible indéfiniment, l'ancienne
// valeur déjà en localStorage bloquant silencieusement le remplacement. applyAvatar()
// consulte les deux tables et donne explicitement la priorité au choix manuel
// (playerPhotoRegistry) sur ce pré-remplissage — jamais l'inverse.
let playerPhotoPrefill = {};
async function loadPlayerPhotoPrefill() {
  try {
    const res = await fetch('data/player-photos.json');
    if (!res.ok) return;
    playerPhotoPrefill = await res.json();
  } catch {
    // Fichier absent (script jamais exécuté) ou JSON invalide : pas un cas bloquant, l'appli
    // fonctionne normalement avec uniquement les photos choisies manuellement.
  }
}

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
  brand: document.querySelector('.brand'),
  fileInput: document.getElementById('pdn-file-input'),
  btnNewGame: document.getElementById('btn-new-game'),
  confirmOverlay: document.getElementById('confirm-overlay'),
  confirmMessage: document.getElementById('confirm-message'),
  confirmOk: document.getElementById('confirm-ok'),
  confirmCancel: document.getElementById('confirm-cancel'),
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
  btnLibrarySave: document.getElementById('btn-library-save'),
  btnLibraryOpen: document.getElementById('btn-library-open'),
  btnLibraryAddCurrent: document.getElementById('btn-library-add-current'),
  commentPopover: document.getElementById('move-comment-popover'),
  commentTextarea: document.getElementById('move-comment-input'),
  commentCloseBtn: document.getElementById('move-comment-close'),
  libraryFileInput: document.getElementById('library-file-input'),
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
  photoPopover: document.getElementById('player-photo-popover'),
  photoPopoverTitle: document.getElementById('player-photo-popover-title'),
  photoFileInput: document.getElementById('player-photo-file-input'),
  photoChooseFileBtn: document.getElementById('player-photo-choose-file'),
  photoUrlInput: document.getElementById('player-photo-url-input'),
  photoUseUrlBtn: document.getElementById('player-photo-use-url'),
  photoFetchToernooibaseBtn: document.getElementById('player-photo-fetch-toernooibase'),
  photoRemoveBtn: document.getElementById('player-photo-remove'),
  photoCloseBtn: document.getElementById('player-photo-close'),
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
// Enrichit chaque moveInfo de son commentaire (`h.comment`, attaché à l'entrée
// history/future — voir DraughtsGame._commit dans rules.js) pour que l'affichage et la
// sérialisation PDN y aient accès sans repasser par game.getCommentAt(idx).
function fullMoveList(g) {
  return [
    ...g.history.map((h) => ({ ...h.move, comment: h.comment })),
    ...[...g.future].reverse().map((f) => ({ ...f.move, comment: f.comment })),
  ];
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
  // Un popover de commentaire ouvert pendant qu'un coup est joué/annulé ailleurs (rare,
  // mais possible) référence un index qui peut ne plus correspondre au même coup après la
  // mutation — on le referme en committant d'abord la saisie en cours, plutôt que de le
  // laisser flotter sur un état devenu incohérent.
  closeCommentPopover(true);

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
  scheduleSave();
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
  if (idx === currentIdx) span.classList.add('current');
  // Coup Noirs (2e colonne) : le lien de commentaire s'ancre à droite plutôt qu'à gauche
  // pour ne pas déborder du panneau — cf. .move-ply-black dans style.css.
  if (idx % 2 === 1) span.classList.add('move-ply-black');

  // Le texte du coup garde le clic "aller à ce coup" existant ; le commentaire (A3) a son
  // propre déclencheur séparé pour ne pas entrer en conflit avec ce clic.
  const hasComment = !!moveInfo.comment;

  const text = document.createElement('span');
  text.className = `move-ply-text${hasComment ? ' has-comment' : ''}`;
  text.textContent = moveNotation(moveInfo);
  text.addEventListener('click', () => jumpToPly(idx));
  span.appendChild(text);

  // Point plein doré : indicateur permanent (pas seulement au survol) qu'un commentaire
  // existe déjà — absent si pas de commentaire (retour Mickaël : rien de visible par défaut).
  if (hasComment) {
    const dot = document.createElement('button');
    dot.type = 'button';
    dot.className = 'move-comment-dot';
    dot.title = 'Voir/modifier le commentaire';
    dot.textContent = '●';
    dot.addEventListener('click', (e) => {
      e.stopPropagation();
      openCommentPopover(idx, dot);
    });
    span.appendChild(dot);
  }

  // Lien texte flottant, révélé uniquement au survol de la ligne (2e itération : un
  // pictogramme, même agrandi, restait moins lisible qu'un texte explicite — retour
  // Mickaël). "+ Ajouter…" sur un coup vierge, "Modifier…" sur un coup déjà commenté (le
  // point doré ci-dessus reste alors le seul indicateur visible au repos).
  const hint = document.createElement('button');
  hint.type = 'button';
  hint.className = 'move-comment-hint';
  hint.textContent = hasComment ? 'Modifier le commentaire' : '+ Ajouter un commentaire';
  hint.addEventListener('click', (e) => {
    e.stopPropagation();
    openCommentPopover(idx, hint);
  });
  span.appendChild(hint);

  return span;
}
function emptyPly() {
  const span = document.createElement('span');
  span.className = 'move-ply empty';
  span.textContent = '–';
  return span;
}

// --- commentaire de coup (A3) : popover flottant, pas de bloc permanent sous la liste ------
let commentPopoverIdx = null;

function openCommentPopover(idx, anchorEl) {
  commentPopoverIdx = idx;
  el.commentTextarea.value = game.getCommentAt(idx) || '';
  el.commentPopover.hidden = false;
  const rect = anchorEl.getBoundingClientRect();
  const popRect = el.commentPopover.getBoundingClientRect();
  let left = rect.left;
  let top = rect.bottom + 6;
  if (left + popRect.width > window.innerWidth - 8) left = window.innerWidth - popRect.width - 8;
  if (top + popRect.height > window.innerHeight - 8) top = rect.top - popRect.height - 6;
  el.commentPopover.style.left = `${Math.max(8, left)}px`;
  el.commentPopover.style.top = `${Math.max(8, top)}px`;
  el.commentTextarea.focus();
}

function closeCommentPopover(commit) {
  if (el.commentPopover.hidden) return;
  if (commit && commentPopoverIdx != null) {
    game.setCommentAt(commentPopoverIdx, el.commentTextarea.value.trim());
    scheduleSave();
    renderMoveList();
  }
  el.commentPopover.hidden = true;
  commentPopoverIdx = null;
}

el.commentTextarea.addEventListener('keydown', (e) => {
  // Ne jamais laisser les raccourcis clavier globaux (Espace = lecture auto, flèches =
  // undo/redo) intercepter la frappe dans ce champ — cause du bug historique de l'ancienne
  // zone de commentaire (Espace avalé, cf. commit f2def34/64d7e8b).
  e.stopPropagation();
  if (e.key === 'Escape') { e.preventDefault(); closeCommentPopover(false); }
});
el.commentTextarea.addEventListener('blur', () => closeCommentPopover(true));
el.commentCloseBtn.addEventListener('click', () => closeCommentPopover(true));

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
  // TEXTAREA inclus depuis le chantier A3 (commentaire de coup) : son absence ici avait déjà
  // causé un bug par le passé (Espace avalé par le raccourci lecture auto — historique
  // f2def34/64d7e8b) quand la zone de commentaire existait encore.
  if (e.target && (e.target.isContentEditable || e.target.tagName === 'SELECT' || e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
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

// Modale de confirmation (remplace window.confirm — cf. .confirm-overlay dans index.html)
// : Promise résolue à true/false selon le bouton cliqué.
function confirmModal(message, okLabel = 'Confirmer') {
  return new Promise((resolve) => {
    el.confirmMessage.textContent = message;
    el.confirmOk.textContent = okLabel;
    el.confirmOverlay.hidden = false;
    const cleanup = (result) => {
      el.confirmOverlay.hidden = true;
      el.confirmOk.removeEventListener('click', onOk);
      el.confirmCancel.removeEventListener('click', onCancel);
      resolve(result);
    };
    const onOk = () => cleanup(true);
    const onCancel = () => cleanup(false);
    el.confirmOk.addEventListener('click', onOk);
    el.confirmCancel.addEventListener('click', onCancel);
  });
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
  // PDN encode traditionnellement le nom "Nom, Prénom" (convention KNDB/Turbo Dambase, cf.
  // exemple `[White "Scholma, Auke"]`) — affichage sans la virgule pour un rendu plus
  // naturel dans la carte joueur, sans toucher à `headers.White/Black` : la valeur d'origine
  // reste inchangée pour l'export PDN.
  const formatPlayerName = (name) => name.replace(/,\s*/g, ' ');
  const whiteName = document.querySelector('.player-name[data-field="White"]');
  const blackName = document.querySelector('.player-name[data-field="Black"]');
  if (whiteName) whiteName.textContent = headers.White ? formatPlayerName(headers.White) : 'Joueur Blancs';
  if (blackName) blackName.textContent = headers.Black ? formatPlayerName(headers.Black) : 'Joueur Noirs';
  // "WhiteRating"/"BlackRating" est le tag standard PDN 3.0 pour l'Elo (spec FMJD, vérifié
  // via wiegerw.github.io/pdn/pdntags.html — cf. CLAUDE.md) et c'est ce qu'exportent les
  // fichiers Toernooibase bruts ; "WhiteElo"/"BlackElo" est la variante utilisée par
  // lidraughts. Les deux sont réellement rencontrées en pratique — on affiche la première
  // trouvée plutôt que de n'en connaître qu'une des deux.
  const whiteElo = document.querySelector('.meta-field[data-field="WhiteElo"]');
  const blackElo = document.querySelector('.meta-field[data-field="BlackElo"]');
  const whiteEloValue = headers.WhiteElo || headers.WhiteRating;
  const blackEloValue = headers.BlackElo || headers.BlackRating;
  if (whiteElo) whiteElo.textContent = whiteEloValue ? `Elo ${whiteEloValue}` : 'Elo —';
  if (blackElo) blackElo.textContent = blackEloValue ? `Elo ${blackEloValue}` : 'Elo —';
  const whiteTitle = document.querySelector('.meta-field[data-field="WhiteTitle"]');
  const blackTitle = document.querySelector('.meta-field[data-field="BlackTitle"]');
  if (whiteTitle) whiteTitle.textContent = headers.WhiteTitle || '—';
  if (blackTitle) blackTitle.textContent = headers.BlackTitle || '—';
  const whiteScore = document.querySelector('.stat-value[data-field="WhiteScore"]');
  const blackScore = document.querySelector('.stat-value[data-field="BlackScore"]');
  if (whiteScore) whiteScore.textContent = headers.WhiteScore || '—';
  if (blackScore) blackScore.textContent = headers.BlackScore || '—';
  // WhiteUrl/BlackUrl (photo officielle Toernooibase, quand le PDN les fournit) alimentent
  // le pré-remplissage AVANT d'afficher les avatars — au même niveau de priorité que
  // data/player-photos.json (playerPhotoPrefill), donc jamais au-dessus d'un choix manuel,
  // et sans écraser une entrée de pré-remplissage déjà connue pour ce nom.
  registerPhotoUrlFromHeaders(headers.White, headers.WhiteUrl);
  registerPhotoUrlFromHeaders(headers.Black, headers.BlackUrl);
  applyAvatar('white', headers.White);
  applyAvatar('black', headers.Black);
}

// Certains exports Toernooibase bruts fournissent l'URL de la photo directement dans le PDN
// (WhiteUrl/BlackUrl) mais avec un format cassé à la source — guillemets PDN absents (voir
// HEADER_LINE_RE dans parser.js) ET l'URL elle-même mal formée : il manque "://", les "/" et
// parfois le "." attendus, ex. "httptoernooibase.kndb.nlAfbeeldingenSpelers5032.jpg" au lieu
// de "https://toernooibase.kndb.nl/Afbeeldingen/Spelers/5032.jpg". On ne reconstruit QUE si
// ce motif précis (domaine + chemin connus, collés) est reconnu — une URL déjà bien formée
// (d'autres exports Toernooibase en fournissent, cf. CLAUDE.md) passe inchangée.
function fixMalformedToernooibaseUrl(rawUrl) {
  if (!rawUrl) return rawUrl;
  const match = rawUrl.match(/toernooibase\.kndb\.nl\/?Afbeeldingen\/?Spelers\/?(\d+)\.jpg/i);
  if (!match) return rawUrl;
  return `https://toernooibase.kndb.nl/Afbeeldingen/Spelers/${match[1]}.jpg`;
}

function registerPhotoUrlFromHeaders(rawName, rawUrl) {
  const name = rawName ? rawName.trim() : '';
  if (!name || !rawUrl) return;
  if (playerPhotoPrefill[name]) return; // déjà connu (data/player-photos.json ou un import précédent) — on ne remplace pas
  const url = fixMalformedToernooibaseUrl(rawUrl.trim());
  if (/^https?:\/\//i.test(url)) playerPhotoPrefill[name] = url;
}

// Affiche la photo mémorisée pour ce nom de joueur (registre localStorage) si elle existe,
// sinon revient à l'avatar lettré par défaut. `onerror` sur l'`<img>` couvre le cas d'une
// URL externe devenue injoignable (Toernooibase indisponible, image déplacée) : retombe
// silencieusement sur la lettre plutôt que d'afficher une image cassée.
// Découpe un nom en mots normalisés (minuscules, virgule traitée comme un espace) — sert de
// base à la correspondance tolérante ci-dessous : "Callegari, Mickael", "Mickael Callegari"
// et "CALLEGARI   Mickael" doivent tous se reconnaître comme le même joueur.
function nameTokens(name) {
  return name.replace(/,/g, ' ').trim().toLowerCase().split(/\s+/).filter(Boolean);
}

// Nom de famille supposé d'une clé de registre : la partie avant la virgule si elle existe
// (convention PDN "Nom, Prénom" déjà utilisée partout dans l'app), sinon le dernier mot
// (repli "Prénom Nom" — imparfait pour un nom de famille à plusieurs mots, mais suffisant
// pour le cas visé : retrouver un joueur à partir de son seul nom de famille).
function surnameOf(key) {
  if (key.includes(',')) return key.split(',')[0].trim().toLowerCase();
  const words = key.trim().split(/\s+/);
  return words[words.length - 1].toLowerCase();
}

// Cherche une correspondance dans UNE table (registre manuel OU pré-remplissage, jamais les
// deux mélangées — voir lookupPhotoUrl) :
//  1. correspondance exacte tolérante (casse/espaces/virgule/ordre des mots ignorés) ;
//  2. à défaut, si le nom tapé est un seul mot (ex. juste le nom de famille), on le compare
//     au nom de famille de chaque entrée. Si toutes les entrées qui correspondent pointent
//     vers la MÊME photo, on la prend ; si elles pointent vers des photos différentes
//     (plusieurs joueurs distincts portant ce nom de famille), on ne choisit pas — mieux
//     vaut l'avatar par défaut qu'un risque de photo de la mauvaise personne.
function lookupInTable(table, typedTokens, typedNorm) {
  for (const key of Object.keys(table)) {
    const keyNorm = [...nameTokens(key)].sort().join(' ');
    if (keyNorm === typedNorm) return { url: table[key], ambiguous: false };
  }
  if (typedTokens.length === 1) {
    const surname = typedTokens[0];
    const candidates = new Set();
    for (const key of Object.keys(table)) {
      if (surnameOf(key) === surname) candidates.add(table[key]);
    }
    if (candidates.size === 1) return { url: [...candidates][0], ambiguous: false };
    if (candidates.size > 1) return { url: null, ambiguous: true };
  }
  return { url: null, ambiguous: false };
}

// Le registre manuel est vérifié EN ENTIER (exact puis nom de famille) avant même de
// regarder le pré-remplissage : une ambiguïté côté manuel ne doit jamais se rabattre
// silencieusement sur une photo pré-remplie potentiellement différente.
function lookupPhotoUrl(rawName) {
  if (!rawName) return null;
  const typedTokens = nameTokens(rawName);
  if (typedTokens.length === 0) return null;
  const typedNorm = [...typedTokens].sort().join(' ');

  const manual = lookupInTable(playerPhotoRegistry, typedTokens, typedNorm);
  if (manual.url) return manual.url;
  if (manual.ambiguous) return null;

  return lookupInTable(playerPhotoPrefill, typedTokens, typedNorm).url;
}

function applyAvatar(side, rawName) {
  const inner = document.querySelector(`.player-avatar-inner[data-side-avatar="${side}"]`);
  if (!inner) return;
  const letter = inner.querySelector('.avatar-letter');
  const img = inner.querySelector('.avatar-photo');
  // Priorité au choix manuel (playerPhotoRegistry, persisté) sur le pré-remplissage
  // automatique (playerPhotoPrefill, rechargé à chaque démarrage depuis
  // data/player-photos.json, jamais persisté lui-même — voir loadPlayerPhotoPrefill()).
  // Correspondance tolérante (casse/espaces/virgule/ordre + repli nom de famille seul avec
  // gestion des homonymes) — voir lookupPhotoUrl().
  const url = lookupPhotoUrl(rawName);
  if (!url) {
    img.hidden = true;
    img.removeAttribute('src');
    letter.hidden = false;
    return;
  }
  img.onload = () => { letter.hidden = true; img.hidden = false; };
  img.onerror = () => {
    img.hidden = true;
    letter.hidden = false;
    showToast('Photo introuvable, avatar par défaut utilisé.', 'error');
  };
  img.src = url;
}

// --- popover photo joueur (clic sur l'anneau d'avatar) ---------------------------------
let photoPopoverSide = null;

function currentPlayerName(side) {
  return (side === 'white' ? headers.White : headers.Black) || '';
}

function openPhotoPopover(side, anchorEl) {
  photoPopoverSide = side;
  const name = currentPlayerName(side);
  el.photoPopoverTitle.textContent = name
    ? `Photo de ${name.replace(/,\s*/g, ' ')}`
    : 'Photo du joueur';
  el.photoUrlInput.value = '';
  el.photoPopover.hidden = false;
  const rect = anchorEl.getBoundingClientRect();
  const popRect = el.photoPopover.getBoundingClientRect();
  let left = rect.left;
  let top = rect.bottom + 8;
  if (left + popRect.width > window.innerWidth - 8) left = window.innerWidth - popRect.width - 8;
  if (top + popRect.height > window.innerHeight - 8) top = rect.top - popRect.height - 8;
  el.photoPopover.style.left = `${Math.max(8, left)}px`;
  el.photoPopover.style.top = `${Math.max(8, top)}px`;
}

function closePhotoPopover() {
  el.photoPopover.hidden = true;
  photoPopoverSide = null;
}

document.querySelectorAll('.player-avatar-ring').forEach((ring) => {
  ring.addEventListener('click', () => openPhotoPopover(ring.dataset.sideRing, ring));
});

el.photoCloseBtn.addEventListener('click', closePhotoPopover);

el.photoRemoveBtn.addEventListener('click', () => {
  const name = currentPlayerName(photoPopoverSide).trim();
  if (name && playerPhotoRegistry[name]) {
    delete playerPhotoRegistry[name];
    savePlayerPhotoRegistry();
    applyAvatar(photoPopoverSide, name);
    showToast('Photo retirée.', 'success');
  }
  closePhotoPopover();
});

function setPlayerPhotoForPopover(url) {
  const name = currentPlayerName(photoPopoverSide).trim();
  if (!name) {
    showToast('Renseigne d’abord le nom du joueur avant d’ajouter une photo.', 'error');
    return;
  }
  playerPhotoRegistry[name] = url;
  savePlayerPhotoRegistry();
  applyAvatar(photoPopoverSide, name);
  closePhotoPopover();
}

el.photoChooseFileBtn.addEventListener('click', () => el.photoFileInput.click());
el.photoFileInput.addEventListener('change', async () => {
  const file = el.photoFileInput.files[0];
  el.photoFileInput.value = '';
  if (!file) return;
  try {
    const dataUrl = await compressImageFile(file);
    setPlayerPhotoForPopover(dataUrl);
    showToast('Photo enregistrée.', 'success');
  } catch {
    showToast('Impossible de lire cette image.', 'error');
  }
});

el.photoUseUrlBtn.addEventListener('click', () => {
  const url = el.photoUrlInput.value.trim();
  if (!/^https?:\/\//i.test(url)) {
    showToast('URL invalide (doit commencer par http:// ou https://).', 'error');
    return;
  }
  setPlayerPhotoForPopover(url);
  showToast('Photo enregistrée.', 'success');
});

el.photoFetchToernooibaseBtn.addEventListener('click', async () => {
  const name = currentPlayerName(photoPopoverSide).trim();
  if (!name) {
    showToast('Renseigne d’abord le nom du joueur avant de chercher sur Toernooibase.', 'error');
    return;
  }
  const btn = el.photoFetchToernooibaseBtn;
  const originalLabel = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Recherche...';
  try {
    const res = await fetch(`${TOERNOOIBASE_WORKER_URL}?name=${encodeURIComponent(name)}`);
    const data = await res.json();
    if (data.status === 'resolved' && data.photoUrl) {
      setPlayerPhotoForPopover(data.photoUrl);
      showToast(`Photo trouvée pour ${data.matchedName.replace(/,\s*/g, ' ')}.`, 'success');
    } else if (data.status === 'ambiguous') {
      const names = data.candidates.map((c) => c.name).join(', ');
      showToast(`Plusieurs joueurs correspondent (${names}) — colle l'URL manuellement.`, 'error');
    } else if (data.status === 'no_photo') {
      showToast('Joueur trouvé sur Toernooibase, mais sans photo sur sa fiche.', 'error');
    } else if (data.status === 'not_found') {
      showToast('Aucun joueur correspondant trouvé sur Toernooibase.', 'error');
    } else {
      showToast('Erreur du service de recherche Toernooibase.', 'error');
    }
  } catch {
    // Worker injoignable (panne, blocage réseau...) — le script Node
    // (resolve-toernooibase-players.mjs) reste l'alternative documentée dans CLAUDE.md.
    showToast('Service de recherche indisponible. Utilise l\'URL manuelle ou le script Node en secours.', 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = originalLabel;
  }
});

document.addEventListener('mousedown', (e) => {
  if (!el.photoPopover.hidden && !el.photoPopover.contains(e.target) && !e.target.closest('.player-avatar-ring')) {
    closePhotoPopover();
  }
});
document.addEventListener('keydown', (e) => {
  if (!el.photoPopover.hidden && e.key === 'Escape') closePhotoPopover();
});

// Redimensionne/recadre en carré et compresse en JPEG avant stockage — une photo uploadée
// telle quelle (souvent plusieurs Mo) grossirait vite localStorage ; à 160×160 qualité 0.8
// on reste de l'ordre de 15-30 Ko, négligeable face au quota (5-10 Mo). Ne s'applique qu'aux
// fichiers locaux : une image chargée depuis une URL externe (Toernooibase) ne peut pas être
// relue par <canvas> sans en-têtes CORS que ces sites ne fournissent pas (cf. CLAUDE.md) —
// elle est donc stockée telle quelle, sans compression, dans playerPhotoRegistry.
function compressImageFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        const size = 160;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        const scale = Math.max(size / img.width, size / img.height);
        const w = img.width * scale;
        const h = img.height * scale;
        ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
        resolve(canvas.toDataURL('image/jpeg', 0.8));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

document.querySelectorAll('.meta-chip[data-field], .player-name[data-field], .meta-field[data-field], .stat-value[data-field]').forEach((elm) => {
  elm.addEventListener('blur', () => {
    const key = elm.dataset.field;
    let val = elm.textContent.trim();
    if (key.endsWith('Elo') && /^Elo\s/.test(val)) val = val.replace(/^Elo\s*/, '').trim();
    // .player-name affiche "Nom, Prénom" sans la virgule (cf. syncHeaderFieldsFromState) —
    // si la valeur affichée correspond exactement à l'ancienne valeur juste reformatée
    // (aucune vraie modification, juste un focus/blur accidentel), on ne touche pas à
    // `headers` pour ne pas perdre définitivement la virgule d'origine utile à l'export PDN.
    const isUntouchedPlayerName = elm.classList.contains('player-name')
      && headers[key] && val === headers[key].replace(/,\s*/g, ' ');
    if (!isUntouchedPlayerName) {
      if (val && val !== '—') headers[key] = val;
      else delete headers[key];
    }
    syncHeaderFieldsFromState();
    syncActiveLibraryEntryHeaders();
    scheduleSave();
  });
});

// Répercute une édition des champs du Bloc 1 (nom de joueur, Elo, événement...) sur
// l'entrée de bibliothèque correspondante — sans ça, `library[libraryActiveIndex].headers`
// restait un instantané figé au moment du chargement de la partie, jamais mis à jour par
// ces éditions : le titre/sous-titre affichés dans l'onglet Bibliothèque ne bougeaient
// jamais (retour Mickaël). Un renommage manuel de l'entrée (double-clic, `headers.Label`,
// cf. startRenameLibraryEntry) est préservé — ce n'est pas un champ du Bloc 1, il n'existe
// que côté bibliothèque.
function syncActiveLibraryEntryHeaders() {
  if (libraryActiveIndex < 0 || !library[libraryActiveIndex]) return;
  const previousLabel = library[libraryActiveIndex].headers.Label;
  library[libraryActiveIndex].headers = { ...headers };
  if (previousLabel) library[libraryActiveIndex].headers.Label = previousLabel;
  libraryDirty = true;
  renderLibrary();
}

// --- persistance locale (localStorage) -------------------------------------------------
// Sauvegarde silencieuse en arrière-plan à chaque changement d'état (coup joué, undo/redo,
// import, édition d'en-tête...) — débattue via un court délai pour éviter d'écrire à
// chaque frame d'animation. `currentGamePayload` est déclaré plus bas (hoisting des
// déclarations `function`, disponible ici sans souci d'ordre).
let saveTimer = null;
function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveAppState, 400);
}
function saveAppState() {
  const pdnText = library.length > 0 ? serializeLibraryToPdn(library) : '';
  const currentGamePdn = serializeToPdn(currentGamePayload());
  saveLibraryState({ version: 1, pdnText, activeIndex: libraryActiveIndex, currentGamePdn, libraryDirty });
}

// Restauration au chargement : reconstruit la bibliothèque et la partie en cours à partir
// du dernier état sauvegardé, s'il existe. Un état corrompu (JSON invalide, PDN illisible)
// est ignoré silencieusement — on repart d'une appli vierge plutôt que de planter.
function restoreAppState() {
  const state = loadLibraryState();
  if (!state) return;
  try {
    if (state.pdnText) {
      const restoredLibrary = parsePdn(state.pdnText);
      if (restoredLibrary.length > 0) {
        library = restoredLibrary;
        libraryActiveIndex = Math.min(Math.max(state.activeIndex ?? 0, 0), library.length - 1);
      }
    }
    libraryDirty = !!state.libraryDirty;
    if (state.currentGamePdn) {
      const parsed = parsePdn(state.currentGamePdn);
      if (parsed.length > 0) {
        const { game: newGame, headers: newHeaders, result } = loadGameFromPdn(parsed[0]);
        game = newGame;
        headers = { ...newHeaders, Result: result };
      }
    }
    renderLibrary();
    syncHeaderFieldsFromState();
  } catch {
    // état stocké corrompu : ignoré, l'appli démarre vierge comme avant ce chantier.
  }
}

// --- bibliothèque (import multi-parties) ----------------------------------------------
// Titre affiché d'une entrée : `headers.Label` (renommage manuel, cf. startRenameLibraryEntry)
// s'il existe, sinon le nom des joueurs comme avant. `Label` est un en-tête PDN non standard
// mais serializeLibraryEntryToPdn écrit tous les en-têtes présents et parsePdn les relit
// tous génériquement — le renommage survit donc à Sauvegarder/Ouvrir/localStorage sans
// aucun changement de format.
function libraryEntryTitle(entry) {
  return entry.headers.Label || `${entry.headers.White || 'Blancs'} — ${entry.headers.Black || 'Noirs'}`;
}

function renderLibrary() {
  el.libraryList.innerHTML = '';
  el.libraryEmpty.hidden = library.length > 0;
  el.libraryCount.hidden = library.length === 0;
  el.libraryCount.textContent = String(library.length);
  library.forEach((entry, idx) => {
    const li = document.createElement('li');
    li.className = `library-item${idx === libraryActiveIndex ? ' active' : ''}`;

    const info = document.createElement('div');
    info.className = 'library-item-info';
    const title = document.createElement('div');
    title.className = 'library-item-title';
    title.textContent = libraryEntryTitle(entry);
    title.title = 'Double-cliquer pour renommer';
    title.addEventListener('dblclick', (e) => {
      e.preventDefault(); // évite la sélection de texte native sur double-clic
      e.stopPropagation();
      startRenameLibraryEntry(idx, title);
    });
    const meta = document.createElement('div');
    meta.className = 'library-item-meta';
    meta.textContent = [entry.headers.Event, `${entry.moves.length} coups`, entry.result]
      .filter(Boolean).join(' · ');
    info.append(title, meta);

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'library-item-delete';
    deleteBtn.title = 'Supprimer cette partie de la bibliothèque';
    deleteBtn.textContent = '✕';
    deleteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      deleteLibraryEntry(idx);
    });

    li.append(info, deleteBtn);
    // N'appelle PAS renderLibrary() ici : un clic simple est le premier des deux clics d'un
    // double-clic (rename, cf. startRenameLibraryEntry) — reconstruire toute la liste à ce
    // moment-là détruirait le nœud DOM du titre avant que le deuxième clic ne puisse s'y
    // accrocher, et le double-clic dégénère alors en simple sélection de texte native (bug
    // constaté en test). On se contente donc de basculer la classe .active à la main.
    li.addEventListener('click', () => {
      if (libraryActiveIndex === idx) return;
      libraryActiveIndex = idx;
      loadParsedGame(entry);
      el.libraryList.querySelectorAll('.library-item.active').forEach((n) => n.classList.remove('active'));
      li.classList.add('active');
    });
    el.libraryList.appendChild(li);
  });
}

// Renommage inline : remplace le titre par un champ texte le temps de l'édition. Stocké
// dans headers.Label (voir libraryEntryTitle) plutôt que dans une propriété JS annexe, pour
// que le nom survive à la sérialisation PDN (Sauvegarder/Ouvrir/persistance localStorage).
function startRenameLibraryEntry(idx, titleElm) {
  const entry = library[idx];
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'library-item-rename-input';
  input.value = libraryEntryTitle(entry);
  titleElm.replaceWith(input);
  input.focus();
  input.select();
  input.addEventListener('click', (e) => e.stopPropagation());
  const commit = () => {
    const val = input.value.trim();
    if (val) entry.headers.Label = val;
    else delete entry.headers.Label;
    libraryDirty = true;
    renderLibrary();
    scheduleSave();
  };
  input.addEventListener('blur', commit);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') input.blur();
    else if (e.key === 'Escape') { input.value = libraryEntryTitle(entry); input.blur(); }
  });
}

// Suppression : garde-fou confirmModal() (définitif, pas d'undo pour la bibliothèque comme
// il en existe un pour les coups). Si l'entrée supprimée était l'active, sélectionne l'entrée
// qui prend sa place dans la liste (celle qui suivait, ou la précédente si c'était la
// dernière) plutôt que de laisser affichée une partie qui n'est plus dans la bibliothèque ;
// si la bibliothèque devient vide, retombe sur une partie libre comme "Nouvelle partie".
async function deleteLibraryEntry(idx) {
  const entry = library[idx];
  const ok = await confirmModal(`Supprimer "${libraryEntryTitle(entry)}" de la bibliothèque ? Cette action est définitive.`, 'Supprimer');
  if (!ok) return;
  const wasActive = idx === libraryActiveIndex;
  library = library.filter((_, i) => i !== idx);
  if (library.length === 0) {
    libraryActiveIndex = -1;
  } else if (wasActive) {
    libraryActiveIndex = Math.min(idx, library.length - 1);
  } else if (idx < libraryActiveIndex) {
    libraryActiveIndex -= 1;
  }
  libraryDirty = true;
  renderLibrary();
  if (wasActive) {
    if (library.length > 0) {
      loadParsedGame(library[libraryActiveIndex]);
    } else {
      stopAutoplay();
      game = new DraughtsGame();
      headers = { Event: 'Partie libre' };
      selectedSquare = null;
      syncHeaderFieldsFromState();
      refreshUI();
    }
  }
  scheduleSave();
}

function switchTab(tab) {
  el.tabMoves.classList.toggle('active', tab === 'moves');
  el.tabLibrary.classList.toggle('active', tab === 'library');
  el.panelMoves.hidden = tab !== 'moves';
  el.panelLibrary.hidden = tab !== 'library';
}
el.tabMoves.addEventListener('click', () => switchTab('moves'));
el.tabLibrary.addEventListener('click', () => switchTab('library'));

// --- nouvelle partie (reset complet) ---------------------------------------------------
// Repart d'un DraughtsGame frais (position de départ standard) et remet les métadonnées
// à leur état de chargement initial — même logique que loadParsedGame() mais sans partie
// à charger. Confirmation si des coups ont déjà été joués (history OU future, pour couvrir
// le cas où on a navigué en arrière avant de cliquer) afin d'éviter une perte accidentelle.
async function startNewGame() {
  if (game.history.length > 0 || game.future.length > 0) {
    const ok = await confirmModal('Démarrer une nouvelle partie ? Les coups joués seront perdus.', 'Nouvelle partie');
    if (!ok) return;
  }
  stopAutoplay();
  game = new DraughtsGame();
  headers = { Event: 'Partie libre' };
  selectedSquare = null;
  // Sans ça, l'entrée de bibliothèque précédemment active restait marquée "active" (mise en
  // évidence dans l'onglet Bibliothèque) alors que le damier affiche maintenant une partie
  // libre sans rapport — et une édition ultérieure des champs du Bloc 1 aurait fini par
  // écraser cette entrée via syncActiveLibraryEntryHeaders() (retour Mickaël sur la
  // synchronisation Bloc 1 → Bibliothèque, cf. plus bas).
  libraryActiveIndex = -1;
  renderLibrary();
  syncHeaderFieldsFromState();
  refreshUI();
}
el.btnNewGame.addEventListener('click', startNewGame);
// Sur tout le logo (icône + wordmark), pas seulement le wordmark #easter-egg — convention
// UX "logo = retour à l'état initial". L'easter egg (5 clics sur le wordmark, plus bas)
// reste un écouteur séparé sur #easter-egg, indépendant de celui-ci.
el.brand.addEventListener('click', startNewGame);

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

// mode 'append' (bouton "Importer") : ajoute les parties du fichier à la bibliothèque
// active, sans y toucher sinon. mode 'replace' (bouton "Ouvrir une bibliothèque", cf.
// openLibraryFile ci-dessous) : remplace entièrement la bibliothèque active.
async function importFiles(fileList, { mode = 'append' } = {}) {
  const files = Array.from(fileList);
  let parsedGames = [];
  for (const file of files) {
    try {
      const text = await file.text();
      parsedGames = parsedGames.concat(parsePdn(text));
    } catch {
      showToast(`Impossible de lire le fichier "${file.name}".`, 'error');
    }
  }
  if (parsedGames.length === 0) {
    showToast('Aucune partie valide trouvée dans le fichier.', 'error');
    return;
  }
  if (mode === 'replace') {
    library = parsedGames;
    libraryActiveIndex = 0;
    libraryDirty = false; // vient d'être ouverte depuis un fichier, synchronisée avec le disque
    renderLibrary();
    loadParsedGame(library[0]);
    if (library.length > 1) switchTab('library');
  } else {
    library = library.concat(parsedGames);
    libraryDirty = true;
    // La dernière partie ajoutée devient l'entrée active — même règle que "Ajouter la
    // partie" : après un ajout, on affiche ce qui vient d'être ajouté plutôt que de laisser
    // l'ancienne partie affichée sans rapport avec ce qu'on vient d'importer.
    libraryActiveIndex = library.length - 1;
    renderLibrary();
    loadParsedGame(library[libraryActiveIndex]);
    if (library.length > 1) switchTab('library');
  }
  scheduleSave();
}

el.btnImport.addEventListener('click', () => el.fileInput.click());
el.fileInput.addEventListener('change', () => {
  if (el.fileInput.files.length) importFiles(el.fileInput.files);
  el.fileInput.value = '';
});

// --- ouverture d'un fichier bibliothèque (remplace la bibliothèque active) -------------
async function openLibraryFile(fileList) {
  if (libraryDirty && library.length > 0) {
    const ok = await confirmModal('Ouvrir une bibliothèque remplacera la bibliothèque active. Les changements non sauvegardés seront perdus.', 'Ouvrir');
    if (!ok) return;
  }
  await importFiles(fileList, { mode: 'replace' });
}

el.btnLibraryOpen.addEventListener('click', () => el.libraryFileInput.click());
el.libraryFileInput.addEventListener('change', async () => {
  if (el.libraryFileInput.files.length) await openLibraryFile(el.libraryFileInput.files);
  el.libraryFileInput.value = '';
});

// --- ajouter la partie actuellement affichée à la bibliothèque active -----------------
// Convertit la partie en cours au même format que les entrées issues de parsePdn()
// ({ headers, moves: [{notation}], result }) pour rester compatible avec renderLibrary()
// et serializeLibraryToPdn() — fullMoveList(game) renvoie des moveInfo structurés
// (from/to), pas des { notation }, d'où la conversion via moveNotation().
function currentGameAsLibraryEntry() {
  return {
    headers: { ...headers },
    moves: fullMoveList(game).map((m) => ({ notation: moveNotation(m), comment: m.comment || undefined })),
    result: headers.Result || '*',
  };
}

el.btnLibraryAddCurrent.addEventListener('click', () => {
  const entry = currentGameAsLibraryEntry();
  if (entry.moves.length === 0) {
    showToast('Partie vide, rien à ajouter.', 'error');
    return;
  }
  library = library.concat([entry]);
  libraryActiveIndex = library.length - 1;
  libraryDirty = true;
  renderLibrary();
  scheduleSave();
  showToast('Partie ajoutée à la bibliothèque.', 'success');
});

el.btnLibrarySave.addEventListener('click', () => {
  if (library.length === 0) {
    showToast('Bibliothèque vide, rien à sauvegarder.', 'error');
    return;
  }
  downloadText('bibliotheque.pdn', serializeLibraryToPdn(library), 'application/x-pdn');
  libraryDirty = false;
  scheduleSave();
  showToast('Bibliothèque sauvegardée.', 'success');
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

// Logique commune au bouton "Coller" et au raccourci Ctrl+V dans la zone "Coups joués"
// (cf. écouteur 'paste' sur el.moveList plus bas) : même garde-fou, même parsing, même
// comportement de chargement — pour que les deux entrées restent strictement synchronisées.
async function pastePdnText(text) {
  if (libraryDirty && library.length > 0) {
    const ok = await confirmModal('Coller une partie remplacera la bibliothèque active. Les changements non sauvegardés seront perdus.', 'Coller');
    if (!ok) return;
  }
  const games = parsePdn(text);
  if (games.length === 0) { showToast('Presse-papier : aucun PDN reconnu.', 'error'); return; }
  library = games;
  // La dernière partie collée devient l'entrée active — même règle que "Importer"/"Ajouter
  // la partie" (un collage remplace toute la bibliothèque, mais peut contenir plusieurs
  // parties d'un coup ; on affiche la dernière plutôt que la première par cohérence).
  libraryActiveIndex = games.length - 1;
  libraryDirty = true;
  renderLibrary();
  loadParsedGame(games[libraryActiveIndex]);
  if (games.length > 1) switchTab('library');
}

el.btnPaste.addEventListener('click', async () => {
  try {
    const text = await navigator.clipboard.readText();
    await pastePdnText(text);
  } catch {
    showToast('Impossible de lire le presse-papier (autorisation refusée ?).', 'error');
  }
});

// Raccourci Ctrl+V (inspiré de Turbo Dambase) : cliquer dans la zone "Coups joués" (rendue
// focusable via tabindex="0" dans index.html) puis coller charge directement un PDN, sans
// passer par le bouton dédié. On lit `clipboardData` de l'évènement natif plutôt que
// `navigator.clipboard.readText()` (utilisé par le bouton) : pas de permission Clipboard
// API à demander, et c'est la donnée que le navigateur vient déjà de nous fournir.
el.moveList.addEventListener('paste', (e) => {
  e.preventDefault();
  const text = e.clipboardData?.getData('text/plain') || '';
  pastePdnText(text);
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

// --- easter egg discret (déplacé du footer vers le nom "DAMIKA" du bandeau, A4) ------
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

restoreAppState();
refreshUI();
// Chargement asynchrone, non bloquant pour l'affichage initial — les avatars affichent la
// lettre par défaut le temps du fetch, puis basculent sur la photo pré-remplie si trouvée
// (et si aucun choix manuel n'existe déjà pour ce nom).
loadPlayerPhotoPrefill().then(() => {
  applyAvatar('white', headers.White);
  applyAvatar('black', headers.Black);
});
