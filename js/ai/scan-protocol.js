// DAMIKA — Protocole Hub de Scan 3.1 (Fabien Letouzey, GPL-3.0) : fonctions PURES, sans accès au DOM ni au Worker, pour
// pouvoir les tester sous Node (tests/scan-protocol.mjs). Utilisées par js/ai/scan-worker.js.
//
// Rappels (docs/SESSION_DERNIERE.md, P20 / P21 / P24) :
//   - position Hub = 1 lettre de camp au trait (W / B) + 50 caractères (e vide, w/b pion, W/B dame) = 51 caractères ;
//   - coup simple « 32-28 » ; rafle « départ x arrivée x pièces-prises… » (ex. « 20x29x24 »), PAS le chemin ;
//   - score en PIONS, du point de vue du camp AU TRAIT (négamax, vérifié : départ Blancs 0,00 ; partie 3 Blancs −0,78
//     alors que les Noirs ont gagné) ; ce module le ramène au point de vue des BLANCS, comme js/ai/search.js ;
//   - un score ≥ 98 (en valeur absolue) est un mat (« 99.xx » : fin de partie proche), 80 à 98 une finale gagnée
//     reconnue (tables de finale, « 89.xx »).
//
// La légalité de chaque coup est TOUJOURS vérifiée avec generateLegalMoves() de js/engine/rules.js (source de vérité
// de l'interface) : un coup de Scan que le moteur de règles ne reconnaît pas n'est jamais montré.

import { generateLegalMoves, applyCaptureSequence, applySimpleMove } from '../engine/rules.js';

export const HUB_POSITION_RE = /^[WB][ewbWB]{50}$/;

// Position de l'interface (board 51 éléments, side 'w'|'b') → chaîne Hub. Lève si la chaîne n'a pas 51 caractères
// valides (Scan répond « bad position » MAIS continue sur la position précédente : on valide avant d'envoyer).
export function toHubPosition(board, side) {
  let s = side === 'w' ? 'W' : 'B';
  for (let sq = 1; sq <= 50; sq++) {
    const p = board[sq];
    if (p && p.color !== 'w' && p.color !== 'b') throw new Error(`pièce invalide en case ${sq}`);
    s += !p ? 'e' : p.color === 'w' ? (p.king ? 'W' : 'w') : (p.king ? 'B' : 'b');
  }
  if (!HUB_POSITION_RE.test(s)) throw new Error(`position Hub invalide (${s.length} caractères)`);
  return s;
}

// Coup Hub → coup de rules.js (même forme que generateLegalMoves : { kind: 'simple', move } ou { kind: 'capture', seq }),
// ou null si illégal ou ambigu.
export function matchLegal(board, side, moveStr) {
  if (typeof moveStr !== 'string' || !/^\d+([-x]\d+)+$/.test(moveStr)) return null;
  const steps = moveStr.split(/[-x]/).map(Number);
  const capture = moveStr.includes('x');
  const from = steps[0];
  const to = steps[1];
  const { captures, simples, mustCapture } = generateLegalMoves(board, side);
  if (capture) {
    const caps = steps.slice(2).sort((a, b) => a - b);
    const cands = captures.filter((s) => s[0].from === from && s[s.length - 1].to === to);
    if (!cands.length) return null;
    const hit = cands.find((s) => s.length === caps.length
      && s.map((x) => x.capturedThisStep).sort((a, b) => a - b).every((c, i) => c === caps[i]));
    if (hit) return { kind: 'capture', seq: hit };
    // Sans pièces prises indiquées (format inattendu) : seulement si la rafle est unique.
    return caps.length === 0 && cands.length === 1 ? { kind: 'capture', seq: cands[0] } : null;
  }
  if (mustCapture) return null;
  const m = simples.find((x) => x.from === from && x.to === to);
  return m ? { kind: 'simple', move: m } : null;
}

// Coup au format « interface » de js/ai/search.js (celui de bestMove / pv) : tableau d'étapes pour une rafle,
// { from, to } pour un coup simple. Notation FMJD d'affichage : « 32-28 » ou « 27x9 » (départ × arrivée).
export const uiMoveOf = (m) => (m.kind === 'capture' ? m.seq : m.move);
export function notationOf(m) {
  if (m.kind === 'capture') return `${m.seq[0].from}x${m.seq[m.seq.length - 1].to}`;
  return `${m.move.from}-${m.move.to}`;
}

// Joue un coup (résultat de matchLegal) et rend le plateau suivant. Le plateau d'entrée n'est pas modifié.
export function playMatched(board, side, m) {
  if (m.kind === 'capture') {
    const piece = board[m.seq[0].from];
    return applyCaptureSequence(board, piece, m.seq).board;
  }
  return applySimpleMove(board, board[m.move.from], m.move).board;
}

// Ligne `info …` de Scan → { depth, meanDepth, score (pions, point de vue du camp au trait), nodes, timeS, pv: ['32-28', …] }
// ou null si ce n'est pas une ligne `info` exploitable (sans profondeur ni score). Tolère l'ordre et l'absence des champs.
export function parseInfo(line) {
  if (typeof line !== 'string' || !line.startsWith('info')) return null;
  const f = {};
  const re = /([\w-]+)=(?:"([^"]*)"|(\S+))/g;
  let m;
  while ((m = re.exec(line)) !== null) f[m[1]] = m[2] !== undefined ? m[2] : m[3];
  const depth = Number(f.depth);
  const score = Number(f.score);
  if (!Number.isFinite(depth) || !Number.isFinite(score)) return null;
  return {
    depth,
    meanDepth: Number(f['mean-depth']) || null,
    score,
    nodes: Number(f.nodes) || 0,
    timeS: Number(f.time) || 0,
    pv: f.pv ? f.pv.split(/\s+/).filter(Boolean) : [],
  };
}

// Ligne `done move=… ponder=…` → { move, ponder } ou null.
export function parseDone(line) {
  if (typeof line !== 'string' || !line.startsWith('done')) return null;
  const mv = /(?:^|\s)move=(\S+)/.exec(line);
  const pd = /(?:^|\s)ponder=(\S+)/.exec(line);
  return { move: mv ? mv[1] : null, ponder: pd ? pd[1] : null };
}

// Plafond d'affichage d'une finale gagnée reconnue par les tables (score Hub 80 à 98) : l'échelle de l'interface
// (jauge, paliers) sature bien avant ; 15 pions évite d'afficher « +89,6 ».
export const TABLEBASE_WIN_CP = 1500;
// Un score Hub d'au moins 98 pions est un mat : win(ply) = 100 − ply/100 (score.hpp de Scan), ply ≤ 200.
export const MATE_SCORE_MIN = 98;
export const TABLEBASE_SCORE_MIN = 80;

// Score Hub (pions, camp AU TRAIT) → { score (centipions, point de vue des BLANCS), mate, tablebase }.
// mate = null ou { winner, in } : `in` = nombre de coups du camp gagnant (ply = (100 − |score|)·100 demi-coups).
export function scoreFields(hubScore, side) {
  const abs = Math.abs(hubScore);
  const sign = (hubScore >= 0 ? 1 : -1) * (side === 'w' ? 1 : -1); // + : avantage des Blancs
  if (abs >= MATE_SCORE_MIN) {
    const plies = Math.max(1, Math.round((100 - abs) * 100));
    return { score: sign * 3000, mate: { winner: sign > 0 ? 'w' : 'b', in: Math.ceil(plies / 2) }, tablebase: false };
  }
  if (abs >= TABLEBASE_SCORE_MIN) return { score: sign * TABLEBASE_WIN_CP, mate: null, tablebase: true };
  return { score: sign * Math.round(abs * 100), mate: null, tablebase: false };
}

// Rejoue une ligne principale Hub sur `board` et la convertit : { pv: [coups « interface »], pvNotation: ['32-28', …],
// best: premier coup apparié ou null }. S'arrête au premier coup que rules.js ne reconnaît pas (ligne tronquée, jamais
// un coup illégal affiché). Le premier coup illégal est signalé par `illegalFirst` (le Worker ne l'affiche pas).
export function convertPv(board, side, hubMoves) {
  const pv = [];
  const pvNotation = [];
  let b = board;
  let s = side;
  let illegalFirst = false;
  for (let i = 0; i < hubMoves.length; i++) {
    const m = matchLegal(b, s, hubMoves[i]);
    if (!m) { if (i === 0) illegalFirst = true; break; }
    pv.push(uiMoveOf(m));
    pvNotation.push(notationOf(m));
    b = playMatched(b, s, m);
    s = s === 'w' ? 'b' : 'w';
  }
  return { pv, pvNotation, illegalFirst };
}

// Résultat d'analyse au format de js/ai/search.js (voir js/ai/worker.js) : { score, mate, bestMove, bestMoveNotation,
// pv, pvNotation, depth, nodes, nps, timeMs, stopped, drawRule }, plus `tablebase` (finale gagnée reconnue).
// `info` = parseInfo(...) ; `fallbackMove` (coup du `done`) sert si la ligne n'a pas de variante (coup forcé…).
export function buildResult(position, info, { stopped = false, fallbackMove = null } = {}) {
  const { board, side } = position;
  const sf = scoreFields(info.score, side);
  const hubMoves = info.pv.length ? info.pv : (fallbackMove ? [fallbackMove] : []);
  const conv = convertPv(board, side, hubMoves);
  const timeMs = Math.round(info.timeS * 1000);
  return {
    score: sf.score,
    mate: sf.mate,
    tablebase: sf.tablebase,
    bestMove: conv.pv[0] ?? null,
    bestMoveNotation: conv.pvNotation[0] ?? null,
    pv: conv.pv,
    pvNotation: conv.pvNotation,
    depth: info.depth,
    nodes: info.nodes,
    nps: timeMs > 0 ? Math.round(info.nodes / (timeMs / 1000)) : 0,
    timeMs,
    stopped,
    drawRule: null,
  };
}

// Résultat d'une partie déjà terminée (camp au trait sans coup) : le Hub ne doit JAMAIS recevoir une position terminale.
// Même convention que js/ai/search.js : mate.in = 0, le camp au trait a perdu.
export function terminalResult(side) {
  return {
    score: side === 'w' ? -3000 : 3000,
    mate: { winner: side === 'w' ? 'b' : 'w', in: 0 },
    tablebase: false,
    bestMove: null, bestMoveNotation: null, pv: [], pvNotation: [],
    depth: 0, nodes: 0, nps: 0, timeMs: 0, stopped: false, drawRule: null,
  };
}

export function hasLegalMove(board, side) {
  const { captures, simples } = generateLegalMoves(board, side);
  return captures.length + simples.length > 0;
}

// Coups de dame (réversibles) d'une fenêtre d'historique, pour l'argument `moves` du Hub (détection des répétitions) :
// history = { positions: [{ board, side }], quiet } (js/ai/analysis-format.js, analysisHistory) = les `quiet` positions
// AVANT la position analysée. Retourne { pos, moves } où `pos` = la plus ancienne de ces positions et `moves` la suite
// de coups jusqu'à la position analysée (« 28-33 33-28 … »), ou null si pas d'historique exploitable. Chaque coup est
// déduit des plateaux voisins (case vidée → case occupée) ; au moindre doute (≠ 1 case vidée et 1 occupée), null.
export function hubHistory(position, history) {
  if (!history || !history.positions || history.positions.length === 0 || !(history.quiet > 0)) return null;
  const seq = [...history.positions, { board: position.board, side: position.side }];
  const moves = [];
  for (let i = 0; i + 1 < seq.length; i++) {
    const a = seq[i].board;
    const b = seq[i + 1].board;
    const gone = [];
    const came = [];
    for (let sq = 1; sq <= 50; sq++) {
      if (a[sq] && !b[sq]) gone.push(sq);
      else if (!a[sq] && b[sq]) came.push(sq);
    }
    if (gone.length !== 1 || came.length !== 1) return null;
    moves.push(`${gone[0]}-${came[0]}`);
  }
  try {
    return { pos: toHubPosition(seq[0].board, seq[0].side), moves: moves.join(' ') };
  } catch {
    return null;
  }
}
