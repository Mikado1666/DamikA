// P25 — Scan 3.1 dans l'appli : fonctions pures du protocole Hub (js/ai/scan-protocol.js), enchaînement du Worker
// (js/ai/scan-worker.js, avec un FAUX moteur Hub : ordre des commandes, « la dernière demande gagne », terminal, arrêt
// par le temps) et contrôleur (js/ai/analysis-controller.js, moteur 'scan' : stop au lieu de terminate, phase loading).
// Le vrai WebAssembly n'est pas lancé ici (il ne tourne que dans un Worker de navigateur) : voir la section P25 de
// docs/SESSION_DERNIERE.md pour le test dans Chrome.
//   node tests/scan-protocol.mjs
import { DraughtsGame, initialBoard, generateLegalMoves } from '../js/engine/rules.js';
import {
  toHubPosition, matchLegal, parseInfo, parseDone, scoreFields, convertPv, buildResult, terminalResult, hubHistory,
  notationOf, TABLEBASE_WIN_CP,
} from '../js/ai/scan-protocol.js';
import { createScanSession, shouldStopForTime, SCAN_PARAMS } from '../js/ai/scan-worker.js';
import { createAnalysisController } from '../js/ai/analysis-controller.js';
import { formatMeta, SCAN_CREDIT } from '../js/ai/analysis-format.js';
import { ENGINES, DEFAULT_ENGINE, DEFAULT_ANALYSIS_ENGINE, isEngineId } from '../js/ai/engines.js';

let failures = 0;
const ok = (label, cond, extra = '') => { if (!cond) failures++; console.log(`${cond ? 'OK ' : 'ERR'} ${label}${extra ? ' — ' + extra : ''}`); };
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// --- position Hub -------------------------------------------------------------------------------------------------
const start = new DraughtsGame();
ok('A1 position de départ → chaîne Hub de 51 caractères', toHubPosition(start.board, 'w') === 'W' + 'b'.repeat(20) + 'e'.repeat(10) + 'w'.repeat(20));
ok('A2 camp noir → B', toHubPosition(start.board, 'b')[0] === 'B');
const kb = initialBoard(); kb[28] = { color: 'w', king: true }; kb[3] = { color: 'b', king: true };
const hk = toHubPosition(kb, 'w');
ok('A3 dames : W / B', hk[28] === 'W' && hk[3] === 'B' && hk.length === 51);
let threw = false; try { const bad = initialBoard(); bad[7] = { color: 'x', king: false }; toHubPosition(bad, 'w'); } catch { threw = true; }
ok('A4 pièce invalide → erreur avant envoi (jamais une chaîne Hub douteuse)', threw);

// --- coups : appariement avec rules.js ---------------------------------------------------------------------------
ok('B1 coup simple légal', matchLegal(start.board, 'w', '34-30')?.kind === 'simple');
ok('B2 coup simple illégal → null', matchLegal(start.board, 'w', '34-35') === null);
ok('B3 texte absurde → null', matchLegal(start.board, 'w', 'abc') === null && matchLegal(start.board, 'w', '') === null);
// Partie 3 de P20 : après 6...18-23, Scan joue 39-33.
const mv3 = '34-30 17-22 31-27 22x31 36x27 11-17 30-24 20x29 33x24 19x30 35x24 18-23'.split(' ');
const g3 = new DraughtsGame();
for (const m of mv3) {
  const st = m.split(/[-x]/).map(Number), L = g3.legalMoves;
  if (m.includes('x')) g3.playCaptureSequence(L.captures.find((s) => s[0].from === st[0] && s.at(-1).to === st.at(-1)));
  else g3.playSimpleMove(L.simples.find((x) => x.from === st[0] && x.to === st[1]));
}
ok('B4 partie 3 : chaîne Hub = celle de P20', toHubPosition(g3.board, g3.sideToMove) === 'Wbbbbbbbbbbebbbbbbeeeeebweeweeeeweeeewwwwwwwwwwwwww');
ok('B5 partie 3 : 39-33 et 40-34 légaux', matchLegal(g3.board, 'w', '39-33') && matchLegal(g3.board, 'w', '40-34'));
// Rafle : au premier coup de P20 (22x31) les Noirs prennent ; on cherche une rafle réelle dans la partie 3.
{
  const g = new DraughtsGame();
  const states = [];
  for (const m of mv3) {
    const st = m.split(/[-x]/).map(Number), L = g.legalMoves;
    if (m.includes('x')) {
      const seq = L.captures.find((s) => s[0].from === st[0] && s.at(-1).to === st.at(-1));
      const hub = `${seq[0].from}x${seq.at(-1).to}${seq.map((s) => 'x' + s.capturedThisStep).join('')}`;
      states.push({ board: g.board.map((p) => (p ? { ...p } : null)), side: g.sideToMove, hub, seq });
      g.playCaptureSequence(seq);
    } else g.playSimpleMove(L.simples.find((x) => x.from === st[0] && x.to === st[1]));
  }
  const s = states[0];
  const m = matchLegal(s.board, s.side, s.hub);
  ok(`B6 rafle « ${s.hub} » (départ x arrivée x pièces prises) reconnue`, m?.kind === 'capture' && m.seq.length === s.seq.length);
  ok('B7 rafle : notation d\'affichage départ×arrivée', notationOf(m) === `${s.seq[0].from}x${s.seq.at(-1).to}`);
  ok('B8 rafle avec une mauvaise pièce prise → null', matchLegal(s.board, s.side, s.hub.replace(/x\d+$/, 'x1')) === null);
  ok('B9 coup simple refusé quand une prise est obligatoire', matchLegal(s.board, s.side, '33-28') === null);
}

// --- lignes Hub ---------------------------------------------------------------------------------------------------
const info = parseInfo('info depth=19 mean-depth=17.5 score=-0.79 nodes=9374688 time=1.078 nps=8.7 pv="40-34 13-18 34-29 23x34x29 39x30"');
ok('C1 ligne info : profondeur, score, nœuds, temps', info.depth === 19 && info.score === -0.79 && info.nodes === 9374688 && info.timeS === 1.078);
ok('C2 ligne info : variante', eq(info.pv, ['40-34', '13-18', '34-29', '23x34x29', '39x30']));
ok('C3 lignes non info → null', parseInfo('done move=1-2') === null && parseInfo('info depth=3') === null && parseInfo(undefined) === null);
ok('C4 ligne done', eq(parseDone('done move=39-33 ponder=14-19'), { move: '39-33', ponder: '14-19' }) && parseDone('ready') === null);
ok('C5 info sans pv (coup forcé)', eq(parseInfo('info depth=1 score=0.10 nodes=5')?.pv, []));

// --- score --------------------------------------------------------------------------------------------------------
ok('D1 Blancs au trait +0,42 → +42', scoreFields(0.42, 'w').score === 42);
ok('D2 Noirs au trait +0,42 → −42 (point de vue des Blancs)', scoreFields(0.42, 'b').score === -42);
ok('D3 Noirs au trait −0,78 → +78', scoreFields(-0.78, 'b').score === 78);
{
  const m = scoreFields(99.97, 'w'); // win(ply 3) = 100 − 0,03 : les Blancs gagnent, 2 coups de Blancs
  ok('D4 99,97 Blancs au trait : mat des Blancs en 2', m.mate?.winner === 'w' && m.mate.in === 2);
  const l = scoreFields(-99.96, 'w'); // loss(ply 4) : les Noirs gagnent en 2
  ok('D5 −99,96 Blancs au trait : mat des Noirs en 2', l.mate?.winner === 'b' && l.mate.in === 2);
  const t = scoreFields(89.5, 'b');
  ok('D6 finale gagnée reconnue (89,5) : plafonnée, pas un mat', t.mate === null && t.tablebase && t.score === -TABLEBASE_WIN_CP);
}

// --- ligne principale / résultat ---------------------------------------------------------------------------------
{
  const conv = convertPv(g3.board, 'w', ['40-34', '13-18', '34-29', '23x34x29', '39x30']);
  ok('E1 variante rejouée et convertie (notation, coups d\'interface)', conv.pv.length === 5 && conv.pvNotation[3] === '23x34' && Array.isArray(conv.pv[3]));
  const bad = convertPv(g3.board, 'w', ['40-34', '13-18', '99-98', '1-2']);
  ok('E2 variante tronquée au premier coup illégal', bad.pv.length === 2);
  const r = buildResult({ board: g3.board, side: 'w' }, info, {});
  ok('E3 résultat au format de search.js', r.depth === 19 && r.bestMoveNotation === '40-34' && r.score === -79 && r.nps === Math.round(9374688 / 1.078) && r.stopped === false && r.drawRule === null);
  const illegal = buildResult({ board: g3.board, side: 'w' }, { ...info, pv: ['12-17'] }, {});
  ok('E4 coup de Scan illégal : jamais affiché (bestMove null)', illegal.bestMove === null && illegal.pv.length === 0);
  const t = terminalResult('w');
  ok('E5 partie terminée : mate.in = 0, perdue par le camp au trait', t.mate.in === 0 && t.mate.winner === 'b' && t.bestMove === null);
}

// --- historique pour les répétitions -----------------------------------------------------------------------------
{
  const b0 = Array(51).fill(null); b0[28] = { color: 'w', king: true }; b0[3] = { color: 'b', king: true };
  const mk = (b, from, to) => { const c = b.map((p) => (p ? { ...p } : null)); c[to] = c[from]; c[from] = null; return c; };
  const b1 = mk(b0, 28, 33), b2 = mk(b1, 3, 8);
  const h = hubHistory({ board: b2, side: 'w' }, { quiet: 2, positions: [{ board: b0, side: 'w' }, { board: b1, side: 'b' }] });
  ok('F1 historique : position de départ + coups de dame', h && h.moves === '28-33 3-8' && h.pos === toHubPosition(b0, 'w'), h && h.moves);
  ok('F2 pas d\'historique → null', hubHistory({ board: b2, side: 'w' }, null) === null && hubHistory({ board: b2, side: 'w' }, { quiet: 0, positions: [] }) === null);
  ok('F3 plateaux incohérents → null', hubHistory({ board: b2, side: 'w' }, { quiet: 1, positions: [{ board: b0, side: 'w' }] }) === null);
}

// --- contrôle du temps -------------------------------------------------------------------------------------------
ok('G1 temps écoulé → arrêt', shouldStopForTime(1500, 800, 1500));
ok('G2 itération suivante probablement trop longue → arrêt', shouldStopForTime(1080, 700, 1500)); // 1080 + 380 × 2,5 = 2030 > 1875
ok('G3 assez de temps → on continue', !shouldStopForTime(300, 200, 1500));
ok('G4 sans point de comparaison → on continue', !shouldStopForTime(600, 0, 1500));

// --- Worker : enchaînement avec un faux moteur Hub ---------------------------------------------------------------
function fakeEngine() {
  const log = [];
  let onLine = null;
  let searching = false;
  const api = {
    log,
    emit: (l) => onLine(l),
    async load(cb) {
      onLine = cb;
      return {
        send(cmd) {
          log.push(cmd);
          if (cmd === 'hub') { cb('id name=Scan version=3.1b author="Fabien Letouzey"'); cb('param name=tt-size value=22'); cb('wait'); }
          else if (cmd === 'init') cb('ready');
          else if (cmd === 'go analyze') { searching = true; api.onGo?.(); }
          else if (cmd === 'stop' && searching) { api.stopped = true; }
        },
      };
    },
    finish(move = '34-30') { searching = false; onLine(`done move=${move}`); },
  };
  return api;
}
{
  const eng = fakeEngine(); const out = [];
  const session = createScanSession({ loadEngine: eng.load, post: (m) => out.push(m) });
  const pos = { board: start.board, side: 'w' };
  await session.handle({ id: 1, type: 'analyse', position: pos, options: { maxDepth: 12, maxTimeMs: 100000 } });
  ok('H1 handshake : hub, paramètres AVANT init, init', eng.log[0] === 'hub' && eng.log.indexOf('init') > eng.log.indexOf(`set-param name=tt-size value=${SCAN_PARAMS['tt-size']}`) && eng.log.indexOf('init') > eng.log.indexOf(`set-param name=bb-size value=${SCAN_PARAMS['bb-size']}`), eng.log.slice(0, 5).join(' | '));
  ok('H2 messages d\'état : loading puis ready', out[0]?.status === 'loading' && out[1]?.status === 'ready' && /Scan/.test(out[1].engine));
  const posCmd = eng.log.find((c) => c.startsWith('pos '));
  ok('H3 position de 51 caractères validée, niveau par profondeur, go analyze', posCmd === `pos pos=${toHubPosition(start.board, 'w')}` && eng.log.includes('level depth=12') && eng.log.at(-1) === 'go analyze');
  eng.emit('info depth=3 mean-depth=3.0 score=0.00 nodes=100 time=0.010 pv="34-30 17-22"');
  eng.emit('info depth=4 mean-depth=4.0 score=0.05 nodes=300 time=0.020 pv="34-30 17-22 31-27"');
  const progress = out.filter((m) => m.type === 'progress');
  ok('H4 une progression par ligne info (id de la demande, format search.js)', progress.length === 2 && progress[1].id === 1 && progress[1].result.depth === 4 && progress[1].result.bestMoveNotation === '34-30');
  eng.finish('34-30');
  const fin = out.filter((m) => m.id === 1 && !m.type);
  ok('H5 résultat final à la ligne done', fin.length === 1 && fin[0].ok && fin[0].result.depth === 4 && fin[0].result.stopped === false);
  ok('H6 moteur libre après done', session.busy === false);
}
{
  // La dernière demande gagne : 1 en cours, 2 puis 3 arrivent → stop une fois, 1 jeté, 2 jeté (jamais lancé), 3 lancé après done.
  const eng = fakeEngine(); const out = [];
  const session = createScanSession({ loadEngine: eng.load, post: (m) => out.push(m) });
  const p1 = { board: start.board, side: 'w' };
  const p3 = { board: g3.board, side: 'w' };
  await session.handle({ id: 1, type: 'analyse', position: p1, options: { maxTimeMs: 100000 } });
  eng.emit('info depth=2 score=0.00 nodes=10 time=0.001 pv="34-30"');
  await session.handle({ id: 2, type: 'analyse', position: p1, options: { maxTimeMs: 100000 } });
  await session.handle({ id: 3, type: 'analyse', position: p3, options: { maxTimeMs: 100000 } });
  const stops = eng.log.filter((c) => c === 'stop').length;
  ok('I1 demande reçue pendant une recherche : UN seul stop', stops === 1);
  ok('I2 pas de nouvelle position avant le done de l\'ancienne', eng.log.filter((c) => c.startsWith('pos ')).length === 1);
  eng.finish('34-30');
  const posCmds = eng.log.filter((c) => c.startsWith('pos '));
  ok('I3 après done : la DERNIÈRE demande est lancée (la 2 est jetée)', posCmds.length === 2 && posCmds[1] === `pos pos=${toHubPosition(g3.board, 'w')}`);
  ok('I4 résultat de la recherche périmée jeté', !out.some((m) => m.id === 1 && !m.type && m.ok));
  eng.emit('info depth=5 score=-0.78 nodes=50 time=0.002 pv="39-33 14-19"');
  eng.finish('39-33');
  const fin = out.filter((m) => m.id === 3 && !m.type);
  ok('I5 la dernière demande a son résultat final', fin.length === 1 && fin[0].result.bestMoveNotation === '39-33');
}
{
  // Partie terminée : jamais soumise à Scan.
  const eng = fakeEngine(); const out = [];
  const session = createScanSession({ loadEngine: eng.load, post: (m) => out.push(m) });
  const b = Array(51).fill(null); b[28] = { color: 'w', king: false }; // Noirs sans pièce : sans coup
  await session.handle({ id: 1, type: 'analyse', position: { board: b, side: 'b' }, options: {} });
  const fin = out.find((m) => m.id === 1 && !m.type);
  ok('J1 camp sans coup : réponse « partie terminée » sans rien envoyer à Scan', fin?.result?.mate?.in === 0 && !eng.log.some((c) => c.startsWith('pos ') || c === 'go analyze'));
  await session.handle({ id: 2, type: 'analyse', position: { board: [], side: 'x' }, options: {} });
  ok('J2 position invalide : erreur claire', out.find((m) => m.id === 2)?.ok === false);
}
{
  // Échec de chargement : réponse d'erreur (le contrôleur déclenchera le repli).
  const out = [];
  const session = createScanSession({ loadEngine: async () => { throw new Error('scan.wasm introuvable'); }, post: (m) => out.push(m) });
  await session.handle({ id: 1, type: 'analyse', position: { board: start.board, side: 'w' }, options: {} });
  ok('K1 chargement impossible → { ok: false, error }', out.some((m) => m.id === 1 && m.ok === false && /introuvable/.test(m.error)));
  ok('K2 aucun message « ready »', !out.some((m) => m.status === 'ready'));
}
{
  // Arrêt par le temps : la 1re ligne info de chaque profondeur est horodatée ; on simule l'horloge.
  const eng = fakeEngine(); const out = [];
  let t = 0;
  const realNow = performance.now.bind(performance);
  performance.now = () => t;
  try {
    const session = createScanSession({ loadEngine: eng.load, post: (m) => out.push(m) });
    await session.handle({ id: 1, type: 'analyse', position: { board: start.board, side: 'w' }, options: { maxTimeMs: 1500, maxDepth: 40 } });
    t = 300; eng.emit('info depth=16 score=0.00 nodes=1 time=0.3 pv="34-30"');
    t = 700; eng.emit('info depth=17 score=0.00 nodes=1 time=0.7 pv="34-30"');
    ok('L1 itérations courtes : pas d\'arrêt', !eng.log.includes('stop'));
    t = 1080; eng.emit('info depth=18 score=0.00 nodes=1 time=1.08 pv="34-30"');
    ok('L2 la prochaine itération dépasserait le temps : stop envoyé tout de suite', eng.log.filter((c) => c === 'stop').length === 1);
    t = 1200; eng.emit('info depth=18 score=0.00 nodes=1 time=1.2 pv="34-30"');
    ok('L3 un seul stop par recherche', eng.log.filter((c) => c === 'stop').length === 1);
    eng.finish('34-30');
    const fin = out.find((m) => m.id === 1 && !m.type);
    ok('L4 arrêt par le temps : résultat normal (stopped = false)', fin?.ok && fin.result.stopped === false);
  } finally { performance.now = realNow; }
}

// --- Contrôleur : moteur 'scan' ----------------------------------------------------------------------------------
{
  const workers = [];
  const kinds = [];
  const events = [];
  const timers = [];
  const ctl = createAnalysisController({
    createWorker: (engine) => {
      kinds.push(engine);
      const w = { sent: [], terminated: false, postMessage(m) { this.sent.push(m); }, terminate() { this.terminated = true; }, reply(d) { this.onmessage({ data: d }); } };
      workers.push(w); return w;
    },
    onChange: (e) => events.push(e),
    engine: 'scan',
    setTimer: (fn) => { timers.push(fn); return timers.length; }, clearTimer: () => {},
  });
  const pos = { board: start.board, side: 'w' };
  ctl.enable();
  ok('M1 moteur scan : Worker créé avec le nom du moteur', eq(kinds, ['scan']));
  workers[0].reply({ type: 'status', status: 'loading' });
  ok('M2 message loading → phase loading', events.at(-1).phase === 'loading');
  ctl.request(pos);
  ok('M3 pendant le chargement, une nouvelle position reste en phase loading', events.at(-1).phase === 'loading');
  workers[0].reply({ type: 'status', status: 'ready', engine: 'Scan 3.1b' });
  timers.shift()();
  const sent = workers[0].sent.at(-1);
  ok('M4 demande envoyée avec options de temps et profondeur', sent.type === 'analyse' && sent.options.maxTimeMs === 1500 && sent.options.maxDepth === 24 && sent.options.engine === 'scan');
  workers[0].reply({ id: sent.id, type: 'progress', ok: true, result: { depth: 3, score: 0 } });
  ok('M5 progression → phase thinking', events.at(-1).phase === 'thinking');
  ctl.request({ board: g3.board, side: 'w' });
  ok('M6 nouvelle position pendant l\'analyse : stop, PAS de terminate (Scan reste chargé)', workers.length === 1 && !workers[0].terminated && eq(workers[0].sent.at(-1), { type: 'stop' }));
  workers[0].reply({ id: sent.id, ok: true, result: { depth: 9 } });
  ok('M7 réponse de l\'ancienne demande ignorée', events.at(-1).phase !== 'done');
  timers.shift()();
  const sent2 = workers[0].sent.at(-1);
  workers[0].reply({ id: sent2.id, ok: true, result: { depth: 12, score: -78 } });
  ok('M8 réponse de la nouvelle demande → done', events.at(-1).phase === 'done' && events.at(-1).result.depth === 12);
  ctl.setEngine('v0');
  ok('M9 passage à un moteur JS : le Worker de Scan est détruit', workers[0].terminated === true);
  ctl.request({ board: start.board, side: 'w' }); timers.shift()();
  ok('M10 nouveau Worker (moteur JS) créé au prochain envoi', eq(kinds, ['scan', 'v0']) && workers.length === 2 && workers[1].sent.at(-1).type === 'analyse');
  ctl.disable();
}
{
  // Échec de Scan signalé par le Worker : phase error (main.js bascule alors sur V0).
  const events = []; const timers = []; let w;
  const ctl = createAnalysisController({
    createWorker: () => (w = { sent: [], postMessage(m) { this.sent.push(m); }, terminate() {}, reply(d) { this.onmessage({ data: d }); } }),
    onChange: (e) => events.push(e), engine: 'scan', setTimer: (fn) => { timers.push(fn); return 1; }, clearTimer: () => {},
  });
  ctl.enable(); ctl.request({ board: start.board, side: 'w' }); timers.shift()();
  w.reply({ id: w.sent.at(-1).id, ok: false, error: 'scan.wasm introuvable' });
  ok('N1 échec du moteur : phase error avec le message', events.at(-1).phase === 'error' && /introuvable/.test(events.at(-1).error));
}

// --- Réglages et mentions ----------------------------------------------------------------------------------------
ok('O1 Scan est le moteur d\'analyse par défaut, V0 reste le repli', DEFAULT_ANALYSIS_ENGINE === 'scan' && DEFAULT_ENGINE === 'v0' && isEngineId('scan') && isEngineId('v0') && isEngineId('v1b') && isEngineId('v2b'));
ok('O2 nom complet de Scan dans le menu des moteurs', /Scan 3\.1/.test(ENGINES.scan.label) && /Fabien Letouzey/.test(ENGINES.scan.label));
ok('O3 ligne d\'analyse : « Moteur : Scan 3.1 par Fabien Letouzey · profondeur N · WebAssembly »',
  formatMeta({ depth: 12, mate: null }, ENGINES.scan.short, 'scan') === 'Moteur : Scan 3.1 par Fabien Letouzey · profondeur 12 · WebAssembly' && SCAN_CREDIT === 'Moteur : Scan 3.1 par Fabien Letouzey');
ok('O4 autres moteurs : texte d\'avant inchangé', formatMeta({ depth: 9, mate: null }) === 'Évaluation indicative · profondeur 9' && formatMeta({ depth: 9, mate: null }, 'V1b', 'v1b') === 'Évaluation indicative · profondeur 9 · moteur V1b');
ok('O5 partie terminée : pas de mention', formatMeta({ depth: 0, mate: { winner: 'b', in: 0 } }, 'Scan 3.1', 'scan') === '');
void generateLegalMoves;

console.log(failures === 0 ? 'RÉSULTAT : tout concorde.' : `RÉSULTAT : ${failures} échec(s).`);
process.exit(failures === 0 ? 0 : 1);
