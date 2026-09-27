// DAMIKA — Persistance locale de la bibliothèque active (localStorage).
// Une seule clé JSON : le texte PDN de la bibliothèque (rechargeable via parsePdn), l'index
// actif, le PDN de la partie en cours (peut différer de library[activeIndex] si des coups
// ont été joués/undo depuis le chargement) et le flag "non sauvegardée dans un fichier".
// Toutes les fonctions avalent leurs erreurs (quota dépassé, navigation privée, JSON
// corrompu) : la persistance est un bonus silencieux, jamais un point de plantage.

const STORAGE_KEY = 'damika:library-state';

export function saveLibraryState(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // localStorage indisponible ou quota dépassé : on continue sans persistance.
  }
}

export function loadLibraryState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function clearLibraryState() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // rien à faire si localStorage est indisponible
  }
}

// --- fichiers récents + favoris de la Bibliothèque -------------------------------------
// Clé séparée de STORAGE_KEY : ces deux listes ne décrivent pas le CONTENU de la
// bibliothèque (headers/coups, déjà source unique via `library`/`headers` partagés, cf.
// CLAUDE.md) mais des méta-données annexes qui lui survivent indépendamment (identifiées par
// empreinte de contenu, cf. gameFingerprint() dans main.js, jamais par index — un index
// devient faux dès qu'une entrée est supprimée ou réordonnée).
const EXTRAS_KEY = 'damika:library-extras';

export function loadLibraryExtras() {
  try {
    const raw = localStorage.getItem(EXTRAS_KEY);
    if (!raw) return { favorites: [], recent: [] };
    const parsed = JSON.parse(raw);
    return {
      favorites: Array.isArray(parsed.favorites) ? parsed.favorites : [],
      recent: Array.isArray(parsed.recent) ? parsed.recent : [],
    };
  } catch {
    return { favorites: [], recent: [] };
  }
}

export function saveLibraryExtras(extras) {
  try {
    localStorage.setItem(EXTRAS_KEY, JSON.stringify(extras));
  } catch {
    // localStorage indisponible ou quota dépassé : on continue sans persistance.
  }
}
