# Session du 18/10/2026 — Chantier IA (étages 1, 2a, 2b)

Journal chronologique. Chaque point d'étape (plan, divergence, résultat de test) y est consigné au fil de l'eau.
Les sections « Livré (rien n'est commité) » et « en attente du feu vert » plus bas sont le récit d'ÉPOQUE de chaque
étage ; l'état réel actuel est dans le point de situation ci-dessous (mis à jour le 19/10/2026).

## Point de situation (19/10/2026) — état réel après la session du 18/10

### Dépôt
- Branche `main`, HEAD `7949e4d`, **identique à `origin/main`** (rien à pousser). Arbre de travail propre : seul reste
  non suivi `Claude outputs/` (captures de la jauge, volontairement NON commitées ; ajouter par chemin, jamais `git add -A`).
- Aucun travail en cours ni non commité. Aucune modification de code depuis le dernier commit.
- Le site n'a **pas** été redéployé (déploiement Wrangler à la charge de Mickaël) : la prod ne contient pas l'IA.

### Ce qui est fait et commité, dans l'ordre chronologique (tous le 18/10/2026)
1. `4d40896` (10:31) — **Correctif `rules.js`** : les pièces prises bloquent la dame pendant une rafle (2 lignes, commit isolé).
2. `58cbd61` (10:31) — **Étage 1** : moteur rapide `js/ai/fastboard.js`, `js/ai/worker.js` (ping/moves/perft/divide), tests Node
   (perft, différentiel, bench). Perft identique aux références jusqu'à la profondeur 11.
3. `c797a94` (10:31) — docs étage 1 (`CLAUDE.md`, feuille de session).
4. `08c26f8` (11:25) — **Étage 2a** : `js/ai/eval.js`, `js/ai/search.js` (alpha-bêta, itératif, quiescence, TT Zobrist),
   messages `analyse`/`stop` du Worker.
5. `891261e` (11:25) — tests 2a (symétrie, cohérence, tactique 20/20, mat, match, perf, worker).
6. `b17963a` (11:25) — docs étage 2a.
7. `bdc93dc` (12:53) — **Étage 2b** : analyse dans la liseuse (bouton/touche A, jauge verticale 38 px, plaque de score,
   flèche et ligne du meilleur coup), avec les retouches 2b-bis et 2b-ter (échelle 100, paliers d'avantage, lumière, halo).
8. `094554b` (12:53) — tests 2b (`analysis-format` 94 vérifications, `analysis-controller`).
9. `7949e4d` (12:55) — docs étage 2b (`CLAUDE.md`, feuille de session) : **dernier commit, poussé**.
Rendu 2b validé par Mickaël. Étages 1, 2a et 2b : CLOS.

### En cours / non commité
- Rien. Étage 3 (apprentissage des poids) : non commencé.

### Décisions prises et divergences par rapport aux plans
- **Bug `rules.js` trouvé et corrigé** (étage 1) : pièces prises traversables par la dame ; le moteur rapide avait raison.
  Ligne 90 (pions, même défaut apparent) laissée telle quelle : impossible à déclencher (parité de rangée).
- Convention de comptage perft de Gilbert/Boomstra (rafles de même départ/arrivée/pièces prises = un coup).
- 2a : avancement ET tempo gardés comme deux termes distincts ; TT activée par défaut (scores identiques prouvés), réutilisée
  seulement à profondeur exacte (la PV peut être raccourcie) ; `mate` exposé en `{winner, in}` ; `stop` pris en compte entre deux profondeurs.
- 2b : `terminate()` + recréation du Worker si une analyse est en cours au changement de position ; touche A ignorée en saisie
  et modale ouverte ; flèche/« Meilleur » seulement dès la profondeur 4 ; **jamais persisté** (aucune clé localStorage).
- **Divergences par rapport aux plans 2b** : (a) échelle de la barre 250 → **100** et `isBigSwing` 0,12 → **0,20** (2b-ter) ;
  (b) jauge 14 → 22 → **38 px**, rendue possible sans toucher au layout en réduisant les cartes joueurs de 268 à 250 px pendant l'analyse ;
  (c) la plaque de score (56 px) coûte au damier ~87 px de hauteur en hauteur limitante, au lieu des ~16 px annoncés au plan
  (la largeur n'est jamais touchée) — Mickaël a validé le rendu, la question « ramener la plaque à ~46 px ? » est restée sans suite ;
  (d) « persistance thème damier / style de pion » figurait dans une liste de reste à faire mais était déjà livrée (`283aa72`).
- Limite levée de fait : le Worker d'analyse avait été testé seulement sous Node aux étages 1 et 2a ; le passage de fumée navigateur
  de 2b l'a exercé pour de vrai (analyse jusqu'à la profondeur 11-14, aucune erreur console).

### Bugs et réserves ouverts
- **Jauge sous 900 px** : le layout passe en colonne, la jauge sort de l'écran à gauche (à traiter avec Mobile : la masquer).
- **Non vérifiés visuellement** (2b) : affichage d'un mat, retournement F avec repères/lumière, navigation très rapide, impulsion
  sur gros changement (visible seulement en mouvement).
- **Moteur** : pas de détection de répétition ni de règle des 25 coups de dames (finales de dames pouvant tourner en rond, fausses
  évaluations de gain) ; pas de livre d'ouvertures ; poids d'évaluation estimés à la main, non calibrés.
- **Bibliothèque réelle jamais rejouée dans le moteur** : aucun PDN de Mickaël dans `tests/pdn-local/` ; le code de rejeu n'est validé
  que sur un PDN synthétique (`node tests/diff.mjs` après dépôt d'un `.pdn`).
- Bugs hérités, non traités : lien de partage → écran noir sur téléphone ; ordre « Récentes » non appliqué à l'écran ;
  `damika:arrow-duration` accepte n'importe quelle valeur ; « Retirer la photo » sans effet si la photo vient d'une correspondance floue.
- Dette : plusieurs copies de l'état d'une partie (`game`, `library[i].moves`, localStorage, `originals`).

### Prochaine étape
- Aucune décision prise : **rien ne démarre sans demande de Mickaël** (règle « un chantier à la fois »). Ordre du backlog :
  (1) passe complète de vérification/peaufinage (PDF compris), (2) Mobile (dont jauge sous 900 px, bug du lien de partage),
  (3) réactivation du Service Worker. L'étage 3 IA (apprentissage des poids via `createEvaluator(poids)`) est rangé dans « plus tard ».
- À décider par Mickaël : redéploiement du site avec l'IA ; dépôt d'un PDN de la vraie Bibliothèque pour valider le moteur.

---

## Étage 1 — journal d'époque

## 1. Plan (en attente du feu vert)

1. **Fichiers** : `js/ai/fastboard.js` (moteur), `js/ai/worker.js` (Web Worker module), `tests/` en Node pur : `diff.mjs` (test différentiel), `perft.mjs`, `bench.mjs`. `rules.js` n'est pas modifié, sauf correction d'un bug soumise d'abord.
2. **Plateau** : `Int8Array(50)` indexé 0-49 (case FMJD = index+1). Codes : 0 vide, 1 pion blanc, 2 pion noir, 3 dame blanche, 4 dame noire. Camp au trait stocké à part.
3. **Tables précalculées** : pour chaque case et chaque direction (4), liste des cases de la diagonale, de la plus proche à la plus lointaine (pion et dame, sans calcul row/col).
4. **Génération** : prises par DFS sur le plateau réel, un seul tableau « pièces prises » mutable. Les pièces prises restent sur le plateau et bloquent jusqu'à la fin de la rafle ; jamais deux sauts sur la même. Promotion seulement si le pion s'arrête sur la dernière rangée. Filtre de la grande prise (longueur maximale). Sans prise : coups simples.
5. **Coup** : `{from, to, captured[]}` + chemin pour la comparaison. `makeMove` renvoie un enregistrement d'annulation, `unmakeMove` le consomme (pas de copie du plateau).
6. **API** : `generateMoves()`, `makeMove` / `unmakeMove`, `perft(depth)`, `fromUiBoard(board, side)` / `toUiBoard()`, conversion des coups vers le format `{from, to, capturedThisStep…}` de `rules.js`.
7. **Worker** : messages `{id, type: 'moves' | 'perft' | …, position}` → `{id, result}`. Aucun calcul sur le fil principal.
8. **Tests** : comparaison à `rules.js` sur parties aléatoires et parties PDN de la Bibliothèque (clé canonique = chemin complet + pièces prises). Perft comparé à `rules.js` et aux valeurs de référence publiées (sources citées).
9. **Point d'attention repéré dans `rules.js` (hypothèse à vérifier)** : le commentaire dit que les pièces prises « restent bloquantes », mais le code (lignes 131 et 149 de `findCaptureSequences`) les traite comme des cases vides. Probable bug : une dame pourrait traverser une pièce déjà prise. Le test différentiel tranchera ; si confirmé, soumis à Mickaël avant correction.
10. **Aucun commit**. En fin de session : mise à jour de `CLAUDE.md` et feuille de session complète (divergences, nœuds/seconde).

## 2. Journal

- 2026-10-18 — Lecture de `rules.js` et `CLAUDE.md`. Plan ci-dessus présenté. Création de ce fichier (demande de Mickaël : tout point d'étape y est aussi consigné). En attente du feu vert avant de coder.
- Feu vert reçu (plan validé). Consigne ajoutée : si le bug des pièces prises traversables est confirmé, montrer un cas en 3 lignes puis corriger `rules.js` dans le même mouvement, changement minimal et isolé, commitable à part.
- **Référence perft trouvée** : World Draughts Forum, fil « Perft » (https://damforum.nl/viewtopic.php?t=2308), 5-7 juillet 2008. Ed Gilbert et Feike Boomstra obtiennent des valeurs identiques jusqu'à la profondeur 11 (9 / 81 / 658 / 4265 / 27117 / 167140 / 1049442 / 6483961 / 41022423 / 258895763 / 1665861398) ; Gérard Taillé confirme « OK » sur la position initiale. Les valeurs de BertTuyt divergent dès la profondeur 8 (il soupçonne l'absence de dédoublonnage) : écartées. **Convention de comptage de Gilbert** : deux rafles de même départ, même arrivée et mêmes pièces prises (ordre différent) = UN coup. Le moteur rapide dédoublonne ainsi par défaut (`generateMoves(true)`).
- Écrit `js/ai/fastboard.js` (Int8Array(50), rayons précalculés, DFS de prises sur le plateau réel avec pièces prises bloquantes, makeMove/unmakeMove par piles) et `tests/perft.mjs`, `tests/diff.mjs`.
- **Résultat perft (moteur rapide, avant tout correctif de rules.js)** : concorde avec la référence aux profondeurs 1 à 8 (6 483 961 à la profondeur 8), et avec rules.js aux profondeurs 1 à 5. Environ 5,3 millions de nœuds/s.
- **DIVERGENCE n°1 — rules.js, pièces prises traversables par la dame.** Premier passage du test différentiel (14 291 positions) : 737 divergences, toutes des rafles de dame que rules.js génère et que le moteur rapide refuse. Vérification mécanique sur 40 000 positions aléatoires : sur 19 060 rafles présentes seulement dans rules.js, 19 060 (100 %) traversent ou touchent une pièce déjà prise dans la même rafle. **Qui a raison : le moteur rapide.** Règle FMJD : les pièces prises ne sont retirées qu'à la fin de la rafle et bloquent le passage d'ici là. Le commentaire de `rules.js` l'annonçait déjà (« bloquantes »), mais le code les traitait comme des cases vides.
  - Cas minimal : dame blanche en 19, dames noires en 14 et 32, Blancs au trait. rules.js génère 19→10 (prend 14) puis 10→37 (prend 32) : la 2ᵉ étape traverse la case 14, encore occupée par la pièce prise. Légal : 19x10 seul.
  - **Correctif (2 lignes, `js/engine/rules.js`, dans `findCaptureSequences`, branche dame)** : suppression de `|| deadSet.has(sq)` dans le balayage des cases vides, et de `&& !deadSet.has(lsq)` dans le calcul des cases d'atterrissage. `git diff --stat` : 2 insertions, 2 suppressions.
  - Après correctif : 48 105 positions (300 parties aléatoires + 20 000 positions aléatoires), 333 296 coups comparés, **aucune divergence**.
- **Ligne 90 de rules.js (pions, même défaut apparent : atterrissage autorisé sur une pièce prise) : laissée telle quelle, sans effet.** Preuve : un saut de pion conserve la parité de la rangée ; toute pièce prise est sur la rangée de parité opposée à celles que le pion occupe ; un pion ne peut donc jamais atterrir sur une pièce prise. Confirmé empiriquement : 7,1 millions de positions de pions denses, aucune divergence.
- Pas de fichier PDN disponible en local (la Bibliothèque vit dans le localStorage du navigateur). Le test lit `tests/pdn-local/` (à créer, à ignorer par git) ou `--pdn`. À demander à Mickaël.
- Écrit `js/ai/worker.js` (messages `ping` / `moves` / `perft` / `divide`, gestionnaire `handleMessage` exporté) et `tests/worker.mjs` : 8 vérifications OK. **Limite assumée** : le vrai Web Worker n'a pas été lancé dans un navigateur (consigne : pas de test navigateur) ; seul le gestionnaire appelé par le worker est testé, plus le caractère clonable des résultats (`structuredClone`).
- Ajout de `tests/pdn-local/` au `.gitignore` (les PDN contiennent des noms de joueurs).
- **Test différentiel, gros volume** (3 graines × 1 500 parties aléatoires + 100 000 positions aléatoires) : 717 000 positions, ~5 millions de coups comparés (chemin complet, dédoublonnage, makeMove/unmakeMove vs `applyCaptureSequence`/`applySimpleMove`), 330 000 positions avec prise dont 150 000 rafles multiples, 170 000 prises par une dame, ~14 600 positions à chemins redondants. **Aucune divergence.**
- **perft sur positions aléatoires** (`tests/perft-positions.mjs`, 3 000 positions dont 1/3 de milieux de partie, profondeur 1-3, 1 121 346 nœuds) vs rules.js : aucune divergence, plateau intact après chaque perft.
- **perft position initiale jusqu'à la profondeur 11** : identique aux références (Gilbert / Boomstra) à chaque profondeur : 9, 81, 658, 4265, 27117, 167140, 1049442, 6483961, 41022423, 258895763, **1665861398** (318 s). rules.js (après correctif, dédoublonné) identique jusqu'à la profondeur 6.
- Incident sans suite : un premier lancement du perft profond en `&` imbriqué a été tué avec son shell (sortie tronquée à la profondeur 9) ; relancé correctement.
- Mise à jour de `CLAUDE.md` (structure, tests Node, règle des pièces prises, convention de comptage, état du chantier, backlog).

## 3. Feuille de session (récapitulatif)

**Livré (rien n'est commité)**
- `js/ai/fastboard.js` : moteur rapide, API `FastBoard.initial()`, `fromUiBoard(board, side)`, `toUiBoard()`, `generateMoves(dedupe = true)`, `generateUiMoves()` (format `rules.js`), `makeMove` / `unmakeMove` (piles, sans copie), `perft`, `perftDivide`.
- `js/ai/worker.js` : Web Worker par messages.
- `tests/` : `perft.mjs`, `diff.mjs`, `perft-positions.mjs`, `worker.mjs`, `bench.mjs`, `oracle.mjs`.
- `js/engine/rules.js` : 2 lignes corrigées (voir ci-dessous), à commiter SÉPARÉMENT.
- `.gitignore` (+ `tests/pdn-local/`), `CLAUDE.md`, `docs/SESSION_DERNIERE.md`.

**Divergences trouvées**
1. `rules.js` : pièces prises traversables par la dame (lignes 131 et 149). Raison : le moteur rapide. Corrigé.
2. Aucune autre. Ligne 90 (pion) : défaut apparent mais impossible à déclencher (parité de rangée), laissé tel quel.

**Performances (perft, comptage en bloc au dernier niveau, machine au repos, meilleur de 3)**
- Position initiale, profondeur 8 : ~5,5 millions de nœuds/s (5,0 à 5,3 M/s sur les longues exécutions, profondeurs 9 à 11).
- Milieu de partie (30 demi-coups aléatoires), profondeur 7 : ~11,8 M nœuds/s.
- Finale à dames, profondeur 6 : ~15,8 M nœuds/s, mais seulement 69 298 nœuds en 4 ms : mesure peu fiable.
- `rules.js` : ~0,7 M nœuds/s (perft 5), soit environ 8 fois plus lent.
- Remarque : le comptage en bloc au dernier niveau (on compte les coups sans les jouer) gonfle ce chiffre par rapport à un nœud réellement joué par une recherche alpha-bêta ; la vitesse de makeMove/unmakeMove seule n'est pas mesurée ici.

**Non fait / à faire**
- **Parties de la Bibliothèque PDN** : aucun fichier PDN en local (la Bibliothèque est dans le localStorage du navigateur). Le code de rejeu est écrit (`diff.mjs`, option `--pdn` ou dossier `tests/pdn-local/`) mais n'a pas tourné sur de vraies parties. Pour le faire : « Sauvegarder la bibliothèque » depuis l'appli, déposer le `.pdn` dans `tests/pdn-local/` (ignoré par git), `node tests/diff.mjs`. Le rejeu signale aussi tout coup que `rules.js` jugerait illégal.
- Vrai Web Worker non exercé dans un navigateur.
- Le moteur ne gère ni répétition, ni règle des 25 coups de dames, ni détection de fin de partie : hors périmètre de l'étage 1.
- Commits : en attente de ta validation. Suggestion : (1) correctif `rules.js` seul, (2) `js/ai/` + `tests/` + `.gitignore`, (3) `CLAUDE.md` + `docs/`.
- Vérification du chemin de rejeu PDN sur un fichier SYNTHÉTIQUE (20 parties aléatoires, noms fictifs « Test A/B », généré hors dépôt) : parser + rejeu de la notation FMJD (`27x9`) + comparaison, 1 834 demi-coups, 1 854 positions, aucune divergence, aucun coup rejeté. Cela valide le code de rejeu, pas la Bibliothèque réelle de Mickaël.

---

# Étage 2a — recherche + évaluation (V0)

Début : 2026-10-18 (suite de l'étage 1, commits poussés jusqu'à `c797a94`). Aucune modification de l'interface. Rien n'est commité sans validation de Mickaël.

## 2a.1 Plan (en attente du feu vert)

1. **Fichiers** : `js/ai/eval.js`, `js/ai/search.js`, ajout du message `analyse`/`stop` dans `js/ai/worker.js` ; tests Node dans `tests/` (symétrie, cohérence alpha-bêta/négamax, tactique, mat, force, perf, déterminisme). `rules.js` et `fastboard.js` ne sont pas modifiés (hash et tri sont faits côté `search.js`).
2. **Évaluation** (`eval.js`) : centipions, pion = 100, dame = 300 ; avancement des pions (bonus par rangée), centre, pions sur la dernière rangée de défense, tempo. Poids dans un seul objet `EVAL_WEIGHTS` commenté, remplaçable par l'étage 3. Calcul du point de vue des Blancs (`evalWhite`), indépendant du trait, d'où la symétrie exacte `eval(p) = -eval(miroir(p))` (miroir = rotation 180° + couleurs échangées).
3. **Point à trancher** : « avancement » et « tempo » (somme des avancements) mesurent la même grandeur. Je les garde comme deux termes aux poids distincts (avancement non linéaire, plus fort près de la promotion ; tempo linéaire), pour que l'étage 3 puisse les régler séparément. Dis-moi si tu préfères en fusionner un.
4. **Recherche** (`search.js`) : négamax alpha-bêta, approfondissement itératif, limites `maxDepth` et `maxTimeMs` (l'itération 1 est toujours terminée ; une itération interrompue par le temps est écartée). Tri : meilleur coup de l'itération précédente, puis prises, puis le reste. Camp au trait sans coup = perdu, score `±(MAT - ply)` pour que le mat le plus court gagne.
5. **Quiescence** : aux feuilles, tant que le camp au trait a une prise (obligatoire, donc tous ses coups sont des prises), on prolonge ; garde-fou de profondeur supplémentaire (16 demi-coups), au-delà évaluation statique.
6. **Table de transposition** : hash de Zobrist maintenu à la main dans `search.js` (retrait/ajout de pièces lu avant `makeMove`), vérifié contre un recalcul complet. Option `useTT`. Elle ne sera activée par défaut que si les scores à profondeur 3-5 sont strictement identiques avec et sans ; sinon désactivée et je le note.
7. **API** : `analyse(position, { maxDepth, maxTimeMs, onProgress })` → `{ score, mate, bestMove, pv, depth, nodes, nps }`. `mate` = `null` ou nombre de coups relatif (>0 : le camp du point de vue Blancs gagne, <0 : perd) ; `score` en centipions du point de vue des Blancs. `bestMove` et `pv` au format de `rules.js` (comme `generateUiMoves`).
8. **Worker** : message `analyse` (progression `{type:'progress', …}` après chaque profondeur terminée, résultat final ensuite), message `stop`. **Limite technique** : une recherche synchrone ne peut pas lire la file de messages ; j'insère donc une pause (`await`) entre deux profondeurs pour traiter `stop` ; l'arrêt est effectif à la fin de la profondeur en cours ou à `maxTimeMs`. Arrêt immédiat = `worker.terminate()` côté fil principal (étage 2b).
9. **Validation** : miroir sur milliers de positions ; alpha-bêta = négamax pur (profondeur 3-5) ; ~20 positions tactiques (construites à la main avec une solution démontrable, recoupées par un solveur indépendant écrit sur `rules.js`) ; mats en 1-3 coups vérifiés par ce même solveur de gain forcé ; 100 parties contre un joueur aléatoire ; profondeur N+1 contre N (ouvertures aléatoires, couleurs alternées) ; nœuds/s et profondeur atteinte en 1 s ; déterminisme (mêmes entrées avec `maxDepth` seul = mêmes sorties ; avec une limite de temps, la profondeur atteinte dépend de la machine, c'est inévitable).
10. **Hors périmètre, à noter** : pas de détection de répétition ni de règle des 25 coups de dames (le moteur peut tourner en rond dans les finales de dames : nulle par limite de demi-coups dans les matchs), pas d'apprentissage, pas d'UI. Fin de session : `CLAUDE.md` mis à jour et limites de l'évaluation expliquées simplement. Aucun commit sans ton accord.

## 2a.2 Journal

- Plan 2a validé par Mickaël. Décisions : (point 3) garder les deux termes avancement ET tempo avec des poids distincts ; (point 6) table de transposition activée par défaut seulement si les scores sont strictement identiques avec et sans, sinon désactivée et notée. Rien n'est commité avant validation.
- Écrit `js/ai/eval.js` (poids dans `EVAL_WEIGHTS`, `createEvaluator(weights)` pour l'étage 3, `evalWhite`, `mirrorBoard`) et `js/ai/search.js` (négamax alpha-bêta, approfondissement itératif, quiescence 16 demi-coups max, TT Zobrist, `analyseSync` / `analyse` async, `searchFixedDepth` pour les tests). `rules.js` et `fastboard.js` non modifiés.
- **Test de symétrie** (`tests/eval-symmetry.mjs`) : OK. 100 000 positions aléatoires, `eval(p) = -eval(miroir)` exact, indépendance du camp au trait, position initiale = 0, symétrie aussi avec un autre jeu de poids, et 1 500 positions où le score de recherche (profondeur 3) de la position est l'opposé de celui du miroir (valide aussi générateur + quiescence).
- **Test de cohérence** (`tests/search-consistency.mjs`) : OK, zéro écart. Alpha-bêta = négamax pur aux profondeurs 3 (400 positions), 4 (200), 5 (60). Réduction de nœuds : profondeur 5, 14,2 M (négamax) → 237 k (alpha-bêta) → 195 k (avec table). Approfondissement itératif avec/sans table : 300 positions, mêmes scores à chaque profondeur (même meilleur coup dans 298/300 cas ; les 2 autres sont des coups à score égal). Zobrist incrémental = recalcul complet (8 926 coups). PV toujours légale (1 630 coups rejoués). Déterminisme confirmé (score, coup, PV, profondeur, nœuds identiques sur deux exécutions, même avec une analyse intercalée).
- **Décision TT** : scores strictement identiques avec et sans table sur l'ensemble des tests → **table ACTIVÉE par défaut** (`TT_DEFAULT = true`). Garantie obtenue en ne réutilisant une entrée que si elle a été calculée exactement à la profondeur demandée (une entrée plus profonde donnerait un score différent). Conséquence connue : la PV peut être plus courte quand un sous-arbre vient de la table.
- **Solveur indépendant** `tests/solver.mjs` (rules.js seul, pas de fastboard ni de search) : minimax matériel avec prolongation des prises forcées, `winIn` / `lostIn` / `shortestWin` / `shortestLoss` par énumération exhaustive. Il fabrique (via `tests/mine-positions.mjs`, graine fixe) les jeux `tests/data/tactics.mjs` et `tests/data/mates.mjs`.
- **Tactique** (`tests/tactics.mjs`) : **20/20 résolues**. Méthode de validation : positions minées parmi 673 candidates (parties aléatoires et placements libres) ; critère : à profondeur 5 puis 7 (matériel pur), UN coup est meilleur que tous les autres d'au moins 1 pion et gagne au moins 1 pion de matériel ; chaque exécution du test revérifie en plus par un minimax PUR sans élagage (autre code) que le coup annoncé est l'unique meilleur à profondeur 5 (20/20 confirmées). Répartition : 7 prises en cascade (≥ 3 pièces), 7 sacrifices (coup calme suivi d'une prise obligatoire de l'adversaire), 6 coups de dame. Le moteur trouve le bon coup dès la profondeur 1 dans 15 cas, 2 dans 3 cas, 3 dans 2 cas, 4 dans 1 cas. **Limite honnête** : ce sont des tactiques « de matériel » trouvées par machine, pas des problèmes classiques de la littérature ; la quiescence en résout beaucoup dès la profondeur 1 ; l'indépendance vient du solveur, pas d'un avis humain.
- **Mat** (`tests/mate.mjs`) : OK. 12 victoires forcées (4 en 1, 4 en 2, 4 en 3) et 6 défaites forcées (2 en 1, 2 en 2, 2 en 3), vérité fournie par l'énumération exhaustive de `solver.mjs` : `mate.winner` et `mate.in` exacts, signe du score correct, coup proposé = coup gagnant. 40 positions sans victoire forcée en 3 : aucun faux « mat en ≤ 3 ». Cas limite (camp au trait sans coup) : `{winner:'b', in:0}`, pas de coup.
- **Force** (`tests/match.mjs`) : OK. Profondeur 4 contre joueur aléatoire : 100 parties, **100 victoires**, 0 nulle, 0 défaite. Profondeur N+1 contre N (50 ouvertures aléatoires de 8 demi-coups × 2 couleurs) : 3 contre 2 → 63 V / 15 N / 22 D (70,5 %) ; 4 contre 3 → 68 / 18 / 14 (77,0 %) ; 5 contre 4 → 61 / 29 / 10 (75,5 %). La plus profonde domine à chaque fois. Le format `bestMove` (format `rules.js`) a été relu pour jouer ces parties : retrouvé dans les coups de fastboard à chaque coup, sans exception.
- **Performance** (`tests/search-perf.mjs`, limite par défaut de 1 s, meilleur de 3, avec table / sans table) : position initiale profondeur 11 / 9 (~0,63 M nœuds/s) ; milieux de partie profondeurs 12 / 11, 9 / 8, 10 / 9 (0,69 à 0,75 M nœuds/s) ; finale de pions 13 / 10 (0,93 M/s) ; finale à dames 11 / 9 (0,97 M/s). La table gagne 1 à 3 profondeurs. Écart avec le moteur de règles seul (~5 M nœuds/s) : évaluation, hash, tri des coups (allocations) et génération complète à chaque nœud ; pas optimisé en V0.
- **Worker** : messages `analyse` (progression `{type:'progress'}` après chaque profondeur, puis résultat) et `stop`. `tests/worker-analyse.mjs` : OK. Appel direct (progression, résultat identique à `analyseSync`, arrêt, remplacement d'une analyse par une autre, erreurs) ET dans un vrai fil `worker_threads` avec faux environnement de worker (`tests/worker-thread-shim.mjs`) : clonage structuré des messages, arrêt effectif (profondeur < max, délai d'arrêt 2 ms au moment testé). **Toujours pas testé dans un navigateur** (consigne), mais la colle `self.onmessage` l'est via la coquille Node. **Limite conservée** : l'arrêt ne coupe pas une profondeur en cours ; `maxTimeMs` le fait.
- Non-régression étage 1 après les ajouts : `diff.mjs` (48 105 positions), `perft.mjs` (profondeur 7), `perft-positions.mjs` : aucune divergence. `rules.js` et `fastboard.js` n'ont pas été touchés dans cet étage.
- `CLAUDE.md` mis à jour (structure, commandes de test, conventions de l'API, TT, worker, limites).

## 2a.3 Feuille de session (récapitulatif)

**Livré (rien n'est commité)**
- `js/ai/eval.js`, `js/ai/search.js`, `js/ai/worker.js` (modifié : `analyse`, `stop`).
- `tests/` : `eval-symmetry`, `search-consistency`, `tactics`, `mate`, `match`, `search-perf`, `worker-analyse` (+ `worker-thread-shim`), `solver`, `mine-positions`, `helpers`, `data/tactics.mjs`, `data/mates.mjs`.
- `CLAUDE.md`, `docs/SESSION_DERNIERE.md`.

**Décisions** : avancement et tempo gardés séparés ; TT activée (scores identiques) avec réutilisation à profondeur exacte uniquement ; `stop` pris en compte entre deux profondeurs ; mat exposé en `{winner, in}` plutôt qu'en nombre signé (le cas « déjà perdu » vaut `in: 0`).

**Divergences / bugs** : aucun bug de `rules.js` ni de `fastboard.js` trouvé dans cet étage. Aucune divergence entre alpha-bêta, négamax pur et alpha-bêta + TT.

**Limites connues de l'évaluation V0 (en termes simples)**
- Elle compte les pièces et note leur place (avancée, centre, dernière rangée), rien de plus : elle ne voit pas les formations (pions solidaires, triangles, chaînes), les pions isolés, en retard ou bloqués, ni les « trous » dans le camp.
- Elle ne mesure pas la liberté de manœuvre : un camp étouffé mais à égalité de pièces paraît équilibré tant que la recherche ne voit pas le blocage arriver.
- Une dame vaut toujours 3 pions, quelle que soit la position (en réalité elle vaut plus sur un damier ouvert, moins sur un damier encombré).
- Elle ne sait pas reconnaître les finales nulles ou gagnées par la théorie (par exemple une dame contre plusieurs) : sans répétition ni règle des 25 coups, elle peut croire gagner une finale qui est nulle.
- Les poids (tempo, centre, avancement) sont estimés à la main, jamais calibrés sur des parties réelles : un score de +100 ne veut pas dire « un pion d'avance, 100 % de chances » pour un joueur humain.
- Les menaces calmes (un coup préparé qui ne se déclenche que dans plusieurs coups) ne sont vues que si elles tiennent dans la profondeur de recherche (9 à 13 demi-coups en 1 s) ; seules les prises forcées sont suivies au-delà.
- Pas de livre d'ouvertures : toutes les positions de départ sont jugées au même niveau dès le premier coup.

---

# Étage 2b — barre d'évaluation, score et meilleur coup dans la liseuse (V0)

Début : 2026-10-18 (suite de l'étage 2a, poussé jusqu'à `b17963a`). Aucun changement de moteur. Rien n'est commité sans validation de Mickaël.

## 2b.1 Plan (en attente du feu vert)

1. **Logique pure, testable sous Node** : `js/ai/analysis-format.js` (sans DOM) : score → proportion de la barre (sigmoïde `1/(1+e^(-cp/250))`, antisymétrique : score opposé = barre opposée, mat = 0 ou 1 exactement), formatage du score en pions (`+0,8`, `−1,3`, `0,0`, virgule française, signe moins `−` comme le compteur de temps), formatage du mat (`Mat en 3 — les Blancs gagnent`), notation du coup et ligne principale compacte (même format que l'appli : `32-28`, `27x9`), conversion d'un coup du moteur en liste de cases pour la flèche.
2. **Cycle de vie, testable sous Node avec un faux Worker** : `js/ai/analysis-controller.js` : un seul Worker module, créé à l'activation et détruit à la désactivation ; debounce de 150 ms ; chaque requête porte un identifiant, toute réponse périmée est ignorée ; une même position (empreinte plateau + trait) n'est pas relancée (cliquer pour sélectionner une pièce ne relance rien) ; limites 1,5 s et profondeur 24. La progression de chaque profondeur met la barre à jour en direct.
3. **Interrupteur** : bouton « Analyse » (`#btn-analysis`, classe `.ctrl-btn`, état `.active` déjà stylé) à la fin de la barre de contrôles, après la flèche ; raccourci **A** (libre aujourd'hui : ← → Espace F ? Échap Ctrl+S/V sont pris) ajouté à l'aide « ? » ; désactivé à chaque lancement, rien dans le `localStorage`.
4. **Barre verticale** : `#eval-bar` positionnée en absolu dans la gouttière gauche du damier (entre le rail joueurs et le damier), hors du flux : elle ne change pas la mesure du damier (piège de `BoardRenderer.resize()` décrit dans CLAUDE.md). Blancs en bas, retournée par la classe `.flipped` basculée dans `toggleFlip()` (même mécanisme que `.players-rail`). Visible seulement si l'analyse est active (`[hidden]` avec sa règle jumelle).
5. **Texte** : une ligne `#analysis-strip` entre la ligne de statut et les contrôles, visible seulement si actif : score (ou « Mat en N »), « indicatif · prof. N », puis « Meilleur : 32-28 » et la ligne principale (5 coups au plus). Le damier peut rétrécir de ~40 px en hauteur sur écran bas, il se remesure tout seul (ResizeObserver).
6. **Flèche du meilleur coup** : `renderer.bestMove` + `setBestMove(squares)` dans `js/render/board.js` (une petite méthode, dessinée après la flèche du dernier coup avec `drawMovePath` et une nouvelle variable CSS `--best-arrow-color`, définie en thème sombre ET clair, lue dans `_readThemeColors()`). La flèche du dernier coup reste inchangée.
7. **Branchement dans `main.js`** (≈ 40 lignes, un seul bloc) : `analysisController.request(game.board, game.sideToMove)` appelé à la fin de `renderBoardState()` ; lecture seule de `game` : aucun appel à `refreshUI`, `scheduleSave`, `activeEntryModified`, ni à la Bibliothèque. Partie finie : le moteur répond « plus de coup » sans chercher (`mate.in = 0`), on affiche le résultat.
8. **Point à valider — annulation** : un Worker occupé ne lit pas ses messages avant la fin de sa profondeur en cours (jusqu'à 1,5 s). Pour que la navigation rapide reste fluide, si une analyse est EN COURS quand la position change, je fais `terminate()` puis je recrée le Worker (toujours un seul à la fois, détruit à la désactivation). Sans cela la nouvelle position peut attendre jusqu'à 1,5 s. Dis-moi si tu préfères strictement « jamais recréé ».
9. **Tests Node** : `tests/analysis-format.mjs` (cas limites, symétrie, mat, formats) et `tests/analysis-controller.mjs` (faux Worker : debounce, remplacement, réponses périmées ignorées, destruction, position identique ignorée). Relance de `diff`, `perft` et `search-consistency`. Un seul passage de fumée navigateur : page chargée, interrupteur activé puis coupé, console sans erreur.
10. **Fichiers touchés** : nouveaux `js/ai/analysis-format.js`, `js/ai/analysis-controller.js`, 2 tests ; modifiés `index.html`, `css/style.css`, `js/render/board.js`, `js/main.js`, `CLAUDE.md`, ce journal. `rules.js`, `fastboard.js`, `eval.js`, `search.js` et `worker.js` ne changent pas. Aucune dépendance.

## 2b.2 Journal

- Plan 2b validé par Mickaël. Décisions : (point 8) `terminate()` puis recréation du Worker si une analyse est EN COURS au changement de position (jamais plus d'un Worker à la fois, détruit à la désactivation) ; (précision 1) la touche A est ignorée quand le focus est dans un champ de saisie (INPUT, TEXTAREA, SELECT, contenteditable : nom, Elo, score, titre, commentaire, recherche Bibliothèque…) OU quand une modale est ouverte ; (précision 2) la flèche du meilleur coup et la ligne « Meilleur » n'apparaissent qu'à partir de la profondeur 4 (constante `MIN_DEPTH_FOR_MOVE`) ; la barre et le score se mettent à jour dès la profondeur 1. Rien n'est commité avant validation.
- Écrit `js/ai/analysis-format.js` (fonctions pures : `barFraction` sigmoïde d'échelle 250 cp avec antisymétrie EXACTE, `formatScore` « +0,8 / −1,3 / 0,0 », `formatMate`, `formatMeta`, `moveSquares`, `formatLine`, `shouldShowMove` avec seuil `MIN_DEPTH_FOR_MOVE = 4`, `positionKey`) et `js/ai/analysis-controller.js` (cycle de vie, Worker injecté). **Tests Node : OK.** `tests/analysis-format.mjs` : 50 vérifications (cas limites, symétrie exacte de la barre sur 858 valeurs et du texte du score sur 1 667 valeurs, mat, partie terminée, seuil de profondeur, empreinte de position, intégration avec le vrai moteur). `tests/analysis-controller.mjs` : 27 vérifications avec faux Worker et minuteries simulées (debounce 150 ms, une seule requête en rafale, `terminate()` + nouveau Worker si analyse en cours, réponses périmées ignorées, Worker réutilisé si l'analyse est finie, position identique ignorée, destruction à la désactivation, erreurs).
- **Interface** : `index.html` (bouton `#btn-analysis` « Analyse » après la flèche dans la barre de contrôles, `#eval-bar` dans `.board-stage`, `#analysis-strip` sous la ligne de statut, ligne « A » dans l'aide « ? »), `css/style.css` (variables `--best-arrow-color`, `--eval-white`, `--eval-dark` en thème sombre ET clair ; styles `.eval-bar`, `.analysis-strip`, `.ctrl-btn-text`, avec la règle jumelle `[hidden]`), `js/render/board.js` (`bestMove`, `setBestMove()`, `_drawBestMoveArrow()`, 20 lignes), `js/main.js` (un bloc après la table `el`, appel de `requestAnalysis()` en fin de `renderBoardState()`, classe `.flipped` de la barre dans `toggleFlip()`, touche A). Raccourci A : ignoré avec Ctrl/Cmd/Alt, en répétition de touche, dans un champ de saisie (garde existant) et quand une modale est ouverte (`isModalOpen()`).
- **Isolation vérifiée à la relecture** : le bloc d'analyse ne contient aucun appel à `refreshUI`, `scheduleSave`, `activeEntryModified`, ni aucune écriture dans `game`, `headers`, `library` ou `localStorage`. Aucune clé de stockage n'est créée (vérifié dans le navigateur : `Object.keys(localStorage)` sans clé « analy… »).
- **Passage de fumée navigateur (un seul, comme demandé)**, sur `http://127.0.0.1:8934` (origine distincte de `localhost`, pour ne pas toucher la vraie Bibliothèque) : page chargée ; bouton et barre cachés au départ ; clic sur « Analyse » → barre et ligne visibles, score +0,1, « indicatif · prof. 11 », « Meilleur : 34-30 · 19-24 30x19 13x24 31-27 … », flèche verte sur le damier, barre à 50,5 % ; touche A → tout disparaît, bouton désactivé ; aucune erreur console (le suivi de la console ne démarre qu'au premier appel de l'outil : les erreurs éventuelles au tout premier chargement ne sont pas couvertes, mais la page et l'analyse ont fonctionné). Capture : la barre est bien dans la gouttière à gauche du damier, le bouton « Analyse » tient dans la barre de contrôles. Serveur local arrêté ensuite. **Non vérifié** (à regarder par Mickaël) : thème clair, retournement du damier (touche F), mat affiché, navigation rapide avec les flèches, écrans étroits.
- **Non-régression** (relancée une fois) : `diff.mjs` (48 105 positions), `perft.mjs` (profondeur 7), `search-consistency.mjs` (tous les contrôles), `worker-analyse.mjs`, `analysis-format.mjs`, `analysis-controller.mjs` : tout vert. `rules.js`, `fastboard.js`, `eval.js`, `search.js`, `worker.js` non modifiés dans cet étage.
- Incident sans conséquence : ma première commande d'arrêt du serveur (`taskkill` par nom d'image) n'a rien arrêté ; j'ai ensuite arrêté uniquement le processus qui écoutait sur le port 8934.
- `CLAUDE.md` mis à jour (structure, tests, conventions de l'analyse, validation).

## 2b.3 Comment tester en 5 minutes
1. `python -m http.server 8934` dans le dossier du projet, puis ouvrir `http://127.0.0.1:8934/index.html` (adresse distincte de `localhost` : elle ne touche pas ta vraie Bibliothèque), puis **Ctrl+Maj+R** (cache des modules).
2. Charger ou jouer une partie. Appuyer sur **A** (ou cliquer « Analyse ») : la barre apparaît à gauche du damier, le score et « indicatif · prof. N » sous le damier ; dès la profondeur 4 : la ligne « Meilleur : … » et une flèche verte.
3. Naviguer avec ← → (ou la molette sur le damier) : le score se grise puis se met à jour ; la flèche bleue du dernier coup reste.
4. Appuyer sur **F** : la barre se retourne avec le damier (le blanc reste du côté des Blancs). Basculer le thème clair/sombre : barre et flèche restent lisibles.
5. Cliquer dans un champ (nom, commentaire, recherche Bibliothèque), taper « a » : rien ne se déclenche. Ouvrir l'aide « ? » : la touche A y est listée, et n'agit pas tant qu'elle est ouverte.
6. Pour un mat : poser une position gagnante (ex. listener `damika:setBoard`, cf. CLAUDE.md) ou jouer une finale ; attendu « Mat en N — les Blancs gagnent » et barre pleine. Partie terminée : « Partie terminée — … ».
7. Réappuyer sur **A** : tout disparaît, plus rien ne tourne. Recharger la page (F5) : l'analyse est de nouveau coupée.

---

# 2b-bis — jauge d'évaluation « waouh » + gros score (retouche visuelle)

Même lot 2b, non commité. Affichage uniquement : ni moteur, ni worker, ni score, ni `barFraction` (échelle 250 conservée) ne changent.

## 2b-bis.1 Plan (en attente du feu vert)

Mesures faites dans le navigateur (écran 1988×1103) : les cartes joueurs occupent TOUTE la largeur du rail (185→453), l'écart rail→damier est de 26 px, le cadre du damier est à 18 px du bord du canvas (numéros de rangée dans cette marge).

1. **Jauge — largeur** : 14 → **22 px** (le maximum de la gouttière de 26 px, 4 px de respiration). Plus large exigerait de toucher `BoardRenderer.resize()` ou aux deux formules de `max-width` du layout (piège décrit dans CLAUDE.md) : je ne le fais pas. Le gain de visibilité vient surtout du contraste, du halo et du gros score. Hauteur = hauteur du cadre du damier (inchangé), toujours `position:absolute`, hors du flux.
2. **Jauge — rendu** : bords arrondis (11 px), partie blanche en dégradé ivoire, partie sombre en dégradé graphite (variables `--eval-white-1/2`, `--eval-dark-1/2` en thème sombre ET clair, bordure fine), **ligne de séparation dorée de 2 px avec halo** qui suit le niveau, **repère central net** (0) plus large, **repères discrets à ±1, ±2, ±3 pions** (7 petits traits dont la position vient de `barFraction`, donc exacts quelle que soit l'échelle). Retournement avec le damier (touche F) : les repères suivent via `.flipped`.
3. **Jauge — animation** : le niveau glisse (transition 0,6 s, courbe douce) ; sur un gros changement (≥ 12 points de pourcentage de la barre, fonction pure `isBigSwing`) la ligne dorée émet une impulsion lumineuse de 0,7 s. **État « Mat »** (`.mate`) : jauge pleine d'un côté, liseré et halo dorés renforcés, léger scintillement. `prefers-reduced-motion` : toutes les animations coupées.
4. **Score — emplacement** : la ligne `#analysis-strip` sous le damier est refaite autour d'une **plaque de score** à gauche (remplace l'affichage petit actuel, pas de doublon) ; à droite, en petit : « indicatif · prof. N » puis « Meilleur : … » et la ligne principale. Contrepartie assumée : la ligne passe d'environ 30 à 64 px de haut, donc le damier perd ~34 px de hauteur quand l'analyse est active (il se remesure seul, comme avec la ligne actuelle ; aucun changement de largeur).
5. **Score — typographie et couleur** : police du wordmark (Inter 800), ~46 px, chiffres tabulaires (pas de saut de largeur). La plaque exprime l'avantage : **Blancs devant** = plaque ivoire, texte sombre ; **Noirs devant** = plaque graphite, texte ivoire ; **équilibre** (|score| < 0,3 pion, fonction pure `scoreSide`) = plaque bronze avec le dégradé du wordmark. **Mat** = plaque dorée avec halo, « Mat en N » dans la même police, plus petit. Format inchangé (`+0,8`, `−1,3`, `0,0`).
6. **Pendant le calcul** : l'ancienne valeur reste affichée, atténuée en douceur (opacité, transition 0,25 s) ; quand le nouveau résultat arrive, le nombre glisse vers sa nouvelle valeur (interpolation de 0,3 s, pas de saut) ; jamais de clignotement. Coupée si `prefers-reduced-motion`.
7. **Toute partie, toute source** : l'analyse suit la position affichée (appel en fin de `renderBoardState()`, déjà emprunté par Bibliothèque, nouvelle partie, import, collage, navigation) ; rien à ajouter, je le vérifierai à la relecture du code.
8. **DOM** : `#eval-bar` gagne `.eval-bar-line` (séparateur) et `.eval-bar-ticks` (7 traits) ; `#analysis-strip` devient `.analysis-plate#analysis-plate[data-adv]` + `.analysis-side` (méta, « Meilleur »). Les identifiants lus par `main.js` sont conservés.
9. **Fichiers** : `index.html`, `css/style.css` (nouvelles variables par thème, jauge, plaque, animations, règles `[hidden]` jumelles), `js/main.js` (bloc analyse seulement : classes `data-adv`/`.mate`/`.stale`, impulsion, interpolation, positions des repères), `js/ai/analysis-format.js` (+ `scoreSide`, `isBigSwing`, `tickFractions`, purs) et `tests/analysis-format.mjs` (complété). Isolation inchangée : aucune écriture dans `game`, `headers`, `library`, `localStorage`.
10. **Validation** : tests Node (existants + nouvelles fonctions pures), un passage de fumée (page, A activé puis coupé, console), deux captures (sombre, clair) enregistrées pour que tu les relises ; changement de thème de TEST fait puis remis en sombre. Rendu validé par toi.

## 2b-bis.2 Journal

- Plan 2b-bis validé par Mickaël. Précision : les deux captures (sombre, clair) sont enregistrées dans le dossier « Claude outputs » du projet et NE doivent PAS être commitées (vérifier que `git status` ne les suit pas ; le dossier est déjà non suivi). Rien n'est commité.
- **Logique pure ajoutée** (`js/ai/analysis-format.js`) : `scoreSide` (camp qui a l'avantage ; « équilibre » = texte 0,0 à ±0,2, soit |score| < 25 cp), `isBigSwing` (écart de barre ≥ 12 points), `tickFractions` (repères de la jauge, calculés avec `barFraction`). `tests/analysis-format.mjs` complété : **72 vérifications, toutes vertes** (dont : « équilibre » correspond exactement à un texte 0,0 à ±0,2 sur 601 scores, symétrie du camp, repères symétriques et croissants). `barFraction`, le moteur, le worker et la recherche : inchangés.
- **DOM / CSS / JS** : `index.html` (jauge : `.eval-bar-ticks` avec 7 repères + `.eval-bar-line` ; ligne d'analyse : `#analysis-plate[data-adv]` + `.analysis-side`), `css/style.css` (variables `--eval-white-1/2`, `--eval-dark-1/2`, `--eval-border`, `--eval-glow`, `--eval-tick`, `--plate-*` en thème sombre ET clair ; jauge 22 px à dégradés, ligne dorée à halo, repère central, impulsion, mat scintillant ; plaque de score 46 px Inter 800 chiffres tabulaires ; `prefers-reduced-motion`), `js/main.js` (bloc analyse : `--fill`, `.mate`, `.pulse`, `data-adv`, interpolation du nombre sur 0,3 s, repères posés une fois). Aucune écriture dans `game`, `headers`, `library`, `localStorage`.
- **Passage de fumée (un seul) sur `http://127.0.0.1:8934`** (rechargement forcé Ctrl+Maj+R) : jauge et ligne cachées au départ ; 7 repères présents (positions 0,231 / 0,310 / 0,401 / 0,500 / 0,599 / 0,690 / 0,769 = `barFraction` de −3 à +3 pions) ; parties de la Bibliothèque de test, dernière position : A activé → plaque « −1,5 » (`data-adv="black"`), « indicatif · prof. 14 », « Meilleur : 49-44 », jauge à 35,6 % de blanc, 22 px de large, hauteur 784 px ; bascule du thème clair → sombre → clair (le thème de l'origine de TEST a été remis comme trouvé : clair) ; A coupé : jauge et ligne cachées, aucune clé `analy…`/`eval…` dans le `localStorage` ; console sans erreur (suivi démarré avant le rechargement).
- **Captures** enregistrées (NON commitées ; `git status` : `Claude outputs/` reste « ?? » non suivi, `git ls-files "Claude outputs"` = 0 fichier) : `Claude outputs/jauge-analyse-theme-clair.jpg` et `Claude outputs/jauge-analyse-theme-sombre.jpg`. Attention : un `git add -A` les ajouterait ; ajouter les fichiers par chemin.
- **Constats à la relecture des captures** : en thème sombre, la plaque graphite (Noirs devant) se détache surtout par son liseré doré et son texte ivoire (le fond de la page est lui-même très sombre) ; en thème clair, elle ressort fortement. Le damier perd bien ~34 px de hauteur quand l'analyse est active (jauge et plaque n'ont pas changé sa largeur). Non vérifiés : mat affiché, retournement F avec les repères, navigation très rapide, impulsion sur gros changement (visible seulement en mouvement).
- Tests Node relancés : `analysis-format` (72), `analysis-controller` (29), `worker-analyse` : tout vert. `CLAUDE.md` mis à jour (jauge, plaque, constantes, règle « ne pas élargir au-delà de la gouttière »).

## 2b-bis.3 Comment tester en 3 minutes
1. Le serveur local est déjà lancé (`python -m http.server 8934`) : ouvrir `http://127.0.0.1:8934/index.html`, **Ctrl+Maj+R**.
2. Ouvrir une partie de la Bibliothèque, aller à une position déséquilibrée (⏭ ou ← →), appuyer sur **A** : la jauge (22 px, ligne dorée) et la grosse plaque apparaissent ; plaque ivoire = Blancs devant, graphite = Noirs devant, bronze = équilibre.
3. Avancer coup par coup avec → : le niveau glisse, le nombre glisse aussi ; un gros changement fait pulser le halo doré.
4. **F** : jauge et repères se retournent avec le damier. Basculer clair/sombre (☀/🌙) : tout reste lisible.
5. Finale gagnante (ou `damika:setBoard`) : « Mat en N — … », jauge pleine d'un côté, liseré doré qui scintille.
6. **A** : tout disparaît. F5 : l'analyse est de nouveau coupée.

---

# 2b-ter — jauge verticale plus parlante (retouche visuelle n°2)

Même lot 2b, non commité. Verdict de Mickaël sur les captures (22 px) : correct mais pas assez visible. Jauge VERTICALE conservée (Noirs en haut, Blancs en bas, comme les cartes joueurs ; F inverse les deux). Aucun changement de moteur, de worker, de `search.js` ni de `eval.js`.

## 2b-ter.1 Plan (en attente du feu vert)

1. **Élargir sans toucher au layout** (point risqué). Constat : `BoardRenderer.resize()` mesure la largeur disponible depuis `#app` moins la largeur RÉELLE du rail (268), du panneau (405) et 2 × l'écart (26) ; les deux formules de `max-width` figent 268 et 52. Si je change l'écart ou la largeur du rail, tout se désynchronise. **Donc je ne les change pas** : le rail reste à 268 px, l'écart à 26 px. Quand l'analyse est active, le contenu du rail reçoit `padding-right: 18px` (classe `analysis-on` sur `.layout`) : les cartes joueurs passent de 268 à 250 px, ce qui libère 18 px à gauche du damier. La jauge (38 px + 4 px de respiration) occupe l'écart de 26 px plus ces 18 px (reste 2 px), en `position:absolute`, hors du flux. Largeur du rail, du damier et formules : strictement inchangées. Coût : cartes joueurs 7 % plus étroites pendant l'analyse (les noms peuvent passer à la ligne ; `alignLayout()` observe déjà les cartes).
2. **Vérification obligatoire** à trois tailles de fenêtre (large 1988×1103, moyenne ≈ 1400×900, étroite ≈ 1100×800), analyse active ET coupée, mesurée par `getBoundingClientRect()` : canevas carré, damier centré dans sa colonne, jauge sans chevauchement avec les cartes ni la colonne, aucun défilement horizontal, largeur du damier IDENTIQUE analyse active/coupée quand c'est la largeur qui limite. **Si une taille casse, j'annule l'élargissement (retour à 22 px) et je te le dis, sans bricoler.** Sous 900 px le layout bascule (chantier Mobile) : j'observe, je ne corrige pas.
3. **Courbe plus raide** : `BAR_SCALE_CP` 250 → **100** (une seule constante nommée, commentée). Cibles vérifiées par test : ±0,5 pion ≈ 62 %, ±1 ≈ 73 %, ±2 ≈ 88 %, ±3 ≈ 95 %. Antisymétrie exacte conservée. `tickFractions()` : repères à **±0,5, ±1, ±2** + centre (7 traits), mêmes calculs que la barre.
4. **`isBigSwing`** : seuil 12 → **0,20** de part de barre. Raison : avec l'échelle 100 la barre est 2,5 fois plus pentue au centre ; 0,12 déclencherait l'impulsion pour ~0,5 pion. 0,20 ≈ 0,85 pion près de l'équilibre (0 → +1 ou −0,5 → +0,5 pulsent ; +1 → +2 non). Constante nommée.
5. **Seuils de Mickaël** (une seule constante `ADVANTAGE_TIERS` dans `analysis-format.js`), appliqués à la valeur AFFICHÉE (arrondie au dixième) pour que texte et couleur ne se contredisent jamais : égal ≤ 0,2 ; mini > 0,2 ; petit ≥ 0,5 ; naissant ≥ 0,7 ; avantage ≥ 0,9 ; bel ≥ 1,5 ; gros > 2. Les 7 paliers donnent **5 niveaux de lumière** (`--lit` 1 à 5, 0 = égal) : mini = 1, petit et naissant = 2 (0,5 et 0,7 sont trop proches pour se distinguer à l'œil), avantage = 3, bel = 4, gros = 5. `scoreSide` passe de « < 0,3 » à « ≤ 0,2 ». Aucun texte du type « Petit avantage » affiché.
6. **Lumière** : un élément `.eval-bar-light` (dégradé radial doré ancré sur l'extrémité du camp qui a l'avantage, opacité = niveau) ; à l'équilibre, bande dorée au centre ; plaque de score : halo doré proportionnel au niveau ; mat inchangé. `prefers-reduced-motion` coupe les animations.
7. **Contraste des deux moitiés (sombre ET clair)** : moitié sombre en graphite avec dégradé interne nettement plus lumineux que le fond de page et liseré doré fin ; moitié blanche en ivoire ; trait doré central conservé. Réglé à l'œil sur les captures.
8. **Plaque de score** : conservée, plus présente (46 → 56 px, plus de contraste, halo selon le palier). Contrepartie : la ligne passe d'environ 64 à 80 px de haut (le damier perd ~16 px de plus en hauteur, jamais en largeur).
9. **Fichiers** : `js/ai/analysis-format.js` (échelle, `ADVANTAGE_TIERS`, `advantageTier`, `scoreSide`, `isBigSwing`, `tickFractions`), `tests/analysis-format.mjs` (mis à jour sans affaiblir : mêmes contrôles, nouvelles valeurs, plus tests des paliers et de la cohérence texte/couleur), `index.html` (repères ±0,5/±1/±2, `.eval-bar-light`), `css/style.css` (jauge, plaque, `--lit`, règle `.layout.analysis-on .players-rail`), `js/main.js` (bloc analyse : `data-adv`, `--lit`, classe `analysis-on`). Isolation inchangée.
10. **Validation** : tests Node (`analysis-format`, `analysis-controller`, + `diff`, `perft`, `search-consistency` une fois), les trois tailles de fenêtre mesurées, un passage de fumée, captures sombre ET clair d'une position déséquilibrée et d'une position proche de 0 dans « Claude outputs » (non commitées, `git add` par chemin).

## 2b-ter.2 Journal

- Plan 2b-ter validé par Mickaël, avec la règle : si une des trois tailles de fenêtre casse, j'ANNULE l'élargissement (retour à 22 px) et je le dis, sans bricoler. Rien n'est commité.
- **Logique pure mise à jour** (`js/ai/analysis-format.js`) : `BAR_SCALE_CP = 100` (constante unique, commentée) ; `ADVANTAGE_TIERS` (barème de Mickaël en dixièmes de pion AFFICHÉS : égal ≤ 0,2 · mini ≥ 0,3 · petit ≥ 0,5 · naissant ≥ 0,7 · avantage ≥ 0,9 · bel ≥ 1,5 · gros ≥ 2,1, niveaux de lumière 0, 1, 2, 2, 3, 4, 5) ; `advantageTier()` ; `scoreSide()` en découle (seuil « ≤ 0,2 pion affiché ») ; `BIG_SWING = 0.20` ; `TICK_PAWNS = [-2, -1, -0.5, 0, 0.5, 1, 2]`. **Décision `isBigSwing`** : 0,20 (≈ 0,85 pion près de l'équilibre) : 0 → +1 et −0,5 → +0,5 déclenchent, 0 → +0,5, +1 → +2 et +2 → +3 non.
- **Tests** (`tests/analysis-format.mjs`, 89 vérifications, toutes vertes ; mêmes contrôles qu'avant avec les nouvelles valeurs, rien d'affaibli, plus des ajouts) : cibles de l'échelle (±0,5 ≈ 62 %, ±1 ≈ 73 %, ±2 ≈ 88 %, ±3 ≈ 95 %, et leurs symétriques), antisymétrie exacte conservée, paliers contrôlés sur 801 valeurs contre un barème réécrit en toutes lettres dans le test (indépendant de `ADVANTAGE_TIERS`), valeurs frontières, symétrie, lumière jamais décroissante, cohérence texte/couleur, repères ±0,5/±1/±2. Deux de mes propres tests ont dû être corrigés (une vérification de l'ancienne échelle 250 devenue obsolète, une comparaison de flottants pile à 0,70) : le code n'a pas changé pour cela.
- Correction du compte ci-dessus : 91 vérifications après la mise à jour des paliers/échelle ; 94 avec la zone d'équilibre (`equalZoneFractions`, bande dorée centrale : symétrique exacte, bornes = `barFraction(∓24 cp)`, 24 cp = dernier score affiché 0,2).
- **Interface** : `index.html` (repères ±0,5/±1/±2 + centre, `.eval-bar-zone`, `.eval-bar-light`), `css/style.css` (jauge 38 px ; demi-jauges distinctes dans les deux thèmes : graphite `--eval-dark-1/2` bien plus clair que le fond + liseré doré 1,5 px, ivoire `--eval-white-1/2` ; zone dorée ; lumière radiale ancrée sur l'extrémité du camp qui a l'avantage, opacité = niveau × 0,17 ; plaque 56 px avec halo `--lit` ; règle `.layout.analysis-on .players-rail { padding-right: 18px }` ; `prefers-reduced-motion` étendu), `js/main.js` (`advantageTier` : `data-adv` et `--lit` sur jauge et plaque, zone posée une fois, classe `analysis-on` sur `.layout` ajoutée/retirée avec l'analyse). Aucune modification de `BoardRenderer.resize()`, des formules de `max-width`, de la largeur du rail (268) ni de l'écart (26).
- **Vérification aux trois tailles de fenêtre** (analyse coupée → active → coupée de nouveau ; mesures par `getBoundingClientRect()` ; la fenêtre elle-même n'a pas pu être redimensionnée par l'outil, donc taille large = fenêtre réelle 1988×1103, tailles moyenne et étroite = iframes de même origine aux dimensions voulues, où la page se comporte comme dans une fenêtre de cette taille) :
  - **Large 1988×1103** : damier carré et centré, aucun défilement horizontal. Rail 268 px (inchangé), cartes joueurs 268 → 250 px à l'activation, jauge 38 × 770 px à gauche, **sans chevauchement avec les cartes ni avec le damier**. Damier 893 px (coupée) → 806 px (active, hauteur limitante : la plaque et la ligne prennent de la place) → **893 px de nouveau après coupure**.
  - **Moyenne 1440×900** : même constat ; damier 667 → 603 px (active) → 667 px (coupée), jauge 38 × 567 px, dégagée. Écart damier → panneau inchangé (26 px).
  - **Étroite 1100×800** : damier 327 px, **identique analyse active ou coupée** (la largeur limite : aucun effet de l'analyse sur la largeur), carré, centré, jauge 38 × 291 px dégagée des cartes et du damier, aucun défilement horizontal.
  - **Sous 900 px (880×700, observation seulement : chantier Mobile)** : le layout passe en colonne ; la jauge (comme celle de 22 px avant elle) se retrouve hors écran à gauche et la marge de 18 px du rail n'a pas de sens. Pas corrigé (hors périmètre), à traiter avec le chantier Mobile (le plus simple : masquer la jauge sous 900 px).
  - **Conclusion : l'élargissement est CONSERVÉ**, rien n'est cassé aux trois tailles.
- Constat honnête : en hauteur limitante, l'analyse active fait perdre au damier ~87 px (893 → 806 sur 1103 de haut, 667 → 603 sur 900), soit plus que mes « ~16 px de plus » annoncés au plan : la plaque de 56 px porte la ligne d'analyse à ~100 px avec l'espace entre blocs. La largeur du damier n'est jamais touchée. À toi de dire si c'est acceptable ou s'il faut ramener la plaque à ~46 px.
- Piège évité : après avoir coupé l'analyse, le damier retrouve sa taille complète, mais pas instantanément (plus de 500 ms) ; mes premières mesures, trop rapides, m'avaient fait croire à un défaut de redimensionnement ; remesuré avec des attentes plus longues (1,5 s) : aucun défaut.
- **Passage de fumée + captures** (page rechargée de force, console sans erreur ; thème de TEST remis comme trouvé, clair ; analyse coupée en fin de passage : jauge et ligne cachées, classe `analysis-on` retirée, aucune clé de stockage créée, damier revenu à 893 px). Captures enregistrées dans `Claude outputs/` (NON commitées ; `git ls-files "Claude outputs"` = 0 fichier ; à ajouter, le cas échéant, par chemin) :
  - `2b-ter-sombre-desequilibre.jpg` (−1,5 : Noirs devant, palier « bel », lumière 4), `2b-ter-sombre-equilibre.jpg` (+0,1 : équilibre, bande dorée),
  - `2b-ter-clair-desequilibre.jpg`, `2b-ter-clair-equilibre.jpg` (mêmes positions en thème clair).
- **Tests Node, tous verts** : `analysis-format` (94), `analysis-controller`, `worker-analyse`, et une fois chacun `diff` (48 105 positions, aucune divergence), `perft` (profondeur 7), `search-consistency` (aucun écart). `rules.js`, `fastboard.js`, `eval.js`, `search.js`, `worker.js` : non modifiés ; `board.js` : seulement la flèche du meilleur coup (2b).
- `CLAUDE.md` mis à jour (largeur de jauge et règle du rail, échelle 100, paliers, constantes, habillage).

## 2b-ter.3 Comment tester en 3 minutes
1. Le serveur local tourne déjà (`python -m http.server 8934`) : `http://127.0.0.1:8934/index.html`, **Ctrl+Maj+R**.
2. Ouvre une partie de la Bibliothèque, va à une position déséquilibrée, **A** : la jauge (38 px) a une moitié graphite clairement distincte du fond et une moitié ivoire ; la lumière dorée est du côté qui a le dessus (plus forte quand l'écart grandit) ; la plaque est grosse, avec un halo qui suit l'écart.
3. Position à ±0,5 : la jauge doit déjà pencher d'environ 62 % ; ±1 → 73 %. Repères discrets à ±0,5, ±1, ±2 ; bande dorée au centre quand c'est égal (≤ 0,2).
4. **F** : jauge, repères et lumière se retournent avec le damier. Bascule clair/sombre.
5. Redimensionne la fenêtre (large → étroite, > 900 px) : le damier reste carré, centré, sans chevauchement ; les cartes joueurs se rétrécissent de 18 px tant que l'analyse est active.
6. **A** : tout disparaît, les cartes retrouvent leur largeur, le damier sa taille.

## Clôture de l'étage 2b (18/10/2026)
- Rendu validé par Mickaël. `CLAUDE.md` : état final (étages 1, 2a, 2b livrés ; reste à faire ; limites de l'évaluation V0 ; échelle de la barre = une seule constante `BAR_SCALE_CP`). Constat : « persistance thème damier / style de pion » figurait dans la liste demandée mais est DÉJÀ faite (commit `283aa72`) : notée comme telle, pas comme reste à faire.
- Trois commits (code, tests, docs), `git add` par chemin ; `Claude outputs/` non suivi ; tests Node relancés avant le push ; aucun déploiement.

## Correctif du 19/10/2026 — son aux flèches du clavier
- Bug : dans le gestionnaire clavier global de `js/main.js`, ← et → appelaient `game.undo()` / `game.redo()` directement : aucun son à la flèche, contrairement au bouton « coup suivant ».
- Correction (seul changement de code) : `ArrowLeft` → `goToPrevMove()`, `ArrowRight` → `goToNextMove()`, `e.preventDefault()` conservé. Arrêt de la lecture auto, désélection et `refreshUI()` sont déjà gérés par ces fonctions.
- Comportement attendu : → joue le son de coup/prise (et de fin de partie), ← reste silencieux comme le bouton.

## Déplacement de la plaque d'analyse (19/10/2026) — NON commité, en attente de validation visuelle de Mickaël
- La plaque (`#analysis-strip` : score, « indicatif · prof. N », « Meilleur : … ») est maintenant **en haut du panneau de droite** (`.side-panel`), AU-DESSUS des onglets, donc visible quel que soit l'onglet. Toujours masquée tant que l'analyse est coupée.
- `index.html` : bloc déplacé de la colonne du damier vers le début de `<aside class="side-panel">`. `css/style.css` : seule la règle `.analysis-strip` change (plus de `--frame-px`/marge ; `flex: 0 0 auto`, padding, filet bas `--panel-border`). Design de la plaque, jauge, cartes joueurs, ligne de statut : non touchés. `main.js` : inchangé (accès par id).
- Mesuré (1988×1103) : damier 893 px analyse coupée ET active (aucun saut) ; le panneau garde sa hauteur (1000 px), seule la liste en dessous se raccourcit d'environ 140 px à l'activation. Onglet Bibliothèque et Coups joués vérifiés, retournement F sans effet sur la taille, pas de défilement horizontal.
- Non vérifié : thème clair (visuellement), fenêtre plus petite (le redimensionnement de la fenêtre de test n'a pas pris effet). Sous 900 px : point connu, non traité.

### Correctif de régression de mise en page (19/10/2026) — NON commité
- Cause : `alignLayout()` (`js/main.js`) calait le haut du cadre du damier sur le haut des ONGLETS ; avec la plaque d'analyse au-dessus des onglets, le damier était translaté vers le bas de la hauteur de la plaque (débord sur le statut et les contrôles) ; la jauge, centrée sur `.board-stage` (que cette translation ne déplace pas), se retrouvait décalée par rapport au damier.
- Correction : (1) référence d'alignement = haut du panneau `.side-panel` (+ son filet), plus les onglets ; (2) `alignLayout()` pose `--bar-dy` sur `#eval-bar` (centre du damier moins centre de `.board-stage`), `.eval-bar` utilise `translateY(calc(-50% + var(--bar-dy, 0px)))` ; remis à zéro dans `resetLayoutTransforms()`.
- Vérifié sans redimensionner la fenêtre : page chargée dans des iframes de 1280×720, 1536×864, 1800×1000 et 1988×1103, analyse coupée/active, onglet Bibliothèque, retournement F. Partout : haut du cadre = haut du panneau (86/85 + filet), jauge = cadre haut et bas (identiques au pixel), bas du panneau = bas de la barre de contrôles, ligne de statut visible et au-dessus des contrôles, aucun chevauchement.

## Lot d'affichage : libellé, palier en mots, repères de rangées (19/10/2026) — NON commité, en attente de validation visuelle de Mickaël
- Pré-vérif : le commit du déplacement de la plaque (`8d62b18`, docs `b5d19a9`) est passé et poussé.
- **Libellé** : « Évaluation indicative · profondeur N » (`formatMeta()` dans `analysis-format.js`).
- **Palier en mots** sous le gros score, DANS la plaque (`#analysis-tier`, 13 px) : « Petit avantage aux Blancs », etc. Une seule table : `ADVANTAGE_TIERS` (champ `label` ajouté à chaque palier, mêmes seuils que la jauge), lue par `formatTierLabel(result)`. Rien si ≤ 0,2, si mat (affichage du mat inchangé) ou partie terminée ; aucun pourcentage. La plaque grandit de ~12 px seulement quand le libellé est présent ; couleurs du texte = celles du score selon le camp (`--plate-*-fg`).
- **Repères de rangées** à DROITE du damier (`board.js`, `_drawBoard` des coordonnées) : vrais numéros du bord droit à l'écran (5, 15… 45 ; retourné : 6, 16… 46), ancrés 4 px après le cadre ; repères de colonnes du bas inchangés.
- Tests : `analysis-format` adapté (libellé) + 8 vérifications de paliers ; tous les tests Node verts.
- Vérifié en iframes 1280×720, 1536×864, 1800×1000, 1988×1103 : jauge = cadre du damier, panneau et barre de contrôles alignés, inchangé. Captures sombre (repères 5…45 à droite) et clair/retourné. Limite : le libellé de palier a été montré en forçant le texte dans le DOM (la position initiale donne un score ≈ 0) ; le thème clair a été simulé par `data-theme` sans repasser par le bouton, donc les repères du damier y apparaissaient avec les couleurs du thème sombre (artefact du test, à regarder à l'œil).

### Retrait du palier en mots (19/10/2026) — décision de Mickaël : le score seul suffit — NON commité
- Supprimés : `#analysis-tier` (HTML, CSS), `formatTierLabel()`, le champ `label` de `ADVANTAGE_TIERS`, l'alimentation dans `main.js`, et les 8 vérifications de tests associées. `index.html`, `css/style.css` et `js/main.js` sont revenus à l'état du dernier commit.
- Conservés : `ADVANTAGE_TIERS` (seuils/lumière de la jauge), le libellé « Évaluation indicative · profondeur N », les repères de rangées à droite.
- Vérifié (1988×1103, analyse active, normal puis retourné F) : plaque de nouveau à 140 px, jauge = cadre du damier (86–943), pas de `#analysis-tier`. Tests Node verts (`analysis-format`, `analysis-controller`). Thèmes : le retrait ne touche aucun style de thème, pas de contrôle visuel séparé.

## Thème clair « Miel doré » assombri (19/10/2026) — NON commité, en attente de validation à l'œil par Mickaël
- Seules les variables du bloc `:root[data-theme="light"]` de `css/style.css` changent (une source par couleur) : fonds ≈ −10 % de luminosité : `--bg-0/1/2` (#ddd2ba, #d8c59d, #cfb47e), `--panel` (#e6d9be, aussi modales), `--panel-border` (#caab70), `--header-grad-1/2`, `--plaque-1/2`, `--meta-plaque`, et les blancs de la jauge/plaque (`--eval-white-1/2`, `--plate-white-bg`, `--plate-even-bg`, ramenés de blanc pur à ivoire).
- Non touchés : thème sombre, damier, pions, doré/bronze d'accent, couleurs de texte (texte foncé sur fond un peu plus sombre : contraste conservé), plaque « Noirs » et mat.
- Vérifié avec le vrai bouton de thème (analyse active, onglet Bibliothèque, retournement F, aide `?`). Export et partage utilisent les mêmes variables `--panel` (même `.confirm-box`) : pas ouverts séparément. Valeurs à ajuster à l'œil si besoin (une seule zone du fichier).

## Lisibilité du thème clair (19/10/2026) — NON commité, en attente de validation à l'œil par Mickaël
Fonds laissés EXACTEMENT au niveau de l'assombrissement précédent (aucun fond plus sombre) ; on corrige les AVANT-PLANS. Seul `css/style.css` change ; thème sombre vérifié identique (voir plus bas).

### Ce qui a changé (bloc `:root[data-theme="light"]`, une source par couleur)
- Texte : `--text-0` #2c1a05, `--text-1` #402a0b, `--text-2` #4d3410 (même famille brune chaude, plus foncés). `--coord-text` (numéros de cases autour du damier) : opacité 0,65 → 0,95.
- Or : `--gold` (graphismes : soulignement d'onglet, puces, bordures) #7c500e ; NOUVEAU `--gold-text` #4e3006 (or utilisé comme TEXTE : onglet actif, filtres, durées…) ; `--gold-dim` #6e4710 (bordure des cartes) ; `--panel-border` #7d5c30 (filets et contours : boutons, champs, pilules ≥ 3:1 sur leur fond) ; `--shadow-panel` plus marquée (cartes et panneaux se détachent mieux, sans éclaircir).
- États : `--success` #1a6340, `--danger` #7e2312, `--on-danger` #fff6e6 (texte du bouton « Supprimer » au survol : était brun sur rouge).
- Cartes joueurs : avatars-lettres via variables (`--avatar-ring-*`, `--avatar-bg-*`, `--avatar-letter-*`) : cadre foncé pour les DEUX camps ; Blancs = intérieur ivoire + « B » foncé ; Noirs = intérieur brun + « N » doré clair. Pastille BLANCS/NOIRS (`--side-tag-bg/fg`) : fond ivoire translucide + texte brun. Badge Elo : `.meta-field.elo-badge` (le `.meta-field` placé plus bas dans le fichier écrasait la couleur foncée du badge par `--text-2` : défaut de règle) → `--elo-badge-fg`. Séparateur « · » des métadonnées : `--meta-sep-opacity` 0,5 → 0,9.
- Plaque d'analyse : `.analysis-best-move` utilise `--best-move-text` (#146026) au lieu de `--best-arrow-color` (la flèche du damier reste inchangée).
- Fond de page : le dégradé du `body` avait un centre #241a10 EN DUR dans les deux thèmes (halo brun sombre « sale » en haut du thème clair, derrière « 2-0 » et « Trait aux… ») → `--bg-glow` (sombre : même #241a10 ; clair : #e6dcc6).
- Boutons dorés pleins (lecture, Analyse, durée de flèche active, annotation active) : contour `--chip-border` (clair : #7a5410 ; sombre : = `--gold-chip`, donc inchangé). Placeholders des champs : `--placeholder-color` (clair seulement).
- Variables « or décoratif » conservées pour que la jauge et le survol de l'export ne changent pas : `--gold-accent` (clair #c8902e : ligne et repère central de la jauge, survol « Exporter »). Les ~35 `color: var(--gold)` de texte passent par `--gold-text` ; en sombre `--gold-text` = `--gold`, `--gold-accent` = l'ancien or, etc. : valeurs identiques à avant.

### Mesure (script WCAG dans le navigateur : toutes les chaînes de texte visibles ; pour les fonds en dégradé, pire cas de chaque pas du dégradé ; plaques d'opacité composées)
Seuils : 4,5:1 pour le texte (3:1 si ≥ 24 px, ou ≥ 18,66 px en gras), 3:1 pour les éléments d'interface. Avant = état au début de la session (fonds déjà assombris). Après = état final, thème clair, vrai bouton de thème.
| Élément | Avant | Après |
|---|---|---|
| Avatar « B » (Blancs) | 1,21 | 12,77 |
| Avatar « N » (Noirs) | 1,66 | 10,55 |
| Pastille NOIRS / BLANCS | 1,16 | 11,24 |
| Badge « Elo … » | 2,71 | 7,74 |
| Ligne tournoi « — · date · ronde » | 2,98 (« · » : 1,65) | 5,78 |
| Libellé « Pions », puces ● | 3,53 / 1,66 | 6,83 / 7,08 |
| Score « 2-0 » / « Trait aux … » / compteur | 2,13 / 2,86 / 2,86 (halo sombre du fond) | 9,01 / 7,72 / 7,72 |
| « Vitesse » / « ×1 » | 4,28 / 2,01 | 8,29 / 8,59 |
| Boutons de la barre du haut (Nouvelle partie, Importer, Exporter, ?…) | 4,00 | 6,75 |
| Onglet « Coups joués » / « Bibliothèque » | 4,28 / 2,01 | 8,29 / 8,59 |
| Légendes de la plaque : « Évaluation indicative… » / « Meilleur : » / 34-30 | 3,04 / 4,28 / 2,98 | 5,05 / 8,29 / 5,50 |
| « 2 parties », filtre « Toutes », numéro de partie | 4,28 / 1,78 / 1,78 | 8,29 / 7,63 / 7,63 |
| Métadonnées d'une partie (tournoi, ronde) | 3,80 | 7,36 |
| Recherche (placeholder) | 2,98 | 5,19 |
| Placeholder URL photo (gris navigateur) | 2,30 | ≥ 4,5 |
| Toast « PDF exporté » (succès) | 3,06 | ≥ 5,0 |
| Bouton « Supprimer » (danger) | non mesuré (≈ 3,7) | 4,9 |
| Numéros de coups (liste de notation) | 4,28 | ≥ 6 (même `--text-2`, sur panneau) |
Résultat : 71 chaînes de texte mesurées, 0 sous le seuil (marge minimale ×1,05), dans les états : liste de coups, analyse active, onglet Bibliothèque, plateau retourné (F), aide (?), modales d'export image et de partage, popover photo, modale de confirmation de suppression (annulée), carte avec photo (image de test injectée) et carte avec avatar-lettre.
- Hors mesure par script (dessinés dans le `<canvas>`) : numéros de cases autour du damier. `--coord-text` à 0,95 d'opacité (#2c1a05) sur le fond de page : ≈ 8:1 (calcul), contre ≈ 4:1 avant.
- Éléments d'interface (contours/fonds ≥ 3:1) : boutons de la barre du haut 2,35 → ≥ 3 ; boutons dorés pleins 1,58 → contour 5,0 ; restent sous 3:1 par la LUMINANCE seule, mais identifiés par leur libellé à fort contraste : pilules « 20 PIONS » (2,61), pastilles Elo / BLANCS / NOIRS / compteur de bibliothèque, boutons de filtre (segmentés dans un cadre), curseurs (piste par défaut du navigateur, curseur `accent-color` or sombre).

### Vérifications
- Vrai bouton de thème (sombre → clair), analyse active/coupée, Bibliothèque, retournement F (repères 46…6 à droite), modales (aide, export image, partage, confirmation), carte photo + carte lettre : captures contrôlées. Thème sombre : instantané des styles calculés de 695 éléments (couleur, fond, bordures, ombres, pseudo-éléments) avec la feuille de style d'avant (HEAD) vs la nouvelle : 0 différence.
- Test fortuit : l'ouverture de l'export « PDF » pendant l'audit a réellement lancé un export (toast « PDF exporté ») : un fichier PDF a pu être enregistré dans les téléchargements, à supprimer si présent.
- Tests Node verts (`analysis-format`, `analysis-controller`, `worker`, `diff`) ; aucun test ne touche au CSS.

## IA — Étape 1 : validation du moteur sur la Bibliothèque exportée (19/10/2026) — aucun code modifié, rien de commité
- **Confidentialité** : `tests/pdn-local/` est ignoré (`.gitignore` ligne 17, `git check-ignore` confirmé) ; le fichier `tests/pdn-local/bibliotheque-complete.pdn` (8 403 octets) n'apparaît pas dans `git status`. Rien n'a été commité.
- **Ce qui a été testé** : `node tests/diff.mjs --games 0 --positions 0` (rejeu parser → `rules.js` → moteur rapide, comparaison position par position, `makeMove`/`unmakeMove` compris).
- **Résultat** : 1 fichier, **50 parties lues, 228 demi-coups rejoués, 278 positions et 2 513 coups comparés, aucune divergence** entre `rules.js` et le moteur rapide, **0 partie rejetée ou partiellement lue** (aucun coup illégal, aucun motif de parsing à signaler : 50 parties parsées pour 50 blocs `[Event]`, l'en-tête `[LibraryName]` n'est pas une partie). Temps : 0,0 s (≈ 0,14 s de processus Node).
- **Constat important** : ce fichier n'est PAS une Bibliothèque « complète » au sens volumétrique : 50 parties de 4 à 16 demi-coups (moyenne 4,6), 220 coups simples et seulement 8 prises (2 rafles multiples, 0 prise par une dame), 13 commentaires, 6 annotations (`!`, `?`, `??`), résultats 2-0 / 1-1 / 0-2 (17 / 17 / 16 : parties de test). Aucune finale, aucune dame. La validation est donc réelle pour le parseur (commentaires multi-lignes, `[diagramme]`, annotations) mais ne couvre pas les cas difficiles du moteur (dames, rafles longues) ; ceux-ci restent couverts par les ~48 000 positions aléatoires de `diff.mjs` et le perft. À refaire avec de vraies parties longues quand elles seront dans la Bibliothèque.
- **Perft / rejeu complet** : sans objet sur ces fichiers (le perft part de la position initiale, déjà validé jusqu'à la profondeur 11).
- **Analyse (`analyseSync`, hors UI)** sur 3 positions réelles tirées des plus longues parties (début de partie : aucune finale disponible), durées par profondeur (machine de dev, scores non interprétés) :
  | Position | prof. 4 | 6 | 8 | 10 | 12 |
  |---|---|---|---|---|---|
  | #2 après 16 demi-coups (36 cases occupées) | 5 ms | 14 ms | 71 ms | 623 ms | 6,8 s (4,8 M nœuds) |
  | #2 après 8 demi-coups (38) | 2 ms | 8 ms | 47 ms | 282 ms | 1,8 s |
  | #0 après 13 demi-coups (36) | 1 ms | 3 ms | 38 ms | 163 ms | 1,1 s |
  Ordre de grandeur : facteur ≈ 8 à 10 par 2 profondeurs ; la profondeur 10 tient en moins d'une seconde, la 12 demande 1 à 7 s.
- Remarque : le fichier a d'abord été déposé sous le nom `Top du Top 1957.pdn` puis renommé `bibliotheque-complete.pdn` (même taille, même contenu) ; le dossier ne contenait rien avant.


## IA — Étape 2 : répétition de position et règle des 25 coups (19/10/2026) — NON commité, en attente de ton retour
### 0. Règles vérifiées (textes officiels FMJD lus dans les PDF, pas de mémoire)
Sources : [Annexe 1 « Official FMJD rules for international draughts », art. 6](https://www.fmjd.org/downloads/news/948/Annex%201%20official%20FMJD%20rules%20of%20international%20draughts.pdf) (version plus ancienne) et [FMJD Annexes 2024, Annexe 1, art. 6, p. 14](https://www.fmjd.org/downloads/FMJD_Annexes_2024_8-sig.pdf) (version en vigueur). L'anglais fait foi.
- **6.1 Répétition** : nulle quand la même position se produit pour la **troisième fois**, avec le **même joueur au trait** (les occurrences n'ont pas à être consécutives). IMPLÉMENTÉ.
- **6.2 Règle des 25 coups** : nulle si, pendant **25 coups successifs de chaque joueur**, seules les dames ont bougé, sans coup de pion ni prise (= 50 demi-coups). IMPLÉMENTÉ.
- **6.3 Finales limitées à 16 coups (NON implémenté)** : avec seulement trois dames, deux dames + un pion, ou une dame + deux pions contre une dame, les deux joueurs peuvent jouer au plus **16 coups chacun** de plus, puis nulle. Version 2024 : une prise pendant ces 16 coups ne change pas le maximum ; si le joueur à une dame occupe seul la grande diagonale, le maximum est de **5 coups** ; exception : si le dernier de ces coups met l'adversaire dans une position perdante (art. 7.2.2 ou 7.2.3 : plus de coup possible ou plus de pièces), la perte prime. La version plus ancienne dit seulement « seize coups maximum » (sans les précisions prise / grande diagonale / exception).
- **6.4 Finales limitées à 5 coups (NON implémenté)** : deux dames, une dame et un pion, ou une dame contre une dame : nulle après **5 coups chacun** de plus (même exception qu'en 6.3 dans la version 2024).
- **À décider avec toi** pour 6.3 et 6.4 : (1) ces règles dépendent du MOMENT où la finale est atteinte (compteur qui démarre à l'arrivée du matériel concerné), donc d'un historique que l'appli ne transmet pas encore ; (2) les textes de 2018 et 2024 diffèrent (grande diagonale, effet d'une prise, exception de perte) : laquelle suivre ? ; (3) pour une analyse indicative, les implémenter ferait afficher « nulle » en finale 2D contre 1D, etc. Rien n'est implémenté sans ton accord.

### 1. Ce qui est implémenté
- **`FastBoard.quiet`** (`fastboard.js`) : demi-coups consécutifs sans coup de pion (promotion comprise) ni prise, tenu par `makeMove`/`unmakeMove` (pile `_stkQuiet`) ; `FastBoard.fromUiBoard(board, side, quiet)` pour reprendre une position en cours de partie ; constante `DRAW_QUIET_PLIES = 50`.
- **Recherche** (`search.js`) : sous la racine, un nœud avec `quiet ≥ 50` ou en répétition vaut **0** (jamais à la racine : on y choisit un coup quoi qu'il arrive ; le résultat porte `drawRule: null | 'quiet' | 'repetition'` si la position analysée est DÉJÀ nulle par règle). Répétition : (a) position qui revient sur le **chemin courant** de la recherche (racine comprise, même camp, écart ≥ 4 demi-coups) → 0 dès la 2e occurrence (c'est un cycle que les deux camps peuvent répéter jusqu'à la 3e : pratique standard des moteurs, plus prudente que la lettre de 6.1) ; (b) position qui ferait la **3e occurrence** en comptant l'**historique de la partie** → 0, conforme à 6.1. Fenêtre de test limitée aux `quiet` derniers demi-coups (au-delà, un coup irréversible a eu lieu). Coût : boucle uniquement quand `quiet ≥ 4`.
- **Historique** : message `analyse` du Worker : `{ type: 'analyse', position, history?, options }`, `history = { quiet, positions: [{ board, side }] | hashes: [[lo, hi]] }`, du plus ancien au plus récent, SANS la position analysée (`normalizeHistory()` de `search.js`, qui tronque aux `quiet` dernières). Absent ou `quiet = 0` : comportement d'avant, strictement. `analysis-controller.js` : `request(position, history)` ; la clé de déduplication inclut l'historique ; message sans clé `history` quand il n'y en a pas. `analysis-format.js` : `analysisHistory(game.history)` (pure, testée) fabrique `{ positions, quiet }` (plafond 50) ; `main.js` ne fait que le passer (`requestAnalysis()`), il ne modifie rien. Écart au prompt : l'appli envoie des POSITIONS (hachées dans le Worker) et non des hashes, pour ne pas importer `search.js` sur le fil principal ; le Worker accepte aussi directement des hashes.

### 2. Choix pour la table de transposition (Zobrist)
Un score dépendant de l'historique ne doit pas polluer la table. Retenu : **« teinte »** — `drawHits` compte les nulles par règle ; un nœud dont le sous-arbre en a produit au moins une n'est **pas écrit** dans la table. Les scores écrits viennent donc de sous-arbres sans nulle par règle ; la lecture reste inchangée (profondeur exacte seulement, comme avant). Limite théorique (problème « GHI » classique) : une entrée saine peut être relue par un autre chemin où une répétition aurait touché ce sous-arbre. **Mesuré : 0 écart** entre recherche avec et sans table sur 230 finales à dames avec historique aléatoire (160 à la profondeur 8, 70 à la profondeur 10), et 30 dans la suite permanente. Variante plus stricte essayée et abandonnée (ni lire ni écrire la table aux nœuds `quiet > 0`) : exacte mais **+56 % de nœuds** en finale de dames (2,7 M → 4,2 M sur 150 positions, profondeur 7). Le coup suggéré par la table pour le tri des coups n'influence aucun score.

### 3. Tests (nouveau `tests/repetition.mjs`, 36 vérifications, toutes OK ; nouvelle donnée `tests/data/golden-scores.json`)
- Compteur : remis à 0 par coup de pion / prise / promotion, +1 par coup de dame, `unmakeMove` restitue (300 parties aléatoires).
- **(a)** 1D contre 1D (Blancs en 1, Noirs en 45, trait aux Blancs) : avant, `−10` en profondeur 8 (trouvé en comparant avec l'ancien moteur sur les 2 450 positions 1D/1D : seules 4 positions symétriques changent) ; maintenant `0`.
- **(b)** 2D contre 1D (`K1,K2` / `K46`) : compteur 0 → `+310` ; compteur 47, 48, 49 → `0` ; compteur 50 à la racine → `drawRule = 'quiet'` ; une prise immédiate (mat en 2) n'est pas masquée à compteur 48.
- **(c)** même position : le meilleur coup `1-18` ; si la position après `1-18` est déjà vue DEUX fois dans l'historique, le moteur choisit `1-29` et garde `+310` ; vue une seule fois (2e occurrence) : rien ne change (art. 6.1 : 3e fois) ; même plateau avec l'autre camp au trait : rien ; hashes = positions ; historique plus long que le compteur : tronqué.
- **(d)** 60 positions tirées au hasard (30 sans dame, 30 avec) : score, mat et meilleur coup **identiques** à ceux de l'ancien moteur (référence figée dans `tests/data/golden-scores.json`, profondeur 7, sans nom de joueur). Sur 150 positions (script jetable) : 0 score différent, 0 meilleur coup différent ; le nombre de nœuds change sur 20 d'entre elles (cycles désormais coupés), sans changer le score.
- **(e)** Worker : sans historique = résultat d'avant ; avec historique = résultat direct, ≠ « sans » ; `drawRule` ; contrôleur : message avec/sans `history`, historique différent → nouvelle requête, identique → rien ; `analysisHistory` (5 cas dont plafond 50).
- Suite complète relancée, tout vert : perft 9 (41 022 423 = référence), `diff` (48 383 positions, aucune divergence), `perft-positions`, `worker`, `eval-symmetry`, `search-consistency`, `tactics` (20/20), `mate`, `match` (100 parties : 63 victoires, 27 nulles, 10 défaites, 76,5 %), `worker-analyse`, `analysis-format`, `analysis-controller`, `repetition`.

### 4. Impact sur la vitesse
- `search-perf` (1 s par position), nœuds/s avant → après (deux passages) : position initiale 675 k → 667 k / 661 k ; milieu A 725 k → 730 k / 724 k ; B 789 k → 794 k / 780 k ; C 793 k → 799 k / 756 k ; finale de pions 979 k → 992 k / 1 007 k ; finale à dames 1 044 k → 1 013 k / 1 073 k. Soit ±2-3 %, dans le bruit de mesure ; profondeurs atteintes inchangées (à une profondeur près sur une ligne « sans table », selon le passage).
- `bench` (fastboard seul) : 5,50 M → 5,41 M nœuds/s (position initiale, prof. 8), 11,8 M → 11,5 M (milieu), 16,2 M → 16,8 M (finale) : ≈ −2 % (le compteur dans `makeMove`). Perft inchangé.
- 150 positions à profondeur 7 : 3,6 s avant, 3,6 s après.

### 5. Limites restantes
- Limites de finale 6.3 (16 coups / 5 coups sur la grande diagonale) et 6.4 (5 coups) : non implémentées (voir §0, ta décision).
- Répétition sur le chemin : nulle dès la 2e occurrence dans l'arbre (prudence moteur), 3e seulement pour l'historique de partie.
- GHI de la table : théorique, 0 écart mesuré.
- L'interface n'affiche rien de nouveau : `drawRule` est dans le résultat mais non exploité (« sans nouvelle fonction ») ; une position déjà nulle par règle continue d'être analysée normalement.
- Un score `-0` peut apparaître côté Noirs pour une nulle (sans effet à l'affichage ; `formatScore` n'affiche aucun signe pour 0,0).
- Non fait : mise à jour de `CLAUDE.md` (attend ta validation). Rien n'est commité ni déployé.


## IA — Étage 3, étape 3.1 : arène, auto-jeu et enregistrement de données (19/10/2026) — NON commité, en attente de ton retour
Aucun changement visible dans l'appli. Code dans `training/` (voir `training/README.md`, commandes prêtes à coller), un test `tests/arena.mjs`, et une retouche de `js/ai/search.js`. Données et journaux dans `training/data/` et `training/logs/` (ajoutés au `.gitignore` ; `git status` ne les voit pas). Aucun nom de joueur dans ces données (parties jouées par le moteur).

### 0. Matériel détecté
8 cœurs logiques (Intel Core i7-9700 @ 3,0 GHz), 15,9 Go de RAM (≈ 6 Go libres au moment de la mesure), carte graphique NVIDIA GeForce RTX 2060 (6 Go de mémoire vidéo, pilote 610.88), Node v24.19.0, Python 3.12.7 avec NumPy 2.4.6, **PyTorch absent** (rien installé). Conclusion pour plus tard : un mini-réseau est matériellement envisageable (RTX 2060 + CUDA), mais il faudrait installer PyTorch (ou équivalent) ; pour l'étape 3.2 (réglage d'une trentaine de poids), le CPU et Node suffisent largement.

### 1. Ce qui a été construit
- **`js/ai/search.js` (seul changement hors `training/`)** : l'évaluateur est maintenant injectable (`analyse*(position, { evaluator })`, fonction `evalWhite` de `createEvaluator(poids)` ; défaut = V0) et un **budget de nœuds** déterministe existe (`maxNodes`, défaut infini ; arrêt à 2048 nœuds près, dernière profondeur terminée conservée). `eval.js` n'est PAS modifié. Aucun score ne change : `tests/data/golden-scores.json` (60 positions, scores, mats et meilleurs coups identiques à ceux d'avant l'étape 2) et toute la suite restent verts ; vitesse inchangée (voir g).
- **`training/game.mjs`** : une partie complète (moteur rapide pour jouer, `rules.js` en vérification) : perte si plus de coup (contrôlée en premier), nulle à 50 demi-coups sans prise ni coup de pion, nulle à la 3e répétition (historique transmis au moteur par le mécanisme de l'étape 2), nulle à 300 demi-coups. Limites de finale FMJD 6.3/6.4 : non appliquées (décision de Mickaël). Hasard par graine : `seedOf(graine, étiquette, indice)` donne à chaque ouverture / chaque partie son propre flux (indépendant de l'ordre d'exécution). Ouvertures : K = 8 demi-coups au hasard, rejetées si |évaluation V0 à la profondeur 4| > 0,5 pion ou mat (jusqu'à 500 essais). Exploration (auto-jeu uniquement) : à chaque coup après l'ouverture, avec la probabilité `--explore-prob` (0,08), coup tiré au hasard parmi ceux dont le score (recherche à profondeur − 1) est à moins de `--explore-margin` (30 cp) du meilleur ; désactivée en match. `verifyGame()` rejoue une partie enregistrée avec `rules.js` seul : légalité de chaque coup, partie jamais terminée avant son dernier coup, état terminal et motif exacts.
- **`training/arena.mjs`** (`match` et `selfplay`) : `worker_threads`, workers = cœurs − 1 par défaut, priorité système abaissée (`BELOW_NORMAL`), worker planté = relancé et tâche rejouée (3 essais), profondeur fixe obligatoire (`--depth`, ou `--depth-a/--depth-b`), budgets `--nodes` (reproductible) et `--time` (non reproductible) en option. Une tâche = une paire (match : même ouverture, couleurs inversées) ou une partie. JSONL ligne par ligne (une paire = deux lignes en UNE écriture) ; reprise = même commande (ligne finale tronquée retirée, paire à moitié écrite retirée, rien de rejoué), réglages différents dans un dossier existant = refus. Ctrl+C : arrêt immédiat et propre, `summary.json` écrit. Suivi toutes les 30 s (terminal + `training/logs/<out>.log`) : tâches faites, parties/h, V/N/D, temps restant, mémoire. `training/verify.mjs` : rejoue un dossier avec `rules.js`. `training/sleep.mjs` : voir §5.
- **Statistiques de match** (`training/stats.mjs`) : l'unité statistique est la **paire** (les deux parties d'une paire partagent l'ouverture, elles ne sont pas indépendantes). Score de la paire pour A : m = (points partie 1 + points partie 2)/2 (victoire 1, nulle 0,5). Score moyen s = moyenne des m ; erreur-type = écart-type empirique des m (variance corrigée n − 1) / √n ; intervalle à 95 % = s ± 1,96·erreur-type (approximation normale), borné à [0 ; 1] ; **Elo(s) = 400·log10(s/(1 − s))**, appliqué à s et aux deux bornes (s = 0 ou 1 → ±∞). Avertissements : moins de 2 paires (pas d'intervalle) ; moins de 100 paires (« échantillon FAIBLE ») ; intervalle contenant 0 Elo (« différence NON significative »).
- **Données d'auto-jeu** (format détaillé dans `training/README.md`) : une ligne par partie avec, pour chaque position HORS ouverture aléatoire (le nombre de demi-coups d'ouverture est donné à part, champ `opening`) : plateau en 50 caractères (`.` vide, `w`/`W` pion/dame blanc, `b`/`B` pion/dame noir), camp au trait, n° de demi-coup, compteur de demi-coups sans prise ni coup de pion, score de recherche (centipions, point de vue des Blancs ; ≥ 29 000 en valeur absolue = mat), profondeur, indicateur « prise disponible » ; le résultat final (point de vue des Blancs) est dans `result`. JSONL texte choisi (≈ 12 Ko par partie de ~150 demi-coups, soit ~80 octets par position) : simple à relire et à filtrer, ~0,9 Go pour 74 000 parties ; un binaire n'a pas été jugé nécessaire à cette échelle.

### 2. Tests de validation (chiffres réels, machine décrite en §0)
- **a. Miroir** — V0 contre V0, profondeur 4, **200 paires** (400 parties, 9 s) : A 164 victoires, 72 nulles, 164 défaites = **50,0 %** (Elo 0). L'intervalle est dégénéré (50,0 à 50,0 %) : deux moteurs identiques et déterministes rejouent exactement la même partie dans les deux sens, donc chaque paire vaut exactement 0,5 ; ce test valide donc la comptabilité (couleurs, points, appariement), pas la force. Test plus parlant : V0 contre V0 légèrement modifié (`centerCoreMan` 5 → 6, joueurs quasi égaux), même profondeur, 200 paires : **A 164 V, 82 N, 154 D = 51,2 %** (IC 95 % 47,1 à 55,4 %, Elo +9 [−20 ; +38]) → dans l'intervalle de 50 %, aucun biais de couleur ni d'ouverture visible.
- **b. Sensibilité** — V0 profondeur 6 contre V0 profondeur 3, 100 paires : **194 V, 2 N, 4 D = 97,5 %** (IC 95,5 à 99,5 %, Elo +636). V0 profondeur 8 contre profondeur 6, 60 paires : **99 V, 18 N, 3 D = 90,0 %** (IC 85,6 à 94,4 %, Elo +382 [+310 ; +490] ; échantillon faible signalé par l'outil). La recherche plus profonde gagne très nettement.
- **c. Reproductibilité** : même graine = parties identiques coup pour coup, au niveau tâche (`tests/arena.mjs`) ET au niveau programme (un run interrompu puis repris donne, hors durées, exactement les mêmes 48 lignes qu'un run sans interruption) ; autre graine ou autre indice = autre ouverture ; exploration reproductible avec la même graine.
- **d. Reprise** (tests automatiques, `tests/arena.mjs`) : (1) relance avec plus de paires : les lignes existantes sont inchangées, aucun doublon ; (2) ligne finale tronquée + paire orpheline : fichier réparé, 16 lignes, aucune perte ni doublon, identique à un run ininterrompu ; (3) run **tué** (SIGKILL) à 4 lignes sur 48 puis relancé : 48 lignes, 0 doublon, 0 perte, identique à un run sans interruption ; (4) Ctrl+C (le gestionnaire est exercé par un crochet qui émet le signal ; le signal système Windows lui-même n'est pas simulable par script) à 40/400 parties : code 130, `summary.json interrupted`, fichier valide, puis reprise à 400 parties sans doublon ; (5) worker qui plante : relancé, 6 paires complètes ; (6) autre graine dans un dossier existant : refus, rien écrasé.
- **e. Légalité** : `training/verify.mjs` (rules.js seul) a rejoué **3 000 parties d'auto-jeu enregistrées** (463 250 demi-coups) + les 400 + 400 + 200 + 120 parties des matchs a, a', b : **toutes légales**, aucun coup refusé, résultats et motifs de fin (plus de coup / 25 coups / répétition / plafond) cohérents ; chaque partie des runs est de plus vérifiée à la volée (`--no-verify` pour désactiver). Le vérificateur est testé : coup illégal, résultat falsifié et partie tronquée sont détectés. Répartition des fins sur 3 866 parties (profondeur 6) : plus de coup 73 %, répétition 13,5 %, 25 coups 10 %, plafond de 300 demi-coups 3,3 %.
- **f. Débit** (auto-jeu, 7 workers, V0, exploration 0,08 ; moyenne sur les parties terminées) :
  | Profondeur | Durée mesurée | Parties | Parties/h | Positions/h | Nœuds/s/cœur | Demi-coups/partie |
  |---|---|---|---|---|---|---|
  | 6 | 25 min | 3 866 | **≈ 9 300** | **≈ 1,36 million** | ≈ 595 k | 154 |
  | 8 | 6 min | 82 | **≈ 870** | ≈ 131 000 | ≈ 600 k | 159 |
  | 10 | 9 min | 20 | ≈ 133 mesurées (≈ 230 si on ne compte que les parties terminées ; sous-estimation du temps : les longues parties en cours à l'arrêt sont perdues) | ≈ 20 000 à 32 000 | ≈ 570 k | 148 |
  Une profondeur de plus coûte environ ×3 à ×3,5 de temps. **Mémoire (run de 25 min, 7 workers)** : 1,14 à 1,17 Go dès la première minute, plateau stable jusqu'à la fin (1 145 Mo à 1 min, 1 158 à 5 min, 1 163 à 15 min, 1 169 à 25 min ; pas de fuite) ; ~165 Mo par worker.
  **Recommandations pour une nuit (≈ 8 h, tous les workers, le PC reste utilisable grâce à la priorité abaissée)** : (1) **profondeur 8, 7 workers, 6 000 parties** (≈ 7 h, ≈ 900 000 positions, ≈ 75 Mo) : meilleures étiquettes (les scores de recherche de profondeur 8 sont de meilleure qualité) et déjà beaucoup de données pour un réglage de ~30 poids ; ou (2) **profondeur 6, 7 workers, 70 000 parties** (≈ 7 h 30, ≈ 10 millions de positions, ≈ 0,85 Go) si l'on veut surtout du volume. La profondeur 10 (≈ 150 parties/h) est réservée à de petits jeux de contrôle. Pour comparer deux jeux de poids (étape 3.2) : match à la profondeur 6, 200 paires ≈ 2 min.
- **g. Tests existants** : tous verts après les changements (perft 9, `diff` 48 383 positions sans divergence, `perft-positions`, `worker`, `eval-symmetry`, `search-consistency`, `tactics` 20/20, `mate`, `match`, `worker-analyse`, `analysis-format`, `analysis-controller`, `repetition` dont `golden-scores`) + nouveau `tests/arena.mjs` (60 vérifications, ≈ 10 s). **Perf du moteur inchangée** : `search-perf` (nœuds/s : 695 k position initiale, 747 k / 798 k / 807 k milieux de partie, 1,01 M finale de pions, 1,06 M finale à dames ; avant : 675 k, 725 k, 789 k, 793 k, 979 k, 1,04 M) ; `bench` 5,64 M / 12,0 M / 16,5 M nœuds/s (avant 5,50 / 11,8 / 16,2) ; les 150 positions de contrôle à profondeur 7 : 3,6 s avant et après.

### 3. Veille Windows (point 8)
Moyen retenu : `training/sleep.mjs` lance un PowerShell (commande encodée en base64, pour éviter les soucis de guillemets) qui appelle `SetThreadExecutionState(ES_CONTINUOUS | ES_SYSTEM_REQUIRED)` et reste en vie ; l'écran peut s'éteindre, seule la veille du système est empêchée. Testé : (1) auto-vérification : le second appel renvoie l'état précédent `0x80000001`, preuve que le premier a pris (`veille Windows : bloquée pendant le calcul` dans le journal) ; (2) le processus enfant est arrêté à la fin ; (3) si le script Node est tué brutalement, le PowerShell disparaît de lui-même en moins de 5 s (compte des processus powershell : 2 avant, 3 pendant, 2 après un `SIGKILL` du parent) ; l'état de veille est lié au processus, donc rétabli. Piège corrigé : PowerShell lit `0x80000001` comme un entier NÉGATIF (erreur de conversion), la valeur est écrite en décimal (2147483649). Limite : `powercfg /requests` exige des droits administrateur, donc la preuve externe n'a pas pu être obtenue ; seule l'auto-vérification est disponible. Procédure manuelle de secours documentée dans `training/README.md`.

### 4. Limites et points de vigilance
- Deux moteurs identiques donnent EXACTEMENT 50 % (test a) : l'arène ne détecte un biais de couleur que sur des joueurs différents ; le test a' (poids légèrement différents) le fait.
- À profondeur fixe les parties sont déterministes : sans exploration (match), toute la diversité vient des ouvertures (K = 8 demi-coups, rejet à 0,5 pion) ; des ouvertures identiques peuvent se répéter sur de très gros runs (la graine dérive de l indice, aucun dédoublonnage n est fait).
- Les poids JSON sont arrondis à l'entier (les tables de `createEvaluator` sont des `Int32Array`) : l'apprentissage 3.2 devra en tenir compte (ou passer les tables en flottants, ce qui changerait légèrement les scores V0 : à ne faire qu'avec accord).
- 27 % de nulles et 3 % de parties au plafond de 300 demi-coups en V0 : les limites de finale 6.3/6.4 (non implémentées) raccourciraient beaucoup de ces finales ; les positions de ces longues finales (dames) ont des étiquettes moins informatives.
- Les scores de recherche ±29 000 (mats) ne sont pas utilisables tels quels comme cibles d'apprentissage : filtrer ou tronquer.
- Journal de progression : estimation du temps restant basée sur le débit moyen de la session (instable en début de run ; 10 premières minutes). Le crochet de test `ARENA_TEST_SIGINT_AFTER_MS` (simule Ctrl+C après N ms) est utilisé pour arrêter les runs chronométrés.
- Une interruption (Ctrl+C) fait perdre les parties en cours (≤ 7 parties ; à profondeur 10, jusqu'à ~2 min de calcul par worker).

### 5. Recommandations pour l'étape 3.2 (apprentissage ; rien n'est implémenté ici)
1. Générer un premier jeu d'auto-jeu (profondeur 8, ~6 000 parties, une nuit) ; filtrer : positions calmes (`prise_disponible = 0`), score non-mat, éventuellement hors ouverture et hors premiers demi-coups d'une finale dégénérée.
2. Méthode simple et robuste d'abord : **régression logistique / moindres carrés sur les ~30 poids de `EVAL_WEIGHTS`**, cible = résultat final de la partie (1 / 0,5 / 0 du point de vue des Blancs), éventuellement mélangée au score de recherche (Texel tuning : mélange résultat/score), car l'évaluation est LINÉAIRE en ses poids (les `advance`, `tempo`, centre, dernière rangée sont des compteurs de pièces × poids) : on peut extraire des vecteurs de caractéristiques une fois pour toutes et optimiser en quelques secondes en Node, sans réseau de neurones.
3. Valider chaque nouveau jeu de poids par un **match contre V0 à la profondeur 6, ≥ 200 paires** (≈ 2 min) ; ne garder que si l'intervalle de confiance est au-dessus de 0 Elo. Itérer : nouvelles parties avec les nouveaux poids, etc.
4. Avant de passer à un réseau de neurones (PyTorch non installé, RTX 2060 disponible) : mesurer le gain du réglage linéaire ; un réseau demanderait aussi un évaluateur rapide en JS (le moteur évalue ~600 k nœuds/s/cœur : tout surcoût d'évaluation se paie en profondeur).
5. Décision à prendre avec Mickaël : implémenter ou non les limites de finale 6.3/6.4 avant la génération massive (elles changent la durée et l'issue de nombreuses finales).


## IA — Étage 3, Étape 3.2 : apprentissage de l'évaluation par l'auto-jeu (20/10/2026) — NON commité, en attente de ton retour
**Résultat en une phrase** : deux petites tables apprises sur les 8 000 parties de la nuit 1 battent nettement l'évaluation V0 écrite à la main : **V1b (3 jeux de tables selon le nombre de pièces, cible = score de recherche) gagne +211 Elo à la profondeur 6 (400 paires, IC 95 % +188 à +236) et +170 Elo à la profondeur 8 (150 paires, IC +136 à +207)**, et son évaluation est aussi rapide que celle de V0 (V1, un seul jeu : trois fois plus rapide). Aucun changement visible dans l'appli ; `eval.js`, `golden-scores.json` et tous les scores de V0 sont inchangés ; tous les tests existants restent verts ; la vitesse du moteur est inchangée. Le code de l'étape 3.1 (arène) est toujours non commité lui aussi.

### 1. Constat vérifié : V0 est une somme de valeurs par case
`tests/eval-learned.mjs` : en évaluant une pièce seule sur chaque case, on extrait deux tables de 50 valeurs (pion, dame) ; leur somme (pièce noire en i = pièce blanche en 49 − i, signe inversé) redonne l'évaluation V0 **sans aucun écart sur 6 000 positions aléatoires (dont 3 923 avec dames)**, et, injectée dans la recherche, donne scores, coups et nombres de nœuds identiques à V0 sur 24 positions (profondeur 5). Les 100 caractéristiques de l'apprentissage redonnent aussi exactement V0 sur 20 353 positions réelles de l'auto-jeu. On peut donc apprendre les tables directement. **Vitesse** de l'évaluation (ns par position, meilleur de 7) : V0 ≈ 177-181, tables à un jeu ≈ 51-56 (**3,3 fois plus rapide**), tables à 3 phases ≈ 173-177 (≈ V0). Dans la recherche entière l'évaluation n'est qu'une petite part du temps : profondeur 7 sur 6 positions, V0 810 k nœuds/s, V1 860 k (+6 %), V1b 821 k (+1 %) ; en revanche, à profondeur égale, V1 et V1b visitent **moins de nœuds** (66 k et 76 k contre 84 k pour V0 : −21 % et −10 %), ce qui accélère l'auto-jeu (§7).

### 2. Code livré (rien d'autre n'est modifié)
- `js/ai/eval-learned.js` (nouveau) : `createTableEvaluator(tables)` → `evalWhite(board)` compatible avec l'option `evaluator` de `search.js` ; formats `{ man:[50], king:[50] }` (V1) ou `{ phases:[{ minPieces, man, king }, …] }` (V1b : premier jeu dont `minPieces` ≤ nombre total de pièces ; 30 / 15 / 0). Valeurs entières (Int32Array, somme exacte, recherche déterministe), symétrie miroir exacte conservée dans les deux modes (testée sur 3 000 positions avec des tables aléatoires). Fichiers validés (longueur 50, nombres finis, phases décroissantes, dernière phase = 0). **Garde-fou de mat** : la borne exacte de |éval| (somme des 20 meilleurs apports par camp) doit rester ≤ 29 000, car la recherche réserve ±29 900 aux mats et range les scores de sa table de transposition sur 16 bits ; mesuré : V0 6 120, modèles appris 6 000 à 19 500.
- `training/arena.mjs` : `--evaluator learned:<fichier.json>` (et `--a` / `--b`) ; l'**identité du run (reprise) inclut l'empreinte SHA-1 du CONTENU** des tables (forme canonique : insensible à la mise en forme du fichier, sensible à une seule valeur modifiée) : modifier un fichier sous le même nom empêche de reprendre un run avec un autre évaluateur (testé). Les tables utilisées sont recopiées dans le dossier du run (`tables-a.json`).
- `training/fit.mjs` + `training/fit-lib.mjs` : l'apprentissage (Node pur, aucune dépendance) ; `training/models/` : les modèles (petits JSON d'entiers, non ignorés par git) ; `tests/eval-learned.mjs` (26 vérifications), `tests/fit.mjs` (25 vérifications, données synthétiques), `tests/arena.mjs` étendu (69 vérifications, dont `learned:`). `training/README.md` mis à jour (commandes).

### 3. Méthode d'apprentissage (`training/fit.mjs`, formules en tête de `fit-lib.mjs`)
- **Données** : `training/data/selfplay-nuit-1` (8 000 parties V0 contre V0, profondeur 8, 1 225 027 positions ; 2 668 victoires blanches, 2 749 nulles, 2 583 noires). Filtres : hors ouverture (déjà séparée), **positions calmes** (« prise disponible » = 0 : 236 943 écartées), **pas de mat** (|score| ≥ 29 000 : 31 504 écartées) → **956 580 positions** (dont 54 % issues de parties nulles, 54 % en finale de moins de 15 pièces : phases ≥ 30 / 15–29 / < 15 = 137 539 / 301 195 / 517 846). **Validation = 15 % des PARTIES** (1 198 parties, 146 602 positions), tirées par une fonction de hachage de (graine, numéro de partie), jamais des positions isolées.
- **Modèle** : eval = Σ x_k·θ_k (100 paramètres : table des pions, table des dames ; x_k ∈ {−1, 0, +1} contient la symétrie miroir) ; p = σ(eval / K_m) ; perte = entropie croisée ; régularisation L2 vers V0 : + α·Σ((θ_k − θ⁰_k)/100)². La perte est **convexe** : méthode de Newton (IRLS) avec recherche linéaire, 2 à 5 itérations, **déterministe** (aucun hasard hors la séparation des parties) ; les 6 modèles sont régénérés **identiques au bit près** par une seconde exécution. Les paramètres jamais observés (un pion blanc sur sa rangée de promotion…) restent exactement à V0.
- **Cible** : t = λ·résultat + (1 − λ)·σ(score de recherche / K_t), λ ∈ {0 ; 0,5 ; 1}. **K_t = 415,9 cp** : la température qui rend le score de recherche le mieux calibré sur les résultats (perte résultat contre σ(score/K), apprentissage 0,6647, validation 0,6674 ; « aucune information » = ln 2 = 0,6931). **K_m** (température du modèle) = **le meilleur K de V0 sur la validation, pour chaque λ** (410 / 474 / 555 cp) ; elle est FIGÉE pour le modèle appris, sinon l'échelle des tables n'est pas identifiable (tables × c et K × c donnent la même perte) et leurs valeurs perdraient leur sens en centipions. α ∈ {1e-6, 1e-5, 1e-4, 1e-3, 3e-3, 1e-2, 3e-2, 1e-1}, choisi sur la validation (1e-6 presque partout, 1e-5 pour λ = 1). V1b = trois ajustements indépendants (un par phase). Tables arrondies à l'entier, perte recalculée après arrondi.
- **Baseline obligatoire (perte de V0 sur la validation, avec son meilleur K_m)** et résultat des tables apprises (perte de validation ; l'information de V0 = perte « éval = 0 partout » − perte V0) :
  | λ | K_m | « éval = 0 » | **V0** | V1 | V1b | gain V1b | information de V0 |
  |---|---|---|---|---|---|---|---|
  | 0 | 410 | 0,69315 | **0,66692** | 0,66612 | 0,66592 | 0,0010 (+3,8 % de ce que V0 apporte) | 0,0262 |
  | 0,5 | 474 | 0,69315 | **0,67284** | 0,66755 | 0,66607 | 0,0068 (+33 %) | 0,0203 |
  | 1 | 555 | 0,69315 | **0,67793** | 0,66198 | 0,65602 | 0,0219 (+144 %) | 0,0152 |
  Lecture : plus la cible contient de résultats (λ grand), plus les tables apprises « expliquent » les résultats mieux que V0 (perte −0,016 à −0,022) ; pour λ = 0 la cible est le score de recherche de V0 lui-même, déjà bien approché par son évaluation statique (gain faible). **Les pertes de λ différents ne sont pas comparables entre elles et ne prédisent PAS la force de jeu** (voir §4) : c'est l'arène qui juge.

### 4. Mesures dans l'arène (seul juge) : candidat A contre V0 (B), même graine, ouvertures jouées deux fois couleurs inversées
Profondeur 6, **400 paires** (800 parties) par candidat, un match à la fois :
| Candidat | V / N / D de A | Score | **Elo (A − V0)** | IC 95 % | Décision |
|---|---|---|---|---|---|
| **V1b λ = 0** | 538 / 158 / 104 | 77,1 % | **+211** | +188 à +236 | **gardé, meilleur** |
| V1 λ = 0 | 461 / 170 / 169 | 68,3 % | +133 | +110 à +157 | gardé |
| V1b λ = 0,5 | 452 / 179 / 169 | 67,7 % | +128 | +107 à +151 | gardé |
| V1 λ = 0,5 | 368 / 206 / 226 | 58,9 % | +62 | +42 à +83 | gardé |
| V1b λ = 1 | 307 / 184 / 309 | 49,9 % | −1 | −22 à +20 | rejeté (non significatif) |
| V1 λ = 1 | 271 / 133 / 396 | 42,2 % | −55 | −78 à −32 | rejeté (PIRE que V0) |
- **Confirmation du meilleur (V1b λ = 0) à la profondeur 8, 150 paires** : 184 victoires, 68 nulles, 48 défaites = 72,7 % (IC 68,6 à 76,7 %), **+170 Elo (IC +136 à +207)**.
- **Mesure « propre »** : les matchs ci-dessus utilisaient la graine 1, celle de l'auto-jeu d'entraînement : les ouvertures des premières paires coïncident avec celles des premières parties d'entraînement (fuite minime : ≈ 400 positions de départ sur 956 580, mais évitable). Le meilleur candidat a donc été re-mesuré avec la graine 777 : profondeur 6, 400 paires : 538 victoires, 157 nulles, 105 défaites = 77,1 % (IC 74,6 à 79,5 %), **+211 Elo (IC +187 à +235)** ; profondeur 8, 150 paires : 187 / 67 / 46 = 73,5 % (IC 69,0 à 78,0 %), **+177 Elo (IC +139 à +220)** ; mêmes résultats qu'avec la graine 1 : aucune fuite mesurable.
- **Tour 2 de diagnostic** (V1b, profondeur 6, 400 paires ; rien n'était à corriger pour le meilleur, mais les échecs de λ = 1 méritaient une explication, et K_t une étude de sensibilité) :
  | Variante | Elo (A − V0) | IC 95 % | Ce que ça apprend |
  |---|---|---|---|
  | λ = 0, **K_t = 200** | +215 | +192 à +241 | K_t sans effet sur la force (même résultat que K_t = 416) |
  | λ = 0, **K_t = 800** | +217 | +192 à +245 | idem |
  | λ = 1, **α = 1e-3** (régularisation forte, imposée) | +56 | +35 à +78 | la régularisation choisie sur la validation (α = 1e-5) laissait les tables sur-ajustées au bruit des résultats : plus de V0 = mieux dans l'arène |
  | λ = 1, **chaque partie pèse pareil** (1/longueur) | +86 | +66 à +108 | les longues parties nulles (54 % des positions, finales de dames) dominaient l'apprentissage ; les rééquilibrer fait passer λ = 1 de −1 à +86 |
  | Ablation A1 (graine 777) : **V0 + seulement les pions de l'avant-dernière rangée** (cases 5 à 9) portés à 285 | +49 | +32 à +67 | une seule règle simple (« un pion à un pas de la promotion vaut presque une dame ») apporte environ un quart du gain |
  | Ablation A2 (graine 777) : V1b λ = 0 avec **la table des pions de la phase 0 remise à V0** | +179 | +157 à +203 | les valeurs étranges de la phase 0 ne nuisent pas ; elles aident plutôt (+211 avec elles, intervalles proches, non tranché) : l'essentiel du gain vient des phases 1 et 2 |
  Conclusions : (a) la cible « score de recherche » (λ = 0) est la meilleure et la plus stable ; (b) le résultat des parties (λ = 1) n'aide qu'avec une régularisation forte et/ou des parties pondérées à égalité, car les finales nulles longues le noient ; (c) les phases aident toujours (V1b > V1 à tous les λ : +78, +66, +54 Elo) ; (d) la perte de validation ne classe pas les candidats comme l'arène (λ = 1 a la meilleure perte et les pires résultats).

### 5. Tables apprises, en grilles 10×10 (contrôle de bon sens)
Valeurs en centipions, point de vue des Blancs, la rangée du haut est la rangée de promotion des Blancs (les Blancs montent vers le haut) ; les cases claires (jamais jouées) sont des points ; la 1re rangée des pions (cases 1 à 5, un pion blanc y serait déjà promu) n'est jamais observée : elle reste à la valeur V0. Symétrie : la table des Noirs est celle des Blancs retournée (pièce noire en i = pièce blanche en 49 − i), exacte par construction (testée).
```
V0 (référence) — PIONS
    ·  109    ·  109    ·  109    ·  109    ·  109
  134    ·  134    ·  134    ·  134    ·  134    ·
    ·  125    ·  127    ·  127    ·  127    ·  125
  119    ·  121    ·  124    ·  124    ·  119    ·
    ·  114    ·  119    ·  119    ·  116    ·  114
  110    ·  112    ·  115    ·  115    ·  110    ·
    ·  107    ·  112    ·  112    ·  109    ·  107
  104    ·  106    ·  106    ·  106    ·  104    ·
    ·  101    ·  101    ·  101    ·  101    ·  101
  106    ·  106    ·  106    ·  106    ·  106    ·
V0 (référence) — DAMES
    ·  300    ·  300    ·  300    ·  300    ·  300
  300    ·  300    ·  300    ·  300    ·  300    ·
    ·  300    ·  304    ·  304    ·  304    ·  300
  300    ·  304    ·  310    ·  310    ·  300    ·
    ·  300    ·  310    ·  310    ·  304    ·  300
  300    ·  304    ·  310    ·  310    ·  300    ·
    ·  300    ·  310    ·  310    ·  304    ·  300
  300    ·  304    ·  304    ·  304    ·  300    ·
    ·  300    ·  300    ·  300    ·  300    ·  300
  300    ·  300    ·  300    ·  300    ·  300    ·
bon sens : pion selon les rangées parcourues 0→9 : 106 101 105 109 112 116 121 126 134 109 ; dame : cœur 310, couronne 304, extérieur 300, bord 300

V1 λ=0 (un jeu) — PIONS
    ·  109    ·  109    ·  109    ·  109    ·  109
  173    ·  287    ·  270    ·  274    ·  286    ·
    ·  191    ·  163    ·  154    ·  152    ·  129
  113    ·  110    ·  110    ·  110    ·  114    ·
    ·  103    ·  100    ·  108    ·  111    ·  112
  111    ·  114    ·  115    ·  113    ·  109    ·
    ·  109    ·  114    ·  116    ·  113    ·  112
  111    ·  113    ·  115    ·  113    ·  110    ·
    ·  109    ·  112    ·  113    ·  112    ·  110
  116    ·  117    ·  117    ·  116    ·  119    ·
V1 λ=0 (un jeu) — DAMES
    ·  320    ·  324    ·  323    ·  321    ·  321
  313    ·  311    ·  307    ·  313    ·  327    ·
    ·  308    ·  310    ·  314    ·  315    ·  318
  323    ·  304    ·  302    ·  309    ·  308    ·
    ·  311    ·  295    ·  312    ·  314    ·  323
  319    ·  314    ·  307    ·  300    ·  308    ·
    ·  304    ·  308    ·  294    ·  308    ·  318
  314    ·  309    ·  309    ·  304    ·  306    ·
    ·  330    ·  304    ·  303    ·  305    ·  318
  323    ·  307    ·  324    ·  310    ·  316    ·
bon sens : pion selon les rangées parcourues 0→9 : 117 111 112 113 112 107 111 158 258 109 ; dame : cœur 303, couronne 310, extérieur 315, bord 319

V1b λ=0, phase 0 (≥ 30 pièces) — PIONS
    ·  109    ·  109    ·  109    ·  109    ·  109
  112    ·  101    ·  109    ·  113    ·  138    ·
    ·   45    ·   39    ·   25    ·   22    ·   77
   69    ·   18    ·   15    ·   21    ·   21    ·
    ·   55    ·   49    ·   42    ·   55    ·   70
   67    ·   69    ·   70    ·   66    ·   66    ·
    ·   67    ·   69    ·   69    ·   68    ·   68
   66    ·   67    ·   67    ·   67    ·   66    ·
    ·   63    ·   65    ·   65    ·   64    ·   64
   69    ·   67    ·   69    ·   69    ·   67    ·
V1b λ=0, phase 0 (≥ 30 pièces) — DAMES
    ·  310    ·  300    ·  279    ·  276    ·  300
  300    ·  300    ·  300    ·  300    ·  300    ·
    ·  300    ·  304    ·  304    ·  304    ·  300
  300    ·  304    ·  310    ·  310    ·  300    ·
    ·  300    ·  310    ·  310    ·  304    ·  300
  300    ·  304    ·  310    ·  310    ·  300    ·
    ·  300    ·  310    ·  310    ·  304    ·  300
  300    ·  304    ·  304    ·  304    ·  300    ·
    ·  300    ·  300    ·  300    ·  300    ·  300
  300    ·  300    ·  300    ·  300    ·  300    ·
bon sens : pion selon les rangées parcourues 0→9 : 68 64 67 68 68 54 29 42 115 109 ; dame : cœur 310, couronne 304, extérieur 299, bord 298

V1b λ=0, phase 1 (15 à 29 pièces) — PIONS
    ·  109    ·  109    ·  109    ·  109    ·  109
  128    ·  206    ·  158    ·  183    ·  205    ·
    ·  117    ·   75    ·   76    ·   82    ·  111
   95    ·   75    ·   66    ·   65    ·   87    ·
    ·   91    ·   90    ·   97    ·   99    ·  103
  102    ·  104    ·  106    ·  105    ·  101    ·
    ·   99    ·  105    ·  106    ·  103    ·  101
   99    ·  101    ·  104    ·  103    ·  100    ·
    ·   97    ·  100    ·  101    ·   99    ·   97
  101    ·  101    ·  103    ·  101    ·  102    ·
V1b λ=0, phase 1 (15 à 29 pièces) — DAMES
    ·  314    ·  290    ·  269    ·  251    ·  268
  314    ·  306    ·  283    ·  284    ·  313    ·
    ·  316    ·  310    ·  297    ·  338    ·  288
  315    ·  314    ·  312    ·  283    ·  301    ·
    ·  269    ·  284    ·  330    ·  301    ·  305
  313    ·  300    ·  319    ·  312    ·  307    ·
    ·  316    ·  299    ·  304    ·  308    ·  318
  317    ·  317    ·  302    ·  330    ·  335    ·
    ·  315    ·  332    ·  318    ·  288    ·  303
  300    ·  302    ·  327    ·  294    ·  316    ·
bon sens : pion selon les rangées parcourues 0→9 : 102 99 101 103 104 96 78 92 176 109 ; dame : cœur 305, couronne 312, extérieur 303, bord 300

V1b λ=0, phase 2 (< 15 pièces) — PIONS
    ·  109    ·  109    ·  109    ·  109    ·  109
  187    ·  294    ·  280    ·  283    ·  293    ·
    ·  204    ·  187    ·  174    ·  172    ·  133
  117    ·  132    ·  127    ·  125    ·  123    ·
    ·  106    ·  106    ·  113    ·  117    ·  111
  110    ·  115    ·  113    ·  111    ·  104    ·
    ·  104    ·  113    ·  114    ·  114    ·  114
  114    ·  117    ·  118    ·  115    ·  113    ·
    ·  111    ·  115    ·  119    ·  121    ·  116
  123    ·  132    ·  132    ·  129    ·  135    ·
V1b λ=0, phase 2 (< 15 pièces) — DAMES
    ·  320    ·  324    ·  327    ·  323    ·  323
  314    ·  312    ·  309    ·  315    ·  330    ·
    ·  310    ·  312    ·  315    ·  318    ·  320
  326    ·  306    ·  302    ·  311    ·  312    ·
    ·  316    ·  296    ·  313    ·  316    ·  326
  322    ·  316    ·  309    ·  301    ·  311    ·
    ·  306    ·  310    ·  295    ·  309    ·  319
  315    ·  311    ·  312    ·  304    ·  307    ·
    ·  332    ·  305    ·  307    ·  307    ·  319
  325    ·  311    ·  331    ·  316    ·  321    ·
bon sens : pion selon les rangées parcourues 0→9 : 130 116 115 112 111 111 125 174 267 109 ; dame : cœur 305, couronne 312, extérieur 318, bord 321
```
**Contrôle de bon sens (franc)** : (1) *pions avancés valorisés* : oui, mais surtout à l'extrême : un pion sur la rangée qui précède la promotion vaut ≈ 260-290 (V0 : 134), presque une dame ; en milieu de plateau les valeurs sont plates (≈ 100-130), sans la progression douce de V0 ; (2) *dames au centre* : NON : les tables de dames sont presque plates (≈ 295-335), sans préférence pour le centre (V1 : cœur 303, bord 319) ; V0 donnait +10 au centre ; (3) *symétrie* : exacte ; (4) la phase 0 (≥ 30 pièces) est peu informative (perte ≈ ln 2, gain de validation 4·10⁻⁴) : ses pions valent ≈ 65 au lieu de 105 et plusieurs cases avancées sont fortement dévaluées (≈ 15-45) : valeurs peu fiables, peut-être sans conséquence tant que cette phase est brève. Ce sont des tables « statistiques », pas des connaissances de joueur ; elles gagnent, mais ne sont pas élégantes.

### 6. Limites
- **Circularité** : les étiquettes viennent de la recherche de V0 (profondeur 8) : l'évaluation apprise ne peut que s'en rapprocher, ce qui donne à profondeur fixe un moteur plus fort (elle « voit » déjà une partie de la tactique) ; elle ne découvre pas de connaissance qui échappe à V0 à la profondeur 8.
- **Profondeur fixe, pas temps fixe** : toutes les mesures sont à profondeur égale ; à temps égal, la force est probablement un peu plus élevée encore (moins de nœuds à profondeur égale, évaluation plus rapide pour V1), non mesuré. Contre un adversaire autre que V0 (humain, autre moteur) : non mesuré.
- **Sélection sur la validation** : α est choisi sur la validation de perte (légèrement optimiste pour la perte annoncée) ; la force, elle, est mesurée par des parties séparées. Une partie des candidats (6 + 4) a été comparée aux mêmes ouvertures : le classement entre candidats proches (V1b λ = 0 / K_t 200 / K_t 800) n'est pas significatif.
- **Phases** : le choix du jeu de tables change brutalement quand le nombre de pièces franchit 30 ou 15 (une prise peut créer un saut d'évaluation) ; fonctionne en pratique, pas de transition douce.
- **Échelle** : les tables apprises ont un autre étalonnage que V0 (pion ≈ 65-130 selon la phase) ; la jauge de l'appli (BAR_SCALE_CP = 100, paliers d'avantage) est calibrée sur V0 : si V1b entrait un jour dans l'analyse de la liseuse, il faudrait recaler ces constantes ; l'appli n'utilise toujours que V0.
- Le modèle est linéaire par case : aucune notion de structure (pions solidaires, mobilité, tempo de finale) ; c'est la prochaine marge de progrès, et elle demande des caractéristiques nouvelles, pas plus de parties.

### 7. Débit et recommandation pour la nuit 2
Mesures d'auto-jeu avec **V1b λ = 0** (7 workers, exploration 0,08) : **profondeur 8 : 1 140 parties/h mesurées (95 parties en 5 min), 1 290 estimées d'après le temps moyen (19,6 s/partie), ≈ 200 000 positions/h** (V0 à la profondeur 8 : 870 parties/h → +31 à +48 % de vitesse) ; **profondeur 10 : ≈ 150 parties/h** (165 s/partie, 6 parties en 7 min).
**Recommandation** :
1. **Évaluateur** : `learned:training/models/v1b-l0.json` (V1b, λ = 0) : auto-jeu avec le meilleur moteur disponible, c'est la boucle « apprendre contre soi-même » (les positions viennent d'un moteur plus fort que V0).
2. **Profondeur 8** (la 10 ne donne que ≈ 150 parties/h : < 1 000 parties par nuit), **7 workers**, **8 000 parties ≈ 6 à 7 h (≈ 1,2 million de positions, ≈ 100 Mo)**, **`--seed 2`** (obligatoire : avec la graine 1, les ouvertures seraient celles de la nuit 1) :
   `node training/arena.mjs selfplay --evaluator learned:training/models/v1b-l0.json --depth 8 --games 8000 --seed 2 --out training/data/selfplay-nuit-2`
3. **Ensuite** (étape 3.3, rapide : < 1 min d'ajustement) : `node training/fit.mjs --data training/data/selfplay-nuit-2 --lambda 0,0.25 --phases 3 --game-weight 1 --tag n2` ; comparer le nouveau modèle à V1b λ = 0 (`--a learned:nouveau --b learned:training/models/v1b-l0.json`, profondeur 6, 400 paires, **graine différente de celle des données**, puis profondeur 8, 150 paires) ; ne garder que si l'IC est au-dessus de 0 Elo. Essayer aussi nuit 1 + nuit 2 réunies. Pour λ > 0, utiliser `--game-weight 1` (§4).
4. Les matchs d'évaluation se font avec une **graine différente** de celle de l'auto-jeu qui a servi à apprendre (consigne ajoutée au README).
5. À décider plus tard : brancher V1b dans l'analyse de la liseuse (gain de force et de vitesse, mais recalage de la jauge) ; ajouter des caractéristiques de structure (au-delà des tables) ; limites de finale FMJD 6.3/6.4 (restent non implémentées).

### 8. Tests et vitesse du moteur
Toute la suite Node est verte après les changements : perft 9, `diff` (48 383 positions), `perft-positions`, `worker`, `eval-symmetry`, `search-consistency`, `tactics` 20/20, `mate`, `match`, `worker-analyse`, `analysis-format`, `analysis-controller`, `repetition` (dont `golden-scores`, inchangé), nouveaux `eval-learned`, `fit`, et `arena` (69 vérifications). **Vitesse du moteur inchangée** (`search.js` n'est pas modifié à cette étape) : `search-perf` 723 k nœuds/s position initiale, 786 k / 857 k / 858 k milieux de partie, 1,06 M finale de pions, 1,10 M finale à dames, mêmes profondeurs atteintes qu'avant (11 / 12 / 9 / 10 / 13 / 11 avec table) ; `bench` 5,84 M / 12,45 M / 17,1 M nœuds/s (avant : 5,50 M / 11,8 M / 16,2 M). `tests/data/golden-scores.json` et `js/ai/eval.js` : non modifiés (`git status`).

### 9. Fichiers produits (rien de commité)
`js/ai/eval-learned.js`, `tests/eval-learned.mjs`, `tests/fit.mjs`, `training/fit.mjs`, `training/fit-lib.mjs`, `training/models/*.json` (modèles : `v1-l0`, `v1b-l0` (le meilleur), `v1-l05`, `v1b-l05`, `v1-l1`, `v1b-l1`, tour 2 `kt200-…`, `kt800-…`, `a1e3-…`, `gw1-…`, ablations `abl-…`, et les `fit-report.json`), modifs de `training/arena.mjs`, `training/game.mjs`, `training/jobs.mjs`, `training/README.md`, `tests/arena.mjs` ; données et journaux (ignorés par git) dans `training/data/` et `training/logs/`. Reproduire : `node training/fit.mjs --out training/models` (< 1 min ; mêmes fichiers au bit près).

## IA — Étage 3, Étape 3.3 : caractéristiques de STRUCTURE (V2) (20/10/2026) — NON commité ; trois mesures « À FAIRE APRÈS LA NUIT 2 »
**Résultat en bref.** Six familles de caractéristiques de structure ont été ajoutées à V1b (cible λ = 0, comme demandé) et mesurées dans l'arène contre V1b (profondeur 6, 400 paires, graine 777, 2 workers). **Une seule est retenue : F1 « connexité » : +43 Elo (IC 95 % +23 à +63)** ; sa réplication sur d'autres ouvertures (graine 999) donne **+20 (IC −1 à +41)**, soit **+31 (IC +17 à +46) sur les 800 paires**. Les trois autres testées (F4, F5, F6) sont non significatives (+7, +7, +9) ; F2 et F3 s'arrondissent à des poids nuls (non jouées). Un témoin (mêmes tables, signes de F1 inversés) perd **−58 Elo (IC −83 à −34, 271 paires sur 400, match interrompu)** : l'effet dépend du signe, ce n'est donc pas un simple hasard de départage. **Mais F1 coûte cher en vitesse** : évaluation ×4, −15 % de nœuds par seconde, **+35 % de nœuds à profondeur égale**, et **à 100 ms par recherche V1b atteint la profondeur 7,91 contre 7,61 pour F1** : le gain à profondeur fixe peut disparaître à temps égal (non mesuré : à faire après la nuit 2). **V1b reste donc le meilleur modèle VALIDÉ.** Rien n'est commité ni déployé ; `eval.js`, `search.js` et `golden-scores.json` sont inchangés.

### 0. À FAIRE APRÈS LA NUIT 2 (consigne : aucun match lourd tant qu'elle tourne)
La nuit 2 (V1b contre V1b, profondeur 8, graine 2, `training/data/selfplay-nuit-2`) n'est pas la mienne : à 13 h 02 elle en était à **1 398 / 8 000 parties, ≈ 730 parties/h** (ralentie par mes matchs et tests ; ≈ 9 h restantes soit vers 22 h à ce rythme, ≈ 19 h 30 si le PC lui est laissé). Dès que `training/data/selfplay-nuit-2/summary.json` existe :
1. **Réentraînement sur nuit 1 + nuit 2 et remesure** (les tables V1b d'abord, puis la famille F1 par-dessus) :
   `node training/fit.mjs --data training/data/selfplay-nuit-1,training/data/selfplay-nuit-2 --lambda 0 --phases 3 --tag n12 --grids none` puis
   `node training/fit.mjs --data training/data/selfplay-nuit-1,training/data/selfplay-nuit-2 --base training/models/n12-v1b-l0.json --families F1 --tag n12s --grids none`,
   puis matchs contre V1b (profondeur 6, 400 paires, graine 777) :
   `node training/arena.mjs match --a learned:training/models/n12-v1b-l0.json --b learned:training/models/v1b-l0.json --depth 6 --pairs 400 --seed 777 --workers 6 --out training/data/m33-n12-d6` (idem pour `n12s-F1.json`).
2. **Test à TEMPS ÉGAL** du meilleur contre V1b (200 paires ; `--time` = millisecondes par coup, la profondeur n'est qu'un plafond ; non reproductible, machine au repos, 6 workers) :
   `node training/arena.mjs match --a learned:training/models/s33-F1.json --b learned:training/models/v1b-l0.json --depth 30 --time 100 --pairs 200 --seed 777 --workers 6 --out training/data/m33-F1-t100`.
   Il vérifie si le surcoût d'évaluation mange le gain de F1 (voir §5 : tout laisse prévoir un résultat proche de 0).
3. **Confirmation du meilleur à la profondeur 8, 150 paires, graine 888**, contre V1b puis contre V0 « pour mémoire » :
   `node training/arena.mjs match --a learned:training/models/s33-F1.json --b learned:training/models/v1b-l0.json --depth 8 --pairs 150 --seed 888 --workers 6 --out training/data/m33-F1-d8-s888`
   (et `--b v0 --out training/data/m33-F1-d8-s888-v0`).
Optionnel, si le temps le permet : terminer le témoin `ctrl-F1-rev` (graine 777) et jouer le témoin `s33-F2` ; jouer les modèles d'exploration `x33-KFW` et `x33-KFWP` (§6). **Budget de candidats : 5 utilisés sur 8** (F5, F6, F1, F4, témoin) ; restent 3 (par exemple réentraînement n1 + n2, `x33-KFW`, `s33-F2`).

### 1. Ce qui a été construit
- **`js/ai/eval-learned.js` étendu** : chaque phase peut porter `features: { nom: poids entier }` ; éval = tables + Σ poids × (compteur Blancs − compteur Noirs), les Noirs étant traités comme les Blancs d'une position retournée : **symétrie miroir exacte**, **valeurs entières**, aucune génération de coups (compteurs sur le tableau fastboard). Garde-fou de mat étendu : la borne de |éval| devient (borne des tables) + Σ |poids| × maximum du compteur, et doit rester ≤ 29 000 (les modèles dépassant la borne sont refusés par l'évaluateur et signalés INVALIDES par l'apprentissage ; c'est le cas de la combinaison « toutes les caractéristiques » à poids appris sur les résultats, §6). Sans poids non nul, l'évaluateur est celui des tables seules (chemin inchangé). Refonte de l'évaluateur à **une seule passe** : V1b (3 phases) passe de ≈ 175 à ≈ 89 ns par position (×2 plus rapide, résultats identiques).
- **Les 10 caractéristiques** (toutes en différence Blancs − Noirs ; `max` = majorant utilisé pour la borne de mat) :
  | Nom | Définition | Famille | max |
  |---|---|---|---|
  | `sup` | pions SOUTENUS : une pièce alliée (pion ou dame) sur l'une des 2 cases juste derrière | F1 connexité | 20 |
  | `pair` | paires de pions alliés voisins en diagonale (comptées une fois) | F1 connexité | 40 |
  | `blocked` | pions BLOQUÉS : toutes leurs cases avant existantes sont occupées (par une pièce quelconque) | F2 blocage | 20 |
  | `free` | cases avant LIBRES des pions (0, 1 ou 2 par pion) | F3 mobilité | 40 |
  | `kmob` | mobilité des dames : cases vides le long des 4 diagonales jusqu'au premier obstacle | F3 mobilité | 360 |
  | `wing` | déséquilibre des ailes : \| pions colonnes 0-4 − pions colonnes 5-9 \| | F4 ailes | 20 |
  | `kvm` | dames Blancs × pions Noirs − dames Noirs × pions Blancs | F5 dames | 400 |
  | `fort` | une dame SEULE sur la grande diagonale (cases 5-46) face à 2 ou 3 pièces | F5 dames | 1 |
  | `promo` | pions à un pas de la promotion avec une case de promotion libre | F6 idée du jeu | 5 |
  | `isol` | pions ISOLÉS : aucune pièce alliée sur les 4 cases diagonales voisines | F6 idée du jeu | 20 |
  **Redondances (constat)** : seuls les compteurs NON linéaires en « pièce sur case » apportent quelque chose aux tables. Un nombre de pions par aile, de pions au centre, ou de dames sur la grande diagonale est une somme de valeurs par case : déjà dans les tables, donc non testé tel quel (j'ai testé `wing` = |écart|, non linéaire, et `fort` = interaction avec le matériel adverse). De même « pions ayant au moins une case avant libre » = nombre de pions − `blocked` : redondant avec F2 + tables ; F3 teste donc `free` (distingue 1 case de 2) et `kmob` (mobilité des dames : mesurée, coût élevé, §5). F6 = deux idées du jeu : `promo` (un pion à un pas de la promotion dont la case de promotion est libre est presque une dame, un pion bloqué non) et `isol` (un pion isolé ne peut être soutenu et est une cible).
- **Apprentissage** : `training/fit-struct.mjs` + `fit-struct-run.mjs`, appelés par `training/fit.mjs --families F1,…,F6 | --features a,b | --combo a,b [--freeze-tables] [--data dossier1,dossier2]` ; `training/bench-eval.mjs` (coût en ns par position et nœuds/s sur des positions réelles, mesures entrelacées) ; `training/README.md` mis à jour. Les caractéristiques de l'apprentissage et de l'évaluateur sont calculées par **la même fonction** (`computeFeatures`) : aucun écart possible ; un contrôle vérifie, pour chaque modèle écrit, que l'évaluateur réel redonne exactement les évaluations de l'ajustement (20 353 positions, 0 écart).

### 2. Méthode d'apprentissage (identique à l'étape 3.2, étendue)
Données : `selfplay-nuit-1` (956 580 positions calmes retenues, validation = 15 % des PARTIES, graine 1) ; cible λ = 0 : σ(score de recherche / K_t), **K_t = 415,9**, **K_m = 410,4** (meilleur K de V0 sur la validation, figé) ; Newton/IRLS déterministe ; L2 vers V1b (poids de structure ramenés vers 0) ; **ajustement CONJOINT** des tables et des poids (une caractéristique est corrélée à des sommes de tables). **Choix « poids global ou par phase » par la mesure** : on part de poids globaux et, pour chaque caractéristique, on garde un poids par phase seulement si la perte de validation baisse d'au moins 5·10⁻⁵ nat/position : **aucune caractéristique n'a franchi ce seuil, toutes sont globales** (meilleur candidat : `kvm` par phase, 2,1·10⁻⁵). α ∈ {10⁻⁶, 10⁻⁵, 10⁻⁴, 10⁻³} choisi sur la validation ; poids arrondis à l'entier, pertes recalculées avec les valeurs arrondies. **Pondération des parties** : uniforme (poids 1) ; le diagnostic de 3.2 (1/longueur utile pour les cibles contenant des résultats, λ > 0) ne concerne pas la cible « score de recherche » ; elle est utilisée au §6 (λ > 0). Reproductibilité : `tests/fit-struct.mjs` (deux exécutions du CLI : tous les fichiers identiques au bit près) ; V1b (base) retrouvé à 0,665917 de perte de validation, et le « témoin » (tables de V1b réajustées sans caractéristique) à 0,665917 (écart −4,5·10⁻⁷) : le réajustement seul ne change rien.

### 3. Résultats d'apprentissage : perte de validation (cible λ = 0, nat/position ; V1b = 0,665917)
| Famille | Poids appris (entiers, identiques dans les 3 phases) | Gain contre V1b | Borne de mat | Remarque |
|---|---|---|---|---|
| F1 `sup` + `pair` | sup +3, pair −3 | 4,6·10⁻⁶ | 6 634 | α 10⁻⁴ |
| F2 `blocked` | aucun (−0,24 avant arrondi) | 7·10⁻⁷ | 6 504 | tables ≤ 10 cp de V1b |
| F3 `free` + `kmob` | aucun (free +1,25, kmob −0,59 avant arrondi ; α 10⁻³ choisi) | 0 | 6 454 | modèle identique à V1b |
| F4 `wing` | wing −1 (−1,23 avant arrondi) | 3,3·10⁻⁶ | 6 474 | |
| F5 `kvm` + `fort` | kvm +16, fort +31 | **1,7·10⁻⁴** | 12 597 | tables jusqu'à 106 cp de V1b (cases rares) |
| F6 `promo` + `isol` | promo +112 (isol +0,26 → 0) | 6·10⁻⁵ | 7 068 | tables jusqu'à 108 cp de V1b |
**Lecture** : avec cette cible, les caractéristiques n'apportent presque rien (≤ 1,7·10⁻⁴, contre 1,0·10⁻³ pour le passage de V0 à V1b) : le score de recherche de V0 / V1b ne contient pas de structure que leur évaluation ne voit pas (§6). Seuls `kvm`/`fort` et `promo` sont mesurables.

### 4. Mesures dans l'arène (seul juge) : candidat A contre V1b (B), profondeur 6, 400 paires, graine 777, `--workers 2`, un match à la fois
| Candidat | V / N / D de A | Score | Elo (A − V1b) | IC 95 % | Décision |
|---|---|---|---|---|---|
| **F1** (sup +3, pair −3) | 328 / 242 / 230 | 56,1 % | **+43** | +23 à +63 | **retenu** |
| F1, **réplication graine 999** | 303 / 240 / 257 | 52,9 % | +20 | −1 à +41 | (même modèle, autres ouvertures) |
| F1, **poolé** graines 777 + 999 (800 paires) | 631 / 482 / 487 | 54,5 % | **+31** | +17 à +46 | effet positif, plus modeste que le premier chiffre |
| F4 (wing −1) | 285 / 247 / 268 | 51,1 % | +7 | −12 à +26 | rejeté (non significatif) |
| F5 (kvm +16, fort +31) | 289 / 238 / 273 | 51,0 % | +7 | −12 à +26 | rejeté (non significatif) |
| F6 (promo +112) | 289 / 243 / 268 | 51,3 % | +9 | −10 à +29 | rejeté (non significatif) |
| F2 (blocked) | non joué | | | | poids tous nuls : modèle ≈ V1b (tables ≤ 10 cp d'écart) |
| F3 (free, kmob) | non joué | | | | poids tous nuls : modèle IDENTIQUE à V1b |
| **Témoin `ctrl-F1-rev`** (tables de F1, signes inversés : sup −3, pair +3) | 148 / 156 / 238 | 41,7 % | **−58** | −83 à −34 | **271 paires sur 400 seulement (arrêt forcé par mon quota)** |
**Interprétation** (à confirmer) : les poids de F1 sont minuscules (±3 cp), et pourtant inverser leurs signes fait passer de +43 à −58 contre V1b (≈ 100 Elo d'écart) : ce n'est pas un artefact de « perturbation quelconque » mais un effet de structure. En regroupant par pion : F1 vaut 3·sup − 3·(pions alliés derrière) = **0 pour un pion soutenu par un seul pion, −3 pour un pion soutenu par DEUX pions (formation compacte en triangle), +3 pour un pion soutenu seulement par une dame** : F1 pénalise légèrement les formations trop compactes, le témoin les récompense. Une évaluation V1b « plate » (beaucoup d'égalités) laisse la recherche choisir arbitrairement entre positions équivalentes ; un petit terme de structure sert de DÉPARTAGE cohérent, d'où un effet sans rapport avec la petite taille des poids. **Limites du témoin** : interrompu à 271 paires (les paires les plus longues, donc plus souvent nulles, se terminent en dernier : l'échantillon partiel est peut-être biaisé vers les parties décisives) ; aucun témoin « perturbation aléatoire de même taille » ni `s33-F2` (tables réajustées sans caractéristique) n'a été joué.

### 5. Ce que F1 coûte en vitesse (mesures sur POSITIONS RÉELLES de l'auto-jeu, mesures entrelacées ; la machine était chargée par la nuit 2 : seuls les RAPPORTS comptent)
| Modèle | Évaluation (ns / position) | Rapport à V1b | Recherche (k nœuds/s, profondeur 7) | Rapport | Nœuds à la profondeur 7 |
|---|---|---|---|---|---|
| V1b (tables seules, 3 phases) | 123 | 1,00 | 682 | 1,00 | 121 k |
| **V2-F1** (sup, pair) | **494** | **4,03** | **582** | **0,85** | **164 k (+35 %)** |
| V2-F4 (wing) | 410 | 3,34 | 611 | 0,90 | 113 k |
| V2-F5 (kvm, fort) | 358 | 2,92 | 622 | 0,91 | 127 k |
| V2-F6 (promo) | 499 | 4,07 | 595 | 0,87 | 114 k |
| x33-KFW (kvm, fort, wing) | 425 | 3,47 | 604 | 0,88 | 137 k |
| x33-KFWP (7 caractéristiques) | 673 | 5,49 | 558 | 0,82 | 188 k |
- **Coût de chaque caractéristique prise seule** (machine au repos, positions aléatoires de 14 pièces en moyenne, base V1b = 87 ns) : `kvm` +147 ns, `fort` +151, `wing` +169, `pair` +184, `sup` +202, `free` +215, `blocked` +217, `isol` +227, `promo` +233, `kmob` +299 ; **les 10 ensemble : 627 ns** (7× V1b). Le surcoût se paie surtout en passes et en lectures de voisins, pas en arithmétique ; un chemin spécialisé `sup + pair` pourrait gagner un facteur ≈ 1,5 au mieux (les bitboards n'aideraient pas : le tableau fastboard doit d'abord être converti, une passe de 50 cases), donc pas de miracle à attendre.
- **Effet sur la recherche** : l'évaluation n'est qu'une part du temps d'un nœud, d'où seulement −15 % de nœuds/s pour F1 ; mais **à profondeur égale F1 visite 35 % de nœuds en plus** (moins d'évaluations égales, donc moins de coupures alpha-bêta) : **à 100 ms par recherche (40 positions réelles × 2 passages), profondeur moyenne atteinte : V1b 7,91 / 7,90, F1 7,61 / 7,63 (−0,3 coup), F5 7,79.** Un coup de profondeur valait ≈ +190 Elo à ces profondeurs (profondeur 8 contre 6 : +382 ; étape 3.1), donc −0,3 coup ≈ −55 Elo : **le gain de F1 à profondeur fixe (+31 à +43) risque d'être annulé à temps égal**, d'où le test du §0 (2).

### 6. Diagnostic : pourquoi si peu, et où est l'information
1. **La cible λ = 0 ne contient pas de structure.** Les étiquettes sont les scores de recherche de V0 / V1b : la recherche voit les tactiques, pas des préférences de formation que l'évaluation ignore. D'où des gains de perte ≤ 1,7·10⁻⁴ et des poids de 0 à ±3 cp, sauf `kvm`, `fort`, `promo`.
2. **Les résultats des parties, eux, en contiennent** (mesure de perte seulement, **non jouée dans l'arène**). En apprenant UNIQUEMENT les poids de structure avec les tables de V1b FIGÉES (`--freeze-tables`, parties pondérées 1/longueur, K_m = meilleur K de V1b : 233 cp pour λ = 0,5, 261 cp pour λ = 1 ; V1b = 0,639566 / 0,647706) :
   | Famille | Gain de perte λ = 0,5 | Poids (λ = 0,5) | Gain de perte λ = 1 |
   |---|---|---|---|
   | F5 `kvm`, `fort` | 3,0·10⁻³ | kvm +18, fort +137 | **8,2·10⁻³** (kvm +31, fort +255) |
   | F3 `free`, `kmob` | 2,0·10⁻³ | free +7 ; kmob −21 / +19 / −5 selon la phase (instable) | 7,5·10⁻³ |
   | F4 `wing` | 7,3·10⁻⁴ | wing −4 / −9 / −14 (pénalise le déséquilibre, de plus en plus en fin de partie) | 2,3·10⁻³ |
   | F1 `sup`, `pair` | 2,8·10⁻⁴ | sup +4 / +10 / +6, pair −3 | 1,0·10⁻³ |
   | F6 `promo`, `isol` | 3,1·10⁻⁴ | promo +52 / +155 / +57 | 8,8·10⁻⁴ |
   | F2 `blocked` | ≈ 0 | blocked +1 | 7·10⁻⁵ |
   | Toutes ensemble | **INVALIDE** (borne de mat 33 210 ; 62 051 à λ = 1) | | |
   | `x33-KFW` (kvm, fort, wing), λ = 0,5 | 3,2·10⁻³ | kvm +16, fort +133, wing −8 | |
   | `x33-KFWP` (kvm, fort, wing, sup, pair, promo, free), λ = 0,5 | 7,3·10⁻³ | borne 24 374 (valide) | |
   `fort` +137 à +255 dit que « une dame seule sur la grande diagonale contre 2-3 pièces » est presque nulle dans les parties (règles de répétition et des 25 coups appliquées dans l'arène, cohérent avec FMJD 6.3 non implémentée) : V1b surestime l'avantage matériel de ces finales.
3. **Les poids entiers masquent de petits effets** : F2 (−0,24), F3 (free +1,25, kmob −0,59 avant le choix de α) et F4 (−1,23) s'arrondissent à 0 ou ±1 ; or F1 montre que quelques centipions suffisent à départager. Une résolution plus fine (poids au quart de centipion avec troncature vers 0 de la somme, qui garde la symétrie exacte) n'a pas été essayée.
4. **Combinaison des retenues** : seule F1 est retenue ; la « combinaison » est donc F1 seule. Les familles non retenues (F4, F5, F6) ne sont PAS ajoutées par-dessus. Les modèles `x33-*` (poids appris sur les résultats) sont prêts mais non joués : ils testeraient l'hypothèse du point 2 dans l'arène.

### 7. Limites
- **Profondeur fixe uniquement** : le test à temps égal, la confirmation à la profondeur 8 (graine 888) et le réentraînement sur nuit 1 + nuit 2 sont à faire (§0). Les coûts du §5 ont été mesurés sur une machine chargée (nuit 2) : seuls les rapports sont fiables ; les valeurs « au repos » (87 / 627 ns) viennent de tests sur positions aléatoires.
- **F1 : effet modeste et dépendant des ouvertures** (+43 puis +20, poolé +31 [+17 ; +46]) ; interprétation par départage et par pénalité de formations compactes plausible mais non démontrée ; témoin partiel ; aucun test de dose (poids ±1 ou ±6).
- **Données de V0 (nuit 1)** : les poids ont été appris sur des parties V0 contre V0 ; la nuit 2 (V1b contre V1b) correspond mieux au moteur actuel.
- **Poids entiers** (pas de résolution sub-centipion), définitions simplifiées (`sup` compte aussi une dame derrière le pion ; `pair` ne compte que des pions ; `blocked` : toute pièce comme obstacle ; `fort` suppose la grande diagonale 5-46 et 2 ou 3 pièces adverses).
- Sélection d'α et du mode global / phase faite sur la validation (légèrement optimiste pour la perte annoncée) ; la force, elle, est mesurée par des parties séparées. Budget de candidats : 5 sur 8.
- Matchs réalisés avec `--workers 2` pendant que la nuit 2 tournait (elle en a été ralentie : ≈ 730 parties/h au lieu de ≈ 1 100).

### 8. Recommandation pour la suite
1. **Garder V1b comme référence** ; ne pas intégrer F1 (ni l'analyse de la liseuse, ni l'auto-jeu) avant le test à temps égal.
2. **Après la nuit 2** : réentraîner V1b sur nuit 1 + nuit 2 (probablement le meilleur usage de ces données, sans surcoût de vitesse), puis refaire F1 par-dessus et mesurer à temps égal.
3. Si F1 survit à temps égal : écrire un chemin spécialisé `sup + pair` (gain ≈ ×1,5 sur le coût), tester ses poids (dose : ±1, ±3, ±6) et sa variante « pénalité de la double protection » seule.
4. Si l'on veut des caractéristiques plus riches : les apprendre avec des cibles contenant les résultats, tables figées, parties pondérées (§6.2), en surveillant la borne de mat ; commencer par `x33-KFW` (3 poids, coût modéré) à temps égal.
5. À décider plus tard : résolution fractionnaire des poids ; limites de finale FMJD 6.3 / 6.4 (leur absence rend `fort` utile et les finales de dames de l'auto-jeu peu informatives).

### 9. Tests et fichiers
**Toute la suite Node est verte** (18 suites, relancées à 13 h 06, nuit 2 en cours : les écarts de VITESSE sont ignorés comme convenu) : `perft` 9, `diff` (aucune divergence), `perft-positions`, `worker`, `eval-symmetry`, `search-consistency`, `tactics` 20/20 (dont `golden-scores` via `repetition`), `mate`, `match`, `worker-analyse`, `analysis-format`, `analysis-controller`, `repetition`, `eval-learned`, `eval-structure` (nouveau), `fit`, `fit-struct` (nouveau), `arena`. Reproductibilité de `fit.mjs` au bit près : modèles V1/V1b de l'étape 3.2 régénérés identiques après l'extension multi-sources ; `tests/fit-struct.mjs` compare deux exécutions complètes du CLI.
Fichiers (non commités) : `js/ai/eval-learned.js` (modifié), `tests/eval-learned.mjs` (adapté), `tests/eval-structure.mjs` (nouveau : référence lente indépendante sur 6 000 positions dont 3 928 avec dames, symétrie miroir exacte sur 3 000 positions pour un jeu et pour 3 phases, formule explicite tables + Σ poids × caractéristiques, masques, borne de mat atteinte, format de fichier, vitesse), `tests/fit-struct.mjs` (nouveau : poids vrais retrouvés à 0,2 cp, choix global / par phase, cohérence évaluateur ↔ ajustement sur 21 000 positions, multi-sources, CLI reproductible au bit près), `training/fit-struct.mjs`, `training/fit-struct-run.mjs`, `training/fit-lib.mjs` (multi-sources), `training/fit.mjs`, `training/bench-eval.mjs`, `training/README.md`, `training/models/` : `s33-F1…F6.json`, `s33-fit-struct-report.json`, `x33-KFW.json`, `x33-KFWP.json`, `x33-fit-struct-report.json`, `ctrl-F1-rev.json`. Journaux et parties : `training/logs/` et `training/data/` (ignorés par git ; matchs `m33-*`). Reproduire les ajustements : `node training/fit.mjs --data training/data/selfplay-nuit-1 --base training/models/v1b-l0.json --families F1,F2,F3,F4,F5,F6 --tag s33 --grids none` (≈ 40 s ; mêmes fichiers au bit près).
