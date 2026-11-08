// DAMIKA — Cache local du Film de la partie (P31) : les valeurs mesurées par position, JAMAIS les noms des joueurs.
// IndexedDB (base « damika-film », magasin « analyses »). Clé = empreinte SHA-256 des coups seuls (texte canonique de
// film-game.js : pas d'en-tête, donc ni nom ni date). Une entrée est ignorée si METRICS_VERSION ou les profondeurs ont changé.
// Toute erreur (navigation privée, IndexedDB absent…) est avalée : le Film marche alors sans cache.

import { METRICS_VERSION, DEPTH_REF, DEPTH_FROM } from './film-metrics.js';

const DB_NAME = 'damika-film', STORE = 'analyses', MAX_ENTRIES = 40;

// Empreinte d'un texte : SHA-256 (32 premiers caractères hexadécimaux) ; repli sur un hachage 53 bits sans crypto.subtle.
export async function hashText(text) {
  try {
    if (globalThis.crypto && globalThis.crypto.subtle) {
      const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
      return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 32);
    }
  } catch { /* repli */ }
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) { const ch = text.charCodeAt(i); h1 = Math.imul(h1 ^ ch, 2654435761); h2 = Math.imul(h2 ^ ch, 1597334677); }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 'x' + (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16);
}

function openDb() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') { reject(new Error('IndexedDB absent')); return; }
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => { req.result.createObjectStore(STORE, { keyPath: 'key' }); };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
const wrap = (req) => new Promise((resolve, reject) => { req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); });

// Enregistrement valide (même version des formules et mêmes profondeurs) ou null.
export async function loadAnalysis(key) {
  try {
    const db = await openDb();
    const rec = await wrap(db.transaction(STORE, 'readonly').objectStore(STORE).get(key));
    db.close();
    if (!rec || rec.metrics !== METRICS_VERSION || rec.depth !== DEPTH_REF || rec.depthFrom !== DEPTH_FROM || !Array.isArray(rec.recs)) return null;
    return rec;
  } catch { return null; }
}

// `recs` : enregistrements de position (film-game.js), sans trou au début ; complete = toutes les positions mesurées.
export async function saveAnalysis(key, recs, complete) {
  try {
    const db = await openDb();
    const store = db.transaction(STORE, 'readwrite').objectStore(STORE);
    await wrap(store.put({ key, metrics: METRICS_VERSION, depth: DEPTH_REF, depthFrom: DEPTH_FROM, n: recs.length, recs: [...recs], complete: !!complete, savedAt: Date.now() }));
    if (complete) await prune(db);
    db.close();
    return true;
  } catch { return false; }
}

async function prune(db) {
  const store = db.transaction(STORE, 'readwrite').objectStore(STORE);
  const all = await wrap(store.getAll());
  if (all.length <= MAX_ENTRIES) return;
  all.sort((a, b) => a.savedAt - b.savedAt);
  for (const r of all.slice(0, all.length - MAX_ENTRIES)) store.delete(r.key);
}
