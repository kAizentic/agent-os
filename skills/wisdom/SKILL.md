---
id: wisdom
name: wisdom
provenance: authored
slug: wisdom
description: Extract subject-matter expertise from transcripts (or any source material) and operationalize it as a Claude Code workflow architecture — analysis, a pipeline of vendored/authored skills, and high-level workflow docs. Use when the user wants to turn a talk, video transcript, interview, course, or expert's process into reusable skills and workflows.
version: 1.0.0
category: Analysis
status: active
hitl_gate: confirm
tags: [expertise, extraction, workflows, skills]
inputs:
  - a transcript or source material
outputs:
  - analysis + authored/vendored skills + workflow docs
tools: [Read, Write, Edit]
triggers:
  - wisdom
  - extract expertise
  - turn this talk into skills
  - operationalize an experts process
dependencies: [skill-builder]
composes_with: [skill-builder]
owner: the operator
last_updated: 2026-06-28
---

# Wisdom

Turn an expert's know-how into operational Claude Code assets. Given one or more transcript markdowns (or notes / docs), `/wisdom` produces: (1) an **analysis** of the methodology with optimization opportunities, (2) a **workflow architecture** — a pipeline mapped to skills, and (3) **high-level workflow docs** that wire it together. It **delegates** the authoring of each individual skill to the `skill-builder` skill rather than reimplementing that capability.

This is the meta-process behind the `softdev-workflows` skill — see [examples/](./examples/) for the worked reference run.

## Relationship to other skills

- **`skill-builder`** — `/wisdom` calls it to author each NEW skill. `/wisdom` does NOT write SKILL.md files itself; it decides *which* skills are needed and hands each spec to `skill-builder`.
- ~~`graphify`~~ — **removed 2026-07-28.** Was listed as an optional pre-pass for very large or
  tangled sources; graphify is parked (its graph indexes the code layer, not prose) so this was a
  capability claim it could not honour. Read long sources directly.

## Rules

**MUST:**
- Present the extracted scope + proposed architecture and get user confirmation **before** writing any files (mirror `skill-builder`'s checkpoint discipline).
- Web-search every named tool / skill / technique / pattern in the source, to ground claims and find existing implementations.
- Prefer **vendoring/adapting an existing maintained skill** over authoring a new one; surface the reuse-vs-build fork to the user.
- Delegate each new skill's authoring to `skill-builder`.
- Put invokable skills at top-level `~/.claude/skills/<name>/SKILL.md`; put orchestration docs/scripts in a single entry-point skill folder (e.g. `<domain>-workflows/`).
- Surface assumptions in the request that conflict with the user's stated goal, and propose resolutions.
- Declare a Cost Class in any skill produced.

**MUST NEVER:**
- Store a skill as a flat `.md` file (it won't be invokable) — always `<name>/SKILL.md`.
- Leave an orphan non-skill folder inside `skills/` — make it a skill or relocate it.
- Rebuild a maintained skill that can be vendored and pinned.
- Skip the web-research grounding step or the pre-write confirmation checkpoint.

## Process

### 1. Ingest
Read the full source material (don't sample). List the inputs back to the user.

### 2. Extract
Pull out, with transcript evidence:
- **Mental models** the expert reasons with (the "why").
- **The end-to-end process / pipeline** (the ordered "what").
- **Named tools, skills, techniques, frameworks, books** referenced.
- **Decision rules, gates, anti-patterns** ("never do X", "always do Y").

### 3. Research (grounding)
Web-search each named artifact. For each: does a maintained implementation already exist (e.g. a public skills repo)? Capture source URL + a pinnable version. This decides vendor-vs-build per piece.

### 4. Analyze
Write the methodology's strengths, then **improvement/optimization opportunities** (where the harness now does something natively, where a manual step should be a gate, where an unreleased dependency can be replaced with open primitives). Note assumption conflicts.

### 5. Architect
Map the process to a **staged pipeline**. For each stage decide: vendor an existing skill, author a new one, or capture as **non-skill infra** (scripts/docs — things a skill can't do, like running a sandboxed loop). Design a single **orchestrator skill** as the front door that routes between stages and holds the cross-cutting doctrine.

### 6. Confirm (checkpoint)
Present: inputs, extracted pipeline, the stage→skill map, vendor-vs-build decisions, optimization list, and any assumption conflicts. **Wait for approval / corrections before writing.**

### 7. Build
- **Vendor** the reuse skills (fetch verbatim, pin the source commit, record provenance centrally; keep them pristine for re-sync).
- **Delegate** each new skill to `skill-builder`.
- **Author** the orchestrator skill + high-level workflow docs (one file per stage, steps only) + any infra scripts, under the `<domain>-workflows/` skill folder.

### 8. Verify & record
Confirm every skill is a discoverable `<name>/SKILL.md`; confirm no orphan folders; confirm the orchestrator's stage→skill index references only skills that exist. Save the run's output folder reference under `examples/`.

## Cost Class

**High.** Reads large source material in full, runs multiple web searches, and spawns `skill-builder` once per authored skill. The payoff is amortized: a one-time extraction that produces durable, reusable operational assets.
