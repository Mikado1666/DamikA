# DAMIKA — Contexte technique

## 1. Projet et stack

PWA de dames internationales 10x10 (FMJD), vanilla JS (ES modules natifs, pas de build
step, pas de framework), rendu plateau en Canvas 2D. Prod : https://damika.shell-green.workers.dev
(Cloudflare Workers + assets statiques). Un seul backend : un Worker Cloudflare pour la
recherche de photos Toernooibase. Spec : `CAHIER_DES_CHARGES.md` (partiellement obsolète :
thèmes/styles de pions). Récits de session détaillés : `docs/HISTORIQUE_SESSIONS.md`.

```
index.html            structure, aucune logique
css/style.css         tout le style (thème sombre, variables CSS en tête)
js/engine/rules.js    moteur de règles pur, source de vérité
js/ai/fastboard.js    moteur RAPIDE de recherche (Int8Array 50 cases), pas utilisé par l'UI
js/ai/eval.js         évaluation statique (centipions, poids dans EVAL_WEIGHTS), pas utilisée par l'UI
js/ai/search.js       recherche alpha-bêta + quiescence + TT : analyse(position, options)
js/ai/worker.js       Web Worker (moves, perft, analyse, stop), branché à l'UI par l'analyse (2b)
js/ai/analysis-format.js  fonctions PURES d'affichage de l'analyse (barre, score, mat, coups)
js/ai/analysis-controller.js  cycle de vie du Worker d'analyse (debounce, terminate, ids)
tests/                tests Node sans framework (moteur, évaluation, recherche, worker)
js/render/board.js    BoardRenderer (canvas)
js/pdn/               parser.js, loader.js, serializer.js, storage.js
js/main.js            état de l'appli, écouteurs DOM, rendu
worker/index.js       Worker Toernooibase (wrangler.toml)
scripts/              scripts Node Toernooibase (voie de secours)
sw.js                 service worker (désactivé côté client)
```

## 2. Règles de travail et pièges techniques

### Lancer / tester
- Serveur local obligatoire (les modules ES ne marchent pas en `file://`) :
  `python -m http.server 8934` puis `http://localhost:8934/index.html`.
- **Ctrl+Shift+R après toute modif `.js`** : `location.reload()` et même une nouvelle
  tab peuvent servir un module en cache → on teste du code obsolète.
- Le Service Worker est désactivé volontairement (`js/main.js`, tout en bas : il se
  désenregistre). Pour le réactiver : `navigator.serviceWorker.register('sw.js')` + bump
  `CACHE_NAME` dans `sw.js`.
- Tests Node du MOTEUR uniquement (`tests/`, aucun framework, aucun navigateur) :
  `node tests/perft.mjs 9 6` (perft position initiale vs références + rules.js),
  `node tests/diff.mjs` (différentiel rapide vs rules.js, parties aléatoires + positions
  aléatoires + PDN), `node tests/perft-positions.mjs`, `node tests/worker.mjs`,
  `node tests/bench.mjs`. Étage 2a (IA) : `node tests/eval-symmetry.mjs`,
  `node tests/search-consistency.mjs` (~1 min), `node tests/tactics.mjs`, `node tests/mate.mjs`,
  `node tests/match.mjs` (~70 s), `node tests/search-perf.mjs`, `node tests/worker-analyse.mjs`, `node tests/analysis-format.mjs`, `node tests/analysis-controller.mjs`.
  `tests/solver.mjs` = solveur indépendant (rules.js seul) ; `tests/mine-positions.mjs` régénère
  `tests/data/` (positions sans aucun nom de joueur, suivies par git). Les PDN de test vont dans `tests/pdn-local/` (ignoré par git : noms de
  joueurs). Pour l'interface, il n'y a pas de suite de tests. Pour tester une position : listener temporaire
  `damika:setBoard` (et `damika:dump`) en bas de `main.js` (pose `game.board`,
  `sideToMove`, vide `history`/`future`, `selectedSquare = null`, `refreshUI()`),
  déclenché via `CustomEvent`. **Toujours retirer avant commit.**
- Automatisation navigateur : les coordonnées de clic sont dans l'espace pixel du
  screenshot, pas en pixels CSS (ratio ~0.82 à 1.22 selon la machine). Utiliser `find` ou
  `getBoundingClientRect()` plutôt qu'estimer à l'œil. Tester un vrai déplacement de
  curseur (survol → décalage → clic), pas un survol statique.

### Interdits et pièges UI
- **Jamais `window.confirm()`/`alert()`/`prompt()`** : bloquent tout le fil JS. Utiliser
  `confirmModal(message, okLabel)` (Promise, `.confirm-overlay`).
- **Tout élément `[hidden]` qui déclare son propre `display` doit avoir la règle jumelle
  `.xxx[hidden] { display: none; }`** (sinon `display` auteur l'emporte sur l'UA).
- **Aucun espace mort (margin/gap) entre un déclencheur de survol et son popover/lien** :
  il coupe le `:hover` (bug `.move-comment-hint` et popover volume). Décalage visuel via
  `padding` d'un wrapper transparent ; lien du commentaire à `top:0; left:0` (droite pour
  les Noirs), jamais sur la ligne du dessous. Drag du slider volume : classe
  `.sound-dragging`.
- Clic/double-clic sur une liste reconstruite : **ne pas appeler `renderLibrary()` sur un
  simple clic de sélection** (détruit le nœud entre les deux clics) ; basculer seulement
  `.active`. `renderLibrary()` uniquement quand le contenu change réellement.
- `TEXTAREA` doit rester dans les tags exclus du raccourci clavier global (sinon Espace
  avalé par la lecture auto). Le popover de commentaire fait aussi `stopPropagation()`.
- Le canvas écoute `pointerdown`, **pas `click`** (le `click` n'est pas fiable). Position
  toujours en fraction (`xFrac`/`yFrac` via `getBoundingClientRect()`) →
  `squareAtFraction()`, jamais en coordonnées brutes du canvas.
- `.brand` : `user-select:none` (sinon un clic qui bouge d'un pixel devient une sélection
  de texte, pas de `click`). `.topbar` : `position:relative; z-index:5` (le
  `.players-rail`, décalé par `transform: translateY` dans `alignLayout()`, déborde et
  intercepte les clics). `.player-name` : retour à la ligne autorisé, pas d'ellipsis.
- Molette sur le damier = coup suivant/précédent (`goToPrevMove()`/`goToNextMove()`),
  listener non-passif uniquement sur le `<canvas>`, anti-rafale 150 ms.

### Thème clair « Miel doré » (validé par Mickaël le 19/10/2026)
- Tout passe par les variables du bloc `:root[data-theme="light"]` de `css/style.css` (une source par couleur) ;
  le thème sombre ne doit pas bouger. Chaque variable sémantique du thème clair a, dans `:root` (sombre), une valeur
  IDENTIQUE à l'ancienne valeur en dur : `--gold-text` (or utilisé comme TEXTE : jamais `color: var(--gold)`),
  `--gold-accent` (or décoratif : jauge, survol export), `--bg-glow` (centre du dégradé du `body`),
  `--side-tag-*`, `--elo-badge-fg`, `--avatar-ring/bg/letter-*`, `--chip-border`, `--on-danger`, `--best-move-text`,
  `--meta-sep-opacity`, `--placeholder-color` (clair seulement).
- Contrastes MESURÉS (script WCAG, 71 textes, 0 sous 4,5:1 / 3:1 pour le gros texte) : toute nouvelle couleur de texte du
  thème clair doit être vérifiée contre les pires fonds (`--plaque-2` en bas des cartes joueurs, `--bg-2`, dégradés de plaque).
  Tableau avant/après dans `docs/SESSION_DERNIERE.md`. Ne pas assombrir les fonds davantage (risque d'éblouissement
  évoqué par Mickaël) : corriger les avant-plans.
- Piège : `.meta-field` (défini après `.elo-badge`) écrasait la couleur du badge Elo ; d'où `.meta-field.elo-badge`.
- Les numéros de cases sont dessinés dans le canvas (`--coord-text`) : hors des mesures par script.

### Dimensionnement du damier
- `BoardRenderer.resize()` mesure la largeur depuis `#app` moins rail (268) et panneau
  (405), **jamais depuis `.board-wrap`** (boucle de dépendance avec `--board-px` : damier
  bloqué en petit). Lire le commentaire de `resize()` avant d'y toucher.
- Variable `--board-px` sur `:root` ; `.layout` et `.topbar-inner` partagent la même
  formule `max-width: calc(var(--board-px, 950px) + 268px + var(--side-panel-w) + 52px + 48px)`.
  `.board-column` épouse `width: var(--board-px)`, pas de `flex-grow`. Plafond 950px,
  plancher 280px. Police des coordonnées plafonnée à 12px. Repères de rangées à DROITE du damier (vrais numéros du bord droit à l'écran : 5…45, retourné 6…46 ; la gauche est occupée par la jauge), repères de colonnes (46-50) en bas.

### Moteur et modèle de données
- `generateLegalMoves(board, color)` → `{ captures, simples, mustCapture }`, grande prise
  incluse : source de vérité de la légalité POUR L'INTERFACE, ne jamais la dupliquer dans l'UI.
  Exception assumée : `js/ai/fastboard.js` est un second moteur, destiné à la recherche (IA), validé
  coup pour coup contre `rules.js` par `tests/diff.mjs` et par perft. Toute modification de règle doit
  être faite dans les deux, puis `node tests/diff.mjs` doit rester sans divergence.
- **Pièces prises en cours de rafle : elles restent sur le plateau et BLOQUENT** jusqu'à la fin de la
  rafle (jamais traversables ni atterrissables, y compris par la dame). Bug corrigé le 18/10/2026 dans
  `findCaptureSequences` (branche dame de `rules.js`) : elles étaient traitées comme des cases vides.
  Pour un pion, atterrir sur une pièce prise est géométriquement impossible (parité de rangée) : la
  condition `!deadSet.has(landSq)` (branche pion) est donc sans effet.
- Convention de comptage des coups (perft, `FastBoard.generateMoves()`) : deux rafles de même
  départ, même arrivée et mêmes pièces prises = UN coup (convention Gilbert/Boomstra du World Draughts
  Forum). `generateMoves(false)` liste tous les chemins, comme `rules.js`.
- Étape de capture `{ from, to, capturedThisStep, promoted }` : `from`/`to` = cette étape,
  pas la séquence. Chemin complet : `[seq[0].from, ...seq.map(s => s.to)]`.
- Notation FMJD : une rafle = départ×arrivée (`27x9`), jamais le chemin complet ; le
  chargeur PDN accepte les deux en import.
- `history` (chrono) / `future` (antéchronologique, LIFO). Liste complète :
  `[...history.map(h=>h.move), ...[...future].reverse().map(f=>f.move)]` =
  `fullMoveList()`. Le `comment` vit sur les entrées `history`/`future`
  (`getCommentAt`/`setCommentAt`, même indexation que `fullMoveList()`).
- `startNewGame()` = pattern de reset complet (`game`, `headers = { Event: 'Partie
  libre' }`, `selectedSquare`, `libraryActiveIndex = -1`, `renderLibrary()`,
  `syncHeaderFieldsFromState()`, `refreshUI()`).
- `isGameOver()` / son de fin : uniquement au point où un coup vient d'être commité
  (`playMove()`, autoplay, `goToNextMove()`), **jamais dans `refreshUI()`**.

### PDN
- **Convention commentaire : `{commentaire} coup` (AVANT le coup qu'il annote)** — le
  tokenizer l'attache au prochain token 'move'. Écrire après casse le round-trip.
- En-têtes sans guillemets acceptés (`[White Callegari, Mickael]`), guillemets retirés
  seulement s'ils sont présents. Elo : `WhiteElo || WhiteRating` (idem Black).
- URL photo mal formée à la source (`WhiteUrl`/`BlackUrl`) reconstruite par
  `fixMalformedToernooibaseUrl()` ; elle alimente `playerPhotoPrefill`.
- Affichage seulement : nom "Prénom Nom" et date JJ/MM/AAAA ; `headers.White/Black` et
  l'export gardent "Nom, Prénom" et AAAA.MM.JJ.
- `serializeToPdn`/`serializeLibraryEntryToPdn`/`serializeToTxt` dérivent le résultat de
  `headers.Result` (plus de paramètre `result` séparé). Nom de bibliothèque : en-tête non
  standard `[LibraryName "..."]` avant la 1ʳᵉ partie.

### Bibliothèque et persistance
- **`headers` (Bloc 1) et `library[libraryActiveIndex].headers` sont la MÊME référence
  d'objet** (`headers = newHeaders`, jamais de copie `{...headers}`, y compris dans
  `loadParsedGame()` et `restoreAppState()`). Ne jamais réintroduire de copie ni de
  fonction de sync. Le titre d'une entrée dérive toujours de `headers.White/Black` ;
  le renommage libre (`headers.Label`) a été retiré (nettoyé dans `renderLibrary()`).
- **Clés localStorage (liste complète)** : `damika:library-state` (PDN de la bibliothèque, index
  actif, PDN courant, `libraryDirty`, `entryIds`, `originals` = versions d'origine, format
  version 2), `damika:library-extras` (favoris et récents, par empreinte), `damika:player-photo-registry`,
  et les réglages d'interface : `damika:ui-theme` (sombre / clair "Miel doré"), `damika:board-theme`
  (`bois`, `ardoise`, `vert`, `beige`), `damika:piece-style` (`classique`, `relief`, `bois gravé`),
  `damika:piece-size`, `damika:speed` (curseur 1-10, partagé animation + lecture auto),
  `damika:arrow-visible` (`1`/`0`, flèche du dernier coup), `damika:arrow-duration`,
  `damika:sound-muted`, `damika:sound-volume`, `damika:side-tab` (`moves` ou `library`).
  Mécanisme commun des réglages : valeur lue AVANT le premier rendu, absente/invalide = défaut,
  accès dans un `try/catch` (`Object.hasOwn` pour valider un nom de thème/style). `scheduleSave()`
  débattue 400 ms + flush sur `beforeunload`.
- **Réglages volontairement NON persistés** : retournement du plateau (`flipped`), filtre
  Toutes/Récentes/Favoris et texte de recherche de la Bibliothèque, plein écran (interdit sans geste
  de l'utilisateur).
- **Enregistrement automatique : toute modification d'une partie EXISTANTE de la bibliothèque
  (coup, commentaire, symbole, diagramme, en-tête) est enregistrée automatiquement et en
  silence**, par un seul point d'entrée, `activeEntryModified()` (recopie `game` dans
  `library[i].moves` via `commitActiveEntryMoves()`, puis `scheduleSave()`). Il n'y a plus de
  bandeau "Modifications non enregistrées", ni de dirty state de l'entrée, ni de mode "confirmé", ni de
  snapshot d'annulation (`libraryDirty` subsiste : il ne sert qu'au garde-fou "bibliothèque non sauvegardée dans un fichier"). Un petit "✓ Enregistré" (`#save-indicator`) confirme l'écriture. Une
  partie neuve (`libraryActiveIndex < 0`) garde le comportement d'avant. Ctrl+S = écriture immédiate
  (`flushSaveNow()`).
- **Sécurité : version d'origine.** À la première modification d'une partie, son état d'ouverture
  est conservé une seule fois (`ensureOriginalVersion()`, jamais écrasé), persisté dans
  `localStorage` (`originals`, indexé par `entryIds`, identifiant par entrée via un `WeakMap` qui
  suit l'objet lors des réordonnancements). Le bouton "↺ Revenir à la version d'origine" (en-tête
  de la Bibliothèque ET pied de "Coups joués", classe commune `.revert-original-btn`, un seul code)
  n'apparaît que si la partie diffère de son origine ; confirmation, puis restauration ; la copie
  d'origine reste en place. À ne pas confondre avec Rétablir (redo des coups).
- **Forme canonique d'une entrée** : celle de `parsePdn()` (notation NUE + champ `annotation` +
  `comment`), jamais `32-28!` dans `notation` (`currentGameAsLibraryEntry()` la produit ;
  `loadGameFromPdn()` rejoue la notation contre le moteur).
- "Ouvrir une bibliothèque" et "Coller" **remplacent** (garde-fou `confirmModal()` si non
  sauvegardée) ; "Importer" **ajoute**. Après tout ajout, la DERNIÈRE partie ajoutée devient
  l'entrée active (`libraryActiveIndex = length - 1` + `loadParsedGame()`). Un import à
  une seule partie n'écrit PAS dans la bibliothèque (seul "Ajouter la partie" le fait) ;
  un fichier multi-parties si. Suppression d'entrée : `confirmModal()`, définitive.
- Chargement d'une partie depuis la Bibliothèque : silencieux
  (`loadParsedGame(..., { silent: true })`).
- Réordonnancement : drag&drop **manuel** `pointerdown/move/up` (pas le drag&drop HTML5
  natif), seuil 4 px (`LIBRARY_DRAG_THRESHOLD_PX`), flag `libraryDragJustEnded` pour
  ignorer le `click` qui suit, placeholder + FLIP.
- Partage par lien : `?p=` (LZString), chargé par `loadSharedGameFromUrl()` sans toucher à
  la bibliothèque locale, paramètre retiré ensuite (`history.replaceState`). QR sur fond
  blanc. Avertissement si lien > ~2000 caractères.
- Export : `saveTextWithPicker()` (File System Access API, repli téléchargement direct ;
  une annulation n'écrit rien). PDF : jsPDF local (`exportGamePdf()`), rectangle de fond redessiné sur
  CHAQUE page.
- **Export PDF "Partie complète" (style livre, V0 validée, à peaufiner lors de la passe complète
  avant Mobile)** : en-tête centré (pions ○/● dessinés, tournoi · ronde · date, Elo, score,
  seulement si présents), notation en TEXTE CONTINU (numéro en gras, coups annotés en gras avec
  leur symbole, repère "N..." pour un coup Noirs en tête de ligne après un bloc ou de page), puis un
  BLOC teinté après chaque coup commenté : diagramme à gauche (≈ 4,8 cm, **dessiné en vectoriel**
  par `drawDiagram()`, couleurs "papier", orientation du damier de l'app, numéros de bord lisibles),
  "Trait aux Blancs/Noirs" + commentaire à droite (retours à la ligne respectés, mots longs coupés
  par `wrapText()`). Un bloc n'est jamais coupé entre deux pages : s'il ne tient pas, il est
  **reporté en haut de la page suivante** avec la mention "Après N. xx-xx" pendant que la notation
  remplit la page. Pied de page "DamikA — exporté le … · page i/n" sur chaque page. Les positions
  des diagrammes sont lues avant le dessin par `boardAtPly()` (navigue le vrai jeu puis revient).
  Réglages en tête : `BLOCK_PAD`, `DIAGRAM_SIZE`, `COMMENT_FS`, `FS`.
- **Marqueur de diagramme** (le commentaire d'un coup porte l'indicateur "inclure un diagramme") :
  stocké DANS le texte du commentaire, `[diagramme]` seul (diagramme sans texte) ou
  `texte` + saut de ligne + `[diagramme]`. `hasDiagramMarker()` est tolérant (fin de texte, avec ou
  sans saut de ligne, car `sanitizeComment()` du serializer fait un `trim()`),
  `stripDiagramMarker()` le retire toujours (jamais affiché), `withDiagramMarker()` l'écrit. Ne pas
  réintroduire de test strict sur le saut de ligne.

### Photos joueurs
- Fichier local compressé via `<canvas>` (160×160 JPEG 0.8) ; **URL externe stockée telle
  quelle, sans compression** (canvas cross-origin "taint"). `onerror` → avatar lettré.
- `lookupPhotoUrl()` : correspondance exacte tolérante (`nameTokens()` : casse, virgule,
  ordre ignorés), puis repli nom de famille seul (`surnameOf()`) ; **photos différentes
  pour un même nom de famille = aucune choisie** (jamais de risque de mauvaise photo).
  Registre manuel (`playerPhotoRegistry`) vérifié en entier avant `playerPhotoPrefill` ;
  une ambiguïté manuelle ne se rabat jamais sur le pré-remplissage.
- `playerPhotoPrefill` (JSON `data/player-photos.json` + tags `WhiteUrl`/`BlackUrl`) reste
  **distinct** du registre manuel ; `loadPlayerPhotoPrefill()` **fusionne** (fichier en
  base, entrées de session prioritaires), ne remplace jamais la table.
- Aucun identifiant Toernooibase dans les PDN standards : le matching se fait par nom.

### Son
- Seul le pack Standard Lidraughts est conservé (`assets/sounds/`, provenance dans
  `SOURCES.txt`) ; `game-start.mp3` = CC0 Kenney (pas d'équivalent Lidraughts).
  `Victory/Defeat/Draw` Lidraughts sont identiques : `game-end.mp3` suffit.
- Pool de 3 `<audio>` par événement. Politique autoplay : un son bloqué est mémorisé
  (`pendingUnlockSound`) et rejoué au 1er `pointerdown`.

### Backend Toernooibase (Cloudflare Worker) et déploiement
- Une seule fonctionnalité en dépend : bouton "🔍 Récupérer sur Toernooibase" du popover
  photo. Worker `damika-toernooibase-photos` :
  `https://damika-toernooibase-photos.shell-green.workers.dev` (constante
  `TOERNOOIBASE_WORKER_URL` en haut de `js/main.js`). GET `?name=` → `resolved` /
  `ambiguous` / `not_found` / `no_photo` / `error`.
- **Logique de résolution nom→SpId dupliquée** dans `worker/index.js` et
  `scripts/resolve-toernooibase-players.mjs` : toute correction (ex. pagination) est à
  répercuter **dans les deux**.
- Pagination de l'index alphabétique : paramètre `tel2` (1-indexé) ; `teller` est un no-op.
  Homonymes : aucun choix automatique, SpId listés pour vérification manuelle.
- Risque : Toernooibase peut bloquer le trafic Worker (anti-bot) sans préavis. Filet :
  toast d'erreur → URL manuelle ou scripts Node (`fetch-toernooibase-photos.mjs`,
  `resolve-toernooibase-players.mjs`), gardés intacts. Le script prend un SpId par joueur
  (pas de recherche par nom exploitable en GET).
- Palier gratuit Workers : ~100 000 req/jour, 10 ms CPU/req (à revérifier sur la page
  tarifs).
- Déploiement Worker : `cd worker && npx wrangler login && npx wrangler deploy`. Si l'URL
  change, mettre à jour `TOERNOOIBASE_WORKER_URL`.
- Déploiement du site : Wrangler CLI (upload de fichiers statiques, pas de CI ; le
  dépôt GitHub public `Mikado1666/DamikA` n'est qu'un miroir du code, il ne déclenche aucun
  déploiement), compte Cloudflare "Shell Green", modèle "Workers + assets" (`.workers.dev`).
  **Ne jamais lancer wrangler depuis le dossier des assets** (fuite de fichiers internes
  `wrangler-account.json`/worker vide ; lancer depuis un dossier de travail séparé et
  vérifier qu'ils renvoient 404).

## 3. État actuel

**Livré et validé** : moteur FMJD complet (dont promotion en cours de rafle : seulement si le
pion s'arrête sur la dernière rangée) ; plateau responsive ; 3 styles de pions (Classique,
Relief, Bois gravé) ; taille des pions réglable (Petit/Normal/Grand) ; durée d'affichage de
la flèche du dernier coup réglable ; réglages d'interface persistés après F5 ; thème clair "Miel doré" ; aide clavier (touche `?`) ;
import/export PDN, TXT, PNG ; export PDF style livre (fond clair, blocs diagramme + commentaire
sur les coups annotés) ; Bibliothèque persistante (Sauvegarder/Ouvrir, ordre manuel par drag&drop,
édition inline, recherche texte, fichiers récents, favoris, filtres Toutes/Récentes/Favoris) ; enregistrement automatique des parties
de la bibliothèque + retour à la version d'origine ; commentaires de coup et symboles
d'annotation (`!`, `?`, `!!`, `??`) ; Bloc 1 "Plaque tournoi" (Elo, titre, score libre,
photos, Toernooibase) ; partage lien + QR ; sons + volume/mute ; identité visuelle Damika ;
"Nouvelle partie" ; navigation molette ; déploiement public.

**En pause** : style de pion "Toernooibase" (non conforme aux images
`reference-pion-toernooibase-1/2.png`, retiré de `PIECE_STYLES` dans `js/render/board.js` ;
`drawPieceToernooibase` existe toujours mais n'est plus branchée).

**Backlog** (dans cet ordre ; ne rien commencer sans demande) :
1. Passe complète de vérification et de peaufinage (PDF compris, V0 validée), avant Mobile.
2. Mobile, dont le bug du lien de partage qui affiche un écran noir sur téléphone.
3. Réactiver le Service Worker (mode hors-ligne), en dernier.
Plus tard : style de pion "Toernooibase" (en pause, voir ci-dessus), export en lot,
conformité FMJD approfondie (dont les limites de finale FMJD 6.3 « 16 coups » et 6.4 « 5 coups » du moteur
d'analyse : NON implémentées, « plus tard, à décider » avec Mickaël, voir étape 2), puis IA (bloc C de `RETOURS_SESSION_2026-09-16.md`) : les étages 1
(moteur rapide), 2a (recherche + évaluation) et 2b (analyse dans la liseuse) sont LIVRÉS, voir
« État final du chantier IA » en §3 bis ; l'étage 3 (apprentissage) est en cours : étapes 3.1, 3.2 et 3.3 livrées (V1b reste le meilleur modèle validé), voir plus bas.

## 3 bis. Dernier chantier clos (état au 07/10/2026)

**Chantier Bibliothèque : CLOS** (validé, commité, poussé). Cartes sur 3 lignes (Blancs, Noirs,
"Tournoi · Ronde X" ; seul le tournoi est tronqué), liseré 1 px + coins arrondis, carte active à
liseré doré 2 px, menu "⋯" (Ajouter / Sauvegarder / Ouvrir), barre unique recherche +
Toutes/Récentes/Favoris, panneau de droite à 405 px (`--side-panel-w`). Tailles réglables dans les
variables `--lib-*` en tête de `#panel-library`. Pas de menu de tri ni d'export "N parties
affichées" : "Sauvegarder la bibliothèque" = export de toute la bibliothèque.
- Champs d'une carte (nom, score…) éditables seulement sur la carte DÉJÀ active ; un clic sur une
  carte non active ne fait que l'ouvrir (`contenteditable` basculé dans le clic, sans `renderLibrary()`).
- **Perte des coups à l'enregistrement : corrigée en deux temps.** `library[i].moves` n'était
  jamais mis à jour (les coups vivent dans `game`, seul `headers` est partagé par référence).
  Le premier correctif (`d9ad790`, docs `19336ce`, déjà poussés) ajoutait
  `commitActiveEntryMoves()` mais était INCOMPLET : il écrivait des coups à notation annotée
  (`32-28!`) et `loadGameFromPdn()` (qui fait `split(/[x-]/).map(Number)`) tronquait la partie à ce
  coup au changement de carte (symboles `!`/`?`/`!!`/`??` cassés, coups perdus). Le second temps
  (commit de l'enregistrement automatique) passe `currentGameAsLibraryEntry()` en forme canonique
  de `parsePdn()` et fait compter `annotation` dans `entryContentKey()`.
- **Dette technique : plusieurs copies de l'état d'une partie subsistent** : `game`
  (history/future, vérité vivante), `library[i].moves`, le `localStorage` (`pdnText` +
  `currentGamePdn`) et les copies d'origine (`originals`). À unifier plus tard en dérivant `moves`
  de `game` pour l'entrée active (option b : sérialisation, export et fingerprint à adapter).
- **Dette technique : `damika:arrow-duration` accepte n'importe quelle valeur** (`Number(...) || 0`,
  par exemple `99` ou un négatif) au lieu des seules durées proposées par les boutons ; à durcir
  plus tard (valider contre les `data-duration` des boutons).
- Bug connu laissé tel quel : l'ordre "Récentes" n'est pas appliqué à l'écran
  (`renderLibrary()` parcourt `library` dans son ordre d'origine).
- Tester avec une bibliothèque fictive sur `http://127.0.0.1:8934` (origine distincte de
  `localhost`) pour ne pas écraser la vraie bibliothèque du navigateur.

**Chantier IA, Étage 1 « moteur rapide » (18/10/2026) : CLOS (validé, commité, poussé).**
`js/ai/fastboard.js` (plateau Int8Array(50), codes 0 vide / 1 pion blanc / 2 pion noir / 3 dame
blanche / 4 dame noire, cases en index 0..49 en interne, 1..50 seulement aux frontières de
conversion), `js/ai/worker.js` (messages `ping` / `moves` / `perft` / `divide`, gestionnaire
`handleMessage` exporté et testé sous Node ; le vrai Web Worker n'a pas été lancé dans un navigateur),
`tests/`. Pas d'IA, pas d'évaluation, pas d'UI. Validation : perft de la position initiale identique
aux références publiées jusqu'à la profondeur 11 (1 665 861 398) ; différentiel contre `rules.js` sans
divergence sur ~720 000 positions ; perft sur positions aléatoires sans divergence. Vitesse : ~5,5 M
nœuds/s depuis la position initiale, ~12 M en milieu de partie (comptage en bloc au dernier niveau),
contre ~0,7 M pour `rules.js`. Un bug de `rules.js` a été trouvé et corrigé (pièces prises
traversables par la dame, voir « Moteur et modèle de données »), en 2 lignes, à commiter à part.
Reste à faire : tester avec les vraies parties de la Bibliothèque (déposer des PDN dans
`tests/pdn-local/` puis `node tests/diff.mjs`).

**Chantier IA, Étage 2a « recherche + évaluation » (18/10/2026) : CLOS (validé, commité, poussé).**
`js/ai/eval.js`, `js/ai/search.js`, messages `analyse`/`stop` dans `js/ai/worker.js`. Aucune
modification de l'interface, de `rules.js` ni de `fastboard.js`. Conventions à connaître :
- `analyse(position, { maxDepth, maxTimeMs, onProgress })` (async, cède la main entre deux profondeurs) et
  `analyseSync` renvoient `{ score, mate, bestMove, bestMoveNotation, pv, pvNotation, depth, nodes, nps,
  timeMs, stopped }`. `score` : centipions, point de vue des BLANCS. `mate` : `null` ou
  `{ winner: 'w'|'b', in: N }` (N coups du camp gagnant ; `in: 0` = camp au trait déjà sans coup).
  `bestMove` et `pv` au format de `rules.js` (comme `generateUiMoves`) ; défauts : 1 000 ms, profondeur 64.
- Évaluation : indépendante du camp au trait, antisymétrique exactement (miroir = rotation 180° +
  couleurs). Pion 100, dame 300. Tous les poids sont dans `EVAL_WEIGHTS` ; `createEvaluator(poids)` pour
  l'étage 3. Avancement (non linéaire) et tempo (linéaire) sont deux termes distincts voulus.
- Recherche : négamax alpha-bêta, approfondissement itératif (profondeur 1 toujours terminée, itération
  interrompue par le temps écartée), quiescence tant qu'une prise est possible (16 demi-coups max),
  score de mat `±(30000 - ply)`. Table de transposition (Zobrist, hash tenu dans `search.js`) ACTIVE par
  défaut (`TT_DEFAULT`) car scores strictement identiques avec et sans (tests) : elle ne réutilise une
  entrée que calculée à la profondeur EXACTE demandée (sinon les scores changeraient), donc la PV peut
  être raccourcie. Toute modification de la recherche doit garder `tests/search-consistency.mjs` vert.
- Worker : un `stop` est pris en compte à la fin de la profondeur en cours (la recherche synchrone ne
  lit pas ses messages) ; arrêt immédiat = `worker.terminate()` côté fil principal. `maxTimeMs`
  interrompt en plein milieu de profondeur.
- Performance (machine de dev, 1 s) : profondeur 9 à 13 selon la position, ~0,6 à 1 M nœuds/s.
- Pas de livre d'ouvertures, poids non calibrés (estimés à la main). Répétition et règle des 25 coups :
  livrées à l'étape 2 (voir « Chantier IA, Étape 2 » plus bas).
Reste à faire : étage 3 (apprentissage des poids) ; l'étage 2b (analyse dans la liseuse) suit ci-dessous.

**Chantier IA, Étage 2b « analyse dans la liseuse » (18/10/2026) : CLOS (rendu validé par Mickaël, commité, poussé ; déploiement du site à la charge de Mickaël).**
Bouton « Analyse » (`#btn-analysis`, fin de la barre de contrôles) + touche **A** : interrupteur
DÉSACTIVÉ à chaque lancement, NON persisté (aucune clé localStorage), à ne pas persister. Actif :
jauge d'évaluation verticale (`#eval-bar`, 38 px, `position:absolute`, HORS du flux, à gauche du damier),
bloc `#analysis-strip` EN HAUT DU PANNEAU DE DROITE (`.side-panel`, au-dessus des onglets, visible quel que soit l'onglet ; déplacé le 19/10/2026, validé par Mickaël) : grande plaque de score `#analysis-plate`
(Inter 800, 56 px ; `data-adv` = white / black / even ; « +0,8 » ou « Mat en N — les X gagnent »)
puis, en petit, « Évaluation indicative · profondeur N » et « Meilleur : 34-30 · ligne de 5 coups max » ; flèche verte
`--best-arrow-color` du meilleur coup (`renderer.setBestMove(squares)`, indépendante de la flèche du
dernier coup). Conventions :
- **Largeur de la jauge sans toucher au layout** : `BoardRenderer.resize()` mesure `#app` moins la largeur
  RÉELLE du rail (268), du panneau et de 2 écarts de 26 px, et `.layout`/`.topbar-inner` figent 268 et 52 dans
  leur `max-width`. Donc le rail (268) et l'écart (26) ne bougent JAMAIS. Les 38 px de jauge (+ 4 px de
  respiration) tiennent dans l'écart de 26 px + 16 des 18 px que le rail réserve à sa droite quand l'analyse
  est active (`.layout.analysis-on .players-rail { padding-right: 18px }`, classe posée par `renderAnalysis()`)
  : les cartes joueurs passent de 268 à 250 px pendant l'analyse. Vérifié aux tailles 1988×1103, 1440×900 et
  1100×800 (damier carré, centré, sans chevauchement ni défilement horizontal, largeur identique analyse
  active/coupée). Sous 900 px le layout passe en colonne et la jauge est hors écran (chantier Mobile : masquer
  la jauge sous 900 px). La plaque ne coûte plus de hauteur au damier (taille identique analyse active/coupée) : à l'activation,
  seule la liste du panneau de droite se raccourcit (~140 px).
- **Alignement vertical** (`alignLayout()`) : le haut du cadre du damier se cale sur le haut du PANNEAU
  `.side-panel` (jamais sur les onglets, que la plaque repousse) ; la jauge est recalée sur le centre du damier par
  `--bar-dy` (posée sur `#eval-bar`, lue par son `transform`). Vérifié en iframes 1280×720, 1536×864, 1800×1000,
  1988×1103 (le redimensionnement de la fenêtre de test ne marche pas : utiliser des iframes de la taille voulue).
- Flèche et ligne « Meilleur » seulement à partir de la profondeur 4 (`MIN_DEPTH_FOR_MOVE` dans
  `analysis-format.js`) ; barre et score dès la profondeur 1. Barre = sigmoïde
  `1/(1+e^(-cp/BAR_SCALE_CP))`, **`BAR_SCALE_CP = 100`** (une seule constante : ±0,5 pion ≈ 62 %, ±1 ≈ 73 %,
  ±2 ≈ 88 %, ±3 ≈ 95 % ; était 250), Blancs en bas, retournée par `.flipped` dans `toggleFlip()` ; mat = barre
  pleine d'un côté.
- **Paliers d'avantage** (barème de Mickaël, constante `ADVANTAGE_TIERS` dans `analysis-format.js`, appliquée à
  la valeur AFFICHÉE arrondie au dixième) : égal ≤ 0,2 · mini > 0,2 · petit ≥ 0,5 · naissant ≥ 0,7 ·
  avantage ≥ 0,9 · bel ≥ 1,5 · gros > 2 ; 5 niveaux de lumière (`--lit` 1 à 5 : mini 1, petit et naissant 2,
  avantage 3, bel 4, gros 5 ; 0 = égal). Jamais de texte « Petit avantage » affiché (un palier en mots sous le score a été essayé puis ABANDONNÉ à la demande de Mickaël : le score seul suffit).
- Habillage (retouches 2b-bis/2b-ter, affichage seulement) : `--fill` (part de blanc, 0-100) posée par
  `main.js` pilote la hauteur du blanc ET la ligne dorée (`.eval-bar-line`, halo), transition 0,6 s ; repères à
  0, ±0,5, ±1, ±2 pions (`.eval-bar-tick`, `--p` par `tickFractions()`, donc fidèles à l'échelle) ; zone
  d'équilibre dorée (`.eval-bar-zone`, `equalZoneFractions()`, ≈ ±0,2 pion) ; lumière du camp qui a
  l'avantage (`.eval-bar-light`, halo doré ancré sur son extrémité, opacité = `--lit` × 0,17) et halo de la
  plaque proportionnel à `--lit` ; impulsion `.pulse` si `isBigSwing` (**0,20** de barre ≈ 0,85 pion près de
  l'équilibre ; était 0,12 avec l'échelle 250) ; `.mate` = liseré/halo dorés + scintillement ; `.stale` =
  atténuée pendant le calcul ; le nombre est interpolé sur 0,3 s au lieu de sauter ; tout est coupé sous
  `prefers-reduced-motion`. Demi-jauges distinctes dans les deux thèmes (`--eval-dark-1/2` graphite bien plus
  clair que le fond, `--eval-white-1/2` ivoire, liseré `--eval-border`). Variables par thème : `--eval-*`,
  `--plate-*`, `--best-arrow-color`.
  Toute la logique de décision (échelle, paliers, camp, swing, repères, zone) est dans `analysis-format.js`, testée sous Node.
- Le bloc d'analyse de `main.js` (juste après la table `el`) LIT seulement `game.board` /
  `game.sideToMove` (appel `requestAnalysis()` en fin de `renderBoardState()`) : il n'appelle ni
  `refreshUI`, ni `scheduleSave`, ni `activeEntryModified`. Ne jamais lui faire modifier la partie, la
  Bibliothèque ou l'état de modification.
- Un seul Worker module (`new Worker(new URL('./ai/worker.js', import.meta.url), { type: 'module' })`),
  créé à l'activation, détruit à la désactivation ; debounce 150 ms ; limites 1,5 s / profondeur 24 ;
  si une analyse est EN COURS au changement de position : `terminate()` puis recréation (un Worker
  occupé ne lit pas ses messages) ; réponses d'identifiant périmé ignorées ; position identique
  (empreinte `positionKey`) ignorée, donc sélectionner une pièce ne relance rien.
- Raccourci A ignoré dans un champ de saisie (garde existant du handler clavier), avec Ctrl/Cmd/Alt, en
  répétition de touche, et quand une modale est ouverte (`isModalOpen()` : `.confirm-overlay`,
  `.dropzone-overlay`, popover photo, popover commentaire). Ajouté à l'aide « ? ».
- Partie finie : le moteur répond `mate.in = 0` sans chercher ; affichage « Partie terminée — … ».
- Validation : fonctions pures et contrôleur testés sous Node ; UN passage de fumée navigateur
  (activation, analyse jusqu'à la profondeur 11, coupure par la touche A, pas d'erreur console). Le
  visuel (couleurs en thème clair, alignement de la barre sur petits écrans) reste à valider par Mickaël.
  Mobile : la barre n'a pas été étudiée sous 900 px (chantier Mobile à venir).

**État final du chantier IA (fin de session du 18/10/2026).**
- **Livrés** : étage 1 (moteur de règles rapide, `js/ai/fastboard.js`, validé par perft jusqu'à la profondeur 11 et
  par comparaison avec `rules.js`), étage 2a (évaluation `eval.js` + recherche `search.js` + messages
  `analyse`/`stop` du Worker), étage 2b (bouton « Analyse » / touche A : jauge, plaque de score, meilleur coup,
  ligne principale). Tests Node dans `tests/` (voir §2). Le site n'est pas redéployé par l'assistant.
- **Reste à faire, dans l'ordre du backlog (§3)** : étage 3 (apprentissage des poids de l'évaluation, via
  `createEvaluator(poids)`) ; passe de vérification/peaufinage (PDF compris) puis Mobile (dont le masquage de
  la jauge sous 900 px, où le layout passe en colonne et la jauge sort de l'écran) ; réactivation du Service
  Worker en dernier. Aussi : valider le moteur sur de VRAIES parties longues de la Bibliothèque (le PDN
  exporté le 19/10 ne contenait que 50 parties de test de 4 à 16 demi-coups : 0 divergence, mais sans dames).
- **Limites connues de l'évaluation V0 (en termes simples)** : elle compte les pièces et note leur place
  (avancée, centre, dernière rangée, tempo), rien de plus. Elle ne voit pas les formations (pions solidaires,
  triangles, chaînes), les pions isolés, en retard ou bloqués, ni la liberté de manœuvre d'un camp étouffé ; une
  dame vaut toujours 3 pions ; elle ne reconnaît pas les finales nulles par la théorie (sans répétition ni
  règle des 25 coups, elle peut croire gagner une finale nulle) ; les poids sont estimés à la main, jamais
  calibrés sur des parties réelles ; les menaces calmes ne sont vues que dans la profondeur de recherche
  (9 à 13 demi-coups en 1 s) ; pas de livre d'ouvertures. D'où la mention « indicatif » dans l'interface.
- **Échelle de la jauge** : UNE seule constante, `BAR_SCALE_CP` dans `js/ai/analysis-format.js` (aujourd'hui 100 :
  ±0,5 pion ≈ 62 %, ±1 ≈ 73 %, ±2 ≈ 88 %, ±3 ≈ 95 %), réajustable sans toucher au reste ; repères, zone
  d'équilibre et seuils d'impulsion en découlent, mais `BIG_SWING` (0,20) est à revoir si l'échelle change.
  Paliers d'avantage : constante `ADVANTAGE_TIERS` dans le même fichier.
- Les réglages d'interface « thème du damier » et « style de pion » sont DÉJÀ persistés (clés
  `damika:board-theme` et `damika:piece-style`, commit `283aa72`) : ils ne sont plus à faire.

**Chantier IA, Étape 2 « répétition et règle des 25 coups » (19/10/2026) : CLOS (validé par Mickaël, commité, poussé).**
Règles lues dans les textes officiels : [FMJD Annexe 1, art. 6](https://www.fmjd.org/downloads/news/948/Annex%201%20official%20FMJD%20rules%20of%20international%20draughts.pdf)
et [FMJD Annexes 2024, Annexe 1, art. 6, p. 14](https://www.fmjd.org/downloads/FMJD_Annexes_2024_8-sig.pdf) (l'anglais fait foi).
- **6.1** : nulle à la 3e occurrence de la même position, même camp au trait. **6.2** : nulle après 25 coups de chaque
  camp (= 50 demi-coups) où seules les dames ont bougé, sans prise ni coup de pion. Les deux sont IMPLÉMENTÉES.
- **6.3 (16 coups : 3 dames, 2 dames + pion, dame + 2 pions contre une dame ; 5 coups si la dame seule tient la grande
  diagonale, texte 2024) et 6.4 (5 coups : 2 dames, dame + pion, dame contre dame) : NON implémentées.** Décision de
  Mickaël : plus tard, à décider (elles exigent un historique de l'arrivée de la finale, et les textes 2018 et 2024 diffèrent).
- Moteur : `FastBoard.quiet` (demi-coups sans prise ni coup de pion, tenu par make/unmake, `DRAW_QUIET_PLIES = 50`) ;
  dans `search.js`, un nœud sous la racine vaut 0 si `quiet ≥ 50` ou en répétition (jamais à la racine) ; répétition =
  retour sur le chemin de la recherche (dès la 2e occurrence : cycle) OU 3e occurrence en comptant l'historique de la
  partie. Le résultat porte `drawRule: null | 'quiet' | 'repetition'` (non exploité par l'interface).
- Historique : message Worker `{ type: 'analyse', position, history?, options }`, `history = { quiet, positions | hashes }`
  (positions AVANT la position analysée, du plus ancien au plus récent, limitées aux `quiet` dernières) ; absent ou
  `quiet = 0` = comportement d'avant. `analysisHistory(game.history)` (`analysis-format.js`) le fabrique, `main.js` le
  passe au contrôleur (`request(position, history)`), qui l'inclut dans sa clé de déduplication.
- **Table de transposition** : un sous-arbre où une nulle par règle a eu lieu n'est pas écrit (« teinte », `drawHits`) ;
  lecture inchangée. Limite théorique GHI ; 0 écart mesuré avec/sans table sur 230 finales à dames avec historique.
  La variante stricte (pas de table si `quiet > 0`) coûtait +56 % de nœuds en finale de dames.
- Tests : `node tests/repetition.mjs` (compteur, cycle 1D/1D, 25 coups, 3e occurrence, scores identiques à l'ancien moteur
  via `tests/data/golden-scores.json`, TT, Worker, contrôleur) ; toute la suite Node verte ; vitesse inchangée (±3 %).
  Toute modification de la recherche doit garder `repetition.mjs` ET `search-consistency.mjs` verts.

**Chantier IA, Étage 3, étapes 3.1 et 3.2 « arène, auto-jeu, évaluation apprise » (20/10/2026) : commité, validé par Mickaël.** Détail et chiffres :
`docs/SESSION_DERNIERE.md` ; commandes : `training/README.md`. Aucun changement visible dans l'appli (elle n'utilise que V0).
- **3.1 (`training/`)** : `arena.mjs` (`match` A contre B, `selfplay`), en `worker_threads` (cœurs − 1), reprise en relançant la MÊME commande
  (JSONL, ligne tronquée retirée), Ctrl+C propre, veille Windows bloquée (`sleep.mjs`), journal toutes les 30 s ; `game.mjs` (parties avec
  répétition, 25 coups, plafond 300 demi-coups, vérification `rules.js`), ouvertures de K = 8 demi-coups aléatoires rejetées si déséquilibrées
  puis jouées deux fois couleurs inversées ; `stats.mjs` (Elo et IC 95 % par PAIRES) ; `verify.mjs`. Données et journaux : `training/data/`,
  `training/logs/` (ignorés par git). `search.js` accepte un évaluateur injectable (`evaluator`) et un budget de nœuds (`maxNodes`).
  Mesuré (8 cœurs) : profondeur 6 ≈ 9 300 parties/h, profondeur 8 ≈ 870 (V0) à ≈ 1 140 (V1b), profondeur 10 ≈ 150 ; mémoire stable ~1,2 Go.
- **3.2 (évaluation apprise)** : V0 est exactement une SOMME DE VALEURS PAR CASE (pion, dame ; pièce noire en i = blanche en 49 − i).
  `js/ai/eval-learned.js` : `createTableEvaluator({man,king} | {phases:[{minPieces,man,king}]})`, entiers, symétrie exacte, garde-fou de mat
  (borne exacte de |éval| ≤ 29 000). `--evaluator learned:<fichier>` dans l'arène (identité du run = empreinte du CONTENU). `training/fit.mjs` :
  Newton/IRLS déterministe, cible λ·résultat + (1−λ)·σ(score/K_t), L2 vers V0, validation = 15 % des PARTIES, modèles dans `training/models/`.
  **Meilleur : V1b λ = 0 (`training/models/v1b-l0.json`, 3 phases ≥ 30 / 15–29 / < 15 pièces) : +211 Elo contre V0 (profondeur 6, 400 paires),
  +170 à +177 (profondeur 8, 150 paires), graine d'évaluation différente de celle des données.** λ = 1 (résultats bruts) échoue sauf avec
  `--game-weight 1` ou une forte régularisation : les longues nulles de finale noient les données. La perte de validation ne prédit pas la force :
  seule l'arène juge. Évaluer avec une graine DIFFÉRENTE de celle de l'auto-jeu d'entraînement (nuit 1 : graine 1 ; évaluation : 777).
- Limites : étiquettes issues de V0 (circularité), mesures à profondeur fixe contre V0 seulement, tables sans notion de structure (étape 3.3 : testée, voir ci-dessous),
  échelle différente de V0 (jauge de la liseuse à recaler si V1b y entre). Limites de finale FMJD 6.3/6.4 toujours non implémentées.

**Chantier IA, Étage 3, étape 3.3 « caractéristiques de STRUCTURE (V2) » (20/10/2026) : commité ; V1b reste le meilleur modèle validé.** Détail et
chiffres : `docs/SESSION_DERNIERE.md` (section « Étape 3.3 »). Aucun changement visible dans l'appli.
- **Format** : chaque phase d'un fichier de tables peut porter `features: { nom: poids entier }` (registre `FEATURES` de `js/ai/eval-learned.js` : `sup`,
  `pair`, `blocked`, `free`, `kmob`, `wing`, `kvm`, `fort`, `promo`, `isol`) ; éval = tables + Σ poids × (compteur Blancs − compteur Noirs), symétrie miroir
  exacte, entiers, compteurs calculés sur le tableau fastboard (aucune génération de coups, une seule définition partagée par l'évaluateur et l'apprentissage).
  Garde-fou : la borne de |éval| (tables + Σ |poids| × maximum du compteur) doit rester ≤ 29 000, sinon l'évaluateur REFUSE le fichier (l'apprentissage
  signale le modèle INVALIDE). Seuls les compteurs NON linéaires en « pièce sur case » apportent quelque chose aux tables (pions par aile, au centre, dame
  sur la grande diagonale : déjà dans les tables). L'évaluateur est à une seule passe (V1b : ≈ 89 ns par position, deux fois plus rapide qu'avant).
- **Outils** : `node training/fit.mjs --base training/models/v1b-l0.json --families F1,…,F6 | --features a,b | --combo a,b [--freeze-tables] [--data dossier1,dossier2]`
  (`fit-struct.mjs`, `fit-struct-run.mjs` : ajustement CONJOINT tables + poids, choix global / par phase par la perte de validation) ; `node training/bench-eval.mjs
  <modèles>` (ns par position et nœuds/s sur positions réelles, mesures entrelacées : seuls les rapports comptent si la machine est chargée).
- **Résultats** (nuit 1, λ = 0, L2 vers V1b ; candidat contre V1b, profondeur 6, 400 paires, graine 777) : **F1 connexité (sup +3, pair −3) +43 [+23 ; +63]**,
  réplication graine 999 +20 [−1 ; +41], poolé +31 [+17 ; +46] ; F4 ailes, F5 dames, F6 promotion / pions isolés : +7, +7, +9 (non significatifs, rejetés) ; F2 et F3 :
  poids arrondis à 0 (non jouées). Témoin (mêmes tables, signes de F1 inversés) : −58 [−83 ; −34] sur 271 paires (interrompu) : l'effet dépend du signe.
- **Coût** : F1 = évaluation ×4, −15 % de nœuds par seconde, **+35 % de nœuds à profondeur égale** ; profondeur moyenne en 100 ms : 7,61 contre 7,91 pour V1b : le gain
  à profondeur fixe peut disparaître à temps égal. **F1 n'est PAS intégrée.** Avec λ = 0 les caractéristiques n'apportent presque rien à la perte (les étiquettes sont des
  scores de recherche) ; avec les résultats des parties (λ > 0, parties pondérées, tables figées) la perte baisse nettement (F5 jusqu'à 8·10⁻³) : modèles `x33-KFW` et
  `x33-KFWP` prêts, NON joués dans l'arène.
- **À FAIRE après la nuit 2** (`training/data/selfplay-nuit-2/summary.json`) : réentraîner V1b sur nuit 1 + nuit 2 et remesurer (graine 777) ; test à TEMPS ÉGAL
  (`--depth 30 --time 100`, 200 paires) de F1 contre V1b ; confirmation profondeur 8 (150 paires, graine 888) contre V1b puis contre V0. Tant que ces mesures
  ne sont pas faites, ne pas intégrer F1 ; ne pas lancer de match lourd pendant qu'un auto-jeu tourne.

**Règle de méthode :** un seul chantier à la fois. Rien de nouveau tant que le précédent n'est
pas validé par Mickaël, commité et poussé. Pas de test automatisé : un test ciblé par chantier.

## 4. Points de vigilance

- Aucun test automatisé : validation manuelle par Mickaël.
- Service Worker désactivé : pas de mode hors-ligne.
- Worker Toernooibase bloquable à tout moment ; logique dupliquée Worker/script Node.
- Limite connue : "Retirer la photo" compare par égalité stricte sur le nom affiché, donc
  peut ne rien faire si la photo vient d'une correspondance floue (nom de famille seul).
- **Données nominatives : règle permanente.** `scripts/players.txt` et toute donnée
  nominative de joueurs ne doivent JAMAIS être suivis par git : jamais commités, jamais
  restaurés depuis un ancien `main` ou une autre branche. Le fichier reste en local, dans
  `.gitignore`. Avant tout commit qui touche `scripts/`, lancer
  `git check-ignore scripts/players.txt` (doit afficher le chemin) et relire `git status`.
  Ne jamais écrire de nom ou d'identifiant de joueur dans CLAUDE.md ni dans la
  documentation.
- Déploiement manuel, sans CI (dépôt GitHub public `Mikado1666/DamikA` : ne rien y commiter de
  sensible, l'historique est lisible par tous).
- Le serveur de dev local peut être tué par l'environnement (mémoire basse) : à relancer.

## 5. Historique

Récits détaillés des sessions (2026-09-15 à 2026-10-05), avec le pourquoi de chaque
correctif : [`docs/HISTORIQUE_SESSIONS.md`](docs/HISTORIQUE_SESSIONS.md).
