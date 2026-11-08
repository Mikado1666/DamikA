// DAMIKA — Film de la partie : mesure d'une partie avec Scan 3.1 (WebAssembly) dans le Worker existant (P31).
// Une recherche par position, jusqu'à la profondeur 14 ; on lit les lignes `info` (messages `progress` du Worker) pour
// garder le score de CHAQUE profondeur (11 à 14 servent à la valeur de la position). Le calcul tourne dans le Worker :
// l'interface ne se fige jamais. Les positions sans recherche (camp sans coup, ≤ 6 pièces, coup forcé) sont décrites
// par film-game.js. Séquentiel : une seule recherche à la fois.
//
// Même protocole de messages que js/ai/scan-worker.js ; option `newGame: true` (tables de Scan vidées avant chaque
// position, comme les mesures natives de P28 : le score d'une position ne dépend pas de celles qui l'ont précédée).

import { toHubPosition } from '../ai/scan-protocol.js';
import { DEPTH_REF, scoresFromDepths, capPawns } from './film-metrics.js';
import { describePosition, applyLegal, fmjd, other } from './film-game.js';

export class FilmCancelled extends Error { constructor() { super('analyse annulée'); this.name = 'FilmCancelled'; } }

const defaultCreateWorker = () => new Worker(new URL('../ai/scan-worker.js', import.meta.url), { type: 'module' });
// Pas de limite de temps : la recherche s'arrête à la profondeur demandée (le Worker n'applique le temps que s'il est atteint).
const NO_TIME_LIMIT_MS = 3600000;

// Score d'une ligne `info` (message du Worker) en pions, vue des Blancs, plafonné pour les tables et les mats.
const pawnsOf = (r) => capPawns(r.score / 100, !!(r.mate || r.tablebase));

// Enregistrement de position (voir film-game.js) à partir des lignes `info` d'une recherche.
export function recFromSearch({ board, side }, pieces, byDepth, result) {
  const sc = scoresFromDepths(byDepth);
  if (!sc) throw new Error('Scan n\'a donné aucune évaluation pour une position');
  let best = null, bestPos = null;
  const bm = result && result.bestMove;
  if (bm) {
    const legal = Array.isArray(bm) ? { kind: 'capture', seq: bm } : { kind: 'simple', move: bm };
    best = fmjd(legal);
    bestPos = toHubPosition(applyLegal(board, side, legal), other(side));
  }
  return { scores: sc.scores, best, bestPos, pieces, ...(sc.missing ? { missing: sc.missing } : {}) };
}

export function createFilmRunner({ createWorker = defaultCreateWorker, onStatus = () => {} } = {}) {
  let worker = null;
  let seq = 0;
  let pending = null;
  let cancelled = false;
  const info = { engine: null, wasmBytes: null };

  function ensureWorker() {
    if (worker) return worker;
    worker = createWorker();
    worker.onmessage = (e) => {
      const m = e.data;
      if (m && m.type === 'status') {
        if (m.status === 'ready') { info.engine = m.engine ?? null; info.wasmBytes = m.wasmBytes ?? null; }
        onStatus(m);
        return;
      }
      if (!m || !pending || m.id !== pending.id) return;
      if (m.type === 'progress') { pending.onInfo(m.result); return; }
      const p = pending; pending = null;
      if (m.ok === false) p.reject(new Error(m.error || 'Scan : erreur')); else p.resolve(m.result);
    };
    worker.onerror = (e) => {
      const p = pending; pending = null;
      if (p) p.reject(new Error((e && e.message) || 'Scan n\'a pas pu être chargé'));
    };
    return worker;
  }

  function search(position, onInfo) {
    return new Promise((resolve, reject) => {
      const id = ++seq;
      pending = { id, resolve, reject, onInfo };
      ensureWorker().postMessage({ id, type: 'analyse', position, options: { maxDepth: DEPTH_REF, maxTimeMs: NO_TIME_LIMIT_MS, newGame: true } });
    });
  }

  // Mesure toutes les positions du plan qui manquent dans `recs` (tableau modifié en place, dans l'ordre).
  // onRec(i, rec, recs) est attendu après chaque position (sauvegarde du cache, affichage). Retourne les statistiques.
  async function run({ plan, recs, onRec = async () => {} }) {
    const stats = { searched: 0, searchMs: [], nodes: 0 };
    for (let i = 0; i < plan.positions.length; i++) {
      if (cancelled) throw new FilmCancelled();
      if (recs[i]) continue;
      const position = plan.positions[i];
      let rec = describePosition(position);
      if (!rec) {
        const t0 = performance.now();
        const byDepth = {};
        const result = await search(position, (r) => {
          if (r && Number.isFinite(r.depth)) byDepth[r.depth] = pawnsOf(r);
        }).catch((err) => { throw cancelled ? new FilmCancelled() : err; });
        if (cancelled) throw new FilmCancelled();
        // la ligne finale reprend le dernier `info` : si sa profondeur n'a pas été vue, on la garde aussi
        if (result && Number.isFinite(result.depth) && result.depth > 0 && byDepth[result.depth] === undefined) byDepth[result.depth] = pawnsOf(result);
        let pieces = 0; for (let s = 1; s <= 50; s++) if (position.board[s]) pieces++;
        rec = recFromSearch(position, pieces, byDepth, result);
        stats.searched++; stats.searchMs.push(Math.round(performance.now() - t0)); stats.nodes += (result && result.nodes) || 0;
      }
      recs[i] = rec;
      await onRec(i, rec, recs);
    }
    return stats;
  }

  function cancel() {
    cancelled = true;
    if (worker) { worker.terminate(); worker = null; }
    if (pending) { const p = pending; pending = null; p.reject(new FilmCancelled()); }
  }

  return { run, cancel, info, get cancelled() { return cancelled; } };
}
