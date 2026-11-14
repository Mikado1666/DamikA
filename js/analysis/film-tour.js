// DAMIKA — Visite guidée de l'écran « Analyse de la partie » (P49). Module PUR (aucun DOM) : Node et navigateur.
// TOUS les textes de la visite sont dans la banque TOUR_TEXT ci-dessous (et nulle part ailleurs dans le code) : pour retravailler le ton,
// on ne modifie que cet objet. Voix de coach, tutoiement, une idée par étape. Mots interdits dans un texte affiché : « demi-coup », « érosion ».
// La liste des étapes réellement affichables est construite par buildTour() : une étape dont l'élément n'existe pas à l'écran est SAUTÉE
// et le total « sur M » est recalculé.
import { ordinalCoup } from './film-ordinal.js';

export const TOUR_TEXT = {
  bouton: 'Visite guidée',
  boutonInactif: 'Disponible quand l\'analyse est terminée',
  boutonActif: 'Découvrir l\'écran en quelques étapes',
  dialogue: 'Visite guidée de l\'analyse de la partie',
  etape: 'Étape {n} sur {m}',
  suivant: 'Suivant',
  precedent: 'Précédent',
  quitter: 'Quitter',
  terminer: 'Terminer',
  tournant: 'Le tournant · {coup}', // {coup} = « 4e coup » (ordinalCoup) : la notation du coup n'y figure plus
  etapes: {
    recit: { titre: 'Le récit', texte: 'Commence ici. En deux ou trois phrases : ce qui s\'est passé, et le moment où la partie s\'est jouée.' },
    courbe: { titre: 'La courbe', texte: 'La partie en un coup d\'œil. Quand la courbe monte, les Blancs ont l\'avantage ; quand elle descend, ce sont les Noirs. Plus la pente est raide, plus le coup a coûté cher.' },
    // Écart avec le prompt : le survol montre la position APRÈS le coup fautif (avec le meilleur coup), pas « juste avant » ; le clic ouvre le détail.
    pastilles: { titre: 'Les pastilles', texte: 'Chaque pastille marque une faute : jaune pour une légère, orange pour une faute, rouge pour une majeure. Survole-en une pour voir la position après ce coup, et clique dessus pour voir ce qu\'il fallait jouer.' },
    tournant: { titre: 'Le tournant', texte: 'Le moment où la partie a basculé. C\'est là qu\'elle s\'est vraiment jouée.' },
    damier: { titre: 'Le damier', texte: 'La position au coup affiché. Avance et recule avec ◀ ▶ ou les flèches du clavier : la courbe suit.' },
    phases: { titre: 'Phases et zoom', texte: 'Sous la courbe : ouverture, milieu de partie, finale. Quand les pastilles se chevauchent, zoome avec − et +, ou reviens à tout avec « Tout voir ».' },
    pertes: { titre: 'Les trois plus grosses pertes', texte: 'Les trois coups les plus coûteux de la partie. Si tu manques de temps, ne regarde que ça.' },
  },
};

// Ordre de la visite.
export const TOUR_ORDER = ['recit', 'courbe', 'pastilles', 'tournant', 'damier', 'phases', 'pertes'];

const fill = (tpl, vars) => tpl.replace(/\{(\w+)\}/g, (_, k) => String(vars[k]));

// « Étape 2 sur 5 »
export const etapeLabel = (n, m) => fill(TOUR_TEXT.etape, { n, m });

// « Le tournant · 4e coup » (numéro de coup = numéro joué par les deux camps, comme moveNo de la partie analysée) ; entrée invalide : « Le tournant · coup ».
export const tournantLabel = (moveNo) => fill(TOUR_TEXT.tournant, { coup: ordinalCoup(moveNo) });

// Étapes affichables. `has` : objet { id: booléen } ou fonction id → booléen (vrai si l'élément de l'étape existe à l'écran).
// Renvoie [{ id, titre, texte, n, m, label, first, last, nextLabel }] ; liste vide si aucune étape n'est affichable.
export function buildTour(has) {
  const ok = typeof has === 'function' ? has : (id) => !!(has && has[id]);
  const ids = TOUR_ORDER.filter((id) => ok(id));
  return ids.map((id, i) => ({
    id, ...TOUR_TEXT.etapes[id], n: i + 1, m: ids.length, label: etapeLabel(i + 1, ids.length),
    first: i === 0, last: i === ids.length - 1, nextLabel: i === ids.length - 1 ? TOUR_TEXT.terminer : TOUR_TEXT.suivant,
  }));
}

// Tous les textes affichables (pour le test des mots interdits).
export const allTourTexts = () => [
  ...Object.entries(TOUR_TEXT).filter(([k, v]) => k !== 'etapes' && typeof v === 'string').map(([, v]) => v),
  ...Object.values(TOUR_TEXT.etapes).flatMap((e) => [e.titre, e.texte]),
];
