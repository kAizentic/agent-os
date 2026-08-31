"""The ACK ledger — settled judgments that must never be re-flagged.

Every instance has one. Today they are hardcoded Python constants
(ACK_TRIGGER_OVERLAPS, ACK_ORPHANS in portfolio_check.py) or prose sections in
SKILL.md (skill-portfolio-review, design-system-review). Both forms have the
same two problems: an acknowledgement is a *curator decision with a date and a
reason*, and neither form records either; and a decision living in code can
only be changed by editing code.

Here an ACK is data — a JSON file next to the instance:

    {
      "acks": [
        {
          "key": "orphans:slack-gif-creator",
          "reason": "niche utility with no honest workflow edge",
          "decided": "2026-07-06",
          "decided_in": "skill portfolio review"
        }
      ]
    }

`key` matches Finding.key() and may end in '*' to acknowledge a whole category
for one subject prefix. An ACK'd finding is not discarded — it moves to
Result.acknowledged so a run can still show what it is deliberately ignoring.
"""
from __future__ import annotations

import json
from pathlib import Path

from .finding import Finding, Result


class AckLedger:
    def __init__(self, entries: list[dict] | None = None):
        self.entries = entries or []
        self._exact = {e["key"]: e for e in self.entries if not e["key"].endswith("*")}
        self._prefix = [(e["key"][:-1], e) for e in self.entries if e["key"].endswith("*")]

    @classmethod
    def load(cls, path: Path | None) -> "AckLedger":
        if not path or not Path(path).exists():
            return cls([])
        data = json.loads(Path(path).read_text(encoding="utf-8-sig"))
        entries = data.get("acks", [])
        for e in entries:
            if "key" not in e:
                raise ValueError(f"ack entry missing 'key': {e}")
        return cls(entries)

    def match(self, f: Finding) -> dict | None:
        k = f.key()
        if k in self._exact:
            return self._exact[k]
        for pre, e in self._prefix:
            if k.startswith(pre):
                return e
        return None

    def apply(self, result: Result) -> Result:
        """Partition findings into live vs acknowledged, in place."""
        live, acked = [], []
        for f in result.findings:
            hit = self.match(f)
            if hit:
                f.message = f"{f.message}  [ack {hit.get('decided', '?')}: {hit.get('reason', '')}]".rstrip()
                acked.append(f)
            else:
                live.append(f)
        result.findings, result.acknowledged = live, acked
        return result

    def stale(self, seen_keys: set[str]) -> list[dict]:
        """ACKs whose finding no longer fires — the acknowledgement outlived the
        thing it excused, and is now silently widening the review's blind spot.

        This is the check the hardcoded-constant form structurally cannot do.
        """
        out = []
        for e in self.entries:
            k = e["key"]
            if k.endswith("*"):
                if not any(s.startswith(k[:-1]) for s in seen_keys):
                    out.append(e)
            elif k not in seen_keys:
                out.append(e)
        return out
