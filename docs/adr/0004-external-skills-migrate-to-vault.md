# 0004 — External / Cowork-authored skills migrate into the vault; no reverse-ingest pipeline

- Status: accepted
- Date: 2026-07-01

## Context
ADR-0001 established `agent-os/Skills/<Category>/<id>/SKILL.md` as the single source of
truth, compiled one-way to `~/.claude/skills/` by `compile-skills.mjs`. ADR-0003 added the
`cowork` target, mirroring the compiled runtime into the private `second-brain` marketplace
so skills also reach Cowork. Both flows are **push-only**: vault → Claude Code → Cowork.

Skills increasingly get *authored* outside the vault — most often in a Cowork session. That
raised the question: should the pipeline gain a **reverse** direction that grabs new
Cowork-authored skills and generates "full-fat" Claude Code versions in `~/.claude/skills`
automatically?

Two facts make the reverse pipeline the wrong build:
1. **There is no host-side collection point for Cowork-authored skills.** `~/.claude/skills`
   is a protected location Cowork can't write; the marketplace repo is *downstream* (the vault
   populates it); the AppData plugin cache is a read-only mirror of installed marketplaces, not
   authoring output. See *cowork vs claude code skill delivery*. Building the
   reverse flow would mean building the collection point too.
2. **"Thin → full-fat" is authoring, not a transform.** Upgrading a lightweight Cowork skill
   into a robust Claude Code one means adding fallback chains, host/Windows tool specifics,
   `examples/`, `references/`, and correct frontmatter — a judgment task for `skill-builder`,
   not something the deterministic, zero-dependency compiler can or should do. Letting the
   compiler "robustify" would also let half-baked skills auto-land in `~/.claude/skills`.

A one-line recall of this decision lives in path-scoped memory
(`skill-source-of-truth-migration`); this ADR is the durable, source-controlled record.

## Decision
**Externally-authored skills are migrated into the vault by hand; the pipeline stays
push-only.** When a skill is built outside the vault (Cowork or elsewhere):

1. **Migrate it into the vault** at `agent-os/Skills/<Category>/<slug>/SKILL.md` — the single
   source of truth (ADR-0001). The vault, not `~/.claude/skills`, is always the landing zone.
2. **Beef it up ad hoc there** — the thin → full-fat upgrade is a `skill-builder` pass, run when
   a given skill earns it, not on every import.
3. **Run `skill-pipeline-sync` ("sync my skills")** — the existing compile ships it to
   `~/.claude/skills`, wires the relationship graph, and the nightly Cowork push carries it back.

No reverse-ingest target is added to `compile-skills.mjs`.

## Considered options
- **Reverse-ingest pipeline (Cowork → vault → CC), with the compiler generating full-fat
  versions.** Rejected: requires building a collection point that doesn't exist, and conflates
  deterministic mirroring with authoring judgment. Given the low volume of externally-authored
  skills, the plumbing isn't worth it.
- **Copy straight into `~/.claude/skills`.** Rejected as the *primary* home: it works (the
  compiler only deletes skills carrying its `generated_by` marker, never hand-made ones), but it
  strands the skill outside the vault — not source-controlled, absent from the graph, and it
  won't propagate to Cowork. Fine only as a throwaway; never the source of truth.
- **Behavioral memory only (no ADR).** The memory covers recall; this also constrains *how the
  pipeline is allowed to grow* (stays push-only), which is an architecture choice worth a durable
  record.

## Consequences
- The pipeline stays one-directional and simple; the vault remains the sole authoring surface,
  preserving ADR-0001's no-drift guarantee.
- Importing an external skill is a manual "drop the folder in the vault + sync" gesture, plus an
  optional `skill-builder` upgrade — accepted as cheaper than maintaining a bidirectional sync and
  its two-writer merge problem.
- If externally-authored volume ever grows enough to hurt, revisit — but the reverse flow would
  still need a defined Cowork→host collection point before it's buildable.

---
_Provenance: 2026-07-01 design discussion. Pairs with ADR-0001 (skills single source of truth),
ADR-0003 (Cowork is the product surface), the `skill-source-of-truth-migration` memory, and
*cowork vs claude code skill delivery*._
