// DAMIKA — Ordre d'affichage de la Bibliothèque. Fonction PURE (aucun accès au DOM) : testée sous Node
// (tests/library-order.mjs), utilisée par renderLibrary() dans main.js.
//
// Retourne les INDICES (dans `entries`) des parties à afficher, dans l'ordre où elles doivent apparaître :
//   - vue « Toutes » et « Favoris » : l'ordre manuel de la bibliothèque (celui de `entries`) ;
//   - vue « Récentes » : du plus récemment ouvert au plus ancien (ordre de `recent`, plus récent en premier).
// renderLibrary() doit PARCOURIR ce tableau, et non `library` : c'était le bug de l'ordre « Récentes » (l'ordre
// était calculé puis ignoré, la liste s'affichait dans l'ordre de la bibliothèque).
//
//   entries   : parties de la bibliothèque
//   options   : { filter: 'all' | 'recent' | 'favorites', favorites: Set d'empreintes, recent: tableau d'empreintes
//               (plus récent en premier), query: recherche normalisée ('' = aucune) }
//   helpers   : { fingerprint(entry) → empreinte, matches(entry, query) → booléen }
// Les empreintes (coûteuses : sérialisation PDN) ne sont calculées que pour les vues qui en ont besoin, une fois par partie.
export function libraryVisibleOrder(entries, { filter, favorites, recent, query }, { fingerprint, matches }) {
  const cache = new Map();
  const fp = (i) => {
    if (!cache.has(i)) cache.set(i, fingerprint(entries[i]));
    return cache.get(i);
  };
  const order = [];
  for (let i = 0; i < entries.length; i += 1) {
    if (filter === 'favorites' && !favorites.has(fp(i))) continue;
    if (filter === 'recent' && !recent.includes(fp(i))) continue;
    if (!matches(entries[i], query)) continue;
    order.push(i);
  }
  if (filter === 'recent') order.sort((a, b) => recent.indexOf(fp(a)) - recent.indexOf(fp(b)));
  return order;
}
