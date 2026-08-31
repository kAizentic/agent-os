#!/usr/bin/env node
// context-guard.mjs — warns in-terminal when a session approaches the context "dumb zone".
//
// Two modes (dispatched on argv[2]):
//   (default)     PostToolUse / UserPromptSubmit — compute % of the effective ceiling and
//                 emit a systemMessage once per tier per session.
//   precompact    PreCompact (matcher "auto") — record the token count at the moment
//                 auto-compaction fires. THAT number is the effective ceiling, learned from
//                 the harness itself instead of a hardcoded guess. Self-calibrating and
//                 model-agnostic: swap models or change autoCompactWindow and it relearns.
//
// Denominator resolution (the "ceiling" = the effective saturation point where auto-compaction
// triggers, which is what a dumb-zone tool actually cares about):
//   1. CLAUDE_CONTEXT_WINDOW env  (explicit override always wins; treated as calibrated)
//   2. learned ceiling from a prior AUTO compaction  (calibrated)
//   3. 200000 seed  (UNCALIBRATED — warnings carry a caveat, and are suppressed entirely if
//      the session proves the seed is too low, so we never fire a confident-but-wrong alert)
//
// Env: CLAUDE_CONTEXT_WINDOW, CLAUDE_DUMBZONE_TIERS ("70,82,90"), CLAUDE_DUMBZONE_TOAST=1

import { readFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { execFile } from "node:child_process";

const SEED = 200000;
const STATE_DIR = join(homedir(), ".claude", "hooks", ".context-guard-state");
const CAL_FILE = join(STATE_DIR, "_calibration.json");

function readStdin() {
  try {
    return readFileSync(0, "utf8");
  } catch {
    return "";
  }
}

// current context size = latest MAIN-thread assistant usage in the transcript
function readTokens(transcriptPath) {
  if (!transcriptPath || !existsSync(transcriptPath)) return null;
  let raw;
  try {
    raw = readFileSync(transcriptPath, "utf8");
  } catch {
    return null;
  }
  const lines = raw.split("\n");
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].trim();
    if (!line) continue;
    let entry;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }
    if (entry.isSidechain === true) continue; // skip sub-agent turns
    const u = entry?.message?.usage;
    if (u && typeof u.input_tokens === "number") {
      return (
        (u.input_tokens || 0) +
        (u.cache_creation_input_tokens || 0) +
        (u.cache_read_input_tokens || 0) +
        (u.output_tokens || 0)
      );
    }
  }
  return null;
}

function readCal() {
  if (!existsSync(CAL_FILE)) return {};
  try {
    return JSON.parse(readFileSync(CAL_FILE, "utf8")) || {};
  } catch {
    return {};
  }
}
function writeCal(cal) {
  try {
    mkdirSync(STATE_DIR, { recursive: true });
    writeFileSync(CAL_FILE, JSON.stringify(cal));
  } catch {}
}

// ---- precompact mode: learn the ceiling from an auto-compaction ----
function recordCeiling(payload) {
  // matcher "auto" already scopes this, but guard defensively against manual /compact
  if (payload.trigger && payload.trigger !== "auto") return;
  const tokens = readTokens(payload.transcript_path);
  if (tokens == null) return;
  const cal = readCal();
  const prev = cal.learnedCeiling || 0;
  cal.learnedCeiling = Math.max(prev, tokens); // stable across compactions
  cal.learnedFrom = "auto-compact";
  cal.ceilingTs = Date.now();
  writeCal(cal);
}

// ---- default mode: warn on tier crossings ----
function warn(payload) {
  const sessionId = payload.session_id || "unknown";
  const tokens = readTokens(payload.transcript_path);
  if (tokens == null) return;

  // track observed max (used only to detect a too-low seed, never as the ceiling itself)
  const cal = readCal();
  const observedMax = Math.max(cal.observedMax || 0, tokens);
  if (observedMax !== cal.observedMax) {
    cal.observedMax = observedMax;
    writeCal(cal);
  }

  const envWin = Number(process.env.CLAUDE_CONTEXT_WINDOW) || 0;
  let ceiling, calibrated;
  if (envWin > 0) {
    ceiling = envWin;
    calibrated = true;
  } else if (cal.learnedCeiling > 0) {
    ceiling = cal.learnedCeiling;
    calibrated = true;
  } else {
    ceiling = SEED;
    calibrated = false;
  }

  const stateFile = join(STATE_DIR, `${sessionId.replace(/[^\w.-]/g, "_")}.json`);
  let st = {};
  if (existsSync(stateFile)) {
    try {
      st = JSON.parse(readFileSync(stateFile, "utf8")) || {};
    } catch {}
  }
  const saveState = (obj) => {
    try {
      mkdirSync(STATE_DIR, { recursive: true });
      writeFileSync(stateFile, JSON.stringify({ ...st, ...obj }));
    } catch {}
  };

  const tiers = (process.env.CLAUDE_DUMBZONE_TIERS || "70,82,90")
    .split(",")
    .map((n) => Number(n.trim()))
    .filter((n) => !Number.isNaN(n))
    .sort((a, b) => a - b);
  const [low = 70, mid = 82, high = 90] = tiers;

  const pct = (tokens / ceiling) * 100;

  // honesty guard: uncalibrated AND THIS session has itself climbed into warn territory
  // (pct >= low) while the global high-water mark proves the 200k seed is too low (near/over
  // the assumed ceiling with no auto-compaction ever) → the tiers would be nonsense, so
  // refuse to warn and say why. Gating on the CURRENT session's pct — not just the global
  // observedMax — is what stops a fresh, near-empty session from inheriting another
  // session's pressure and firing this on turn 1. Fires once per session.
  if (!calibrated && pct >= low && observedMax >= ceiling * 0.98) {
    if (!st.uncalNoticed) {
      saveState({ uncalNoticed: true });
      process.stdout.write(
        JSON.stringify({
          systemMessage:
            `⚠️ context-guard is uncalibrated and your window is clearly larger than the 200k seed ` +
            `(seen ~${Math.round(observedMax / 1000)}k with no auto-compaction). Tier warnings are ` +
            `paused to avoid false alarms — they'll self-calibrate at the first auto-compaction, ` +
            `or set CLAUDE_CONTEXT_WINDOW to pin it.`,
          suppressOutput: true,
        })
      );
    }
    return;
  }
  let tier = 0;
  if (pct >= high) tier = 3;
  else if (pct >= mid) tier = 2;
  else if (pct >= low) tier = 1;
  if (tier === 0) return;

  if (tier <= (st.tier || 0)) return; // already warned at this level or higher
  saveState({ tier });

  const kTok = Math.round(tokens / 1000);
  const pctR = Math.round(pct);
  const seedNote = calibrated ? "" : " (assuming 200k — uncalibrated)";
  let msg;
  if (tier === 1) {
    msg = `🟡 Context ${pctR}%${seedNote} (~${kTok}k) — approaching the dumb zone. Good moment to wrap the current thread, /capture, or plan a /compact.`;
  } else if (tier === 2) {
    msg = `🟠 DUMB ZONE — context ${pctR}%${seedNote} (~${kTok}k). Reasoning quality degrades from here. Finish the atomic step, then /compact or start a fresh session.`;
  } else {
    msg = `🔴 CRITICAL — context ${pctR}%${seedNote} (~${kTok}k). Auto-compaction is imminent. Land the current change and /compact now.`;
  }

  if (tier === 3 && process.env.CLAUDE_DUMBZONE_TOAST === "1") {
    try {
      execFile("powershell.exe", [
        "-NoProfile",
        "-Command",
        `[void][System.Reflection.Assembly]::LoadWithPartialName('System.Windows.Forms'); ` +
          `[System.Windows.Forms.MessageBox]::Show('${msg.replace(/'/g, "''")}','Claude context')`,
      ]);
    } catch {}
  }

  process.stdout.write(JSON.stringify({ systemMessage: msg, suppressOutput: true }));
}

function main() {
  let payload;
  try {
    payload = JSON.parse(readStdin() || "{}");
  } catch {
    return; // malformed payload — stay silent, never block
  }
  if (process.argv[2] === "precompact") recordCeiling(payload);
  else warn(payload);
}

main();
