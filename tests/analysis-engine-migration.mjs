// P26 — migration unique du moteur d'analyse (js/ai/engines.js, migrateAnalysisEngine) : Scan imposé une fois.
//   node tests/analysis-engine-migration.mjs
import { migrateAnalysisEngine, ANALYSIS_ENGINE_KEY as K, ANALYSIS_ENGINE_MIGRATED_KEY as F } from '../js/ai/engines.js';
let failures = 0;
const ok = (l, c) => { if (!c) failures++; console.log(`${c ? 'OK ' : 'ERR'} ${l}`); };
const fake = (init = {}) => { const m = new Map(Object.entries(init)); return { m, getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) }; };

let s = fake();
ok('1 clé absente : retourne false, drapeau posé, aucune clé de moteur créée', migrateAnalysisEngine(s) === false && s.getItem(F) === '1' && s.getItem(K) === null);
for (const old of ['v0', 'v1b', 'v2b']) {
  s = fake({ [K]: old });
  ok(`2 ancienne clé ${old} : remplacée par scan, drapeau posé`, migrateAnalysisEngine(s) === true && s.getItem(K) === 'scan' && s.getItem(F) === '1');
}
s = fake({ [K]: 'v0', [F]: '1' });
ok('3 drapeau déjà posé : le choix mémorisé (v0) est respecté', migrateAnalysisEngine(s) === false && s.getItem(K) === 'v0');
s = fake({ [K]: 'v1b' });
migrateAnalysisEngine(s); s.setItem(K, 'v2b'); migrateAnalysisEngine(s);
ok('4 choix fait ensuite dans le menu : jamais refait', s.getItem(K) === 'v2b');
const broken = { getItem() { throw new Error('indisponible'); }, setItem() { throw new Error('indisponible'); } };
ok('5 stockage indisponible : ne lève pas', migrateAnalysisEngine(broken) === false);
console.log(failures === 0 ? 'RÉSULTAT : tout concorde.' : `RÉSULTAT : ${failures} échec(s).`);
process.exit(failures ? 1 : 0);
