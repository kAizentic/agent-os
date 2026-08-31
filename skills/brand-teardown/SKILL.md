---
id: brand-teardown
name: brand-teardown
provenance: authored
slug: brand-teardown
description: Produce a structured competitive brand teardown from a single URL or domain — visual identity (logo, color palette with hex codes, typography), positioning and voice, and content/demand angles. Use this whenever the user wants to analyze, deconstruct, or "tear down" a brand, build a brand kit from a website, do competitor brand research, extract a company's colors/fonts/logo, or reverse-engineer a competitor's positioning and messaging. Trigger it even when the user just pastes a competitor URL and asks "what can we learn from this" or "break this brand down for me," and when they ask for a brand kit, brand brief, or competitive teardown, even if they don't say the word "teardown."
version: 1.0.0
category: Writing
status: active
hitl_gate: none
tags: [brand, teardown, competitive, brand-kit]
inputs:
  - a URL or domain
outputs:
  - a structured brand teardown + brand kit
tools: [Write, WebFetch, mcp__playwright, mcp__claude_ai_Ahrefs]
triggers:
  - tear down this brand
  - brand kit
  - competitive teardown
  - break this brand down
dependencies: []
composes_with: [design-patterns, site-harvest, apply-brand, apply-theme]
owner: the operator
last_updated: 2026-06-28
---

# Brand Teardown

Turn one URL into a PMM-ready brand brief. The deliverable has three layers, in increasing order of analytical value:

1. **Visual identity** (commodity — get it from an API, fall back to scraping): logo, color palette with hex codes, type stack.
2. **Positioning & voice** (your value-add — Claude reads the live site): value proposition, target buyer signals, tone of voice, recurring messaging themes.
3. **Content & demand angles** (evidence layer — Ahrefs + web search): keyword opportunities, content gaps, and format ideas, clearly separated from the visual analysis.

The guiding principle: **extraction is a solved commodity; interpretation is the deliverable.** Spend effort on layers 2 and 3. Always keep measured facts separate from inferred interpretation — competitive briefs get scrutinized, and a guess presented as a fact destroys trust.

## Workflow

### Step 0 — Resolve the target
Accept either a full URL or a bare domain. Normalize to both a domain (for the API) and a homepage URL (for live fetching). If the user named a specific page (a product page, a pricing page), keep it — that page often carries sharper positioning copy than the homepage.

### Step 1 — Visual identity via extraction cascade
Run `scripts/extract_brand.py <domain>`. It tries three tiers in order and stops at the first that yields a usable result, tagging every field with its source so confidence is auditable:

- **Tier 1 — Brandfetch API** (best for established brands; free tier ~50 calls/month). Requires `BRANDFETCH_API_KEY` in the environment. Returns logo SVG/PNG, palette, fonts, metadata. Skipped automatically if no key is set.
- **Tier 2 — Playwright computed styles** (best for thin-data or unlisted brands). Loads the rendered page in a headless browser and reads *computed* colors and font-families from actual elements, so you capture what's truly in use rather than what's merely declared. Ranks colors by pixel-weighted frequency.
- **Tier 3 — Static HTML/CSS parse** (last-resort fallback, no browser). Greps linked stylesheets and inline styles for hex/rgb/hsl values and `font-family` stacks; pulls the logo from `<link rel=icon>`, OG image, or a header `<img>`/SVG.

The script writes `brand_visual.json`. Read it. If the cascade fell through to Tier 3 or returned sparse data, say so plainly in the brief's evidence column rather than dressing up low-confidence values.

See `references/extraction.md` for setup, API key handling, and how to read the script's output and source tags.

### Step 2 — Positioning & voice (Claude reads the live site)
Fetch the homepage (and any page the user pointed at). Read the actual copy and derive, in your own words:
- **Value proposition**: the core promise, as the brand states it — then your one-line restatement of what they're *really* selling.
- **Target buyer signals**: who the copy is written for (role, sophistication, company size cues, jobs-to-be-done language).
- **Tone of voice**: 3–5 concrete descriptors with a short justifying quote or paraphrase each (e.g., "plainspoken — short declarative sentences, no jargon").
- **Messaging themes**: the 3–5 recurring claims or value pillars they keep returning to.

Distinguish what the brand *asserts* from what you *infer*. Label inferences as such.

### Step 3 — Content & demand angles (evidence layer)
This is the reframed "trend picker." Do NOT scrape TikTok/Instagram for "trends" — that data is secondhand, fragile, and ToS-sketchy. Instead build an evidence-backed opportunity view:
- If the **Ahrefs MCP** is connected, pull domain/keyword data for the target and its category: top organic keywords, content gaps, rising queries. This is harder evidence than social trend lists.
- Use **web search** for current social-format chatter in the category, and label it explicitly as low-confidence hypothesis, not validated demand.
- Synthesize into 3–5 concrete content angles a PMM could act on, each tagged with its evidence basis.

If Ahrefs is not connected, say so and proceed with web search only — and mark the whole layer lower-confidence.

### Step 4 — Emit both outputs from one source of truth
Build a single canonical object in memory (or write `brand_kit.json` first), then render the markdown brief *from that same object* so the two never drift. Run `scripts/render_brief.py brand_kit.json` to produce `brand_brief.md`, or render inline following the template below. Always produce BOTH the JSON and the markdown.

### Step 5 — Emit a reusable theme (automatic)
Every teardown also feeds the `apply-theme` library. Run:

```
python scripts/emit_theme.py brand_kit.json
```

This distills the visual layer (palette + typography) into a theme file named by the source website — e.g. `stripe-com.md` — and writes it into apply-theme's `themes/` (the vault source, which the skill compiler mirrors forward, plus the runtime copy if present). After this, the brand can be applied to any artifact via "use the `<website>` theme" or "make this look like `<brand>`". This step is idempotent — re-running a teardown regenerates that site's theme in place. Run it whenever you produced a `brand_kit.json`, even if the visual layer is thin (the theme file will note low-confidence values, same as the brief).

## Output: canonical JSON shape
Write `brand_kit.json` with this structure (omit fields you genuinely couldn't determine rather than inventing them):

```json
{
  "target": {"domain": "", "url": "", "analyzed_at": ""},
  "visual": {
    "logo": {"url": "", "format": "", "source": ""},
    "palette": [{"hex": "", "role": "primary|secondary|accent|neutral", "source": "", "confidence": "measured|inferred"}],
    "typography": [{"family": "", "usage": "heading|body|mono", "source": "", "confidence": "measured|inferred"}]
  },
  "positioning": {
    "value_prop_stated": "",
    "value_prop_restated": "",
    "target_buyer": "",
    "tone": [{"descriptor": "", "evidence": ""}],
    "messaging_themes": []
  },
  "content_angles": [{"angle": "", "evidence_basis": "ahrefs|web_search|inference", "confidence": "high|medium|low"}],
  "evidence_notes": ""
}
```

## Output: markdown brief template
ALWAYS use this structure so briefs are comparable across competitors:

```markdown
# Brand Teardown — [Brand] ([domain])
*Analyzed [date] · extraction tier: [Brandfetch | Playwright | static fallback]*

## Visual identity
| Element | Value | Source | Confidence |
|---|---|---|---|
[logo, palette hex codes, type stack — one row each]

## Positioning & voice
- **Stated value prop:** …
- **What they're really selling:** …  *(inferred)*
- **Target buyer:** …
- **Tone:** … *(with evidence)*
- **Messaging themes:** …

## Content & demand angles
| Angle | Evidence basis | Confidence |
|---|---|---|
[3–5 rows]

## Evidence gaps
[Plainly state what is measured vs. inferred, what the extraction missed, and what needs manual verification.]
```

The **Evidence gaps** section is mandatory and is the part generic brand tools omit. Never skip it.

## Notes on honesty
- If the brand isn't in Brandfetch's database and Playwright is unavailable, the visual layer will be thin. Report that — don't fabricate hex codes.
- Social "trends" are interpretation of secondhand signals. Treat every content angle as a hypothesis with a stated evidence basis, never as settled fact.
- Free-tier API terms may restrict commercial/client-facing use. Flag this if the user's context implies client deliverables.
