"""Trust-gated, adapter-injected entry. Not a hosted CLI; NO production route installed."""
from __future__ import annotations
from pathlib import Path
from release_auth import verify_release,TRUST_ROOTS,ReleaseRejected
from bundle_auth import artifact_digest,pin_sources
from executor_runtime import execute_review_only

class RouteNotApproved(RuntimeError):pass

def gate_then_run(bundle_root:Path,release:dict,adapter_factory, *,roots=None, ctx=None):
    pins=pin_sources(bundle_root)
    claims=verify_release(release,artifact_digest(bundle_root),pins['case_plan_sha256'],roots=roots)
    # A signed record is NOT sufficient proof the platform safety block cleared.
    # No production adapter or platform-attestation integration is bundled.
    # The test-only injection API explicitly cannot certify a hosted transport.
    if roots is None or not getattr(adapter_factory,'IS_OFFLINE_TEST_DOUBLE',False):
        raise RouteNotApproved('PLATFORM_CLEARANCE_UNVERIFIABLE_NO_APPROVED_TRANSPORT')
    # Tests only. A hosted adapter requires separate external review and release.
    return execute_review_only(adapter_factory,claims['approved_baseline_sha256'],pins['source_notice_ids'],ctx=ctx)
