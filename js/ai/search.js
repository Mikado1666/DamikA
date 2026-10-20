// DAMIKA — Recherche (V0) : négamax alpha-bêta, approfondissement itératif, quiescence, table de
// transposition optionnelle (hash de Zobrist). Utilise FastBoard (js/ai/fastboard.js) et l'évaluation
// de js/ai/eval.js. Aucune dépendance, aucun accès au DOM (utilisable dans un Worker).
//
// Scores : en centipions. En interne, point de vue du camp au trait (négamax). analyse() les
// expose du point de vue des BLANCS. Une défaite (camp au trait sans coup légal) vaut
// -(MAT - ply) : plus le mat est proche, plus il pèse, donc le mat le plus court est préféré.
//
// Nulles par règle (FMJD, Annexe 1, art. 6.1 et 6.2 ; sources dans docs/SESSION_DERNIERE.md) :
//   - 25 coups : 50 demi-coups consécutifs sans coup de pion ni prise (FastBoard.quiet) -> score 0.
//   - répétition : (a) une position qui revient sur le chemin courant de la recherche (cycle : il peut
//     être répété jusqu'à la 3e occurrence) -> 0 ; (b) une position qui serait la 3e occurrence en
//     comptant l'historique de la partie transmis par l'appli (même position, même camp au trait) -> 0.
// Ce qui n'existe PAS : les limites de finale (art. 6.3 : 16 coups, 6.4 : 5 coups), la nulle par accord.
//
// Table de transposition et historique : un score qui dépend de l'historique ne doit pas être mis en
// cache pour d'autres chemins. Règle retenue (« teinte ») : `drawHits` compte les nulles par règle
// rencontrées ; si le sous-arbre d'un nœud en a produit au moins une, son score dépend du chemin et de
// l'historique, et il N'EST PAS écrit dans la table. Les scores écrits sont donc ceux de sous-arbres sans
// aucune nulle par règle. Limite connue, théorique (problème « GHI » classique) : une entrée saine
// écrite par un chemin peut être relue par un autre chemin où une répétition aurait touché ce sous-arbre.
// Mesuré : 0 écart entre la recherche avec table et sans table sur 230 positions de finale à dames avec
// historique (profondeurs 8 et 10), cf. docs/SESSION_DERNIERE.md. (Variante plus stricte essayée : ne pas
// lire/écrire la table aux nœuds dont le compteur de 25 coups est > 0 ; exacte mais +56 % de nœuds
// en finale de dames, abandonnée.)

import { FastBoard, WHITE, moveToUi, moveToString, DRAW_QUIET_PLIES } from './fastboard.js';
import { evalWhite as defaultEvalWhite } from './eval.js';

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

// Hash d'une position au format de l'interface ({ board, side }) : sert à transmettre l'historique.
export function positionHash(board, side) {
  return zobristHash(FastBoard.fromUiBoard(board, side));
}

// Historique de la partie : { hashes | positions, quiet }, du plus ancien au plus récent, SANS la
// position analysée. `hashes` : [{ lo, hi }] ou [[lo, hi]] ; `positions` : [{ board, side }] (hachées ici).
// `quiet` : demi-coups consécutifs sans coup de pion ni prise AVANT la position analysée. Absent ou vide :
// comportement sans historique. Retourne { lo: Int32Array, hi: Int32Array, quiet } ou null.
export function normalizeHistory(history) {
  if (!history) return null;
  const quiet = Number.isFinite(history.quiet) ? Math.max(0, Math.floor(history.quiet)) : 0;
  let pairs = [];
  if (Array.isArray(history.hashes)) {
    pairs = history.hashes.map((h) => (Array.isArray(h) ? { lo: h[0] | 0, hi: h[1] | 0 } : { lo: h.lo | 0, hi: h.hi | 0 }));
  } else if (Array.isArray(history.positions)) {
    pairs = history.positions.map((p) => positionHash(p.board, p.side));
  }
  // Seules les `quiet` dernières positions peuvent se répéter (au-delà, un coup irréversible a eu lieu).
  if (pairs.length > quiet) pairs = pairs.slice(pairs.length - quiet);
  const lo = new Int32Array(pairs.length), hi = new Int32Array(pairs.length);
  pairs.forEach((p, k) => { lo[k] = p.lo; hi[k] = p.hi; });
  return { lo, hi, quiet };
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
  constructor(fb, { useTT, prune, shouldStop, history = null, evaluator = null, maxNodes = Infinity }) {
    this.fb = fb;
    // Évaluateur injectable (étage 3 : poids appris) : fonction evalWhite(board) de createEvaluator().
    // Par défaut, l'évaluation V0 : aucun score ne change.
    this.evalWhite = evaluator || defaultEvalWhite;
    // Budget de nœuds (déterministe, contrairement au temps) : la recherche s'arrête à ce nombre de
    // nœuds, à 2048 près, et rend la dernière profondeur terminée. Infini par défaut.
    this.nodeLimit = maxNodes;
    this.histLo = history ? history.lo : new Int32Array(0);
    this.histHi = history ? history.hi : new Int32Array(0);
    this.histLen = this.histLo.length;
    this.drawHits = 0; // nulles par règle rencontrées (sert à ne pas mettre en cache un score dépendant de l'historique)
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

  // Nulle par répétition pour la position du nœud `ply` (son hash est dans hLo/hHi[ply]), `quiet` = compteur
  // du plateau. Une position ne peut revenir qu'après au moins 4 demi-coups réversibles.
  isRepetition(ply, quiet) {
    const lo = this.hLo[ply], hi = this.hHi[ply];
    // (a) cycle sur le chemin courant (racine comprise) : même position, même camp (écart pair).
    const limit = Math.max(0, ply - quiet);
    for (let j = ply - 4; j >= limit; j -= 2) {
      if (this.hLo[j] === lo && this.hHi[j] === hi) return true;
    }
    // (b) historique de la partie : la position serait-elle la 3e occurrence ?
    const h = this.histLen;
    if (h === 0) return false;
    // L'entrée i de l'historique est (h - i) demi-coups avant la racine : même camp si (h - i + ply) est pair.
    let i = ((1 + ply) & 1) === 0 ? h - 1 : h - 2;
    const lowest = Math.max(0, h + ply - quiet);
    let seen = 0;
    for (; i >= lowest; i -= 2) {
      if (this.histLo[i] === lo && this.histHi[i] === hi && ++seen >= 2) return true;
    }
    return false;
  }

  // Score statique du point de vue du camp au trait.
  staticEval() {
    const s = this.evalWhite(this.fb.board);
    return this.fb.side === WHITE ? s : -s;
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
      if (performance.now() >= this.deadline || this.nodes >= this.nodeLimit || (this.shouldStop && this.shouldStop())) this.stopped = true;
    }
    if (this.stopped) return 0;

    const fb = this.fb;
    const pvHere = this.pv[ply];
    pvHere.length = 0;

    const moves = fb.generateMoves();
    if (moves.length === 0) return -(MATE - ply); // camp au trait sans coup : il a perdu
    // Nulles par règle (jamais à la racine : la recherche y choisit un coup quoi qu'il arrive).
    const quiet = fb.quiet;
    if (ply > 0 && quiet >= 4) {
      if (quiet >= DRAW_QUIET_PLIES || this.isRepetition(ply, quiet)) { this.drawHits++; return 0; }
    }
    if (depth <= 0) {
      // Quiescence : les prises sont obligatoires, donc tant que le camp au trait en a une, la
      // position n'est pas calme et on prolonge. Garde-fou : QUIESCENCE_MAX demi-coups.
      if (moves[0].caps.length === 0 || -depth >= QUIESCENCE_MAX) return this.staticEval();
    }

    const alphaOrig = alpha;
    const hLo = this.hLo[ply], hHi = this.hHi[ply];
    let ttF = -1, ttT = -1, slot = 0;
    // Table : pas d'écriture d'un sous-arbre où une nulle par règle a eu lieu (voir l'en-tête).
    const hits0 = this.drawHits;
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

    if (this.useTT && depth >= 1 && this.drawHits === hits0) {
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
export function searchFixedDepth(fb, depth, { prune = true, useTT = false, history = null, evaluator = null } = {}) {
  if (useTT) clearTT();
  const nh = normalizeHistory(history);
  if (nh) fb.quiet = nh.quiet;
  const s = new Searcher(fb, { useTT, prune, shouldStop: null, history: nh, evaluator });
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
  const history = normalizeHistory(opts.history ?? position.history);
  const fb = FastBoard.fromUiBoard(position.board, position.side, history ? history.quiet : 0);
  const side = fb.side;
  const t0 = performance.now();

  const s = new Searcher(fb, {
    useTT, prune: true, shouldStop: opts.shouldStop ?? null, history,
    evaluator: opts.evaluator ?? null, maxNodes: opts.maxNodes ?? Infinity,
  });
  s.deadline = t0 + maxTimeMs;
  if (useTT) clearTT();
  const h = zobristHash(fb);
  s.hLo[0] = h.lo; s.hHi[0] = h.hi;

  const result = {
    score: 0, mate: null, bestMove: null, bestMoveNotation: null, pv: [], pvNotation: [],
    depth: 0, nodes: 0, nps: 0, timeMs: 0, stopped: false,
    drawRule: null, // 'quiet' | 'repetition' : la position analysée est déjà nulle par règle (partie finie)
  };
  const finish = () => {
    result.nodes = s.nodes;
    result.timeMs = performance.now() - t0;
    result.nps = result.timeMs > 0 ? Math.round(s.nodes / (result.timeMs / 1000)) : 0;
    return result;
  };

  if (fb.quiet >= DRAW_QUIET_PLIES) result.drawRule = 'quiet';
  else if (history && history.lo.length) {
    let seen = 0;
    const len = history.lo.length;
    for (let i = len - 1; i >= 0 && len - i <= fb.quiet; i--) {
      if (((len - i) & 1) === 0 && history.lo[i] === h.lo && history.hi[i] === h.hi) seen++;
    }
    if (seen >= 2) result.drawRule = 'repetition';
  }

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
    if (performance.now() >= s.deadline || s.nodes >= s.nodeLimit) { result.stopped = true; break; }
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
