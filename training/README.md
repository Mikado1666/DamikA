# training/ — arène et auto-jeu (étage 3.1)

Outils en ligne de commande pour l'étage 3 de l'IA (apprentissage de l'évaluation). **Aucun lien avec l'appli** :
rien ici ne change l'interface ni l'analyse. Les parties et les journaux vont dans `training/data/` et
`training/logs/`, **ignorés par git** (aucune donnée nominative : les parties sont jouées par le moteur).

| Fichier | Rôle |
|---|---|
| `arena.mjs` | programme principal : `match` (A contre B) et `selfplay` (le moteur joue contre lui-même), en parallèle |
| `game.mjs` | une partie complète : règles, ouvertures, exploration, vérification avec `rules.js` |
| `jobs.mjs`, `worker.mjs` | une tâche (paire de parties ou partie) et le fil d'exécution qui la joue |
| `stats.mjs` | score, différence d'Elo, intervalle de confiance à 95 % |
| `verify.mjs` | rejoue les parties enregistrées avec `rules.js` (contrôle de légalité indépendant) |
| `sleep.mjs` | empêche la mise en veille de Windows pendant le calcul |
| `fit.mjs`, `fit-lib.mjs` | **étape 3.2** : apprend des tables d'évaluation (V1, V1b) à partir de parties d'auto-jeu |
| `fit-struct.mjs`, `fit-struct-run.mjs` | **étape 3.3** : tables + caractéristiques de STRUCTURE (V2), choix global / par phase par la mesure |
| `bench-eval.mjs` | coût en vitesse des évaluateurs (ns par position, nœuds/s de la recherche), sur positions réelles |
| `models/` | tables apprises (petits JSON d'entiers, utilisables par `--evaluator learned:…`) |

## Lancer (dans un terminal séparé, depuis la racine du dépôt `C:\Users\micka\DamikA`)

**Match** : A (ici « v0 ») contre B (un fichier de poids), 200 paires de parties, profondeur 6 :
```
node training/arena.mjs match --a v0 --b training/data/poids-test.json --depth 6 --pairs 200 --out training/data/match-1
```
**Auto-jeu pour une nuit** (profondeur 8, 6 000 parties, enregistre toutes les positions) :
```
node training/arena.mjs selfplay --evaluator v0 --depth 8 --games 6000 --out training/data/selfplay-nuit-1
```
(Les recommandations chiffrées pour une nuit sont dans `docs/SESSION_DERNIERE.md`, section « Étage 3.1 ».)

**Évaluateur appris** (étape 3.2) : `learned:<fichier.json>` (tables de 50 valeurs pour les pions et pour les dames, éventuellement
3 jeux selon le nombre de pièces ; voir `js/ai/eval-learned.js`). Exemple de match contre V0, profondeur 6, 400 paires :
```
node training/arena.mjs match --a learned:training/models/v1-l0.json --b v0 --depth 6 --pairs 400 --out training/data/m-v1
```
L'identité du run (reprise) inclut l'empreinte du CONTENU du fichier : modifier le fichier sous le même nom empêche de reprendre
un run avec un autre évaluateur (utiliser un autre `--out`).

Évaluateur = `v0` (évaluation actuelle écrite à la main) ou un fichier JSON de poids : un objet avec les clés de
`EVAL_WEIGHTS` (`man`, `king`, `advance` [9 nombres], `tempo`, `centerCoreMan`, …). Les clés absentes gardent
la valeur de `v0` ; les valeurs sont arrondies au centipion entier. Exemple : `{ "centerCoreMan": 8, "backRank": 10 }`.

## Reprendre après un arrêt
Relancer **exactement la même commande**. Le script relit `games.jsonl`, retire une ligne finale tronquée ou une
paire à moitié écrite, et ne rejoue que ce qui manque. Pour jouer plus de parties, relancer avec un `--games` /
`--pairs` plus grand dans le même `--out`. Si les réglages (profondeur, graine, évaluateurs…) diffèrent, le script
refuse de mélanger les résultats : utiliser un autre `--out`.
**Ctrl+C** arrête proprement (les tâches en cours sont perdues, rejouées à la reprise). Fermer la fenêtre ou
couper le courant ne casse rien non plus.

## Où lire les résultats
- Dans le terminal, une ligne toutes les 30 s : tâches faites, parties/heure, V/N/D en cours, temps restant, mémoire.
  Le même journal est dans `training/logs/<nom du dossier --out>.log`.
- `<out>/games.jsonl` : une ligne par partie (coups, résultat, motif de fin, durée, nœuds ; en auto-jeu, toutes les
  positions). `<out>/summary.json` : totaux, écrits à la fin (ou à l'arrêt). `<out>/meta.json` + `weights-*.json` : réglages.
- Match : l'affichage final donne victoires / nulles / défaites de A, score en %, différence d'Elo (A − B) avec
  intervalle de confiance à 95 % et le nombre de paires, avec des avertissements (« échantillon faible »,
  « différence non significative »). Méthode dans `stats.mjs` et dans le rapport.
- Relire une partie avec `rules.js` : `node training/verify.mjs <out>`.

## Options utiles
`--depth <n>` (obligatoire : profondeur fixe) · `--depth-a`, `--depth-b` (match, profondeurs différentes) ·
`--seed <n>` (1) · `--workers <n>` (cœurs − 1) · `--open-plies <K>` (8 demi-coups d'ouverture au hasard) ·
`--open-threshold <pions>` (0,5 : ouverture rejetée si |évaluation V0 à faible profondeur| est plus grande) ·
`--probe-depth <n>` (4) · `--max-plies <n>` (300 = nulle) · `--nodes <n>` (budget de nœuds, reproductible) ·
`--time <ms>` (budget de temps, **non** reproductible) · `--no-verify` (saute le contrôle `rules.js` de chaque
partie, ~1 % du temps) · `--allow-sleep` (ne pas bloquer la veille) · `--progress-sec <s>` (30) ·
auto-jeu : `--explore-prob <p>` (0,08) et `--explore-margin <cp>` (30).

## Ce que font les parties
- **Ouverture** : K demi-coups au hasard parmi les coups légaux, rejetée si déséquilibrée (évaluation V0). En match,
  chaque ouverture est jouée **deux fois, couleurs inversées** (une « paire ») ; en auto-jeu, une partie par ouverture.
- **Fin de partie** : plus de coup = perte ; 25 coups de dames sans prise ni coup de pion = nulle ; 3e répétition =
  nulle ; limites de finale FMJD 6.3 (16 coups), 6.4 (5 coups) et clause de la grande diagonale = nulle (motifs `endgame16`,
  `endgame5`, `diagonal5`, même code que l'analyse : `FastBoard`) ; 300 demi-coups = nulle. L'identité d'un run porte `endgameRules` :
  un run commencé SANS ces règles (avant la branche `regles-6-3-6-4`) ne se reprend pas avec ce code, et `verify.mjs` lui applique
  les anciennes règles (absence du champ).
- **Exploration** (auto-jeu seulement) : après l'ouverture, avec la probabilité `--explore-prob`, le coup est tiré au
  hasard parmi ceux dont le score (recherche à profondeur − 1) est à moins de `--explore-margin` centipions du meilleur.
- **Reproductibilité** : même graine et mêmes réglages = mêmes parties, coup pour coup (chaque tâche a sa propre
  graine dérivée de la graine, de son numéro et de sa nature). Ni le nombre de workers ni les reprises n'y changent rien.

## Format d'une ligne de `games.jsonl`
Commune : `mode`, `white`/`black` (nom de l'évaluateur), `opening` (nombre de demi-coups d'ouverture aléatoires, joués
sans recherche), `result` (`1-0`, `0-1`, `1/2`, du point de vue des Blancs), `reason` (`noMoves`, `quiet`, `repetition`,
`maxPlies`), `plies`, `moves` (notation `32-28`, `27x9` ; `/18.13` = pièces prises si ambigu), `nodes`, `searches`,
`explored` (coups d'exploration réellement différents du meilleur), `ms`.
- Match : `pair`, `g` (0 : A blanc ; 1 : A noir), `aWhite`, `a` (points de A : 1, 0,5, 0).
- Auto-jeu : `game` et `p` = liste des positions **hors ouverture**, une par demi-coup :
  `[plateau, camp, n° de demi-coup, compteur sans prise ni coup de pion, score, profondeur, prise_disponible]`
  - `plateau` : 50 caractères, cases 1 à 50 : `.` vide, `w` pion blanc, `W` dame blanche, `b` pion noir, `B` dame noire ;
  - `camp` : `w` ou `b` (au trait) ; `score` : centipions, point de vue des Blancs (±29 000 et plus : mat) ;
  - `prise_disponible` : 1 si le camp au trait a une prise obligatoire (position non calme : à filtrer à l'apprentissage) ;
  - le résultat final de la partie (champ `result`, point de vue des Blancs) vaut pour toutes ses positions.

## Mise en veille de Windows
Par défaut, `arena.mjs` lance un petit PowerShell qui appelle `SetThreadExecutionState(ES_CONTINUOUS | ES_SYSTEM_REQUIRED)` :
le PC ne se met pas en veille tant que le calcul tourne (l'écran peut s'éteindre). C'est rétabli tout seul à la fin,
et aussi si le script plante (le PowerShell surveille le script et s'arrête de lui-même, en moins de 5 s). Le journal
affiche `veille Windows : bloquée pendant le calcul` quand c'est actif. Si ce n'est pas le cas (message « NON bloquée »),
procédure manuelle : Paramètres → Système → Alimentation → « Mise en veille » : Jamais (sur secteur), à rétablir ensuite ;
ou, dans un terminal, `powercfg /change standby-timeout-ac 0` puis, après l'entraînement, `powercfg /change standby-timeout-ac 30`.
Le PC doit rester **branché sur secteur** et le couvercle d'un portable ne doit pas être fermé.

## Matériel et limites
Mesuré sur ce PC (voir le rapport) : 8 cœurs logiques, 16 Go de RAM, RTX 2060 6 Go, Node 24, Python 3.12 (NumPy, sans
PyTorch). Le script baisse sa priorité système : le PC reste utilisable. Une partie de 100 demi-coups à la profondeur 8
prend de l'ordre de la minute et demie par cœur ; une profondeur de plus multiplie le temps par ~3.

## Apprendre des tables (étape 3.2)
```
node training/fit.mjs --data training/data/selfplay-nuit-1 --out training/models
```
Lit `games.jsonl` en flux (positions calmes seulement : hors ouverture, sans prise disponible, sans mat), met 15 % des
PARTIES de côté pour la validation, calcule la perte de V0 (baseline), ajuste par la méthode de Newton (déterministe) les tables
V1 (un jeu) et V1b (3 jeux selon le nombre de pièces : ≥ 30, 15 à 29, < 15) pour chaque λ (part du résultat final dans la cible),
affiche les tables en grilles 10×10 et écrit `training/models/*.json` + `fit-report.json`. Durée : moins d'une minute.
Options : `--lambda 0,0.5,1`, `--phases 1,3`, `--alphas …`, `--seed`, `--val`, `--game-weight 0|0.5|1`, `--tag`, `--grids all|v1|none`.
Méthode complète : en-tête de `fit-lib.mjs` et rapport « Étape 3.2 » de `docs/SESSION_DERNIERE.md`. **Seule l'arène juge** :
une perte plus basse ne suffit pas, il faut un match gagné contre V0 (intervalle de confiance au-dessus de 0 Elo).

**Évaluer sans fuite** : les ouvertures d'une partie ou d'une paire viennent de `--seed` et de son numéro. Pour mesurer un modèle
dans l'arène, utiliser une graine DIFFÉRENTE de celle de l'auto-jeu qui a servi à l'apprendre (nuit 1 : graine 1 ; matchs
d'évaluation : `--seed 777`), sinon les premières ouvertures du match sont celles des premières parties d'entraînement.
Pour générer de nouvelles données avec un évaluateur appris : `--seed 2` (ou autre) et un nouveau dossier `--out`.

## Caractéristiques de structure (étape 3.3)
Les évaluateurs appris peuvent porter, par phase, un objet `features` : { nom: poids entier } (registre `FEATURES` de
`js/ai/eval-learned.js` : `sup`, `pair`, `blocked`, `free`, `kmob`, `wing`, `kvm`, `fort`, `promo`, `isol`). L'évaluation vaut
tables + Σ poids × (compteur Blancs − compteur Noirs) ; symétrie miroir exacte, valeurs entières, garde-fou de mat sur la borne.
```
node training/fit.mjs --data training/data/selfplay-nuit-1 --base training/models/v1b-l0.json --families F1,F2,F3,F4,F5,F6 --tag s33
node training/fit.mjs … --combo kvm,fort,wing --combo-name KFW --lambda 0.5 --game-weight 1 --freeze-tables 1 --tag x33
node training/bench-eval.mjs training/models/v1b-l0.json training/models/s33-F5.json
```
`--freeze-tables` n'apprend que les poids de structure (les tables restent celles de la base) ; `--data a,b` lit plusieurs auto-jeux.
Un modèle dont la borne de mat dépasse 29 000 est refusé par l'évaluateur et signalé INVALIDE par l'apprentissage.
