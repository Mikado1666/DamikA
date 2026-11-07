Scan 3.1 en WebAssembly — moteur d'analyse de DamikA
====================================================

Scan 3.1, moteur de dames internationales (10x10) de Fabien Letouzey.
Copyright (C) 2015-2019 Fabien Letouzey. Distribué sous la GNU General Public License version 3 (voir LICENSE, dans ce
dossier). Moteur d'origine : https://github.com/rhalbersma/scan
Adaptation pour navigateur : « scan-wasm » de RoepStoep (Lidraughts) :
  https://github.com/RoepStoep/scan-wasm — commit cbb251eff7051252ad0617fc03089bb51ce1be10 (30/08/2023), licence GPL-3.0.

Fichiers (chargés seulement à la première utilisation de l'analyse, par js/ai/scan-worker.js)
  scan.js     69 699 octets, module ES émis par Emscripten 7.0.0 (colle JavaScript, licence MIT d'Emscripten)
  scan.wasm   218 541 octets, le moteur compilé
  scan.data   8 551 540 octets : évaluation de Scan 3.1 (data/eval, 8 503 280 octets) + tables de finale de 2 et 3 pièces
  (total à télécharger ≈ 8,5 Mio ; pas de livre d'ouvertures, pas de threads, tables de finale jusqu'à 3 pièces)

Empreintes SHA-256
  scan.js    1a9e0e2b2969bbf63968db6d457be8e4509523dc238d76ce04e21b05f2aa64e5
  scan.wasm  f35dfa46f3d1474716deb29efc2ee8528a5cf4e6068ccb26eeab036adee05747
  scan.data  9563377bcf2b14dcf368388a641468ba1a3d1f3c1829c4daa405cbc692a4b8e2
  data/eval (dans scan.data, identique au fichier data\eval de Scan 3.1 natif)
             0e7161c38af605f5e367f3f8fe17525d1c40db722714c68921971b386e58abba

Provenance : compilé le 07/11/2026 à partir des sources de scan-wasm au commit ci-dessus (copie exacte dans
third_party/scan/, avec la commande de compilation dans third_party/scan/BUILD.txt). Ce ne sont PAS les binaires de
Lidraughts : leur recompilation donne la même recherche (mêmes nombres de nœuds sur les positions testées).

Code source correspondant (obligation de la GPL-3.0) : third_party/scan/ (publié avec le site et dans le dépôt DamikA
https://github.com/Mikado1666/DamikA). Licence de DamikA : voir LICENSE et NOTICE à la racine.

Protocole : Hub (https://github.com/rhalbersma/scan, protocol.txt), par messages texte. Voir js/ai/scan-worker.js et
js/ai/scan-protocol.js. Le build n'applique aucune limite de temps (le `move-time` du Hub est ignoré) : DamikA
arrête la recherche lui-même (`stop` entre deux itérations).
