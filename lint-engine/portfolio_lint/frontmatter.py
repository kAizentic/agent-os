"""One frontmatter parser for every standing-stock review.

The two live instances had DIFFERENT parsers of unequal strength:

  * skill-portfolio-review/portfolio_check.py — handles inline `[a, b]` lists,
    block `- ` lists, `#` comments, and quote stripping.
  * wiki-lint/wiki_lint.py — splits naively on the first ':' and keeps the raw
    string. A block-list `tags:` parses to the empty string, and a value
    containing ': ' is truncated.

Both feed *schema* checks, so the weaker parser means vault pages were being
schema-checked more loosely than skills were. This module adopts the hardened
behaviour for everyone.

Compatibility note: `parse()` returns {} for a document with no frontmatter,
whereas wiki_lint's `frontmatter()` returned None. `parse_or_none()` preserves
the legacy tri-state for callers that distinguish "absent" from "empty".
"""
from __future__ import annotations

import re

FM_DELIM = "---"


def split(text: str) -> tuple[str, str]:
    """Return (frontmatter_block, body). ('', text) when there is no frontmatter."""
    if not text.startswith(FM_DELIM):
        return "", text
    end = text.find("\n" + FM_DELIM, len(FM_DELIM))
    if end == -1:
        return "", text
    return text[len(FM_DELIM):end], text[end + 4:]


def parse_block(fm: str) -> dict:
    """Minimal YAML-ish parse: scalars + inline [a,b] and block '- ' lists."""
    out: dict = {}
    key = None
    for line in fm.splitlines():
        if re.match(r"^\s*#", line) or not line.strip():
            continue
        if re.match(r"^\s+-\s+", line) and isinstance(out.get(key), list):
            out[key].append(line.strip()[2:].strip().strip('"\''))
            continue
        # Keys may contain spaces and hyphens. portfolio_check.py's original
        # `[A-Za-z0-9_]+` was safe only because it parsed SKILL.md, where keys
        # are identifiers — but the vault's feed STATE files use keys like
        # `last run:` / `last checked:` / `last reconciled:`, which that regex
        # dropped silently. Caught by tests/test_equivalence.py against
        # knowledge/feeds/intent-scout.md; those keys are exactly what a feeder-
        # liveness check reads, so the loss would have been invisible and the
        # check would have reported a clean, stale-blind result.
        m = re.match(r"^([A-Za-z0-9_][A-Za-z0-9_ -]*):\s*(.*)$", line)
        if not m:
            continue
        key, val = m.group(1), m.group(2).strip()
        if val.startswith("[") and val.endswith("]"):
            out[key] = [x.strip().strip('"\'') for x in val[1:-1].split(",") if x.strip()]
        elif val == "":
            out[key] = []
        else:
            out[key] = val.strip().strip('"\'')
    return out


def parse(text: str) -> dict:
    """Frontmatter of a whole document as a dict ({} when absent)."""
    fm, _ = split(text)
    return parse_block(fm) if fm else {}


def parse_or_none(text: str) -> dict | None:
    """Legacy tri-state: None when the document has no frontmatter at all.

    Preserves wiki_lint.frontmatter()'s contract, where "no frontmatter" and
    "empty frontmatter" are different findings.
    """
    if not text.startswith(FM_DELIM):
        return None
    end = text.find("\n" + FM_DELIM, len(FM_DELIM))
    if end == -1:
        return None
    return parse_block(text[len(FM_DELIM):end])


def body(text: str) -> str:
    return split(text)[1]


def as_list(v) -> list[str]:
    if isinstance(v, list):
        return [x for x in v if x]
    if isinstance(v, str) and v:
        return [v]
    return []
