#!/usr/bin/env node
// Regression suite for inbox-glob-delete-guard.mjs.  Run: node inbox-glob-delete-guard.test.mjs
//
// Two of these cases are here because they FAILED first:
//   • `find inbox -name '*.md' -delete` — the glob lives in the -name predicate, not beside
//     the path, so the adjacency rule never saw it.
//   • heredoc bodies — the guard denied the very commit message documenting the bug it prevents.
// Keep both classes covered; they are the two shapes that get missed by reading the regex.

import { spawnSync } from 'node:child_process';

const HOOK = new URL('./inbox-glob-delete-guard.mjs', import.meta.url).pathname.replace(/^\//, '');
const NL = String.fromCharCode(10);

// [expectDeny, command]
const CASES = [
  // --- wildcard deletes: must DENY ---
  [true, 'rm inbox/*.md'],
  [true, 'rm -f inbox/*.md'],
  [true, 'rm -rf inbox/*'],
  [true, 'cd /c/vault && rm -f inbox/*.md'],
  [true, 'Remove-Item inbox' + String.fromCharCode(92) + '*.md -Force'],
  [true, 'Remove-Item -Path "inbox/*" -Include *.md'],
  [true, 'find inbox -name "*.md" -delete'],
  [true, 'find inbox -name "*.md" -exec rm {} ;'],
  [true, 'Get-ChildItem inbox -Filter *.md | Remove-Item'],
  [true, 'ls inbox/*.md | xargs rm'],

  // --- the correct form: an explicit inventory. must ALLOW ---
  [false, 'rm inbox/2026-08-07-a.md inbox/2026-08-07-b.md'],
  [false, 'rm -f "inbox/2026-08-07-diffusion-cannot-requantize-a-lattice.md"'],
  [false, 'Remove-Item inbox/2026-08-07-a.md, inbox/2026-08-07-b.md'],

  // --- heredoc bodies are CONTENT, not commands. must ALLOW ---
  [false, ["cat > /tmp/m.txt <<'EOF'",
           'fix: rm inbox/*.md was wrong',
           "also find inbox -name '*.md' -delete",
           'EOF'].join(NL)],
  [false, ["git commit -F - <<'MSG'",
           'deleted via rm -f inbox/*.md',
           'MSG'].join(NL)],

  // --- ...but a real glob delete OUTSIDE the heredoc is still caught ---
  [true, ["cat > /tmp/m.txt <<'EOF'", 'harmless text', 'EOF', 'rm -f inbox/*.md'].join(NL)],
  [true, ['rm -f inbox/*.md', "cat > /tmp/m.txt <<'EOF'", 'harmless', 'EOF'].join(NL)],

  // --- non-deletes pass untouched ---
  [false, 'ls inbox/*.md'],
  [false, 'grep -l "capture" inbox/*.md'],
  [false, 'cp inbox/*.md sources/'],
  [false, 'find inbox -name "*.md" -type f'],
  [false, 'rm archive/*.md'],
  [false, 'git status --porcelain'],
];

let fail = 0;
for (const [expectDeny, command] of CASES) {
  const r = spawnSync('node', [HOOK], {
    input: JSON.stringify({ tool_input: { command } }),
    encoding: 'utf8',
  });
  const denied = /"permissionDecision"\s*:\s*"deny"/.test(r.stdout || '');
  const ok = denied === expectDeny;
  if (!ok) fail++;
  if (r.status !== 0) { fail++; }
  const label = command.includes(NL) ? command.split(NL)[0] + ' …' : command;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${denied ? 'DENY ' : 'allow'}  ${label}`);
  if (r.status !== 0) console.log(`   !! hook exited ${r.status} (must always exit 0)`);
}
console.log(fail === 0 ? `${NL}all ${CASES.length} cases correct` : `${NL}${fail} FAILURES`);
process.exit(fail ? 1 : 0);
