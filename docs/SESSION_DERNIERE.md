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


## IA — Étage 4, étape 4.1 : choisir le moteur d'analyse de l'appli, V0 ou V1b (20/10/2026) — commité sur `main` (`2be67c2`), validé à l'œil par Mickaël, rien déployé

**En deux mots.** L'analyse de la liseuse (touche A) peut maintenant tourner avec le moteur historique **V0** (par défaut : rien ne change à l'écran) ou avec **V1b**, l'évaluation apprise à l'étape 3.2 (+170 à +210 Elo contre V0 en match à profondeur fixe). Le choix se fait dans le menu 🎨, section « Moteur d'analyse », et il est mémorisé comme les autres réglages. **La jauge n'a pas été modifiée** : mesurée sur 1 140 positions réelles, elle se lit presque pareil avec V1b (§4). Dans le budget de l'appli (1,5 s), V1b atteint en moyenne la même profondeur que V0 (11,2 contre 11,2 sur 5 positions, avec 1 à 2 crans d'écart selon la position, §5). La nuit 2 n'a pas été touchée (aucun fichier de `training/` modifié, aucun match lancé).

### 1. Comment tester en 3 minutes
0. Serveur local : `python -m http.server 8934`, ouvrir `http://127.0.0.1:8934/index.html`, puis **Ctrl+Shift+R** (modules `.js` en cache).
1. Touche **A** (ou bouton « Analyse ») : score, jauge et « Évaluation indicative · profondeur N » (texte **inchangé** : c'est V0). Position de départ : meilleur coup **34-30** (profondeur 10 à 12 selon la vitesse de la machine).
2. Clic sur 🎨 → tout en bas, **« Moteur d'analyse »** → **V1b (appris)**. Le menu se ferme, l'analyse repart, la ligne devient « Évaluation indicative · profondeur 10 · **moteur V1b** » et le meilleur coup de la position de départ passe en général à **31-27**. Survole un choix : une infobulle l'explique.
3. Avance dans la partie (flèche →, molette) : l'analyse suit les coups avec V1b. Rechoisis **V0 (actuel)** : « moteur V1b » disparaît, 34-30 revient.
4. Choisis V1b puis **Ctrl+Shift+R** : le choix est mémorisé (V1b coché dans 🎨). L'analyse, elle, est coupée au lancement, comme avant (jamais mémorisée).
5. (Cas d'échec, optionnel) Renomme `data/models/v1b-l0.json` (par exemple en `.bak`), recharge, choisis V1b, coupe puis relance l'analyse (A, A) : toast rouge « Le moteur V1b n'a pas pu démarrer : retour au moteur V0. », l'analyse continue en V0, 🎨 coche V0, le choix MÉMORISÉ reste V1b. Remets le fichier.
6. Tests : `node tests/engine-select.mjs` (58 vérifications, ≈ 8 s). Mesures (pas des tests) : `node tests/gauge-calibration.mjs --n 900 --depth 8` (≈ 2,5 min), `node tests/bench-engines.mjs` (≈ 3 min).

Vérifié dans le navigateur (Chrome, http://127.0.0.1:8934, console sans erreur) : menu à 2 choix sur une ligne chacun ; V0 par défaut sans « moteur » dans la ligne ; bascule V0 → V1b → V0 avec relance de l'analyse ; choix restauré après rechargement et analyse coupée au lancement ; V1b qui suit 3 coups de suite (31-27 → 19-23 → 12-18, profondeurs 10-11) ; repli sur V0 avec fichier du modèle absent (404) puis retour à V1b une fois le fichier remis. Le visuel (menu, longueur de la ligne « … · moteur V1b » en thème clair) a été validé à l'œil par Mickaël.

### 2. Ce qui a été fait
| Fichier | Rôle |
|---|---|
| `js/ai/engines.js` (nouveau) | La liste des moteurs (`ENGINES`, libellés du menu), `DEFAULT_ENGINE = 'v0'`, **`V1B_MODEL_PATH = 'data/models/v1b-l0.json'` : l'UNIQUE constante du chemin du modèle**, `isEngineId()` (valide un nom mémorisé, `Object.hasOwn`), `loadEvaluator(moteur)` : promesse d'un évaluateur (V1b : lecture du fichier + `createTableEvaluator` de `eval-learned.js`, **une seule fois par Worker**) ou de `null` pour V0. Lecture : `fetch` dans le navigateur (`cache: 'no-cache'`, revalidé), disque sous Node. Un échec n'est pas mémorisé. |
| `data/models/v1b-l0.json` (nouveau) | **Copie octet pour octet** de `training/models/v1b-l0.json` (1 587 octets) ; un test vérifie l'identité. Le script `deploy.ps1` copie déjà tout `data/` (récursif) : le modèle part avec le site. |
| `js/ai/worker.js` | `options.engine` du message `analyse` : absent ou `'v0'` = AUCUN évaluateur injecté (exactement la recherche d'avant) ; `'v1b'` = évaluateur du modèle passé à `analyse(pos, { evaluator })` ; moteur inconnu ou modèle illisible = réponse `{ ok: false, error }`. `runMessage(msg, post, deps)` : chargeur injectable pour les tests. |
| `js/ai/analysis-controller.js` | Option `engine`, getter `engine`, `setEngine(id)` (relance la dernière position demandée avec le nouveau moteur ; analyse en cours = Worker détruit, comme pour un changement de position ; moteur inconnu = erreur). `options.engine` n'est envoyé que pour V1b (message de V0 identique à celui d'avant). Les événements `error` portent maintenant le texte de l'erreur (`error`). |
| `js/ai/analysis-format.js` | `formatMeta(result, engineName)` : « … · moteur V1b » ajouté seulement si un nom est donné (V0 : texte inchangé). |
| `js/main.js` + `index.html` | Section « Moteur d'analyse » du menu 🎨 (même mécanisme `renderThemeOptions` que damier/pions), clé **`damika:analysis-engine`** (`v0` / `v1b`), lue AVANT la création du contrôleur, absente ou invalide = V0, accès en `try/catch`. Repli : si un moteur autre que V0 échoue, `setEngine('v0')` + toast + `console.warn` (raison technique) ; le choix mémorisé n'est PAS modifié (un échec passager ne fait pas perdre le choix) et le menu coche le moteur réellement utilisé. Infobulles (`hint`) sur les choix. |
| `tests/engine-select.mjs` (nouveau) | 58 vérifications (§6). |
| `tests/gauge-calibration.mjs`, `tests/bench-engines.mjs` (nouveaux) | Outils de mesure (§4, §5), relançables après un réentraînement de V1b. |

Interdits respectés : `js/ai/search.js`, `fastboard.js`, `eval.js`, `eval-learned.js` et `training/*` NON modifiés (côté code, `git status` ne montre que `index.html`, `js/main.js`, `js/ai/{analysis-controller,analysis-format,worker}.js` modifiés, et `js/ai/engines.js`, `data/models/` et 3 fichiers de `tests/` nouveaux).
**Pas de contamination entre moteurs dans un même Worker** : la table de transposition est vidée au début de chaque analyse (`search.js`), et le test C2 alterne V0 → V1b → V0 → V1b sur la même position avec des résultats reproductibles au bit près.

### 3. Pourquoi ces choix (points à connaître)
- **Menu 🎨 plutôt qu'un sélecteur dans la plaque d'analyse** : même mécanisme et même rendu que les autres réglages persistés, aucun CSS neuf ; l'infobulle du bouton devient « Damier, pions et moteur d'analyse ».
- **Libellés courts** (« V0 (actuel) », « V1b (appris) ») : la première version (« V1b — évaluation apprise ») passait sur deux lignes dans le menu étroit (vu en capture). L'explication est dans l'infobulle.
- **Le choix reste le choix de l'utilisateur après un repli** : après un échec de V1b on analyse en V0 pour cette session seulement. Si le fichier manque durablement, le toast revient à chaque lancement de l'analyse : c'est voulu, c'est une panne à réparer, pas un état à masquer.
- **Le modèle se recharge à chaque création d'un Worker** (le Worker est détruit quand on change de position pendant un calcul) : fichier de 1,5 ko revalidé (`no-cache`), surcoût mesuré sous Node ≈ 4 ms (§5.C) ; dans le navigateur c'est une requête HTTP conditionnelle, non mesurée.

### 4. Calibration de la jauge : un petit écart mesuré, aucun changement de réglage
**Question.** `BAR_SCALE_CP = 100` et les paliers d'avantage ont été réglés en regardant des scores de V0. V1b affiche-t-il des scores sur la même échelle ?
**Méthode** (`tests/gauge-calibration.mjs`, lecture seule des parties d'auto-jeu de la nuit 1) : positions tirées au hasard, **un tiers d'ouvertures (≥ 30 pièces), un tiers de milieux de partie (15 à 29), un tiers de finales (< 15)** ; chaque position analysée à **profondeur FIXE** avec V0 puis V1b (même recherche, résultat indépendant de la vitesse de la machine) ; comparaison de l'échelle (rapport des moyennes quadratiques, pente), de ce que l'utilisateur voit (palier, niveau de lumière, écart de part de blanc de la barre) et de l'échelle K de P(victoire) = 1/(1 + e^(−score/K)) ajustée sur les résultats des parties. Intervalles à 95 % par rééchantillonnage **par partie**. Deux échantillons indépendants : profondeur 8 (900 positions, 301 parties, graine 4141) et profondeur 10 (240 positions, 80 parties, graine 5151).

| | Profondeur 8 (900 positions) | Profondeur 10 (240 positions) |
|---|---|---|
| **Rapport d'échelle V1b / V0, toutes positions** | **1,11** [1,10 ; 1,13] | **1,06** [1,02 ; 1,09] |
| — ouvertures (V0 33 cp, V1b 29 cp de moyenne quadratique) | 0,86 [0,79 ; 0,93] | 0,82 [0,59 ; 0,96] |
| — milieux de partie | 1,04 [1,00 ; 1,10] | 1,08 [0,98 ; 1,19] |
| — finales | 1,12 [1,11 ; 1,14] | 1,06 [1,02 ; 1,09] |
| Corrélation des scores V0 / V1b | 0,99 | 0,99 |
| **Même palier affiché** (nom + camp) | **86,1 %** (ouv. 90,7 · milieu 88,0 · finale 79,7) | **89,2 %** (96,3 · 86,3 · 85,0) |
| Même camp en avantage | 94,2 % | 94,6 % |
| Niveaux de lumière à 2 crans ou plus d'écart | 3,0 % | 2,5 % |
| Écart de part de blanc de la barre : médiane / 90 % sous / maximum | 1,2 % / 6,3 % / 33,8 % | 1,1 % / 3,8 % / 13,6 % |
| Mats annoncés (V0 et V1b d'accord sur le vainqueur ET la distance) | 41 sur 41 (4,6 % des positions) | 12 sur 12 (5,0 %) |
| **K (cp par e-fold) pour prédire le résultat** : V0 → V1b, rapport | 129 → 137 : **1,06** [1,02 ; 1,10] | 216 → 221 : **1,02** [0,96 ; 1,08] |

**Lecture.**
- **L'écart existe mais il est petit et change de signe selon la phase** : V1b affiche des scores **≈ 15 % plus petits en ouverture** (là où tout est près de zéro : moyenne quadratique de 0,3 pion, presque toujours dans la bande « égal ») et **6 à 12 % plus grands en finale**. C'est cohérent avec les valeurs de pion apprises par V1b, qui varient par phase (≈ 65 cp en ouverture, ≈ 130 en finale, contre 100 pour V0 : étape 3.2).
- **Ce que voit l'utilisateur** : 86 à 89 % des positions tombent dans le même palier, 94 à 95 % désignent le même camp, la barre bouge de 1 % en médiane. Les écarts de palier sont des positions voisines d'un seuil (0,5 / 0,7 / 0,9 / 1,5 / 2).
- **Prédiction des résultats** : à écart d'un centipion égal, V1b prédit l'issue des parties comme V0 (rapport de K de 1,02 à 1,06). L'échelle de V1b n'est donc pas « fausse » ; les pions de V1b valent simplement un peu moins en ouverture.
- **Aucun réglage unique ne corrige l'écart.** Test : multiplier les scores de V1b par un facteur f avant l'affichage et mesurer l'accord de palier avec V0 : profondeur 8 : f = 0,80 → 81,7 % ; 0,90 → 86,0 % ; **0,95 → 86,1 %** ; **1,00 → 86,1 %** ; 1,10 → 84,7 % ; 1,20 → 82,3 % (profondeur 10 : 85,8 / 88,8 / 88,8 / **89,2** / 85,4 / 82,9 %). L'optimum est à f ≈ 0,95 à 1,0, sans gain mesurable (écart moyen de barre 2,39 contre 2,46 point de pourcentage) : **un facteur par moteur n'apporterait rien**, et un facteur par phase fausserait la continuité d'une position à l'autre.
**Décision.** Critère retenu : ne toucher à l'échelle que si un facteur d'affichage unique améliore nettement l'accord de palier avec V0. Ce n'est pas le cas : le meilleur facteur (≈ 0,95 à 1,0) n'apporte rien, et l'écart change de signe selon la phase (un facteur de 0,90 améliore les finales, 79,7 → 82,3 %, mais dégrade les milieux de partie, 88,0 → 83,7 % : bilan nul). `BAR_SCALE_CP` (100), `ADVANTAGE_TIERS` et `BIG_SWING` (0,20) restent donc **inchangés**, pour V0 comme pour V1b ; l'écart mesuré est consigné ici. Le rapport global de 1,11 à la profondeur 8 est à la limite de ±10 % (borne basse de l'intervalle à 1,10) ; il vient des finales, et il tombe à 1,06 à la profondeur 10. À refaire avec `tests/gauge-calibration.mjs` si V1b est réentraîné (le réentraînement sur nuit 1 + nuit 2 est en attente) ou si l'échelle de la jauge change.

### 5. Temps d'analyse V0 / V1b dans le Worker (5 positions, `tests/bench-engines.mjs`)
Fil réel `worker_threads` (le vrai `js/ai/worker.js`), 5 positions de parties d'auto-jeu écrites en dur dans le script (ouverture 38 pièces, 32, milieu 24, 16 avec une dame, finale à dames 8), mesures V0 / V1b **entrelacées** (l'ordre alterne), médiane. **Machine chargée par la nuit 2 : seuls les rapports comptent.**

| Profondeur fixe 10 (3 répétitions) | V0 | V1b | V1b / V0 | Nœuds V0 → V1b |
|---|---|---|---|---|
| ouverture (38) | 319 ms | 281 ms | 0,88 | 125 k → 112 k |
| début de milieu (32) | 590 ms | 516 ms | 0,87 | 299 k → 255 k |
| milieu (24) | 243 ms | 987 ms | **4,06** | 108 k → 600 k (×5,6) |
| fin de milieu, 1 dame (16) | 308 ms | 359 ms | 1,16 | 160 k → 199 k |
| finale à dames (8) | 225 ms | 293 ms | 1,30 | 111 k → 153 k |
| **Total des 5** | 1 685 ms | 2 435 ms | **1,45** | 802 k → 1 320 k (×1,65) |
| Nœuds par seconde (total) | 476 k | 542 k | 1,14 : V1b est **plus rapide par nœud** | |

- **Profondeur fixe 8** : total 667 ms → 746 ms (×1,12) ; nœuds 155 k → 220 k (×1,42). À cette profondeur le temps contient un surcoût fixe de l'ordre de 50 ms (cessions de la main du Worker entre deux profondeurs, identiques pour les deux moteurs) : lire plutôt les nœuds et la profondeur 10.
- **Budget réel de l'appli (1,5 s, profondeur max 24, 5 répétitions)** : profondeur atteinte, V0 / V1b : 12 / 12, 10 / 11, 12 / **10**, 11 / 11, 11 / 12, **moyenne 11,2 contre 11,2**. Dans l'usage réel V1b va donc aussi loin que V0 en moyenne, mais **pas partout** : à égalité de profondeur son arbre est parfois bien plus gros (position à 24 pièces : ×5,6 de nœuds à la profondeur 10, soit 2 crans de profondeur de moins en 1,5 s).
- **Pourquoi** : l'évaluation de V1b a moins d'égalités que celle de V0 (tables apprises, valeurs plus fines), donc moins de coupures alpha-bêta ; même mécanisme que pour F1 à l'étape 3.3. Compensé en moyenne par une évaluation 2 fois plus rapide.
- **Démarrage à froid d'un Worker neuf** (aller-retour d'une analyse de profondeur 1, médiane de 7) : V0 4,4 ms, V1b 8,3 ms → **chargement du modèle ≈ 4 ms** (disque ; dans le navigateur, une requête HTTP conditionnelle d'1,5 ko).
- **Limites de la mesure** : 5 positions seulement ; le rapport de temps varie de 0,87 à 4,06 selon la position : ne pas en tirer un « V1b est x % plus lent ». La profondeur atteinte en 1,5 s est discrète (un cran = ×1,5 à ×2 de travail).

### 6. Tests
- **`node tests/engine-select.mjs` : 58 vérifications, toutes OK, ≈ 8 s.** A : V0 par le Worker, **sans option puis avec `engine:'v0'`, 60 positions sur 60 identiques à `tests/data/golden-scores.json`** (score, mat, meilleur coup, profondeur 7). B : V1b se charge depuis la constante, une seule fois (même évaluateur au second appel), V0 ne lit aucun fichier, `data/models/v1b-l0.json` identique octet pour octet à `training/models/v1b-l0.json`, évaluateur chargé = évaluateur construit à partir du fichier d'entraînement (3 000 positions), moteurs inconnus refusés (`v2`, `toString`, `__proto__`, `V1B`, vide, `null`, 42), modèles invalides refusés (tables incomplètes, borne de mat dépassée, fichier introuvable) sans casser le chargement suivant, **symétrie miroir exacte de l'évaluateur (6 000 positions) et de la recherche (profondeur 3, 150 positions)**, **scores bornés** (borne exacte du modèle 6 454 ≤ 29 000 ; maximum observé 4 850 sur 24 000 positions dont extrêmes ; recherche profondeur 5 sur 80 positions : 60 scores sous la borne, 20 mats nettement au-dessus). C : le Worker avec V1b donne exactement `analyseSync` avec l'évaluateur du fichier (12 positions : score, mat, coup, ligne, nombre de nœuds), l'option change vraiment les scores (9 positions sur 12 différentes de V0), alternance V0 / V1b reproductible, erreurs claires (moteur inconnu, modèle introuvable), progression à chaque profondeur. D : contrôleur (message de V0 sans clé `engine`, `setEngine` avec ou sans analyse en cours, position et historique conservés, réponses périmées ignorées, analyse coupée, erreur transmise, repli sur V0). E : vrai fil `worker_threads` (V0, V1b, moteur inconnu). F : ligne « Évaluation indicative… » inchangée pour V0, « · moteur V1b » pour V1b.
- **Suites existantes relancées sur le code final, toutes vertes** : `worker`, `worker-analyse`, `analysis-controller`, `analysis-format`, `repetition` (golden inclus), `eval-learned` (et, en cours de route, `eval-symmetry`, `tactics` 20/20, `mate`). `search.js`, `eval.js`, `fastboard.js` n'ayant pas bougé, les autres suites (perft, diff, search-consistency…) ne sont pas concernées et n'ont pas été relancées pour ne pas charger la machine pendant la nuit 2.
- Pas de test automatique de l'interface (convention du projet) : menu et repli vérifiés à la main dans le navigateur (§1).

### 7. Limites et points de vigilance
- **Positions de la calibration** : parties d'auto-jeu V0 contre V0 (nuit 1), pas des parties humaines ; la bibliothèque de test locale ne contient que des parties de 4 à 16 demi-coups, inutilisables. Les parties démarrent par 8 demi-coups tirés au hasard dans une fourchette de 0,5 pion, et les positions de la calibration sont prises à partir du 9e demi-coup. Le rapport par phase est donc fiable, la répartition des phases dans l'usage réel pourra différer.
- **V1b a été appris sur les parties de V0** (nuit 1). Le réentraînement sur nuit 1 + nuit 2 (en attente de la fin de la nuit 2) changera les tables : **si le modèle de l'appli est remplacé, copier le nouveau fichier dans `data/models/`, mettre à jour `V1B_MODEL_PATH`, la ligne de comparaison de `tests/engine-select.mjs`, puis relancer `tests/gauge-calibration.mjs`**.
- **Taille d'arbre de V1b irrégulière** (jusqu'à ×5,6 de nœuds sur une des 5 positions) : l'analyse peut y être de 1 à 2 crans moins profonde qu'avec V0 dans le budget de 1,5 s. À surveiller à l'usage ; une piste (non faite) est de départager les égalités de V0 dans le tri des coups ou d'allonger le budget pour V1b.
- **Le service worker reste désactivé** et sa liste `ASSETS` (déjà obsolète : pas de `js/ai/*.js`) devra recevoir `js/ai/engines.js` et `data/models/v1b-l0.json` au moment de sa réactivation (backlog n° 3).
- **Commité sur `main` (`2be67c2`), rien déployé.** `data/models/` est suivi par git. Le déploiement (`deploy.ps1`) copie `data/` en entier.

### 8. Fichiers (commités) et suite
Modifiés : `index.html`, `js/main.js`, `js/ai/analysis-controller.js`, `js/ai/analysis-format.js`, `js/ai/worker.js`, `docs/SESSION_DERNIERE.md` (cette section), `CLAUDE.md` (clé `damika:analysis-engine`, structure, tests). Nouveaux : `js/ai/engines.js`, `data/models/v1b-l0.json`, `tests/engine-select.mjs`, `tests/gauge-calibration.mjs`, `tests/bench-engines.mjs`. Commités par chemins (`2be67c2`) après la validation visuelle de Mickaël ; `js/main.js` a été découpé hunk par hunk entre ce commit et celui du lot de corrections.
**Suite** : (1) fait : le menu et la ligne « moteur V1b » ont été validés à l'œil par Mickaël ; (2) après la nuit 2 : les trois mesures de l'étape 3.3, puis réentraînement de V1b et remesure de la jauge (`tests/gauge-calibration.mjs`) ; (3) décider si V1b devient le moteur par défaut de l'analyse (aujourd'hui V0 par défaut : à discuter une fois le réentraînement fait et le comportement d'arbre mieux compris).


## Lot corrections 20/10/2026 — 4 points de l'appli — commité sur `main` (`c5313b2`), validé à l'œil par Mickaël, rien déployé

**Statut** : validé à l'œil par Mickaël. Les rubriques « À valider à l'œil » ci-dessous consignent ce qui était à regarder ; ce que je n'ai pas pu tester moi-même (un vrai téléphone) y reste dit tel quel.

Interdits respectés : aucun fichier de `training/`, `js/ai/search.js`, `fastboard.js`, `eval.js`, `eval-learned.js`, `js/engine/rules.js`, `data/models/` n'a été touché par ce lot ; aucun match, aucun réentraînement, aucun gros calcul (seuls des tests de quelques secondes et des essais navigateur sur `http://127.0.0.1:8934`, serveur arrêté ensuite, réglages et bibliothèque de test du navigateur remis comme avant).
Les quatre points figuraient au backlog (`CLAUDE.md`, `docs/SESSION_DERNIERE.md`). Point 3 : le backlog n'a qu'UN bug de suppression de photo (« Retirer la photo sans effet si la photo vient d'une correspondance floue ») : c'est celui que j'ai traité, voir plus bas.

### Point 1 — Lien de partage par QR : écran noir sur téléphone
- **Reproduit** (pas sur un vrai téléphone : dans un `<iframe>` de 390×844 px, même origine, thème sombre = le thème par défaut) : la page se charge, la partie partagée est bien importée (toast « Partie importée (92 coups) »), mais l'écran n'affiche que la barre du haut sur un grand fond sombre vide. **Le lien n'y est pour rien** : la page ouverte SANS `?p=` donne exactement le même écran. Le lien de partage est simplement la façon dont le problème a été vu (on ouvre le QR avec le téléphone, jamais autrement).
- **Cause** : sous 900 px, le gabarit pensé pour 3 colonnes restait actif. `#app` (100dvh, `overflow: hidden`) coupait tout ce qui dépassait ; le rail des joueurs (4 cartes sur UNE seule rangée) faisait 700 px de haut ; le panneau latéral était écrasé à 2 px ; `BoardRenderer.resize()` retirait de la largeur du damier celle du rail et du panneau, donc plancher de 280 px ; et `alignLayout()` (alignements pensés pour les colonnes côte à côte) décalait le damier de ≈ 400 px vers le bas, hors de l'écran, sans possibilité de défiler. Vide noir en thème sombre, beige en thème clair.
- **Correction** (plus petit changement qui rend la page utilisable ; pas le chantier Mobile) : (a) `css/style.css`, dernier bloc `@media (max-width: 900px)` : la page défile (`#app { height: auto; overflow-x: clip }`), rail avec retour à la ligne (méta en pleine largeur, puis Noirs · score · Blancs), commandes et barre du haut qui passent à la ligne, panneau de coups à 60vh, `html, body { height: auto }` ; (b) `js/render/board.js` : en colonne le damier prend toute la largeur de l'écran (341 px sur 390 au lieu de 280), sans limite de hauteur ; (c) `js/main.js` : `alignLayout()` ne décale plus rien en colonne. La colonne est détectée par `getComputedStyle(.layout).flexDirection === 'column'`, donc **aucun seuil de 900 px dupliqué en JS** ; au-dessus de 900 px rien ne change (vérifié à 1100 et 1440 px : décalages et jauge en place, `#app` en `overflow: hidden`).
- **Mesuré après correction** (iframes de 360×640, 390×844, 768×1000, 900, thèmes sombre et clair, analyse active) : aucun défilement horizontal, damier 311 à 851 px selon la largeur, panneau de coups visible sous le damier, analyse et score affichés.
- **Test en 1 minute** : Chrome → F12 → Ctrl+Maj+M (mode appareil), 390×844 ; ouvrir `http://localhost:8934/index.html` : le damier doit apparaître sous les cartes joueurs (défiler). Pour le lien : Exporter → Partager, copier le lien, l'ouvrir dans un autre onglet en mode appareil. Pour le VRAI QR : le QR reprend l'adresse de la page où on le fabrique ; sur le PC ouvrir la page par l'adresse du PC (`http://<IP du PC>:8934/…`, serveur lancé avec `python -m http.server 8934 --bind 0.0.0.0`, pare-feu Windows à autoriser) ou la version en ligne, puis scanner. **Un QR fabriqué depuis `localhost` pointe vers `localhost` : le téléphone ne peut pas l'ouvrir** (page d'erreur, pas un écran noir).
- **À valider à l'œil** : sur un vrai téléphone (je n'en ai pas ; l'iframe reproduit la largeur, pas le comportement tactile ni la barre d'adresse). Réserves visibles, non traitées (chantier Mobile) : barre du haut sur 3 rangées (≈ 210 px avant le contenu), cartes joueurs hautes (le damier démarre à ≈ 600 px : il faut défiler), `touch-action: none` sur le damier (un glissement du doigt SUR le damier ne fait pas défiler la page), `overflow-x: clip` ignoré avant iOS 16 (sans effet visible : rien ne déborde), zone 901 à ≈ 1050 px où la mise en page à 3 colonnes déborde (damier au plancher de 280 px ; hors du périmètre demandé).

### Point 2 — Ordre de la liste « Récentes »
- **Cause** (bug connu, confirmé) : `renderLibrary()` calculait bien `visibleIndexes` trié « plus récent d'abord », puis parcourait `library` dans son ordre d'origine (`library.forEach` + `visibleIndexes.includes(idx)`) : l'ordre calculé n'était jamais appliqué.
- **Correction** : le filtre et le tri sortent dans une fonction pure `libraryVisibleOrder()` (`js/library-view.js`), et `renderLibrary()` parcourt maintenant le tableau qu'elle renvoie (`visibleIndexes.forEach`). Les vues « Toutes » et « Favoris » gardent l'ordre de la bibliothèque ; les empreintes (coûteuses) ne sont calculées que pour « Récentes » et « Favoris », une fois par partie.
- **Test automatique** : `node tests/library-order.mjs` (13 vérifications : plus récent d'abord, ouverture à l'instant = en tête, Toutes / Favoris inchangées, recherche combinée, parties jumelles, nombre d'empreintes). Vérifié aussi dans le navigateur : parties ouvertes dans l'ordre C, A, B → « Récentes » affiche B, A, C (puis les anciennes récentes) ; les numéros de carte restent ceux de la bibliothèque complète (4, 3, 5…), « Toutes » retrouve son ordre.
- **Test en 1 minute** : onglet Bibliothèque, ouvrir (clic sur la carte) la partie 3, puis la 1, puis la 2 ; clic sur « Récentes » : 2, 1, 3 en haut de la liste.
- **Constat en testant, NON corrigé (hors périmètre, à décider)** : « Récentes » et « Favoris » identifient une partie par une empreinte de son CONTENU. **Modifier une partie (même un en-tête, vérifié : ajout d'une ronde) change son empreinte : elle disparaît de « Récentes » et perd son étoile de favori.** Correctif possible (≈ 8 lignes) : dans `activeEntryModified()`, remplacer l'ancienne empreinte par la nouvelle dans `libraryRecent` et `libraryFavorites`. Je ne l'ai pas fait : il touche le chemin d'enregistrement automatique.
- **À valider à l'œil** : rien de visuel ; seulement l'ordre sur ta vraie bibliothèque.

### Point 3 — Suppression d'une photo
- **Cause** : le bouton « Retirer la photo » ne cherchait dans le registre manuel que la clé EXACTE (`playerPhotoRegistry[name]`, au caractère près) du nom affiché, alors que l'affichage utilise une correspondance TOLÉRANTE (casse, virgule, ordre des mots, ou nom de famille seul). Une photo enregistrée sous « Dupont, Marie » et affichée pour « Marie Dupont » (ou « Dupont ») restait donc affichée : le bouton ne faisait rien, sans aucun message, puis fermait la fenêtre. Reproduit par test (la logique de l'ancien bouton est recopiée dans `tests/photo-match.mjs` : la photo reste affichée dans 2 000 cas sur 2 000 de graphie différente) ; je n'ai pas rejoué l'ancien code dans le navigateur, seulement vérifié le nouveau.
- **Correction** : `js/photo-match.js` (nouveau, fonctions pures extraites de `main.js` sans changer l'affichage : le test compare avec l'ancienne version sur 20 000 cas aléatoires, 0 écart) ; `lookupInTable()` renvoie en plus les clés qui fournissent la photo, `manualPhotoKeys()` les donne, et le bouton les supprime TOUTES (plusieurs graphies du même joueur, ou plusieurs entrées du même nom de famille et de la même photo), recharge les deux avatars et le dit. Si l'on a tapé un nom de famille seul et qu'une autre entrée du même nom prend le relais, le message l'indique (un 2e clic la retire) ; si une photo automatique reste, il l'indique aussi.
- **Cas qui ne s'efface toujours pas, mais expliqué** : une photo du pré-remplissage automatique (`data/player-photos.json` ou balises `WhiteUrl`/`BlackUrl` du PDN, rechargées à chaque démarrage) n'est pas dans le registre manuel ; avant : silence, maintenant : toast « Cette photo vient du pré-remplissage automatique (Toernooibase) : elle ne peut pas être retirée ici. ». La rendre supprimable demanderait un « marqueur de suppression » dans le registre (choix à faire : non fait, plus que le plus petit changement).
- **Tests** : `node tests/photo-match.mjs` (15 vérifications : graphies, nom de famille, homonymes, comportement d'affichage inchangé sur 20 000 cas, « Retirer » fait toujours disparaître la photo en un clic pour un nom complet — 1 203 cas — et en quelques clics pour un nom de famille seul — 538 cas dont 32 avec relais —, reproduction du bug avec l'ancien code : 2 000 cas sur 2 000). Navigateur : photo sous « BlancB, Test », nom affiché « test blancb » → Retirer : registre vide, avatar lettré, toast « Photo retirée. » ; photo venant de `WhiteUrl` → toast explicatif, photo conservée.
- **Test en 1 minute** : clic sur l'avatar d'un joueur → coller une URL d'image → Utiliser. Éditer le nom du joueur dans la plaque en changeant l'écriture (ex. « Dupont, Marie » → « marie dupont »), clic sur l'avatar → « Retirer la photo » : l'avatar redevient la lettre.
- **À valider à l'œil** : les deux messages (texte et durée du toast) ; si ton bug était un autre cas que « photo affichée par correspondance floue » ou « photo automatique », dis-le : je n'en ai pas trouvé d'autre dans le backlog.

### Point 4 — Jauge d'évaluation sous 900 px
- **Cause** : la jauge est posée en `position: absolute` à gauche du damier (`right: calc(100% + 4px)`), dans l'espace réservé par la mise en page à 3 colonnes. Sous 900 px le layout passe en colonne et le damier occupe toute la largeur : la jauge sort de l'écran à gauche, et le rail garde 18 px de marge pour elle. Décrit au backlog : « la masquer ».
- **Correction** (même bloc ≤ 900 px) : `.eval-bar { display: none }` et `.layout.analysis-on .players-rail { padding-right: 0 }`. Le score (grande plaque), la ligne « Évaluation indicative », le meilleur coup et la flèche verte sur le damier restent affichés ; au-dessus de 900 px la jauge est inchangée. Mesuré : barre `display: none`, plaque d'analyse visible dans le panneau, aucun débordement, de 360 à 900 px, thèmes sombre et clair.
- **Choix à confirmer** : **masquée**, pas déplacée. Une jauge horizontale sous ou au-dessus du damier serait un vrai travail de conception (hauteur, retournement du plateau, repères à retourner) : à décider avec le chantier Mobile.
- **Test en 1 minute** : mode appareil 390×844, touche A : plaque « +0,1 » et meilleur coup dans le panneau en bas, pas de barre ; élargir au-delà de 900 px : la barre revient à gauche du damier.
- **À valider à l'œil** : que l'absence de barre sur téléphone te convient.

### Tests et fichiers
- **Nouveaux** : `tests/library-order.mjs` (13 vérifications), `tests/photo-match.mjs` (15), toutes OK ; relancés et verts : `analysis-format`, `analysis-controller`, `engine-select`. Contrôle de syntaxe (`node --check`) de `main.js`, `board.js`, `library-view.js`, `photo-match.js`. Pas de test automatique pour la mise en page (CSS) : vérifiée dans le navigateur (iframes de 360 à 1440 px).
- **Incident en cours de route** : une apostrophe mal échappée dans un message de `main.js` a cassé le chargement de l'appli quelques minutes pendant mes essais (page vide sur `127.0.0.1` uniquement) ; corrigée avant toute autre chose, `node --check` ajouté à ma routine.
- **Modifiés** : `css/style.css` (bloc ≤ 900 px), `js/render/board.js` (largeur du damier en colonne), `js/main.js` (`alignLayout`, `renderLibrary`, « Retirer la photo », imports, suppression de 3 fonctions déplacées), `CLAUDE.md`. **Nouveaux** : `js/library-view.js`, `js/photo-match.js`, `tests/library-order.mjs`, `tests/photo-match.mjs`. Commité sur `main` (`c5313b2`), rien déployé.

## Règles 6.3/6.4 (20/10/2026) — FUSIONNÉES dans `main` (21/10/2026)
Les limites de finale FMJD 6.3 (16 coups) et 6.4 (5 coups), avec la clause de la grande diagonale du texte 2024, ont été développées dans une copie séparée (`git worktree` `..\DamikA-regles`, branche `regles-6-3-6-4`, commit `afe5157`, conservée) puis FUSIONNÉES dans `main` le 21/10/2026 (conflits résolus en gardant les deux côtés : étape 4.1 + lot de corrections + règles 6.3/6.4). **Lecture de la grande diagonale = lecture A, confirmée par Mickaël : la dame seule doit être SEULE sur la diagonale.** Rapport complet ci-dessous. Rien n'est déployé.
## Règles 6.3/6.4 — limites de finale FMJD (20/10/2026) — fusionné dans `main` le 21/10/2026, NON déployé

**En deux mots.** Les limites de finale de la FMJD (art. 6.3 : 16 coups ; art. 6.4 : 5 coups ; plus la clause de la grande diagonale du texte 2024) s'appliquent maintenant dans l'analyse (Worker) ET dans l'auto-jeu, avec le même code de recherche, la même priorité que la règle des 25 coups et de la 3e répétition, et une vérification indépendante avec `rules.js`. **`tests/data/golden-scores.json` n'a pas été touché et AUCUNE de ses 60 positions ne change de score, de mat, de meilleur coup ni de variante** (sept nombres de nœuds bougent : §3). Trois points d'interprétation du texte sont à confirmer (§1, lectures 3, 4 et 5).

### 0. Cadre respecté
- **Copie séparée** : `git worktree add ..\DamikA-regles -b regles-6-3-6-4`, tout le travail est fait là (modifs, tests, commit). Le dossier `DamikA` n'a pas été modifié (la commande ajoute seulement la branche et les métadonnées du worktree dans `.git`). **La branche part du dernier commit (`f65173f`) : elle ne contient PAS les travaux non commités du dossier principal** (étape 4.1, lot de corrections du 20/10, `training/chain-nuit2.mjs`, etc.).
- **Aucun match, aucun auto-jeu, aucun réentraînement** : seulement des tests de 0,1 à 65 secondes sur un cœur (liste en §4). `match.mjs` (un match) n'a pas été lancé.
- Rien de fusionné, de poussé ni de déployé.

### 1. Les règles officielles lues (pas de mémoire) et comment je les ai appliquées
**Sources** (textes extraits des PDF officiels le 20/10/2026) : [FMJD, Annexe 1 « Official FMJD rules for international draughts », version de novembre 2015, art. 6 « The draw », p. 4](https://www.fmjd.org/downloads/news/948/Annex%201%20official%20FMJD%20rules%20of%20international%20draughts.pdf) ; [FMJD, Annexes 2024, Annexe 1, art. 6, p. 14](https://www.fmjd.org/downloads/FMJD_Annexes_2024_8-sig.pdf) (version en vigueur ; l'anglais fait foi). **Citation** : je ne recopie pas les articles en entier (limite de citation) ; ci-dessous, une paraphrase fidèle article par article, avec les numéros et pages pour vérifier ; une seule expression anglaise est citée, parce que tout y tient : « solely occupies the large diagonal » (2024, art. 6.3).

| Article | Texte de 2015 (p. 4) | Texte de 2024 (p. 14, version suivie) |
|---|---|---|
| **6.3** (16 coups) | Il ne reste que trois dames, ou deux dames et un pion, ou une dame et deux pions, contre UNE dame : nulle quand chaque joueur a joué seize coups de plus au maximum. | Idem (16 coups au maximum, pour les deux joueurs). **Ajouts** : (i) une prise pendant ces 16 coups ne change pas le maximum ; (ii) si le joueur à la dame seule occupe seul la grande diagonale, les deux joueurs n'ont plus que 5 coups ; (iii) après le maximum de coups, nulle, SAUF si le dernier coup met l'adversaire dans une position perdue au sens des art. 7.2.2 / 7.2.3 (plus aucun coup possible, ou plus de pièce) : la perte prime. |
| **6.4** (5 coups) | La finale à deux dames, ou dame et pion, ou dame contre dame est nulle quand chaque joueur a joué cinq coups de plus au maximum. | Idem, avec la même exception de la perte au dernier coup. |
| 6.1 / 6.2 (déjà en place) | 3e occurrence ; 25 coups de dames seules | inchangés |

**Ce que j'ai choisi de suivre** : le texte de 2024 (en vigueur). Le texte de 2015 n'a ni la clause de la grande diagonale, ni la précision sur les prises, ni l'exception de la perte (le contrôle « sans coup = perdu » avant les nulles la donne de toute façon).

**Lectures nécessaires, parce que le texte ne tranche pas : à confirmer par toi.** Chacune est un point précis du code, facile à changer.
1. **Départ du compte** : le texte parle de 16 coups « de plus » après la position de la finale ; je compte à partir de la position où l'effectif de la finale APPARAÎT (après la prise ou la promotion qui le crée) ; chaque camp joue ensuite 16 coups, soit 32 demi-coups ; la nulle tombe quand le 32e demi-coup est joué (sauf perte prioritaire).
2. **Le 6.4 est elliptique** (« deux dames, dame et pion, ou dame contre dame ») : je lis, comme au 6.3, « contre une dame seule » (dame contre dame étant explicite).
3. **Occupation de la grande diagonale par la dame seule** : je lis que la dame seule est la SEULE pièce sur les 10 cases de la grande diagonale (cases 5, 10, 14, 19, 23, 28, 32, 37, 41, 46 ; aucune pièce de l'autre camp dessus). Conséquence : les dames qui attaquent peuvent éviter la clause en occupant elles-mêmes une case de la diagonale (c'est aussi la pratique du jeu : il faut d'abord prendre la grande diagonale). Autre lecture possible : « la dame seule est sur la diagonale », sans condition sur les autres pièces. `loneKingAloneOnLongDiagonal` (rules.js) et `_loneKingAlone` (fastboard.js) sont les deux seuls endroits à changer.
4. **Moment des 5 coups de la clause** : le texte ne le dit pas. Je les compte à partir du moment où la dame seule se retrouve seule sur la diagonale ; si elle la quitte, ce compte tombe à zéro (et repart à 0 si elle y revient) ; le plus court des deux délais gagne (5 coups depuis l'occupation, ou 16 depuis l'apparition). La clause ne vaut qu'en famille 1 (les effectifs du 6.3).
5. **Une prise pendant les 16 coups** (texte 2024 : le maximum de 16 reste valable) : si l'on passe des effectifs du 6.3 à ceux du 6.4 (la dame seule prend une dame), le compte CONTINUE et la limite reste 16 coups ; une finale qui apparaît directement avec les effectifs du 6.4 a 5 coups. Si une prise fait sortir des deux listes (par exemple deux pions contre la dame seule), le compte tombe à zéro ; une nouvelle apparition (par une promotion) le fait repartir de la position où elle apparaît.
6. **Sans historique** (analyse d'une position seule, ou d'une position de départ) : la finale éventuelle est supposée apparaître à la racine (compteur 0).

### 2. Ce qui est implémenté
**Effectifs** (un camp a exactement UNE dame et aucun pion ; l'autre camp a) : *famille 1 (art. 6.3, 32 demi-coups)* : 3 dames, ou 2 dames + 1 pion, ou 1 dame + 2 pions ; *famille 2 (art. 6.4, 10 demi-coups)* : 2 dames, ou 1 dame + 1 pion, ou 1 dame. **État** après chaque position : `{ plies, limit, diag }` (demi-coups depuis l'apparition, 32 ou 10 fixé à l'apparition, demi-coups depuis que la dame seule est seule sur la grande diagonale ou −1). **Nulle** quand `plies ≥ limit` ou `diag ≥ 10`. Motifs : `endgame16`, `endgame5`, `diagonal5`.

| Fichier | Rôle |
|---|---|
| `js/engine/rules.js` | Version de RÉFÉRENCE sur le plateau de l'interface : `endgameFamily`, `loneKingAloneOnLongDiagonal`, `endgameStep`, `endgameStateAfter`, `endgameDrawReason`, constantes ; `DraughtsGame.endgameState()` / `endgameDraw()` (interrogations seules : l'interface n'arrête pas la partie, comme pour la répétition et les 25 coups). Le commentaire d'en-tête de cette section est la spécification complète. |
| `js/ai/fastboard.js` | Version rapide INCRÉMENTALE : effectifs `cnt`/`np` et compteurs `eg`/`egLim`/`dg` tenus par `makeMove`/`unmakeMove` (piles d'annulation, comme `quiet`), `initEndgame`, `egState`, `egDrawReason` ; `fromUiBoard(board, side, quiet, endgame)`. Aucun calcul de finale au-dessus de 4 pièces. Un plateau rempli à la main est compté au premier `makeMove`. |
| `js/ai/search.js` | Nulle à tout nœud sous la racine (jamais à la racine), testée APRÈS « sans coup = perdu » (la perte prime) ; état de finale dans la CLÉ de la table de transposition (pas de « teinte » : la table reste exacte près de la limite) ; `normalizeHistory` accepte `endgame` ; `drawRule` de la racine : `endgame16` / `endgame5` / `diagonal5`. |
| `js/ai/analysis-format.js`, `analysis-controller.js`, `worker.js`, `js/main.js` | `analysisHistory(game.history, game.board)` calcule l'état de finale en rejouant TOUS les plateaux de la partie (une finale accepte les coups de pion : la fenêtre « quiet » ne suffit pas) ; le contrôleur le transmet même à `quiet = 0` et l'inclut dans la clé de déduplication ; le Worker le passe à la recherche. `main.js` : un argument de plus. |
| `training/game.mjs` | `GameState.terminal()` : même règle (mêmes compteurs de `FastBoard`), motifs enregistrés dans `reason` ; `history()` et l'exploration transmettent l'état ; `playGame({ start })` et `verifyGame(rec, maxPlies, { endgameRules, start })` (rejoue avec rules.js seul) ; `ENDGAME_RULES_ID`. |
| `training/arena.mjs`, `verify.mjs`, `README.md` | `endgameRules` dans l'identité d'un run : **un run commencé sans ces règles (nuits 1 et 2, matchs de l'étape 3) ne se reprend pas avec ce code** (sinon on mélangerait deux jeux de règles) ; `verify.mjs` lit ce champ et applique les ANCIENNES règles aux données qui ne l'ont pas (les nuits 1 et 2 restent vérifiables). |
| `tests/endgame-rules.mjs`, `tests/endgame-demo.mjs` | Tests (§4) et démonstration lisible. |

**Ordre des contrôles** (analyse et auto-jeu, identique) : camp au trait sans coup (perte) → 25 coups → 3e répétition → limites de finale → plafond de 300 demi-coups (auto-jeu).

### 3. `tests/data/golden-scores.json` : quelles positions changent, et pourquoi
Fichier non modifié. Comparaison de l'ancien moteur (commit `f65173f`, extrait avec `git archive`) et du nouveau sur les 60 positions, profondeur 7, hasard 777 :
- **Scores, mats, meilleurs coups, variantes principales : 0 position sur 60 ne change** (`repetition.mjs` (d) : 60/60 identiques au fichier).
- **Nombres de nœuds : 7 positions changent, à la marge** : n° 70 (+0,08 %), n° 1 (+0,79 %), n° 4 (+1,28 %), n° 5 (+1,52 %), n° 16 (+0,05 %), n° 26 (−0,96 %), n° 32 (+0,05 %). **Pourquoi** : dans ces positions (5 à 12 pièces), des rafles amènent la recherche dans une finale de 4 pièces ou moins ; la table de transposition y distingue désormais l'état des compteurs, donc partage moins d'entrées entre chemins de longueurs différentes. Cela ne change aucun score (la table ne réutilise que des scores calculés à la profondeur exacte).
- **Pourquoi aucun SCORE ne peut changer à la profondeur 7** : aucune des 60 positions n'est déjà une finale concernée à la racine (3 positions ont ≤ 4 pièces, aucune n'a les effectifs des listes) ; et depuis un compteur frais, la plus courte nulle (10 demi-coups) tombe au-delà de l'horizon (7 demi-coups, que les prises de la quiescence en finale de ≤ 3 pièces ne prolongent pas jusqu'à 10). **À partir de la profondeur 8 à 10, les finales de dames changent de score** : c'est le but (démonstration : `node tests/endgame-demo.mjs`).

### 4. Tests
**Nouveau `tests/endgame-rules.mjs` : 90 vérifications, ≈ 12 s, toutes OK.**
- **A. Familles** : les 625 effectifs (0 à 4 pièces de chaque sorte et chaque camp) contre le texte écrit à la main, dans les deux moteurs et sur de vrais plateaux ; constantes identiques ; grande diagonale symétrique.
- **B. Comptage sur plateaux écrits à la main** : déclenchement au bon demi-coup (9 puis 10 pour le 6.4 ; 31 puis 32 pour le 6.3 ; chaque effectif de chaque article ; Blancs et Noirs) ; prise qui ne relance rien ; passage de la famille 1 à la 2 (la limite de 16 reste) ; **sortie de la finale = compteur remis à zéro, nouvelle apparition = repart de 0 avec la limite de la nouvelle famille** ; grande diagonale : 10 demi-coups, pas de clause si une autre pièce est sur la diagonale ou si la dame n'est pas seule de son camp, montée en cours de route (le plus court des délais gagne), sortie puis retour (le compte de 5 coups repart de 0), clause réservée à la famille 1.
- **C. Moteur rapide contre `rules.js`** : 700 parties aléatoires (6 094 demi-coups, finales et milieux de partie qui y entrent par des prises : 140 apparitions, 519 sorties, 100 passages famille 1 → 2 par une prise, 84 promotions en finale, 108 positions « dame seule sur la diagonale ») : états identiques à chaque demi-coup, `unmakeMove` restitue tout, effectifs justes.
- **D. Symétrie Blancs / Noirs** : 300 parties, suites d'états identiques pour la position et pour son miroir (rotation de 180° + échange des couleurs).
- **E. Recherche** : nulle vue à 8 et 9 demi-coups écoulés (score 0 au lieu de +310), `drawRule` à 10 ; limite de 16 conservée après une prise ; **priorité de la perte** : le coup qui bloque la dame noire au 32e demi-coup donne mat en 1 (et de même au 10e pour le 6.4), le sacrifice 3-12, 45x7, 1x12 dont la reprise est le 32e demi-coup gagne encore, et perd son effet (score 0) à un demi-coup de plus ; table avec/sans identique sur 60 positions de finale à compteurs quelconques ; élagage + table = négamax pur.
- **F. Chaîne appli → contrôleur → Worker** : `analysisHistory` et `DraughtsGame` sur 40 coups réels = état de `FastBoard` à chaque demi-coup ; le Worker voit la nulle ; le contrôleur transmet l'état même à `quiet = 0` et ne relance rien si rien n'a changé.
- **G. Auto-jeu** : parties scénarisées qui finissent exactement à 10, 32 (Blancs et Noirs) et 10 (diagonale) demi-coups, vérifiées par `rules.js` seul ; une partie enregistrée qui s'arrête un demi-coup trop tôt est refusée ; 23 parties jouées par la recherche (exploration comprise) : `rules.js` d'accord à chaque fois ; le motif de `GameState.terminal()` est celui de `drawRule` de l'analyse, position par position.

**Suites existantes relancées sur le code final, toutes vertes** : `repetition` (golden inclus), `worker`, `worker-analyse`, `analysis-controller`, `analysis-format`, `tactics` (20/20), `mate`, `perft-positions` (1,1 M de nœuds), `diff` (aucune divergence avec `rules.js`), `search-consistency` (65 s, écarts 0), `eval-symmetry` (réduit), `eval-learned`, `eval-structure`, `fit`, `fit-struct`, `arena` (39 s). **Vitesse** : `perft(7)` donne le même nombre (1 049 442) à la même vitesse (rapport 0,999). **Non lancés** : `match.mjs` (un match), `search-perf.mjs` et `bench.mjs` (mesures de vitesse, machine occupée), `perft 9`.

### 5. À savoir, à décider
- **Les trois lectures à confirmer** (§1, n° 3 à 5), surtout la grande diagonale. Pour changer de lecture il suffit de modifier la fonction citée ; les tests B et D en montrent les conséquences.
- **L'interface n'affiche pas ces nulles** (comme pour la répétition et les 25 coups : `drawRule` n'est pas exploité) : en analysant une finale de dames, un score `0,0` apparaîtra dès que la nulle tombe dans l'horizon (profondeur ≥ 10 environ pour 2 dames contre 1 depuis l'apparition : le Worker de l'appli atteint 10 à 12 en 1,5 s). C'est le résultat voulu, mais l'écran ne dit pas POURQUOI : une mention « nulle par la règle des N coups » serait une suite possible.
- **Données d'entraînement** : les nuits 1 et 2 ont été jouées SANS ces règles (beaucoup de longues finales de dames nulles : « les longues nulles de finale noient les données », étape 3.2). Les modèles appris sur elles (V1b) restent utilisables ; les prochaines générations (identité `endgameRules`) auront des finales plus courtes. Ne PAS mélanger les deux sortes de données sans y penser (les positions enregistrées portent `quiet` mais pas l'état de finale).
- **Fusion** : fichiers touchés par cette branche ET par du travail non commité du dossier principal : `js/ai/analysis-controller.js` (la fonction `request`), `js/ai/worker.js` (commentaires), `js/main.js` (une ligne), `CLAUDE.md`, `docs/SESSION_DERNIERE.md`, `training/README.md` ; les conflits seront simples. **Les runs en cours dans le dossier principal (nuit 2, chaîne de matchs) ne sont pas affectés** : ils tournent sur l'ancien code ; après la fusion, ne pas les reprendre avec le nouveau (l'identité le refuserait, volontairement).
- Limite théorique inchangée : l'état de la répétition et des 25 coups n'est pas dans la clé de la table (« teinte » existante) ; seul l'état de finale y est.

### 6. Comment tester en 3 minutes
1. `cd C:\Users\micka\DamikA-regles` puis `node tests/endgame-demo.mjs` (4 s) : on y voit, pour 2 dames contre 1 puis 3 dames contre 1, le score passer à 0 quand la limite tombe dans l'horizon, `drawRule` à 10 / 32 demi-coups, la clause de la diagonale, la perte qui prime au 32e demi-coup, et une partie du moteur qui s'arrête à 10 demi-coups.
2. `node tests/endgame-rules.mjs` (≈ 12 s) : « RÉSULTAT : tout concorde. » (90 vérifications).
3. `node tests/repetition.mjs` (6 s) : la ligne (d) confirme 60/60 positions identiques au fichier de référence. Facultatif : `node tests/search-consistency.mjs` (65 s).
4. Pour voir la règle dans l'appli (après fusion) : charger une partie dont la fin est une finale de dames et lancer l'analyse (touche A) sur la position de la finale, puis sur les suivantes : le score tombe à `0,0` quand la limite arrive dans l'horizon.

### 7. Fichiers
**Modifiés** : `js/engine/rules.js`, `js/ai/fastboard.js`, `js/ai/search.js`, `js/ai/worker.js` (commentaires), `js/ai/analysis-format.js`, `js/ai/analysis-controller.js`, `js/main.js` (un argument), `training/game.mjs`, `training/arena.mjs`, `training/verify.mjs`, `training/README.md`, `tests/repetition.mjs` (commentaire d'en-tête), `CLAUDE.md`, `docs/SESSION_DERNIERE.md`. **Nouveaux** : `tests/endgame-rules.mjs`, `tests/endgame-demo.mjs`. **Non touchés** : `tests/data/golden-scores.json`, `js/ai/eval.js`, `js/ai/eval-learned.js`, tout le dossier `DamikA`.

## Échantillon Turbo Dambase (21/10/2026, `node training/td-check.mjs`, sans noms de joueurs)

Fichier : tests/pdn-local/td-echantillon-1000.pdn (lecture seule, jamais commité).

### Résultat
- Parties lues : **1000** · rejouées depuis la position initiale : 978 · **légales : 978** · **illégales : 0** · avec position de départ ([Setup]/[FEN]) : 22 (comptées à part, ignorées).
- Longueur moyenne des parties légales : **52.8 coups complets** (105.6 demi-coups ; 103311 demi-coups au total).
- Parties avec au moins un Elo : **102** sur 1000.
- Répartition des résultats (toutes parties, balise Result) : * : 7 (0.7 %) · 0-1 : 300 (30.0 %) · 1-0 : 339 (33.9 %) · 1/2-1/2 : 354 (35.4 %).
- Cohérence : balise Result ≠ résultat écrit dans le texte des coups : 0 partie(s) ; parties légales finies sur « plus de coup » : 9, dont 0 avec un résultat ne correspondant pas au camp bloqué ; parties contenant des variantes (…) ignorées : 2 ; rafles ambiguës (même départ et arrivée, pièces prises différentes, la première retenue) : 0.
- Lecture par l'appli (parsePdn) : même nombre de parties et même nombre de coups pour chaque partie.

### Les 10 premiers coups Blancs les plus fréquents (parties légales)
| Coup | Parties | Fréquence | Blancs gagnent | Nulles | Noirs gagnent |
|---|---|---|---|---|---|
| 33-28 | 495 | 50.6 % | 165 (33.3 %) | 181 (36.6 %) | 149 (30.1 %) |
| 34-30 | 124 | 12.7 % | 47 (37.9 %) | 48 (38.7 %) | 28 (22.6 %) |
| 31-26 | 112 | 11.5 % | 38 (33.9 %) | 36 (32.1 %) | 38 (33.9 %) |
| 32-28 | 108 | 11.0 % | 26 (24.1 %) | 41 (38.0 %) | 39 (36.1 %) |
| 31-27 | 58 | 5.9 % | 24 (41.4 %) | 19 (32.8 %) | 14 (24.1 %) |
| 33-29 | 32 | 3.3 % | 7 (21.9 %) | 10 (31.3 %) | 12 (37.5 %) |
| 34-29 | 27 | 2.8 % | 8 (29.6 %) | 12 (44.4 %) | 7 (25.9 %) |
| 35-30 | 12 | 1.2 % | 7 (58.3 %) | 2 (16.7 %) | 3 (25.0 %) |
| 32-27 | 9 | 0.9 % | 4 (44.4 %) | 2 (22.2 %) | 3 (33.3 %) |

### Parties illégales (0)
Aucune.

## Turbo Dambase complet (21/10/2026, `node training/td-full.mjs`, sans noms de joueurs)

Fichier : tests/pdn-local/td-complet/td-complet.pdn (992 Mo, lecture seule en flux, jamais commité) · 7 worker(s) · lots de 1000 parties.

### 1. Parties lues
- **763399** parties lues (attendu : 763399) → **identique**. Contrôle indépendant : 763399 balises [Event] ; parties sans aucune balise : 0.

### 2. Légalité (rejeu avec rules.js depuis la position initiale)
- **Légales : 763021** · **illégales : 0** · avec position de départ ([Setup]/[FEN], comptées à part, ignorées) : **378**.
- Aucune partie illégale.
- Cohérence : balise Result ≠ résultat écrit dans les coups : 0 ; parties légales finies sur « plus de coup » : 5405, dont 20 avec un résultat incohérent avec le camp bloqué ; parties avec variantes (…) (ignorées) : 71 ; rafles ambiguës (même départ et arrivée, pièces prises différentes) : 0.

### 3. Doublons (empreinte = séquence de coups seule, parmi les parties légales)
- **Uniques : 758286** · **doublons : 4735** (0.6 % des parties légales).

### 4. Résultats, longueur, Elo, dates
- Résultats, toutes parties : 1/2-1/2 : 319104 (41.8 %) · 1-0 : 224143 (29.4 %) · 0-1 : 220091 (28.8 %) · * : 61 (0.0 %).
- Résultats, parties légales uniques : 1/2-1/2 : 317982 (41.9 %) · 1-0 : 222118 (29.3 %) · 0-1 : 218138 (28.8 %) · * : 48 (0.0 %).
- Longueur moyenne : **50.5 coups complets** sur les parties légales (101.0 demi-coups) ; 50.8 sur les uniques.
- Parties avec au moins un Elo : **687641** (90.1 %).
- Décennies (balise Date, toutes parties) : 0s : 1 · 1800s : 3 · 1870s : 6 · 1880s : 139 · 1890s : 338 · 1900s : 451 · 1910s : 968 · 1920s : 2141 · 1930s : 2321 · 1940s : 2562 · 1950s : 6883 · 1960s : 16541 · 1970s : 26720 · 1980s : 63264 · 1990s : 129421 · 2000s : 168069 · 2010s : 226970 · 2020s : 116483 · date inconnue : 118.

### 5. Les 10 premiers coups Blancs les plus fréquents (parties légales uniques)
| Coup | Parties | Fréquence | Blancs gagnent | Nulles | Noirs gagnent |
|---|---|---|---|---|---|
| 32-28 | 396849 | 52.3 % | 105553 (26.6 %) | 171693 (43.3 %) | 119583 (30.1 %) |
| 33-29 | 85757 | 11.3 % | 33733 (39.3 %) | 34352 (40.1 %) | 17664 (20.6 %) |
| 34-29 | 77133 | 10.2 % | 24819 (32.2 %) | 34535 (44.8 %) | 17776 (23.0 %) |
| 33-28 | 75155 | 9.9 % | 19937 (26.5 %) | 28173 (37.5 %) | 27036 (36.0 %) |
| 34-30 | 55463 | 7.3 % | 15356 (27.7 %) | 22771 (41.1 %) | 17331 (31.2 %) |
| 31-27 | 30015 | 4.0 % | 9797 (32.6 %) | 11883 (39.6 %) | 8332 (27.8 %) |
| 31-26 | 22729 | 3.0 % | 6850 (30.1 %) | 9186 (40.4 %) | 6693 (29.4 %) |
| 35-30 | 12143 | 1.6 % | 5278 (43.5 %) | 4258 (35.1 %) | 2607 (21.5 %) |
| 32-27 | 3041 | 0.4 % | 794 (26.1 %) | 1131 (37.2 %) | 1116 (36.7 %) |

### 6. Temps de traitement
- **1 min 27 s** (8747 parties/s, 7 worker(s)).

### 7. Lecture des résultats
- **Aucune partie illégale sur 763 021 : ni notre lecture (notation des prises, BOM, CRLF, commentaires, variantes) ni nos règles (rules.js) ne sont en cause.** Rien n'a été corrigé ni créé (pas de jeu de données filtré).
- Point à examiner, vraisemblablement côté DONNÉES (non vérifié partie par partie) : 20 parties se terminent sur « plus de coup » avec un résultat qui ne correspond pas au camp bloqué ; 4 735 doublons (0,6 %) ; 61 résultats « * ».


## Jeu de données propre Turbo Dambase (chantier A) — plan et choix (21/10/2026)

Outil : `node training/td-clean.mjs [--out dossier] [--limit n] [--workers n] [--no-report]` (lecture en flux, `td-lib.mjs` réutilisé, mêmes
découpage en parties et rejeu `rules.js` que `td-full.mjs`). Sortie : `tests/pdn-local/td-propre/td-propre.pdn` + `rapport.txt` (dossier ignoré par
git ; **noms de joueurs conservés dans le PDN, en local seulement** ; le rapport n'en contient aucun). Le script refuse toute sortie hors
`tests/pdn-local/` ou `training/data/`. Pas de filtre Elo, pas de livre d'ouvertures, pas d'apprentissage.
- **Motifs d'exclusion** (premier rencontré, dans cet ordre) : [Setup]/[FEN] · variantes (…) · illégale · résultat absent ou « * » · balise Result ≠
  résultat des coups · « plus de coup » incohérent avec le résultat (les 20 cas connus) · doublon. Le doublon est testé en DERNIER : la première
  occurrence (ordre du fichier) d'une partie par ailleurs propre est gardée.
- **Format de sortie** : balises d'origine dans l'ordre (+ `Result` garanti), coups ré-écrits sans commentaire ni annotation (`!?+#`), 78 colonnes.
  Un contrôle par `td-full.mjs` sur la sortie de l'essai : 969 légales, 0 illégale, 0 incohérence.
- **Elo** = minimum des deux joueurs (`WhiteRating`/`WhiteElo`, `BlackRating`/`BlackElo`) ; si un seul est présent, celui-là ; aucun = « inconnu ».
- **Essai sur les 1 000 premières parties** (1 s, 1 worker) : 969 gardées ; exclues : Setup/FEN 22, variantes 2, résultat « * » 7, autres motifs 0.
  Elo inconnu pour 90 % de ces parties (archives anciennes, décennies 1880-1900 : 87 %). Le lancement COMPLET attend le feu vert de Mickaël
  (nuit 3 en cours jusqu'à ≈ 17h05) ; la section de résultats sera alors ajoutée ici par le script.

## Jeu de données propre Turbo Dambase (chantier A) — résultats (21/10/2026, `node training/td-clean.mjs`, sans noms de joueurs)

Entrée : tests/pdn-local/td-complet/td-complet.pdn · sortie : tests/pdn-local/td-propre/td-propre.pdn (962 Mo, local, jamais commité) · 4 worker(s).

### Bilan : 763399 parties lues · **758150 gardées** (99.3 %) · 5249 exclues.

### Exclusions (premier motif rencontré, dans cet ordre)
- position de départ ([Setup]/[FEN]) : 378
- variantes (…) dans les coups : 71
- illégale (rejeu rules.js) : 0
- résultat absent ou « * » : 61
- balise Result ≠ résultat des coups : 0
- « plus de coup » incohérent avec le résultat : 20
- doublon (séquence de coups déjà gardée) : 4719

### Parties gardées : longueur moyenne 50.8 coups complets

### Elo (minimum des deux joueurs, tranches de 100 ; « inconnu » = aucun Elo)
- 1400–1499 : 628 (0.1 %)
- 1500–1599 : 559 (0.1 %)
- 1600–1699 : 2263 (0.3 %)
- 1700–1799 : 24978 (3.3 %)
- 1800–1899 : 74396 (9.8 %)
- 1900–1999 : 209562 (27.6 %)
- 2000–2099 : 164248 (21.7 %)
- 2100–2199 : 124299 (16.4 %)
- 2200–2299 : 59023 (7.8 %)
- 2300–2399 : 20387 (2.7 %)
- 2400–2499 : 2974 (0.4 %)
- inconnu : 74833 (9.9 %)

### Décennies (balise Date)
- 0s : 1 (0.0 %)
- 1800s : 3 (0.0 %)
- 1870s : 6 (0.0 %)
- 1880s : 138 (0.0 %)
- 1890s : 333 (0.0 %)
- 1900s : 432 (0.1 %)
- 1910s : 940 (0.1 %)
- 1920s : 2091 (0.3 %)
- 1930s : 2275 (0.3 %)
- 1940s : 2533 (0.3 %)
- 1950s : 6807 (0.9 %)
- 1960s : 16434 (2.2 %)
- 1970s : 26600 (3.5 %)
- 1980s : 62997 (8.3 %)
- 1990s : 128703 (17.0 %)
- 2000s : 166966 (22.0 %)
- 2010s : 225284 (29.7 %)
- 2020s : 115497 (15.2 %)
- date inconnue : 110 (0.0 %)

### Temps : **1 min 40 s** (7630 parties/s)

### Contrôle du fichier propre (chantier A, 21/10/2026)
`node training/td-full.mjs tests/pdn-local/td-propre/td-propre.pdn` sur la sortie : 758 150 parties lues (= gardées), **758 150 légales, 0 illégale, 0 doublon,
0 incohérence de résultat** (5 385 finies sur « plus de coup », toutes cohérentes), 0 variante, 0 [Setup]/[FEN]. Résultats : nulles 41,9 % · Blancs 29,3 % · Noirs 28,8 %.
Coût du lancement complet : 1 min 40 s avec 4 workers. Chantier A terminé ; rien d'autre n'est commencé.

## Nuit 4 — plan et préparation (21/10/2026) — chaîne ÉCRITE ET TESTÉE À TRÈS PETITE ÉCHELLE, **NON LANCÉE** (feu vert de Mickaël attendu)

`node training/chain-nuit4.mjs` (journal `training/logs/chain-nuit4.log`, état `chain-nuit4.state.json`, récapitulatif `chain-nuit4.resume.txt`). Lancement prévu 19h30–20h00 ; **échéance (dernier match fini) 09h30, arrêt de sécurité 09h50**. Aucun calcul lourd en parallèle : tout est séquentiel.

### 1. Point de départ
- n123 (nuits 1+2+3, λ = 0) bat V1b de **+26 [+8 ; +45]** à profondeur 8 (graine 888) et **+31 [+12 ; +50]** à profondeur 6 ; n3 seul : +10 [−10 ; +29] (profondeur 8) : **n123 = meilleur modèle** (`training/models/n123-l0.json`). Nuit 3 : 8 000 parties en 5,65 h (1 415 parties/h, 7 workers) ; matchs : profondeur 6 ≈ 4,3 min, profondeur 8 ≈ 38 min (400 paires), temps égal 100 ms ≈ 20 min pour 200 paires (6 workers).
- Données réelles : `tests/pdn-local/td-propre/td-propre.pdn` (758 150 parties propres). **Écart signalé** : « Elo minimum des deux joueurs ≥ 2100 » donne **152 917 parties** si les DEUX Elo doivent être présents, **206 683 (≈ 207 000)** si l'on prend le minimum des Elo PRÉSENTS (au moins un Elo ; c'est le chiffre du rapport du chantier A). J'ai retenu **206 683** (chiffre annoncé) ; `--elo-mode both` (une option) donne la lecture stricte. Les parties sans aucun Elo (74 833) sont exclues dans les deux cas.

### 2. Ce qui a été écrit
- **`training/td-positions.mjs`** (nouveau) : parties à Elo ≥ 2100 → au plus **12 positions par partie** tirées au hasard (graine, numéro de partie) parmi celles qui sont **hors ouverture (≥ 16 demi-coups joués)** et **calmes** (aucune prise obligatoire) ; rejeu avec `FastBoard` ; cible = résultat réel ; **format identique à l'auto-jeu** (`games.jsonl`, `p` = [plateau, camp, demi-coup, compteur, 0, 0, 0], le champ « score » vaut 0 et n'est pas utilisé) : `fit.mjs` le lit sans changement. Aucun nom de joueur n'est écrit (numéro de partie seulement) ; sortie refusée hors `training/data/` ou `tests/pdn-local/`. ≈ **2,4 millions de positions**, ≈ 2 min. Un bug trouvé à l'essai (notation de rafle « 49x32x19x2 » = chemin complet) est corrigé (139 parties sur 72 000 n'étaient pas retrouvées).
- **`training/fit.mjs --anchor <modèle>`** (nouvelle option, comportement par défaut inchangé) : la régularisation, la baseline et K_m s'attachent aux tables d'un modèle à 3 phases (ici n123) au lieu de V0 = **réglage fin d'un modèle existant**. Raison : à l'étape 3.2, les modèles appris SEULEMENT sur des résultats jouaient bien moins fort que ceux appris sur les scores de recherche (V1b λ = 1 : −1 à +86 Elo contre V0, λ = 0 : +211), et ancrés sur V0 ils ne peuvent pas rattraper n123 (≈ +240 Elo au-dessus de V0).
- **`training/chain-nuit4.mjs`** (nouveau, ≈ 480 lignes) et **`tests/td-positions.mjs`** (nouveau, 15 vérifications contre `rules.js`) ; `tests/fit.mjs` étendu (4 vérifications de `--anchor`). `training/models/n3-*` et `n123-*` (nuit 3) commités avec ce chantier.

### 3. Plan : durée estimée et mesure finale de chaque étape (départ simulé 19h45, durées mesurées aux nuits 2 et 3, ± 20 %)
| # | Étape | Durée | Mesure finale / décision |
|---|---|---|---|
| 1 | `td-positions` (206 683 parties → ≈ 2,4 M positions) | 3 min | `summary.json` : parties retenues, positions, `unmatched = 0` (sinon étape en échec, la chaîne continue avec n123) |
| 2 | Apprentissage de **T0** (pur : ancré V0, λ = 1, parties pondérées 1/longueur, α choisi sur la validation PAR PARTIES) ; **Ta** et **Tb** (réglage fin de n123, α = 1e-4 et 1e-3) | 3 × 2 min | perte de validation (rapport `fit-report.json`) ; chaque modèle doit être accepté par l'évaluateur (borne de mat) |
| 3 | Chaque T contre **n123**, profondeur 6, 400 paires, graine 777 | 3 × 5 min | Elo [IC 95 %] par paires. Le meilleur T (Elo > 0) passe à l'étape suivante, sinon elle est sautée |
| 4 | Le meilleur T contre n123, **profondeur 8, 300 paires, graine 888** | 29 min (conditionnel) | **T est retenu si son IC 95 % est ENTIÈREMENT > 0**, sinon **n123 reste le meilleur** (comparaison avec l'étiquetage par recherche, tranchée par l'arène : « la perte de validation ne prédit pas la force ») |
| 5 | **F1 (connexité)** ajustée par-dessus le meilleur (tables + 2 poids ; sur parties réelles si T, sur nuits 1-3 si n123) | 6 min | modèle accepté par l'évaluateur |
| 6 | F1 contre le meilleur **à TEMPS ÉGAL (100 ms/coup)**, 250 paires, graine 777, 6 workers | 29 min | **gardée si IC 95 % entièrement > 0, sinon écartée** (mesure précédente : +6,9 [−18,9 ; +32,9], 200 paires) |
| 7 | Décision + nombre de parties d'auto-jeu | 0 | `parties = (temps disponible − matchs finaux − ajustements − 40 min de marge) × 1 300 parties/h × (workers/7) × (0,75 si F1)`, arrondi à la centaine, entre 1 500 et 12 000, **figé dans l'état** (≈ 10 000 parties pour un départ à 19h45, ≈ 9 100 si T devient le meilleur) |
| 8 | **Auto-jeu** profondeur 8, graine 4, règles 6.3/6.4, avec le meilleur modèle (+ F1 si gardée) | ≈ 460 min (7 h 40) | **borné dans le temps** : arrêté à l'heure où les matchs finaux doivent commencer si la vitesse réelle est inférieure à 1 300/h (parties jouées conservées, ligne tronquée retirée, ≥ 1 500 exigées) |
| 9 | `verify.mjs` (rules.js, règles de finale) | 1 min | toutes les parties légales, sinon **ARRÊT NET** |
| 10 | Réentraînement **nuits 1+2+3+4** (λ = 0, comme n123) → `n1234-l0.json` ; si F1 gardée : F1 par-dessus → `n1234f-F1.json` | 2 min (+ 8) | modèle accepté par l'évaluateur |
| 11 | **Matchs finaux** du candidat, par priorité (graines 888 = profondeur 8, 777 = temps égal et profondeur 6) : contre **n123** prof. 8 (400 paires, 38 min) ; [contre T si T était le meilleur, 38 min] ; n123 **temps égal** (300 paires, 35 min) ; **V1b** prof. 8 (38) ; **V0** prof. 8 (33) ; V1b temps égal (35) ; V0 temps égal (35) ; puis profondeur 6 contre n123, V1b, V0 (3 × 4) | ≈ 226 min | Elo [IC 95 % par paires] ; **« MODÈLE LE PLUS FORT »** = le candidat si IC 95 % > 0 contre n123 à profondeur 8 ET Elo > 0 à temps égal, sinon **n123 reste la référence** |
| | **Total** | **≈ 12,7 à 13,3 h** | fin estimée **08h40–08h50**, échéance 09h30 (marge ≈ 45 min), arrêt de sécurité 09h50 |

### 4. Garde-fous
- **Échéance** (`--deadline`, défaut 09h30 suivant le premier lancement, figée dans l'état) : la taille de chaque match final est décidée à son lancement : réduite (multiple de 10 paires, 8 % de réserve) si le temps manque, **sautée sous 100 paires** ; arrêt de sécurité à échéance + 20 min (tue le calcul, écrit le récapitulatif ; les parties jouées restent, relancer la même commande reprend).
- **Reprise** : relancer EXACTEMENT la même commande (étapes terminées sautées ; auto-jeu et matchs reprennent ; tailles décidées figées). Veille Windows bloquée (`sleep.mjs`). Mémoire libre < 2,5 Go au lancement d'une étape lourde : 4 workers automatiquement (`--workers 4` pour l'imposer).
- Un échec de la branche T ou de F1 n'arrête PAS la chaîne (n123 reste le meilleur) ; l'auto-jeu, `verify` et le réentraînement sont indispensables (arrêt net). Aucune donnée nominative hors `tests/pdn-local/` et `training/data/` ; les modèles (`training/models/`) et le rapport n'en contiennent pas.

### 5. Tests faits (très petite échelle, sorties `essai4*` supprimées ensuite)
- Chaîne complète avec `--tiny` (profondeur 3-4, 6-8 paires, 16 parties) dans plusieurs scénarios : parcours naturel (n123 reste le meilleur, F1 écartée) ; **T et F1 forcés** (auto-jeu avec F1, F1 par-dessus n1234, match supplémentaire « contre T ») ; **échéance proche** (tous les matchs finaux de profondeur 8 et à temps égal sautés proprement, récapitulatif « indéterminé ») ; **auto-jeu borné** (8 000 parties demandées, arrêt à l'heure à 580 parties, ligne tronquée retirée, `verify` : 580 parties légales) ; **reprise** (`--stop-after`, puis même commande : étapes terminées sautées).
- **Essais nommés** : `essai4e` (auto-jeu borné : 8 000 parties demandées, échéance proche → arrêt à l'heure à **580 parties**, ligne finale tronquée retirée, `verify.mjs` : 580 parties légales, aucune échec) ; `essai4f` (**reprise** : `--stop-after match-ta-d6`, puis la même commande : positions, trois apprentissages et deux matchs sautés comme « déjà terminés », chaîne finie, « n123 reste la référence ») ; `essai4d` (échéance proche : 6 matchs finaux sautés proprement) ; `essai4b` (T et F1 forcés) ; `essai4g` (reprise après le dernier correctif : arrêt volontaire puis fin normale). Nombre de parties d'auto-jeu prévu pour le vrai lancement : **≈ 10 000** (départ 19h45 ; ≈ 9 600 pour un départ à 20h00 ; ≈ 9 100 si T devient le meilleur), calculé et figé au lancement de l'étape ; échéance **09h30** (arrêt de sécurité 09h50).
- `node tests/td-positions.mjs` : 15 vérifications (plateaux, camp, compteur, absence de prise, hors ouverture, ordre, filtre Elo any/both, reproductibilité, aucun nom écrit) ; `tests/fit.mjs` et `tests/fit-struct.mjs` verts.
- **Référence pour lire les résultats de T** : un bruit aléatoire de ±10 cp sur les tables de n123 lui fait perdre **−48 Elo [−79 ; −17]** (profondeur 5, 150 paires, graine 777) ; Tb (réglage fin, essai minuscule) : −53 [−87 ; −19]. Les tables de n123 sont sensibles aux perturbations : **le résultat le plus probable de l'étape 4 est « n123 reste le meilleur »**, et ce serait une réponse valide à la question posée (résultats réels contre scores de recherche).
- **Non testé à pleine échelle** : la conversion des 206 683 parties et les ajustements sur 2,4 M positions (mesurés seulement sur 72 000 parties / 860 000 positions : 19 s et 14 s) ; les durées des matchs et de l'auto-jeu viennent des nuits 2 et 3.

### 6. Limites connues
- Les nuits 1 et 2 ont été jouées SANS les règles de finale 6.3/6.4, les nuits 3 et 4 AVEC : le réentraînement n1234 mélange les deux régimes (comme n123). `n1234` est appris sur les scores de recherche (λ = 0) : l'information des parties réelles n'y entre qu'à travers le modèle qui a joué la nuit 4 (si T gagne l'étape 4).
- Trois candidats T et un seul confirmé à profondeur 8 (autre graine) : le risque de « meilleur de trois » est limité par cette confirmation, pas supprimé. Les matchs à temps égal ne sont pas reproductibles (machine au repos exigée : ne rien lancer d'autre pendant la nuit). F1 coûte ≈ +35 % de nœuds : l'auto-jeu avec F1 est ralenti (≈ −25 %, pris en compte dans le nombre de parties).
- n123, V1b et V0 sont les seuls adversaires demandés ; la force contre des humains ou un autre moteur n'est pas mesurée.

### 7. Lancement (PowerShell, depuis `C:\Users\micka\DamikA`)
```
node training/chain-nuit4.mjs
```
Aperçu sans rien lancer : `node training/chain-nuit4.mjs --dry-run --start 19:45`. Reprise après un arrêt : la même commande. Si la mémoire est juste : `node training/chain-nuit4.mjs --workers 4`. Résultat : `training/logs/chain-nuit4.resume.txt` (ligne « MODÈLE LE PLUS FORT »).

## Chantier « culture stratégique » (22/10/2026) — LECTURE ET CONCEPTION SEULEMENT, aucun code, rien de commité
- **Fait** : 4 notes courtes dans `tests/pdn-local/strategie-ffjd/` (dossier ignoré par git, vérifié) : `notes-A-notions.md` (notions en mots propres, conseils de Mickaël), `notes-B-compteurs.md` (compteur mesurable par notion, coût), `notes-C-diagrammes.md` (faisabilité du décodage des diagrammes), `notes-D-plan-tests.md` (lots, apprentissage, arène, non-régression Scan).
- **Constat clé** : tout ce qui est « pièce sur case » (centre, pion dormeur 46/5, case 27/24, temps total) est DÉJÀ dans les tables de n123 ; seuls les termes multi-pièces (entrave par pièce adverse, majorité locale par aile, chaînes de 3, mobilité) sont à ajouter. L'opposition exige le camp au trait : impossible sans toucher à l'architecture.
- **Termes à définir par Mickaël** (je n'invente pas) : enchaînement Weiss, trèfle, marchand de bois, pion Molimard, sens exact du pion taquin (24) et de la case 27.
- **Diagrammes FFJD** : faisable SOUS RÉSERVE, non vérifié (aucun échantillon ni téléchargement) ; il faut 3 à 5 adresses d'images pour trancher la numérotation > 50.
- **Plan** : 5 lots appris ensemble (`fit.mjs`, résultats de parties réelles, ancré n123), jugés à temps égal, ≥ 400 paires, IC 95 % > 0 puis confirmation graine 888 ; ordre L2 ailes → L1 entraves → L5 dames → L4 passage → L3 formations ; jeux A/B/C tirés des parties contre Scan en non-régression.
- **Reste à faire** : (1) Mickaël : définitions des termes ci-dessus, adresses d'images, PDN contre Scan dans `tests/pdn-local/scan/` ; (2) lire les valeurs de n123 sur 46/5/27/24 ; (3) feu vert pour coder les compteurs (registre `FEATURES`) ; état de référence : nuit 4 terminée, n123 reste le meilleur (F1 écartée à temps égal : −13,9 [−35,5 ; +7,6]).

## « Culture stratégique », suite : marchand de bois et faux marchand de bois (22/10/2026) — LECTURE ET CONCEPTION SEULEMENT, aucun code moteur/appli/training, rien de commité
- **Fait** : `tests/pdn-local/strategie-ffjd/notes-E-marchand-de-bois.md` (cases exactes des deux camps, vrai / faux, dégagements, compteurs `mdb` `fmdb` `mdbn` `fmdbn` au format `FEATURES`, autres formations du document) et `positions-E.json` (88 positions, diagrammes 8 à 95). Notes A, B, D corrigées : le coup Weiss est une combinaison, pas un compteur.
- **Méthode** : positions lues dans le dessin vectoriel du PDF (pas à l'œil) ; chacune des 88 lignes du texte rejouée avec `rules.js` : 88/88 légales (cases et trait confirmés). Un seul `incertain` : MDB-d12 (trait déduit).
- **Données** : dossier ignoré par git (vérifié) ; aucun texte du document recopié ; extracteur et vérificateur laissés hors dépôt (dossier temporaire de la session).
- **Reste à faire** : (1) mesurer la fréquence et l'effet de `mdb` / `fmdb` sur les parties réelles AVANT tout code moteur ; (2) suite tactique « attaquant et victime » avec les positions et leurs miroirs, référence n123 ; (3) définitions encore manquantes (Molimard, tenailles, pion taquin 24, case 27) ; (4) feu vert de Mickaël pour coder les compteurs.

## Marchand de bois : validation et mesure sur parties réelles (23/10/2026) — LECTURE/MESURE SEULEMENT, aucun code moteur/appli/training, rien de commité
- **Fait** (tout dans `tests/pdn-local/strategie-ffjd/`, ignoré par git, rien dans `data/`) : `mdb-lib.mjs` (les 4 compteurs, autonomes), `mdb-unit.mjs` (étape 1), `mdb-scan.mjs` (extraction, 70 s) + `mdb-analyse.mjs` (statistiques), rapports `rapport-unit-mdb.txt` et **`rapport-mdb-detaille.md`** (tous les tableaux, IC, méthode). `tests/pdn-local/scan/` n'existe pas : aucune partie contre Scan mesurée.
- **Étape 1 (88 positions de `positions-E.json`)** : diagramme 85/88, après la ligne 80/87 (1 position sans ligne), miroirs de position 88/88 et de ligne rejouée avec rules.js 87/87, 704/704 contrôles négatifs ou de transition (case requise retirée, dame à la place d'un pion, exclusivité `mdb`/`fmdb`), `mdbn` = 6, 6, 4 comme le texte (d8, d9, d10). **Les 10 écarts (3 au diagramme, 7 après la ligne) viennent des annotations, pas des compteurs** : la structure annotée ne respecte pas la définition écrite (pion adverse requis absent : 29 pour d26/d27 au diagramme ; 33 et 29 en fin de ligne pour d26/d27/d43/d44 ; 22 pour d48 au diagramme et d47/d70 en fin de ligne ; 18 pour d81 en fin de ligne, mais présent aux coups 0, 1, 2 et 4). d12 n'a pas de ligne : « après la ligne » sans objet. À trancher par Mickaël : annotation lâche ou définition trop stricte du « faux » (version stricte mesurée ici).
- **Étape 2 : 206 683 parties** (`td-propre.pdn`, Elo min ≥ 2100 ; 152 917 avec les deux Elo pour les contrôles). Rejeu FastBoard, et 10 421 parties rejouées EN PARALLÈLE avec **rules.js** (1,06 M de demi-coups : 0 écart de plateau, 0 écart de détection). Temps = demi-coup ; unité = (partie, structure, détenteur) à la 1ʳᵉ série de ≥ 3 temps. Contrôles de l'effet : écart d'Elo (attendu calibré, strates), matériel et phase (régression sur 1,2 M de positions), **évaluation n123 elle-même** (ce que les tables savent déjà), IC groupés par joueur (identifiant HACHÉ local, jamais un nom) et attendu corrigé de la force du joueur.
- **Fréquence** (parties avec une série ≥ 3 temps / durée moyenne / part des positions) : `mdb` 8,5 % / 17 temps / 1,6 % ; `fmdb` 17,3 % / 10,6 temps / 2,4 % ; les deux fréquents (> 1 %). Apparition moyenne : ply 42 (`mdb`), 33 (`fmdb`).
- **Effet, en points de score du détenteur, IC 95 % groupé par joueur, après Elo + matériel + évaluation n123** (1 point ≈ 12 cp d'évaluation, ≈ 7 Elo) : **`mdb` présence −0,1 [−0,8 ; +0,6] : aucun effet** (le brut +1,75 est entièrement dû à l'Elo : les détenteurs sont plus forts). **`mdbn` : pente +0,57 [+0,33 ; +0,81] par pion bloqué** (robuste : +0,46 avec l'effet joueur) ; n ≥ 8 (37 % des cas) +1,9 [+1,0 ; +2,8], n ≤ 6 négatif (−1 à −2,3) : forme en seuil, pas linéaire. **`fmdb` : −1,0 [−1,5 ; −0,5]** (−0,8 avec l'effet joueur), concentré en début de partie (31–40 pièces −1,7, ≤ 20 pièces +1,4). **`fmdbn` : pente −0,48 [−0,69 ; −0,28]** (≈ neutre à n = 2 et 4, −1,1 à n = 3, −1,9 à n ≥ 5). Les tables n123 n'expliquent PAS ces écarts (résultats quasi identiques avant et après le contrôle n123).
- **Issue** (séries ≥ 3 temps) : `mdb` dissous par la VICTIME dans 71 % des cas (offre de pion 18 % dont 96 % des offres types 34-30 / 35-30 ou 17-21 / 16-21 ; prise 30 % ; 18 ou 22 quitte la case 18 % ; reprise 5 %), par le DÉTENTEUR dans 26 % (24 % bloqueur déplacé), fin de partie 3 % ; 8 % des `mdb` deviennent `fmdb` (le 26 part). Rupture avec prise : échange à nombre égal 30 % (« 2 pour 2 » 20 %), gain matériel du détenteur 37 %, de la victime 33 %. `fmdb` : victime 43 %, détenteur 55 % (54 % bloqueur déplacé), échange égal 63 % (« 1 pour 1 » 40 %). Quand le détenteur défait lui-même sa structure, il fait moins bien que prévu (`mdb` −2,2, `fmdb` −1,6 points) ; quand la victime la défait, ≈ 0.
- **Verdict pour le lot de termes (L3, `fit.mjs`)** : **ENTRER : `mdbn`** (seul effet positif, conforme au document, robuste), avec `mdb` comme simple porteur (sans lui `mdbn` n'a pas de sens ; sa présence seule n'apporte rien). **ENTRER avec réserve : `fmdb` + `fmdbn`** en paire, signe LIBRE (le fit décide ; effet négatif et début de partie, corrélation observée non démontrée causale). **ÉCARTER : `mdb` comme bonus autonome.** Gain attendu en arène : très faible (≈ +7 cp par pion bloqué, ≈ −12 cp pour `fmdb`, dans 2 % des positions) : priorité basse, à tester à temps égal comme prévu (notes D), jamais à profondeur fixe seule.
- **Limites** : observationnel (corrélation, pas cause) ; 3 temps exigés = structure ayant survécu 2 demi-coups ; Elo de la base d'époques variées ; ~6 tests principaux (les trois effets retenus passent une correction de Bonferroni, `mdb` présence non) ; sous-groupes par phase ou par camp exploratoires ; version STRICTE de `fmdb` (18 et 22 exigés) ; aucune partie contre Scan.
- **P2 — grande diagonale (23/10/2026, détail : `rapport-mdb-detaille.md` § 5)** : dg = pions du détenteur sur 5, 10, 41, 46, au 3ᵉ temps ; il vaut 0, 1 ou 2 (≥ 3 : 2 cas), contrôles identiques à P1 (Elo, matériel, n123, IC groupés par joueur). **`mdb` : pas d'effet diagonale monotone** : pente +0,6 [−0,3 ; +1,6] par pion, moyennes 0 / 1 / 2 = −0,7 / +0,7 / −0,8 (N = 6852 / 5244 / 896), courbure p = 0,04 ; « 0 pion = meilleur » n'est PAS retrouvé (0 est le pire chez les Blancs, −1,3 *) ; seule la finale ≤ 20 pièces le suggère (dg 0 : +3,0 *, mais dg ≥ 1 trop rare †). → modulateur diagonale **écarté** pour `mdb`.
- **`fmdb` : l'effet existe, décroissant, en PALIERS** : 0 / 1 / 2 = +0,2 / −0,4 / **−3,2** [−4,0 ; −2,3] (pente −1,7 par pion [−2,1 ; −1,2], −1,25 avec l'effet joueur ; courbure p = 0,013, 0,09 avec l'effet joueur) ; porté par les détenteurs Noirs (dg 2 = pions 5 et 10 en place, début de partie : peut être un indice d'ouverture, pas une cause). → **entre dans le lot comme indicateur de palier** `fmdb × [dg = 2]`, pas comme pente (signe libre, appris).
- **Trouvaille non demandée, la plus nette** : pion adverse en 23 (e23). `mdb` : −3,0 [−4,2 ; −1,9] point (absent +1,7, présent −1,4), stable selon dg (−3,2 / −2,8), selon n (−3,2 / −3,8 / −1,6) et avec l'effet joueur ; conforme au dégagement 17-21 du texte. → **indicateur `mdb × [e23]` à entrer en priorité** (avant tout modulateur diagonale). `fmdb` × e23 : −1,0 [−1,8 ; −0,2] mais seulement à dg 0 (−3,7) : réserve.
- Réserves : une seule hypothèse posée d'avance (la diagonale) ; phase, n, e23 = croisements exploratoires non corrigés ; cellules < 300 marquées † ; observationnel. Aucun code moteur, rien de commité.

## Pion 46 × aile gauche non développée — P3 (23/10/2026) — LECTURE/MESURE SEULEMENT, rien de commité (détail : `tests/pdn-local/strategie-ffjd/rapport-pion46-detaille.md`)
- **Mesure** : 152 917 parties avec les deux Elo, 2,05 M de lignes (partie, camp, ply 16/24/32/40/48), 10 421 parties rejouées aussi avec rules.js (0 écart), contrôles Elo / matériel / n123 / joueur, IC groupés par joueur. Écart = p46 = 1 moins p46 = 0, en points de score du camp (1 point ≈ 12 cp).
- **L'effet existe, il est négatif et il grandit avec le temps** (contrôlé n123) : ply 16 −0,2 [−0,5 ; +0,1] (nul), 24 −1,0, 32 −1,6, 40 −2,1, 48 **−2,7** [−3,1 ; −2,4] ; identique pour les Blancs (46) et les Noirs (5), inchangé avec l'effet joueur et en retirant les parties courtes (< ply + 20 demi-coups : 0,6 à 4,8 % des lignes). n123 connaît déjà la case 46 mais pas ce coût : brut et contrôlé sont presque égaux.
- **Il n'est PAS contextuel comme annoncé** : négatif dans toutes les strates mesurables de g et de phase (21–30 pièces : −1,7 / −2,1 / −1,7 pour g ≤ 3 / 4–5 / ≥ 6 ; > 30 pièces : −3,8 † / −1,1 / −0,8) ; l'interaction « g ≤ 3 moins g ≥ 6 » vaut −0,9 [−2,0 ; +0,3], de signe contraire à l'hypothèse (pas de pénalité plus forte quand l'aile est non développée). Seule cellule positive : ≤ 20 pièces et g ≤ 3, **+1,0 [−5,4 ; +7,3], 118 lignes †, non significative**. g seul (sans le 46) n'est pas pénalisant (+0,3 à +0,8) : le coût vient du pion 46 en place, pas de l'aile.
- **Verdict pour le lot de `fit.mjs`** : **entre `p46` SEUL** (indicateur du camp, symétrique Blancs − Noirs, poids appris PAR PHASE ; le coût croît avec la durée donc la phase suffit), **pas `p46 × strate de g`** (aucune structure en g à apprendre). Gain attendu en arène : faible mais plausible (−12 à −33 cp dans 20 à 77 % des positions selon le ply), à juger à temps égal.
- Réserves : observationnel (garder le 46 peut refléter un jeu passif, pas un défaut du pion) ; strates de g fixées d'avance, cellules < 300 marquées † ; un ply de référence = une position, pas la durée réelle du blocage (non mesurée).

## P4 — Éditeur de position (23/10/2026) — NON commité, NON déployé, en attente de validation à l'œil par Mickaël
- **Plan** : logique PURE dans `js/position-editor.js` (pose/effacement, validation, construction de la partie) ; DOM seulement dans `js/main.js` (bloc « éditeur de position ») ; barre d'édition sous le damier (`#editor-bar`, `index.html`, fin de `css/style.css`). Moteur de règles, évaluation, modèles et `training/` NON touchés.
- **Fonctionnement** : bouton « ✎ Éditer une position » (barre du haut). Palette Pion blanc / Pion noir / Dame blanche / Dame noire / Gomme (reposer la même pièce sur une case l'efface), « Vider », « Position initiale », trait Blancs / Noirs, compteur de pièces en direct. « Analyser » valide (messages en français, listés sous la palette), remplace la partie (historique et futur vides, trait choisi, en-tête « Position éditée », comme « Nouvelle partie ») et ACTIVE l'analyse existante (moteur V0/V1b du menu). « Annuler » ou Échap : la partie précédente n'a jamais été touchée, et l'analyse reprend si elle était active.
- **Validation** : ≤ 20 pièces par camp, ≥ 1 par camp, pas de pion blanc sur 1-5, pas de pion noir sur 46-50, trait choisi, et camp au trait avec au moins un coup (sinon « partie déjà terminée »). Case claire : impossible à cliquer (numérotation 1-50 seule).
- **Tests** : `node tests/position-editor.mjs` (30 contrôles, verts). Cas de référence : dame blanche 28, pions noirs 14 et 37, pion blanc 46 → exactement 3 prises (28x5, 28x10, 28x41), un seul pion pris à chaque fois, l'autre reste ; l'analyse propose 28x41. **Navigateur** (127.0.0.1:8934, clics simulés sur le canvas) : pose, validation, Analyser (« Mat en 4 », flèche verte), prise 28x5 jouée (le pion 37 reste), Échap, mise en page à 390 px (aucun débordement horizontal).
- **Point à décider — pion blanc en 5** : « pions blancs 5 et 46 » de la position de Patrick est REFUSÉ par la règle demandée (5 est sur la rangée de promotion des Blancs). Je l'ai gardé refusé (message clair) ; à confirmer : s'agit-il d'une dame en 5 (acceptée) ou la règle doit-elle être assouplie ?
- **Limites** : (1) la partie éditée ne part pas de la position initiale : exporter en PDN/lien/ajouter à la Bibliothèque produirait un fichier SANS la position de départ (pas de balise FEN/Setup) ; après F5 la partie éditée est restaurée depuis la position initiale (le PDN sauvegardé n'a pas de départ) ; (2) pas de glisser-déposer ni de peinture continue, un clic = une case ; (3) pendant l'édition flèches, molette, Espace et A sont désactivés ; « Nouvelle partie » ou un chargement ferment l'éditeur ; (4) le compteur de temps et les limites de finale 6.3/6.4 repartent de la position éditée (pas de coups antérieurs).
- P5 terminé, commits 1f6cfde et 921f18d, non poussés
- P6 : version 856ceb5f-2fed-49f4-bfdf-f6df48c823d3 (éditeur de position P4) déployée à 100 % le 27/10/2026. Commits non poussés.

## P7 — Glossaire v2 : fusion des définitions (30/10/2026) — LECTURE ET RÉDACTION SEULEMENT, rien de commité
- **Plan** : lecture de l'INDEX et des notes A à Y (+ rapports en recoupement), fusion des variantes de nom, une entrée par terme (définition courte en mots propres, cases FMJD et miroir, sources, statut, mesurable), tri en lots de 10 par utilité pour la partie classique. Aucun livre relu, aucun code, rien dans `data/` ni dans un dossier suivi par git.
- **Fichier** : `tests/pdn-local/strategie-ffjd/glossaire-v2.md` (ignoré par git). Ligne ajoutée dans `INDEX.md`.
- **Chiffres** : 110 termes, 11 lots de 10, 3 termes reportés (triangle savant / zone Drenth, losange Barteling, pion kerkov), 15 conflits entre sources signalés avec leurs deux versions et non tranchés, liste des termes cités sans définition en fin de fichier.
- **Écart avec la consigne** : `claude/damika-glossaire.md` (projet Claude) est absent du dépôt local ; les décisions tranchées ont été appliquées telles que listées dans la consigne P7.
- **À valider par Mickaël** : lot par lot ; points d'attention : conflits 4 (Ghestem et trèfle), 6 (faux marchand de bois / batterie Tchijov), 8 (pion 15 / 36), 10 (piquet canadien) ; identité EAD = « 3 contre 5 » vue de l'autre couleur (déduite par miroir, terme 26).
- P7 terminé

## P8 — Scan des 5 notions de la partie classique sur td-propre (30/10/2026) — MESURE SEULEMENT, rien de commité
- **Plan** : cadre de `mdb-scan.mjs` (td-propre.pdn, Elo min 2100, rejeu FastBoard, 1 partie sur 20 rejouée avec rules.js, n123 en lecture seule). Détecteurs `p8-lib.mjs` testés AVANT le scan par `p8-unit.mjs` (77 diagrammes à la main + 30 000 plateaux aléatoires contre une version naïve : 0 écart). Critère principal déclaré d'avance : résultat du détenteur − résultat attendu d'après n123 (courbe calculée par demi-coup), t = 24 à 48, IC par rééchantillonnage de joueurs (10 000 tirages), comparaison appariée (demi-coup, camp, Elo, éval, écart de temps). Tout le reste exploratoire.
- **Fichiers** (tous dans `tests/pdn-local/strategie-ffjd/`, ignorés par git, aucun nom) : `p8-scan.mjs`, `p8-analyse.mjs`, `p8-lib.mjs`, `p8-unit.mjs`, `p8-scan-out/` (games.jsonl, summary.json), `p8-stats.json`, `rapport-p8-detaille.md` (résumé pour Mickaël en tête, source `p8-resume.md`).
- **Durée / volume** : scan 80 s, analyse ≈ 170 s ; 206 683 parties (21 043 066 demi-coups), 1 415 799 positions (t = 16, 24, …, 64), 2 831 598 unités (position × détenteur), 979 884 séries ; rejeu de contrôle : 10 421 parties, 1 061 248 demi-coups, 0 écart (plateau, temps, détection). Base : Elo maximal 2476, la tranche 2500+ est vide.
- **Un chiffre clé par notion** (excès sur n123, points de score, t = 24..48) : Ghestem −2,5 [−3,6 ; −1,5] sans trèfle adverse (−6 si le pion reste ≥ 6 demi-coups) ; trèfle +0,1 [−0,9 ; +1,0] (le gain observé avec 4 à 6 pions bloqués vient du blocage : même gain sans trèfle ; à bloqués égaux +0,8 / +0,3) ; majorité d'aile −0,2 [−1,1 ; +0,7] ; centre soutenu +1,5 [+0,6 ; +2,4] (apparié +1,9 [+1,6 ; +2,2]) ; écart de temps × fermé : camp en retard, fermé − ouvert = +0,66 [+0,36 ; +0,95].
- **Conflits du glossaire** : CONFLIT-1 sans effet (0 ou 1 : même tranche dans 96,8 % des positions, +0,66 contre +0,52) ; CONFLIT-4 non tranché (avec − sans = +0,7 [−1,3 ; +2,6], les deux négatives) ; CONFLIT-5 : cas courant 3 bloqués (41 %), gain à partir de 4, « 6 » = 0,2 % des trèfles.
- **Recommandations** (sans coder) : centre soutenu à injecter dans le prochain lot d'essai (arène à temps égal d'abord) ; Ghestem, compteur de pions bloqués dans la zone du trèfle et écart × fermé à creuser ; trèfle et majorité d'aile à laisser. Point d'attention : Ghestem (pion en 22) se confond avec le pion kerkov / cimetière (reporté).
- P8 terminé

## P9 — Essai « centre soutenu » comme caractéristique apprise (31/10/2026) — ARRÊT à l'étape 4, rien de commité
- **Définition** (p8-lib.mjs, identique au rapport P8) : nombre de cases parmi 22-23-27-28-32-33 où le camp a un PION (pas une dame) dont les deux cases arrière sont occupées par une pièce alliée (pion ou dame) ; Noirs = miroir (n ↔ 51 − n). Compteur 0 à 6.
- **Code** : caractéristique `csoutenu` (max 6) ajoutée au registre `FEATURES` de `js/ai/eval-learned.js` (une seule définition pour l'évaluateur et l'apprentissage). `tests/eval-structure.mjs` : référence lente indépendante + 2 cas faits main ; vert. `eval-symmetry`, `endgame-rules`, `search-consistency` verts. Aucune modification de `main.js`, `data/models/`, `V1B_MODEL_PATH`.
- **Apprentissage** (base n123-l0.json, nuits 1+2+3, λ = 0, graine 1, validation 15 % des parties, α choisi sur la validation) : `training/models/p9-custom.json` (ajustement conjoint, α 1e-5) et `p9z-custom.json` (tables figées). Rapports `p9-fit-struct-report.json`, `p9z-fit-struct-report.json`. n123 non touché.
- **Résultat** : poids **négatifs** : −2 (conjoint) et −1 (tables figées) cp par case soutenue, dans les 3 phases ; gain de perte de validation ≈ 1e-6 nat/position (nul). Étape 4 de la consigne : arrêt, AUCUNE arène lancée, pas de mesure de vitesse.
- **Lecture** : avec λ = 0 les étiquettes sont des scores de recherche, qui contiennent déjà ce que n123 voit ; l'effet P8 (+1,5 à +1,9 points) vient des résultats de parties réelles, qu'on n'apprend pas ici. Piste non lancée (hors consigne) : ajustement ancré sur n123 avec les résultats des parties réelles (λ > 0, `--anchor` ne se combine pas avec `--features` : à adapter).
- **Rejouer** : `node training/fit.mjs --data training/data/selfplay-nuit-1,training/data/selfplay-nuit-2,training/data/selfplay-nuit-3 --base training/models/n123-l0.json --features csoutenu --lambda 0 --tag p9 --out training/models --grids none` (ajouter `--freeze-tables --tag p9z` pour tables figées).

## P11 — « centre soutenu » ajusté sur les résultats de parties RÉELLES, ancré sur n123 (31/10/2026) — ARRÊT après l'arène à profondeur 6, rien de commité
- **Données** : `training/data/td-positions-2100` (déjà produit par `training/td-positions.mjs`, Elo ≥ 2100 sur au moins un camp) réutilisé tel quel : 206 683 parties, 2 470 382 positions (12 par partie, à partir du demi-coup 16 : tout le milieu de partie, pas seulement 24-48), étiquette = résultat. Séparation PAR PARTIE (15 %, graine 1, fonction de hachage de l'identifiant de partie : une partie est soit en validation, soit en apprentissage). Aucun nom de joueur.
- **Outil** (`training/fit-struct-run.mjs`, comportement par défaut inchangé ; NB : l'analyseur d'arguments de `fit.mjs` donne à chaque option la valeur qui SUIT, donc écrire `--freeze-tables 1`, `--km-base 1`, `--score-from-base 1`) : `--km-base` (K_m = meilleur K de la base, pas de V0, en ajustement conjoint) ; `--score-from-base` (ces données n'ont aucun score de recherche : le score de la cible (1−λ)·σ(score/K_t) devient l'évaluation de n123, K_t = 154,4 cp). `--base n123-l0.json` fait déjà l'ancrage (L2 vers n123). Un premier lancement avait été faussé par l'oubli des valeurs (variantes figée et conjointe identiques) : écarté, tout relancé.
- **Résultats** (λ ∈ {0,5 ; 1}, `--game-weight` ∈ {0 ; 0,5}, α ∈ {1e-6…1e-2}, α = 1e-6 retenu partout) :

| variante | λ | poids `csoutenu` (≥ 30 / 15-29 / < 15 pièces) | gain de perte de validation |
|---|---|---|---|
| tables figées | 0,5 | +3 / +3 / +3 | 5,9·10⁻⁵ nat/position (contre n123 seul) |
| tables figées | 1 | +2 / +10 / −5 (signes mêlés) | 3,7·10⁻⁴ |
| conjoint | 0,5 | −3 / −3 / −3 | 8·10⁻⁶ contre le témoin (tables réajustées sans caractéristique) |
| conjoint | 1 | −6 / −6 / −6 | 6·10⁻⁵ contre le témoin |
  (game-weight 0,5 : mêmes poids.) Le gros de la baisse de perte (≈ 7·10⁻³ à λ = 1) vient du réajustement des TABLES, pas de la caractéristique.
- **Arène** (seul candidat à poids positif cohérent : `training/models/p11-frz-gw0--cs-l05.json`) contre n123, profondeur 6, 400 paires, graine 777 : **−7 Elo [−28 ; +13]** (A +284 =215 −301). Pas positif : mesure à temps égal NON lancée. Coût : évaluation ×3,2 (363 contre 113 ns/position), recherche 0,88× en nœuds/s (691 k contre 784 k), mêmes nœuds à profondeur 7.
- **Lecture** : l'effet de +1,5 à +1,9 point vu en P8 ne se retrouve pas comme poids utile : dès que les tables bougent, elles absorbent le signal et le poids de `csoutenu` devient négatif ; tables figées, il est de +3 cp, trop petit pour changer des coups. n123 reste le meilleur modèle. Non essayé : un compteur lié au trait / à l'écart de temps, ou des poids dépendant de la phase avec des données plus nombreuses.
- **Fichiers** : `training/models/p11-{frz,joint}-gw{0,0.5}--cs-l{05,1}.json` + `*-fit-struct-report.json` ; match : `training/data/p11-frz-l05-n123-d6/`. Rejouer : `node training/fit.mjs --data training/data/td-positions-2100 --base training/models/n123-l0.json --features csoutenu --features-name cs --lambda 0.5,1 --game-weight 0 --score-from-base 1 --freeze-tables 1 --alphas 1e-6,1e-5,1e-4,1e-3,1e-2 --tag p11-frz-gw0- --out training/models --grids none` (conjoint : `--km-base 1` au lieu de `--freeze-tables 1`) ; `node training/arena.mjs match --a learned:training/models/p11-frz-gw0--cs-l05.json --b learned:training/models/n123-l0.json --depth 6 --pairs 400 --seed 777 --workers 7 --out training/data/p11-frz-l05-n123-d6`.
- Tests verts : eval-symmetry, endgame-rules, search-consistency, eval-structure, fit-struct.

## P12 — Compteurs « pions adverses bloqués » par seuils, tables n123 figées (31/10/2026) — ARRÊT après l'arène à profondeur 6, rien de commité
- **Définition** (p8-lib.mjs, règle A, celle qui reproduit les chiffres du rapport P8 : +6 / +14 / +39 à 4 / 5 / 6 bloqués avec trèfle) : un pion ADVERSE est bloqué s'il est dans la zone {5, 14, 15, 19, 20, 24} (vue du camp qui bloque ; Noirs : image 51 − n) et que TOUTES ses cases avant existantes sont occupées (par n'importe quelle pièce). Comptée sans exiger le trèfle. La règle B (cases « battues » comptées bloquées, principale en P8) n'est pas codée : l'effet n'y apparaît pas (5 bloqués sans trèfle : +1,0 contre +16,5 en règle A).
- **Distribution** (td-positions-2100, 2 470 382 positions, règle A, 0 à 6 bloqués) : Blancs bloquent 1 370 209 / 622 607 / 360 610 / 90 395 / 24 960 / 1 572 / 29 ; Noirs bloquent 1 372 745 / 628 591 / 339 212 / 95 060 / 32 566 / 2 149 / 59. Seuil ≥ 6 inutilisable (≈ 0,002 %) : seuils retenus 3, 4, 5 (≥ 5 : ≈ 0,07 %).
- **Code** : `bloq3`, `bloq4`, `bloq5` (max 1 chacune, différence Blancs − Noirs d'un indicateur « ≥ N pions adverses bloqués ») dans `FEATURES` de `js/ai/eval-learned.js`, calculés dans la même passe que `blocked` (une seule définition). `tests/eval-structure.mjs` : référence lente indépendante (+ 4 cas faits main à 6 / 5 / 4 / 3 bloqués) ; eval-symmetry, endgame-rules, search-consistency, eval-structure, fit-struct verts.
- **Apprentissage** (outils P11 : td-positions-2100, graine 1, `--base n123-l0.json --score-from-base 1 --freeze-tables 1`, α 1e-6…1e-2, α = 1e-6 retenu ; poids identiques dans les 3 phases) :

| candidat | λ | bloq3 | bloq4 | bloq5 | gain de perte de validation (contre n123 seul) |
|---|---|---|---|---|---|
| tous ensemble | 0,5 | +4 | +7 | +41 | 4,2·10⁻⁵ |
| tous ensemble | 1 | +9 | +14 | +87 | 1,7·10⁻⁴ |
| bloq3 seul | 0,5 / 1 | +5 / +11 | | | 1,3·10⁻⁵ / 5,1·10⁻⁵ |
| bloq4 seul | 0,5 / 1 | | +13 / +27 | | 2,3·10⁻⁵ / 9,3·10⁻⁵ |
| bloq5 seul | 0,5 / 1 | | | +52 / +108 | 2,7·10⁻⁵ / 1,1·10⁻⁴ |
  Poids positifs et croissants avec le seuil (cumulatifs : un camp à 5 bloqués reçoit bloq3 + bloq4 + bloq5 ≈ +100 cp à λ = 1) ; gain petit mais plus net que pour `csoutenu` (P11).
- **Arène** contre n123, profondeur 6, 400 paires, graine 777 : `p12-all--all-l1` **−0 Elo [−17 ; +16]** (A +282 =235 −283) ; `p12-all--all-l05` **−3 [−18 ; +13]**. Aucune tendance : mesure à temps égal NON lancée. Coût (`p12-all--all-l1`) : évaluation ×3,2 (406 contre 125 ns/position), recherche 0,86× en nœuds/s (711 k contre 825 k), mêmes nœuds à profondeur 7.
- **Lecture** : la caractéristique est apprise de façon cohérente mais ne change pas le jeu : ≥ 4 bloqués ne concerne que ≈ 1 % des positions et ≥ 5 ≈ 0,07 %, et la recherche voit déjà le blocage de ces pions avant (profondeur 12 à 13). n123 reste le meilleur modèle.
- **Fichiers** : `training/models/p12-{all,b3,b4,b5}--{all,b3,b4,b5}-l{05,1}.json` + `p12-*-fit-struct-report.json` ; matchs : `training/data/p12-all-l{1,05}-n123-d6/`. Rejouer : `node training/fit.mjs --data training/data/td-positions-2100 --base training/models/n123-l0.json --features bloq3,bloq4,bloq5 --features-name all --lambda 0.5,1 --score-from-base 1 --freeze-tables 1 --alphas 1e-6,1e-5,1e-4,1e-3,1e-2 --tag p12-all- --out training/models --grids none` ; `node training/arena.mjs match --a learned:training/models/p12-all--all-l1.json --b learned:training/models/n123-l0.json --depth 6 --pairs 400 --seed 777 --workers 7 --out training/data/p12-all-l1-n123-d6`.

## P13 — Écart de temps × position fermée, tables n123 figées (31/10/2026) — ARRÊT à l'étape 4 (poids incohérents), pas d'arène, rien de commité
- **Définitions** (p8-lib.mjs / rapport P8) : temps = Σ par pion de (rangée de départ = 1 : Blancs 10 − rangée, Noirs rangée + 1), pions seulement, désactivé dès qu'une dame est présente ; écart = temps Blancs − temps Noirs ; le camp EN RETARD est celui qui a le moins de temps. Fermée (P8) = mobilité statique m = (couples pion / case avant vide, deux camps) / (nombre de pions) ≤ médiane de m AU MÊME DEMI-COUP. **Adaptation nécessaire** : l'évaluation ne connaît pas le demi-coup ; version retenue = (nombre total de cases avant libres) ≤ médiane de ce nombre à NOMBRE DE PIONS égal (table d'entiers `CLOSED_MAX_FREE`, 0 à 40 pions, tirée des positions sans dame de td-positions-2100 ; −1 = jamais fermée sous 4 pions). Part « fermée » : 43 % (t = 16), 55 à 63 % ensuite, 57 % au total.
- **Distribution** (td-positions-2100 : 2 470 382 positions, 2 312 474 sans dame), écart Blancs − Noirs borné à ±10, fermée / non fermée : −10 : 35 058 / 21 166 ; −9 : 15 058 / 9 669 ; −8 : 22 766 / 15 181 ; −7 : 29 227 / 20 203 ; −6 : 42 946 / 30 952 ; −5 : 52 465 / 38 538 ; −4 : 73 676 / 56 603 ; −3 : 85 665 / 64 764 ; −2 : 111 711 / 88 416 ; −1 : 118 391 / 91 922 ; 0 : 127 619 / 101 846 ; +1 : 123 390 / 97 285 ; +2 : 103 236 / 82 269 ; +3 : 92 570 / 71 203 ; +4 : 70 774 / 52 842 ; +5 : 59 047 / 43 261 ; +6 : 42 650 / 29 997 ; +7 : 34 715 / 23 337 ; +8 : 23 809 / 15 651 ; +9 : 18 884 / 11 653 ; +10 ou plus : 39 140 / 22 919. |écart| ≥ 3 / 5 / 7 : 1 266 389 / 698 292 / 358 436 positions, dont fermées 738 450 / 415 765 / 218 657 : seuils 3, 5, 7 gardés.
- **Code** : `tret3f`, `tret5f`, `tret7f` (max 1) dans `FEATURES` de `js/ai/eval-learned.js` : 1 si LE CAMP est en retard d'au moins 3 / 5 / 7 temps ET position fermée ET aucune dame ; différence Blancs − Noirs (calculés dans la passe de `blocked`, mêmes cases libres). `CLOSED_MAX_FREE` exportée. `tests/eval-structure.mjs` : référence lente indépendante sur la grille (la table de médianes y est une donnée), 2 cas faits main (dame désactive, miroir) et un contrôle sur 3 578 positions de parties réelles (si `training/data/td-positions-2100` est présent) : 0 écart, compteurs non nuls (tret3f 1 139, tret5f 674, tret7f 347). Tous les tests verts (eval-symmetry, endgame-rules, search-consistency, eval-structure, fit-struct).
- **Apprentissage** (outils P11/P12, graine 1, `--base n123-l0.json --score-from-base 1 --freeze-tables 1`, α 1e-6…1e-2, α = 1e-6 retenu) : poids par phase (≥ 30 / 15-29 / < 15 pièces) et gain de perte de validation contre n123 seul :

| candidat | λ | poids | gain |
|---|---|---|---|
| tous ensemble | 0,5 | tret3f −2, tret5f −1, tret7f −1 (global) | 1,1·10⁻⁵ |
| tous ensemble | 1 | tret3f +4 / −6 / −21, tret5f −2, tret7f −1 | 1,6·10⁻⁴ |
| tret3f seul | 0,5 / 1 | −3 / +3, −7, −23 | 1,0·10⁻⁵ / 1,6·10⁻⁴ |
| tret5f seul | 0,5 / 1 | −4 / +6, −10, −24 | 7,8·10⁻⁶ / 1,4·10⁻⁴ |
| tret7f seul | 0,5 / 1 | −4 / +10, −11, −23 | 4,7·10⁻⁶ / 7,3·10⁻⁵ |
  Poids NÉGATIFS à λ = 0,5, et à λ = 1 de signe mêlé (positif seulement dans la phase ≥ 30 pièces, négatif ensuite) ; jamais croissants avec le seuil : le signe attendu en P8 (le camp en retard de temps fait mieux en position fermée) n'est pas retrouvé comme poids utile par-dessus n123. Le petit gain à λ = 1 vient du choix de poids par phase (3 degrés de liberté de plus).
- **Arène** : NON lancée (règle de l'étape 4). n123 reste le meilleur modèle.
- **Fichiers** : `training/models/p13-{all,t3,t5,t7}--{all,t3,t5,t7}-l{05,1}.json` + `p13-*-fit-struct-report.json`. Rejouer : `node training/fit.mjs --data training/data/td-positions-2100 --base training/models/n123-l0.json --features tret3f,tret5f,tret7f --features-name all --lambda 0.5,1 --score-from-base 1 --freeze-tables 1 --alphas 1e-6,1e-5,1e-4,1e-3,1e-2 --tag p13-all- --out training/models --grids none`.

## P14 — Évaluation par MOTIFS (patterns) apprise sur parties réelles, par-dessus n123 (31/10/2026) — PREMIER SIGNAL POSITIF, rien de commité, rien intégré à l'appli
- **Principe** : éval = éval(n123, tables figées) + Σ_p T[phase][p][config du motif p] − Σ_p T[phase][p][config du motif p sur le plateau MIROIR]. 4 états par case (vide, pion blanc, pion noir, dame : un seul état « dame » pour les deux camps), poids entiers en cp, 3 phases (≥ 30 / 15-29 / < 15 pièces). Miroir exact (éval(miroir) = −éval). Nouveau fichier `js/ai/eval-patterns.js` (voisin de eval-learned.js, aucun comportement par défaut changé) ; fichier de modèle = tables de base + champ `patterns` (`createModelEvaluator` ; sans `patterns` = `createTableEvaluator`). Garde-fou : borne exacte = borne de la base + Σ (max − min) des tables de chaque motif ≤ 29 000, poids sur 16 bits. Branché dans l'arène par `training/game.mjs` (`learned:` reconnaît `patterns`) et `training/bench-eval.mjs`.
- **Jeu A** (`PATTERN_SETS.A`, cases FMJD) : 12 motifs de 5 cases : 6 losanges (case + 4 voisines diagonales) centrés en 27, 28, 22, 23, 32, 33 (centre, recouvrement) ; zigzags d'aile 16-21-26-31-36 et 15-20-25-30-35 ; lignes de fond 46-50 et 1-5 ; axe 25-30-35 : {25, 29, 30, 34, 35} et {24, 25, 29, 30, 34}. 12 × 4⁵ × 3 phases = **36 864 poids**.
- **Apprentissage** (`training/fit-patterns.mjs`, nouveau) : td-positions-2100 (206 379 parties, 2 470 382 positions ; 175 241 parties / 2 097 713 positions en apprentissage, 31 138 / 372 669 en validation, séparation par partie, graine 1, contrôle : aucune partie commune), logit = (éval_n123 + motifs)/K_t, K_t = 154,4 cp, cible λ·résultat + (1−λ)·σ(éval_n123/K_t) ; Adam par lots (4096, pas 0,005), L2 vers 0 en « pseudo-observations » c ∈ {10, 30, 100, 300, 1000} choisi sur la validation, arrêt anticipé (patience 3), poids arrondis en cp (la perte de validation est recalculée sur le modèle arrondi et l'évaluateur réel redonne l'ajustement sur 7 454 positions : 0 écart). Durée : 61 s pour toute la grille. Une 1re passe (pas 0,02) donnait déjà 8,9·10⁻³ (λ = 1).
- **Gain de perte de validation contre n123 seul** (c = 100 retenu partout) : λ = 0,5 : **2,7·10⁻³** nat/position (0,673423 → 0,670712) ; λ = 1 : **1,2·10⁻²** (0,673908 → 0,661836). Pour comparaison : compteurs P9-P13 ≈ 10⁻⁵ à 10⁻⁴ ; réajustement des tables n123 seul (P11, λ = 1) ≈ 7·10⁻³. |poids| max : 27 cp (λ = 0,5), 49 cp (λ = 1) ; ≈ 7 000 poids non nuls sur 36 864.
- **Arène contre n123** : λ = 1 (`p14-A-l1`) : profondeur 6, 400 paires, graine 777 : **−142 Elo [−165 ; −120]** (le gain de perte avec λ = 1 apprend les habitudes des joueurs humains, pas la force de jeu : même constat qu'à l'étape 3.2). λ = 0,5 (`p14-A-l05`) : profondeur 6, 400 paires, graine 777 : **+27 [+8 ; +46]** (A +313 =236 −251) ; **TEMPS ÉGAL** (`--depth 30 --time 100`, 200 paires, graine 888) : **+29 [+5 ; +53]** (A +128 =177 −95).
- **Coût** (`bench-eval`, p14-A-l05) : évaluation ×4,3 (434 contre 102 ns/position), recherche 0,84× en nœuds/s (710 k contre 849 k) et 139 k contre 124 k nœuds à la profondeur 7 ; le gain à temps égal est mesuré APRÈS ce coût. (Le coût de l'évaluation dépasse le ×2 prévu : boucle par motif sans branchement, 3 variantes essayées, la plus simple gardée ; non optimisé davantage.)
- **Les 10 configurations les plus marquantes** (λ = 0,5, ≥ 1 000 occurrences d'apprentissage, par |poids| ; poids du point de vue des Blancs ; `phase` 0 = plus de 30 pièces, 1 = 15 à 29 ; lecture en langage simple, À PRENDRE COMME UNE LECTURE, pas comme une explication prouvée) :
  1. −27 (> 30 pièces, 1 057 fois) : cases 24 noir, 25 blanc, 29 noir, 30 blanc, 34 blanc : deux pions noirs en 24 et 29 encadrent notre groupe 25-30-34, mauvais pour les Blancs.
  2. −25 (15-29 pièces, 2 105) : 25 blanc, 29 noir, 30 blanc, 34 blanc, 35 blanc : un pion noir planté en 29 au milieu de l'aile droite blanche.
  3. +24 (> 30, 2 729) : 25 blanc, 34 blanc, 35 NOIR, 29 et 30 vides : un pion noir isolé en 35, derrière nos lignes, bon pour les Blancs.
  4. +22 (> 30, 6 711) : 16 blanc, 26 blanc, 36 noir, 21 et 31 vides : même idée à gauche, un pion noir isolé en 36.
  5. −22 (> 30, 6 711) : 15 blanc, 25 noir, 35 noir, 20 et 30 vides : deux pions noirs tiennent le bord droit (25 et 35), bon pour les Noirs.
  6. +22 (15-29, 1 809) : 22, 17, 18 noirs contre 27, 28 blancs : le trio noir 22-17-18 face à la paire blanche 27-28 est bon pour les Blancs.
  7. −21 (> 30, 1 528) : ligne arrière blanche vide sauf un pion en 46 : plus de défenseurs sur la ligne de fond, mauvais pour les Blancs.
  8. +21 (> 30, 1 528) : même fait vu de l'autre côté (ligne 1-5 vide sauf un pion noir en 5).
  9. −21 (15-29, 13 198) : pion noir en 25 contre les quatre pions blancs 29, 30, 34, 35 : le pion noir en 25 gêne le groupe compact blanc.
  10. −21 (15-29, 1 363) : même groupe que 1 (24 noir, 25 blanc, 29 noir, 30 blanc, 34 blanc), à 15-29 pièces.
  Les poids restent modestes (≤ 27 cp ≈ un quart de pion) : l'effet vient du grand nombre de configurations, pas d'une seule. Les doublons miroir (7 et 8) sont les deux faces du même fait.
- **Limites / à faire avant toute intégration** : une seule mesure à temps égal (200 paires, IC [+5 ; +53], graine 888) et une à profondeur 6 ; pas de comparaison contre V1b / V0 ni contre un moteur externe ; entraîné et validé sur la MÊME base de parties humaines (la validation est par partie, mais les joueurs se retrouvent) ; aucune confirmation sur d'autres graines ni à profondeur 8 ; poids bien lus seulement phase par phase ; version « plus grande » (k = 6, plus de motifs) non essayée ; λ intermédiaires (0,25, 0,75) non essayés ; coût d'évaluation ×4,3 (recherche 0,84×). Le modèle `p14-A-l05.json` N'EST PAS dans `data/models/` et V1B_MODEL_PATH n'a pas bougé.
- **Fichiers** : `js/ai/eval-patterns.js`, `training/fit-patterns.mjs`, `tests/eval-patterns.mjs` (référence naïve avec plateau miroir explicite : 6 000 positions, 0 écart ; antisymétrie ; cas faits main ; garde-fous), modifications mineures de `training/game.mjs` et `training/bench-eval.mjs` ; modèles `training/models/p14-A-l05.json`, `p14-A-l1.json`, `p14-A-report.json` ; matchs `training/data/p14-A-l{05,1}-n123-d6/`, `training/data/p14-A-l05-n123-t100/`. Tests verts : eval-symmetry, endgame-rules, search-consistency, eval-structure, fit-struct, engine-select, eval-patterns.
- **Rejouer** : `node training/fit-patterns.mjs --lambda 0.5,1 --reg 10,30,100,300,1000 --lr 0.005 --epochs 40 --patience 3 --tag p14-A --out training/models` ; `node training/arena.mjs match --a learned:training/models/p14-A-l05.json --b learned:training/models/n123-l0.json --depth 6 --pairs 400 --seed 777 --workers 7 --out training/data/p14-A-l05-n123-d6` ; temps égal : `--depth 30 --time 100 --pairs 200 --seed 888`.

## P15 — Confirmation de p14-A-l05 (matchs seulement, aucun code)

- **Conclusion : le gain de P14 n'est PAS confirmé** (plausible au mieux, de l'ordre de quelques Elo, pas prouvé). Arrêt anticipé selon la règle (mesure 1 négative) : les mesures 2 (profondeur 8) et 3 (contre V1b) n'ont PAS été lancées.
- **Mesures** (candidat `p14-A-l05` contre `n123`, temps égal `--depth 30 --time 100`) :

| Mesure | Paires | Victoires / nulles / défaites | Elo [IC 95 % par paires] |
|---|---|---|---|
| P14, graine 888 | 200 | 128 / 177 / 95 | +29 [+5 ; +53] |
| P15, graine 999 | 400 | 237 / 314 / 249 | −5 [−23 ; +12] |
| Poolé (888 + 999) | 600 | 365 / 491 / 344 | +6 [−8 ; +20] |

- **Lecture** : la première mesure à temps égal était probablement une fluctuation favorable ; poolé, l'intervalle contient 0. Avec le coût de l'évaluation (×4,3), le gain à profondeur 6 (+27) ne se retrouve pas à temps égal. Pas d'intégration, pas de version plus grande à construire sans nouveau signe.
- **Rejouer** : `node training/arena.mjs match --a learned:training/models/p14-A-l05.json --b learned:training/models/n123-l0.json --depth 30 --time 100 --pairs 400 --seed 999 --workers 7 --out training/data/p15-1-t100-s999` (sortie dans `training/data/p15-1-t100-s999`). Poolé : regrouper les paires des deux dossiers `games.jsonl` (`p14-A-l05-n123-t100`, `p15-1-t100-s999`) et appeler `matchStats` de `training/stats.mjs`.
- Aucun commit ; `js/`, `data/models/`, `V1B_MODEL_PATH` et les modèles existants non touchés.

## P16 — Évaluation par motifs accélérée (mêmes scores, ×1,12 de n123 au lieu de ×4,4)

- **Résumé** : objectif de vitesse ATTEINT (évaluation ≤ ×2) sans toucher au moteur (étape 2a seulement). Gain à temps égal : **plausible mais non prouvé** (+14 Elo [−5 ; +33], 400 paires, graine 2026).
- **Profil** (positions réelles, 17 pièces en moyenne) : n123 seul 99 ns ; calcul des 24 indices (12 motifs × 2 vues) 315 ns ; lecture des 24 poids ≈ 23 ns ; total 430 ns. Le temps partait dans les 120 lectures de cases, chacune avec 4 accès à des tableaux de géométrie.
- **Optimisation** (`js/ai/eval-patterns.js`, `createFastModelEvaluator`) : code GÉNÉRÉ pour le jeu de motifs (`new Function`) : cases et décalages écrits en dur, une lecture de chacune des 50 cases, état par arithmétique (c − (c >> 2) ; vue miroir par échange des deux bits), phase choisie une fois, somme des tables de base dans la même fonction, poids en un seul `Int16Array`. Conditions : base sans caractéristiques de structure et phases 30/15/0 ou une seule ; sinon, ou si `new Function` est refusé (politique de sécurité), `createModelEvaluator` retombe sur la référence. L'ancienne version est gardée : `createReferenceModelEvaluator`. `eval-learned.js` : `pieceValueTable` exportée (seul changement). Ni FastBoard, ni la recherche, ni `main.js` n'ont changé (l'évaluation incrémentale (b) n'a pas été nécessaire).
- **Identité** (`tests/eval-patterns.mjs`) : 51 452 positions (24 777 avec dames, 26 675 sans ; phases ≥30 / 15-29 / <15 : 7 493 / 15 840 / 28 119), pour 4 modèles (tables aléatoires ±40 et ±300, p14-A-l05 entraîné, base à une phase) : rapide = référence ET éval(miroir) = −éval, 0 écart. Repli testé. Tests verts : eval-patterns, eval-symmetry, endgame-rules, search-consistency, eval-structure, fit-struct, engine-select, worker.
- **Vitesse** (`bench-eval.mjs`, 9 tours entrelacés) : n123 98 ns, 854 k nœuds/s ; p14 référence 436 ns (×4,43), 712 k (0,83×) ; **p14 rapide 110 ns (×1,12), 823 k nœuds/s (0,96×)** ; 139 k nœuds à la profondeur 7 (124 k pour n123).
- **Arène à temps égal** (`--depth 30 --time 100`, p14-A-l05 contre n123) :

| Mesure | Vitesse du modèle | Paires | V / N / D | Elo [IC 95 %] |
|---|---|---|---|---|
| graine 888 (P14) | lente (×4,3) | 200 | 128 / 177 / 95 | +29 [+5 ; +53] |
| graine 999 (P15) | lente (×4,3) | 400 | 237 / 314 / 249 | −5 [−23 ; +12] |
| graine 2026 (P16) | rapide (×1,12) | 400 | 262 / 308 / 230 | +14 [−5 ; +33] |
| poolé 888 + 999 (lente) | lente | 600 | 365 / 491 / 344 | +6 [−8 ; +20] |
| poolé des trois (MÉLANGE de deux vitesses) | | 1 000 | 627 / 799 / 574 | +9 [−2 ; +21] |

- **Lecture** : l'accélération ramène le coût à peu près à zéro, mais le gain à temps égal reste faible (+14, intervalle contenant 0). Le poolé des trois mélange deux vitesses : à lire avec prudence. Pistes si l'on poursuit : nouvelle mesure du modèle rapide (autre graine) ou profondeur 8 ; sinon l'effet réel est probablement de l'ordre de +10 Elo.
- **Rejouer** : `node tests/eval-patterns.mjs` ; `node training/bench-eval.mjs training/models/n123-l0.json ref:training/models/p14-A-l05.json training/models/p14-A-l05.json --rounds 9` ; `node training/arena.mjs match --a learned:training/models/p14-A-l05.json --b learned:training/models/n123-l0.json --depth 30 --time 100 --pairs 400 --seed 2026 --workers 7 --out training/data/p16-t100-s2026`.
- Fichiers modifiés : `js/ai/eval-patterns.js`, `js/ai/eval-learned.js` (un `export`), `tests/eval-patterns.mjs`, `training/bench-eval.mjs`. Rien commité ; `main.js`, `data/models/`, `V1B_MODEL_PATH` et le modèle p14-A-l05 non touchés.

## P17 — Évaluation par motifs, version plus grande (jeux B et C)

- **Résumé** : le jeu **B** (23 motifs de 5 cases) fait mieux que A de façon **claire mais modeste** : à temps égal, **+60 Elo [+47 ; +74]** contre n123 (800 paires, deux graines), contre +32 [+19 ; +45] pour A ; écart apparié B − A : +4,0 points de % de score [±2,6] sur 800 paires, intervalle hors de zéro (≈ +28 Elo). Le jeu **C** (14 briques de 6 cases) : +46 [+33 ; +59], écart avec A : +2,0 [±2,5], non établi. Le coût en vitesse reste faible (évaluation ×1,56 pour B, ×1,40 pour C ; nœuds par seconde 0,97× et 0,95× de n123). V1b reste le modèle de l'appli ; rien n'est intégré.
- **Découverte de conception** : un motif et sa rotation de 180° (mêmes cases, p ↔ 51−p) sont REDONDANTS (les Noirs lisent la même table sur le plateau miroir). Le jeu A contient 3 telles paires (losanges 28/23, ailes, lignes de fond) : il n'a que **9 motifs distincts sur 12**. B et C n'ont aucune paire redondante et couvrent les 50 cases ; le bloc auto-symétrique [22,23,24,27,28,29] (demi-capacité) a été écarté de C.
- **Jeux** (`PATTERN_SETS` dans `js/ai/eval-patterns.js`, A inchangé) : B = 12 losanges (centres 27-34, 37-40), 5 rangées de 5, 2 ailes, 2 axes, 2 zigzags : 70 656 poids ; C = 14 briques de 6 cases (2 × 3 sur les bandes de rangées, 2 blocs de bord) : 172 032 poids ; A : 36 864 poids. Identité rapide = référence et antisymétrie vérifiées sur ≈ 51 000 positions pour B et C (`tests/eval-patterns.mjs`, aussi comparaison à la référence naïve).
- **Apprentissage** (`training/fit-patterns.mjs`, td-positions-2100, validation 15 % des parties, graine 1, L2 c ∈ {10…3000}, arrêt anticipé, poids arrondis) : pas de surapprentissage notable (gain d'apprentissage ≥ gain de validation de 1 à 10 %).

| Modèle | λ | Perte de validation (n123 → modèle) | Poids non nuls | Elo profondeur 6 (200 paires, graine 777) |
|---|---|---|---|---|
| B | 0,25 | 0,6732 → 0,67263 | 10 088 | **+83 [+53 ; +115]** |
| B | 0,5 | 0,6734 → 0,67015 | 15 292 | +27 [0 ; +55] |
| B | 0,75 | 0,6737 → 0,66553 | 13 838 | −74 [−103 ; −46] |
| C | 0,25 | 0,6732 → 0,67255 | 12 928 | **+55 [+26 ; +85]** |
| C | 0,5 | 0,6734 → 0,67005 | 17 254 | +30 [0 ; +60] |
| C | 0,75 | 0,6737 → 0,66542 | 18 689 | −64 [−95 ; −34] |
| A (réf., P14) | 0,5 | 0,6734 → 0,6707 | ≈ 7 000 | +27 [+8 ; +46] (400 paires) |

  Plus λ est bas, mieux le modèle joue, alors que la perte de validation s'améliore avec λ : la perte ne prédit pas la force (même piège qu'en 3.2). Finalistes : B λ = 0,25 et C λ = 0,25. Piste non explorée : λ plus bas (0,1).
- **Coût** (`bench-eval.mjs`, 9 tours entrelacés, profondeur 7) : n123 100 ns, 807 k nœuds/s ; A 122 ns (×1,22), 787 k ; B 156 ns (×1,56), 784 k (0,97×) ; C 140 ns (×1,40), 768 k (0,95×).
- **Temps égal** (`--depth 30 --time 100`, contre n123, 400 paires par graine) :

| Modèle | Graine 3131 | Graine 4747 | Poolé (800 paires) |
|---|---|---|---|
| B λ = 0,25 | +57 [+39 ; +76] (305 / 320 / 175) | +64 [+45 ; +83] | **+60 [+47 ; +74]** (614 / 647 / 339) |
| C λ = 0,25 | +52 [+33 ; +70] (295 / 328 / 177) | +41 [+23 ; +58] | **+46 [+33 ; +59]** (576 / 659 / 365) |
| A (p14-A-l05) | +33 [+14 ; +52] (279 / 317 / 204) | +32 [+14 ; +50] (280 / 313 / 207) | **+32 [+19 ; +45]** (559 / 630 / 411) |

- **Lecture** : B > A est clair (apparié +4,0 [±2,6] points de %), C > A ne l'est pas. Contre n123, l'évaluation par motifs apporte de façon constante (+32 à +60 Elo à temps égal). Reste non mesuré : B contre V1b, B à profondeur 8, B contre A directement.
- **B contre V1b** (le modèle de l'appli ; temps égal, `--depth 30 --time 100`, 400 paires par graine, `training/data/p17-B-vs-v1b-t100-s3131` et `…-s4747`) :

| Graine | V / N / D | Elo [IC 95 %] |
|---|---|---|
| 3131 | 311 / 331 / 158 | +67 [+49 ; +86] |
| 4747 | 319 / 326 / 155 | +72 [+54 ; +91] |
| **Poolé (800 paires)** | 630 / 657 / 313 | **+70 [+57 ; +83]** (score 59,9 %) |

  Poolé calculé par `node training/pool.mjs training/data/p17-B-vs-v1b-t100-s3131 training/data/p17-B-vs-v1b-t100-s4747` (nouvel outil : regroupe les scores par paire).
- **Rejouer** : `node tests/eval-patterns.mjs` ; `node training/fit-patterns.mjs --set B --lambda 0.25 --tag p17-B …` (voir l'en-tête du script) ; `node training/arena.mjs match --a learned:training/models/p17-B-l025.json --b learned:training/models/n123-l0.json --depth 30 --time 100 --pairs 400 --seed 3131 --workers 7 --out training/data/p17-p17-B-l025-n123-t100-s3131` (idem graine 4747) ; `node training/bench-eval.mjs training/models/n123-l0.json training/models/p14-A-l05.json training/models/p17-B-l025.json training/models/p17-C-l025.json --rounds 9`.
- **Configurations marquantes de B λ = 0,25** (`training/models/p17-B-report.json`, champ `top`, poids en centipions du point de vue des Blancs)  :
  1. 15-29, motif 46-47-48-49-50 : 46:w 47:. 48:. 49:. 50:. → -14 cp (20472 occurrences)
  2. 15-29, motif 31-26-27-36-37 : 31:w 26:b 27:w 36:. 37:w → -11 cp (10864 occurrences)
  3. ≥ 30 pièces, motif 31-26-27-36-37 : 31:. 26:w 27:. 36:b 37:w → 10 cp (14124 occurrences)
  4. ≥ 30 pièces, motif 46-47-48-49-50 : 46:w 47:. 48:. 49:. 50:. → -10 cp (1528 occurrences)
  5. 15-29, motif 40-34-35-44-45 : 40:. 34:. 35:. 44:w 45:b → 10 cp (4901 occurrences)
  6. < 15, motif 37-31-32-41-42 : 37:w 31:b 32:. 41:. 42:w → 10 cp (1586 occurrences)
  7. ≥ 30 pièces, motif 30-24-25-34-35 : 30:w 24:w 25:. 34:. 35:. → -9 cp (2005 occurrences)
  8. ≥ 30 pièces, motif 30-24-25-34-35 : 30:w 24:w 25:b 34:w 35:w → -9 cp (1376 occurrences)
  9. ≥ 30 pièces, motif 32-27-28-37-38 : 32:. 27:b 28:b 37:. 38:w → -9 cp (3111 occurrences)
  10. ≥ 30 pièces, motif 46-47-48-49-50 : 46:. 47:. 48:w 49:. 50:w → 9 cp (28410 occurrences)
- Fichiers : `js/ai/eval-patterns.js` (B, C), `tests/eval-patterns.mjs` ; modèles `training/models/p17-{B,C}-l{025,05,075}.json` et `p17-{B,C}-report.json` ; données `training/data/p17-*`. Aucun commit ; `js/main.js`, `data/models/`, `V1B_MODEL_PATH` et les modèles existants non touchés.

## P18 — Intégration du modèle B (p17-B-l025) dans l'appli : moteur « V2b (motifs) »

- **Ce qui change** : un TROISIÈME moteur d'analyse, `v2b`, « V2b (motifs) » dans le menu 🎨 → « Moteur d'analyse » (ligne d'analyse : « … · moteur V2b »). V0 reste le moteur par défaut (`DEFAULT_ENGINE` inchangé) et V1b reste intact et sélectionnable : le réglage mémorisé `damika:analysis-engine` accepte maintenant `v2b`. Rien d'autre dans `js/main.js` (le menu est construit depuis `ENGINES`).
- **Code** : `js/ai/engines.js` : `ENGINES.v2b`, `B_MODEL_PATH = 'data/models/p17-B-l025.json'` (UNIQUE constante du chemin, comme `V1B_MODEL_PATH`), table interne `MODELS` (chemin + fabrique d'évaluateur par moteur ; v2b utilise `createModelEvaluator` de `eval-patterns.js` = évaluateur rapide à code généré, repli automatique sur la référence si `new Function` est refusé). `data/models/p17-B-l025.json` = COPIE de `training/models/p17-B-l025.json` (148 300 octets, contre 1 587 pour V1b ; test d'identité). Le message `analyse` du Worker accepte `engine: 'v2b'` (contrôleur et Worker inchangés).
- **Service Worker** (toujours désactivé) : `sw.js` mis à jour pour sa réactivation : `CACHE_NAME` `damika-v5`, `ASSETS` complété (modules `js/ai/*`, `js/pdn/storage.js`, `library-view`, `photo-match`, `position-editor`, modèles V1b et B). Chaque chemin vérifié (existe). Non testé en conditions réelles puisque le Service Worker n'est pas enregistré.
- **Vérifications** : `tests/eval-patterns.mjs`, `eval-symmetry`, `engine-select` (étendu : blocs G1-G5 pour v2b : copie identique, un seul chargement, antisymétrie miroir exacte et scores identiques à l'évaluateur du fichier sur 20 000 positions, |éval| max 4 336 < 29 000, Worker = analyseSync, nom affiché), `analysis-controller`, `analysis-format`, `worker-analyse`, `worker`, `eval-structure` : tous verts. `tests/bench-engines.mjs` accepte `--engine v2b`.
- **Vitesse** :
  - Dans le NAVIGATEUR (Chrome, Worker module, 3 positions, profondeur 9, 3 tours entrelacés) : V1b 750 k nœuds/s, **V2b 729 k (0,97×)** ; nœuds à profondeur égale 1,40 M contre 1,41 M ; démarrage d'un Worker neuf avec chargement du modèle : 37 ms (V1b) et 34 ms (V2b) ; profondeur atteinte en 1,5 s : 10,7 (V1b) contre 10,3 (V2b) ; `new Function` accepté (évaluateur rapide actif).
  - Sous Node (`bench-engines.mjs`, Worker, 5 positions) : V2b/V0 1,03× en temps à profondeur 8, 1,29× à profondeur 10 (V1b : 1,13× et 1,41×) ; profondeur en 1,5 s : V0 11,4, V1b 11,2, V2b 11,0 ; chargement du modèle ≈ 9 ms (V1b ≈ 3 ms).
- **Partie complète** : `training/data/p18-B-vs-v1b-t1500` (B contre V1b, 2 paires = 4 parties, 1,5 s par coup, profondeur 24, graine 18, via l'arène) : B +2 =1 −1 ; `training/verify.mjs` : 4 parties (544 demi-coups) rejouées avec `rules.js`, TOUTES légales. Limite : cette partie passe par l'arène (mêmes évaluateurs et recherche que le Worker), pas par l'interface ; la sélection V2b dans l'UI n'a été vérifiée que par le menu (3 entrées) et le Worker du navigateur, pas par une partie jouée à la souris.
- **Revenir à V1b** : rien à faire pour l'utilisateur (V1b est sélectionnable) ; pour retirer V2b : supprimer la ligne `v2b` d'`ENGINES` et l'entrée de `MODELS` dans `js/ai/engines.js` (une valeur `v2b` mémorisée est alors ignorée = V0). Pour faire de V2b le moteur par défaut : `DEFAULT_ENGINE = 'v2b'` (non fait : jauge non recalibrée pour B, `node tests/gauge-calibration.mjs` à refaire d'abord).
- **Pas fait** : jauge (`BAR_SCALE_CP`, paliers) non recalibrée pour B ; pas de test visuel dans l'interface ; ni push ni déploiement.

## P19 — Variété d'ouverture de V2b (SECTION PROVISOIRE : chantier mis en pause, mesure finale non faite)

- **Statut** : implémenté et testé ; la marge **M = 10** est retenue PROVISOIREMENT, SANS mesure finale du coût en force avec la version actuelle du code. Chantier mis en pause pour laisser le processeur à des parties jouées à la main.
- **Ce qui existait avant** : aucun livre d'ouvertures ; recherche alpha-bêta classique (seul le meilleur coup de la racine a un score exact, pas de multi-PV) : position de départ + même temps = toujours 32-27 comme premier coup.
- **Ce qui est fait** :
  - `js/ai/search.js` : option `variety = { margin, seed, prefer? }`. Après la recherche normale, chaque coup de la racine est testé une profondeur plus bas (`VARIETY_DEPTH_LAG = 1`) avec la fenêtre [meilleur − marge − 1, +∞[ ; candidats = coups à moins de `margin` cp du meilleur ; un coup non testé faute de temps est EXCLU (jamais un coup non vérifié ; `variety.unverified` les compte). Tirage pondéré par `drawVaried` (ne dépend que de la graine et de la position : même graine + même position = même coup) ; poids 0,3 pour 32-27 dans la position de départ (`VARIETY_START_WEIGHTS`). Budget de temps partagé : 60 % recherche normale (`VARIETY_SEARCH_SHARE`), 40 % tests. Pendant la recherche le meilleur coup n'est pas communiqué (il changerait à la fin). Le résultat porte `variety: { margin, depth, picked, forced, unverified, candidates: [{ move, score, weight }] }` ; score et coup affichés = ceux du coup tiré.
  - `js/ai/engines.js` : `OPENING_VARIETY = { margin: 10, plies: 10 }` (UNE définition : marge, et nombre de demi-coups pendant lesquels la variété s'applique, 5 par camp).
  - `js/ai/worker.js` : option honorée pour `engine === 'v2b'` SEULEMENT ; `js/ai/analysis-controller.js` : `request(position, history, variety)`, transmise seulement avec V2b et incluse dans la clé de déduplication. V0 et V1b : messages et résultats strictement inchangés (testé).
  - `js/main.js` + `index.html` : section « Variété d'ouverture » du menu 🎨 (Activée par défaut / Désactivée, clé `damika:opening-variety`) ; variété seulement si V2b, partie jouée EN DIRECT (`game === liveGame` : page fraîche ou « Nouvelle partie » ; une partie importée, de la Bibliothèque, restaurée ou éditée garde l'analyse d'avant) et moins de 10 demi-coups joués ; graine tirée à chaque nouvelle partie ; le coup déjà proposé pour une position de la partie est mémorisé (`prefer`) : la réanalyse ne fait pas changer le « Meilleur ». Budget de l'appli inchangé : 1,5 s, profondeur 24 (valeurs par défaut du contrôleur).
  - `training/arena.mjs` : `--variety-a / --variety-b <marge>` et `--variety-plies <n>` (comptés après l'ouverture imposée de 8 demi-coups) ; `training/variety-diversity.mjs` (distribution des coups sur N graines) ; `tests/opening-variety.mjs` (tout vert), ainsi que `engine-select`, `eval-patterns`, `eval-symmetry`, `analysis-controller`, `analysis-format`, `worker-analyse`, `worker`, `eval-structure`, `search-consistency`, `repetition`.
- **Mesures terminées** (V2b p17-B-l025 avec variété contre le même sans variété, `--depth 30 --time 100`, 400 paires, graine 5151) :

| Mesure | Version du code | Résultat |
|---|---|---|
| M = 30 | ancienne (test à pleine profondeur) | **−41 Elo [−59 ; −23]** (186 / 334 / 280) : hors tolérance |
| M = 1 (isole le coût du partage du temps) | ancienne | 49,8 % sur 398 paires lors de l'interruption ; terminé ensuite : −0 [−18 ; +17] (220 / 359 / 221) |
| M = 10 | ancienne | +2 Elo [−16 ; +20] (234 / 336 / 230) : **NON VALABLE pour le code actuel** |
| M = 10 | ACTUELLE | **interrompue à 275 paires sur 400** (550 parties, A 49,9 %, reprise possible) |
| M = 20 | ACTUELLE | pas commencée |

- **Diversité (M = 10, code actuel, 1,5 s, 100 graines ; candidats calculés une fois, puis un tirage par graine)** :
  - Blancs, premier coup : les 9 coups sont candidats ; 34-29 19, 32-28 13, 35-30 13, 33-29 12, 33-28 11, 34-30 10, 31-27 10, 31-26 9, **32-27 3**.
  - Noirs après 32-28 (8 candidats, 0 non testé) : 19-23 16, 17-21 14, 18-22 14, 17-22 14, 16-21 13, 18-23 11, 20-25 10, 19-24 8.
  - Noirs après 31-26 (3 candidats, 3 non testés) : 18-23 36, 17-21 33, 20-24 31.
  - Noirs après 34-30 (5, 1 non testé) : 19-23 26, 16-21 21, 20-25 20, 17-21 17, 19-24 16.
  - Noirs après 33-29 (5, 3 non testés) : 20-25 27, 16-21 20, 17-21 20, 18-22 18, 17-22 15.
  - Noirs après 32-27 (8, 0 non testé) : 20-25 20, 17-21 15, 20-24 14, 18-23 12, 18-22 11, 17-22 11, 19-24 9, 19-23 8.
  Limite : quand des coups ne sont pas testés faute de temps, ceux générés en dernier sont absents (légère perte de diversité, jamais de coup mauvais). Les fichiers `training/data/p19-diversity-m10.json` et `-m20.json` datent de l'ANCIENNE version (à régénérer).
- **Commandes pour reprendre** (une seule à la fois, jamais deux calculs lourds en parallèle ; reprise automatique depuis les `games.jsonl` existants en relançant la MÊME commande) :
  1. `node training/arena.mjs match --a learned:training/models/p17-B-l025.json --b learned:training/models/p17-B-l025.json --variety-a 10 --variety-plies 10 --depth 30 --time 100 --pairs 400 --seed 5151 --workers 7 --out training/data/p19b-var10-vs-plain-t100-s5151` (environ 8 min restantes)
  2. la même commande avec `--variety-a 20` et `--out training/data/p19b-var20-vs-plain-t100-s5151` (environ 25 min)
  3. `node training/variety-diversity.mjs --margin 10 --games 100 --out training/data/p19-diversity-m10.json` (puis `--margin 20 … p19-diversity-m20.json`) : 1 à 2 min chacune.
  Lecture du résultat : `node training/pool.mjs <dossier de match>`.
- **Reste à faire** : (1) finir M = 10 (actuelle) et mesurer M = 20 ; garder la plus grande marge dont la perte est < 10 Elo (sinon réduire) ; (2) régénérer le tableau de diversité avec la marge finale, dont celui des Noirs sur 100 parties ; (3) décider si on réduit le nombre de coups non testés (plus de temps de test ou profondeur de test plus basse) ; (4) test visuel du réglage dans l'interface (menu 🎨, partie neuve) : non fait ; (5) transformer cette section provisoire en section finale.
- **Comment désactiver** : menu 🎨 → « Variété d'ouverture » → Désactivée (mémorisé). Dans le code : `openingVarietyOn` dans `js/main.js`, ou `OPENING_VARIETY.plies = 0` dans `js/ai/engines.js`. V0 et V1b ne sont jamais concernés.
- Aucun push ni déploiement ; `data/models/` inchangé ; aucun calcul lourd lancé depuis la pause.

## Clôture de session du 01/11/2026

- **État** : P17 et P18 validés (commit `11b6b2d`). P19 (variété d'ouverture) en PAUSE (commits `c663d66`, `d739ddb`) : M = 10 provisoire, section P19 ci-dessus. Prochain numéro de prompt : **P20**.
- **Mesures P19 restantes** (une seule à la fois, la même commande reprend depuis les `games.jsonl`) :
  1. M = 10, code actuel, jusqu'à 400 paires (275 faites) : `node training/arena.mjs match --a learned:training/models/p17-B-l025.json --b learned:training/models/p17-B-l025.json --variety-a 10 --variety-plies 10 --depth 30 --time 100 --pairs 400 --seed 5151 --workers 7 --out training/data/p19b-var10-vs-plain-t100-s5151`
  2. M = 20 : même commande avec `--variety-a 20 --out training/data/p19b-var20-vs-plain-t100-s5151`
  3. Diversité avec la marge finale : `node training/variety-diversity.mjs --margin 10 --games 100 --out training/data/p19-diversity-m10.json` (puis `--margin 20 … p19-diversity-m20.json`)
  Lecture : `node training/pool.mjs <dossier>`.
- **Non commité** : rien de suivi n'est modifié ; restent seulement des fichiers non suivis (modèles, données d'entraînement, `tests/nada-vs-damika.mjs`, `Claude outputs/`).
- **Parties contre Scan niveau 7 (01/11)** : 3 parties, 3 défaites ; thèmes : centre non disputé, pas de portes de sortie, horizon, pion isolé en 24 trop tôt.

## P20 — Scan est-il pilotable en local ? (06/11/2026, diagnostic seul)

**Verdict : OUI, pilotable.** Aucun code d'arène écrit, rien commité, rien dans `data/` ni `training/`.
- **Exécutable** : `C:\Users\micka\Documents\Turbo Dambase\Engines\Scan 3.1\scan.exe` (254 976 octets, Scan 3.1 de Fabien Letouzey, livré avec Turbo Dambase), avec `scan.ini`, `data\` (book 1,9 Mo, eval 8,5 Mo, tables de finale `bb\` 2 à 6 pièces), `msvcp140.dll`, `vcruntime140.dll`. Pas de fork RoepStoep trouvé. Rien téléchargé. Aucun blocage antivirus/système.
- **Lancement** : `scan.exe hub` avec le dossier de Scan comme répertoire courant (sinon `data\` introuvable), stdin/stdout en texte.
- **Échange Hub vérifié** (`>` envoyé, `<` reçu) :
  ```
  > hub
  < id name=Scan version=3.1 author="Fabien Letouzey" country=France
  < param name=book value=false type=bool / book-ply (0-20) / book-margin (0-100) / threads (1-16) / tt-size (16-30) / bb-size (0-7) ...
  < wait
  > init
  < init eval        < ready
  > pos pos=Wbbbbbbbbbbebbbbbbeeeeebweeweeeeweeeewwwwwwwwwwwwww
  > level depth=11 move-time=0.5
  > go think
  < info depth=… score=… nodes=… pv="…"   (plusieurs lignes)
  < done move=39-33 ponder=14-19
  ```
  Format `pos` : 1 lettre du camp au trait (`W`/`B`) + 50 caractères (cases 1 à 50 : `e` vide, `w`/`b` pion, `W`/`B` dame). **Piège** : une chaîne de mauvaise longueur donne `error message="bad position"` mais Scan RÉPOND quand même (il garde la position précédente) : toujours valider la longueur (51). Coups au format FMJD (`39-33`, `27x18`), comme rules.js.
- **Tests** : position initiale → `34-30` ; position de la partie 3 après 6...18-23 (rejouée avec rules.js, Blancs au trait) → `39-33`, **légal selon `generateLegalMoves`**.
- **Niveau 7 de Lidraughts** : reproductible par `level depth=11 move-time=0.5` (profondeur max 11, 500 ms) ; livre : `set-param name=book value=true`, `book-ply=8`, `book-margin=…` (60 demandé : le paramètre existe, plage 0-100, unité à confirmer sur le texte du livre). `threads=1` (défaut), `tt-size`, `bb-size` (tables de finale 0-7). **Non reproductible avec certitude** : le réglage exact de Lidraughts (fork, éventuelle limite de nœuds, tables de finale, version de l'évaluation) ; à valider en comparant avec les coups des 3 parties perdues.
- **Mesures** : démarrage ≈ 320 ms (handshake + `init`, évaluation chargée). Coup à `depth=11` : 16 à 27 ms la première fois, ≈ 0-1 ms ensuite (table de transposition conservée entre deux coups identiques) : la limite de 500 ms n'est donc jamais atteinte, c'est la profondeur 11 qui borne. Moyenne ≈ 8 ms sur 6 coups (non représentatif : à refaire sur une partie entière). Parallélisme : `threads=1` par processus, 8 cœurs logiques → 7 processus Scan simultanés (cœurs − 1) sans problème prévisible ; mémoire non mesurée (tt-size 24).
- **Blocages** : aucun. Point d'attention : le fichier PDN des parties est `Downloads\Damika - Scan - 3.pdn` (le chemin `claude/scan7-parties.pdn` du prompt n'existe pas) ; la partie 3 y compte 14 coups seulement (0-2 après 14...23-29).
- **Suite proposée** : écrire `training/scan-arena` (processus Scan via `child_process`, validation de longueur de `pos`, rejeu des coups avec rules.js, 7 en parallèle) ; plan B (positions extraites) inutile.

## P21 — Arène DamikA contre Scan (06/11/2026, mesure seulement)

Rien de modifié dans le moteur, l'évaluation, l'appli, `data/` ; rien commité (nouveaux fichiers : `training/scan-arena/{scan-player,calibrate,arena,analyse-losses}.mjs`, ligne `training/scan-arena/out/` ajoutée à `.gitignore`, vérifiée par `git check-ignore`).

**Commandes** (le chemin de Scan est passé par `SCAN_EXE` ou `--scan`, jamais en dur) :
```
export SCAN_EXE="C:/Users/micka/Documents/Turbo Dambase/Engines/Scan 3.1/scan.exe"
node training/scan-arena/calibrate.mjs "<Downloads>/Damika - Scan - 1.pdn" "…- 2.pdn" "…- 3.pdn"        # calage
node training/scan-arena/arena.mjs --pairs 10 --engine v0 --depth 8 --out training/scan-arena/out/s1    # série (--engine v2b possible)
node training/scan-arena/analyse-losses.mjs training/scan-arena/out/s1                                    # bascules
```
Module `scan-player.mjs` : `ScanPlayer.start({exe, params})`, `best({board, side}, {depth, moveTime})`. Position Hub construite depuis rules.js (51 caractères validés avant envoi), coup de Scan vérifié avec `generateLegalMoves` (sinon erreur).
**Format Hub des rafles (nouveau, à connaître)** : `départ x arrivée x pièces-prises…` (ex. `20x29x24` : de 20 à 29 en prenant 24 ; `31x11x17x27`), PAS le chemin. **Les paramètres (livre, bb-size, tt-size) doivent être envoyés AVANT `init`** : `set-param book=true` après `init` fait planter Scan 3.1 (violation d'accès, code 3221225477). Un coup forcé (prise unique) n'a pas de ligne `info` (pas de score).

**Calage du niveau 7** (95 positions où Lidraughts a joué dans les 3 parties ; coup identique = même départ et même arrivée ; résultats : `training/scan-arena/out/calage.txt`) :
- sans livre, depth 11 : **87,4 %** (83/95) ; avec `bb-size 6` ou `tt-size 28` : identique (87,4 %, mêmes écarts) ;
- livre ply 8 marge 60 : 83,2 % ; marge 4 : 84,0 % ; marge 60 + bb 6 : 83,6 % (livre aléatoire, moyenne de 5 essais) ; le livre fait baisser l'accord.
- **Retenu : sans livre, `depth=11`, `move-time=0.5`** (les 500 ms ne sont jamais atteintes). Aucun réglage ne donne 100 % : Lidraughts niveau 7 n'est pas exactement reproduit (fork et réglages internes inconnus, probable part d'aléatoire) ; l'adversaire mesuré est « un Scan 3.1 de profondeur 11 », proche mais pas identique. Écarts surtout au 1er–6e coup et dans le milieu de partie.

**Arène** : ouvertures = `makeOpening()` existant (8 demi-coups aléatoires équilibrés, graine `seedOf(seed,'scan-open',paire)`), jouée des deux côtés ; DamikA via `analyseSync` à profondeur fixe (défaut `--depth 8`, déterministe, comme l'arène d'entraînement ; `--time` possible), évaluation V0 ; règles de fin = `GameState` (répétition, 25 coups, 6.3/6.4, 300 demi-coups) ; Scan ne reçoit pas l'historique de répétition (position seule). 7 parties en parallèle (worker_thread + un `scan.exe` chacune). PDN dans `out/<série>/NN-DamikA-blancs|noirs.pdn`, `games.jsonl` (coups + score de Scan à chaque coup), `summary.json`. **Vérification** : chaque PDN est relu depuis le disque et rejoué avec rules.js (`verifyGame`) : 20/20 OK, aucune partie en échec.

**Série 1 (V0, profondeur 8, 10 paires, graine 1)** : **1 victoire, 1 nulle, 18 défaites** ; score de DamikA 7,5 % (IC 95 % 0 à 18 %), **Elo −436 (IC 95 % −∞ à −264)** par rapport à Scan depth 11 ; durée **48 s** (la série est déterministe : relancée, mêmes résultats). Échantillon faible (10 paires). Défaites de 99 à 135 demi-coups, toutes par « plus de coups » ; la nulle (paire 8, DamikA blancs) par répétition à 161 demi-coups ; la victoire : paire 7, DamikA blancs.

**Positions de bascule** (détail complet avec chaîne Hub de chaque position : `out/s1/bascules.txt`). Bascule = 1er coup de Scan avec score ≥ +1,0 restant ≥ +0,5 ; « faute » = coup de DamikA, avant la bascule, qui perd le plus selon Scan (valeur du meilleur coup − valeur du coup joué, en pions ; bruit ≈ 0,2). Notation FMJD, numéro de coup = numéro de la paire de demi-coups (`.` Blancs, `...` Noirs). Fichier–couleur de DamikA :
```
01 B  bascule 21. 28-23   faute 12. 33-29 (−0,27, Scan 46-41)        11 B  bascule 31. 49-44   faute 31. 49-44 (−0,50, Scan 46-41)
02 N  bascule 14... 23-29 faute 14... 23-29 (−0,61, Scan 1-6)        12 N  bascule 18... 3-9   faute 14... 10-15 (−0,38, Scan 16-21)
03 B  bascule 23. 35-30   faute 16. 35x24 (−0,45, Scan 34x25)        13 B  bascule 23. 45-40   faute 21. 42-37 (−0,72, Scan 27-22)
04 N  bascule 23... 22-27 faute 23... 22-27 (−0,75, Scan 11-16)      14 N  bascule 33... 23x34 faute 30... 18-23 (−0,36, Scan 2-8)
05 B  bascule 32. 44-39   faute 22. 27-22 (−1,63, Scan 46-41)        16 N  bascule 16... 19x30 faute 14... 9-14 (−0,15, Scan 5-10)
06 N  bascule 23... 9x20  faute 12... 19-23 (−0,05 : aucune faute nette)  18 N  bascule 20... 16-21 faute 20... 16-21 (−0,62, Scan 5-10)
07 B  bascule 14. 33x22   faute 14. 33x22 (−0,21, Scan 32x23)        19 B  bascule 27. 37-31   faute 15. 35-30 (−0,22, Scan 49-43)
08 N  bascule 20... 16x27 faute 16... 15-20 (−0,32, Scan 9-13)       20 N  bascule 22... 22-28 faute 15... 1-6 (−0,26, Scan 10-15)
09 B  bascule 26. 28-22   faute 26. 28-22 (−0,59, Scan 30-24)
10 N  bascule 18... 16x27 faute 9... 18-23 (−0,13 : aucune faute nette)
```
Lecture (indicative, 18 parties) : les pertes ne viennent pas d'une seule gaffe tactique : dans la plupart des cas DamikA (profondeur 8, évaluation ≈ 0) joue un coup « calme » du milieu de partie (coups 12 à 31) que Scan à profondeur 11 juge 0,4 à 0,75 pion moins bon ; 3 parties ont une perte unique plus grosse (05 : 27-22, −1,63 ; 13 : 42-37, −0,72 ; 04 : 22-27, −0,75). Coups de remplacement de Scan récurrents : 46-41 (Blancs, parties 01, 03, 05, 11) et 5-10 / 1-6 (Noirs) : développement des pièces de dernière rangée, cohérent avec « pas de portes de sortie » du bilan du 01/11. Limite : DamikA est ici à profondeur 8 fixe, pas à son budget réel (1,5 s) ; à refaire avec `--depth 30 --time 1500` (plus lent) et avec `--engine v2b`.

## P22 — Série contre Scan au vrai budget de DamikA (06/11/2026, mesure seulement)

Rien de modifié (moteur, évaluation, appli, `data/`), rien commité. Seul changement : `arena.mjs` enregistre désormais le temps réel de chaque coup de DamikA (`ms`) et en affiche moyenne / médiane / max.
**Durée estimée** : ≈ 55 coups de DamikA × 1,5 s ≈ 85 s par partie, 20 parties ÷ 7 ≈ 4 à 5 min par série (< 45 min, lancé sans accord préalable). **Réelle** : 292 s (V0) et 374 s (V2b). Charge machine avant lancement : 8 %.
**Commandes** (`SCAN_EXE` défini comme en P21) :
```
node training/scan-arena/arena.mjs --pairs 10 --seed 1 --engine v0  --depth 30 --time 1500 --out training/scan-arena/out/s2-v0
node training/scan-arena/arena.mjs --pairs 10 --seed 1 --engine v2b --depth 30 --time 1500 --out training/scan-arena/out/s2-v2b
node training/scan-arena/analyse-losses.mjs training/scan-arena/out/<série>      # > <série>/bascules.txt
```
**Temps par coup** (7 parties en parallèle conservées : max 1538 ms < 1650 ms, donc pas de réduction) : V0 moyenne 1392 ms, médiane 1501, max 1532 (1252 coups) ; V2b moyenne 1401, médiane 1501, max 1538 (1381 coups). **Relecture rules.js (verifyGame) : 40/40 PDN OK**, 0 échec de partie.

| Série (mêmes 10 ouvertures, graine 1) | V / N / D | Score | Elo vs Scan depth 11 (IC 95 %) | Durée |
|---|---|---|---|---|
| P21 : V0, profondeur 8 fixe | 1 / 1 / 18 | 7,5 % | −436 (−∞ à −264) | 48 s |
| P22-A : V0, 1,5 s (`--depth 30 --time 1500`) | 0 / 4 / 16 | 10,0 % (2,0–18,0) | −382 (−676 à −263) | 292 s |
| P22-B : V2b, 1,5 s | 1 / 5 / 14 | 17,5 % (7,0–28,0) | −269 (−448 à −164) | 374 s |

10 paires seulement : intervalles larges, les trois séries ne se distinguent pas statistiquement entre elles (V2b vs V0 au vrai budget : les intervalles se recouvrent). Nulles de V2b : 5, dont une par règle des 25 coups (248 demi-coups).

**Bascules** (même définition qu'en P21 ; [ ] = coup de plus grosse perte). Fichier NN = même ouverture et même couleur dans les 3 séries. Détails : `out/s2-v0/bascules.txt`, `out/s2-v2b/bascules.txt` ; « — » = partie non perdue.
```
NN  P21 (V0 prof. 8)          P22-A (V0 1,5 s)            P22-B (V2b 1,5 s)
01  21. 28-23 [12. 33-29]     23. 47x36 [17. 33-28]       30. 35-30 [30. 35-30]
02  14... 23-29 [14... 23-29] 17... 6-11 [17... 6-11]     35... 18-22 [35... 18-22]
03  23. 35-30 [16. 35x24]     29. 49-44 [29. 49-44]       —
04  23... 22-27 [23... 22-27] 10... 3-9 [7... 15-20]      14... 21-27 [14... 21-27]
05  32. 44-39 [22. 27-22]     —                           24. 28-23 [23. 32-28]
06  23... 9x20 [12... 19-23]  25... 14-20 [20... 10-14]   —
07  14. 33x22 [14. 33x22]     38. 47-41 [25. 33-28]       37. 37-32 [37. 37-32]
08  20... 16x27 [16... 15-20] —                           34... 11-17 [26... 26x37]
09  26. 28-22 [26. 28-22]     20. 39-33 [20. 39-33]       —
10  18... 16x27 [9... 18-23]  9... 11-17 [9... 11-17]     22... 11x22 [21... 17-22]
11  31. 49-44 [31. 49-44]     26. 44-39 [8. 49-44]        —
12  18... 3-9 [14... 10-15]   —                           42... 4-9 [42... 4-9]
13  23. 45-40 [21. 42-37]     36. 30-25 [21. 47-42]       38. 49-43 [38. 49-43]
14  33... 23x34 [30... 18-23] —                           34... 12-17 [34... 12-17]
15  —                         28. 30-25 [28. 30-25]       —
16  16... 19x30 [14... 9-14]  25... 19-24 [18... 13-19]   45... 11-16 [16... 20-24]
17  —                         22. 48-43 [22. 48-43]       27. 31-27 [27. 31-27]
18  20... 16-21 [20... 16-21] 30... 15-20 [30... 15-20]   —
19  27. 37-31 [15. 35-30]     18. 41x32 [16. 47-42]       10. 38-33 [8. 30-25]
20  22... 22-28 [15... 1-6]   30... 23-28 [30... 23-28]   47... 16-21 [34... 15-20]
```
**Bascule au même coup d'une série à l'autre : 0 partie sur 20** (P21/P22-A, P21/P22-B, P22-A/P22-B). Les parties divergent dès que DamikA change de coup (budget ou évaluation différents), donc les positions de bascule ne sont pas comparables coup à coup ; seules les ouvertures sont communes.
**Coups de Scan proposés à la place du coup de plus grosse perte** (les plus fréquents ; nombre de parties perdues entre parenthèses) :
- P21 (18) : 46-41 ×3, 5-10 ×3, 10-14 ×1, 16-21 ×1, 27-22 ×1, 2-8 ×1
- P22-A (16) : 5-10 ×2, 49-43 ×2, 39-33 ×2, 42-37 ×1, 47-42 ×1, 4-9 ×1
- P22-B (14) : tous différents (8-13, 7-11, 38-33, 3-8, 19-23, 48-43 ×1 chacun)
(Comptage sur le seul coup de plus grosse perte de chaque défaite ; liste complète dans les `bascules.txt`.)

## P23 — Grande série contre Scan : V0 contre V2b, 50 paires chacun (06/11/2026, mesure seulement)

Rien de modifié (moteur, évaluation, appli, `data/`), rien commité. Nouveau : `training/scan-arena/compare.mjs` (comparaison, appariement, cumul, bascules). Sorties : `out/s3-v0`, `out/s3-v2b`, `out/p23-compare.txt`.
**Commandes** (`SCAN_EXE` défini ; mêmes 50 ouvertures, graine 2, 7 parties en parallèle) :
```
node training/scan-arena/arena.mjs --pairs 50 --seed 2 --engine v0  --depth 30 --time 1500 --out training/scan-arena/out/s3-v0
node training/scan-arena/arena.mjs --pairs 50 --seed 2 --engine v2b --depth 30 --time 1500 --out training/scan-arena/out/s3-v2b
node training/scan-arena/analyse-losses.mjs training/scan-arena/out/<série> > <série>/bascules.txt
node training/scan-arena/compare.mjs out/s3-v0 out/s3-v2b out/s2-v0 out/s2-v2b
```
**Durée réelle** : V0 1238 s (20,6 min, estimé 25), V2b 1375 s (22,9 min, estimé 31). 0 échec de partie ; **200/200 PDN relus avec rules.js (verifyGame) sans anomalie**.
**Temps par coup de DamikA** : V0 moyenne 1380 ms, médiane 1502, **max 2732** (6006 coups, **8 au-dessus de 1650 ms**, dont 3 > 2000) ; V2b moyenne 1399, médiane 1502, **max 1714** (6479 coups, **5 > 1650**). Le seuil du prompt (max ≤ 1650 ms) est donc dépassé dans les deux séries, par 0,13 % et 0,08 % des coups ; **séries NON relancées** (décision laissée à Mickaël : relancer avec moins de parties en parallèle coûterait ≈ 45 min).

| Série (50 paires, graine 2) | V / N / D | Score (IC 95 %) | Elo vs Scan depth 11 (IC 95 %) |
|---|---|---|---|
| V0, 1,5 s | 5 / 14 / 81 | 12,0 % (6,9–17,1) | −346 (−452 à −274) |
| V2b, 1,5 s | 6 / 33 / 61 | 22,5 % (16,9–28,1) | −215 (−277 à −163) |

**Comparaison appariée par ouverture (50)** : V2b fait mieux sur 24 ouvertures, pareil sur 16, moins bien sur 10. Différence moyenne du score de paire (V2b − V0) : +0,105 (IC 95 % +0,020 à +0,190) ; test des signes (34 paires non égales) p = 0,024. **Différence significative au seuil de 5 %.** Écart d'Elo V2b − V0 : +131 (IC 95 % ≈ +24 à +207, déduit de l'intervalle du score apparié).

**Cumul avec P22 (graine 1) : 60 paires par moteur**

| Moteur | V / N / D | Score (IC 95 %) | Elo vs Scan (IC 95 %) |
|---|---|---|---|
| V0 | 5 / 18 / 97 | 11,7 % (7,2–16,1) | −352 (−443 à −287) |
| V2b | 7 / 38 / 75 | 21,7 % (16,7–26,7) | −223 (−280 à −176) |

Apparié sur 60 ouvertures : mieux 28, pareil 20, moins bien 12 ; différence moyenne +0,100 (IC 95 % +0,025 à +0,175).

**Bascules (parties perdues ; définition de P21)** :
| | V0 | V2b |
|---|---|---|
| Défaites analysées / avec bascule | 81 / 81 | 61 / 61 |
| Coup médian de la bascule | 24 | 31 |
| Perte moyenne du coup de plus grosse perte (pions, estimation Scan) | 1,77 (79 parties) | 2,10 (59 parties) |

**Coups de Scan proposés à la place du coup de plus grosse perte** (10 premiers, camp de DamikA ; une occurrence par défaite) :
- V0 : 50-44 (Blancs) ×8, 1-7 (Noirs) ×4, 9-13 (N) ×3, 4-9 (N) ×3, 5-10 (N) ×3, 46-41 (B) ×3, 50-45 (B) ×2, 14-19 (N) ×2, 12-17 (N) ×2, 24-29 (N) ×2.
- V2b : 24-30 (Noirs) ×3, 38-33 (Blancs) ×3, 5-10 (N) ×3, 7-12 (N) ×2, 13-19 (N) ×2, 17-22 (N) ×2, 42-37 (B) ×2, 13-18 (N) ×2, 14-19 (N) ×2, 45-40 (B) ×2.
- **Communs aux deux listes de 10 (même coup, même camp) : 5-10 (Noirs) et 14-19 (Noirs).** (Sur toutes les défaites, 25 coups de remplacement apparaissent chez les deux moteurs ; liste dans `out/p23-compare.txt`.)


## P24 — Intégrer Scan dans DamikA : vérifications avant de coder (07/11/2026, diagnostic seul)

Rien modifié dans l'appli, le moteur actuel, `data/`, `js/` ni `CLAUDE.md` ; rien commité. Tout ce qui a été téléchargé ou écrit est dans le dossier temporaire de la session (dépôt `scan-wasm` cloné, paquet npm `scan3.1.js`, binaires WebAssembly de Lidraughts, scripts de mesure `bench/`, `pw/`). Seul Scan a été exécuté (natif et WebAssembly), plus un petit serveur de test local écrit pour le point 4. **Playwright n'était pas installé** sur la machine (contrairement à l'énoncé) : j'ai installé `playwright-core` (sans téléchargement de navigateur) dans le dossier temporaire et piloté le Chrome 156 déjà présent, en mode sans interface. (Des fichiers `training/scan-arena/p24-*.mjs` datés du 06/11 existent déjà dans le dépôt, hors suivi : ils appartiennent à un autre travail nommé « P24 » et n'ont pas été touchés.)

### 1. Paquet WebAssembly

**Deux sources, à ne pas confondre.**
- `github.com/RoepStoep/scan-wasm` (dernier commit `cbb251e`, 30/08/2023) : **uniquement les sources C++** (Scan 3.1 modifié pour Lidraughts), AUCUN binaire compilé, ni évaluation, ni tables. Licence : `LICENSE` = texte intégral GPL-3.0 (GitHub : `GPL-3.0`). Modification clé : la recherche ne tourne plus dans une boucle bloquante mais par itérations rendues au navigateur (`emscripten_async_call` dans `search.cpp`), et `std::thread` est retiré : **le moteur est mono-thread par construction**.
- Paquet npm **`scan3.1.js` 1.1.0** (17/05/2022, auteur « TheYoBots ») : **ce n'est pas du WebAssembly** : des `.js` asm.js (≈ 658 Ko × 4 variantes) + les sources C++, **sans** `.wasm`, **sans** fichier d'évaluation (« Excludes bitbases/eval files »). **Incohérence de licence** : `package.json` annonce `MIT` mais le `LICENSE` du paquet est le texte GPL-3.0 et le code est celui de Scan (GPL-3.0) : ne pas se fier au champ MIT. Inutilisable tel quel.
- **Les vrais binaires** (`.wasm` + évaluation) sont dans le dépôt `RoepStoep/lidraughts`, dossier `public/vendor/scan/` (c'est ce que fait tourner Lidraughts) ; le dépôt Lidraughts est en **AGPL-3.0**, le moteur Scan en **GPL-3.0**. Le dépôt n'indique pas à quel commit de `scan-wasm` correspond chaque binaire (provenance à fixer : voir §5, recommandation de recompiler). Ce sont ces binaires (variante `normal`) que j'ai testés.

| Élément | Valeur |
|---|---|
| Version du moteur | **Scan 3.1** (copyright 2015-2019 Fabien Letouzey ; `id name=Scan version=3.1`) |
| Licence | **GPL-3.0** (Scan et scan-wasm) ; fichiers : `LICENSE` de `scan-wasm` et du paquet npm (même texte) ; `license.txt` cité par le README de Scan |
| `scan_normal.wasm.js` (chargeur Worker + colle emscripten, version WebAssembly) | 133 044 o |
| `scan_normal.wasm` | 230 579 o |
| `scan_normal.data` (évaluation `data/eval` 8 503 280 o + tables de finale 2 et 3 pièces) | 8 551 540 o |
| `scan_normal.js` (repli asm.js, inutile si WebAssembly) | 659 685 o |
| **Total nécessaire (wasm.js + wasm + data)** | **8 915 163 o ≈ 8,5 Mio** (le repli asm.js ajouterait 0,63 Mio) |
| Évaluation | **identique au natif** : SHA-256 des 8 503 280 premiers octets de `scan_normal.data` = `data\eval` de Scan natif (`0e7161c3…58abba`) |
| Livre d'ouvertures | **absent** (non empaqueté ; natif : `data\book` 1,9 Mo) |
| Tables de finale | **2 et 3 pièces seulement** (16 fichiers : 4 + 12), `bb-size=3` comme Lidraughts. Natif : 2 à 6 pièces (`bb\6` = 1,9 Go ; 5 pièces 72 Mo ; 4 pièces 2,6 Mo). |
| API | **Protocole Hub** (celui du natif, `protocol.txt` du paquet), par messages : `worker.postMessage("ligne")` envoie une commande, `onmessage` reçoit chaque ligne de sortie. Séquence : `hub` → (`id…`, `param…`, `wait`) → `set-param …` → `init` → `ready` → `pos pos=<51 car.>` → `level depth=N` (ou `move-time=s`, `nodes=N`, `infinite`) → `go think` (ou `go analyze`) → lignes `info depth=… score=… nodes=… time=… pv="…"` → `done move=… ponder=…` ; `stop` interrompt. Mêmes pièges qu'en natif : paramètres AVANT `init` ; format de rafle `départ x arrivée x pièces-prises`. |
| Paramètres exposés (build WebAssembly) | `variant`, `eval` (`pst`/`pattern`), `ponder`, `tt-size` (16-30), `bb-size` (0-7, utile jusqu'à 3). **Pas de `book`, `book-ply`, `book-margin`, ni `threads`** (inconnus du build : ignorés sans erreur). Profondeur / nœuds / temps par `level`. |
| Threads | **Aucun** (mono-thread ; pas de `SharedArrayBuffer`, pas de pthreads dans le build). Vérifié dans les sources et en test (`typeof SharedArrayBuffer === "undefined"`, `crossOriginIsolated === false`, tout fonctionne). **Donc COOP/COEP NON requis.** Des threads exigeraient de recompiler Scan avec pthreads (travail non trivial : l'architecture a été réécrite pour le navigateur) ET les en-têtes COOP/COEP. |

### 2. Hébergement actuel et en-têtes

- **Publié** : Cloudflare Workers + assets statiques, `https://damika.shell-green.workers.dev` (compte « Shell Green »). Dossier `C:\Users\micka\DamikA-deploy` : `wrangler.toml` (`name = "damika"`, `[assets] directory = "./site"`), sous-dossier `site/` (copie du dépôt faite par `deploy.ps1` : `css js assets data icons index.html manifest.json sw.js`). Copie locale actuelle un peu ancienne (27/10) : normal, `deploy.ps1` la rafraîchit. En production : aucun COOP/COEP, `Cache-Control: public, max-age=0, must-revalidate`, `ETag`.
- **Peut-on ajouter des en-têtes ? Oui.** Cloudflare (doc « Workers static assets / Headers », lue le 07/11/2026) : un fichier texte `_headers`, sans extension, à la RACINE du dossier d'assets, ajoute / remplace des en-têtes par motif d'URL (ne s'applique pas aux réponses générées par un code Worker, sans importance ici : pas de Worker devant les assets). Attention : **`deploy.ps1` ne copie que les dossiers et fichiers listés** ; il faudrait ajouter `_headers` à `$files`.
- **Threads WebAssembly utilisables ? Pas nécessaire et pas disponible** : le build existant n'a pas de threads. Si on en voulait un jour : COOP `same-origin` + COEP `require-corp` seraient possibles côté Cloudflare, mais COEP casserait les photos de joueurs chargées depuis des URL externes (Toernooibase) sauf `credentialless` ; sujet à rouvrir seulement si on compile Scan avec threads.
- **Poids et mode hors ligne** : limites Workers Static Assets (page Limits, 07/11/2026) : 25 Mio par fichier, 20 000 fichiers (gratuit) : le plus gros fichier (`.data`, 8,5 Mio) passe. Une PWA peut sans problème mettre 9 Mio en cache (Cache Storage : quota de plusieurs centaines de Mo à plusieurs Go selon navigateur ; Safari peut vider le cache d'un site non installé après une semaine sans visite). Le Service Worker est aujourd'hui désactivé : à sa réactivation, mettre en cache ces 3 fichiers **à la première utilisation du moteur** (pas à l'installation, pour ne pas imposer 9 Mio à chaque visiteur), en comparant les URL sans la chaîne `?v=…` ajoutée par `locateFile`. Le site entier pèse aujourd'hui ≈ 1 Mo : il passerait à ≈ 10 Mo. La limite de 100 000 requêtes/jour du palier gratuit compte les fichiers servis : 3 fichiers de plus par visiteur ayant lancé le moteur, négligeable.

### 3. Test de performance (Chrome 156 sans interface, processeur i7-9700 8 cœurs, 07/11/2026)

Même réglage partout : `book=false`, `tt-size=22`, `bb-size=3`, `go think`, **processus (ou Worker) NEUF à chaque mesure** (table de transposition vide), médiane de 3 répétitions, temps de `go` à `done` (initialisation exclue). Natif = `Turbo Dambase\Engines\Scan 3.1\scan.exe` (3.1). Positions : **départ** ; **partie 3** après 6…18-23 (Blancs au trait ; `Wbbbbbbbbbbebbbbbbeeeeebweeweeeeweeeewwwwwwwwwwwwww`) ; **milieu de partie** des arènes : position de `out/p24/positions.jsonl`, demi-coup 30, Blancs au trait (`Wbbbbbbbeeebbeebbbbbeeeebeeeweewewweewwwwewwewwwwwe`, 30 pièces, meilleur coup de l'étiquetage 28-23).

**Temps (ms, médiane) · coup · score (en pions, point de vue des Blancs, qui ont le trait)**

| Position | Prof. | WebAssembly | Natif 1 thread | Natif 4 threads |
|---|---|---|---|---|
| Départ | 11 | 45 · 34-30 · 0,00 | 16 · 34-30 · −0,01 | 14 · 31-26 ou 34-30 · 0,00 |
| Départ | 16 | 353 · 34-30 · 0,00 | 199 · 34-30 · 0,00 | 123 · 34-30 ou 32-28 · 0,00 |
| Départ | 20 | 2 280 · 32-28 · 0,00 | 1 823 · 32-28 · 0,00 | 869 · 34-30 ou 32-28 · −0,01 |
| Partie 3 | 11 | 55 · **40-34** · −0,78 | 27 · **39-33** · −0,78 | 13 · 40-34 ou 39-33 · −0,69 |
| Partie 3 | 16 | 396 · **40-34** · −0,83 | 268 · **39-33** · −0,72 | 100 · 39-33 · −0,78 |
| Partie 3 | 20 | 2 847 · 40-34 · −0,78 | 2 700 · 40-34 · −0,82 | 893 · 40-34 · −0,84 |
| Milieu | 11 | 50 · 28-23 · 0,46 | 20 · 28-23 · 0,41 | 16 · 28-23 · 0,46 |
| Milieu | 16 | 344 · **46-41** · 0,35 | 283 · **28-23** · 0,33 | 93 · 28-23 · 0,34 |
| Milieu | 20 | 1 570 · 46-41 · 0,36 | 2 110 · 46-41 · 0,33 | 680 · 46-41 · 0,34 |

(Initialisation WebAssembly mesurée : 330 à 430 ms depuis un serveur local, chargement de l'évaluation compris ; en ligne s'y ajoute le téléchargement de 8,5 Mio, une seule fois grâce au cache.)

**Lecture**
- **Vitesse brute** (nœuds par seconde à la profondeur 20) : WebAssembly 6,4 / 6,4 / 5,5 millions/s contre natif 1 thread 7,0 / 6,7 / 6,8 : **le WebAssembly tient ≈ 82 à 97 % du natif mono-thread.** Aux faibles profondeurs il paraît 2 à 3 fois plus lent (45-55 ms contre 16-27 ms à la profondeur 11) : coût fixe des itérations rendues au navigateur, sans importance (< 60 ms). Le temps total à profondeur égale dépend surtout du nombre de nœuds (le milieu de partie à la profondeur 20 est plus rapide en WebAssembly : 8,7 M de nœuds contre 14,3 M).
- **Natif 4 threads** : gain de 2,1 à 3,1 en temps à la profondeur 20 (869 / 893 / 680 ms contre 1 823 / 2 700 / 2 110) ; **non déterministe** (le coup change d'une répétition à l'autre, colonnes « ou »), comme attendu en recherche parallèle.
- **Coups identiques au natif ?** WebAssembly contre natif 1 thread : **6 positions sur 9 identiques** (départ 3/3, milieu 2/3, partie 3 1/3). Les écarts (partie 3 aux profondeurs 11 et 16 : 40-34 contre 39-33 ; milieu à la profondeur 16 : 46-41 contre 28-23) ont des scores quasi égaux (−0,78 / −0,78 ; 0,35 / 0,33), et les nombres de nœuds diffèrent un peu (ex. partie 3, profondeur 11 : 188 235 contre 224 397) : **ce n'est pas un clone exact du natif** (build `scan-wasm` modifié, parcours d'itérations différent), bien que l'évaluation soit octet pour octet la même. À la profondeur 20 les coups sont les mêmes partout, sauf le départ à 4 threads (coups équivalents). Conclusion : même force, pas la même séquence de coups ; pour reproduire exactement un coup du natif, il faut le natif.
- **Limites du test** : Chrome 156 sans interface seulement (Edge, Firefox, Safari, téléphone non testés) ; 3 positions ; profondeur fixe (pas de budget en secondes) ; natif réglé en `bb-size=3` pour comparer (le natif complet utilise 6, plus fort en finale) ; 4 threads natifs = 4 sur 8 cœurs physiques.

### 4. Pont local pour le mode natif (architecture proposée, rien implémenté)

**Composants**
- `bridge/damika-bridge.mjs`, Node ≥ 18, **sans dépendance**, lancé à la main ou par un raccourci. Il écoute **uniquement `127.0.0.1`** (jamais `0.0.0.0`), port fixe **47831** (hors plages usuelles) ; l'appli essaie 47831 à 47835 si occupé. Chemin de `scan.exe` : option `--scan`, variable `SCAN_EXE` ou fichier de config à côté du pont ; détection du dossier Turbo Dambase proposée au premier lancement. Le pont pilote `scan.exe hub` exactement comme `training/scan-arena/scan-player.mjs` (`spawn` avec tableau d'arguments, jamais un shell ; répertoire courant = dossier de Scan ; paramètres envoyés AVANT `init` ; validation `^[WB][ewbWB]{50}$` de `pos` ; coup vérifié côté appli avec rules.js).
- **API** : `GET /v1/ping` → `{ name:"damika-bridge", version, engine:{ name:"Scan", version:"3.1" }, maxThreads, bb:[2..6] }` ; `POST /v1/analyse` avec `{ pos, moves?, level:{ depth | moveTime | infinite }, params:{ threads, ttSize, bbSize, book, bookPly, bookMargin } }` → réponse en **flux NDJSON** (une ligne JSON par `info`, puis `done`) ; l'appli annule avec `AbortController`, le pont envoie `stop`. Un seul processus Scan gardé vivant entre deux requêtes (la table de transposition sert d'une analyse à l'autre) ; il est relancé seulement si `params` change (les paramètres ne peuvent pas être changés après `init` : un `set-param` tardif fait planter Scan, constaté en P21). Paramètres validés par liste blanche et bornes (`threads` 1 à nombre de cœurs − 1, `tt-size` 16-30, `bb-size` 0-6).
- Pourquoi `fetch` en flux plutôt que WebSocket : les deux sont soumis à la même autorisation du navigateur (voir ci-dessous ; WebSocket testé : même échec sans autorisation) ; `fetch` + NDJSON donne l'annulation propre et le contrôle CORS sans bibliothèque.

**CORS et sécurité (en local, mais joignable depuis des pages web : à verrouiller)**
- Liste blanche d'origines : `https://damika.shell-green.workers.dev`, `http://localhost:*`, `http://127.0.0.1:*` ; toute autre origine = 403 (un site quelconque ne doit pas pouvoir lancer Scan sur le PC). Réponse avec `Access-Control-Allow-Origin: <origine exacte>`, `Vary: Origin`, `Access-Control-Allow-Private-Network: true`, réponse `204` aux préliminaires `OPTIONS`.
- Contrôle de l'en-tête `Host` (`127.0.0.1:<port>` ou `localhost:<port>` seulement) contre le « DNS rebinding ». Pas d'accès fichier, pas de commande arbitraire, un seul processus Scan.
- **Arrêt propre** : `SIGINT`/`SIGTERM`, fermeture de la console et fermeture de l'entrée standard → envoi de `quit` à Scan, `kill` du processus après 1 s, fermeture du serveur ; pas de route « arrêt » accessible depuis une page web.

**Détection côté appli** : au premier passage en mode « Scan » (pas au chargement de la page), `fetch('http://127.0.0.1:47831/v1/ping')` avec délai de 600 ms ; réponse valide → mode natif ; sinon → WebAssembly. Re-sondage à chaque ouverture du réglage et toutes les 30 s tant que le moteur est actif ; si le pont tombe en cours d'analyse, repli automatique sur WebAssembly avec un message (comme le repli existant vers V0). Réglage mémorisé `auto | wasm | natif` (clé à ajouter à la liste localStorage le moment venu).

**Blocages du navigateur — MESURÉS (Chrome 156)** : depuis `https://damika.shell-green.workers.dev`, `fetch('http://127.0.0.1:8765/…')` vers un petit serveur de test avec en-têtes CORS corrects et `Access-Control-Allow-Private-Network: true` :
- **Contenu mixte : pas un blocage** pour `127.0.0.1` dans Chrome (adresse de bouclage jugée fiable) : la requête passe jusqu'au serveur quand l'autre contrôle est levé.
- **Accès réseau local (Local Network Access, Chrome récent) : BLOQUE par défaut.** Message exact : « blocked by CORS policy: Permission was denied for this request to access the `loopback` address space », et **la requête n'atteint même pas le pont** ; des en-têtes CORS parfaits n'y changent rien. Dans un Chrome avec interface, Chrome doit afficher une invite d'autorisation la première fois, puis retenir le choix **par site** ; en mode sans interface elle est refusée d'office, donc **je n'ai pas pu vérifier l'invite elle-même**. En désactivant le contrôle (drapeau de test `--disable-features=LocalNetworkAccessChecks,…`), la requête passe et reçoit `pong`. Piège : un refus d'autorisation et un pont éteint donnent le MÊME échec (`Failed to fetch`) : l'appli doit afficher un message explicite au premier essai (« autorisez l'accès au réseau local pour DamikA ») et ne pas conclure « pas de pont » trop vite.
- Autres navigateurs (Firefox, Safari, Edge) : non testés. Safari bloquait historiquement les requêtes `http://` depuis une page `https://` même vers le bouclage ; à vérifier avant de promettre le mode natif hors Chrome.
- **Solution retenue** : pont + autorisation Chrome accordée une fois ; en secours, **le pont peut aussi servir lui-même les fichiers de DamikA** sur `http://127.0.0.1:47831/` : page et pont sont alors de la même origine, sans CORS, sans contenu mixte, sans invite (fonctionne aussi hors Chrome), au prix d'une copie locale du site à maintenir. Si on active un jour COOP/COEP sur le site, le pont devra aussi répondre `Cross-Origin-Resource-Policy: cross-origin`.

### 5. Licence et mentions

**Licence actuelle du dépôt DamikA** (`github.com/Mikado1666/DamikA`, public) : **aucune**. Pas de fichier `LICENSE` / `COPYING` / `NOTICE` / `README` à la racine (GitHub : `licenseInfo: null`). Sans licence, le code est « tous droits réservés » par défaut : le dépôt est lisible mais pas réutilisable. Seul `assets/sounds/LICENSE.txt` existe (Kenney, CC0, pour `game-start.mp3`). Bibliothèques embarquées dans `js/vendor/` : jsPDF, qrcode, lz-string (licences à relire une par une avant d'écrire un `NOTICE`).

**Ce que la GPL-3.0 impose si DamikA distribue Scan en WebAssembly** (envoyer le `.wasm` et son évaluation au navigateur = « transmettre » le programme) :
1. **Code source correspondant** de Scan tel que distribué : proposer le source exact du binaire (scan-wasm, commit précis, + Scan d'origine `github.com/rhalbersma/scan`), au même endroit que le téléchargement ou par offre écrite (art. 6). Le dépôt public DamikA peut contenir un dossier de sources ou un lien vers un commit figé.
2. **Texte de la licence** GPL-3.0 joint (fichier `LICENSE` ou `COPYING`) et **avis de copyright conservé** : « Scan 3.1 Copyright (C) 2015-2019 Fabien Letouzey, distribué sous GNU GPL version 3 » ; mention des modifications de scan-wasm (art. 5a) : elles sont déjà dans l'historique de `scan-wasm`.
3. **Pas de restriction supplémentaire** sur ce qui est distribué de Scan (pas d'interdiction de réutilisation, pas de licence propriétaire sur le binaire).
4. **Portée sur le reste de DamikA** : Scan tourne dans son propre Worker et ne parle à l'appli que par messages texte (protocole Hub) : on peut défendre qu'il s'agit de deux programmes distincts (agrégat), donc que le code de DamikA n'est pas contraint par la GPL. **Mais c'est une interprétation, pas une certitude** (à faire confirmer si la question compte) ; le plus simple, sans risque, est de placer tout DamikA sous une licence GPL-compatible. Le pont natif ne distribue pas Scan (Scan est déjà sur le PC de Mickaël) : pas d'obligation GPL propre, mais le citer reste correct.
5. **Provenance des binaires** : les `.wasm` viennent du dépôt Lidraughts (AGPL-3.0) sans commit de `scan-wasm` indiqué. **Recommandation** : recompiler soi-même depuis `scan-wasm` (emscripten) au commit `cbb251e`, pour que « source correspondant » = ce commit, vérifiable ; l'AGPL de Lidraughts concerne son propre code (interface), pas forcément la colle emscripten du moteur : point à confirmer.

**Licence recommandée (sans la modifier ici)** : **GPL-3.0-or-later pour tout le code de DamikA** : compatible avec Scan (GPL-3.0), avec jsPDF / lz-string / qrcode (licences permissives, à confirmer pour chacune) et avec les sons CC0 ; c'est la seule option qui ne laisse aucun doute en distribuant Scan. À décider par Mickaël (titulaire des droits sur son code). Alternative : garder DamikA sous droits réservés et défendre l'agrégat (point 4) : plus risqué. Fichiers à créer le moment venu : `LICENSE` (GPL-3.0), `NOTICE` (Scan, jsPDF, lz-string, qrcode, Kenney, avec versions et liens), `README.md`.

**Où afficher la mention de Scan** (aucun de ces endroits n'existe aujourd'hui : il n'y a ni écran « À propos », ni `README`, ni `NOTICE`) :
1. **Écran « À propos »** (à créer, accessible depuis le menu 🎨 ou la touche `?`, modale `.confirm-overlay` comme l'aide) : « DamikA analyse avec **Scan 3.1**, moteur de dames de **Fabien Letouzey** (GPL-3.0) », liens vers Scan, scan-wasm, le texte de licence, le source de DamikA ; version WebAssembly adaptée de scan-wasm (RoepStoep / Lidraughts).
2. **Écran d'analyse** : la ligne de `formatMeta()` (`js/ai/analysis-format.js`, aujourd'hui « Évaluation indicative · profondeur N · moteur V1b ») devient « **Moteur : Scan 3.1 par Fabien Letouzey** · profondeur N · WebAssembly / natif » ; la section « Moteur d'analyse » du menu 🎨 (`#analysis-engine-options`, `index.html`) porte le nom complet de Scan.
3. **README.md** à la racine : phrase de crédit en tête, section Licences.
4. **`LICENSE`** (GPL-3.0) et **`NOTICE`** (avis de copyright de Scan, de scan-wasm, de Lidraughts pour la colle, des bibliothèques et des sons).
5. **Dossier des binaires** (`README.txt` + copie de `LICENSE` + lien vers le source exact), exports PDF / PNG si l'analyse y figure (« Analyse : Scan 3.1 »), et au moment de l'intégration `CLAUDE.md` et la `description` de `manifest.json`.

### Verdict

**Faisable : oui pour chaque mode, blocages éventuels :**
- **Mode A, Scan WebAssembly dans le navigateur : OUI.** Force équivalente au natif, vitesse ≈ 80 à 97 % du natif mono-thread, 8,5 Mio à charger une fois (cache), aucun en-tête spécial (mono-thread, pas de COOP/COEP). Limites assumées : **pas de threads, pas de livre d'ouvertures, tables de finale seulement jusqu'à 3 pièces** ; pas de séquence de coups strictement identique au natif ; binaires à recompiler depuis `scan-wasm` pour une provenance propre ; licence à choisir (GPL-3.0-or-later recommandée) avant de distribuer.
- **Mode B, Scan natif via un pont local : OUI, sous une condition vérifiée.** Chrome récent **bloque** par défaut un site `https` qui contacte `127.0.0.1` (autorisation « réseau local » à accorder une fois ; l'invite elle-même n'a pas pu être testée en mode sans interface) ; le contenu mixte, lui, ne bloque pas. Autres navigateurs non testés. Repli : le pont sert aussi l'appli en local (même origine). Gains : 2 à 3 fois plus rapide à 4 threads, livre et tables jusqu'à 6 pièces ; coût : un programme à lancer, coups non déterministes à plusieurs threads.


## P25 — Scan 3.1 (WebAssembly) dans DamikA, avec licence et mentions (07/11/2026)

**Rien commité, rien poussé, `deploy.ps1` non lancé, rien écrit dans `data/`.** DamikA analyse désormais avec Scan 3.1 par défaut ; V0, V1b, V2b restent dans le code et dans le menu.

### Provenance et empreintes des binaires

- **Compilés par nous** (pas les binaires de Lidraughts) : `github.com/RoepStoep/scan-wasm` au commit `cbb251eff7051252ad0617fc03089bb51ce1be10`, variante « normal », Emscripten **7.0.0** (`emcc` 7.0.0, `777e6e5db7b4990bcaeb1b9998ed642cc84e6629`), installé avec ton accord dans un dossier temporaire hors dépôt (`emsdk` tag 7.0.0 ; `wasm-binaries.zip` 748 527 107 octets, plus Python 3.13.3 et Node d'emsdk). Aucun fichier source modifié : `<atomic>`, que le code de 2023 n'incluait pas, est forcé par `-include atomic`. Commande exacte : `third_party/scan/BUILD.txt`.
- **Données empaquetées** : `data/eval` + tables de finale 2 et 3 pièces (`bb-size 3`) de la distribution de Scan 3.1 (installation Turbo Dambase). **Évaluation vérifiée octet par octet** : SHA-256 de `data/eval` retrouvé dans `scan.data` (offset 48 260) = SHA-256 de `data\eval` de Scan natif = `0e7161c38af605f5e367f3f8fe17525d1c40db722714c68921971b386e58abba` (identique aussi à celle de Lidraughts, P24). Pas de livre ni de `scan.ini` (le build n'en charge pas).

| Fichier (`assets/engines/scan/`) | Octets | SHA-256 |
|---|---|---|
| `scan.js` (module ES, colle Emscripten) | 69 699 | `1a9e0e2b2969bbf63968db6d457be8e4509523dc238d76ce04e21b05f2aa64e5` |
| `scan.wasm` | 218 541 | `f35dfa46f3d1474716deb29efc2ee8528a5cf4e6068ccb26eeab036adee05747` |
| `scan.data` | 8 551 540 | `9563377bcf2b14dcf368388a641468ba1a3d1f3c1829c4daa405cbc692a4b8e2` |

Total à télécharger ≈ 8,5 Mio. Même recherche que le binaire de Lidraughts : mêmes nombres de nœuds sur le départ (116 439) et la partie 3 (188 235) à la profondeur 11. Le moteur s'annonce « Scan 3.1b » (`common.hpp` de scan-wasm) ; l'interface affiche « Scan 3.1 » comme demandé.

### Fichiers créés

- Moteur : `assets/engines/scan/{scan.js, scan.wasm, scan.data, README.txt, LICENSE}`.
- Source correspondant (GPL-3.0) : `third_party/scan/` (49 fichiers : les sources de scan-wasm au commit exact, `LICENSE`, `BUILD.txt` ; sans le `.gitignore` d'origine).
- Code : `js/ai/scan-worker.js` (Worker), `js/ai/scan-protocol.js` (fonctions pures du protocole Hub), `tests/scan-protocol.mjs` (71 vérifications).
- Licence et mentions : `LICENSE` (texte GPL-3.0, copie de celui de scan-wasm, vérifiée identique), `NOTICE`, `README.md`, `_headers` (types MIME de `LICENSE` / `NOTICE` sur Cloudflare).
- Captures et exports de vérification (ignorés par git, `training/scan-arena/out/` est dans `.gitignore`) : `training/scan-arena/out/p25/`.

### Fichiers modifiés

`CLAUDE.md`, `css/style.css` (styles « À propos »), `index.html` (entrée de menu, lien dans l'aide, modale « À propos »), `js/ai/analysis-controller.js` (Worker par moteur, `stop` au lieu de `terminate`, phase `loading`), `js/ai/analysis-format.js` (`SCAN_CREDIT`, `formatMeta`), `js/ai/engines.js` (moteur `scan`, `DEFAULT_ANALYSIS_ENGINE`), `js/main.js` (chargement, repli, À propos, légende PNG), `manifest.json` (description), `tests/engine-select.mjs` (liste des moteurs), `docs/SESSION_DERNIERE.md` (cette section), et `deploy.ps1` (ajout de `third_party`, `LICENSE`, `NOTICE`, `_headers` à la liste copiée ; **ce fichier est ignoré par git**, la modification n'apparaît donc pas dans `git status`). Le `.gitignore` modifié dans `git status` l'était avant cette session.

### Ce qui a été fait, en bref

- **Chargement** : à la première activation de l'analyse seulement (jamais au chargement de la page), dans son Worker module ; l'interface affiche « Chargement de Scan (8,5 Mo)… » ; le réglage est le moteur par défaut (clé `damika:analysis-engine` absente = Scan).
- **Protocole Hub** : paramètres (`tt-size 22`, `bb-size 3`) AVANT `init` ; position validée (51 caractères, pièce invalide refusée) ; partie terminée jamais soumise à Scan ; coup de Scan converti (rafle `départ x arrivée x pièces-prises` → séquence de `rules.js`) et **vérifié avec `generateLegalMoves`** (un coup non reconnu n'est jamais affiché, la ligne principale est tronquée au premier coup douteux) ; historique de coups de dame transmis par `moves=` pour les répétitions ; `go analyze` ; annulation par `stop`.
- **Niveau** : le réglage existant (1,5 s, profondeur 24 maximum) est conservé. **Le build scan-wasm n'applique AUCUNE limite de temps** (`move-time` ignoré, constaté : une recherche à 1,5 s a duré 8 s, profondeur 23) et ne lit `stop` qu'au début d'une itération. Le Worker applique donc le temps lui-même : `stop` dès que le temps est écoulé ou que la prochaine itération (≈ 2,5 × la dernière) dépasserait 1,25 × le temps, à chaque ligne `info`, avec un filet par minuterie. Mesuré sur la partie 3 : 1,43 s pour la profondeur 19.
- **Score** : point de vue du camp au trait ramené à celui des Blancs, en centipions ; ≥ 98 pions = mat « en N coups » ; 80 à 98 = finale gagnée des tables, plafonnée à ±15 pions (sinon « +89,6 » s'afficherait). Même format de résultat que `search.js` : barre, plaque, palier, flèche et ligne principale inchangés.
- **Contrôleur** : une nouvelle position pendant une analyse de Scan envoie `stop` (Scan reste chargé, sa table de transposition aussi) au lieu de détruire le Worker ; la dernière demande gagne.
- **Repli** : échec de chargement (fichiers absents, WebAssembly absent, erreur du moteur) = retour automatique sur V0 + message « Le moteur Scan 3.1 n'a pas pu démarrer (WebAssembly ou fichiers du moteur indisponibles) : retour au moteur V0. » ; le choix mémorisé n'est pas modifié.
- **Mentions** : (a) écran « À propos » (menu 🎨, « À propos de DamikA et de Scan », et lien dans l'aide ouverte par `?`) ; (b) ligne d'analyse ; (c) nom complet dans le menu des moteurs ; (d) légende « Analyse : Scan 3.1 » dans l'export PNG quand la flèche du meilleur coup est dessinée (l'export PDF ne contient aucune analyse : diagrammes de positions seulement, rien à ajouter).
- **Service Worker** : toujours désactivé, `sw.js` non touché. **À sa réactivation** : mettre en cache `assets/engines/scan/scan.js`, `scan.wasm` et `scan.data` (à la première utilisation du moteur, pas à l'installation ; comparer les URL sans chaîne `?v=`), plus `js/ai/scan-worker.js` et `js/ai/scan-protocol.js` dans `ASSETS`.

### Phrase exacte affichée dans « À propos »

**« DamikA analyse avec Scan 3.1, moteur de dames de Fabien Letouzey (GPL-3.0). »**
(en gras : « Scan 3.1 » et « Fabien Letouzey » ; suivie de : « DamikA est une application de visuel et d'analyse pour les dames internationales (10×10). Le moteur Scan tourne dans votre navigateur (WebAssembly), compilé à partir de l'adaptation scan-wasm de RoepStoep. DamikA est publié sous licence GPL-3.0 ou ultérieure. », puis les liens : Scan 3.1 (github.com/rhalbersma/scan), scan-wasm (github.com/RoepStoep/scan-wasm), `LICENSE`, `NOTICE`, code de DamikA (github.com/Mikado1666/DamikA), `third_party/scan/BUILD.txt`.)
Ligne d'analyse : « Moteur : Scan 3.1 par Fabien Letouzey · profondeur N · WebAssembly ». Légende PNG : « Analyse : Scan 3.1 ».

### Vérifications (Chrome 156 sans interface, serveur local `python -m http.server`, 07/11/2026)

| Vérification | Résultat |
|---|---|
| Scan charge et répond sur le **départ** | OK : `34-30`, profondeur 11, score 0,0, 116 439 nœuds ; 423 ms du premier message au résultat (chargement compris, serveur local) |
| **Partie 3 après 6…18-23** (`Wbbbbbbbbbbebbbbbbeeeeebweeweeeeweeeewwwwwwwwwwwwww`) | OK : `40-34`, −0,78, profondeur 11 ; **coup légal selon `generateLegalMoves`** (test dans la page) ; ligne principale de 24 coups convertie et rejouée sans coup illégal |
| Temps réel 1,5 s / profondeur 24 | OK : profondeur 19 en 1,43 s (avant l'ajout du contrôle du temps : 8 s) |
| Remplacement d'une analyse en cours | OK : la dernière demande gagne, résultat en 137 ms, l'ancienne est jetée |
| Interface : analyse (touche A) | OK : « Chargement de Scan (8,5 Mo)… » puis « Moteur : Scan 3.1 par Fabien Letouzey · profondeur N · WebAssembly » (profondeur 18 à 21), score, « Meilleur : 32-28 · … », flèche verte, jauge ; 4 coups suivants de la partie importée : l'analyse suit sans recharger ; aucune erreur console ; clé `damika:analysis-engine` absente |
| Menu des moteurs | OK : « Scan 3.1 (Fabien Letouzey) », « V0 (ancien moteur) », « V1b (appris) », « V2b (motifs) » |
| **Repli** : fichiers du moteur absents (serveur de test qui renvoie 404 sur `assets/engines/scan/`) | OK : message affiché, V0 coché dans le menu, analyse V0 qui tourne (« Évaluation indicative · profondeur N »), choix mémorisé inchangé ; seul le chemin « fichiers absents » a été testé, pas un navigateur sans WebAssembly (le code correspondant, `typeof WebAssembly`, est simple mais non exécuté) |
| « À propos » : menu, aide (`?` puis lien), fermeture par Échap | OK ; phrase exacte vérifiée dans la page ; thèmes sombre et clair lisibles |
| Export PNG avec analyse | OK : légende « Analyse : Scan 3.1 » sous « Coup 0 » (sans analyse : pas de ligne) |
| Tests Node | `tests/scan-protocol.mjs` (71 vérifications), `analysis-controller`, `analysis-format`, `engine-select`, `worker-analyse`, `repetition` : tout concorde |
| Chemins et liens ajoutés | 21 fichiers locaux présents ; liens externes (Scan, scan-wasm, DamikA, Emscripten, emsdk, jsPDF, qrcodejs, lz-string, Lidraughts) répondent 200 ; liens relatifs de l'écran « À propos » répondent 200 en local |

Captures (`training/scan-arena/out/p25/`) :
- `C:\Users\micka\damika\training\scan-arena\out\p25\analyse.png` (analyse avec Scan)
- `C:\Users\micka\damika\training\scan-arena\out\p25\a-propos.png` (écran « À propos », thème sombre)
- aussi : `a-propos-clair.png` (thème clair), `repli.png` (repli sur V0), `export-avec-analyse.png` et `export-sans-analyse.png` (légende PNG).

### Licences relues (`js/vendor/` et sons)

- **jsPDF 2.5.1** : MIT (en-tête du fichier). **qrcodejs 1.0.0** et **lz-string 1.5.0** : MIT ; ces deux fichiers n'ont pas d'en-tête, version et origine établies par comparaison d'empreinte SHA-256 avec les fichiers publiés (jsDelivr, cdnjs, dépôts GitHub, octets identiques). **Les trois sont compatibles avec la GPL-3.0.**
- **Kenney « Impact Sounds » (`game-start.mp3`)** : CC0, compatible.
- **À signaler sans trancher : `move.mp3`, `capture.mp3`, `game-end.mp3`** viennent du dépôt Lidraughts (AGPL-3.0, `assets/sounds/SOURCES.txt`) ; le dépôt n'indique pas de licence propre aux fichiers de sons. La GPL-3.0 (article 13) autorise de combiner un ouvrage AGPL-3.0 avec un ouvrage GPL-3.0, les termes de l'AGPL restant applicables à la partie AGPL (source offert aux utilisateurs du site : c'est le cas avec le dépôt public) ; mais la licence réelle de ces trois fichiers est à confirmer, ou ils sont à remplacer par des sons sous licence claire.

### Points ouverts (ce qui a échoué ou reste à décider)

1. **Rien n'est commité ni déployé.** `deploy.ps1` fait `git pull` dans un AUTRE dossier (`C:\Users\micka\DamikA`, pas ce dépôt-ci `C:\Users\micka\damika`) puis copie : il faut donc commiter et pousser avant de le lancer. Le dépôt GitHub étant public, `LICENSE`, `NOTICE`, 8,5 Mo de binaires et le source de Scan y deviendront visibles : ton accord est attendu.
2. **Choix de moteur déjà mémorisé** : Scan est le défaut quand la clé `damika:analysis-engine` est absente. Si ton navigateur a déjà mémorisé V0, V1b ou V2b, ce choix est respecté et tu devras choisir « Scan 3.1 » une fois dans le menu 🎨. À toi de dire si l'on doit forcer Scan pour tout le monde.
3. **Titulaire du droit d'auteur** : `LICENSE`/`NOTICE`/`README.md` indiquent « Copyright (C) 2026 Mickaël Callegari » (nom du compte git) : à confirmer. Aucun en-tête de licence n'a été ajouté fichier par fichier dans le code de DamikA (facultatif).
4. **Écart avec la consigne** : la colle JavaScript n'est pas celle de Lidraughts (leurs binaires ne sont pas utilisés) mais celle générée par Emscripten 7.0.0 (MIT / UIUC) ; `NOTICE` cite donc Emscripten, et Lidraughts pour l'origine de l'adaptation et du protocole.
5. **Sons Lidraughts** (voir ci-dessus) : licence à confirmer.
6. **`_headers`** (types MIME de `LICENSE` et `NOTICE`, fichiers sans extension) : écrit d'après la documentation Cloudflare lue en P24, non vérifié en ligne tant que le site n'est pas publié. Sans lui, ces deux liens se téléchargeraient au lieu de s'afficher (constaté en local : `application/octet-stream`).
7. **Limites de Scan dans le navigateur** (déjà vues en P24) : pas de livre d'ouvertures, pas de threads, tables de finale jusqu'à 3 pièces ; une itération longue ne peut pas être interrompue (un arrêt demandé en profondeur 22 attend la fin de l'itération, jusqu'à quelques secondes sur une position très ouverte) ; le temps est approximatif (un peu plus de 1,5 s possible). Le mode B (pont vers Scan natif) n'est pas dans P25.
8. L'invite d'autorisation du « réseau local » de Chrome n'a toujours pas pu être testée en mode sans interface (sans objet pour le mode A).


## P26 — Commit, push et déploiement de l'intégration de Scan (07/11/2026)

- **Commit d'intégration** : `43fefdd06e2763d572120de0b2d5f60483646c84`, branche `main`, poussé sur `origin/main` (`24f72b5..43fefdd`, sans push forcé). Le push a aussi publié 3 commits locaux antérieurs non encore poussés (`11b6b2d` P17-P18, `c663d66` P19, `d739ddb` docs P19). Phrase du commit : « P25-P26 : Scan 3.1 de Fabien Letouzey (WebAssembly) devient le moteur d'analyse par défaut, DamikA passe sous GPL-3.0-or-later ».
- **Migration unique** (`migrateAnalysisEngine`, `js/ai/engines.js`, appelée avant la création du contrôleur) : si `damika:analysis-engine` existe (V0, V1b, V2b), elle devient `scan` et le drapeau `damika:analysis-engine-migrated` est posé ; ensuite le choix du menu est respecté. Test : `tests/analysis-engine-migration.mjs` (clé absente, 3 anciennes clés, drapeau déjà posé, choix ultérieur, stockage indisponible).
- **NOTICE** : les 3 sons Lidraughts y figurent, avec « Licence propre au fichier non précisée par le dépôt d'origine » (dépôt AGPL-3.0).
- **Tests** : tous les tests de `tests/` verts (analysis-*, migration, scan-protocol, diff, endgame-rules, engine-select, eval-*, library-order, match, mate, opening-variety, perft + perft-positions, photo-match, position-editor, repetition, search-consistency, tactics, worker*, arena, fit, fit-struct, oracle). Non lancés : outils de mesure et de génération (bench, bench-engines, gauge-calibration, mine-positions, td-positions, endgame-demo, nada-vs-damika).
- **Contenu commité** : 72 fichiers (moteur, `third_party/scan`, js, index.html, css, tests, LICENSE, NOTICE, README.md, _headers, manifest.json, CLAUDE.md, `.gitignore` dont le seul changement est `training/scan-arena/out/`). Non commités : `training/scan-arena/` (dont les `p24-*.mjs`), `tests/nada-vs-damika.mjs`, `Claude outputs/`, `training/models/*` non suivis. Recherche de « C:\Users », « token », « key » : seul un chemin personnel trouvé, **dans `scan.js`** (identifiant de fichier de données écrit par Emscripten). **`scan.js` a été recompilé** depuis un dossier neutre (`C:\scandata`) : `scan.wasm` et `scan.data` sont octet pour octet identiques, nouvelle empreinte de `scan.js` : `1a9e0e2b2969bbf63968db6d457be8e4509523dc238d76ce04e21b05f2aa64e5` (69 699 octets), mise à jour dans `assets/engines/scan/README.txt` et la section P25. Le reste n'a que des faux positifs (« token » dans le code C++ de Scan) et le nom du titulaire du copyright.
- **Déploiement** : `deploy.ps1` fait `git pull` dans `C:\Users\micka\DamikA`, copie `css js assets data icons third_party` et `index.html manifest.json sw.js LICENSE NOTICE _headers` vers `C:\Users\micka\DamikA-deploy\site`, puis `npx wrangler versions upload` (qui n'active pas la version). `DamikA` et `damika` sont le MÊME dossier (même identifiant de fichier NTFS `0x…12891`). Script lancé : version `e061b735-9734-43c6-8370-86e31c2ac21e` (69 fichiers, 26 déjà présents) ; puis activée : `npx wrangler versions deploy e061b735-9734-43c6-8370-86e31c2ac21e@100% -y` → **SUCCESS, 100 % du trafic**.

### Vérifications en ligne (https://damika.shell-green.workers.dev, Chrome sans interface)

| Vérification | Résultat |
|---|---|
| (a) page sans erreur console | OK : aucun message d'erreur ni d'avertissement |
| (b) fichiers du moteur | `scan.js` 200 `text/javascript` 69 699 o ; `scan.wasm` 200 `application/wasm` 218 541 o ; `scan.data` 200, 8 551 540 o, **sans en-tête Content-Type** (le moteur le lit sans problème) |
| (c) `/LICENSE`, `/NOTICE` | 200 `text/plain; charset=utf-8`, affichés dans le navigateur, **aucun téléchargement** : `_headers` fonctionne (aussi pour `/third_party/scan/LICENSE`) |
| (d) analyse en ligne, départ | OK : « Moteur : Scan 3.1 par Fabien Letouzey · profondeur 18 · WebAssembly », 0,0, « Meilleur : 32-28 » |
| (d) partie 3 après 6…18-23 (Blancs au trait) | OK : profondeur 19, −0,8, « Meilleur : 39-33 » (coup légal : le Worker ne montre un coup qu'après vérification avec `generateLegalMoves`) |
| (e) « À propos » | s'ouvre, phrase exacte affichée ; ses 6 liens répondent 200 (3 sur le site, 3 vers GitHub) |
| (f) migration | `damika:analysis-engine = v0` posé avant le chargement → après : `scan`, drapeau `1`, « Scan 3.1 (Fabien Letouzey) » coché dans le menu |

Capture : `C:\Users\micka\damika\training\scan-arena\out\p26\analyse-en-ligne.png` (et `analyse-en-ligne-partie3.png`).

### Points ouverts

1. **Dossier temporaire d'Emscripten, à supprimer par toi si tu veux** (je n'y ai pas touché) : `C:\Users\micka\AppData\Local\Temp\claude\cc6d58d0e96b0292\68931124-adce-4d2b-bd71-d4a759b11e18\scratchpad\emsdk-work`, **2,2 Go** (le reste du dossier de session : 64 Mo ; plus `C:\scandata`, 17 Mo, dossier neutre créé pour la recompilation).
2. Les sons Lidraughts sont conservés avec la mention dans NOTICE ; leur licence réelle reste non précisée.
3. `scan.data` est servi sans type de contenu ; sans conséquence aujourd'hui, mais ajoutable dans `_headers` (`Content-Type: application/octet-stream`) si on le souhaite.
4. Le Service Worker reste désactivé (voir P25 : fichiers de Scan à y mettre en cache).
5. Reste hors suivi git : `training/scan-arena/` (scripts P21-P24, hors intégration), `tests/nada-vs-damika.mjs`, `Claude outputs/`.
