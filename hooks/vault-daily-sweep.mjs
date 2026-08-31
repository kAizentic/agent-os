#!/usr/bin/env node
// SessionStart hook — "capture side" daily automation (mechanism B).
// The first Claude Code session opened on a given day launches a DETACHED headless
// `claude` worker that runs the vault-maintenance skills in sequence, in the vault dir.
// Gated by a per-day stamp file so it fires at most once/day and never recurses.
//
// Security: the worker runs with --permission-mode acceptEdits (NOT bypassPermissions)
// and inherits the vault's .claude/settings.local.json allow-list. inbox-processing reads
// untrusted web-clipped content, so unattended runs must stay on a curated allow-list.
// Never throws — a session-start hook must never disrupt startup.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';

const VAULT = '<VAULT_ROOT>';
const SELF = '~/.claude/hooks/vault-daily-sweep.mjs';
const STAMP = path.join(os.homedir(), '.claude', '.vault-daily-sweep-stamp');
const LOG = path.join(VAULT, 'output', 'graph-brain', 'sweep.log');
const SKILLS = ['/distill', '/project-digest', '/meeting-sync'];
const PERM = 'acceptEdits';                       // NOT bypassPermissions — see header
const PER_SKILL_TIMEOUT_MS = 20 * 60_000;         // kill a stuck skill after 20 min
const DRYRUN = process.env.VAULT_SWEEP_DRYRUN === '1';
const today = () => new Date().toISOString().slice(0, 10);

function log(line) {
  try {
    if (fs.existsSync(LOG) && fs.statSync(LOG).size > 1_000_000) fs.truncateSync(LOG, 0);
    fs.appendFileSync(LOG, `${new Date().toISOString()}  ${line}\n`);
  } catch {}
}

// ---- WORKER MODE: run the skills sequentially, already detached from the session ----
async function runWorker() {
  log(`sweep start (perm=${PERM}, dryrun=${DRYRUN})`);
  for (const skill of SKILLS) {
    if (DRYRUN) { log(`DRYRUN would run: claude -p "${skill}"`); continue; }
    await new Promise((resolve) => {
      const out = fs.openSync(LOG, 'a');
      const child = spawn('claude', ['-p', skill, '--permission-mode', PERM],
        { cwd: VAULT, stdio: ['ignore', out, out], shell: true });
      const t = setTimeout(() => { try { child.kill('SIGKILL'); log(`TIMEOUT ${skill}`); } catch {} }, PER_SKILL_TIMEOUT_MS);
      child.on('exit', (code) => { clearTimeout(t); log(`done ${skill} (exit ${code})`); resolve(); });
      child.on('error', (e) => { clearTimeout(t); log(`ERROR ${skill}: ${e.message}`); resolve(); });
    });
  }
  log('sweep end');
}

// ---- HOOK MODE: gate on the daily stamp; if due, claim it and detach the worker ----
function runHook() {
  try {
    let done = '';
    try { done = fs.readFileSync(STAMP, 'utf8').trim(); } catch {}
    if (done === today()) return;                 // already swept today
    fs.writeFileSync(STAMP, today());             // claim TODAY first — blocks child re-trigger + same-morning races
    const child = spawn(process.execPath, [SELF, '--worker'],
      { detached: true, stdio: 'ignore', env: process.env });
    child.unref();                                // let it outlive this session
    log('armed daily sweep worker');
  } catch {}
}

if (process.argv[2] === '--worker') runWorker();
else runHook();
