#!/usr/bin/env node
/**
 * bg-run - launch-or-adopt a background process AND register it, atomically.
 *
 * WHY THIS EXISTS
 *
 * bg-register.mjs is correct and has always worked. The failure was never the
 * registrar -- it was that registration is a SECOND step a human or model has to
 * remember after launching. Measured 2026-08-19: ComfyUI had been listening on
 * :8188 for 8 hours completely unregistered, so SessionEnd would never have
 * reaped it, despite a standing CLAUDE.md rule saying to register it at launch.
 *
 * A rule in prose is a request (see *gate enforced in the writer*). The
 * fix is not a louder request or a nagging hook -- it is removing the second step.
 * Here launching and registering are the same call, so a registered process is
 * what you get by DEFAULT and forgetting is no longer possible.
 *
 * IDEMPOTENT BY DESIGN. If the port is already listening, this ADOPTS the running
 * process (registers it, does not relaunch). That matters because several of the
 * launchers it wraps are themselves idempotent -- ComfyUI's start script being the
 * standing example -- and because it makes bg-run safe to call on every path,
 * which is exactly what makes it habit-proof.
 *
 * Usage:
 *   node bg-run.mjs --port 8188 --label "ComfyUI" -- powershell -File D:/ComfyUI/start-comfyui.ps1
 *   node bg-run.mjs --port 8000 --label "report server" -- python -m http.server 8000
 *   node bg-run.mjs --adopt --port 8188 --label "ComfyUI"     # register something already up
 *   node bg-run.mjs --port 5173 --label "vite" --wait 90 -- npm run dev
 *
 * Flags:
 *   --port <n>     the port to probe for readiness and to register (preferred)
 *   --pid <n>      register by pid instead (for things that bind no port)
 *   --label <s>    human label shown in --list and in the reap message
 *   --adopt        do not launch; just register whatever already holds the port
 *   --wait <secs>  how long to wait for the port to come up (default 60)
 *   --pinned       register pinned (survives session exit)
 *   --dry-run      print what would happen, change nothing
 *
 * Exit codes: 0 registered (launched or adopted), 1 bad usage, 2 launch timed out.
 */

import net from 'node:net';
import path from 'node:path';
import os from 'node:os';
import { spawn, execFileSync } from 'node:child_process';

const argv = process.argv.slice(2);
const sep = argv.indexOf('--');
const flags = sep >= 0 ? argv.slice(0, sep) : argv;
const cmd = sep >= 0 ? argv.slice(sep + 1) : [];

const has = (f) => flags.includes(f);
const opt = (f) => { const i = flags.indexOf(f); return i >= 0 ? flags[i + 1] : undefined; };

const port = opt('--port') ? Number(opt('--port')) : undefined;
const pid = opt('--pid') ? Number(opt('--pid')) : undefined;
const label = opt('--label') || '';
const waitSecs = Number(opt('--wait') || 60);
const ADOPT = has('--adopt');
const DRY = has('--dry-run');
const PINNED = has('--pinned');

const REGISTRAR = path.join(os.homedir(), '.claude', 'hooks', 'bg-register.mjs');

if (port == null && pid == null) {
  console.error('bg-run: need --port and/or --pid');
  process.exit(1);
}
if (!ADOPT && !cmd.length && port == null) {
  console.error('bg-run: need a command after -- (or --adopt to register something already running)');
  process.exit(1);
}

const probe = (p) => new Promise((resolve) => {
  const sock = new net.Socket();
  const done = (v) => { sock.destroy(); resolve(v); };
  sock.setTimeout(400);
  sock.once('connect', () => done(true));
  sock.once('timeout', () => done(false));
  sock.once('error', () => done(false));
  sock.connect(p, '127.0.0.1');
});

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function register(extraPid) {
  const a = [REGISTRAR];
  if (port != null) a.push('--port', String(port));
  if (extraPid != null) a.push('--pid', String(extraPid));
  else if (pid != null) a.push('--pid', String(pid));
  if (label) a.push('--label', label);
  if (PINNED) a.push('--pinned');
  if (DRY) { console.log('[dry-run] would register: ' + a.slice(1).join(' ')); return; }
  // Registration must inherit THIS cwd -- bg-cleanup only reaps rows whose cwd
  // matches the exiting session's project, so a wrong cwd means a silent no-reap.
  const out = execFileSync(process.execPath, a, { encoding: 'utf8', cwd: process.cwd() });
  process.stdout.write(out);
}

const alreadyUp = port != null ? await probe(port) : false;

if (alreadyUp) {
  console.log('Port ' + port + ' is already listening - adopting (not relaunching).');
  register();
  process.exit(0);
}

if (ADOPT) {
  console.error('bg-run: --adopt given but nothing is listening on ' + port);
  process.exit(1);
}

if (!cmd.length) {
  console.error('bg-run: nothing listening on ' + port + ' and no command given to launch');
  process.exit(1);
}

if (DRY) {
  console.log('[dry-run] would launch: ' + cmd.join(' '));
  register();
  process.exit(0);
}

// Detached so the server outlives this wrapper; stdio ignored so it never holds
// the parent's pipes open. The registry -- not this process -- is what remembers it.
const child = spawn(cmd[0], cmd.slice(1), { detached: true, stdio: 'ignore', shell: true, windowsHide: true });
child.unref();
console.log('Launched: ' + cmd.join(' ') + (child.pid ? '  (pid ' + child.pid + ')' : ''));

if (port == null) { register(child.pid); process.exit(0); }

const deadline = Date.now() + waitSecs * 1000;
let up = false;
while (Date.now() < deadline) {
  await sleep(1000);
  if (await probe(port)) { up = true; break; }
}

if (!up) {
  // Register anyway: a process that failed to bind is exactly the kind of stray
  // that should still be reaped on exit. Refusing to register here would recreate
  // the very leak this tool exists to close.
  console.error('bg-run: port ' + port + ' did not come up within ' + waitSecs + 's - registering the pid anyway so it still gets reaped.');
  register(child.pid);
  process.exit(2);
}

console.log('Port ' + port + ' is up.');
register(child.pid);
process.exit(0);
