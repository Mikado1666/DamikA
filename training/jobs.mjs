// DAMIKA — Étage 3.1 : une « tâche » de l'arène = une paire de parties (match) ou une partie (auto-jeu).
// Partagé par le worker (worker_threads) et par les tests (appel direct, sans fil).
//
// Une tâche ne dépend QUE de (configuration, indice) : son hasard vient de seedOf(graine, étiquette, indice).
// L'ordre d'exécution, le nombre de workers et les reprises n'ont donc aucun effet sur le résultat.

import { makePlayer, makeOpening, playGame, verifyGame, mulberry32, seedOf, aPoints } from './game.mjs';

// cfg : { mode: 'match'|'selfplay', a: { name, kind, weights | tables }, b: idem (match),
//         depthA, depthB, maxNodes, maxTimeMs, seed, open: { plies, thresholdCp, probeDepth },
//         explore: { prob, margin } | null, maxPlies, verify }
// Retourne la liste des lignes JSONL (objets) de la tâche. Lève une exception si la vérification échoue.
export function runJob(cfg, index) {
  const open = cfg.open;
  const budget = { maxNodes: cfg.maxNodes ?? Infinity, maxTimeMs: cfg.maxTimeMs ?? 1e9 };
  const opening = makeOpening(mulberry32(seedOf(cfg.seed, 'open', index)), open);

  const check = (rec, label) => {
    if (!cfg.verify) return;
    const v = verifyGame(rec, cfg.maxPlies);
    if (!v.ok) throw new Error(`vérification rules.js échouée (${label}) : ${v.error}`);
  };

  if (cfg.mode === 'match') {
    const A = makePlayer({ ...cfg.a, depth: cfg.depthA, ...budget });
    const B = makePlayer({ ...cfg.b, depth: cfg.depthB, ...budget });
    const lines = [];
    // Même ouverture, couleurs inversées : supprime le biais de couleur et d'ouverture.
    for (const aWhite of [true, false]) {
      const rec = playGame({ opening, white: aWhite ? A : B, black: aWhite ? B : A, maxPlies: cfg.maxPlies });
      check(rec, `paire ${index}, A ${aWhite ? 'blancs' : 'noirs'}`);
      lines.push({ mode: 'match', pair: index, g: aWhite ? 0 : 1, a: aPoints(rec, aWhite), aWhite, ...rec });
    }
    return lines;
  }

  // Auto-jeu : une partie par indice, le même évaluateur des deux côtés, exploration activée.
  const P = makePlayer({ ...cfg.a, depth: cfg.depthA, ...budget });
  const rec = playGame({
    opening, white: P, black: P, explore: cfg.explore, rng: mulberry32(seedOf(cfg.seed, 'play', index)),
    record: true, maxPlies: cfg.maxPlies,
  });
  check(rec, `partie ${index}`);
  return [{ mode: 'selfplay', game: index, ...rec }];
}
