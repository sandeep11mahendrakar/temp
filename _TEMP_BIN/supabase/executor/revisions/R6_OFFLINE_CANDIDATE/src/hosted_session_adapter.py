"""Reviewable disconnected session contract. No SDK, DSN or connector exists.

The parent owns lifecycle; each call would create a separate physical session.
execute returns executor_runtime.QueryResult; errors use DbFailure with only
SQLSTATE and constraint. close must wait for real session termination. None of
these promises can be certified without an approved concrete platform adapter.
"""
from typing import Protocol
from executor_runtime import QueryResult
from platform_clearance_gate import PlatformBlocked, require_external_clearance


class Session(Protocol):
    def execute(self, sql: str, params: tuple = ()) -> QueryResult: ...
    def close(self) -> None: ...


class HostedSessionAdapter:
    def __init__(self, release_claims, external_authorization=None):
        require_external_clearance(release_claims, external_authorization)
        raise PlatformBlocked('NO_HOSTED_ADAPTER_INSTALLED')

    def __call__(self, readonly: bool):
        # Also blocks construction via __new__ or deserialization.
        raise PlatformBlocked('NO_HOSTED_ADAPTER_INSTALLED')
