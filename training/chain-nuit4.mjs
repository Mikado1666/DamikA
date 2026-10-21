#!/usr/bin/env node
// DAMIKA — NUIT 4 (≈ 14 h) : apprentissage sur parties réelles Turbo Dambase, F1 à temps égal, auto-jeu 6.3/6.4, réentraînement, matchs finaux.
// Aucun lien avec l'appli, aucune dépendance (Node seul). Plan, durées et critères : docs/SESSION_DERNIERE.md, section « Nuit 4 ».
//
//   node training/chain-nuit4.mjs [--dry-run [--start HH:MM]]
//
//  1 td-convert   : parties Turbo Dambase propres (Elo min ≥ 2100) → positions hors ouverture, calmes, 12 par partie (td-positions.mjs).
//  2 fit-t0/ta/tb : apprentissage sur RÉSULTATS RÉELS (λ = 1, parties pondérées, 3 phases, validation par PARTIES) : T0 = la demande telle quelle
//                   (ancré sur V0) ; Ta, Tb = réglage fin de n123 (--anchor n123, α = 1e-4 / 1e-3) : voir docs, section « Nuit 4 ».
//  3 matchs       : chaque T contre n123, profondeur 6 (400 paires, graine 777) ; le meilleur, s'il est > 0 Elo : profondeur 8 (300 paires, graine 888).
//  4 choose-best  : ce T si son IC95 à profondeur 8 est ENTIÈREMENT > 0, sinon n123 (le modèle validé).
//  5 fit-f1       : connexité F1 par-dessus le meilleur ; match à TEMPS ÉGAL (100 ms/coup, 250 paires, graine 777) ; gardée si IC95 > 0.
//  6 selfplay     : auto-jeu avec le meilleur modèle (+ F1 si gardée), profondeur 8, graine 4, règles 6.3/6.4 ; NOMBRE DE PARTIES calculé
//                   d'après l'échéance (figé dans l'état) ; verify.mjs ; réentraînement sur les nuits 1-4 (λ = 0, comme n123).
//  7 matchs finaux (par priorité, taille réduite ou sautée si l'échéance approche) : candidat contre n123, [le meilleur de l'étape 4 si
//                   c'est T], V1b, V0, à profondeur 8 (graine 888) et à temps égal (graine 777), puis profondeur 6.
// Journal : training/logs/chain-nuit4.log ; état : training/logs/chain-nuit4.state.json. RELANCER LA MÊME COMMANDE reprend : les étapes
// terminées sont sautées, auto-jeu et matchs reprennent où ils en étaient. Veille Windows bloquée. Jamais deux calculs lourds à la fois.
// Données nominatives : seul td-positions.mjs lit le PDN (noms ignorés, jamais écrits) ; tout reste sous training/data/ (ignoré par git).
//
// Options : --dry-run · --start HH:MM (dry-run : heure de départ simulée) · --workers <n> (7 ; 4 si la mémoire libre < 2,5 Go) ·
//   --deadline "AAAA-MM-JJ HH:MM" (défaut : 09:30 suivant le premier lancement, figée dans l'état) · --hard-stop-min <n> (20 : arrêt de
//   sécurité à échéance + n min) · --stop-after <étape> · --allow-sleep · --state · --log ·
//   ESSAIS SEULEMENT : --tiny (très petite échelle, préfixe essai4, sorties séparées) · --prefix <nom> · --force-best t|n123 · --force-f1 keep|drop ·
//   --est-scale <x> · --sp-games <n>.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { preventSleep } from './sleep.mjs';
import { resolveEvaluator } from './game.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const flag = (n) => argv.includes(`--${n}`);
const opt = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 && i + 1 < argv.length ? argv[i + 1] : d; };

const TINY = flag('tiny');
const DRY = flag('dry-run');
const P = opt('prefix', TINY ? 'essai4' : 'n4'); // préfixe de TOUTES les sorties (les essais ne touchent jamais aux vraies)
const NAME = P === 'n4' ? 'nuit4' : P;
const WORKERS_REQ = opt('workers', null);
const LOG_FILE = path.resolve(ROOT, opt('log', `training/logs/chain-${NAME}.log`));
const STATE_FILE = path.resolve(ROOT, opt('state', `training/logs/chain-${NAME}.state.json`));
const STOP_AFTER = opt('stop-after', null);
const HARD_STOP_MIN = Number(opt('hard-stop-min', 20));
const FORCE_BEST = opt('force-best', null);
const FORCE_F1 = opt('force-f1', null);
const NODE = process.execPath;

// --- Chemins ---------------------------------------------------------------------------------------------------------------
const MODELS = TINY ? `training/data/${P}-models` : 'training/models';
const TD_DIR = `training/data/${P === 'n4' ? 'td-positions-2100' : `${P}-td`}`;
const SP_DIR = `training/data/${P === 'n4' ? 'selfplay-nuit-4' : `selfplay-${P}`}`;
const N1 = 'training/data/selfplay-nuit-1', N2 = 'training/data/selfplay-nuit-2', N3 = 'training/data/selfplay-nuit-3';
const V1B = 'training/models/v1b-l0.json', N123 = 'training/models/n123-l0.json';
// Candidats « parties réelles » (cible = résultat, λ = 1, parties pondérées 1/longueur). Les mesures de l'étape 3.2 ont montré qu'un modèle
// appris SEUL sur des résultats joue bien moins fort que celui appris sur des scores de recherche (+86 contre +211 Elo face à V0, ancré sur V0) :
// t0 = la demande telle quelle (ancré sur V0, α choisi sur la validation) ; ta, tb = RÉGLAGE FIN de n123 (--anchor : la régularisation tire vers n123).
const TCANDS = [
  { id: 't0', label: 'T0 (pur, ancré sur V0)', desc: 'λ = 1, parties pondérées, α par validation', alphas: '1e-8,1e-7,1e-6,1e-5,1e-4,1e-3,1e-2,1e-1', anchor: false },
  { id: 'ta', label: 'Ta (réglage fin de n123, α = 1e-4)', desc: 'ancré sur n123, α = 1e-4', alphas: '1e-4', anchor: true },
  { id: 'tb', label: 'Tb (réglage fin de n123, α = 1e-3)', desc: 'ancré sur n123, α = 1e-3', alphas: '1e-3', anchor: true },
];
const tFile = (id) => `${MODELS}/${P}${id}-l1.json`;
const F1_FILE = `${MODELS}/${P}f-F1.json`;
const CAND = P === 'n4' ? 'n1234' : `${P}-c`; // candidat final : tables apprises sur les nuits 1-4
const CAND_FILE = `${MODELS}/${CAND}-l0.json`;
const CAND_F1_FILE = `${MODELS}/${CAND}f-F1.json`;
const mdir = (id) => `training/data/c4-${P}-${id}`;

// --- Échelle (très petite pour les essais) ---------------------------------------------------------------------------------------
const S = TINY
  ? { d6: 3, d8: 4, tms: 20, p400: 8, p300: 6, p250: 6, spDepth: 4, spGames: 16, sec: 0.04, tdArgs: ['--limit', '100000', '--per-game', '4'] }
  : { d6: 6, d8: 8, tms: 100, p400: 400, p300: 300, p250: 250, spDepth: 8, spGames: null, sec: 1, tdArgs: [] };
if (opt('est-scale', null)) S.sec = Number(opt('est-scale')); // ESSAIS : échelle des durées estimées (1 = durées réelles)
if (opt('sp-games', null)) S.spGames = Number(opt('sp-games')); // ESSAIS : nombre de parties d'auto-jeu imposé
// Durées mesurées (nuits 2 et 3, 7 workers ; matchs à temps égal : 6 workers) : secondes par PAIRE de parties.
const SEC_PER_PAIR = { d6: 0.65, d8: 5.75, d8v0: 4.95, t: 6.0 };
const SELFPLAY_PER_HOUR = 1300; // nuit 3 : 8000 parties en 5,65 h = 1 415/h ; marge de sécurité de 8 %
const MARGIN_MIN = 40; // marge avant l'échéance
const MIN_PAIRS = 100;

const fmtElo = (x) => (Number.isFinite(x) ? `${x >= 0 ? '+' : '−'}${Math.abs(x).toFixed(1)}` : String(x));
const stamp = (d = new Date()) => d.toLocaleString('fr-FR', { hour12: false });
const hhmm = (ms) => new Date(ms).toLocaleString('fr-FR', { hour12: false, day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

// --- État (reprise) et journal ------------------------------------------------------------------------------------------------
function readState() { try { return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); } catch { return { steps: {} }; } }
function writeState(st) {
  if (DRY) return;
  fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
  fs.writeFileSync(`${STATE_FILE}.tmp`, JSON.stringify(st, null, 1));
  fs.renameSync(`${STATE_FILE}.tmp`, STATE_FILE);
}
function log(msg) {
  const line = `[${stamp()}] ${msg}`;
  console.log(line);
  if (!DRY) { fs.mkdirSync(path.dirname(LOG_FILE), { recursive: true }); fs.appendFileSync(LOG_FILE, `${line}\n`); }
}
const readSummary = (dir) => { try { const s = JSON.parse(fs.readFileSync(path.resolve(ROOT, dir, 'summary.json'), 'utf8')); return s.interrupted === false ? s : null; } catch { return null; } };
const eloOf = (s) => ({ elo: s.elo, lo: s.eloLo, hi: s.eloHi, w: s.w, d: s.d, l: s.l, pairs: s.pairs });
const eloTxt = (r) => `${fmtElo(r.elo)} Elo [${fmtElo(r.lo)} ; ${fmtElo(r.hi)}] (V/N/D ${r.w}/${r.d}/${r.l}, ${r.pairs} paires)`;

// --- Temps : échéance, durées, taille des matchs ------------------------------------------------------------------------------------
let virtualNow = null; // dry-run : heure simulée
const nowMs = () => (virtualNow ?? Date.now());
function parseDeadline(text) { const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})$/.exec(text); if (!m) throw new Error(`--deadline invalide : ${text} (AAAA-MM-JJ HH:MM)`); return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]).getTime(); }
function defaultDeadline(from) { const d = new Date(from); d.setHours(9, 30, 0, 0); if (d.getTime() <= from + 3600e3) d.setDate(d.getDate() + 1); return d.getTime(); }
const workersBase = () => Math.max(1, Number(WORKERS_REQ ?? 7));
const workersTime = () => Math.min(workersBase(), 6); // matchs à temps égal : 6 workers (mesure du temps moins perturbée), comme à l'étape 3.3
const speed = (w) => w / 7; // les durées mesurées sont à 7 workers
const pairMin = (pairs, secPerPair, w) => (pairs * secPerPair * S.sec) / 60 / speed(w);

// Matchs finaux, DANS L'ORDRE DE PRIORITÉ. bestIsT : on ajoute le match contre le modèle qui a produit l'auto-jeu.
function finalMatchPlan(bestIsT) {
  const m = (id, opp, kind, pairs, seed) => ({ id: `fm-${id}`, opp, kind, pairs, seed });
  const list = [
    m('n123-d8', 'n123', 'd8', S.p400, 888),
    ...(bestIsT ? [m('t-d8', 'T', 'd8', S.p400, 888)] : []),
    m('n123-t', 'n123', 't', S.p300, 777),
    m('v1b-d8', 'v1b', 'd8', S.p400, 888),
    m('v0-d8', 'v0', 'd8', S.p400, 888),
    m('v1b-t', 'v1b', 't', S.p300, 777),
    m('v0-t', 'v0', 't', S.p300, 777),
    m('n123-d6', 'n123', 'd6', S.p400, 777),
    m('v1b-d6', 'v1b', 'd6', S.p400, 777),
    m('v0-d6', 'v0', 'd6', S.p400, 777),
  ];
  return list.map((x) => ({ ...x, sec: x.kind === 'd8' ? (x.opp === 'v0' ? SEC_PER_PAIR.d8v0 : SEC_PER_PAIR.d8) : x.kind === 't' ? SEC_PER_PAIR.t : SEC_PER_PAIR.d6, w: x.kind === 't' ? workersTime() : workersBase() }));
}
const fullMinutes = (plan) => plan.reduce((a, x) => a + pairMin(x.pairs, x.sec, x.w), 0);

// Nombre de parties d'auto-jeu : tout le temps disponible avant l'échéance, moins les étapes qui suivent (matchs finaux au complet,
// vérification, réentraînements) et la marge. Arrondi à la centaine, entre 1 500 et 12 000. Figé dans l'état au premier calcul.
function selfplayGames(atMs, deadline, f1Keep, bestIsT) {
  if (S.spGames) return S.spGames;
  const w = workersBase();
  const after = fullMinutes(finalMatchPlan(bestIsT)) + 3 + (f1Keep ? 8 : 4) + MARGIN_MIN;
  const availMin = (deadline - atMs) / 60000 - after;
  const rate = SELFPLAY_PER_HOUR * speed(w) * (f1Keep ? 0.75 : 1); // F1 : +35 % de nœuds à profondeur égale
  const games = Math.floor(((availMin / 60) * rate) / 100) * 100;
  return Math.max(1500, Math.min(12000, games));
}
const selfplayMin = (games, w, f1Keep) => Math.round((games / (SELFPLAY_PER_HOUR * speed(w) * (f1Keep ? 0.75 : 1))) * 60);

// Meilleur candidat T à profondeur 6 (Elo > 0 contre n123), ou null.
function bestTId(state) {
  let best = null;
  for (const c of TCANDS) { const r = state.tD6?.[c.id]; if (r && r.elo > 0 && (!best || r.elo > state.tD6[best].elo)) best = c.id; }
  return best;
}

// --- Plan : une étape = identifiant, durée estimée, commande ou fonction interne ------------------------------------------------
function buildSteps(state) {
  const best = state.best || null; // { id: 't'|'n123', file, lambda, data, gw }
  const bestIsT = best?.id === 't';
  const f1Keep = !!state.f1Keep;
  const W = workersBase();
  const nW = String(W), tW = String(workersTime());
  const tNote = (dir, key) => () => { const s = readSummary(dir); if (!s) throw new Error(`${dir}/summary.json absent ou interrompu`); state[key] = eloOf(s); return eloTxt(state[key]); };
  const matchArgs = (a, b, depth, pairs, seed, workers, out, timeMs) => ['training/arena.mjs', 'match', '--a', a, '--b', b, '--depth', String(depth), ...(timeMs ? ['--time', String(timeMs)] : []), '--pairs', String(pairs), '--seed', String(seed), '--workers', workers, '--out', out];
  const copyFit = (from, to) => { const f = path.join(ROOT, from), t = path.join(ROOT, to); if (!fs.existsSync(f)) throw new Error(`fit.mjs n'a pas écrit ${from}`); fs.copyFileSync(f, t); resolveEvaluator(`learned:${t}`); return `copié vers ${to} (accepté par l'évaluateur)`; };

  const steps = [
    {
      id: 'td-convert', title: `positions des parties réelles (Elo min ≥ 2100) → ${TD_DIR}`, optional: true, deps: [], estMin: 3,
      argv: () => ['training/td-positions.mjs', '--out', TD_DIR, '--min-elo', '2100', ...S.tdArgs],
      after() { const s = JSON.parse(fs.readFileSync(path.resolve(ROOT, TD_DIR, 'summary.json'), 'utf8')); if (!(s.gamesKept > 0) || s.unmatched !== 0) throw new Error(`conversion douteuse : ${JSON.stringify(s)}`); return `${s.gamesKept} parties, ${s.positions} positions`; },
    },
    ...TCANDS.map((c) => ({
      id: `fit-${c.id}`, title: `apprentissage de ${c.label} sur parties réelles (${c.desc})`, optional: true, deps: ['td-convert'], estMin: 2,
      argv: () => ['training/fit.mjs', '--data', TD_DIR, '--lambda', '1', '--phases', '3', '--game-weight', '1', '--alphas', c.alphas, ...(c.anchor ? ['--anchor', N123] : []), '--tag', `${P}${c.id}`, '--out', MODELS, '--grids', 'none'],
      after: () => copyFit(`${MODELS}/${P}${c.id}-v1b-l1.json`, tFile(c.id)),
    })),
    ...TCANDS.map((c) => ({
      id: `match-${c.id}-d6`, title: `match ${c.label} contre n123, profondeur ${S.d6}, graine 777, ${S.p400} paires`, optional: true, deps: [`fit-${c.id}`], estMin: Math.round(pairMin(S.p400, SEC_PER_PAIR.d6, W)) + 1,
      argv: () => matchArgs(`learned:${tFile(c.id)}`, `learned:${N123}`, S.d6, S.p400, 777, nW, mdir(`${c.id}-n123-d6`)),
      after() { const r = tNote(mdir(`${c.id}-n123-d6`), '_tmp')(); (state.tD6 ??= {})[c.id] = state._tmp; delete state._tmp; return r; },
    })),
    {
      id: 'match-tbest-d8', title: `[si un T bat n123 à profondeur ${S.d6}] match du meilleur T contre n123, profondeur ${S.d8}, graine 888, ${S.p300} paires`, optional: true, deps: [], estMin: Math.round(pairMin(S.p300, SEC_PER_PAIR.d8, W)),
      skip() { const id = bestTId(state); return id ? null : `aucun T ne bat n123 à profondeur ${S.d6} (${TCANDS.map((c) => `${c.id} ${state.tD6?.[c.id] ? fmtElo(state.tD6[c.id].elo) : '?'}`).join(', ')}) : confirmation inutile`; },
      argv: () => matchArgs(`learned:${tFile(bestTId(state))}`, `learned:${N123}`, S.d8, S.p300, 888, nW, mdir('tbest-n123-d8')),
      after() { const r = tNote(mdir('tbest-n123-d8'), 'tD8')(); state.tBest = bestTId(state); return `${state.tBest} : ${r}`; },
    },
    {
      id: 'choose-best', title: 'choix du meilleur modèle : le meilleur T (IC95 à profondeur 8 entièrement > 0) ou n123', deps: [], estMin: 0, internal: true,
      run() {
        let id = state.tD8 && state.tBest && state.tD8.lo > 0 ? 't' : 'n123';
        const d6 = TCANDS.filter((c) => state.tD6?.[c.id]).map((c) => `${c.label} ${fmtElo(state.tD6[c.id].elo)}`).join(', ');
        let why = state.tD8 ? `${state.tBest} contre n123, profondeur ${S.d8} : ${eloTxt(state.tD8)} → ${id === 't' ? 'IC95 entièrement > 0 : retenu' : 'IC95 contient 0 ou est négatif : n123 reste le meilleur'}`
          : `${d6 ? `profondeur ${S.d6} : ${d6} ; aucun T > 0, pas de confirmation à profondeur ${S.d8}` : 'branche T non terminée (conversion, apprentissage ou match en échec)'} → n123 reste le meilleur`;
        if (FORCE_BEST) { id = FORCE_BEST === 't' ? 't' : 'n123'; why = `FORCÉ par --force-best ${FORCE_BEST} (essai) ; ${why}`; if (id === 't') { state.tBest = state.tBest || 'ta'; if (!fs.existsSync(path.join(ROOT, tFile(state.tBest)))) throw new Error('--force-best t : T absent'); } }
        state.best = id === 't'
          ? { id, name: state.tBest, file: tFile(state.tBest), lambda: '1', data: [TD_DIR], gw: ['--game-weight', '1'] }
          : { id, name: 'n123', file: N123, lambda: '0', data: [N1, N2, N3], gw: [] };
        return `meilleur modèle : ${state.best.name} — ${why}`;
      },
    },
    {
      id: 'fit-f1', title: 'connexité F1 par-dessus le meilleur modèle (tables + 2 poids, ajustement conjoint)', optional: true, deps: ['choose-best'], estMin: 6,
      argv: () => ['training/fit.mjs', '--data', best.data.join(','), '--base', best.file, '--families', 'F1', '--lambda', best.lambda, ...best.gw, '--tag', `${P}f`, '--out', MODELS, '--grids', 'none'],
      after() { const f = path.join(ROOT, F1_FILE); if (!fs.existsSync(f)) throw new Error('F1 non écrite (modèle INVALIDE ou famille abandonnée)'); resolveEvaluator(`learned:${f}`); return `${F1_FILE} accepté par l'évaluateur`; },
    },
    {
      id: 'match-f1-t', title: `match F1 contre le meilleur À TEMPS ÉGAL (${S.tms} ms/coup), graine 777, ${S.p250} paires — gardée si IC95 entièrement > 0`, optional: true, deps: ['fit-f1'], estMin: Math.round(pairMin(S.p250, SEC_PER_PAIR.t, W < 6 ? W : 6)),
      argv: () => matchArgs(`learned:${F1_FILE}`, `learned:${best.file}`, 30, S.p250, 777, tW, mdir('f1-best-t'), S.tms),
      after() { const s = readSummary(mdir('f1-best-t')); if (!s) throw new Error('match F1 interrompu'); state.f1T = eloOf(s); state.f1Keep = state.f1T.lo > 0; return `${eloTxt(state.f1T)} → F1 ${state.f1Keep ? 'GARDÉE (IC95 entièrement > 0)' : 'ÉCARTÉE'}`; },
    },
    {
      id: 'decide-f1', title: 'décision F1 et nombre de parties d\'auto-jeu (d\'après l\'échéance)', deps: [], estMin: 0, internal: true,
      run() {
        if (FORCE_F1) { state.f1Keep = FORCE_F1 === 'keep'; if (state.f1Keep && !fs.existsSync(path.join(ROOT, F1_FILE))) throw new Error('--force-f1 keep : F1 absente'); }
        state.selfplayGames = state.selfplayGames ?? selfplayGames(nowMs(), state.deadline, state.f1Keep, state.best.id === 't');
        state.spModel = state.f1Keep ? F1_FILE : state.best.file;
        return `F1 ${state.f1Keep ? 'GARDÉE' : 'écartée'}${FORCE_F1 ? ' (forcé, essai)' : ''} ; auto-jeu avec ${state.spModel} ; ${state.selfplayGames} parties (≈ ${selfplayMin(state.selfplayGames, W, state.f1Keep)} min à ${W} workers) ; échéance ${hhmm(state.deadline)}`;
      },
    },
    {
      id: 'selfplay', title: `auto-jeu ${state.selfplayGames ?? '?'} parties, profondeur ${S.spDepth}, graine 4, règles 6.3/6.4 → ${SP_DIR}`, deps: ['decide-f1'], haltOnFail: true,
      estMin: state.selfplayGames ? selfplayMin(state.selfplayGames, W, f1Keep) : 0,
      argv: () => ['training/arena.mjs', 'selfplay', '--evaluator', `learned:${state.spModel}`, '--depth', String(S.spDepth), '--games', String(state.selfplayGames), '--seed', '4', '--workers', nW, '--out', SP_DIR],
      // Auto-jeu BORNÉ DANS LE TEMPS : si la vitesse réelle est inférieure à l'estimation, il est arrêté à l'heure où les matchs finaux
      // doivent commencer (parties déjà jouées conservées, ligne finale tronquée retirée) : les matchs finaux ont la priorité.
      limitAt: () => state.deadline - (fullMinutes(finalMatchPlan(state.best?.id === 't')) + 3 + (state.f1Keep ? 8 : 4) + MARGIN_MIN) * 60000,
      after(res) {
        if (res?.timeboxed) {
          const f = path.resolve(ROOT, SP_DIR, 'games.jsonl');
          const fd = fs.openSync(f, 'r+'); const size = fs.fstatSync(fd).size;
          const buf = Buffer.alloc(Math.min(size, 1 << 22)); fs.readSync(fd, buf, 0, buf.length, size - buf.length);
          if (buf.length && buf[buf.length - 1] !== 10) { const k = buf.lastIndexOf(10); fs.ftruncateSync(fd, k < 0 ? 0 : size - buf.length + k + 1); }
          fs.closeSync(fd);
          let n = 0; for (const b of fs.readFileSync(f)) if (b === 10) n++;
          if (n < (TINY ? 8 : 1500)) throw new Error(`auto-jeu arrêté à l'heure avec seulement ${n} parties`);
          state.selfplayActual = n;
          return `${n} parties sur ${state.selfplayGames} prévues (ARRÊT À L'HEURE : vitesse inférieure à l'estimation)`;
        }
        const s = JSON.parse(fs.readFileSync(path.resolve(ROOT, SP_DIR, 'summary.json'), 'utf8')); if (s.interrupted !== false || (typeof s.total === 'number' && s.doneJobs < s.total)) throw new Error('auto-jeu incomplet'); state.selfplayActual = s.games ?? s.doneJobs; return `${state.selfplayActual} parties`;
      },
    },
    { id: 'verify', title: `verify.mjs sur ${SP_DIR} (rules.js, règles de finale)`, deps: ['selfplay'], haltOnFail: true, estMin: 1, argv: () => ['training/verify.mjs', SP_DIR] },
    {
      id: 'fit-cand', title: `réentraînement nuits 1 + 2 + 3 + 4 (λ = 0, comme n123) → ${CAND_FILE}`, deps: ['verify'], haltOnFail: true, estMin: 2,
      argv: () => ['training/fit.mjs', '--data', [N1, N2, N3, SP_DIR].join(','), '--lambda', '0', '--phases', '3', '--tag', CAND, '--out', MODELS, '--grids', 'none'],
      after: () => copyFit(`${MODELS}/${CAND}-v1b-l0.json`, CAND_FILE),
    },
    {
      id: 'fit-cand-f1', title: `[si F1 gardée] F1 par-dessus ${CAND} → ${CAND_F1_FILE}`, optional: true, deps: ['fit-cand'], estMin: f1Keep ? 8 : 0,
      skip: () => (state.f1Keep ? null : 'F1 écartée'),
      argv: () => ['training/fit.mjs', '--data', [N1, N2, N3, SP_DIR].join(','), '--base', CAND_FILE, '--families', 'F1', '--lambda', '0', '--tag', `${CAND}f`, '--out', MODELS, '--grids', 'none'],
      after() { const f = path.join(ROOT, `${MODELS}/${CAND}f-F1.json`); if (!fs.existsSync(f)) throw new Error('F1 sur le candidat non écrite'); resolveEvaluator(`learned:${f}`); return 'ok'; },
    },
  ];

  // Matchs finaux : candidat = CAND (+ F1 si gardée et ajustée). Taille décidée AU LANCEMENT de chaque match (échéance), puis figée.
  const candFile = () => (state.f1Keep && state.steps['fit-cand-f1']?.done && !state.steps['fit-cand-f1']?.skipped ? CAND_F1_FILE : CAND_FILE);
  const oppSpec = (o) => (o === 'n123' ? `learned:${N123}` : o === 'v1b' ? `learned:${V1B}` : o === 'T' ? `learned:${state.best.file}` : 'v0');
  const plan = finalMatchPlan(bestIsT);
  plan.forEach((x, i) => {
    steps.push({
      id: x.id, final: true, optional: true, deps: ['fit-cand'], estMin: Math.round(pairMin(x.pairs, x.sec, x.w)), plan: x, rank: i + 1,
      title: `match final ${i + 1}/${plan.length} : candidat contre ${x.opp}, ${x.kind === 'd8' ? `profondeur ${S.d8}` : x.kind === 't' ? `temps égal ${S.tms} ms` : `profondeur ${S.d6}`}, graine ${x.seed}, ${x.pairs} paires`,
      skip() {
        const chosen = (state.finalPairs ??= {})[x.id] ?? (() => {
          const availMin = (state.deadline - nowMs()) / 60000;
          const full = pairMin(x.pairs, x.sec, x.w);
          let pairs = x.pairs;
          if (full > availMin) pairs = Math.floor((availMin * 60 * 0.92 * speed(x.w)) / (x.sec * S.sec) / 10) * 10;
          state.finalPairs[x.id] = pairs >= MIN_PAIRS || (TINY && pairs >= 2) ? Math.min(pairs, x.pairs) : 0;
          if (state.finalPairs[x.id] !== x.pairs) log(`   ⚠ ${x.id} : ${x.pairs} paires prévues, ${Math.round(availMin)} min avant l'échéance → ${state.finalPairs[x.id]} paires${state.finalPairs[x.id] ? '' : ' (SAUTÉ)'}`);
          return state.finalPairs[x.id];
        })();
        return chosen > 0 ? null : `échéance trop proche (moins de ${MIN_PAIRS} paires possibles)`;
      },
      argv: () => {
        const pairs = state.finalPairs?.[x.id] ?? x.pairs;
        const a = `learned:${candFile()}`;
        return matchArgs(a, oppSpec(x.opp), x.kind === 't' ? 30 : x.kind === 'd8' ? S.d8 : S.d6, pairs, x.seed, x.kind === 't' ? tW : nW, mdir(x.id), x.kind === 't' ? S.tms : null);
      },
      after() { const s = readSummary(mdir(x.id)); if (!s) throw new Error('match interrompu'); (state.finalRes ??= {})[x.id] = { ...eloOf(s), opp: x.opp, kind: x.kind, seed: x.seed }; return eloTxt(state.finalRes[x.id]); },
    });
  });
  steps.push({ id: 'report', title: 'récapitulatif et verdict', deps: [], estMin: 0, internal: true, always: true, run: () => '' });
  return steps;
}

const shown = (a) => (a ? `node ${a.map((x) => (/[\s"]/.test(x) ? `"${x}"` : x)).join(' ')}` : '(interne)');

// --- Récapitulatif --------------------------------------------------------------------------------------------------------------
function recap(state, steps) {
  const L = [];
  const P_ = (s) => { L.push(s); log(s); };
  P_('=== RÉCAPITULATIF NUIT 4 ===');
  for (const s of steps.filter((x) => x.id !== 'report')) {
    const r = state.steps[s.id];
    P_(`${r?.done ? (r.skipped ? '–' : '✔') : '·'} ${s.title}${r?.skipped ? `  [sauté : ${r.note}]` : r?.note ? `  → ${r.note}` : ''}`);
  }
  P_('--- Décisions ---');
  for (const c of TCANDS) if (state.tD6?.[c.id]) P_(`${c.label} contre n123 : profondeur ${S.d6} ${eloTxt(state.tD6[c.id])}`);
  if (state.tD8) P_(`${state.tBest} contre n123 : profondeur ${S.d8} ${eloTxt(state.tD8)}`);
  if (state.best) P_(`Meilleur modèle de l'étape 4 (source de l'auto-jeu) : ${state.best.name}`);
  if (state.f1T) P_(`F1 à temps égal (${S.tms} ms) contre le meilleur : ${eloTxt(state.f1T)} → ${state.f1Keep ? 'gardée' : 'écartée'}`);
  if (state.selfplayGames) P_(`Auto-jeu : ${state.selfplayGames} parties avec ${state.spModel}`);
  const fr = state.finalRes || {};
  const rows = Object.entries(fr);
  if (rows.length) {
    P_('--- Matchs finaux (candidat contre …) ---');
    for (const [id, r] of rows) P_(`${id} : ${eloTxt(r)}${r.lo > 0 ? '  ← SIGNIFICATIF (IC95 > 0)' : r.hi < 0 ? '  ← SIGNIFICATIVEMENT PERDANT' : '  (non significatif)'}`);
    const beats = (opp, kind) => rows.find(([, r]) => r.opp === opp && r.kind === kind)?.[1];
    const d8 = beats('n123', 'd8'), tt = beats('n123', 't');
    const cand = state.f1Keep && state.steps['fit-cand-f1']?.done && !state.steps['fit-cand-f1']?.skipped ? `${CAND}f (${CAND_F1_FILE})` : `${CAND} (${CAND_FILE})`;
    if (d8 && d8.lo > 0 && (!tt || tt.elo > 0)) P_(`MODÈLE LE PLUS FORT : ${cand}, ${fmtElo(d8.elo)} Elo IC95 [${fmtElo(d8.lo)} ; ${fmtElo(d8.hi)}] contre n123 (profondeur ${S.d8}, graine 888${tt ? `) et ${fmtElo(tt.elo)} à temps égal [${fmtElo(tt.lo)} ; ${fmtElo(tt.hi)}]` : ')'}`);
    else if (d8) P_(`MODÈLE LE PLUS FORT : n123 reste la référence validée — ${cand} contre n123 à profondeur ${S.d8} : ${fmtElo(d8.elo)} [${fmtElo(d8.lo)} ; ${fmtElo(d8.hi)}]${tt ? `, à temps égal ${fmtElo(tt.elo)} [${fmtElo(tt.lo)} ; ${fmtElo(tt.hi)}]` : ''} : pas de gain significatif`);
    else P_('MODÈLE LE PLUS FORT : indéterminé (match final contre n123 à profondeur 8 non terminé)');
  } else P_('MODÈLE LE PLUS FORT : indéterminé (aucun match final terminé)');
  if (!DRY) { try { fs.writeFileSync(path.resolve(ROOT, `training/logs/chain-${NAME}.resume.txt`), `${L.join('\n')}\n`); } catch { /* journal seulement */ } }
}

// --- Dry run ----------------------------------------------------------------------------------------------------------------------
if (DRY) {
  const state = readState();
  const start = opt('start', null);
  if (start) { const [h, m] = start.split(':').map(Number); const d = new Date(); d.setHours(h, m, 0, 0); virtualNow = d.getTime(); }
  state.deadline = state.deadline ?? (opt('deadline', null) ? parseDeadline(opt('deadline')) : defaultDeadline(nowMs()));
  console.log(`MODE --dry-run : rien n'est lancé, rien n'est écrit.${TINY ? ' (ESSAI --tiny)' : ''}\n`);
  console.log(`Dossier de travail : ${ROOT}\nJournal : ${path.relative(ROOT, LOG_FILE)} · état : ${path.relative(ROOT, STATE_FILE)} · workers : ${workersBase()} (temps égal : ${workersTime()})`);
  console.log(`Veille Windows : ${flag('allow-sleep') ? 'NON bloquée (--allow-sleep)' : 'bloquée pendant toute la durée (sleep.mjs)'}`);
  console.log(`Départ simulé : ${hhmm(nowMs())} · ÉCHÉANCE (dernier match fini) : ${hhmm(state.deadline)} · arrêt de sécurité : ${hhmm(state.deadline + HARD_STOP_MIN * 60000)}\n`);
  // Hypothèse du plan : T bat n123 (le cas LONG : match profondeur 8 joué), F1 écartée, pas de T comme auto-jeu.
  const assumeBestT = flag('assume-best-t');
  state.best = assumeBestT ? { id: 't', name: 'ta', file: tFile('ta'), lambda: '1', data: [TD_DIR], gw: ['--game-weight', '1'] } : { id: 'n123', name: 'n123', file: N123, lambda: '0', data: [N1, N2, N3], gw: [] };
  state.tD6 = { ta: { elo: 1 } };
  let steps = buildSteps(state);
  let t = nowMs(), total = 0;
  // Le nombre de parties est calculé à l'étape « décision F1 » : on simule l'heure où elle sera atteinte (somme des durées qui la précèdent).
  const iDecide = steps.findIndex((x) => x.id === 'decide-f1');
  const tDecide = t + steps.slice(0, iDecide).reduce((a, x) => a + (x.estMin || 0), 0) * 60000;
  state.selfplayGames = selfplayGames(tDecide, state.deadline, false, assumeBestT);
  steps = buildSteps(state);
  steps.filter((s) => s.id !== 'report').forEach((s, i) => {
    let est = s.estMin || 0;
    if (s.id === 'selfplay') est = selfplayMin(state.selfplayGames, workersBase(), false);
    if (s.id === 'fit-cand-f1') est = 0;
    const startAt = t;
    t += est * 60000; total += est;
    console.log(`${String(i + 1).padStart(2)}. ${hhmm(startAt)} → ${hhmm(t)}  (~${est} min)  ${s.title}`);
    if (s.argv && s.id !== 'selfplay') { try { console.log(`      ${shown(s.argv())}`); } catch { console.log('      (commande connue au lancement)'); } }
    if (s.id === 'selfplay') console.log(`      node training/arena.mjs selfplay --evaluator learned:<meilleur modèle> --depth ${S.spDepth} --games ${state.selfplayGames} --seed 4 --workers ${workersBase()} --out ${SP_DIR}  (nombre de parties recalculé et figé au lancement de l'étape)`);
    if (s.optional) console.log('      (étape facultative : un échec n\'arrête pas la chaîne)');
    if (s.haltOnFail) console.log('      (en cas d\'erreur : ARRÊT NET)');
  });
  console.log(`\nDurée totale estimée : ${(total / 60).toFixed(1)} h, fin vers ${hhmm(t)} (échéance ${hhmm(state.deadline)} : marge ${Math.round((state.deadline - t) / 60000)} min). Durées mesurées aux nuits 2 et 3, à ±20 %.`);
  console.log(`Branches : si T ne bat pas n123 à profondeur ${S.d6}, le match de profondeur ${S.d8} est sauté (−${Math.round(pairMin(S.p300, SEC_PER_PAIR.d8, workersBase()))} min, auto-jeu allongé d'autant) ; si T devient le meilleur : +1 match final contre T (+${Math.round(pairMin(S.p400, SEC_PER_PAIR.d8, workersBase()))} min) ; si F1 est gardée : auto-jeu ralenti (≈ −25 %) et +8 min d'ajustement.`);
  const missing = [V1B, N123, `${N1}/games.jsonl`, `${N2}/games.jsonl`, `${N3}/games.jsonl`, 'tests/pdn-local/td-propre/td-propre.pdn'].filter((f) => !fs.existsSync(path.resolve(ROOT, f)));
  console.log(missing.length ? `ATTENTION fichiers introuvables : ${missing.join(', ')}` : 'Fichiers d\'entrée présents.');
  if (fs.existsSync(path.resolve(ROOT, SP_DIR))) console.log(`NB : ${SP_DIR} existe déjà : l'auto-jeu REPRENDRA.`);
  console.log(`Mémoire libre : ${(os.freemem() / 1e9).toFixed(1)} Go (4 workers imposés automatiquement sous 2,5 Go au lancement de chaque étape lourde).`);
  process.exit(missing.length ? 1 : 0);
}

// --- Exécution réelle -------------------------------------------------------------------------------------------------------------
let child = null, interrupted = false;
process.on('SIGINT', () => { interrupted = true; log('Ctrl+C : arrêt demandé (relancer la MÊME commande pour reprendre)…'); if (!child) process.exit(130); });
process.on('exit', () => { try { child?.kill(); } catch { /* déjà terminé */ } });

function runStep(step) {
  return new Promise((resolve) => {
    const tail = [], t0 = Date.now();
    let args = step.argv();
    // Mémoire juste : 4 workers (relancer la même commande reprendra avec le même résultat : le nombre de workers n'entre pas dans l'identité).
    const wi = args.indexOf('--workers');
    if (wi >= 0 && !WORKERS_REQ && os.freemem() < 2.5e9 && Number(args[wi + 1]) > 4) { log(`   ⚠ mémoire libre ${(os.freemem() / 1e9).toFixed(1)} Go < 2,5 Go : 4 workers au lieu de ${args[wi + 1]}`); args = [...args]; args[wi + 1] = '4'; }
    log(`▶ ${step.title}`);
    log(`   ${shown(args)}`);
    child = spawn(NODE, args, { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    let timeboxed = false, boxTimer = null;
    if (step.limitAt) {
      const ms = Math.max(30000, step.limitAt() - Date.now());
      log(`   (borné dans le temps : arrêt à ${hhmm(Date.now() + ms)} au plus tard)`);
      boxTimer = setTimeout(() => { timeboxed = true; log("   ⏱ heure limite atteinte : arrêt de l'étape, les résultats déjà écrits sont conservés."); try { child?.kill(); } catch { /* déjà terminé */ } }, ms);
    }
    const sink = (chunk) => { const text = String(chunk); process.stdout.write(text); fs.appendFileSync(LOG_FILE, text); for (const l of text.split(/\r?\n/)) if (l.trim()) { tail.push(l); if (tail.length > 40) tail.shift(); } };
    child.stdout.on('data', sink); child.stderr.on('data', sink);
    child.on('error', (e) => { clearTimeout(boxTimer); child = null; resolve({ ok: false, code: -1, tail: [...tail, `lancement impossible : ${e.message}`], seconds: (Date.now() - t0) / 1000 }); });
    child.on('exit', (code) => { clearTimeout(boxTimer); child = null; resolve({ ok: code === 0 || timeboxed, code, timeboxed, tail, seconds: (Date.now() - t0) / 1000 }); });
  });
}

async function main() {
  const sleepInfo = flag('allow-sleep') ? { reason: 'non demandée (--allow-sleep)', stop() {} } : preventSleep();
  const state = readState();
  state.steps ??= {};
  if (state.deadline === undefined) state.deadline = opt('deadline', null) ? parseDeadline(opt('deadline')) : defaultDeadline(Date.now());
  else if (opt('deadline', null)) state.deadline = parseDeadline(opt('deadline'));
  state.startedAt ??= new Date().toISOString();
  writeState(state);
  log(`=== chain-${NAME} démarré (pid ${process.pid}) — veille Windows : ${flag('allow-sleep') ? sleepInfo.reason : 'blocage en cours d\'armement'}${TINY ? ' — ESSAI --tiny' : ''} ===`);
  log(`Échéance (dernier match fini) : ${hhmm(state.deadline)} ; arrêt de sécurité : ${hhmm(state.deadline + HARD_STOP_MIN * 60000)} ; workers : ${workersBase()} (temps égal : ${workersTime()}) ; mémoire libre ${(os.freemem() / 1e9).toFixed(1)} Go`);
  log('AVERTISSEMENT : les nuits 1 et 2 ont été jouées SANS les règles de finale 6.3 / 6.4, les nuits 3 et 4 AVEC (le réentraînement mélange les deux régimes, comme n123).');

  const hardStopAt = state.deadline + HARD_STOP_MIN * 60000;
  let steps = buildSteps(state);
  const hardTimer = setTimeout(() => { log(`ARRÊT DE SÉCURITÉ : ${hhmm(hardStopAt)} atteint, un calcul tourne encore. Arrêt immédiat (les parties déjà jouées sont conservées : relancer la même commande pour reprendre).`); try { child?.kill(); } catch { /* ok */ } recap(state, steps); sleepInfo.stop(); process.exit(3); }, Math.max(1000, hardStopAt - Date.now()));

  const failed = new Set();
  let halted = false, stoppedEarly = false;
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    if (interrupted) break;
    if (step.id === 'report') break;
    if (state.steps[step.id]?.done) { log(`✓ ${step.title} : déjà terminée (reprise), sautée.`); if (STOP_AFTER === step.id) { stoppedEarly = true; break; } continue; }
    if (halted) { log(`— ${step.title} : non lancée (arrêt net).`); continue; }
    const blocking = step.deps.filter((d) => failed.has(d) || !state.steps[d]?.done);
    if (blocking.length) { log(`— ${step.title} : non lancée (dépend de ${blocking.join(', ')}, non terminée).`); failed.add(step.id); continue; }

    if (step.internal) {
      try {
        const note = step.run();
        state.steps[step.id] = { done: true, at: new Date().toISOString(), note };
        writeState(state);
        log(`✔ ${step.title}${note ? ` : ${note}` : ''}`);
        steps = buildSteps(state); // les décisions (meilleur modèle, parties, F1) changent la suite du plan
      } catch (e) { failed.add(step.id); halted = true; log(`✘ ${step.title} impossible : ${e.message}. ARRÊT NET.`); }
      if (STOP_AFTER === step.id) { stoppedEarly = true; break; }
      continue;
    }
    const cur = steps[i]; // version à jour (après reconstruction)
    const why = cur.skip ? cur.skip() : null;
    if (why) { state.steps[cur.id] = { done: true, skipped: true, at: new Date().toISOString(), note: why }; writeState(state); log(`– ${cur.title} : sautée (${why}).`); steps = buildSteps(state); if (STOP_AFTER === cur.id) { stoppedEarly = true; break; } continue; }
    writeState(state); // figer les tailles décidées par skip()
    steps = buildSteps(state);
    const run = steps[i];
    const res = await runStep(run);
    let note = '';
    if (res.ok && run.after) { try { note = await run.after(res); log(`   ${note}`); } catch (e) { res.ok = false; res.tail.push(String(e.message)); } }
    if (res.ok) {
      state.steps[run.id] = { done: true, at: new Date().toISOString(), seconds: Math.round(res.seconds), note, tail: res.tail.slice(-8) };
      writeState(state);
      log(`✔ ${run.title} : terminée en ${Math.round(res.seconds / 60)} min.`);
      steps = buildSteps(state);
    } else {
      failed.add(run.id);
      writeState(state);
      log(`✘ ${run.title} : ÉCHEC (code ${res.code}${interrupted ? ', interrompue' : ''}). Dernières lignes :\n    ${res.tail.slice(-8).join('\n    ')}`);
      if (run.haltOnFail) { halted = true; log(`ARRÊT NET : « ${run.id} » est indispensable à la suite. Corriger puis relancer la même commande.`); }
    }
    if (STOP_AFTER === run.id) { log(`--stop-after ${run.id} : arrêt volontaire.`); stoppedEarly = true; break; }
  }

  clearTimeout(hardTimer);
  recap(state, steps);
  log(stoppedEarly ? '=== arrêt volontaire (--stop-after) : relancer la MÊME commande SANS cette option pour continuer ===' : failed.size || halted ? `=== terminé AVEC ÉCHEC(S) : ${[...failed].join(', ')} — relancer la MÊME commande pour reprendre ===` : '=== tout est terminé ===');
  sleepInfo.stop();
  process.exit(failed.size || halted ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
