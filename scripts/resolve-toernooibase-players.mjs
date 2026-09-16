// DAMIKA — Script ponctuel (Node.js, PAS intégré à l'appli) : extrait les noms de joueurs
// d'un fichier PDN (typiquement la bibliothèque exportée via le bouton "Sauvegarder la
// bibliothèque" de l'appli — pas d'accès direct au localStorage du navigateur depuis
// Node), les résout en SpId Toernooibase via l'index alphabétique du site, puis enchaîne
// automatiquement sur fetch-toernooibase-photos.mjs pour les noms résolus sans ambiguïté.
//
// Pourquoi un index alphabétique plutôt qu'une "recherche" directe : Toernooibase n'a pas
// d'endpoint de recherche par nom en simple GET (cf. CLAUDE.md), mais expose son listing
// alphabétique complet via spelalfa.php?start=<Lettre>&teller=<page> — chaque page liste
// ~90 joueurs triés, au format "Nom, Prénom" (même convention que les en-têtes PDN) avec
// un lien vers liddetailp.php?SpId=... Une lettre est indexée UNE FOIS (toutes ses pages),
// puis réutilisée pour tous les noms de cette lettre à résoudre — pas une requête par nom.
//
// Homonymes : si une lettre contient plusieurs entrées avec un nom strictement identique,
// le script ne devine jamais lequel choisir — il les liste toutes pour vérification
// manuelle plutôt que de risquer la photo de la mauvaise personne.
//
// Usage : node scripts/resolve-toernooibase-players.mjs <fichier.pdn>

import { readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE_URL = 'https://toernooibase.kndb.nl';
const PLAYERS_TXT = path.join(__dirname, 'players.txt');
const FETCH_SCRIPT = path.join(__dirname, 'fetch-toernooibase-photos.mjs');
const MAX_PAGES_PER_LETTER = 60; // garde-fou : ~5400 joueurs max par lettre, largement au-delà de ce qu'une lettre contient en pratique

function extractNamesFromPdn(text) {
  const names = new Set();
  const re = /\[(?:White|Black)\s+"([^"]+)"\]/g;
  let m;
  while ((m = re.exec(text))) {
    const name = m[1].trim();
    if (name) names.add(name);
  }
  return [...names];
}

// Toernooibase trie son index par NOM DE FAMILLE — on doit indexer la même lettre que lui
// pour retrouver un nom. Convention PDN "Nom, Prénom" (déjà utilisée partout dans l'app,
// cf. CLAUDE.md) : le nom de famille est la partie avant la virgule. Repli sur le premier
// mot si jamais un nom n'a pas de virgule.
function surnameLetter(name) {
  const surname = name.includes(',') ? name.split(',')[0] : name.split(' ')[0];
  const letter = surname.trim()[0];
  return letter ? letter.toUpperCase() : null;
}

function normalize(name) {
  return name.trim().replace(/\s+/g, ' ').toLowerCase();
}

// Une ligne de résultat ressemble à :
//   <a href=liddetailp.php?taal=&SpId=5032&Id=1&se=22>Callegari, Mickael
// HTML permissif (site ancien, pas toujours de guillemets) — on capture large.
function extractEntriesFromPage(html) {
  const entries = [];
  const re = /<a href=liddetailp\.php\?[^>]*SpId=(\d+)[^>]*>([^<]+)/gi;
  let m;
  while ((m = re.exec(html))) {
    entries.push({ spId: m[1], name: m[2].trim().replace(/\s+/g, ' ') });
  }
  return entries;
}

async function fetchLetterIndex(letter) {
  const map = new Map(); // nom normalisé -> [{ spId, name }]
  // Le paramètre de pagination réel est `tel2` (1-indexé), PAS `teller` — vérifié par
  // essais successifs : `teller` est un no-op qui renvoie systématiquement la page 1 quelle
  // que soit sa valeur (d'où un premier essai qui semblait "boucler à l'infini" sur les
  // mêmes ~90 entrées). `tel2` pagine correctement (100 entrées/page ici), page vide une
  // fois la dernière lettre dépassée — c'est ce qui permet l'arrêt automatique ci-dessous.
  for (let tel2 = 1; tel2 <= MAX_PAGES_PER_LETTER; tel2++) {
    const url = `${BASE_URL}/opvraag/spelalfa.php?start=${encodeURIComponent(letter)}&tel2=${tel2}&taal=&Id=1&se=22`;
    const res = await fetch(url, { headers: { 'User-Agent': 'DamikA one-off script (dev)' } });
    if (!res.ok) break;
    const entries = extractEntriesFromPage(await res.text());
    if (entries.length === 0) break; // fin des pages de cette lettre
    for (const entry of entries) {
      const key = normalize(entry.name);
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(entry);
    }
  }
  return map;
}

async function main() {
  const pdnPath = process.argv[2];
  if (!pdnPath) {
    console.error('Usage : node scripts/resolve-toernooibase-players.mjs <fichier.pdn>');
    console.error('(le fichier .pdn s\'exporte depuis DamikA via "Sauvegarder la bibliothèque")');
    process.exitCode = 1;
    return;
  }

  const pdnText = await readFile(path.resolve(process.cwd(), pdnPath), 'utf8');
  const names = extractNamesFromPdn(pdnText);
  console.log(`${names.length} nom(s) unique(s) trouvé(s) dans ${pdnPath}.`);
  if (names.length === 0) return;

  const letters = [...new Set(names.map(surnameLetter).filter(Boolean))];
  const indexByLetter = new Map();
  for (const letter of letters) {
    process.stdout.write(`Indexation de la lettre "${letter}"... `);
    const index = await fetchLetterIndex(letter);
    indexByLetter.set(letter, index);
    console.log(`${[...index.values()].reduce((n, v) => n + v.length, 0)} joueur(s) indexé(s).`);
  }

  const resolved = [];
  const ambiguous = [];
  const unresolved = [];

  for (const name of names) {
    const letter = surnameLetter(name);
    const index = letter ? indexByLetter.get(letter) : null;
    const matches = index ? index.get(normalize(name)) || [] : [];
    if (matches.length === 1) resolved.push({ name, spId: matches[0].spId });
    else if (matches.length > 1) ambiguous.push({ name, candidates: matches });
    else unresolved.push(name);
  }

  console.log(`\n✓ ${resolved.length} résolu(s) sans ambiguïté`);
  console.log(`? ${ambiguous.length} homonyme(s) à vérifier manuellement`);
  console.log(`✗ ${unresolved.length} introuvable(s) dans l'index Toernooibase\n`);

  if (ambiguous.length > 0) {
    console.log('--- À vérifier manuellement (plusieurs joueurs au même nom) ---');
    for (const { name, candidates } of ambiguous) {
      console.log(`${name} :`);
      for (const c of candidates) {
        console.log(`  SpId=${c.spId} -> ${BASE_URL}/opvraag/liddetailp.php?SpId=${c.spId}`);
      }
    }
    console.log('');
  }
  if (unresolved.length > 0) {
    console.log('--- Introuvables (absents de l\'index Toernooibase, ou nom orthographié différemment) ---');
    unresolved.forEach((n) => console.log(`  ${n}`));
    console.log('');
  }

  if (resolved.length === 0) {
    console.log('Aucun nom résolu sans ambiguïté — rien à transmettre à fetch-toernooibase-photos.mjs.');
    return;
  }

  const lines = resolved.map(({ name, spId }) => `${name};${spId}`).join('\n');
  await writeFile(PLAYERS_TXT, `${lines}\n`, 'utf8');
  console.log(`Liste écrite dans ${path.relative(process.cwd(), PLAYERS_TXT)} (écrase le contenu précédent).`);
  console.log('Enchaînement sur fetch-toernooibase-photos.mjs...\n');

  execFileSync('node', [FETCH_SCRIPT, '--file', PLAYERS_TXT], { stdio: 'inherit' });
}

main();
