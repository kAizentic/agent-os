# Decision note template

One file per resolved decision: `output/decision-scout/<slug>-<date>/decision-<n>.md`.
Keep it tight — it's a decision record, not a report.

```markdown
---
decision: <the selection question, e.g. "video-generation backend for the faceless loop">
stakes: build-on | swappable
assumed_pick: <what was assumed going in, or "none">
confidence_before: high | low
confidence_after: high | low
verdict: adopt | park | wire-later
chosen: <the option landed on, or "none — parked">
date: <YYYY-MM-DD>
---

## Decisive question
<the one thing that actually decides it — fit, pricing/limits, API surface, lock-in, hazard.>

## Options surveyed
| Option | Fit | Price / limits | API / integration | Lock-in | Notes |
|---|---|---|---|---|---|
| <A> | | | | | |
| <B> | | | | | |

## Capability vs installer
- **Capability wanted:** <the underlying capability, tool-agnostic>
- **Adopt:** <the capability / the specific tool> · **Do NOT run:** <any installer/doctor — ADR-0001>

## Verdict
<one paragraph: the pick + why it wins the decisive question, or why it's parked/wire-later.>

## Honest gaps
<anything unresolved — a price behind a sales call, an unverified claim, a source that didn't load.>
```

## Confidence rubric (from *confidence flagged capture*)
- **high** — you already run it well, OR corroborated by a *second independent origin* (different
  domain, same claim/number), OR a primary/authoritative source (the vendor's own docs, a
  standards page). Pass through, no research spend.
- **low** — a single unconfirmed claim, an *unsurveyed* recommendation, snippet-only/gated/undated,
  or unknown pricing/limits. Escalate to `web-research`, budgeted to stakes.
