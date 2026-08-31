#!/usr/bin/env node
// SessionStart hook: inject the skill-dispatch reflex as additionalContext.
// Source of truth lives in the vault so it stays editable without a recompile.
// Mined from obra/Superpowers' using-superpowers dispatcher. See that doc.
//
// Three blocks are pulled from the vault doc:
//   DISPATCH        — the always-on "use your skills" reflex.
//   INSIGHTS-OFFER  — appended ONLY when cwd is outside the vault, so an
//                     external project gets a one-line /apply-insights offer.
//                     The hook fires before the user types, so the "is this an
//                     open-ended task?" judgment is deferred to the model via
//                     the block's own instruction — the hook only gates on cwd.
//   DESIGN-LANE     — always-on design/motion routing card (added 2026-08-21).
//                     Unconditional by design: the composition map (two motion
//                     tracks, parts bin, rig, timing defaults, de-slop QA) is
//                     auto-imported nowhere outside the vault, and only as bare
//                     router links inside it. Measured 2026-08-21: 0 of 79
//                     compiled skills carry `composes_with`, and only 1 of 79
//                     descriptions mentions the parts bin.

import { readFileSync } from "node:fs";

const SOURCE =
  "<VAULT_ROOT>/agent-os/docs/skill-dispatch.md";
const VAULT = "<VAULT_ROOT>";

function block(md, name) {
  const m = md.match(
    new RegExp(`<!--\\s*BEGIN ${name}\\s*-->([\\s\\S]*?)<!--\\s*END ${name}\\s*-->`)
  );
  return m ? m[1].trim() : null;
}

try {
  let input = {};
  try {
    input = JSON.parse(readFileSync(0, "utf8") || "{}");
  } catch {
    // No/invalid stdin — treat as vault-safe (no offer), still emit dispatch.
  }
  const cwd = (input.cwd || "").replace(/\\/g, "/").toLowerCase();
  const inVault = cwd.startsWith(VAULT);

  const md = readFileSync(SOURCE, "utf8");
  const parts = [block(md, "DISPATCH")];
  if (!inVault) parts.push(block(md, "INSIGHTS-OFFER"));
  parts.push(block(md, "DESIGN-LANE"));
  const context = parts.filter(Boolean).join("\n\n");

  if (context) {
    process.stdout.write(
      JSON.stringify({
        hookSpecificOutput: {
          hookEventName: "SessionStart",
          additionalContext: context,
        },
      })
    );
  }
} catch {
  // Vault unavailable (different machine, moved path) — fail silent, no context.
}
process.exit(0);
