// DAMIKA — Briques communes des outils de validation Turbo Dambase (td-check.mjs, td-full.mjs) : lecture du texte d'une
// partie PDN (indépendante de js/pdn/parser.js) et rejeu avec rules.js. Lecture seule, aucun nom de joueur manipulé ici.
import { initialBoard, generateLegalMoves, applyCaptureSequence, applySimpleMove } from '../js/engine/rules.js';

export const RESULTS = new Set(['1-0', '0-1', '1/2-1/2', '*']);
export const TAG_RE = /^\s*\[(\w+)\s+"(.*)"\]\s*$/;

// Texte de coups d'une partie (lignes déjà jointes) → { moves, result, hasVariation }. Commentaires {…} (sur plusieurs lignes
// possible), commentaires de fin de ligne « ; », variantes (…) imbriquées ou non, numéros de coups et NAG ($n) ignorés.
export function parseMovetext(bodyText) {
  const noComments = bodyText.replace(/\{[^}]*\}/g, ' ').replace(/;[^\n]*/g, ' ');
  let depth = 0;
  let hasVariation = false;
  let raw = '';
  for (const ch of noComments) {
    if (ch === '(') { depth++; hasVariation = true; raw += ' '; } else if (ch === ')') { depth = Math.max(0, depth - 1); raw += ' '; } else if (depth === 0) raw += ch;
  }
  const moves = [];
  let result = null;
  for (const tok of raw.split(/\s+/)) {
    if (!tok) continue;
    if (RESULTS.has(tok)) { result = tok; continue; }
    const t = tok.replace(/^\d+\.(\.\.)?/, ''); // « 12. », « 12... » ou collé : « 12.32-28 »
    if (!t || /^\$\d+$/.test(t)) continue;
    const m = /^(\d{1,2})([-x])(\d{1,2})((?:x\d{1,2})*)[!?+#]*$/.exec(t);
    if (m) moves.push({ text: t, from: Number(m[1]), sep: m[2], to: Number(m[3]), via: m[4] ? m[4].split('x').filter(Boolean).map(Number) : [] });
    else moves.push({ text: t, bad: true });
  }
  return { moves, result, hasVariation };
}

const listCaptures = (captures) => [...new Set(captures.map((s) => `${s[0].from}x${s[s.length - 1].to}`))].join(', ');

// Rejeu depuis la position initiale. Échec : { ok:false, ply, no, kind, why } ; `kind` = catégorie stable (pour les décomptes).
export function replay(g) {
  let board = initialBoard();
  let side = 'w';
  let ambiguous = 0;
  for (let i = 0; i < g.moves.length; i++) {
    const mv = g.moves[i];
    const no = `${Math.floor(i / 2) + 1}${i % 2 ? '...' : '.'} ${mv.text}`;
    const fail = (kind, why) => ({ ok: false, ply: i + 1, no, kind, why });
    if (mv.bad) return fail('jeton non reconnu', 'jeton non reconnu comme un coup');
    const { captures, simples } = generateLegalMoves(board, side);
    if (captures.length === 0 && simples.length === 0) return fail('coup après la fin de partie', 'la partie devrait être terminée (aucun coup légal)');
    const piece = board[mv.from];
    if (!piece) return fail('case de départ vide', `case de départ ${mv.from} vide`);
    if (piece.color !== side) return fail('mauvaise couleur', `pièce en ${mv.from} de la mauvaise couleur (trait aux ${side === 'w' ? 'Blancs' : 'Noirs'})`);
    if (mv.sep === 'x') {
      if (captures.length === 0) return fail('prise notée sans prise légale', 'prise notée (x) mais aucune prise légale');
      let cands = captures.filter((s) => s[0].from === mv.from && s[s.length - 1].to === mv.to);
      if (mv.via.length) { // chemin complet noté : cases d'arrivée de chaque étape
        const wanted = [mv.to, ...mv.via];
        cands = captures.filter((s) => s[0].from === mv.from && s.length === wanted.length && s.every((st, j) => st.to === wanted[j]));
      }
      if (cands.length === 0) {
        const same = captures.filter((s) => s[0].from === mv.from);
        return same.length
          ? fail('prise impossible pour cette pièce', `prise ${mv.from}x${mv.to} impossible (autres prises de cette pièce vers ${[...new Set(same.map((s) => s[s.length - 1].to))].join(', ')})`)
          : fail('pièce sans prise (autre prise obligatoire)', `la pièce en ${mv.from} n'a pas de prise (prises légales : ${listCaptures(captures)})`);
      }
      if (new Set(cands.map((s) => s.map((x) => x.capturedThisStep).sort((a, b) => a - b).join(','))).size > 1) ambiguous++;
      board = applyCaptureSequence(board, piece, cands[0]).board;
    } else {
      if (captures.length > 0) return fail('coup simple malgré une prise obligatoire', `coup simple alors qu'une prise est obligatoire (prises légales : ${listCaptures(captures)})`);
      const found = simples.find((m) => m.from === mv.from && m.to === mv.to);
      if (!found) return fail('coup simple non légal', `coup ${mv.from}-${mv.to} non légal pour cette pièce`);
      board = applySimpleMove(board, piece, found).board;
    }
    side = side === 'w' ? 'b' : 'w';
  }
  const end = generateLegalMoves(board, side);
  const noMoves = end.captures.length === 0 && end.simples.length === 0;
  return { ok: true, plies: g.moves.length, ambiguous, noMoves, loser: noMoves ? side : null };
}
