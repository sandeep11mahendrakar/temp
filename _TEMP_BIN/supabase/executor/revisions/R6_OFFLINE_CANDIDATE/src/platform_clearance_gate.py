"""Unavailable external platform contract, deliberately NOT an approval token.

No real platform attestation format or permitted SQL transport was supplied.
Fail unconditionally. A future implementation needs external access clearance,
normal tool approval and independent review; a signed release cannot replace it.
"""


class PlatformBlocked(RuntimeError):
    pass


def require_external_clearance(release_claims, external_authorization=None):
    raise PlatformBlocked('PLATFORM_ATTESTATION_AND_PERMITTED_TRANSPORT_UNDEFINED')
