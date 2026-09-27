// DAMIKA — Sérialisation d'une partie en PDN ou TXT.

export function moveInfoToNotation(moveInfo) {
  const base = moveInfo.type === 'simple' ? `${moveInfo.from}-${moveInfo.to}`
    // Notation FMJD : seules les cases de départ et d'arrivée sont notées pour une rafle,
    // pas les étapes intermédiaires (ex. 30x19x28 s'écrit 30x28).
    : `${moveInfo.from}x${moveInfo.to}`;
  // Symbole d'annotation (!, ?, !!, ??) collé directement après la notation — convention
  // standard échecs/dames, distincte du commentaire {entre accolades} qui précède le coup.
  return moveInfo.annotation ? `${base}${moveInfo.annotation}` : base;
}

const HEADER_ORDER = ['Event', 'Site', 'Date', 'Round', 'White', 'Black', 'WhiteElo', 'BlackElo', 'Result'];

// Le tokenizer PDN (pdn/parser.js) ne gère pas les accolades imbriquées/échappées dans un
// commentaire { ... } : il s'arrête à la première "}" rencontrée. On retire donc { et } du
// texte à l'écriture plutôt que de produire un fichier que notre propre parseur ne
// relirait pas correctement.
function sanitizeComment(comment) {
  return String(comment).replace(/[{}]/g, '').trim();
}

// Le tokenizer attache un commentaire { ... } au PROCHAIN token 'move' qu'il rencontre
// après lui (`pendingComment`, cf. tokenizeMovetext dans parser.js) — convention "commentaire
// AVANT le coup qu'il annote", pas après. Écrire `{comment}` après la notation romprait le
// round-trip (le commentaire se retrouverait attribué au coup suivant en relecture).
function appendComment(notation, comment) {
  return comment ? `{${sanitizeComment(comment)}} ${notation}` : notation;
}

function movePairs(moves) {
  const parts = [];
  for (let i = 0; i < moves.length; i += 2) {
    const num = i / 2 + 1;
    const white = appendComment(moveInfoToNotation(moves[i]), moves[i].comment);
    const black = moves[i + 1] ? appendComment(moveInfoToNotation(moves[i + 1]), moves[i + 1].comment) : null;
    parts.push({ num, white, black });
  }
  return parts;
}

// { headers, moves: [moveInfo...] } — `result` n'est plus un paramètre séparé : source
// unique, dérivé de `headers.Result` (jamais un champ qui pourrait diverger de lui).
export function serializeToPdn({ headers = {}, moves }) {
  const result = headers.Result || '*';
  const lines = [];
  const allKeys = new Set([...HEADER_ORDER, ...Object.keys(headers)]);
  for (const key of allKeys) {
    if (key === 'Result') continue;
    const val = headers[key];
    if (val) lines.push(`[${key} "${val}"]`);
  }
  lines.push(`[Result "${result}"]`);
  lines.push('');

  const pairs = movePairs(moves);
  const movetext = pairs
    .map((p) => `${p.num}. ${p.white}${p.black ? ` ${p.black}` : ''}`)
    .join(' ');
  lines.push(`${movetext}${movetext ? ' ' : ''}${result}`.trim());
  return `${lines.join('\n')}\n`;
}

// Sérialise une entrée de bibliothèque telle que retournée par parsePdn() : les coups y
// sont déjà des chaînes de notation ({ notation }), pas des moveInfo structurés
// ({ from, to, type }) comme dans serializeToPdn ci-dessus — donc pas de moveInfoToNotation
// ici, on écrit directement `notation`. Le symbole d'annotation (!, ?, !!, ??), lui, peut
// arriver soit déjà inclus dans `notation` (entrée construite depuis la partie en cours, cf.
// currentGameAsLibraryEntry() dans main.js), soit séparé dans `annotation` (entrée issue
// directement de parsePdn(), qui le distingue du reste du token) — on ne le rajoute que dans
// ce second cas, jamais en double.
function libraryMoveNotation(move) {
  if (move.annotation && !move.notation.endsWith(move.annotation)) return `${move.notation}${move.annotation}`;
  return move.notation;
}
export function serializeLibraryEntryToPdn({ headers = {}, moves = [] }) {
  const result = headers.Result || '*';
  const lines = [];
  const allKeys = new Set([...HEADER_ORDER, ...Object.keys(headers)]);
  for (const key of allKeys) {
    if (key === 'Result') continue;
    const val = headers[key];
    if (val) lines.push(`[${key} "${val}"]`);
  }
  lines.push(`[Result "${result}"]`);
  lines.push('');

  const parts = [];
  for (let i = 0; i < moves.length; i += 2) {
    const num = i / 2 + 1;
    const white = appendComment(libraryMoveNotation(moves[i]), moves[i].comment);
    const black = moves[i + 1] ? appendComment(libraryMoveNotation(moves[i + 1]), moves[i + 1].comment) : null;
    parts.push(`${num}. ${white}${black ? ` ${black}` : ''}`);
  }
  const movetext = parts.join(' ');
  lines.push(`${movetext}${movetext ? ' ' : ''}${result}`.trim());
  return `${lines.join('\n')}\n`;
}

// Concatène toute une bibliothèque (tableau d'entrées parsePdn()) en un seul texte PDN
// multi-parties, rechargeable tel quel par parsePdn().
export function serializeLibraryToPdn(library) {
  return library.map(serializeLibraryEntryToPdn).join('\n');
}

export function serializeToTxt({ headers = {}, moves }) {
  const result = headers.Result || '*';
  const lines = [];
  if (headers.Event) lines.push(headers.Event);
  lines.push(`${headers.White || 'Blancs'} — ${headers.Black || 'Noirs'}`);
  const meta = [headers.Site, headers.Date, headers.Round ? `Ronde ${headers.Round}` : null]
    .filter(Boolean).join(' · ');
  if (meta) lines.push(meta);
  lines.push('');

  const pairs = movePairs(moves);
  for (const p of pairs) {
    lines.push(`${p.num}.  ${p.white}${p.black ? `   ${p.black}` : ''}`);
  }
  lines.push('');
  lines.push(`Résultat : ${result}`);
  return `${lines.join('\n')}\n`;
}
