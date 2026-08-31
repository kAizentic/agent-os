---
id: web-research
name: Web Research
provenance: authored
slug: web-research
description: Run a disciplined web research loop on a question or topic using Exa neural search (semantic search, find-similar, and clean content extraction), then synthesize a cited answer. Use when the user says "research X", "what's the latest on X", "find sources on X", "find things similar to this page/paper", "do a literature scan", "competitor watch", or wants a sourced briefing rather than a single web lookup. Prefers Exa for discovery; falls back to WebSearch/WebFetch if Exa is not connected.
version: 1.0.0
category: Research
status: active
hitl_gate: none
tags: [research, web, exa, semantic-search, synthesis, sources]
inputs:
  - a research question or topic, optionally a seed URL/paper to "find similar" from
  - optional scope (recency, domains, depth)
outputs:
  - a cited synthesis (claims → sources), with a ranked source list
  - optional distilled note handed to capture for the Second Brain inbox
tools: [WebSearch, WebFetch, mcp__exa, mcp__claude_ai_Ahrefs]
triggers:
  - research this
  - what's the latest on
  - find sources on
  - find similar to this
  - literature scan
  - competitor watch
dependencies: []
composes_with:
  - capture
  - apply-insights
  - site-crawl
  - defuddle
aliases:
  - literature scan
  - deep research
owner: the operator
last_updated: 2026-06-27
---

# Web Research

> Turn a question into a *sourced* briefing — discovery with Exa's semantic search,
> synthesis with citations. Every claim traces to a link.

## Purpose
A single web lookup answers "what's the top result." Real research needs **discovery**
(semantic search + find-similar to surface things keywords miss), **breadth** (multiple
independent sources), and **synthesis** (claims tied to citations). This skill runs that
loop and hands a clean result back — optionally into the Second Brain.

## When to use
- "Research X", "what's the latest on X", "find sources on X".
- "Find things similar to this page/paper" (seed-based discovery).
- A literature scan or competitor watch where you want breadth + citations.

## When NOT to use
- A single known-URL fetch → just use `WebFetch`.
- Library/framework/API docs → use `context7` (it's purpose-built for that).
- SEO/traffic/backlink data → use the **Ahrefs** tools.
- Pulling the active project's own knowledge → that's ``apply-insights``.

## Inputs
- A research question or topic. Optionally a **seed URL/paper** for find-similar,
  and scope hints (recency window, preferred/avoided domains, how deep).

## Outputs
- A **cited synthesis**: each claim followed by its source link(s), then a ranked
  source list with one-line "why it matters" notes.
- Optionally, a distilled note routed to ``capture`` for the vault inbox.

## Required context
- **Exa MCP connector** (preferred), configured as the `exa` server in
  `.mcp.json` (remote HTTP, OAuth — browser sign-in on first use, no API key).
  Tools surface as `mcp__exa__*`. The exact set the remote server exposes can
  change; common ones include `web_search_exa`, `company_research_exa`,
  `crawling_exa`, and the `deep_researcher_start`/`deep_researcher_check` pair.
  Use whatever `mcp__exa__*` tools are actually present this session; update this
  skill's `tools:` list if the real names differ.
- **Graceful fallback:** if no Exa tool is available this session, run the same
  loop with `WebSearch` + `WebFetch` and say so in the output (discovery quality
  is lower without semantic search).

## Workflow
1. **Frame.** Restate the question; derive 3–6 sub-queries covering its facets.
   Note scope (recency, domains, depth).
2. **Discover (Exa first).** For each sub-query, `web_search_exa`. If a seed
   URL/paper was given, also `find_similar` on it. Collect candidate URLs;
   dedupe; drop obvious junk/SEO-spam.
3. **Extract.** `get_contents` (or `WebFetch`) on the top candidates. Pull the
   load-bearing passages, not whole pages.
4. **Cross-check.** Prefer claims corroborated by ≥2 independent sources. Flag
   contested or single-source claims explicitly.
5. **Synthesize.** Write the answer as **claim → citation(s)**. Lead with the
   direct answer, then supporting detail. End with a ranked source list (each with
   a one-line "why it matters").
6. **Hand off (optional).** If the user wants it kept, pass a distilled note to
   ``capture`` for the inbox — do not write vault pages directly from here.

## Examples
See `examples/research-brief.md` for the output shape (claim→source synthesis +
ranked source list).

## Failure modes
- **No Exa connected** → silently degrading to weak keyword search. Guard: detect
  Exa absence up front and state the fallback in the output.
- **Echo chamber** → many results citing one origin. Guard: trace to the primary
  source; count distinct origins, not distinct URLs.
- **Stale results** when recency matters. Guard: apply a recency filter and
  date-stamp each source.
- **Tool-name drift** → `mcp__…Exa…__*` names differ by install and break the
  `tools:` list. Guard: use whatever Exa tools are actually present this session.

## Optimization opportunities
- Cache extracted contents per URL within a session to avoid re-fetching.
- Add a `research_paper_search` branch for academic topics; `competitor_finder`
  for market scans.

## Dependencies
- None (skill-level). Requires the Exa MCP connector for full quality; otherwise
  falls back to built-in web tools.

## Related skills
- `capture` — persist a distilled research note to the Second Brain inbox.
- `apply-insights` — bring vault knowledge to bear on the open project (the
  inward counterpart to this outward-facing skill).
