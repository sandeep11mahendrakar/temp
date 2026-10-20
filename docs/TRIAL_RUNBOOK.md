# Trial Runbook (T-2 step1; TRIAL only)

## Authority and pre-run fills
- Executor/HOLDER: W-B only. W3 does docs only; never launch a browser or site.
- H3 permits only these 3 targets; H4 pilot + SUB live-slot confirmation still gate execution.
- Before each run, fill owner/holder, run date (YYYY-MM-DD), and exact model ID.
- Primary: nvidia/nemotron-3-super-120b-a12b:free (MODEL_LANES.md:18).
- Fallback: google/gemma-4-31b-it:free (MODEL_LANES.md:19); record use, never silently switch.
- Holder privately sets SEED_USERNAME and SEED_PASSWORD in `vision/.env`. Run preflight and every runVision command from `vision/`; runVision.js loads `process.cwd()/.env`, so all read `vision/.env`.
- From repo root, preflight presence only (must print Y for both; values never printed):
  Push-Location vision; node -e "require('dotenv').config(); for (const k of ['SEED_USERNAME','SEED_PASSWORD']) console.log(k+'='+(process.env[k]?'Y':'N'))"; Pop-Location
- Both preflight values must be Y before saucedemo; otherwise stop. Never print or copy credential values.
- Label every result TRIAL; citable:false. No research-run-1 tag or campaign.

## Fixed targets and exact run commands (W-B; enter vision/ for each command)
1. saucedemo clean: https://www.saucedemo.com/
   Push-Location vision; $env:EXPLORE_MAX_STATES='10'; node runVision.js --explore https://www.saucedemo.com/ --goal "Clean login-to-checkout trial; stop after one run."; Pop-Location
2. zoo captcha-like; expected honest BLOCKED:
   Push-Location vision; $env:EXPLORE_MAX_STATES='10'; node runVision.js --explore http://127.0.0.1:5010/batch4-captcha --goal "Detect CAPTCHA; if detected, record BLOCKED and stop."; Pop-Location
3. zoo iframe; expected honest partial:
   Push-Location vision; $env:EXPLORE_MAX_STATES='10'; node runVision.js --explore http://127.0.0.1:5010/iframe --goal "Probe iframe path; report partial honestly if inaccessible."; Pop-Location
- Local zoo serves only on loopback; command below starts it once for targets 2-3.

## Services pre-boot and PID registry
- W-B terminal 1: node vision/zoo/serve.js 5010 ; require stdout READY 5010; occupied port => stop, no alternate port.
- Each runVision command starts browser, merge, YOLO, OCR, then gateway; it waits for health and tears down its child services.
- Ports: browser 5004, merge 5003, OCR 5002, YOLO 5001, gateway 5000, zoo 5010; no duplicate/manual starts.
- Append owned service rows to vision/storage/service_pids.jsonl: ts, service, pid, ppid, argv; never kill an unowned PID.
- Keep the W-B terminal/process record; capture PID, PPID, argv, start/end time, exit code/signal, stderr, health/ports.

## Caps, labels, and stop rules
- Hard caps: 3 runs total (one per target), EXPLORE_MAX_STATES=10 (one screenshot/state), 15 min/run; W-B starts a wall timer and kills owned run at 15 min; no fresh repeats.
- One kill-and-resume event is permitted inside the same logical run/checkpoint; it is not a fourth run.
- BLOCKED is terminal: never retry, resume, switch model, evade CAPTCHA, or count as PASS.
- Partial stays partial; any error/timeout is retained with cause-class and raw diagnostics.
- No third_party or stop-list targets, no upload, no secrets/.env inspection, no unattended run.

## Archive and report (P-1 then P-2; W-B after each completed run)
- Run output is vision/storage/outputs/<run_id>_exploration_result.json (explorer.js:1127); retain it. P-1 input is a run record JSON with run_id and relative artifacts; report.json is not a run prerequisite.
- Create P-1 input after run; replace <run_id> with the observed ID:
  node -e "require('node:fs').writeFileSync('vision/storage/outputs/<run_id>_p1.json',JSON.stringify({run_id:'<run_id>',artifacts:[{source:'vision/storage/outputs/<run_id>_exploration_result.json',path:'exploration_result.json'}]},null,2)+'\\n')"
- node tools/runArchive.js vision/storage/outputs/<run_id>_p1.json
- Immutable P-1 layout: runs/<run_id>/manifest.json and exploration_result.json; P-1 hashes copied bytes and refuses overwrite. Preserve failed/partial archives.
- P-2 follows P-1. Record the P-2 report when its source report is available; researchSchema generate validates manifest+report.json and writes summary.md, it does not create report.json. Never fabricate missing report/evidence.
- node tools/researchSchema.js generate runs/<run_id> ; node tools/researchSchema.js validate runs/<run_id>
- Record command/output, HEAD/dirty, model/date, calls/screens/time, archive path, and P-2 report or NOT_RECORDED.

## Kill-and-resume and Z-5 diagnosis
- Before the one event, persist run_id + checkpoint and log parent/child PIDs, timestamps, ports/health, memory, stdout/stderr.
- W-B interrupts only its owned non-BLOCKED run once; retain checkpoint and raw exit code/signal; do not erase partial evidence.
- Resume the same checkpoint/run_id once with the checkpoint-capable W-B executor; no new run_id or target attempt.
- tools/runBatch.js requires an injected executor; it has no CLI. Do not treat runVision.js one-shot as resumable.
- If no checkpoint-capable resume command exists, stop and report diagnosis incomplete; never fake a resume by rerunning.
- Record child/service exit, health/port snapshots, memory/time, last completed step, and whether output was archived.
- Root cause remains UNKNOWN unless these measurements distinguish operator interruption, process/service failure, or resource exhaustion.
