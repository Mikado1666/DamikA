// DAMICK — Parseur PDN (Portable Draughts Notation)
// Supporte : en-têtes multiples, plusieurs parties dans un même fichier,
// commentaires { ... } et ; jusqu'à fin de ligne, variations ( ... ) ignorées,
// annotations de coup (!, ?, !!, ??, etc.) et NAG ($n).

const RESULT_TOKENS = new Set(['1-0', '0-1', '1/2-1/2', '*']);
const MOVE_ANNOTATION_SUFFIX = /^([0-9x\-]+)([!?]*)$/;

// --- Étape 1 : découpage du texte brut en blocs de parties -------------------
// Un bloc = un groupe d'en-têtes [Clé "valeur"] suivi du texte des coups,
// jusqu'au prochain bloc d'en-têtes ou la fin du fichier.
function splitIntoGameBlocks(text) {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const blocks = [];
  let current = null;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    const isHeaderLine = /^\[\w+\s+".*"\]$/.test(line);

    if (isHeaderLine) {
      if (current && current.movetextLines.length > 0) {
        // Un nouveau bloc d'en-têtes après du texte de coups : nouvelle partie.
        blocks.push(current);
        current = null;
      }
      if (!current) current = { headerLines: [], movetextLines: [] };
      current.headerLines.push(line);
    } else if (line.length > 0) {
      if (!current) current = { headerLines: [], movetextLines: [] };
      current.movetextLines.push(line);
    }
    // lignes vides : simples séparateurs, ignorées (pas de fin de bloc forcée ici,
    // pour tolérer les fichiers qui séparent en-têtes et coups par une ligne vide)
  }
  if (current && (current.headerLines.length > 0 || current.movetextLines.length > 0)) {
    blocks.push(current);
  }
  return blocks;
}

// --- Étape 2 : parsing des en-têtes -------------------------------------------
function parseHeaders(headerLines) {
  const headers = {};
  const re = /^\[(\w+)\s+"(.*)"\]$/;
  for (const line of headerLines) {
    const m = re.exec(line);
    if (m) headers[m[1]] = m[2];
  }
  return headers;
}

// --- Étape 3 : tokenisation du texte des coups --------------------------------
// Gère { commentaires }, ; commentaires de fin de ligne, ( variations ) ignorées,
// $NAG ignorés, numéros de coup "12." et tokens de coup "32-28" / "27x18x9".
function tokenizeMovetext(movetext) {
  const tokens = [];
  let i = 0;
  const n = movetext.length;
  let pendingComment = null;

  while (i < n) {
    const ch = movetext[i];
    if (/\s/.test(ch)) { i++; continue; }
    if (ch === ';') {
      const eol = movetext.indexOf('\n', i);
      i = eol === -1 ? n : eol + 1;
      continue;
    }
    if (ch === '{') {
      const end = movetext.indexOf('}', i);
      const content = end === -1 ? movetext.slice(i + 1) : movetext.slice(i + 1, end);
      pendingComment = (pendingComment ? pendingComment + ' ' : '') + content.trim();
      i = end === -1 ? n : end + 1;
      continue;
    }
    if (ch === '(') {
      // Variation : on ignore tout le contenu jusqu'à la parenthèse fermante correspondante.
      let depth = 1;
      let j = i + 1;
      while (j < n && depth > 0) {
        if (movetext[j] === '(') depth++;
        else if (movetext[j] === ')') depth--;
        j++;
      }
      i = j;
      continue;
    }
    // Token "brut" jusqu'au prochain espace/parenthèse/accolade
    let j = i;
    while (j < n && !/[\s{(]/.test(movetext[j])) j++;
    const raw = movetext.slice(i, j);
    i = j;
    if (raw.length === 0) continue;

    if (RESULT_TOKENS.has(raw)) {
      tokens.push({ type: 'result', value: raw, comment: pendingComment });
      pendingComment = null;
      continue;
    }
    if (/^\d+\.+$/.test(raw)) {
      tokens.push({ type: 'movenum', value: raw });
      continue;
    }
    if (/^\$\d+$/.test(raw)) {
      continue; // NAG ignoré pour l'instant
    }
    tokens.push({ type: 'move', value: raw, comment: pendingComment });
    pendingComment = null;
  }
  return tokens;
}

// --- Étape 4 : construction de la liste de coups à partir des tokens ---------
function buildMoveList(tokens) {
  const moves = [];
  let result = '*';
  let ply = 0;

  for (const tok of tokens) {
    if (tok.type === 'result') { result = tok.value; continue; }
    if (tok.type === 'movenum') continue;
    if (tok.type === 'move') {
      const m = MOVE_ANNOTATION_SUFFIX.exec(tok.value);
      if (!m) continue; // token non reconnu (ex: notation exotique), ignoré
      const [, notation, annotation] = m;
      if (!/[0-9]+[x-][0-9]/.test(notation)) continue;
      ply += 1;
      moves.push({
        ply,
        color: ply % 2 === 1 ? 'w' : 'b',
        notation,
        annotation: annotation || null,
        comment: tok.comment || null,
      });
    }
  }
  return { moves, result };
}

// --- API publique --------------------------------------------------------------
// parsePdn(text) -> [{ headers, moves: [{ply,color,notation,annotation,comment}], result }, ...]
export function parsePdn(text) {
  const blocks = splitIntoGameBlocks(text);
  return blocks.map((block) => {
    const headers = parseHeaders(block.headerLines);
    const { moves, result } = buildMoveList(tokenizeMovetext(block.movetextLines.join('\n')));
    return { headers, moves, result: headers.Result || result };
  }).filter((g) => Object.keys(g.headers).length > 0 || g.moves.length > 0);
}
