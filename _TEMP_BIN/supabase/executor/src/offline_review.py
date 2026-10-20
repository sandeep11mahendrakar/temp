#!/usr/bin/env python3
"""Safe offline review utility: validates P59 custody and case coverage; no DB or network."""
from __future__ import annotations
import json
from pathlib import Path
from bundle_auth import pin_sources,artifact_digest
from case_catalog import catalog_digest

if __name__=='__main__':
    root=Path(__file__).resolve().parent.parent
    src=pin_sources(root)
    print(json.dumps({
        'mode':'OFFLINE_STATIC_REVIEW_ONLY',
        'source_revision':src['p59_revision'],
        'file_hashes_match':src['p59_files_count'],
        'exact_case_ids':src['cases_exact'],
        'case_catalog_sha256':catalog_digest(),
        'executor_core_sha256':artifact_digest(root),
        'hosted_sql_executed':False,
        'migration_attempted':False,
        'release_key_configured':False
    },sort_keys=True,indent=2))
