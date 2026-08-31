"""portfolio_lint — the shared chassis for standing-stock hygiene reviews.

Five instances of one pattern (wiki-lint, skill-portfolio-review, routine-health,
design-system-review, feed-synthesis) share a chassis and differ only in their
units, edges, schema, and smell heuristics.

What this package owns (the chassis):
    fs           — read / walk / vault-root discovery, fail-closed
    frontmatter  — one parser, the hardened one
    wikilink     — extraction + resolution
    finding      — Finding / Result, severity, exit-code convention
    ack          — the settled-judgment ledger, as data, with stale detection
    report       — the JSON contract vault_health already consumes, as a superset

What it deliberately does NOT own (the instance):
    the checks themselves, the smell heuristics, and the routing target. Those
    are the actual domain knowledge and belong in each review.
"""
from .finding import Finding, Result, HARD, SOFT, INFO  # noqa: F401
from .ack import AckLedger  # noqa: F401
from . import fs, frontmatter, wikilink, report  # noqa: F401

__all__ = ["Finding", "Result", "HARD", "SOFT", "INFO", "AckLedger",
           "fs", "frontmatter", "wikilink", "report"]
__version__ = "0.1.0"
