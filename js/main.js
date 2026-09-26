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

// --- sons -------------------------------------------------------------------------------
// move/capture/game-end : fichiers RÉELS du client Lidraughts (RoepStoep/lidraughts, thème
// "standard", public/sound/standard/{Move,Capture,Victory}.mp3), récupérés en clair depuis
// GitHub — voir assets/sounds/SOURCES.txt pour le détail exact (URLs, usage confirmé dans
// ui/round/src/ctrl.ts). game-start : PAS d'équivalent dans ce dépôt (vérifié), reste le
// fichier CC0 Kenney d'une session précédente (assets/sounds/LICENSE.txt).
// 4 événements (coup simple, capture, début/fin de partie), son distinct pour une prise —
// pas de Web Audio API ni de librairie : de simples <audio>, largement suffisant pour des
// sons courts joués rarement en simultané. Chaque événement a son propre pool de quelques
// instances plutôt qu'un <audio> unique réutilisé : rejouer un son déjà en cours (ex. 2 coups
// très rapprochés en autoplay rapide) sur le MÊME élément le coupe net au lieu de superposer
// les 2 lectures — un petit pool (round-robin) évite cet écrasement audible.
const SOUND_FILES = {
  move: 'assets/sounds/move.mp3',
  capture: 'assets/sounds/capture.mp3',
  'game-start': 'assets/sounds/game-start.mp3',
  'game-end': 'assets/sounds/game-end.mp3',
};
const SOUND_POOL_SIZE = 3;
const soundPools = Object.fromEntries(Object.entries(SOUND_FILES).map(([name, src]) => {
  const pool = Array.from({ length: SOUND_POOL_SIZE }, () => {
    const a = new Audio(src);
    a.preload = 'auto';
    return a;
  });
  return [name, { pool, next: 0 }];
}));
const SOUND_MUTE_KEY = 'damika:sound-muted';
const SOUND_VOLUME_KEY = 'damika:sound-volume';
let soundMuted = localStorage.getItem(SOUND_MUTE_KEY) === '1';
// Volume 0..1, persisté en pourcentage entier (0-100) — plus lisible en localStorage/devtools
// qu'un flottant. 0.35 par défaut (raisonnable, pas agressif — demande explicite de Mickaël)
// si jamais réglé.
const storedVolumePct = parseInt(localStorage.getItem(SOUND_VOLUME_KEY), 10);
let soundVolume = Number.isFinite(storedVolumePct) ? Math.min(100, Math.max(0, storedVolumePct)) / 100 : 0.35;

function applySoundVolume() {
  for (const { pool } of Object.values(soundPools)) {
    for (const audio of pool) audio.volume = soundVolume;
  }
}
applySoundVolume();

// Un `playSound('game-start')` peut survenir dès le chargement de la page (partie partagée
// par lien, cf. `loadSharedGameFromUrl()`), donc avant tout geste utilisateur — la politique
// autoplay de Chrome bloque alors `play()` (NotAllowedError). Plutôt que perdre ce son
// silencieusement, on retente une seule fois le DERNIER son ainsi bloqué dès le premier
// geste utilisateur sur la page (le clic qui débloque l'audio n'a pas besoin d'être sur le
// damier précisément — tout `pointerdown` compte, c'est la politique navigateur elle-même
// qui ne distingue pas la cible du geste).
let pendingUnlockSound = null;
// `playMove()` attend la fin de l'animation (`await renderer.animateMove(...)`) avant
// d'appeler `playSound()` : au tout premier coup de la partie, cet appel n'a donc plus lieu
// de façon synchrone dans le gestionnaire du clic/pointerdown qui l'a déclenché, et Chrome
// bloque le `play()` (NotAllowedError) faute d'activation utilisateur "fraîche" — le son est
// alors mémorisé (`pendingUnlockSound`) et ne rejoue qu'au PROCHAIN pointerdown, donc décalé
// d'un coup. On débloque l'audio dès le tout premier pointerdown de la page, de façon
// synchrone (capture, avant même le clic sur le damier), en tentant un `play()`/`pause()`
// immédiat sur chaque instance du pool : cette lecture réussie pendant le geste utilisateur
// suffit à lever la restriction autoplay pour le reste de la session, donc pour tous les
// `playSound()` ultérieurs même appelés après un `await`.
let audioUnlocked = false;
function unlockAudioOnce() {
  if (audioUnlocked) return;
  audioUnlocked = true;
  for (const { pool } of Object.values(soundPools)) {
    for (const audio of pool) {
      audio.play().then(() => { audio.pause(); audio.currentTime = 0; }).catch(() => {});
    }
  }
}
window.addEventListener('pointerdown', unlockAudioOnce, { capture: true, once: true });
function playSound(name) {
  if (soundMuted) return;
  const entry = soundPools[name];
  if (!entry) return;
  const audio = entry.pool[entry.next];
  entry.next = (entry.next + 1) % entry.pool.length;
  audio.currentTime = 0;
  audio.play().catch(() => { pendingUnlockSound = name; });
}
window.addEventListener('pointerdown', () => {
  if (!pendingUnlockSound) return;
  const name = pendingUnlockSound;
  pendingUnlockSound = null;
  playSound(name);
}, { once: false });

// --- état d'interaction -----------------------------------------------------
let selectedSquare = null;
let isAnimating = false;
let autoplayTimer = null;
let isPlaying = false;

// --- état de partie / bibliothèque -------------------------------------------
let headers = { Event: 'Partie libre' };

// PDN encode traditionnellement le nom "Nom, Prénom" (convention KNDB/Turbo Dambase, cf.
// exemple `[White "Scholma, Auke"]`) — affichage en "Prénom Nom" pour un rendu plus naturel
// dans la carte joueur, sans toucher à `headers.White/Black` : la valeur d'origine reste
// inchangée pour l'export PDN. Pas de virgule (pas de PDN structuré) : affiché tel quel.
// PDN encode la date en AAAA.MM.JJ (convention PDN standard) — affichage en JJ/MM/AAAA
// dans le bandeau méta sans toucher à `headers.Date` : la valeur d'origine reste
// inchangée pour l'export PDN. Format inattendu (pas 3 groupes numériques) : tel quel.
function formatPdnDate(date) {
  const m = /^(\d{4})\.(\d{2})\.(\d{2})$/.exec(date);
  if (!m) return date;
  const [, y, mo, d] = m;
  return `${d}/${mo}/${y}`;
}

// [Result "X-Y"] : X = score Blancs, Y = score Noirs (même ordre que les tags [White]/[Black]).
// "*" (partie en cours) ou tag absent/mal formé : pas de score exploitable, placeholder "—"
// géré par l'appelant (renvoie [null, null]).
function parseResultScore(result) {
  const m = /^(\d+(?:\.\d+)?)-(\d+(?:\.\d+)?)$/.exec((result || '').trim());
  return m ? [m[1], m[2]] : [null, null];
}

function formatPlayerName(name) {
  const parts = name.split(',');
  if (parts.length !== 2) return name;
  const [last, first] = parts.map((p) => p.trim());
  if (!last || !first) return name;
  return `${first} ${last}`;
}
let library = []; // parties parsées disponibles (import multi-parties)
let libraryActiveIndex = -1;
// Nom de la bibliothèque elle-même (distinct du nom de chaque partie qu'elle contient) —
// vide par défaut, placeholder "Bibliothèque sans nom" géré en CSS (:empty::before). Encodé
// dans le fichier .pdn comme un en-tête non standard `[LibraryName "..."]` PLACÉ AVANT les
// en-têtes de la 1re partie (cf. extractLibraryName/serializeLibraryToPdnWithName plus bas) —
// retiré des headers de la partie elle-même après lecture pour ne pas polluer son export/
// affichage.
let libraryName = '';
// true dès que `library` change sans passage par "Sauvegarder la bibliothèque" — sert de
// garde-fou avant toute action qui remplacerait la bibliothèque active (coller, ouvrir un
// fichier bibliothèque). Indépendant de la sauvegarde automatique localStorage plus bas :
// une bibliothèque peut être fidèlement restaurée après reload tout en restant "non
// sauvegardée dans un fichier".
let libraryDirty = false;

// true dès qu'un champ SUIVI (nom, score, Elo, titre, commentaire de coup) a été modifié sur
// l'entrée de bibliothèque actuellement OUVERTE (`libraryActiveIndex >= 0`) sans être encore
// enregistré via "Enregistrer"/Ctrl+S. Contrairement à `libraryDirty` (qui déclenche toujours
// la sauvegarde auto existante, inchangée pour une "saisie pure" — aucune entrée active),
// ce flag bloque l'écrasement silencieux de l'entrée : `headers`/`game` restent mutés en
// direct comme avant (aucune copie de `headers`, cf. règle du 18/09), mais `saveAppState()`
// substitue `activeEntrySnapshot` à l'entrée active tant que ce flag est vrai, pour que le
// PDN persisté en localStorage reste figé sur la dernière version VOLONTAIREMENT enregistrée.
let activeEntryDirty = false;
// Instantané inerte { headers, moves } (même forme que currentGameAsLibraryEntry()) de la
// dernière version enregistrée de l'entrée active — jamais muté partiellement, toujours
// remplacé en bloc (au chargement, après "Enregistrer", après restauration localStorage).
// Sert à la fois de référence pour "Annuler" et de substitut de sérialisation ci-dessus. null
// quand aucune entrée de bibliothèque n'est active.
let activeEntrySnapshot = null;
// true dès qu'un premier "Enregistrer"/Ctrl+S a été fait sur l'entrée active EN COURS
// (jamais persisté, remis à zéro à chaque nouveau chargement de l'entrée — changement de
// partie ou F5, cf. captureActiveEntrySnapshot()) : au-delà de cette première confirmation,
// les modifications suivantes s'enregistrent directement (comme l'auto-save d'origine) tant
// qu'on reste sur cette même partie, pour éviter de rebloquer sur le pill à chaque coup joué
// après un premier "Enregistrer" volontaire — cf. markActiveEntryDirty().
let activeEntryConfirmed = false;

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
    // FUSION, pas remplacement : au chargement de la page, `restoreAppState()` (synchrone)
    // a déjà pu enregistrer une entrée dans `playerPhotoPrefill` via `registerPhotoUrlFromHeaders`
    // (WhiteUrl/BlackUrl de la partie en cours, ex. collée juste avant un F5) AVANT que ce fetch
    // (asynchrone, donc plus lent) ne se résolve. `playerPhotoPrefill = await res.json()` tout
    // court écrasait cette entrée fraîchement posée avec le contenu du fichier seul — bug
    // constaté : une photo visible juste après un collage disparaissait systématiquement au F5,
    // le fetch écrasant l'enregistrement fait entre-temps par la restauration de la partie.
    // Les entrées déjà présentes dans `playerPhotoPrefill` (posées en session) gagnent sur le
    // contenu du fichier en cas de conflit de nom.
    playerPhotoPrefill = { ...(await res.json()), ...playerPhotoPrefill };
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
  statusText: document.getElementById('status-text'),
  moveList: document.getElementById('move-list'),
  btnFirst: document.getElementById('btn-first'),
  btnPrev: document.getElementById('btn-prev'),
  btnPlay: document.getElementById('btn-play'),
  btnNext: document.getElementById('btn-next'),
  btnLast: document.getElementById('btn-last'),
  btnUndo: document.getElementById('btn-undo'),
  btnRedo: document.getElementById('btn-redo'),
  btnFlip: document.getElementById('btn-flip'),
  btnMute: document.getElementById('btn-mute'),
  soundControl: document.getElementById('sound-control'),
  soundVolumeSlider: document.getElementById('sound-volume-slider'),
  soundVolumeValue: document.getElementById('sound-volume-value'),
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
  btnExportImage: document.getElementById('btn-export-image'),
  btnExportPdf: document.getElementById('btn-export-pdf'),
  btnShare: document.getElementById('btn-share'),
  shareOverlay: document.getElementById('share-overlay'),
  shareWarning: document.getElementById('share-warning'),
  shareBody: document.getElementById('share-body'),
  shareLinkInput: document.getElementById('share-link-input'),
  shareCopyBtn: document.getElementById('share-copy-btn'),
  shareQr: document.getElementById('share-qr'),
  shareCloseBtn: document.getElementById('share-close-btn'),
  tabMoves: document.getElementById('tab-moves'),
  tabLibrary: document.getElementById('tab-library'),
  panelMoves: document.getElementById('panel-moves'),
  panelLibrary: document.getElementById('panel-library'),
  libraryList: document.getElementById('library-list'),
  libraryEmpty: document.getElementById('library-empty'),
  libraryName: document.getElementById('library-name'),
  libraryCount: document.getElementById('library-count'),
  btnLibrarySave: document.getElementById('btn-library-save'),
  btnLibraryOpen: document.getElementById('btn-library-open'),
  btnLibraryAddCurrent: document.getElementById('btn-library-add-current'),
  unsavedBar: document.getElementById('unsaved-bar'),
  btnSaveEntry: document.getElementById('btn-save-entry'),
  btnRevertEntry: document.getElementById('btn-revert-entry'),
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
    el.statusText.textContent = w === WHITE ? 'Les Blancs gagnent — plus aucun coup possible pour les Noirs' : 'Les Noirs gagnent — plus aucun coup possible pour les Blancs';
  } else {
    // Le halo pulsant sur les pièces concernées suffit déjà à signaler la prise
    // obligatoire (retour Mickaël A5) — plus besoin de le répéter dans le texte d'état.
    el.statusText.textContent = `Trait aux ${game.sideToMove === WHITE ? 'Blancs' : 'Noirs'}`;
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

  // Icône "+" dans le flux flex (à côté du texte, jamais par-dessus), révélée uniquement
  // au survol de la ligne — le point doré ci-dessus reste le seul indicateur visible au
  // repos pour un coup déjà commenté.
  const hint = document.createElement('button');
  hint.type = 'button';
  hint.className = 'move-comment-hint';
  hint.title = hasComment ? 'Modifier le commentaire' : 'Ajouter un commentaire';
  hint.textContent = '+';
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
    markActiveEntryDirty();
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

  // Seul point d'entrée d'un VRAI changement de contenu (nouveau coup joué, par opposition à
  // la navigation undo()/redo() — flèches, molette, autoplay, "aller à ce coup" — qui ne
  // passe jamais par playMove()) : `_commit()` dans rules.js vide `game.future` à chaque
  // appel, que ce coup prolonge la ligne enregistrée ou en divergent. Rebuild la liste
  // bibliothèque seulement au moment où le POINT apparaît pour la première fois (jamais en
  // mode confirmé, cf. activeEntryConfirmed — aucun point à afficher dans ce cas).
  if (libraryActiveIndex >= 0 && !activeEntryConfirmed && !activeEntryDirty) renderLibrary();
  markActiveEntryDirty();

  isAnimating = false;
  refreshUI();
  playSound(action.type === 'capture' ? 'capture' : 'move');
  if (game.isGameOver()) playSound('game-end');

  if (isPlaying) scheduleAutoplayStep();
}

// --- undo / redo / navigation ---------------------------------------------------
function goToPrevMove() { stopAutoplay(); game.undo(); selectedSquare = null; refreshUI(); }
function goToNextMove() {
  stopAutoplay();
  const nextType = game.future[game.future.length - 1]?.move.type;
  game.redo();
  selectedSquare = null;
  refreshUI();
  playSound(nextType === 'capture' ? 'capture' : 'move');
  if (game.isGameOver()) playSound('game-end');
}
el.btnUndo.addEventListener('click', goToPrevMove);
el.btnRedo.addEventListener('click', goToNextMove);
el.btnPrev.addEventListener('click', goToPrevMove);
el.btnNext.addEventListener('click', goToNextMove);
el.btnFirst.addEventListener('click', () => { stopAutoplay(); while (game.undo()) {} selectedSquare = null; refreshUI(); });
el.btnLast.addEventListener('click', () => { stopAutoplay(); while (game.redo()) {} selectedSquare = null; refreshUI(); });

// Navigation à la molette sur le damier (comme Toernooibase) : vers le bas = coup suivant,
// vers le haut = coup précédent. Uniquement au-dessus du canvas (pas toute la page), pour ne
// pas interférer avec le scroll de la liste des coups/bibliothèque à côté. `preventDefault()`
// empêche le scroll de la page derrière le damier ; listener non-passif requis pour ça (un
// listener 'wheel' est passif par défaut, preventDefault() serait silencieusement ignoré).
// Garde-fou anti-rafale : un trackpad envoie de nombreux évènements 'wheel' à faible delta
// pour un seul geste — on limite à un coup par tranche de 150ms, plutôt qu'un coup par
// évènement (qui ferait défiler plusieurs coups d'un coup sur un simple geste de molette).
let lastWheelNavAt = 0;
canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  const now = performance.now();
  if (now - lastWheelNavAt < 150) return;
  lastWheelNavAt = now;
  if (e.deltaY > 0) goToNextMove();
  else if (e.deltaY < 0) goToPrevMove();
}, { passive: false });

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
    playSound(moveInfo.type === 'capture' ? 'capture' : 'move');
    if (game.isGameOver()) playSound('game-end');
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
// Inverse "X-Y" en "Y-X" (un seul tiret séparateur, cf. `headers.Result` toujours au format
// PDN "Blancs-Noirs") — utilisé uniquement pour l'affichage du score au flip, jamais pour
// modifier `headers.Result` lui-même.
function reverseScoreText(text) {
  const idx = text.indexOf('-');
  if (idx === -1) return text;
  return text.slice(idx + 1) + '-' + text.slice(0, idx);
}
function toggleFlip() {
  flipped = !flipped;
  renderer.setFlipped(flipped);
  // Permute l'ordre d'affichage des 2 cartes joueurs (et de la zone score entre elles) pour
  // rester cohérent avec l'orientation du plateau — uniquement visuel (`order` flex en CSS,
  // cf. .players-rail.flipped dans style.css), aucune donnée ni le DOM lui-même ne bougent.
  el.playersRail.classList.toggle('flipped', flipped);
  syncHeaderFieldsFromState();
}
el.btnFlip.addEventListener('click', toggleFlip);

// --- mute (état persisté en localStorage, cf. `soundMuted`/SOUND_MUTE_KEY plus haut) --------
function syncMuteButton() {
  el.btnMute.textContent = soundMuted ? '🔇' : '🔊';
  el.btnMute.title = soundMuted ? 'Activer le son' : 'Couper le son';
}
el.btnMute.addEventListener('click', () => {
  soundMuted = !soundMuted;
  localStorage.setItem(SOUND_MUTE_KEY, soundMuted ? '1' : '0');
  syncMuteButton();
});
syncMuteButton();

// --- volume (popover révélé au survol de l'icône 🔊, cf. .sound-control:hover dans
// style.css) — slider 0-100%, appliqué en temps réel aux 3 pools de sons, persisté
// séparément du mute (les 2 réglages sont indépendants : baisser le volume ne démute pas,
// et le mute n'écrase pas le volume mémorisé).
function syncVolumeSlider() {
  const pct = Math.round(soundVolume * 100);
  el.soundVolumeSlider.value = String(pct);
  el.soundVolumeValue.textContent = `${pct}%`;
}
el.soundVolumeSlider.addEventListener('input', () => {
  soundVolume = Number(el.soundVolumeSlider.value) / 100;
  localStorage.setItem(SOUND_VOLUME_KEY, el.soundVolumeSlider.value);
  el.soundVolumeValue.textContent = `${el.soundVolumeSlider.value}%`;
  applySoundVolume();
});
// Pendant un drag du slider, le curseur peut brièvement sortir de la zone de survol
// (`.sound-control`/`.sound-popover`) — la classe `.sound-dragging` force l'ouverture du
// popover via CSS jusqu'au relâchement, où que la souris se trouve à ce moment-là.
el.soundVolumeSlider.addEventListener('pointerdown', () => {
  el.soundControl.classList.add('sound-dragging');
});
window.addEventListener('pointerup', () => {
  el.soundControl.classList.remove('sound-dragging');
});
syncVolumeSlider();

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

// Ctrl+S / Cmd+S : en dehors du guard sur les éléments éditables ci-dessus (un blur avant
// preventDefault ne suffirait pas à empêcher la boîte de dialogue "Enregistrer sous" du
// navigateur si le focus est dans un champ du Bloc 1 pendant l'édition). saveActiveEntry()
// ne fait rien s'il n'y a rien à enregistrer.
window.addEventListener('keydown', (e) => {
  if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 's') return;
  e.preventDefault();
  saveActiveEntry();
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
    const rawVal = headers[key] || chipDefaults[key] || '—';
    const val = key === 'Date' && rawVal !== '—' ? formatPdnDate(rawVal) : rawVal;
    elm.textContent = val;
    elm.title = val !== '—' ? val : chipLabels[key];
  });
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
  // Score centré ENTRE les deux cartes (#score-center) — champ texte libre lié directement
  // à headers.Result (cf. commentaire CSS .score-center-value), pas de split/format imposé.
  // `headers.Result` reste toujours "Blancs-Noirs" (ordre PDN) ; au flip, seul l'AFFICHAGE
  // est inversé ("2-0" -> "0-2") pour suivre la carte qui a physiquement changé de côté
  // (cf. `reverseScoreText()` et `toggleFlip()`) — la donnée sous-jacente ne bouge pas.
  const scoreValue = document.getElementById('score-value');
  if (scoreValue && document.activeElement !== scoreValue) {
    const result = headers.Result && headers.Result !== '*' ? headers.Result : null;
    scoreValue.textContent = result ? (flipped ? reverseScoreText(result) : result) : '—';
  }
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

document.querySelectorAll('.meta-chip[data-field], .player-name[data-field], .meta-field[data-field], .stat-value[data-field], .score-center-value[data-field]').forEach((elm) => {
  elm.addEventListener('blur', () => {
    const key = elm.dataset.field;
    let val = elm.textContent.trim();
    if (key.endsWith('Elo') && /^Elo\s/.test(val)) val = val.replace(/^Elo\s*/, '').trim();
    // .player-name affiche "Prénom Nom" (cf. formatPlayerName/syncHeaderFieldsFromState) —
    // si la valeur affichée correspond exactement à l'ancienne valeur juste reformatée
    // (aucune vraie modification, juste un focus/blur accidentel), on ne touche pas à
    // `headers` pour ne pas perdre définitivement la virgule d'origine utile à l'export PDN.
    const isUntouchedPlayerName = elm.classList.contains('player-name')
      && headers[key] && val === formatPlayerName(headers[key]);
    // Même logique pour le chip Date, affiché en JJ/MM/AAAA (cf. formatPdnDate) alors que
    // `headers.Date` reste en AAAA.MM.JJ — sans ce garde-fou, un focus/blur accidentel sans
    // vraie modification écraserait `headers.Date` avec le format d'affichage inversé.
    const isUntouchedDate = key === 'Date'
      && headers[key] && val === formatPdnDate(headers[key]);
    // Le score affiché est inversé au flip (cf. `reverseScoreText()`/`toggleFlip()`) : si
    // l'utilisateur édite le champ pendant que le plateau est retourné, il faut ré-inverser
    // avant d'écrire dans `headers.Result`, qui reste toujours au format PDN "Blancs-Noirs".
    if (key === 'Result' && flipped) val = reverseScoreText(val);
    if (!isUntouchedPlayerName && !isUntouchedDate) {
      if (val && val !== '—') headers[key] = val;
      else delete headers[key];
    }
    syncHeaderFieldsFromState();
    // `headers` EST déjà `library[libraryActiveIndex].headers` (même référence, cf.
    // loadParsedGame()) quand une entrée de bibliothèque est active — aucune recopie
    // n'est nécessaire, seulement rafraîchir l'affichage de la liste pour refléter la
    // mutation qui vient d'avoir lieu sur cet unique objet partagé. Pour une partie EXISTANTE
    // (entrée active), on ne marque plus `libraryDirty` ici : `markActiveEntryDirty()` diffère
    // l'écriture jusqu'à "Enregistrer"/Ctrl+S (cf. activeEntryDirty) — seule une saisie pure
    // (aucune entrée active) continue d'auto-sauvegarder comme avant.
    if (libraryActiveIndex >= 0) {
      markActiveEntryDirty();
      renderLibrary();
    }
    scheduleSave();
  });
});

// Édition d'un champ (nom, score...) directement depuis la carte d'UNE entrée de la
// Bibliothèque (pas forcément l'entrée active) — pendant du bloc générique
// `.player-name[data-field]`/etc. du Bloc 1 plus haut, avec la même normalisation de valeur
// (trim, préfixe "Elo " retiré). Mute `entry.headers` directement : si l'entrée éditée est
// celle actuellement chargée dans le Bloc 1 (idx === libraryActiveIndex), `entry.headers`
// EST `headers` (même objet, même référence — cf. loadParsedGame()), donc le Bloc 1 reflète
// déjà la mutation sans code supplémentaire ; il ne reste qu'à rafraîchir son affichage DOM.
function setLibraryFieldValue(idx, key, rawVal) {
  const entry = library[idx];
  if (!entry) return;
  let val = rawVal.trim();
  if (key.endsWith('Elo') && /^Elo\s/.test(val)) val = val.replace(/^Elo\s*/, '').trim();
  // Même garde-fou que le champ .player-name générique du Bloc 1 (cf. isUntouchedPlayerName
  // plus haut) : le nom est AFFICHÉ reformaté ("Prénom Nom") mais STOCKÉ "Nom, Prénom" — un
  // focus/blur sans vraie modification ne doit pas écraser la virgule d'origine.
  const isUntouchedPlayerName = (key === 'White' || key === 'Black')
    && entry.headers[key] && val === formatPlayerName(entry.headers[key]);
  if (!isUntouchedPlayerName) {
    if (val && val !== '—') entry.headers[key] = val;
    else delete entry.headers[key];
  }
  // Édition de l'entrée active depuis sa carte bibliothèque : même report que le Bloc 1
  // (cf. markActiveEntryDirty()) — édition d'une AUTRE entrée (pas ouverte dans le Bloc 1) :
  // reste auto-sauvegardée immédiatement comme avant, hors périmètre de cette fonctionnalité.
  if (idx === libraryActiveIndex) {
    markActiveEntryDirty();
    if (!isUntouchedPlayerName) syncHeaderFieldsFromState();
  } else {
    libraryDirty = true;
  }
  renderLibrary();
  scheduleSave();
}

// Construit un champ éditable (nom ou score) DANS le titre d'une carte Bibliothèque — même
// principe que les champs `.player-name`/`.score-center-value` du Bloc 1 : un simple
// `contenteditable`, la valeur affichée est reformatée pour la lecture (formatPlayerName)
// mais l'édition passe par setLibraryFieldValue(), qui gère la normalisation/le stockage
// brut. La coloration (ex. `.library-item-black`) dépend uniquement de `extraClass`, fixée
// par l'appelant selon le camp (Blancs/Noirs) — jamais du texte affiché, donc robuste à
// n'importe quel contenu (chiffres, ponctuation, longueur...).
function buildEditableLibraryField(key, text, extraClass, idx) {
  const span = document.createElement('span');
  span.className = `library-item-field${extraClass ? ` ${extraClass}` : ''}`;
  span.contentEditable = 'true';
  span.spellcheck = false;
  span.dataset.field = key;
  span.textContent = text;
  span.addEventListener('blur', () => setLibraryFieldValue(idx, key, span.textContent));
  return span;
}

function renderEditableLibraryTitle(entry, idx, container) {
  container.textContent = '';
  const whiteText = entry.headers.White ? formatPlayerName(entry.headers.White) : 'Blancs';
  const blackText = entry.headers.Black ? formatPlayerName(entry.headers.Black) : 'Noirs';
  const scoreText = entry.headers.Result && entry.headers.Result !== '*' ? entry.headers.Result : '—';
  container.append(
    buildEditableLibraryField('White', whiteText, null, idx),
    document.createTextNode(' — '),
    buildEditableLibraryField('Black', blackText, 'library-item-black', idx),
    document.createTextNode(' '),
    buildEditableLibraryField('Result', scoreText, 'library-item-score', idx),
  );
}

// Sérialise la bibliothèque en y encodant `libraryName` (si renseigné) comme un en-tête
// `[LibraryName "..."]` placé AVANT les en-têtes de la 1re partie. Le découpage en blocs du
// parseur (splitIntoGameBlocks) fusionne des lignes d'en-tête consécutives tant qu'aucun
// texte de coup ne s'est encore intercalé — ce en-tête "orphelin" atterrit donc simplement
// dans les headers de la 1re partie à la relecture, sans aucun changement au parseur ; on le
// retire ensuite de ces headers via extractLibraryName() pour ne pas polluer cette partie.
function serializeLibraryWithName(entries, name) {
  const pdn = serializeLibraryToPdn(entries);
  return name ? `[LibraryName "${name}"]\n${pdn}` : pdn;
}

// Repère et retire `headers.LibraryName` de la 1re partie d'un tableau parsé (mutation en
// place) — utilisé à la fois pour la restauration localStorage et pour "Ouvrir une
// bibliothèque". Renvoie le nom trouvé, ou '' si absent.
function extractLibraryName(entries) {
  if (entries.length === 0 || !entries[0].headers.LibraryName) return '';
  const name = entries[0].headers.LibraryName;
  delete entries[0].headers.LibraryName;
  return name;
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
  saveTimer = null;
  // Tant que l'entrée active a des modifications non enregistrées (activeEntryDirty), le PDN
  // persisté de la BIBLIOTHÈQUE la remplace par son dernier instantané enregistré plutôt que
  // par son état live (qui, lui, EST `library[libraryActiveIndex]` par référence — cf.
  // loadParsedGame()) : sans cette substitution, n'importe quel autre scheduleSave() déclenché
  // ailleurs (jouer un coup, réordonner...) écrirait quand même la modif non voulue, puisque
  // c'est le même objet. Les autres entrées sont sérialisées telles quelles, inchangées.
  const entriesForPersistence = (activeEntryDirty && libraryActiveIndex >= 0 && activeEntrySnapshot)
    ? library.map((entry, idx) => (idx === libraryActiveIndex ? activeEntrySnapshot : entry))
    : library;
  const pdnText = entriesForPersistence.length > 0 ? serializeLibraryWithName(entriesForPersistence, libraryName) : '';
  // `currentGamePdn` reste toujours la partie RÉELLEMENT affichée (avec ses modifications non
  // enregistrées le cas échéant) : un F5 en cours d'édition ne doit ni les perdre, ni les
  // valider silencieusement dans la bibliothèque — cf. activeEntryDirty/activeEntrySnapshot
  // persistés ci-dessous, qui permettent de retrouver "Enregistrer"/"Annuler" après reload.
  const currentGamePdn = serializeToPdn(currentGamePayload());
  saveLibraryState({
    version: 1,
    pdnText,
    activeIndex: libraryActiveIndex,
    currentGamePdn,
    libraryDirty,
    activeEntryDirty,
    activeEntrySnapshot: activeEntryDirty ? activeEntrySnapshot : null,
  });
}
// Filet de sécurité contre la course debounce (400ms) / rafraîchissement immédiat de la
// page : un F5 juste après une action (ex. "Ajouter la partie" suivi d'un refresh instantané)
// arrivait AVANT que le timer de scheduleSave() se déclenche, perdant silencieusement l'écriture
// (bug constaté en direct — la bibliothèque revenait vide après un simple F5). `beforeunload`
// se déclenche de façon synchrone avant que la page ne se décharge, y compris pour un rechargement
// déclenché par script (`location.reload()`) — on force l'écriture immédiate d'un save en attente.
window.addEventListener('beforeunload', (e) => {
  if (saveTimer !== null) {
    clearTimeout(saveTimer);
    saveAppState();
  }
  // Avertissement natif du navigateur (pas un confirm() maison, donc pas de blocage JS
  // interdit par le projet) : les modifications non enregistrées ne sont PAS perdues au
  // reload (cf. activeEntrySnapshot persisté ci-dessus), mais fermer l'onglet reste une
  // sortie définitive — mieux vaut prévenir.
  if (activeEntryDirty) {
    e.preventDefault();
    e.returnValue = '';
  }
});

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
        libraryName = extractLibraryName(restoredLibrary);
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
        // `state.pdnText` (la bibliothèque) et `state.currentGamePdn` (la partie active) sont
        // DEUX chaînes PDN sérialisées séparément puis reparsées ici indépendamment — sans
        // ce garde-fou, `headers` retomberait sur un DEUXIÈME objet distinct de
        // `library[libraryActiveIndex].headers` à chaque rechargement de page, recréant la
        // duplication (deux copies de "la même" donnée pouvant diverger) que ce chantier
        // corrige justement. Quand une entrée de bibliothèque est active, elle reste la
        // source unique : on réutilise directement sa référence plutôt que le résultat de
        // ce second parsing (les deux représentent la même partie, sauvegardés ensemble).
        if (libraryActiveIndex >= 0 && library[libraryActiveIndex]) {
          headers = library[libraryActiveIndex].headers;
          // `state.currentGamePdn` (la partie active) peut porter des modifications encore non
          // enregistrées (cf. state.activeEntryDirty ci-dessous) alors que `library[idx].headers`
          // — qu'on vient de rebrancher comme référence unique juste au-dessus — ne les porte
          // PAS forcément (cf. saveAppState() : l'entrée active y est remplacée par son dernier
          // instantané enregistré tant qu'elle est "dirty"). On applique donc ici les valeurs
          // réellement affichées (`newHeaders`, issu de ce 2e parsing) SUR ce même objet
          // partagé, plutôt que de garder deux objets `headers` distincts.
          if (state.activeEntryDirty) {
            Object.keys(headers).forEach((k) => delete headers[k]);
            Object.assign(headers, newHeaders);
          }
        } else {
          headers = newHeaders;
          if (!headers.Result) headers.Result = result;
        }
      }
    }
    // Restaure l'état "non enregistré" tel quel s'il y en avait un lors de la dernière
    // sauvegarde, sinon (re)capture un instantané propre depuis l'état qui vient d'être
    // rechargé ci-dessus (cohérent par construction, cf. commentaire juste au-dessus).
    if (libraryActiveIndex >= 0 && state.activeEntryDirty && state.activeEntrySnapshot) {
      activeEntrySnapshot = state.activeEntrySnapshot;
      activeEntryDirty = true;
      // Un F5 repart TOUJOURS de zéro sur le mode "confirmé" (cf. activeEntryConfirmed) —
      // même si l'entrée était déjà passée en mode confirmé avant le rechargement, il faudra
      // recliquer "Enregistrer" au moins une fois après ce reload.
      activeEntryConfirmed = false;
      updateUnsavedIndicator();
    } else {
      captureActiveEntrySnapshot();
    }
    renderLibrary();
    syncHeaderFieldsFromState();
  } catch {
    // état stocké corrompu : ignoré, l'appli démarre vierge comme avant ce chantier.
  }
}

// --- bibliothèque (import multi-parties) ----------------------------------------------
// Titre affiché d'une entrée : toujours dérivé des noms des joueurs (headers.White/Black),
// jamais d'un libellé personnalisé figé à part — l'ancienne fonctionnalité de renommage
// libre (`headers.Label`) a été retirée : un texte arbitraire remplaçant l'affichage cassait
// la coloration par camp (qui dépend de la position structurelle Blancs/Noirs, pas d'un
// texte) et pouvait diverger silencieusement des vrais noms stockés dès qu'il devenait
// "stale" par rapport à eux (bug constaté à plusieurs reprises : "Kevin Machtelinck2" figé
// dans un Label alors que headers.Black valait "Machtelinck, Kevin", sans "2"). headers.White
// et headers.Black restent la SEULE source du nom, affichée à l'identique dans le Bloc 1 et
// la Bibliothèque.
function libraryEntryTitle(entry) {
  return defaultLibraryEntryTitle(entry);
}

function defaultLibraryEntryTitle(entry) {
  return `${formatPlayerName(entry.headers.White || 'Blancs')} — ${formatPlayerName(entry.headers.Black || 'Noirs')}`;
}

// N'écrase pas le champ pendant que l'utilisateur est en train d'y taper (même précaution
// que pour les autres champs éditables du panneau) — seulement au repos.
function syncLibraryNameField() {
  if (document.activeElement === el.libraryName) return;
  el.libraryName.textContent = libraryName;
}

el.libraryName.addEventListener('blur', () => {
  libraryName = el.libraryName.textContent.trim();
  el.libraryName.textContent = libraryName;
  scheduleSave();
});
// Évite qu'un retour à la ligne (Entrée) n'insère un <br> dans ce contenteditable — un nom
// de bibliothèque est une seule ligne.
el.libraryName.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { e.preventDefault(); el.libraryName.blur(); }
});

function renderLibrary() {
  syncLibraryNameField();
  el.libraryList.innerHTML = '';
  el.libraryEmpty.hidden = library.length > 0;
  el.libraryCount.hidden = library.length === 0;
  el.libraryCount.textContent = String(library.length);
  library.forEach((entry, idx) => {
    // Purge un `headers.Label` résiduel (ancienne fonctionnalité de renommage libre,
    // retirée — cf. libraryEntryTitle) qui pourrait encore traîner dans une bibliothèque
    // rechargée depuis un fichier .pdn ou un ancien localStorage : il n'est plus lu nulle
    // part, mais on le supprime pour de bon plutôt que de le laisser polluer un futur export.
    delete entry.headers.Label;
    const li = document.createElement('li');
    li.className = `library-item${idx === libraryActiveIndex ? ' active' : ''}`;

    // Réordonnancement manuel par glisser-déposer, sur TOUTE la carte (pas seulement une
    // petite poignée — retour Mickaël : "impossible de déplacer la carte", la zone de prise
    // minuscule était trop difficile à attraper). Implémenté à la main via pointerdown/move/up
    // (PAS le drag&drop HTML5 natif) : la "ghost image" semi-transparente que le navigateur
    // génère automatiquement pour un draggable="true" se superposait de façon illisible au
    // texte de la carte survolée (bug précédent) — aucun moyen fiable de la rendre opaque ou
    // de la supprimer sans perdre l'aperçu de drag. Ici la carte déplacée est un élément réel
    // (position: fixed, fond opaque) qui suit le curseur, et un placeholder occupe sa place
    // dans le flux pendant le drag — voir startLibraryDrag(). Un seuil de mouvement (cf.
    // DRAG_THRESHOLD_PX dans startLibraryDrag) distingue un simple clic (sélection de la
    // partie, cf. le listener 'click' plus bas) d'un vrai drag — sans lui, poser le doigt/la
    // souris sur la carte pour cliquer déclencherait systématiquement un micro-drag.
    const dragHandle = document.createElement('span');
    dragHandle.className = 'library-item-drag';
    dragHandle.title = 'Glisser pour réordonner';
    dragHandle.textContent = '⠿';
    li.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      if (e.target.closest('.library-item-delete')) return;
      startLibraryDrag(e, li, idx);
    });

    const info = document.createElement('div');
    info.className = 'library-item-info';
    const title = document.createElement('div');
    title.className = 'library-item-title';
    renderEditableLibraryTitle(entry, idx, title);
    // Point "non enregistré" (cf. .unsaved-dot du Bloc 1) : seulement sur l'entrée active,
    // et seulement si elle a des modifications en attente (activeEntryDirty).
    if (idx === libraryActiveIndex && activeEntryDirty) {
      const dot = document.createElement('span');
      dot.className = 'library-item-unsaved-dot';
      dot.title = 'Modifications non enregistrées';
      dot.textContent = '●';
      title.appendChild(dot);
    }
    const meta = document.createElement('div');
    meta.className = 'library-item-meta';
    meta.textContent = entry.headers.Event || '';
    info.append(title, meta);

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'library-item-delete';
    deleteBtn.title = 'Supprimer cette partie de la bibliothèque';
    deleteBtn.textContent = '✕';
    deleteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      deleteLibraryEntry(idx);
    });

    li.append(dragHandle, info, deleteBtn);
    li.addEventListener('click', async () => {
      // Un drag qui vient de se terminer déclenche quand même un 'click' natif au relâchement
      // (même élément, même souris) — sans ce garde-fou, réordonner une entrée la sélectionnait
      // aussi/rechargeait la partie au passage, un effet de bord non voulu.
      if (consumeLibraryDragJustEnded()) return;
      if (libraryActiveIndex === idx) return;
      if (activeEntryDirty) {
        const ok = await confirmModal('Des modifications de la partie affichée ne sont pas enregistrées. Ouvrir une autre partie les perdra. Continuer ?', 'Ouvrir');
        if (!ok) return;
        discardActiveEntryDraft();
      }
      libraryActiveIndex = idx;
      loadParsedGame(entry, { silent: true });
      el.libraryList.querySelectorAll('.library-item.active').forEach((n) => n.classList.remove('active'));
      li.classList.add('active');
    });
    el.libraryList.appendChild(li);
  });
}

// Réordonnancement manuel (glisser-déposer "carte physique", cf. le commentaire dans
// renderLibrary() sur pourquoi ce n'est PAS le drag&drop HTML5 natif). `finalIndex` est la
// position déjà mesurée APRÈS retrait de l'élément déplacé (cf. onPointerUp ci-dessous, qui
// la lit directement dans l'ordre visuel du placeholder) — un simple splice/insert suffit,
// aucun ajustement d'indice supplémentaire nécessaire ici. L'entrée active est retrouvée par
// référence après le splice plutôt que recalculée par arithmétique d'indices (plus simple à
// lire, aucun risque de décalage off-by-one).
function moveLibraryEntryTo(fromIndex, finalIndex) {
  if (!Number.isInteger(fromIndex) || fromIndex < 0 || fromIndex >= library.length) return;
  if (finalIndex === fromIndex) return;
  const activeEntry = libraryActiveIndex >= 0 ? library[libraryActiveIndex] : null;
  const [item] = library.splice(fromIndex, 1);
  library.splice(finalIndex, 0, item);
  if (activeEntry) libraryActiveIndex = library.indexOf(activeEntry);
  libraryDirty = true;
  renderLibrary();
  scheduleSave();
}

// Le drag ne "s'engage" (carte détachée + placeholder) qu'après ce seuil de mouvement en
// pixels — en-dessous, on laisse un simple clic/double-clic se produire normalement (cf.
// startLibraryDrag ci-dessous).
const LIBRARY_DRAG_THRESHOLD_PX = 4;
// Posé à true juste après un vrai drag (mouvement au-delà du seuil), pour que le 'click'
// natif qui suit immanquablement le relâchement de la souris sur la même carte n'ouvre pas
// aussi la partie / ne change pas la sélection — cf. consumeLibraryDragJustEnded().
let libraryDragJustEnded = false;
function consumeLibraryDragJustEnded() {
  const was = libraryDragJustEnded;
  libraryDragJustEnded = false;
  return was;
}

// Glisser-déposer façon "carte physique" : la carte déplacée se détache du flux (position
// fixed, suit le curseur, fond opaque + ombre + léger scale) tandis qu'un placeholder occupe
// sa place dans la liste ; les autres cartes se décalent avec une transition fluide (FLIP —
// First/Last/Invert/Play : on capture leurs positions avant/après le déplacement du
// placeholder dans le DOM, puis on anime depuis la position inversée vers l'identité) chaque
// fois que le placeholder change de créneau. Le réordonnancement réel du tableau `library`
// n'a lieu qu'au relâchement (moveLibraryEntryTo), une fois la position finale du placeholder
// connue — le drag lui-même ne touche qu'au DOM/CSS, jamais aux données.
function startLibraryDrag(pointerDownEvent, li, fromIndex) {
  const listEl = el.libraryList;
  const startClientX = pointerDownEvent.clientX;
  const startClientY = pointerDownEvent.clientY;
  let engaged = false;
  let placeholder = null;
  let rect = null;
  let baseTop = null;

  function siblingItems() {
    return Array.from(listEl.querySelectorAll('.library-item')).filter((n) => n !== li);
  }

  // FLIP : déplace le placeholder avant/après `targetSibling` dans le DOM, puis anime les
  // cartes dont la position a changé depuis leur position précédente vers leur nouvelle
  // position (transition CSS déclenchée en repartant d'un transform inversé).
  function movePlaceholderNextTo(targetSibling, before) {
    const currentNeighbour = before ? placeholder.nextElementSibling : placeholder.previousElementSibling;
    if (currentNeighbour === targetSibling) return;
    const siblings = siblingItems();
    const oldRects = new Map(siblings.map((s) => [s, s.getBoundingClientRect()]));
    if (before) targetSibling.before(placeholder);
    else targetSibling.after(placeholder);
    siblings.forEach((s) => {
      const oldRect = oldRects.get(s);
      const newRect = s.getBoundingClientRect();
      const dy = oldRect.top - newRect.top;
      if (!dy) return;
      s.style.transition = 'none';
      s.style.transform = `translateY(${dy}px)`;
      requestAnimationFrame(() => {
        s.style.transition = 'transform 150ms ease';
        s.style.transform = '';
      });
    });
  }

  // N'engage le drag visuel (carte détachée, placeholder) qu'une fois le seuil de mouvement
  // franchi — appelé depuis onPointerMove, jamais depuis pointerdown directement.
  function engage() {
    engaged = true;
    rect = li.getBoundingClientRect();
    baseTop = rect.top;
    placeholder = document.createElement('li');
    placeholder.className = 'library-item-placeholder';
    placeholder.style.height = `${rect.height}px`;
    li.before(placeholder);
    li.classList.add('library-item-dragging');
    li.style.position = 'fixed';
    li.style.top = `${rect.top}px`;
    li.style.left = `${rect.left}px`;
    li.style.width = `${rect.width}px`;
    li.style.margin = '0';
    li.style.zIndex = '1000';
  }

  function onPointerMove(e) {
    if (!engaged) {
      const dx = e.clientX - startClientX;
      const dy = e.clientY - startClientY;
      if (Math.hypot(dx, dy) < LIBRARY_DRAG_THRESHOLD_PX) return;
      engage();
    }
    const deltaY = e.clientY - startClientY;
    li.style.top = `${baseTop + deltaY}px`;
    const centerY = baseTop + deltaY + rect.height / 2;
    const siblings = siblingItems();
    let target = null;
    let before = true;
    for (const sib of siblings) {
      const sRect = sib.getBoundingClientRect();
      if (centerY < sRect.top + sRect.height / 2) { target = sib; before = true; break; }
    }
    if (!target && siblings.length) { target = siblings[siblings.length - 1]; before = false; }
    if (target) movePlaceholderNextTo(target, before);
  }

  function onPointerUp() {
    document.removeEventListener('pointermove', onPointerMove);
    document.removeEventListener('pointerup', onPointerUp);
    if (!engaged) return; // pas de vrai drag : laisse le 'click' natif faire son travail
    libraryDragJustEnded = true;
    const finalIndex = Array.from(listEl.children).filter((n) => n !== li).indexOf(placeholder);
    li.remove();
    placeholder.remove();
    moveLibraryEntryTo(fromIndex, finalIndex);
  }

  document.addEventListener('pointermove', onPointerMove);
  document.addEventListener('pointerup', onPointerUp);
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
      captureActiveEntrySnapshot();
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
  if (activeEntryDirty) {
    const ok = await confirmModal('Des modifications de la partie affichée ne sont pas enregistrées. Démarrer une nouvelle partie les perdra. Continuer ?', 'Nouvelle partie');
    if (!ok) return;
    discardActiveEntryDraft();
  } else if (game.history.length > 0 || game.future.length > 0) {
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
  captureActiveEntrySnapshot();
  renderLibrary();
  syncHeaderFieldsFromState();
  refreshUI();
  playSound('game-start');
}
el.btnNewGame.addEventListener('click', startNewGame);
// Sur tout le logo (icône + wordmark), pas seulement le wordmark #easter-egg — convention
// UX "logo = retour à l'état initial". L'easter egg (5 clics sur le wordmark, plus bas)
// reste un écouteur séparé sur #easter-egg, indépendant de celui-ci.
el.brand.addEventListener('click', startNewGame);

// --- chargement d'une partie parsée (PDN) ----------------------------------------------
// `silent` : le clic sur une entrée de la Bibliothèque pour l'ouvrir ne doit jouer AUCUN son
// (retour Mickaël) — seul le son de début de partie serait concerné ici (move/capture
// restent inchangés, ils ne se déclenchent que pendant le jeu réel, cf. playMove()).
function loadParsedGame(parsedGame, { silent = false } = {}) {
  stopAutoplay();
  const { game: newGame, headers: newHeaders, result, warnings, loadedMoves, totalMoves } = loadGameFromPdn(parsedGame);
  game = newGame;
  // Pas de copie (`{...newHeaders}`) : `headers` devient la MÊME référence que
  // `parsedGame.headers` — quand `parsedGame` est une entrée de la Bibliothèque, c'est
  // littéralement `library[idx].headers`. Toute édition ultérieure (Bloc 1 ou carte
  // Bibliothèque) mute cet unique objet ; les deux affichages le lisent, jamais une copie
  // qui pourrait diverger (cf. bug "Kevin Machtelinck2" vs "Kevin Machtelinck" — deux objets
  // séparés qu'un mécanisme de "sync" recopiait manuellement, avec le risque d'oubli que ça
  // implique).
  headers = newHeaders;
  if (!headers.Result) headers.Result = result; // repli sur le résultat du movetext si l'en-tête [Result] manquait
  selectedSquare = null;
  // `libraryActiveIndex` est déjà positionné par l'appelant avant ce chargement (bibliothèque,
  // import, partage...) : capture l'instantané "dernière version enregistrée" à ce nouveau
  // point de départ (ou le vide, en saisie pure) — cf. activeEntrySnapshot plus haut.
  captureActiveEntrySnapshot();
  syncHeaderFieldsFromState();
  refreshUI();
  if (!silent) playSound('game-start');
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
  if (mode !== 'replace' && activeEntryDirty) {
    const ok = await confirmModal('Des modifications de la partie affichée ne sont pas enregistrées. Importer un fichier les perdra. Continuer ?', 'Importer');
    if (!ok) return;
    discardActiveEntryDraft();
  }
  if (mode === 'replace') {
    libraryName = extractLibraryName(parsedGames);
    library = parsedGames;
    libraryActiveIndex = 0;
    libraryDirty = false; // vient d'être ouverte depuis un fichier, synchronisée avec le disque
    renderLibrary();
    loadParsedGame(library[0]);
    if (library.length > 1) switchTab('library');
  } else if (parsedGames.length === 1) {
    // Un fichier à une seule partie n'est PAS ajouté à la bibliothèque à l'import — juste
    // chargé comme "partie en cours", sans référence à une entrée existante (bug constaté :
    // importer sans jamais cliquer "Ajouter la partie" écrivait quand même dans la
    // bibliothèque, et "Nouvelle partie" puis un 2e import pouvait donner l'impression que
    // la 1re partie avait "disparu" alors qu'elle restait figée comme entrée jamais voulue).
    // Il faut un clic explicite sur "Ajouter la partie" (btnLibraryAddCurrent) pour l'y faire
    // entrer — même geste que pour n'importe quelle partie jouée/éditée manuellement.
    libraryActiveIndex = -1;
    renderLibrary();
    loadParsedGame(parsedGames[0]);
  } else {
    // Fichier multi-parties (ex. export Toernooibase d'un tournoi entier) : cliquer
    // "Ajouter la partie" une à une serait impraticable — ajout direct à la bibliothèque
    // conservé pour ce cas, comme avant.
    library = library.concat(parsedGames);
    libraryDirty = true;
    // La dernière partie ajoutée devient l'entrée active — même règle que "Ajouter la
    // partie" : après un ajout, on affiche ce qui vient d'être ajouté plutôt que de laisser
    // l'ancienne partie affichée sans rapport avec ce qu'on vient d'importer.
    libraryActiveIndex = library.length - 1;
    renderLibrary();
    loadParsedGame(library[libraryActiveIndex]);
    switchTab('library');
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
  if (activeEntryDirty) {
    const ok = await confirmModal('Des modifications de la partie affichée ne sont pas enregistrées. Ouvrir une bibliothèque les perdra. Continuer ?', 'Ouvrir');
    if (!ok) return;
    discardActiveEntryDraft();
  } else if (libraryDirty && library.length > 0) {
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
// ({ headers, moves: [{notation}] }) pour rester compatible avec renderLibrary() et
// serializeLibraryToPdn() — fullMoveList(game) renvoie des moveInfo structurés (from/to),
// pas des { notation }, d'où la conversion via moveNotation(). Le résultat n'est PAS un
// champ à part : il vit uniquement dans `headers.Result` (source unique, cf.
// serializeLibraryEntryToPdn qui le lit directement depuis les headers).
function currentGameAsLibraryEntry() {
  return {
    headers: { ...headers },
    moves: fullMoveList(game).map((m) => ({ notation: moveNotation(m), comment: m.comment || undefined })),
  };
}

// --- modifications non enregistrées sur l'entrée de bibliothèque active ----------------
// Affiche/masque la barre du Bloc 1 et le point sur la carte active de la Bibliothèque.
// Appelé après tout changement de `activeEntryDirty`/`libraryActiveIndex`.
function updateUnsavedIndicator() {
  el.unsavedBar.hidden = !(libraryActiveIndex >= 0 && activeEntryDirty);
}

// Marque un champ suivi (nom, score, Elo, titre, commentaire de coup) comme modifié sur
// l'entrée active SANS l'enregistrer — appelé par les handlers d'édition à la place d'un
// `libraryDirty = true` direct, pour que `saveAppState()` diffère l'écriture persistée
// jusqu'à "Enregistrer"/Ctrl+S (cf. commentaire sur `activeEntryDirty` plus haut). Sans
// entrée active (saisie pure), ne fait rien : le comportement d'auto-sauvegarde existant
// reste intact pour ce cas.
function markActiveEntryDirty() {
  if (libraryActiveIndex < 0) return;
  // Mode "confirmé" (au moins un "Enregistrer" déjà fait sur CETTE partie depuis son
  // ouverture) : chaque modification suivante s'enregistre directement, comme l'auto-save
  // d'origine, plutôt que de rouvrir le pill à chaque coup/champ modifié. On ne repasse en
  // mode "à confirmer" qu'en rechargeant l'entrée (changement de partie ou F5, cf.
  // captureActiveEntrySnapshot() et le bloc dirty de restoreAppState()).
  if (activeEntryConfirmed) {
    activeEntrySnapshot = currentGameAsLibraryEntry();
    libraryDirty = true;
    scheduleSave();
    return;
  }
  activeEntryDirty = true;
  updateUnsavedIndicator();
}

// Prend l'état courant (`headers`/`game`) comme nouvel instantané "dernière version
// enregistrée" — appelé au chargement d'une entrée existante (jamais après "Enregistrer",
// cf. saveActiveEntry() qui gère lui-même activeEntryConfirmed après cet appel).
function captureActiveEntrySnapshot() {
  activeEntrySnapshot = libraryActiveIndex >= 0 ? currentGameAsLibraryEntry() : null;
  activeEntryDirty = false;
  activeEntryConfirmed = false;
  updateUnsavedIndicator();
}

// Appelé juste avant d'abandonner l'entrée active pour de bon (changer de partie, nouvelle
// partie, importer/coller/ouvrir par-dessus) APRÈS confirmation de l'utilisateur : remet
// `headers` (mutation en place, toujours le même objet que `library[libraryActiveIndex]`) à
// son dernier état enregistré. Indispensable même quand `library`/`libraryActiveIndex` vont
// être réassignés juste après : l'ancienne entrée reste sinon dans `library` avec ses
// modifications non enregistrées gravées EN DIRECT dans son objet `headers` partagé (elles ne
// sont plus "en attente" nulle part une fois `activeEntryDirty` retombé sur la nouvelle
// entrée) — sans ce nettoyage, le prochain saveAppState() les persisterait quand même,
// silencieusement, à l'endroit exact que "Annuler" est censé éviter.
function discardActiveEntryDraft() {
  if (libraryActiveIndex >= 0 && activeEntryDirty && activeEntrySnapshot) {
    Object.keys(headers).forEach((k) => delete headers[k]);
    Object.assign(headers, activeEntrySnapshot.headers);
  }
  activeEntryDirty = false;
}

// "Enregistrer" (bouton + Ctrl+S) : `headers` est déjà `library[libraryActiveIndex].headers`
// (même référence) et porte donc déjà les modifications en direct — il ne reste qu'à figer
// un nouvel instantané et déclencher la persistance normale (jusque-là différée pour cette
// entrée, cf. saveAppState()).
function saveActiveEntry() {
  if (libraryActiveIndex < 0 || !activeEntryDirty) return;
  captureActiveEntrySnapshot();
  // APRÈS captureActiveEntrySnapshot() (qui remet ce flag à false comme à tout chargement
  // d'entrée) : ce premier "Enregistrer" volontaire sur cette partie fait entrer en mode
  // "confirmé" — cf. markActiveEntryDirty().
  activeEntryConfirmed = true;
  libraryDirty = true;
  renderLibrary();
  scheduleSave();
  showToast('Modifications enregistrées dans la bibliothèque.', 'success');
}

// "Annuler" : recharge les champs et les coups depuis le dernier instantané enregistré.
// Ne réassigne jamais `headers` à un nouvel objet (mutation en place de l'objet existant,
// partagé avec `library[libraryActiveIndex]`) — seul `game` est reconstruit, comme au
// chargement initial de l'entrée.
function revertActiveEntry() {
  if (libraryActiveIndex < 0 || !activeEntryDirty || !activeEntrySnapshot) return;
  const snapshot = activeEntrySnapshot;
  const { game: restoredGame } = loadGameFromPdn({ headers: snapshot.headers, moves: snapshot.moves, result: snapshot.headers.Result });
  game = restoredGame;
  Object.keys(headers).forEach((k) => delete headers[k]);
  Object.assign(headers, snapshot.headers);
  selectedSquare = null;
  activeEntryDirty = false;
  updateUnsavedIndicator();
  syncHeaderFieldsFromState();
  renderLibrary();
  refreshUI();
  showToast('Modifications annulées.', 'info');
}

el.btnSaveEntry.addEventListener('click', saveActiveEntry);
el.btnRevertEntry.addEventListener('click', revertActiveEntry);

el.btnLibraryAddCurrent.addEventListener('click', () => {
  const entry = currentGameAsLibraryEntry();
  if (entry.moves.length === 0) {
    showToast('Partie vide, rien à ajouter.', 'error');
    return;
  }
  library = library.concat([entry]);
  libraryActiveIndex = library.length - 1;
  // `entry.headers` est une copie fraîche ({...headers}) au moment de l'ajout — sans ce
  // rebranchement, `headers` (Bloc 1) resterait sur l'ANCIEN objet, dupliquant à nouveau
  // les données dès la prochaine édition (cf. commentaire dans loadParsedGame() sur la
  // référence partagée qui doit rester la source unique).
  headers = entry.headers;
  libraryDirty = true;
  // La partie vient d'être ajoutée : elle EST la version enregistrée, aucune modification en
  // attente (cf. activeEntrySnapshot) — sans ça, `entry` (copie fraîche de `headers`) et
  // l'instantané resteraient sur l'ancienne entrée précédemment active, s'ils existaient.
  captureActiveEntrySnapshot();
  renderLibrary();
  scheduleSave();
  showToast('Partie ajoutée à la bibliothèque.', 'success');
});

// Retire uniquement les caractères invalides dans un nom de fichier Windows (\/:*?"<>|) —
// contrairement à safeFilename() (export d'une seule partie), on garde espaces/accents
// lisibles ici : le nom de bibliothèque est saisi à la main par l'utilisateur, pas dérivé
// d'un nom de joueur PDN, donc pas besoin de le réduire à des underscores.
function suggestedLibraryFilename() {
  const name = libraryName.trim() || 'bibliotheque';
  return `${name.replace(/[\\/:*?"<>|]+/g, '_')}.pdn`;
}

el.btnLibrarySave.addEventListener('click', async () => {
  if (library.length === 0) {
    showToast('Bibliothèque vide, rien à sauvegarder.', 'error');
    return;
  }
  const saved = await saveTextWithPicker(suggestedLibraryFilename(), serializeLibraryWithName(library, libraryName), 'application/x-pdn', '.pdn');
  if (!saved) return; // fenêtre "Enregistrer sous" annulée par l'utilisateur
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
  return { headers, moves: fullMoveList(game) };
}

// Logique commune au bouton "Coller" et au raccourci Ctrl+V dans la zone "Coups joués"
// (cf. écouteur 'paste' sur el.moveList plus bas) : même garde-fou, même parsing, même
// comportement de chargement — pour que les deux entrées restent strictement synchronisées.
async function pastePdnText(text) {
  const games = parsePdn(text);
  if (games.length === 0) { showToast('Presse-papier : aucun PDN reconnu.', 'error'); return; }
  if (games.length === 1) {
    // Un seul PDN collé n'est PAS ajouté à la bibliothèque (ni ne la remplace) — même règle
    // que l'import fichier d'une seule partie (cf. importFiles) : juste chargé comme "partie
    // en cours", il faut un clic explicite sur "Ajouter la partie" pour l'y faire entrer.
    if (activeEntryDirty) {
      const ok = await confirmModal('Des modifications de la partie affichée ne sont pas enregistrées. Coller une partie les perdra. Continuer ?', 'Coller');
      if (!ok) return;
      discardActiveEntryDraft();
    }
    libraryActiveIndex = -1;
    renderLibrary();
    loadParsedGame(games[0]);
    return;
  }
  if (activeEntryDirty) {
    const ok = await confirmModal('Des modifications de la partie affichée ne sont pas enregistrées. Coller une partie les perdra. Continuer ?', 'Coller');
    if (!ok) return;
    discardActiveEntryDraft();
  } else if (libraryDirty && library.length > 0) {
    const ok = await confirmModal('Coller une partie remplacera la bibliothèque active. Les changements non sauvegardés seront perdus.', 'Coller');
    if (!ok) return;
  }
  // Fichier/presse-papier multi-parties : remplace la bibliothèque active, comme avant.
  library = games;
  // La dernière partie collée devient l'entrée active — même règle que "Importer"/"Ajouter
  // la partie" (un collage remplace toute la bibliothèque, mais peut contenir plusieurs
  // parties d'un coup ; on affiche la dernière plutôt que la première par cohérence).
  libraryActiveIndex = games.length - 1;
  libraryDirty = true;
  renderLibrary();
  loadParsedGame(library[libraryActiveIndex]);
  switchTab('library');
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

// Variante avec choix de nom/dossier via la fenêtre système "Enregistrer sous" (File System
// Access API, Chrome/Edge uniquement — pas de support Firefox/Safari à ce jour). Repli
// silencieux sur `downloadText()` (téléchargement direct vers le dossier Téléchargements)
// si l'API est absente, ou si l'utilisateur annule la fenêtre (`AbortError`, pas une vraie
// erreur) — ne PAS retomber sur le téléchargement direct dans ce cas précis, une annulation
// volontaire ne doit pas quand même écrire le fichier. Toute autre erreur retombe sur le
// téléchargement direct plutôt que de laisser l'utilisateur sans fichier du tout.
async function saveTextWithPicker(suggestedName, content, mime, extension) {
  if (typeof window.showSaveFilePicker !== 'function') {
    downloadText(suggestedName, content, mime);
    return true;
  }
  try {
    const handle = await window.showSaveFilePicker({
      suggestedName,
      types: [{ description: `Fichier ${extension.replace('.', '').toUpperCase()}`, accept: { [mime]: [extension] } }],
    });
    const writable = await handle.createWritable();
    await writable.write(content);
    await writable.close();
    return true;
  } catch (err) {
    if (err && err.name === 'AbortError') return false; // annulé par l'utilisateur
    downloadText(suggestedName, content, mime);
    return true;
  }
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
el.btnExportPdn.addEventListener('click', async () => {
  el.exportMenu.hidden = true;
  const saved = await saveTextWithPicker(`${safeFilename()}.pdn`, serializeToPdn(currentGamePayload()), 'application/x-pdn', '.pdn');
  if (!saved) return; // fenêtre "Enregistrer sous" annulée par l'utilisateur
  showToast('Export PDN téléchargé.', 'success');
});
el.btnExportTxt.addEventListener('click', async () => {
  el.exportMenu.hidden = true;
  const saved = await saveTextWithPicker(`${safeFilename()}.txt`, serializeToTxt(currentGamePayload()), 'text/plain', '.txt');
  if (!saved) return;
  showToast('Export TXT téléchargé.', 'success');
});

// --- export image (PNG) / PDF ------------------------------------------------------------
// Téléchargement direct (pas de fenêtre "Enregistrer sous" ici, contrairement au PDN/TXT —
// demande explicite de Mickaël pour ces 2 formats) : même mécanique que downloadText() mais
// pour un Blob binaire (image/PDF) plutôt qu'un texte.
function downloadBlob(filename, blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Infos de match communes aux 2 exports (légende image + page de garde PDF) — un seul
// endroit pour dériver nom/Elo/tournoi/score depuis `headers`, cohérent avec le reste de
// l'app (mêmes helpers que le Bloc 1 : formatPlayerName, parseResultScore).
function matchMetaLines() {
  const white = headers.White ? formatPlayerName(headers.White) : 'Blancs';
  const black = headers.Black ? formatPlayerName(headers.Black) : 'Noirs';
  const whiteElo = headers.WhiteElo || headers.WhiteRating;
  const blackElo = headers.BlackElo || headers.BlackRating;
  const [whiteScore, blackScore] = parseResultScore(headers.Result);
  const tournamentParts = [];
  if (headers.Event && headers.Event !== 'Partie libre') tournamentParts.push(headers.Event);
  if (headers.Round && headers.Round !== '—') tournamentParts.push(`Ronde ${headers.Round}`);
  if (headers.Date && headers.Date !== '—') tournamentParts.push(formatPdnDate(headers.Date));
  return {
    white, black, whiteElo, blackElo,
    whiteScore, blackScore,
    namesLine: `${white}${whiteElo ? ` (Elo ${whiteElo})` : ''}  —  ${black}${blackElo ? ` (Elo ${blackElo})` : ''}`,
    tournamentLine: tournamentParts.join(' · '),
    scoreLine: whiteScore !== null && blackScore !== null ? `Score ${whiteScore} — ${blackScore}` : '',
  };
}

// Le damier est déjà un <canvas> natif — pas besoin d'une lib de capture DOM (html2canvas) :
// on compose directement une légende sous une copie de son image bitmap. Couleurs alignées
// sur les variables CSS du thème (--bg-0/--gold/--text-1, cf. :root dans style.css) pour ne
// pas produire une image au fond clair générique dans une appli par ailleurs 100% sombre.
async function exportBoardImage() {
  const boardCanvas = renderer.canvas;
  const dpr = renderer.dpr || 1;
  const meta = matchMetaLines();
  const lines = [meta.namesLine];
  const sub = [meta.tournamentLine, meta.scoreLine].filter(Boolean).join('   ·   ');
  if (sub) lines.push(sub);
  lines.push(`Coup ${game.history.length}`);

  const padding = 16 * dpr;
  const lineHeight = 24 * dpr;
  const legendHeight = padding * 2 + lines.length * lineHeight;
  const out = document.createElement('canvas');
  out.width = boardCanvas.width;
  out.height = boardCanvas.height + legendHeight;
  const ctx = out.getContext('2d');
  ctx.fillStyle = '#100c09'; // --bg-0
  ctx.fillRect(0, 0, out.width, out.height);
  ctx.drawImage(boardCanvas, 0, 0);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  let y = boardCanvas.height + padding + lineHeight / 2;
  lines.forEach((line, i) => {
    ctx.font = i === 0 ? `bold ${17 * dpr}px system-ui, sans-serif` : `${13 * dpr}px system-ui, sans-serif`;
    ctx.fillStyle = i === 0 ? '#d4af69' : '#c9bba0'; // --gold / --text-1
    ctx.fillText(line, out.width / 2, y);
    y += lineHeight;
  });

  const blob = await new Promise((resolve) => out.toBlob(resolve, 'image/png'));
  downloadBlob(`${safeFilename()}_coup${game.history.length}.png`, blob);
}

// Capture le damier à la position FINALE de la partie (toutes les prises/coups joués),
// indépendamment de la position actuellement affichée/naviguée par l'utilisateur (contraire
// à exportBoardImage() ci-dessus, qui capture la position courante — cf. demande Mickaël).
// jumpToPly() navigue le jeu réel puis revient à l'index de départ ; les 2 sauts se font de
// façon synchrone (pas d'animation, cf. son implémentation) donc dans la même frame que le
// reste de cette fonction — le navigateur ne peint jamais l'état intermédiaire, aucun
// flash visible pour l'utilisateur.
function boardImageDataUrlAtFinalPosition() {
  const originalIdx = game.history.length - 1;
  const finalIdx = fullMoveList(game).length - 1;
  if (finalIdx !== originalIdx) jumpToPly(finalIdx);
  const dataUrl = renderer.canvas.toDataURL('image/png');
  if (finalIdx !== originalIdx) jumpToPly(originalIdx);
  return dataUrl;
}

// PDF complet : page de garde + notation intégrale (2 colonnes Blancs/Noirs, commentaires
// inclus) + diagramme de la position finale. Thème sombre bronze/doré cohérent avec l'appli
// (jsPDF ne fournit pas de fond de page global : on redessine un rectangle plein sur CHAQUE
// page, cf. `paintPageBackground()` appelé après chaque `addPage()`).
function exportGamePdf() {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 48;
  const BG = '#100c09';
  const GOLD = '#d4af69';
  const TEXT_1 = '#c9bba0';
  const TEXT_2 = '#8c7c63';
  const BLACK_BRONZE = '#c9a06a';

  function paintPageBackground() {
    doc.setFillColor(BG);
    doc.rect(0, 0, pageW, pageH, 'F');
  }

  const meta = matchMetaLines();

  // --- page de garde ---
  paintPageBackground();
  doc.setTextColor(GOLD);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(22);
  doc.text(`${meta.white}  —  ${meta.black}`, pageW / 2, 140, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(13);
  doc.setTextColor(TEXT_1);
  const eloLine = [
    meta.whiteElo ? `${meta.white} : Elo ${meta.whiteElo}` : null,
    meta.blackElo ? `${meta.black} : Elo ${meta.blackElo}` : null,
  ].filter(Boolean).join('   ·   ');
  let coverY = 180;
  if (eloLine) { doc.text(eloLine, pageW / 2, coverY, { align: 'center' }); coverY += 22; }
  if (meta.tournamentLine) { doc.text(meta.tournamentLine, pageW / 2, coverY, { align: 'center' }); coverY += 22; }
  if (meta.scoreLine) {
    doc.setTextColor(GOLD);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.text(meta.scoreLine, pageW / 2, coverY + 10, { align: 'center' });
  }

  // --- notation complète ---
  doc.addPage();
  paintPageBackground();
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(GOLD);
  doc.text('Notation', margin, margin);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  let y = margin + 26;
  const lineH = 16;
  const colNum = margin;
  const colWhite = margin + 46;
  const colBlack = margin + 190;
  const moves = fullMoveList(game);
  for (let i = 0; i < moves.length; i += 2) {
    if (y > pageH - margin) {
      doc.addPage();
      paintPageBackground();
      y = margin;
    }
    const white = moves[i];
    const black = moves[i + 1];
    doc.setTextColor(TEXT_2);
    doc.text(`${i / 2 + 1}.`, colNum, y);
    doc.setTextColor(TEXT_1);
    doc.text(moveNotation(white), colWhite, y);
    if (black) {
      doc.setTextColor(BLACK_BRONZE);
      doc.text(moveNotation(black), colBlack, y);
    }
    y += lineH;
    // Commentaires : ligne(s) italique(s) indentée(s) sous le coup concerné, dans la
    // couleur neutre du texte (pas d'emphase de couleur, juste le style italique).
    for (const mv of [white, black]) {
      if (!mv || !mv.comment) continue;
      if (y > pageH - margin) { doc.addPage(); paintPageBackground(); y = margin; }
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(9.5);
      doc.setTextColor(TEXT_2);
      const wrapped = doc.splitTextToSize(mv.comment, pageW - colWhite - margin);
      wrapped.forEach((wline) => {
        if (y > pageH - margin) { doc.addPage(); paintPageBackground(); y = margin; }
        doc.text(wline, colWhite, y);
        y += 12;
      });
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(11);
      y += 2;
    }
  }

  // --- diagramme de la position finale ---
  doc.addPage();
  paintPageBackground();
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(GOLD);
  doc.text('Position finale', pageW / 2, margin, { align: 'center' });
  const diagramDataUrl = boardImageDataUrlAtFinalPosition();
  const diagramSize = Math.min(pageW - margin * 2, pageH - margin * 2 - 40);
  doc.addImage(diagramDataUrl, 'PNG', (pageW - diagramSize) / 2, margin + 30, diagramSize, diagramSize);

  doc.save(`${safeFilename()}.pdf`);
}

el.btnExportImage.addEventListener('click', async () => {
  el.exportMenu.hidden = true;
  await exportBoardImage();
  showToast('Image exportée.', 'success');
});
el.btnExportPdf.addEventListener('click', () => {
  el.exportMenu.hidden = true;
  exportGamePdf();
  showToast('PDF exporté.', 'success');
});

// --- partage (lien compressé + QR code) ---------------------------------------------------
// Pas de backend : le PDN de la partie en cours est compressé (LZString, vendorisée en local
// — cf. js/vendor/lz-string.min.js, `compressToEncodedURIComponent` produit directement une
// chaîne déjà "URL-safe", pas besoin d'encodeURIComponent en plus) et embarqué tel quel dans
// le paramètre `?p=` de l'URL. Quiconque ouvre ce lien reçoit la partie complète sans qu'elle
// n'ait jamais transité par un serveur.
const SHARE_URL_WARN_THRESHOLD = 2000;

function buildShareUrl() {
  const pdn = serializeToPdn(currentGamePayload());
  const compressed = LZString.compressToEncodedURIComponent(pdn);
  const url = new URL(window.location.href);
  url.search = '';
  url.hash = '';
  url.searchParams.set('p', compressed);
  return url.toString();
}

function openShareModal() {
  const url = buildShareUrl();
  const tooLong = url.length > SHARE_URL_WARN_THRESHOLD;
  el.shareWarning.hidden = !tooLong;
  el.shareBody.hidden = tooLong;
  if (tooLong) {
    el.shareWarning.textContent = `Cette partie est trop longue pour tenir dans un lien partageable (${url.length} caractères, au-delà de ${SHARE_URL_WARN_THRESHOLD}). Utilise plutôt l'export PDN/PDF pour la transmettre.`;
  } else {
    el.shareLinkInput.value = url;
    el.shareQr.innerHTML = '';
    // eslint-disable-next-line no-new -- l'instance QRCode s'attache elle-même au conteneur, rien à garder
    new QRCode(el.shareQr, {
      text: url,
      width: 200,
      height: 200,
      colorDark: '#100c09',
      colorLight: '#ffffff',
      correctLevel: QRCode.CorrectLevel.M,
    });
  }
  el.shareOverlay.hidden = false;
}

el.btnShare.addEventListener('click', () => {
  el.exportMenu.hidden = true;
  openShareModal();
});
el.shareCloseBtn.addEventListener('click', () => { el.shareOverlay.hidden = true; });
el.shareCopyBtn.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(el.shareLinkInput.value);
    showToast('Lien copié dans le presse-papier.', 'success');
  } catch {
    el.shareLinkInput.select();
    showToast('Impossible de copier automatiquement — sélectionné, utilise Ctrl+C.', 'error');
  }
});

// Chargement d'une partie partagée via `?p=` (lien généré par openShareModal ci-dessus) :
// charge la partie comme "partie en cours" SANS toucher à la bibliothèque locale de la
// personne qui ouvre le lien (même principe que l'import à une seule partie dans
// importFiles() — cf. son commentaire — mais ici on ne passe même pas par renderLibrary()
// puisque `library` lui-même n'est pas modifié). Le paramètre est retiré de l'URL une fois
// consommé (`history.replaceState`) pour qu'un F5 ultérieur, après que l'utilisateur ait
// continué à jouer/modifier la partie, ne réimporte pas silencieusement la version partagée
// par-dessus son travail.
function loadSharedGameFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const compressed = params.get('p');
  if (!compressed) return false;
  history.replaceState(null, '', window.location.pathname);
  try {
    const pdn = LZString.decompressFromEncodedURIComponent(compressed);
    if (!pdn) return false;
    const games = parsePdn(pdn);
    if (games.length === 0) return false;
    libraryActiveIndex = -1;
    loadParsedGame(games[0]);
    return true;
  } catch {
    showToast('Lien de partage invalide ou corrompu.', 'error');
    return false;
  }
}

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
// Lien de partage (`?p=`) : prioritaire sur la partie en cours restaurée ci-dessus (on vient
// de cliquer un lien exprès pour voir CETTE partie-là), mais la bibliothèque locale déjà
// restaurée reste intacte — loadSharedGameFromUrl() ne la touche jamais.
loadSharedGameFromUrl();
refreshUI();
// Chargement asynchrone, non bloquant pour l'affichage initial — les avatars affichent la
// lettre par défaut le temps du fetch, puis basculent sur la photo pré-remplie si trouvée
// (et si aucun choix manuel n'existe déjà pour ce nom).
loadPlayerPhotoPrefill().then(() => {
  applyAvatar('white', headers.White);
  applyAvatar('black', headers.Black);
});
