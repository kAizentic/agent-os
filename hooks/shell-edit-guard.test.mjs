#!/usr/bin/env node
// Fixture suite for shell-edit-guard.mjs.
//
// The ALLOW cases matter more than the DENY cases. This guard is deliberately biased to false
// negatives — a blocking hook that cries wolf gets bypassed or removed, and then the friction it
// was built for comes straight back. Every allow case below is a real command shape from this
// vault's own history.

import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HOOK = path.join(path.dirname(fileURLToPath(import.meta.url)), "shell-edit-guard.mjs");

function run(command, cwd) {
  const payload = { tool_name: "Bash", tool_input: { command } };
  if (cwd) payload.cwd = cwd;
  const r = spawnSync(process.execPath, [HOOK], {
    input: JSON.stringify(payload),
    encoding: "utf8",
  });
  if (r.status !== 0) return { crashed: true, code: r.status };
  const out = (r.stdout || "").trim();
  if (!out) return { denied: false };
  try {
    const j = JSON.parse(out);
    return { denied: j?.hookSpecificOutput?.permissionDecision === "deny", reason: j?.hookSpecificOutput?.permissionDecisionReason };
  } catch {
    return { malformed: true, out };
  }
}

let pass = 0, fail = 0;
function check(label, cmd, wantDeny, cwd) {
  const r = run(cmd, cwd);
  const ok = !r.crashed && !r.malformed && r.denied === wantDeny;
  if (ok) { pass++; console.log("  PASS  " + label); }
  else {
    fail++;
    console.log("  FAIL  " + label + "  [want deny=" + wantDeny + " got " + JSON.stringify(r).slice(0, 120) + "]");
  }
}

console.log("--- MUST DENY (the measured failure class) ---");
check("sed -i on a source file",        "sed -i 's/foo/bar/' src/app.ts", true);
check("sed -i with backup suffix",      "sed -i.bak 's/a/b/' knowledge/page.md", true);
check("sed --in-place",                 "sed --in-place 's/a/b/' script.mjs", true);
check("perl -pi -e",                    "perl -pi -e 's/a/b/' lib/thing.py", true);
check("heredoc authoring a source file","cat > library/scripts/foo.mjs <<'EOF'\nconsole.log(1)\nEOF", true);
check("echo overwriting a wiki page",   "echo '# hi' > knowledge/notes/projects.md", true);
check("append to a source file",        "echo 'more' >> knowledge/log.md", true);
check("redirect into a .json",          "jq . x > config.json", true);
check("tee onto a source file",         "cat x | tee src/out.py", true);
check("tee -a onto a source file",      "cat x | tee -a src/out.py", true);
check("cd then heredoc to source",      'cd "C:/vault" && cat > a/b/c.ts <<EOF\nx\nEOF', true);

console.log("--- MUST ALLOW (all real shapes from this vault) ---");
check("sed range read",                 "sed -n '1,50p' knowledge/notes/projects.md", false);
check("sed -n with file",               "sed -n '400,621p' library/scripts/trace-divergence-miner.mjs", false);
check("sed transforming a stream",      "grep -rn foo src | sed 's/^/  /'", false);
check("sed -e stream, no -i",           "cat f.md | sed -e 's/a/b/' | head -20", false);
check("heredoc into python stdin",      "py - <<'PYEOF'\nprint(1)\nPYEOF", false);
check("heredoc into node stdin",        "node - <<'EOF'\nconsole.log(1)\nEOF", false);
check("git commit heredoc (the fix)",   "git commit -F - <<'EOF'\nsubject\n\nbody\nEOF", false);
check("git commit -F file",             "git commit -F /tmp/msg.txt", false);
check("write to tmp",                   "cat > /tmp/scratch.mjs <<'EOF'\nx\nEOF", false);
check("write to scratchpad",            "cat > C:/Users/x/scratchpad/probe.py <<'EOF'\nx\nEOF", false);
check("append to a log",                "echo done >> ~/.claude/loop-miner-run.log", false);
check("redirect to /dev/null",          "noisy-command > /dev/null 2>&1", false);
check("stderr redirect",                "py script.py 2>&1 | tail -5", false);
check("fd redirect",                    "cmd >&2", false);
check("script doing the edit (escape)", "py patch-ccp.py", false);
check("node script doing the edit",     "node library/scripts/loop-miner.mjs --dry-run", false);
check("plain read",                     "cat knowledge/index.md", false);
check("grep with output mode",          "grep -c foo knowledge/log.md", false);
check("redirect to an extensionless f", "make > buildout", false);
check("write into node_modules",        "cat > node_modules/.bin/x.js <<'EOF'\nx\nEOF", false);
check("write a .bak",                   "cp a.md a.md.bak && echo x > a.md.bak", false);

console.log("--- CWD RESOLUTION (relative paths) ---");
const SCRATCH = "~/AppData/Local/Temp/claude/xyz/scratchpad";
const VAULT = "<VAULT_ROOT>";
check("bare name + scratch cwd -> allow", "echo x " + ">" + " notes.md", false, SCRATCH);
check("bare name + vault cwd -> deny",    "echo x " + ">" + " notes.md", true, VAULT);
check("leading cd into scratch -> allow", 'cd "' + SCRATCH + '" && echo x ' + ">" + " notes.md", false, VAULT);
check("leading cd into vault -> deny",    'cd "' + VAULT + '" && echo x ' + ">" + " knowledge/log.md", true, SCRATCH);
check("no cwd at all -> deny (errs safe)", "echo x " + ">" + " notes.md", true);
check("absolute path ignores cwd",        "echo x " + ">" + " " + VAULT + "/knowledge/log.md", true, SCRATCH);

console.log("--- HEREDOC BODIES ARE DATA, NOT COMMANDS ---");
// Authoring a file whose CONTENT mentions shell edits must not trip the guard. This exact
// false positive was hit live while writing these very fixtures.
check("heredoc body containing a redirect",
      "py - <<'PYEOF'\ns = 'echo x " + ">" + " notes.md'\nprint(s)\nPYEOF", false, SCRATCH);
check("heredoc body containing sed -i",
      "py - <<'EOF'\ndoc = 'never use sed -i on src/app.ts'\nEOF", false, SCRATCH);
// ...but a redirect in the COMMAND portion still gets caught, body or no body.
check("redirect target before a heredoc still denied",
      "cat " + ">" + " src/app.py <<'EOF'\nimport os\nEOF", true, VAULT);

console.log("--- ROBUSTNESS ---");
const empty = run("");
console.log((!empty.crashed ? "  PASS" : "  FAIL") + "  empty command does not crash");
!empty.crashed ? pass++ : fail++;
const r2 = spawnSync(process.execPath, [HOOK], { input: "not json at all", encoding: "utf8" });
console.log((r2.status === 0 && !r2.stdout.trim() ? "  PASS" : "  FAIL") + "  non-JSON stdin is silent, exit 0");
(r2.status === 0 && !r2.stdout.trim()) ? pass++ : fail++;

console.log("--- " + pass + " passed, " + fail + " failed ---");
process.exit(fail ? 1 : 0);
