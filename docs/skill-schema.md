# Skill schema

Every skill in the source tree is a directory containing a `SKILL.md` whose YAML frontmatter
conforms to the contract below. The compiler (`compiler/compile-skills.mjs`) validates against
this contract and refuses to publish a skill that violates it — the schema is enforced by the
build, not by convention.

Field frequencies below are measured across the full 83-skill source tree, not the 8-skill
sample published here.

## Required

| Field | Count | Purpose |
|---|---|---|
| `name` | 83/83 | Human-readable skill name. |
| `description` | 83/83 | Trigger surface. This is the only field the model sees when deciding whether a skill applies, so it carries the trigger phrases, not a summary. |
| `provenance` | 83/83 | `authored` or `vendored:<owner>/<repo>` / `fork:<owner>/<repo>`. Drives license handling and what may be republished. |
| `hitl_gate` | 83/83 | Human-in-the-loop gate. Declares which actions in the skill require explicit human approval. See [ADR-0010](adr/0010-hitl-gate-second-axis-unattended.md). |

## Composition

| Field | Count | Purpose |
|---|---|---|
| `composes_with` | 68/83 | Skills this one hands off to or receives from. The edges of the skill graph. |
| `dependencies` | 58/83 | Skills or engines this one requires. |
| `supersedes` | 4/83 | Retired skill this one replaces. |
| `tools` | 62/83 | Declared tool/MCP surface. Compiles into the resource map (`compiler/build-resource-map.mjs`). |

## Routing

| Field | Count | Purpose |
|---|---|---|
| `triggers` | 61/83 | Explicit invocation phrases. |
| `inputs` / `outputs` | 61/83 | Declared contract, used to detect lossy handoffs between composed skills. |
| `aliases` | 19/83 | Alternate names. |
| `category`, `tags`, `slug`, `id` | 61–63/83 | Indexing. |

## Lifecycle

| Field | Count | Purpose |
|---|---|---|
| `status` | 67/83 | `active`, `draft`, `retired`. |
| `version`, `last_updated`, `owner` | 60–66/83 | Change tracking. |
| `unattended` | 11/83 | Marks a skill safe to run on a schedule with no human present. The second axis to `hitl_gate` — see [ADR-0010](adr/0010-hitl-gate-second-axis-unattended.md). |
| `unattended_note` | 5/83 | Why, when the answer isn't obvious. |
| `license` | 15/83 | Set on vendored skills carrying upstream terms. |

## The two-axis safety model

`hitl_gate` and `unattended` are deliberately separate axes rather than one flag, because they
answer different questions:

- `hitl_gate` — *does this action need a human to approve it?*
- `unattended` — *can this skill run with no human present at all?*

A skill can require a gate and still be schedulable (it stops and waits). A skill can be
gate-free and still unsafe to schedule (it needs judgment the schedule can't supply). Collapsing
them into one flag loses that distinction; the reasoning is in
[ADR-0010](adr/0010-hitl-gate-second-axis-unattended.md).
