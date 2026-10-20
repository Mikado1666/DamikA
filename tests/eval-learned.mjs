// Évaluation apprise à tables (js/ai/eval-learned.js) : V0 est une somme de valeurs par case, symétrie exacte,
// phases, validation des fichiers, injection dans la recherche, vitesse.
//
// Usage : node tests/eval-learned.mjs
import { analyseSync } from '../js/ai/search.js';
import { createEvaluator, evalWhite as evalV0, mirrorBoard } from '../js/ai/eval.js';
import { createTableEvaluator, normalizeTables, tablesToPlain, v0Tables, evalBound, MAX_EVAL_BOUND } from '../js/ai/eval-learned.js';
import { FastBoard } from '../js/ai/fastboard.js';
import { mulberry32, randomFastPosition, toPosition } from './helpers.mjs';

let failures = 0;
const ok = (label, cond, extra = '') => { if (!cond) failures++; console.log(`${cond ? 'OK ' : 'ERR'} ${label}${extra ? ' — ' + extra : ''}`); };
const throws = (fn) => { try { fn(); return null; } catch (e) { return e.message; } };

// --- V0 est exactement une somme de tables ---------------------------------------------------------------------------
{
  const v0 = v0Tables();
  const T = createTableEvaluator(v0);
  const rnd = mulberry32(2026);
  let bad = 0, kings = 0, n = 0;
  for (let i = 0; i < 6000; i++) {
    const fb = randomFastPosition(rnd, i);
    const a = evalV0(fb.board), b = T(fb.board);
    if (a !== b) bad++;
    if ([...fb.board].some((p) => p > 2)) kings++;
    n++;
  }
  ok(`V0 = somme de deux tables de 50 valeurs : ${n} positions (dont ${kings} avec dames), AUCUN écart`, bad === 0, `${bad} écart(s)`);
  ok('tables V0 : 50 entiers par table, pion blanc en dernière rangée (case 45..49) plus bas que près de la promotion',
    v0.man.length === 50 && v0.king.length === 50 && v0.man.every(Number.isInteger) && v0.man[10] > v0.man[45]);
}

// --- Symétrie miroir exacte (un jeu, puis des phases) ------------------------------------------------------------
{
  const rnd = mulberry32(7);
  const randTable = () => Array.from({ length: 50 }, () => Math.floor(rnd() * 600) - 100);
  const single = { man: randTable(), king: randTable() };
  const multi = { phases: [{ minPieces: 30, man: randTable(), king: randTable() }, { minPieces: 15, man: randTable(), king: randTable() }, { minPieces: 0, man: randTable(), king: randTable() }] };
  for (const [name, tabs] of [['un jeu de tables', single], ['3 phases', multi]]) {
    const E = createTableEvaluator(tabs);
    let bad = 0;
    for (let i = 0; i < 3000; i++) {
      const fb = randomFastPosition(rnd, i);
      if (E(mirrorBoard(fb.board)) !== -E(fb.board)) bad++;
    }
    ok(`symétrie exacte evalWhite(miroir) = −evalWhite, tables aléatoires, ${name} (3000 positions)`, bad === 0, `${bad} écart(s)`);
  }
  const E0 = createTableEvaluator(single);
  ok('position vide : 0', E0(new Int8Array(50)) === 0);
}

// --- Phases : bon jeu de tables selon le nombre total de pièces -----------------------------------------------------
{
  const flat = (v) => Array(50).fill(v);
  const E = createTableEvaluator({ phases: [{ minPieces: 30, man: flat(1), king: flat(10) }, { minPieces: 15, man: flat(2), king: flat(20) }, { minPieces: 0, man: flat(3), king: flat(30) }] });
  // n pions blancs sur n cases (n pièces au total) : valeur = n × valeur du pion de la phase.
  const board = (n, king = false) => { const b = new Int8Array(50); for (let i = 0; i < n; i++) b[i] = king ? 3 : 1; return b; };
  ok('≥ 30 pièces : phase 0 (30 → 30×1, 40 → 40×1)', E(board(30)) === 30 && E(board(40)) === 40);
  ok('15 à 29 pièces : phase 1 (29 → 29×2, 15 → 15×2)', E(board(29)) === 58 && E(board(15)) === 30);
  ok('< 15 pièces : phase 2 (14 → 14×3, 1 → 3)', E(board(14)) === 42 && E(board(1)) === 3);
  ok('dames : mêmes seuils (30 dames → 300, 14 dames → 420)', E(board(30, true)) === 300 && E(board(14, true)) === 420);
  // Pièces des deux camps : le total compte les deux couleurs.
  const mixed = new Int8Array(50); for (let i = 0; i < 15; i++) mixed[i] = 1; for (let i = 15; i < 30; i++) mixed[i] = 2;
  ok('le total compte les deux camps (15 blancs + 15 noirs = 30 → phase 0)', E(mixed) === 15 * 1 - 15 * 1);
}

// --- Validation des fichiers ----------------------------------------------------------------------------------------------------
{
  const t50 = Array(50).fill(100);
  ok('longueur ≠ 50 refusée', /50 valeurs/.test(throws(() => normalizeTables({ man: [1, 2], king: t50 })) || ''));
  ok('valeur non numérique refusée', /invalide/.test(throws(() => normalizeTables({ man: t50.map((v, i) => (i === 3 ? NaN : v)), king: t50 })) || ''));
  ok('valeur absurde refusée', /invalide/.test(throws(() => normalizeTables({ man: t50.map((v, i) => (i === 3 ? 1e9 : v)), king: t50 })) || ''));
  { // garde-fou : borne exacte de |éval| ≤ 29 000 (zone des mats de la recherche)
    const E = (v) => normalizeTables({ man: Array(50).fill(-v), king: Array(50).fill(v) });
    const raw = (v) => ({ man: Array(50).fill(-v), king: Array(50).fill(v) });
    ok(`garde-fou de mat : tables à ±725 acceptées (borne ${evalBound(raw(725))}), à ±750 refusées (borne ${evalBound(raw(750))} > ${MAX_EVAL_BOUND})`,
      evalBound(raw(725)) === 29000 && throws(() => E(725)) === null && /trop grands/.test(throws(() => E(750)) || ''));
    // pire cas réel : 20 dames blanches (+725) et 20 pions noirs (contribution +725 pour les Blancs) = 29 000 exactement.
    const Ev = createTableEvaluator({ man: Array(50).fill(-725), king: Array(50).fill(725) });
    const b = new Int8Array(50); for (let i = 0; i < 20; i++) b[i] = 3; for (let i = 30; i < 50; i++) b[i] = 2;
    ok('la borne est atteinte : 20 dames blanches + 20 pions noirs = 29 000 (< 29 900, seuil des mats)', Ev(b) === 29000 && evalBound(raw(725)) === Ev(b), String(Ev(b)));
    // des valeurs fortes mais bien réparties restent acceptées (cas des modèles appris : borne ≈ 6 000 à 19 000)
    ok('borne de V0 : très loin du seuil', evalBound(normalizeTables(v0Tables())[0]) < 10000, String(evalBound(normalizeTables(v0Tables())[0])));
  }
  ok('objet absent refusé', /objet/.test(throws(() => normalizeTables(null)) || ''));
  ok('phases : dernière minPieces ≠ 0 refusée', /minPieces = 0/.test(throws(() => normalizeTables({ phases: [{ minPieces: 30, man: t50, king: t50 }, { minPieces: 10, man: t50, king: t50 }] })) || ''));
  ok('phases : ordre non décroissant refusé', /décroissant/.test(throws(() => normalizeTables({ phases: [{ minPieces: 0, man: t50, king: t50 }, { minPieces: 30, man: t50, king: t50 }] })) || ''));
  ok('phases vides refusées', /au moins un/.test(throws(() => normalizeTables({ phases: [] })) || ''));
  const rounded = normalizeTables({ man: t50.map((v, i) => v + (i === 0 ? 0.6 : 0)), king: t50, format: 'x', meta: { a: 1 } });
  ok('valeurs arrondies à l\'entier, clés supplémentaires ignorées', rounded[0].man[0] === 101 && rounded[0].king[0] === 100);
  const plain = tablesToPlain({ phases: [{ minPieces: 20, man: t50, king: t50 }, { minPieces: 0, man: t50, king: t50 }] });
  ok('tablesToPlain : tableaux ordinaires, aller-retour', Array.isArray(plain.phases[0].man) && JSON.stringify(tablesToPlain(plain)) === JSON.stringify(plain));
}

// --- Injection dans la recherche -------------------------------------------------------------------------------------------------
{
  const T = createTableEvaluator(v0Tables());
  let same = 0, total = 0;
  const rnd = mulberry32(11);
  for (let i = 0; i < 24; i++) {
    const fb = randomFastPosition(rnd, i);
    const pos = toPosition(fb);
    const a = analyseSync(pos, { maxDepth: 5, maxTimeMs: 1e9 });
    const b = analyseSync(pos, { maxDepth: 5, maxTimeMs: 1e9, evaluator: T });
    total++;
    if (a.score === b.score && a.bestMoveNotation === b.bestMoveNotation && a.nodes === b.nodes && JSON.stringify(a.mate) === JSON.stringify(b.mate)) same++;
  }
  ok(`recherche profondeur 5 avec les tables de V0 injectées : scores, coups et nœuds IDENTIQUES à V0 (${total} positions)`, same === total, `${same}/${total}`);
  const learned = createTableEvaluator({ man: v0Tables().man.map((v) => v + 3), king: v0Tables().king });
  const pos = toPosition(FastBoard.initial());
  const r = analyseSync(pos, { maxDepth: 3, maxTimeMs: 1e9, evaluator: learned });
  ok('un autre jeu de tables est bien utilisé par la recherche', r.depth === 3 && Number.isFinite(r.score));
}

// --- Vitesse (information, pas de seuil strict : machine variable) ---------------------------------------------------------
{
  const rnd = mulberry32(5);
  const boards = Array.from({ length: 2000 }, (_, i) => randomFastPosition(rnd, i).board);
  const time = (E) => {
    let best = Infinity, acc = 0;
    for (let rep = 0; rep < 7; rep++) {
      const t0 = performance.now();
      for (let k = 0; k < 200; k++) for (let i = 0; i < boards.length; i++) acc += E(boards[i]);
      best = Math.min(best, performance.now() - t0);
    }
    return { ns: (best * 1e6) / (200 * boards.length), acc };
  };
  const v0 = time(createEvaluator());
  const t1 = time(createTableEvaluator(v0Tables()));
  const t3 = time(createTableEvaluator({ phases: [{ minPieces: 30, ...v0Tables() }, { minPieces: 15, ...v0Tables() }, { minPieces: 0, ...v0Tables() }] }));
  console.log(`    vitesse d'évaluation (ns par position, meilleur de 7) : V0 ${v0.ns.toFixed(0)} · tables ${t1.ns.toFixed(0)} · tables 3 phases ${t3.ns.toFixed(0)}`);
  ok('tables (un jeu) pas plus de 1,5 fois plus lentes que V0', t1.ns <= v0.ns * 1.5, `${(t1.ns / v0.ns).toFixed(2)}×`);
  ok('tables à 3 phases pas plus de 2 fois plus lentes que V0', t3.ns <= v0.ns * 2, `${(t3.ns / v0.ns).toFixed(2)}×`);
}

console.log(failures === 0 ? '\nRÉSULTAT : tout concorde.' : `\nRÉSULTAT : ${failures} échec(s).`);
process.exit(failures === 0 ? 0 : 1);
