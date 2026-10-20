// Tests de l'arène d'entraînement (étage 3.1, dossier training/) : statistiques, parties reproductibles,
// légalité (rules.js), exploration, budget de nœuds, évaluateur injectable, reprise après interruption,
// relance d'un worker qui plante, protection du dossier de résultats. Rapide (quelques secondes).
//
// Usage : node tests/arena.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { analyseSync } from '../js/ai/search.js';
import { createEvaluator, EVAL_WEIGHTS } from '../js/ai/eval.js';
import { FastBoard } from '../js/ai/fastboard.js';
import { runJob } from '../training/jobs.mjs';
import {
  resolveWeights, weightsId, makePlayer, makeOpening, playGame, verifyGame, mulberry32, seedOf, encodeBoard,
} from '../training/game.mjs';
import { matchStats, eloFromScore } from '../training/stats.mjs';
import { resolveEvaluator } from '../training/game.mjs';
import { v0Tables } from '../js/ai/eval-learned.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const ARENA = path.join(here, '..', 'training', 'arena.mjs');
let failures = 0;
const ok = (label, cond, extra = '') => { if (!cond) failures++; console.log(`${cond ? 'OK ' : 'ERR'} ${label}${extra ? ' — ' + extra : ''}`); };
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'damika-arena-'));
const testStart = Date.now();
const usedNames = new Set();
const tdir = (n) => { usedNames.add(n); return path.join(tmp, n); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const lines = (f) => (fs.existsSync(f) ? fs.readFileSync(f, 'utf8').split('\n').filter(Boolean) : []);
// Une ligne sans les champs de durée (non reproductibles) : pour comparer deux exécutions.
const stable = (l) => { const o = JSON.parse(l); delete o.ms; return JSON.stringify(o); };

// --- Statistiques --------------------------------------------------------------------------------------------------------
{
  ok('Elo(0,5) = 0', eloFromScore(0.5) === 0);
  ok('Elo(0,75) ≈ +190,8', Math.abs(eloFromScore(0.75) - 190.85) < 0.1, String(eloFromScore(0.75)));
  ok('Elo(0)=−∞ et Elo(1)=+∞', eloFromScore(0) === -Infinity && eloFromScore(1) === Infinity);
  // 10 paires : scores 1 (×4), 0,5 (×4), 0 (×2) → s = 0,6 ; écart-type empirique = sqrt(0,2·... ) calculé à la main.
  const m = [1, 1, 1, 1, 0.5, 0.5, 0.5, 0.5, 0, 0];
  const st = matchStats(m, { w: 8, d: 8, l: 4 });
  const sd = Math.sqrt(m.reduce((a, x) => a + (x - 0.6) ** 2, 0) / 9);
  ok('score moyen 60 %', Math.abs(st.score - 0.6) < 1e-12);
  ok('erreur-type = écart-type / √n (n−1 au dénominateur)', Math.abs(st.se - sd / Math.sqrt(10)) < 1e-12, `se ${st.se.toFixed(4)}`);
  ok('IC 95 % = s ± 1,96·se', Math.abs(st.lo - (0.6 - 1.959964 * st.se)) < 1e-9 && Math.abs(st.hi - (0.6 + 1.959964 * st.se)) < 1e-9);
  ok('Elo et bornes issus du modèle logistique', Math.abs(st.elo - eloFromScore(0.6)) < 1e-9 && st.eloLo < st.elo && st.elo < st.eloHi);
  ok('10 paires : avertissement « échantillon faible »', st.warnings.some((w) => w.includes('FAIBLE')));
  ok('IC contenant 0,5 : « non significatif »', !st.significant && st.warnings.some((w) => w.includes('NON significative')));
  const big = matchStats(Array.from({ length: 400 }, (_, i) => (i % 4 === 0 ? 0 : 1)), { w: 600, d: 0, l: 200 });
  ok('400 paires à 75 % : significatif, pas d\'avertissement de faiblesse', big.significant && !big.warnings.some((w) => w.includes('FAIBLE')));
  ok('une seule paire : aucun IC', matchStats([1], { w: 2, d: 0, l: 0 }).warnings.some((w) => w.includes('moins de 2 paires')));
  const sweep = matchStats(Array(30).fill(1), { w: 60, d: 0, l: 0 });
  ok('que des victoires : Elo +∞ sans erreur', sweep.elo === Infinity);
}

// --- Évaluateur injectable, budget de nœuds ------------------------------------------------------------------------
{
  const pos = { board: FastBoard.initial().toUiBoard(), side: 'w' };
  const a = analyseSync(pos, { maxDepth: 5, maxTimeMs: 1e9 });
  const b = analyseSync(pos, { maxDepth: 5, maxTimeMs: 1e9, evaluator: createEvaluator(EVAL_WEIGHTS) });
  ok('évaluateur V0 injecté explicitement : mêmes score, coup et nœuds que par défaut', a.score === b.score && a.bestMoveNotation === b.bestMoveNotation && a.nodes === b.nodes);
  const custom = createEvaluator({ ...EVAL_WEIGHTS, centerCoreMan: 40, backRank: 30, advance: [...EVAL_WEIGHTS.advance] });
  const c = analyseSync({ board: pos.board, side: 'w' }, { maxDepth: 3, maxTimeMs: 1e9, evaluator: custom });
  const mid = FastBoard.initial(); mid.makeMove(mid.generateMoves()[3]);
  const mp = { board: mid.toUiBoard(), side: mid.sideToMove };
  const d1 = analyseSync(mp, { maxDepth: 3, maxTimeMs: 1e9 }), d2 = analyseSync(mp, { maxDepth: 3, maxTimeMs: 1e9, evaluator: custom });
  ok('un autre jeu de poids change bien l\'évaluation (injection effective)', d1.score !== d2.score, `${d1.score} / ${d2.score}`);
  const n1 = analyseSync(pos, { maxDepth: 12, maxTimeMs: 1e9, maxNodes: 50000 });
  const n2 = analyseSync(pos, { maxDepth: 12, maxTimeMs: 1e9, maxNodes: 50000 });
  ok('budget de nœuds : s\'arrête (stopped), reproductible', n1.stopped && n1.depth >= 1 && n1.depth < 12 && n1.nodes === n2.nodes && n1.bestMoveNotation === n2.bestMoveNotation, `prof. ${n1.depth}, ${n1.nodes} nœuds`);
  const w = resolveWeights('v0');
  ok('resolveWeights(v0) = EVAL_WEIGHTS', JSON.stringify(w) === JSON.stringify(EVAL_WEIGHTS));
  const f = tdir('w.json');
  fs.writeFileSync(f, JSON.stringify({ man: 101.6, advance: [0, 1, 2, 3, 4, 5, 6, 7, 8.4] }));
  const w2 = resolveWeights(f);
  ok('fichier de poids : fusion avec V0 et arrondi à l\'entier', w2.man === 102 && w2.advance[8] === 8 && w2.king === EVAL_WEIGHTS.king);
  fs.writeFileSync(f, JSON.stringify({ truc: 1 }));
  let err = null; try { resolveWeights(f); } catch (e) { err = e; }
  ok('poids inconnu : refusé', err && /inconnu/.test(err.message));
  ok('identifiant de poids stable et sensible', weightsId(w) === weightsId({ ...w }) && weightsId(w) !== weightsId({ ...w, man: 101 }));
}

// --- Parties : reproductibilité, couleurs, légalité --------------------------------------------------------------
const baseCfg = (over = {}) => ({
  mode: 'match', a: { name: 'A', weights: resolveWeights('v0') }, b: { name: 'B', weights: resolveWeights('v0') },
  depthA: 3, depthB: 3, maxNodes: null, maxTimeMs: null, seed: 7,
  open: { plies: 8, thresholdCp: 50, probeDepth: 2 }, explore: null, maxPlies: 300, verify: true, ...over,
});
{
  const l1 = runJob(baseCfg(), 3), l2 = runJob(baseCfg(), 3);
  ok('même graine, même tâche : parties identiques coup pour coup', JSON.stringify(l1.map((x) => ({ ...x, ms: 0 }))) === JSON.stringify(l2.map((x) => ({ ...x, ms: 0 }))));
  const l3 = runJob(baseCfg({ seed: 8 }), 3), l4 = runJob(baseCfg(), 4);
  ok('autre graine ou autre indice : autre ouverture', l3[0].moves.slice(0, 8).join() !== l1[0].moves.slice(0, 8).join() && l4[0].moves.slice(0, 8).join() !== l1[0].moves.slice(0, 8).join());
  ok('une paire = 2 parties, même ouverture, couleurs inversées', l1.length === 2 && l1[0].aWhite === true && l1[1].aWhite === false && l1[0].moves.slice(0, 8).join() === l1[1].moves.slice(0, 8).join());
  ok('ouverture : K = 8 demi-coups aléatoires, marqués (champ opening)', l1[0].opening === 8);
  ok('points de A cohérents avec le résultat et la couleur', l1.every((x) => x.a === (x.aWhite ? (x.result === '1-0' ? 1 : x.result === '0-1' ? 0 : 0.5) : (x.result === '0-1' ? 1 : x.result === '1-0' ? 0 : 0.5))));
  // Ouverture : jamais déséquilibrée au-delà du seuil (à la profondeur de sonde).
  let worst = 0;
  for (let i = 0; i < 12; i++) {
    const mv = makeOpening(mulberry32(seedOf(5, 'open', i)), { plies: 8, thresholdCp: 50, probeDepth: 3 });
    const g = playGame({ opening: mv, white: makePlayer({ name: 'x', weights: resolveWeights('v0'), depth: 1 }), black: makePlayer({ name: 'x', weights: resolveWeights('v0'), depth: 1 }), maxPlies: 8 });
    ok(`ouverture ${i} : 8 demi-coups, partie en cours`, g.plies === 8 && g.moves.length === 8 && g.reason === 'maxPlies');
    const fb = FastBoard.initial();
    for (const s of mv) { const m = fb.generateMoves().find((x) => `${x.from + 1}${x.caps.length ? 'x' : '-'}${x.to + 1}` === s.split('/')[0]); fb.makeMove(m); }
    const r = analyseSync({ board: fb.toUiBoard(), side: fb.sideToMove }, { maxDepth: 3, maxTimeMs: 1e9 });
    worst = Math.max(worst, Math.abs(r.score));
    if (i >= 2) continue;
  }
  ok('ouvertures acceptées : |score V0| ≤ 0,5 pion à la profondeur de sonde', worst <= 50, `max ${worst} cp`);
}
{
  // verifyGame : refuse une partie falsifiée.
  const [g] = runJob(baseCfg(), 1);
  ok('rules.js valide une vraie partie', verifyGame(g).ok);
  const bad1 = { ...g, moves: [...g.moves] }; bad1.moves[10] = '1-2';
  ok('coup illégal détecté', !verifyGame(bad1).ok);
  const bad2 = { ...g, result: g.result === '1-0' ? '0-1' : '1-0' };
  ok('résultat falsifié détecté', !verifyGame(bad2).ok);
  const bad3 = { ...g, moves: g.moves.slice(0, -1), plies: g.plies - 1 };
  ok('partie tronquée (non terminée) détectée', !verifyGame(bad3).ok);
}
{
  // Auto-jeu : positions enregistrées, exploration.
  const cfg = baseCfg({ mode: 'selfplay', explore: { prob: 0, margin: 30 } });
  const [g] = runJob(cfg, 2);
  ok('auto-jeu : positions enregistrées hors ouverture (plies − K lignes)', Array.isArray(g.p) && g.p.length === g.plies - g.opening, `${g.p.length} positions`);
  const row = g.p[0];
  ok('ligne de position : 50 cases, camp, n° de demi-coup, compteur, score, profondeur, prise dispo',
    row.length === 7 && /^[.wWbB]{50}$/.test(row[0]) && 'wb'.includes(row[1]) && row[2] === g.opening && Number.isInteger(row[3]) && Number.isFinite(row[4]) && row[5] >= 1 && (row[6] === 0 || row[6] === 1));
  ok('encodeBoard : position initiale = 20 noirs, 10 vides, 20 blancs', encodeBoard(FastBoard.initial().board) === 'b'.repeat(20) + '.'.repeat(10) + 'w'.repeat(20));
  const ex = runJob(baseCfg({ mode: 'selfplay', explore: { prob: 1, margin: 60 } }), 2)[0];
  ok('exploration (prob 1) : partie différente mais toujours légale', ex.moves.join() !== g.moves.join() && ex.explored > 0 && verifyGame(ex).ok, `${ex.explored} coups explorés`);
  const ex2 = runJob(baseCfg({ mode: 'selfplay', explore: { prob: 1, margin: 60 } }), 2)[0];
  ok('exploration : reproductible avec la même graine', ex.moves.join() === ex2.moves.join());
  ok('sans exploration : aucun coup exploré', g.explored === 0);
}

// --- Arène en ligne de commande -------------------------------------------------------------------------------------
const base = (out, pairs, extra = []) => ['match', '--a', 'v0', '--b', 'v0', '--depth', '3', '--pairs', String(pairs), '--out', out, '--workers', '3', '--probe-depth', '2', '--seed', '9', '--progress-sec', '60', '--allow-sleep', ...extra];
const cli = (args, env = {}) => spawnSync(process.execPath, [ARENA, ...args], { encoding: 'utf8', env: { ...process.env, ...env }, timeout: 120000 });
{
  const out = tdir('reprise');
  const r1 = cli(base(out, 5));
  const f = path.join(out, 'games.jsonl');
  const first = lines(f);
  ok('CLI match : 5 paires = 10 lignes, statistiques affichées', r1.status === 0 && first.length === 10 && /Score de A/.test(r1.stdout), `code ${r1.status}`);
  const r2 = cli(base(out, 8));
  const second = lines(f);
  ok('reprise (même commande, plus de paires) : les 10 premières lignes inchangées, 16 au total, sans doublon',
    r2.status === 0 && second.length === 16 && second.slice(0, 10).join('\n') === first.join('\n') && new Set(second.map((l) => { const o = JSON.parse(l); return `${o.pair}/${o.g}`; })).size === 16);
  const r3 = cli(base(out, 8));
  ok('relance sans rien à faire : « tout est déjà joué », fichier intact', /déjà joué/.test(r3.stdout) && lines(f).length === 16);
  // Ligne finale tronquée (arrêt brutal pendant l'écriture) + paire incomplète.
  const raw = fs.readFileSync(f, 'utf8').split('\n').filter(Boolean);
  fs.writeFileSync(f, raw.slice(0, 13).join('\n') + '\n' + raw[13].slice(0, 120)); // 6 paires + 1 partie + moitié de ligne
  const r4 = cli(base(out, 8));
  const healed = lines(f);
  const keys = healed.map((l) => { const o = JSON.parse(l); return `${o.pair}/${o.g}`; });
  ok('reprise après écriture tronquée : fichier réparé, 16 lignes, aucun doublon ni perte', r4.status === 0 && healed.length === 16 && new Set(keys).size === 16 && /tronquée|incompl/.test(r4.stdout), `${healed.length} lignes`);
  ok('… et identique (hors durées) à une exécution ininterrompue', healed.map(stable).sort().join('\n') === second.map(stable).sort().join('\n'));
  const r5 = cli(base(out, 8).map((x) => (x === '9' ? '10' : x)));
  ok('autres réglages (graine) dans un dossier existant : refusé, rien écrasé', r5.status === 2 && /autre run/.test(r5.stderr) && lines(f).length === 16);
}
{
  // Interruption brutale d'un run en cours (kill), puis reprise.
  const out = tdir('kill');
  const f = path.join(out, 'games.jsonl');
  const child = spawn(process.execPath, [ARENA, ...base(out, 24, ['--workers', '2'])], { stdio: 'ignore' });
  const t0 = Date.now();
  while (lines(f).length < 4 && Date.now() - t0 < 60000) await sleep(20);
  child.kill('SIGKILL');
  await sleep(200);
  const partial = lines(f).length;
  const r = cli(base(out, 24));
  const all = lines(f);
  const keys = all.map((l) => { const o = JSON.parse(l); return `${o.pair}/${o.g}`; });
  ok(`run tué en cours (${partial} lignes écrites) puis relancé : 48 lignes, aucun doublon, aucune perte`, r.status === 0 && all.length === 48 && new Set(keys).size === 48 && partial < 48, `${partial} → ${all.length}`);
  const ref = tdir('ref');
  cli(base(ref, 24));
  ok('… et résultat identique (hors durées) à un run sans interruption', lines(path.join(ref, 'games.jsonl')).map(stable).sort().join('\n') === all.map(stable).sort().join('\n'));
}
{
  // Un worker qui plante est relancé et la tâche rejouée.
  const out = tdir('crash');
  const crashFile = tdir('crash.flag');
  const r = cli(base(out, 6), { ARENA_TEST_CRASH_FILE: crashFile, ARENA_TEST_CRASH_JOB: '2' });
  const all = lines(path.join(out, 'games.jsonl'));
  ok('worker planté pendant la tâche 2 : relancé, 6 paires complètes, journal explicite', r.status === 0 && fs.existsSync(crashFile) && all.length === 12 && /relance/.test(r.stdout), `code ${r.status}`);
}
{
  // Auto-jeu en ligne de commande + arrêt demandé (Ctrl+C simulé).
  const out = tdir('sp');
  const r = cli(['selfplay', '--evaluator', 'v0', '--depth', '3', '--games', '6', '--out', out, '--workers', '3', '--probe-depth', '2', '--seed', '3', '--allow-sleep', '--progress-sec', '60']);
  const all = lines(path.join(out, 'games.jsonl'));
  ok('CLI selfplay : 6 parties avec positions', r.status === 0 && all.length === 6 && all.every((l) => JSON.parse(l).p.length > 0), `code ${r.status}`);
  const sum = JSON.parse(fs.readFileSync(path.join(out, 'summary.json'), 'utf8'));
  ok('summary.json : 6 parties, positions comptées', sum.games === 6 && sum.positions === all.reduce((a, l) => a + JSON.parse(l).p.length, 0));
}

{
  // Ctrl+C (simulé par le crochet de test, même gestionnaire) : arrêt propre, puis reprise complète.
  const out = tdir('sigint');
  const args = ['selfplay', '--evaluator', 'v0', '--depth', '3', '--games', '400', '--out', out, '--workers', '2', '--probe-depth', '2', '--seed', '4', '--allow-sleep', '--progress-sec', '60'];
  const r = cli(args, { ARENA_TEST_SIGINT_AFTER_MS: '1500' });
  const f = path.join(out, 'games.jsonl');
  const part = lines(f);
  const sum = JSON.parse(fs.readFileSync(path.join(out, 'summary.json'), 'utf8'));
  ok(`Ctrl+C : code 130, summary.json interrupted, fichier valide (${part.length}/400 parties)`, r.status === 130 && sum.interrupted === true && part.length > 0 && part.length < 400 && part.every((l) => { try { return JSON.parse(l).mode === 'selfplay'; } catch { return false; } }), `code ${r.status}`);
  const r2 = cli(args);
  const all = lines(f);
  ok('reprise après Ctrl+C : 400 parties, aucun doublon', r2.status === 0 && all.length === 400 && new Set(all.map((l) => JSON.parse(l).game)).size === 400, `${all.length} lignes`);
}

{
  // Évaluateur appris : learned:<fichier> (tables), identité = empreinte du CONTENU.
  const f = tdir('tables-v0.json');
  fs.writeFileSync(f, JSON.stringify({ format: 'x', ...v0Tables() }));
  const ev = resolveEvaluator(`learned:${f}`);
  ok('learned:<fichier> : évaluateur de type tables, empreinte de contenu', ev.kind === 'tables' && /^[0-9a-f]{10}$/.test(ev.id) && ev.label === 'learned-tables-v0');
  const f2 = tdir('tables-v0-reformate.json');
  fs.writeFileSync(f2, JSON.stringify({ man: v0Tables().man, king: v0Tables().king }, null, 4));
  ok('même contenu, mise en forme différente : même empreinte', resolveEvaluator(`learned:${f2}`).id === ev.id);
  const mod = v0Tables(); mod.man[20] += 1;
  fs.writeFileSync(tdir('tables-mod.json'), JSON.stringify(mod));
  ok('une seule valeur modifiée : autre empreinte', resolveEvaluator(`learned:${tdir('tables-mod.json')}`).id !== ev.id);
  let err = null; try { resolveEvaluator(`learned:${tdir('absent.json')}`); } catch (e) { err = e; }
  ok('fichier absent : erreur claire', err && /impossible de lire/.test(err.message));
  fs.writeFileSync(tdir('bad.json'), JSON.stringify({ man: [1, 2, 3], king: [] }));
  err = null; try { resolveEvaluator(`learned:${tdir('bad.json')}`); } catch (e) { err = e; }
  ok('tables invalides : erreur claire', err && /tables invalides/.test(err.message));

  // Les tables de V0 jouent EXACTEMENT comme V0 : mêmes parties, coup pour coup.
  const outA = tdir('lv-v0'), outB = tdir('lv-learned');
  const ra = cli(['match', '--a', 'v0', '--b', 'v0', '--depth', '3', '--pairs', '4', '--out', outA, '--workers', '2', '--probe-depth', '2', '--seed', '5', '--allow-sleep', '--progress-sec', '60']);
  const rb = cli(['match', '--a', 'v0', '--b', `learned:${f}`, '--depth', '3', '--pairs', '4', '--out', outB, '--workers', '2', '--probe-depth', '2', '--seed', '5', '--allow-sleep', '--progress-sec', '60']);
  const mv = (d) => lines(path.join(d, 'games.jsonl')).map((l) => { const o = JSON.parse(l); return `${o.pair}/${o.g}:${o.moves.join(' ')}:${o.result}`; }).sort().join('\n');
  ok('match v0 contre learned:(tables de V0) : mêmes 8 parties que v0 contre v0 (coup pour coup), 50 %', ra.status === 0 && rb.status === 0 && mv(outA) === mv(outB) && /Score de A : 50\.0 %/.test(rb.stdout), `codes ${ra.status}/${rb.status}`);
  ok('les tables sont sauvegardées dans le dossier du run', fs.existsSync(path.join(outB, 'tables-b.json')) && fs.existsSync(path.join(outB, 'weights-a.json')));
  // Identité du run : même chemin, contenu différent → refus de reprendre.
  fs.writeFileSync(f, JSON.stringify(mod));
  const rc = cli(['match', '--a', 'v0', '--b', `learned:${f}`, '--depth', '3', '--pairs', '6', '--out', outB, '--workers', '2', '--probe-depth', '2', '--seed', '5', '--allow-sleep', '--progress-sec', '60']);
  ok('même fichier de tables mais contenu modifié : le run existant n\'est pas repris (refus, rien écrasé)', rc.status === 2 && /autre run/.test(rc.stderr) && lines(path.join(outB, 'games.jsonl')).length === 8);
  const outC = tdir('sp-learned');
  const rd = cli(['selfplay', '--evaluator', `learned:${f}`, '--depth', '3', '--games', '3', '--out', outC, '--workers', '2', '--probe-depth', '2', '--seed', '5', '--allow-sleep', '--progress-sec', '60']);
  ok('selfplay avec learned: : 3 parties avec positions', rd.status === 0 && lines(path.join(outC, 'games.jsonl')).length === 3 && JSON.parse(lines(path.join(outC, 'games.jsonl'))[0]).p.length > 0, `code ${rd.status}`);
}

fs.rmSync(tmp, { recursive: true, force: true });
// L'arène écrit son journal dans training/logs/<nom du dossier de sortie>.log : on retire ceux créés par ces tests.
for (const n of usedNames) {
  const f = path.join(here, '..', 'training', 'logs', `${n}.log`);
  try { if (fs.existsSync(f) && fs.statSync(f).mtimeMs >= testStart) fs.rmSync(f); } catch { /* sans importance */ }
}
console.log(failures === 0 ? '\nRÉSULTAT : tout concorde.' : `\nRÉSULTAT : ${failures} échec(s).`);
process.exit(failures === 0 ? 0 : 1);
