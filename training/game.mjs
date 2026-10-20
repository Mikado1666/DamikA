// DAMIKA — Étage 3.1 : une partie complète entre deux « joueurs » (évaluateur + paramètres de recherche).
//
// Règles de la partie (cohérentes avec le moteur d'analyse, étape 2) :
//   - perte du camp au trait s'il n'a plus de coup (plus de pièce ou toutes bloquées), contrôlée en premier ;
//   - nulle à 50 demi-coups consécutifs sans prise ni coup de pion (FMJD 6.2, FastBoard.quiet) ;
//   - nulle à la 3e occurrence d'une position, même camp au trait (FMJD 6.1) ;
//   - nulle au plafond de `maxPlies` demi-coups (300 par défaut), ouverture comprise.
// Les limites de finale FMJD 6.3 / 6.4 ne sont PAS appliquées (décision de Mickaël : plus tard).
//
// Le moteur rapide (FastBoard) joue ; rules.js sert de RÉFÉRENCE : verifyGame() rejoue une partie
// enregistrée avec rules.js seul (légalité de chaque coup, plateau final, état terminal et motif).
//
// Reproductibilité : tout le hasard (ouverture, exploration) vient de générateurs à graine ; la
// recherche est déterministe à profondeur fixe ou à budget de nœuds fixe. Même graine et mêmes réglages
// = mêmes parties, coup pour coup. (Un budget de TEMPS, lui, n'est pas reproductible.)

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { FastBoard, WHITE, BLACK, DRAW_QUIET_PLIES, moveToUi } from '../js/ai/fastboard.js';
import { analyseSync, zobristHash } from '../js/ai/search.js';
import { createEvaluator, EVAL_WEIGHTS } from '../js/ai/eval.js';
import { createTableEvaluator, tablesToPlain } from '../js/ai/eval-learned.js';
import {
  initialBoard, generateLegalMoves, applyCaptureSequence, applySimpleMove,
} from '../js/engine/rules.js';

export const DEFAULT_MAX_PLIES = 300;

// --- Hasard à graine ---------------------------------------------------------------------------------------------
export function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Graine dérivée (graine de base, étiquette, indice) : chaque ouverture / chaque partie a son propre
// flux, indépendant des autres → l'ordre d'exécution (parallèle, reprise) ne change rien.
export function seedOf(base, tag, index) {
  const h = crypto.createHash('sha1').update(`${base}:${tag}:${index}`).digest();
  return h.readUInt32LE(0);
}

// --- Évaluateurs ----------------------------------------------------------------------------------------------------
// Spécification : « v0 » (évaluation écrite à la main) ou chemin d'un fichier JSON de poids. Le fichier est
// un objet { man, king, advance:[9 nombres], tempo, centerCoreMan, … } (clés de EVAL_WEIGHTS ; les clés
// absentes gardent la valeur V0) ou { weights: {…} }. Les valeurs sont ARRONDIES au centipion entier : les
// tables de createEvaluator() sont des Int32Array.
export function resolveWeights(spec) {
  if (spec === 'v0') return { ...EVAL_WEIGHTS, advance: [...EVAL_WEIGHTS.advance] };
  const raw = JSON.parse(fs.readFileSync(spec, 'utf8'));
  const given = raw && raw.weights && typeof raw.weights === 'object' ? raw.weights : raw;
  const w = { ...EVAL_WEIGHTS, advance: [...EVAL_WEIGHTS.advance] };
  for (const [k, v] of Object.entries(given)) {
    if (!(k in EVAL_WEIGHTS)) throw new Error(`poids inconnu « ${k} » dans ${spec}`);
    if (k === 'advance') {
      if (!Array.isArray(v) || v.length !== EVAL_WEIGHTS.advance.length || !v.every(Number.isFinite)) {
        throw new Error(`« advance » doit être un tableau de ${EVAL_WEIGHTS.advance.length} nombres (${spec})`);
      }
      w.advance = v.map(Math.round);
    } else {
      if (!Number.isFinite(v)) throw new Error(`poids « ${k} » invalide dans ${spec}`);
      w[k] = Math.round(v);
    }
  }
  return w;
}

// Identifiant stable d'un jeu de poids (sert à vérifier qu'on reprend bien le même match).
export function weightsId(weights) {
  const keys = Object.keys(EVAL_WEIGHTS).sort();
  const canon = JSON.stringify(keys.map((k) => [k, weights[k]]));
  return crypto.createHash('sha1').update(canon).digest('hex').slice(0, 10);
}

// Empreinte du CONTENU d'un jeu de tables (forme canonique : entiers, tableaux ordinaires) : deux fichiers
// de même contenu (quelle que soit leur mise en forme) ont la même empreinte, un fichier modifié une autre.
export function tablesId(tables) {
  return crypto.createHash('sha1').update(JSON.stringify(tablesToPlain(tables))).digest('hex').slice(0, 10);
}

// Spécification d'un évaluateur en ligne de commande :
//   « v0 »                      l'évaluation écrite à la main ;
//   « learned:<fichier.json> »  tables apprises (js/ai/eval-learned.js : { man, king } ou { phases }) ;
//   « <fichier.json> »          poids de EVAL_WEIGHTS (voir resolveWeights).
// Retourne { kind: 'weights' | 'tables', weights | tables, id, label }. `id` = empreinte du CONTENU : elle entre
// dans l'identité d'un run (reprise) : modifier le fichier de poids change l'identité du run.
export function resolveEvaluator(spec) {
  if (typeof spec === 'string' && spec.startsWith('learned:')) {
    const file = spec.slice('learned:'.length);
    if (!file) throw new Error('learned: demande un fichier (ex. learned:training/models/v1.json)');
    let raw;
    try { raw = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { throw new Error(`impossible de lire ${file} : ${e.message}`); }
    let tables;
    try { tables = tablesToPlain(raw); } catch (e) { throw new Error(`tables invalides dans ${file} : ${e.message}`); }
    return { kind: 'tables', tables, id: tablesId(tables), label: `learned-${path.basename(file, '.json')}` };
  }
  const weights = resolveWeights(spec);
  return { kind: 'weights', weights, id: weightsId(weights), label: spec === 'v0' ? 'v0' : path.basename(spec, '.json') };
}

// player = { name, kind?, weights | tables, depth, maxNodes?, maxTimeMs? } → ajoute `evaluate` (fonction evalWhite).
export function makePlayer({ name, kind = 'weights', weights, tables, depth, maxNodes = Infinity, maxTimeMs = 1e9 }) {
  const evaluate = kind === 'tables' ? createTableEvaluator(tables) : createEvaluator(weights);
  return { name, kind, weights, tables, depth, maxNodes, maxTimeMs, evaluate };
}

// --- Coups : notation et retrouvailles --------------------------------------------------------------------
// Notation d'un coup enregistré : « 32-28 » (simple), « 27x9 » (prise, départ × arrivée comme en FMJD) ;
// si plusieurs coups légaux partagent départ et arrivée (rafles différentes), on ajoute « /18.13 » = cases
// des pièces prises (triées), ce qui lève toute ambiguïté.
export function moveNotation(move, legal) {
  const base = `${move.from + 1}${move.caps.length > 0 ? 'x' : '-'}${move.to + 1}`;
  const twins = legal.filter((m) => m.from === move.from && m.to === move.to && m.caps.length > 0 === move.caps.length > 0);
  if (twins.length <= 1) return base;
  return `${base}/${[...move.caps].map((c) => c + 1).sort((a, b) => a - b).join('.')}`;
}

function parseNotation(str) {
  const m = /^(\d+)([-x])(\d+)(?:\/([\d.]+))?$/.exec(str);
  if (!m) throw new Error(`notation de coup invalide : ${str}`);
  return { from: Number(m[1]), to: Number(m[3]), capture: m[2] === 'x', caps: m[4] ? m[4].split('.').map(Number).sort((a, b) => a - b) : null };
}

export function findMove(legal, str) {
  const p = parseNotation(str);
  const cands = legal.filter((m) => m.from + 1 === p.from && m.to + 1 === p.to && (m.caps.length > 0) === p.capture);
  if (p.caps) {
    const hit = cands.find((m) => m.caps.length === p.caps.length && [...m.caps].map((c) => c + 1).sort((a, b) => a - b).every((c, i) => c === p.caps[i]));
    return hit || null;
  }
  return cands[0] || null;
}

// Plateau → chaîne de 50 caractères (cases 1..50) : « . » vide, « w » pion blanc, « W » dame blanche,
// « b » pion noir, « B » dame noire. Compact et lisible.
const CODE_CHAR = ['.', 'w', 'b', 'W', 'B'];
export function encodeBoard(board) {
  let s = '';
  for (let i = 0; i < 50; i++) s += CODE_CHAR[board[i]];
  return s;
}

// --- État d'une partie (règles de nulle) -------------------------------------------------------------------------------
const hkey = (h) => `${h.lo}:${h.hi}`;

class GameState {
  constructor() {
    this.fb = FastBoard.initial();
    this.window = [];        // hashes des positions depuis le dernier coup irréversible, SANS la position courante
    this.counts = new Map(); // occurrences de chaque position de la fenêtre (courante comprise)
    this.plies = 0;
    this.cur = zobristHash(this.fb);
    this.counts.set(hkey(this.cur), 1);
  }

  apply(m) {
    const fb = this.fb;
    const irreversible = fb.board[m.from] <= 2 || m.caps.length > 0; // coup de pion ou prise
    const prev = this.cur;
    fb.makeMove(m);
    this.plies++;
    if (irreversible) { this.window.length = 0; this.counts.clear(); } else this.window.push(prev);
    this.cur = zobristHash(fb);
    const k = hkey(this.cur);
    this.counts.set(k, (this.counts.get(k) || 0) + 1);
  }

  // null si la partie continue, sinon { result, reason } (result du point de vue des Blancs).
  terminal(maxPlies) {
    const fb = this.fb;
    if (fb.generateMoves().length === 0) {
      return { result: fb.side === WHITE ? '0-1' : '1-0', reason: 'noMoves' };
    }
    if (fb.quiet >= DRAW_QUIET_PLIES) return { result: '1/2', reason: 'quiet' };
    if ((this.counts.get(hkey(this.cur)) || 0) >= 3) return { result: '1/2', reason: 'repetition' };
    if (this.plies >= maxPlies) return { result: '1/2', reason: 'maxPlies' };
    return null;
  }

  history() {
    return { hashes: this.window, quiet: this.fb.quiet };
  }
}

const resultPoints = (r) => (r === '1-0' ? 1 : r === '0-1' ? 0 : 0.5);

// --- Ouvertures ------------------------------------------------------------------------------------------------------
// K demi-coups au hasard parmi les coups légaux, puis rejet si l'évaluation (V0, faible profondeur) est
// trop déséquilibrée (|score| > seuil, ou mat vu). Retourne la liste des coups en notation.
export function makeOpening(rng, { plies = 8, thresholdCp = 50, probeDepth = 4, maxTries = 500 } = {}) {
  const probe = createEvaluator(EVAL_WEIGHTS);
  for (let tries = 0; tries < maxTries; tries++) {
    const st = new GameState();
    const moves = [];
    let dead = false;
    for (let i = 0; i < plies; i++) {
      const legal = st.fb.generateMoves();
      if (legal.length === 0) { dead = true; break; }
      const m = legal[Math.floor(rng() * legal.length)];
      moves.push(moveNotation(m, legal));
      st.apply(m);
    }
    if (dead || st.terminal(DEFAULT_MAX_PLIES)) continue;
    if (probeDepth > 0) {
      const r = analyseSync({ board: st.fb.toUiBoard(), side: st.fb.sideToMove }, {
        maxDepth: probeDepth, maxTimeMs: 1e9, evaluator: probe, history: st.history(),
      });
      if (r.mate || Math.abs(r.score) > thresholdCp) continue;
    }
    return moves;
  }
  throw new Error(`aucune ouverture équilibrée trouvée en ${maxTries} essais (K=${plies}, seuil=${thresholdCp} cp)`);
}

// --- Une partie -------------------------------------------------------------------------------------------------------
// opening : coups en notation (joués sans recherche) ; white / black : joueurs (makePlayer) ;
// explore : { prob, margin } ou null (match) avec `rng` ; record : enregistre les positions (selfplay).
export function playGame({ opening = [], white, black, explore = null, rng = null, record = false, maxPlies = DEFAULT_MAX_PLIES }) {
  const st = new GameState();
  const moves = [];
  for (const str of opening) {
    const legal = st.fb.generateMoves();
    const m = findMove(legal, str);
    if (!m) throw new Error(`coup d'ouverture illégal : ${str}`);
    moves.push(moveNotation(m, legal));
    st.apply(m);
  }
  const k = moves.length;
  const positions = [];
  let nodes = 0, searches = 0, explored = 0;
  const t0 = performance.now();
  let end;

  for (;;) {
    end = st.terminal(maxPlies);
    if (end) break;
    const fb = st.fb;
    const player = fb.side === WHITE ? white : black;
    const legal = fb.generateMoves();
    const pos = { board: fb.toUiBoard(), side: fb.sideToMove };
    const r = analyseSync(pos, {
      maxDepth: player.depth, maxTimeMs: player.maxTimeMs, maxNodes: player.maxNodes,
      evaluator: player.evaluate, history: st.history(),
    });
    nodes += r.nodes; searches++;
    // Coup de la recherche (retrouvé dans la liste légale par sa forme « interface »).
    const bestKey = JSON.stringify(r.bestMove);
    let chosen = legal.find((m) => JSON.stringify(moveToUi(m)) === bestKey);
    if (!chosen) throw new Error(`coup de la recherche introuvable (${r.bestMoveNotation})`);

    if (record && st.plies >= k) {
      positions.push([
        encodeBoard(fb.board), fb.sideToMove, st.plies, fb.quiet, r.score, r.depth,
        legal[0].caps.length > 0 ? 1 : 0,
      ]);
    }

    // Exploration (selfplay, après l'ouverture) : le tirage est fait à CHAQUE coup (même flux de hasard quoi
    // qu'il arrive), puis, si déclenché, choix au hasard parmi les coups à moins de `margin` du meilleur.
    if (explore && rng && st.plies >= k && legal.length > 1) {
      if (rng() < explore.prob) {
        const sign = fb.side === WHITE ? 1 : -1;
        const scored = legal.map((m) => {
          const irreversible = fb.board[m.from] <= 2 || m.caps.length > 0;
          const hist = { hashes: irreversible ? [] : [...st.window, st.cur], quiet: 0 };
          fb.makeMove(m);
          hist.quiet = fb.quiet;
          const cr = analyseSync({ board: fb.toUiBoard(), side: fb.sideToMove }, {
            maxDepth: Math.max(1, player.depth - 1), maxTimeMs: 1e9, evaluator: player.evaluate, history: hist,
          });
          fb.unmakeMove();
          return { m, s: sign * cr.score };
        });
        const top = Math.max(...scored.map((x) => x.s));
        const cands = scored.filter((x) => x.s >= top - explore.margin);
        const pick = cands[Math.floor(rng() * cands.length)].m;
        if (pick !== chosen && JSON.stringify(moveToUi(pick)) !== bestKey) explored++;
        chosen = pick;
      }
    }
    moves.push(moveNotation(chosen, legal));
    st.apply(chosen);
  }

  const rec = {
    white: white.name, black: black.name,
    opening: k, result: end.result, reason: end.reason, plies: st.plies,
    moves, nodes, searches, explored, ms: Math.round(performance.now() - t0),
  };
  if (record) rec.p = positions;
  return rec;
}

// --- Vérification avec rules.js (référence) -------------------------------------------------------------------------
const boardKey = (board, side) => {
  let s = side;
  for (let sq = 1; sq <= 50; sq++) {
    const p = board[sq];
    s += p ? (p.color === 'w' ? (p.king ? 'W' : 'w') : (p.king ? 'B' : 'b')) : '.';
  }
  return s;
};

// Rejoue rec.moves avec rules.js seul. Retourne { ok: true } ou { ok: false, error }.
export function verifyGame(rec, maxPlies = DEFAULT_MAX_PLIES) {
  let board = initialBoard();
  let side = 'w';
  let quiet = 0;
  const counts = new Map([[boardKey(board, side), 1]]);

  // État terminal attendu avant chaque coup (même priorité que GameState.terminal).
  const terminalNow = (plies) => {
    const { captures, simples } = generateLegalMoves(board, side);
    if (captures.length === 0 && simples.length === 0) return { result: side === 'w' ? '0-1' : '1-0', reason: 'noMoves' };
    if (quiet >= DRAW_QUIET_PLIES) return { result: '1/2', reason: 'quiet' };
    if ((counts.get(boardKey(board, side)) || 0) >= 3) return { result: '1/2', reason: 'repetition' };
    if (plies >= maxPlies) return { result: '1/2', reason: 'maxPlies' };
    return null;
  };

  for (let i = 0; i < rec.moves.length; i++) {
    const early = terminalNow(i);
    if (early) return { ok: false, error: `partie déjà terminée (${early.reason}) avant le coup ${i + 1}` };
    const p = parseNotation(rec.moves[i]);
    const { captures, simples } = generateLegalMoves(board, side);
    let played = null;
    if (p.capture) {
      const cands = captures.filter((s) => s[0].from === p.from && s[s.length - 1].to === p.to);
      played = p.caps
        ? cands.find((s) => s.length === p.caps.length && s.map((x) => x.capturedThisStep).sort((a, b) => a - b).every((c, j) => c === p.caps[j]))
        : cands[0];
    } else if (captures.length === 0) {
      played = simples.find((m) => m.from === p.from && m.to === p.to);
    }
    if (!played) return { ok: false, error: `coup ${i + 1} (${rec.moves[i]}) illégal selon rules.js` };
    const piece = board[p.from];
    const irreversible = !piece.king || p.capture;
    board = p.capture ? applyCaptureSequence(board, piece, played).board : applySimpleMove(board, piece, played).board;
    side = side === 'w' ? 'b' : 'w';
    if (irreversible) { quiet = 0; counts.clear(); } else quiet++;
    const k = boardKey(board, side);
    counts.set(k, (counts.get(k) || 0) + 1);
  }
  const end = terminalNow(rec.moves.length);
  if (!end) return { ok: false, error: 'la partie enregistrée est terminée alors que rules.js la considère en cours' };
  if (end.result !== rec.result || end.reason !== rec.reason) {
    return { ok: false, error: `résultat enregistré ${rec.result}/${rec.reason}, rules.js attend ${end.result}/${end.reason}` };
  }
  if (rec.plies !== rec.moves.length) return { ok: false, error: 'nombre de demi-coups incohérent' };
  return { ok: true };
}

// Points de A dans une partie.
export function aPoints(rec, aIsWhite) {
  const w = resultPoints(rec.result);
  return aIsWhite ? w : 1 - w;
}
export { WHITE, BLACK };
