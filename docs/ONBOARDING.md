# ONBOARDING (new worker, 5 minutes)

1. Read `agents/README.md`, then `docs/TASK_BOARD.md` newest DIRECTIVES first.
2. Worktree is vision-only; branch `main`, LOCAL-only commits, never push.
3. One row at a time, first-claim-wins; check board comms <30min before claiming.
4. Live runs are serial: post `HOLDER=Wn` first, one driver, ports 5000-5004+5123.
5. Mock LLM only (`api_calls=0`) unless the row authorizes a live call.
6. `node --check` every touched file before editing; suites green before DONE.
7. Suites: `node --test vision/test/*.test.js` + `node --test vision/mcp/server.test.js`.
8. Board writes + `docs/R3_RESULTS.jsonl` lines via node `fs` utf8 only (no Add-Content).
9. Evidence files go under `vision/storage/outputs/` (git-ignored, on-disk only).
10. Fixtures live in `vision/test/fixtures/`; manifest pinned by `fixtureManifest.test.js`.
11. Never overwrite another worker's entry; help-others-then-stop; then STANDBY.
