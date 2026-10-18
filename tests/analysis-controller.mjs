// Cycle de vie de l'analyse (js/ai/analysis-controller.js) avec un FAUX Worker et des minuteries
// simulées : debounce, remplacement, terminate() si analyse en cours, réponses périmées ignorées,
// position identique ignorée, destruction à la désactivation, erreurs.
import { createAnalysisController } from '../js/ai/analysis-controller.js';
import { FastBoard } from '../js/ai/fastboard.js';

let failures = 0;
const ok = (label, cond, extra = '') => { if (!cond) failures++; console.log(`${cond ? 'OK ' : 'ERR'} ${label}${extra ? ' — ' + extra : ''}`); };

// Minuteries simulées.
function makeClock() {
  let now = 0, nextId = 1;
  const timers = new Map();
  return {
    setTimer: (fn, ms) => { const id = nextId++; timers.set(id, { at: now + ms, fn }); return id; },
    clearTimer: (id) => { timers.delete(id); },
    advance(ms) {
      const end = now + ms;
      for (;;) {
        const due = [...timers.entries()].filter(([, t]) => t.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
        if (!due) break;
        now = due[1].at; timers.delete(due[0]); due[1].fn();
      }
      now = end;
    },
    pending: () => timers.size,
  };
}

// Faux Worker : enregistre les messages, permet de simuler des réponses.
function makeHarness(opts = {}) {
  const clock = makeClock();
  const workers = [];
  const events = [];
  const createWorker = () => {
    const w = {
      sent: [], terminated: false, onmessage: null, onerror: null,
      postMessage(m) { this.sent.push(m); },
      terminate() { this.terminated = true; },
      reply(data) { if (!this.terminated && this.onmessage) this.onmessage({ data }); },
    };
    workers.push(w);
    return w;
  };
  const ctl = createAnalysisController({
    createWorker, onChange: (s) => events.push(s), setTimer: clock.setTimer, clearTimer: clock.clearTimer, ...opts,
  });
  return { ctl, clock, workers, events };
}

const fb = FastBoard.initial();
const posA = { board: fb.toUiBoard(), side: 'w' };
const moves = fb.generateMoves();
fb.makeMove(moves[0]);
const posB = { board: fb.toUiBoard(), side: 'b' };
fb.makeMove(fb.generateMoves()[0]);
const posC = { board: fb.toUiBoard(), side: 'w' };
const res = (depth) => ({ score: depth, mate: null, bestMove: { from: 1, to: 2 }, depth });

// 1. Désactivé : aucune action.
{
  const h = makeHarness();
  h.ctl.request(posA);
  h.clock.advance(1000);
  ok('1 désactivé : aucun Worker créé, aucun message', h.workers.length === 0 && h.events.length === 0);
}
// 2. Activation : un Worker créé ; requête : envoi après le debounce seulement.
{
  const h = makeHarness();
  h.ctl.enable();
  ok('2 activation : un seul Worker créé', h.workers.length === 1 && h.events.at(-1).phase === 'waiting');
  h.ctl.request(posA);
  h.clock.advance(149);
  ok('2 debounce : rien envoyé à 149 ms', h.workers[0].sent.length === 0);
  h.clock.advance(1);
  const m = h.workers[0].sent[0];
  ok('2 debounce : envoyé à 150 ms, type analyse, limites 1,5 s / profondeur 24', h.workers[0].sent.length === 1 && m.type === 'analyse' && m.options.maxTimeMs === 1500 && m.options.maxDepth === 24);
  ok('2 la position envoyée est celle demandée (copie)', m.position.side === 'w' && m.position.board.length === 51 && m.position.board[1].color === 'b');
}
// 3. Progression puis résultat final.
{
  const h = makeHarness();
  h.ctl.enable(); h.ctl.request(posA); h.clock.advance(150);
  const id = h.workers[0].sent[0].id;
  h.workers[0].reply({ id, type: 'progress', ok: true, result: res(1) });
  h.workers[0].reply({ id, type: 'progress', ok: true, result: res(2) });
  h.workers[0].reply({ id, ok: true, result: res(9) });
  const phases = h.events.map((e) => e.phase);
  ok('3 phases : waiting, waiting, thinking, thinking, done', phases.join() === 'waiting,waiting,thinking,thinking,done', phases.join());
  ok('3 le résultat final est transmis', h.events.at(-1).result.depth === 9);
}
// 4. Même position : rien de relancé (sélection d'une pièce, etc.).
{
  const h = makeHarness();
  h.ctl.enable(); h.ctl.request(posA); h.clock.advance(150);
  const n = h.events.length;
  h.ctl.request({ board: fb.toUiBoard().map(() => null), side: 'w' }); // autre position → part
  h.clock.advance(0);
  h.ctl.request(posA); // revient
  ok('4 position différente puis retour : traitées', h.events.length > n);
  const h2 = makeHarness();
  h2.ctl.enable(); h2.ctl.request(posA); h2.clock.advance(150);
  const evCount = h2.events.length, sentCount = h2.workers[0].sent.length;
  h2.ctl.request({ board: posA.board.map((p) => (p ? { ...p } : null)), side: 'w' });
  h2.clock.advance(1000);
  ok('4 position identique (autre objet) : aucun événement, aucun envoi', h2.events.length === evCount && h2.workers[0].sent.length === sentCount);
}
// 5. Changement rapide de position pendant le debounce : une seule requête, la dernière.
{
  const h = makeHarness();
  h.ctl.enable();
  h.ctl.request(posA); h.clock.advance(50);
  h.ctl.request(posB); h.clock.advance(50);
  h.ctl.request(posC); h.clock.advance(150);
  const sent = h.workers[0].sent;
  ok('5 rafale : une seule requête envoyée, pour la dernière position', sent.length === 1 && sent[0].position.side === 'w' && h.workers.length === 1);
  ok('5 rafale : aucun terminate (rien n\'était en cours)', !h.workers[0].terminated);
}
// 6. Changement de position pendant une analyse EN COURS : terminate puis nouveau Worker.
{
  const h = makeHarness();
  h.ctl.enable(); h.ctl.request(posA); h.clock.advance(150);
  const w1 = h.workers[0], id1 = w1.sent[0].id;
  w1.reply({ id: id1, type: 'progress', ok: true, result: res(3) });
  h.ctl.request(posB);
  ok('6 analyse en cours : ancien Worker terminé immédiatement', w1.terminated);
  w1.reply({ id: id1, ok: true, result: res(10) }); // réponse tardive : doit être ignorée
  ok('6 réponse tardive de l\'ancien Worker ignorée', h.events.at(-1).phase === 'waiting');
  h.clock.advance(150);
  ok('6 nouveau Worker créé et requête envoyée', h.workers.length === 2 && h.workers[1].sent.length === 1 && h.workers[1].sent[0].position.side === 'b' && h.workers[1].sent[0].id !== id1);
  ok('6 jamais deux Workers vivants', h.workers.filter((w) => !w.terminated).length === 1);
}
// 7. Analyse terminée : pas de terminate au changement suivant (Worker réutilisé).
{
  const h = makeHarness();
  h.ctl.enable(); h.ctl.request(posA); h.clock.advance(150);
  const w1 = h.workers[0];
  w1.reply({ id: w1.sent[0].id, ok: true, result: res(12) });
  h.ctl.request(posB); h.clock.advance(150);
  ok('7 analyse déjà finie : même Worker réutilisé, sans terminate', h.workers.length === 1 && !w1.terminated && w1.sent.length === 2);
}
// 8. Réponse d'une requête périmée (même Worker) ignorée.
{
  const h = makeHarness();
  h.ctl.enable(); h.ctl.request(posA); h.clock.advance(150);
  const w = h.workers[0];
  const idOld = w.sent[0].id;
  w.reply({ id: idOld, ok: true, result: res(12) });
  h.ctl.request(posB); h.clock.advance(150);
  const n = h.events.length;
  w.reply({ id: idOld, type: 'progress', ok: true, result: res(5) });
  ok('8 identifiant périmé : ignoré', h.events.length === n);
  w.reply({ id: w.sent[1].id, type: 'progress', ok: true, result: res(4) });
  ok('8 identifiant courant : pris en compte', h.events.length === n + 1 && h.events.at(-1).phase === 'thinking');
}
// 9. Désactivation : Worker détruit, minuteur annulé, plus rien ne part.
{
  const h = makeHarness();
  h.ctl.enable(); h.ctl.request(posA);
  h.ctl.disable();
  ok('9 désactivation pendant le debounce : Worker détruit, minuteur annulé', h.workers[0].terminated && h.clock.pending() === 0 && h.events.at(-1).phase === 'off');
  h.clock.advance(1000);
  ok('9 rien envoyé après désactivation', h.workers[0].sent.length === 0);
  h.ctl.request(posB); h.clock.advance(1000);
  ok('9 requête après désactivation : ignorée', h.workers.length === 1 && h.workers[0].sent.length === 0);
  // Réactivation : nouveau Worker, et la même position est de nouveau analysée.
  h.ctl.enable(); h.ctl.request(posA); h.clock.advance(150);
  ok('9 réactivation : nouveau Worker, analyse relancée', h.workers.length === 2 && h.workers[1].sent.length === 1);
  h.ctl.disable();
  ok('9 désactivation : ne reste aucun Worker vivant', h.workers.every((w) => w.terminated));
}
// 10. Erreurs.
{
  const h = makeHarness();
  h.ctl.enable(); h.ctl.request(posA); h.clock.advance(150);
  const w = h.workers[0];
  w.reply({ id: w.sent[0].id, ok: false, error: 'boum' });
  ok('10 erreur renvoyée par le Worker : phase error', h.events.at(-1).phase === 'error');
  const h2 = makeHarness();
  h2.ctl.enable(); h2.ctl.request(posA); h2.clock.advance(150);
  h2.workers[0].onerror({ message: 'x' });
  ok('10 erreur du Worker : phase error', h2.events.at(-1).phase === 'error');
}
// 11. Double activation / double désactivation sans effet.
{
  const h = makeHarness();
  h.ctl.enable(); h.ctl.enable();
  ok('11 double activation : un seul Worker', h.workers.length === 1);
  h.ctl.disable(); h.ctl.disable();
  ok('11 double désactivation : un seul événement off', h.events.filter((e) => e.phase === 'off').length === 1);
}

// 12. Création du Worker impossible (navigateur sans module worker, file://) : erreur, pas d'exception.
{
  const clock = makeClock(); const events = [];
  let calls = 0;
  const ctl = createAnalysisController({
    createWorker: () => { calls++; if (calls > 1) throw new Error('pas de worker'); return { postMessage() {}, terminate() {}, onmessage: null, onerror: null }; },
    onChange: (s) => events.push(s), setTimer: clock.setTimer, clearTimer: clock.clearTimer,
  });
  ctl.enable();
  ctl.request(posA); clock.advance(150);
  // Le premier Worker accepte la requête ; on force une recréation en changeant de position pendant l'analyse.
  ctl.request(posB); clock.advance(150);
  ok('12 recréation impossible : phase error, aucune exception', events.at(-1).phase === 'error');
  let threw = false;
  try { const c2 = createAnalysisController({ createWorker: () => { throw new Error('non'); }, onChange() {} }); c2.enable(); } catch { threw = true; }
  ok("12 activation impossible : l'exception remonte à l'appelant (main.js la rattrape et affiche un message)", threw);
}

console.log(failures === 0 ? 'RÉSULTAT : tout concorde.' : `RÉSULTAT : ${failures} échec(s).`);
process.exit(failures === 0 ? 0 : 1);
