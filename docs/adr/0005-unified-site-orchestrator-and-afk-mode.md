# 0005 — One site orchestrator, two intake heads, front-loaded-judgment AFK mode

- Status: accepted
- Date: 2026-07-02
- Amends: [ADR-0002](0002-pull-orchestrator-pipeline-pattern.md) (the `studio`-as-separate-sibling bullet)

## Context
`site-synth` and `studio` were introduced as two orchestrators (ADR-0002 named them
"siblings"). Reading both end to end, they are **the same pipeline with two intake heads**:

- `site-synth` head → **clone/brand**: a URL or `brand_kit.json` → `brand-teardown` → kit.
- `studio` head → **original/intent**: a design brief → `frontend-design` + `ui-ux-pro-max`
  → `design-system/MASTER.md` (+ a mandatory 3-variant "Framer" pick).

Everything from `design-patterns` onward — directive → `brand-to-site` build → craft critique →
quality gates → `og-and-seo` → gated deploy → report — is **identical**. Yet it was written twice:
two SKILL bodies, two `intake/pipeline/budget` reference sets, two report names (`SYNTH-REPORT` /
`STUDIO-REPORT`), two self-improvement loops. The "glue not logic" prose had drifted — the
offer-demo/deploy paragraph, the quality-gate list, and the critique step were re-described in
`brand-to-site`, `site-synth`, **and** `studio` rather than owned once and pointed at. Two siblings
that must be kept in sync is exactly the fragmentation ADR-0002's own "don't re-derive" principle
warns against.

Separately: the pipeline is deliberately **human-in-the-loop** (blueprint confirm, variant pick,
vibe inference), and the orchestrator is forbidden from resolving those forks on the user's behalf
(ADR-0002 invariant 4). That interactivity is a **feature** — human judgment before autonomous
execution is the best defense against quality degradation. But it also means there is no supported
way to run the pipeline AFK even when the operator *has* exercised that judgment up front.

## Decision
**1. One orchestrator.** `site-synth` becomes the single site-generation orchestrator, with an
**intake fork** it auto-detects and confirms:
- `mode: clone` — a URL / brand / existing kit → `brand-teardown` head.
- `mode: original` — a design brief / "make something distinctive" → `frontend-design` +
  `ui-ux-pro-max` → design-system head, with the 3-variant exploration step.

Both heads converge at `design-patterns` and share one spine, one report (`SITE-REPORT.md`), one
budget, one self-improvement loop, and one set of references. `studio` is **deprecated to a thin
redirect stub** that retains its distinctive triggers ("internal Framer", "make something original")
and routes into `site-synth` `mode: original` — no pipeline prose is duplicated in it.

**2. Front-loaded-judgment AFK mode.** Add a run-mode axis, orthogonal to the intake fork:
- `run: interactive` (**default**) — today's behavior: per-stage gates, the operator is in the loop
  at each fork (vibe, blueprint, variant, cost).
- `run: afk` — **concentrate all human judgment into one Alignment Gate up front**, then execute
  autonomously to a gated build. The gate resolves every fork the interactive path would ask about
  (intake mode, vibe, kit gaps, section blueprint, chosen variant/direction, budget authorization)
  via a `grill-me`-style pass, emits a **Build Contract** artifact, and requires **one explicit human
  approval**. After approval the pipeline runs build → craft loop → quality gates → report with no
  further prompts. Outward-facing publish (deploy) stays gated regardless — approval of the contract
  is not approval to publish.

**Guiding principle (why afk is a front-loaded gate, not a gateless run):** *human judgment before
AFK execution is the primary control that prevents degradation and maximizes quality output.* AFK
never means "no human" — it means the human decides **once, up front, with full context**, then the
agent executes without re-litigating. This is the same shape as `softdev-workflows` (align/grill →
approve PRD → AFK implement), which is the exemplar. The `brand-to-site` **burn-in mode** already
pre-resolves the standard forks via `grill-me`; `run: afk` generalizes that machinery into a
supported operating mode of the orchestrator.

This keeps every ADR-0002 invariant: the orchestrator is still glue (the gate is a `grill-me`
handoff, not new logic), forks are still surfaced to a human (just batched, not removed), and the
irreversible step (deploy) is still gated after the quality gate.

## Considered options
- **Two thin heads sharing a spine reference (keep both skills).** Rejected as the primary form:
  it still leaves two entry skills to keep in sync and two trigger surfaces claiming the same
  pipeline. Retained only as the *deprecation shim* — `studio` survives as a stub for trigger
  continuity, delegating the spine to `site-synth`.
- **A gateless autonomous mode.** Rejected: violates the guiding principle above and ADR-0002
  invariant 4. Removing the human from the loop is where quality degrades; the fix is to move the
  judgment earlier, not delete it.
- **Rename to a neutral `site` skill.** Deferred: `site-synth`'s description already spans "a URL
  or a brief," and a rename churns the index, memory, and Cowork marketplace. Broaden the
  description instead; revisit the name only if the `synth` framing proves misleading in use.

## Consequences
- Duplication collapses: one spine, one report, one loop. The offer-demo/deploy, critique, and gate
  descriptions are owned by `brand-to-site` and *pointed at*, not re-described (same medicine as the
  `curated-sources.md` source consolidation).
- `run: afk` gives a supported one-shot path **without** weakening the quality control — it raises
  the human decision to a single deliberate checkpoint. The known quality ceilings (one-pass craft
  cap, self-graded craft rubric, no external SOTA benchmark) are **unchanged by this ADR** and remain
  open follow-ups; afk does not paper over them.
- `studio` triggers still fire; the "internal Framer" surface is preserved via the stub.
- ADR-0002's `studio` bullet is amended: it is no longer a separate sibling but the `original` head
  of the unified `site-synth`.
- Trade-off accepted: a stub skill retained for trigger continuity is mild debt; revisit at the next
  skill-suite audit whether to retire the `studio` trigger surface entirely.

---
_Provenance: 2026-07-02 review of the site-generation skill suite — the two orchestrators were found
~80% duplicate (identical from `design-patterns` on), and the "preserve human judgment before AFK"
principle (operator's, citing `softdev-workflows`) reframed the autonomous-mode design from gateless
to front-loaded._
