#!/usr/bin/env node
/**
 * citation-nudge.mjs - catches the moment a cited vault rule gets contradicted.
 *
 * The overturn is the highest-value sample the system produces and the only one
 * the corpus cannot generate internally (the vault governs the behaviour that
 * would disconfirm it). It is currently discarded with the transcript.
 *
 * Two stages, because no single hook event sees both halves:
 *   --stage stop    fires after an assistant turn. Detects a LOAD-BEARING vault
 *                   citation in that turn and parks a marker.
 *   --stage prompt  fires when the operator replies. If a marker is parked and the
 *                   reply carries disagreement, nudge to log the overturn.
 *
 * Deliberately biased toward over-firing: a false positive costs one dismissal,
 * a false negative costs the sample, and the samples are the entire point.
 *
 * Reads last_assistant_message from the hook PAYLOAD, never from the transcript
 * (Stop hooks fire before the transcript flushes - see memory
 * stop-hook-transcript-flush-race).
 *
 * Fails open, always. Never blocks a turn. Always exits 0.
 * ASCII-only output (Windows console capture).
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const LEDGER_SCRIPT =
  '<VAULT_ROOT>/library/scripts/citation-ledger.mjs';

// A vault page is being pointed at.
const SOURCE_RE = [
  /\[\[[^\]|]+\]\]/,
  /\b(?:concepts|personas|summaries|areas|meetings|skills)\/[a-z0-9][a-z0-9-]{3,}/,
  /\bCLAUDE\.md\b/i,
  /\bstanding rule\b/i,
];

// ...and it is doing work, not just being mentioned.
const LOADBEARING_RE =
  /\b(?:because|per your|per the|your own|as your|which is why|that is why|the rule says|already (?:says|found|names|flagged)|this is your|says to|tells us|rules? out|forbids|requires)\b/i;

// the operator pushing back.
const DISAGREE_RE =
  /(?:\bactually\b|\bbut that\b|\bthat'?s not\b|\bthat is not\b|\bi disagree\b|\bnot quite\b|\bisn'?t right\b|\bis not right\b|\btoo narrow\b|\btoo broad\b|\bcircumstantial\b|\bdoes ?n'?o?t apply\b|\boverreach\b|\bnarrow interpretation\b|\bstrict(?:ly)? interpret\b|\bi'?m uncertain\b|\bi am uncertain\b|\bnot validated\b|\bi don'?t think\b|\bi do not think\b|\bi don'?t know that\b|\bpushback\b|\bwrong\b|^no[, ]|\bis that not\b|\bwhy not\b|\bcaveats?\b)/i;

function statePath(session) {
  const id = String(session || 'unknown').replace(/[^a-zA-Z0-9-]/g, '');
  return path.join(os.tmpdir(), `claude-citation-pending-${id}.json`);
}

async function readPayload() {
  const chunks = [];
  for await (const c of process.stdin) chunks.push(c);
  const raw = Buffer.concat(chunks).toString('utf8').trim();
  if (!raw) return {};
  try { return JSON.parse(raw); } catch { return {}; }
}

function firstString(obj, keys) {
  for (const k of keys) {
    const v = obj && obj[k];
    if (typeof v === 'string' && v.trim()) return v;
  }
  return '';
}

/** Pull the page names that look like citations, for a more useful nudge. */
function extractSources(text) {
  const out = new Set();
  for (const m of text.matchAll(/\[\[([^\]|]+)(?:\|[^\]]*)?\]\]/g)) out.add(m[1].trim());
  for (const m of text.matchAll(
    /\b((?:concepts|personas|summaries|areas)\/[a-z0-9][a-z0-9-]{3,})/g)) out.add(m[1]);
  if (/\bCLAUDE\.md\b/i.test(text) || /\bstanding rule\b/i.test(text)) out.add('CLAUDE.md');
  return [...out].slice(0, 4);
}

async function main() {
  const stage = process.argv.includes('--stage')
    ? process.argv[process.argv.indexOf('--stage') + 1]
    : 'stop';

  const payload = await readPayload();
  const session = payload.session_id || payload.sessionId || process.env.CLAUDE_SESSION_ID || 'unknown';
  const file = statePath(session);

  if (stage === 'stop') {
    const msg = firstString(payload, [
      'last_assistant_message', 'lastAssistantMessage', 'message', 'assistant_message',
    ]);
    if (!msg) return;

    const hasSource = SOURCE_RE.some(re => re.test(msg));
    if (!hasSource || !LOADBEARING_RE.test(msg)) {
      // Nothing load-bearing this turn; clear any stale marker.
      try { fs.existsSync(file) && fs.unlinkSync(file); } catch { /* ignore */ }
      return;
    }

    try {
      fs.writeFileSync(file, JSON.stringify({
        session,
        sources: extractSources(msg),
        ts: new Date().toISOString(),
      }), 'utf8');
    } catch { /* ignore */ }
    return; // silent on the way out; the nudge belongs on the reply
  }

  if (stage === 'prompt') {
    let pending = null;
    try {
      if (fs.existsSync(file)) pending = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch { /* ignore */ }
    if (!pending) return;

    try { fs.unlinkSync(file); } catch { /* ignore */ }

    const reply = firstString(payload, ['prompt', 'user_message', 'userMessage', 'message', 'text']);
    if (!reply || !DISAGREE_RE.test(reply)) return;

    const srcs = (pending.sources || []).join(', ') || 'the page you cited';
    process.stdout.write(
      'CITATION OVERTURN LIKELY. Your previous turn leaned on: ' + srcs + '\n' +
      'the operator appears to be pushing back. Before continuing, decide whether this is an\n' +
      'overturn and if so log it - the human contradiction is the one sample the corpus\n' +
      'cannot generate on its own, and it dies with the transcript.\n' +
      '\n' +
      '  node "' + LEDGER_SCRIPT + '" log \\\n' +
      '    --event overturned --raised-by human --tier concept --source <page> \\\n' +
      '    --class <scope|stale|wrong|overreach> \\\n' +
      '    --counterfactual "what I would have concluded without it" \\\n' +
      '    --decision "what it changed" --repair "what to fix" --session ' + pending.session + '\n' +
      '\n' +
      'If he is disagreeing with something other than the cited page, skip it. Do not\n' +
      'log a mention, and do not log a disagreement that was not about the citation.\n');
  }
}

main().catch(() => { /* fail open */ }).finally(() => process.exit(0));
