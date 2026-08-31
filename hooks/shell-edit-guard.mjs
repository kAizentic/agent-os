#!/usr/bin/env node
// shell-edit-guard.mjs — PreToolUse / Bash: block in-place modification of source files via
// shell text manipulation (sed -i, perl -i, redirection onto a source path).
//
// Why a hook and not a rule: insights snapshot #5 (window 2026-07-17→08-15) named this the #1
// friction after `verify before claiming` knocked Buggy Code from 56% to 44% — sed mangling
// backslashes, a heredoc inserting an import INSIDE a docstring, a malformed ledger row, and a
// backtick in a shader template literal, which the report calls "a repeat of a previously
// documented mistake." That phrase is the signature of an ADHERENCE failure, and the vault's
// standing answer to those is an instrument, not a 34th CLAUDE.md bullet
// (*codification ladder*; the herestring-guard precedent, 2026-07-29).
//
// SCOPE — deliberately narrower than the report's own wording, which was "do not use sed,
// heredocs, or shell redirection." Taken literally that would contradict two live rules:
// herestring-guard.mjs RECOMMENDS a bash heredoc (`git commit -F - <<'EOF'`) as the correct fix
// for multi-line commit messages, and ~/.claude/CLAUDE.md mandates it. A guard that fights
// another guard is worse than no guard. So this blocks the measured failure only:
// WRITING TO AN EXISTING-LOOKING SOURCE PATH FROM THE SHELL.
//
// Explicitly NOT blocked (all legitimate, all common here):
//   sed -n '1,50p' f          reading a range
//   grep x | sed 's/a/b/'     transforming a stream, no file target
//   py - <<'EOF'              heredoc as stdin to an interpreter
//   git commit -F - <<'EOF'   heredoc as commit message (the herestring-guard's own fix)
//   cat > /tmp/x.mjs <<EOF    scratch/temp path
//   echo x >> run.log         log append
//   py patch.py               a real script doing the edit — the intended escape hatch
//
// Correctable policy, not a security boundary: denies with an actionable reason rather than
// hard-halting. Biased to FALSE NEGATIVES — a blocking hook that cries wolf is worse than one
// that occasionally misses. Must never throw; always exit 0.

const chunks = [];
process.stdin.on("data", (c) => chunks.push(c));
process.stdin.on("end", () => emit(safeConcat(chunks)));
process.stdin.on("error", () => emit(""));

// Extensions worth protecting: things a human or a tool will later parse, where a mangled
// backslash or a half-inserted line is a silent logic bug rather than a visible error.
const SOURCE_EXT = /\.(mjs|cjs|js|jsx|ts|tsx|py|ps1|psm1|md|mdx|json|jsonl|css|scss|html|htm|sh|bash|ya?ml|toml|rs|go|java|c|cc|cpp|h|hpp|sql|rb|php|vue|svelte)$/i;

// Paths where shell-authoring is the right tool: scratch space, temp, caches, build output,
// and anything explicitly a log. A false positive here would be pure friction.
const EXEMPT_PATH = /(^|[\/\\])(tmp|temp|scratch|scratchpad|\.cache|\.git|node_modules|dist|build|out|coverage|__pycache__|\.venv|venv)([\/\\]|$)|\.log$|\.tmp$|^\/dev\/null$|\.bak$/i;

// A bare relative filename (`> notes.md`) carries no directory for EXEMPT_PATH to match, so it
// would be denied even inside a scratch dir — measured as a false positive within seconds of
// installing this. The PreToolUse payload carries `cwd`, so resolve against it before judging.
// If cwd is absent the old behaviour stands, which errs toward denying: acceptable, because the
// suggested fix (Write tool) is correct in that case anyway.
function isProtectedPath(raw, cwd) {
  if (!raw) return false;
  let p = String(raw).trim().replace(/^['"]|['"]$/g, "");
  if (!p || p === "-") return false;
  if (EXEMPT_PATH.test(p)) return false;
  if (!SOURCE_EXT.test(p)) return false;

  // Relative path + known cwd -> judge the resolved location, not the bare name.
  const isAbsolute = /^([A-Za-z]:[\\/]|[\\/]|~)/.test(p);
  if (!isAbsolute && cwd) {
    const joined = String(cwd).replace(/[\\/]+$/, "") + "/" + p.replace(/^\.[\\/]/, "");
    if (EXEMPT_PATH.test(joined)) return false;
  }
  return true;
}

// Heredoc BODIES are content, not commands. Scanning them means any command that writes a
// script *about* shell editing trips the guard — measured immediately: authoring this hook's own
// fixture file was denied because the fixtures contain `echo x > notes.md` as test data.
// The redirection target of `cat > src/x.py <<EOF` sits in the command portion, BEFORE the body,
// so stripping only bodies keeps that case caught. Same reasoning as herestring-guard's
// heredoc carve-out: content is not instruction.
function stripHeredocBodies(cmd) {
  return cmd.replace(
    /<<-?\s*(['"]?)([A-Za-z_]\w*)\1[^\n]*\n[\s\S]*?\n[ \t]*\2[ \t]*(\n|$)/g,
    (m) => m.split("\n")[0] + "\n",
  );
}

function emit(input) {
  try {
    if (!input) return done();

    let cmd = "";
    let cwd = "";
    try {
      const data = JSON.parse(input);
      cmd = safeStr(data && data.tool_input && data.tool_input.command);
      cwd = safeStr(data && data.cwd);
    } catch {
      return done(); // not JSON — say nothing rather than guess
    }
    if (!cmd) return done();

    // The hook fires BEFORE the command runs, so `cwd` is the shell's persistent directory, not
    // wherever a leading `cd` is about to move to. `cd <path> && …` is the dominant shape here,
    // so honour it — otherwise every relative write inside a scratch dir reads as a vault-root
    // write. Only a LEADING cd counts; anything later is too ambiguous to guess at.
    const leadCd = /^\s*cd\s+(?:\/d\s+)?(['"]?)([^'"&;|]+)\1\s*&&/.exec(cmd);
    if (leadCd && leadCd[2]) cwd = leadCd[2].trim();

    // Judge the command, not the payload it carries.
    cmd = stripHeredocBodies(cmd);

    // ---- (1) in-place stream editors -------------------------------------------------
    // `sed -i`, `sed --in-place`, `perl -i`, `perl -pi -e`. GNU sed on Windows/Git Bash is
    // exactly where the backslash mangling in the report happened.
    const inPlace =
      /\bsed\b[^|;&\n]*?\s(-i\b|--in-place\b|-[a-zA-Z]*i[a-zA-Z]*\s*(['"]?\.\w+['"]?)?\s+[^\s-])/.test(cmd) ||
      /\bperl\b[^|;&\n]*\s-[a-zA-Z]*i[a-zA-Z]*\b/.test(cmd);
    if (inPlace) {
      return deny(
        "In-place shell edit (`sed -i` / `perl -i`) detected. This is the #1 friction class in " +
          "insights snapshot #5 — backslashes get mangled and multi-line inserts land in the wrong " +
          "place (an import inserted inside a docstring, a malformed ledger row).",
      );
    }

    // ---- (2) redirection onto a source path -------------------------------------------
    // `> file.ts`, `>> file.md`, including the `cat > src/x.py <<EOF` heredoc-into-source
    // shape. Deliberately ignores `>&`, `2>`, `>/dev/null`, and process substitution.
    const redir = /(?<![0-9&])>>?\s*(?!&)(['"]?[^\s;|&><'"]+['"]?)/g;
    let m;
    while ((m = redir.exec(cmd)) !== null) {
      if (isProtectedPath(m[1], cwd)) {
        return deny(
          "Shell redirection writing to a source file (`" + m[1].slice(0, 80) + "`). Authoring or " +
            "rewriting a source file from the shell is what mangles backslashes, backticks inside " +
            "template literals, and multi-line inserts — and it silently truncates on failure.",
        );
      }
    }

    // ---- (3) tee onto a source path ----------------------------------------------------
    const tee = /\btee\b\s+(?:-a\s+)?(['"]?[^\s;|&><'"]+['"]?)/.exec(cmd);
    if (tee && isProtectedPath(tee[1], cwd)) {
      return deny(
        "`tee` writing to a source file (`" + tee[1].slice(0, 80) + "`). Same failure class as " +
          "shell redirection onto source.",
      );
    }

    return done();
  } catch {
    // never throw — a hook that crashes is worse than one that says nothing
  }
  process.exit(0);
}

function deny(reason) {
  return done({
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason:
        reason +
        "\n\nUse instead: (a) the **Write** tool for a whole file, (b) the **Edit** tool for a " +
        "targeted change, or (c) for a bulk/scripted edit, write a real script and run it " +
        "(`py patch.py`, `node patch.mjs`) — a script is not shell text manipulation and is not " +
        "blocked. Reading is never blocked (`sed -n '1,50p' f`), nor are heredocs into an " +
        "interpreter (`py - <<'EOF'`) or into `git commit -F -`, nor writes to tmp/scratch/log " +
        "paths. See ~/.claude/hooks/shell-edit-guard.mjs and insights snapshot #5.",
    },
  });
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
