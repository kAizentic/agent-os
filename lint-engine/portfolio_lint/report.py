"""Report emission — the contract that already exists informally, written down.

vault_health.py shells out to sibling check scripts with `--json` and reads a
flat `{category_key: [items]}` dict, indexing by key name. That IS the contract;
it just was never stated, so every new check script has to be reverse-engineered
before the scorecard can consume it.

emit_json() produces a SUPERSET of that shape:

  * the legacy flat `category -> list[str]` keys, so vault_health and any other
    existing consumer keep working untouched;
  * a structured `findings` array (full Finding dicts) for consumers that want
    severity and routing;
  * `acknowledged`, `stale_acks`, and a `meta` block.

Backward compatibility is deliberate: this engine has to be adoptable one
instance at a time, and a cutover that breaks the nightly scorecard is not
adoptable.
"""
from __future__ import annotations

import json
import sys

from .finding import Result

try:  # Windows consoles default to cp1252 and would crash on report glyphs.
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass


def to_payload(result: Result, *, stale_acks: list[dict] | None = None) -> dict:
    payload: dict = {}
    # --- legacy flat shape (vault_health.py reads these) ---
    for cat, items in result.by_category().items():
        payload[cat] = [f.subject if not f.evidence else f"{f.subject} — {f.evidence}"
                        for f in items]
    # --- structured shape ---
    payload["findings"] = [f.to_dict() for f in result.ranked()]
    payload["acknowledged"] = [f.to_dict() for f in result.acknowledged]
    payload["stale_acks"] = stale_acks or []
    payload["meta"] = {
        "instance": result.instance,
        "scanned": result.scanned,
        "categories_fired": result.exit_code(),
        "hard": len(result.hard()),
        "soft": len(result.findings) - len(result.hard()),
        "notes": result.notes,
    }
    return payload


def emit_json(result: Result, *, stale_acks: list[dict] | None = None) -> None:
    print(json.dumps(to_payload(result, stale_acks=stale_acks), indent=2))


def emit_console(result: Result, *, stale_acks: list[dict] | None = None) -> None:
    m = result.instance
    print(f"\n{m} — {result.scanned} units scanned")
    if not result.findings:
        print("  clean")
    for cat, items in sorted(result.by_category().items()):
        sev = items[0].severity
        print(f"\n  [{sev.upper()}] {cat} ({len(items)})")
        for f in items[:50]:
            line = f"    - {f.subject}: {f.message}"
            if f.evidence:
                line += f"  ({f.evidence})"
            print(line)
        if len(items) > 50:
            print(f"    … {len(items) - 50} more")
    if result.acknowledged:
        print(f"\n  acknowledged (not defects): {len(result.acknowledged)}")
    for e in stale_acks or []:
        print(f"  ! stale ack — no longer fires: {e['key']} ({e.get('reason', '')})")
    for n in result.notes:
        print(f"  note: {n}")
