---
id: transcript-pull
name: Transcript Pull
provenance: authored
slug: transcript-pull
description: Pull a clean, readable transcript from a YouTube (or other yt-dlp-supported) video or audio URL and hand it to wisdom/capture/the inbox. Use when the user shares a video/podcast URL and wants its transcript, says "transcribe this", "what does this video say", "get the captions/transcript", "summarize this talk", or wants a talk/interview turned into notes or a skill. Caption-based and key-free by default; falls back to Whisper only for caption-less audio.
version: 1.0.0
category: Research
status: active
hitl_gate: none
tags: [transcripts, youtube, video, podcast, yt-dlp, captions, sources, wisdom]
inputs:
  - a video or audio URL (YouTube or any yt-dlp-supported site)
  - optional language code (default en) and output preference (prose or per-line)
outputs:
  - a clean prose transcript (timestamps/tags/rolling-window duplication stripped)
  - optionally a distilled note handed to capture for the Second Brain inbox
tools: [Bash, Write, cli:yt-dlp, cli:whisper]
triggers:
  - transcribe this
  - get the transcript
  - what does this video say
  - summarize this talk
  - pull the captions
dependencies: []
composes_with:
  - wisdom
  - capture
  - distill
aliases:
  - transcribe
  - youtube transcript
  - video to text
owner: the operator
last_updated: 2026-06-28
---

# Transcript Pull

Turn a video/audio URL into a clean transcript with two commands: `yt-dlp` pulls
the captions, `clean_transcript.py` collapses them into readable prose. This is
the missing feeder for `wisdom` (extract SME from a talk) and `capture` —
neither of which can fetch a transcript on their own.

> [!note] Prerequisites (local annotation)
> - **`yt-dlp` on PATH** — verified installed (2025.12.08) at
>   `…/Python313/Scripts/yt-dlp`. If missing: `pipx install yt-dlp` or
>   `pip install --user yt-dlp`.
> - **Node on PATH** — yt-dlp uses it to solve YouTube's JS challenges
>   (`--js-runtimes node`). Node 24 is present. Without it, captions usually
>   still download but some videos may fail.
> - No API keys are needed for the caption path. Whisper (caption-less audio) is
>   an optional escalation — see the last section.

## Scope — what this does and does NOT do

- **Does:** fetch + clean a transcript from a single URL, then hand the text off.
- **Does NOT search the web.** For "research X" / find-similar / literature scans,
  use `web-research` (Exa). This skill only transcribes a URL you already have.
- **Does NOT distill.** It produces clean text; `wisdom`/`capture` interpret it.

## Workflow

1. **Confirm the tools** (first run only): `yt-dlp --version` and `node --version`.
2. **List available caption tracks** so you pick the right language and know
   whether they're human or auto-generated:
   ```bash
   yt-dlp --js-runtimes node --list-subs --skip-download "<URL>"
   ```
3. **Download the caption track** (prefer human subs `--write-sub`; fall back to
   auto `--write-auto-sub`). Work in the scratchpad, not the vault:
   ```bash
   yt-dlp --js-runtimes node --skip-download \
     --write-sub --write-auto-sub --sub-lang en --sub-format vtt \
     -o "<scratch>/%(id)s.%(ext)s" "<URL>"
   ```
4. **Clean to prose** with the bundled script (strips timestamps, inline tags,
   and the auto-caption rolling-window duplication — ~10x smaller):
   ```bash
   python scripts/clean_transcript.py "<scratch>/<id>.en.vtt" -o "<scratch>/<id>.txt"
   ```
   Flags: `--lines` (one line per cue, keeps rough timing order), `--keep-effects`
   (retain `[Music]`/`[Applause]`), `-` (read from stdin).
5. **Hand off.** Pass the cleaned text to the skill the user actually wanted:
   `wisdom` for SME extraction or `capture` to drop a note in `inbox/`.
   Always record provenance: source URL + pull date.

## Notes

- **Human vs. auto captions:** auto-captions have no punctuation/casing reliability
  and run words together; flag that to downstream skills so they don't over-trust
  exact wording.
- **Non-YouTube:** the same flow works for any yt-dlp-supported site; only the
  available formats differ.
- **Faithful, not verbatim-perfect:** cleaning is lossless of *words* but collapses
  timing. Use `--lines` if a downstream task needs approximate timestamps.

## Optional: caption-less audio (Whisper)

When a source has no captions (many podcasts), transcribe the audio instead.
This needs a key (Groq free tier or OpenAI) and is deliberately out of the
default path:

1. `yt-dlp -x --audio-format mp3 -o "<scratch>/%(id)s.%(ext)s" "<URL>"`
2. Transcribe with your Whisper provider of choice, then clean/format as above.

Agent-Reach's `agent-reach transcribe <url>` wraps this Groq/OpenAI Whisper step
if installed in a dedicated venv — but per ADR 0001 do **not** run its installer
on the live machine (its `doctor`/`install` inject a skill into `~/.claude/skills`
outside this pipeline). Shell out to it from its own venv only.
