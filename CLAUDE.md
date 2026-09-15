# DAMICK — Contexte technique

PWA de dames internationales 10x10 (FMJD), vanilla JS (ES modules natifs, pas de
build step, pas de framework), rendu plateau en Canvas 2D. Voir `CAHIER_DES_CHARGES.md`
pour la spec fonctionnelle complète et l'état d'avancement détaillé.

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
  plafond 775px — voir CSS `.board-wrap`).
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

## Tester manuellement une position spécifique (sans jouer coup par coup)

Il n'y a pas de suite de tests automatisés pour l'instant. Pour vérifier un scénario
précis (prise multiple, dame volante, etc.) sans rejouer toute une partie à la souris,
le patron utilisé pendant cette session — à ajouter **temporairement** en bas de
`main.js`, puis à retirer avant de commit :

```js
window.addEventListener('damick:setBoard', (e) => {
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
window.dispatchEvent(new CustomEvent('damick:setBoard', {
  detail: { pieces: [[27, 'w', false], [22, 'b', false]], sideToMove: 'w' },
}));
```

Utile aussi pour du debug ad hoc : un second listener `damick:dump` qui répond via
`damick:dumpResult` avec l'état interne (`selectedSquare`, `game.legalMoves`, etc.)
permet d'inspecter l'état sans passer par le DOM. Toujours nettoyer ces écouteurs de
debug avant de committer — ils n'ont rien à faire en production.

## Ce qui manque (voir CAHIER_DES_CHARGES.md pour la liste complète)

Sons, thèmes de plateau/pions personnalisables, mode clair, aide clavier, annotations
de coups éditables (le parseur PDN les lit déjà, juste pas d'UI), fichiers récents,
favoris, export image/PDF, partage par lien/QR code, photo des joueurs. Chantier mobile
et IA pas commencés (volontairement, phases 2 et 3 du projet).
