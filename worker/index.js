// DAMIKA — Cloudflare Worker : recherche un joueur par nom sur Toernooibase et renvoie
// l'URL de sa photo officielle, en direct depuis l'appli (bouton "Récupérer sur
// Toernooibase"). Remplace l'étape manuelle du script Node pour l'usage courant "un joueur
// à la fois" — le script (scripts/resolve-toernooibase-players.mjs +
// scripts/fetch-toernooibase-photos.mjs) reste le chemin de secours documenté si ce Worker
// tombe en panne ou si Toernooibase finit par bloquer son trafic (voir CLAUDE.md).
//
// Logique identique à scripts/resolve-toernooibase-players.mjs (indexation alphabétique,
// gestion des homonymes) — dupliquée ici plutôt que partagée en module commun, Node et le
// runtime Workers n'ayant pas le même système de modules/outillage, et le volume de code
// concerné est faible.
//
// Déploiement : voir CLAUDE.md section "Backend Toernooibase (Cloudflare Worker)".

const BASE_URL = 'https://toernooibase.kndb.nl';
const MAX_PAGES_PER_LETTER = 30;

function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': origin || '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

function json(data, status, origin) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json', ...corsHeaders(origin) },
  });
}

function nameTokens(name) {
  return name.replace(/,/g, ' ').trim().toLowerCase().split(/\s+/).filter(Boolean);
}

function surnameLetter(name) {
  const surname = name.includes(',') ? name.split(',')[0] : name.split(' ')[0];
  const letter = surname.trim()[0];
  return letter ? letter.toUpperCase() : null;
}

function normalize(name) {
  return [...nameTokens(name)].sort().join(' ');
}

function extractEntriesFromPage(html) {
  const entries = [];
  const re = /<a href=liddetailp\.php\?[^>]*SpId=(\d+)[^>]*>([^<]+)/gi;
  let m;
  while ((m = re.exec(html))) {
    entries.push({ spId: m[1], name: m[2].trim().replace(/\s+/g, ' ') });
  }
  return entries;
}

function extractPhotoUrl(html) {
  const match = html.match(/<img\s+src=["']?([^"'\s>]*Afbeeldingen\/Spelers\/[^"'\s>]+)["']?[^>]*>/i);
  if (!match) return null;
  return new URL(match[1], `${BASE_URL}/opvraag/`).href;
}

async function fetchLetterIndex(letter) {
  const map = new Map();
  for (let tel2 = 1; tel2 <= MAX_PAGES_PER_LETTER; tel2++) {
    const url = `${BASE_URL}/opvraag/spelalfa.php?start=${encodeURIComponent(letter)}&tel2=${tel2}&taal=&Id=1&se=22`;
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; DamikA/1.0)' } });
    if (!res.ok) break;
    const entries = extractEntriesFromPage(await res.text());
    if (entries.length === 0) break;
    for (const entry of entries) {
      const key = normalize(entry.name);
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(entry);
    }
  }
  return map;
}

async function resolveSpId(name) {
  const letter = surnameLetter(name);
  if (!letter) return { status: 'not_found' };
  const index = await fetchLetterIndex(letter);
  const typedTokens = nameTokens(name);
  const typedNorm = normalize(name);

  // 1. Correspondance exacte tolérante (casse/espaces/virgule/ordre des mots ignorés).
  const exact = index.get(typedNorm);
  if (exact && exact.length === 1) return { status: 'resolved', spId: exact[0].spId, matchedName: exact[0].name };
  if (exact && exact.length > 1) return { status: 'ambiguous', candidates: exact };

  // 2. Repli nom de famille seul, si un seul mot a été tapé.
  if (typedTokens.length === 1) {
    const surname = typedTokens[0];
    const candidates = [];
    for (const [, entries] of index) {
      for (const entry of entries) {
        const entrySurname = entry.name.includes(',') ? entry.name.split(',')[0].trim().toLowerCase() : null;
        if (entrySurname === surname) candidates.push(entry);
      }
    }
    if (candidates.length === 1) return { status: 'resolved', spId: candidates[0].spId, matchedName: candidates[0].name };
    if (candidates.length > 1) {
      const uniqueSpIds = new Set(candidates.map((c) => c.spId));
      if (uniqueSpIds.size === 1) return { status: 'resolved', spId: candidates[0].spId, matchedName: candidates[0].name };
      return { status: 'ambiguous', candidates };
    }
  }

  return { status: 'not_found' };
}

async function fetchPlayerPhoto(spId) {
  const url = `${BASE_URL}/opvraag/liddetailp.php?SpId=${encodeURIComponent(spId)}`;
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; DamikA/1.0)' } });
  if (!res.ok) return null;
  return extractPhotoUrl(await res.text());
}

export default {
  async fetch(request) {
    const origin = request.headers.get('Origin');
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders(origin) });
    }

    const url = new URL(request.url);
    const name = (url.searchParams.get('name') || '').trim();
    if (!name) {
      return json({ status: 'error', message: 'Paramètre "name" manquant.' }, 400, origin);
    }

    try {
      const resolution = await resolveSpId(name);
      if (resolution.status === 'not_found') {
        return json({ status: 'not_found' }, 404, origin);
      }
      if (resolution.status === 'ambiguous') {
        return json({
          status: 'ambiguous',
          candidates: resolution.candidates.map((c) => ({
            spId: c.spId,
            name: c.name,
            profileUrl: `${BASE_URL}/opvraag/liddetailp.php?SpId=${c.spId}`,
          })),
        }, 200, origin);
      }
      const photoUrl = await fetchPlayerPhoto(resolution.spId);
      if (!photoUrl) {
        return json({ status: 'no_photo', spId: resolution.spId, matchedName: resolution.matchedName }, 200, origin);
      }
      return json({ status: 'resolved', spId: resolution.spId, matchedName: resolution.matchedName, photoUrl }, 200, origin);
    } catch (err) {
      return json({ status: 'error', message: String(err && err.message || err) }, 502, origin);
    }
  },
};
