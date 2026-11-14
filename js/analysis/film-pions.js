// DAMIKA — textes « pions » de l'écran d'analyse (P48G). Module PUR (Node et navigateur) : l'UNIQUE endroit où un nombre de pions devient un mot accordé.
//   pionsLabel(2.58, 2) → « 2,58 pions » ; pionsLabel(0.7) → « 0,7 pion » ; pionsLabel(1.96) → « 2,0 pions » (la valeur ARRONDIE à l'affichage décide :
//   singulier seulement si elle est strictement inférieure à 2, pluriel dès 2).
//   pionsRond(2.6) → « l'équivalent de 3 pions » (entier le plus proche, au moins 1, singulier seulement pour 1) : pour les phrases du récit.
const formatDecimal = (v, decimals) => v.toFixed(decimals).replace('.', ',');

// Valeur absolue arrondie à `decimals` décimales, telle qu'elle s'affiche.
export const arrondiAffiche = (v, decimals = 1) => Number(Math.abs(Number(v)).toFixed(decimals));

// « 2,6 pions » (sans signe : le signe est ajouté par l'appelant). Entrée non numérique : « 0,0 pion » (jamais « NaN »).
export function pionsLabel(v, decimals = 1) {
  const n = Number.isFinite(Number(v)) ? arrondiAffiche(v, decimals) : 0;
  return `${formatDecimal(n, decimals)} pion${n >= 2 ? 's' : ''}`;
}

// Entier de pions pour une phrase de récit : valeur absolue arrondie à l'entier le plus proche, au moins 1.
export const pionsEntier = (v) => Math.max(1, Math.round(Math.abs(Number(v)) || 0));

// « l'équivalent de 3 pions » / « l'équivalent de 1 pion ».
export function pionsRond(v) {
  const n = pionsEntier(v);
  return `l'équivalent de ${n} pion${n > 1 ? 's' : ''}`;
}
