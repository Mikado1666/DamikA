# DAMIKA — Cahier des charges (Appli Jeu de Dames, PC + Mobile)

> Dernière mise à jour : 2026-09-27, après plusieurs sessions de développement
> ayant fermé la quasi-totalité du backlog "confort" de la V1 liseuse (sons,
> thème clair/sombre, export image/PDF, partage lien+QR, photo joueurs,
> thèmes de damier, easter egg, aide clavier, fichiers récents/favoris,
> annotations de coup, recherche/tri Bibliothèque, durée de la flèche, taille
> des pions). Rafraîchissement pur de ce document contre l'état réel du code
> (aucune fonctionnalité nouvelle ajoutée par cette passe) — voir
> `docs/HISTORIQUE_SESSIONS.md` et `CLAUDE.md` pour le détail technique de
> chaque chantier.

## 1. Objectif
Appli de jeu de dames internationales (10x10), gratuite, fluide et rapide, jouable sur PC et mobile.

## 2. Plateforme
- Développement V1 centré sur la version PC (le mobile suivra une fois la version PC solide).
- Environnement de test de référence : Google Chrome, zoom 100%.
- **Type** : PWA (Progressive Web App) — une seule codebase HTML/JS/CSS.
- **Hébergement** : déployé (Cloudflare Workers + assets statiques) — https://damika.shell-green.workers.dev
- **Contraintes** : pas de framework lourd, rendu Canvas, installable (icône écran d'accueil, plein écran). Le Service Worker existe (`sw.js`) mais est désactivé volontairement côté client — **pas de mode hors-ligne pour l'instant**.
- Pas de store, pas de compte développeur payant.

## 3. Règles du jeu
- Dames internationales 10x10 (FMJD/FFJD) :
  - Prise multiple obligatoire. ✅ implémenté
  - La grande prise (maximiser le nombre de pièces prises). ✅ implémenté
  - Dame volante (déplacement sur toute la diagonale, capture à distance). ✅ implémenté
- Promotion en cours de prise (un pion qui atteint la dernière rangée pendant une rafle devient dame et continue si une suite existe). ✅ implémenté
- Pas de variantes autres prévues pour la V1.
- Référence officielle : règlement FMJD. Le moteur (`js/engine/rules.js`) est correct sur les cas structurels relus dans le code (grande prise par comptage de pièces, dame volante, promotion en cours de rafle qui fait continuer la capture avec la portée d'une dame) mais **n'a fait l'objet d'aucune suite de tests automatisée ni d'une revue exhaustive contre le règlement complet** — Mickaël doit continuer à tester des positions réelles. Point resté en particulier non tranché explicitement : l'interprétation retenue (une pièce promue en cours de rafle continue à capturer comme une dame dans le même coup) est la plus courante côté FMJD mais reste un point disputé selon les fédérations/logiciels — à confirmer sur quelques positions officielles.

## 4. Fonctionnalités V1 — "Liseuse" (priorité : visuel parfait, zéro bug)

Légende : ✅ fait · 🟡 partiel · ⬜ pas commencé

- ✅ Plateau et pièces 10x10, rendu Canvas, fluide, sans bug (PC). Mobile : media queries en place mais **toujours non testées**.
- ✅ Import de parties au format PDN
- ✅ Export de partie à n'importe quel moment, au format PDN ou TXT
- ✅ Navigation dans une partie importée (avancer/reculer coup par coup, revenir à une position donnée, aller directement à un coup précis via clic dans la liste)
- ✅ Liste des coups affichée en permanence (colonne latérale), avec surlignage du coup courant — affiche la partie complète (coups joués + à venir)
- ✅ Annotation de coups : symboles (!, ?, !!, ??) ET commentaires texte, ajoutables/modifiables/supprimables via le même popover flottant sur un coup — inclus dans les exports PDN/TXT/PDF, symbole affiché en suffixe directement dans la liste des coups (ex. "42-38!"). *Note : implémenté récemment, pas encore validé en conditions réelles par Mickaël (popover, rendu PDF).*
- ✅ Export d'une position donnée en diagramme (image PNG ou JPEG au choix)
- ✅ Retournement du plateau (vue côté Blancs ou Noirs), raccourci clavier `F`
- ✅ Compteur de pièces restantes par camp, affiché en permanence
- ✅ Détection/affichage automatique des prises obligatoires (surbrillance orange pulsante)
- ✅ Bibliothèque des parties importées : liste persistante, recherche texte (joueurs + tournoi, insensible casse/accents) et tri (ordre manuel, date, joueur, Elo), combinables avec les filtres Toutes/Récentes/Favoris. *Note : recherche/tri implémentés récemment, pas encore validés en conditions réelles.*
- ✅ Undo/Redo lors de la saisie manuelle d'un coup
- ✅ Vitesse d'animation réglable (Normale / Rapide / Ultra-rapide / Instantanée)
- ✅ Mode plein écran / présentation
- ✅ Lecture automatique de la partie ("auto-play"), délai lié à la vitesse d'animation choisie
- ✅ Pause/Play pendant la lecture automatique
- ✅ Son des coups (pose, capture, début/fin de partie) — pack "Standard Lidraughts", contrôle de volume et mute dans la barre du haut
- ✅ Flèche du dernier coup : affichable/masquable (`showArrow`), **et durée d'affichage réglable** (Permanente / 2s / 3s / 5s, popover au survol de l'icône, persisté). Trace le chemin complet sur une prise multiple. *Note : réglage de durée implémenté récemment, pas encore validé en conditions réelles.*
- ✅ Déplacement "coup unique" — clic sur la seule case d'arrivée possible **ou** clic sur une pièce qui n'a qu'un seul coup légal (les deux jouent le coup directement, avec animation)
- ✅ Fluidité du déplacement des pièces (animations avec easing, rebond léger, fondu de capture)
- ✅ Surbrillance légère des cases d'arrivée possibles lors de la sélection d'une pièce
- ✅ Raccourcis clavier : flèches gauche/droite (navigation), `F` (retournement), Espace (play/pause lecture auto), Ctrl+S (enregistrer), Ctrl+V (coller), Échap (fermer une fenêtre), `?` (aide), + molette de la souris sur le damier (coup suivant/précédent, ajoutée après la 1re version du cahier). 🟡 la molette n'est **pas encore listée** dans l'écran d'aide (`?`), à ajouter — petit oubli de doc plutôt qu'un manque fonctionnel.
- ✅ Import multi-parties (un fichier PDN peut contenir plusieurs parties, onglet Bibliothèque pour naviguer entre elles)
- ✅ En-têtes de partie (headers PDN) : bandeau Événement/Lieu/Date/Ronde éditable, + nom/Elo/titre/score par joueur
- ✅ Export en image (PNG/JPEG) et PDF de la partie complète — mise en page dédiée (notation 2 colonnes Blancs/Noirs, diagrammes insérés sur les coups annotés, en-tête tournoi/joueurs)
- ✅ Partage par lien facilement partageable (compression LZString dans l'URL, `?p=`) + QR code (fond blanc), avertissement si lien trop long
- ✅ Glisser-déposer d'un fichier PDN directement sur l'appli
- ✅ Copier/coller une partie complète via le presse-papier (bouton Coller/Copier) — 🟡 toujours la partie entière, pas une position unique isolée
- ✅ Mode sombre/clair pour l'interface — thème clair "Miel doré" en plus du thème sombre par défaut, bouton dédié (🌙), indépendant du thème du damier
- ✅ Fichiers récents — 8 dernières parties ouvertes/chargées depuis la Bibliothèque, onglet dédié, persisté
- ✅ Favoris — marquage par étoile depuis la Bibliothèque, filtre dédié, persisté
- ✅ Écran d'aide listant les raccourcis clavier (bouton `?`) — liste actuellement 8 raccourcis, il manque la molette (cf. ci-dessus)
- ⬜ Packs de sons personnalisés — toujours un seul pack (Standard Lidraughts) ; volume/mute réglables, mais pas de choix entre plusieurs packs
- ✅ Animation de capture stylée (fondu + réduction d'échelle, pas une disparition sèche)
- ✅ Partage de position par QR code — intégré à la fonctionnalité de partage par lien ci-dessus (même modale, un seul et même mécanisme)
- ✅ Easter egg "Damika" caché (cliquer 5 fois sur le wordmark "DamikA" du header)
- ✅ Logo/identité visuelle : losange bronze + wordmark "DamikA" en dégradé (header,
  favicon, icônes PWA)
- ✅ Bouton "Nouvelle partie" + logo cliquable, reset complet avec confirmation si
  coups en cours
- ✅ Personnalisation du damier : 4 thèmes de couleurs (Bois, Ardoise, Vert, Beige), sélectionnables via le menu 🎨. 🟡 **non persisté** : le choix revient au thème par défaut ("Bois") à chaque rechargement de page — contrairement aux autres réglages visuels récents (taille des pions, durée de flèche, thème clair/sombre), ce réglage n'a pas encore de clé localStorage dédiée.
- ✅ Personnalisation des pions : 3 styles (Classique, Relief, Bois gravé) **et** taille réglable (Petit / Normal / Grand, plafonnée pour ne jamais déborder de la case), dans le même menu 🎨. Taille persistée (`damika:piece-size`). 🟡 le **style** de pion n'est en revanche **pas persisté**, même limitation que le thème du damier ci-dessus.
- ✅ Numérotation des cases (notation FMJD 1-50) affichée sur les bords, hors des cases
- ✅ Flèche du dernier coup — dégradé doré, liseré sombre, pointe nette qui affleure le pion sans le dépasser ; trace le chemin complet sur une prise multiple (passe par chaque case intermédiaire, pas une ligne droite départ→arrivée)
- ✅ Exigence visuelle générale : rendu propre et professionnel — taille de l'interface calibrée pour correspondre au rendu souhaité à 100% de zoom Chrome
- ✅ Bandeau joueurs : bande latérale gauche façon toernooibase/Turbo Dambase (photo, nom, Elo, titre, score, pions, empilés verticalement)
- ✅ Photo des joueurs — upload de fichier (compressé en local, 160×160 JPEG) **ou** récupération automatique via un Worker Cloudflare dédié interrogeant Toernooibase (bouton "🔍 Récupérer sur Toernooibase"), avec repli sur avatar-lettre si aucune photo

## 5bis. Compteur de temps (théorie des finales)
✅ Implémenté conformément à la spec (`js/engine/rules.js` → `computeTempoDifferential`) :
- Calcul du temps total par camp (rang × nombre de pions sur ce rang, sommé)
- Différentiel affiché avec le bon signe selon le trait
- Désactivation automatique dès qu'une dame apparaît sur le plateau
- Affiché en permanence dans un panneau dédié à côté du plateau, mis en avant visuellement (gros chiffre doré + barre de tendance)

## 6. Notation
Convention adoptée (FMJD) : une rafle ne note que la case de départ et la case d'arrivée
(ex. `30x28`, pas `30x19x28`). L'import PDN tolère les deux formes — s'il trouve le chemin
complet il le vérifie, sinon il retrouve la séquence légale par ses seules extrémités. Les
symboles d'annotation (!, ?, !!, ??) sont notés en suffixe direct du coup (ex. `30x28!`),
distincts des commentaires `{entre accolades}` qui précèdent le coup qu'ils annotent.
La flèche visuelle, elle, trace toujours le chemin complet quelle que soit la notation.

## 7. Phasage du projet
1. **Liseuse PC** : quasi finalisée. Le cœur (règles, plateau, PDN, navigation) est solide,
   et la quasi-totalité des fonctionnalités de confort listées en section 4 sont livrées
   (sons, thèmes clair/sombre, annotations éditables, fichiers récents/favoris, recherche/tri
   Bibliothèque, export image/PDF, partage lien/QR, photo joueurs, personnalisation
   damier/pions, durée de flèche réglable). Restent, par ordre de priorité décroissante :
   - Persistance du thème de damier et du style de pion choisis (revient au défaut à chaque F5).
   - Packs de sons personnalisés (un seul pack pour l'instant).
   - Molette absente de l'écran d'aide (`?`).
   - Une passe de test FMJD plus systématique (pas de suite de tests automatisée), en
     particulier sur la promotion en cours de rafle (cf. section 3).
   - Validation en conditions réelles des tout derniers chantiers (annotations, recherche/tri
     Bibliothèque, durée de flèche, taille des pions) — codés et vérifiés statiquement, pas
     encore testés dans un vrai navigateur par Mickaël.
2. **Chantier Mobile** : pas commencé au-delà de quelques media queries de repli, jamais testées.
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
- [x] Rendu Canvas du plateau (thèmes, styles/taille de pièces, animations, flèche de coup)
- [x] Import/export/replay PDN (mono et multi-parties)
- [x] Compteur de temps implémenté
- [x] Bandeau joueurs (nom, Elo, titre, score, photo) éditable, rail latéral
- [x] Logo + identité visuelle "Damika" (losange bronze, wordmark, header aligné,
  favicon/icônes PWA)
- [x] Fonctionnalité "Nouvelle partie" (bouton + logo cliquable, confirmation)
- [x] Sons, thème clair/sombre, aide clavier, annotations éditables, fichiers récents/favoris,
  recherche/tri Bibliothèque, export image/PDF, partage lien/QR code, personnalisation
  damier/pions (style + taille)
- [ ] Liseuse PC finalisée à 100% — reste : persistance thème damier/style de pion, packs de
  sons personnalisés, molette dans l'écran d'aide, tests FMJD plus systématiques, validation
  navigateur des tout derniers chantiers (cf. section 7)
- [ ] Chantier Mobile
- [ ] IA (étape finale)

Voir `CLAUDE.md` à la racine du projet pour le contexte technique (architecture,
conventions de code, pièges connus) destiné aux futures sessions de développement.
