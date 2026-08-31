# site-crawl — one-time crawl4ai venv setup

The skill shells out to a **dedicated, isolated** crawl4ai venv (never the global
interpreter, never injected into `~/.claude` — ADR-0001-safe). Set it up once.

## Windows (proven 2026-07-14)
Using `uv` (already installed) and the Python 3.13 the `py` launcher exposes:

```bash
# pick a stable home for the venv (NOT the vault, NOT a temp dir if you want it to persist)
uv venv --python 3.13 "$HOME/.venvs/crawl4ai"
uv pip install --python "$HOME/.venvs/crawl4ai/Scripts/python.exe" crawl4ai
# provision the Playwright browser the crawler drives
"$HOME/.venvs/crawl4ai/Scripts/python.exe" -m playwright install chromium
```

Verify:
```bash
"$HOME/.venvs/crawl4ai/Scripts/python.exe" -c "from crawl4ai.__version__ import __version__; print(__version__)"
# -> 0.9.1 (or later)
```

## Notes
- **No API keys** are required for local crawling. LLM-based extraction (not used by
  this skill's default path) would need a key.
- **Footprint** is moderate: numpy/scipy/lxml/playwright/litellm — **no torch**.
  Install is ~20s via uv; the chromium download is the bulk.
- The install pulls `patchright` + `playwright-stealth` (anti-bot browser variants).
  The skill runs plain headless chromium by default; stealth is available if a target
  needs it, but reach for it deliberately, not by reflex.
- `crawl4ai-setup` (the package's own bootstrapper) is an alternative to the explicit
  `playwright install chromium` line above; the explicit line is what was verified.
- Point the skill at this python via the `<venv>/Scripts/python.exe` path in every
  invocation. If you relocate the venv, that's the only thing to update.

## If setup fails
Fall back to ``defuddle`` per URL for a small handful of pages. site-crawl is the
breadth tool; a few single pages don't need it.
