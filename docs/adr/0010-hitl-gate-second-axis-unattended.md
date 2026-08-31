# 0010 — `hitl_gate` gets a second axis: `unattended`

- Status: accepted
- Date: 2026-07-28

## Context

`hitl_gate` is a single-valued frontmatter key (`none | confirm | grill | pipeline`) with exactly one
consumer: `skill-portfolio-review/scripts/portfolio_check.py`, which validates membership in that set
and flags *consequential-no-gate* (body uses `delete|publish|deploy|push|commit|…` but the gate is
`none`/missing).

A usage analysis on 2026-07-28 (200 invocations, 2026-07-13 → 07-28, `telemetry/skill-runs.jsonl`)
measured how the portfolio actually runs. Classifying each run by whether it anchored to a scheduled
task's trigger time, then propagating that across the session:

- **58.5% of invocations are unattended** (117 of 200) — ~66% once the three routines with no
  `SKILL.md` are counted (Job Autopilot, Routine Health, Skills-to-Cowork; invisible to the collector
  because the tasks call scripts, not skills).
- The top 7 workflows are **84% of all runs**, and six of the seven are scheduled.
- **43% of all unattended execution is skills that declare a human gate.** `distill`
  (`hitl_gate: confirm`, 35 unattended runs) and `project-digest` (`confirm`, 15) run under
  `bypassPermissions` on a timer. No human is ever asked.

The gate is not wrong — it is **under-specified**. `confirm` is a true and useful statement about
`distill` invoked ad hoc; it is a fiction about the same skill at 22:30. One key was being
asked to describe two different execution contexts, so it necessarily lied about one of them.

This is the same failure shape as *fail closed guard silent degradation*: a gate that is
structurally bypassed still *reads* as present. Nothing in the system could tell the difference,
because nothing recorded that scheduled execution was an intended mode rather than an escape.

## Decision

Keep `hitl_gate` as the **ad hoc** axis — unchanged semantics, no rewrite of the ~70 skills that only
ever run interactively. Add a second, optional key describing the **scheduled** axis:

```yaml
hitl_gate: confirm       # governs ad hoc invocation
unattended: restricted   # governs scheduled invocation
unattended_note: "Scheduled runs commit their own distillations; ad hoc runs never commit unasked."
```

`unattended` values:

| Value | Meaning |
|---|---|
| *(absent)* | **Interactive-only.** No scheduled surface exists. The default; means "this was never considered for a timer," not "this is forbidden." |
| `allowed` | Runs on a timer with identical behavior. The `hitl_gate` is waived because there is no human in the loop and none is needed. |
| `restricted` | Runs on a timer, but a named consequential sub-step is **withheld** from the scheduled path. Requires `unattended_note` naming what is withheld. |
| `forbidden` | Must never be scheduled. The `hitl_gate` is not waivable — the human *is* the control. |

The two axes are independent. `hitl_gate: grill` + `unattended: restricted` is coherent and correct
for `skill-pipeline-sync`: a human should be grilled before a hand-run *authoring* pass, and the
compile half is safe to run on a timer, and the `cowork --push` half is not.

## Why `restricted` rather than a boolean

Three live cases have genuinely different scheduled behavior, and collapsing them into
`allowed` would re-create the same lie one level down:

- **`distill`** — scheduled sweeps commit their own distillations; interactive sessions
  commit only when the operator asks (project `CLAUDE.md`, Filing rules).
- **`skill-pipeline-sync`** — `compile` is local and idempotent; `cowork --push` is a git commit to a
  remote. The timer gets the first, never the second.
- **`intent-scout`** — the scheduled run quarantines findings; graduation to `system-trajectory.md`
  is explicitly human-gated and cannot happen unattended.

## Consequences

`portfolio_check.py` gains three checks, one of which is the reason this ADR exists:

1. `unattended_invalid` — value outside the set.
2. `unattended_note_missing` — `restricted` without a note naming what is withheld.
3. **`gate_fiction`** — cross-references `telemetry/skill-runs.jsonl`: a skill whose `hitl_gate` is
   `confirm`/`grill`, that is *observed running unattended*, and that carries **no** `unattended` key.
   That is precisely the `distill` / `project-digest` finding, now machine-detectable
   instead of requiring someone to notice.
4. `forbidden_but_scheduled` — declares `forbidden` yet telemetry shows unattended runs. Hard error;
   either the declaration or the schedule is wrong.

Check 3 is a **contradiction** check in the sense of ADR 0009 — it can prove a declaration false
(telemetry shows the runs) but it can never confer correctness. A skill with no observed unattended
runs in the window is unclassified, not clean: weekly and monthly routines are under-sampled by a
~15-day retention, so silence is absence of evidence. The check therefore only ever *contradicts*.

The compiler is permissive about unknown frontmatter keys (`validate()` checks a fixed list and
ignores the rest), so adding `unattended` requires no compiler change and cannot break a build.

## Related

- ADR 0009 — a machine check can contradict, never confer.
- *fail closed guard silent degradation* — a bypassed gate still reads as present.
- *unattended routine orchestration* — the governance layer above scheduled routines.
