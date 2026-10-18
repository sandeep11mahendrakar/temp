# DB-6 synthetic trial expectations
Status | W4 authored fixture pack; independent AUD acceptance pending; no live trial, database, browser or model observation.
Scope | tools/fixtures/db-trial/*.json; this document. Existing runs/schema-* archives preserved unchanged.
Origin | W4-authored on 2026-10-18 IST; no imported report, credential, endpoint, user data, screenshot, or measured telemetry.
Label | All examples are ASSISTED/TRIAL; citable=false; aggregate_eligibility=EXCLUDED, including clean input.
Limits | ACCEPT means structurally admissible evidence; it does not mean PASS execution, successful upload, hosted RLS proof, or research eligibility.
Contract | execution_class is a fixture semantic expectation, not a proposed SQL enum; raw verdict remains PASS/FAIL/BLOCKED.
Contract | DB-1/DB-4 own final field mapping/export validation. This pack supplies inputs and expected decisions; their runtime acceptance remains untested here.

| Fixture | Input source | Expected decision | Outcome/integrity | Control |
| --- | --- | --- | --- | --- |
| clean | synthetic clean | ACCEPT | COMPLETE/PASS; CLEAN | TRIAL excluded despite PASS |
| blocked | synthetic captcha-like | ACCEPT | BLOCKED; CLEAN | BLOCKED retained; no retry/evasion |
| partial | synthetic iframe failure | ACCEPT | PARTIAL/FAIL; CLEAN | PASS + FAIL cases retained |
| contaminated | synthetic seeded-oracle leak | ACCEPT | COMPLETE/PASS; CONTAMINATED | contamination preserved; excluded |
| mutated-id | clean + report ID mutation | REJECT | input IDs disagree | Never pair by folder name or rewrite ID |
| nested-secret-key | clean + nested key marker | REJECT | prohibited synthetic marker | Scan keys recursively |
| nested-secret-value | clean + nested array value marker | REJECT | prohibited synthetic marker | Scan values recursively |
| fake-eligible-trial | clean + fake eligibility/citable flags | REJECT | input falsely claims ELIGIBLE | Expected output remains EXCLUDED/false |
| absent-timing | clean + deleted duration field | ACCEPT | COMPLETE/PASS; CLEAN | Normalize absence to NOT_RECORDED, not zero |
| failed-partial-execution | partial, explicit failure control | ACCEPT | PARTIAL/FAIL; CLEAN | Evidence acceptance never changes FAIL to PASS |
| tampered-hash | clean + wrong declared report hash | REJECT | source bytes retained | Refuse before export/POST |

Pairing | Each file is a self-contained raw pair: input.manifest + input.report + input.evidence. Original IDs stay under input; only mutated-id deliberately disagrees.
Identity | Fixed IDs db6-<fixture>-v1; report case IDs are unique per pair. Materialization uses a fresh temporary directory, never an existing runs/ folder.
Materialize | Write manifest.json and report.json using JSON.stringify(value,null,2) + LF, UTF-8 without BOM; write evidence.content_utf8 exactly at evidence.path.
Provenance | input.manifest.artifacts lists report/evidence bytes + SHA256. expected.hashes binds retained manifest/report bytes separately.
Hash | Artifact hash mismatch is intentional only in tampered-hash; wrapper source hashes still bind its unchanged input bytes.
Hash | Sanitized payload hash is COMPUTE_AFTER_EXPORT; it must be calculated by DB-4 over its versioned payload serialization, never copied from a raw-source hash.
Availability | Calls/screens/time/started/ended are NOT_RECORDED; tokens=null. No zero-call, zero-cost, duration, or screenshot claim is inferred from synthetic inputs.
Availability | Evidence is LOCAL_ONLY; remote_url=null. There is no screenshot file or publicly reachable artifact URL in this pack.
Privacy | Secret controls contain a conspicuous synthetic prohibited marker only; they are intentionally invalid payloads, never outbox/upload inputs.
Originals | All mutations are recorded in provenance.mutation; parent_fixture identifies the authored scenario, not a real historical run.
Consumer | DB-7 must test these expectations against accepted DB-1/DB-4 modules before claiming end-to-end compatibility.

Recheck | Run the JavaScript block below via Node from repo root; it reads only this fixture pack and prints counts, never prohibited marker values.

```javascript
const fs = require('fs'), assert = require('node:assert/strict'), crypto = require('crypto');
const dir = 'tools/fixtures/db-trial';
const json = v => JSON.stringify(v, null, 2) + '\n';
const sha = v => crypto.createHash('sha256').update(v, 'utf8').digest('hex');
const files = fs.readdirSync(dir).filter(f => f.endsWith('.json')).sort();
assert.equal(files.length, 11);
const ids = new Set(); let accepted = 0, rejected = 0;
for (const file of files) {
  const f = JSON.parse(fs.readFileSync(dir + '/' + file, 'utf8'));
  const { manifest: m, report: r, evidence: e } = f.input;
  const x = f.expected;
  assert.equal(f.fixture_format, 'db6-raw-pair-v1');
  assert.equal(ids.has(m.run_id), false); ids.add(m.run_id);
  assert.equal(f.provenance.live_run, false);
  assert.equal(x.experiment_kind, 'TRIAL'); assert.equal(x.citable, false);
  assert.equal(x.aggregate_eligibility, 'EXCLUDED'); assert.equal(x.network_allowed, false);
  assert.equal(sha(json(m)), x.hashes.source_manifest_sha256);
  assert.equal(sha(json(r)), x.hashes.source_report_sha256);
  const content = { 'report.json': json(r), [e.path]: e.content_utf8 };
  const hashesMatch = m.artifacts.every(a => Buffer.byteLength(content[a.path]) === a.bytes && sha(content[a.path]) === a.sha256);
  assert.equal(hashesMatch, x.hashes.artifact_hashes_match);
  const secret = /sb_secret_|service_role|eyJ/;
  const invalid = m.run_id !== r.run.id || secret.test(json(r)) || m.aggregate_eligibility !== 'EXCLUDED' || m.citable !== false || !hashesMatch;
  assert.equal(invalid ? 'REJECT' : 'ACCEPT', x.decision);
  assert.equal(r.result.verdict, x.raw_run_verdict);
  assert.equal(r.integrity.verdict, x.integrity_verdict);
  for (const key of ['calls', 'screens', 'time']) assert.equal(m.cost[key], 'NOT_RECORDED');
  assert.equal(m.cost.tokens, null); assert.equal(m.started, 'NOT_RECORDED'); assert.equal(m.ended, 'NOT_RECORDED');
  if (f.fixture_id === 'absent-timing') assert.equal(Object.hasOwn(r.telemetry, 'duration_ms'), false);
  if (x.execution_class === 'PARTIAL') assert.ok(r.cases.some(c => c.verdict === 'FAIL'));
  if (f.fixture_id === 'mutated-id') assert.notEqual(m.run_id, r.run.id);
  x.decision === 'ACCEPT' ? accepted++ : rejected++;
}
assert.equal(accepted, 6); assert.equal(rejected, 5);
console.log('DB6_FIXTURE_QA files=11 accept=6 reject=5 paired=10 intentional_ID_mismatch=1 hashes_checked=11 PASS');
```

QA scope | Checks authored source bytes, expected decisions, missing telemetry and negative mutations; does not execute an exporter or prove backend behavior.
Tests added | 0 test files; 0 test cases added. Fixture QA is a repeatable document command, separate from production test-suite totals.

Verification | Document QA command => files=11, accept=6, reject=5, paired=10 + deliberate mismatch=1, hashes_checked=11, PASS; exit0.
Verification | Own 12 files ASCII, lines<=300, Google-key-pattern hits=0; tests_added/file=0 for every fixture and this document; exit0.
Regression | node --test vision/test/*.test.js | Select-Object -Last 9; exit $LASTEXITCODE => tests539/pass539/fail0/exit0 outside sandbox.
Regression | $env:MCP_HTTP_PORT='15123'; node --test --test-reporter=tap vision/mcp/server.test.js => tests41/pass41/fail0/exit0 outside sandbox.
Limit | Initial sandbox suites hit EPERM temporary rename/EACCES loopback; elevated MCP default-port retry had HTTP-not-ready failure; alternate-port suite passed without source changes.
Acceptance | These are fixture QA and unchanged-suite observations; accepted contract/exporter integration is a DB-7 dependency, not claimed here.
