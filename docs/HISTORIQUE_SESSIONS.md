# DAMIKA — Contexte technique

PWA de dames internationales 10x10 (FMJD), vanilla JS (ES modules natifs, pas de
build step, pas de framework), rendu plateau en Canvas 2D. Voir `CAHIER_DES_CHARGES.md`
pour la spec fonctionnelle complète et l'état d'avancement détaillé.

## État du projet (dernière mise à jour : 2026-09-18)

- **Résumé de la session du 2026-09-18** (voir la section dédiée plus bas,
  "Session 2026-09-18", pour le détail complet) : 2 bugs corrigés sur le popover du volume
  (fermeture prématurée au survol, son bloqué par la politique autoplay du navigateur) ;
  chantier "packs de sons personnalisables" prototypé puis retiré sur demande (seul le pack
  Standard reste) ; réordonnancement manuel de la Bibliothèque par glisser-déposer "carte
  physique" (implémenté à la main, pas le drag&drop HTML5 natif) ; chargement d'une partie
  depuis la Bibliothèque rendu silencieux ; édition des champs joueurs (nom, score, Elo,
  titre) directement sur les cartes Bloc 1 ET Bibliothèque avec synchronisation
  bidirectionnelle — et surtout, correction d'un **bug architectural de fond** :
  `headers` (Bloc 1) et `library[idx].headers` (Bibliothèque) étaient deux objets JS
  distincts synchronisés manuellement (avec des trous), désormais **la même référence
  d'objet** ; l'ancienne fonctionnalité de renommage libre ("libellé personnalisé",
  `headers.Label`) qui permettait cette divergence a été retirée entièrement.

- **Résumé de la 2ᵉ partie de la session du 2026-09-17** (voir la section dédiée plus bas,
  "Session 2026-09-17 (suite)", pour le détail complet) : correction du bug de score du
  Bloc 1 (mauvaise valeur affichée après import d'un PDN Toernooibase, cache navigateur en
  cause plus qu'un bug de code — voir la section pour le détail de l'investigation) ; 3
  nouvelles fonctionnalités livrées et testées en navigateur : export image (PNG, damier +
  légende) et export PDF (page de garde + notation complète + diagramme final) accessibles
  depuis le menu "Exporter" (jsPDF vendorisé en local) ; partage de partie par lien compressé
  + QR code, sans backend (LZString + QRCode.js vendorisés en local) ; sons (coup/capture/
  début/fin de partie) avec réglage de volume et mute, sources documentées dans
  `assets/sounds/SOURCES.txt` (fichiers réels Lidraughts pour coup/capture/fin de partie,
  pack CC0 Kenney conservé pour le début de partie faute d'équivalent Lidraughts — décision
  actée avec Mickaël).

- **Résumé de la 1ʳᵉ partie de la session du 2026-09-17** (voir la section dédiée plus bas,
  "Session 2026-09-17", pour le détail complet) : nombreux ajustements UI sur le Header (export
  PDN/TXT et sauvegarde bibliothèque via une vraie fenêtre "Enregistrer sous" — File System
  Access API —, clarté du menu palette DAMIER/PIONS, flip du damier synchronisé avec l'ordre
  des cartes joueurs), le Bloc 1 (badge Elo mis en avant à côté du nom, score global centré
  entre les deux cartes avec mise en évidence du vainqueur, compteur de temps déplacé dans la
  ligne de statut en bas du damier), la Bibliothèque (nom de la bibliothèque elle-même
  éditable et persisté, sauvegarde via "Enregistrer sous", format des entrées avec couleur
  fixe pour les Noirs, plusieurs bugs de persistance/rendu corrigés), la navigation à la
  molette sur le damier (comme Toernooibase), et le déploiement public du site sur
  **https://damika.shell-green.workers.dev** (Cloudflare, compte "Shell Green"). Chantier
  "commentaire de coup" (A3) : pas retouché cette session (déjà validé le 2026-09-16).

- **Résumé de la session du 2026-09-16** (voir les sections dédiées plus bas pour le détail
  de chacun) : chantier "Bibliothèque persistante" (localStorage, Sauvegarder/Ouvrir/import
  append vs remplace) ; chantier "commentaire de coup" (A3) repris avec un popover flottant,
  persistance PDN complète ; chantier "Bloc 1 premium" (cartes joueurs) avec la piste
  visuelle "Plaque tournoi", upload/URL de photo, cadre portrait (pas cercle) ; registre
  photo joueur avec correspondance tolérante nom→photo et pré-remplissage automatique
  (`data/player-photos.json`, scripts Node de résolution Toernooibase, puis backend
  Cloudflare Worker en remplacement direct depuis l'app) ; corrections de bugs sur un vrai
  export Toernooibase brut (en-têtes sans guillemets, tag `WhiteRating`/`BlackRating`, URL
  de photo mal formée) et sur la synchronisation Bibliothèque ↔ Bloc 1. Tout testé en
  navigateur à chaque étape (voir sections correspondantes), pas seulement écrit puis
  supposé fonctionnel.

- **Chantier logo + identité visuelle "Damika" : terminé et validé par Mickaël**
  (bloc C de `RETOURS_SESSION_2026-09-16.md`, commits `b6ebdbe` → `9d6e931`).
  Résumé complet dans la section "Session logo/branding" plus bas — renommage
  ancien nom→Damika, logo (losange bronze + wordmark), refonte du dimensionnement
  du damier/layout, fonctionnalité "Nouvelle partie".
- **Chantier visuel post-refonte (blocs A et D de `RETOURS_SESSION_2026-09-16.md`)
  : terminé et validé par Mickaël.** Styles de pions (Classique/Relief/Bois gravé),
  bloc "Coups joués" compact, footer retiré (easter egg déplacé sur le wordmark
  du header, "Nouvelle partie" cette session lui a ajouté un 2e comportement au
  clic — voir plus bas), curseur de vitesse ×¼→×8, toggle flèche, compteur de
  temps intégré au rail joueurs, bannière méta repositionnée, alignement précis
  de la mise en page (rail gauche / damier / rail droit), et les 2 bugs D1
  (import PDN)/D2 (clic case d'arrivée prise multiple) — tous committés (voir
  `git log`, du commit `fe77c87` à `a05db2d`).
  - Exception : le 4e style de pion **"Toernooibase" (A2bis) reste non conforme**
    aux images de référence (`reference-pion-toernooibase-1.png`/`-2.png`) et a
    été **retiré du sélecteur** (`PIECE_STYLES` dans `js/render/board.js`) —
    la fonction `drawPieceToernooibase` existe toujours dans le fichier mais
    n'est plus branchée, en attendant une reprise.
- **Chantier "Bibliothèque persistante" : terminé et validé par Mickaël** (tests
  navigateur save/open library du 2026-09-16). Persistance automatique en
  localStorage (clé `damika:library-state` — texte PDN complet de la
  bibliothèque, index actif, PDN de la partie en cours, flag `libraryDirty`),
  restauration automatique au chargement, boutons "Sauvegarder"/"Ouvrir" pour
  gérer la bibliothèque comme un fichier `.pdn` multi-parties (via
  `serializeLibraryToPdn`/`serializeLibraryEntryToPdn` dans
  `js/pdn/serializer.js`, nouveau module `js/pdn/storage.js`), garde-fou
  `confirmModal()` avant tout remplacement de bibliothèque non sauvegardée
  (bouton "Ouvrir", et coller presse-papier — corrigé au passage, il écrasait
  la bibliothèque sans confirmation avant cette session). Le bouton "Importer"
  existant est resté un **ajout** à la bibliothèque active (comportement
  distinct de "Ouvrir une bibliothèque", qui **remplace**). Au passage,
  `confirmModal(message, okLabel)` accepte maintenant un libellé de bouton
  explicite — avant cette session le bouton OK affichait toujours "Nouvelle
  partie" quel que soit le contexte (résidu du premier usage de la modale),
  ce qui aurait été trompeur pour les nouveaux garde-fous bibliothèque.
  **Bug corrigé** : après un AJOUT à la bibliothèque (Importer en mode append,
  Ajouter la partie, Coller — ce dernier remplace toute la bibliothèque mais
  peut apporter plusieurs parties d'un coup), la DERNIÈRE partie ajoutée doit
  systématiquement devenir l'entrée active (affichée + surlignée), jamais
  laisser l'ancienne partie affichée sans rapport avec ce qui vient d'être
  ajouté. `importFiles()` en mode append oubliait de le faire quand la
  bibliothèque n'était pas vide (`libraryActiveIndex`/`loadParsedGame()`
  seulement dans la branche `wasEmpty`) ; `pastePdnText()` sélectionnait le
  PREMIER jeu collé (`games[0]`) au lieu du dernier. Corrigé dans les deux :
  `libraryActiveIndex = library.length - 1` (ou `games.length - 1`) +
  `loadParsedGame()` systématiques après un ajout. Vérifié sur les 3 points
  d'entrée (Importer sur bibliothèque non vide, Ajouter la partie, Coller
  multi-parties).
  Complété ensuite par : un raccourci Ctrl+V dans la zone "Coups joués"
  (`#move-list`, rendue focusable via `tabindex="0"`, écouteur `paste` natif
  lisant `e.clipboardData` plutôt que `navigator.clipboard.readText()` —
  inspiré de Turbo Dambase, réutilise la même fonction `pastePdnText()` que le
  bouton "Coller" donc même garde-fou/mêmes messages) ; un bouton "➕ Ajouter
  la partie" (`btnLibraryAddCurrent` dans l'onglet Bibliothèque) qui ajoute la
  partie actuellement affichée à la bibliothèque active sans passer par un
  export/réimport manuel ; et un libellé explicite sur "💾 Sauvegarder la
  bibliothèque"/"📁 Ouvrir une bibliothèque" (uniquement visibles dans l'onglet
  **Bibliothèque** du panneau latéral, pas dans la barre du haut — à
  distinguer des boutons "Importer"/"Exporter" de la barre du haut qui eux
  agissent sur une seule partie). Puis par : suppression d'une entrée (icône
  "✕" visible au survol de la ligne — `.library-item-delete`, opacity 0→1 en
  CSS plutôt qu'une rangée d'icônes permanente — garde-fou `confirmModal()`
  systématique, définitif, pas d'undo bibliothèque ; si l'entrée supprimée
  était l'active, sélection de celle qui prend sa place dans la liste, ou
  reset vers une partie libre si la bibliothèque devient vide —
  `deleteLibraryEntry()`) et renommage inline d'une entrée (double-clic sur le
  titre → `<input>` de remplacement, `startRenameLibraryEntry()` — stocké dans
  un en-tête PDN non standard `headers.Label`, plutôt qu'une propriété JS à
  part, pour survivre à Sauvegarder/Ouvrir/localStorage sans changement de
  format puisque `serializeLibraryEntryToPdn`/`parsePdn` traitent déjà tout
  en-tête présent génériquement).
  **Piège rencontré et corrigé** : le premier jet du clic de sélection sur une
  entrée appelait `renderLibrary()` (reconstruction complète de la liste),
  ce qui détruisait le nœud DOM du titre entre les deux clics d'un
  double-clic — le second clic atterrissait alors sur un titre déjà remplacé/
  détaché, et le navigateur retombait sur son comportement par défaut
  (sélection de texte) au lieu de déclencher `dblclick` sur le bon élément.
  Corrigé en ne faisant plus qu'un simple bascule de la classe `.active` (pas
  de reconstruction DOM) sur un clic de sélection — `renderLibrary()` n'est
  appelé que quand le contenu de la bibliothèque change réellement (ajout,
  suppression, renommage validé, import...). À garder en tête pour toute
  future logique de clic/double-clic sur une liste reconstruite dynamiquement.
- **Chantier "commentaire de coup" (A3) repris et terminé : validé.** Contrairement
  à la 1ʳᵉ version (`8d8f33b`, retirée dans `64d7e8b` — bloc "Coups joués" +
  textarea fixe jugé inesthétique par Mickaël), cette reprise change de
  placement plutôt que de retenter le même bloc permanent : popover flottant
  (`position: fixed`, positionné en JS près de l'icône cliquée), déclenché par
  une icône dédiée (`.move-comment-toggle`) à côté de chaque coup dans
  `#move-list` — distincte du texte du coup, qui garde son clic "aller à ce
  coup" existant (`jumpToPly`).
  **2ᵉ itération suite à retour Mickaël** (l'icône « discrète » à opacity 0.3
  restait visible sur CHAQUE coup et polluait la liste) : plus aucune icône
  visible par défaut sur un coup sans commentaire ; un coup commenté porte un
  marquage fort et permanent (`.move-ply-text.has-comment` : soulignement
  doré + `.move-comment-dot` : point plein doré "●", toujours visible), pour
  un repérage en un coup d'œil en scannant toute la liste. Popover aussi
  élargi (220px→320px, textarea 3→7 lignes, `resize: vertical`).
  **3ᵉ itération** (même retour, cette fois sur le déclencheur "ajouter" —
  même agrandi, un pictogramme restait moins lisible qu'un texte explicite) :
  remplacé par un lien texte flottant `.move-comment-hint` ("+ Ajouter un
  commentaire" / "Modifier le commentaire" si déjà présent), révélé
  uniquement au survol de la ligne (`.move-ply:hover .move-comment-hint`).
  Positionné en CSS pur, PAS en JS comme le popover lui-même : reste un
  descendant DOM de `.move-ply`.
  **4ᵉ itération (bug bloquant constaté par Mickaël)** : le premier jet de ce
  lien démarrait `top: 100%; margin-top: 2px` — donc 2px SOUS la ligne. En
  déplaçant le curseur vers le lien pour cliquer, ce petit espace mort faisait
  retomber le survol sur la ligne SUIVANTE (qui a son propre déclencheur),
  coupant le `:hover` d'origine avant même d'atteindre le lien — **impossible
  à cliquer en pratique**, alors qu'un survol statique donnait l'impression
  que ça marchait. Corrigé en supprimant tout écart : le lien démarre
  désormais exactement à `top: 0; left: 0` (coïncide avec la boîte de
  `.move-ply` lui-même, aucun pixel à traverser) et s'étend en largeur
  PAR-DESSUS le coup et, si besoin, sur la cellule voisine DE LA MÊME ligne —
  jamais sur la ligne du dessous (contrainte explicite de Mickaël). Comme il
  occupe dès l'apparition exactement la zone déjà survolée, il n'y a plus de
  transition de survol à négocier. Ancré à gauche par défaut, à droite pour
  un coup Noirs (`.move-ply-black`, idx impair, grandit vers la gauche) pour
  ne jamais déborder du panneau (~350px). Vérifié en testant un vrai
  déplacement de curseur (survol → décalage → clic) avant de considérer le
  correctif validé, pas juste un survol statique — le bug précédent n'était
  visible qu'en mouvement.
  - **Stockage** : `comment` attaché directement aux entrées `history`/`future`
    de `DraughtsGame` (`js/engine/rules.js`), pas une `Map` externe indexée par
    ply comme dans `8d8f33b` — voyage tout seul avec son entrée au fil des
    `undo()`/`redo()`. Accès via `game.getCommentAt(idx)`/`setCommentAt(idx, texte)`,
    idx = même indexation que `fullMoveList()` (history puis future inversé).
  - **Persistance PDN complète** : `pdn/loader.js` reporte désormais
    `mv.comment` sur l'entrée d'historique au rejeu (`setCommentAt`) au lieu de
    le jeter comme avant cette session ; `serializer.js`
    (`serializeToPdn`/`serializeLibraryEntryToPdn`) réécrit le commentaire.
    S'intègre gratuitement au chantier bibliothèque persistante déjà en place
    (Sauvegarder/Ouvrir/localStorage transportent les commentaires sans code
    dédié supplémentaire).
  - **Piège de convention découvert et corrigé pendant cette session** : le
    tokenizer PDN (`parser.js`, `pendingComment`) attache un commentaire
    `{ ... }` au **prochain** token 'move' qu'il rencontre après lui —
    convention "commentaire AVANT le coup qu'il annote" (`{note} 32-28`), pas
    après. Un premier essai qui écrivait `notation {commentaire}` (après)
    cassait le round-trip : au rechargement, le commentaire se retrouvait
    silencieusement réattribué au coup SUIVANT. Corrigé dans `appendComment()`
    (serializer.js) pour écrire `{commentaire} notation` (avant) — vérifié
    stable sur plusieurs cycles sauvegarde/rechargement. À charge pour toute
    future modification touchant à l'écriture de commentaires PDN de
    respecter cette convention prefix, pas la convention "suffixe" plus
    intuitive à première vue.
  - **Piège récurrent réappliqué** : `TEXTAREA` ajouté à la liste des tags
    exclus du raccourci clavier global (`window.addEventListener('keydown', ...)`)
    — son absence avait déjà causé le bug historique "Espace avalé par la
    lecture auto" documenté dans `f2def34`/`64d7e8b` sur la 1ʳᵉ version de cette
    fonctionnalité ; le popover a son propre `stopPropagation()` sur `keydown`
    en plus, en défense en profondeur.
- **Prochain chantier (pas commencé)** : Mobile et IA (bloc C de
  `RETOURS_SESSION_2026-09-16.md`), phases à part, volontairement pas commencées.
- **Backlog fonctionnel restant** : voir bloc B de `RETOURS_SESSION_2026-09-16.md`
  (14 points — exports image/PDF, partage lien/QR, fichiers récents, favoris,
  aide clavier, recherche bibliothèque, photos joueurs, sons, réglage durée
  flèche, mode clair — annotations de coups et bibliothèque de parties sortis
  de cette liste, traités séparément ci-dessus). Pas urgent, à planifier.
  Le `CAHIER_DES_CHARGES.md` est noté comme partiellement obsolète sur ce
  point (thèmes/styles de pions) — à mettre à jour un jour.

## Session logo/branding + dimensionnement du damier (2026-09-15)

Session dédiée au chantier "logo + typographie" laissé en attente, qui a fini
par couvrir le renommage complet du projet, l'identité visuelle, une refonte
du dimensionnement responsive du damier/layout, et une nouvelle fonctionnalité.
Commits `b6ebdbe` → `9d6e931` (9 commits, tous montrés en diff et validés par
Mickaël avant commit, comme d'habitude).

**Renommage ancien nom → Damika** (`b6ebdbe`) — toutes les occurrences dans le code,
la doc, le manifest PWA renommées. Vérifié qu'aucune clé `localStorage`
n'existait avant renommage (rien à migrer).

**Logo et identité visuelle** (`f6d88cb`) — losange bronze évidé (SVG, dégradé
`linear-gradient(180deg, #ffe9c2 0%, #e0ab5c 35%, #8a5a24 55%, #f0c887 62%,
#4a2f10 100%)`, polygone extérieur + polygone intérieur plus petit rempli dans
la couleur de fond) + wordmark "DamikA" en Inter 800, même dégradé appliqué en
`background-clip:text`. Piège rencontré : le dégradé du texte paraissait "plat"
tant que `line-height` restait sur sa valeur `normal` (boîte de ligne bien plus
haute que les glyphes, donc le dégradé 0-100% ne se voyait que dilué sur une
tranche centrale) — resserré à `line-height:0.72` pour que le dégradé porte sur
l'encre réelle du texte. Une variante alternative du logo ("Duel", deux pions
qui se chevauchent) a été prototypée, comparée en side-by-side via un toggle
temporaire, puis écartée par Mickaël au profit du losange — code du toggle et
de la variante retirés, ne reste que le losange. Favicon/icônes PWA
(`icons/icon-192.svg`, `icons/icon-512.svg`) alignés sur le même design.

**Header aligné sur le contenu** (`5110487`) — `.topbar` a été scindé en un
conteneur externe pleine largeur (fond/bordure) et un `.topbar-inner` calé sur
le même `max-width`/padding que `.layout`, pour que la gauche du logo tombe
pile sur la gauche du rail joueurs et la droite des actions sur la droite du
panneau latéral, à n'importe quelle largeur de fenêtre.

**Dimensionnement responsive du damier** (`1182587` → `62965cf`) — plusieurs
itérations pour que le damier grossisse correctement ET que les blocs 1/3 se
collent à lui sans espace mort résiduel, quel que soit le facteur limitant
(largeur OU hauteur d'écran) :
- Plafond `.board-wrap` remonté 775px → 950px.
- `.board-column` n'est plus `flex-grow` (elle remplissait l'espace flex
  disponible indépendamment de la taille réelle du damier rendu, laissant un
  espace mort entre les rails et le damier dès que la hauteur d'écran limitait
  le damier avant sa largeur) — elle épouse maintenant `width: var(--board-px)`,
  une variable CSS posée sur `:root` par `BoardRenderer.resize()` (taille totale
  réelle du canvas rendu). `.layout` passe en `justify-content:center` pour
  centrer le trio rail/damier/panneau comme un bloc dans cette boîte
  désormais toujours à la bonne taille.
- `.layout` et `.topbar-inner` partagent la MÊME formule dynamique :
  `max-width: calc(var(--board-px, 950px) + 268px + 350px + 52px + 48px)`
  (268 = `.players-rail`, 350 = `.side-panel`, 52 = 2 gaps, 48 = 2× padding
  horizontal) — une valeur fixe se désynchronisait dès que `--board-px`
  changeait.
- **Boucle de dépendance découverte et corrigée** dans `BoardRenderer.resize()` :
  la largeur disponible était mesurée sur `.board-wrap`, dont la largeur est
  elle-même bornée par `.board-column` (donc par `--board-px`, la variable
  qu'on recalcule). Une fois `--board-px` figé sur une petite valeur (ex. un
  cycle de zoom navigateur qui rétrécit puis regrossit la fenêtre), plus
  aucune mesure ne pouvait redécouvrir l'espace réellement disponible — le
  damier restait bloqué en petit indéfiniment. Corrigé en calculant la largeur
  depuis `#app` (toujours = la fenêtre, hors du cycle) moins les largeurs
  fixes du rail et du panneau, plutôt que depuis `.board-wrap`. Voir le
  commentaire en tête de `resize()` dans `board.js` pour le détail complet ;
  utile à relire avant de retoucher au dimensionnement du damier.
- Numéros de coordonnées (rangs/colonnes, `_drawCoords()`) : la police
  grossissait proportionnellement à la taille de case sans plafond — sur les
  grands damiers désormais atteignables (950px), elle devenait assez grande
  pour mordre sur le cadre décoratif. Plafonnée à 12px, ancrages repositionnés
  (rang ancré à droite vers le bord du canvas au lieu de vers le cadre).

**Tailles de police du rail joueurs** (`459d4a5`) — `.meta-chip-event`,
`.player-name`, `.stat-value`/`.count-value`, etc. agrandies, sans casse de
mise en page (ellipsis/retour à la ligne déjà en place absorbent les cas
longs).

**Fonctionnalité "Nouvelle partie"** (`9d6e931`) — bouton dédié dans la topbar
+ logo (icône + wordmark) cliquable, reset complet (`game`/`headers`/sélection
remis à l'état de chargement initial). Confirmation via une modale custom
(`.confirm-overlay`/`confirmModal()` dans `main.js`) si des coups sont en
cours — **jamais `window.confirm()`** : un dialogue natif bloque tout le fil
JS de la page (constaté en le déclenchant par erreur pendant cette session,
l'onglet est resté figé jusqu'à sa fermeture). Deux bugs de clic découverts et
corrigés au passage, à connaître si on retouche le header :
- `.players-rail` est décalé vers le haut via `transform: translateY(...)`
  (logique d'alignement vertical existante dans `alignLayout()`, voir plus
  bas) et son rectangle transformé déborde visuellement **et
  interactivement** par-dessus le header, interceptant les clics — `.topbar`
  a maintenant `position:relative; z-index:5` pour rester au-dessus.
- Le wordmark est du texte sélectionnable : un clic dont le mousedown/mouseup
  bouge d'un pixel (souris réelle ou automatisée) peut être interprété comme
  une sélection de texte plutôt qu'un clic, et le navigateur n'émet alors pas
  l'évènement `click` — corrigé avec `user-select:none` sur `.brand`.

**Piège d'outillage rencontré pendant cette session** (utile si une future
session utilise l'automatisation navigateur type Claude-in-Chrome) : les
coordonnées de clic passées à l'outil sont dans l'espace pixel du
**screenshot renvoyé**, pas dans les pixels CSS réels de la page — sur cette
machine le screenshot fait ~1456px de large pour une fenêtre réelle de
~1778px (ratio ~1.22). Pour cliquer une cible précise (le logo, une case du
damier), mieux vaut soit passer par `getBoundingClientRect()` + diviser par
ce ratio, soit dispatcher directement un `PointerEvent`/`MouseEvent` de test
via `javascript_exec` avec les vraies coordonnées CSS.

## Lancer le projet en local

Les modules ES ne fonctionnent pas en `file://` — il faut un serveur HTTP :

```
python -m http.server 8934
```

puis ouvrir `http://localhost:8934/index.html`.

**⚠️ Piège n°1 : cache des modules JS.** `location.reload()` (même avec l'ancien
paramètre `forceGet`) ne recharge PAS toujours les modules JS modifiés — Chrome peut
continuer à exécuter une version en cache du script alors que le fichier servi est à
jour. Après toute modification de `.js`, **toujours faire un vrai rechargement forcé
(Ctrl+Shift+R)** avant de tester, sinon on teste du code obsolète en croyant tester le
correctif. Ça a fait perdre beaucoup de temps de debug pendant cette session.

**Le Service Worker est désactivé volontairement** (`js/main.js`, tout en bas) : il se
désenregistre lui-même au lieu de s'enregistrer, le temps que la liseuse PC se
stabilise. Un SW actif en cache-first a plusieurs fois servi une version périmée du
site pendant les itérations. Remettre `navigator.serviceWorker.register('sw.js')`
une fois le projet prêt pour le support hors-ligne (bump `CACHE_NAME` dans `sw.js`
à ce moment-là).

## Architecture

```
index.html              structure de la page, aucune logique
css/style.css           tout le style (thème sombre unique, variables CSS en tête de fichier)
js/
  engine/rules.js       moteur de règles pur (aucune dépendance DOM) — source de vérité
  render/board.js       BoardRenderer : dessine le plateau/pièces/flèches sur le <canvas>
  pdn/parser.js         texte PDN -> { headers, moves, result } (mono et multi-parties)
  pdn/loader.js         rejoue une partie parsée sur une DraughtsGame fraîche
  pdn/serializer.js     DraughtsGame -> texte PDN ou TXT
  main.js               colle tout ensemble : état de l'appli, écouteurs DOM, rendu
sw.js                   service worker (actuellement désactivé côté client, voir ci-dessus)
```

### Moteur (`js/engine/rules.js`)

- Cases numérotées 1-50 (notation FMJD), uniquement les cases jouables. `squareToRC`/
  `rcToSquare` font la conversion avec les coordonnées grille (row/col 0-9, row 0 = haut).
- `DraughtsGame` porte l'état : `board` (tableau 51 cases, `null` ou `{color,king}`),
  `sideToMove`, `history`/`future` (piles pour undo/redo — voir plus bas).
- `generateLegalMoves(board, color)` retourne `{ captures, simples, mustCapture }`.
  Si `captures.length > 0`, seules les séquences de longueur maximale sont gardées
  (grande prise) — c'est la seule source de vérité pour la légalité, ne jamais
  dupliquer cette logique ailleurs.
- Une séquence de capture est un tableau d'étapes `{ from, to, capturedThisStep, promoted }`.
  **`from` et `to` sont les cases de CETTE étape**, pas le départ/arrivée global de la
  séquence — pour reconstruire le chemin complet : `[sequence[0].from, ...sequence.map(s => s.to)]`.
- `computeTempoDifferential` implémente le compteur de temps de la théorie des finales,
  retourne `null` dès qu'une dame est présente (`hasAnyKing`).

### `DraughtsGame.history` / `.future` — modèle de navigation

Après chaque coup joué, il part dans `history`. `undo()` le déplace vers `future`
(en LIFO — donc `future` est en ordre **antéchronologique**). Pour reconstruire la
liste complète des coups dans l'ordre, peu importe où on en est dans la navigation :

```js
const moves = [...history.map(h => h.move), ...[...future].reverse().map(f => f.move)];
```

C'est exactement ce que fait `fullMoveList()` dans `main.js`, utilisé pour l'affichage
permanent de la liste des coups et l'export PDN/TXT.

### Rendu (`js/render/board.js`)

- `BoardRenderer` gère un seul `<canvas>`, redimensionné via `ResizeObserver` sur son
  parent (le plateau se réduit pour tenir dans l'espace disponible, plancher 280px,
  plafond 950px — voir CSS `.board-wrap`). La largeur disponible n'est PAS lue sur
  `.board-wrap` mais calculée depuis `#app` moins les largeurs fixes du rail/panneau
  (pour casser une boucle de dépendance avec `--board-px` — voir "Session
  logo/branding" plus haut avant de toucher à `resize()`). Un listener `window
  'resize'` complète le `ResizeObserver` en filet de sécurité (zoom navigateur).
  `resize()` pose 3 variables CSS sur l'élément `.board-column` (`--frame-px`,
  `--frame-inset`, consommées par `main.js`/`.controls-bar`) et une sur `:root`
  (`--board-px`, taille totale du canvas, consommée par `.board-column`/`.layout`/
  `.topbar-inner` pour que la mise en page épouse la taille réelle du damier).
- `squareAtFraction(xFrac, yFrac)` convertit une position **relative** (0..1 de la
  boîte du canvas telle qu'affichée) en numéro de case — volontairement indépendant de
  `canvas.width`/`devicePixelRatio` pour éviter tout écart d'arrondi. `main.js` calcule
  toujours `xFrac`/`yFrac` à partir de `getBoundingClientRect()`, jamais de coordonnées
  brutes du canvas.
- Les animations (déplacement, fondu de capture) sont pilotées par `this.animation`
  et avancées à chaque frame via une boucle `requestAnimationFrame` déjà active en
  permanence (`_loopPulse`, utilisée aussi pour le pulse des cases en prise obligatoire).
  `animateMove()` a un filet de sécurité : si la boucle rAF est throttlée (onglet en
  arrière-plan), l'animation se résout quand même après un délai.
- La flèche du dernier coup (`drawMovePath`) prend un tableau de cases (`lastMove.squares`
  = `[départ, ...chaque étape]`) et trace une polyligne complète, pas juste départ→arrivée
  — important pour les prises multiples. La pointe est calée à 92% du rayon de la pièce
  (`pieceRadius * 0.92`) : assez loin pour rester visible, assez près pour ne jamais
  dépasser le pion. Si on retouche ce calcul, tester avec un chemin qui **change de
  direction** (pas juste une diagonale continue) pour vérifier le rendu du coude.

### Interaction plateau (`main.js`)

- Le canvas écoute `pointerdown`, **pas `click`** : le `click` natif du navigateur
  ne se synthétise pas de façon fiable dans tous les cas (constaté en test — un clic
  net sur le canvas peut ne produire aucun évènement `click`). `pointerdown` se
  déclenche à l'appui, sans dépendre de cette étape.
- "Coup unique" : si une seule case d'arrivée est possible pour tout le plateau
  (clic direct sur la destination sans pièce sélectionnée), **ou** si la pièce cliquée
  n'a elle-même qu'un seul coup légal (déplacement ou prise), le coup est joué
  directement avec animation — pas besoin d'un second clic. Voir le bloc
  `canvas.addEventListener('pointerdown', ...)`.
- Notation (`moveNotation` dans `main.js`, `moveInfoToNotation` dans `serializer.js`) :
  convention FMJD — une rafle ne note que départ×arrivée (`27x9`), jamais le chemin
  complet (`27x18x9`). Le chargeur PDN (`loader.js`) accepte les deux formes en import
  (il retombe sur une correspondance par extrémités si le chemin complet ne matche pas).
- **Ne jamais utiliser `window.confirm()`/`alert()`/`prompt()`** : un dialogue natif
  bloque tout le fil JS de la page (constaté en le déclenchant par erreur — l'onglet
  reste figé jusqu'à sa fermeture, y compris pour l'automatisation de test). Utiliser
  le pattern `confirmModal(message)` (Promise-based, `.confirm-overlay` dans
  `index.html`) déjà en place pour "Nouvelle partie" — le réutiliser pour toute future
  confirmation plutôt que d'en recréer un autre.
- `startNewGame()` est le pattern de référence pour un reset complet de partie :
  `game = new DraughtsGame()`, `headers = { Event: 'Partie libre' }`,
  `selectedSquare = null`, puis `syncHeaderFieldsFromState()` + `refreshUI()` — même
  logique que `loadParsedGame()` mais sans partie à charger.

## Tester manuellement une position spécifique (sans jouer coup par coup)

Il n'y a pas de suite de tests automatisés pour l'instant. Pour vérifier un scénario
précis (prise multiple, dame volante, etc.) sans rejouer toute une partie à la souris,
le patron utilisé pendant cette session — à ajouter **temporairement** en bas de
`main.js`, puis à retirer avant de commit :

```js
window.addEventListener('damika:setBoard', (e) => {
  game.board = new Array(51).fill(null);
  for (const [sq, color, king] of e.detail.pieces) game.board[sq] = { color, king: !!king };
  game.sideToMove = e.detail.sideToMove || WHITE;
  game.history = [];
  game.future = [];
  selectedSquare = null;
  refreshUI();
});
```

puis depuis la console ou un outil d'automatisation :

```js
window.dispatchEvent(new CustomEvent('damika:setBoard', {
  detail: { pieces: [[27, 'w', false], [22, 'b', false]], sideToMove: 'w' },
}));
```

Utile aussi pour du debug ad hoc : un second listener `damika:dump` qui répond via
`damika:dumpResult` avec l'état interne (`selectedSquare`, `game.legalMoves`, etc.)
permet d'inspecter l'état sans passer par le DOM. Toujours nettoyer ces écouteurs de
debug avant de committer — ils n'ont rien à faire en production.

## Bug corrigé : troncature du nom de joueur (Bloc 1)

`.player-name` tronquait les noms longs avec "…" (`white-space:nowrap` +
`text-overflow:ellipsis`) alors que `textContent` contenait déjà le nom
complet (`main.js:572-573`) — uniquement un problème d'affichage CSS. Corrigé
en autorisant le retour à la ligne (`white-space:normal; overflow-wrap:
break-word`) plutôt qu'en réduisant la police dynamiquement (pas de JS
nécessaire). Sans risque pour l'alignement du damier : `alignLayout()`
anticipait déjà ce cas exact via son `ResizeObserver` sur `.blackCard`/
`.whiteCard` (commentaire présent de longue date : "un nom de joueur qui
passe sur 2 lignes"). Testé avec des noms longs réels (virgule + tirets) —
plus de troncature, alignement intact.

## Chantier "Bloc 1 premium" (cartes joueurs) : terminé et validé

Piste visuelle **B "Plaque tournoi"** retenue par Mickaël parmi 3 prototypées et comparées
dans un artifact avant codage (bordure dorée pleine, avatar circulaire à anneau conique
façon médaille, badge Elo façon pastille de classement ancré en haut à droite de la carte,
tag couleur "Noirs"/"Blancs" à côté du nom, stats Score/Pions en pilules avec icône ♛/●).
CSS : `.player-card`/`.player-avatar-ring`/`.elo-badge`/`.side-tag`/`.stat-block` dans
`style.css`. Les sélecteurs déjà utilisés par `main.js` (`.meta-field[data-field=...]`,
`.stat-value[data-field=...]`, `#count-white`/`#count-black`) ont été conservés tels quels
sous le nouveau capot visuel — aucun changement de logique JS pour l'Elo/Titre/Score/Pions,
seulement la mise en page CSS autour.

**Photo de joueur** (upload + URL, remplace l'avatar lettré par défaut) :
- Clic sur l'anneau d'avatar (`.player-avatar-ring`, un `<button>`) ouvre un popover
  flottant (même mécanique de positionnement JS que le popover de commentaire de coup) avec
  deux voies : fichier local ou URL externe.
- **Fichier local** : compressé/recadré en carré via `<canvas>` (160×160, JPEG qualité 0.8,
  `compressImageFile()`) avant stockage — descend de plusieurs Mo à ~15-30 Ko, négligeable
  pour `localStorage`.
- **URL externe (ex. Toernooibase)** : stockée telle quelle, SANS compression — un
  `<canvas>` ne peut pas relire une image cross-origin sans en-têtes CORS que ces sites ne
  fournissent pas (`canvas.toDataURL()` échouerait, canvas "taint"). L'`<img>` l'affiche
  directement sans ce problème (le CORS ne bloque que la *lecture* par JS, pas l'affichage).
  `onerror` sur cet `<img>` retombe automatiquement sur l'avatar lettré si l'URL devient
  injoignable (site down, image déplacée), avec un toast d'erreur.
- **Registre nom → photo** (`localStorage`, clé `damika:player-photo-registry`), PAS lié à
  une partie ou une bibliothèque précise : indexé par la valeur BRUTE de
  `headers.White`/`Black` (avec la virgule "Nom, Prénom" telle que le PDN l'encode, pas la
  version affichée sans virgule) — une fois une photo associée à un nom, elle réapparaît
  automatiquement pour toute future partie référençant ce même nom, sans ressaisie.
  Choix assumé faute de mieux : **aucun identifiant Toernooibase n'existe dans les PDN**
  standards (vérifié via la spec PDN 3.0 — seul `WhiteFmjdId`/`BlackFmjdId`, un ID FMJD
  international différent, existe — et via un exemple réel de PDN KNDB/Turbo Dambase
  partagé sur le forum FFJD, qui ne contient que `[White "Nom, Prénom"]` en texte brut) ;
  le matching par nom est d'ailleurs exactement ce que fait l'outil externe "Toernooibase
  naar Turbo Dambase Converter". Un automatisme complet (déduire l'URL de la photo depuis
  un ID joueur) n'est donc pas possible en JS pur, ni en scrapant la fiche Toernooibase
  (bloqué CORS, pas de backend sur ce projet par conception).
- **Piège CSS rencontré et corrigé** : `.player-photo-popover { display: flex; ... }`
  (propriété `display` déclarée explicitement) primait sur la règle UA `[hidden]{display:
  none}` — même spécificité (0,1,0), et un rôle auteur l'emporte toujours sur l'UA à
  spécificité égale. Le popover s'affichait donc au chargement de la page malgré l'attribut
  `hidden`. Corrigé en ajoutant `.player-photo-popover[hidden] { display: none; }` explicite,
  comme le reste des overlays de ce fichier (`.dropdown-menu[hidden]`, `.toast[hidden]`,
  etc.) — **tout nouvel élément `[hidden]` qui déclare sa propre propriété `display` doit
  systématiquement avoir cette règle jumelle**, sinon le même piège se reproduira (le
  popover de commentaire de coup n'y avait pas été exposé uniquement parce qu'il ne déclare
  pas `display` du tout, laissant l'UA `[hidden]` s'appliquer sans concurrent).

## Script ponctuel : pré-remplissage photos Toernooibase (terminé, étapes 1 et 2)

`scripts/fetch-toernooibase-photos.mjs` — Node.js, exécuté à la main en développement,
**jamais intégré à l'appli** (aucune restriction CORS côté Node, contrairement au
navigateur). Généraliste : liste de joueurs fournie à l'exécution (paires `"Nom" SpId` en
argument, ou `--file scripts/players.txt` — une ligne par joueur `Nom;SpId`), aucun lien
avec un tournoi ou une liste figée. Génère/complète `data/player-photos.json`
(`{ "Nom complet": "URL photo" }`, fusionné avec le contenu existant).

**Limite vérifiée en profondeur** : Toernooibase n'a aucun endpoint de recherche par nom
exploitable en simple GET (page d'accueil sans formulaire de recherche joueur, listing
alphabétique paginé sur 322 pages sans recherche directe, seule "recherche" = applet Java
interactif `zoekvenster.php`) — **le script prend donc un SpId par joueur, pas un nom
seul**. Le SpId se trouve manuellement sur le site. Testé avec succès sur `SpId=5032`
("Mickael Callegari") : extraction de `<img src=../Afbeeldingen/Spelers/5032.jpg
alt=Mickael Callegari>` sur la fiche `liddetailp.php`, vérifiée par requête `HEAD` (200,
`image/jpeg` réel, pas un placeholder).

**Étape 2 (chargement au démarrage) : codée et testée.** `loadPlayerPhotoPrefill()` dans
`main.js` charge `data/player-photos.json` en fetch asynchrone au démarrage (non bloquant —
les avatars affichent la lettre le temps du chargement) dans une table séparée
`playerPhotoPrefill`, **délibérément distincte** de `playerPhotoRegistry` (le registre
manuel persisté) plutôt que fusionnée dedans : évite qu'un pré-remplissage figé une bonne
fois dans le registre persisté bloque silencieusement une future mise à jour du fichier
JSON (script relancé avec une meilleure photo). `applyAvatar()` consulte les deux
(`playerPhotoRegistry[name] || playerPhotoPrefill[name]`), le registre manuel gagnant
toujours. Fichier absent (script jamais exécuté) ou JSON invalide : avalé silencieusement,
pas bloquant. Testé en navigateur : le pré-remplissage s'affiche pour un nom présent dans
le JSON, l'avatar lettré reste pour un nom absent, et une photo choisie manuellement pour un
nom déjà pré-rempli **prend le dessus et le reste après rechargement** (vérifié) — le
pré-remplissage ne revient jamais écraser un choix manuel.

**Bug corrigé : correspondance nom→photo trop stricte.** `applyAvatar()` faisait
`playerPhotoRegistry[name] || playerPhotoPrefill[name]` — une égalité EXACTE de chaîne.
Taper juste "Callegari" ne retrouvait donc pas la photo enregistrée sous "Callegari,
Mickael". Remplacé par `lookupPhotoUrl()` :
1. **Correspondance exacte tolérante** (`nameTokens()`) : casse, espaces superflus, virgule
   et ordre des mots ignorés — "Callegari, Mickael", "Mickael Callegari" et "CALLEGARI
   mickael" se reconnaissent comme le même joueur (comparaison par ensemble de mots triés).
2. **Repli nom de famille seul** (`surnameOf()`, `lookupInTable()`) : si le nom tapé est UN
   SEUL mot, comparé au nom de famille de chaque entrée (partie avant la virgule, sinon
   dernier mot en repli "Prénom Nom"). Si toutes les entrées qui correspondent pointent vers
   la même photo → utilisée. Si elles pointent vers des photos DIFFÉRENTES (homonymes,
   plusieurs joueurs distincts) → **aucune n'est choisie**, avatar lettré par défaut plutôt
   qu'un risque de photo de la mauvaise personne. Portée volontairement limitée au nom de
   famille (pas de repli sur le seul prénom, trop de faux positifs pour peu de gain).
3. Le registre manuel (`playerPhotoRegistry`) est vérifié EN ENTIER (les deux étapes
   ci-dessus) avant même de regarder `playerPhotoPrefill` — une ambiguïté détectée côté
   manuel ne se rabat jamais sur le pré-remplissage automatique.

Testé en navigateur : "Callegari" seul retrouve la photo enregistrée sous un nom complet ;
ajout d'un second "Callegari" avec une photo différente dans le registre → retour immédiat
à l'avatar lettré (ambiguïté détectée, pas de choix au hasard) ; suppression de l'entrée
conflictuelle → la photo réapparaît normalement au rechargement.

**Limite connue, non traitée ici** (hors demande) : le bouton "Retirer la photo" du popover
compare toujours par égalité stricte sur le nom actuellement affiché
(`playerPhotoRegistry[name]`) — si une photo affichée provient d'une correspondance floue
(nom de famille seul), "Retirer" peut ne rien faire car la clé réelle du registre diffère du
nom tapé. À revisiter si ce cas gêne en pratique.

**Correctif d'esthétique : cadre de l'avatar passé de cercle à rectangle portrait.** Les
photos Toernooibase sont au format identité (88×117px réels, ratio ~0.75, vérifié en
parsant l'en-tête JPEG) — un cercle ne peut en montrer qu'un recadrage carré du centre,
coupant systématiquement le haut du crâne ou le menton/les épaules. `.player-avatar-ring`
est passé de 66×66px cercle à 62×82px rectangle à coins arrondis (`var(--radius-sm)`),
ratio proche de la source réelle donc quasi aucun recadrage nécessaire. L'anneau conique
"médaille" ne rendait pas bien sur un rectangle — remplacé par une bordure pleine en
dégradé linéaire (toujours distinct Blancs/Noirs par la couleur). Piste alternative
(agrandir le cercle + ajuster `object-position`) écartée : un problème de ratio
incompatible ne se résout pas par un simple réglage de centrage.

**Piste bonus : terminée.** `scripts/resolve-toernooibase-players.mjs` — prend en argument
un fichier `.pdn` (typiquement exporté depuis l'appli via "Sauvegarder la bibliothèque"),
en extrait tous les noms uniques (`[White "..."]`/`[Black "..."]`), les résout en SpId via
l'index alphabétique de Toernooibase, puis enchaîne automatiquement sur
`fetch-toernooibase-photos.mjs` pour les noms résolus sans ambiguïté (`execFileSync`).
- **Index alphabétique** (`spelalfa.php?start=<Lettre>&tel2=<page>`) : liste ~100
  joueurs/page au format `Nom, Prénom` + SpId, triés par nom de famille. Une lettre est
  indexée UNE FOIS (toutes ses pages) puis réutilisée pour tous les noms de cette lettre à
  résoudre — pas une requête par nom.
- **Piège de pagination découvert et corrigé en testant** : le paramètre `teller` (deviné
  par analogie avec l'autre listing du site, `spelalfa.php?tel2=N` sans `start=`) est un
  no-op qui renvoie systématiquement la page 1 quelle que soit sa valeur — un premier essai
  semblait donc "boucler à l'infini" sur les mêmes ~90 entrées jusqu'au garde-fou de
  pagination (6000 entrées, toutes des doublons de la page 1). Le vrai paramètre est `tel2`
  (1-indexé), qui pagine correctement et renvoie une page vide une fois la dernière lettre
  dépassée — c'est cette page vide qui permet l'arrêt automatique de `fetchLetterIndex()`.
  Vérifié par essais successifs (`curl` direct) avant de corriger le script, pas juste en
  supposant que ça marchait.
- **Homonymes** : si plusieurs entrées de l'index ont un nom strictement identique, aucune
  n'est choisie automatiquement — toutes leurs SpId sont listés dans une section "à
  vérifier manuellement" de la sortie console.
- Testé de bout en bout sur un PDN synthétique à 2 joueurs : "Callegari, Mickael" résolu
  sans ambiguïté (1087 entrées indexées pour la lettre C) puis sa photo récupérée
  automatiquement ; "Nom Inconnu Test XYZ" correctement signalé comme introuvable. La
  branche homonymes n'a pas pu être testée sur un cas réel trouvé en direct (aucun doublon
  rencontré dans l'échantillon exploré) mais repose sur la même structure de données
  (regroupement par nom normalisé dans une `Map`) déjà validée par les deux autres cas —
  risque résiduel faible, non revérifié en conditions réelles.

## Backend Toernooibase (Cloudflare Worker) — changement d'architecture

**DamikA n'est plus un site 100% statique sans backend.** Une seule fonctionnalité en
dépend : le bouton "🔍 Récupérer sur Toernooibase" du popover photo joueur (Bloc 1). Tout
le reste de l'app (moteur, plateau, bibliothèque, PDN...) reste inchangé, statique, sans
build step. Ce backend est un choix délibéré et isolé, pas une refonte générale.

**Pourquoi un backend alors qu'un navigateur ne peut pas scraper Toernooibase (CORS)** : un
Worker Cloudflare fait la requête sortante à la place du navigateur, sans restriction CORS
côté serveur — l'appli l'appelle ensuite en `fetch()` classique, le Worker répondant avec
les en-têtes CORS nécessaires.

**Validé avant de construire quoi que ce soit** : un Worker de test jetable
(`wrangler deploy --temporary`, sans compte Cloudflare) a d'abord vérifié qu'une requête
sortante depuis le réseau Cloudflare Workers vers Toernooibase aboutit bien (200, vraie
page HTML) plutôt que d'être bloquée comme via un proxy public générique testé plus tôt
(`r.jina.ai`, qui recevait la page de vérification anti-bot Cloudflare de Toernooibase —
Toernooibase est lui-même derrière Cloudflare, `Server: cloudflare` confirmé par `curl -I`).
Résultat du test : `{"status":200,"looksBlocked":false,"photoMatch":"../Afbeeldingen/Spelers/5032.jpg"}`
— confirmé en conditions réelles, pas supposé.

**Honnêteté sur le risque, comme demandé par Mickaël** : ce test prouve que ça marche
AUJOURD'HUI, pas que ça marchera toujours. Toernooibase pourrait activer des règles
anti-bot plus strictes (mode "Bot Fight") qui bloqueraient aussi le trafic Worker à tout
moment, sans préavis, y compris après un déploiement qui fonctionnait. Aucune garantie à
100%, d'où le filet de sécurité ci-dessous.

### Le Worker (`worker/index.js`)

Endpoint GET unique : `?name=<nom du joueur>` → `{ status: "resolved", spId, matchedName,
photoUrl }` (ou `"ambiguous"` avec la liste des candidats, `"not_found"`, `"no_photo"`,
`"error"`). Logique de résolution nom→SpId **dupliquée** (pas partagée en module commun)
depuis `scripts/resolve-toernooibase-players.mjs` — Node et le runtime Workers n'ont pas le
même système de modules/outillage, et le volume de code concerné est faible. Toute
correction de la logique de recherche (ex. un nouveau piège de pagination Toernooibase)
doit donc être répercutée **dans les deux fichiers**.

### Déploiement

```
cd worker
npx wrangler login        # première fois : ouvre le navigateur, autorise l'accès à ton compte Cloudflare
npx wrangler deploy       # déploie/redéploie sur *.workers.dev
```
Aucune variable d'environnement requise. Après un redéploiement qui change l'URL (rare —
seulement si le `name` dans `wrangler.toml` change), mettre à jour `TOERNOOIBASE_WORKER_URL`
en haut de `js/main.js`.

**⚠️ État actuel du déploiement (à régulariser rapidement)** : le Worker en production
(`https://damika-toernooibase-photos.shell-green.workers.dev`, testé et fonctionnel — voir
au-dessus) a été déployé via `wrangler deploy --temporary` (aucun compte requis pour aller
vite pendant cette session) plutôt que `wrangler login`. Un compte temporaire Cloudflare
("Shell Green") a été créé automatiquement, **à réclamer dans les 60 minutes suivant le
déploiement** via l'URL de claim affichée par la commande (sans quoi le Worker disparaît).
Si ce délai est dépassé au moment de lire ceci, relancer `npx wrangler login` (avec un
compte Cloudflare réel, gratuit) puis `npx wrangler deploy` depuis `worker/` pour obtenir
un déploiement permanent — l'URL changera, à reporter dans `TOERNOOIBASE_WORKER_URL`.

### Palier gratuit (Cloudflare Workers, plan Free — vérifier sur leur page tarifs au
moment de relire ceci, ces chiffres peuvent changer) : 100 000 requêtes/jour, ~1000
requêtes/minute en rafale, 10 ms de temps CPU actif par requête (le temps d'attente réseau
du `fetch()` vers Toernooibase n'est pas compté), aucune carte bancaire requise. Très
largement suffisant pour un usage personnel (quelques clics par session).

### Filet de sécurité : le script Node reste la voie de secours

`scripts/resolve-toernooibase-players.mjs` + `scripts/fetch-toernooibase-photos.mjs`
**restent intacts et fonctionnels**, inchangés par ce chantier. Si le Worker tombe en panne
ou se fait bloquer par Toernooibase, le bouton affiche un toast d'erreur invitant à
utiliser l'URL manuelle ou le script Node — jamais un plantage silencieux.

## Bugs corrigés : import PDN Toernooibase brut + synchronisation Bibliothèque

Découverts sur un vrai fichier Toernooibase (`Callegari - Crevat 2025.pdn.pdn`, fourni par
Mickaël) qui n'affichait ni noms de joueurs, ni Elo, ni photos après import — alors que la
liste des coups s'affichait bien (preuve que le fichier était lu, juste mal interprété).

1. **En-têtes PDN sans guillemets.** Certains exports Toernooibase bruts omettent purement
   et simplement les guillemets attendus par la norme : `[White Callegari, Mickael]` au
   lieu de `[White "Callegari, Mickael"]` — y compris pour des valeurs contenant une
   virgule. `parser.js` exigeait des guillemets (`/^\[\w+\s+".*"\]$/`) aussi bien pour
   détecter une ligne d'en-tête que pour en extraire la valeur — toute la ligne d'en-tête
   était donc silencieusement ignorée (ni erreur ni avertissement), tandis que le texte des
   coups, découpé indépendamment, continuait de se parser normalement. D'où le symptôme
   trompeur "les coups s'affichent mais pas les infos joueurs". Corrigé avec `HEADER_LINE_RE
   = /^\[(\w+)\s+(.*)\]$/`, guillemets retirés seulement s'ils sont présents en début/fin de
   valeur — accepte les deux formats indifféremment.
2. **Tag Elo `WhiteRating`/`BlackRating` jamais lu.** L'app ne lisait que
   `WhiteElo`/`BlackElo` (convention lidraughts) — or c'est `WhiteRating`/`BlackRating` le
   tag standard PDN 3.0 (spec FMJD, confirmé via wiegerw.github.io/pdn/pdntags.html) et
   c'est ce qu'exportent les fichiers Toernooibase bruts. `syncHeaderFieldsFromState()`
   affiche maintenant `headers.WhiteElo || headers.WhiteRating` (idem Black) — les deux
   variantes sont réellement rencontrées en pratique, aucune des deux n'est à privilégier
   dans l'absolu.
3. **URL de photo cassée dans `WhiteUrl`/`BlackUrl`.** Sur ce même export brut, l'URL est
   mal formée à la source : `httptoernooibase.kndb.nlAfbeeldingenSpelers5032.jpg` (il
   manque `://`, les `/` entre segments). `fixMalformedToernooibaseUrl()` reconnaît le motif
   `toernooibase.kndb.nl` + `Afbeeldingen` + `Spelers` + un nombre + `.jpg` (slashes
   optionnels dans le motif — matche aussi bien une URL cassée qu'une déjà bien formée,
   comme dans d'autres exports Toernooibase, cf. plus haut) et reconstruit l'URL canonique.
   **Nouveauté associée** : `WhiteUrl`/`BlackUrl`, une fois corrigées, alimentent
   automatiquement `playerPhotoPrefill` au chargement de la partie
   (`registerPhotoUrlFromHeaders()`) — même niveau de priorité que
   `data/player-photos.json`, donc jamais au-dessus d'un choix manuel, et sans écraser une
   entrée de pré-remplissage déjà connue pour ce nom. Concrètement : importer un PDN
   Toernooibase peuple désormais les photos des DEUX joueurs sans aucune action
   supplémentaire, dès lors que le fichier contient ces tags.
4. **Bibliothèque jamais synchronisée avec les éditions du Bloc 1.** Éditer un champ (nom de
   joueur, Elo, événement...) de la partie active ne mettait à jour QUE la variable `headers`
   en mémoire — `library[libraryActiveIndex].headers` restait un instantané figé pris au
   moment du chargement (import/clic dans la liste), jamais retouché. Le titre/sous-titre
   affichés dans l'onglet Bibliothèque ne reflétaient donc jamais les modifications, y
   compris après sauvegarde. Corrigé avec `syncActiveLibraryEntryHeaders()`, appelée depuis
   le même listener `blur` qui met déjà à jour `headers` — recopie `headers` dans l'entrée de
   bibliothèque active, préserve un renommage manuel existant (`headers.Label`, propre à la
   bibliothèque et absent des en-têtes de la partie elle-même), marque `libraryDirty`, et
   rafraîchit l'affichage (`renderLibrary()`) + la persistance (`scheduleSave()`).
   **Bug connexe découvert en corrigeant celui-ci** : `startNewGame()` ne réinitialisait
   jamais `libraryActiveIndex` — après "Nouvelle partie", l'entrée précédemment active
   restait marquée comme telle dans l'onglet Bibliothèque alors que le damier affiche une
   partie libre sans rapport. Sans ce correctif complémentaire, `syncActiveLibraryEntryHeaders()`
   aurait fini par écraser cette entrée avec les en-têtes de la partie libre à la première
   édition de champ après "Nouvelle partie" — corrigé en même temps
   (`libraryActiveIndex = -1` + `renderLibrary()` dans `startNewGame()`).

Testé de bout en bout sur le fichier réel fourni : noms ("Crevat Luc"/"Callegari Mickael"),
Elo ("Elo 2004"/"Elo 2032"), titre ("CMF"), photos des deux joueurs (auto-détectées via
`WhiteUrl`/`BlackUrl` reconstruites) tous corrects après import ; édition du champ Event
("Tournoi Modifié Test") répercutée instantanément dans le sous-titre de l'entrée
Bibliothèque, vérifiée à la fois dans le DOM et dans le PDN persisté en `localStorage`.

## Session 2026-09-17 (1ʳᵉ partie)

Session d'ajustements ciblés sur le Header, le Bloc 1 et la Bibliothèque, plus deux
chantiers transverses (navigation molette, déploiement public). Chaque point ci-dessous a
été testé en navigateur (souvent via automatisation Claude-in-Chrome sur un serveur local),
pas seulement écrit puis supposé fonctionnel.

**Header**
- **Export PDN/TXT et sauvegarde bibliothèque via une vraie fenêtre "Enregistrer sous"**
  (File System Access API, `window.showSaveFilePicker`) au lieu d'un téléchargement direct
  vers le dossier Téléchargements. Nouvelle fonction partagée `saveTextWithPicker()` dans
  `main.js`, utilisée par les 3 boutons (Export PDN, Export TXT, Sauvegarder la
  bibliothèque) : filtre d'extension adapté (`.pdn`/`.txt`), nom par défaut cohérent avec la
  logique déjà en place (`safeFilename()` pour l'export d'une partie, `libraryName` pour la
  bibliothèque). Repli automatique sur le téléchargement direct si l'API n'est pas supportée
  (Firefox/Safari) ou en cas d'erreur ; une annulation volontaire de la fenêtre n'écrit
  jamais de fichier de repli.
- **Menu palette (icône 🎨) : distinction DAMIER/PIONS renforcée.** Les labels de section
  étaient trop discrets, confondus avec les options. 2 pistes prototypées en direct dans la
  page et comparées par Mickaël (bandeau plein doré vs icône+soulignement) — bandeau plein
  retenu (`.dropdown-section-label` : fond `--gold-soft`, texte doré gras, bordures
  haut/bas).
- **Flip du damier synchronisé avec l'ordre des cartes joueurs.** Le bouton "retourner le
  damier" inversait déjà l'orientation du plateau mais pas l'ordre visuel des 2 cartes du
  Bloc 1, créant une incohérence. Corrigé en purement visuel (`order` flex CSS sur
  `.player-card`/`.score-center`, classe `.flipped` sur `.players-rail` togglée dans
  `toggleFlip()`) — aucune donnée ni le DOM lui-même ne bougent, réversible.

**Bloc 1 (cartes joueurs + zone centrale)**
- **Score global affiché entre les 2 cartes** (`#score-center`), parsé depuis
  `[Result "X-Y"]` (nouvelle fonction `parseResultScore()`) — le badge "SCORE" individuel de
  chaque carte ne fonctionnait jamais (`headers.WhiteScore`/`BlackScore` n'étaient renseignés
  nulle part dans le code, bug latent). Camp gagnant mis en évidence en doré ; neutre si
  égalité ou partie en cours. Badges "SCORE" individuels retirés.
- **Badge Elo mis en avant** : déplacé du coin de la carte (peu visible) vers la ligne du nom,
  juste à côté du tag Blancs/Noirs — pilule dorée pleine plus grande, 2 options prototypées et
  comparées avant validation.
- **Compteur de temps (théorie des finales) déplacé** de la zone entre les cartes (où il
  déséquilibrait le centrage du score) vers la ligne de statut en bas du damier, combiné avec
  "Trait aux Blancs/Noirs" (ex. "+2 · Trait aux Blancs"). Le score central est maintenant
  exactement centré dans son espace (vérifié par mesure de `getBoundingClientRect()`, écart
  de 0px).
- Nom des joueurs (cartes ET titres bibliothèque) affiché "Prénom Nom" au lieu du format PDN
  brut "Nom, Prénom" — affichage uniquement, `headers.White/Black` et l'export PDN gardent le
  format d'origine intact. Date du bandeau méta affichée en JJ/MM/AAAA (donnée interne reste
  en AAAA.MM.JJ), même principe.

**Bibliothèque**
- **Nom de la bibliothèque** (distinct du nom de chaque partie) : nouveau champ éditable
  `#library-name` en haut de l'onglet, persisté en localStorage et encodé dans le fichier
  `.pdn` exporté comme un en-tête non standard `[LibraryName "..."]` placé avant la 1ʳᵉ
  partie (récupéré et retiré proprement à la lecture, ne pollue pas cette partie). Utilisé
  comme nom de fichier par défaut à la sauvegarde.
- **Format des entrées** : ordre fixe Blancs — Noirs (jamais réordonné selon le vainqueur,
  après une 1ʳᵉ tentative de réordonnancement jugée déroutante par Mickaël), score en fin de
  ligne, couleur bronze fixe (`#c9a06a`, éclaircie après un 1er essai trop peu contrasté)
  appliquée systématiquement au nom des Noirs — indépendant du résultat. "X coups" retiré de
  la ligne meta (ne garde que le nom du tournoi).
- **Plusieurs bugs de persistance/rendu corrigés**, tous liés à des interactions entre
  chantiers précédents et celui-ci :
  1. Un import à une seule partie (fichier, coller/Ctrl+V) écrivait quand même dans la
     bibliothèque sans clic explicite sur "Ajouter la partie" — corrigé sur les deux chemins
     (`importFiles`/`pastePdnText`) : seul un fichier multi-parties (import groupé type
     tournoi) continue d'ajouter directement.
  2. La sauvegarde automatique localStorage (`scheduleSave()`, débattue sur 400ms) perdait
     une écriture en attente si la page était rafraîchie immédiatement après une action —
     corrigé par un flush systématique sur `beforeunload`.
  3. Un renommage inline validé SANS changement réel (double-clic + Entrée sans rien taper)
     figeait quand même un `headers.Label` redondant, faisant perdre définitivement couleur
     Noirs + score à l'affichage (confondu au départ avec un bug "entrée active" — il n'y a
     toujours eu qu'un seul chemin de rendu). Corrigé à la source (`startRenameLibraryEntry`)
     ET rendu auto-guérisseur pour les entrées déjà corrompues par ce bug avant le correctif
     (`customLabelOf()` ignore un `Label` identique au titre par défaut).
  4. Régression apparente "photos joueurs disparaissent au F5" : fausse piste bibliothèque —
     cause réelle dans `loadPlayerPhotoPrefill()`, qui remplaçait entièrement la table
     `playerPhotoPrefill` au lieu de la fusionner, écrasant une photo tout juste enregistrée
     depuis les tags `WhiteUrl`/`BlackUrl` de la partie en cours avant que le fetch de
     `data/player-photos.json` ne se résolve. Corrigé par fusion (fichier en base, entrées de
     session prioritaires).

**Navigation à la molette** (comme Toernooibase) : molette bas/haut sur le damier = coup
suivant/précédent, réutilise `game.undo()`/`redo()` existants (factorisés en
`goToPrevMove()`/`goToNextMove()`, partagés avec les boutons ◀/▶). Listener non-passif avec
`preventDefault()` uniquement sur le `<canvas>` (pas toute la page), anti-rafale (1 coup max
par 150ms) pour ne pas enchaîner plusieurs coups sur un seul geste de trackpad.

**Déploiement public** : site déployé sur **https://damika.shell-green.workers.dev**
(Cloudflare, compte "Shell Green" déjà utilisé pour le Worker Toernooibase, réutilisé via
`wrangler login` OAuth — un token API a été envisagé après deux échecs de connexion dus à un
conflit entre deux tentatives de login lancées en parallèle, mais la connexion OAuth a en
fait fini par réussir, rendant le token inutile). Déploiement direct via Wrangler CLI
(upload de fichiers statiques, aucun dépôt Git n'existant pour ce projet) plutôt que
l'intégration Git de Cloudflare Pages. **Piège rencontré et corrigé** : la commande de
déploiement exécutée dans le dossier même des fichiers à publier a laissé fuiter deux
fichiers internes de Wrangler comme "assets" publics du site (`wrangler-account.json` —
contient seulement l'ID/nom du compte, pas un secret — et un fichier worker vide) ; corrigé
en relançant le déploiement depuis un dossier de travail séparé du dossier d'assets, et
vérifié par requêtes directes que ces fichiers renvoient bien 404 sur le site final. Noter
que Cloudflare a orienté la commande vers son nouveau modèle unifié "Workers + assets
statiques" plutôt que le Cloudflare Pages classique (`.pages.dev`) — d'où l'URL finale en
`.workers.dev`, décision confirmée avec Mickaël plutôt qu'imposée. Le Worker
`damika-toernooibase-photos` existant reste pleinement fonctionnel, aucun conflit entre les
deux projets sur le même compte. Testé en conditions réelles sur l'URL publique : chargement
de page, import PDN, affichage joueurs/score, ajout à la bibliothèque.

**Chantier "commentaire de coup" (A3)** : non retouché cette session — reste dans l'état
finalisé et validé le 2026-09-16.

## Session 2026-09-17 (suite)

Deuxième partie de la session, enchaînée sur la même journée. Chaque point testé en
navigateur (souvent via automatisation Claude-in-Chrome) avant confirmation, comme d'habitude.

**Bug corrigé : score du Bloc 1 affichant une valeur incorrecte après import.** Plusieurs
allers-retours avant d'isoler la vraie cause. Le calcul (`parseResultScore(headers.Result)`,
injecté dans `#score-black`/`#score-white` par id — donc déjà lié au camp réel, jamais à un
ordre fixe) était en réalité correct dès le départ. Décision finale de Mickaël sur le design :
le score reste **centré entre les 2 cartes** (pas de badge individuel par carte, tenté puis
annulé en cours de session), avec un ordre d'affichage qui **suit la position visuelle des
cartes** (`order` flex sur `#score-black`/`#score-white`, permuté par `.players-rail.flipped`
— même mécanique que les cartes elles-mêmes). Le vrai blocage rencontré à plusieurs reprises
était un **cache navigateur** : même une nouvelle tab peut servir un `main.js` périmé sans
requête réseau tant qu'un Ctrl+Shift+R n'a pas été fait — confirmé en direct par comparaison
avant/après hard refresh sur le même scénario.

**Export image (PNG) et PDF**, nouvelles entrées dans le menu "Exporter" existant :
- **PNG** : capture directe du `<canvas>` du damier (pas besoin d'une lib de capture DOM
  type html2canvas, le plateau est déjà un canvas natif) + légende composée dessous
  (joueurs, Elo, tournoi/ronde/date, score, numéro du coup courant), thème sombre bronze/doré
  cohérent avec l'appli. Téléchargement direct, nom `NomBlancs_vs_NomNoirs_coupXX.png`.
- **PDF** : jsPDF vendorisé en local (`js/vendor/jspdf.umd.min.js`, aucune dépendance CDN —
  cohérent avec "pas de build step"). 4 pages : garde (joueurs/Elo/tournoi/score), notation
  complète 2 colonnes (Noirs en bronze, commentaires de coup en italique), diagramme de la
  position finale. jsPDF n'a pas de fond de page global : un rectangle plein sombre est
  redessiné sur CHAQUE page. Le diagramme final est obtenu en naviguant brièvement le jeu réel
  jusqu'à la fin puis en revenant à la position d'origine (`jumpToPly`, synchrone donc sans
  flash visible) plutôt qu'en dupliquant un moteur de rendu séparé.

**Partage de partie par lien + QR code**, sans backend : le PDN de la partie en cours est
compressé (LZString vendorisée en local, `compressToEncodedURIComponent` déjà "URL-safe") et
embarqué dans le paramètre `?p=` de l'URL. Au chargement, `loadSharedGameFromUrl()` (appelée
juste après `restoreAppState()`) décode ce paramètre et charge la partie comme "partie en
cours" **sans jamais toucher à la bibliothèque locale** de la personne qui ouvre le lien —
vérifié en pratique (bibliothèque inchangée après ouverture d'un lien partagé). Le paramètre
est retiré de l'URL une fois consommé (`history.replaceState`) pour qu'un F5 ultérieur ne
réimporte pas silencieusement la version partagée par-dessus un travail en cours. Modale de
partage (lien copiable + QR, QRCode.js vendorisé en local, `js/vendor/qrcode.min.js`) avec
avertissement clair si le lien dépasse ~2000 caractères plutôt qu'un lien cassé. QR sur fond
blanc même en thème sombre : un QR doré-sur-noir est un contraste bien plus faible pour un
lecteur de smartphone que le noir-sur-blanc classique.

**Sons** (coup joué, capture, début/fin de partie) + réglage de volume/mute — provenance
exacte documentée dans `assets/sounds/SOURCES.txt` (à relire avant de retoucher aux sons) :
- `move.mp3`, `capture.mp3`, `game-end.mp3` : fichiers RÉELS du client Lidraughts
  (`RoepStoep/lidraughts`, `public/sound/standard/{Move,Capture,Victory}.mp3` — pas une
  resynthèse), récupérés en clair depuis GitHub. Usage confirmé en lisant le code source
  client (`ui/round/src/ctrl.ts` : `sound.move()`/`sound.capture()` sur chaque coup,
  `li.sound.victory/defeat/draw()` en fin de partie). Fait notable vérifié par sha256 : dans
  ce dépôt, `Victory.mp3`/`Defeat.mp3`/`Draw.mp3` sont byte-pour-byte IDENTIQUES — Lidraughts
  ne joue qu'un seul son de fin de partie sous 3 noms différents, donc `game-end.mp3` est
  objectivement le bon choix quelle que soit l'issue.
- `game-start.mp3` : **aucun équivalent trouvé** dans ce dépôt (vérifié à la fois par la
  liste des fichiers de `public/sound/standard/` et par la recherche des appels `sound.xxx()`
  dans le code — pas de son de "début de partie" côté Lidraughts). Décision actée avec
  Mickaël : conserver le fichier CC0 Kenney ("Impact Sounds", `impactPlank_medium_000.ogg`)
  d'une itération précédente pour cet événement précis plutôt que d'en chercher un substitut
  — pas d'équivalent Lidraughts, pas de raison de le retirer.
- Implémentation : simples `<audio>` (pas de Web Audio API, inutile pour 3-4 sons courts),
  un petit pool de 3 instances par événement (round-robin) pour qu'un son déjà en cours ne
  soit pas coupé net si un second se déclenche très vite après (ex. autoplay rapide). Bouton
  🔊/🔇 dans la topbar (clic = mute/démute rapide, état persisté `damika:sound-muted`) ; un
  survol du même bouton révèle un popover avec un slider 0-100% (persisté séparément,
  `damika:sound-volume`, appliqué en temps réel aux 4 pools).
- Piège de test rencontré : `game.isGameOver()` ne doit être vérifié/sonné qu'au point exact
  où un coup vient d'être commité (dans `playMove()`, l'autoplay et `goToNextMove()`) —
  jamais dans `refreshUI()` lui-même, qui tourne aussi lors d'une simple navigation
  (undo/redo/jump), ce qui rejouerait le son de fin de partie à chaque fois qu'on navigue
  vers la position finale déjà atteinte.

## Session 2026-09-18

Session longue, majoritairement centrée sur le Header (popover son) et la Bibliothèque
(réordonnancement, édition, synchronisation avec le Bloc 1). Chaque point testé en
navigateur réel (souvent via automatisation Claude-in-Chrome) — clics/frappe réels, pas
seulement relecture de code — avant d'être considéré fait, y compris pour les tours où le
retour de Mickaël disait explicitement "reproduis le bug toi-même".

**1. Popover du volume (icône 🔊 du header) : 2 bugs corrigés.**
- Le popover se fermait dès que le curseur quittait le bouton, avant d'atteindre le slider —
  un `margin-top: 6px` créait une zone morte entre bouton et popover qui coupait le survol
  (même piège que celui déjà documenté sur `.move-comment-hint`, cf. session du 2026-09-16).
  Corrigé en supprimant le vrai gap (`margin-top: 0`, décalage visuel reporté sur un
  `padding-top` du wrapper transparent) + ajout d'une classe `.sound-dragging` (posée au
  `pointerdown` sur le slider, retirée au `pointerup` global) pour couvrir un drag qui
  sortirait brièvement de la zone.
- Le son ne se jouait jamais du tout dans certains cas : les fichiers audio et le code
  étaient en fait corrects (vérifié par ffprobe/ffmpeg + test réel — le son joue bien), le
  vrai risque est la politique autoplay du navigateur : `playSound('game-start')` peut se
  déclencher au chargement de la page (partie partagée par lien) avant tout geste
  utilisateur, et échoue silencieusement. Ajout d'un mécanisme de retry : le son ainsi
  bloqué est mémorisé (`pendingUnlockSound`) et rejoué automatiquement au premier
  `pointerdown` sur la page, où qu'il ait lieu.

**2. Chantier "packs de sons personnalisables" : prototypé puis retiré à la demande de
Mickaël avant validation finale.** Standard/Piano/NES (thèmes Lidraughts téléchargés,
sélecteur radio dans le popover, persistance localStorage) — retiré intégralement sur
demande explicite ("on ne va garder que le son standard Lidraughts"), fichiers Piano/NES
supprimés (jamais committés), code de sélection de pack retiré de main.js/index.html/
style.css. Seul le pack Standard déjà en place avant ce chantier a été conservé.

**3. Réordonnancement manuel de la Bibliothèque par glisser-déposer : terminé, plusieurs
itérations pour arriver à un vrai geste "carte physique" fiable.**
- 1ʳᵉ version : drag & drop HTML5 natif (`draggable="true"`) sur une petite poignée dédiée
  (`.library-item-drag`, icône "⠿"). Fonctionnait mais 2 problèmes signalés par Mickaël :
  (a) la "ghost image" semi-transparente que le navigateur génère automatiquement pour un
  `draggable` se superposait de façon illisible au texte de la carte survolée pendant le
  drag ; (b) la poignée, minuscule et invisible hors survol, était trop difficile à
  attraper avec une souris réelle ("impossible de déplacer la carte").
- Version finale : drag & drop **implémenté à la main** via `pointerdown`/`pointermove`/
  `pointerup` (PAS le drag&drop HTML5 natif — aucun moyen fiable de rendre sa ghost image
  opaque ou de la supprimer). La carte déplacée devient un élément réel détaché du flux
  (`position: fixed`, fond opaque `var(--panel)`, ombre + léger `scale(1.02)`) qui suit le
  curseur ; un placeholder en pointillés occupe sa place dans la liste ; les autres cartes
  se décalent avec une transition fluide (technique FLIP : positions capturées avant/après
  le déplacement du placeholder dans le DOM, animées depuis un transform inversé vers
  l'identité). Zone de prise étendue à **toute la carte** (pas juste la poignée, gardée
  seulement comme indice visuel), avec un seuil de mouvement de 4px
  (`LIBRARY_DRAG_THRESHOLD_PX`) pour distinguer un simple clic (sélection de la partie)
  d'un vrai drag. Un flag `libraryDragJustEnded` évite que le `click` natif qui suit
  systématiquement un relâchement de souris après un vrai drag ne resélectionne/rouvre la
  partie au passage. Réordonnancement persisté comme tout changement de bibliothèque
  (`moveLibraryEntryTo()`, `scheduleSave()`).
- Piège d'automatisation rencontré en testant : les coordonnées de clic de l'outil
  Claude-in-Chrome sont dans l'espace pixel du **screenshot renvoyé**, pas les pixels CSS
  réels de la page (ratio ~0.82 sur cette machine, cf. piège similaire déjà documenté pour
  la session logo/branding) — plusieurs clics ont raté leur cible avant de systématiser
  l'usage de l'outil `find` (accessibilité) ou d'un calcul de `getBoundingClientRect()`
  plutôt que d'estimer les coordonnées à l'œil sur un screenshot.

**4. Chargement silencieux d'une partie depuis la Bibliothèque.** Cliquer sur une entrée
pour l'ouvrir ne doit jouer aucun son (retour Mickaël) — `loadParsedGame()` accepte
désormais une option `{ silent: true }`, utilisée uniquement par ce clic ; les sons de
coup/prise/fin de partie pendant le jeu réel restent inchangés.

**5. Édition des champs joueurs (nom, score, Elo, titre) directement sur les cartes,
Bloc 1 ET Bibliothèque, avec synchronisation bidirectionnelle — plusieurs itérations,
bug architectural de fond trouvé et corrigé en fin de session.**
- Score transformé en **champ texte libre** unique (plus de split Blancs/Noirs coloré par
  vainqueur) : un seul `contenteditable` (`#score-value`, `data-field="Result"`) lié
  directement à `headers.Result`, accepte n'importe quel format ("0-2", "1-1 (annulé)"...).
  CSS `.score-center` simplifié en conséquence (règles `order`/`.winner` retirées).
- Carte Bibliothèque enrichie : nom Blancs/Noirs + score éditables au clic
  (`renderEditableLibraryTitle()`/`buildEditableLibraryField()`), même mécanisme que les
  champs `.player-name`/`.meta-field` du Bloc 1 (contenteditable + blur). Un essai
  intermédiaire avait aussi ajouté une ligne Elo/Titre sous le nom sur la carte
  Bibliothèque — **retiré** sur demande de Mickaël ("réintroduite par erreur") : Elo/Titre
  restent éditables uniquement dans le Bloc 1, la carte Bibliothèque n'affiche que
  noms+score et les infos meta existantes (événement...).
- **Bug de fond découvert après plusieurs symptômes en apparence distincts** (nom
  divergent entre Bloc 1 et Bibliothèque, score qui disparaît de la carte, coloration du
  nom Noirs qui se perd) : `headers` (Bloc 1) et `library[idx].headers` (Bibliothèque)
  étaient DEUX OBJETS JS DISTINCTS, synchronisés manuellement par une copie
  (`{...headers}`) à chaque édition — mécanisme de sync avec des trous, notamment un
  ancien renommage manuel ("libellé personnalisé", `headers.Label`, hérité d'une session
  antérieure) qui pouvait rester figé et diverger silencieusement des vrais noms stockés
  (résidu concret rencontré : "Kevin Machtelinck2" affiché sur la carte alors que le Bloc 1
  affichait "Kevin Machtelinck", correctement lu depuis `headers.Black`).
  **Corrigé à la racine, pas juste la donnée visible** : `headers` et
  `library[libraryActiveIndex].headers` sont désormais **la même référence d'objet**
  (`loadParsedGame()` ne copie plus `newHeaders` dans un nouvel objet — `headers =
  newHeaders` directement ; `restoreAppState()` corrigé de la même façon, il reconstruisait
  aussi ces deux objets séparément depuis deux textes PDN distincts au démarrage de la
  page — même bug, deuxième occurrence). Toute édition (Bloc 1 ou carte Bibliothèque) mute
  cet objet unique ; plus aucune fonction de "sync" (`syncActiveLibraryEntryHeaders()`
  supprimée) n'est nécessaire pour les champs partagés — juste un appel à
  `renderLibrary()`/`syncHeaderFieldsFromState()` pour rafraîchir l'affichage DOM après
  mutation. Vérifié par identité d'objet (`headers === library[idx].headers` → `true`),
  y compris après un rechargement complet de la page.
  **La fonctionnalité de "libellé personnalisé" (renommage libre par double-clic,
  `headers.Label`) a été retirée entièrement** : c'était elle qui permettait cette
  divergence (un texte arbitraire remplaçant l'affichage, sans lien garanti avec les vrais
  noms, et sans possibilité de coloration par camp sur du texte opaque — la carte perdait
  la coloration bronze des Noirs dès qu'elle était en mode "libellé"). Le titre d'une
  entrée de bibliothèque est maintenant *toujours* dérivé de `headers.White`/
  `headers.Black`, comme le Bloc 1 — plus de deuxième source de vérité possible pour le
  nom. `headers.Label` résiduel nettoyé automatiquement à chaque rendu de la Bibliothèque
  (`delete entry.headers.Label` dans `renderLibrary()`), y compris dans les données déjà
  persistées en localStorage.
  Au passage, dédoublonné le champ `result` (séparé de `headers.Result`, utilisé
  uniquement pour l'écriture du tag `[Result]` en export PDN) : `serializeToPdn()`/
  `serializeLibraryEntryToPdn()`/`serializeToTxt()` ne prennent plus `result` en paramètre
  séparé, il est dérivé de `headers.Result` directement (même principe : une seule source
  pour une même donnée logique).
- Testé exhaustivement dans les deux sens (Bloc 1 → Bibliothèque et Bibliothèque →
  Bloc 1) sur nom/score/Elo, avec des noms contenant chiffres/caractères spéciaux/retour à
  la ligne, comparaison littérale des deux affichages à chaque fois, et persistance
  vérifiée après rechargement complet.

**Note de fin de session (hors code)** : le serveur de dev local
(`python -m http.server 8934`) a été tué automatiquement par l'environnement (mémoire
système basse pendant que la session était inactive) — pas un problème du serveur
lui-même, à relancer manuellement au besoin.

## Session 2026-10-05 : purge d'une donnée nominative du dépôt public

Session de maintenance, aucun code modifié.

- **Reprise** : lecture de CLAUDE.md, `git status` et `git log`. `main` synchronisée avec
  `origin/main`, rien de non commité hormis le dossier non suivi `Claude outputs/`.
- **Vérification** : le commit `01d7458` ("Récupère scripts/players.txt…") avait remis
  dans le dépôt public le fichier `scripts/players.txt`, qui contient le nom et l'identifiant
  Toernooibase d'une tierce personne. Il était sur `origin/main` et sur la branche
  `claude/vigilant-brahmagupta-buxtul`. Ce commit était le seul à toucher ce fichier ;
  `data/player-photos.json` n'était pas concerné.
- **Constat CLAUDE.md** : plusieurs fonctionnalités livrées (aide clavier, récents/favoris/
  filtres, thème "Miel doré", pill dirty, PDF repensé…) figuraient encore au backlog.
  Corrigé en fin de session.
- **Purge**, avec confirmation à chaque étape destructive :
  1. deux miroirs de sauvegarde (`git clone --mirror`), un du local et un d'`origin` ;
  2. `scripts/players.txt` ajouté au `.gitignore` et retiré de l'index (commit dédié), copie
     du fichier gardée hors dépôt ;
  3. `git filter-repo --path scripts/players.txt --invert-paths --force` sur toutes les
     branches (78 commits réécrits, SHA modifiés à partir de `01d7458`). Un premier
     lancement s'est arrêté sans rien réécrire : `filter-repo` demandait par une question
     interactive s'il devait continuer la purge précédente (réponse « N »). Le fichier est
     ensuite remis en local, non suivi ;
  4. vérification qu'aucun commit d'aucune branche ne contenait plus les valeurs
     recherchées.
- **Publication** : la branche distante `claude/vigilant-brahmagupta-buxtul` ne contenait
  aucun commit absent de `main` ; `git diff --stat` entre l'ancien `main` distant et le
  nouveau ne montrait que `.gitignore` et `scripts/players.txt`. Force-push de `main`
  (`--force-with-lease` avec valeur attendue explicite, car `filter-repo` avait supprimé les
  refs distantes locales), puis suppression de cette branche. Aucune autre branche poussée.
- **Vérifications distantes** : `git ls-remote` conforme, aucune occurrence des valeurs
  dans `origin/main` après `fetch`, aucun `players.txt` suivi.
- **Nettoyage** : suppression des deux miroirs et du ref temporaire `refs/old-origin-main`,
  `git status` propre.
- **Limite connue** : l'ancien commit peut rester accessible par son SHA chez GitHub (cache,
  forks, PR éventuelles) tant que le support GitHub n'a pas lancé de nettoyage. Seule une
  demande au support garantit la purge complète.
- **Documentation** : CLAUDE.md remis à jour (section "Livré", backlog, clés localStorage) et
  règle permanente ajoutée : aucune donnée nominative de joueurs suivie par git, vérification
  `git check-ignore` avant tout commit touchant `scripts/`.

## Ce qui manque (backlog actuel, voir CLAUDE.md section 3)

- Persister en localStorage le thème du damier et le style de pion.
- Réactiver le Service Worker (mode hors-ligne).
- Style de pion "Toernooibase" (en pause).
- Export en lot.
- Conformité FMJD approfondie.
- Puis Mobile, puis IA (volontairement pas commencés).
