# Z-5 process interruption diagnosis (PROMPT32 P-4)

Status: ROOT CAUSE NOT ESTABLISHED; P-4 remains OPEN.

Evidence checked:

- `vision/storage/outputs/z5_run.log`: 13 result lines, no process exit code, stderr, timeout record, health check, port snapshot, or resource metric.
- `vision/storage/outputs/z5_control.log`: 45 control result lines; control completed.
- `docs/INTERCOM.md` 2026-10-18 04:30/04:45 entries say main run stopped after 13/45 and call it a recurring crash, but do not include exit code or diagnostics.
- `vision/zoo/conformance.js`: starts a local zoo child on port 5010, waits up to 15s for READY, then runs each case; case executor has a 300s timeout. The parent writes the aggregate only after the loop. A parent interruption before aggregate write is plausible but NOT proven by the retained evidence.

Conclusion: the evidence establishes an incomplete main run and a completed control run. It cannot distinguish operator/tool interruption, parent-process termination, service failure, or resource exhaustion. Do not claim a specific crash cause or a fix. P-4 requires a future diagnostic capture of parent exit code/signal, stderr, child exit, port/health snapshots, and memory/time data before a guarded serial rerun.
