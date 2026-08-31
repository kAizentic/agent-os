#!/usr/bin/env node
// PostToolUse hook (matcher: Skill) — breadcrumb every skill invocation so the
// Stop hook (example-backlog-nudge.mjs) can nudge for skills that still lack a
// real-run example. Writes one JSONL line per invocation to a session-scoped
// file in the OS temp dir. Fail-silent: a hook must never break the session.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

function readStdin() {
  // strip a UTF-8 BOM: PowerShell 5.1 pipes add one, and it breaks JSON.parse
  try { return fs.readFileSync(0, 'utf8').replace(/^﻿/, ''); } catch { return ''; }
}

try {
  const payload = JSON.parse(readStdin() || '{}');
  const skill = payload?.tool_input?.skill;
  const sessionId = payload?.session_id;
  if (skill && sessionId) {
    const dir = path.join(os.tmpdir(), 'claude-skill-runs');
    fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(
      path.join(dir, `${sessionId}.jsonl`),
      JSON.stringify({ skill, ts: new Date().toISOString(), cwd: payload.cwd || '' }) + '\n');
  }
} catch { /* never block the session */ }
process.exit(0);
