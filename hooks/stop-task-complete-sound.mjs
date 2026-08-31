#!/usr/bin/env node
/**
 * Stop hook — play a completion chime ONLY when a task is actually done.
 *
 * The Stop event fires on every turn end and carries no "task complete" flag,
 * so Claude signals completion by ending its final message with the marker:
 *     <!-- task-complete -->
 * (an HTML comment — invisible in the rendered terminal output, but present in
 * the transcript).
 *
 * Preferred source: `last_assistant_message` from the Stop payload. The
 * transcript file is flushed AFTER Stop hooks fire (changed in a 2026-07
 * Claude Code update), so scraping the transcript races and misses the final
 * message. The transcript walk below is kept only as a fallback for older
 * payloads that lack the field.
 *
 * Anything else (intermediate replies, follow-up questions, status updates)
 * ends silently.
 */
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const MARKER = '<!-- task-complete -->';
const SOUND = 'C:\\Windows\\Media\\tada.wav';

function readStdin() {
  try {
    return readFileSync(0, 'utf8');
  } catch {
    return '';
  }
}

let turnText = '';
try {
  const input = JSON.parse(readStdin() || '{}');

  const lam = input.last_assistant_message;
  if (lam) {
    turnText = typeof lam === 'string' ? lam : JSON.stringify(lam);
  }

  const transcriptPath = input.transcript_path;
  if (!turnText && transcriptPath) {
    // Fallback: accumulate ALL assistant text back to the previous user
    // message — a single turn is split across multiple assistant events
    // (streaming chunks, interleaved tool calls), so the marker may not be
    // in the last event alone.
    const lines = readFileSync(transcriptPath, 'utf8').split(/\r?\n/).filter(Boolean);
    const chunks = [];
    for (let i = lines.length - 1; i >= 0; i--) {
      let ev;
      try {
        ev = JSON.parse(lines[i]);
      } catch {
        continue;
      }
      if (ev.type === 'user') break;
      if (ev.type !== 'assistant') continue;
      const content = ev.message && ev.message.content;
      if (!Array.isArray(content)) continue;
      const text = content
        .filter((b) => b && b.type === 'text' && typeof b.text === 'string')
        .map((b) => b.text)
        .join('\n');
      if (text) chunks.push(text);
    }
    turnText = chunks.join('\n');
  }
} catch {
  // On any error, stay silent — never block the Stop event.
}

if (turnText.includes(MARKER)) {
  // Blocking play: the Stop hook is awaited, so PlaySync finishes before we
  // return — more reliable than a detached fire-and-forget child.
  spawnSync(
    'powershell.exe',
    ['-NoProfile', '-Command', `(New-Object Media.SoundPlayer '${SOUND}').PlaySync()`],
    { stdio: 'ignore' }
  );
}

process.exit(0);
