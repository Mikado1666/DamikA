// DAMIKA — écran « Film de la partie » : courbe d'érosion par camp + 3 plus grosses pertes par camp, cliquables (P29, P31).
// Mode normal (P31) : la partie ouverte dans DamikA (sessionStorage, clé damika:film-current, écrite au clic sur « Film »)
// est mesurée en direct par Scan 3.1 (WebAssembly) dans un Worker ; les valeurs par position sont gardées dans IndexedDB.
// Mode test : film.html?demo=1 lit les 7 parties mesurées en P28/P29 (training/scan-arena/out/p29/film.json, produit par
// p29-report.mjs, ignoré par git car il contient des noms de joueurs). Dans les deux cas les coups sont rejoués avec rules.js.
import { initialBoard, squareToRC } from './engine/rules.js';
import { MIN_PLIES, DEPTH_REF, DEPTH_FROM } from './analysis/film-metrics.js';
import { replayMoves, planGame, buildFilmGame, canonicalGameText } from './analysis/film-game.js';
import { createFilmRunner, FilmCancelled } from './analysis/film-runner.js';
import { hashText, loadAnalysis, saveAnalysis } from './analysis/film-cache.js';

export const FILM_DATA_URL = 'training/scan-arena/out/p29/film.json';
export const FILM_STORAGE_KEY = 'damika:film-current';
const DEMO = new URLSearchParams(location.search).get('demo') === '1';
const C = { dark: '#8a5a2b', light: '#dcc38f', gold: '#e5c070', text: '#f1e6d2', bad: '#e07a5f', good: '#7fb685', border: '#3a2c1e' };
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
const S = { data: null, g: 0, ply: 0, focus: null, rp: null, flipped: false };
const canvas = $('film-board');
const ctx = canvas.getContext('2d');

const nameOf = (s) => { const [n, p] = String(s ?? '').split(',').map((x) => x.trim()); return p ? `${p} ${n}` : n; };
const resText = (r) => (r === '2-0' || r === '1-0' ? '1-0' : r === '0-2' || r === '0-1' ? '0-1' : r === '1-1' ? '½-½' : '*');
const gravText = { majeure: 'faute majeure', faute: 'faute', 'légère': 'faute légère', gagnant: 'position restée largement gagnante' };

// ---- damier ----
function squareCenter(sq, size) {
  let [r, c] = squareToRC(sq);
  if (S.flipped) { r = 9 - r; c = 9 - c; }
  const cell = size / 10;
  return [(c + 0.5) * cell, (r + 0.5) * cell];
}
function drawArrow(a, b, color, size) {
  const [x1, y1] = squareCenter(a, size), [x2, y2] = squareCenter(b, size);
  const ang = Math.atan2(y2 - y1, x2 - x1), head = size / 10 * 0.32, w = size / 10 * 0.11;
  ctx.save(); ctx.strokeStyle = color; ctx.fillStyle = color; ctx.globalAlpha = 0.9; ctx.lineWidth = w; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2 - Math.cos(ang) * head * 0.6, y2 - Math.sin(ang) * head * 0.6); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x2, y2); ctx.lineTo(x2 - head * Math.cos(ang - 0.45), y2 - head * Math.sin(ang - 0.45)); ctx.lineTo(x2 - head * Math.cos(ang + 0.45), y2 - head * Math.sin(ang + 0.45)); ctx.closePath(); ctx.fill();
  ctx.restore();
}
function drawBoard() {
  const dpr = window.devicePixelRatio || 1, size = canvas.clientWidth;
  if (!size) return;
  canvas.width = canvas.height = Math.round(size * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const cell = size / 10, board = S.rp.boards[S.ply];
  for (let r = 0; r < 10; r++) for (let c = 0; c < 10; c++) { ctx.fillStyle = (r + c) % 2 ? C.dark : C.light; ctx.fillRect(c * cell, r * cell, cell, cell); }
  // cases du dernier coup joué (ou du coup « en cause » quand on regarde une perte)
  const hl = S.focus ? S.rp.steps[S.focus.ply] : S.rp.steps[S.ply - 1];
  if (hl) for (const sq of [hl.from, hl.to]) { const [x, y] = squareCenter(sq, size); ctx.fillStyle = 'rgba(229,192,112,.28)'; ctx.fillRect(x - cell / 2, y - cell / 2, cell, cell); }
  ctx.font = `600 ${Math.max(8, cell * 0.2)}px Inter, sans-serif`; ctx.textBaseline = 'top'; ctx.fillStyle = 'rgba(241,230,210,.55)';
  for (let sq = 1; sq <= 50; sq++) { const [x, y] = squareCenter(sq, size); ctx.fillText(String(sq), x - cell / 2 + 3, y - cell / 2 + 2); }
  for (let sq = 1; sq <= 50; sq++) {
    const p = board[sq]; if (!p) continue;
    const [x, y] = squareCenter(sq, size), rad = cell * 0.4;
    ctx.beginPath(); ctx.arc(x, y + 1.5, rad, 0, 7); ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.fill();
    ctx.beginPath(); ctx.arc(x, y, rad, 0, 7);
    ctx.fillStyle = p.color === 'w' ? '#f1e6d2' : '#2a1d12'; ctx.fill();
    ctx.lineWidth = Math.max(1.5, cell * 0.04); ctx.strokeStyle = p.color === 'w' ? '#b79d6c' : '#0e0a06'; ctx.stroke();
    ctx.beginPath(); ctx.arc(x, y, rad * 0.66, 0, 7); ctx.lineWidth = 1; ctx.strokeStyle = p.color === 'w' ? 'rgba(138,90,43,.45)' : 'rgba(229,192,112,.28)'; ctx.stroke();
    if (p.king) { ctx.beginPath(); ctx.arc(x, y, rad * 0.32, 0, 7); ctx.fillStyle = C.gold; ctx.fill(); ctx.strokeStyle = '#8a5a2b'; ctx.stroke(); }
  }
  if (S.focus) {
    const pf = S.focus; const st = S.rp.steps[pf.ply];
    if (pf.meilleur) { const [a, b] = pf.meilleur.split(/[-x]/).map(Number); drawArrow(a, b, C.good, size); }
    if (st) drawArrow(st.from, st.to, C.bad, size);
  }
}

// ---- courbe d'érosion ----
const NS = 'http://www.w3.org/2000/svg';
const mk = (tag, attrs = {}, parent) => { const e = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v); if (parent) parent.appendChild(e); return e; };
const W = 600, H = 230, M = { l: 34, r: 10, t: 26, b: 22 };
function drawChart() {
  const g = S.data.parties[S.g], svg = $('film-chart');
  svg.replaceChildren();
  const n = g.plies, ymax = Math.max(1, ...g.courbe.map((c) => Math.max(c[1], c[2]))) * 1.08;
  const X = (ply) => M.l + (ply / Math.max(1, n)) * (W - M.l - M.r), Y = (v) => H - M.b - (v / ymax) * (H - M.t - M.b);
  // quadrillage
  const step = ymax > 14 ? 5 : ymax > 6 ? 2 : 1;
  for (let v = 0; v <= ymax; v += step) {
    mk('line', { x1: M.l, x2: W - M.r, y1: Y(v), y2: Y(v), stroke: C.border, 'stroke-width': 1 }, svg);
    mk('text', { x: M.l - 6, y: Y(v) + 4, 'text-anchor': 'end', fill: '#a8977c', 'font-size': 11, 'font-family': 'Inter' }, svg).textContent = v;
  }
  for (let m = 10; m * 2 <= n; m += 10) {
    mk('text', { x: X(m * 2), y: H - 6, 'text-anchor': 'middle', fill: '#a8977c', 'font-size': 11, 'font-family': 'Inter' }, svg).textContent = m;
  }
  // courbes en escalier : le cumul bouge après chaque coup du camp
  for (const [idx, col, side] of [[1, C.text, 'w'], [2, C.gold, 'b']]) {
    let d = `M ${X(0)} ${Y(0)}`;
    for (const c of g.courbe) d += ` L ${X(c[0] + 1)} ${Y(c[idx])}`;
    mk('path', { d, fill: 'none', stroke: col, 'stroke-width': 2.2, 'stroke-linejoin': 'round', opacity: side === 'w' ? 0.95 : 0.95 }, svg);
  }
  // repères des 3 plus grosses pertes de chaque camp (sur la bande du haut)
  for (const side of ['w', 'b']) g.top[side].forEach((l, i) => {
    const col = side === 'w' ? C.text : C.gold, x = X(l.ply + 0.5), y = side === 'w' ? 10 : 20;
    const a = mk('g', { class: 'mk', 'data-ply': l.ply, 'data-side': side, 'data-rank': i, style: 'cursor:pointer' }, svg);
    mk('line', { x1: x, x2: x, y1: y + 6, y2: H - M.b, stroke: col, 'stroke-width': 1, 'stroke-dasharray': '2 3', opacity: 0.45 }, a);
    mk('circle', { cx: x, cy: y, r: 7, fill: '#17110c', stroke: col, 'stroke-width': 1.6 }, a);
    mk('text', { x, y: y + 3.6, 'text-anchor': 'middle', fill: col, 'font-size': 10, 'font-weight': 700, 'font-family': 'Inter' }, a).textContent = i + 1;
    mk('title', {}, a).textContent = `${l.no}${side === 'w' ? '.' : '…'} ${l.joue} : perte ${fr(l.L)} pion`;
  });
  // curseur : position affichée
  mk('line', { x1: X(S.ply), x2: X(S.ply), y1: M.t - 6, y2: H - M.b, stroke: C.gold, 'stroke-width': 1.4, opacity: 0.9 }, svg);
  mk('circle', { cx: X(S.ply), cy: H - M.b, r: 3.5, fill: C.gold }, svg);
  svg._X = X;
}
$('film-chart').addEventListener('click', (e) => {
  const mkEl = e.target.closest('.mk');
  if (mkEl) { const side = mkEl.dataset.side; focusLoss(S.data.parties[S.g].top[side][Number(mkEl.dataset.rank)]); return; }
  const svg = $('film-chart'), r = svg.getBoundingClientRect(), g = S.data.parties[S.g];
  const scale = Math.min(r.width / W, r.height / H), ox = (r.width - W * scale) / 2;
  const vx = (e.clientX - r.left - ox) / scale;
  const ply = Math.round(((vx - M.l) / (W - M.l - M.r)) * g.plies);
  goTo(Math.max(0, Math.min(S.rp.steps.length, ply)));
});

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
      b.innerHTML = `<span class="rk">${i + 1}</span><span class="mv">${l.no}${side === 'w' ? '.' : '…'} ${l.joue}<small>meilleur : ${l.meilleur ?? '—'}${l.gravite ? ' · ' + gravText[l.gravite] : ''}</small></span><span class="ls">−${fr(l.L)}<small>pion</small></span>`;
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
    ? `${when}Mesure : Scan 3.1 (Fabien Letouzey, GPL-3.0), profondeurs 11 à 14, évaluation indicative. Mode test : 7 parties mesurées en P28.`
    : `${when}Analyse en direct par Scan 3.1 (WebAssembly), moteur de Fabien Letouzey (GPL-3.0) : profondeurs ${DEPTH_FROM} à ${DEPTH_REF}, évaluation indicative.`;
  const r = document.createElement('span'); r.textContent = 'Érosion = pertes cumulées sous le seuil de faute ; seuil adaptatif (valeur et phase de jeu).';
  foot.append(l, r);
  $('film-chart-note').textContent = 'Axe horizontal : numéro du coup. Chaque palier est une petite perte mesurée par DamikA avec Scan ; les cercles numérotés marquent les trois plus grosses pertes de chaque camp.';
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
  S.data = { parties: [{ plies: 0, moves: [], courbe: [], top: { w: [], b: [] }, blancs: '', noirs: '', date: '', resultat: '' }] };
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
  if (!raw) { showMessage('Aucune partie à analyser', 'Ouvrez une partie dans DamikA, puis cliquez sur « Film » dans la barre du bas.'); return; }
  if (raw.moves.length < MIN_PLIES) { showMessage('Rien à analyser', `La partie compte ${raw.moves.length} demi-coup${raw.moves.length > 1 ? 's' : ''} : il en faut au moins ${MIN_PLIES} pour tracer un film.`); return; }
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

// ---- mode test : parties mesurées en P28/P29 ----
async function initDemo() {
  let data;
  try {
    const r = await fetch(FILM_DATA_URL, { cache: 'no-store' });
    if (!r.ok) throw new Error(r.status);
    data = await r.json();
  } catch {
    showMessage('Données de test absentes', `${FILM_DATA_URL} : lancer node training/scan-arena/p29-report.mjs, puis servir le dépôt avec python -m http.server 8934.`);
    return;
  }
  S.data = data;
  const nav = $('film-games'); nav.hidden = false;
  data.parties.forEach((p, i) => {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'film-game-btn';
    b.textContent = p.titre; b.title = `${nameOf(p.blancs)} – ${nameOf(p.noirs)}`;
    if (p.plies < MIN_PLIES) { b.disabled = true; b.title += ' : rien à analyser'; }
    b.addEventListener('click', () => selectGame(i));
    nav.appendChild(b);
  });
  const first = data.parties.findIndex((p) => p.plies >= MIN_PLIES);
  selectGame(first < 0 ? 0 : first);
}

async function init() {
  $('film-first').onclick = () => goTo(0);
  $('film-prev').onclick = () => goTo(Math.max(0, S.focus ? S.ply : S.ply - 1));
  $('film-next').onclick = () => goTo(Math.min(S.rp.steps.length, S.ply + 1));
  $('film-last').onclick = () => goTo(S.rp.steps.length);
  document.addEventListener('keydown', (e) => {
    if (!S.rp) return;
    if (e.key === 'ArrowRight') { e.preventDefault(); $('film-next').click(); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); $('film-prev').click(); }
    else if (e.key === 'Home') goTo(0); else if (e.key === 'End') goTo(S.rp.steps.length);
  });
  new ResizeObserver(() => S.rp && drawBoard()).observe(canvas);
  if (DEMO) await initDemo(); else await initLive();
}
init();
