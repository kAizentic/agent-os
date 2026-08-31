#!/usr/bin/env node
// error-reflex.mjs — event-driven "skill" hook (OPP-self-evolving-skills, GO half).
// PostToolUse / Bash: scan the tool result for known error signatures and, ONLY on a
// match, inject a one-line reflex hint back to the model via additionalContext.
// Silent (no output) otherwise. Must never throw; always exit 0.
// Rationale + scope: *agentic claude code workflows* §7 (2026-07-06 verdict).

const chunks = [];
process.stdin.on("data", (c) => chunks.push(c));
process.stdin.on("end", () => emit(safeConcat(chunks)));
process.stdin.on("error", () => emit(""));

function emit(input) {
  try {
    let text = "";
    if (input) {
      try {
        const data = JSON.parse(input);
        text = [
          safeStr(data && data.tool_input && data.tool_input.command),
          safeStr(data && data.tool_response),
          safeStr(data && data.tool_error),
        ].join("\n");
      } catch {
        text = input; // not JSON — scan the raw text anyway
      }
    }

    const hints = [];
    if (/ModuleNotFoundError:\s*No module named/i.test(text)) {
      hints.push("Python module missing — use the `py` launcher and confirm the correct venv is active.");
    }
    if (/is not recognized as (?:the name of a cmdlet|an internal or external command)|command not found/i.test(text)) {
      hints.push("Command not found — if this CLI was just installed, PATH doesn't refresh in an open shell: reopen the terminal or reload $env:Path; the install likely succeeded (see CLAUDE.md Environment rule).");
    }

    if (hints.length) {
      process.stdout.write(JSON.stringify({
        hookSpecificOutput: {
          hookEventName: "PostToolUse",
          additionalContext: "error-reflex: " + hints.join(" | "),
        },
      }));
    }
  } catch {
    // never throw — a hook that crashes is worse than one that says nothing
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
