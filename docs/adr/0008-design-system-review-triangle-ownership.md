# 0008 — design-system-review owns the parts-bin triangle; wiki-lint consumes its manifest

- Status: accepted
- Date: 2026-07-14

## Context
The parts bin (`agent-os/Skills/Coding/site-harvest/components/`) is a design system whose reusable
unit is a **triangle**: a component `.tsx` ↔ its `INDEX.md` row ↔ its build-note concept page in
the knowledge base. `graduate-to-partsbin-sop` explicitly named the missing guard: *"a lint check that
the component↔INDEX↔concept triangle stays in sync."* Building it (the `design-system-review` skill —
the third instance of the standing-stock portfolio-review pattern, after `wiki-lint` and
`skill-portfolio-review`) forced one non-obvious decision, because two of the triangle's three nodes
live **outside** the vault, where `wiki-lint` cannot and should not look.

A build-note is a `knowledge` concept page, so `wiki-lint` sees it — and will flag it as an
**orphan / unreachable-from-index** when its only inbound reference is the INDEX row across the
boundary. As authored components accumulate, that manufactures false orphans and erodes wiki-lint's
orphan signal (cries wolf).

## Decision
1. **`design-system-review` owns the entire triangle** — all three edges, both directions (orphan
   components, dangling rows, broken bin↔concept links). It is the only tool that knows the bin exists.
   `wiki-lint` keeps only the build-note's *vault-citizen* concerns (frontmatter, inter-concept
   wikilinks, vault-orphan status). Same file, orthogonal concerns.
2. **Cross-boundary reachability is recorded as a manifest, not papered over.** The deterministic lint
   emits `components/reached-from-bin.json` (the concept-page stems the INDEX reaches). `wiki-lint`
   consumes it as an **orphan-exemption (a 5th mirror pair)**: a build-note reachable from the bin is
   not a vault-orphan even with zero inbound `knowledge` wikilinks. design-system-review *produces* that
   truth; wiki-lint *consumes* it.
3. **Ordering constraint:** the deterministic `design-system-lint.mjs` runs **nightly, immediately
   before `wiki-lint`** in the inbox-sweep tail (`run-inbox-sweep.ps1`), so wiki-lint always reads a
   seconds-fresh manifest.
4. **The lint reuses, not reimplements, the seam parser.** `design-system-lint.mjs` `import`s `seamOf`
   from `infer-seam.mjs` (which reuses `infer-controls.mjs`'s `extractProps`). `infer-seam.mjs` stays a
   single-purpose per-component tool; the cross-file layer lives in the new script. One source of truth
   for seam-smell logic.

## Considered options
- **Split the triangle by direction** (design-system-review owns bin→concept, wiki-lint owns
  concept→bin). Rejected: wiki-lint doesn't reach into the bin at all, so "concept→bin" is a fiction —
  the edge is unowned, not shared. Overcomplicated and wrong.
- **Hub-link convention** — require every authored build-note to be linked from a vault hub page so
  wiki-lint's normal orphan check passes; no cross-tool wiring. Rejected: trades a code-coupling cost
  for a *human-vigilance* cost (remember the hub link on every graduation) — exactly the failure mode
  this skill exists to eliminate. Kept as the lower-tech fallback if the coupling ever proves fragile.
- **Accept the false orphans** and mentally filter them. Rejected: erodes wiki-lint's orphan signal as
  the bin grows.
- **Cram the bin lint into `infer-seam.mjs` as a `--lint-bin` mode.** Rejected: bloats a clean intra-file
  tool with INDEX-parsing and vault-scanning it has no business owning (see decision 4).

## Consequences
- `wiki-lint` now **depends on an artifact produced by another tool** — a real coupling. It is guarded
  by the nightly ordering constraint (decision 3) and degrades safely: if the manifest is absent or
  malformed, wiki-lint falls back to flagging the pages as orphans (the pre-existing behavior), never
  crashes. The trade-off is deliberate: truthful, self-maintaining orphan detection in exchange for one
  managed cross-tool seam.
- **This is the surprising bit a future reader will hit:** the vault linter reaching into a *parts-bin*
  artifact looks like a layering violation and invites "cleanup." Do not cut the dependency without
  restoring an equivalent orphan-exemption (e.g. the hub-link fallback) — removing it silently
  resurrects the false-orphan bug.
- The INDEX gains a machine-readable marker per row (`<!--{src:…, verified:…}-->`) so the provenance and
  verified checks read structured data, not prose. Graduates to explicit columns later if desired.

---
_Provenance: grilled 2026-07-14 (grill-with-docs) against `graduate-to-partsbin-sop`, the site-harvest
INDEX, and the `wiki-lint`/`skill-portfolio-review` sibling pattern. Note: ADR number 0007 is reserved
for the verifier-of-record / constraint-collapse decision (referenced by
`constraint-collapse-fork-resolution`); this decision took 0008 to avoid the collision._
