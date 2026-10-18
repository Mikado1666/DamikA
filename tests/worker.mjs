// Test du gestionnaire de messages du worker (js/ai/worker.js), sous Node.
// Limite assumée : le vrai Web Worker (fil séparé dans le navigateur) n'est pas lancé ici ;
// on teste la fonction pure handleMessage() qu'il appelle, et l'import sans effet de bord.
import { handleMessage } from '../js/ai/worker.js';
import { initialBoard, generateLegalMoves } from '../js/engine/rules.js';

let failures = 0;
const check = (label, cond, extra = '') => {
  if (!cond) failures++;
  console.log(`${cond ? 'OK ' : 'ERR'} ${label}${extra ? ' — ' + extra : ''}`);
};

check('ping', handleMessage({ id: 1, type: 'ping' }).result === 'pong');

const moves = handleMessage({ id: 2, type: 'moves', position: { board: initialBoard(), side: 'w' } });
const ref = generateLegalMoves(initialBoard(), 'w');
check('moves (position initiale) : id recopié', moves.id === 2 && moves.ok);
check('moves : 9 coups simples comme rules.js', moves.result.simples.length === ref.simples.length && ref.simples.length === 9);

const perft = handleMessage({ id: 3, type: 'perft', depth: 5 });
check('perft 5 depuis la position initiale par défaut', perft.ok && perft.result.nodes === 27117, `${perft.result?.nodes}`);

const divide = handleMessage({ id: 4, type: 'divide', depth: 3 });
check('divide 3 : somme = perft 3 (658)', divide.ok && divide.result.reduce((s, r) => s + r.nodes, 0) === 658);

check('type inconnu → erreur', handleMessage({ id: 5, type: 'zzz' }).ok === false);
check('position invalide → erreur renvoyée, pas d\'exception', handleMessage({ id: 6, type: 'moves', position: {} }).ok === false);

// Le résultat doit être clonable par postMessage (structured clone).
try { structuredClone(moves); check('résultat clonable (structuredClone)', true); }
catch (e) { check('résultat clonable (structuredClone)', false, e.message); }

console.log(failures === 0 ? 'RÉSULTAT : tout concorde.' : `RÉSULTAT : ${failures} échec(s).`);
process.exit(failures === 0 ? 0 : 1);
