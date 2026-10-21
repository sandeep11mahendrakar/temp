"""Fail-closed Ed25519 verification; caller-supplied 'approved' fields are not trusted.

No production signer key is bundled. TRUST_ROOTS is deliberately empty. An
independently audited deployment must pin a real public key in the executable
artifact, then freeze/approve its new hash. Never pass a key via release JSON,
CLI argument, environment, or case plan. This artifact CANNOT unlock access.
"""
from __future__ import annotations
import base64
import datetime
import hashlib
import json
from typing import Mapping
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey
from cryptography.exceptions import InvalidSignature

TRUST_ROOTS: Mapping[str,bytes] = {}  # NO production key / NO self-authorization
TARGET='xvizjawcpafdqrygzvcx'
MIGRATION='b285982fe45757add7ae52907e0cf6b8643887bb157214b6300d24b4e90806f6'
P59_REV='87ef5658d907fa75b265ac4f3329d79383cf428f21be9cfe2f0f4a853d7b50e9'

class ReleaseRejected(ValueError):pass

def canonical(obj:object)->bytes:
    return json.dumps(obj,sort_keys=True,separators=(',',':'),ensure_ascii=True).encode()

def verify_release(envelope:dict, artifact_digest:str,plan_digest:str,roots:Mapping[str,bytes]|None=None,now:datetime.datetime|None=None)->dict:
    if not isinstance(envelope,dict) or set(envelope)!={'signed','key_id','signature_base64'}:raise ReleaseRejected('INVALID_ENVELOPE')
    claims=envelope['signed']; key_id=envelope['key_id']
    if not isinstance(claims,dict) or not isinstance(key_id,str):raise ReleaseRejected('INVALID_CLAIMS')
    expected_keys={'schema','release_id','target_ref','organization','project_name','environment','shared','branch','operator','migration_sha256','p59_revision','plan_sha256','artifact_sha256','transport','scope_handoff_id','owner_approval_id','aud_executor_approval_id','platform_tool_clearance_id','approved_baseline_sha256','not_before_utc','expires_utc'}
    if set(claims)!=expected_keys:raise ReleaseRejected('WRONG_RELEASE_FIELDS')
    if not all([claims['schema']==2,claims['target_ref']==TARGET,claims['organization']=='qwgbhcakpfwytcrryuxd',claims['project_name']=='capstone-r3-dev',claims['environment']=='personal-dev',claims['shared'] is False,claims['branch']=='main',claims['operator']=='OC-DB',claims['migration_sha256']==MIGRATION,claims['p59_revision']==P59_REV,claims['plan_sha256']==plan_digest,claims['artifact_sha256']==artifact_digest]):
        raise ReleaseRejected('RELEASE_BINDING_MISMATCH')
    if claims['transport']!='EXPLICITLY_REVIEWED_HOSTED_SESSION_ADAPTER':raise ReleaseRejected('UNAPPROVED_ROUTE')
    for name in ('scope_handoff_id','owner_approval_id','aud_executor_approval_id','platform_tool_clearance_id','release_id'):
        if not isinstance(claims[name],str) or len(claims[name])<8:raise ReleaseRejected('MISSING_TRUSTED_RECORD')
    if not isinstance(claims['approved_baseline_sha256'],str) or len(claims['approved_baseline_sha256'])!=64 or any(x not in '0123456789abcdef' for x in claims['approved_baseline_sha256']):raise ReleaseRejected('BAD_BASELINE_HASH')
    try:
        start=datetime.datetime.fromisoformat(claims['not_before_utc'].replace('Z','+00:00'))
        stop=datetime.datetime.fromisoformat(claims['expires_utc'].replace('Z','+00:00'))
        current=now or datetime.datetime.now(datetime.timezone.utc)
        if start.tzinfo is None or stop.tzinfo is None or current.tzinfo is None or not start <= current < stop or stop-start>datetime.timedelta(hours=24):raise ValueError()
    except (ValueError,TypeError):raise ReleaseRejected('RELEASE_TIME_INVALID') from None
    keys=TRUST_ROOTS if roots is None else roots  # roots injection allowed ONLY by unit-test API; CLI never accepts roots
    if key_id not in keys:raise ReleaseRejected('NO_PINNED_TRUST_ROOT')
    try:
        sig=base64.b64decode(envelope['signature_base64'],validate=True)
        Ed25519PublicKey.from_public_bytes(keys[key_id]).verify(sig,canonical(claims))
    except (ValueError,InvalidSignature,TypeError) as e:raise ReleaseRejected('BAD_SIGNATURE') from None
    return claims
