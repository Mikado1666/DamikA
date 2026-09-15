# DAMIKA — Cahier des charges (Appli Jeu de Dames, PC + Mobile)

> Dernière mise à jour : 2026-09-15, après la session de développement initiale
> (setup, moteur de règles, liseuse PC, import/export PDN, refonte visuelle,
> corrections d'interaction plateau), suivie d'une 2e session le même jour
> (renommage DAMICK→Damika, logo/identité visuelle, refonte du dimensionnement
> responsive du damier/layout, fonctionnalité "Nouvelle partie" — voir
> `CLAUDE.md` section "Session logo/branding" pour le détail technique).

## 1. Objectif
Appli de jeu de dames internationales (10x10), gratuite, fluide et rapide, jouable sur PC et mobile.

## 2. Plateforme
- Développement V1 centré sur la version PC (le mobile suivra une fois la version PC solide).
- Environnement de test de référence : Google Chrome, zoom 100%.
- **Type** : PWA (Progressive Web App) — une seule codebase HTML/JS/CSS.
- **Hébergement** : gratuit (GitHub Pages, Netlify ou Vercel) — *pas encore déployé, tourne en local pour l'instant.*
- **Contraintes** : pas de framework lourd, rendu Canvas, installable (icône écran d'accueil, plein écran, offline).
- Pas de store, pas de compte développeur payant.

## 3. Règles du jeu
- Dames internationales 10x10 (FMJD/FFJD) :
  - Prise multiple obligatoire. ✅ implémenté
  - La grande prise (maximiser le nombre de pièces prises). ✅ implémenté
  - Dame volante (déplacement sur toute la diagonale, capture à distance). ✅ implémenté
- Promotion en cours de prise (un pion qui atteint la dernière rangée pendant une rafle devient dame et continue si une suite existe). ✅ implémenté
- Pas de variantes autres prévues pour la V1.
- Référence officielle : règlement FMJD. Le moteur (`js/engine/rules.js`) a été testé sur les cas classiques (prise multiple, grande prise en cas d'égalité de longueur, dame volante, promotion en cours de rafle) mais **n'a pas fait l'objet d'une revue exhaustive contre le règlement complet** — Mickaël doit continuer à tester des positions réelles.

## 4. Fonctionnalités V1 — "Liseuse" (priorité : visuel parfait, zéro bug)

Légende : ✅ fait · 🟡 partiel · ⬜ pas commencé

- ✅ Plateau et pièces 10x10, rendu Canvas, fluide, sans bug (PC). Mobile : media queries en place mais **non testées**.
- ✅ Import de parties au format PDN
- ✅ Export de partie à n'importe quel moment, au format PDN ou TXT
- ✅ Navigation dans une partie importée (avancer/reculer coup par coup, revenir à une position donnée, aller directement à un coup précis via clic dans la liste)
- ✅ Liste des coups affichée en permanence (colonne latérale), avec surlignage du coup courant — affiche désormais la partie complète (coups joués + à venir), pas seulement ce qui a été "rejoué"
- 🟡 Annotation de coups (symboles !, ?, !!, ?? et commentaires texte) — le parseur PDN les lit et les ignore proprement, mais **il n'y a pas encore d'interface pour les ajouter/éditer/afficher**
- ⬜ Export d'une position donnée en diagramme (image)
- ✅ Retournement du plateau (vue côté Blancs ou Noirs), raccourci clavier `F`
- ✅ Compteur de pièces restantes par camp, affiché en permanence
- ✅ Détection/affichage automatique des prises obligatoires (surbrillance orange pulsante)
- ✅ Bibliothèque des parties importées (liste basique) — 🟡 pas encore de recherche/tri
- ✅ Undo/Redo lors de la saisie manuelle d'un coup
- ✅ Vitesse d'animation réglable (Normale / Rapide / Ultra-rapide / Instantanée)
- ✅ Mode plein écran / présentation
- ✅ Lecture automatique de la partie ("auto-play"), délai lié à la vitesse d'animation choisie
- ✅ Pause/Play pendant la lecture automatique
- ⬜ Son des coups (pose, capture)
- 🟡 Flèche du dernier coup : affichable/masquable (`showArrow`), mais **pas de réglage de durée d'affichage** — reste visible jusqu'au coup suivant
- ✅ Déplacement "coup unique" — étendu cette session : clic sur la seule case d'arrivée possible **ou** clic sur une pièce qui n'a qu'un seul coup légal (les deux jouent le coup directement, avec animation)
- ✅ Fluidité du déplacement des pièces (animations avec easing, rebond léger, fondu de capture)
- ✅ Surbrillance légère des cases d'arrivée possibles lors de la sélection d'une pièce
- ✅ Raccourcis clavier : flèches gauche/droite (navigation), `F` (retournement), Espace (play/pause lecture auto)
- ✅ Import multi-parties (un fichier PDN peut contenir plusieurs parties, onglet Bibliothèque pour naviguer entre elles)
- ✅ En-têtes de partie (headers PDN) : bandeau Événement/Lieu/Date/Ronde éditable, + nom/Elo/titre/score par joueur
- ⬜ Export en image/PDF de la partie complète
- ⬜ Partage par lien facilement partageable (l'export fichier existe, pas de lien)
- ✅ Glisser-déposer d'un fichier PDN directement sur l'appli
- ✅ Copier/coller une partie complète via le presse-papier (bouton Coller/Copier) — 🟡 c'est la partie entière, pas une position unique isolée
- ⬜ Mode sombre/clair pour l'interface (thème sombre fixe uniquement pour l'instant)
- ⬜ Fichiers récents
- ⬜ Favoris
- ⬜ Écran d'aide listant les raccourcis clavier
- ⬜ Packs de sons personnalisés
- ✅ Animation de capture stylée (fondu + réduction d'échelle, pas une disparition sèche)
- ⬜ Partage de position par QR code
- ✅ Easter egg "Damika" caché (cliquer 5 fois sur le wordmark "DamikA" du header —
  déplacé du pied de page, retiré, vers le header lors d'une session précédente)
- ✅ Logo/identité visuelle : losange bronze + wordmark "DamikA" en dégradé (header,
  favicon, icônes PWA)
- ✅ Bouton "Nouvelle partie" + logo cliquable, reset complet avec confirmation si
  coups en cours
- ⬜ Personnalisation du damier (thèmes de couleurs multiples) — un seul thème "bois" (walnut) pour l'instant, mais le code est structuré pour en ajouter d'autres
- ⬜ Personnalisation des pions (styles, taille)
- ✅ Numérotation des cases (notation FMJD 1-50) affichée sur les bords, hors des cases
- ✅ Flèche du dernier coup — refonte visuelle cette session (dégradé doré, liseré sombre, pointe nette qui affleure le pion sans le dépasser) ; **trace le chemin complet sur une prise multiple** (passe par chaque case intermédiaire, pas une ligne droite départ→arrivée)
- ✅ Exigence visuelle générale : rendu propre et professionnel — taille de l'interface calibrée pour correspondre au rendu souhaité à 100% de zoom Chrome
- ✅ Bandeau joueurs — **refondu cette session** : abandon du format haut/bas façon échecs au profit d'une bande latérale gauche façon toernooibase/Turbo Dambase (photo, nom, Elo, titre, score, pions, empilés verticalement)
- ⬜ Photo des joueurs par upload ou récupération automatique (base FMJD/Turbo Dambase) — avatar = simple lettre-placeholder pour l'instant

## 5bis. Compteur de temps (théorie des finales)
✅ Implémenté conformément à la spec (`js/engine/rules.js` → `computeTempoDifferential`) :
- Calcul du temps total par camp (rang × nombre de pions sur ce rang, sommé)
- Différentiel affiché avec le bon signe selon le trait
- Désactivation automatique dès qu'une dame apparaît sur le plateau
- Affiché en permanence dans un panneau dédié à côté du plateau, mis en avant visuellement (gros chiffre doré + barre de tendance)

## 6. Notation
Convention adoptée (FMJD) : une rafle ne note que la case de départ et la case d'arrivée
(ex. `30x28`, pas `30x19x28`). L'import PDN tolère les deux formes — s'il trouve le chemin
complet il le vérifie, sinon il retrouve la séquence légale par ses seules extrémités.
La flèche visuelle, elle, trace toujours le chemin complet quelle que soit la notation.

## 7. Phasage du projet
1. **Liseuse PC** : en bonne voie, pas encore finalisée. Le cœur (règles, plateau, PDN,
   navigation) est solide et testé ; il manque surtout les fonctionnalités de confort
   (sons, thèmes, aide clavier, annotations éditables, fichiers récents/favoris) listées
   ci-dessus en ⬜.
2. **Chantier Mobile** : pas commencé au-delà de quelques media queries de repli.
3. **IA** : pas commencé (prévu en dernier, volontairement).

## 8. Méthodologie de travail
- **Claude (Cowork)** : cadrage, specs fonctionnelles, décisions d'archi haut niveau, docs de référence, arbitrage.
- **Claude Code** : implémentation réelle — moteur de règles, rendu Canvas, structure du projet, tests, visuel/design, affiné par itérations directes avec retour visuel de Mickaël.

Flux : cahier des charges (Claude/Cowork) → code + design (Claude Code) → retour vers Claude/Cowork pour trancher les points de blocage fonctionnels.

## 9. Statut global
- [x] Nom du projet validé : DAMIKA
- [x] Objectif et plateforme validés (PWA, Canvas, PC d'abord)
- [x] Règles du jeu validées et implémentées (FMJD 10x10)
- [x] Setup repo + moteur de règles 10x10
- [x] Rendu Canvas du plateau (thème, pièces, animations, flèche de coup)
- [x] Import/export/replay PDN (mono et multi-parties)
- [x] Compteur de temps implémenté
- [x] Bandeau joueurs (nom, Elo, titre, score) éditable, refondu en rail latéral
- [x] Logo + identité visuelle "Damika" (losange bronze, wordmark, header aligné,
  favicon/icônes PWA)
- [x] Fonctionnalité "Nouvelle partie" (bouton + logo cliquable, confirmation)
- [ ] Liseuse PC finalisée à 100% (sons, thèmes, aide clavier, annotations éditables, fichiers récents/favoris, photo joueurs, export image/PDF, partage lien/QR code restent à faire)
- [ ] Chantier Mobile
- [ ] IA (étape finale)

Voir `CLAUDE.md` à la racine du projet pour le contexte technique (architecture,
conventions de code, pièges connus) destiné aux futures sessions de développement.
