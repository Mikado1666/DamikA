# Référence design — à reprendre de l'artefact "Dames Internationales 10×10"

Ce fichier documente ce que Mickaël veut reprendre de l'artefact Claude
"Dames Internationales 10×10" (https://claude.ai/artifact/CkCD4zvaJTbefEhCSW9HEP,
fichier source monolithique HTML/Canvas) pour l'intégrer dans Damick.

**Périmètre demandé — uniquement ça, rien d'autre :**
- design des pièces (style "classique" / flat)
- couleurs du damier (thèmes de cases)
- mouvements (animation d'un coup, y compris prise multiple)
- flèches (tracé du dernier coup)

Tout le reste de l'artefact (barre joueurs, PDN, IA, mode saisie, export PDF…)
est hors sujet — Damick a déjà sa propre logique pour ça.

**Règle de travail rappelée dans CLAUDE.md/CAHIER_DES_CHARGES.md** : ne rien
régénérer/republier sans confirmation préalable de Mickaël. Ce document est une
référence pour la prochaine session Claude Code, pas une implémentation déjà
appliquée à `js/render/board.js`.

---

## 1. État actuel de Damick (pour contexte)

`js/render/board.js` contient déjà une classe `BoardRenderer` (ES module) avec :
- un thème "noyer" (gradients marron/beige, cadre en bois dégradé)
- des pièces en gradient radial biseauté (relief 3D, anneau intérieur, couronne dorée pour la dame)
- une flèche du dernier coup en dégradé doré avec liseré sombre, jalons intermédiaires
- une animation par `requestAnimationFrame` avec easing cubique, fondu des pièces capturées

C'est une architecture propre (classe, `Promise` sur `animateMove`, `ResizeObserver`) —
à conserver. Ce qui doit changer, c'est le **rendu visuel** de ces mêmes fonctions
(`_drawSquares`, `drawPiece`, `drawMovePath`, `_advanceAnimation`/`animateMove`),
pas l'architecture.

## 2. Ce que l'artefact fait différemment (à reprendre)

### 2.1 Couleurs du damier — 4 thèmes commutables, cases plates (pas de gradient)

Dans l'artefact, les cases sont en aplat uni (`ctx.fillStyle = couleur; ctx.fillRect(...)`),
pas en gradient. 4 thèmes prédéfinis, avec une 3e couleur pour la case en surbrillance
(dernier coup / case sélectionnée) :

```js
// thème par défaut ("Bois")
let C_LIGHT   = '#d4bc8a';
let C_DARK    = '#8B5E1A';
let C_DARK_HL = '#b07820'; // case sombre en surbrillance

// les 3 autres thèmes proposés dans le sélecteur :
// Ardoise : light #9aa0b8, dark #6a7090, hl #8090b0
// Vert    : light #7a9a78, dark #4a6a48, hl #5a8a58
// Beige   : light #e8d0a8, dark #b07848, hl #c89050
```

Rendu des cases (à adapter dans `_drawSquares`, en remplaçant les gradients par
ces aplats) :

```js
for (let r = 0; r < 10; r++) {
  for (let c = 0; c < 10; c++) {
    const dark = (r + c) % 2 === 1;
    const sq = dark ? rcToSq(r, c) : 0;
    const hl = dark && hlSquares.includes(sq); // dernier coup joué
    ctx.fillStyle = dark ? (hl ? C_DARK_HL : C_DARK) : C_LIGHT;
    ctx.fillRect(c * SQ, r * SQ, SQ, SQ);
  }
}
```

But : damier plus lisible/sobre que le style "noyer" actuel, et le choix de thème
doit rester une option pour Mickaël (garder au moins ces 4 couleurs disponibles).

### 2.2 Pièces — style "classique" (flat), à la place du style biseauté actuel

```js
function drawPieceFlat(ctx, x, y, r, type) {
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.5)';
  ctx.shadowBlur = 4; ctx.shadowOffsetX = 2; ctx.shadowOffsetY = 2;
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = isWhite(type) ? '#ffffff' : '#111111';
  ctx.fill();
  ctx.shadowBlur = 0; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0;
  ctx.strokeStyle = isWhite(type) ? '#999' : '#444';
  ctx.lineWidth = 1.5; ctx.stroke();
  if (isKing(type)) {
    ctx.font = `bold ${Math.round(r)}px serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = isWhite(type) ? '#333' : '#ccc';
    ctx.fillText('♛', x, y + 1);
  }
  ctx.restore();
}
```

Simple, net, lisible à toutes les tailles — pas de dégradé radial ni d'anneau
intérieur. La couronne de dame est le glyphe unicode `♛`, colorée en contraste
avec le disque (gris foncé sur blanc, gris clair sur noir).

Dans Damick, `piece` est un objet `{color:'w'|'b', king:bool}` (pas un entier
comme dans l'artefact) — remplacer `isWhite(type)`/`isKing(type)` par
`piece.color==='w'` / `piece.king` en conservant sinon le rendu à l'identique.

*(Bonus, hors périmètre demandé mais présent dans l'artefact si utile plus tard :
3 styles additionnels commutables — "Bois gravé", "Verre/Cristal", "Métal brossé" —
dispo dans `PIECE_RENDERERS` de l'artefact si Mickaël veut un sélecteur de style un jour.)*

### 2.3 Flèche du dernier coup

Tracé cyan semi-transparent, plus discret que le doré épais actuel de Damick,
avec des petits points pleins aux étapes intermédiaires (prise multiple) et une
pointe de flèche simple à l'arrivée :

```js
function drawArrow(ctx, path, SQ, sqCenter) {
  if (!path || path.length < 2) return;
  const pts = path.map(sqCenter);
  const headLen = SQ * 0.28;
  const tp = pts[pts.length - 1], prev = pts[pts.length - 2];
  const angle = Math.atan2(tp.y - prev.y, tp.x - prev.x);
  ctx.save();
  ctx.globalAlpha = 0.72;
  ctx.strokeStyle = '#5bc8ff';
  ctx.fillStyle   = '#5bc8ff';
  ctx.lineWidth   = SQ * 0.10;
  ctx.lineCap     = 'round';
  ctx.lineJoin    = 'round';
  const shorten = headLen * 0.6;
  const ex = tp.x - shorten * Math.cos(angle);
  const ey = tp.y - shorten * Math.sin(angle);
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length - 1; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.lineTo(ex, ey);
  ctx.stroke();
  for (let i = 1; i < pts.length - 1; i++) {
    ctx.beginPath();
    ctx.arc(pts[i].x, pts[i].y, SQ * 0.06, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.beginPath();
  ctx.moveTo(tp.x, tp.y);
  ctx.lineTo(tp.x - headLen * Math.cos(angle - 0.42), tp.y - headLen * Math.sin(angle - 0.42));
  ctx.lineTo(tp.x - headLen * Math.cos(angle + 0.42), tp.y - headLen * Math.sin(angle + 0.42));
  ctx.closePath(); ctx.fill();
  ctx.restore();
}
```

Remplace `_drawLastMoveArrow`/`drawMovePath` dans Damick — même principe
(polyligne + pointe), esthétique différente (cyan fin vs doré épais à liseré).

### 2.4 Mouvements — animation d'un coup

Logique de l'artefact (globale, à adapter à la classe `BoardRenderer` de Damick,
qui a déjà une structure `animateMove` par `Promise` — ne garder que le *timing*
et l'*easing*, pas le style procédural) :

```js
function easeIO(t) { return t < 0.5 ? 2*t*t : -1 + (4-2*t)*t; }

// Durée d'un segment : plus courte si c'est une prise (rythme plus vif),
// dépend de G.speed (vitesse réglée par le curseur de lecture)
const segDur = captures.length > 0
  ? Math.max(220, speed * 0.38)
  : speed * 0.55;

// Une pièce capturée disparaît dès que le tracé passe par sa case
// (pas de fondu progressif sur toute la durée du coup — disparition nette
// au moment où la pièce "sauteuse" atteint la case suivante)
```

Différence avec l'animation actuelle de Damick : easing quadratique in-out
(`easeIO`) plutôt que cubique ease-out, et disparition nette des pièces
capturées au moment du saut plutôt qu'un fondu étalé sur tout le coup. Le
séquençage par étapes (une étape = un segment du chemin, `path[i] → path[i+1]`,
avec retrait de la pièce capturée entre les deux) reste le même principe que
ce que fait déjà `_advanceAnimation`/`_drawPieces` dans Damick — donc surtout
un réglage d'easing/timing à ajuster, pas une réécriture.

## 3. Ce qui ne doit PAS changer

- l'architecture `BoardRenderer` (classe, `ResizeObserver`, `Promise` sur `animateMove`)
- tout ce qui n'est pas listé ci-dessus (halo "prise obligatoire", surbrillance de
  sélection, coordonnées de case, cadre du plateau) — sauf si ça entre en conflit
  visuel avec les couleurs de thème ci-dessus, à voir au cas par cas
- rien à toucher côté `js/engine/rules.js`, `js/pdn/*`, `js/main.js`

## 4. Source complète

Fichier HTML complet de l'artefact (avant extraction) disponible si besoin de
plus de contexte : demander à Mickaël de republier/partager l'artefact
`https://claude.ai/artifact/CkCD4zvaJTbefEhCSW9HEP`, ou reprendre ce document
qui contient déjà tout le code utile pour ce chantier précis.
