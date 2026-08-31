#!/usr/bin/env python
"""site-crawl — thin Path-1 wrapper over crawl4ai for bounded, polite, whole-site crawls.

Runs a domain-locked best-first deep crawl and writes one fit_markdown file per page
plus a manifest.json. ADR-0001-safe: this is a standalone script the vault skill shells
out to; it lives in the skill, not in ~/.claude runtime, and touches nothing but --out-dir.

Requires the dedicated crawl4ai venv (see ../references/setup.md). Invoke with that
venv's python, e.g.:
  <venv>/Scripts/python.exe site_crawl.py https://example.com \
      --keywords pricing product about --max-pages 15 --out-dir ./out
"""
import argparse, asyncio, json, re, sys, time, inspect
from pathlib import Path
from urllib.parse import urlparse

from crawl4ai import AsyncWebCrawler, CrawlerRunConfig, BrowserConfig, CacheMode
from crawl4ai.deep_crawling import BestFirstCrawlingStrategy
from crawl4ai.deep_crawling.scorers import KeywordRelevanceScorer
from crawl4ai.deep_crawling.filters import FilterChain, DomainFilter, ContentTypeFilter
from crawl4ai.content_filter_strategy import PruningContentFilter
from crawl4ai.markdown_generation_strategy import DefaultMarkdownGenerator


def slug(url: str) -> str:
    p = urlparse(url)
    s = (p.path or "/").strip("/").replace("/", "_") or "index"
    return re.sub(r"[^A-Za-z0-9_.-]", "-", s)[:80]


async def crawl(args) -> dict:
    domain = urlparse(args.url).netloc
    scorer = KeywordRelevanceScorer(keywords=args.keywords, weight=0.8) if args.keywords else None
    strategy = BestFirstCrawlingStrategy(
        max_depth=args.max_depth,
        max_pages=args.max_pages,
        include_external=False,                       # domain-locked by default
        url_scorer=scorer,
        filter_chain=FilterChain([
            DomainFilter(allowed_domains=[domain]),
            ContentTypeFilter(allowed_types=["text/html"]),
        ]),
    )
    md_gen = DefaultMarkdownGenerator(
        content_filter=PruningContentFilter(threshold=0.48, threshold_type="fixed")
    )
    cfg_kwargs = dict(
        deep_crawl_strategy=strategy,
        markdown_generator=md_gen,
        cache_mode=CacheMode.BYPASS,
        stream=False,
        mean_delay=args.delay,                        # politeness: seconds between requests
        semaphore_count=args.concurrency,             # low concurrency by default
        verbose=False,
    )
    # robots respect if this crawl4ai version supports it
    if not args.ignore_robots and "check_robots_txt" in inspect.signature(CrawlerRunConfig.__init__).parameters:
        cfg_kwargs["check_robots_txt"] = True
    config = CrawlerRunConfig(**cfg_kwargs)

    out = Path(args.out_dir)
    out.mkdir(parents=True, exist_ok=True)
    t0 = time.time()
    async with AsyncWebCrawler(config=BrowserConfig(headless=True, verbose=False)) as crawler:
        results = await crawler.arun(args.url, config=config)
    dt = time.time() - t0

    manifest = {"target": args.url, "domain": domain, "keywords": args.keywords,
                "max_pages": args.max_pages, "max_depth": args.max_depth,
                "elapsed_s": round(dt, 1), "pages": []}
    for r in results:
        meta = r.metadata or {}
        md = (r.markdown.fit_markdown or r.markdown.raw_markdown or "") if r.markdown else ""
        fname = f"{slug(r.url)}.md"
        (out / fname).write_text(md, encoding="utf-8")
        manifest["pages"].append({
            "url": r.url, "file": fname, "success": bool(r.success),
            "score": round(meta.get("score", 0) or 0, 3), "depth": meta.get("depth"),
            "chars": len(md),
        })
    (out / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    return manifest


def main():
    ap = argparse.ArgumentParser(description="Bounded, polite, domain-locked deep crawl via crawl4ai.")
    ap.add_argument("url")
    ap.add_argument("--keywords", nargs="*", default=[], help="best-first relevance keywords")
    ap.add_argument("--max-pages", type=int, default=15, dest="max_pages")
    ap.add_argument("--max-depth", type=int, default=2, dest="max_depth")
    ap.add_argument("--delay", type=float, default=1.0, help="seconds between requests (politeness)")
    ap.add_argument("--concurrency", type=int, default=2, dest="concurrency")
    ap.add_argument("--out-dir", default="./site-crawl-out", dest="out_dir")
    ap.add_argument("--ignore-robots", action="store_true", dest="ignore_robots",
                    help="ONLY for a domain you own; default respects robots.txt")
    args = ap.parse_args()
    m = asyncio.run(crawl(args))
    ok = sum(1 for p in m["pages"] if p["success"])
    print(f"site-crawl: {ok}/{len(m['pages'])} pages OK from {m['domain']} "
          f"in {m['elapsed_s']}s -> {args.out_dir}/ (manifest.json)")
    for p in sorted(m["pages"], key=lambda x: -x["score"]):
        print(f"  score={p['score']:.3f} d{p['depth']} {p['chars']:>6}b  {p['url']}")
    if ok == 0:
        sys.exit(1)


if __name__ == "__main__":
    main()
