"""Disarmed entrypoint. python -I -S -B entry.py; no environment/release lookup."""
from pathlib import Path
import sys
import sysconfig

ROOT = Path(__file__).absolute().parent
sys.dont_write_bytecode = True
if not sys.flags.isolated or not sys.flags.no_site:
    print('BLOCKED_REQUIRES_ISOLATED_NO_SITE_LAUNCH')
    raise SystemExit(2)
sys.path.insert(0, str(ROOT / 'src'))
from closure import artifact_inventory
# Do not process .pth/sitecustomize hooks. Add only the locally locked package
# location after verifying its files. No environment-supplied search locations.
try:
    artifact_inventory(ROOT)
except Exception:
    print('BLOCKED_SOURCE_OR_DEPENDENCY_INTEGRITY')
    raise SystemExit(2)
sys.path.append(sysconfig.get_path('purelib'))
from approved_entry import gate_then_run


def main():
    # Do not load credentials, accept SQL or select a transport. Missing external
    # authority remains a blocker even if all local integrity checks succeed.
    try:
        gate_then_run(ROOT, {})
    except Exception:
        print('BLOCKED_OFFLINE_CANDIDATE_NO_EXTERNAL_RELEASE_OR_PLATFORM_CLEARANCE')
        return 2
    return 2


if __name__ == '__main__':
    raise SystemExit(main())
