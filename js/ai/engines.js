// DAMIKA — Choix du moteur d'analyse (étape 4.1). Aucun accès au DOM : utilisable dans le Worker, dans
// l'interface (liste des moteurs, validation du réglage mémorisé) et sous Node (tests).
//
//   v0   évaluation à formules de js/ai/eval.js : le moteur historique, celui que js/ai/search.js utilise quand
//        aucun évaluateur ne lui est donné.
//   v1b  évaluation APPRISE (js/ai/eval-learned.js) : tables par phase de jeu apprises sur des parties d'auto-jeu
//        (étape 3.2). Contre V0, +170 à +210 Elo en arène à profondeur fixe ; même recherche ; profondeur atteinte en 1,5 s
//        comparable à V0 en moyenne, mais arbre plus irrégulier (docs/SESSION_DERNIERE.md, étape 4.1).
//
// Le chemin du modèle V1b est UNE SEULE constante, V1B_MODEL_PATH (relatif à la racine du site). Le fichier est une
// COPIE de training/models/v1b-l0.json (tests/engine-select.mjs vérifie que les deux sont identiques). Changer de
// modèle appris = remplacer ce fichier (ou ce chemin), rien d'autre.

import { createTableEvaluator } from './eval-learned.js';

// `label` : texte (court) du menu de réglages ; `hint` : infobulle ; `short` : nom court (ligne « Évaluation
// indicative… », messages).
export const ENGINES = {
  v0: { short: 'V0', label: 'V0 (actuel)', hint: "Évaluation à formules : le moteur d'analyse historique" },
  v1b: { short: 'V1b', label: 'V1b (appris)', hint: "Évaluation apprise sur 8 000 parties d'auto-jeu (expérimental)" },
};
export const DEFAULT_ENGINE = 'v0';
export const V1B_MODEL_PATH = 'data/models/v1b-l0.json';

// Valide un identifiant venant d'ailleurs (réglage mémorisé, message du fil principal). Object.hasOwn : 'toString' ou
// '__proto__' ne sont pas des moteurs.
export const isEngineId = (id) => typeof id === 'string' && Object.hasOwn(ENGINES, id);

// js/ai/engines.js → racine du site : deux dossiers plus haut.
const modelUrl = () => new URL(`../../${V1B_MODEL_PATH}`, import.meta.url);

// Lecture d'un fichier JSON : fetch dans le navigateur (revalidé à chaque chargement du Worker : un fichier modèle
// changé ne reste pas servi depuis un cache périmé), lecture disque sous Node, dont fetch ne sait pas lire file:.
async function readJson(url) {
  if (url.protocol === 'file:') {
    const [{ readFile }, { fileURLToPath }] = await Promise.all([import('node:fs/promises'), import('node:url')]);
    return JSON.parse(await readFile(fileURLToPath(url), 'utf8'));
  }
  const res = await fetch(url, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`modèle ${V1B_MODEL_PATH} introuvable (HTTP ${res.status})`);
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
  if (engine === 'v0') return Promise.resolve(null);
  if (reader === readJson && cache.has(engine)) return cache.get(engine);
  const loading = reader(modelUrl()).then((tables) => createTableEvaluator(tables));
  if (reader === readJson) {
    cache.set(engine, loading);
    loading.catch(() => cache.delete(engine));
  }
  return loading;
}
