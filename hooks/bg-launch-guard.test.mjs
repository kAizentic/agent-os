#!/usr/bin/env node
// Fixture suite for bg-launch-guard.mjs.
//
// Both branches are asserted, per the retirement precedent: a guard is only evidence if it
// FIRES on the violation AND STAYS SILENT on the legitimate lookalike. The allow cases are
// weighted heavier — this rule's blast is only `medium` (a stray port), so a guard that blocks
// real work is a net loss and would get removed, taking the 12-violation fix with it.

import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HOOK = path.join(path.dirname(fileURLToPath(import.meta.url)), "bg-launch-guard.mjs");

function run(command) {
  const r = spawnSync(process.execPath, [HOOK], {
    input: JSON.stringify({ tool_name: "Bash", tool_input: { command } }),
    encoding: "utf8",
  });
  if (r.status !== 0) return { crashed: true };
  const out = (r.stdout || "").trim();
  if (!out) return { denied: false };
  try {
    const j = JSON.parse(out);
    return {
      denied: j?.hookSpecificOutput?.permissionDecision === "deny",
      reason: j?.hookSpecificOutput?.permissionDecisionReason || "",
    };
  } catch { return { malformed: true, out }; }
}

let pass = 0, fail = 0;
function check(label, cmd, wantDeny, extra) {
  const r = run(cmd);
  let ok = !r.crashed && !r.malformed && r.denied === wantDeny;
  if (ok && extra) ok = extra(r);
  if (ok) { pass++; console.log("  PASS  " + label); }
  else { fail++; console.log("  FAIL  " + label + "  [" + JSON.stringify(r).slice(0, 150) + "]"); }
}

console.log("--- MUST DENY (unregistered background launches) ---");
check("python http.server",     "py -m http.server 8901", true);
check("python3 http.server",    "python3 -m http.server", true);
check("npm run dev",            "npm run dev", true);
check("vite",                   "npx vite --port 5174", true);
check("next dev",               "next dev", true);
check("uvicorn",                "uvicorn app:api --port 8000", true);
check("php dev server",         "php -S localhost:8000", true);
check("http-server",            "http-server ./dist -p 8080", true);
check("tail -f (open-ended)",   "tail -f ~/.claude/loop-miner-run.log", true);
check("backgrounded with &",    "py -m http.server 8000 &", true);
check("cd then launch",         'cd "C:/vault/output" && py -m http.server 8901', true);

console.log("--- the rewrite must be concrete and correct ---");
check("names the port it found", "py -m http.server 8901", true,
      (r) => /--port 8901/.test(r.reason));
check("names a default when absent", "npm run dev", true,
      (r) => /--port 3000/.test(r.reason));
check("preserves the original command", "npx vite --port 5174", true,
      (r) => /-- npx vite --port 5174/.test(r.reason));
check("strips a trailing &", "py -m http.server 8000 &", true,
      (r) => /-- py -m http\.server 8000\s*$/m.test(r.reason) || !/&\s*$/m.test(r.reason));
// A leading `cd X &&` must be HOISTED in front of bg-run, never passed after `--`, or the
// rewrite tells bg-run to spawn `cd`. Found on the guard's first live fire.
check("hoists a leading cd in front of bg-run",
      'cd "C:/vault/output" && py -m http.server 8901', true,
      (r) => /cd "C:\/vault\/output" && node "[^"]*bg-run\.mjs"/.test(r.reason));
check("nothing after -- except the launch itself",
      'cd "C:/vault" && npm run dev', true,
      (r) => / -- npm run dev/.test(r.reason) && !/-- cd /.test(r.reason));

console.log("--- MUST ALLOW ---");
check("already using bg-run",   'node "~/.claude/hooks/bg-run.mjs" --port 8901 --label "x" -- py -m http.server 8901', false);
check("already using bg-register", "node ~/.claude/hooks/bg-register.mjs --port 8901 --label x", false);
check("npm run build",          "npm run build", false);
check("npm test",               "npm test", false);
check("vite build",             "npx vite build", false);
check("killing a server",       "pkill -f 'http.server'", false);
check("checking a port",        "lsof -i :5173", false);
check("netstat",                "netstat -ano | findstr 8901", false);
check("curl to a dev server",   "curl -s http://localhost:5173/ | head -20", false);
check("grep mentioning vite",   "grep -rn 'npm run dev' package.json", false);
check("--help probe",           "uvicorn --help", false);
check("--version probe",        "vite --version", false);
check("--dry-run",              "npx serve --dry-run", false);
check("tail without -f",        "tail -60 knowledge/log.md", false);
check("tail -n 20",             "tail -n 20 run.log", false);
check("stop-process",           "Stop-Process -Id 46920", false);

console.log("--- heredoc bodies are data, not commands ---");
check("body mentioning npm run dev",
      "py - <<'EOF'\ndoc = 'launch with npm run dev'\nprint(doc)\nEOF", false);
check("body mentioning http.server",
      "py - <<'EOF'\ns = 'py -m http.server 8000'\nEOF", false);

console.log("--- ROBUSTNESS ---");
const e = run("");
console.log((!e.crashed ? "  PASS" : "  FAIL") + "  empty command does not crash");
!e.crashed ? pass++ : fail++;
const r2 = spawnSync(process.execPath, [HOOK], { input: "not json", encoding: "utf8" });
const ok2 = r2.status === 0 && !r2.stdout.trim();
console.log((ok2 ? "  PASS" : "  FAIL") + "  non-JSON stdin is silent, exit 0");
ok2 ? pass++ : fail++;

console.log("--- " + pass + " passed, " + fail + " failed ---");
process.exit(fail ? 1 : 0);
