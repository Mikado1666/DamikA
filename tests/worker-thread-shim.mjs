// Fait tourner js/ai/worker.js dans un VRAI fil d'exécution Node (worker_threads), avec un faux
// environnement « worker du navigateur » (WorkerGlobalScope, self.postMessage, self.onmessage).
// Sert à tests/worker-analyse.mjs pour exercer la colle `self.onmessage`, le clonage structuré des
// messages et l'arrêt entre deux profondeurs. Ce n'est PAS un test dans un navigateur.
import { parentPort } from 'node:worker_threads';

globalThis.WorkerGlobalScope = class WorkerGlobalScope {};
globalThis.self = Object.assign(new globalThis.WorkerGlobalScope(), {
  postMessage: (data) => parentPort.postMessage(data),
});
await import('../js/ai/worker.js');
parentPort.on('message', (data) => globalThis.self.onmessage({ data }));
parentPort.postMessage({ type: 'ready' });
