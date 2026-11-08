// DAMIKA — Sons de l'appli, PARTAGÉS entre js/main.js et l'écran « Analyse de la partie » (js/film.js) (P34).
// Mêmes fichiers (assets/sounds/), mêmes réglages localStorage (damika:sound-muted, damika:sound-volume), aucun
// réglage nouveau. Historique et choix de conception (pool de 3 <audio> par événement, déblocage de l'autoplay au premier
// geste, son bloqué rejoué au geste suivant) : inchangés, simplement déplacés depuis main.js.
//
// Pas de Web Audio API ni de librairie : de simples <audio>. Chaque événement a son propre pool de quelques instances
// (round-robin) : rejouer un son en cours sur le MÊME élément le couperait net au lieu de le superposer.

const SOUND_FILES = {
  move: 'assets/sounds/move.mp3',
  capture: 'assets/sounds/capture.mp3',
  'game-start': 'assets/sounds/game-start.mp3',
  'game-end': 'assets/sounds/game-end.mp3',
};
const SOUND_POOL_SIZE = 3;
export const SOUND_MUTE_KEY = 'damika:sound-muted';
export const SOUND_VOLUME_KEY = 'damika:sound-volume';

const soundPools = Object.fromEntries(Object.entries(SOUND_FILES).map(([name, src]) => {
  const pool = Array.from({ length: SOUND_POOL_SIZE }, () => {
    const a = new Audio(new URL(`../${src}`, import.meta.url).href);
    a.preload = 'auto';
    return a;
  });
  return [name, { pool, next: 0 }];
}));

const read = (key) => { try { return localStorage.getItem(key); } catch { return null; } };
let soundMuted = read(SOUND_MUTE_KEY) === '1';
// Volume 0..1, persisté en pourcentage entier (0-100) ; 0.35 par défaut si jamais réglé.
const storedVolumePct = parseInt(read(SOUND_VOLUME_KEY), 10);
let soundVolume = Number.isFinite(storedVolumePct) ? Math.min(100, Math.max(0, storedVolumePct)) / 100 : 0.35;

function applySoundVolume() {
  for (const { pool } of Object.values(soundPools)) {
    for (const audio of pool) audio.volume = soundVolume;
  }
}
applySoundVolume();

export const isMuted = () => soundMuted;
export function setMuted(m) { soundMuted = !!m; }
export const getVolume = () => soundVolume;
export function setVolume(v) { soundVolume = v; applySoundVolume(); }

// Un son peut être demandé avant tout geste utilisateur : la politique autoplay de Chrome bloque alors `play()`
// (NotAllowedError). On retente une seule fois le DERNIER son bloqué au premier geste (pointerdown).
let pendingUnlockSound = null;
// On débloque l'audio dès le tout premier pointerdown de la page, de façon synchrone (capture) : un play()/pause()
// réussi pendant le geste lève la restriction pour toute la session, même pour les sons demandés après un `await`.
let audioUnlocked = false;
function unlockAudioOnce() {
  if (audioUnlocked) return;
  audioUnlocked = true;
  for (const { pool } of Object.values(soundPools)) {
    for (const audio of pool) {
      audio.play().then(() => { audio.pause(); audio.currentTime = 0; }).catch(() => {});
    }
  }
}
window.addEventListener('pointerdown', unlockAudioOnce, { capture: true, once: true });

export function playSound(name) {
  if (soundMuted) return;
  const entry = soundPools[name];
  if (!entry) return;
  const audio = entry.pool[entry.next];
  entry.next = (entry.next + 1) % entry.pool.length;
  audio.currentTime = 0;
  audio.play().catch(() => { pendingUnlockSound = name; });
}
window.addEventListener('pointerdown', () => {
  if (!pendingUnlockSound) return;
  const name = pendingUnlockSound;
  pendingUnlockSound = null;
  playSound(name);
}, { once: false });
