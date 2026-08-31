# 0001 — Skills: single source of truth in `agent-os/Skills`

- Status: accepted
- Date: 2026-06-28

## Context
Skills lived in up to four places at once: `agent-os/Skills/` (the declared,
compiler-managed source of truth), `library/skills/` (a hand-maintained "grab-and-go"
copy), hand-made copies in `~/.claude/skills/` (manually copied from the library,
bypassing the compiler), and a now-deleted `knowledge/skills/`. Only ~23 of ~53 skills
were actually pipeline-managed. The ~30 bespoke workflow skills — the most valuable ones —
carried only `name` + `description`, so the relationship graph and validation were blind to
them, and the three locations drifted independently. The vault `CLAUDE.md` folder contract
described `library` as the "untouchable" home for skills, which entrenched the split.

## Decision
`agent-os/Skills/<Category>/<id>/SKILL.md` is the **single source of truth** for all
skills. Every skill is authored there with full frontmatter and compiled to
`~/.claude/skills/` by `compile-skills.mjs`. The two legacy paths are retired:

- the hand-made `~/.claude/skills/` copies are deleted so the compiler regenerates them
  (every runtime skill now carries the `generated_by: vault-skill-pipeline` marker);
- `library/skills/` is deleted; `library` keeps only prompts/swipe/other assets.

Judgment-call consolidations are reversible: deprecations use `status: deprecated` +
`supersedes:` rather than hard deletion (grill-me → grill-with-docs; brand-guidelines →
apply-brand). Workflows are encoded as `composes_with` edges, not folders.

## Consequences
- One generation path; no drift; the graph and validation see the whole portfolio.
- The vault `CLAUDE.md` folder contract is updated: `library` is no longer the skills home.
- Vendored skills (recorded in `_vendored.json`) stay verbatim; the compiler is
  vendored-aware (suppresses the missing-field/examples warnings for them).
- Trade-off accepted: deleting a documented "untouchable" library is hard to reverse, but
  git + the deprecation-first policy make it recoverable, and the dual-home maintenance
  cost is removed.
