// DAMIKA — ordinaux français pour « le 20e coup », « au 3e coup » (P48E, forme en chiffres depuis P48G). Module PUR (Node et navigateur) :
// l'UNIQUE endroit où un numéro de coup devient un ordinal. « 1er » pour 1, chiffres + « e » (sans exposant) pour tous les autres : 2e, 3e, 10e, 11e, 41e.
// La NOTATION d'un coup (« 2. 37-32 ») n'est pas une phrase : elle ne passe jamais par ici.

// ordinal(1) → « 1er », ordinal(3) → « 3e », ordinal(41) → « 41e » ; entrée qui n'est pas un entier ≥ 1 → null.
export function ordinal(n) {
  if (typeof n !== 'number' || !Number.isInteger(n) || n < 1) return null;
  return n === 1 ? '1er' : `${n}e`;
}

// « 3e coup », « 1er coup », « 41e coup » (début de ligne : identique, les chiffres n'ont pas de majuscule ; `capital` est gardé pour les appelants).
// Entrée invalide : « coup » seul (jamais « null coup »).
export function ordinalCoup(n, { capital = false } = {}) {
  const o = ordinal(n), t = o === null ? 'coup' : `${o} coup`;
  return capital ? t.charAt(0).toUpperCase() + t.slice(1) : t;
}
