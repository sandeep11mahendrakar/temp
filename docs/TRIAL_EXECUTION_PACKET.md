# Trial execution packet (OC-READY)

Local trial requires: P-4.1, P-1.1, T-2.pre, working executor, real preflight, H3, SUB release.
Upload additionally requires DB-5/TV-1 and H8.

Allowed targets (3 runs total, EXPLORE_MAX_STATES=10, 15 min/run):
1. saucedemo clean
2. 127.0.0.1:5010/batch4-captcha (honest BLOCKED)
3. 127.0.0.1:5010/iframe (honest partial)

Commands: see docs/TRIAL_RUNBOOK.md; executor missing => BLOCKED, no invented syntax.

Archive/report:
- node tools/runArchive.js vision/storage/outputs/<run_id>_p1.json
- node tools/researchSchema.js generate runs/<run_id>
- node tools/researchSchema.js validate runs/<run_id>

Attempt identity: run_id from explorer output. Owned PID cleanup after each run.
Readiness checker: node tools/trialReadiness.js (injectable inputs for tests).

Gates: local trial, upload, readback, report, freeze remain separate.
Checkpoint/resume remains blocked. No services/browsers/models/sites/uploads/DB operations in this packet.