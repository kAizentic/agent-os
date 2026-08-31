"""The Finding — the one currency every standing-stock review reports in.

Today each instance invents its own shape (a bare list of strings, a dict, a
tuple), which is why the HTML scorecard has to know each script's category keys
by name. A Finding carries enough structure that a consumer can rank and route
without knowing which review produced it.

Severity follows wiki-lint's hard/soft split, which the pre-commit ratchet
already depends on:

  HARD — referential integrity is broken (a link points at nothing, a declared
         dependency doesn't exist). Objectively wrong; blocks the gate.
  SOFT — a judgment-shaped smell (orphan, coverage gap, redundancy). Real, but
         a curator may legitimately decide it's fine; advisory only.
  INFO — descriptive context, never a defect.
"""
from __future__ import annotations

from dataclasses import dataclass, field, asdict
from typing import Any

HARD = "hard"
SOFT = "soft"
INFO = "info"
_ORDER = {HARD: 0, SOFT: 1, INFO: 2}


@dataclass
class Finding:
    category: str                 # stable key, e.g. "broken_links"
    subject: str                  # the unit at fault (vault-relative path or id)
    message: str                  # one line, human-readable
    severity: str = SOFT
    evidence: str = ""            # the specific token/line that triggered it
    route_to: str = ""            # the builder skill that would fix it
    ack_key: str = ""             # override; defaults to f"{category}:{subject}"

    def key(self) -> str:
        return self.ack_key or f"{self.category}:{self.subject}"

    def to_dict(self) -> dict[str, Any]:
        d = asdict(self)
        d.pop("ack_key", None)
        d["key"] = self.key()
        return d


@dataclass
class Result:
    """Everything one review run produced."""
    instance: str
    findings: list[Finding] = field(default_factory=list)
    acknowledged: list[Finding] = field(default_factory=list)
    scanned: int = 0
    notes: list[str] = field(default_factory=list)

    def add(self, f: Finding) -> None:
        self.findings.append(f)

    def by_category(self) -> dict[str, list[Finding]]:
        out: dict[str, list[Finding]] = {}
        for f in self.findings:
            out.setdefault(f.category, []).append(f)
        return out

    def hard(self) -> list[Finding]:
        return [f for f in self.findings if f.severity == HARD]

    def ranked(self) -> list[Finding]:
        return sorted(self.findings, key=lambda f: (_ORDER.get(f.severity, 9),
                                                    f.category, f.subject))

    def exit_code(self) -> int:
        """Number of distinct categories that fired — wiki-lint's convention."""
        return len({f.category for f in self.findings})
