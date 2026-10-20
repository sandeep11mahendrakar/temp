"""Review-only digest proposal. NOT imported by frozen R3 or any hosted route.

For a future independently approved release, every executable security-critical
module including this one, entrypoint, adapter and clearance gate must be pinned.
This is deliberately incomplete until the real adapter and its imports are audited.
"""
from __future__ import annotations
from pathlib import Path
import hashlib

PINNED_MODULES = (
    'src/future_artifact_digest.py',         # this module when deployed
    'src/approved_entry.py',                 # route authorization entry
    'src/bundle_auth.py',
    'src/case_catalog.py',
    'src/executor_runtime.py',
    'src/hosted_session_adapter.py',         # MISSING: future audited adapter
    'src/platform_clearance_gate.py',        # MISSING: future audited gate
    'src/release_auth.py',
)

class ReleasePinError(ValueError):
    pass


def artifact_digest(bundle_root: Path) -> str:
    """Return a deterministic digest of a fixed, complete proposed module set.

    No caller-supplied source list; missing files and symlink paths fail closed.
    This does not approve execution or attest platform tool access.
    """
    try:
        root = Path(bundle_root).resolve(strict=True)
    except (OSError, RuntimeError) as exc:
        raise ReleasePinError('BUNDLE_ROOT_MISSING') from exc
    rows = []
    for relative in PINNED_MODULES:
        path = root / relative
        try:
            if (root / 'src').is_symlink() or path.is_symlink():
                raise ReleasePinError('SYMLINK_DISALLOWED:' + relative)
            if not path.is_file() or not path.resolve(strict=True).is_relative_to(root):
                raise ReleasePinError('PIN_MISSING_OR_ESCAPED:' + relative)
            digest = hashlib.sha256(path.read_bytes()).hexdigest()
        except (OSError, RuntimeError) as exc:
            raise ReleasePinError('PIN_UNREADABLE:' + relative) from exc
        rows.append(relative + '|' + digest)
    payload = ('OCDB-FUTURE-RELEASE-ARTIFACT-V1\n' + '\n'.join(sorted(rows))).encode('ascii')
    return hashlib.sha256(payload).hexdigest()
