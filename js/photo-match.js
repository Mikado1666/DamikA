// DAMIKA — Correspondance NOM DE JOUEUR → PHOTO. Fonctions PURES (aucun accès au DOM ni au localStorage) : testées sous
// Node (tests/photo-match.mjs), utilisées par main.js (affichage des avatars ET bouton « Retirer la photo »).
// Une « table » est un objet { nom du joueur: URL de la photo } : le registre manuel (playerPhotoRegistry) ou le
// pré-remplissage automatique (playerPhotoPrefill) — voir main.js, jamais mélangées.

// Découpe un nom en mots normalisés (minuscules, virgule traitée comme un espace) — sert de
// base à la correspondance tolérante ci-dessous : "Callegari, Mickael", "Mickael Callegari"
// et "CALLEGARI   Mickael" doivent tous se reconnaître comme le même joueur.
export function nameTokens(name) {
  return name.replace(/,/g, ' ').trim().toLowerCase().split(/\s+/).filter(Boolean);
}

// Nom de famille supposé d'une clé de registre : la partie avant la virgule si elle existe
// (convention PDN "Nom, Prénom" déjà utilisée partout dans l'app), sinon le dernier mot
// (repli "Prénom Nom" — imparfait pour un nom de famille à plusieurs mots, mais suffisant
// pour le cas visé : retrouver un joueur à partir de son seul nom de famille).
export function surnameOf(key) {
  if (key.includes(',')) return key.split(',')[0].trim().toLowerCase();
  const words = key.trim().split(/\s+/);
  return words[words.length - 1].toLowerCase();
}

// Cherche une correspondance dans UNE table (registre manuel OU pré-remplissage, jamais les
// deux mélangées — voir lookupPhotoUrl dans main.js) :
//  1. correspondance exacte tolérante (casse/espaces/virgule/ordre des mots ignorés) ;
//  2. à défaut, si le nom tapé est un seul mot (ex. juste le nom de famille), on le compare
//     au nom de famille de chaque entrée. Si toutes les entrées qui correspondent pointent
//     vers la MÊME photo, on la prend ; si elles pointent vers des photos différentes
//     (plusieurs joueurs distincts portant ce nom de famille), on ne choisit pas — mieux
//     vaut l'avatar par défaut qu'un risque de photo de la mauvaise personne.
// Retourne { url, ambiguous, keys } : `keys` = TOUTES les clés de la table qui fournissent la photo affichée
// (toutes les graphies exactes tolérantes, ou toutes les entrées du même nom de famille et de la même photo) :
// ce sont celles qu'il faut supprimer pour « retirer la photo ». Vide quand rien n'est affiché.
export function lookupInTable(table, typedTokens, typedNorm) {
  const exact = Object.keys(table).filter((key) => [...nameTokens(key)].sort().join(' ') === typedNorm);
  if (exact.length > 0) return { url: table[exact[0]], ambiguous: false, keys: exact };
  if (typedTokens.length === 1) {
    const surname = typedTokens[0];
    const keys = Object.keys(table).filter((key) => surnameOf(key) === surname);
    const urls = new Set(keys.map((key) => table[key]));
    if (urls.size === 1) return { url: [...urls][0], ambiguous: false, keys };
    if (urls.size > 1) return { url: null, ambiguous: true, keys: [] };
  }
  return { url: null, ambiguous: false, keys: [] };
}

// Clés de la table `table` (registre manuel) à supprimer pour que la photo affichée pour `rawName` disparaisse :
// celles que la recherche tolérante utilise réellement (et non la seule clé égale, au caractère près, au nom
// affiché : la photo peut avoir été enregistrée sous « Callegari, Mickael » et s'afficher pour « Mickael Callegari »
// ou pour « Callegari »). Tableau vide : aucune photo MANUELLE n'est affichée pour ce nom.
export function manualPhotoKeys(table, rawName) {
  if (!rawName) return [];
  const tokens = nameTokens(rawName);
  if (tokens.length === 0) return [];
  const hit = lookupInTable(table, tokens, [...tokens].sort().join(' '));
  return hit.url ? hit.keys : [];
}
