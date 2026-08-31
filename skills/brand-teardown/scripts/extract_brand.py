#!/usr/bin/env python3
"""
Brand visual-identity extraction cascade.

Tries three tiers in order, stops at the first usable result, and tags every
field with the source that produced it so downstream confidence is auditable.

  Tier 1  Brandfetch API      (needs BRANDFETCH_API_KEY; best for known brands)
  Tier 2  Playwright          (computed styles from the rendered page)
  Tier 3  Static HTML/CSS     (regex over fetched HTML + linked stylesheets)

Usage:
    python extract_brand.py example.com [--out brand_visual.json]

Output: writes brand_visual.json and prints a short summary to stdout.

Dependencies:
    requests           (always)
    playwright         (optional, Tier 2)  ->  pip install playwright && playwright install chromium
If playwright isn't installed, Tier 2 is skipped automatically.
"""
import argparse
import json
import os
import re
import sys
from collections import Counter
from urllib.parse import urljoin, urlparse

import requests

REQUEST_TIMEOUT = 20
UA = "Mozilla/5.0 (compatible; brand-teardown/1.0)"

HEX_RE = re.compile(r"#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})\b")
RGB_RE = re.compile(r"rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})", re.I)
FONT_RE = re.compile(r"font-family\s*:\s*([^;}\"']+)", re.I)


def normalize(target):
    """Return (domain, homepage_url) from a URL or bare domain."""
    if not target.startswith(("http://", "https://")):
        target = "https://" + target
    parsed = urlparse(target)
    domain = parsed.netloc or parsed.path
    domain = domain.split("/")[0].lower().lstrip("www.")
    return domain, f"https://{parsed.netloc or domain}"


def rgb_to_hex(r, g, b):
    return "#{:02x}{:02x}{:02x}".format(int(r), int(g), int(b))


# ----------------------------------------------------------------------------- Tier 1
def try_brandfetch(domain):
    key = os.environ.get("BRANDFETCH_API_KEY")
    if not key:
        return None, "no BRANDFETCH_API_KEY set — skipping Tier 1"
    try:
        resp = requests.get(
            f"https://api.brandfetch.io/v2/brands/{domain}",
            headers={"Authorization": f"Bearer {key}", "User-Agent": UA},
            timeout=REQUEST_TIMEOUT,
        )
        if resp.status_code == 404:
            return None, "brand not in Brandfetch database"
        resp.raise_for_status()
        data = resp.json()
    except Exception as e:  # noqa: BLE001
        return None, f"Brandfetch request failed: {e}"

    result = {"logo": {}, "palette": [], "typography": []}
    for logo in data.get("logos", []):
        fmts = logo.get("formats", [])
        if fmts:
            result["logo"] = {
                "url": fmts[0].get("src", ""),
                "format": fmts[0].get("format", ""),
                "source": "brandfetch",
            }
            break
    for c in data.get("colors", []):
        result["palette"].append({
            "hex": c.get("hex", ""),
            "role": c.get("type", "unknown"),
            "source": "brandfetch",
            "confidence": "measured",
        })
    for f in data.get("fonts", []):
        result["typography"].append({
            "family": f.get("name", ""),
            "usage": f.get("type", "unknown"),
            "source": "brandfetch",
            "confidence": "measured",
        })
    if result["palette"] or result["logo"]:
        return result, "ok"
    return None, "Brandfetch returned no usable assets"


# ----------------------------------------------------------------------------- Tier 2
def try_playwright(url):
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        return None, "playwright not installed — skipping Tier 2"

    try:
        with sync_playwright() as p:
            browser = p.chromium.launch()
            page = browser.new_page(user_agent=UA)
            page.goto(url, wait_until="networkidle", timeout=REQUEST_TIMEOUT * 1000)
            # Pull computed color + font from a sample of visible elements.
            data = page.evaluate(
                """() => {
                    const els = Array.from(document.querySelectorAll('body *')).slice(0, 4000);
                    const colors = {}, bgs = {}, fonts = {};
                    for (const el of els) {
                        const r = el.getClientRects();
                        if (!r.length) continue;
                        const area = r[0].width * r[0].height;
                        if (area <= 0) continue;
                        const cs = getComputedStyle(el);
                        const add = (m, k, w) => { if (k) m[k] = (m[k]||0) + w; };
                        add(colors, cs.color, area);
                        add(bgs, cs.backgroundColor, area);
                        add(fonts, cs.fontFamily, area);
                    }
                    return {colors, bgs, fonts};
                }"""
            )
            logo_src = page.evaluate(
                """() => {
                    const c = document.querySelector('header img, [class*=logo] img, img[alt*=logo i]');
                    return c ? c.src : (document.querySelector('link[rel~=icon]')||{}).href || '';
                }"""
            )
            browser.close()
    except Exception as e:  # noqa: BLE001
        return None, f"Playwright run failed: {e}"

    palette = _rank_computed_colors({**data.get("bgs", {}), **data.get("colors", {})})
    fonts = _rank_fonts(data.get("fonts", {}))
    if not palette and not fonts:
        return None, "Playwright found no usable styles"
    result = {
        "logo": {"url": logo_src, "format": "", "source": "playwright"} if logo_src else {},
        "palette": palette,
        "typography": fonts,
    }
    return result, "ok"


def _rank_computed_colors(weighted):
    hexed = Counter()
    for val, weight in weighted.items():
        m = RGB_RE.search(val or "")
        if not m:
            continue
        r, g, b = m.groups()
        # Skip fully transparent / pure white-black noise dominance is fine to keep.
        hexed[rgb_to_hex(r, g, b)] += weight
    roles = ["primary", "secondary", "accent", "neutral", "neutral"]
    out = []
    for i, (hx, _) in enumerate(hexed.most_common(5)):
        out.append({"hex": hx, "role": roles[i] if i < len(roles) else "neutral",
                    "source": "playwright", "confidence": "measured"})
    return out


def _rank_fonts(weighted):
    fonts = Counter()
    for val, weight in weighted.items():
        first = (val or "").split(",")[0].strip().strip('"\'')
        if first:
            fonts[first] += weight
    usages = ["body", "heading", "mono"]
    out = []
    for i, (fam, _) in enumerate(fonts.most_common(3)):
        out.append({"family": fam, "usage": usages[i] if i < len(usages) else "other",
                    "source": "playwright", "confidence": "measured"})
    return out


# ----------------------------------------------------------------------------- Tier 3
def try_static(url):
    try:
        html = requests.get(url, headers={"User-Agent": UA}, timeout=REQUEST_TIMEOUT).text
    except Exception as e:  # noqa: BLE001
        return None, f"static fetch failed: {e}"

    css_text = html
    for href in re.findall(r'<link[^>]+rel=["\']?stylesheet["\']?[^>]+href=["\']([^"\']+)', html, re.I):
        try:
            css_text += requests.get(urljoin(url, href), headers={"User-Agent": UA},
                                     timeout=REQUEST_TIMEOUT).text
        except Exception:  # noqa: BLE001
            continue

    colors = Counter(m.group(0).lower() for m in HEX_RE.finditer(css_text))
    for m in RGB_RE.finditer(css_text):
        colors[rgb_to_hex(*m.groups())] += 1
    fonts = Counter(m.group(1).split(",")[0].strip().strip('"\'') for m in FONT_RE.finditer(css_text))

    palette = [{"hex": hx, "role": "unknown", "source": "static-html",
                "confidence": "inferred"} for hx, _ in colors.most_common(6)]
    typography = [{"family": fam, "usage": "unknown", "source": "static-html",
                   "confidence": "inferred"} for fam, _ in fonts.most_common(3) if fam]

    logo = ""
    og = re.search(r'<meta[^>]+property=["\']og:image["\'][^>]+content=["\']([^"\']+)', html, re.I)
    if og:
        logo = urljoin(url, og.group(1))
    if not palette and not typography and not logo:
        return None, "static parse found nothing usable"
    return {
        "logo": {"url": logo, "format": "", "source": "static-html"} if logo else {},
        "palette": palette,
        "typography": typography,
    }, "ok"


# ----------------------------------------------------------------------------- driver
def run(target):
    domain, url = normalize(target)
    trail = []
    for name, fn, arg in (("brandfetch", try_brandfetch, domain),
                          ("playwright", try_playwright, url),
                          ("static", try_static, url)):
        result, msg = fn(arg)
        trail.append({"tier": name, "status": msg})
        if result:
            result["target"] = {"domain": domain, "url": url}
            result["extraction_tier"] = name
            result["cascade_trail"] = trail
            return result
    return {"target": {"domain": domain, "url": url}, "logo": {}, "palette": [],
            "typography": [], "extraction_tier": "none", "cascade_trail": trail}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("target")
    ap.add_argument("--out", default="brand_visual.json")
    args = ap.parse_args()
    result = run(args.target)
    with open(args.out, "w") as f:
        json.dump(result, f, indent=2)
    tier = result["extraction_tier"]
    print(f"extraction tier reached: {tier}")
    print(f"  colors: {len(result['palette'])}  fonts: {len(result['typography'])}  "
          f"logo: {'yes' if result.get('logo', {}).get('url') else 'no'}")
    for step in result["cascade_trail"]:
        print(f"  - {step['tier']}: {step['status']}")
    print(f"written to {args.out}")
    if tier == "none":
        sys.exit(2)


if __name__ == "__main__":
    main()
