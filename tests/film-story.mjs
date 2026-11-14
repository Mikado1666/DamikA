// P42C — Le récit de la partie (js/analysis/film-story.js) : reconnaissance des scénarios, choix des éléments, phrases, nombres en
// lettres, liens cliquables, récit absent tant que l'analyse n'est pas terminée. Données synthétiques (aucun Scan).
//   node tests/film-story.mjs
import * as S from '../js/analysis/film-story.js';

let failures = 0;
const ok = (label, cond, extra = '') => { if (!cond) failures++; console.log(`${cond ? 'OK ' : 'ERR'} ${label}${extra ? ' — ' + extra : ''}`); };

// partie synthétique : evals (n+1), fautes { ply, side, L, gravite, type, latence }, pieces (n+1)
const game = (evals, faults = [], extra = {}) => {
  const n = evals.length - 1;
  const rows = Array.from({ length: n }, (_, ply) => { const f = faults.find((x) => x.ply === ply); return { ply, moveNo: Math.floor(ply / 2) + 1, side: ply % 2 ? 'b' : 'w', played: '32-28', L: f ? f.L : 0.05 }; });
  return { evals, rows, pieces: Array.from({ length: n + 1 }, (_, k) => 40 - Math.floor((k * 30) / n)), faults: faults.map((f) => ({ no: Math.floor(f.ply / 2) + 1, joue: '40-34', meilleur: '46-41', type: 'faute de calcul', latence: 3, ...f })), tournant: null, ...extra };
};
const flat = (n, v) => Array(n + 1).fill(v);
const ramp = (n, a, b) => Array.from({ length: n + 1 }, (_, k) => a + ((b - a) * k) / n);
const F = (ply, L, gravite = 'faute', extra = {}) => ({ ply, side: ply % 2 ? 'b' : 'w', L, gravite, ...extra });
const text = (g) => S.plainText(S.storyOf(g));

// ---- utilitaires ----
ok('A1 valeur finale = moyenne des 3 dernières positions', S.finalValue([0, 0, 1, 2, 3]) === 2 && S.finalValue([0, null, 4, null]) === 2);
ok('A2 changements de camp : 0 → +1 → −1 → +1 → −1 = 3 (la zone ±0,5 est ignorée)', S.leadChanges([0, 1, 0.2, -1, 0.1, 1, -1]) === 3 && S.leadChanges([0, 0.4, -0.4, 0.3]) === 0);

// ---- scénarios, dans l'ordre ----
const mov = (() => { const e = [0, 1, 0, -1, 0, 1, 0, -1, -0.8, -1.2]; return game(e, [F(2, 1, 'faute'), F(4, 1.5, 'majeure'), F(3, 1, 'faute'), F(5, 1, 'faute')]); })();
ok('B1 scénario 1 : partie mouvementée (3 changements + 2 fautes sérieuses de chaque camp)', S.scenarioOf(mov).id === 'mouvementee' && text(mov).includes('l\'avantage change trois fois de camp'), text(mov));
const movOne = game([0, 1, 0, -1, 0, 1, 0, -1, -0.8, -1.2], [F(2, 1), F(4, 1.5, 'majeure'), F(3, 1)]);
ok('B2 une seule faute d\'un camp : pas mouvementée', S.scenarioOf(movOne).id !== 'mouvementee');
const rev = game([0, 0.5, 1.2, 1.5, 0.5, -0.5, -1.5, -2, -2], [F(4, 1.5)]); // fenêtre des Blancs : coups joués 3 à 5, faute des Blancs au coup joué 4
ok('B3 scénario 2 : renversement (les Blancs ont eu +1,5, les Noirs finissent à −2)', S.scenarioOf(rev).id === 'renversement' && S.scenarioOf(rev).camp === 'w' && text(rev).startsWith('Les Blancs tenaient la partie jusqu\'au 2e coup. Les Noirs retournent la situation en quelques coups.'), text(rev));
const gache = game([0, 1, 1.8, 1.2, 0.6, 0.2, 0.1, 0.2], [F(4, 1.1)]);
ok('B4 scénario 3 : avantage gâché (+1,8 puis égalité)', S.scenarioOf(gache).id === 'gache' && text(gache).startsWith('Les Blancs avaient la partie en main au 1er coup. Ils laissent filer leur avantage et la partie finit à égalité.'), text(gache));

const gacheNoirs = game([0, -1, -1.6, -1, -0.2, 0, 0.1, 0], [F(3, 1)]);
ok('B5 avantage gâché par les Noirs', S.scenarioOf(gacheNoirs).camp === 'b');
const bas = game([0.1, 0.2, 0, -0.2, -0.1, -1.2, -1.5, -1.6, -1.4], [F(4, 1.2, 'majeure')], { tournant: { ply: 4, moveNo: 3, side: 'w', played: '40-34', gravite: 'majeure', L: 1.2 } });
ok('B6 scénario « bascule nette », partie équilibrée avant', S.scenarioOf(bas).id === 'bascule' && text(bas).startsWith('Partie équilibrée jusqu\'au 2e coup. Au 3e coup, les Blancs jouent 40-34 et tout bascule.'), text(bas));
const basInegale = game([0.1, 0.3, 0.8, 0.9, 0.9, -0.4, -1.2, -1.5, -1.4], [F(4, 1.3, 'majeure')], { tournant: { ply: 4, moveNo: 3, side: 'w', played: '40-34', gravite: 'majeure', L: 1.3 } });
ok('B7 bascule : la partie n\'était pas à égalité → « Les Blancs tenaient encore la partie »', text(basInegale).startsWith('Les Blancs tenaient encore la partie jusqu\'au 2e coup. Au 3e coup,'), text(basInegale));
const pap = game(ramp(10, 0, -2.4), [F(2, 0.5, 'légère'), F(6, 0.6, 'légère'), F(7, 0.5, 'faute')]); // au moins une faute sérieuse (la 7), pas de tournant
ok('B8 scénario « petit à petit » (pas de tournant, avantage net final)', S.scenarioOf(pap).id === 'petitAPetit' && S.scenarioOf(pap).camp === 'w' && /^Aucun coup ne perd la partie à lui seul\. Les Blancs cèdent du terrain petit à petit, et à partir du [^ ]+ coup les Noirs ne lâchent plus leur avantage\./.test(text(pap)), text(pap));
const propre = game(flat(8, 0.1), [F(2, 0.4, 'légère')]);
ok('B9 scénario « partie propre » (aucune faute « faute » ou « majeure »)', S.scenarioOf(propre).id === 'propre' && text(propre).startsWith('Partie sérieuse des deux côtés : personne ne commet de vraie faute, et l\'équilibre tient du début à la fin.') && S.storyOf(propre).sentences.length === 1, text(propre));
const propreMieux = S.storyOf({ ...propre, evals: ramp(8, 0, 1.2) });
ok('B10 « partie propre » passe avant « petit à petit » : sans faute et avantage net final → « … mais les Blancs finissent mieux »', propreMieux.scenario === 'propre' && propreMieux.sentences[0].map((p) => p.t).join('') === 'Partie sérieuse des deux côtés : personne ne commet de vraie faute, mais les Blancs finissent mieux.', S.plainText(propreMieux));
const neutre = game(flat(8, 0.2), [F(2, 0.9, 'faute', { gravite: 'faute' })]);
ok('B11 scénario neutre (une faute sérieuse mais ni bascule ni avantage net)', S.scenarioOf(neutre).id === 'neutre' && text(neutre).startsWith('Partie disputée, sans coup décisif : les deux camps restent proches jusqu\'au bout.'), text(neutre));

const basN = game([0.1, 0.2, 0, -0.1, 0, 0.1, 0.2, 1.2, 1.5, 1.4], [F(5, 1.2, 'majeure')], { tournant: { ply: 5, moveNo: 3, side: 'b', played: '19-23', gravite: 'majeure', L: 1.2 } });
ok('B12 bascule sur un coup des Noirs : « Les Noirs répondent 19-23 et tout bascule. » (numéro non répété)', text(basN).startsWith('Partie équilibrée jusqu\'au 3e coup. Les Noirs répondent 19-23 et tout bascule.'), text(basN));
const basNI = game([0.1, 0.3, 0.8, 0.9, 0.9, 0.9, 0.9, 1.2, 1.5, 1.4], [F(5, 1.2, 'majeure')], { tournant: { ply: 5, moveNo: 3, side: 'b', played: '19-23', gravite: 'majeure', L: 1.2 } });
ok('B13 même logique pour « tenaient encore la partie » : « … jusqu\'au 3e coup. Ils répondent 19-23 et tout bascule. »', text(basNI).startsWith('Les Noirs tenaient encore la partie jusqu\'au 3e coup. Ils répondent 19-23 et tout bascule.'), text(basNI));
ok('B14 les liens du récit des Noirs : le numéro et la notation, tous deux sur le coup en cause (ply 5)', S.storyOf(basN).sentences[0].filter((p) => p.ply !== undefined).map((p) => p.ply).join() === '4,5', JSON.stringify(S.storyOf(basN).sentences[0].filter((p) => p.ply !== undefined)));

// ---- P42C-4 : camp concerné, fenêtre, coup clé ----
const jt = (st, i) => st.sentences[i].map((p) => p.t).join('');
// renversement : la grosse faute des Noirs (coup joué 3, DANS la fenêtre mais camp non concerné) ne doit pas être choisie ; celle des Blancs oui
const rev2 = game([0, 0.5, 1.2, 1.5, 0.5, -0.5, -1.5, -2, -2], [F(3, 3), F(4, 1.5), F(0, 4)]);
ok('E1 renversement : coup clé = faute du camp qui perd son avantage (Blancs), dans la fenêtre (pas la faute des Noirs, ni celle avant)', jt(S.storyOf(rev2), 1).startsWith('Le coup clé est le 3e coup des Blancs'), jt(S.storyOf(rev2), 1));
ok('E2 renversement : {n} = meilleur moment du camp concerné (+1,5 à la position 3 → 2e coup) ; faute grave avant → « Après une partie agitée, … »', jt(S.storyOf(rev), 0).startsWith("Les Blancs tenaient la partie jusqu'au 2e coup.") && jt(S.storyOf(rev2), 0).startsWith('Après une partie agitée, les Blancs avaient l\'avantage au 2e coup.'), jt(S.storyOf(rev2), 0));
ok('E3 renversement sans faute du camp concerné dans la fenêtre : pas de phrase 2', S.storyOf(game([0, 0.5, 1.2, 1.5, 0.5, -0.5, -1.5, -2, -2], [F(3, 1.5), F(0, 4)])).sentences.length === 2);
const gache2 = game([0, 1, 1.8, 1.2, 0.6, 0.2, 0.1, 0.2], [F(0, 3), F(4, 1.1), F(3, 2)]);
ok('E4 gâché : coup clé = faute du camp qui gâche après son meilleur moment (pas celle avant, pas celle de l autre camp)', jt(S.storyOf(gache2), 1).startsWith('Le coup clé est le 3e coup des Blancs'), jt(S.storyOf(gache2), 1));
ok('E5 gâché : fautes de gravité légère seulement → à défaut, la plus coûteuse signalée dans la fenêtre', jt(S.storyOf(game([0, 1, 1.8, 1.2, 0.6, 0.2, 0.1, 0.2], [F(4, 0.4, 'légère')])), 1).startsWith('Le coup clé est le 3e coup des Blancs'));
const pap2 = game(ramp(10, 0, -2.4), [F(1, 3), F(4, 1, 'faute'), F(8, 0.6, 'légère'), F(7, 0.5, 'faute')]);
ok('E6 petit à petit : camp = celui qui finit le plus mal (Blancs), toute la partie ; faute des Noirs ignorée', jt(S.storyOf(pap2), 1).startsWith('Le coup clé est le 3e coup des Blancs'), jt(S.storyOf(pap2), 1));
const movG = game([0, 1, 0, -1, 0, 1, 0, -1, -0.8, -1.2], [F(2, 1, 'faute'), F(4, 1.5, 'majeure'), F(3, 2, 'faute'), F(5, 1, 'faute')]);
ok('E7 mouvementée : pas de camp, la faute la plus coûteuse de la partie (Noirs, coup joué 3), aucune phrase 3', jt(S.storyOf(movG), 1).startsWith('Le coup clé est le 2e coup des Noirs') && S.storyOf(movG).sentences.length === 2, jt(S.storyOf(movG), 1));
ok('E8 neutre : aucune phrase 3', S.storyOf(neutre).sentences.length === 2);
// bascule : le tournant est le coup clé, même si une autre faute plus coûteuse existe dans la fenêtre
ok('E9 bascule nette : le coup du tournant emporte sur une faute plus coûteuse voisine', S.keyMoment(bas, { camp: 'w', from: 2, to: 6, prefer: 4 }).fault.ply === 4 && S.keyMoment(game(flat(8, 0), [F(4, 1), F(6, 3)]), { camp: 'w', from: 2, to: 6, prefer: 4 }).fault.ply === 4);
ok('E10 phrase 3 adressée au camp concerné : bascule des Blancs → Blancs', jt(S.storyOf(bas), 2).startsWith('À retenir pour les Blancs'));
ok('E11 phrase 3 du renversement = camp qui a perdu son avantage (Blancs), pas le vainqueur', jt(S.storyOf(rev2), 2).startsWith('À retenir pour les Blancs'));


// ---- phrase 2 ----
const st = S.storyOf(bas);
ok('C1 tournant : phrase 2 sans « le coup le plus coûteux », bévue visible (latence 3 → deux coups)', st.sentences[1].map((p) => p.t).join('') === 'La punition se voyait en deux coups : c\'est une faute d\'attention, pas de calcul.', text(bas));
const prof = S.storyOf({ ...bas, faults: bas.faults.map((f) => ({ ...f, type: 'piège profond', latence: 11 })) });
ok('C2 piège profond : « six coups » en lettres', prof.sentences[1].map((p) => p.t).join('') === 'Le coup avait l\'air naturel. Il fallait calculer six coups pour voir le danger.');
const inst = S.storyOf({ ...bas, faults: bas.faults.map((f) => ({ ...f, type: 'instable', latence: null })) });
ok('C3 instable : « Même le moteur hésite… »', inst.sentences[1].map((p) => p.t).join('') === 'Même le moteur hésite sur ce coup : la position était vraiment compliquée.');
const sans = game([0, 0.4, 0, -0.2, 0.1, 1.2, 1.4, 1.5, 1.6], [F(3, 1.4, 'majeure')]);
ok('C4 hors bascule nette : « Le coup clé est le 2e coup des Noirs (40-34). » (dit le camp) puis la difficulté', S.storyOf(sans).sentences[1].map((p) => p.t).join('').startsWith('Le coup clé est le 2e coup des Noirs (40-34). La punition se voyait en deux coups'), text(sans));
ok('C5 « partie propre » : jamais de phrase 2, même avec une faute légère signalée', S.storyOf(propre).sentences.length === 1 && S.keyMoment(game(flat(8, 0), [])) === null);
ok('C6 le coup le plus coûteux = la plus grosse perte parmi « faute » / « majeure » (une légère plus grosse est ignorée)', S.keyMoment(game(flat(8, 0.1), [F(2, 5, 'légère'), F(4, 1, 'faute'), F(6, 2, 'majeure')])).fault.ply === 6);
// occasion manquée : faute des Blancs (ply 4) suivie d'une faute signalée des Noirs (ply 5)
const occ = game([0, 0, 0, 0, 0, 1.2, 0.1, -0.3, -1.4, -1.6], [F(4, 1.2, 'majeure'), F(5, 1.3, 'légère'), F(6, 1.6, 'faute')]);
ok('C7 occasion manquée : la fonction la trouve (faute des Blancs au 3e coup puis faute des Noirs), mais le récit ne la dit plus', S.missedChance(occ)?.ply === 4 && !text(occ).includes('Juste avant'), text(occ));
ok('C8 pas d\'occasion manquée si l\'adversaire ne fait pas de faute au coup d\'après', S.missedChance(game(flat(8, 0), [F(4, 1.2, 'majeure')])) === null);
ok('C9 une seule occasion : la plus coûteuse', S.missedChance(game(flat(12, 0), [F(2, 1, 'faute'), F(3, 1, 'légère'), F(6, 2, 'majeure'), F(7, 1, 'légère')])).ply === 6);

// le coup clé est nommé UNE fois
ok('C15 bascule nette : la phrase 1 nomme le coup, la phrase 2 ne le répète pas', !S.storyOf(bas).sentences[1].map((p) => p.t).join('').includes('Le coup clé'), text(bas));
ok('C16 les autres scénarios nomment le coup clé en phrase 2 (renversement, gâché, neutre, mouvementée…), avec le camp', [rev, gache, neutre, mov].every((g) => /^Le coup clé est le [^ ]+ coup des (Blancs|Noirs) \([^)]+\)\./.test(S.storyOf(g).sentences[1].map((p) => p.t).join(''))), [rev, gache, neutre, mov].map((g) => S.storyOf(g).sentences[1]?.map((p) => p.t).join('')).join(' // '));
ok('C17 « Le coup clé » : le numéro et la notation sont cliquables sur le coup en cause', S.storyOf(sans).sentences[1].filter((p) => p.ply === 3).length === 2);
ok('C18 plus aucune phrase « le coup le plus coûteux » dans la banque', !/le plus coûteux/.test(JSON.stringify(S.STORY_TEXT)));
ok('B15 bascule « tenaient encore » : pas de répétition du camp (« …Au 3e coup, ils jouent 40-34 et tout bascule. »)', text(basInegale).startsWith('Les Blancs tenaient encore la partie jusqu\'au 2e coup. Au 3e coup, ils jouent 40-34 et tout bascule.'), text(basInegale));

// ---- phrase 3 ----
const r3 = S.storyOf(game([0, 0, 0, -0.5, -1.4, -1.5, -1.6, -1.8, -1.9], [F(4, 1.2, 'majeure')]));
ok('C10 à retenir : camp qui finit le moins bien (Blancs), phase de sa plus grosse perte', r3.sentences.length === 3 && r3.sentences[2].map((p) => p.t).join('').startsWith('À retenir pour les Blancs :'), plainText(r3));
function plainText(s) { return S.plainText(s); }
const phaseGame = (ply, side) => { const g = game([0, 0, 0, -1.4, -1.5, -1.6, -1.8, -1.9, -2], [F(ply, 1.2, 'majeure')]); g.pieces = [40, 38, 34, 28, 24, 21, 17, 12, 9]; return g; };
ok('C11 phases : ouverture / milieu / finale', S.storyOf(phaseGame(0)).sentences[2].map((p) => p.t).join('') === 'À retenir pour les Blancs : l\'essentiel se perd dès l\'ouverture.'
  && S.storyOf(phaseGame(4)).sentences[2].map((p) => p.t).join('') === 'À retenir pour les Blancs : c\'est en milieu de partie que tout se joue, l\'ouverture et la finale sont tenues.'
  && S.storyOf(phaseGame(6)).sentences[2].map((p) => p.t).join('') === 'À retenir pour les Blancs : la partie était bien menée jusqu\'à la finale, c\'est là qu\'elle se perd.');
const rien = S.storyOf(game([0, 0, 0, -1.4, -1.5, -1.6, -1.8, -1.9, -2], [F(5, 1.2, 'majeure')]));
ok('C12 le camp qui finit le moins bien n\'a aucune faute signalée : « Rien à reprocher aux Blancs… »', rien.sentences[rien.sentences.length - 1].map((p) => p.t).join('') === 'Rien à reprocher aux Blancs : les Noirs ont simplement mieux joué.');
ok('C13 avantage gâché : la phrase 3 est « un avantage ne suffit pas… » pour le camp qui gâche', S.storyOf(gache).sentences.length === 3 && S.storyOf(gache).sentences[2].map((p) => p.t).join('') === 'À retenir pour les Blancs : un avantage ne suffit pas, il faut encore le concrétiser.', text(gache));
ok('C14 jamais plus de trois phrases (la 2e peut en contenir deux)', [mov, rev, gache, bas, pap, propre, neutre, occ, r3].every((g) => (S.storyOf(g) ?? { sentences: [] }).sentences.length <= 3));

// phrase 3 : la phase est celle du moment clé ; sans moment clé, la phase où le camp perd le plus tant que la partie n'est pas déjà perdue
const lateLoss = game([0, 0, 0, 0, -0.3, -2.4, -2.6, -3, -3.4, -3.6], [F(0, 0.3, 'légère')]); // une seule petite perte au début ; la grosse perte vient après avoir déjà 2,0 de retard
lateLoss.pieces = [40, 38, 36, 34, 32, 30, 24, 17, 12, 9];
lateLoss.rows = lateLoss.rows.map((r) => (r.ply === 6 ? { ...r, L: 1.5 } : r)).map((r) => (r.ply === 8 ? { ...r, L: 1.5 } : r)); // pertes en finale / milieu, déjà à plus de 2 pions de retard
ok('C19 sans moment clé : les pertes faites alors que la partie était déjà perdue (≥ 2,0 de retard) sont ignorées → « ouverture »', S.worstPhase(lateLoss, 'w') === 'ouverture', String(S.worstPhase(lateLoss, 'w')));
ok('C20 seuil de retard en tête du fichier (2,0)', S.LOST_BEHIND === 2.0);
const noLate = game([0, 0, 0, 0, -0.3, -0.8, -1.0, -1.2, -1.4, -1.6], []); noLate.pieces = [40, 38, 36, 34, 32, 30, 24, 17, 12, 9]; noLate.rows = noLate.rows.map((r) => (r.ply === 8 ? { ...r, L: 1.5 } : r));
ok('C21 la même perte faite quand la partie n\'était PAS perdue compte (finale)', S.worstPhase(noLate, 'w') === 'finale');
ok('C22 le moment clé impose sa phase, même si le camp a perdu davantage ailleurs', (() => { const g = game([0, 0, 0, 0, -0.5, -1.4, -1.5, -1.6, -1.8], [F(4, 1.0, 'majeure')]); g.pieces = [40, 38, 36, 34, 26, 24, 17, 14, 12]; g.rows = g.rows.map((r) => (r.ply === 6 ? { ...r, L: 5 } : r)); return S.retainPhase(g, 'w') === 'milieu' && S.worstPhase(g, 'w') === 'finale'; })());
ok('C23 pas de phrase 3 dans « partie propre » ni « neutre »', S.storyOf(propre).sentences.length === 1 && !S.plainText(S.storyOf(neutre)).includes('À retenir') && S.storyOf({ ...propre, evals: ramp(8, 0, 1.2) }).sentences.length === 1);

// ---- liens cliquables, nombres, absence tant que l'analyse n'est pas terminée ----
const links = S.storyOf(bas).sentences[0].filter((p) => p.ply !== undefined);
ok('D1 numéro de coup, coup et notation cliquables (le coup en cause : ply 4)', links.length === 3 && links.filter((p) => p.ply === 4).length === 2 && links.some((p) => p.t === '40-34'), JSON.stringify(links));
ok('D2 les numéros de coups restent en chiffres, les nombres de 1 à 9 en lettres (au-delà : chiffres)', S.storyOf(mov).sentences[0].map((p) => p.t).join('').includes('trois fois') && !/\b3 fois\b/.test(text(mov)) && S.STORY_TEXT.nombres[1] === 'un' && S.STORY_TEXT.nombres[9] === 'neuf');
ok('D3 analyse non terminée (ligne en attente) : pas de récit', S.storyOf({ ...bas, rows: [...bas.rows, { ply: 8, pending: true }] }) === null && S.storyOf(null) === null && S.storyOf({ rows: [], evals: [] }) === null);
ok('D4 la phrase d\'attente est dans la banque', typeof S.STORY_TEXT.attente === 'string' && S.STORY_TEXT.attente.length > 10);
const all = JSON.stringify(S.STORY_TEXT);
ok('D5 vocabulaire : ni « demi-coup » ni « érosion » dans la banque de phrases', !/demi-coup|érosion/i.test(all));

// ---- P48E : ordinaux (« le 20e coup », « au 3e coup ») ----
const longG = game(Array.from({ length: 95 }, (_, k) => (k < 80 ? 0.1 : -1.4)), [F(80, 1.4, 'majeure')], { tournant: { ply: 80, moveNo: 41, side: 'w', played: '48-42', gravite: 'majeure', L: 1.4 } });
ok('F1 ordinaux : chiffres + « e », sans exposant (jusqu au 40e coup, au 41e coup)', text(longG).startsWith("Les Blancs tenaient encore la partie jusqu'au 40e coup. Au 41e coup, ils jouent 48-42 et tout bascule."), text(longG));
ok('F2 la mention « 41e » reste cliquable sur le coup en cause ; la notation aussi', S.storyOf(longG).sentences[0].filter((p) => p.ply !== undefined).map((p) => p.t).join(',') === '40e,41e,48-42', JSON.stringify(S.storyOf(longG).sentences[0].filter((p) => p.ply !== undefined)));
ok('F3 aucun « coup N » en chiffres nus dans le récit (hors durées : « en deux coups »)', ![rev, gache, bas, pap, longG, mov].some((g) => /coup \d/.test(text(g))), [rev, gache, bas].map(text).join(' / '));
ok('F4 la banque de phrases ne contient plus « coup {n} » ni « coup {coup} »', !/coup \{(n|coup)\}/.test(JSON.stringify(S.STORY_TEXT)));

// ---- P48F : jamais « équilibrée » ni « tenaient » quand de grosses fautes précèdent ----
// Reproduit le cas de Mickaël : faute majeure des Blancs au 2e coup (−2,6), faute majeure des Noirs au 2e coup qui ne la punit pas, évaluation revenue
// à ~0, puis tournant des Blancs au 4e coup.
const occ48 = game([0, 0, 0, -2.6, 0, 0, 0, -1.5, -1.6, -1.7, -1.8], [F(2, 2.6, 'majeure'), F(3, 2.6, 'majeure'), F(6, 1.5, 'majeure')], { tournant: { ply: 6, moveNo: 4, side: 'w', played: '32-27', gravite: 'majeure', L: 1.5 } });
ok('G1 occasion manquée : « équilibrée » n\'apparaît pas et la faute du 2e coup est nommée', !/équilibrée|tenaient/.test(jt(S.storyOf(occ48), 0)) && /^Les Blancs lâchent l'équivalent de 3 pions au 2e coup, mais les Noirs n'en profitent pas\. Au 4e coup, les Blancs jouent 32-27 et cette fois tout bascule\.$/.test(jt(S.storyOf(occ48), 0)), jt(S.storyOf(occ48), 0));
ok('G2 les mentions du coup de la faute et du tournant sont cliquables (2e → coup joué 2, 4e → coup joué 6, notation → 6)', JSON.stringify(S.storyOf(occ48).sentences[0].filter((p) => p.ply !== undefined).map((p) => [p.t, p.ply])) === JSON.stringify([['2e', 2], ['4e', 6], ['32-27', 6]]), JSON.stringify(S.storyOf(occ48).sentences[0].filter((p) => p.ply !== undefined)));
ok('G3 cohérence des trois phrases : le coup clé reste le tournant (phrase 2 sans « coup clé »), phrase 3 pour les Blancs, pas de contradiction', S.storyOf(occ48).sentences.length === 3 && !/Le coup clé/.test(jt(S.storyOf(occ48), 1)) && jt(S.storyOf(occ48), 2).startsWith('À retenir pour les Blancs') && !/équilibrée/.test(text(occ48)), text(occ48));
const occ48N = game([0, 0, 0, 0, 2.4, 0, 0, 0, 0, 0, 1.5, 1.6, 1.7, 1.8], [F(3, 2.4, 'majeure'), F(4, 2.4, 'majeure'), F(9, 1.5, 'majeure')], { tournant: { ply: 9, moveNo: 5, side: 'b', played: '19-23', gravite: 'majeure', L: 1.5 } });
ok('G4 occasion manquée, tournant des Noirs : « Les Noirs lâchent … Les Noirs répondent … cette fois tout bascule. »', /^Les Noirs lâchent l'équivalent de 2 pions au 2e coup, mais les Blancs n'en profitent pas\. Les Noirs répondent 19-23 et cette fois tout bascule\.$/.test(jt(S.storyOf(occ48N), 0)), jt(S.storyOf(occ48N), 0));
const agite48 = game([0, 0, -1.5, -1.6, 0, 0.2, 0, 0, -1.6, -1.7, -1.8], [F(2, 1.5, 'faute'), F(4, 1.4, 'faute'), F(7, 1.6, 'majeure')], { tournant: { ply: 7, moveNo: 4, side: 'b', played: '19-23', gravite: 'majeure', L: 1.6 } });
ok('G5 plusieurs fautes avant, sans occasion manquée : « La partie était déjà agitée dès le … coup. »', /^La partie était déjà agitée dès le 2e coup\. Les Noirs répondent 19-23 et tout bascule\.$/.test(jt(S.storyOf(agite48), 0)), jt(S.storyOf(agite48), 0));
ok('G6 la formulation d\'origine reste pour une partie réellement propre avant le tournant (B6, B7, B12)', /^Partie équilibrée jusqu'au 2e coup/.test(text(bas)) && /^Les Blancs tenaient encore la partie jusqu'au 2e coup/.test(text(basInegale)) && /^Partie équilibrée jusqu'au 3e coup\. Les Noirs répondent/.test(text(basN)));
const gAg = game([0, 1, 1.8, 1.2, 0.6, 0.2, 0.1, 0.2], [F(0, 1.2, 'majeure'), F(4, 1.1)]);
ok('G7 avantage gâché précédé d\'une faute grave : « Après une partie agitée, … avaient la partie en main au … coup »', /^Après une partie agitée, les Blancs avaient la partie en main au 1er coup\./.test(text(gAg)) || /^Après une partie agitée, les Blancs avaient la partie en main au 2e coup\./.test(text(gAg)), jt(S.storyOf(gAg), 0));
ok('G8 gravesBefore : exclut le coup lui-même et les fautes légères', S.gravesBefore(occ48, 6).length === 2 && S.gravesBefore(occ48, 2).length === 0 && S.gravesBefore(game(flat(8, 0), [F(2, 0.4, 'légère')]), 8).length === 0);
ok('G9 missedChance(g, borne) : ne voit ni la faute ni la réponse au-delà de la borne', S.missedChance(occ48, 6)?.ply === 2 && S.missedChance(occ48, 3) === null);
ok('G10 aucun mot interdit dans les nouvelles phrases', !/demi-coup|érosion/i.test(JSON.stringify(S.STORY_TEXT)));

const mixte = (() => { const g = game([0, 0, 0, -1.4, -1.5, -1.6, -1.8, -1.9, -2], [F(0, 1.2, 'majeure'), F(6, 1.5, 'majeure')]); g.pieces = [40, 38, 34, 28, 24, 21, 17, 12, 9]; return g; })();
ok('G11 phrase 3 : plus de « tenues » / « bien menée » quand le camp a aussi de grosses fautes dans une autre phase', !/tenues|bien menée/.test(jt(S.storyOf(mixte), S.storyOf(mixte).sentences.length - 1)) && /^À retenir pour les Blancs : la finale décide de la partie, mais des erreurs plus tôt/.test(jt(S.storyOf(mixte), S.storyOf(mixte).sentences.length - 1)), text(mixte));
ok('G12 …et la formulation d origine reste quand toutes ses fautes sont dans la même phase (C11)', /bien menée jusqu'à la finale/.test(jt(S.storyOf(phaseGame(6)), 2)));

console.log(failures ? `\n${failures} échec(s)` : '\nTout est vert.');
process.exit(failures ? 1 : 0);
