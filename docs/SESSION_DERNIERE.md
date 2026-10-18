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
