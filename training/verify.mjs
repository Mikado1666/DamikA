#!/usr/bin/env node
// DAMIKA — Étage 3.1 : contrôle de légalité des parties ENREGISTRÉES, avec rules.js seul (moteur de référence,
// indépendant du moteur rapide qui a joué). Pour chaque ligne de <dossier>/games.jsonl : tous les coups sont légaux,
// la partie n'est jamais terminée avant son dernier coup, le résultat et le motif (plus de coup, 25 coups,
// répétition, plafond) sont exactement ceux que rules.js attend.
//   node training/verify.mjs training/data/m1 [--max 500]
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { verifyGame, DEFAULT_MAX_PLIES } from './game.mjs';

const dir = process.argv[2];
const maxIdx = process.argv.indexOf('--max');
const max = maxIdx > 0 ? Number(process.argv[maxIdx + 1]) : Infinity;
if (!dir) { console.error('Usage : node training/verify.mjs <dossier> [--max N]'); process.exit(2); }
const meta = JSON.parse(fs.readFileSync(path.join(dir, 'meta.json'), 'utf8'));
const maxPlies = meta.identity.maxPlies ?? DEFAULT_MAX_PLIES;
// Parties enregistrées avant les limites de finale 6.3 / 6.4 : pas de champ endgameRules dans l'identité du run.
const endgameRules = meta.identity.endgameRules !== undefined;
const rl = readline.createInterface({ input: fs.createReadStream(path.join(dir, 'games.jsonl')), crlfDelay: Infinity });
let n = 0, bad = 0, plies = 0;
const reasons = {};
for await (const line of rl) {
  if (!line.trim() || n >= max) continue;
  const rec = JSON.parse(line);
  const v = verifyGame(rec, maxPlies, { endgameRules });
  n++; plies += rec.moves.length;
  reasons[rec.reason] = (reasons[rec.reason] || 0) + 1;
  if (!v.ok) { bad++; console.log(`ILLÉGAL : ${rec.mode} ${rec.pair ?? rec.game}/${rec.g ?? ''} — ${v.error}`); }
}
console.log(`${n} parties rejouées avec rules.js (${plies} demi-coups) : ${bad === 0 ? 'TOUTES légales, résultats cohérents' : `${bad} problème(s)`}`);
console.log(`Fins de partie : ${Object.entries(reasons).map(([k, v]) => `${k} ${v}`).join(', ')}`);
process.exit(bad === 0 ? 0 : 1);
