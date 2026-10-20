// DAMIKA — Étage 3.1 : fil d'exécution de l'arène (worker_threads). Reçoit { id, index } et la configuration
// (au démarrage), joue la tâche et renvoie les lignes JSONL. Aucun état partagé : chaque fil a ses propres
// tables (table de transposition comprise).
import { parentPort, workerData } from 'node:worker_threads';
import fs from 'node:fs';
import { runJob } from './jobs.mjs';

const cfg = workerData.cfg;

parentPort.on('message', (msg) => {
  if (msg.type !== 'job') return;
  // Crochet de test (tests/arena.mjs) : plante UNE fois sur la tâche demandée, pour vérifier la relance.
  const crashFile = process.env.ARENA_TEST_CRASH_FILE;
  if (crashFile && Number(process.env.ARENA_TEST_CRASH_JOB) === msg.index && !fs.existsSync(crashFile)) {
    fs.writeFileSync(crashFile, 'crash');
    process.exit(3);
  }
  try {
    parentPort.postMessage({ type: 'done', index: msg.index, lines: runJob(cfg, msg.index) });
  } catch (err) {
    parentPort.postMessage({ type: 'fail', index: msg.index, error: String(err && err.stack ? err.stack : err) });
  }
});
parentPort.postMessage({ type: 'ready' });
