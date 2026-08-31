#!/usr/bin/env node
// inbox-glob-delete-guard.mjs — PreToolUse / Bash|PowerShell: block WILDCARD deletes in
// inbox. The sweep must remove the specific files it processed, never empty the folder
// to an end-state.
//
// The bug this exists for (2026-08-07, sweep #126): inbox is an unlocked shared queue.
// The sweep snapshots an inventory at open (22:30:27), works for ~14 minutes, then deletes.
// If that delete is `rm inbox/*.md`, every capture written inside the window is removed
// unread — never preserved to sources/, never distilled, and unrecoverable because inbox
// files are untracked. Four notes were lost that night. The log line ("30 files removed") is
// the count the sweep KNEW about, so the report stays internally consistent and still wrong.
//
// Why a hook and not just the rule: distill/SKILL.md already carries the invariant "never
// delete an inbox item until its original is preserved AND its page is written" (§Automated-run
// resilience) — and step 9's "so inbox ends empty" phrasing quietly licenses a wildcard that
// consults neither condition. A gate in prose is a request; a gate in the writer is a
// constraint. Same reasoning as herestring-guard.mjs.
// Rationale: *gate enforced in the writer*, .../empty-set-passes-every-check.md
//
// Deleting an EXPLICIT list of filenames is always allowed — that is the correct form, and a
// mid-run arrival simply waits for the next sweep.
//
// Correctable policy, not a security boundary: it denies with an actionable reason the model
// can act on, rather than hard-halting. Must never throw; always exit 0.

const chunks = [];
process.stdin.on("data", (c) => chunks.push(c));
process.stdin.on("end", () => emit(safeConcat(chunks)));
process.stdin.on("error", () => emit(""));

// A delete verb anywhere in the command. `-delete`/`-Delete` covers `find … -delete`.
const DELETE_VERB =
  /(^|[\s;|&(])(rm|unlink|del|erase|rmdir)([\s]|$)|Remove-Item|\bri\b|-[Dd]elete\b/;

// A path referencing inbox whose filename portion carries a glob metacharacter.
// Requires the separator so a bare mention of the folder name never matches.
const GLOB_IN_INBOX = /inbox[\\/][^\s'"`;|)]*[*?\[]/;

// Enumerate-then-delete: `ls inbox/… | xargs rm`, `Get-ChildItem inbox | Remove-Item`.
// This reaches the same end-state without a glob ever appearing next to the delete verb.
const ENUMERATE_PIPE =
  /inbox[^\n]*\|[^\n]*(Remove-Item|xargs[^\n]*\brm\b|\brm\b)/;

// `find inbox -name '*.md' -delete` — the glob lives in the -name predicate, not beside the
// path, so GLOB_IN_INBOX never sees it. Caught by the test suite, not by reading the regex.
const FIND_DELETE = /\bfind\b[^\n]*inbox[^\n]*(-delete\b|-exec[^\n]*\brm\b|\|[^\n]*xargs)/;

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
    if (!/inbox/.test(cmd)) return done();

    // Text inside a heredoc body is CONTENT being written to a file (a commit message, a doc,
    // a script), not a command this shell runs. Strip those bodies before matching, or the
    // guard denies its own documentation — which is exactly how it first fired, on the commit
    // message describing the bug it prevents. Strip the body only, not the whole command, so a
    // command that writes a heredoc AND runs a real glob delete is still caught.
    cmd = stripHeredocBodies(cmd);
    if (!/inbox/.test(cmd)) return done();

    const wildcardDelete = DELETE_VERB.test(cmd) && GLOB_IN_INBOX.test(cmd);
    const enumerateDelete = ENUMERATE_PIPE.test(cmd) || FIND_DELETE.test(cmd);
    if (!wildcardDelete && !enumerateDelete) return done();

    return done({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason:
          "Wildcard delete in inbox. inbox is an unlocked shared queue: a capture written " +
          "while the sweep is running is NOT in the inventory it snapshotted at open, so a glob " +
          "removes it unread and unrecoverable (inbox files are untracked — git cannot restore " +
          "them). This actually happened on 2026-08-07, sweep #126: four capture notes lost, and " +
          "the log's \"30 files removed\" was the count the sweep knew about, so nothing looked " +
          "wrong. Delete the SPECIFIC files this run processed instead — pass the inventory as an " +
          "explicit list of filenames. A mid-run arrival then just waits for the next sweep, " +
          "which is harmless. See distill/SKILL.md step 9 and its §Automated-run resilience " +
          "invariant: never delete an inbox item until its original is preserved AND its page is " +
          "written.",
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

// Remove `<<DELIM … DELIM` / `<<'DELIM' … DELIM` bodies, keeping the surrounding command.
// An unterminated heredoc drops everything after the opener, which is the safe direction here:
// the guard sees less, not more, and errs toward allowing rather than crying wolf.
function stripHeredocBodies(s) {
  try {
    const opener = /<<-?\s*(['"]?)([A-Za-z_]\w*)\1/g;
    let out = "", last = 0, m;
    while ((m = opener.exec(s)) !== null) {
      const delim = m[2];
      const bodyStart = s.indexOf("\n", opener.lastIndex);
      if (bodyStart === -1) { out += s.slice(last, opener.lastIndex); last = s.length; break; }
      const close = new RegExp("^[ \\t]*" + delim + "[ \\t]*$", "m");
      const rest = s.slice(bodyStart + 1);
      const hit = close.exec(rest);
      const bodyEnd = hit === null ? s.length : bodyStart + 1 + hit.index + hit[0].length;
      out += s.slice(last, bodyStart + 1);
      last = bodyEnd;
      opener.lastIndex = bodyEnd;
    }
    return out + s.slice(last);
  } catch {
    return s; // never let the stripper break the guard
  }
}

function safeConcat(cs) {
  try { return Buffer.concat(cs).toString("utf8"); } catch { return ""; }
}
function safeStr(v) {
  if (v == null) return "";
  if (typeof v === "string") return v;
  try { return JSON.stringify(v); } catch { return String(v); }
}
