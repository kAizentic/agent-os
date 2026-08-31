# Extraction layer reference

Read this when running Step 1 (visual identity) and when interpreting `extract_brand.py` output.

## Setup

```bash
pip install requests
# Optional but recommended for Tier 2 (thin-data / unlisted brands):
pip install playwright && playwright install chromium
```

## API key (Tier 1, Brandfetch)

Set `BRANDFETCH_API_KEY` in the environment before running. The free tier is roughly
50 brand lookups/month and is the fastest path for established brands. Without the key,
the script silently skips Tier 1 and starts at Playwright — that's fine, just lower
coverage for well-known brands.

Free-tier terms have historically restricted use to "personal use and testing." If the
teardown feeds a client-facing or commercial deliverable, verify current terms before
relying on it, and flag the caveat to the user.

## The cascade and what each tier means for confidence

| Tier | Source tag | Confidence | Best for |
|---|---|---|---|
| 1 | `brandfetch` | measured | Established brands in the database |
| 2 | `playwright` | measured | Anything with a live site; reads *rendered* styles |
| 3 | `static-html` | inferred | Last resort; declared (not necessarily used) values |

`extract_brand.py` writes `brand_visual.json` containing `palette`, `typography`,
`logo`, the `extraction_tier` reached, and a `cascade_trail` showing why earlier tiers
were skipped or failed. Always surface the tier in the brief header and carry each
field's `source`/`confidence` into the Visual identity table.

## Alternatives if Brandfetch coverage is poor

- **Brand.dev** — real-time extraction (logos, colors, fonts, metadata), no static DB.
- **Apify "Fetch Branding" actor** — favicon, logo, primary/secondary colors, fonts,
  OG/Twitter metadata, social links as JSON.
- **Context.dev** — design-system extraction (color roles, type scale) on a credit model.

Swapping providers means editing only `try_brandfetch()` in `extract_brand.py`; the
rest of the cascade and the renderer are provider-agnostic.

## Honesty rules

- If `extraction_tier` is `static-html` or `none`, the visual layer is low-confidence.
  Say so in the brief's Evidence gaps section. Do not fabricate hex codes.
- Tier 3 colors are ranked by raw frequency in CSS, which over-counts utility colors
  (borders, shadows). Treat the role assignments as guesses, not brand decisions.
