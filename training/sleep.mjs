// DAMIKA — Étage 3.1 : empêcher la mise en veille de Windows pendant un long calcul.
//
// Principe : un processus enfant PowerShell appelle kernel32!SetThreadExecutionState avec
// ES_CONTINUOUS | ES_SYSTEM_REQUIRED (0x80000001 = 2147483649, écrit en décimal car PowerShell lit 0x80000001 comme un entier NÉGATIF) puis reste en vie. Cet état est attaché au fil du
// processus : il disparaît tout seul quand le processus se termine, donc la mise en veille est rétablie
// même si le script Node plante (le PowerShell surveille aussi le PID de son parent et s'arrête de
// lui-même s'il disparaît). L'écran peut s'éteindre : seule la mise en veille du SYSTÈME est empêchée.
//
// Vérification intégrée : après le premier appel, PowerShell en refait un second ; SetThreadExecutionState
// renvoie l'état PRÉCÉDENT, qui doit contenir ES_SYSTEM_REQUIRED (bit 0x1) : preuve que le premier a pris.
// Le résultat est affiché sur la sortie standard de l'enfant (« armed prev=0x80000001 »).
import { spawn } from 'node:child_process';

export function preventSleep() {
  if (process.platform !== 'win32') return { ok: false, reason: 'plateforme non Windows', stop() {} };
  const script = `
$sig = '[DllImport("kernel32.dll")] public static extern uint SetThreadExecutionState(uint esFlags);'
Add-Type -MemberDefinition $sig -Name Power -Namespace Damika
$null = [Damika.Power]::SetThreadExecutionState([uint32]2147483649)
$prev = [Damika.Power]::SetThreadExecutionState([uint32]2147483649)
Write-Output ('armed prev=0x{0:X8}' -f $prev)
while (Get-Process -Id ${process.pid} -ErrorAction SilentlyContinue) { Start-Sleep -Seconds 5 }
`;
  // -EncodedCommand (UTF-16LE en base64) : évite tout problème de guillemets entre Node et PowerShell sous Windows.
  const encoded = Buffer.from(script, 'utf16le').toString('base64');
  const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', encoded], { stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true });
  const info = { ok: false, reason: 'en attente', stop() { try { child.kill(); } catch { /* déjà terminé */ } } };
  child.stdout.on('data', (d) => {
    const m = /armed prev=0x([0-9A-F]+)/.exec(String(d));
    if (m) { info.prev = m[1]; info.ok = (parseInt(m[1], 16) & 1) === 1; info.reason = info.ok ? 'actif' : `état inattendu 0x${m[1]}`; }
  });
  child.on('error', (e) => { info.ok = false; info.reason = `échec (${e.message})`; });
  child.on('exit', () => { info.running = false; });
  info.running = true;
  return info;
}
