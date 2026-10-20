# Signed trusted release — REVIEW SCHEMA ONLY; NOT ISSUED

`release_auth.py` verifies a canonical, exactly-keyed JSON envelope:

`{ "signed": {...}, "key_id": "<preinstalled-pinned signer>", "signature_base64": "<Ed25519 signature over canonical(signed)>" }`

`canonical(signed)` = UTF-8 JSON sorted keys with separators `(',', ':')` and `ensure_ascii=True`.

Signed claims (all mandatory, no extras): `schema=2`, `release_id`, `target_ref`, `organization`, `project_name`, `environment=personal-dev`, `shared=false`, `branch=main`, `operator=OC-DB`, `migration_sha256`, `p59_revision`, `plan_sha256`, `artifact_sha256`, `transport=EXPLICITLY_REVIEWED_HOSTED_SESSION_ADAPTER`, `scope_handoff_id`, `owner_approval_id`, `aud_executor_approval_id`, `platform_tool_clearance_id`, `approved_baseline_sha256`, `not_before_utc`, `expires_utc` (24h maximum).

Signer verification uses ONLY public keys baked into an independently audited build. **This frozen review bundle pins no production key and has no hosted adapter.** A signed claim is not external platform permission; the prior safety block remains a separate gate. Any key/adapter addition changes the binary/source hash and requires a new frozen, independently approved release.

Do not fill the placeholders with fabricated evidence; never place signing private keys or database credentials in this packet.
