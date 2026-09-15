# Retours session Mickaël (post-refonte visuelle) — 2026-09-16

Suite à la refonte visuelle appliquée par Claude Code (couleurs damier, pièces
flat, flèche cyan, timing d'animation — voir `ARTEFACT_REFERENCE_DESIGN.md`),
Mickaël a testé en direct et fait ces retours. Deux blocs : visuel (à traiter
maintenant) et fonctionnel (backlog du cahier des charges, à planifier).

**Règle de travail inchangée** : ne rien régénérer/republier sans confirmation
préalable de Mickaël. Montrer le diff avant de committer.

---

## A. Visuel / interaction — à traiter maintenant

### A1. Style de pion "Relief" (option, pas un remplacement)
Le nouveau style flat plaît, mais Mickaël regrette le rendu biseauté d'origine
de Damick (gradient radial, anneau intérieur, ombre). Ne pas le supprimer :
l'ajouter comme 2e option dans le sélecteur Pions, à côté de "Classique".
Le rendu biseauté existant dans `board.js` (fonction `drawPiece` actuelle
avant cette session, ou l'historique git) sert de base pour ce style.

### A2. Style de pion "Bois gravé"
3e option de pion : pièces dorées/noires avec anneaux concentriques gravés
(cf. capture d'écran fournie par Mickaël — motif à cercles concentriques).
Code source disponible, extrait de l'artefact (fonction `drawPieceWood`,
palette : dégradé doré `#ffffff → #fefaea → #f5e090 → #c89030 → #6a3a00` pour
les blancs, gris → noir pour les noirs, 4 anneaux gravés aux rayons
[0.83, 0.65, 0.47, 0.28] × r). Demander ce code à Mickaël ou à la session
Cowork si besoin — il est déjà extrait et documenté.

### A2bis. Style de pion "Toernooibase" (4e style, validé après test des 3 premiers)
Classique/Relief/Bois gravé validés par Mickaël (y compris avec une dame sur
le plateau). Il manque un 4e style, motif "cible"/médaille à anneaux
concentriques réguliers et plats (pas de dégradé 3D, pas de gravure bois) —
référence exacte : `reference-pion-toernooibase-1.png` (pion simple) et
`reference-pion-toernooibase-2.png` (dame — anneau central dédoublé), déposées
à la racine du projet. Pas de code source disponible pour ce style, contrairement
aux 3 autres — à dessiner par Claude Code à partir de ces deux images de
référence.

**Retour après test (non validé)** : le rendu actuel ne correspond pas aux
images de référence — à revoir. Comparer directement côte à côte avec
`reference-pion-toernooibase-1.png`/`-2.png` (déjà dans le dossier) avant de
proposer un nouveau rendu, plutôt que d'itérer à l'aveugle.

### A3. Bloc "Coups joués" + commentaire — reprendre le style artefact
La liste actuelle s'étire avec `space-between` sur toute la hauteur du
panneau (visible dès 2-3 coups joués, très space). Remplacer par un simple
empilement compact, comme l'artefact. CSS de référence (à adapter aux
classes/IDs réels de Damick) :

```css
#side {
  display: flex;
  flex-direction: column;
  gap: 6px;
  width: 220px;
  flex-shrink: 0;
  height: 100%;
  overflow: hidden;
}
#moveList {
  background: #1a1a1a;
  border: 1px solid #3a3a3a;
  border-radius: 5px;
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 5px 3px;
  font-size: 14px;
  font-family: 'Courier New', monospace;
  min-height: 0;
}
#moveComment {
  flex-shrink: 0;
  height: 72px;
  resize: none;
  background: #1a1a1a;
  border: 1px solid #3a3a3a;
  border-radius: 5px;
  color: #cfcfcf;
  font-size: 13px;
  font-family: inherit;
  padding: 7px 8px;
  transition: border-color .15s, background .15s;
}
.mrow { display: flex; align-items: center; padding: 2px 3px; border-radius: 3px; }
.mrow:hover { background: #252525; }
.mnum  { color: #666; width: 32px; text-align: right; margin-right: 4px; font-size: 12px; flex-shrink:0; }
.mcell {
  position: relative; flex: 1; min-width: 0; text-align: center;
  padding: 3px 4px; border-radius: 3px; cursor: pointer;
  transition: background 0.12s; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.mcell:hover { background: #2a3a2a; }
.mcell.wm { color: #e8e8d0; }
.mcell.bm { color: #8090c8; }
.mcell.active { background: #1a4a2a; color: #fff; font-weight: bold; }
.mcell.has-comment::after {
  content: ''; position: absolute; top: 2px; right: 2px;
  width: 5px; height: 5px; border-radius: 50%; background: #e8c878;
}
```

Zone de commentaire directement sous la liste, pastille dorée (`.has-comment`)
sur les coups déjà annotés. **L'onglet "Bibliothèque" reste inchangé à côté**
— on ne touche qu'au contenu de l'onglet "Coups joués".

**Bug constaté après implémentation** : impossible de taper des espaces dans
la zone de commentaire. Cause probable : le raccourci clavier global Espace
(play/pause lecture auto) intercepte la touche avant qu'elle n'atteigne le
textarea, même quand celui-ci a le focus — vérifier que l'écouteur `keydown`
global exclut bien les éléments `TEXTAREA`/`INPUT` du déclenchement des
raccourcis (`e.target.tagName`), en particulier pour `#moveComment`.

### A4. Supprimer le footer
"DAMICK — jeu de dames internationales 10×10 · FMJD" en bas de page : aucune
info utile, à retirer pour gagner de la hauteur.

**Attention** : le cahier des charges mentionne un easter egg "cliquer 5 fois
sur FMJD dans le pied de page" — vérifier où cet easter egg est déclenché
avant de supprimer le footer, et le rattacher ailleurs si besoin (ou
confirmer avec Mickaël qu'il part avec le footer).

### A5. Retirer "— prise obligatoire" du texte d'état
Garder juste "Trait aux Blancs" / "Trait aux Noirs". Le halo pulsant sur les
pièces concernées suffit déjà à signaler l'obligation.

### A6. Curseur de vitesse (remplace le `<select>`)
Remplacer le `<select>` "Normale/Rapide/Ultra-rapide/Instantanée" par un
curseur continu ×¼ → ×8, repris à l'identique de l'artefact :

```html
<input type="range" id="spSlider" min="1" max="10" value="4">
<span id="speedLabel">×1</span>
```
```js
document.getElementById('spSlider').addEventListener('input', function () {
  const v = parseInt(this.value);
  animSpeedMs = Math.round(2300 - v * 210); // à adapter au nom de la variable de vitesse dans Damick
  const lbl = v <= 2 ? '×¼' : v <= 4 ? '×1' : v <= 6 ? '×2' : v <= 8 ? '×4' : '×8';
  document.getElementById('speedLabel').textContent = lbl;
});
```

**Retour après test (validé, avec un ajustement)** : le curseur fonctionne,
mais ajouter un palier ×½ entre ×¼ et ×1 (6 paliers au lieu de 5, sur la même
échelle 1-10) :

```js
const lbl = v <= 1 ? '×¼' : v <= 3 ? '×½' : v <= 5 ? '×1' : v <= 7 ? '×2' : v <= 9 ? '×4' : '×8';
```

**Retour après test (curseur validé, mais bug distinct découvert)** : le
palier ×½ fonctionne. Mais en mode lecture automatique ("autoplay"), le
déplacement d'une pièce n'est plus animé du tout — la pièce saute
instantanément de la case de départ à la case d'arrivée, quelle que soit la
vitesse sélectionnée sur le curseur. En mode saisie (jouer un coup à la
souris), l'animation reste fluide et respecte bien la vitesse choisie —
seul le mode lecture automatique est cassé. À investiguer côté `main.js`
(la boucle d'autoplay doit appeler `renderer.animateMove()` et attendre sa
résolution comme le fait le chemin "coup joué à la souris", au lieu de
mettre à jour le plateau directement sans passer par l'animation).

### A7. Bouton toggle flèche
`BoardRenderer.showArrow` existe déjà côté rendu mais rien ne le bascule
dans l'UI. Ajouter un bouton dans les contrôles de lecture (à côté du bloc
Vitesse), état visuel on/off, qui appelle `renderer.showArrow = !renderer.showArrow`
(ou l'équivalent du setter existant) puis redessine.

### A8. Compteur de temps — repositionner + simplifier
- Sortir du pavé encadré séparé ("COMPTEUR DE TEMPS" avec sa propre boîte) :
  l'intégrer discrètement dans la barre joueurs, comme une ligne compacte
  (compteur de pièces + delta), pour libérer de la hauteur au profit du
  damier.
- Simplifier l'affichage du delta : juste `+N` / `−N` coloré (doré = avantage
  Blancs, bleu = avantage Noirs), **sans** le préfixe "Blancs"/"Noirs" —
  redondant avec la couleur.

### A9. Déplacer la bannière méta (Événement/Site/Date/Round)
Actuellement une bande horizontale pleine largeur au-dessus du plateau.
La déplacer dans la colonne de gauche, **au-dessus** des cartes joueurs :
colonne de gauche = "infos sur la partie" (contexte + joueurs + résultat) de
façon cohérente. Le plateau récupère toute la hauteur libérée par la
suppression de cette bande horizontale.

**Retour après test** : validé sur le principe, mais les champs longs
(Événement, lien Site) sont coupés avec "…" dans la colonne étroite (cf.
capture). Ne pas élargir la colonne — ça irait à l'encontre du but d'A9
(récupérer de la largeur pour le damier). Préférer un retour à la ligne
automatique (`white-space: normal`, `word-break: break-word` au besoin) au
lieu de la troncature, + un attribut `title` avec le texte complet en
fallback au survol pour les cas où ça reste long (ex. l'URL Site).

### A10. Bandeau de contrôles (bas) : chevauchement + alignement largeur
Constaté après validation d'A9 (le damier a gagné en hauteur/largeur suite à
la libération d'espace) :
1. Le bandeau du bas (lecture/vitesse/flèche) chevauche les numéros de case
   de la dernière ligne du damier (cf. capture — les numéros du bas sont
   à moitié masqués par le bandeau).
2. La largeur du bandeau du bas doit correspondre exactement à celle du
   damier, et être parfaitement alignée avec lui (bords gauche/droit
   confondus) — actuellement décalée/désalignée.

Probable cause commune : le recalcul de taille du plateau (`resize()` dans
`board.js`, cf. `ResizeObserver`) n'a pas été resynchronisé avec la largeur
réelle du bandeau de contrôles après les changements de mise en page d'A9 —
vérifier la marge réservée aux numéros de case (`LABEL_MARGIN`) par rapport
à la position du bandeau, et le calcul de largeur du conteneur des contrôles
par rapport à `boardcol`/au canvas.

**Retour après test (toujours pas bon)** : le chevauchement avec les
numéros de case est corrigé, mais l'alignement de largeur ne l'est pas —
le bandeau dépasse encore légèrement des bords du damier (gauche et/ou
droite). À revérifier avec les valeurs réellement rendues (`getBoundingClientRect()`
du canvas vs du conteneur du bandeau), pas seulement les valeurs calculées
en amont, qui peuvent diverger du rendu final après arrondis/`ResizeObserver`.

---

## B. Backlog fonctionnel (cahier des charges) — à planifier, pas urgent

Liste des points ⬜/🟡 du `CAHIER_DES_CHARGES.md` non encore traités (hors IA
et hors chantier Mobile, qui restent des phases à part) :

1. Interface d'annotation de coups (symboles !, ?, !!, ?? + commentaires
   texte) — le parseur PDN les lit déjà, il manque l'UI pour ajouter/éditer
2. Export d'une position donnée en diagramme (image)
3. Export image/PDF de la partie complète
4. Partage par lien
5. Partage de position par QR code
6. Fichiers récents
7. Favoris
8. Écran d'aide listant les raccourcis clavier
9. Recherche/tri dans l'onglet Bibliothèque
10. Photo des joueurs (upload ou récupération automatique base FMJD/Turbo
    Dambase) — avatar = lettre-placeholder pour l'instant
11. Son des coups (pose, capture)
12. Packs de sons personnalisés
13. Réglage de la durée d'affichage de la flèche du dernier coup (reste
    visible jusqu'au coup suivant actuellement, pas de minuteur)
14. Mode clair (thème sombre fixe uniquement pour l'instant)

**Note de cohérence** : le `CAHIER_DES_CHARGES.md` indique encore "un seul
thème damier" et "pas de personnalisation des pions" en ⬜ — c'est obsolète,
plusieurs thèmes de damier et plusieurs styles de pions existent déjà (et
vont encore s'enrichir avec A1/A2 ci-dessus). Mettre à jour le document une
fois les retours visuels de cette session intégrés.

---

## C. En attente, pas dans cette passe

- **Logo + typographie "DAMICK"** : mis de côté par Mickaël pour être
  retravaillé séparément (probablement via exploration visuelle dédiée),
  ne pas y toucher dans cette passe.
- **Chantier Mobile** : phase à part, pas commencée au-delà de quelques
  media queries de repli.
- **IA** : phase finale, pas commencée, volontairement.

---

## D. Bugs — signalés pendant les tests, hors périmètre A/B/C

### D1. Faux message d'erreur à l'import PDN sur le tag de résultat
En important une partie complète (ex. `Championnat DCL`), Damick affiche un
toast rouge "Import partiel : 122/123 coups chargés — Coup 123 (0-2) illégal
ou introuvable — import arrêté à ce coup." alors que la partie s'est en
réalité importée intégralement et correctement (vérifié en rejouant jusqu'au
bout).

`0-2` n'est pas un coup : c'est le tag de résultat PDN (Noirs gagnent 2-0),
placé en fin de partie. Le parseur/loader (`js/pdn/parser.js` ou
`js/pdn/loader.js`) semble le traiter comme une notation de coup à jouer sur
le plateau au lieu de le reconnaître comme marqueur de fin de partie, d'où
l'erreur "illégal ou introuvable" malgré un chargement en fait complet.

**Hors périmètre A** : touche à `pdn/*`, pas au visuel — à traiter comme un
correctif séparé, pas dans le même diff que les points A1-A9.

### D2. Choix de prise multiple : clic sur une case d'arrivée ne joue rien
Constaté par hasard en mode saisie/jeu : une pièce a deux séquences de prise
possibles de même longueur (ex. `25x45` et `25x23` — deux cases d'arrivée
différentes pour la même pièce de départ). Cliquer sur la case d'arrivée `23`
ou `45` ne déclenche rien — aucun coup n'est joué, pas de message d'erreur
non plus. Ça devrait normalement jouer la séquence de prise correspondant à
la case cliquée (cf. `generateLegalMoves` dans `rules.js`, qui garde toutes
les séquences de longueur maximale quand plusieurs existent). À reproduire
et corriger dans `main.js` (logique de clic sur case d'arrivée) et/ou
`rules.js` — probablement un souci de correspondance entre la case cliquée
et la bonne séquence parmi plusieurs candidates de même longueur.

**Hors périmètre A** : touche au moteur/à l'interaction de jeu, pas au
visuel — correctif séparé, pas dans le même diff que A1-A9.
