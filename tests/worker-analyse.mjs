// Messages 'analyse' et 'stop' du worker.
//   A. Appel direct de runMessage() : progression à chaque profondeur, résultat final identique à
//      analyseSync (même profondeur fixe), arrêt demandé en cours de route, remplacement d'une analyse
//      par une autre, erreurs.
//   B. Vrai fil d'exécution (worker_threads + faux environnement de worker) : mêmes scénarios avec de
//      vrais messages clonés, et mesure du délai d'arrêt (il doit rester de l'ordre d'une profondeur).
import { Worker } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';
import { runMessage } from '../js/ai/worker.js';
import { analyseSync } from '../js/ai/search.js';
import { FastBoard } from '../js/ai/fastboard.js';
import { toPosition, parsePos } from './helpers.mjs';

let failures = 0;
const check = (label, cond, extra = '') => {
  if (!cond) failures++;
  console.log(`${cond ? 'OK ' : 'ERR'} ${label}${extra ? ' — ' + extra : ''}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const strip = (r) => JSON.stringify({ ...r, timeMs: 0, nps: 0 });

// Milieu de partie fixe (assez riche pour que la profondeur 12+ prenne du temps).
const fb = FastBoard.initial();
for (const k of [8, 3, 5, 1, 4, 2, 6, 0, 3, 2, 1, 4]) { const mv = fb.generateMoves(); fb.makeMove(mv[k % mv.length]); }
const position = toPosition(fb);

// --- A. appel direct -----------------------------------------------------------------------------------------------------
{
  const out = [];
  await runMessage({ id: 1, type: 'analyse', position, options: { maxDepth: 6, maxTimeMs: 1e9 } }, (m) => out.push(m));
  const progress = out.filter((m) => m.type === 'progress');
  const final = out.find((m) => m.type !== 'progress');
  const ref = analyseSync(position, { maxDepth: 6, maxTimeMs: 1e9 });
  check('A1 progression après chaque profondeur', progress.length === 6 && progress.map((p) => p.result.depth).join() === '1,2,3,4,5,6', `${progress.length} messages`);
  check('A1 résultat final = analyseSync (même entrée)', final.ok && strip(final.result) === strip(ref));
  check('A1 identifiant recopié', out.every((m) => m.id === 1));
  check('A1 clonable par postMessage', (() => { try { structuredClone(out); return true; } catch { return false; } })());
}
{
  const out = [];
  const run = runMessage({ id: 2, type: 'analyse', position, options: { maxDepth: 40, maxTimeMs: 1e9 } }, (m) => out.push(m));
  await sleep(60);
  const stopReplies = [];
  await runMessage({ id: 3, type: 'stop' }, (m) => stopReplies.push(m));
  await run;
  const final = out.find((m) => m.type !== 'progress');
  check('A2 stop : accusé de réception', stopReplies[0].result === 'stopping');
  check('A2 stop : résultat final marqué interrompu, profondeur < 40', final.ok && final.result.stopped === true && final.result.depth < 40 && final.result.depth >= 1, `profondeur ${final.result.depth}`);
  check('A2 stop : le résultat contient un coup', final.result.bestMove !== null);
  const idle = [];
  await runMessage({ id: 4, type: 'stop' }, (m) => idle.push(m));
  check('A2 stop sans analyse : répond "idle"', idle[0].result === 'idle');
}
{
  const outA = [], outB = [];
  const runA = runMessage({ id: 5, type: 'analyse', position, options: { maxDepth: 40, maxTimeMs: 1e9 } }, (m) => outA.push(m));
  await sleep(40);
  const runB = runMessage({ id: 6, type: 'analyse', position, options: { maxDepth: 4, maxTimeMs: 1e9 } }, (m) => outB.push(m));
  await Promise.all([runA, runB]);
  const finalA = outA.find((m) => m.type !== 'progress'), finalB = outB.find((m) => m.type !== 'progress');
  check('A3 nouvelle analyse : la précédente est interrompue', finalA.result.stopped === true);
  check('A3 nouvelle analyse : la seconde va au bout, résultat correct', strip(finalB.result) === strip(analyseSync(position, { maxDepth: 4, maxTimeMs: 1e9 })));
}
{
  const out = [];
  await runMessage({ id: 7, type: 'analyse', position: null }, (m) => out.push(m));
  check('A4 position invalide : erreur renvoyée', out[0].ok === false);
  const out2 = [];
  await runMessage({ id: 8, type: 'analyse', position: parsePos('w|1|'), options: { maxDepth: 3 } }, (m) => out2.push(m));
  check('A4 position sans coup : mat en 0 renvoyé', out2.at(-1).ok && out2.at(-1).result.mate.in === 0 && out2.at(-1).result.bestMove === null);
}

// --- B. vrai fil d'exécution -----------------------------------------------------------------------------------------------------
{
  const w = new Worker(fileURLToPath(new URL('./worker-thread-shim.mjs', import.meta.url)));
  const msgs = [];
  let notify = null;
  w.on('message', (m) => { msgs.push(m); if (notify) notify(); });
  w.on('error', (e) => { console.log('ERR erreur du fil : ' + e.message); failures++; });
  const waitFor = (pred, timeoutMs = 20000) => new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('délai dépassé')), timeoutMs);
    const check_ = () => { const hit = msgs.find(pred); if (hit) { clearTimeout(t); notify = null; resolve(hit); } };
    notify = check_;
    check_();
  });

  await waitFor((m) => m.type === 'ready');
  w.postMessage({ id: 10, type: 'ping' });
  check('B1 ping dans un vrai fil', (await waitFor((m) => m.id === 10)).result === 'pong');

  w.postMessage({ id: 11, type: 'analyse', position, options: { maxDepth: 6, maxTimeMs: 1e9 } });
  const final = await waitFor((m) => m.id === 11 && m.type !== 'progress');
  const nProgress = msgs.filter((m) => m.id === 11 && m.type === 'progress').length;
  check('B2 analyse dans un vrai fil : 6 progressions + résultat identique', nProgress === 6 && strip(final.result) === strip(analyseSync(position, { maxDepth: 6, maxTimeMs: 1e9 })));

  w.postMessage({ id: 12, type: 'analyse', position, options: { maxDepth: 40, maxTimeMs: 1e9 } });
  await waitFor((m) => m.id === 12 && m.type === 'progress' && m.result.depth >= 3);
  const tStop = performance.now();
  w.postMessage({ id: 13, type: 'stop' });
  const stopped = await waitFor((m) => m.id === 12 && m.type !== 'progress');
  const delay = performance.now() - tStop;
  check('B3 stop dans un vrai fil : analyse interrompue', stopped.result.stopped === true && stopped.result.depth < 40, `profondeur ${stopped.result.depth}, délai d'arrêt ${delay.toFixed(0)} ms`);
  await w.terminate();
}

console.log(failures === 0 ? 'RÉSULTAT : tout concorde.' : `RÉSULTAT : ${failures} échec(s).`);
process.exit(failures === 0 ? 0 : 1);
