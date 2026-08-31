#!/usr/bin/env node
// Stop hook — once per session, if a skill WITHOUT a real-run example (per the
// compiler-emitted ~/.claude/skills/.example-backlog.json) was invoked this
// session, nudge the agent to OFFER saving the session's real trace as that
// skill's example. Offer only — the write stays human-gated, and only skills
// still in the backlog manifest ever trigger this (the operator's invariant:
// "only if there isn't an example yet for the skill").
//
// Guards: exits silently unless breadcrumbs ∩ backlog is non-empty; a latch file
// makes it fire at most once per session; stop_hook_active short-circuits so a
// continuation caused by this hook can never re-trigger it (no loops). Reads only
// its own payload + files — never the transcript (stop-hook flush race).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

function readStdin() {
  // strip a UTF-8 BOM: PowerShell 5.1 pipes add one, and it breaks JSON.parse
  try { return fs.readFileSync(0, 'utf8').replace(/^﻿/, ''); } catch { return ''; }
}

try {
  const payload = JSON.parse(readStdin() || '{}');
  if (payload.stop_hook_active) process.exit(0);          // we caused this turn — stay quiet
  const sessionId = payload?.session_id;
  if (!sessionId) process.exit(0);

  const runsDir = path.join(os.tmpdir(), 'claude-skill-runs');
  const crumbsPath = path.join(runsDir, `${sessionId}.jsonl`);
  const latchPath = path.join(runsDir, `${sessionId}.nudged`);
  if (!fs.existsSync(crumbsPath) || fs.existsSync(latchPath)) process.exit(0);

  const manifestPath = path.join(os.homedir(), '.claude', 'skills', '.example-backlog.json');
  if (!fs.existsSync(manifestPath)) process.exit(0);
  const backlog = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))?.skills || {};

  const ran = new Set(
    fs.readFileSync(crumbsPath, 'utf8').split('\n').filter(Boolean)
      .map((l) => { try { return JSON.parse(l).skill; } catch { return null; } })
      .filter(Boolean));
  const hits = [...ran].filter((s) => backlog[s]);
  if (!hits.length) process.exit(0);

  fs.writeFileSync(latchPath, new Date().toISOString());  // once per session
  const lines = hits.map((s) => `- ${s} → save to: ${path.join(backlog[s], 'examples', s + '-example.md')}`);
  console.log(JSON.stringify({
    decision: 'block',
    reason:
      `[example-backlog nudge — fires once per session] This session invoked skill(s) that have no ` +
      `real-run example yet:\n${lines.join('\n')}\n` +
      `If a run above was a good, complete trace, OFFER the operator (plain text, don't auto-write) to save ` +
      `it as that skill's example — a worked trace with regression checks, written to the VAULT SOURCE ` +
      `path shown (never the runtime copy; it goes live on the next skill sync). If the run was ` +
      `trivial, partial, or failed, say you're skipping the example offer and why, in one line. ` +
      `Never fabricate a trace (example-backlog-convention).`,
  }));
  process.exit(0);
} catch { process.exit(0); }
