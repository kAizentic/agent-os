#!/usr/bin/env python3
"""
Render a brand_kit.json into a markdown brief.

The point of this script is to guarantee the JSON and the markdown never drift:
the markdown is a pure projection of the JSON. Build/verify the JSON first, then
render. If a field is missing, the renderer omits it rather than inventing copy.

Usage:
    python render_brief.py brand_kit.json [--out brand_brief.md]
"""
import argparse
import json


def row(cells):
    return "| " + " | ".join(str(c) if c not in (None, "") else "—" for c in cells) + " |"


def render(kit):
    tgt = kit.get("target", {})
    brand = tgt.get("domain", "unknown")
    vis = kit.get("visual", {})
    pos = kit.get("positioning", {})
    lines = []
    a(lines, f"# Brand Teardown — {brand}")
    tier = kit.get("extraction_tier", "unknown")
    a(lines, f"*Analyzed {tgt.get('analyzed_at', 'n/a')} · extraction tier: {tier}*")
    a(lines, "")

    # Visual identity --------------------------------------------------------
    a(lines, "## Visual identity")
    a(lines, row(["Element", "Value", "Source", "Confidence"]))
    a(lines, row(["---", "---", "---", "---"]))
    logo = vis.get("logo", {})
    if logo.get("url"):
        a(lines, row(["Logo", logo["url"], logo.get("source", "—"), "measured"]))
    for c in vis.get("palette", []):
        label = f"{c.get('hex','')} ({c.get('role','')})"
        a(lines, row(["Color", label, c.get("source", "—"), c.get("confidence", "—")]))
    for t in vis.get("typography", []):
        label = f"{t.get('family','')} ({t.get('usage','')})"
        a(lines, row(["Type", label, t.get("source", "—"), t.get("confidence", "—")]))
    if not (logo.get("url") or vis.get("palette") or vis.get("typography")):
        a(lines, row(["—", "no visual data extracted", "—", "—"]))
    a(lines, "")

    # Positioning ------------------------------------------------------------
    a(lines, "## Positioning & voice")
    if pos.get("value_prop_stated"):
        a(lines, f"- **Stated value prop:** {pos['value_prop_stated']}")
    if pos.get("value_prop_restated"):
        a(lines, f"- **What they're really selling:** {pos['value_prop_restated']}  *(inferred)*")
    if pos.get("target_buyer"):
        a(lines, f"- **Target buyer:** {pos['target_buyer']}")
    if pos.get("tone"):
        tone = "; ".join(f"{t.get('descriptor','')} ({t.get('evidence','')})" for t in pos["tone"])
        a(lines, f"- **Tone:** {tone}")
    if pos.get("messaging_themes"):
        a(lines, f"- **Messaging themes:** {', '.join(pos['messaging_themes'])}")
    a(lines, "")

    # Content angles ---------------------------------------------------------
    a(lines, "## Content & demand angles")
    angles = kit.get("content_angles", [])
    if angles:
        a(lines, row(["Angle", "Evidence basis", "Confidence"]))
        a(lines, row(["---", "---", "---"]))
        for ang in angles:
            a(lines, row([ang.get("angle", ""), ang.get("evidence_basis", ""),
                          ang.get("confidence", "")]))
    else:
        a(lines, "*No content angles generated.*")
    a(lines, "")

    # Evidence gaps ----------------------------------------------------------
    a(lines, "## Evidence gaps")
    a(lines, kit.get("evidence_notes", "_None recorded — review extraction tier and confidence "
                                       "columns above before relying on any single value._"))
    a(lines, "")
    return "\n".join(lines)


def a(lst, s):
    lst.append(s)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("kit")
    ap.add_argument("--out", default="brand_brief.md")
    args = ap.parse_args()
    with open(args.kit) as f:
        kit = json.load(f)
    md = render(kit)
    with open(args.out, "w") as f:
        f.write(md)
    print(f"rendered {args.out} ({len(md)} chars)")


if __name__ == "__main__":
    main()
