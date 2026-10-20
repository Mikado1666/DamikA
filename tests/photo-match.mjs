// Correspondance nom → photo et « Retirer la photo » (js/photo-match.js). Tests Node, aucun navigateur.
//   A. Cas précis : graphies d'un même nom, nom de famille seul, homonymes (photos différentes = aucune photo).
//   B. Le comportement d'AFFICHAGE n'a pas changé : le nouveau lookupInTable() rend la même photo et la même ambiguïté
//      que l'ancienne version (copiée ci-dessous, d'avant la correction du 20/10/2026) sur 20 000 cas aléatoires.
//   C. « Retirer la photo » : pour TOUT cas où une photo manuelle est affichée, supprimer manualPhotoKeys() la fait
//      disparaître (bug corrigé : la clé n'était cherchée qu'à l'identique, au caractère près, du nom affiché).
import { lookupInTable, manualPhotoKeys, nameTokens } from '../js/photo-match.js';
import { mulberry32 } from './helpers.mjs';

let failures = 0;
const ok = (label, cond, extra = '') => { if (!cond) failures++; console.log(`${cond ? 'OK ' : 'ERR'} ${label}${extra ? ' — ' + extra : ''}`); };

// Ancienne version (main.js avant correction), copiée telle quelle : sert de référence pour B.
function oldSurnameOf(key) {
  if (key.includes(',')) return key.split(',')[0].trim().toLowerCase();
  const words = key.trim().split(/\s+/);
  return words[words.length - 1].toLowerCase();
}
function oldLookupInTable(table, typedTokens, typedNorm) {
  for (const key of Object.keys(table)) {
    const keyNorm = [...nameTokens(key)].sort().join(' ');
    if (keyNorm === typedNorm) return { url: table[key], ambiguous: false };
  }
  if (typedTokens.length === 1) {
    const surname = typedTokens[0];
    const candidates = new Set();
    for (const key of Object.keys(table)) {
      if (oldSurnameOf(key) === surname) candidates.add(table[key]);
    }
    if (candidates.size === 1) return { url: [...candidates][0], ambiguous: false };
    if (candidates.size > 1) return { url: null, ambiguous: true };
  }
  return { url: null, ambiguous: false };
}
const look = (table, rawName) => {
  const tokens = nameTokens(rawName);
  return lookupInTable(table, tokens, [...tokens].sort().join(' '));
};

// --- A. Cas précis -----------------------------------------------------------------------------------------------------
{
  const U1 = 'https://exemple.test/1.jpg', U2 = 'https://exemple.test/2.jpg';
  const t = { 'Dupont, Marie': U1 };
  ok('A1 même nom, autre graphie : « Marie Dupont » retrouve la photo enregistrée sous « Dupont, Marie »', look(t, 'Marie Dupont').url === U1);
  ok('A1 … et les clés à supprimer sont celles du registre, pas le nom tapé', JSON.stringify(manualPhotoKeys(t, 'Marie Dupont')) === JSON.stringify(['Dupont, Marie']));
  ok('A2 nom de famille seul : « Dupont » retrouve la photo, clé à supprimer = « Dupont, Marie »', look(t, 'Dupont').url === U1 && manualPhotoKeys(t, 'dupont')[0] === 'Dupont, Marie');
  ok('A3 casse, virgule et espaces ignorés : « DUPONT   marie »', look(t, 'DUPONT   marie').url === U1);
  ok('A4 aucun registre : rien à retirer', manualPhotoKeys({}, 'Marie Dupont').length === 0 && manualPhotoKeys(t, '').length === 0 && manualPhotoKeys(t, '   ').length === 0 && manualPhotoKeys(t, null).length === 0);
  ok('A5 autre joueur : rien à retirer', manualPhotoKeys(t, 'Martin, Paul').length === 0 && manualPhotoKeys(t, 'Martin').length === 0);

  const two = { 'Dupont, Marie': U1, 'Marie Dupont': U1 };
  ok('A6 deux graphies du même joueur dans le registre : les DEUX sont à supprimer (sinon la photo resterait)', manualPhotoKeys(two, 'Dupont, Marie').length === 2);

  const homonyms = { 'Dupont, Marie': U1, 'Dupont, Jean': U2 };
  ok('A7 homonymes de photos différentes, nom de famille seul : aucune photo affichée, rien à retirer', look(homonyms, 'Dupont').ambiguous === true && manualPhotoKeys(homonyms, 'Dupont').length === 0);
  ok('A7 … mais avec le nom complet la bonne photo est retrouvée', look(homonyms, 'Jean Dupont').url === U2 && manualPhotoKeys(homonyms, 'Jean Dupont')[0] === 'Dupont, Jean');
  const sameUrl = { 'Dupont, Marie': U1, 'Dupont, Jean': U1 };
  ok('A8 même nom de famille et même photo : la photo s\'affiche pour « Dupont » et les 2 entrées sont à supprimer', look(sameUrl, 'Dupont').url === U1 && manualPhotoKeys(sameUrl, 'Dupont').length === 2);
}

// --- B + C. Cas aléatoires ----------------------------------------------------------------------------------------------
{
  const rnd = mulberry32(2026);
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  const lasts = ['Dupont', 'Martin', 'Callegari', 'De Vries', 'Van Der Berg', 'Smith'];
  const firsts = ['Marie', 'Jean', 'Mickael', 'Anna', 'Piet'];
  const urls = ['u1', 'u2', 'u3'];
  const spell = (last, first) => pick([`${last}, ${first}`, `${first} ${last}`, `${last} ${first}`, `${last.toUpperCase()},${first.toLowerCase()}`, `  ${last}   ${first} `, last]);
  let diff = 0, shown = 0, multiShown = 0, multiGone = 0, singleShown = 0, singleGone = 0, singleNeededMore = 0, keysNotInTable = 0, noProgress = 0;
  const N = 20000;
  for (let i = 0; i < N; i++) {
    const table = {};
    const n = Math.floor(rnd() * 6);
    for (let k = 0; k < n; k++) table[spell(pick(lasts), pick(firsts))] = pick(urls);
    const typed = spell(pick(lasts), pick(firsts));
    const tokens = nameTokens(typed);
    if (tokens.length === 0) continue;
    const norm = [...tokens].sort().join(' ');
    const a = oldLookupInTable(table, tokens, norm), b = lookupInTable(table, tokens, norm);
    if (a.url !== b.url || a.ambiguous !== b.ambiguous) diff++;
    if (!b.url) continue;
    shown++;
    // Un « clic » sur Retirer : supprime les clés renvoyées. On répète comme le ferait l'utilisateur.
    const after = { ...table };
    let clicks = 0;
    while (manualPhotoKeys(after, typed).length > 0 && clicks < 5) {
      const keys = manualPhotoKeys(after, typed);
      if (keys.some((k) => !Object.hasOwn(after, k))) keysNotInTable++;
      const before = Object.keys(after).length;
      keys.forEach((k) => { delete after[k]; });
      if (Object.keys(after).length >= before) noProgress++;
      clicks++;
      if (clicks === 1) {
        // Nom complet (2 mots ou plus) : aucune photo ne peut réapparaître par repli sur le nom de famille.
        if (tokens.length > 1) { multiShown++; if (look(after, typed).url === null) multiGone++; }
      }
    }
    if (tokens.length === 1) { singleShown++; if (look(after, typed).url === null) singleGone++; if (clicks > 1) singleNeededMore++; }
  }
  ok(`B affichage inchangé : même photo et même ambiguïté que l'ancienne version sur ${N} cas`, diff === 0, `${diff} écart(s)`);
  ok(`C « Retirer la photo », nom complet : sur ${multiShown} cas où une photo s'affiche, UN clic la fait toujours disparaître`, multiShown > 0 && multiGone === multiShown, `${multiShown - multiGone} échec(s)`);
  ok(`C « Retirer la photo », nom de famille seul : sur ${singleShown} cas, quelques clics la retirent toujours (${singleNeededMore} cas où une autre entrée du même nom de famille a pris le relais)`, singleShown > 0 && singleGone === singleShown);
  ok('C chaque clic supprime au moins une entrée du registre, et seulement des clés qui existent', noProgress === 0 && keysNotInTable === 0);

  // Reproduction du bug d'origine : la suppression à la clé exacte ne retirait pas la photo.
  let oldWouldFail = 0, cases = 0;
  const rnd2 = mulberry32(7);
  for (let i = 0; i < 2000; i++) {
    const last = lasts[Math.floor(rnd2() * lasts.length)], first = firsts[Math.floor(rnd2() * firsts.length)];
    const table = { [`${last}, ${first}`]: 'u1' };
    const typed = `${first} ${last}`; // autre graphie du même joueur
    cases++;
    const after = { ...table };
    delete after[typed.trim()]; // ancien code : playerPhotoRegistry[name]
    if (look(after, typed).url === 'u1') oldWouldFail++;
  }
  ok(`C bug reproduit avec l'ancien code (suppression à la clé exacte) : la photo restait affichée dans ${oldWouldFail}/${cases} cas de graphie différente`, oldWouldFail === cases);
}

console.log(failures === 0 ? 'RÉSULTAT : tout concorde.' : `RÉSULTAT : ${failures} échec(s).`);
process.exit(failures === 0 ? 0 : 1);
