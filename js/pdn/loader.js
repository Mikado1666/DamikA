// DAMIKA — Rejoue une partie parsée depuis un PDN sur un DraughtsGame frais,
// en validant chaque coup contre le moteur de règles (source de vérité unique).
import { DraughtsGame } from '../engine/rules.js';

function sequenceMatchesFullPath(seq, squares) {
  if (seq.length + 1 !== squares.length) return false;
  if (seq[0].from !== squares[0]) return false;
  for (let i = 0; i < seq.length; i++) {
    if (seq[i].to !== squares[i + 1]) return false;
  }
  return true;
}

// parsedGame: { headers, moves: [{ply,color,notation,annotation,comment}], result }
export function loadGameFromPdn(parsedGame) {
  const game = new DraughtsGame();
  const warnings = [];
  let loadedCount = 0;

  for (const mv of parsedGame.moves) {
    const squares = mv.notation.split(/[x-]/).map(Number);
    const isCapture = mv.notation.includes('x');
    const { captures, simples } = game.legalMoves;

    if (isCapture) {
      let seq = captures.find((s) => sequenceMatchesFullPath(s, squares));
      if (!seq) {
        // Notation abrégée (seulement les extrémités) : on cherche une séquence
        // légale unique qui commence et finit sur les mêmes cases.
        const endpointMatches = captures.filter(
          (s) => s[0].from === squares[0] && s[s.length - 1].to === squares[squares.length - 1]
        );
        if (endpointMatches.length >= 1) seq = endpointMatches[0];
      }
      if (!seq) {
        warnings.push(`Coup ${mv.ply} (${mv.notation}) illégal ou introuvable — import arrêté à ce coup.`);
        break;
      }
      game.playCaptureSequence(seq);
    } else {
      const simple = simples.find((m) => m.from === squares[0] && m.to === squares[1]);
      if (!simple) {
        warnings.push(`Coup ${mv.ply} (${mv.notation}) illégal ou introuvable — import arrêté à ce coup.`);
        break;
      }
      game.playSimpleMove(simple);
    }
    // Le coup vient d'être commité en tête de `history` — reporter son commentaire et son
    // symbole d'annotation (!, ?, !!, ??) PDN, déjà lus par le parseur.
    if (mv.comment) game.setCommentAt(game.history.length - 1, mv.comment);
    if (mv.annotation) game.setAnnotationAt(game.history.length - 1, mv.annotation);
    loadedCount += 1;
  }

  // On revient au tout début : la navigation avant/arrière existante (undo/redo)
  // permet ensuite de parcourir la partie coup par coup depuis le départ.
  while (game.undo()) { /* noop */ }

  return {
    game,
    headers: parsedGame.headers,
    result: parsedGame.result,
    warnings,
    totalMoves: parsedGame.moves.length,
    loadedMoves: loadedCount,
  };
}
