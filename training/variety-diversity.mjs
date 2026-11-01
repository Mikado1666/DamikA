// P19 — Diversité de la variété d'ouverture de V2b : pour la position de départ (DamikA aux Blancs) et pour la réponse des
// Noirs à chacun des premiers coups blancs les plus courants, distribution des coups proposés sur N « parties » (N graines).
// Les candidats d'une position sont calculés UNE fois par la vraie recherche (budget réel de l'appli : 1,5 s, profondeur 24) ;
// chaque graine tire ensuite avec la vraie fonction de tirage (drawVaried, ne dépend que de la graine et de la position) : c'est
// ce que ferait une partie de cette graine, au temps de calcul près.
// Usage : node training/variety-diversity.mjs [--margin 30] [--time 1500] [--depth 24] [--games 100] [--model data/models/p17-B-l025.json]
//                                            [--first 32-28,31-26,34-30,33-29,32-27] [--out training/data/p19-diversity.json]
import fs from 'node:fs';
import { analyseSync, drawVaried, positionHash } from '../js/ai/search.js';
import { FastBoard, moveToString } from '../js/ai/fastboard.js';
import { createModelEvaluator } from '../js/ai/eval-patterns.js';

const args = {};
for (let i = 2; i < process.argv.length; i += 2) args[process.argv[i].replace(/^--/, '')] = process.argv[i + 1];
const margin = Number(args.margin ?? 30), timeMs = Number(args.time ?? 1500), depth = Number(args.depth ?? 24), games = Number(args.games ?? 100);
const first = (args.first ?? '32-28,31-26,34-30,33-29,32-27').split(',');
const ev = createModelEvaluator(JSON.parse(fs.readFileSync(args.model ?? 'data/models/p17-B-l025.json', 'utf8')));

const notation = (m) => moveToString(m);
function distribution(fb) {
  const pos = { board: fb.toUiBoard(), side: fb.sideToMove };
  const r = analyseSync(pos, { maxDepth: depth, maxTimeMs: timeMs, evaluator: ev, variety: { margin, seed: 1 } });
  if (!r.variety) return { depth: r.depth, candidates: [], counts: {}, note: 'variété non applicable' };
  const cands = r.variety.candidates.map((c) => ({ str: c.move, weight: c.weight }));
  const h = positionHash(pos.board, pos.side);
  const counts = {};
  for (let seed = 1; seed <= games; seed++) { const c = drawVaried(cands, seed, h.lo, h.hi); counts[c.str] = (counts[c.str] || 0) + 1; }
  return { depth: r.depth, testDepth: r.variety.depth, unverified: r.variety.unverified, candidates: r.variety.candidates, counts };
}
// Scores de TOUS les coups légaux (marge énorme) : pour dire pourquoi un coup est écarté.
function allScores(fb) {
  const r = analyseSync({ board: fb.toUiBoard(), side: fb.sideToMove }, { maxDepth: depth, maxTimeMs: timeMs, evaluator: ev, variety: { margin: 100000, seed: 1 } });
  return r.variety ? r.variety.candidates.map((c) => `${c.move}:${c.score}`).join(' ') : '';
}
const fmt = (d) => Object.entries(d.counts).sort((a, b) => b[1] - a[1]).map(([m, n]) => `${m} ${n} %`.replace(' %', '')).join(', ');
const out = { margin, timeMs, depth, games, white: null, black: {} };

const fb0 = FastBoard.initial();
out.white = distribution(fb0);
out.whiteAllScores = allScores(fb0);
console.log(`Blancs, premier coup (marge ${margin} cp, ${games} parties, prof. ${out.white.depth}) :`);
console.log(`  candidats : ${out.white.candidates.map((c) => `${c.move} (${c.score >= 0 ? '+' : ''}${c.score}, poids ${c.weight})`).join(' · ')}`);
console.log(`  répartition : ${fmt(out.white)} (coups non testés faute de temps : ${out.white.unverified})`);
console.log(`  scores de tous les coups légaux (point de vue des Blancs) : ${out.whiteAllScores}`);
for (const mv of first) {
  const fb = FastBoard.initial();
  const m = fb.generateMoves().find((x) => notation(x) === mv);
  if (!m) { console.log(`premier coup ${mv} introuvable`); continue; }
  fb.makeMove(m);
  const d = distribution(fb);
  d.allScores = allScores(fb);
  out.black[mv] = d;
  console.log(`Noirs après ${mv} (prof. ${d.depth}) :`);
  console.log(`  candidats : ${d.candidates.map((c) => `${c.move} (${c.score >= 0 ? '+' : ''}${c.score})`).join(' · ')}`);
  console.log(`  répartition : ${fmt(d)} (coups non testés faute de temps : ${d.unverified})`);
  console.log(`  tous les coups (point de vue des Blancs) : ${d.allScores}`);
}
if (args.out) fs.writeFileSync(args.out, JSON.stringify(out, null, 1));
