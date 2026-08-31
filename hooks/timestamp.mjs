#!/usr/bin/env node
// timestamp.mjs — two modes, one clock (ASCII-only output per environment rules).
//   statusline (default): reads statusline JSON on stdin, prints "Fri Aug 21 12:53 PM | Fable 5 | <VAULT_ROOT> | main"
//   inject:               prints a context line for the UserPromptSubmit hook so the model knows the real time
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const now = new Date();
const day = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][now.getDay()];
const mon = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][now.getMonth()];
let h = now.getHours();
const ampm = h >= 12 ? 'PM' : 'AM';
h = h % 12 || 12;
const mm = String(now.getMinutes()).padStart(2, '0');
const clock = `${h}:${mm} ${ampm}`;

if (process.argv[2] === 'inject') {
  const iso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  process.stdout.write(`[Current local time: ${day} ${iso} ${clock}. This stamp is from prompt-submit; re-check with Get-Date if precision matters after a long turn.]`);
  process.exit(0);
}

// statusline mode
let input = {};
try {
  input = JSON.parse(readFileSync(0, 'utf8'));
} catch {}
const parts = [`${day} ${mon} ${now.getDate()} ${clock}`];
const model = input?.model?.display_name;
if (model) parts.push(model);
const cwd = input?.workspace?.current_dir || input?.cwd;
if (cwd) {
  parts.push(cwd.replace(/[\\/]+$/, '').split(/[\\/]/).pop());
  try {
    const headPath = join(cwd, '.git', 'HEAD');
    if (existsSync(headPath)) {
      const head = readFileSync(headPath, 'utf8').trim();
      const m = head.match(/ref: refs\/heads\/(.+)/);
      parts.push(m ? m[1] : head.slice(0, 7));
    }
  } catch {}
}
process.stdout.write(parts.join(' | '));
