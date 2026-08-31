#!/usr/bin/env node
// bg-launch-guard.mjs — PreToolUse / Bash: route background-server launches through bg-run.mjs,
// which launches AND registers atomically, so the process is reapable by construction.
//
// WHY THIS EXISTS, AND WHY IT IS A ROUTER RATHER THAN A NAG
//
// `rule-retirement-audit` scored "Register background dev servers so they get reaped" as the
// highest-friction FAILING rule in the harness: activity 213, **12 recorded violations**, landed
// 2026-07-20. Its friction probe measures an ABSENCE — a server start that never co-occurs with a
// bg-register call in the same session — which is precisely the failure a second step invites.
//
// bg-run.mjs already diagnosed this in its own header: "bg-register.mjs is correct and has always
// worked. The failure was never the registrar — it was that registration is a SECOND step a human
// or model has to remember after launching... The fix is not a louder request or a nagging hook —
// it is removing the second step."
//
// So this guard does not ask for registration. It denies the two-step path and hands back the
// one-step command, which is idempotent (adopts an already-listening port rather than relaunching)
// and therefore safe to substitute on every path. The rule stops depending on memory.
//
// SCOPE — launches only. Explicitly NOT blocked:
//   npm run build / test        not a server
//   pkill vite, lsof -i :5173   inspecting or killing, not starting
//   curl http://localhost:5173  talking to one
//   anything already via bg-run / bg-register
//   --help / --version / --dry-run probes
//   heredoc BODIES mentioning these commands (content is not instruction)
//
// Correctable policy, not a security boundary. Biased to FALSE NEGATIVES: a guard that blocks
// legitimate work gets removed, and then the 12 violations come back. Must never throw; exit 0.

const chunks = [];
process.stdin.on("data", (c) => chunks.push(c));
process.stdin.on("end", () => emit(safeConcat(chunks)));
process.stdin.on("error", () => emit(""));

// Long-running servers / watchers. Each entry is anchored on the LAUNCH form specifically, so
// inspecting or killing the same thing does not match.
const LAUNCHERS = [
  { re: /\bvite\b(?!\s+build)/i,                         hint: "vite dev server",      port: 5173 },
  { re: /\bnext\s+dev\b/i,                               hint: "next dev",             port: 3000 },
  { re: /\bnpm\s+run\s+dev\b/i,                          hint: "npm run dev",          port: 3000 },
  { re: /\b(pnpm|yarn|bun)\s+(run\s+)?dev\b/i,           hint: "dev server",           port: 3000 },
  { re: /\b(python|python3|py)\s+-m\s+http\.server\b/i,  hint: "http.server",          port: 8000 },
  { re: /\bhttp-server\b/i,                              hint: "http-server",          port: 8080 },
  { re: /\bnpx\s+serve\b/i,                              hint: "npx serve",            port: 3000 },
  { re: /\blive-server\b/i,                              hint: "live-server",          port: 8080 },
  { re: /\bjson-server\b/i,                              hint: "json-server",          port: 3000 },
  { re: /\bserve\.py\b/i,                                hint: "serve.py",             port: 8000 },
  { re: /\buvicorn\b/i,                                  hint: "uvicorn",              port: 8000 },
  { re: /\bgunicorn\b/i,                                 hint: "gunicorn",             port: 8000 },
  { re: /\bflask\s+run\b/i,                              hint: "flask",                port: 5000 },
  { re: /\bphp\s+-S\b/i,                                 hint: "php dev server",       port: 8000 },
  { re: /\b(astro|nuxt|remix|svelte-kit)\s+dev\b/i,      hint: "dev server",           port: 3000 },
  { re: /\bwebpack(-dev-server|\s+serve)\b/i,            hint: "webpack serve",        port: 8080 },
  { re: /\btail\s+(-[a-zA-Z]*f|--follow)\b/i,            hint: "tail -f (open-ended)",  port: null },
];

// Already doing the right thing, or not a launch at all.
const ALREADY_OK = /\bbg-run(\.mjs)?\b|\bbg-register(\.mjs)?\b/i;
const NOT_A_LAUNCH = /\b(pkill|taskkill|kill|lsof|netstat|curl|wget|ps\s+-|Get-Process|Stop-Process|grep|rg|which|where)\b/i;
const PROBE_FLAG = /\s(--help|-h|--version|-V|--dry-run)\b/i;

// Heredoc bodies are content, not commands — same carve-out as shell-edit-guard.mjs, which
// blocked authoring its own fixtures until this was added.
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
    try {
      const data = JSON.parse(input);
      cmd = safeStr(data && data.tool_input && data.tool_input.command);
    } catch {
      return done();
    }
    if (!cmd) return done();

    cmd = stripHeredocBodies(cmd);

    if (ALREADY_OK.test(cmd)) return done();     // registration is already handled
    if (NOT_A_LAUNCH.test(cmd)) return done();   // inspecting/killing, not starting
    if (PROBE_FLAG.test(cmd)) return done();     // --help / --version / --dry-run

    let hit = null;
    for (const l of LAUNCHERS) {
      if (l.re.test(cmd)) { hit = l; break; }
    }
    if (!hit) return done();

    // Try to recover the port the command itself names, so the suggested rewrite is concrete
    // rather than generic. Falls back to the launcher's conventional default.
    const named =
      /(?:--port[= ]|-p\s+|:)(\d{2,5})\b/.exec(cmd) ||
      /\bhttp\.server\s+(\d{2,5})\b/.exec(cmd) ||
      /\b-S\s+\S*?:(\d{2,5})\b/.exec(cmd);
    const port = named ? named[1] : hit.port;

    // Everything after `--` is spawned as argv, so a leading `cd X &&` must be HOISTED in front
    // of bg-run rather than passed through it — otherwise the rewrite tells bg-run to execute
    // `cd`, and the `&&` breaks the parse. Caught on the first live fire: an unpasteable rewrite
    // is worse than a generic instruction, because it looks authoritative.
    let inner = cmd.trim().replace(/\s*&\s*$/, "");
    let prefix = "";
    const lead = /^(\s*cd\s+(?:\/d\s+)?(?:'[^']*'|"[^"]*"|[^\s&;|]+)\s*&&\s*)/.exec(inner);
    if (lead) {
      prefix = lead[1].trim() + " ";
      inner = inner.slice(lead[1].length).trim();
    }
    const rewrite =
      prefix +
      'node "~/.claude/hooks/bg-run.mjs" ' +
      (port ? "--port " + port + " " : "--pid <pid> ") +
      '--label "' + hit.hint + '" -- ' + inner;

    return done({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason:
          "Background launch detected (" + hit.hint + ") without bg-run. This is the highest-friction " +
          "FAILING rule in the harness — rule-retirement-audit scores it at 12 recorded violations, " +
          "measured as server starts that never co-occur with a registration call, so the process " +
          "survives the session holding a port.\n\n" +
          "Launch AND register atomically instead — one call, idempotent (it ADOPTS an already-" +
          "listening port rather than relaunching, so it is safe on every path):\n\n" +
          "  " + rewrite + "\n\n" +
          "Registration is a property of launching, not a step after it. If this is NOT a " +
          "long-running process, or it must run in the foreground and exit on its own, say so and " +
          "re-run — `--dry-run`, `--help`, inspection (`lsof`, `curl`) and anything already using " +
          "bg-run/bg-register are never blocked. See ~/.claude/hooks/bg-run.mjs.",
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
