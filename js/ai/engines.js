// DAMIKA — Choix du moteur d'analyse (étape 4.1). Aucun accès au DOM : utilisable dans le Worker, dans
// l'interface (liste des moteurs, validation du réglage mémorisé) et sous Node (tests).
//
//   scan Scan 3.1 de Fabien Letouzey (GPL-3.0), compilé en WebAssembly (P25) : moteur d'analyse PAR DÉFAUT. Il a son propre
//        Worker (js/ai/scan-worker.js, binaires dans assets/engines/scan/), n'utilise ni evaluator ni modèle ici.
//   v0   évaluation à formules de js/ai/eval.js : le moteur historique, celui que js/ai/search.js utilise quand
//        aucun évaluateur ne lui est donné.
//   v1b  évaluation APPRISE (js/ai/eval-learned.js) : tables par phase de jeu apprises sur des parties d'auto-jeu
//        (étape 3.2). Contre V0, +170 à +210 Elo en arène à profondeur fixe ; même recherche ; profondeur atteinte en 1,5 s
//        comparable à V0 en moyenne, mais arbre plus irrégulier (docs/SESSION_DERNIERE.md, étape 4.1).
//   v2b  évaluation par MOTIFS (P18) : tables de n123 + 23 motifs de 5 cases appris sur parties réelles
//        (training/models/p17-B-l025.json, js/ai/eval-patterns.js). À temps égal : +67 / +72 Elo contre V1b (P17).
//
// Le chemin du modèle V1b est UNE SEULE constante, V1B_MODEL_PATH (relatif à la racine du site). Le fichier est une
// COPIE de training/models/v1b-l0.json (tests/engine-select.mjs vérifie que les deux sont identiques). Changer de
// modèle appris = remplacer ce fichier (ou ce chemin), rien d'autre.

import { createTableEvaluator } from './eval-learned.js';
import { createModelEvaluator } from './eval-patterns.js';

// `label` : texte (court) du menu de réglages ; `hint` : infobulle ; `short` : nom court (ligne « Évaluation
// indicative… », messages).
export const ENGINES = {
  scan: { short: 'Scan 3.1', label: 'Scan 3.1 (Fabien Letouzey)', hint: "Scan 3.1, moteur de dames de Fabien Letouzey (GPL-3.0), en WebAssembly : moteur d'analyse par défaut" },
  v0: { short: 'V0', label: 'V0 (ancien moteur)', hint: "Évaluation à formules : le moteur d'analyse historique" },
  v1b: { short: 'V1b', label: 'V1b (appris)', hint: "Évaluation apprise sur 8 000 parties d'auto-jeu (expérimental)" },
  v2b: { short: 'V2b', label: 'V2b (motifs)', hint: "Évaluation apprise par motifs de cases sur parties réelles (expérimental)" },
};
// DEFAULT_ENGINE = le moteur JS « de base » : celui que le Worker js/ai/worker.js utilise quand aucun moteur n'est nommé
// (message identique à celui d'avant l'étape 4.1) et le MOTIF DE REPLI quand un autre moteur échoue. Le moteur d'analyse
// PROPOSÉ PAR DÉFAUT à l'utilisateur est DEFAULT_ANALYSIS_ENGINE (Scan, depuis P25).
export const DEFAULT_ENGINE = 'v0';
export const DEFAULT_ANALYSIS_ENGINE = 'scan';
// Variété d'ouverture de V2b (P19, js/ai/search.js) : marge (centipions) sous le meilleur coup et nombre de demi-coups de la
// partie pendant lesquels elle s'applique. UNE seule définition, lue par main.js (et les mesures de training/).
export const OPENING_VARIETY = { margin: 10, plies: 10 };
export const V1B_MODEL_PATH = 'data/models/v1b-l0.json';
// Modèle par motifs (P18) : COPIE de training/models/p17-B-l025.json (tests/engine-select.mjs vérifie l'identité).
export const B_MODEL_PATH = 'data/models/p17-B-l025.json';

// Fichier et fabrique d'évaluateur de chaque moteur appris. Pour revenir en arrière : ne plus proposer v2b (le retirer
// d'ENGINES) ; V1b reste intact et sélectionnable.
const MODELS = {
  v1b: { path: V1B_MODEL_PATH, make: (model) => createTableEvaluator(model) },
  v2b: { path: B_MODEL_PATH, make: (model) => createModelEvaluator(model) },
};

// Valide un identifiant venant d'ailleurs (réglage mémorisé, message du fil principal). Object.hasOwn : 'toString' ou
// '__proto__' ne sont pas des moteurs.
// Migration UNIQUE (P26) : Scan est imposé une fois à tous. Au premier chargement après la mise à jour, un choix de moteur
// déjà mémorisé (V0, V1b, V2b) est remplacé par Scan et un drapeau est posé pour ne plus jamais recommencer ; ensuite le
// choix fait dans le menu est respecté. `storage` : localStorage (ou un faux, tests/analysis-engine-migration.mjs).
// Ne lève jamais (stockage indisponible = rien à migrer). Retourne true si une valeur a été remplacée.
export const ANALYSIS_ENGINE_KEY = 'damika:analysis-engine';
export const ANALYSIS_ENGINE_MIGRATED_KEY = 'damika:analysis-engine-migrated';
export function migrateAnalysisEngine(storage) {
  try {
    if (storage.getItem(ANALYSIS_ENGINE_MIGRATED_KEY) !== null) return false;
    const had = storage.getItem(ANALYSIS_ENGINE_KEY) !== null;
    if (had) storage.setItem(ANALYSIS_ENGINE_KEY, DEFAULT_ANALYSIS_ENGINE);
    storage.setItem(ANALYSIS_ENGINE_MIGRATED_KEY, '1');
    return had;
  } catch {
    return false;
  }
}

// Moteurs qui ont leur propre Worker (hors js/ai/worker.js) : leur chargement n'est pas celui d'un modèle JSON.
export const isScanEngine = (id) => id === 'scan';
export const isEngineId = (id) => typeof id === 'string' && Object.hasOwn(ENGINES, id);

// js/ai/engines.js → racine du site : deux dossiers plus haut.
const modelUrl = (path) => new URL(`../../${path}`, import.meta.url);

// Lecture d'un fichier JSON : fetch dans le navigateur (revalidé à chaque chargement du Worker : un fichier modèle
// changé ne reste pas servi depuis un cache périmé), lecture disque sous Node, dont fetch ne sait pas lire file:.
async function readJson(url) {
  if (url.protocol === 'file:') {
    const [{ readFile }, { fileURLToPath }] = await Promise.all([import('node:fs/promises'), import('node:url')]);
    return JSON.parse(await readFile(fileURLToPath(url), 'utf8'));
  }
  const res = await fetch(url, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`modèle ${url.pathname.split('/').pop()} introuvable (HTTP ${res.status})`);
  return res.json();
}

// Un seul chargement par moteur et par contexte (Worker) : les analyses suivantes réutilisent l'évaluateur. Un échec
// n'est pas mémorisé (le chargement suivant peut réussir).
const cache = new Map();

// Évaluateur à passer à analyse*(position, { evaluator }) : une promesse de fonction (board Int8Array(50)) → centipions
// du point de vue des Blancs, ou de `null` pour V0 (= ne rien passer : la recherche prend alors son évaluateur par
// défaut, d'où des résultats strictement identiques à ceux d'avant l'étape 4.1). `reader` : lecteur de fichier
// injectable (tests).
export function loadEvaluator(engine = DEFAULT_ENGINE, reader = readJson) {
  if (!isEngineId(engine)) return Promise.reject(new Error(`moteur d'analyse inconnu : ${String(engine)}`));
  if (engine === 'v0' || engine === 'scan') return Promise.resolve(null); // scan : Worker à part, rien à charger ici
  if (reader === readJson && cache.has(engine)) return cache.get(engine);
  const { path, make } = MODELS[engine];
  const loading = reader(modelUrl(path)).then((model) => make(model));
  if (reader === readJson) {
    cache.set(engine, loading);
    loading.catch(() => cache.delete(engine));
  }
  return loading;
}
