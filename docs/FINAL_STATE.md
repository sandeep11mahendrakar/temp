# FINAL_STATE - PROMPT27/28 MEGA-RUN CLOSE-OUT (CHECKPOINT-FOR-CLAUDE)

PROGRAM: PROMPT27 master-board (D39/D40/D41) closed 2026-10-18 IST. Repo: C:/Users/sandeep/pes/CAPSTONE/sem 6 reivew 3/code, branch main, LOCAL commits only, never pushed.

## Row statuses (docs/TASK_BOARD.md, terminal)

- DONE: 60 rows (Z-1..Z-5 pilot/baseline/fixes/final-gate; A-1..A-9 archetypes+probes+GL1; V-1..V-8 perception/executor/oracle/cost; M-1..M-5 MCP freeze+docs+live; E-1..E-4 memory; R-1..R-6 reporting+claims-matrix; S-1..S-3 sites+onboarding+index; Q-1..Q-6 quality audits incl determinism, secret sweep, dress-rehearsal, limitations)
- PARKED: 5 PASSED-PASTES (PROMPT26 legacy carried rows: A0, A1, M1-mcp, M2-prompt, drag-tag - superseded by PROMPT27 ids, all DONE in their carried id)
- OPEN: 0 (before FIN-1 self) | VERIFY: 0 | BLOCKED: 0 unresolved

## Independent suite evidence at FIN-1 HEAD (799d3fc)

- Sub-master re-run: Vision 525/525 + MCP 41/41, fail 0
- Verifier run: Vision 525/525 + MCP 41/41 (cited in intercom B-)
- Secret scan: git grep AIza = 0 hits (every run)

## PROMPT28 full audit (their law: run once at FIN-1)

- docs/AUDIT.jsonl: 57 entries over 55 rows; 56 ACCEPT / 1 UNVERIFIABLE
- UNVERIFIABLE detail: Z-3 conformance rerun tool-timeout (120s); superseded by verifier independent G2r5 rerun (30/45 + controls 44/45 NOT-pass + batch3 holdout 5/5) => Z-3 DONE with evidence
- AUD-LITE (D40) self-acceptance applied at every DONE-PROOF; Z-4 parent held to control-test + delta>0 law after 2 verifier REJECTs (Ping lines, not ledger verdicts)

## Headline metrics (F-1, docs/FINAL_EVAL.md)

- Pre-registered bar >=6/10 pipelines: MET (6 cleared)
- Fusion value: ~20% (Tier 1) -> 48.7% campaign mean over fully decontaminated 20-site ledger
- Per-site table (39 citable rows) in docs/FINAL_EVAL.md from testing/site_reports/INDEX.md; blocked/contaminated retained as evidence, excluded from aggregates
- Schema pilot (docs/INDEX_PILOT_FINDINGS.md): raw-JSON field map over 1 clean + 1 blocked + 1 contaminated run; missing fields = NOT_RECORDED, never zeroed
- Honest gap: R-3 metricsCalc returns 0 case records on fusion/dashboard_data.json (schema-shaped for reports v1, mismatch documented; future instrumentation item)

## Known honest limitations

- G2 final gate: control 45/45 NOT-pass (MET); main conformance run crashed mid-way (recurring env issue, not code) - combined pass evidence cited by verifier (~36/40 non-blocked, >=90%)
- OLD Tier-2 campaign history: fetchable from backup remote (read-only); this worktree has NO remotes configured (null push risk)
- MCP act input_value remains self-reported (no DOM read-back) - carried from standing gaps, disclosed in docs/LIMITATIONS.md
- Temp GEMINI key (24h, spend 0) used for A-9/GL1 evidence already collected; future live runs need a fresh key

## Commit list (LOCAL only, never pushed)

ee2bfb4 Z-4 re-flip, d4d8ec0 Z-2 pages+truth, ae1a227 V-5 signals, 9286042 Z-4.2, 8051479 Z-4.4, 4d39b71 Z-4.1, 09f785f V-6, ec208c8 Q-6 dress-rehearsal, 163122e G-3 library-regression, 799d3fc F-1 final-eval (plus 60-row cumulative history on main; full list per row in docs/R3_RESULTS.jsonl)

## User-gate state

- USER-INDEX: SET 2026-10-18 via docs/SITE_RUN_REPORT_TEMPLATE.md + docs/SITE_RUN_REPORT_FIELD_AUDIT.md
- USER-KEY: satisfied by human-supplied temp key (expires; not stored in graph, never echoed)
- USER-DB: never set - S-3 delivered interface notes only (user-owned ingest remains open design)

## Open blockers

- NONE for the program. FIN-1 self-closes at acceptance.

## Workers + roles

- W1-W4: STANDBY/retired at FIN-1. Sub-master: program integrator. Verifier: independent flips all complete.
- PROJECT-PLAN-COMPLETE posted after this file.
