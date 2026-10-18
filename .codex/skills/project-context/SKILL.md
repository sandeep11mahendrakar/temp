---
name: project-context
description: Retrieve focused, authoritative context for tasks in this CAPSTONE project without loading the full board, intercom, or historical memory by default.
---

# Project context retrieval

1. Read `CODEX_PROJECT_MEMORY.md` for orientation and source precedence.
2. Inspect `git status --short` before changing anything; preserve existing dirty work.
3. For a task tied to an active row or program, search `docs/TASK_BOARD.md` for its ID and governing directive (PROMPT30/D43 currently opens PX-1/PX-2), then read only the relevant row/directive ranges. Do not infer live state from this snapshot or old handoff text.
4. Search `docs/INTERCOM.md` for the row ID and read the newest relevant claim, answer, blocker, holder, or verifier lines. Confirm ownership and live slot before acting.
5. For evidence claims, inspect the matching `docs/AUDIT.jsonl` and `docs/R3_RESULTS.jsonl` entries plus cited artifacts. These ledgers are append-only; corrections add entries.
6. At campaign/program closure, compare `docs/FINAL_STATE.md` with the board and latest intercom; it is a dated closure checkpoint, not permission to ignore contradictory live board rows.
7. Read `docs/ONBOARDING.md`, worker/verifier prompts, audit-lite rules, skills, reports, or `agents/memory/PROJECT_HANDOFF.md` only when the task requires their specific procedure or background. The handoff is historical and may be stale.
8. Use `tools/Search-ProjectContext.ps1 -Query '<keyword or phrase>'` for bounded excerpts from selected project documents. Its OpenCode JSONL reader only returns allowlisted CAPSTONE entities to avoid surfacing unrelated cross-project memory. Increase `-Limit` only as needed; use `-Path` to narrow sources.
9. For product goals and project history, prefer current user instructions and dated authoritative records. The Oct 14 handoff and Oct 18 summary are historical context; check `docs/TASK_BOARD.md`, latest `docs/INTERCOM.md`, and `docs/FINAL_STATE.md` for later decisions/status.

## Authority for PROMPT29/D42 records

- `docs/TASK_BOARD.md` D42 and the PROMPT29 FX rows own policy and row status.
- Newest relevant `docs/INTERCOM.md` entries provide current coordination and verifier decisions. Resolve conflicts by checking the current board and newest authoritative answer; do not silently rewrite history.
- `docs/AUDIT.jsonl` and `docs/R3_RESULTS.jsonl` provide evidence, not current assignment authority.
- `CODEX_PROJECT_MEMORY.md` and OpenCode memory are navigation aids/snapshots, never substitutes for checking current authoritative records.

## PROMPT30/D43 note

- The 2026-10-18 human order opened PX-1 for W-A and PX-2 for W-B only. Read both current rows and the latest intercom before acting; other PROMPT27-29 rows remain terminal. These migration instructions do not assign this Codex session either row.

Do not read the full JSONL graph, full intercom, full task board, or all reports unless the task explicitly requires an exhaustive audit.
