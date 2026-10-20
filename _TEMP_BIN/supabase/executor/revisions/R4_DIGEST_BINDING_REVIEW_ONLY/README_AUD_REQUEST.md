# OC-DB | R4 digest-binding candidate | independent AUD request

STATUS: PROPOSAL ONLY / OFFLINE TESTED / NOT AN EXECUTOR RELEASE / NO HOSTED ADAPTER.

AUD-P71-20261020T235042-01 found that frozen R3 `src/bundle_auth.py::artifact_digest()` omits security-critical `src/approved_entry.py`. Mutation of that route guard left R3's digest unchanged. The P71 OFFLINE source review remains ACCEPT within its scope; this is a separate candidate, not a repair in place.

Files: `future_artifact_digest.py` and `test_future_artifact_digest.py`. The digest has an exact compile-time list of eight source paths, including its own future deployment path (`src/future_artifact_digest.py`), existing trust/entry/runtime/catalog modules, and REQUIRED BUT NOT IMPLEMENTED `src/hosted_session_adapter.py` and `src/platform_clearance_gate.py`. Missing modules, symlinks, and escaped paths fail closed. No dynamic caller source list is accepted. The hash includes domain separator and path names; the frozen R3 implementation is not modified.

Test method: throwaway synthetic module files, with a copy of existing frozen `src/release_auth.py` for checking an ephemeral Ed25519 test signature. Tests assert each of eight source mutations changes the computed digest, and mutation of entry/adapter/clearance gate rejects a previously signed claim with RELEASE_BINDING_MISMATCH. No production keys, DB URLs, Supabase calls, migration, upload, or platform permissions are needed. Run from this directory: `python -m unittest -v test_future_artifact_digest`. Python + `cryptography` dependency supplied by local test environment, not packaged.

Limitations: This is not wired into `bundle_auth.py` or `approved_entry.py`, and deliberately provides no hosted adapter, clearance-attestation integration, approved signer, transport retry/digest proof, or database tests. Future new frozen release requires *reviewing and pinning the actual complete adapter/gate import dependency closure and third-party lockfiles*, wiring the new digest into signed-release verification, producing mutation/fail-closed tests for every security-critical source, and independent AUD acceptance. An approved signature does not override any platform safety block.

AUD request: Review fixed binding list, fail-closed behavior and mutation tests as a PROPOSAL; identify the minimum remaining release-engineering defects. Do not mark hosted executor ACCEPT or open DB-5 gate.

UNCHANGED: Entire frozen R3 source, P59, migration, R5 evidence, historical `driver_sha256=null`, SOURCE_MANIFEST.json and Supabase.
DB-5 BLOCKED | TV-1 UNVERIFIED | NO APPLY AUTHORIZATION.
