// DAMIKA — Film de la partie : rejeu d'une partie avec rules.js, plan des positions à mesurer, et assemblage des coups
// classés (P31). Fonctions PURES (aucun DOM, aucun Worker), utilisables par Node et par le navigateur. Les formules sont
// dans js/analysis/film-metrics.js ; ici on ne fait que préparer leurs entrées.
//
// « Enregistrement de position » (recs[i], i = 0 pour la position de départ, n pour la position finale) :
//   { scores: [14 pions, vue des Blancs] | absent, best: 'a-b' | 'axb' (meilleur coup de Scan à la profondeur 14, FMJD),
//     bestPos: position Hub (51 car.) après ce meilleur coup, pieces, terminal?, skipped?: raison, forced?, forcedMove?, forcedPos? }
// Même contenu que les lignes de out/p28/run-A/positions.jsonl (plus bestPos), sans aucun nom de joueur.

import { initialBoard, generateLegalMoves, applyCaptureSequence, applySimpleMove } from '../engine/rules.js';
import { toHubPosition } from '../ai/scan-protocol.js';
import { CAP, MIN_PIECES, DEPTH_REF, classifyMove, erosionCurve, topLosses, valueSeries, turningPoint, phaseSegments } from './film-metrics.js';

export const countAll = (board) => { let n = 0; for (let s = 1; s <= 50; s++) if (board[s]) n++; return n; };
export const other = (s) => (s === 'w' ? 'b' : 'w');

// Rejoue une liste de coups « 32-28 » / « 27x9 » (suffixe « /18.13 » facultatif = pièces prises).
// Retourne { ok, error, plies: [{ side, board (avant), notation, played, boardAfter }], final }.
export function replayMoves(moves) {
  let board = initialBoard();
  let side = 'w';
  const plies = [];
  for (let i = 0; i < moves.length; i++) {
    const m = /^(\d+)([-x])(\d+)(?:\/([\d.]+))?/.exec(String(moves[i]).replace(/[!?]+$/, ''));
    if (!m) return { ok: false, error: `coup ${i + 1} : notation illisible « ${moves[i]} »`, plies };
    const nums = moves[i].replace(/[!?]+$/, '').replace(/\/[\d.]+$/, '').split(/[-x]/).map(Number);
    const from = nums[0], to = nums[nums.length - 1], cap = m[2] === 'x';
    const wanted = m[4] ? m[4].split('.').map(Number).sort((a, b) => a - b) : null;
    const { captures, simples } = generateLegalMoves(board, side);
    let played = null;
    if (cap) {
      let c = captures.filter((s) => s[0].from === from && s[s.length - 1].to === to);
      const path = moves[i].replace(/[!?]+$/, '').replace(/\/[\d.]+$/, '').split(/[-x]/).map(Number);
      if (path.length > 2) c = c.filter((s) => s.length + 1 === path.length && s.every((st, j) => st.to === path[j + 1]));
      if (wanted) c = c.filter((s) => s.length === wanted.length && s.map((x) => x.capturedThisStep).sort((a, b) => a - b).every((v, j) => v === wanted[j]));
      if (c.length) {
        const after = c.map((s) => JSON.stringify(applyCaptureSequence(board, board[from], s).board));
        if (new Set(after).size > 1) return { ok: false, error: `coup ${i + 1} (${moves[i]}) : rafle ambiguë`, plies };
        played = { kind: 'capture', seq: c[0] };
      }
    } else if (captures.length === 0) {
      const s = simples.find((x) => x.from === from && x.to === to);
      if (s) played = { kind: 'simple', move: s };
    }
    if (!played) return { ok: false, error: `coup ${i + 1} (${moves[i]}) illégal selon rules.js`, plies };
    const piece = board[from];
    const boardAfter = played.kind === 'capture' ? applyCaptureSequence(board, piece, played.seq).board : applySimpleMove(board, piece, played.move).board;
    plies.push({ side, board, notation: moves[i].replace(/\/[\d.]+$/, ''), played, boardAfter });
    board = boardAfter;
    side = other(side);
  }
  return { ok: true, plies, final: { board, side } };
}

export const fmjd = (p) => (p.kind === 'capture' ? `${p.seq[0].from}x${p.seq[p.seq.length - 1].to}` : `${p.move.from}-${p.move.to}`);
export const capturedOf = (p) => (p.kind === 'capture' ? p.seq.map((s) => s.capturedThisStep) : []);
export function applyLegal(board, side, p) {
  if (p.kind === 'capture') return applyCaptureSequence(board, board[p.seq[0].from], p.seq).board;
  return applySimpleMove(board, board[p.move.from], p.move).board;
}

// Notation PDN d'un coup rejoué (élément de replayMoves().plies) : « 27x9 » ; si plusieurs rafles de même départ et
// arrivée donnent des plateaux différents, le chemin complet « 46x37x28 » (accepté par le chargeur PDN de DamikA).
export function pdnNotationOf(ply) {
  const p = ply.played;
  if (p.kind !== 'capture') return `${p.move.from}-${p.move.to}`;
  const from = p.seq[0].from, to = p.seq[p.seq.length - 1].to;
  const { captures } = generateLegalMoves(ply.board, ply.side);
  const same = captures.filter((s) => s[0].from === from && s[s.length - 1].to === to);
  const boards = new Set(same.map((s) => JSON.stringify(applyCaptureSequence(ply.board, ply.board[from], s).board)));
  return boards.size > 1 ? [from, ...p.seq.map((x) => x.to)].join('x') : `${from}x${to}`;
}

// Coup Hub de Scan (« 27x9x18 », pièces prises à la suite) → coup rules.js { kind, seq|move }, ou null.
export function hubToLegal(board, side, str) {
  const steps = str.split(/[-x]/).map(Number);
  const capture = str.includes('x');
  const { captures, simples, mustCapture } = generateLegalMoves(board, side);
  if (capture) {
    const caps = steps.slice(2).sort((a, b) => a - b);
    const cands = captures.filter((s) => s[0].from === steps[0] && s[s.length - 1].to === steps[1]);
    const hit = cands.find((s) => s.length === caps.length && s.map((x) => x.capturedThisStep).sort((a, b) => a - b).every((v, i) => v === caps[i]));
    if (hit) return { kind: 'capture', seq: hit };
    return caps.length === 0 && cands.length === 1 ? { kind: 'capture', seq: cands[0] } : null;
  }
  if (mustCapture) return null;
  const mv = simples.find((x) => x.from === steps[0] && x.to === steps[1]);
  return mv ? { kind: 'simple', move: mv } : null;
}

// Coups légaux DISTINCTS (deux rafles qui donnent le même plateau comptent pour un).
export function distinctMoves(board, side) {
  const { captures, simples } = generateLegalMoves(board, side);
  const s = new Map();
  for (const c of captures) s.set(JSON.stringify(applyLegal(board, side, { kind: 'capture', seq: c })), { kind: 'capture', seq: c });
  for (const m of simples) s.set(JSON.stringify(applyLegal(board, side, { kind: 'simple', move: m })), { kind: 'simple', move: m });
  return [...s.values()];
}

// Texte canonique d'une partie pour la clé du cache : coups seuls (notation nue, sans symbole ni « /pièces prises »),
// JAMAIS d'en-tête ni de nom de joueur.
export function canonicalGameText(moves) {
  return moves.map((m) => String(m).replace(/[!?]+$/, '').replace(/\/[\d.]+$/, '')).join(' ');
}

// Plan d'une partie : rejeu rules.js + une entrée par demi-coup (notations, position Hub après le coup joué) + les n+1 positions.
export function planGame(moves) {
  const rp = replayMoves(moves);
  if (!rp.ok) return { ok: false, error: rp.error };
  const plies = rp.plies.map((pl, k) => ({
    ply: k, moveNo: Math.floor(k / 2) + 1, side: pl.side, played: fmjd(pl.played), playedPdn: pdnNotationOf(pl),
    afterHub: toHubPosition(pl.boardAfter, other(pl.side)),
  }));
  const positions = [...rp.plies.map((p) => ({ board: p.board, side: p.side })), rp.final];
  return { ok: true, rp, plies, positions };
}

// Position qui ne demande PAS de recherche (camp au trait sans coup : perdu ; moins de MIN_PIECES pièces ; coup forcé),
// ou null si une recherche est nécessaire. Même ordre de tests que p28-run.mjs.
export function describePosition({ board, side }) {
  const pieces = countAll(board);
  const moves = distinctMoves(board, side);
  if (moves.length === 0) return { terminal: true, scores: Array(DEPTH_REF).fill(side === 'w' ? -CAP : CAP), best: null, bestPos: null, pieces };
  if (pieces < MIN_PIECES) return { skipped: 'finale ≤ 6 pièces', pieces };
  if (moves.length === 1) {
    return { forced: true, forcedMove: fmjd(moves[0]), forcedPos: toHubPosition(applyLegal(board, side, moves[0]), other(side)), pieces };
  }
  return null;
}

// Passe arrière : une position à coup forcé prend les valeurs de la suivante (comme p28-run.mjs). Ne modifie pas `recs`.
// `nPos` : nombre total de positions de la partie ; une dernière position à coup forcé n'a pas de suivante : écartée
// (comme en P28, où le dernier coup de la partie reste alors sans classement).
export function resolveRecs(recs, nPos = Infinity) {
  const out = recs.slice();
  if (out[nPos - 1] && out[nPos - 1].forced) out[nPos - 1] = { ...out[nPos - 1], skipped: 'forcé sans position suivante évaluée' };
  for (let i = Math.min(out.length, nPos) - 2; i >= 0; i--) {
    const r = out[i];
    if (!r || !r.forced) continue;
    const nx = out[i + 1];
    if (!nx) continue; // suivante pas encore mesurée : en attente
    if (nx.scores) out[i] = { ...r, scores: nx.scores, derived: true, best: r.forcedMove, bestPos: r.forcedPos };
    else if (nx.skipped || nx.forced) out[i] = { ...r, skipped: 'forcé sans position suivante évaluée' };
  }
  return out;
}

// Une ligne par demi-coup, classée avec les formules de film-metrics.js. Lignes : `pending` (pas encore mesurée),
// `skipped` (raison), ou classée (champs de classifyMove + best, same, pieces, afterTerminal).
export function buildMoveRows(plan, recsRaw) {
  const recs = resolveRecs(recsRaw, plan.positions.length);
  return plan.plies.map((pl) => {
    const base = { ply: pl.ply, moveNo: pl.moveNo, side: pl.side, played: pl.played, playedPdn: pl.playedPdn };
    const b = recs[pl.ply], a = recs[pl.ply + 1];
    if (!b) return { ...base, pending: true };
    if (b.skipped || b.forced || !b.scores) return { ...base, skipped: b.forced ? 'forcé' : (b.skipped || 'sans valeur') };
    if (!a || (a.forced && !a.scores && !a.skipped)) return { ...base, pending: true };
    if (!a.scores) return { ...base, skipped: a.skipped || 'position suivante sans valeur' };
    const same = !!b.bestPos && b.bestPos === pl.afterHub;
    const { Lraw, ...c } = classifyMove({ side: pl.side, pieces: b.pieces, same, scoresBefore: b.scores, scoresAfter: a.scores });
    return { ...base, best: b.best, same, pieces: b.pieces, afterTerminal: !!a.terminal, ...c, Lraw };
  });
}

// Partie prête pour l'écran : forme de out/p29/film.json (courbe, top) + meta { blancs, noirs, date, resultat, … }.
// `done` : nombre de demi-coups déjà classés (contigus depuis le début) ; la courbe grandit avec lui.
export function buildFilmGame(plan, recsRaw, meta = {}) {
  const rows = buildMoveRows(plan, recsRaw);
  const n = plan.plies.length;
  const done = rows.findIndex((r) => r.pending);
  const resolved = resolveRecs(recsRaw, plan.positions.length);
  const evals = valueSeries(resolved, n + 1); // P41 : une valeur par position (n+1), vue des Blancs, null = non analysée
  const pieces = Array.from({ length: n + 1 }, (_, k) => resolved[k]?.pieces ?? null);
  return {
    ...meta, plies: n, moves: plan.plies.map((p) => p.playedPdn), rows,
    done: done < 0 ? n : done,
    V: valueSeries(resolved, n),
    courbe: erosionCurve(rows),
    top: { w: topLosses(rows, 'w'), b: topLosses(rows, 'b') },
    // P41 : courbe d'évaluation, fautes signalées des deux camps (même forme que `top`), tournant, phases, échanges (coups avec prise)
    evals,
    // un coup joué identique au meilleur coup n'est JAMAIS un moment critique (garde-fou d'affichage, P42)
    faults: rows.filter((r) => r.signaled && !r.same && r.best !== r.played).map((r) => ({ ply: r.ply, no: r.moveNo, side: r.side, joue: r.played, meilleur: r.best ?? null, L: r.L, gravite: r.gravite, type: r.type ?? null, latence: r.latence ?? null })),
    tournant: turningPoint(rows, evals),
    pieces,
    phases: phaseSegments(pieces),
    echanges: plan.plies.filter((p) => p.played.includes('x')).map((p) => p.ply),
  };
}
