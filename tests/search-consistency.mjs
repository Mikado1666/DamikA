// Cohérence de la recherche.
//   1. alpha-bêta (sans table) = négamax sans élagage, MÊME score, profondeurs 3 à 5.
//   2. alpha-bêta avec table de transposition = alpha-bêta sans table (scores strictement identiques).
//      C'est le critère qui décide si la table est activée par défaut (TT_DEFAULT dans search.js).
//   3. Approfondissement itératif : scores identiques profondeur par profondeur avec/sans table.
//   4. Hash de Zobrist incrémental = hash recalculé en entier, le long de parties aléatoires.
//   5. La variante principale (PV) est une suite de coups légaux.
//   6. Déterminisme : mêmes entrées, mêmes sorties (analyse à profondeur fixe).
// Usage : node tests/search-consistency.mjs [--d3 N] [--d4 N] [--d5 N] [--seed S]
import { FastBoard } from '../js/ai/fastboard.js';
import { searchFixedDepth, analyseSync, zobristHash, hashAfterMove } from '../js/ai/search.js';
import { mulberry32, randomFastPosition, toPosition, fmt } from './helpers.mjs';

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? Number(args[i + 1]) : d; };
const rnd = mulberry32(opt('seed', 2026));
let bad = 0;
const fail = (msg) => { bad++; if (bad <= 12) console.log('ERR ' + msg); };

// --- 1 et 2 : négamax pur / alpha-bêta / alpha-bêta + table ---------------------------------------
const plan = [[3, opt('d3', 400)], [4, opt('d4', 200)], [5, opt('d5', 60)]];
let i = 0;
for (const [depth, count] of plan) {
  let nodesPure = 0, nodesAb = 0, nodesTt = 0, diffAb = 0, diffTt = 0;
  const t0 = performance.now();
  for (let k = 0; k < count; k++, i++) {
    const fb = randomFastPosition(rnd, i);
    const pure = searchFixedDepth(fb, depth, { prune: false });
    const ab = searchFixedDepth(fb, depth, { prune: true });
    const tt = searchFixedDepth(fb, depth, { prune: true, useTT: true });
    nodesPure += pure.nodes; nodesAb += ab.nodes; nodesTt += tt.nodes;
    if (pure.score !== ab.score) { diffAb++; fail(`alpha-bêta ≠ négamax, prof. ${depth}, position ${i}: ${ab.score} vs ${pure.score}`); }
    if (ab.score !== tt.score) { diffTt++; fail(`table ≠ sans table, prof. ${depth}, position ${i}: ${tt.score} vs ${ab.score}`); }
  }
  console.log(`${diffAb + diffTt === 0 ? 'OK ' : 'ERR'} profondeur ${depth} : ${count} positions — nœuds négamax ${fmt(nodesPure)}, alpha-bêta ${fmt(nodesAb)}, alpha-bêta+table ${fmt(nodesTt)} ` +
    `(${((performance.now() - t0) / 1000).toFixed(1)} s) — écarts alpha-bêta ${diffAb}, écarts table ${diffTt}`);
}

// --- 3 : approfondissement itératif avec / sans table ---------------------------------------------------
{
  let diff = 0, sameMove = 0, total = 0;
  for (let k = 0; k < 300; k++, i++) {
    const pos = toPosition(randomFastPosition(rnd, i));
    const a = [], b = [];
    const ra = analyseSync(pos, { maxDepth: 7, maxTimeMs: 1e9, useTT: false, onProgress: (p) => a.push(p.score) });
    const rb = analyseSync(pos, { maxDepth: 7, maxTimeMs: 1e9, useTT: true, onProgress: (p) => b.push(p.score) });
    total++;
    if (a.length !== b.length || a.some((s, j) => s !== b[j])) { diff++; fail(`itératif : scores par profondeur différents, position ${i}: ${a} vs ${b}`); }
    if (ra.bestMoveNotation === rb.bestMoveNotation) sameMove++;
  }
  console.log(`${diff === 0 ? 'OK ' : 'ERR'} approfondissement itératif (prof. 7), avec/sans table : ${total} positions, écarts de score ${diff} ; même meilleur coup dans ${sameMove}/${total} cas (à score égal, le choix peut légitimement différer)`);
}

// --- 4 : Zobrist incrémental ---------------------------------------------------------------------------------------
{
  let checks = 0, diff = 0;
  const out = { lo: 0, hi: 0 };
  for (let g = 0; g < 400; g++) {
    const fb = randomFastPosition(rnd, g);
    let h = zobristHash(fb);
    for (let p = 0; p < 60; p++) {
      const moves = fb.generateMoves();
      if (!moves.length) break;
      const m = moves[Math.floor(rnd() * moves.length)];
      hashAfterMove(fb, m, h.lo, h.hi, out);
      fb.makeMove(m);
      h = { lo: out.lo, hi: out.hi };
      const full = zobristHash(fb);
      checks++;
      if (full.lo !== h.lo || full.hi !== h.hi) { diff++; fail(`Zobrist : incrémental ≠ complet (partie ${g}, demi-coup ${p})`); break; }
    }
  }
  console.log(`${diff === 0 ? 'OK ' : 'ERR'} Zobrist incrémental = recalcul complet : ${fmt(checks)} coups vérifiés`);
}

// --- 5 : la PV est légale -------------------------------------------------------------------------------------------------
{
  let diff = 0, checked = 0;
  for (let k = 0; k < 300; k++, i++) {
    const fb = randomFastPosition(rnd, i);
    const r = analyseSync(toPosition(fb), { maxDepth: 6, maxTimeMs: 1e9 });
    const replay = FastBoard.fromUiBoard(fb.toUiBoard(), fb.sideToMove);
    for (const note of r.pvNotation) {
      const m = replay.generateMoves().find((x) => `${x.from + 1}${x.caps.length ? 'x' : '-'}${x.to + 1}` === note);
      checked++;
      if (!m) { diff++; fail(`PV illégale : ${r.pvNotation.join(' ')} (position ${i})`); break; }
      replay.makeMove(m);
    }
  }
  console.log(`${diff === 0 ? 'OK ' : 'ERR'} variantes principales légales : ${fmt(checked)} coups rejoués`);
}

// --- 6 : déterminisme ---------------------------------------------------------------------------------------------------------------
{
  let diff = 0;
  const strip = (r) => JSON.stringify({ ...r, timeMs: 0, nps: 0 });
  for (let k = 0; k < 100; k++, i++) {
    const pos = toPosition(randomFastPosition(rnd, i));
    for (const useTT of [false, true]) {
      const a = analyseSync(pos, { maxDepth: 6, maxTimeMs: 1e9, useTT });
      // Une analyse intercalée (autre position) ne doit rien changer à la suivante.
      analyseSync(toPosition(randomFastPosition(rnd, i + 1)), { maxDepth: 4, maxTimeMs: 1e9, useTT });
      const b = analyseSync(pos, { maxDepth: 6, maxTimeMs: 1e9, useTT });
      if (strip(a) !== strip(b)) { diff++; fail(`non déterministe (useTT=${useTT}), position ${i}`); }
    }
  }
  console.log(`${diff === 0 ? 'OK ' : 'ERR'} déterminisme : 100 positions × (avec/sans table), deux exécutions identiques (score, coup, PV, profondeur, nœuds)`);
}

console.log(bad === 0 ? 'RÉSULTAT : tout concorde.' : `RÉSULTAT : ${bad} échec(s).`);
process.exit(bad === 0 ? 0 : 1);
