#!/usr/bin/env node
// DAMIKA — Étape 3.3 : coût en vitesse d'évaluateurs appris (ns par position et nœuds/s de la recherche), sur des positions
// RÉELLES tirées de l'auto-jeu. Les mesures des modèles sont ENTRELACÉES (modèle A, B, C, A, B, C…) et on garde le meilleur de
// chaque : une charge passagère de la machine touche tous les modèles de la même façon, seuls les RAPPORTS sont fiables.
//
//   node training/bench-eval.mjs training/models/v1b-l0.json training/models/s33-F5.json … [--data dossier] [--rounds 7]
//
// Sortie : une ligne par modèle (ns/position, rapport au premier modèle, nœuds/s en profondeur 7, nœuds visités).
import fs from 'node:fs';
import path from 'node:path';
import { createTableEvaluator, tablesToPlain } from '../js/ai/eval-learned.js';
import { analyseSync } from '../js/ai/search.js';
import { FastBoard } from '../js/ai/fastboard.js';

const argv = process.argv.slice(2);
const opt = (name, def) => { const i = argv.indexOf(`--${name}`); return i >= 0 ? argv[i + 1] : def; };
const dataDir = opt('data', 'training/data/selfplay-nuit-1');
const rounds = Number(opt('rounds', 7));
const depth = Number(opt('depth', 7));
const files = argv.filter((a, i) => !a.startsWith('--') && (i === 0 || !argv[i - 1].startsWith('--')));
if (files.length === 0) { console.error('Usage : node training/bench-eval.mjs <modèle.json>… [--data dossier] [--rounds 7] [--depth 7]'); process.exit(2); }

// Positions réelles : on lit les premières parties de l'auto-jeu et on prend des demi-coups espacés (début à finale).
const lines = fs.readFileSync(path.join(dataDir, 'games.jsonl'), 'utf8').split('\n').filter(Boolean).slice(0, 400);
const CODE = { '.': 0, w: 1, b: 2, W: 3, B: 4 };
const boards = [], searchPos = [];
for (let gi = 0; gi < lines.length; gi++) {
  const g = JSON.parse(lines[gi]);
  for (let k = 0; k < g.p.length; k += 9) {
    const row = g.p[k];
    const b = new Int8Array(50);
    for (let i = 0; i < 50; i++) b[i] = CODE[row[0][i]];
    boards.push(b);
    if (gi % 40 === 0 && k % 27 === 0 && searchPos.length < 12) {
      const fb = new FastBoard();
      fb.board.set(b); fb.side = row[1] === 'w' ? 0 : 1;
      searchPos.push({ board: fb.toUiBoard(), side: row[1] });
    }
  }
}
let pieces = 0; for (const b of boards) for (const c of b) if (c) pieces++;
console.log(`${boards.length} positions réelles (${(pieces / boards.length).toFixed(1)} pièces en moyenne), ${searchPos.length} positions pour la recherche (profondeur ${depth}), ${rounds} tours entrelacés`);

const models = files.map((f) => ({ name: path.basename(f, '.json'), E: createTableEvaluator(tablesToPlain(JSON.parse(fs.readFileSync(f, 'utf8')))), ns: Infinity, nps: 0, nodes: 0 }));
const REPS = Math.max(1, Math.floor(400000 / boards.length));
for (let r = 0; r < rounds; r++) {
  for (const m of models) {
    let acc = 0;
    const t0 = performance.now();
    for (let k = 0; k < REPS; k++) for (let i = 0; i < boards.length; i++) acc += m.E(boards[i]);
    const ns = ((performance.now() - t0) * 1e6) / (REPS * boards.length);
    if (ns < m.ns) m.ns = ns;
    if (acc === 0.5) console.log('');
  }
  for (const m of models) {
    let nodes = 0;
    const t0 = performance.now();
    for (const p of searchPos) nodes += analyseSync(p, { maxDepth: depth, maxTimeMs: 1e9, evaluator: m.E }).nodes;
    const ms = performance.now() - t0;
    const nps = nodes / (ms / 1000);
    if (nps > m.nps) { m.nps = nps; m.nodes = nodes; m.ms = ms; }
  }
}
const base = models[0];
for (const m of models) {
  console.log(`${m.name.padEnd(22)} évaluation ${m.ns.toFixed(0).padStart(5)} ns/position (${(m.ns / base.ns).toFixed(2)}×)   recherche ${Math.round(m.nps / 1000).toString().padStart(4)} k nœuds/s (${(m.nps / base.nps).toFixed(2)}×)   ${Math.round(m.nodes / 1000)} k nœuds à la profondeur ${depth}`);
}
