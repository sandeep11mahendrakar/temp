"""Offline tests only. Generates ephemeral signing keys in memory; no hosted IO."""
from pathlib import Path
import sys
import unittest

ROOT = Path(__file__).absolute().parent
sys.dont_write_bytecode = True
sys.path.insert(0, str(ROOT / 'src'))
sys.path.insert(0, str(ROOT))

if __name__ == '__main__':
    suite = unittest.defaultTestLoader.discover(str(ROOT / 'tests'), pattern='test_*.py', top_level_dir=str(ROOT))
    result = unittest.TextTestRunner(verbosity=2).run(suite)
    raise SystemExit(0 if result.wasSuccessful() else 1)
