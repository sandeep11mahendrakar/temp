# CAPSTONE Codex Memory

Repo-scoped navigation entry point. For active facts, consult the current board/intercom and cited evidence; all status below is only a dated orientation snapshot.

## Project

AI-assisted web/mobile UI test generation capstone. This review-3 workspace primarily covers the Vision explorer, YOLO/OCR perception, executor/oracles, deterministic zoo, MCP interface, site library, and reporting. Use codebase-memory for structural code queries when available.

## Retrieval order

1. `docs/TASK_BOARD.md`: current directives and row ownership/status (D43/PROMPT30 opened PX-1/PX-2; confirm row state before acting).
2. Latest relevant `docs/INTERCOM.md`: current coordination, blockers, verifier decisions, HOLDER/live slot.
3. `docs/AUDIT.jsonl` and `docs/R3_RESULTS.jsonl`: append-only evidence; corrections add records.
4. Task-specific docs/prompts under `docs/`, then `agents/` handoff for historical context.
5. `opencode-memory/memory.jsonl`: primary OpenCode graph copy, useful for cross-project durable facts; not the authority for live task state.

Use `.agents/skills/project-context/SKILL.md` for selective retrieval and `tools/Search-ProjectContext.ps1` for keyword excerpts. Use `.agents/skills/project-director/SKILL.md`, `project-worker/SKILL.md`, and `project-verifier/SKILL.md` only for explicitly assigned roles; they do not grant authority. Use `.agents/skills/project-checkpoint/SKILL.md` to record verified outcomes and handoffs. Start bounded worker briefs from `docs/WORKER_ASSIGNMENT_TEMPLATE.md`. Avoid loading full board/intercom/JSONL/history by default.

## Durable safeguards

- Shared, dirty worktree: inspect `git status --short`; preserve existing edits and untracked files. Never reset/clean/stash over work. No push or deletion.
- Current board ownership/locks govern task actions. Live runs are serial; check HOLDER and ports. Respect API/key gates, bot protection, and third-party stop-list.
- Do not expose secrets. Never include `.env` or credentials in outputs/commits.
- Board and ledger updates are append-only where specified and use Node `fs` UTF-8. Do not weaken oracle behavior; retain negative controls.
- Labels: AUTONOMOUS only when blind=Y and select-only/generate; MCP/CLI NONBLIND; mock/file/seeded/replay ASSISTED.

## Last checked snapshot — 2026-10-18

PROMPT29/D42 closed with FX-1..FX-6 and FIN-1 DONE. The audit saw a transient mismatch (FX-6 OPEN vs FIN-1 DONE; intercom still pending), later reconciled by sub-master updates. On 2026-10-18 19:32 IST, D43/PROMPT30 opened two new rows only: PX-1 (W-A, offline metricsCalc/dashboard_data adapter) and PX-2 (W-B, dirty-tree disposition). The board is now modified in the shared worktree with D43 and these rows; check current ownership/state before acting. Other PROMPT27-29 rows remain terminal. The latest intercom gives baseline suites Vision 525 + MCP 41, requires no pushes/deletions/secrets/third-party runs, and keeps USER-DB human-gated. Claude-to-Codex master transfer remains pending until remaining Claude work is imported and the user explicitly transfers authority. Historical metrics: FX-1 35/44 = 79.55%, below its 90% gate; FX-2 Tier1 13.56% (n=8), Tier2 81.11% (n=10), combined 51.09% (n=18); FX-5 stop-list: stackoverflow, imdb, goodreads, npmjs, reddit, magento, opencart. These and 525/41 suite counts are recorded historical evidence, not current verification.

## Migration audit

See `docs/CODEX_MIGRATION_AUDIT.md` for the source inventory, retrieval checks, and measurement. Claude-to-Codex migration is incomplete: the accessible checkpoint is not Claude's full private project history. Do not claim master authority until the user provides the remaining Claude work and explicitly transfers authority. OpenCode's copied primary JSONL contains cross-project records; the search utility filters to CAPSTONE entities, but the source copy itself remains mixed and untracked. The legacy backup and corrupt OpenCode files were not copied or read.

## Product goal and historical handoff

User's durable product goal: a general website testing agent takes a URL, plain-language objective, and components; explores with screenshot/OCR/YOLO perception, generates and executes tests, verifies outcomes, and reports evidence. The user wants system/architecture quality and support for mid/low-tier models and varied action/site types, not a login-only demo. The Oct 14 handoff's Supabase/team pipeline is tentative and the handoff is historical; newer board directives, checkpoints, and explicit user decisions take precedence. For evolution/history, see `docs/CLAUDE_CHECKPOINT_DUMP.txt` and the user-provided Oct 14 handoff listed in `docs/CODEX_MIGRATION_AUDIT.md`.

Current authority: Oct 18 `docs/FINAL_STATE.md` closes PROMPT29 FX-1..FX-6 and FIN-1; the subsequent D43/PROMPT30 board order opens PX-1 (W-A) and PX-2 (W-B) only. Re-read board and latest intercom before acting. User has said Claude remains master until remaining Claude work is migrated and the user explicitly transfers authority; Codex must not self-appoint.
