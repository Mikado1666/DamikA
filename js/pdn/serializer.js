// DAMICK — Sérialisation d'une partie en PDN ou TXT.

export function moveInfoToNotation(moveInfo) {
  if (moveInfo.type === 'simple') return `${moveInfo.from}-${moveInfo.to}`;
  return [moveInfo.from, ...moveInfo.path].join('x');
}

const HEADER_ORDER = ['Event', 'Site', 'Date', 'Round', 'White', 'Black', 'WhiteElo', 'BlackElo', 'Result'];

function movePairs(moves) {
  const parts = [];
  for (let i = 0; i < moves.length; i += 2) {
    const num = i / 2 + 1;
    const white = moveInfoToNotation(moves[i]);
    const black = moves[i + 1] ? moveInfoToNotation(moves[i + 1]) : null;
    parts.push({ num, white, black });
  }
  return parts;
}

// { headers, moves: [moveInfo...], result }
export function serializeToPdn({ headers = {}, moves, result = '*' }) {
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

export function serializeToTxt({ headers = {}, moves, result = '*' }) {
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
