# R3 export report coverage

Source template: `docs/SITE_RUN_REPORT_TEMPLATE.md` schema `0.1-draft`. DB-4 exports the accepted DB-1 envelope and compact registered fields. It does not render the full template.

| Template section | Export source or status | Coverage |
|---|---|---|
| Front matter and 1 Run at a glance | `manifest.run_id/site/url/started/ended`; DB-1 outcomes and eligibility | Partial; generator version/objective/result narrative NOT_RECORDED |
| 2 Scope and experimental setup | manifest environment/label/brain/cost; report stage/platform | Partial; A/B/Fusion versions and auth state NOT_RECORDED |
| 3 Evidence availability | DB-1 `availability`; manifest cost preserves zero/null/NOT_RECORDED | Partial; full per-metric template status table not rendered |
| 4 Research summary and findings | report cases/result/integrity | Partial; findings/anomalies/unsupported claims NOT_RECORDED unless registered schema supplies fields |
| 5 Key metrics dashboard | report telemetry and manifest cost | Partial; A/B/Fusion metrics, denominators, rates, charts NOT_RECORDED |
| 6 Architecture A DOM exploration | no accepted structured source mapping | NOT_RECORDED |
| 7 Architecture B vision and replay | report cases/evidence paths only | Partial; raw per-state and replay ledgers NOT_RECORDED |
| 8 Fusion stages and generated tests | no accepted structured source mapping | NOT_RECORDED |
| 9 Cross-architecture interpretation | no accepted comparison mapping | NOT_RECORDED; no A/B pairing inferred |
| 10 Integrity, provenance, eligibility | source hashes, payload hash, DB-1 integrity/eligibility, case evidence refs | Partial; detailed gate-by-gate narrative NOT_RECORDED |
| 11 Charts and distributions | no chart schema in DB-1 contract | NOT_RECORDED |
| 12 Limitations and threats | no accepted mapping | NOT_RECORDED |
| 13 Artifact manifest and retrieval pointers | manifest artifact relative paths/bytes/hashes | Partial; all artifacts remain local-only; no remote URL asserted |
| 14 Sanitization record | export source hashes, sanitized payload hash, fixed policy version | Partial; per-field redaction ledger NOT_RECORDED |
| 15 AI and human annotations | no annotation schema in DB-1 contract | NOT_RECORDED |
| 16 Reproducibility record | manifest head, hashes, browser, viewport, OS, limits, seed | Partial; command/environment reproduction details NOT_RECORDED |
| 17 Generator validation checklist | source validator result gates export | Partial; full template checklist is NOT_RECORDED |

Sanitization policy: source manifest/report SHA-256 values attest raw UTF-8 bytes; `payload_sha256` attests the sanitized canonical envelope. URLs lose query/fragment; credential-bearing URLs and prohibited credential markers reject. The export is offline and trial rows remain excluded from eligible research views.
