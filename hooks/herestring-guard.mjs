#!/usr/bin/env node
// herestring-guard.mjs — PreToolUse / Bash: block PowerShell here-strings (@'…'@ , @"…"@)
// from being passed to the Bash tool, where POSIX sh parses them as @ + quoted + @ and the
// git commit subject silently becomes a literal "@" (then gets amended — the recurring
// @-commit + amend churn in vault reflogs).
//
// Why a hook and not just the rule: the prohibition has been written in ~/.claude/CLAUDE.md
// (## Environment) since 2026-07-03 and was violated anyway inside the 06-29→07-28 window.
// Insights snapshot #4 named that class explicitly — "a rule that exists and doesn't fire is a
// different problem from a rule that's missing" — so this enforces it mechanically.
// Rationale: *claude code practice* (snapshot #4 triage, 2026-07-29).
//
// Correctable policy, not a security boundary: it denies with an actionable reason the model
// can act on, rather than hard-halting. Must never throw; always exit 0.

const chunks = [];
process.stdin.on("data", (c) => chunks.push(c));
process.stdin.on("end", () => emit(safeConcat(chunks)));
process.stdin.on("error", () => emit(""));

function emit(input) {
  try {
    if (!input) return done();

    let cmd = "";
    try {
      const data = JSON.parse(input);
      cmd = safeStr(data && data.tool_input && data.tool_input.command);
    } catch {
      return done(); // not JSON — say nothing rather than guess
    }
    if (!cmd) return done();

    // A real bash heredoc in the same command means the @'…'@ is almost certainly *content*
    // being written out (e.g. authoring a .ps1 file from bash), which is legitimate.
    // Favour false negatives over false positives — a blocking hook that cries wolf is worse
    // than one that occasionally misses.
    if (/<<-?\s*['"]?[A-Za-z_]\w*/.test(cmd)) return done();

    // PowerShell here-string shape: opener @' or @" ending a line, plus a closer '@ or "@
    // starting a line. Requiring BOTH keeps stray @ / quote characters from matching.
    const hasOpener = /@['"][ \t]*\r?\n/.test(cmd);
    const hasCloser = /\r?\n[ \t]*['"]@/.test(cmd);
    if (!(hasOpener && hasCloser)) return done();

    return done({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason:
          "PowerShell here-string (@'…'@) detected in a Bash tool command. Git Bash is POSIX sh " +
          "and parses this as @ + quoted-string + @, so a commit subject silently becomes a " +
          "literal \"@\". Use one of: (a) write the message with the Write tool and " +
          "`git commit -F <file>`, or (b) a real bash heredoc — `git commit -F - <<'EOF' … EOF`. " +
          "If you genuinely need PowerShell here-string syntax, run it through the PowerShell " +
          "tool instead, where it is valid. See ~/.claude/CLAUDE.md § Environment (Windows).",
      },
    });
  } catch {
    // never throw — a hook that crashes is worse than one that says nothing
  }
  process.exit(0);
}

function done(payload) {
  try {
    if (payload) process.stdout.write(JSON.stringify(payload));
  } catch {
    /* ignore */
  }
  process.exit(0);
}

function safeConcat(cs) {
  try { return Buffer.concat(cs).toString("utf8"); } catch { return ""; }
}
function safeStr(v) {
  if (v == null) return "";
  if (typeof v === "string") return v;
  try { return JSON.stringify(v); } catch { return String(v); }
}
