# Session — Chantier IA, Étage 1 : moteur rapide (V0)

Journal chronologique. Chaque point d'étape (plan, divergence, résultat de test) y est consigné au fil de l'eau.
Date de début : 2026-10-18. Rien n'est commité sans validation de Mickaël.

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
