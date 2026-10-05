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
- Pas de suite de tests. Pour tester une position : listener temporaire
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

### Dimensionnement du damier
- `BoardRenderer.resize()` mesure la largeur depuis `#app` moins rail (268) et panneau
  (350), **jamais depuis `.board-wrap`** (boucle de dépendance avec `--board-px` : damier
  bloqué en petit). Lire le commentaire de `resize()` avant d'y toucher.
- Variable `--board-px` sur `:root` ; `.layout` et `.topbar-inner` partagent la même
  formule `max-width: calc(var(--board-px, 950px) + 268px + 350px + 52px + 48px)`.
  `.board-column` épouse `width: var(--board-px)`, pas de `flex-grow`. Plafond 950px,
  plancher 280px. Police des coordonnées plafonnée à 12px.

### Moteur et modèle de données
- `generateLegalMoves(board, color)` → `{ captures, simples, mustCapture }`, grande prise
  incluse : seule source de vérité de la légalité, ne jamais la dupliquer.
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
- localStorage : `damika:library-state` (PDN de la bibliothèque, index actif, PDN courant,
  `libraryDirty`), `damika:player-photo-registry`, `damika:sound-muted`,
  `damika:sound-volume`, `damika:ui-theme` (sombre / clair "Miel doré"),
  `damika:piece-size`, `damika:arrow-duration`. `scheduleSave()` débattue 400 ms + flush sur `beforeunload`.
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
  une annulation n'écrit rien). PDF : jsPDF local, rectangle de fond redessiné sur
  CHAQUE page ; diagramme final obtenu en naviguant le vrai jeu puis en revenant.

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
la flèche du dernier coup réglable ; thème clair "Miel doré" ; aide clavier (touche `?`) ;
import/export PDN, TXT, PNG ; export PDF repensé (fond clair, diagrammes sur les coups
annotés) ; Bibliothèque persistante (Sauvegarder/Ouvrir, ordre manuel par drag&drop,
édition inline, recherche texte, fichiers récents, favoris, filtres Toutes/Récentes/Favoris) ; pill "Modifications non
enregistrées" (état dirty de l'entrée active) ; commentaires de coup et symboles
d'annotation (`!`, `?`, `!!`, `??`) ; Bloc 1 "Plaque tournoi" (Elo, titre, score libre,
photos, Toernooibase) ; partage lien + QR ; sons + volume/mute ; identité visuelle Damika ;
"Nouvelle partie" ; navigation molette ; déploiement public.

**En pause** : style de pion "Toernooibase" (non conforme aux images
`reference-pion-toernooibase-1/2.png`, retiré de `PIECE_STYLES` dans `js/render/board.js` ;
`drawPieceToernooibase` existe toujours mais n'est plus branchée).

**Backlog** (dans cet ordre ; ne rien commencer sans demande) :
1. Finir la Bibliothèque (chantier en cours, voir ci-dessous).
2. Mémoriser en localStorage le thème du damier et le style de pion.
3. Réactiver le Service Worker (mode hors-ligne).
4. Mobile, dont le bug du lien de partage qui affiche un écran noir sur téléphone.
Plus tard : style de pion "Toernooibase" (en pause, voir ci-dessus), export en lot,
conformité FMJD approfondie, puis IA (bloc C de `RETOURS_SESSION_2026-09-16.md`).

## 3 bis. En cours (état au 05/10/2026)

**Refonte compacte de la Bibliothèque : NON COMMITÉE.** Fichiers modifiés : `index.html`,
`css/style.css`, `js/main.js`, et une ligne `test-library-50.pdn` ajoutée à `.gitignore`.
- Fait : en-tête sur une ligne (nom + "N parties", 3 boutons-icônes), recherche + bascules
  Récentes/Favoris, cartes numérotées sur 2 lignes tronquées par "…", textes agrandis
  (variables `--lib-*` en tête de `#panel-library`), largeur du Bloc 3 fixée par
  `--side-panel-w: 350px` (+ `overflow: hidden` et `min-width: 0`), pour que le contenu ne la
  fasse jamais varier ni rétrécir le damier. Mesuré : panneau 350 px et damier identique à
  `d528e43`, 13 cartes visibles sans scroller avec 50 parties.
- Reste : validation du rendu par Mickaël, puis commit et push ; décider de garder ou non la
  ligne `.gitignore`. Relancer le serveur de dev (arrêté par le système, mémoire basse).
- Bug connu laissé tel quel : l'ordre "Récentes" n'est pas appliqué à l'écran
  (`renderLibrary()` parcourt `library` dans son ordre d'origine).

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
