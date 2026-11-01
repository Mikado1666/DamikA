// Poolé de plusieurs matchs de l'arène (même A contre même B) : regroupe les scores PAR PAIRE puis calcule Elo et IC 95 %.
// Usage : node training/pool.mjs training/data/<match1> training/data/<match2> …
import fs from 'node:fs';
import path from 'node:path';
import { matchStats, formatMatchStats } from './stats.mjs';

const dirs = process.argv.slice(2);
if (!dirs.length) { console.error('Usage : node training/pool.mjs <dossier de match> [<dossier> …]'); process.exit(1); }
const points = (g) => (g.result === '1/2' ? 0.5 : (g.result === '1-0') === g.aWhite ? 1 : 0);
const pairs = [];
let w = 0, d = 0, l = 0;
for (const dir of dirs) {
  const perPair = new Map();
  for (const line of fs.readFileSync(path.join(dir, 'games.jsonl'), 'utf8').split('\n')) {
    if (!line.trim()) continue;
    const g = JSON.parse(line), p = points(g);
    perPair.set(g.pair, (perPair.get(g.pair) || 0) + p);
    if (p === 1) w++; else if (p === 0) l++; else d++;
  }
  for (const v of perPair.values()) pairs.push(v / 2);
}
console.log(formatMatchStats(matchStats(pairs, { w, d, l })).split('\n').slice(0, 3).join('\n'));
