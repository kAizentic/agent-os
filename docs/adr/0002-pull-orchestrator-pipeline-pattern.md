# 0002 — The Pull-Orchestrator Pipeline pattern

- Status: proposed
- Date: 2026-06-28

## Context
Two skills independently converged on the same architecture: `softdev-workflows`
(idea → shipped code) and `site-synth` (URL/brief → deployed site). Neither cites the
other and they live in different functional categories (Coding) and different graph
communities, yet a graphify pass over `knowledge` + `agent-os` flagged them as
semantically near-identical from two separate extractions (0.70 and 0.80 INFERRED
`semantically_similar_to` edges) with **no structural tie** between them — the report's
single most surprising connection. Reading both confirmed it: `site-synth` calls itself
"glue… each stage is an existing skill"; `softdev-workflows` calls itself "a router +
orchestration layer over a vendored set of atomic skills… the front door." They are the
same pipeline shape applied to different domains.

The `CONTEXT.md` glossary already names **Orchestrator** ("a skill that drives a whole
workflow by composing others, e.g. `softdev-workflows`, `site-synth`") — but the
*invariants* that make an orchestrator work were never written down, so each new pipeline
rediscovers them by imitation.

## Decision
Recognize the **Pull-Orchestrator Pipeline** as a named, first-class pattern in the skill
system, and record its invariants here so the next multi-stage pipeline starts from them
rather than re-deriving them. An orchestrator that claims this pattern holds all of:

1. **Glue, not logic.** The orchestrator is a thin router/index. Every stage is an
   existing atomic skill; the orchestrator contributes sequencing and doctrine, not work.
2. **Pull, not push.** It is read on demand — "read the stage you're on, invoke the named
   skill, move on" — not executed as a script. (Per the push-vs-pull doctrine: always-on
   rules go in `CLAUDE.md`; pipelines are pulled.)
3. **Typed artifact handoffs.** Each stage emits a named artifact (`brand_kit.json`,
   a PRD/issue, `CRITIQUE.md`, `SYNTH-REPORT.md`, a `/handoff` doc) consumed unchanged by
   the next stage. Do not transform a stage's output beyond what the next stage's input
   needs.
4. **Honest gaps.** Carry a gap forward truthfully; never fabricate to smooth the pipeline.
   When a stage needs a decision, surface it to the user — don't answer on their behalf.
5. **Gate before the irreversible step.** A blocked quality gate halts the pipeline before
   the one-way door (deploy / merge), never after.
6. **Idempotent resumption.** Skip stages already done (kit exists → skip teardown;
   directive supplied → skip patterns); a re-run continues, it doesn't redo.
7. **Durable state out of context.** Push state out of the conversation into artifacts
   (issues, `CONTEXT.md`, ADRs, reports) — the orchestrator is restartable from disk, not
   from the window. (LLMs-as-Memento: prefer `/clear` over accumulating compaction.)

The chains between an orchestrator and its stages are encoded as `composes_with` edges, not
folders (per ADR 0001). Both current instances reference this ADR:

- **`softdev-workflows`** — stages: align → PRD → slice → implement → review → maintain.
- **`site-synth`** — stages: teardown → patterns → build → critique → SEO → deploy → report.
- **`studio`** (added 2026-06-29) — the design-intent sibling of `site-synth`: intake → doctrine +
  design intelligence → patterns → variant-exploration (gate) → asset/component generation → no-kit
  build → critique → SEO → deploy → report. Same shape, inverted front end (no clone/teardown
  stage; adds a variant-pick gate). It carries a `references: [adr-0002]` field + a "Pattern:" line.
  **⚠ Amended by [ADR-0005](0005-unified-site-orchestrator-and-afk-mode.md) (2026-07-02):** `studio` is
  no longer a separate sibling — it is the **`original` intake head** of the unified `site-synth`
  orchestrator (which now also carries `interactive`/`afk` run modes). `studio` remains as a
  deprecated trigger-alias only.

## Considered options
- **Leave them as independent skills (status quo).** Rejected: the pattern is already
  duplicated twice and a third pipeline (research, content, data) is plausible; without a
  named blueprint each one re-discovers the invariants and they drift (e.g. one forgets the
  gate-before-deploy rule). The whole point of a Second Brain is to not re-derive.
- **Extract a shared runnable orchestrator skill the others inherit from.** Rejected: these
  are *pull* indexes, not code; there is no runtime to share. The reusable thing is the
  *doctrine*, which is what an ADR captures. A template, not a base class.

## Consequences
- A new pipeline starts by instantiating the seven invariants, not by copying an existing
  orchestrator and hoping the implicit rules came along.
- Follow-up: a one-line "Pattern: Pull-Orchestrator Pipeline" note linking this ADR was added to
  the `site-synth`, `softdev-workflows`, and `studio` specs (2026-06-29) so the link is navigable,
  not just inferred. Still open: a one-line **Pull-Orchestrator Pipeline** entry in `CONTEXT.md`
  under/near **Orchestrator**, pointing at this ADR.
- The pattern becomes a checklist for review: an orchestrator that violates an invariant
  (transforms artifacts, gates after deploy, can't resume) is a bug, not a style choice.
- Trade-off accepted: naming a pattern risks over-fitting — a genuinely different future
  pipeline shouldn't be forced into these seven rules. Mitigation: this is a `proposed`
  ADR describing two observed instances, not a mandate; it is superseded, not contorted, if
  a third pipeline needs a materially different shape.

---
_Provenance: emerged from the 2026-06-28 graphify build of the vault — the
`site-synth`↔`softdev-workflows` semantic edge surfaced as the top "surprising connection,"
which on inspection was a real shared architecture rather than an extraction artifact._
