---
id: secure-push
name: secure-push
provenance: authored
slug: secure-push
description: Safely stage, commit, and push a repository — and take it public — after scanning tracked content AND git history for hardcoded secrets, API keys, tokens, and PII. Use when the user says "secure push", "safe push", "safe publish", "commit and push", "push this repo", "publish this repo", "make this repo public", or is about to push or make public any repository — especially before a first public push. Blocks on any credential; runs a history-aware final gate before flipping a repo to public. On public repos, also checks that branch, commit, PR and test wording does not disclose the vulnerability being fixed, or name a client.
version: 1.2.0
category: Automation
status: active
hitl_gate: grill
unattended: forbidden
unattended_note: "Pushes commits and flips repos public. The human IS the control — a secret-scan verdict that nobody reads before a publish is not a gate."
tags: [git, security, secrets, publish, safety, disclosure, confidentiality]
inputs:
  - a git repo (cwd or a given path) ready to commit, push, or be made public
outputs:
  - a committed + pushed (and optionally publicized) repo, OR a blocked push/publish with a redacted findings report
tools: [Bash, Read]
triggers:
  - secure push
  - safe push / safe publish / commit and push
  - push this repo / publish this repo / make this repo public
dependencies: []
composes_with: [softdev-workflows, review, tdd]
owner: the operator
last_updated: 2026-08-19
---

# Secure Push — scan-gated commit, push & publish

Push a repo to its remote — and take it public — only after proving no credential or PII
reaches (or already sits in) the remote. Origin: the Claude Code `/insights` report
(2026-06/07) flagged repeated secret-to-env-var cleanup and an incident where a live
GitHub PAT was pasted inline; the 2026-07-01 snapshot re-raised "codify publish-and-secure
as a `/publish` skill." This skill makes the safety gate fire every time instead of
relying on memory.

Two scopes, one skill:

- **Push** (routine) — commit + push to an existing remote. Steps 1–6.
- **Publish** (going public: first push to a new remote, or flipping visibility to public)
  — adds Steps 7–9: **history-aware** scan, publish hygiene, and a final visibility gate.
  A working-tree-clean repo can still leak a secret buried in an old commit, so publishing
  scans *all history*, not just HEAD.

## Rules

**MUST:**
- Run the secret/PII scan on staged AND tracked content **before** committing.
- Before making a repo **public** (or first-pushing to a public remote), scan **git
  history** (`git log -p`), not just the working tree — a removed secret still lives in
  old commits.
- **Block** on any match — do not commit, push, or publicize while a credential is present.
- Print only **redacted** matches (path:line + last 4 chars); never the full value.
- Confirm remote, branch, and (for publish) the visibility change with the user before the
  first push to a new/public remote.
- Re-scan after remediation and after commit, before declaring done.
- On a **public** repo, check every artifact the push *names* — branch, commit message, PR
  title/body, test names — against [Disclosure hygiene](#disclosure-hygiene-public-repos).
  A clean scan proves no secret **value** leaks; it says nothing about what the *wording*
  discloses.

**MUST NEVER:**
- Commit, push, or publicize while any tracked file **or reachable commit** contains a
  secret, key, token, or PII.
- Echo, log, or place a full token/key value in chat, a commit message, or a file.
- Force-push, or push to a remote the user did not confirm.
- Flip a repo to public on the user's behalf without an explicit confirm on that action.
- On a public repo, let a branch name, commit message, PR title, test description, or code
  comment **name the vulnerability class being fixed** — that discloses the attack vector to
  everyone watching the repo, before or after the fix lands.
- Put a **client or customer name** in any public-facing artifact (commit, branch, PR, code,
  comment, test name, fixture, sample data).
- Run git through **sandbox bash** on the Dropbox-bridged vault — git there must run
  natively (Claude Code), not the sandbox. (See vault git/sandbox constraint.)

## Workflow

### Push (Steps 1–6 — every commit & push)

1. **Establish repo state.** `git status`, `git remote -v`, current branch. Confirm this
   is the repo and remote the user intends. Decide scope: is this a plain push, or a
   **publish** (new remote / going public)? If publish, Steps 7–9 also apply.
2. **Scan (working tree).** Grep tracked files and `git diff --cached` for the patterns in
   [Scan reference](#scan-reference). Flag any `.env*` file that is not gitignored.
3. **Gate.** If there are findings: STOP. Report each as `path:line — <type> (…last4)`,
   recommend env-var extraction + `.gitignore`, and do not proceed to commit.
4. **Remediate (with the user) — env extraction.** Move secrets to env vars, add a
   `.env.example` with placeholder keys (no values), add the real file to `.gitignore`,
   `git rm --cached` any tracked secret file. Re-scan until clean.
5. **Commit + push.** Stage, commit with a clear message (never containing a secret),
   push to the confirmed remote/branch. If the remote is **public**, run the
   [Disclosure hygiene](#disclosure-hygiene-public-repos) check on the branch name and commit
   message *before* committing — renaming a branch after it is pushed does not un-disclose it.
6. **Verify + report.** Re-scan `git ls-files` content to confirm nothing tracked
   contains a credential; report what was pushed and the clean result. If this was a
   plain push (not a publish), stop here.

### Publish (Steps 7–9 — first public push / going public)

7. **History-aware scan.** Run the [Scan reference](#scan-reference) patterns across all
   history: `git log -p --all | grep -nE '<pattern>'` (or `git rev-list --all` + per-blob
   grep). A hit anywhere in history is a **hard block** — a public repo exposes the whole
   log. Remediation here is not a new commit: it needs history rewrite (`git filter-repo`
   / BFG) and rotating the leaked credential. Flag both to the user; do not publicize.
8. **Publish hygiene.** Ensure the repo is presentable and defended:
   - `.gitignore` covers the common secret/junk set (`.env*`, `*.pem`, `id_rsa*`,
     `*.key`, `node_modules/`, build dirs). Add if missing.
   - A `README.md` exists (offer to scaffold a minimal one if absent).
   - **Token-scope check.** If the push used a GitHub token / `gh` auth, `gh auth status`
     to confirm the scopes are what's intended (warn on an over-broad token); confirm no
     token value is embedded in any workflow file or committed config.
   - **Disclosure sweep over history.** Going public exposes every past branch name, commit
     message, and test name at once — so run [Disclosure hygiene](#disclosure-hygiene-public-repos)
     across `git log --oneline --all` and the test suite, not just the current commit. Flag
     hits to the user: a vulnerability named in old commit messages is a **disclosure**
     decision (it may need the fix released first), not something to silently rewrite.
9. **Final PII gate + visibility.** One last sweep for PII (emails, keys, internal URLs)
   across tracked content AND history, then state the visibility change explicitly and get
   the user's confirm before flipping to public (e.g. `gh repo edit --visibility public`).
   Never change visibility silently. Report: what was pushed, history clean, hygiene added,
   visibility set.

## Scan reference

Match (case-insensitive where sensible), then redact before display:

- GitHub PAT: `ghp_[A-Za-z0-9]{36}`, `github_pat_[A-Za-z0-9_]{22,}`
- OpenAI / Anthropic keys: `sk-[A-Za-z0-9]{20,}`, `sk-ant-[A-Za-z0-9-]{20,}`
- AWS access key: `AKIA[0-9A-Z]{16}`
- Google API key: `AIza[0-9A-Za-z_-]{35}`
- Slack token: `xox[baprs]-[A-Za-z0-9-]+`
- Private key block: `-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----`
- Generic assignments: `(api[_-]?key|secret|token|password|passwd|bearer)\s*[:=]\s*['"][^'"]{8,}`
- Env leakage: any `.env`, `.env.*`, `*.pem`, `id_rsa` tracked by git
- PII: raw email/SSN/phone patterns in data files (flag, don't hard-block unless obvious)

A hit on any credential category is a hard block — in the **working tree** (Steps 2–3) or,
for a publish, **anywhere in history** (Step 7). Env-file tracking is a hard block. PII
patterns are a warning that needs the user's call; on a publish, treat borderline PII more
strictly (it's about to be world-readable).

## Disclosure hygiene (public repos)

Everything above protects the secret **value**. This protects the **wording** — a repo can pass
every scan in this skill and still tell an attacker exactly where to look. **This is a public
repository** is the trigger; attackers watch open-source repos for branch names, commit
messages, PR titles, test descriptions, and ticket URLs.

**The rule: describe what the code now does, never the threat it prevents.**

| Surface | Discloses (avoid) | Neutral (use) |
|---|---|---|
| Branch | `fix-ssrf-vulnerability`, `n-1234-fix-ddos` | `n-1234-improve-request-handling` |
| Commit | `fix: prevent denial of service` | `fix: add payload size validation` |
| PR title | `patch auth bypass` | `tighten session validation` |
| Test name | `'should prevent SQL injection'` | `'should sanitize query parameters'` |
| Comment | *describing the attack scenario* | *describing the invariant being enforced* |
| Ticket link | a URL slug like `.../N8N-1234/fix-ssrf-vulnerability` | the bare ticket ID |

Note the branch trap specifically: issue trackers **auto-suggest a branch name from the ticket
title**, so a security ticket hands you a disclosing branch name by default. Rename it before
the first push.

**Customer confidentiality.** Never name a client or customer in a public-facing artifact —
not every client has agreed to be named, and naming them can reveal details about their setup.
Describe the case neutrally (*"a client with a large multi-site deployment"*), and use generic
placeholders (`Acme Corp`, `client-a`) in tests, fixtures, and sample data. This applies to
client work in every public repo.

**This check is judgement, not a regex — say so rather than faking a gate.** Unlike the
[Scan reference](#scan-reference) patterns, "does this wording disclose the vector?" cannot be
grepped; it is read. So: **surface candidates to the user and let them decide** rather than
hard-blocking, and never report "disclosure-clean" as if a scanner produced it. Report it as
*read and judged*, naming what was checked. A useful first pass is `git log --oneline --all`
plus test names, but the verdict is a human call.

**Timing matters more than tidiness.** If a disclosing name is already pushed, renaming does
not retract it — the old ref may be cached, forked, or in someone's clone. Treat it as a
disclosure event: flag it, and let the user decide whether the fix needs releasing first.

*Source: *eval n8n repo* §2 (mined from `n8n-io/n8n` `AGENTS.md`, 2026-08-19).*

## Cost Class

**Lightweight** — `SKILL.md` + `examples/` only. Uses git and grep; no scripts, MCPs, or
reference files loaded by default. History scan (Step 7) is O(history size) but still just
git + grep.
