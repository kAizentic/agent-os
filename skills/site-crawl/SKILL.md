---
id: site-crawl
name: site-crawl
provenance: authored
slug: site-crawl
description: Crawl an entire site or a bounded set of pages from ONE domain (deep / multi-page), not just a single URL. Use when you need breadth — many pages from one site: a site-wide brand-teardown, "find/read all the posts or product pages on this site", a section index, or feeding many pages of one domain into distillation. Best-first keyword scoring, hard page caps, domain-lock, robots-respect and rate-limiting by default. For a SINGLE page use defuddle / WebFetch; for web DISCOVERY across sites use web-research / Exa. Thin wrapper over the local crawl4ai venv.
version: 1.0.0
category: Research
status: active
hitl_gate: confirm
tags: [crawl, deep-crawl, multi-page, scraping, crawl4ai, markdown, fetch, breadth]
inputs:
  - a start URL (the domain to crawl) and optionally relevance keywords
  - bounds — max-pages (default 15), max-depth (default 2), delay, concurrency
outputs:
  - one fit_markdown file per crawled page in the out-dir
  - a manifest.json (url, file, score, depth, chars, success per page)
tools: [Bash, Read, Write]
triggers:
  - crawl this whole site
  - crawl all the pages on
  - read every page on this domain
  - site-wide teardown
  - deep crawl
dependencies: []
composes_with:
  - brand-teardown
  - blogwatcher
  - intel-scan
aliases:
  - deep crawl
  - whole-site crawl
  - multi-page fetch
owner: the operator
last_updated: 2026-07-14
---

# site-crawl

> The **breadth** primitive for the fetch stack: many pages from one domain, bounded
> and polite. Fills the gap the single-page path (`defuddle` / WebFetch / Exa) leaves.
> Greenlit + proven by the eval — see *eval crawl4ai*.

## Purpose
The single-page readers answer "read this URL." They can't answer "read the whole
site." site-crawl shells out to a local **crawl4ai** venv to run a **domain-locked,
best-first deep crawl** — scoring links by keyword relevance, capping pages hard, and
returning clean `fit_markdown` per page plus a manifest. ADR-0001-safe: the crawler
lives in an isolated venv and a script *in this skill*; nothing is injected into the
`~/.claude` runtime.

## When to use
- A **site-wide** ``brand-teardown`` — pull positioning/voice/content across many
  pages, not just the landing page.
- "Find / read all the posts (or product / pricing / about pages) on this site."
- A heavier ``blogwatcher`` / ``intel-scan`` tier for a source with **no clean
  RSS/Atom feed** — bounded crawl instead of hand-clipping.

## When NOT to use
- **One page** → ``defuddle`` / WebFetch (site-crawl spins a real browser; overkill
  for a single URL).
- **Discovery across the web** ("who else writes about X") → ``web-research`` / Exa.
  site-crawl crawls a domain you already chose; it does not search.
- A URL ending in `.md` → already markdown, use WebFetch.

## Prerequisite (one-time)
The dedicated crawl4ai venv must exist. See `references/setup.md`. Verified on this
machine 2026-07-14 (crawl4ai 0.9.1, Python 3.13, Playwright chromium, uv venv).

## Workflow
1. **Bound + confirm the crawl (HITL gate).** Decide `--max-pages` (default 15),
   `--max-depth` (default 2), and relevance `--keywords`. **Before crawling a domain
   you do NOT own, confirm the target + page cap with the user** — a deep crawl hits
   a third-party server harder than a single fetch (politeness / ToS; the eval's
   standing caveat). Own domain or an already-approved consumer flow → skip the ask.
2. **Run the wrapper** with the venv's python:
   ```bash
   "<venv>/Scripts/python.exe" scripts/site_crawl.py "https://example.com" \
       --keywords pricing product about --max-pages 15 --out-dir "<out>"
   ```
   Defaults are polite: domain-locked (`include_external=False`), `--delay 1.0s`,
   `--concurrency 2`, `robots.txt` respected. `--ignore-robots` is **only** for a
   domain you own.
3. **Read the manifest, not every file.** `manifest.json` lists pages by score; open
   the high-scoring `fit_markdown` files the task needs. Hand them to the consuming
   skill (distillation, ``brand-teardown``, a digest).
4. **Report** pages fetched / bounds used / where the output landed.

## Outputs
- `<out-dir>/<slug>.md` — one `fit_markdown` file per page (nav/boilerplate pruned).
- `<out-dir>/manifest.json` — `{target, domain, keywords, bounds, elapsed_s, pages[]}`
  with per-page `url · file · score · depth · chars · success`.

## Failure modes
- **crawl4ai venv missing / not set up** → follow `references/setup.md`; if it can't be
  created, fall back to ``defuddle`` per page for a handful of URLs.
- **Crawl wanders off-topic** → tighten `--keywords`, lower `--max-depth` to 1, or drop
  `--max-pages`. Best-first is only as good as the keywords.
- **Site blocks / rate-limits** → raise `--delay`, drop `--concurrency` to 1; never
  `--ignore-robots` on a site you don't own.
- **Thin `fit_markdown`** (over-pruned) → the raw markdown is still crawled; loosen the
  pruning threshold in the script if a page's real content got cut.

## Examples
See `examples/deep-crawl-docs-site.md` — a real 8-page bounded crawl with the
regression checks that keep this skill verifiable.

## Related skills
- `brand-teardown` — the site-wide consumer (breadth teardown).
- `blogwatcher` / `intel-scan` — heavier no-feed fetch tier.
- `defuddle` / `web-research` — the single-page / discovery paths this
  deliberately does **not** replace.
- Decision + `[verify]` provenance: *eval crawl4ai*.

## Cost Class
**Moderate** — SKILL.md + a runnable script (`scripts/site_crawl.py`) + one real-trace
example + setup reference. The script is required (a deep crawl is execution prose
cannot perform); it loads no reference files by default.
