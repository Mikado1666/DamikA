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
