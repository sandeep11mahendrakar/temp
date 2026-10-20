# P-7 retained-evidence review | 2026-10-19 00:01 IST

Status | P-7 VERIFY/W1; no source edit or state downgrade in this pass.
Sampler | tools/spotcheck.js requires manifest.json + report.json, folder-matched manifest.run_id, recorded site, >=3 cases per run, recorded case IDs; screenshot_path is copied only when explicit. Human fields stay blank.

## Candidate inventory

| origin/run_id | cases | evidence | decision |
|---|---:|---|---|
| repo/runs/schema-clean | 1 | report.evid_paths=evidence.txt exists; screenshot_path NOT_RECORDED | reject: synthetic fixture + minimum 3 unmet |
| repo/runs/schema-blocked | 1 | report.evid_paths=evidence.txt exists; screenshot_path NOT_RECORDED | reject: synthetic fixture + minimum 3 unmet |
| repo/runs/schema-contaminated | 1 | report.evid_paths=evidence.txt exists; screenshot_path NOT_RECORDED | reject: contaminated synthetic fixture + minimum 3 unmet |
| canonical runs/* run_* | 152 dirs | 145 run_manifest.json; 95 fusion/fusion_report.json; 95 fusion/fusion_tests.json; 143 dom/test_cases.json | reject: 0 manifest.json+report.json pairs; unsupported legacy schema/no existing adapter |

Inspected canonical examples: run_20260826_023441, run_20260824_171828, run_20260824_102041. Legacy files=run_manifest.json+fusion/fusion_report.json; aggregate metadata, no report.cases[]. CLI fails closed (exit2: first run lacks manifest.json/report.json).
Repo CLI checks: node tools/spotcheck.js runs 32 => exit2 (schema-blocked has 1 case); no docs/SPOTCHECK.csv created. Canonical CLI => exit2 (manifest.json/report.json missing). No archive qualifies; no cases padded/combined.

## Test baseline recovery

Git source blobs match saved SHA256 exactly; baseline test declarations were recovered, not inferred from current counts.
| file | baseline blob | baseline SHA256 | baseline tests | current SHA256 | current tests | delta |
|---|---|---|---:|---|---:|---:|
| tools/stats.test.js | 52405b5ff3a2cecb45f111c988090090ea54ae28 | dd82a006bc431b63d0d2e4dd6ca7f67363557a9a70a1bb5bda94f4090dbe694d | 2 | fb1f4491c35975c24b977f8ad73fa846ecef2bc0fc6ffe1010d2ed8153d83ec3 | 11 | +9 |
| tools/spotcheck.test.js | cb601f91c964e4f7f1e421186d96444f2ff1062d | ec429cd2a14fdf276530e75f1bbfb19967ea0e59a65bb9cb4dd6a3ed47c29faa | 2 | b21eb121c802d09274e5136b2bd5f8263a7c020d10b90a064ecb1fa1864ed31d | 10 | +8 |
| tools/stats.js | 06281e475e117e85ea8a75126363a1837d2429af | 93316ff2524b5a38162d3dfcd714bb5300e70b92155d62590debcebe8aab1c79 | n/a | 4007e5cd5fe42483e2cdbe389e531b6288595d1223224ca303cdf7a3013a4b22 | n/a | n/a |
| tools/spotcheck.js | f52410588a774315d7b9cfbe66222106b1bb4756 | 91ddfed7e62144179cf2b7d98c81aeb11d3bbddfeb6a6eca7b99b9e048e4999b | n/a | 952c6473f8225cb26953abc9db70eb1c5343ebd382ec20b9f7879c56d22b36ad | n/a | n/a |
Current targeted command: node --test tools/stats.test.js tools/spotcheck.test.js => 21/21 pass, exit0 (2026-10-19 00:00 IST).

## Already-authorized T-2 evidence gate

T-2 remains OPEN with deps T-1 DONE + DB-5 DONE. Current T-1 is VERIFY/UNVERIFIABLE for hosted proof; DB-5 is BLOCKED pending DB-2/3/4/7 DONE + owner DB access/environment. No T-2 run is eligible now.
T-2 fixed targets: saucedemo; zoo captcha-like (BLOCKED); zoo iframe (partial). After gates: P-1 immutable archives + P-2 reports; selected run needs >=3 case IDs and resolvable evidence artifacts/hashes. No new target/run authorized.

## Human review preparation

No review now: no qualifying sheet. For each future run_id/tc_id, ask: Does linked screenshot/evidence support saved verdict? Record supported/contradicted/UNVERIFIABLE + reason; leave reviewer/name/date blank for Sandeep.
Exact current missing evidence: compatible P-1 manifest.json+report.json archive with >=3 cases and stable resolvable case evidence; then owner review of each selected row. T-2 dependencies above are the existing path; no run is started here.
Open implementation question: P-1 schema stores case.evid_paths; current sampler reads case.screenshot_path only. No adapter/source change made. Ask SUB whether future sheet should carry evid_paths verbatim when screenshot_path is absent.

Fresh AUD requested after this inventory; prior P-7 UNVERIFIABLE remains history until AUD/SUB updates.
