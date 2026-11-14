// DAMIKA — Le récit de la partie (P42C) : trois phrases écrites à partir des résultats déjà calculés (évaluations, fautes signalées,
// gravité, difficulté, tournant, phases). Fonctions PURES (aucun DOM) : Node et navigateur. Aucune mesure ni seuil existant n'est touché.
//
// TOUTES les phrases sont dans la banque STORY_TEXT ci-dessous (et nulle part ailleurs dans le code) : pour retravailler le ton, on ne
// modifie que cet objet. Emplacements nommés : {camp} (« Blancs » / « Noirs »), {autreCamp}, {coup} (numéro de coup), {n} (ordinal du
// coup : « 3e », « 41e », avec « coup » écrit dans la phrase : « au {n} coup »), {notation} (« 40-34 »), {nbCoups} et {nbFois} (nombres de 1 à 9 écrits en lettres). Un emplacement {coup},
// {n} ou {notation} est CLIQUABLE dans l'affichage.
//
// Valeurs vues des Blancs, en pions. Le récit n'existe qu'une fois l'analyse terminée (storyOf renvoie null sinon).
import { phaseName, difficultyOf } from './film-metrics.js';
import { ordinal } from './film-ordinal.js';
import { pionsRond } from './film-pions.js';

export const STORY_TEXT = {
  attente: 'Le récit s\'écrira à la fin de l\'analyse.',
  camps: { w: 'Blancs', b: 'Noirs' },
  nombres: ['zéro', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf'], // de 1 à 9 en lettres, au-delà : chiffres
  // Phrase 1 : l'histoire (une par scénario)
  histoire: {
    bascule: 'Partie équilibrée jusqu\'au {n} coup. Au {coup} coup, les {camp} jouent {notation} et tout bascule.',
    basculeInegale: 'Les {camp} tenaient encore la partie jusqu\'au {n} coup. Au {coup} coup, ils jouent {notation} et tout bascule.',
    // faute d'un coup des Noirs : le numéro de coup n'est pas répété
    basculeNoirs: 'Partie équilibrée jusqu\'au {n} coup. Les {camp} répondent {notation} et tout bascule.',
    basculeInegaleNoirs: 'Les {camp} tenaient encore la partie jusqu\'au {n} coup. Ils répondent {notation} et tout bascule.',
    petitAPetit: 'Aucun coup ne perd la partie à lui seul. Les {camp} cèdent du terrain petit à petit, et à partir du {n} coup les {autreCamp} ne lâchent plus leur avantage.',
    renversement: 'Les {camp} tenaient la partie jusqu\'au {n} coup. Les {autreCamp} retournent la situation en quelques coups.',
    gache: 'Les {camp} avaient la partie en main au {n} coup. Ils laissent filer leur avantage et la partie finit à égalité.',
    // P48F : l'état passé (« équilibrée », « tenaient », « en main ») n'est affirmé QUE s'il est vrai (aucune faute « faute » / « majeure » avant le moment cité) ;
    // sinon : une occasion manquée (un camp lâche gros, l'autre n'en profite pas) ou une partie « déjà agitée ». {x} = « l'équivalent de 3 pions » (chiffre rond, P48G ; vu du camp qui lâche).
    basculeOccasion: 'Les {camp} lâchent {x} au {n} coup, mais les {autreCamp} n\'en profitent pas. Au {coup} coup, les {campT} jouent {notation} et cette fois tout bascule.',
    basculeOccasionNoirs: 'Les {camp} lâchent {x} au {n} coup, mais les {autreCamp} n\'en profitent pas. Les {campT} répondent {notation} et cette fois tout bascule.',
    basculeAgitee: 'La partie était déjà agitée dès le {n} coup. Au {coup} coup, les {camp} jouent {notation} et tout bascule.',
    basculeAgiteeNoirs: 'La partie était déjà agitée dès le {n} coup. Les {camp} répondent {notation} et tout bascule.',
    renversementAgite: 'Après une partie agitée, les {camp} avaient l\'avantage au {n} coup. Les {autreCamp} retournent la situation en quelques coups.',
    gacheAgite: 'Après une partie agitée, les {camp} avaient la partie en main au {n} coup. Ils laissent filer leur avantage et la partie finit à égalité.',
    propre: 'Partie sérieuse des deux côtés : personne ne commet de vraie faute, et l\'équilibre tient du début à la fin.',
    propreMieux: 'Partie sérieuse des deux côtés : personne ne commet de vraie faute, mais les {camp} finissent mieux.',
    mouvementee: 'Partie agitée : l\'avantage change {nbFois} fois de camp, et chacun a eu sa chance.',
    neutre: 'Partie disputée, sans coup décisif : les deux camps restent proches jusqu\'au bout.',
  },
  // Phrase 2 : le moment clé
  moment: {
    coupCle: 'Le coup clé est le {coup} coup des {camp} ({notation}).', // dit toujours le camp ; omis quand la phrase 1 nomme déjà le coup (bascule nette)
    visible: 'La punition se voyait en {nbCoups} coups : c\'est une faute d\'attention, pas de calcul.',
    profond: 'Le coup avait l\'air naturel. Il fallait calculer {nbCoups} coups pour voir le danger.',
    instable: 'Même le moteur hésite sur ce coup : la position était vraiment compliquée.',
    occasion: 'Juste avant, les {autreCamp} s\'étaient trompés au {n} coup, et les {camp} n\'en ont pas profité.', // plus affichée dans le récit (P42C-2) : réservée à sa future carte
  },
  // Phrase 3 : à retenir
  retenir: {
    ouverture: 'À retenir pour les {camp} : l\'essentiel se perd dès l\'ouverture.',
    milieu: 'À retenir pour les {camp} : c\'est en milieu de partie que tout se joue, l\'ouverture et la finale sont tenues.',
    finale: 'À retenir pour les {camp} : la partie était bien menée jusqu\'à la finale, c\'est là qu\'elle se perd.',
    rien: 'Rien à reprocher aux {camp} : les {autreCamp} ont simplement mieux joué.',
    // P48F : quand le camp a aussi commis de grosses fautes dans une AUTRE phase, on ne dit pas que le reste de la partie était « tenu » / « bien mené »
    milieuMixte: 'À retenir pour les {camp} : c\'est en milieu de partie que tout se joue, et ce n\'est pas la seule phase où des erreurs ont été commises.',
    finaleMixte: 'À retenir pour les {camp} : la finale décide de la partie, mais des erreurs plus tôt avaient déjà pesé.',
    gache: 'À retenir pour les {camp} : un avantage ne suffit pas, il faut encore le concrétiser.', // remplace la phase 3 de « Avantage gâché »
  },
};

// ---- seuils (tous ici) ----
export const NET = 1.0;            // « avantage net » : 1,0 pion ou plus
export const EQUAL = 0.5;          // « égalité » : entre −0,5 et +0,5 ; au-delà de ±0,5 on « tient » un avantage
export const SWINGS_MIN = 3;       // partie mouvementée : au moins 3 changements de camp...
export const BAD_FAULTS_MIN = 2;   // ... ET au moins 2 fautes de gravité « faute » ou « majeure » de chaque camp
export const WASTED = 1.5;         // avantage gâché : un camp a eu 1,5 pion ou plus
export const FINAL_COUNT = 3;      // valeur finale = moyenne des 3 dernières positions analysées
export const BAD_TIERS = ['faute', 'majeure'];
export const LOST_BEHIND = 2.0;    // « à retenir » sans moment clé : on ignore les pertes d'un camp qui a déjà 2,0 pions ou plus de retard
export const TURN_WINDOW = 2;      // bascule nette : fenêtre du coup clé = le tournant ± 2 coups joués (le tournant lui-même est toujours préféré)

const other = (s) => (s === 'w' ? 'b' : 'w');
const view = (v, side) => (side === 'w' ? v : -v);          // valeur vue du camp `side`
const coupOfPos = (k) => Math.max(1, Math.ceil(k / 2));       // numéro de coup de la position k (k demi-coups joués)
const plyOfPos = (k) => Math.max(0, k - 1);                   // le coup qui a mené à la position k
const isBad = (f) => BAD_TIERS.includes(f.gravite);
const known = (evals) => evals.map((v, k) => [k, v]).filter(([, v]) => v !== null && v !== undefined);

export const finalValue = (evals) => { const kn = known(evals).slice(-FINAL_COUNT); return kn.length ? kn.reduce((s, [, v]) => s + v, 0) / kn.length : null; };

// Nombre de fois où l'avantage passe d'un camp à l'autre au-delà de ±EQUAL.
export function leadChanges(evals) {
  let last = 0, n = 0;
  for (const [, v] of known(evals)) { const s = v > EQUAL ? 1 : v < -EQUAL ? -1 : 0; if (!s) continue; if (last && s !== last) n++; last = s; }
  return n;
}
// Dernière position où `side` avait au moins `level` pion d'avance (vue de ce camp), ou -1.
const lastAtLeast = (evals, side, level) => { let r = -1; known(evals).forEach(([k, v]) => { if (view(v, side) >= level) r = k; }); return r; };
// Meilleure avance de `side` : { v, k }.
const peak = (evals, side) => known(evals).reduce((b, [k, v]) => (view(v, side) > b.v ? { v: view(v, side), k } : b), { v: -Infinity, k: -1 });
// Première position à partir de laquelle `side` garde au moins `level` d'avance jusqu'à la fin (positions analysées), ou -1.
function holdsFrom(evals, side, level) {
  const kn = known(evals); let from = -1;
  for (let i = kn.length - 1; i >= 0; i--) { if (view(kn[i][1], side) >= level) from = kn[i][0]; else break; }
  return from;
}

// Scénario reconnu et éléments du récit. Retourne { id, ...éléments } (ordre de test : mouvementée, renversement, gâché, bascule,
// propre, petit à petit, neutre).
export function scenarioOf(g) {
  const evals = g.evals ?? [], faults = g.faults ?? [], fin = finalValue(evals);
  const bad = faults.filter(isBad), badBy = (s) => bad.filter((f) => f.side === s).length;
  const changes = leadChanges(evals);
  // 1. Partie mouvementée
  if (changes >= SWINGS_MIN && badBy('w') >= BAD_FAULTS_MIN && badBy('b') >= BAD_FAULTS_MIN) return { id: 'mouvementee', changes };
  if (fin !== null) {
    const winner = fin >= NET ? 'w' : fin <= -NET ? 'b' : null;
    // 2. Renversement : le futur perdant a eu un avantage net, l'autre finit avec un avantage net
    // camp concerné = celui qui perd son avantage ; fenêtre = de son meilleur moment jusqu'à l'avantage net de l'autre camp ; k = son meilleur moment
    if (winner) {
      const x = other(winner);
      if (lastAtLeast(evals, x, NET) >= 0) {
        const pk = peak(evals, x), net = known(evals).find(([k, v]) => k > pk.k && view(v, winner) >= NET);
        return { id: 'renversement', camp: x, k: pk.k, from: pk.k, to: net ? net[0] - 1 : Infinity };
      }
    }
    // 3. Avantage gâché : un camp a eu 1,5 pion ou plus et la valeur finale est à égalité
    if (Math.abs(fin) < EQUAL) {
      const pw = peak(evals, 'w'), pb = peak(evals, 'b'), p = pw.v >= pb.v ? { ...pw, side: 'w' } : { ...pb, side: 'b' };
      if (p.v >= WASTED) return { id: 'gache', camp: p.side, k: p.k, from: p.k, to: Infinity };
    }
  }
  // 4. Bascule nette : il y a un tournant
  if (g.tournant) return { id: 'bascule', tournant: g.tournant, camp: g.tournant.side, from: g.tournant.ply - TURN_WINDOW, to: g.tournant.ply + TURN_WINDOW, prefer: g.tournant.ply };
  // 5. Partie propre (passe avant « petit à petit », P42C-2) : aucune faute « faute » ou « majeure »
  if (!bad.length) return { id: 'propre', camp: fin !== null && Math.abs(fin) >= NET ? (fin > 0 ? 'w' : 'b') : null };
  // 6. Petit à petit : au moins une faute « faute » ou « majeure », pas de tournant, avantage net pour un camp à la fin
  if (fin !== null && Math.abs(fin) >= NET) { const winner = fin > 0 ? 'w' : 'b'; return { id: 'petitAPetit', camp: other(winner), k: holdsFrom(evals, winner, NET), from: 0, to: Infinity }; }
  // 7. Neutre
  return { id: 'neutre' };
}

// ---- composition ----
const letters = (n) => (n >= 1 && n <= 9 ? STORY_TEXT.nombres[n] : String(n));
// Gabarit + valeurs → liste de morceaux { t, ply? } ; une valeur { t, ply } est cliquable.
function fill(template, vals) {
  return template.split(/(\{\w+\})/).filter((x) => x !== '').map((part) => {
    const m = /^\{(\w+)\}$/.exec(part);
    if (!m) return { t: part };
    const v = vals[m[1]];
    return v === undefined ? { t: part } : (typeof v === 'object' ? v : { t: String(v) });
  });
}
const join = (...lists) => lists.reduce((a, l) => (a.length ? a.concat([{ t: ' ' }], l) : l), []);
const ordText = (n) => ordinal(Number(n)) ?? String(n); // « 3e », « 41e » (module film-ordinal.js : seul endroit où un numéro devient un mot)
const moveRef = (f) => ({ t: ordText(f.no ?? f.moveNo), ply: f.ply });
const notationRef = (f) => ({ t: f.joue ?? f.played, ply: f.ply });

// Le moment clé : parmi les coups signalés du camp concerné (`focus.camp`, absent = les deux camps) dans la fenêtre `focus.from`..`focus.to`
// (numéros de coups joués), la faute « faute » / « majeure » la plus coûteuse ; à défaut, la plus coûteuse signalée ; à défaut, null.
// `focus.prefer` (bascule nette) : le coup de ce numéro l'emporte s'il est signalé.
export function keyMoment(g, focus = {}) {
  const { camp = null, from = -Infinity, to = Infinity, prefer = null } = focus;
  const pool = (g.faults ?? []).filter((f) => (!camp || f.side === camp) && f.ply >= from && f.ply <= to);
  const costliest = (l) => l.reduce((m, x) => (x.L > m.L ? x : m), l[0]);
  const chosen = (prefer !== null && pool.find((f) => f.ply === prefer)) || (pool.some(isBad) ? costliest(pool.filter(isBad)) : pool.length ? costliest(pool) : null);
  return chosen ? { fault: chosen, tournant: prefer !== null && chosen.ply === prefer } : null;
}

// Occasion manquée : une faute « faute » / « majeure » d'un camp suivie, au coup d'après, d'une faute signalée de l'autre camp
// (celui-ci n'en a pas profité). La plus coûteuse (L de la première faute). null si aucune. (Plus dite dans le récit.)
// `beforePly` (P48F) : ne regarde que les coups d'indice strictement inférieur (la faute ET la réponse non punie).
export function missedChance(g, beforePly = Infinity) {
  const faults = g.faults ?? []; let best = null;
  for (const a of faults) {
    if (!isBad(a) || a.ply >= beforePly) continue;
    if (!faults.some((b) => b.ply === a.ply + 1 && b.ply < beforePly && b.side !== a.side)) continue;
    if (!best || a.L > best.L) best = a;
  }
  return best;
}

// Fautes « faute » / « majeure » des DEUX camps commises avant le coup d'indice `ply` (celui-ci exclu), de la plus ancienne à la plus récente :
// le récit n'affirme un état passé (« équilibrée », « tenaient la partie », « avaient la partie en main ») que si cette liste est vide.
export const gravesBefore = (g, ply) => (g.faults ?? []).filter((f) => isBad(f) && f.ply < ply).sort((p, q) => p.ply - q.ply);

// Phase où `side` a perdu le plus (somme de ses pertes par phase, phase de la position AVANT le coup), en ignorant les pertes faites
// quand il avait déjà LOST_BEHIND pions ou plus de retard (partie déjà perdue). null si aucune perte.
export function worstPhase(g, side) {
  const sums = { ouverture: 0, milieu: 0, finale: 0 };
  for (const r of g.rows ?? []) {
    if (r.pending || r.skipped || r.side !== side || !(r.L > 0)) continue;
    const pc = (g.pieces ?? [])[r.ply]; if (pc === null || pc === undefined) continue;
    const before = (g.evals ?? [])[r.ply]; if (before !== null && before !== undefined && view(before, side) <= -LOST_BEHIND) continue;
    sums[phaseName(pc)] += r.L;
  }
  const [name, v] = Object.entries(sums).sort((a, b) => b[1] - a[1])[0];
  return v > 0 ? name : null;
}

// Le camp a-t-il commis une faute « faute » / « majeure » dans une phase AUTRE que `ph` ? (la phrase 3 ne dit alors plus « tenue » / « bien menée »)
export function gravesOutsidePhase(g, side, ph) {
  return (g.faults ?? []).some((f) => isBad(f) && f.side === side && (g.pieces ?? [])[f.ply] != null && phaseName(g.pieces[f.ply]) !== ph);
}

// Phase nommée par la phrase 3 : celle du moment clé s'il y en a un, sinon celle où le camp a le plus perdu. null si aucune.
export function retainPhase(g, loser, km = keyMoment(g)) {
  const pc = km ? (g.pieces ?? [])[km.fault.ply] : null;
  return km && pc !== null && pc !== undefined ? phaseName(pc) : worstPhase(g, loser);
}

// Le récit : { scenario, sentences: [[{ t, ply? }, …], …] } (trois phrases au plus ; l'occasion manquée n'y figure plus), ou null
// si l'analyse n'est pas terminée (une ligne en attente, ou moins de deux valeurs).
export function storyOf(g) {
  if (!g || !g.rows || g.rows.some((r) => r.pending) || known(g.evals ?? []).length < 2) return null;
  const T = STORY_TEXT, camp = (s) => T.camps[s], sc = scenarioOf(g), sentences = [];
  const posRef = (k) => ({ t: ordText(coupOfPos(k)), ply: plyOfPos(k) });
  // Phrase 1
  let s1;
  if (sc.id === 'bascule') {
    const t = sc.tournant, ev = (g.evals ?? [])[t.ply], eq = ev === null || ev === undefined || Math.abs(ev) < EQUAL;
    const noirs = t.side === 'b' ? 'Noirs' : '', graves = gravesBefore(g, t.ply), mc = graves.length ? missedChance(g, t.ply) : null;
    const tv = { coup: moveRef({ moveNo: t.moveNo, ply: t.ply }), notation: notationRef(t) };
    if (!graves.length) { // rien de grave avant : « équilibrée » / « tenaient encore » selon l'évaluation juste avant le tournant
      s1 = fill(T.histoire[(eq ? 'bascule' : 'basculeInegale') + noirs], { ...tv, n: { t: ordText(coupOfPos(t.ply)), ply: Math.max(0, t.ply - 1) }, camp: camp(t.side) });
    } else if (mc) { // un camp a lâché gros, l'autre n'en a pas profité, puis le tournant
      s1 = fill(T.histoire['basculeOccasion' + noirs], { ...tv, n: moveRef(mc), x: pionsRond(mc.L), camp: camp(mc.side), autreCamp: camp(other(mc.side)), campT: camp(t.side) });
    } else { // plusieurs fautes avant, sans occasion manquée identifiable
      s1 = fill(T.histoire['basculeAgitee' + noirs], { ...tv, n: moveRef(graves[0]), camp: camp(t.side) });
    }
  } else if (sc.id === 'petitAPetit') s1 = fill(T.histoire.petitAPetit, { camp: camp(sc.camp), autreCamp: camp(other(sc.camp)), n: posRef(sc.k) });
  else if (sc.id === 'renversement') s1 = fill(T.histoire[gravesBefore(g, sc.k).length ? 'renversementAgite' : 'renversement'], { camp: camp(sc.camp), autreCamp: camp(other(sc.camp)), n: posRef(sc.k) });
  else if (sc.id === 'gache') s1 = fill(T.histoire[gravesBefore(g, sc.k).length ? 'gacheAgite' : 'gache'], { camp: camp(sc.camp), n: posRef(sc.k) });
  else if (sc.id === 'propre') s1 = fill(sc.camp ? T.histoire.propreMieux : T.histoire.propre, { camp: sc.camp ? camp(sc.camp) : '' });
  else if (sc.id === 'mouvementee') s1 = fill(T.histoire.mouvementee, { nbFois: letters(sc.changes) });
  else s1 = fill(T.histoire.neutre, {});
  sentences.push(s1);
  // Phrase 2 : le moment clé (son coup est nommé UNE fois : par la phrase 1 dans la bascule nette, sinon ici), puis la difficulté
  // camp concerné et fenêtre propres au scénario (voir scenarioOf) ; « propre » : pas de phrase 2
  const km = sc.id === 'propre' ? null : keyMoment(g, { camp: sc.camp ?? null, from: sc.from, to: sc.to, prefer: sc.prefer ?? null });
  if (km) {
    const f = km.fault, dif = difficultyOf(f.type, f.latence), parts = [];
    if (sc.id !== 'bascule') parts.push(fill(T.moment.coupCle, { coup: moveRef(f), camp: camp(f.side), notation: notationRef(f) }));
    if (dif) parts.push(fill(dif.moves === null ? T.moment.instable : (f.type === 'faute de calcul' ? T.moment.visible : T.moment.profond), { nbCoups: letters(dif.moves) }));
    if (parts.length) sentences.push(join(...parts));
  }
  // Phrase 3 : adressée au camp concerné (aucune dans « propre », « neutre » et « mouvementée », qui n'en ont pas) ; « Avantage gâché » a sa phrase
  // propre ; sinon la phase est celle du coup clé s'il y en a un, sinon celle où ce camp a le plus perdu
  if (sc.camp && sc.id !== 'propre') {
    const c = sc.camp;
    if (sc.id === 'gache') sentences.push(fill(T.retenir.gache, { camp: camp(c) }));
    else if (!(g.faults ?? []).some((f) => f.side === c)) sentences.push(fill(T.retenir.rien, { camp: camp(c), autreCamp: camp(other(c)) }));
    else { const ph = retainPhase(g, c, km); if (ph) sentences.push(fill(T.retenir[(ph === 'milieu' || ph === 'finale') && gravesOutsidePhase(g, c, ph) ? `${ph}Mixte` : ph], { camp: camp(c) })); }
  }
  return { scenario: sc.id, sentences };
}

// Texte brut d'un récit (tests, accessibilité).
export const plainText = (story) => story.sentences.map((s) => s.map((p) => p.t).join('')).join('\n');
