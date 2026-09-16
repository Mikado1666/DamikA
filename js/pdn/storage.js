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
