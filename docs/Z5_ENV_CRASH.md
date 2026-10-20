# P-4 offline runner and Z-5 evidence

P-4 offline phase only. No browser, site, service, or live batch was run here. `tools/runBatch.js` accepts an explicit executor and archive callback (P-1 `archiveRun` is the default); there is no live executor default.

| Evidence | Observation | Limits |
|---|---|---|
| `vision/storage/outputs/z5_run.log` | 13 result rows retained | No process exit/signal, stderr, timeout, service health, port, or resource metrics |
| `vision/storage/outputs/z5_control.log` | Control reports 45/45 NOT-pass | Control completed; does not explain the main-run interruption |
| `vision/storage/outputs/g2z_results_v2.json` | FX-8 summary reports 35/44 = 79.55%, 10 failures | Aggregated result; no parent-process diagnostics |
| `vision/zoo/conformance.js` | Starts `serve.js` child on 5010; waits 15s for READY; each executor call has 300s timeout; aggregate is written after the loop | Source behavior, not proof that any branch caused the retained interruption |
| `docs/evidence/Z5_CRASH_DIAGNOSIS.md` | Root cause not established | Operator/tool interruption, parent termination, service failure, and resource exhaustion remain hypotheses |

The runner preserves declared order and caps, serializes execution with an exclusive lock, checkpoints each state atomically, skips COMPLETE/BLOCKED/FAILED sites on resume, requires explicit retry for ERROR/TIMED_OUT, and stops on archive failure. Archive failures can retry archival from the checkpoint without re-executing the site. Existing archives remain governed by P-1 exclusive-create behavior.

Before any later guarded live rerun, collect parent exit code/signal and stderr, child exit, per-step timestamps, health/port snapshots, and memory/time measurements. That future run remains gated by P-5 and owner/SUB live-slot authorization; this offline phase does not establish a crash cause or close full P-4.
