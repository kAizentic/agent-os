#!/usr/bin/env python3
"""
Regression fixtures for portfolio_lint.wikilink resolution against NON-.md artifacts.

WHY THIS SUITE EXISTS (the failure it pins):
The engine's resolve_path() appended ".md" to every target that did not already end in
it, so *2026 07 22.html* was looked up as "...html.md" and read
as broken even though the file was sitting right there. Those links are not a mistake —
the routines link their own generated briefings from log.md, and the insights SOP
mandates exactly that shape.

wiki_lint.py had already been fixed for this (it carries its own subprocess-level
fixture, tests/test_nonmd_link_targets.py, written after the bug blocked the nightly
sweep's `distill:` commit on 14 consecutive runs). The engine was factored BEFORE that
fix and never received it, so the port silently reintroduced a bug the vault had already
paid for. That is the real lesson here: an equivalence proof is a point-in-time
measurement over a growing corpus — this bug stayed invisible until log.md happened to
gain .html links after the 2026-07-20 "0 regressions" run.

The silent branch is the one that matters. A resolver that accepts everything also has
zero broken links (*fail closed guard silent degradation*), so every assertion
below is stated BOTH ways: the real artifacts must resolve AND the genuinely-missing
targets must still fail.

Run:  py test_wikilink_nonmd.py     (exit 0 = pass)
"""
from __future__ import annotations

import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))

from portfolio_lint import wikilink as wl  # noqa: E402


def build(root: Path) -> None:
    wiki = root / "knowledge"
    (wiki / "concepts").mkdir(parents=True)
    out = root / "output"
    (out / "ai-pulse").mkdir(parents=True)
    (out / "intel").mkdir(parents=True)
    (out / "reports").mkdir(parents=True)
    (out / "ai-pulse" / "2026-07-22.html").write_text("<h1>pulse</h1>", encoding="utf-8")
    (out / "intel" / "2026-07-26.html").write_text("<h1>intel</h1>", encoding="utf-8")
    (out / "reports" / "summary.pdf").write_bytes(b"%PDF-1.4\n")
    (wiki / "concepts" / "target.md").write_text("# Target\n", encoding="utf-8")
    (wiki / "index.md").write_text("# Index\n", encoding="utf-8")


# (target, must_resolve, what a wrong answer would mean)
CASES = [
    ("../output/ai-pulse/2026-07-22.html", True,
     "an existing .html briefing read as broken — the sweep-blocking bug is back"),
    ("../output/reports/summary.pdf", True,
     "an existing .pdf artifact read as broken — the fix is extension-specific, not general"),
    ("concepts/target", True,
     "an ordinary page link broke — .md resolution was lost by the literal-path branch"),
    ("target", True,
     "a bare slug stopped resolving — Obsidian-style basename fallback was lost"),
    ("../output/ai-pulse/2099-01-01.html", False,
     "a missing artifact resolved — the resolver now accepts everything and can't discriminate"),
    ("../output/intel/2026-07-26", False,
     "an alias-only extension resolved — the fix is masking real target drift"),
    ("../output/ai-pulse", False,
     "a DIRECTORY satisfied a wikilink — resolver used exists() instead of is_file()"),
    ("concepts/nonexistent", False,
     "a broken slashed path resolved — it was masked by the basename fallback"),
]


def main() -> int:
    failures = []
    with tempfile.TemporaryDirectory() as td:
        root = Path(td)
        build(root)
        vault, wiki = root, root / "knowledge"
        basenames = wl.build_basename_index([p for p in wiki.rglob("*.md") if p.is_file()])

        for target, want, why in CASES:
            got = wl.resolves(target, vault, wiki, basenames)
            if got != want:
                failures.append(f"`{target}` resolves={got}, expected {want} — {why}")

        # The alias must be stripped before resolution, not resolved verbatim.
        cleaned = wl.clean_target("../output/ai-pulse/2026-07-22.html|the briefing")
        if cleaned != "../output/ai-pulse/2026-07-22.html":
            failures.append(f"clean_target kept the alias: {cleaned!r}")

    for f in failures:
        print("FAIL:", f)
    if failures:
        return 1
    print("PASS: .html/.pdf artifacts resolve; missing targets, alias-only extensions, "
          "directories and broken slashed paths all still fire")
    return 0


if __name__ == "__main__":
    sys.exit(main())
