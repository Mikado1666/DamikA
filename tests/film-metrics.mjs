// P31 — Film de la partie : formules partagées (js/analysis/film-metrics.js), rejeu et assemblage (film-game.js), cache (clé),
// runner avec un FAUX Worker. Le vrai WebAssembly ne se teste que dans un navigateur (section P31 de docs/SESSION_DERNIERE.md).
// La partie « 7 parties de P28 » recalcule tout avec le module à partir des positions mesurées en P28 et compare à
// training/scan-arena/out/p29/ (sorties de p29-report.mjs) ; ignorée si ces fichiers locaux sont absents.
//   node tests/film-metrics.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as M from '../js/analysis/film-metrics.js';
import { planGame, buildMoveRows, buildFilmGame, canonicalGameText, hubToLegal, applyLegal, fmjd, other, describePosition, resolveRecs } from '../js/analysis/film-game.js';
import { createFilmRunner, recFromSearch, FilmCancelled } from '../js/analysis/film-runner.js';
import { toHubPosition } from '../js/ai/scan-protocol.js';
import { initialBoard, generateLegalMoves, applyCaptureSequence, applySimpleMove } from '../js/engine/rules.js';

let failures = 0;
const ok = (label, cond, extra = '') => { if (!cond) failures++; console.log(`${cond ? 'OK ' : 'ERR'} ${label}${extra ? ' — ' + extra : ''}`); };
const here = path.dirname(fileURLToPath(import.meta.url));

// ---- A. formules ----
ok('A1 seuil : plancher 0,30', M.thresholdOf(0, 40) === 0.30);
ok('A2 seuil : 0,15·|V| (V = 4 → 0,60)', Math.abs(M.thresholdOf(4, 40) - 0.60) < 1e-12);
ok('A3 seuil : phase < 10 pièces → 1,2', M.thresholdOf(0.5, 8) === 1.2 && M.PHASE(9) === 1.2 && M.PHASE(10) === 0.45 && M.PHASE(16) === 0.35 && M.PHASE(22) === 0.2 && M.PHASE(30) === 0);
const flat = (v) => Array(14).fill(v);
// coup des Blancs qui perd 1,0 pion à toutes les profondeurs, position calme, 40 pièces : faute majeure ? seuil 0,3 → ratio 3,33 = faute
let r = M.classifyMove({ side: 'w', pieces: 40, same: false, scoresBefore: flat(0), scoresAfter: flat(-1) });
ok('A4 perte 1,0 en position égale : signalée, gravité « faute » (3,3 × le seuil)', r.signaled && r.gravite === 'faute' && r.L === 1 && r.thr === 0.3, JSON.stringify([r.gravite, r.ratio]));
r = M.classifyMove({ side: 'w', pieces: 40, same: false, scoresBefore: flat(0), scoresAfter: flat(-1.3) });
ok('A5 perte 1,3 : majeure (≥ 4 × 0,3)', r.gravite === 'majeure' && r.latence === 3 && r.type === 'faute de calcul');
r = M.classifyMove({ side: 'w', pieces: 40, same: false, scoresBefore: flat(0), scoresAfter: flat(-0.4) });
ok('A6 perte 0,4 : légère', r.gravite === 'légère');
r = M.classifyMove({ side: 'w', pieces: 40, same: false, scoresBefore: flat(0), scoresAfter: flat(-0.2) });
ok('A7 perte 0,2 < seuil : pas signalée', !r.candidate && !r.signaled);
r = M.classifyMove({ side: 'w', pieces: 40, same: true, scoresBefore: flat(0), scoresAfter: flat(-1) });
ok('A8 coup = meilleur coup de Scan : du « bruit », jamais une faute', r.bruit && !r.candidate && !r.signaled);
r = M.classifyMove({ side: 'w', pieces: 40, same: false, scoresBefore: flat(4), scoresAfter: flat(2.8) });
ok('A9 « largement gagnant » : 4 → 2,8 (≥ max(2 ; 2)) → candidate mais non signalée', r.candidate && r.largementGagnant && !r.signaled);
r = M.classifyMove({ side: 'w', pieces: 40, same: false, scoresBefore: flat(4), scoresAfter: flat(1.9) });
ok('A10 4 → 1,9 : le gagnant s\'est dégradé : signalée', r.signaled && !r.largementGagnant);
r = M.classifyMove({ side: 'b', pieces: 40, same: false, scoresBefore: flat(0), scoresAfter: flat(1) });
ok('A11 camp noir : un score qui monte pour les Blancs est une perte pour les Noirs', r.signaled && r.L === 1 && r.moverBefore === 0 && r.moverAfter === -1);
// latence : la perte n'apparaît qu'à la profondeur 9 (fenêtre (9,10) et suivantes) → piège profond
const deep = flat(0); const aft = flat(0); for (let d = 9; d <= 14; d++) aft[d - 1] = -1;
r = M.classifyMove({ side: 'w', pieces: 40, same: false, scoresBefore: deep, scoresAfter: aft });
ok('A12 perte visible dès la profondeur 9 : latence 9, « piège profond »', r.latence === 9 && r.type === 'piège profond', `${r.latence} ${r.type}`);
const aft2 = flat(0); for (let d = 11; d <= 14; d++) aft2[d - 1] = -1; aft2[3] = -1; // un seul niveau bas isolé : instable
r = M.classifyMove({ side: 'w', pieces: 40, same: false, scoresBefore: deep, scoresAfter: aft2 });
ok('A13 perte qui n\'apparaît qu\'à 11-14 : latence 11', r.latence === 11, String(r.latence));
const aft3 = flat(0); aft3[13] = -1; aft3[12] = -1; aft3[11] = 0; aft3[10] = -1; // la fenêtre (11,12) n'est pas stable
r = M.classifyMove({ side: 'w', pieces: 40, same: false, scoresBefore: deep, scoresAfter: aft3 });
ok('A14 aucune fenêtre stable : « instable »', r.signaled === true && r.type === 'instable' && r.latence === null, `${r.type}`);
// scores par profondeur
let sd = M.scoresFromDepths({ 3: 0.3, 5: 0.5 });
ok('A15 profondeurs manquantes : reprise de la dernière valeur, début = première disponible', sd.scores[0] === 0.3 && sd.scores[2] === 0.3 && sd.scores[3] === 0.3 && sd.scores[4] === 0.5 && sd.scores[13] === 0.5 && sd.missing === 2 + 1 + 9, JSON.stringify(sd.scores));
ok('A16 aucune ligne info → null', M.scoresFromDepths({}) === null);
ok('A17 plafond : table/mat = ±15, score normal inchangé', M.capPawns(30, true) === 15 && M.capPawns(-15, true) === -15 && M.capPawns(2.3, false) === 2.3);
ok('A18 V = moyenne des profondeurs 11 à 14', M.positionValue([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 2, 3, 4]) === 2.5);
// courbe : les fautes de gravité faute / majeure ne comptent pas, les légères oui
const rows = [
  { ply: 0, side: 'w', L: 0.4, signaled: true, gravite: 'légère' }, { ply: 1, side: 'b', L: 2, signaled: true, gravite: 'majeure' },
  { ply: 2, side: 'w', L: 0.1, signaled: false }, { ply: 3, side: 'b', skipped: 'forcé' }, { ply: 4, side: 'w', pending: true }, { ply: 5, side: 'b', L: 1, signaled: false },
];
const cv = M.erosionCurve(rows);
ok('A19 érosion : cumul des légères et des petites pertes ; fautes exclues ; arrêt à la première ligne en attente', JSON.stringify(cv) === JSON.stringify([[0, 0.4, 0], [1, 0.4, 0], [2, 0.5, 0], [3, 0.5, 0]]), JSON.stringify(cv));
ok('A20 constantes de version', Number.isInteger(M.METRICS_VERSION) && M.DEPTH_REF === 14 && M.DEPTH_FROM === 11 && M.MIN_PLIES === 10 && M.CAP === 15);

// ---- B. partie, plan, lignes ----
// 10 demi-coups légaux choisis de façon déterministe avec rules.js
function sampleGame(n) {
  let board = initialBoard(), side = 'w'; const out = [];
  for (let k = 0; k < n; k++) {
    const { captures, simples } = generateLegalMoves(board, side);
    if (captures.length) { const c = captures[k % captures.length]; out.push(`${c[0].from}x${c[c.length - 1].to}`); board = applyCaptureSequence(board, board[c[0].from], c).board; }
    else { const m = simples[(k * 3) % simples.length]; out.push(`${m.from}-${m.to}`); board = applySimpleMove(board, board[m.from], m).board; }
    side = side === 'w' ? 'b' : 'w';
  }
  return out;
}
const moves = sampleGame(10);
ok('B1 canonique : sans symbole ni pièces prises', canonicalGameText(['32-28!', '18-23?', '28x19/23.24']) === '32-28 18-23 28x19');
const plan = planGame(moves);
ok('B2 plan : 10 demi-coups, 11 positions', plan.ok && plan.plies.length === 10 && plan.positions.length === 11);
ok('B3 plan : partie illégale refusée avec un message', !planGame(['32-28', '32-28']).ok && /illégal/.test(planGame(['32-28', '32-28']).error));
const d0 = describePosition(plan.positions[0]);
ok('B4 position de départ : recherche nécessaire (null)', d0 === null);
ok('B5 position sans coup : perdue, ±15', (() => { const b = Array(51).fill(null); b[1] = { color: 'w', king: false }; const d = describePosition({ board: b, side: 'b' }); return d.terminal && d.scores[0] === 15 && d.pieces === 1; })());
ok('B6 peu de pièces : écartée (finale ≤ 6 pièces)', (() => { const b = Array(51).fill(null); b[40] = { color: 'w', king: true }; b[3] = { color: 'b', king: true }; const d = describePosition({ board: b, side: 'w' }); return d && d.skipped === 'finale ≤ 6 pièces'; })());
// enregistrements fictifs : un score plat, meilleur coup = coup joué pour les 4 premiers demi-coups
const fake = plan.positions.map((p, i) => ({ scores: flat(i === 5 ? -1 : 0), best: null, bestPos: i < 4 ? plan.plies[i].afterHub : null, pieces: 40 }));
let g = buildFilmGame(plan, fake, { blancs: 'X' });
ok('B7 film : 10 demi-coups classés, courbe de 10 points', g.done === 10 && g.courbe.length === 10 && g.rows.every((x) => !x.pending && !x.skipped));
ok('B8 la perte de 1 pion du coup 4 (avant la position 5) est la plus grosse perte des Blancs ou des Noirs', (g.top.w.length + g.top.b.length) > 0 && Math.max(...[...g.top.w, ...g.top.b].map((l) => l.L)) === 1);
g = buildFilmGame(plan, fake.slice(0, 4), {});
ok('B9 film partiel : lignes en attente, courbe plus courte', g.done === 3 && g.courbe.length === 3 && g.rows[3].pending && g.rows[9].pending);
// coup forcé : la valeur vient de la position suivante
const rf = resolveRecs([{ forced: true, forcedMove: '1-2', forcedPos: 'x' }, { scores: flat(0.7), pieces: 30 }]);
ok('B10 coup forcé : scores repris de la position suivante', rf[0].scores[0] === 0.7 && rf[0].derived === true);

// ---- C. 7 parties de P28 : le module reproduit p29-report ----
const P28 = path.join(here, '..', 'training', 'scan-arena', 'out', 'p28'), P29 = path.join(here, '..', 'training', 'scan-arena', 'out', 'p29');
if (fs.existsSync(path.join(P29, 'moves.jsonl')) && fs.existsSync(path.join(P28, 'run-A', 'positions.jsonl'))) {
  const readL = (f) => fs.readFileSync(f, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));
  const gm = JSON.parse(fs.readFileSync(path.join(P28, 'run-A', 'games.json'), 'utf8'));
  const pos = readL(path.join(P28, 'run-A', 'positions.jsonl'));
  const ref = readL(path.join(P29, 'moves.jsonl'));
  const film = JSON.parse(fs.readFileSync(path.join(P29, 'film.json'), 'utf8'));
  let games = 0, moves28 = 0, diffs = 0, diffCurve = 0, diffTop = 0, diffV = 0, first = '';
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  for (const gg of gm.games.filter((x) => x.set === 'A')) {
    const plan2 = planGame(gg.moves);
    if (!plan2.ok) { ok(`C0 ${gg.id} rejouable`, false, plan2.error); continue; }
    const byI = new Map(pos.filter((p) => p.game === gg.id).map((p) => [p.i, p]));
    const recs = plan2.positions.map((p, i) => {
      const q = byI.get(i); if (!q) return { pieces: 0, skipped: 'sans valeur' }; // position non mesurée en P28 (partie de 2 demi-coups)
      const rec = { pieces: q.pieces };
      if (q.scores) rec.scores = q.scores;
      if (q.terminal) rec.terminal = true;
      if (q.skipped) rec.skipped = q.skipped;
      if (q.forced) { rec.forced = true; rec.forcedMove = q.forcedMove; }
      if (q.best && !q.forced) {
        const legal = hubToLegal(p.board, p.side, q.best);
        if (legal) { rec.best = fmjd(legal); rec.bestPos = toHubPosition(applyLegal(p.board, p.side, legal), other(p.side)); } else rec.best = q.best;
      }
      return rec;
    });
    const gf = buildFilmGame(plan2, recs, {});
    games++;
    const refRows = ref.filter((x) => x.game === gg.id);
    for (const row of gf.rows) {
      const o = refRows[row.ply]; moves28++;
      const keys = ['L', 'thr', 'ratio', 'moverBefore', 'moverAfter', 'candidate', 'bruit', 'largementGagnant', 'signaled', 'gravite', 'latence', 'type', 'best', 'same', 'pieces'];
      const bad = !!o.skipped !== !!row.skipped || (!o.skipped && keys.some((k) => !same(o[k], row[k])));
      if (bad) { diffs++; if (!first) first = `${gg.id} coup ${row.ply}: ${JSON.stringify(keys.filter((k) => !same(o[k], row[k])))}`; }
    }
    const fp = film.parties.find((x) => x.id === gg.id);
    if (!same(fp.courbe, gf.courbe)) diffCurve++;
    if (!same(fp.top, gf.top)) diffTop++;
    if (!same(fp.V, gf.V)) diffV++;
  }
  ok(`C1 ${games} parties de P28 rejouées par le module`, games === 7);
  ok(`C2 ${moves28} coups : classement identique à p29-report (L, seuil, gravité, latence, type, meilleur coup)`, diffs === 0, first || '0 écart');
  ok('C3 courbes d\'érosion identiques à film.json', diffCurve === 0);
  ok('C4 trois plus grosses pertes par camp identiques à film.json', diffTop === 0);
  ok('C5 valeurs V par position identiques à film.json', diffV === 0);
} else console.log('SKIP C : out/p28 et out/p29 absents (fichiers locaux ignorés par git)');

// ---- D. runner avec un faux Worker ----
function fakeWorkerFactory(script) {
  return () => {
    const w = { onmessage: null, onerror: null, terminated: false, sent: [] };
    w.postMessage = (msg) => {
      w.sent.push(msg);
      setTimeout(() => {
        if (w.terminated) return;
        const pos = msg.position;
        const out = script(pos, msg);
        for (const info of out.infos) w.onmessage({ data: { id: msg.id, type: 'progress', ok: true, result: info } });
        w.onmessage({ data: { id: msg.id, ok: true, result: out.final } });
      }, 0);
    };
    w.terminate = () => { w.terminated = true; };
    return w;
  };
}
const infoOf = (depth, cp) => ({ depth, score: cp, mate: null, tablebase: false });
const firstLegal = (pos) => { const { captures, simples } = generateLegalMoves(pos.board, pos.side); return captures.length ? captures[0] : simples[0]; };
{
  const plan3 = planGame(moves);
  let created;
  const factory = () => { created = fakeWorkerFactory((pos) => ({ infos: [1, 2, 3, 11, 12, 13, 14].map((d) => infoOf(d, d * 10)), final: { ...infoOf(14, 140), bestMove: firstLegal(pos), nodes: 1000 } }))(); return created; };
  const runner = createFilmRunner({ createWorker: factory });
  const recs = [];
  const seen = [];
  const stats = await runner.run({ plan: plan3, recs, onRec: async (i) => { seen.push(i); } });
  const need = plan3.positions.map((p) => !describePosition(p));
  ok('D1 runner : 11 positions mesurées, une recherche seulement pour celles qui en demandent', recs.length === 11 && recs.every(Boolean) && stats.searched === need.filter(Boolean).length && seen.length === 11, `${stats.searched} recherches`);
  ok('D2 runner : demande profondeur 14, new-game, sans limite de temps réelle', created.sent[0].options.maxDepth === 14 && created.sent[0].options.newGame === true && created.sent[0].options.maxTimeMs >= 3600000);
  ok('D3 scores par profondeur : 11 à 14 lus, début repris', recs[0].scores[10] === 1.1 && recs[0].scores[13] === 1.4 && recs[0].scores[0] === 0.1, JSON.stringify(recs[0].scores));
  ok('D4 meilleur coup converti : notation et position Hub', recs[0].best === (() => { const m = firstLegal(plan3.positions[0]); return Array.isArray(m) ? `${m[0].from}x${m[m.length - 1].to}` : `${m.from}-${m.to}`; })() && /^[WB][ewbWB]{50}$/.test(recs[0].bestPos));
  // reprise : positions déjà connues non refaites
  const recs2 = recs.slice(0, 4); const factory2 = () => (created = fakeWorkerFactory((pos) => ({ infos: [], final: { ...infoOf(14, 0), bestMove: firstLegal(pos) } }))());
  const runner2 = createFilmRunner({ createWorker: factory2 });
  const st2 = await runner2.run({ plan: plan3, recs: recs2 });
  const need2 = need.slice(4).filter(Boolean).length;
  ok('D5 reprise : seules les positions manquantes sont recherchées', st2.searched === need2 && created.sent.length === need2, `${st2.searched} sur ${need2}`);
  // annulation : le Worker est terminé, FilmCancelled
  const factory3 = () => (created = fakeWorkerFactory((pos) => ({ infos: [], final: { ...infoOf(14, 0), bestMove: firstLegal(pos) } }))());
  const runner3 = createFilmRunner({ createWorker: factory3 });
  const recs3 = [];
  let cancelled = false;
  try { await runner3.run({ plan: plan3, recs: recs3, onRec: async (i) => { if (i === 2) runner3.cancel(); } }); } catch (e) { cancelled = e instanceof FilmCancelled; }
  ok('D6 annulation : FilmCancelled, Worker terminé, positions déjà faites conservées', cancelled && created.terminated && recs3.length === 3, `${recs3.length} positions`);
  // erreur du Worker
  const factory4 = () => { const w = { sent: [] }; w.postMessage = (m) => { setTimeout(() => w.onmessage({ data: { id: m.id, ok: false, error: 'WebAssembly indisponible' } }), 0); }; w.terminate = () => {}; return w; };
  let err = '';
  try { await createFilmRunner({ createWorker: factory4 }).run({ plan: plan3, recs: [] }); } catch (e) { err = e.message; }
  ok('D7 erreur de Scan : message transmis', err === 'WebAssembly indisponible', err);
  // mat / table : plafonné
  const factory5 = fakeWorkerFactory((pos) => ({ infos: [{ depth: 14, score: 3000, mate: { winner: 'w', in: 3 }, tablebase: false }], final: { depth: 14, score: 3000, mate: { winner: 'w', in: 3 }, tablebase: false, bestMove: firstLegal(pos) } }));
  const recs5 = []; await createFilmRunner({ createWorker: factory5 }).run({ plan: planGame(moves), recs: recs5 });
  ok('D8 mat vu par Scan : score plafonné à +15', recs5[0].scores[13] === 15);
  ok('D9 recFromSearch : coup de rafle (tableau) accepté', (() => {
    const b = Array(51).fill(null); b[28] = { color: 'w', king: false }; b[23] = { color: 'b', king: false }; b[45] = { color: 'w', king: false }; b[3] = { color: 'b', king: false };
    const legal = hubToLegal(b, 'w', '28x19x23'); if (!legal) return false;
    const rec = recFromSearch({ board: b, side: 'w' }, 4, { 14: 0.2 }, { bestMove: legal.seq }); return rec.best === '28x19' && /^[WB]/.test(rec.bestPos); })());
}

// ---- E. P41 : échelle de la courbe, phases, tournant (affichage seulement) ----
ok('E1 échelle : y(0) = 0, y(1,5) = 0,5, antisymétrique, bornée par 1', M.evalY(0) === 0 && M.evalY(1.5) === 0.5 && M.evalY(-2) === -M.evalY(2) && Math.abs(M.evalY(15)) < 1);
ok('E2 échelle : les petits écarts restent lisibles (0,5 pion → 0,25 ; 2 pions → 0,57)', Math.abs(M.evalY(0.5) - 0.25) < 1e-12 && Math.abs(M.evalY(2) - 4 / 7) < 1e-12);
ok('E3 phases : 30+ ouverture, 20 à 29 milieu, < 20 finale', M.phaseName(40) === 'ouverture' && M.phaseName(30) === 'ouverture' && M.phaseName(29) === 'milieu' && M.phaseName(20) === 'milieu' && M.phaseName(19) === 'finale');
const seg = M.phaseSegments([40, 38, 30, 29, 25, null, 19, 12]);
ok('E4 segments de phases (une position inconnue interrompt)', JSON.stringify(seg) === JSON.stringify([{ phase: 'ouverture', from: 0, to: 2 }, { phase: 'milieu', from: 3, to: 4 }, { phase: 'finale', from: 6, to: 7 }]), JSON.stringify(seg));
const row = (ply, side, gravite, extra = {}) => ({ ply, moveNo: Math.floor(ply / 2) + 1, side, played: '32-28', signaled: true, gravite, L: 1, ...extra });
let evals = [0, 0.1, 0.0, 0.2, -0.3, -1.2, -0.9, -2.0, -1.5];
let tp = M.turningPoint([row(2, 'b', 'légère'), row(4, 'w', 'faute'), row(6, 'w', 'majeure')], evals);
ok('E5 tournant : la PREMIÈRE faute après laquelle l\'avantage de l\'adversaire tient (légères ignorées)', tp && tp.ply === 4 && tp.gravite === 'faute', JSON.stringify(tp));
evals = [0, 0.1, 0.0, 0.2, -0.3, -1.2, 0.2, -2.0, -1.5];
tp = M.turningPoint([row(4, 'w', 'faute'), row(6, 'w', 'majeure')], evals);
ok('E6 tournant : si l\'avantage revient (position 6 à +0,2) la faute du ply 4 ne compte pas, celle du ply 6 oui', tp && tp.ply === 6, JSON.stringify(tp));
ok('E7 tournant : aucune faute ne répond → null (pas de repère)', M.turningPoint([row(4, 'w', 'faute')], [0, 0.1, 0.0, 0.2, -0.3, -1.2, 0.2, -2.0, 0.4]) === null && M.turningPoint([row(2, 'b', 'légère')], evals) === null && M.turningPoint([], evals) === null);
ok('E8 tournant : camp noir (l\'adversaire est les Blancs) ; seuil strict 0,5', M.turningPoint([row(3, 'b', 'majeure')], [0, 0, 0, 0, 0.6, 0.9, 0.7]).ply === 3 && M.turningPoint([row(3, 'b', 'majeure')], [0, 0, 0, 0, 0.5, 0.9, 0.7]) === null);
ok('E9 tournant : position non analysée ignorée, mais au moins une valeur exigée', M.turningPoint([row(4, 'w', 'faute')], [0, 0, 0, 0, 0, null, -1, null, -2]).ply === 4 && M.turningPoint([row(4, 'w', 'faute')], [0, 0, 0, 0, 0, null, null]) === null);
ok('E10 tournant : analyse incomplète (ligne en attente) → pas de tournant', M.turningPoint([row(4, 'w', 'faute'), { ply: 9, pending: true }], [0, 0, 0, 0, 0, -1, -1, -1, -1, -1]) === null);
ok('E11 aucune formule de mesure touchée : METRICS_VERSION = 1, seuils inchangés', M.METRICS_VERSION === 1 && M.FLOOR === 0.30 && M.K_V === 0.15);
{ // buildFilmGame : evals (n+1), fautes, échanges, phases cohérents sur une partie courte
  const mv = []; { let b = initialBoard(), sd = 'w'; for (let i = 0; i < 12; i++) { const { captures, simples } = generateLegalMoves(b, sd); const m = captures.length ? { kind: 'capture', seq: captures[0] } : { kind: 'simple', move: simples[0] }; mv.push(fmjd(m)); b = applyLegal(b, sd, m); sd = other(sd); } }
  const plan = planGame(mv); const g0 = buildFilmGame(plan, [], {});
  ok('E12 partie non mesurée : evals de n+1 valeurs toutes nulles, pas de faute, pas de tournant', g0.evals.length === 13 && g0.evals.every((v) => v === null) && g0.faults.length === 0 && g0.tournant === null && g0.phases.length === 0);
  ok('E13 échanges = coups avec prise (notation « x »)', JSON.stringify(g0.echanges) === JSON.stringify(plan.plies.filter((p) => p.played.includes('x')).map((p) => p.ply)));
}

console.log(failures ? `\n${failures} échec(s)` : '\nTout est vert.');
process.exit(failures ? 1 : 0);
