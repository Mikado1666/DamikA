// DAMIKA — écran « Analyse de la partie » (fichiers film*, vocabulaire P34) : courbe des imprécisions cumulées par camp + 3 plus grosses pertes par camp, cliquables (P29, P31).
// Mode normal (P31) : la partie ouverte dans DamikA (sessionStorage, clé damika:film-current, écrite au clic sur « Film »)
// est mesurée en direct par Scan 3.1 (WebAssembly) dans un Worker ; les valeurs par position sont gardées dans IndexedDB.
// Mode test : film.html?demo=1 lit les 7 parties mesurées en P40 (training/scan-arena/out/p40/, produit par
// p40-run.mjs, ignoré par git car il contient des noms de joueurs). Dans les deux cas les coups sont rejoués avec rules.js.
import { initialBoard, generateLegalMoves } from './engine/rules.js';
import { BoardRenderer } from './render/board.js';
import { readUiTheme, applyUiTheme, applySavedBoardSettings } from './render/board-settings.js';
import { MIN_PLIES, DEPTH_REF, DEPTH_FROM, CAP, EVAL_TICKS, EVAL_ZONE, evalY } from './analysis/film-metrics.js';
import { replayMoves, planGame, buildFilmGame, canonicalGameText } from './analysis/film-game.js';
import { createFilmRunner, FilmCancelled } from './analysis/film-runner.js';
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
const S = { data: null, g: 0, ply: 0, focus: null, rp: null, flipped: false, view: 'eval' }; // view : 'eval' (défaut) ou 'cum', non persisté
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
  renderer.showArrow = !!S.focus;
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
const GEO = { W: 600, H: 230, M: { l: 34, r: 10, t: 26, b: 22 }, n: 0 };
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
  Object.assign(GEO, geo, { n: g.plies });
  svg.setAttribute('viewBox', `0 0 ${geo.W} ${geo.H}`);
  if (S.view === 'eval') drawEvalChart(g, svg); else drawCumChart(g, svg);
}
// Redessin quand la taille du cadre de la courbe change (fenêtre, mise en page).
new ResizeObserver(() => { if (S.data && S.rp) { cancelAnimationFrame(drawChart._raf); drawChart._raf = requestAnimationFrame(drawChart); } }).observe($('film-chart-box'));

function drawCumChart(g, svg) {
  const { W, H, M } = GEO;
  svg.setAttribute('aria-label', 'Courbe des imprécisions cumulées par camp');
  const n = g.plies, ymax = Math.max(1, ...g.courbe.map((c) => Math.max(c[1], c[2]))) * 1.08;
  const X = (ply) => M.l + (ply / Math.max(1, n)) * (W - M.l - M.r), Y = (v) => H - M.b - (v / ymax) * (H - M.t - M.b);
  // quadrillage
  const step = ymax > 14 ? 5 : ymax > 6 ? 2 : 1;
  for (let v = 0; v <= ymax; v += step) {
    mk('line', { x1: M.l, x2: W - M.r, y1: Y(v), y2: Y(v), stroke: C.border, 'stroke-width': 1 }, svg);
    mk('text', { x: M.l - 8, y: Y(v) + 5, 'text-anchor': 'end', fill: C.muted, 'font-size': FS }, svg).textContent = v;
  }
  const stepC = Math.ceil(n / 2) > 60 ? 10 : 5;
  for (let m = stepC; m * 2 <= n; m += stepC) {
    mk('text', { x: X(m * 2), y: H - 8, 'text-anchor': 'middle', fill: C.muted, 'font-size': FS }, svg).textContent = m;
  }
  // courbes en escalier : le cumul bouge après chaque coup du camp
  for (const [idx, col, side] of [[1, C.text, 'w'], [2, C.gold, 'b']]) {
    let d = `M ${X(0)} ${Y(0)}`;
    for (const c of g.courbe) d += ` L ${X(c[0] + 1)} ${Y(c[idx])}`;
    mk('path', { d, fill: 'none', stroke: col, 'stroke-width': 3, 'stroke-linejoin': 'round', ...(side === 'b' ? { 'stroke-dasharray': '9 5' } : {}) }, svg);
  }
  // repères des 3 plus grosses pertes de chaque camp (sur la bande du haut)
  for (const side of ['w', 'b']) g.top[side].forEach((l, i) => {
    const col = side === 'w' ? C.text : C.gold, x = X(l.ply + 0.5), y = side === 'w' ? 16 : 44;
    const a = mk('g', { class: 'mk', 'data-ply': l.ply, 'data-side': side, 'data-rank': i, style: 'cursor:pointer' }, svg);
    mk('line', { x1: x, x2: x, y1: y + 13, y2: H - M.b, stroke: col, 'stroke-width': 1, 'stroke-dasharray': '2 3', opacity: 0.45 }, a);
    mk('circle', { cx: x, cy: y, r: 13, fill: C.bg, stroke: col, 'stroke-width': 2 }, a);
    mk('text', { x, y: y + 5, 'text-anchor': 'middle', fill: col, 'font-size': FS, 'font-weight': 700 }, a).textContent = i + 1;
    mk('title', {}, a).textContent = `${l.no}${side === 'w' ? '.' : '…'} ${l.joue} : perte ${fr(l.L)} pion`;
  });
  // curseur : position affichée
  mk('line', { x1: X(S.ply), x2: X(S.ply), y1: M.t - 6, y2: H - M.b, stroke: C.gold, 'stroke-width': 1.6, opacity: 0.9 }, svg);
  mk('circle', { cx: X(S.ply), cy: H - M.b, r: 4.5, fill: C.gold }, svg);
}

// Courbe d'évaluation : une valeur par position (vue des Blancs), aire claire côté Blancs / sombre côté Noirs, paliers du
// barème en fond, pastilles des fautes, tournant, bande des phases + échanges, numéros de coups. Position sans valeur :
// la courbe s'interrompt (aucune valeur inventée).
function drawEvalChart(g, svg) {
  const { W, H, M } = GEO;
  const n = g.plies, evals = g.evals ?? [];
  svg.setAttribute('aria-label', 'Courbe d\'évaluation de la partie, vue des Blancs');
  const plotH = H - M.t - M.b, cy = M.t + plotH / 2, top = evalY(CAP);
  const X = (k) => M.l + (k / Math.max(1, n)) * (W - M.l - M.r);
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
  const runs = []; let cur = null;
  evals.forEach((v, k) => { if (v === null || v === undefined) { cur = null; return; } if (!cur) { cur = []; runs.push(cur); } cur.push([X(k), Y(v)]); });
  for (const run of runs) {
    if (run.length < 2) { mk('circle', { cx: run[0][0], cy: run[0][1], r: 3, fill: C.text }, svg); continue; }
    const line = run.map(([x, y], i) => `${i ? 'L' : 'M'} ${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
    const area = `${line} L ${run[run.length - 1][0].toFixed(1)} ${cy} L ${run[0][0].toFixed(1)} ${cy} Z`;
    mk('path', { d: area, fill: 'var(--eval-white-1)', 'clip-path': 'url(#film-clip-up)' }, svg);
    mk('path', { d: area, fill: 'var(--eval-dark-1)', 'clip-path': 'url(#film-clip-dn)' }, svg);
    // halo (couleur du panneau) sous le trait : reste lisible sur l'aire claire comme sur l'aire sombre, dans les deux thèmes
    mk('path', { d: line, fill: 'none', stroke: C.bg, 'stroke-width': 6, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }, svg);
    mk('path', { d: line, fill: 'none', stroke: C.text, 'stroke-width': 3, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }, svg);
  }
  // bande des phases (sous la courbe) et petits traits des échanges (coups avec prise) juste au-dessus
  const by = H - M.b + 12, bh = 22;
  const half = (W - M.l - M.r) / Math.max(1, n) / 2, phaseLabel = { ouverture: 'Ouverture', milieu: 'Milieu de partie', finale: 'Finale' }, phaseOp = { ouverture: 0.16, milieu: 0.3, finale: 0.46 };
  for (const s of g.phases ?? []) {
    const x0 = X(s.from) - (s.from === 0 ? 0 : half), x1 = X(s.to) + (s.to === n ? 0 : half);
    mk('rect', { x: x0, y: by, width: Math.max(1, x1 - x0), height: bh, fill: C.muted, opacity: phaseOp[s.phase] }, svg);
    if (x1 - x0 > phaseLabel[s.phase].length * 8 + 12) mk('text', { x: (x0 + x1) / 2, y: by + 16, 'text-anchor': 'middle', fill: C.text, 'font-size': FS, 'font-weight': 600 }, svg).textContent = phaseLabel[s.phase];
  }
  for (const p of g.echanges ?? []) { const x = X(p + 1); if ((g.pieces ?? [])[p + 1] != null) mk('line', { x1: x, x2: x, y1: by - 8, y2: by - 2, stroke: C.muted, 'stroke-width': 1.6 }, svg); }
  // numéros de coups (un coup = un coup de chaque camp : la position 2m est celle qui suit le coup m des Noirs)
  const coups = Math.ceil(n / 2), stepC = coups > 60 ? 10 : 5;
  for (let m = stepC; m <= coups; m += stepC) mk('text', { x: X(2 * m), y: H - 6, 'text-anchor': 'middle', fill: C.muted, 'font-size': FS }, svg).textContent = m;
  // le tournant
  if (g.tournant) {
    const t = g.tournant, x = X(t.ply + 1), left = x > W * 0.6;
    mk('line', { x1: x, x2: x, y1: M.t - 4, y2: H - M.b, stroke: 'var(--fault-major)', 'stroke-width': 2, 'stroke-dasharray': '6 5' }, svg);
    const tx = mk('text', { x: left ? x - 8 : x + 8, y: M.t + 12, 'text-anchor': left ? 'end' : 'start', fill: 'var(--fault-major)', 'font-size': FS, 'font-weight': 700, 'paint-order': 'stroke', stroke: C.bg, 'stroke-width': 4 }, svg);
    tx.textContent = `Le tournant · ${t.moveNo}${t.side === 'w' ? '.' : '…'} ${g.moves[t.ply]}`;
  }
  // curseur (position affichée) et repère de survol
  mk('line', { x1: X(S.ply), x2: X(S.ply), y1: M.t - 4, y2: H - M.b, stroke: C.gold, 'stroke-width': 1.8, opacity: 0.9 }, svg);
  const hover = mk('line', { id: 'film-hover', x1: 0, x2: 0, y1: M.t - 4, y2: H - M.b, stroke: C.text, 'stroke-width': 1.2, opacity: 0.55, visibility: 'hidden' }, svg);
  hover.style.pointerEvents = 'none';
  // pastilles des fautes signalées (ordre de la partie), au point de la courbe après le coup : 26 px de diamètre
  (g.faults ?? []).forEach((f, i) => {
    const v = evals[f.ply + 1], x = X(f.ply + 1), y = v === null || v === undefined ? cy : Y(v);
    const a = mk('g', { class: 'mk-f', 'data-i': i, style: 'cursor:pointer' }, svg);
    mk('circle', { cx: x, cy: y, r: 13, fill: graviteVar[f.gravite], stroke: C.bg, 'stroke-width': 2 }, a);
    mk('text', { x, y: y + 5, 'text-anchor': 'middle', fill: 'var(--fault-on)', 'font-size': FS, 'font-weight': 700 }, a).textContent = i + 1;
  });
}

// Position (0..n) sous le pointeur ; tient compte du redimensionnement (viewBox = taille du SVG, échelle 1).
function positionAt(e) {
  const svg = $('film-chart'), r = svg.getBoundingClientRect();
  const scale = Math.min(r.width / GEO.W, r.height / GEO.H), ox = (r.width - GEO.W * scale) / 2;
  const vx = (e.clientX - r.left - ox) / scale;
  return Math.max(0, Math.min(S.rp.steps.length, Math.round(((vx - GEO.M.l) / (GEO.W - GEO.M.l - GEO.M.r)) * GEO.n)));
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
  if (hl) { const x = GEO.M.l + (k / Math.max(1, GEO.n)) * (GEO.W - GEO.M.l - GEO.M.r); hl.setAttribute('x1', x); hl.setAttribute('x2', x); hl.setAttribute('visibility', 'visible'); }
}
$('film-chart').addEventListener('mousemove', (e) => {
  if (!S.rp || S.view !== 'eval') return;
  const pf = e.target.closest && e.target.closest('.mk-f');
  const k = pf ? S.data.parties[S.g].faults[Number(pf.dataset.i)].ply + 1 : positionAt(e);
  showTip(k, e);
});
$('film-chart').addEventListener('mouseleave', hideTip);
$('film-chart').addEventListener('click', (e) => {
  const pf = e.target.closest('.mk-f');
  if (pf) { focusLoss(S.data.parties[S.g].faults[Number(pf.dataset.i)]); return; }
  const mkEl = e.target.closest('.mk');
  if (mkEl) { const side = mkEl.dataset.side; focusLoss(S.data.parties[S.g].top[side][Number(mkEl.dataset.rank)]); return; }
  goTo(positionAt(e));
});
document.querySelectorAll('.film-toggle button').forEach((b) => b.addEventListener('click', () => { S.view = b.dataset.view; drawChart(); }));

// ---- listes et navigation ----
function renderLosses() {
  const g = S.data.parties[S.g], box = $('film-losses'); box.replaceChildren();
  for (const [side, label] of [['w', 'Blancs'], ['b', 'Noirs']]) {
    const col = document.createElement('div'); col.className = 'film-loss-col';
    const h = document.createElement('h3'); const nm = nameOf(side === 'w' ? g.blancs : g.noirs); h.textContent = nm ? `${label} · ${nm}` : label; col.appendChild(h);
    if (!g.top[side].length) { const p = document.createElement('div'); p.className = 'film-empty'; p.textContent = !DEMO && L.state === 'running' ? 'Analyse en cours…' : 'Rien à signaler.'; col.appendChild(p); }
    g.top[side].forEach((l, i) => {
      const b = document.createElement('button'); b.type = 'button';
      b.className = 'film-loss' + (l.gravite === 'gagnant' ? ' gagnant' : '') + (S.focus && S.focus.ply === l.ply ? ' active' : '');
      b.dataset.ply = l.ply;
      b.innerHTML = `<span class="rk">${i + 1}</span><span class="mv">${l.no}${side === 'w' ? '.' : '…'} ${l.joue}<small>meilleur : ${l.meilleur ?? '—'}${l.gravite ? ' · ' + gravText[l.gravite] : ''}</small></span><span class="ls" style="color:${graviteVar[l.gravite] ?? 'var(--text-2)'}">−${fr(l.L)} <small>pion</small></span>`;
      b.addEventListener('click', () => focusLoss(l));
      col.appendChild(b);
    });
    box.appendChild(col);
  }
}
function renderHeader() {
  const g = S.data.parties[S.g];
  const top = S.flipped ? g.blancs : g.noirs, bottom = S.flipped ? g.noirs : g.blancs;
  const fill = (box, nm, white) => { // noms issus d'un PDN : jamais en innerHTML
    const a = document.createElement('span'); a.className = 'nm'; a.textContent = nameOf(nm);
    const b = document.createElement('span'); b.className = 'tag'; b.textContent = `${white ? 'Blancs' : 'Noirs'}${g.joueur === (white ? 'w' : 'b') ? ' · Mickaël' : ''}`;
    box.replaceChildren(a, b);
  };
  fill($('film-top'), top, S.flipped);
  fill($('film-bottom'), bottom, !S.flipped);
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
function refresh() { renderPly(); drawBoard(); drawChart(); document.querySelectorAll('.film-loss').forEach((b) => b.classList.toggle('active', !!S.focus && Number(b.dataset.ply) === S.focus.ply)); }
function goTo(ply) { S.focus = null; S.ply = ply; refresh(); }
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
function focusLoss(l) { S.focus = l; S.ply = l.ply; refresh(); } // position AVANT le coup en cause
function selectGame(i) {
  const g = S.data.parties[i]; S.g = i; S.focus = null;
  S.rp = replay(g.moves);
  if (DEMO) S.flipped = g.joueur === 'b'; else S.flipped = !!g.flipped;
  S.ply = 0;
  document.querySelectorAll('.film-game-btn').forEach((b, j) => b.classList.toggle('active', j === i));
  renderHeader(); renderLosses(); refresh();
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
  renderLosses(); drawChart(); renderProgress();
}
function setState(state) {
  L.state = state;
  clearInterval(L.timer); L.timer = null;
  if (state === 'running') L.timer = setInterval(renderProgress, 1000);
  renderProgress();
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
    setState('done'); applyRecs();
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
  L.plan = plan;
  L.meta = { blancs: h.White || '', noirs: h.Black || '', date: h.Date || '', resultat: h.Result || '', joueur: null, flipped: !!raw.flipped };
  S.data = { parties: [buildFilmGame(plan, [], L.meta)] };
  selectGame(0);
  const t0 = performance.now();
  L.key = await hashText(`v1|${canonicalGameText(raw.moves)}`);
  const cached = await loadAnalysis(L.key);
  if (cached) L.recs = cached.recs.slice(0, plan.positions.length);
  const complete = L.recs.length >= plan.positions.length && L.recs.slice(0, plan.positions.length).every(Boolean);
  if (complete) { applyRecs(); setState('done'); publishStats('cache', null, Math.round(performance.now() - t0)); return; }
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
