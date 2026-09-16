// DAMIKA — Script ponctuel (Node.js, PAS intégré à l'appli) : récupère les photos
// officielles Toernooibase pour une liste de joueurs et génère data/player-photos.json,
// chargé par l'appli au démarrage pour pré-remplir le registre nom→photo (voir main.js).
// Généraliste — aucun lien avec un tournoi ou une liste figée en particulier : la liste de
// joueurs à traiter est toujours fournie à l'exécution (argument ou fichier).
//
// Exécuté en développement uniquement, jamais dans le navigateur — donc aucune restriction
// CORS (contrairement à l'appli elle-même, cf. CLAUDE.md), Node peut lire directement le
// HTML de la fiche joueur.
//
// LIMITE CONNUE : Toernooibase n'expose aucun endpoint de recherche par nom exploitable en
// simple GET (vérifié : pas de formulaire de recherche joueur sur la page d'accueil, la
// seule "recherche" disponible est l'applet PARTIJEN/zoekvenster.php, interactif) — donc
// CE SCRIPT PREND UN SpId PAR JOUEUR, PAS UN NOM SEUL. Le nom sert de clé pour le registre
// de sortie (et de vérification humaine que le SpId correspond bien au bon joueur). Pour
// trouver le SpId d'un joueur : naviguer manuellement sur https://toernooibase.kndb.nl/
// (recherche par nom dans l'applet PARTIJEN, ou parcours alphabétique) et relever le SpId
// dans l'URL de sa fiche.
//
// Usage :
//   node scripts/fetch-toernooibase-photos.mjs "Nom Complet" 1234 ["Autre Nom" 5678 ...]
//   node scripts/fetch-toernooibase-photos.mjs --file scripts/players.txt
//
// Format du fichier texte (une ligne par joueur, "Nom;SpId") :
//   Mickael Callegari;5032
//   # une ligne commençant par # est ignorée (commentaire)
//
// Sortie : data/player-photos.json — { "Nom complet": "URL photo", ... }
//          (fusionné avec le contenu existant — un joueur déjà présent est mis à jour, les
//          autres sont conservés tels quels)

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_FILE = path.join(__dirname, '..', 'data', 'player-photos.json');
const BASE_URL = 'https://toernooibase.kndb.nl';

async function readJsonIfExists(filePath, fallback) {
  try {
    return JSON.parse(await readFile(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

// Parse une ligne "Nom;SpId" — délimiteur point-virgule plutôt que virgule car un nom peut
// déjà contenir une virgule (convention PDN "Nom, Prénom", cf. syncHeaderFieldsFromState
// dans main.js).
function parsePlayersFile(text) {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
    .map((line) => {
      const idx = line.lastIndexOf(';');
      if (idx === -1) throw new Error(`Ligne invalide (attendu "Nom;SpId") : "${line}"`);
      const name = line.slice(0, idx).trim();
      const spId = line.slice(idx + 1).trim();
      return { name, spId };
    });
}

// Args positionnels en paires "Nom" SpId — alternative au fichier pour un test rapide.
function parseArgs(args) {
  if (args.length % 2 !== 0) {
    throw new Error('Nombre d\'arguments impair : attendu des paires "Nom" SpId.');
  }
  const players = [];
  for (let i = 0; i < args.length; i += 2) {
    players.push({ name: args[i], spId: args[i + 1] });
  }
  return players;
}

// La fiche joueur (liddetailp.php) contient la photo sous la forme :
//   <img src=../Afbeeldingen/Spelers/5032.jpg alt=Mickael Callegari>
// — chemin relatif à /opvraag/, sans forcément de guillemets (HTML permissif, ancien site).
function extractPhotoUrl(html) {
  const match = html.match(/<img\s+src=["']?([^"'\s>]*Afbeeldingen\/Spelers\/[^"'\s>]+)["']?[^>]*>/i);
  if (!match) return null;
  const relative = match[1];
  return new URL(relative, `${BASE_URL}/opvraag/`).href;
}

async function fetchPlayerPhoto(spId) {
  const url = `${BASE_URL}/opvraag/liddetailp.php?SpId=${encodeURIComponent(spId)}`;
  const res = await fetch(url, { headers: { 'User-Agent': 'DamikA one-off script (dev)' } });
  if (!res.ok) throw new Error(`HTTP ${res.status} sur ${url}`);
  const html = await res.text();
  const photoUrl = extractPhotoUrl(html);
  if (!photoUrl) throw new Error(`Aucune photo trouvée sur la fiche (SpId=${spId})`);
  // Vérifie que l'image existe réellement (certaines fiches référencent un fichier absent,
  // le site retombe alors sur un placeholder côté navigateur via onError — on veut le
  // savoir ici plutôt que stocker une URL 404).
  const head = await fetch(photoUrl, { method: 'HEAD' });
  if (!head.ok) throw new Error(`Photo introuvable (${head.status}) : ${photoUrl}`);
  return photoUrl;
}

async function main() {
  const argv = process.argv.slice(2);
  let players;
  try {
    if (argv[0] === '--file') {
      const filePath = path.resolve(process.cwd(), argv[1] || '');
      players = parsePlayersFile(await readFile(filePath, 'utf8'));
    } else if (argv.length > 0) {
      players = parseArgs(argv);
    } else {
      console.error('Usage :');
      console.error('  node scripts/fetch-toernooibase-photos.mjs "Nom Complet" 1234 [...]');
      console.error('  node scripts/fetch-toernooibase-photos.mjs --file scripts/players.txt');
      process.exitCode = 1;
      return;
    }
  } catch (err) {
    console.error(err.message);
    process.exitCode = 1;
    return;
  }

  const existing = await readJsonIfExists(OUTPUT_FILE, {});
  const result = { ...existing };
  let ok = 0;
  let failed = 0;

  for (const { name, spId } of players) {
    try {
      const photoUrl = await fetchPlayerPhoto(spId);
      result[name] = photoUrl;
      console.log(`✓ ${name} (SpId=${spId}) → ${photoUrl}`);
      ok += 1;
    } catch (err) {
      console.error(`✗ ${name} (SpId=${spId}) — ${err.message}`);
      failed += 1;
    }
  }

  await writeFile(OUTPUT_FILE, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  console.log(`\n${ok} photo(s) récupérée(s), ${failed} échec(s). Écrit dans ${path.relative(process.cwd(), OUTPUT_FILE)}`);
}

main();
