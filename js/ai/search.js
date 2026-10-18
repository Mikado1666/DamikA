// DAMIKA — Recherche (V0) : négamax alpha-bêta, approfondissement itératif, quiescence, table de
// transposition optionnelle (hash de Zobrist). Utilise FastBoard (js/ai/fastboard.js) et l'évaluation
// de js/ai/eval.js. Aucune dépendance, aucun accès au DOM (utilisable dans un Worker).
//
// Scores : en centipions. En interne, point de vue du camp au trait (négamax). analyse() les
// expose du point de vue des BLANCS. Une défaite (camp au trait sans coup légal) vaut
// -(MAT - ply) : plus le mat est proche, plus il pèse, donc le mat le plus court est préféré.
//
// Ce qui n'existe PAS en V0 : détection de répétition, règle des 25 coups de dames, nulle par
// accord. Une finale de dames peut donc tourner en rond ; la profondeur borne la recherche.

import { FastBoard, WHITE, moveToUi, moveToString } from './fastboard.js';
import { evalSideToMove } from './eval.js';

export const MATE = 30000;
const MAX_DEPTH = 64;             // profondeur maximale demandable
const QUIESCENCE_MAX = 16;        // prolongation maximale (demi-coups) aux feuilles
const MAX_PLY = MAX_DEPTH + QUIESCENCE_MAX + 16;
const MATE_BOUND = MATE - MAX_PLY; // au-delà (en valeur absolue) : score de mat
const INF = 32000;

// --- Hash de Zobrist ----------------------------------------------------------------------------
// Deux mots de 32 bits par (code de pièce, case), tirés d'un générateur à graine fixe : le hash est
// donc le même d'une exécution à l'autre (déterminisme).
const Z_LO = new Int32Array(5 * 50);
const Z_HI = new Int32Array(5 * 50);
let Z_SIDE_LO = 0, Z_SIDE_HI = 0;
(function initZobrist() {
  let a = 0x9E3779B9;
  const next = () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return (t ^ (t >>> 14)) | 0;
  };
  for (let i = 0; i < Z_LO.length; i++) { Z_LO[i] = next(); Z_HI[i] = next(); }
  Z_SIDE_LO = next();
  Z_SIDE_HI = next();
})();

// Hash complet (recalcul à partir du plateau) : sert à l'initialisation et aux tests.
export function zobristHash(fb) {
  let lo = 0, hi = 0;
  for (let sq = 0; sq < 50; sq++) {
    const p = fb.board[sq];
    if (p !== 0) { lo ^= Z_LO[p * 50 + sq]; hi ^= Z_HI[p * 50 + sq]; }
  }
  if (fb.side === 1) { lo ^= Z_SIDE_LO; hi ^= Z_SIDE_HI; }
  return { lo, hi };
}

// Hash après le coup `m`, à partir du hash (lo, hi) AVANT le coup. À appeler avant makeMove :
// il lit sur le plateau les pièces prises. Résultat dans out.lo / out.hi.
export function hashAfterMove(fb, m, lo, hi, out) {
  const b = fb.board;
  const piece = b[m.from];
  lo ^= Z_LO[piece * 50 + m.from]; hi ^= Z_HI[piece * 50 + m.from];
  const placed = m.promo ? piece + 2 : piece;
  lo ^= Z_LO[placed * 50 + m.to]; hi ^= Z_HI[placed * 50 + m.to];
  const caps = m.caps;
  for (let k = 0; k < caps.length; k++) {
    const c = caps[k];
    const q = b[c];
    lo ^= Z_LO[q * 50 + c]; hi ^= Z_HI[q * 50 + c];
  }
  out.lo = lo ^ Z_SIDE_LO;
  out.hi = hi ^ Z_SIDE_HI;
}

// --- Table de transposition ------------------------------------------------------------------------
// Une seule table partagée par le module, vidée au début de chaque analyse (résultats reproductibles).
// Règle d'usage : un score n'est réutilisé que s'il a été calculé exactement à la profondeur
// demandée. Cela rend les scores strictement identiques à ceux d'une recherche sans table (une
// entrée plus profonde donnerait un score plus « savant », donc différent) ; la table sert surtout
// à trouver le meilleur coup en premier et à éviter de refaire les mêmes sous-arbres.
const TT_BITS = 18;
const TT_SIZE = 1 << TT_BITS;
const TT_MASK = TT_SIZE - 1;
const TT_EXACT = 1, TT_LOWER = 2, TT_UPPER = 3;
const ttLo = new Int32Array(TT_SIZE);
const ttHi = new Int32Array(TT_SIZE);
const ttScore = new Int16Array(TT_SIZE);
const ttDepth = new Int8Array(TT_SIZE);
const ttFlag = new Int8Array(TT_SIZE); // 0 = case vide
const ttFrom = new Int8Array(TT_SIZE);
const ttTo = new Int8Array(TT_SIZE);

function clearTT() {
  ttFlag.fill(0);
}

// --- Chercheur ------------------------------------------------------------------------------------
class Searcher {
  constructor(fb, { useTT, prune, shouldStop }) {
    this.fb = fb;
    this.useTT = useTT;
    this.prune = prune;
    this.shouldStop = shouldStop;
    this.nodes = 0;
    this.stopped = false;
    this.deadline = Infinity;
    this.timeCheck = false; // vérification du temps désactivée pendant la profondeur 1
    this.history = new Int32Array(2 * 50 * 50);
    this.hLo = new Int32Array(MAX_PLY + 2);
    this.hHi = new Int32Array(MAX_PLY + 2);
    this.tmp = { lo: 0, hi: 0 };
    // Variante principale : pvMove[ply] = meilleur coup du nœud, pvLen[ply] = longueur de la suite.
    this.pv = Array.from({ length: MAX_PLY + 2 }, () => []);
    this.prevPv = [];
    this.rootBest = null;
  }

  // Score statique du point de vue du camp au trait.
  staticEval() {
    return evalSideToMove(this.fb.board, this.fb.side);
  }

  // Tri des coups : coup de la variante principale précédente, coup de la table de
  // transposition, promotions, puis historique (coups qui ont déjà provoqué une coupure).
  // Les prises sont forcées : si l'une existe, tous les coups sont déjà des prises.
  orderMoves(moves, ply, onPv, ttF, ttT) {
    const pvm = onPv ? this.prevPv[ply] : undefined;
    const side = this.fb.side;
    const hist = this.history;
    const score = (m) => {
      let s = hist[(side * 50 + m.from) * 50 + m.to];
      if (m.promo) s += 1e6;
      if (m.from === ttF && m.to === ttT) s += 1e8;
      if (pvm !== undefined && m.from === pvm.from && m.to === pvm.to && m.lo === pvm.lo && m.hi === pvm.hi) s += 1e9;
      return s;
    };
    const keyed = moves.map((m) => ({ m, s: score(m) }));
    keyed.sort((a, b) => b.s - a.s); // tri stable : à score égal, ordre de génération
    for (let i = 0; i < moves.length; i++) moves[i] = keyed[i].m;
  }

  search(depth, alpha, beta, ply, onPv) {
    this.nodes++;
    if (this.timeCheck && (this.nodes & 2047) === 0) {
      if (performance.now() >= this.deadline || (this.shouldStop && this.shouldStop())) this.stopped = true;
    }
    if (this.stopped) return 0;

    const fb = this.fb;
    const pvHere = this.pv[ply];
    pvHere.length = 0;

    const moves = fb.generateMoves();
    if (moves.length === 0) return -(MATE - ply); // camp au trait sans coup : il a perdu
    if (depth <= 0) {
      // Quiescence : les prises sont obligatoires, donc tant que le camp au trait en a une, la
      // position n'est pas calme et on prolonge. Garde-fou : QUIESCENCE_MAX demi-coups.
      if (moves[0].caps.length === 0 || -depth >= QUIESCENCE_MAX) return this.staticEval();
    }

    const alphaOrig = alpha;
    const hLo = this.hLo[ply], hHi = this.hHi[ply];
    let ttF = -1, ttT = -1, slot = 0;
    if (this.useTT && depth >= 1) {
      slot = hLo & TT_MASK;
      if (ttFlag[slot] !== 0 && ttLo[slot] === hLo && ttHi[slot] === hHi) {
        ttF = ttFrom[slot]; ttT = ttTo[slot];
        if (ply > 0 && ttDepth[slot] === depth) {
          let s = ttScore[slot];
          if (s > MATE_BOUND) s -= ply; else if (s < -MATE_BOUND) s += ply;
          const f = ttFlag[slot];
          if (f === TT_EXACT) return s;
          if (f === TT_LOWER && s >= beta) return s;
          if (f === TT_UPPER && s <= alpha) return s;
        }
      }
    }

    if (moves.length > 1 && depth >= 1) this.orderMoves(moves, ply, onPv, ttF, ttT);

    const side = fb.side;
    let best = -INF;
    let bestMove = null;
    for (let i = 0; i < moves.length; i++) {
      const m = moves[i];
      hashAfterMove(fb, m, hLo, hHi, this.tmp);
      this.hLo[ply + 1] = this.tmp.lo; this.hHi[ply + 1] = this.tmp.hi;
      const childOnPv = onPv && this.prevPv[ply] !== undefined && i === 0;
      fb.makeMove(m);
      const score = -this.search(depth - 1, -beta, -alpha, ply + 1, childOnPv);
      fb.unmakeMove();
      if (this.stopped) return 0;
      if (score > best) {
        best = score;
        bestMove = m;
        // variante principale : ce coup puis la variante du fils
        pvHere.length = 0;
        pvHere.push(m);
        const child = this.pv[ply + 1];
        for (let k = 0; k < child.length; k++) pvHere.push(child[k]);
        if (ply === 0) this.rootBest = m;
        if (score > alpha) alpha = score;
      }
      if (this.prune && alpha >= beta) {
        if (depth >= 1 && m.caps.length === 0) this.history[(side * 50 + m.from) * 50 + m.to] += depth * depth;
        break;
      }
    }

    if (this.useTT && depth >= 1) {
      // Remplacement : une entrée plus profonde du même hash n'est pas écrasée par une moins profonde.
      const same = ttFlag[slot] !== 0 && ttLo[slot] === hLo && ttHi[slot] === hHi;
      if (!same || ttDepth[slot] <= depth) {
        let s = best;
        if (s > MATE_BOUND) s += ply; else if (s < -MATE_BOUND) s -= ply;
        ttLo[slot] = hLo; ttHi[slot] = hHi;
        ttScore[slot] = s;
        ttDepth[slot] = depth;
        ttFlag[slot] = best <= alphaOrig ? TT_UPPER : best >= beta ? TT_LOWER : TT_EXACT;
        ttFrom[slot] = bestMove.from;
        ttTo[slot] = bestMove.to;
      }
    }
    return best;
  }
}

// --- Recherche à profondeur fixe (utilisée par les tests) ---------------------------------------------
// prune = false : négamax pur, sans aucun élagage (référence pour les tests de cohérence).
// Retourne le score du point de vue du camp au trait.
export function searchFixedDepth(fb, depth, { prune = true, useTT = false } = {}) {
  if (useTT) clearTT();
  const s = new Searcher(fb, { useTT, prune, shouldStop: null });
  const h = zobristHash(fb);
  s.hLo[0] = h.lo; s.hHi[0] = h.hi;
  const score = s.search(depth, -INF, INF, 0, false);
  return { score, nodes: s.nodes, bestMove: s.rootBest, pv: s.pv[0].slice() };
}

// --- Analyse (approfondissement itératif) ---------------------------------------------------------------
function describeScore(scoreStm, side) {
  const whitePov = side === WHITE ? scoreStm : -scoreStm;
  if (Math.abs(scoreStm) > MATE_BOUND) {
    const plies = MATE - Math.abs(scoreStm);
    const winner = (scoreStm > 0) === (side === WHITE) ? 'w' : 'b';
    return { score: whitePov, mate: { winner, in: Math.ceil(plies / 2) } };
  }
  return { score: whitePov, mate: null };
}

// Générateur : un `yield` après chaque profondeur terminée (valeur = progression) ; le pilote peut
// répondre `true` à ce yield pour demander l'arrêt. `return` = résultat final.
function* analyseSteps(position, opts) {
  const maxDepth = Math.min(opts.maxDepth ?? MAX_DEPTH, MAX_DEPTH);
  const maxTimeMs = opts.maxTimeMs ?? 1000;
  const useTT = opts.useTT ?? TT_DEFAULT;
  const fb = FastBoard.fromUiBoard(position.board, position.side);
  const side = fb.side;
  const t0 = performance.now();

  const s = new Searcher(fb, { useTT, prune: true, shouldStop: opts.shouldStop ?? null });
  s.deadline = t0 + maxTimeMs;
  if (useTT) clearTT();
  const h = zobristHash(fb);
  s.hLo[0] = h.lo; s.hHi[0] = h.hi;

  const result = {
    score: 0, mate: null, bestMove: null, bestMoveNotation: null, pv: [], pvNotation: [],
    depth: 0, nodes: 0, nps: 0, timeMs: 0, stopped: false,
  };
  const finish = () => {
    result.nodes = s.nodes;
    result.timeMs = performance.now() - t0;
    result.nps = result.timeMs > 0 ? Math.round(s.nodes / (result.timeMs / 1000)) : 0;
    return result;
  };

  const rootMoves = fb.generateMoves();
  if (rootMoves.length === 0) { // le camp au trait a déjà perdu
    Object.assign(result, describeScore(-MATE, side));
    return finish();
  }

  for (let depth = 1; depth <= maxDepth; depth++) {
    s.timeCheck = depth > 1; // la profondeur 1 est toujours terminée
    s.rootBest = null;
    const score = s.search(depth, -INF, INF, 0, s.prevPv.length > 0);
    if (s.stopped) { result.stopped = true; break; }

    const pv = s.pv[0].slice();
    s.prevPv = pv;
    Object.assign(result, describeScore(score, side));
    result.depth = depth;
    result.bestMove = moveToUi(s.rootBest);
    result.bestMoveNotation = moveToString(s.rootBest);
    result.pv = pv.map(moveToUi);
    result.pvNotation = pv.map(moveToString);
    finish();
    if (opts.onProgress) opts.onProgress({ ...result });

    // Mat trouvé et entièrement vu : une profondeur de plus ne peut rien changer.
    if (Math.abs(score) > MATE_BOUND && depth >= MATE - Math.abs(score)) break;
    if (performance.now() >= s.deadline) { result.stopped = true; break; }
    if (depth < maxDepth && (yield { ...result }) === true) { result.stopped = true; break; }
  }
  return finish();
}

// Active la table de transposition par défaut : décision prise d'après tests/search-consistency.mjs.
export const TT_DEFAULT = true;

// Version synchrone (tests, scripts Node). position = { board, side } au format de l'interface.
export function analyseSync(position, opts = {}) {
  const it = analyseSteps(position, opts);
  let r = it.next();
  while (!r.done) r = it.next();
  return r.value;
}

// Version asynchrone : cède la main entre deux profondeurs (setTimeout 0 par défaut), ce qui laisse
// un Worker traiter un message d'arrêt. opts.shouldStop() est interrogée à chaque cession.
export async function analyse(position, opts = {}) {
  const yieldFn = opts.yield ?? (() => new Promise((r) => setTimeout(r, 0)));
  const it = analyseSteps(position, opts);
  let r = it.next();
  while (!r.done) {
    await yieldFn();
    r = it.next(opts.shouldStop ? opts.shouldStop() === true : false);
  }
  return r.value;
}
