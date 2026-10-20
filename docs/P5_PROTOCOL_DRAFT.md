# P-5 Protocol Draft (TRIAL-ONLY, owner decision pending)

Objective: run a bounded, offline, secret-safe trial on 3 fixed safe targets to validate the R3 archive/report/uploader chain; label TRIAL, not citable.

Targets (fixed, no others):
1. saucedemo.com (clean): login -> checkout chain.
2. local zoo captcha-like page: expected honest BLOCKED (no retry/evasion).
3. local zoo iframe page: expected partial (record honest partial).

Caps (per trial): max 3 runs total (one per target), max 10 screenshots/run, wall-clock 15 min/run. Pinned model: Nemotron :free primary, Gemma :free retry. Pinned date: owner sets before run. Repeats: 1 per target (no repeats until freeze).

Metrics captured per run: start/end time, LLM calls, tokens, screenshots, archive path, manifest hash, report hash, upload status (or none), failure cause-class, kill-and-resume event log.

Exclusions: no third_party domains; no stop-list domains (stackoverflow, imdb, goodreads, npmjs, reddit, magento, opencart); no CAPTCHA retry/evasion; no 30-site campaign; no research-run-1 tag until owner freeze.

Labels: AUTONOMOUS only blind=Y select-only/generate; otherwise ASSISTED/NONBLIND. Every run here = TRIAL (ASSISTED, citable:false).

Stop rules: BLOCKED is final, never retried; partial recorded as partial; no .env reads; no live upload without owner H8; no source commits during run.

Open questions (owner only): freeze decision (T-5), research tag, 30-site campaign (out of scope), target project/branch (H1), who applies DB-5 (H2), live holder identity (H4).

Evidence pull for P-4/P-7 step1: Z-5 diagnosis log (kill-and-resume), archive manifest+per-call JSONL, P-2 reports, time/calls/screens, one kill-and-resume event per run to diagnose Z-5.

Audience: sub-master/owner approve; AUD docs-only review before any flip. No tool/code changes.