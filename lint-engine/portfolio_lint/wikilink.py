"""Wikilink extraction + resolution, generalized from wiki-lint.

The resolution rules encode three behaviours worth stating explicitly, because
all three were bug fixes:

  * Code is blanked before links are counted. ``like this`` inside backticks
    is a path reference Obsidian renders literally, not a link.
  * A SLASHED target is an explicit path and gets no basename fallback — so a
    broken `skills/index` can't be masked by some unrelated `index.md`
    elsewhere in the tree. Bare slugs keep the Obsidian-style basename lookup.
  * A target is tried as a LITERAL path before ".md" is appended, so non-.md
    artifacts (.html briefings, .pdf exports) resolve. See resolve_path().

Ported from wiki_lint.py's resolver, which is the behavioural authority until
cutover; tests/test_wikilink_nonmd.py pins the third rule both ways.
"""
from __future__ import annotations

import re
from pathlib import Path

WIKILINK = re.compile(r"\[\[([^\]]+?)\]\]")
FENCE = re.compile(r"```.*?```", re.DOTALL)
INLINE = re.compile(r"`[^`]*`")


def strip_code(text: str) -> str:
    """Blank out fenced blocks and inline spans so links inside code don't count."""
    return INLINE.sub(" ", FENCE.sub(" ", text))


def targets(text: str, *, skip_code: bool = True) -> list[str]:
    """Every wikilink target in a document, cleaned."""
    src = strip_code(text) if skip_code else text
    return [clean_target(m) for m in WIKILINK.findall(src)]


def clean_target(raw: str) -> str:
    """`alias` -> path ; drop #anchor ; strip embed '!'."""
    return raw.split("|", 1)[0].split("#", 1)[0].strip().lstrip("!").strip()


def build_basename_index(files: list[Path]) -> dict[str, list[Path]]:
    """Lowercased stem -> files, for Obsidian-style bare-slug resolution."""
    idx: dict[str, list[Path]] = {}
    for p in files:
        idx.setdefault(p.stem.lower(), []).append(p)
    return idx


def resolve_path(target: str, vault: Path, wiki: Path,
                 basenames: dict[str, list[Path]]) -> Path | None:
    """Resolve a wikilink target to a real file, or None if broken."""
    if not target:
        return wiki / "index.md"
    # Literal path FIRST. Non-.md vault artifacts are first-class wikilink targets: the
    # routines link their own generated briefings from log.md (*
    # 2026 07 22.html*), and the insights SOP mandates exactly that shape. Appending
    # ".md" unconditionally made every one of them read as broken. is_file() (not
    # exists()) so a directory can never satisfy a link to a page.
    for base in (wiki, vault):
        p = (base / target).resolve()
        if p.is_file():
            return p
    cand = target if target.endswith(".md") else target + ".md"
    # relative to knowledge (handles areas/x, ../private/x, concepts/y)
    for base in (wiki, vault):
        p = (base / cand).resolve()
        if p.exists():
            return p
    # A slashed target is an explicit path — no basename fallback (a broken
    # path like skills/index must not be masked by some other index.md).
    if "/" in target or "\\" in target:
        return None
    hits = basenames.get(target.lower())
    return hits[0] if hits else None


def resolves(target: str, vault: Path, wiki: Path,
             basenames: dict[str, list[Path]]) -> bool:
    return resolve_path(target, vault, wiki, basenames) is not None
