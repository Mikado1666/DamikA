// DAMIKA — Réglages d'affichage PARTAGÉS entre l'appli (js/main.js) et l'écran Film (js/film.js) : thème d'interface
// (clair / sombre), thème du damier, style et taille des pions. Mêmes clés localStorage que l'appli, jamais de clé
// nouvelle. Valeur absente, invalide ou localStorage indisponible = valeur par défaut. (P33)
import { BOARD_THEMES, PIECE_STYLES, PIECE_SIZES } from './board.js';

export const UI_THEME_KEY = 'damika:ui-theme';
export const BOARD_THEME_KEY = 'damika:board-theme';
export const PIECE_STYLE_KEY = 'damika:piece-style';
export const PIECE_SIZE_KEY = 'damika:piece-size';

const read = (key) => { try { return localStorage.getItem(key); } catch { return null; } };

// 'light' ou 'dark' (défaut).
export const readUiTheme = () => (read(UI_THEME_KEY) === 'light' ? 'light' : 'dark');

// Pose le thème sur <html> (même mécanisme que l'appli : data-theme="light", absent = sombre).
export function applyUiTheme(theme) {
  if (theme === 'light') document.documentElement.dataset.theme = 'light';
  else delete document.documentElement.dataset.theme;
}

// Applique à un BoardRenderer le thème du damier, le style et la taille des pions mémorisés (noms inconnus ignorés).
export function applySavedBoardSettings(renderer) {
  const theme = read(BOARD_THEME_KEY);
  if (theme && Object.hasOwn(BOARD_THEMES, theme)) renderer.setBoardTheme(theme);
  const style = read(PIECE_STYLE_KEY);
  if (style && Object.hasOwn(PIECE_STYLES, style)) renderer.setPieceStyle(style);
  const size = read(PIECE_SIZE_KEY);
  if (size && Object.hasOwn(PIECE_SIZES, size)) renderer.setPieceSize(size);
}
