#!/usr/bin/env node
// SessionEnd hook: reap background processes registered during this session,
// unless they were pinned. Only touches entries in the registry — never MCP
// servers or other Claude Code infrastructure (that would be a forbidden
// broad kill). Pair with bg-register.mjs (the launch-side registrar).
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execSync } from 'node:child_process';

const REG = path.join(os.homedir(), '.claude', 'bg-registry', 'registry.jsonl');

// SessionEnd delivers a JSON payload on stdin; we want its cwd so we only reap
// processes started from THIS project (leaving a concurrent session in another
// project untouched). Fall back to the hook's own cwd.
let payload = {};
try {
  const raw = fs.readFileSync(0, 'utf8');
  if (raw.trim()) payload = JSON.parse(raw);
} catch { /* no/invalid stdin — fine */ }
const cwd = String(payload.cwd || process.cwd()).replace(/\\/g, '/').toLowerCase();

if (!fs.existsSync(REG)) process.exit(0);

const lines = fs.readFileSync(REG, 'utf8').split(/\r?\n/).filter(Boolean);

function killPid(pid) {
  try { execSync(`taskkill /F /T /PID ${pid}`, { stdio: 'ignore' }); return true; }
  catch { return false; }
}
function killPort(port) {
  let out = '';
  try { out = execSync('netstat -ano', { encoding: 'utf8' }); } catch { return false; }
  const pids = new Set();
  for (const l of out.split(/\r?\n/)) {
    const m = l.match(/:(\d+)\s+\S+\s+LISTENING\s+(\d+)/i);
    if (m && Number(m[1]) === Number(port)) pids.add(m[2]);
  }
  let any = false;
  for (const pid of pids) any = killPid(pid) || any;
  return any;
}

// Liveness snapshot, taken ONCE. bg-register.mjs has always had a --prune that
// probes each row, but nothing ever invoked it, so rows for other projects piled
// up forever: a dead kestrel-template :3000 row from 2026-08-06 was still listed
// 13 days later. Reaping already scopes to this project's cwd (correctly - we must
// not kill a concurrent session's server), but "don't kill it" was silently
// implemented as "keep the row", which is a different claim. A row whose process
// is gone is not another session's server; it is litter.
const listeningPorts = new Set();
try {
  const out = execSync('netstat -ano', { encoding: 'utf8' });
  for (const l of out.split(/\r?\n/)) {
    const m = l.match(/:(\d+)\s+\S+\s+LISTENING\s+(\d+)/i);
    if (m) listeningPorts.add(Number(m[1]));
  }
} catch { /* no netstat -> treat every row as alive and keep it (fail safe, not fail open) */ }
const rowAlive = (e) => {
  if (e.port != null && listeningPorts.has(Number(e.port))) return true;
  if (e.pid != null) { try { process.kill(e.pid, 0); return true; } catch { return false; } }
  // No pid to fall back on and the port is not listening: only call it dead if we
  // actually managed to read the port table, so a netstat failure never deletes rows.
  return e.port != null ? listeningPorts.size === 0 : true;
};

// Does this row belong to the project the exiting session was working in?
//
// This used to be exact string equality against the SessionEnd payload's cwd, and
// that silently disabled reaping for almost everything. bg-register.mjs stamps
// `process.cwd()` AT REGISTRATION TIME - which is wherever the tool happened to be
// standing, virtually never the project root: a report server is started from
// `output/<report>/`, a rig from `.../animation-rig/templates`, a preview from the
// session scratchpad. Every such row compared unequal to the project root, took the
// "another project's session" branch, and - being alive - was KEPT rather than reaped.
// Measured 2026-08-21: an intel-focus report server (cwd `output/intel-focus`) was
// still listening on :8791 five hours after its routine exited, and not one of the 30
// rows in registry.jsonl.bak had a cwd equal to a project root. The hook was firing
// correctly the whole time (verified headless: an exact-cwd row IS reaped under
// `claude -p`); the predicate in front of it was the bug.
//
// Two shapes count as "this project": a directory at or below the session cwd, and this
// project's Claude scratchpad (which lives outside the project tree under
// %TEMP%/claude/<slug>, where <slug> is the project path with ':' and separators
// replaced by '-'). Anything else - a sibling project, another checkout - is still left
// strictly alone, alive or dead-pruned exactly as before.
const scratchSlug = cwd.replace(/:/g, '-').replace(/[\/]/g, '-');
const belongsHere = (eCwd) =>
  eCwd === cwd ||
  eCwd.startsWith(cwd + '/') ||
  (scratchSlug.length > 1 && eCwd.includes('/temp/claude/' + scratchSlug + '/'));

const keep = [];
const reaped = [];
const pruned = [];
for (const line of lines) {
  let e;
  try { e = JSON.parse(line); } catch { continue; }
  const eCwd = String(e.cwd || '').replace(/\\/g, '/').toLowerCase();
  if (e.pinned) { keep.push(line); continue; }          // pinned survives exit, alive or not
  if (eCwd && !belongsHere(eCwd)) {                       // another project's session
    if (rowAlive(e)) keep.push(line);                    // still running - leave it alone
    else pruned.push(e);                                 // dead row - drop it, kill nothing
    continue;
  }
  let ok = false;
  if (e.pid) ok = killPid(e.pid) || ok;
  if (e.port) ok = killPort(e.port) || ok;
  reaped.push({ ...e, ok });
}

if (keep.length) fs.writeFileSync(REG, keep.join('\n') + '\n');
else { try { fs.unlinkSync(REG); } catch { /* ignore */ } }

if (reaped.length || pruned.length) {
  const parts = [];
  if (reaped.length) {
    const desc = reaped
      .map(e => (e.label || (e.port ? `:${e.port}` : `pid ${e.pid}`)) + (e.ok ? '' : ' (already gone)'))
      .join(', ');
    parts.push(`Reaped ${reaped.length} background process(es) on exit: ${desc}`);
  }
  if (pruned.length) {
    const desc = pruned.map(e => (e.label || (e.port ? `:${e.port}` : `pid ${e.pid}`))).join(', ');
    parts.push(`Pruned ${pruned.length} dead registry row(s) from other projects: ${desc}`);
  }
  console.log(JSON.stringify({ systemMessage: parts.join(' | ') }));
}
process.exit(0);
