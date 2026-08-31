# 0018 — The chassis is one module, not six

- Status: accepted
- Date: 2026-08-21
- Scope: `agent-os/lint-engine/` and the five standing-stock reviews.
- Supersedes the framing in `lint-engine/README.md` ("five instances share a chassis"),
  corrected in the same change.

## Context

`portfolio_lint` was factored out of working copies after the fifth standing-stock review existed —
correct sequencing, per the *generalize after the fifth instance, not by guessing the abstraction up
front* note. Its README describes six modules (`fs`, `frontmatter`, `wikilink`, `finding`, `ack`,
`report`, 514 lines) shared by five instances.

An architecture review on 2026-08-21 measured that description against the tree. Three claims in it
do not survive.

### 1. Three of the five instances cannot import it

The chassis is Python. The instances are not all Python:

| Instance | Implementation | Can import the chassis? |
|---|---|---|
| `wiki-lint` | `wiki_lint.py`, 650 lines | yes |
| `skill-portfolio-review` | `portfolio_check.py`, 554 lines | yes |
| `routine-health` | `routine-health.ps1`, 768 lines | **no — PowerShell** |
| `design-system-review` | `design-system-lint.mjs`, 508 lines | **no — JavaScript** |
| `feed-synthesis` | *no deterministic check exists* | **no — no code** |

The reachable ceiling is two callers, and it is a property of the language split, not of adoption
effort. No amount of widening the chassis changes it.

### 2. The duplication it was built to remove is 6 lines

The stated purpose is duplication reduction (confirmed 2026-08-21). Under that purpose, volume is the
right metric. Measured across the only two instances that could ever import it:

| Surface | Status |
|---|---|
| `read` | duplicated, 6 lines each, identical |
| `frontmatter` (as `frontmatter` / `split_fm`+`parse_fm`) | duplicated, ~45 lines total, **and the two implementations disagree** |
| `main` | same name, 366 vs 226 lines of *different* checks — not duplication |
| `all_md`, `strip_code`, `resolve_path`, `clean_target`, `rel`, `is_quarantined`, `days_since` | **`wiki_lint` only — one caller** |

104 lines of chassis serve exactly one adapter. One adapter is a hypothetical seam; two are a real
one. Absorbing ~200 lines into 514 is **net negative on the goal the chassis exists to serve.**

### 3. The language-agnostic seam already exists, and is live

`vault_health.py` already aggregates checks across process boundaries:

```python
def run_json(script, vault):
    out = subprocess.run([sys.executable, script, "--vault", vault, "--json"], ...)
    return json.loads(out.stdout or "{}")
wiki = run_json("wiki_lint.py", vault)
coup = run_json("page_skill_coupling_advisory.py", vault)
```

Two adapters, in production, importing nothing. **That is the real seam**, and it is reachable by
PowerShell and JavaScript instances at zero architectural cost — every check script already accepts
`--json`. `portfolio_lint.report` and `finding` have zero callers, and the contract works without
them.

## Decision

1. **`portfolio_lint.frontmatter` is the chassis.** It is the only surface where the same concept is
   implemented twice *and* the two implementations diverge — the divergence being the actual harm
   duplication causes, and the source of the two measured live defects (below). `wiki_lint.py` and
   `portfolio_check.py` both migrate onto it.
2. **`fs`, `wikilink`, `finding`, `ack`, `report` retire.** One caller or zero. Their logic stays in
   `wiki_lint.py`, where it already works and is already the exclusive user.
3. **The instance contract is the JSON emitted under `--json`, not a Python import.** Any language can
   satisfy it. This is a description of what already happens, promoted to a rule.
4. **Full adoption (all six modules, both instances) is rejected** and should not be re-proposed
   without new measurement. It is the option the README implies and the numbers contradict.

## Consequences

- The two live defects fixed are exactly two: *clock agnostic animation rig* and
  *yt faceless niches 2025 2026*, where `source:` is a block list, the naive parser returns
  `''`, and `wiki_lint`'s external-anchor check therefore reads a present field as missing.
- **The 417 "IMPROVED" cases in the differential test are not a benefit.** 414 are `tags` and 216
  `keywords` — fields no live check reads. Recorded here because the raw count is persuasive and
  wrong, and the next reader will find it before they find this line.
- **A previously-identified defect dissolves rather than being fixed.** `portfolio_lint.fs.all_md` is
  a bare `rglob("*.md")` and lacks the `GENERATED_DIRS = (".cache", "node_modules", ".git")` exclusion
  that `wiki_lint.all_md` carries — a 436-vs-248-file gap, 43% corpus inflation, on a corpus feeding
  universally-quantified checks. Under decision 2 there is no second walker to keep in sync, so the
  exclusion stays where it already works. **If `fs` is ever revived, this must be ported first** —
  `wiki_lint`'s own comment measured the harm (25 blocking findings that were really 7 defects plus 18
  snapshot echoes) and its docstring flags the `empty-set-passes-every-check` exposure.
- The differential test (`tests/test_equivalence.py`) currently exits 1 on a single regression, on a
  file inside `knowledge/.cache/`. That verdict is an artefact of the missing exclusion above, not
  evidence against the parser: the "lost keys" are prose bullets the *legacy* parser hallucinated as
  frontmatter. Once the test's corpus is standing stock only, it should exit 0 — **and that should be
  confirmed, not assumed**, before decision 1 is called done.
- `feed-synthesis` is listed as an instance of a deterministic-check family while having no
  deterministic check. Left open, named here so it stops reading as an oversight.

## Alternatives rejected

- **Full adoption.** Rejected on measurement — see decision 4.
- **Contract-only (nothing imports the chassis; fix the two defects directly in `wiki_lint.py`).**
  Close call, and defensible. Rejected because the two parsers would remain free to re-diverge, which
  is the failure mode that produced the defects in the first place.
- **Delete `portfolio_lint` entirely.** Rejected for the same reason: it would leave two divergent
  frontmatter parsers with nothing holding them together.
- **Port the chassis to PowerShell and JavaScript.** Not seriously considered. It would triple the
  surface to eliminate 6 lines of duplication, and the JSON contract already solves the problem the
  port would be attempting.
