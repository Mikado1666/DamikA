// DAMIKA — Statistiques d'un match (étage 3.1) : score, différence d'Elo et intervalle de confiance.
// Fonctions pures, testées par tests/arena.mjs.
//
// MÉTHODE (aussi décrite dans docs/SESSION_DERNIERE.md)
// Chaque ouverture est jouée deux fois avec les couleurs inversées : les deux parties d'une « paire »
// ne sont donc PAS indépendantes (même ouverture). On prend la paire comme unité statistique :
//   - score de la paire pour A : m = (points de A dans la partie 1 + points dans la partie 2) / 2,
//     avec 1 point par victoire, 0,5 par nulle ; m ∈ {0 ; 0,25 ; 0,5 ; 0,75 ; 1} ;
//   - score moyen s = moyenne des m sur les n paires (= le score en % de A sur toutes les parties) ;
//   - erreur-type  se = écart-type empirique des m / √n (variance corrigée n-1) ;
//   - intervalle à 95 % sur s : s ± 1,96·se (approximation normale), borné à [0, 1] ;
//   - Elo(s) = 400·log10(s / (1 − s)) (modèle logistique), appliqué à s et aux deux bornes.
// Cas limites : s = 0 ou s = 1 donne ±∞ (affiché « ≥ » / « ≤ ») ; avec moins de 2 paires aucun
// intervalle n'est calculable.

export const Z95 = 1.959964;

export function eloFromScore(s) {
  if (s <= 0) return -Infinity;
  if (s >= 1) return Infinity;
  return 400 * Math.log10(s / (1 - s));
}

// pairScores : tableau de m (score de A par paire, entre 0 et 1).
export function matchStats(pairScores, games) {
  const n = pairScores.length;
  const w = games.w, d = games.d, l = games.l; // victoires, nulles, défaites de A (en parties)
  const total = w + d + l;
  const s = n > 0 ? pairScores.reduce((a, b) => a + b, 0) / n : NaN;
  let se = NaN, lo = NaN, hi = NaN;
  if (n >= 2) {
    const v = pairScores.reduce((a, m) => a + (m - s) * (m - s), 0) / (n - 1);
    se = Math.sqrt(v / n);
    lo = Math.max(0, s - Z95 * se);
    hi = Math.min(1, s + Z95 * se);
  }
  const elo = eloFromScore(s);
  const eloLo = eloFromScore(lo), eloHi = eloFromScore(hi);
  const significant = Number.isFinite(lo) && (lo > 0.5 || hi < 0.5);
  // Demi-largeur de l'intervalle en Elo (finie seulement si les bornes le sont).
  const halfWidth = Number.isFinite(eloLo) && Number.isFinite(eloHi) ? (eloHi - eloLo) / 2 : Infinity;
  const warnings = [];
  if (n < 2) warnings.push('moins de 2 paires : aucun intervalle de confiance calculable');
  else if (n < 100) warnings.push(`seulement ${n} paire(s) : échantillon FAIBLE (≥ 100 paires recommandées) ; l'intervalle ci-dessus est large et peu fiable`);
  if (n >= 2 && !significant) warnings.push('différence NON significative : l\'intervalle de confiance contient 0 Elo, on ne peut pas dire quel joueur est le plus fort');
  return { pairs: n, games: total, w, d, l, score: s, scorePct: s * 100, se, lo, hi, elo, eloLo, eloHi, eloHalfWidth: halfWidth, significant, warnings };
}

const fmtElo = (x) => (x === Infinity ? '+∞' : x === -Infinity ? '−∞' : (x >= 0 ? '+' : '−') + Math.abs(x).toFixed(0));

export function formatMatchStats(st) {
  const lines = [];
  lines.push(`Paires : ${st.pairs} (${st.games} parties)   A : ${st.w} victoires, ${st.d} nulles, ${st.l} défaites`);
  if (st.pairs === 0) return lines.join('\n');
  lines.push(`Score de A : ${st.scorePct.toFixed(1)} %`
    + (Number.isFinite(st.lo) ? `  (IC 95 % : ${(st.lo * 100).toFixed(1)} à ${(st.hi * 100).toFixed(1)} %)` : ''));
  lines.push(`Différence d'Elo (A − B) : ${fmtElo(st.elo)}`
    + (Number.isFinite(st.lo) || st.pairs >= 2 ? `  (IC 95 % : ${fmtElo(st.eloLo)} à ${fmtElo(st.eloHi)})` : ''));
  for (const w of st.warnings) lines.push(`⚠ ${w}`);
  return lines.join('\n');
}
