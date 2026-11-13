// DAMIKA — écran « Analyse de la partie » (fichiers film*, vocabulaire P34) : courbe des imprécisions cumulées par camp + 3 plus grosses pertes par camp, cliquables (P29, P31).
// Mode normal (P31) : la partie ouverte dans DamikA (sessionStorage, clé damika:film-current, écrite au clic sur « Film »)
// est mesurée en direct par Scan 3.1 (WebAssembly) dans un Worker ; les valeurs par position sont gardées dans IndexedDB.
// Mode test : film.html?demo=1 lit les 7 parties mesurées en P40 (training/scan-arena/out/p40/, produit par
// p40-run.mjs, ignoré par git car il contient des noms de joueurs). Dans les deux cas les coups sont rejoués avec rules.js.
import { initialBoard, generateLegalMoves } from './engine/rules.js';
import { BoardRenderer } from './render/board.js';
import { readUiTheme, applyUiTheme, applySavedBoardSettings } from './render/board-settings.js';
import { MIN_PLIES, DEPTH_REF, DEPTH_FROM, CAP, EVAL_TICKS, EVAL_ZONE, evalY, difficultyOf, moveVerdict } from './analysis/film-metrics.js';
import { replayMoves, planGame, buildFilmGame, canonicalGameText } from './analysis/film-game.js';
import { createFilmRunner, FilmCancelled } from './analysis/film-runner.js';
import { storyOf, STORY_TEXT } from './analysis/film-story.js';
import { playSound } from './sound.js';
import { hashText, loadAnalysis, saveAnalysis } from './analysis/film-cache.js';

export const DEMO_DIR = 'training/scan-arena/out/p40/';
export const FILM_STORAGE_KEY = 'damika:film-current';
const DEMO = new URLSearchParams(location.search).get('demo') === '1';
// Couleurs du graphique : variables CSS de l'appli (thème clair / sombre), jamais de valeur en dur.
const C = { gold: 'var(--gold)', text: 'var(--text-0)', border: 'var(--panel-border)', muted: 'var(--text-2)', bg: 'var(--panel)' };
const $ = (id) => document.getElementById(id);
const fr = (x, d = 2) => x.toFixed(d).replace('.', ',');

// ---- rejeu (film-game.js, rules.js) : plateaux après chaque demi-coup + cases de chaque coup ----
function replay(moves) {
  const r = replayMoves(moves);
  const cap = (p) => p.kind === 'capture';
  return {
    boards: [initialBoard(), ...r.plies.map((p) => p.boardAfter)],
    steps: r.plies.map((p) => ({ from: cap(p.played) ? p.played.seq[0].from : p.played.move.from, to: cap(p.played) ? p.played.seq[p.played.seq.length - 1].to : p.played.move.to, side: p.side })),
    error: r.ok ? null : r.error,
  };
}

// ---- état ----
const S = { cards: null, data: null, g: 0, ply: 0, focus: null, rp: null, flipped: false, view: 'eval', touched: false, zoom: null }; // view : 'eval' (défaut) ou 'cum', non persisté
// Thème d'interface, thème du damier, style et taille des pions : MÊMES réglages que l'appli (js/render/board-settings.js),
// et MÊME dessin (BoardRenderer, js/render/board.js). Le thème est posé avant la création du renderer (il lit les couleurs CSS).
applyUiTheme(readUiTheme());
const canvas = $('film-board');
const renderer = new BoardRenderer(canvas);
applySavedBoardSettings(renderer);

const nameOf = (s) => { const [n, p] = String(s ?? '').split(',').map((x) => x.trim()); return p ? `${p} ${n}` : n; };
const resText = (r) => (r === '2-0' || r === '1-0' ? '1-0' : r === '0-2' || r === '0-1' ? '0-1' : r === '1-1' ? '½-½' : '*');
const gravText = { majeure: 'faute majeure', faute: 'faute', 'légère': 'faute légère', gagnant: 'position restée largement gagnante' };

// ---- damier (BoardRenderer de l'appli) ----
// Flèche du « dernier coup » du renderer = coup JOUÉ (rouge, --arrow-color surchargée dans film.css), flèche du « meilleur
// coup » = meilleur coup de Scan (verte, --best-arrow-color de l'appli). Hors d'une perte choisie : pas de flèche, seules
// les cases du dernier coup sont éclairées.
function drawBoard() {
  if (!S.rp) return;
  const st = S.focus ? S.rp.steps[S.focus.ply] : S.rp.steps[S.ply - 1];
  renderer.setFlipped(S.flipped);
  renderer.showArrow = !!S.focus || S.ply > 0; // moment critique : position AVANT avec les deux flèches ; coup ordinaire : position APRÈS avec la flèche du coup joué
  renderer.bestMove = null;
  if (S.focus && S.focus.meilleur) renderer.bestMove = { squares: S.focus.meilleur.split(/[-x]/).map(Number) };
  renderer.setState({ board: S.rp.boards[S.ply], lastMove: st ? { squares: [st.from, st.to] } : null });
}

// ---- courbes (SVG) : « Évaluation » (P41, par défaut) et « Imprécisions cumulées » (P29, inchangée) ----
// P41B : le viewBox épouse la taille RÉELLE du SVG (1 unité = 1 pixel écran, redessiné au redimensionnement) : les tailles de
// police écrites ici sont donc les tailles réelles à l'écran, jamais mises à l'échelle.
const NS = 'http://www.w3.org/2000/svg';
const mk = (tag, attrs = {}, parent) => { const e = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) { if (typeof v === 'string' && v.startsWith('var(')) e.style.setProperty(k, v); else e.setAttribute(k, v); } if (parent) parent.appendChild(e); return e; };
// Géométrie de la courbe affichée (posée par chaque tracé, lue par le clic et le survol).
const GEO = { W: 600, H: 230, M: { l: 34, r: 10, t: 26, b: 22 }, n: 0, a: 0, b: 1 };
// Zoom (P43) : axe des coups seulement ; plage visible [a, b] en POSITIONS (0..n), S.zoom = null : « Tout voir ». Non persisté.
const ZOOM = { MIN_SPAN: 12, FACTOR: 1.5, PAN: 0.25, DRAG_PX: 6, PASTILLE_GAP: 27 }; // 12 positions = 6 coups visibles au plus fort ; 1,5 par cran ; ◀ ▶ = 1/4 de la plage
const plotX = (k) => GEO.M.l + ((k - GEO.a) / Math.max(1e-6, GEO.b - GEO.a)) * (GEO.W - GEO.M.l - GEO.M.r);
const inView = (k) => k >= GEO.a - 1e-9 && k <= GEO.b + 1e-9;
// Graduations en coups : le plus petit pas (1, 2, 5, 10, 20, 50) qui laisse au moins 60 px entre deux numéros
function coupSteps(from, to) {
  const ppp = (GEO.W - GEO.M.l - GEO.M.r) / Math.max(1e-6, GEO.b - GEO.a), step = [1, 2, 5, 10, 20, 50].find((s) => s * 2 * ppp >= 60) ?? 50, out = [];
  for (let m = step; 2 * m <= to; m += step) if (2 * m >= from) out.push(m);
  return out;
}
const FS = 14; // taille minimale du texte à l'écran (graduations, numéros de coups, étiquettes)
function geoFor(view) {
  const r = $('film-chart').getBoundingClientRect();
  const W = Math.max(320, Math.round(r.width) || 600), H = Math.max(160, Math.round(r.height) || 260);
  return view === 'eval' ? { W, H, M: { l: 54, r: 16, t: 24, b: 62 } } : { W, H, M: { l: 46, r: 16, t: 66, b: 34 } };
}
const signed = (v, d = 1) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${fr(Math.abs(v), d)}`;
const graviteVar = { 'légère': 'var(--fault-light)', faute: 'var(--fault-mid)', majeure: 'var(--fault-major)' };
const helpOf = (view) => (view === 'eval'
  ? 'La courbe montre qui est mieux placé à chaque coup : au-dessus de zéro, les Blancs ; en dessous, les Noirs. Les pastilles numérotées sont les coups où un camp a mal joué (jaune : petite faute, orange : faute, rouge : grosse faute). Sous la courbe : les phases de la partie, et un trait à chaque échange de pièces.'
  : 'Chaque palier est une petite imprécision de l\'un des camps (trop petite pour être une faute), additionnée coup après coup : plus la ligne monte, plus le camp a laissé filer d\'avantage petit à petit. Les cercles numérotés marquent les trois plus grosses pertes de chaque camp.');
const legendOf = (view, box) => {
  box.replaceChildren();
  const add = (cls, text) => { const s = document.createElement('span'); s.className = cls; box.append(s, document.createTextNode(text)); };
  if (view === 'eval') { add('lg lg-ew', 'Avantage Blancs'); add('lg lg-eb', 'Avantage Noirs'); add('dt dt-light', 'légère'); add('dt dt-mid', 'faute'); add('dt dt-major', 'majeure'); }
  else { add('lg lg-w', 'Blancs'); add('lg lg-b', 'Noirs'); }
};

function drawChart() {
  const svg = $('film-chart');
  svg.replaceChildren();
  const g = S.data.parties[S.g];
  document.querySelectorAll('.film-toggle button').forEach((b) => { const on = b.dataset.view === S.view; b.classList.toggle('active', on); b.setAttribute('aria-pressed', String(on)); });
  legendOf(S.view, $('film-legend'));
  $('film-help-chart').textContent = helpOf(S.view);
  hideTip();
  const geo = geoFor(S.view);
  Object.assign(GEO, geo, { n: g.plies, a: S.zoom ? S.zoom.a : 0, b: S.zoom ? S.zoom.b : g.plies });
  svg.setAttribute('viewBox', `0 0 ${geo.W} ${geo.H}`);
  if (S.view === 'eval') drawEvalChart(g, svg); else drawCumChart(g, svg);
  updateZoomBar();
}
// Redessin quand la taille du cadre de la courbe change (fenêtre, mise en page).
new ResizeObserver(() => { if (S.data && S.rp) { cancelAnimationFrame(drawChart._raf); drawChart._raf = requestAnimationFrame(drawChart); } }).observe($('film-chart-box'));

function drawCumChart(g, svg) {
  const { W, H, M } = GEO;
  svg.setAttribute('aria-label', 'Courbe des imprécisions cumulées par camp');
  const n = g.plies, ymax = Math.max(1, ...g.courbe.map((c) => Math.max(c[1], c[2]))) * 1.08;
  const X = plotX, Y = (v) => H - M.b - (v / ymax) * (H - M.t - M.b);
  // quadrillage
  const step = ymax > 14 ? 5 : ymax > 6 ? 2 : 1;
  for (let v = 0; v <= ymax; v += step) {
    mk('line', { x1: M.l, x2: W - M.r, y1: Y(v), y2: Y(v), stroke: C.border, 'stroke-width': 1 }, svg);
    mk('text', { x: M.l - 8, y: Y(v) + 5, 'text-anchor': 'end', fill: C.muted, 'font-size': FS }, svg).textContent = v;
  }
  for (const m of coupSteps(GEO.a, GEO.b)) mk('text', { x: X(m * 2), y: H - 8, 'text-anchor': 'middle', fill: C.muted, 'font-size': FS }, svg).textContent = m;
  const plot = mk('g', { 'clip-path': 'url(#film-clip-x)' }, svg);
  mk('rect', { x: M.l, y: 0, width: W - M.l - M.r, height: H }, mk('clipPath', { id: 'film-clip-x' }, mk('defs', {}, svg)));
  // courbes en escalier : le cumul bouge après chaque coup du camp
  for (const [idx, col, side] of [[1, C.text, 'w'], [2, C.gold, 'b']]) {
    let d = `M ${X(0)} ${Y(0)}`;
    for (const c of g.courbe) d += ` L ${X(c[0] + 1)} ${Y(c[idx])}`;
    mk('path', { d, fill: 'none', stroke: col, 'stroke-width': 3, 'stroke-linejoin': 'round', ...(side === 'b' ? { 'stroke-dasharray': '9 5' } : {}) }, plot);
  }
  // repères des 3 plus grosses pertes de chaque camp (sur la bande du haut)
  for (const side of ['w', 'b']) g.top[side].forEach((l, i) => {
    if (!inView(l.ply + 0.5)) return;
    const col = side === 'w' ? C.text : C.gold, x = X(l.ply + 0.5), y = side === 'w' ? 16 : 44;
    const a = mk('g', { class: 'mk', 'data-ply': l.ply, 'data-side': side, 'data-rank': i, style: 'cursor:pointer' }, svg);
    mk('line', { x1: x, x2: x, y1: y + 13, y2: H - M.b, stroke: col, 'stroke-width': 1, 'stroke-dasharray': '2 3', opacity: 0.45 }, a);
    mk('circle', { cx: x, cy: y, r: 13, fill: C.bg, stroke: col, 'stroke-width': 2 }, a);
    mk('text', { x, y: y + 5, 'text-anchor': 'middle', fill: col, 'font-size': FS, 'font-weight': 700 }, a).textContent = i + 1;
    mk('title', {}, a).textContent = `${l.no}${side === 'w' ? '.' : '…'} ${l.joue} : perte ${fr(l.L)} pion`;
  });
  // curseur : position affichée
  if (inView(S.ply)) {
    mk('line', { x1: X(S.ply), x2: X(S.ply), y1: M.t - 6, y2: H - M.b, stroke: C.gold, 'stroke-width': 1.6, opacity: 0.9 }, svg);
    mk('circle', { cx: X(S.ply), cy: H - M.b, r: 4.5, fill: C.gold }, svg);
  }
}

// Courbe d'évaluation : une valeur par position (vue des Blancs), aire claire côté Blancs / sombre côté Noirs, paliers du
// barème en fond, pastilles des fautes, tournant, bande des phases + échanges, numéros de coups. Position sans valeur :
// la courbe s'interrompt (aucune valeur inventée).
function drawEvalChart(g, svg) {
  const { W, H, M } = GEO;
  const n = g.plies, evals = g.evals ?? [];
  svg.setAttribute('aria-label', 'Courbe d\'évaluation de la partie, vue des Blancs');
  const plotH = H - M.t - M.b, cy = M.t + plotH / 2, top = evalY(CAP);
  const X = plotX;
  const Y = (v) => cy - (evalY(v) / top) * (plotH / 2);
  // bande d'équilibre et lignes graduées (paliers du barème de la jauge)
  mk('rect', { x: M.l, y: Y(EVAL_ZONE), width: W - M.l - M.r, height: Y(-EVAL_ZONE) - Y(EVAL_ZONE), fill: 'var(--eval-zone)', opacity: 0.4 }, svg);
  const lab = (v) => (Number.isInteger(v) ? `${v > 0 ? '+' : '−'}${Math.abs(v)}` : signed(v, 1));
  for (const t of EVAL_TICKS) for (const v of [t, -t]) {
    mk('line', { x1: M.l, x2: W - M.r, y1: Y(v), y2: Y(v), stroke: C.border, 'stroke-width': 1, 'stroke-dasharray': '2 5', opacity: 0.75 }, svg);
    mk('text', { x: M.l - 8, y: Y(v) + 5, 'text-anchor': 'end', fill: C.muted, 'font-size': FS }, svg).textContent = lab(v);
  }
  mk('line', { x1: M.l, x2: W - M.r, y1: cy, y2: cy, stroke: C.muted, 'stroke-width': 1.2 }, svg);
  mk('text', { x: M.l - 8, y: cy + 5, 'text-anchor': 'end', fill: C.muted, 'font-size': FS }, svg).textContent = '0';
  // aires (relief) : même polygone, deux découpes (au-dessus / au-dessous de zéro), puis trait net par-dessus
  const defs = mk('defs', {}, svg);
  mk('rect', { x: 0, y: 0, width: W, height: cy }, mk('clipPath', { id: 'film-clip-up' }, defs));
  mk('rect', { x: 0, y: cy, width: W, height: H - cy }, mk('clipPath', { id: 'film-clip-dn' }, defs));
  mk('rect', { x: M.l, y: 0, width: W - M.l - M.r, height: H }, mk('clipPath', { id: 'film-clip-x' }, defs));
  const plot = mk('g', { 'clip-path': 'url(#film-clip-x)' }, svg); // la courbe ne déborde jamais de la zone tracée (zoom)
  const runs = []; let cur = null;
  evals.forEach((v, k) => { if (v === null || v === undefined) { cur = null; return; } if (!cur) { cur = []; runs.push(cur); } cur.push([X(k), Y(v)]); });
  for (const run of runs) {
    if (run.length < 2) { mk('circle', { cx: run[0][0], cy: run[0][1], r: 3, fill: C.text }, plot); continue; }
    const line = run.map(([x, y], i) => `${i ? 'L' : 'M'} ${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
    const area = `${line} L ${run[run.length - 1][0].toFixed(1)} ${cy} L ${run[0][0].toFixed(1)} ${cy} Z`;
    mk('path', { d: area, fill: 'var(--eval-white-1)', 'clip-path': 'url(#film-clip-up)' }, plot);
    mk('path', { d: area, fill: 'var(--eval-dark-1)', 'clip-path': 'url(#film-clip-dn)' }, plot);
    // halo (couleur du panneau) sous le trait : reste lisible sur l'aire claire comme sur l'aire sombre, dans les deux thèmes
    mk('path', { d: line, fill: 'none', stroke: C.bg, 'stroke-width': 6, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }, plot);
    mk('path', { d: line, fill: 'none', stroke: C.text, 'stroke-width': 3, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }, plot);
  }
  // bande des phases (sous la courbe) et petits traits des échanges (coups avec prise) juste au-dessus
  const by = H - M.b + 12, bh = 22;
  const half = (W - M.l - M.r) / Math.max(1e-6, GEO.b - GEO.a) / 2, phaseLabel = { ouverture: 'Ouverture', milieu: 'Milieu de partie', finale: 'Finale' }, phaseOp = { ouverture: 0.16, milieu: 0.3, finale: 0.46 };
  for (const s of g.phases ?? []) {
    const x0 = Math.max(M.l, X(s.from) - (s.from === 0 ? 0 : half)), x1 = Math.min(W - M.r, X(s.to) + (s.to === n ? 0 : half));
    if (x1 <= x0) continue; // phase hors de la plage visible
    mk('rect', { x: x0, y: by, width: Math.max(1, x1 - x0), height: bh, fill: C.muted, opacity: phaseOp[s.phase] }, svg);
    if (x1 - x0 > phaseLabel[s.phase].length * 8 + 12) mk('text', { x: (x0 + x1) / 2, y: by + 16, 'text-anchor': 'middle', fill: C.text, 'font-size': FS, 'font-weight': 600 }, svg).textContent = phaseLabel[s.phase];
  }
  for (const p of g.echanges ?? []) { const x = X(p + 1); if (inView(p + 1) && (g.pieces ?? [])[p + 1] != null) mk('line', { x1: x, x2: x, y1: by - 8, y2: by - 2, stroke: C.muted, 'stroke-width': 1.6 }, svg); }
  // numéros de coups (un coup = un coup de chaque camp : la position 2m est celle qui suit le coup m des Noirs)
  for (const m of coupSteps(GEO.a, GEO.b)) mk('text', { x: X(2 * m), y: H - 6, 'text-anchor': 'middle', fill: C.muted, 'font-size': FS }, svg).textContent = m;
  // curseur (position affichée) et repère de survol
  if (inView(S.ply)) mk('line', { x1: X(S.ply), x2: X(S.ply), y1: M.t - 4, y2: H - M.b, stroke: C.gold, 'stroke-width': 1.8, opacity: 0.9 }, svg);
  const hover = mk('line', { id: 'film-hover', x1: 0, x2: 0, y1: M.t - 4, y2: H - M.b, stroke: C.text, 'stroke-width': 1.2, opacity: 0.55, visibility: 'hidden' }, svg);
  hover.style.pointerEvents = 'none';
  // pastilles des fautes signalées, au point de la courbe après le coup : 26 px de diamètre. Seules celles de la plage visible sont
  // dessinées ; deux pastilles qui se chevaucheraient sont décalées verticalement (la sélectionnée garde sa place, dessinée en dernier)
  const faults = g.faults ?? [], placed = [];
  const spot = (f) => { const v = evals[f.ply + 1]; return { x: X(f.ply + 1), y: v === null || v === undefined ? cy : Y(v) }; };
  const order = faults.map((f, i) => i).filter((i) => inView(faults[i].ply + 1)).sort((p, q) => (displayedMove() === faults[q].ply) - (displayedMove() === faults[p].ply));
  const pos = new Map();
  for (const i of order) {
    const base = spot(faults[i]); let best = base;
    for (const dy of [0, 14, -14, 28, -28, 42, -42, 56, -56]) {
      const y = Math.max(M.t + 4, Math.min(H - M.b - 4, base.y + dy));
      if (placed.every((q) => Math.hypot(q.x - base.x, q.y - y) >= ZOOM.PASTILLE_GAP)) { best = { x: base.x, y }; break; }
    }
    placed.push(best); pos.set(i, best);
  }
  faults.forEach((f, i) => { if (pos.has(i) && displayedMove() !== f.ply) drawPastille(svg, g, f, i, pos.get(i)); });
  faults.forEach((f, i) => { if (pos.has(i) && displayedMove() === f.ply) drawPastille(svg, g, f, i, pos.get(i)); });
  // le tournant : dessiné APRÈS les pastilles (jamais masqué) ; l'étiquette passe à gauche si elle déborde à droite, sinon est calée dans la zone tracée
  if (g.tournant && inView(g.tournant.ply + 1)) {
    const t = g.tournant, x = X(t.ply + 1);
    mk('line', { x1: x, x2: x, y1: M.t - 4, y2: H - M.b, stroke: 'var(--fault-major)', 'stroke-width': 2, 'stroke-dasharray': '6 5' }, svg);
    const tx = mk('text', { x: x + 8, y: M.t + 12, 'text-anchor': 'start', fill: 'var(--fault-major)', 'font-size': FS, 'font-weight': 700, 'paint-order': 'stroke', stroke: C.bg, 'stroke-width': 4 }, svg);
    tx.textContent = `Le tournant · ${t.moveNo}${t.side === 'w' ? '.' : '…'} ${g.moves[t.ply]}`;
    const w = tx.getComputedTextLength ? tx.getComputedTextLength() : 150, lo = M.l + 2, hi = W - M.r - 2;
    if (x + 8 + w <= hi) { /* à droite du trait */ } else if (x - 8 - w >= lo) { tx.setAttribute('text-anchor', 'end'); tx.setAttribute('x', x - 8); }
    else { tx.setAttribute('x', Math.max(lo, hi - w)); }
  }
}
function drawPastille(svg, g, f, i, { x, y }) {
  const a = mk('g', { class: 'mk-f', 'data-i': i, style: 'cursor:pointer' }, svg);
  const sel = displayedMove() === f.ply;
  mk('circle', { cx: x, cy: y, r: sel ? 16 : 13, fill: graviteVar[f.gravite], stroke: sel ? C.text : C.bg, 'stroke-width': sel ? 3.5 : 2 }, a);
  mk('text', { x, y: y + 5, 'text-anchor': 'middle', fill: 'var(--fault-on)', 'font-size': FS, 'font-weight': 700 }, a).textContent = i + 1;
}

// Position (0..n) sous le pointeur ; tient compte du redimensionnement (viewBox = taille du SVG, échelle 1).
function positionAt(e) {
  const svg = $('film-chart'), r = svg.getBoundingClientRect();
  const scale = Math.min(r.width / GEO.W, r.height / GEO.H), ox = (r.width - GEO.W * scale) / 2;
  const vx = (e.clientX - r.left - ox) / scale;
  return Math.max(0, Math.min(S.rp.steps.length, Math.round(GEO.a + ((vx - GEO.M.l) / (GEO.W - GEO.M.l - GEO.M.r)) * (GEO.b - GEO.a))));
}
// même chose, non arrondie et sans borne (zoom : glisser, molette)
function posFloat(e) {
  const r = $('film-chart').getBoundingClientRect(), scale = Math.min(r.width / GEO.W, r.height / GEO.H), ox = (r.width - GEO.W * scale) / 2;
  return GEO.a + (((e.clientX - r.left - ox) / scale - GEO.M.l) / (GEO.W - GEO.M.l - GEO.M.r)) * (GEO.b - GEO.a);
}

// ---- infobulle de survol : mini-damier (BoardRenderer de l'appli, mêmes réglages), coup, évaluation, faute ----
const tip = $('film-tip');
let tipRenderer = null;
function hideTip() { if (tip) tip.hidden = true; const h = document.getElementById('film-hover'); if (h) h.setAttribute('visibility', 'hidden'); }
function showTip(k, e) {
  const g = S.data.parties[S.g];
  if (!S.rp || S.view !== 'eval' || k < 0 || k > g.plies) { hideTip(); return; }
  if (!tipRenderer) { tipRenderer = new BoardRenderer($('film-tip-canvas')); applySavedBoardSettings(tipRenderer); }
  tipRenderer.setFlipped(S.flipped);
  tipRenderer.showArrow = false; tipRenderer.bestMove = null;
  const st = k > 0 ? S.rp.steps[k - 1] : null;
  tipRenderer.setState({ board: S.rp.boards[k], lastMove: st ? { squares: [st.from, st.to] } : null });
  const v = (g.evals ?? [])[k], f = (g.faults ?? []).find((x) => x.ply === k - 1);
  $('film-tip-move').textContent = k === 0 ? 'Position de départ' : `${Math.floor((k - 1) / 2) + 1}${(k - 1) % 2 === 0 ? '.' : '…'} ${g.moves[k - 1]}`;
  $('film-tip-eval').textContent = v === null || v === undefined ? 'Position non analysée' : `Évaluation ${signed(v, 1)}${Math.abs(v) >= CAP ? ' (gain forcé)' : ''}`;
  const fb = $('film-tip-fault'); fb.replaceChildren();
  if (f) {
    const a = document.createElement('div'); a.className = 'tip-g'; a.style.color = graviteVar[f.gravite]; a.textContent = `${gravText[f.gravite][0].toUpperCase()}${gravText[f.gravite].slice(1)} : perte ${fr(f.L)} pion`;
    const b = document.createElement('div'); b.textContent = `Meilleur coup : ${f.meilleur ?? '—'}`;
    fb.append(a, b);
  }
  fb.hidden = !f;
  tip.hidden = false;
  // placée à côté du pointeur (jamais dessus), du côté où elle tient ; bornée à la fenêtre
  const w = tip.offsetWidth, h = tip.offsetHeight, gap = 26;
  const left = e.clientX + gap + w <= window.innerWidth - 8 ? e.clientX + gap : e.clientX - gap - w;
  tip.style.left = `${Math.max(8, left)}px`;
  tip.style.top = `${Math.max(8, Math.min(window.innerHeight - h - 8, e.clientY - h / 2))}px`;
  const hl = document.getElementById('film-hover');
  if (hl) { const x = plotX(k); hl.setAttribute('x1', x); hl.setAttribute('x2', x); hl.setAttribute('visibility', 'visible'); }
}
$('film-chart').addEventListener('mousemove', (e) => {
  if (!S.rp || S.view !== 'eval' || drag?.on) return;
  const pf = e.target.closest && e.target.closest('.mk-f');
  const k = pf ? S.data.parties[S.g].faults[Number(pf.dataset.i)].ply + 1 : positionAt(e);
  showTip(k, e);
});
$('film-chart').addEventListener('mouseleave', hideTip);
$('film-chart').addEventListener('click', (e) => {
  if (dragEnded) return; // le clic qui suit un glisser de sélection n'est pas un clic sur la courbe
  const pf = e.target.closest('.mk-f');
  if (pf) { focusLoss(S.data.parties[S.g].faults[Number(pf.dataset.i)]); return; }
  const mkEl = e.target.closest('.mk');
  if (mkEl) { const side = mkEl.dataset.side; focusLoss(S.data.parties[S.g].top[side][Number(mkEl.dataset.rank)]); return; }
  goTo(positionAt(e));
});
document.querySelectorAll('.film-toggle button').forEach((b) => b.addEventListener('click', () => { S.view = b.dataset.view; drawChart(); }));

// ---- zoom (P43) ----
const clampZoom = (a, b) => {
  const n = S.data.parties[S.g].plies, span = Math.min(n, Math.max(Math.min(ZOOM.MIN_SPAN, n), b - a)), na = Math.max(0, Math.min(n - span, a));
  return span >= n - 1e-6 ? null : { a: na, b: na + span };
};
function setZoom(a, b) { S.zoom = clampZoom(a, b); drawChart(); }
function zoomBy(f, center) {
  const n = S.data.parties[S.g].plies, a = S.zoom ? S.zoom.a : 0, b = S.zoom ? S.zoom.b : n, c = center ?? (a + b) / 2, ratio = Math.max(0, Math.min(1, (c - a) / (b - a))), span = (b - a) * f;
  setZoom(c - ratio * span, c - ratio * span + span);
}
function panBy(dir) { if (!S.zoom) return; const d = (S.zoom.b - S.zoom.a) * ZOOM.PAN * dir; setZoom(S.zoom.a + d, S.zoom.b + d); }
// Le moment affiché hors de la plage : la plage se recentre dessus, sans changer le niveau de zoom.
function revealCurrent() {
  if (!S.zoom || !S.rp) return;
  const k = S.focus ? S.focus.ply + 1 : S.ply;
  if (k >= S.zoom.a && k <= S.zoom.b) return;
  const half = (S.zoom.b - S.zoom.a) / 2; S.zoom = clampZoom(k - half, k + half);
}
function updateZoomBar() {
  const n = S.data ? S.data.parties[S.g].plies : 0, z = S.zoom, tiny = n <= ZOOM.MIN_SPAN;
  $('film-zoom-in').disabled = tiny || (z ? z.b - z.a <= ZOOM.MIN_SPAN + 1e-6 : false);
  $('film-zoom-out').disabled = !z;
  $('film-zoom-all').hidden = !z; $('film-zoomnav').hidden = !z;
  if (z) { const th = $('film-nav-thumb'); th.style.left = `${(z.a / n) * 100}%`; th.style.width = `${((z.b - z.a) / n) * 100}%`; }
}
$('film-zoom-in').addEventListener('click', () => zoomBy(1 / ZOOM.FACTOR));
$('film-zoom-out').addEventListener('click', () => zoomBy(ZOOM.FACTOR));
$('film-zoom-all').addEventListener('click', () => { S.zoom = null; drawChart(); });
$('film-pan-l').addEventListener('click', () => panBy(-1));
$('film-pan-r').addEventListener('click', () => panBy(1));
// Molette + Ctrl : zoom autour du pointeur (sans Ctrl, la page garde la molette)
$('film-chart-box').addEventListener('wheel', (e) => { if (!e.ctrlKey || !S.rp) return; e.preventDefault(); zoomBy(e.deltaY < 0 ? 1 / ZOOM.FACTOR : ZOOM.FACTOR, posFloat(e)); }, { passive: false });
// Glisser sur la courbe : zone sélectionnée → zoom ; un simple clic reste un clic
let drag = null, dragEnded = false;
$('film-chart').addEventListener('pointerdown', (e) => { if (e.button !== 0 || !S.rp) return; drag = { x0: e.clientX, v0: posFloat(e), on: false }; });
window.addEventListener('pointermove', (e) => {
  if (!drag) return;
  if (!drag.on && Math.abs(e.clientX - drag.x0) > ZOOM.DRAG_PX) { drag.on = true; hideTip(); }
  if (drag.on) { const box = $('film-chart-box').getBoundingClientRect(), s = $('film-sel'), l = Math.min(drag.x0, e.clientX), r = Math.max(drag.x0, e.clientX); s.hidden = false; s.style.left = `${l - box.left}px`; s.style.width = `${r - l}px`; }
});
window.addEventListener('pointerup', (e) => {
  if (!drag) return;
  const d = drag; drag = null; $('film-sel').hidden = true;
  if (!d.on) return;
  dragEnded = true; setTimeout(() => { dragEnded = false; }, 0);
  const v1 = posFloat(e); setZoom(Math.min(d.v0, v1), Math.max(d.v0, v1));
});
// Bande de navigation (quand on est zoomé) : glisser le curseur, ou cliquer à côté pour y centrer la plage
let navDrag = null;
$('film-nav-thumb').addEventListener('pointerdown', (e) => { if (!S.zoom) return; e.stopPropagation(); navDrag = { x0: e.clientX, a0: S.zoom.a, span: S.zoom.b - S.zoom.a }; });
window.addEventListener('pointermove', (e) => { if (!navDrag) return; const n = S.data.parties[S.g].plies, w = $('film-nav').getBoundingClientRect().width, a = navDrag.a0 + ((e.clientX - navDrag.x0) / w) * n; setZoom(a, a + navDrag.span); });
window.addEventListener('pointerup', () => { navDrag = null; });
$('film-nav').addEventListener('pointerdown', (e) => {
  if (!S.zoom || e.target.id === 'film-nav-thumb') return;
  const r = $('film-nav').getBoundingClientRect(), n = S.data.parties[S.g].plies, c = ((e.clientX - r.left) / r.width) * n, h = (S.zoom.b - S.zoom.a) / 2;
  setZoom(c - h, c + h);
});

// ---- listes et navigation ----
// ---- moments critiques (P42) : frise des fautes signalées des deux camps + carte du moment sélectionné ----
// Données : g.faults (film-game.js, un coup identique au meilleur coup n'y figure jamais), numérotées dans l'ordre de la partie
// comme les pastilles de la courbe. La sélection pilote le grand damier (position AVANT le coup, flèche rouge du coup joué,
// flèche verte du meilleur coup) : c'est `S.focus`, comme avant. P42B : la carte du bas décrit TOUJOURS le coup affiché (displayedMove), critique ou non.
const FRISE = { page: 0, side: 'all', ensure: false, last: null };
const gravLabel = { 'légère': 'Légère', faute: 'Faute', majeure: 'Majeure' };
const sideName = { w: 'Blancs', b: 'Noirs' };
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
const moveLabel = (f) => `${f.no}${f.side === 'w' ? '.' : '…'} ${f.joue}`;
const faultsOf = (g) => (g.faults ?? []).map((f, i) => ({ ...f, n: i + 1 }));
const selectedPly = () => displayedMove(); // mise en évidence (frise, courbe) : seulement si le coup affiché est un moment critique

function renderMoments() {
  stopReplay(); // la carte est reconstruite : toute lecture en cours s'arrête
  const g = S.data.parties[S.g], all = faultsOf(g);
  const list = all.filter((f) => FRISE.side === 'all' || f.side === FRISE.side);
  document.querySelectorAll('.film-seg button').forEach((b) => { const on = b.dataset.side === FRISE.side; b.classList.toggle('active', on); b.setAttribute('aria-pressed', String(on)); });
  const track = $('film-frise-track'); track.replaceChildren();
  $('film-frise').hidden = all.length === 0;
  const dm = displayedMove();
  if (dm !== null && dm !== FRISE.last && list.some((f) => f.ply === dm)) FRISE.ensure = true;
  FRISE.last = dm;
  list.forEach((f) => {
    const b = el('button', 'film-card'); b.type = 'button'; b.dataset.ply = f.ply;
    const tour = !!g.tournant && g.tournant.ply === f.ply;
    if (tour) b.classList.add('tournant');
    if (selectedPly() === f.ply) b.classList.add('active');
    const dot = el('span', 'fc-dot', String(f.n)); dot.style.background = graviteVar[f.gravite];
    const txt = el('span', 'fc-txt');
    txt.append(el('b', '', moveLabel(f)), el('small', '', `${sideName[f.side]} · −${fr(f.L, 1)}`));
    if (tour) txt.append(el('small', 'fc-tour', 'Le tournant'));
    b.append(dot, txt);
    b.addEventListener('click', () => focusLoss(f));
    track.appendChild(b);
  });
  layoutFrise(list);
  renderMomentCard(g, all);
}

// Pagination de la frise : les cartes ne tiennent pas → deux flèches font défiler par pages (aucune barre de défilement).
function layoutFrise(list) {
  const view = $('film-frise-view'), cards = [...$('film-frise-track').children];
  const frise = $('film-frise');
  frise.classList.remove('single');
  if (!cards.length) return;
  const step = cards[0].offsetWidth + 8, vw = view.clientWidth;
  const per = Math.max(1, Math.floor((vw + 8) / step)), pages = Math.max(1, Math.ceil(cards.length / per));
  if (pages === 1) frise.classList.add('single');
  if (FRISE.ensure) { const i = list.findIndex((f) => f.ply === selectedPly()); if (i >= 0) FRISE.page = Math.floor(i / per); FRISE.ensure = false; }
  FRISE.page = Math.max(0, Math.min(pages - 1, FRISE.page));
  $('film-frise-track').style.transform = `translateX(${-FRISE.page * per * step}px)`;
  $('frise-prev').disabled = FRISE.page === 0; $('frise-next').disabled = FRISE.page >= pages - 1;
}
new ResizeObserver(() => { if (S.data && S.rp) { const g = S.data.parties[S.g]; layoutFrise(faultsOf(g).filter((f) => FRISE.side === 'all' || f.side === FRISE.side)); } }).observe($('film-frise-view'));
$('frise-prev').addEventListener('click', () => { FRISE.page--; layoutFrise(faultsOf(S.data.parties[S.g]).filter((f) => FRISE.side === 'all' || f.side === FRISE.side)); });
$('frise-next').addEventListener('click', () => { FRISE.page++; layoutFrise(faultsOf(S.data.parties[S.g]).filter((f) => FRISE.side === 'all' || f.side === FRISE.side)); });
document.querySelectorAll('.film-seg button').forEach((b) => b.addEventListener('click', () => { FRISE.side = b.dataset.side; FRISE.page = 0; renderMoments(); }));

// Le coup AFFICHÉ sur le grand damier : indice du demi-coup (index de g.rows), null à la position de départ.
// Une sélection (S.focus) montre la position AVANT son coup ; sinon la position k est celle qui suit le coup k − 1.
function displayedMove() { if (!S.rp) return null; return S.focus ? S.focus.ply : (S.ply > 0 ? S.ply - 1 : null); }

// ---- réfutation animée (P46) : la suite RÉELLE de la partie à partir du coup en cause, sur le damier de gauche ----
// Le coup fautif et les 5 suivants au plus, un coup toutes les 950 ms ; la carte du bas ne change pas (seule la ligne d'évaluation est
// remplacée par la ligne de coups, qui s'allonge). Toute reconstruction de la carte (refresh) arrête la lecture : voir stopReplay().
const REPLAY = { STEP_MS: 950, MAX_PLIES: 6 };
let replay_ = null; // { f, count, i, timer }
const prefersReduced = () => !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
function stopReplay() {
  if (!replay_) return;
  clearInterval(replay_.timer); replay_ = null;
  if (canvas.classList.contains('replay-neutral')) { canvas.classList.remove('replay-neutral'); renderer.applyUiTheme(); }
}
function replayLine(g, r) {
  const box = $('mc-eval'); if (!box) return;
  box.replaceChildren();
  for (let k = 0; k <= r.i; k++) {
    const ply = r.f.ply + k, side = ply % 2 === 0 ? 'w' : 'b';
    const t = el('span', k === 0 ? 'mc-rep-fault' : '', `${Math.floor(ply / 2) + 1}${side === 'w' ? '.' : '…'} ${g.moves[ply]}`);
    if (k === 0) t.style.color = graviteVar[r.f.gravite];
    if (k) box.append(document.createTextNode(' · '));
    box.append(t);
  }
  const v = (g.evals ?? [])[r.f.ply + r.i + 1];
  if (v !== null && v !== undefined) box.append(document.createTextNode(' · évaluation '), el('b', '', signed(v, 1)));
}
function replayAdvance() {
  const r = replay_; if (!r) return;
  if (r.i + 1 >= r.count) { clearInterval(r.timer); r.timer = null; return; }
  r.i++;
  const g = S.data.parties[S.g], ply = r.f.ply + r.i, st = S.rp.steps[ply];
  const neutral = r.i > 0;
  if (canvas.classList.contains('replay-neutral') !== neutral) { canvas.classList.toggle('replay-neutral', neutral); renderer.applyUiTheme(); }
  renderer.setFlipped(S.flipped); renderer.showArrow = true; renderer.bestMove = null;
  renderer.setState({ board: S.rp.boards[ply + 1], lastMove: { squares: [st.from, st.to] } });
  replayLine(g, r);
  const n = (b) => b.reduce((c, p) => c + (p ? 1 : 0), 0);
  playSound(n(S.rp.boards[ply]) !== n(S.rp.boards[ply + 1]) ? 'capture' : 'move');
  const { captures, simples } = generateLegalMoves(S.rp.boards[ply + 1], (ply + 1) % 2 === 0 ? 'w' : 'b');
  if (captures.length === 0 && simples.length === 0) playSound('game-end');
}
function replayButtons(g, f) {
  const count = Math.min(REPLAY.MAX_PLIES, S.rp.steps.length - f.ply);
  const go = el('button', 'mc-btn mc-btn-main', '▶ Montre-moi pourquoi'), back = el('button', 'mc-btn', 'Revenir à la position');
  go.type = back.type = 'button'; back.disabled = !(replay_ && replay_.f === f);
  if (count < 2) { go.disabled = true; go.title = 'Rien à rejouer après ce coup'; back.disabled = true; }
  go.addEventListener('click', () => {
    const reduced = prefersReduced();
    if (reduced && replay_ && replay_.f === f && replay_.i + 1 < replay_.count) { replayAdvance(); return; } // sans animation : un coup par clic
    if (replay_) { clearInterval(replay_.timer); replay_ = null; }
    replay_ = { f, count, i: -1, timer: null };
    replayAdvance();
    if (!reduced) replay_.timer = setInterval(replayAdvance, REPLAY.STEP_MS);
    back.disabled = false;
  });
  back.addEventListener('click', () => refresh()); // rebâtit la carte et redessine la position du moment
  return [go, back];
}

// Une seule carte, deux contenus : moment critique (P42) ou coup ordinaire (verdict allégé) ; cas à part en texte simple.
function renderMomentCard(g, all) {
  const box = $('film-moment'); box.replaceChildren();
  const m = displayedMove(), f = m === null ? null : all.find((x) => x.ply === m), row = m === null ? null : (g.rows ?? [])[m];
  const nav = () => { // « Moment précédent / suivant » partent du coup affiché, même ordinaire : toujours visibles
    const base = m === null ? -1 : m, prevF = [...all].reverse().find((x) => x.ply < base), nextF = all.find((x) => x.ply > base);
    const n = el('div', 'mc-nav'), prev = el('button', 'mc-btn', '◀ Moment précédent'), next = el('button', 'mc-btn', 'Moment suivant ▶');
    prev.type = next.type = 'button'; prev.disabled = !prevF; next.disabled = !nextF;
    prev.addEventListener('click', () => focusLoss(prevF)); next.addEventListener('click', () => focusLoss(nextF));
    if (f) { const grp = el('div', 'mc-replay-btns'); grp.append(...replayButtons(g, f)); n.append(grp); }
    n.append(prev, next); return n;
  };
  const evalLine = () => {
    const ev = g.evals ?? [], fmtV = (v) => (v === null || v === undefined ? 'non analysée' : signed(v, 1));
    const evl = el('div', 'mc-line'); evl.id = 'mc-eval'; evl.append(document.createTextNode('Évaluation : de '), el('b', '', fmtV(ev[m])), document.createTextNode(' à '), el('b', '', fmtV(ev[m + 1])), el('small', '', ' (vue des Blancs)')); return evl;
  };
  const line = (swatch, label, value) => { const d = el('div', 'mc-line'); if (swatch) d.appendChild(el('span', `sw ${swatch}`)); d.append(document.createTextNode(`${label} : `), el('b', '', value)); return d; };
  const simple = (over, big, text) => { // cas à part : sur-titre, coup, phrase
    box.dataset.simple = '1';
    const main = el('div', 'mc-main'), side = el('div', 'mc-side');
    if (over) main.appendChild(el('div', 'mc-over', over));
    if (big) { const b = el('div', 'mc-big'); b.appendChild(el('span', 'mc-move', big)); main.appendChild(b); }
    main.appendChild(el('p', 'mc-sentence', text)); box.append(main, side, nav());
  };
  delete box.dataset.simple;
  if (!g.rows || !g.rows.length && !all.length) { box.append(el('p', 'mc-empty', 'Aucun coup à décrire.')); return; }
  if (m === null) { simple('', '', 'Position de départ : à toi de dérouler la partie.'); return; }
  if (!row) { simple('', '', 'Analyse en cours…'); return; }
  const who = sideName[row.side], mv = `${row.moveNo}${row.side === 'w' ? '.' : '…'} ${row.played}`, over = `Coup ${row.moveNo} des ${who}`;
  if (row.pending) { simple(over, mv, 'Analyse en cours…'); return; }
  if (row.skipped) {
    const t = row.skipped === 'forcé' ? (row.played.includes('x') ? 'Coup forcé : une seule prise possible.' : 'Coup forcé : un seul coup possible.')
      : (String(row.skipped).startsWith('finale') ? 'Position non analysée : il reste trop peu de pièces.' : 'Position non analysée.');
    simple(over, mv, t); return;
  }
  const main = el('div', 'mc-main'), side = el('div', 'mc-side');
  if (f) { // moment critique : contenu de P42
    const tour = !!g.tournant && g.tournant.ply === f.ply;
    main.append(el('div', 'mc-over', tour ? 'Le coup qui a tout changé' : `Moment critique n° ${f.n}`));
    const big = el('div', 'mc-big');
    const loss = el('span', 'mc-loss', `−${fr(f.L, 1)} pion`); loss.style.color = graviteVar[f.gravite];
    const badge = el('span', 'mc-badge', gravLabel[f.gravite]); badge.style.background = graviteVar[f.gravite];
    big.append(el('span', 'mc-move', moveLabel(f)), loss, badge, el('span', 'mc-trait', `${sideName[f.side]} au trait`));
    const pair = el('div', 'mc-pair'); pair.append(line('sw-played', 'Coup joué', f.joue), line('sw-best', 'Meilleur coup', f.meilleur ?? '—')); // deux repères sur une ligne (P42C-2 : gagne de la hauteur)
    main.append(big, pair, evalLine());
    const dif = difficultyOf(f.type, f.latence);
    if (dif) {
      const d = el('div', 'mc-diff');
      const head = el('div', 'mc-diff-head'); head.append(el('span', 'mc-diff-label', dif.label));
      const gauge = el('span', 'gauge'); gauge.setAttribute('role', 'img'); gauge.setAttribute('aria-label', `Difficulté : ${dif.points} sur 5`);
      for (let i = 1; i <= 5; i++) gauge.appendChild(el('span', 'gd' + (i <= dif.points ? ' on' : '')));
      head.appendChild(gauge);
      d.append(head, el('p', 'mc-sentence', dif.text));
      side.appendChild(d);
    }
  } else { // coup ordinaire : verdict allégé, pas de difficulté
    const v = moveVerdict({ same: row.same, L: row.Lraw ?? row.L });
    main.append(el('div', 'mc-over', over));
    const big = el('div', 'mc-big'), badge = el('span', `mc-badge verdict-${v.kind}`, v.label);
    big.append(el('span', 'mc-move', mv), badge);
    if (v.kind === 'small') big.appendChild(el('span', 'mc-loss mc-loss-small', `−${fr(row.Lraw ?? row.L, 1)} pion`));
    main.appendChild(big);
    main.appendChild(evalLine());
    if (!row.same && row.best && row.best !== row.played) main.appendChild(line('sw-best', 'Meilleur coup selon Scan', row.best));
  }
  box.append(main, side, nav()); // les boutons « Moment précédent / suivant » occupent toute la largeur, sous les deux colonnes
}

// ---- le récit de la partie (P42C) : phrases de js/analysis/film-story.js, mentions de coups cliquables ----
// Un clic sur une mention affiche ce coup : une faute signalée comme un clic sur sa pastille, sinon comme un clic sur la courbe.
function showMoveAt(ply) {
  const f = (S.data.parties[S.g].faults ?? []).find((x) => x.ply === ply);
  if (f) focusLoss(f); else goTo(Math.min(S.rp.steps.length, ply + 1));
}
function fillStory(box, story) {
  box.replaceChildren();
  for (const sentence of story.sentences) {
    const p = document.createElement('p');
    for (const part of sentence) {
      if (part.ply === undefined) { p.appendChild(document.createTextNode(part.t)); continue; }
      const b = document.createElement('button'); b.type = 'button'; b.className = 'story-link'; b.textContent = part.t;
      b.addEventListener('click', () => { closeStoryPop(); showMoveAt(part.ply); });
      p.appendChild(b);
    }
    box.appendChild(p);
  }
}
// Par défaut : la phrase 1 seule (deux lignes au plus) + « Lire la suite » ; le récit complet s'ouvre dans un panneau POSÉ PAR-DESSUS
// le haut de la courbe (rien n'est poussé). À 950 px de haut ou plus, le récit complet est affiché directement (CSS).
function closeStoryPop() { const pop = $('film-story-pop'); if (pop) pop.hidden = true; const m = $('film-story-more'); if (m) m.setAttribute('aria-expanded', 'false'); }
function renderStory() {
  const box = $('film-story-text'); if (!box || !S.data) return;
  closeStoryPop();
  const g = S.data.parties[S.g];
  const story = (DEMO || L.state === 'done') ? storyOf(g) : null; // jamais avant la fin de l'analyse
  $('film-story-more').hidden = !story || story.sentences.length < 2;
  if (!story) { box.replaceChildren(); const p = document.createElement('p'); p.className = 'story-wait'; p.textContent = STORY_TEXT.attente; box.appendChild(p); return; }
  fillStory(box, story);
  fillStory($('film-story-pop-text'), story);
}
$('film-story-more').addEventListener('click', (e) => { e.stopPropagation(); const pop = $('film-story-pop'); pop.hidden = !pop.hidden; e.currentTarget.setAttribute('aria-expanded', String(!pop.hidden)); });
$('film-story-close').addEventListener('click', closeStoryPop);
document.addEventListener('click', (e) => { const pop = $('film-story-pop'); if (pop && !pop.hidden && !pop.contains(e.target) && e.target !== $('film-story-more')) closeStoryPop(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeStoryPop(); });

// Sélection automatique à la fin de l'analyse, si l'utilisateur n'a rien touché : le tournant, sinon la faute la plus coûteuse.
function autoSelectMoment() {
  if (S.touched || !S.data) return;
  if (!DEMO && L.state !== 'done') return;
  const g = S.data.parties[S.g], all = g.faults ?? [];
  if (!all.length) return;
  const f = (g.tournant && all.find((x) => x.ply === g.tournant.ply)) || all.reduce((m, x) => (x.L > m.L ? x : m), all[0]);
  FRISE.ensure = true;
  setFocus(f);
}

// Cartes joueurs (P44) : mêmes classes que la « Plaque tournoi » de l'appli. Données : S.cards (mode normal, déjà résolues par main.js :
// { w|b: { name, elo, title, photo }, info: { event, round, date, score } }) ou, à défaut (mode test), le seul nom du jeu de données.
// Champ absent = rien d'affiché ; photo absente ou qui ne charge pas = avatar lettré.
// Elo ou titre : jamais un tiret ou un séparateur orphelin (« 2500— ») ; un champ vide ou réduit à des tirets n'affiche rien (P46)
const cleanField = (v) => { const t = String(v ?? '').replace(/^[\s—–\-·|:,;]+|[\s—–\-·|:,;]+$/g, ''); return t || null; };
function playerCard(side, p) {
  p = { ...p, elo: cleanField(p.elo), title: cleanField(p.title) };
  const white = side === 'w', box = el('div', 'player-card film-pcard');
  const ring = el('div', 'player-avatar-ring'); ring.dataset.sideRing = white ? 'white' : 'black';
  const inner = el('div', 'player-avatar-inner'); inner.dataset.sideAvatar = white ? 'white' : 'black';
  const letter = el('span', 'avatar-letter', (p.name || (white ? 'B' : 'N')).trim().charAt(0).toUpperCase());
  inner.append(letter);
  if (p.photo) {
    const img = el('img', 'avatar-photo'); img.hidden = true; img.alt = '';
    img.onload = () => { letter.hidden = true; img.hidden = false; };
    img.onerror = () => { img.remove(); letter.hidden = false; };
    img.src = p.photo; inner.append(img);
  }
  ring.append(inner);
  const body = el('div', 'player-card-body'), row = el('div', 'player-name-row');
  row.append(el('span', 'film-pname', p.name || (white ? 'Blancs' : 'Noirs')), el('span', 'side-tag', white ? 'Blancs' : 'Noirs'));
  body.append(row);
  if (p.elo || p.title) {
    const meta = el('div', 'film-pmeta');
    if (p.elo) meta.append(el('span', 'elo-badge', `Elo ${p.elo}`));
    if (p.title) meta.append(el('span', 'film-ptitle', p.title));
    body.append(meta);
  }
  box.append(ring, body);
  return box;
}
function renderHeader() {
  const g = S.data.parties[S.g], live = S.cards && !DEMO;
  const sideOf = (white) => {
    const c = live ? (S.cards.players?.[white ? 'w' : 'b'] ?? {}) : {};
    return { ...c, name: c.name || nameOf(white ? g.blancs : g.noirs) };
  };
  const topWhite = S.flipped, bottomWhite = !S.flipped; // même ordre que le damier : retourné → Blancs en haut
  $('film-top').replaceChildren(playerCard(topWhite ? 'w' : 'b', sideOf(topWhite)));
  $('film-bottom').replaceChildren(playerCard(bottomWhite ? 'w' : 'b', sideOf(bottomWhite)));
  // Bandeau de la partie (P44B), en tête de la colonne du damier : tournoi en premier, puis « Ronde N · date · Score » ; champ absent = rien
  const inf = live ? (S.cards.info ?? {}) : {}, sub = [];
  if (inf.round) sub.push(`Ronde ${inf.round}`);
  if (inf.date) sub.push(inf.date);
  if (inf.score) sub.push(`Score ${inf.score}`);
  const box = $('film-info'); box.replaceChildren();
  if (inf.event) box.append(el('div', 'film-info-event', inf.event));
  if (sub.length) box.append(el('div', 'film-info-sub', sub.join(' · ')));
  box.hidden = !box.children.length;
  const when = `${g.date ? g.date.split('.').reverse().join('/') + ' · ' : ''}${g.resultat ? `résultat ${resText(g.resultat)} · ` : ''}${Math.ceil(g.plies / 2)} coups. `;
  const foot = $('film-foot'); foot.replaceChildren();
  const l = document.createElement('span');
  l.textContent = DEMO
    ? `${when}Évaluation indicative (Scan 3.1, profondeurs 11 à 14). Mode test : 7 parties déjà mesurées.`
    : `${when}Évaluation indicative (Scan 3.1, profondeurs ${DEPTH_FROM} à ${DEPTH_REF}).`;
  foot.append(l);
}
function renderPly() {
  const g = S.data.parties[S.g], k = S.ply;
  let t;
  if (S.focus) { const l = S.focus; t = `Avant ${l.no}${S.rp.steps[l.ply]?.side === 'w' ? '.' : '…'} ${l.joue} · meilleur ${l.meilleur ?? '—'}`; }
  else t = k === 0 ? 'Position de départ' : `Après ${Math.floor((k - 1) / 2) + 1}${(k - 1) % 2 === 0 ? '.' : '…'} ${g.moves[k - 1]}`;
  $('film-ply').textContent = t;
}
function refresh() { stopReplay(); renderPly(); drawBoard(); revealCurrent(); drawChart(); renderMoments(); }
function goTo(ply) { S.touched = true; S.focus = null; S.ply = ply; refresh(); } // la carte du bas suit le coup affiché
// Son (js/sound.js, mêmes réglages que l'appli). Règle RELEVÉE dans main.js (goToNextMove, goToPrevMove, boutons début / fin,
// jumpToPly) : l'appli joue un son SEULEMENT en avançant d'un coup (bouton ▶ et flèche →) : 'capture' si le coup est une prise,
// 'move' sinon, puis 'game-end' si la position atteinte est terminée (camp au trait sans coup). Silence en reculant (◀ et ←),
// au début, à la fin, au clic sur un coup de la liste (ici : clic sur la courbe ou sur une perte) et au chargement d'une partie
// de la bibliothèque. L'écran d'analyse fait exactement pareil.
function stepTo(ply) {
  const from = S.focus ? S.focus.ply : S.ply, to = Math.max(0, Math.min(S.rp.steps.length, ply));
  if (to === from) { if (S.focus) goTo(to); return; }
  goTo(to);
  if (to > from) {
    const n = (b) => b.reduce((c, p) => c + (p ? 1 : 0), 0);
    playSound(n(S.rp.boards[to - 1]) !== n(S.rp.boards[to]) ? 'capture' : 'move');
    const { captures, simples } = generateLegalMoves(S.rp.boards[to], to % 2 === 0 ? 'w' : 'b');
    if (captures.length === 0 && simples.length === 0) playSound('game-end');
  }
}
function setFocus(l) { // position AVANT le coup en cause ; une faute signalée devient aussi le moment affiché
  S.focus = l; S.ply = l.ply;
  refresh();
}
function focusLoss(l) { S.touched = true; setFocus(l); }
function selectGame(i) {
  const g = S.data.parties[i]; S.g = i; S.zoom = null; S.focus = null; S.touched = false; FRISE.page = 0; FRISE.last = null;
  S.rp = replay(g.moves);
  if (DEMO) S.flipped = g.joueur === 'b'; else S.flipped = !!g.flipped;
  S.ply = 0;
  document.querySelectorAll('#film-games .film-game-btn').forEach((b, j) => b.classList.toggle('active', j === i));
  renderHeader(); renderStory(); refresh(); autoSelectMoment();
  if (S.rp.error) $('film-foot').textContent = `Partie non rejouable : ${S.rp.error}`;
}

// ---- message à la place des panneaux (aucune partie, rien à analyser, partie non rejouable…) ----
function showMessage(title, text) {
  S.data = { parties: [{ plies: 0, moves: [], courbe: [], top: { w: [], b: [] }, evals: [], faults: [], phases: [], echanges: [], pieces: [], tournant: null, blancs: '', noirs: '', date: '', resultat: '' }] };
  selectGame(0);
  $('film-side').dataset.state = 'msg';
  $('film-msg-title').textContent = title;
  $('film-msg-text').textContent = text;
  $('film-foot').replaceChildren();
}

// ---- mode normal : analyse en direct de la partie transmise par DamikA ----
const fmtDur = (ms) => { const s = Math.round(ms / 1000); return s < 60 ? `${s} s` : `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, '0')} s`; };
const L = { plan: null, meta: null, recs: [], key: null, runner: null, state: 'idle', t0: 0, timer: null, loading: false, error: '', save: Promise.resolve() };

function readStoredGame() {
  try {
    const raw = JSON.parse(sessionStorage.getItem(FILM_STORAGE_KEY) || 'null');
    if (raw && Array.isArray(raw.moves) && raw.moves.every((m) => typeof m === 'string')) return raw;
  } catch { /* sessionStorage indisponible ou contenu illisible */ }
  return null;
}

const doneCount = () => Math.min(L.plan.plies.length, L.recs.filter(Boolean).length);
function renderProgress() {
  const box = $('film-progress');
  if (L.state === 'idle' || L.state === 'done') { box.hidden = true; return; }
  box.hidden = false;
  const n = L.plan.plies.length, x = doneCount();
  let text;
  if (L.state === 'running') text = L.loading ? 'Chargement de Scan (8,5 Mo)…' : `Analyse : coup ${Math.min(n, x + 1)} sur ${n} · ${fmtDur(performance.now() - L.t0)}`;
  else if (L.state === 'cancelled') text = `Analyse arrêtée : ${x} coups sur ${n}.`;
  else text = `Analyse impossible : ${L.error}`;
  $('film-progress-label').textContent = text;
  $('film-progress-fill').style.width = `${Math.round((x / n) * 100)}%`;
  $('film-cancel').textContent = L.state === 'running' ? 'Annuler' : (L.state === 'cancelled' ? 'Reprendre' : 'Réessayer');
}
function applyRecs() {
  const g = buildFilmGame(L.plan, L.recs, L.meta);
  S.data.parties[0] = g;
  renderMoments(); drawChart(); renderProgress(); renderStory();
}
function setState(state) {
  L.state = state;
  clearInterval(L.timer); L.timer = null;
  if (state === 'running') L.timer = setInterval(renderProgress, 1000);
  renderProgress(); renderStory();
}
function publishStats(mode, stats, totalMs) {
  const mem = performance.memory ? performance.memory.usedJSHeapSize : null;
  window.__filmStats = { mode, plies: L.plan.plies.length, positions: L.plan.positions.length, searched: stats ? stats.searched : 0, totalMs, perPositionMs: stats ? stats.searchMs : [], nodes: stats ? stats.nodes : 0, wasmBytes: L.runner ? L.runner.info.wasmBytes : null, jsHeapBytes: mem, engine: L.runner ? L.runner.info.engine : null };
  console.info('[film]', JSON.stringify({ ...window.__filmStats, perPositionMs: undefined }));
}

async function startRun() {
  L.error = ''; L.loading = false;
  L.runner = createFilmRunner({ onStatus: (m) => { if (m.status === 'loading') { L.loading = true; renderProgress(); } else if (m.status === 'ready') { L.loading = false; renderProgress(); } } });
  L.t0 = performance.now();
  setState('running');
  const total = L.plan.positions.length;
  try {
    const stats = await L.runner.run({
      plan: L.plan, recs: L.recs,
      onRec: async () => { L.loading = false; applyRecs(); L.save = saveAnalysis(L.key, L.recs, L.recs.filter(Boolean).length === total); },
    });
    await L.save;
    setState('done'); applyRecs(); autoSelectMoment();
    publishStats('live', stats, Math.round(performance.now() - L.t0));
  } catch (e) {
    if (e instanceof FilmCancelled) { await L.save; setState('cancelled'); }
    else { L.error = e && e.message ? e.message : String(e); setState('error'); }
  }
}

async function initLive() {
  const raw = readStoredGame();
  if (!raw) { showMessage('Aucune partie à analyser', 'Ouvrez une partie dans DamikA, puis cliquez sur « Analyse de la partie » dans la barre du bas.'); return; }
  if (raw.moves.length < MIN_PLIES) { showMessage('Rien à analyser', `La partie est trop courte : il faut au moins ${MIN_PLIES / 2} coups de chaque camp pour la tracer.`); return; }
  const plan = planGame(raw.moves);
  if (!plan.ok) { showMessage('Partie impossible à rejouer', `${plan.error}. Les règles de DamikA ne rejouent pas cette partie : elle ne peut pas être analysée.`); return; }
  const h = raw.headers || {};
  S.cards = { players: raw.players ?? null, info: raw.info ?? null };
  L.plan = plan;
  L.meta = { blancs: h.White || '', noirs: h.Black || '', date: h.Date || '', resultat: h.Result || '', joueur: null, flipped: !!raw.flipped };
  S.data = { parties: [buildFilmGame(plan, [], L.meta)] };
  selectGame(0);
  const t0 = performance.now();
  L.key = await hashText(`v1|${canonicalGameText(raw.moves)}`);
  const cached = await loadAnalysis(L.key);
  if (cached) L.recs = cached.recs.slice(0, plan.positions.length);
  const complete = L.recs.length >= plan.positions.length && L.recs.slice(0, plan.positions.length).every(Boolean);
  if (complete) { applyRecs(); setState('done'); autoSelectMoment(); publishStats('cache', null, Math.round(performance.now() - t0)); return; }
  applyRecs();
  startRun();
}
$('film-cancel').addEventListener('click', () => {
  if (L.state === 'running') L.runner.cancel();
  else if (L.state === 'cancelled' || L.state === 'error') startRun();
});
window.addEventListener('pagehide', () => { if (L.runner && L.state === 'running') L.runner.cancel(); });

// ---- mode test : les 7 parties mesurées en P40 avec Scan WebAssembly (positions brutes de out/p40/, jamais suivies par git) ----
// Les parties sont rejouées et classées par les MÊMES modules que le mode normal (film-game.js, film-metrics.js).
async function initDemo() {
  let games;
  try {
    const r = await fetch(`${DEMO_DIR}games.json`, { cache: 'no-store' });
    if (!r.ok) throw new Error(r.status);
    games = (await r.json()).games.filter((g) => g.set === 'P28');
    if (!games.length) throw new Error('aucune partie');
  } catch {
    showMessage('Données de test absentes', `${DEMO_DIR} : lancer node training/scan-arena/p40-run.mjs collect puis measure --tag A, et servir le dépôt avec python -m http.server 8934.`);
    return;
  }
  const parties = [];
  for (const g of games) {
    let recs = null;
    try { const r = await fetch(`${DEMO_DIR}run-A/${g.id}.json`, { cache: 'no-store' }); if (r.ok) recs = (await r.json()).recs; } catch { /* partie sans mesure */ }
    const plan = planGame(g.moves);
    if (!recs || !plan.ok) continue;
    parties.push({ ...buildFilmGame(plan, recs, { blancs: g.white, noirs: g.black, date: '', resultat: g.result || '', joueur: null, flipped: false }), titre: `${Math.ceil(g.plies / 2)} coups` });
  }
  S.data = { parties };
  const nav = $('film-games'); nav.hidden = false;
  const lbl = document.createElement('span'); lbl.className = 'film-test-label'; lbl.textContent = 'Mode test'; nav.appendChild(lbl);
  parties.forEach((p, i) => {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'film-game-btn';
    b.textContent = `Partie ${i + 1}`; b.title = `${p.titre}`;
    if (p.plies < MIN_PLIES) { b.disabled = true; b.title += ' : rien à analyser'; }
    b.addEventListener('click', () => selectGame(i));
    nav.appendChild(b);
  });
  const first = parties.findIndex((p) => p.plies >= MIN_PLIES);
  selectGame(first < 0 ? 0 : first);
}

async function init() {
  $('film-first').onclick = () => goTo(0);
  $('film-prev').onclick = () => stepTo(S.focus ? S.ply : S.ply - 1);
  $('film-next').onclick = () => stepTo(S.ply + 1);
  $('film-last').onclick = () => goTo(S.rp.steps.length);
  document.addEventListener('keydown', (e) => {
    if (!S.rp) return;
    if (e.key === 'ArrowRight') { e.preventDefault(); $('film-next').click(); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); $('film-prev').click(); }
    else if (e.key === 'Home') goTo(0); else if (e.key === 'End') goTo(S.rp.steps.length);
  });
  if (DEMO) await initDemo(); else await initLive();
}
init();
