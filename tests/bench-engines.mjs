// Étape 4.1 — OUTIL DE MESURE (pas un test réussi/échoué) : temps d'analyse de V0 contre V1b DANS LE WORKER de l'appli
// (js/ai/worker.js lancé dans un vrai fil worker_threads, comme tests/worker-analyse.mjs), sur 5 positions de parties
// d'auto-jeu (nuit 1) qui vont de l'ouverture à la finale.
//   A. Profondeur FIXE (8 puis 10) : temps de recherche, nombre de nœuds et nœuds/seconde. Le nombre de nœuds ne dépend pas
//      de la machine ; le temps, si. Les mesures V0 / V1b sont ENTRELACÉES (l'ordre alterne à chaque répétition) et on prend
//      la MÉDIANE : seuls les RAPPORTS comptent quand la machine est chargée (auto-jeu en cours, autres programmes).
//   B. Budget réel de l'appli (1,5 s, profondeur max 24) : profondeur atteinte par chaque moteur.
//   C. Démarrage à froid : coût du chargement du modèle V1b au premier usage d'un Worker neuf (disque ici ; dans le
//      navigateur c'est un fetch de 1,5 ko, non mesuré par ce script).
// Usage : node tests/bench-engines.mjs [--reps 5] [--reps-deep 3] [--budget-reps 5]
import { Worker } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';
import { parsePos } from './helpers.mjs';

const args = process.argv.slice(2);
const opt = (name, d) => { const i = args.indexOf(`--${name}`); return i >= 0 ? Number(args[i + 1]) : d; };
const REPS = opt('reps', 5), REPS_DEEP = opt('reps-deep', 3), REPS_BUDGET = opt('budget-reps', 5);

// 5 positions réelles (parties d'auto-jeu de la nuit 1, V0 contre V0), écrites en dur pour ne dépendre d'aucun fichier.
const POSITIONS = [
  { name: 'ouverture (38 pièces)', pos: 'w|28,31,33,34,35,36,37,38,39,40,41,42,44,45,46,47,48,49,50|1,2,3,4,5,6,7,8,9,10,11,12,13,14,17,19,22,24,27' },
  { name: 'début de milieu (32)', pos: 'w|29,31,32,33,36,37,38,41,42,43,45,46,47,48,49,50|1,2,3,4,5,6,7,8,9,10,12,13,14,15,16,22' },
  { name: 'milieu de partie (24)', pos: 'b|24,29,32,36,38,41,43,46,47,48,49,50|1,2,3,4,5,6,7,8,13,15,18,22' },
  { name: 'fin de milieu, 1 dame (16)', pos: 'w|16,22,25,34,35,45,46,49|1,5,8,13,19,23,24,K47' },
  { name: 'finale à dames (8)', pos: 'b|K4,22,29,35,40|5,16,42' },
].map((p) => ({ ...p, position: parsePos(p.pos) }));

const shim = fileURLToPath(new URL('./worker-thread-shim.mjs', import.meta.url));

// Un Worker (fil réel) et une fonction ask() qui renvoie { result, rtt } du message final.
async function startWorker() {
  const w = new Worker(shim);
  const waiting = new Map();
  let ready;
  const readyP = new Promise((r) => { ready = r; });
  w.on('message', (m) => {
    if (m.type === 'ready') { ready(); return; }
    if (m.type === 'progress') return;
    const cb = waiting.get(m.id);
    if (cb) { waiting.delete(m.id); cb(m); }
  });
  w.on('error', (e) => { console.error('Erreur du fil :', e); process.exit(1); });
  await readyP;
  let id = 0;
  const ask = (position, options) => new Promise((resolve) => {
    const myId = ++id;
    const t0 = performance.now();
    waiting.set(myId, (m) => resolve({ result: m.result, ok: m.ok, error: m.error, rtt: performance.now() - t0 }));
    w.postMessage({ id: myId, type: 'analyse', position, options });
  });
  return { ask, terminate: () => w.terminate() };
}

const median = (a) => { const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const ms = (x) => `${x.toFixed(0)} ms`.padStart(8);
const kn = (x) => `${(x / 1000).toFixed(0)} k`.padStart(7);
const ratio = (a, b) => (b / a).toFixed(2);

console.log('Temps d\'analyse V0 contre V1b dans le Worker — mesures entrelacées, médiane ; seuls les rapports comptent si la machine est chargée');

// Échauffement : charge le modèle V1b et chauffe le JIT des deux chemins.
const w = await startWorker();
for (const p of POSITIONS) { await w.ask(p.position, { maxDepth: 6, maxTimeMs: 1e9 }); await w.ask(p.position, { maxDepth: 6, maxTimeMs: 1e9, engine: 'v1b' }); }

for (const [depth, reps] of [[8, REPS], [10, REPS_DEEP]]) {
  console.log(`\nA. Profondeur fixe ${depth} (${reps} répétitions)`);
  console.log('   position                       V0 temps  V1b temps  V1b/V0 |  V0 nœuds  V1b nœuds  V1b/V0 | V0 nœuds/s  V1b nœuds/s  V1b/V0 | score V0  score V1b');
  const tot = { t0: 0, t1: 0, n0: 0, n1: 0 };
  for (const p of POSITIONS) {
    const t = { v0: [], v1b: [] };
    let r0, r1;
    for (let r = 0; r < reps; r++) {
      const order = r % 2 === 0 ? ['v0', 'v1b'] : ['v1b', 'v0'];
      for (const e of order) {
        const a = await w.ask(p.position, { maxDepth: depth, maxTimeMs: 1e9, ...(e === 'v1b' ? { engine: 'v1b' } : {}) });
        t[e].push(a.result.timeMs);
        if (e === 'v0') r0 = a.result; else r1 = a.result;
      }
    }
    const m0 = median(t.v0), m1 = median(t.v1b);
    const nps0 = r0.nodes / (m0 / 1000), nps1 = r1.nodes / (m1 / 1000);
    tot.t0 += m0; tot.t1 += m1; tot.n0 += r0.nodes; tot.n1 += r1.nodes;
    console.log(`   ${p.name.padEnd(28)} ${ms(m0)} ${ms(m1)}   ${ratio(m0, m1)} | ${kn(r0.nodes)}  ${kn(r1.nodes)}     ${ratio(r0.nodes, r1.nodes)} | ${kn(nps0)}    ${kn(nps1)}      ${ratio(nps0, nps1)} | ${String(r0.score).padStart(7)}  ${String(r1.score).padStart(8)}`);
  }
  console.log(`   ${'TOTAL (somme des 5)'.padEnd(28)} ${ms(tot.t0)} ${ms(tot.t1)}   ${ratio(tot.t0, tot.t1)} | ${kn(tot.n0)}  ${kn(tot.n1)}     ${ratio(tot.n0, tot.n1)} | ${kn(tot.n0 / (tot.t0 / 1000))}    ${kn(tot.n1 / (tot.t1 / 1000))}      ${ratio(tot.n0 / tot.t0, tot.n1 / tot.t1)} |`);
}

console.log(`\nB. Budget réel de l'appli : 1,5 s par position, profondeur max 24 (${REPS_BUDGET} répétitions) — profondeur atteinte (médiane [min–max])`);
console.log('   position                       V0                V1b');
{
  const sum = { v0: [], v1b: [] };
  for (const p of POSITIONS) {
    const d = { v0: [], v1b: [] };
    for (let r = 0; r < REPS_BUDGET; r++) {
      const order = r % 2 === 0 ? ['v0', 'v1b'] : ['v1b', 'v0'];
      for (const e of order) {
        const a = await w.ask(p.position, { maxDepth: 24, maxTimeMs: 1500, ...(e === 'v1b' ? { engine: 'v1b' } : {}) });
        d[e].push(a.result.depth);
      }
    }
    sum.v0.push(median(d.v0)); sum.v1b.push(median(d.v1b));
    const show = (a) => `${median(a)} [${Math.min(...a)}–${Math.max(...a)}]`.padEnd(16);
    console.log(`   ${p.name.padEnd(28)} ${show(d.v0)}  ${show(d.v1b)}`);
  }
  const avg = (a) => (a.reduce((s, x) => s + x, 0) / a.length).toFixed(1);
  console.log(`   ${'moyenne des 5 médianes'.padEnd(28)} ${avg(sum.v0).padEnd(16)}  ${avg(sum.v1b)}`);
}
await w.terminate();

console.log('\nC. Démarrage à froid d\'un Worker neuf : aller-retour d\'une analyse de profondeur 1 (modules + éventuel chargement du modèle)');
{
  const cold = { v0: [], v1b: [] };
  for (let r = 0; r < 7; r++) {
    for (const e of (r % 2 === 0 ? ['v0', 'v1b'] : ['v1b', 'v0'])) {
      const fresh = await startWorker();
      const a = await fresh.ask(POSITIONS[2].position, { maxDepth: 1, maxTimeMs: 1e9, ...(e === 'v1b' ? { engine: 'v1b' } : {}) });
      cold[e].push(a.rtt);
      await fresh.terminate();
    }
  }
  console.log(`   premier message d'un Worker neuf : V0 ${median(cold.v0).toFixed(1)} ms, V1b ${median(cold.v1b).toFixed(1)} ms (médianes de 7) → surcoût du chargement du modèle ≈ ${(median(cold.v1b) - median(cold.v0)).toFixed(1)} ms`);
}
