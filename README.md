# DamikA

**DamikA analyse avec Scan 3.1, moteur de dames de Fabien Letouzey (GPL-3.0).**

DamikA est une application web (PWA, JavaScript natif sans étape de compilation) de **visuel et d'analyse pour les dames
internationales 10×10** (règles FMJD) : plateau en Canvas 2D, lecture et commentaire de parties (import / export PDN,
TXT, PNG, PDF), bibliothèque de parties, plaque de tournoi, partage par lien, et analyse par Scan (barre d'évaluation,
score, meilleur coup, ligne principale).

- Site : https://damika.shell-green.workers.dev
- Moteur d'analyse par défaut : **Scan 3.1** (Fabien Letouzey), compilé en WebAssembly et exécuté dans le navigateur,
  chargé à la première utilisation de l'analyse (≈ 8,5 Mo). Les anciens moteurs maison (V0, V1b, V2b) restent
  disponibles dans le menu 🎨, section « Moteur d'analyse », mais ne sont plus développés.

## Lancer en local

```
python -m http.server 8934
# puis http://localhost:8934/index.html   (Ctrl+Shift+R après toute modification d'un .js)
```

Les modules ES et le WebAssembly ne fonctionnent pas en `file://` : un serveur local est obligatoire.
Contexte technique complet : `CLAUDE.md`. Tests Node : `tests/` (par exemple `node tests/scan-protocol.mjs`).

## Licences

DamikA est distribué sous la **GNU General Public License version 3 ou ultérieure (GPL-3.0-or-later)** : voir
[`LICENSE`](LICENSE).

- **Scan 3.1** — Copyright (C) 2015-2019 Fabien Letouzey, GPL-3.0 — <https://github.com/rhalbersma/scan>.
- **scan-wasm** (adaptation pour navigateur, RoepStoep / Lidraughts), GPL-3.0 — <https://github.com/RoepStoep/scan-wasm>.
  Code source correspondant au binaire distribué : [`third_party/scan/`](third_party/scan/) ; binaires et empreintes :
  [`assets/engines/scan/`](assets/engines/scan/README.txt).
- Autres composants (Emscripten, jsPDF, qrcodejs, lz-string, sons) : voir [`NOTICE`](NOTICE).
