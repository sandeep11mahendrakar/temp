"""Read-only inventory checker. An inventory is not signer/platform approval."""
from pathlib import Path
import hashlib
import json

ROOT = Path(__file__).absolute().parents[1]


def main():
    manifest = json.loads((ROOT / 'SHA256_MANIFEST.json').read_bytes())
    actual = {}
    for path in ROOT.rglob('*'):
        if path.is_file() and path.name != 'SHA256_MANIFEST.json':
            actual[path.relative_to(ROOT).as_posix()] = hashlib.sha256(path.read_bytes()).hexdigest()
    if actual != manifest['files']:
        raise SystemExit('PIN_MISMATCH')
    rows = '\n'.join(p + '|' + actual[p] for p in sorted(actual)).encode('ascii')
    if hashlib.sha256(rows).hexdigest() != manifest['aggregate_sha256']:
        raise SystemExit('AGGREGATE_MISMATCH')
    print('PIN_MATCH files=' + str(len(actual)) + ' aggregate=' + manifest['aggregate_sha256'])


if __name__ == '__main__': main()
