#!/usr/bin/env node
// Launch-side registrar for background processes. Call this right after
// starting a background process (localhost server, dev server, watcher) so the
// SessionEnd hook (bg-cleanup.mjs) can reap it when the session exits.
//
//   node bg-register.mjs --port 8123 --label "report server"
//   node bg-register.mjs --pid 12345 --label "vite dev"
//   node bg-register.mjs --port 8123 --pinned          # register already-pinned
//   node bg-register.mjs --pin 8123                     # pin an existing entry
//   node bg-register.mjs --pin all                      # pin everything for this cwd
//   node bg-register.mjs --unpin 8123
//   node bg-register.mjs --list
//   node bg-register.mjs --prune [--dry-run]   # drop entries whose process is gone
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import net from 'node:net';

const DIR = path.join(os.homedir(), '.claude', 'bg-registry');
const REG = path.join(DIR, 'registry.jsonl');
fs.mkdirSync(DIR, { recursive: true });

const args = process.argv.slice(2);
const opt = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const has = (name) => args.includes(name);
const cwd = process.cwd().replace(/\\/g, '/');
const sameCwd = (a) => String(a || '').toLowerCase() === cwd.toLowerCase();
// Same "does this row belong to this project" test bg-cleanup.mjs reaps by (it used to
// be exact equality there too, which silently disabled reaping for every row registered
// from a subfolder or the scratchpad -- fixed 2026-08-21). `--pin all` MUST use the
// reaper's scope, not a narrower one: "pin them" is the only thing standing between a
// server and the exit kill, so a pin that matches fewer rows than the reaper kills is
// worse than no pin at all.
const scratchSlug = cwd.toLowerCase().replace(/:/g, '-').replace(/[\/]/g, '-');
const underCwd = (a) => {
  const e = String(a || '').replace(/\\/g, '/').toLowerCase();
  const c = cwd.toLowerCase();
  return e === c || e.startsWith(c + '/') ||
    (scratchSlug.length > 1 && e.includes('/temp/claude/' + scratchSlug + '/'));
};

const readAll = () => fs.existsSync(REG)
  ? fs.readFileSync(REG, 'utf8').split(/\r?\n/).filter(Boolean)
      .map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean)
  : [];
const writeAll = (entries) =>
  fs.writeFileSync(REG, entries.map(e => JSON.stringify(e)).join('\n') + (entries.length ? '\n' : ''));

if (has('--list')) {
  const rows = readAll();
  if (!rows.length) { console.log('(no registered background processes)'); process.exit(0); }
  for (const e of rows) {
    console.log(`${e.pinned ? '📌' : '  '} ${e.label || ''} ${e.port ? ':' + e.port : ''} ${e.pid ? 'pid ' + e.pid : ''}  (${e.cwd})`);
  }
  process.exit(0);
}

// Registration is append-only: entries survive the process they describe, and the
// dedup on the default path is scoped to the SAME cwd, so the same port registered
// from a different directory adds a row rather than replacing one. Over weeks that
// accumulates dead rows (and duplicate ports), which makes `--list` unreadable and
// makes it impossible to tell a live server from a months-dead one.
//
// Liveness is judged by probing, not by age: a port that still accepts a connection
// is kept even if the row is old, and a pinned row is never dropped.
if (has('--prune')) {
  const dry = has('--dry-run');
  const entries = readAll();

  const portAlive = (port) => new Promise((resolve) => {
    const sock = new net.Socket();
    const done = (v) => { sock.destroy(); resolve(v); };
    sock.setTimeout(400);
    sock.once('connect', () => done(true));
    sock.once('timeout', () => done(false));
    sock.once('error', () => done(false));
    sock.connect(port, '127.0.0.1');
  });
  const pidAlive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };

  const keep = [];
  const drop = [];
  for (const e of entries) {
    if (e.pinned) { keep.push(e); continue; }
    let alive = false;
    if (e.port != null) alive = await portAlive(e.port);
    if (!alive && e.pid != null) alive = pidAlive(e.pid);
    (alive ? keep : drop).push(e);
  }

  for (const e of drop) {
    console.log(`  drop  ${e.label || '(unlabelled)'} ${e.port ? ':' + e.port : ''} ${e.pid ? 'pid ' + e.pid : ''}`.trimEnd());
  }
  for (const e of keep) {
    console.log(`  keep  ${e.pinned ? '[pinned] ' : ''}${e.label || '(unlabelled)'} ${e.port ? ':' + e.port : ''}`.trimEnd());
  }
  if (!dry) writeAll(keep);
  console.log(`${dry ? 'dry run' : 'pruned'}: ${drop.length} dead, ${keep.length} kept (of ${entries.length}).`);
  process.exit(0);
}

if (has('--pin') || has('--unpin')) {
  const pinned = has('--pin');
  const val = opt('--pin') || opt('--unpin');
  const entries = readAll();
  let n = 0;
  for (const e of entries) {
    const idMatch = val === 'all' || String(e.port) === val || String(e.pid) === val;
    // 'all' is scoped to this cwd; an explicit id can match regardless of cwd.
    const scopeOk = val === 'all' ? underCwd(e.cwd) : true;
    if (idMatch && scopeOk) { e.pinned = pinned; n++; }
  }
  writeAll(entries);
  console.log(`${pinned ? 'Pinned' : 'Unpinned'} ${n} entr${n === 1 ? 'y' : 'ies'} (${val}).`);
  process.exit(0);
}

// default action: register a new entry
const entry = {
  label: opt('--label') || '',
  port: opt('--port') ? Number(opt('--port')) : undefined,
  pid: opt('--pid') ? Number(opt('--pid')) : undefined,
  cwd,
  pinned: has('--pinned'),
  ts: new Date().toISOString(),
};
if (entry.port == null && entry.pid == null) {
  console.error('bg-register: need --port and/or --pid');
  process.exit(1);
}
// drop any prior entry for the same port/pid in this cwd, then append
const entries = readAll().filter(e => {
  if (!sameCwd(e.cwd)) return true;
  if (entry.port != null && e.port === entry.port) return false;
  if (entry.pid != null && e.pid === entry.pid) return false;
  return true;
});
entries.push(entry);
writeAll(entries);
console.log(`Registered${entry.pinned ? ' (pinned)' : ''}: ${entry.label || ''} ${entry.port ? ':' + entry.port : ''} ${entry.pid ? 'pid ' + entry.pid : ''}`.trim());
