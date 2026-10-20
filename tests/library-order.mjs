// Ordre d'affichage de la Bibliothèque (js/library-view.js), dont l'ordre « Récentes ». Tests Node, aucun navigateur.
// Bug corrigé le 20/10/2026 : renderLibrary() calculait l'ordre « Récentes » puis parcourait `library` dans son ordre
// d'origine ; il parcourt maintenant le tableau retourné par libraryVisibleOrder().
import { libraryVisibleOrder } from '../js/library-view.js';

let failures = 0;
const ok = (label, cond, extra = '') => { if (!cond) failures++; console.log(`${cond ? 'OK ' : 'ERR'} ${label}${extra ? ' — ' + extra : ''}`); };

// 6 parties dont l'empreinte est « f0 »…« f5 » ; noms pour la recherche.
const names = ['alpha', 'bravo', 'charlie', 'delta', 'echo', 'foxtrot'];
const entries = names.map((name, i) => ({ fp: `f${i}`, name }));
let fpCalls = 0;
const helpers = {
  fingerprint: (e) => { fpCalls += 1; return e.fp; },
  matches: (e, q) => !q || e.name.includes(q),
};
const order = (filter, { recent = [], favorites = [], query = '' } = {}) => libraryVisibleOrder(
  entries, { filter, favorites: new Set(favorites), recent, query }, helpers,
);

// Ouvertes dans cet ordre : charlie (f2), puis echo (f4), puis alpha (f0) : le plus récent est EN PREMIER.
const recent = ['f0', 'f4', 'f2'];

ok('« Récentes » : du plus récent au plus ancien (alpha, echo, charlie = indices 0, 4, 2)', order('recent', { recent }).join() === '0,4,2');
ok('« Récentes » ≠ ordre de la bibliothèque (c\'était le bug : la liste restait 0, 2, 4)', order('recent', { recent }).join() !== '0,2,4');
ok('« Récentes » : une partie ouverte à l\'instant passe en tête', order('recent', { recent: ['f3', ...recent] }).join() === '3,0,4,2');
ok('« Récentes » : seules les parties ouvertes figurent dans la liste', order('recent', { recent: ['f5'] }).join() === '5' && order('recent', { recent: [] }).length === 0);
ok('« Toutes » : ordre manuel de la bibliothèque, même avec des récentes', order('all', { recent }).join() === '0,1,2,3,4,5');
ok('« Favoris » : ordre de la bibliothèque (pas celui des récentes)', order('favorites', { favorites: ['f4', 'f1', 'f3'], recent }).join() === '1,3,4');
ok('Recherche seule : filtre en gardant l\'ordre de la bibliothèque', order('all', { query: 'o' }).join() === '1,4,5');
ok('« Récentes » + recherche : filtre ET garde l\'ordre « récent d\'abord »', order('recent', { recent, query: 'a' }).join() === '0,2' && order('recent', { recent, query: 'e' }).join() === '4,2');
ok('Bibliothèque vide : rien', libraryVisibleOrder([], { filter: 'recent', favorites: new Set(), recent, query: '' }, helpers).length === 0);

// Deux parties de même contenu (même empreinte) : toutes deux affichées, dans l'ordre de la bibliothèque.
{
  const twins = [{ fp: 'x', name: 'un' }, { fp: 'y', name: 'deux' }, { fp: 'x', name: 'trois' }];
  const r = libraryVisibleOrder(twins, { filter: 'recent', favorites: new Set(), recent: ['y', 'x'], query: '' }, { fingerprint: (e) => e.fp, matches: () => true });
  ok('Deux parties identiques : l\'ordre des récentes est respecté, les jumelles gardent l\'ordre de la bibliothèque', r.join() === '1,0,2');
}

// Empreintes : coûteuses (sérialisation PDN), donc calculées seulement quand la vue en a besoin, une fois par partie.
{
  fpCalls = 0; order('all');
  ok('Vue « Toutes » : aucune empreinte calculée', fpCalls === 0);
  fpCalls = 0; order('recent', { recent });
  ok(`Vue « Récentes » : une empreinte par partie au plus (${fpCalls} pour ${entries.length} parties, tri compris)`, fpCalls <= entries.length);
  fpCalls = 0; order('favorites', { favorites: ['f1'] });
  ok('Vue « Favoris » : une empreinte par partie au plus', fpCalls <= entries.length);
}

console.log(failures === 0 ? 'RÉSULTAT : tout concorde.' : `RÉSULTAT : ${failures} échec(s).`);
process.exit(failures === 0 ? 0 : 1);
