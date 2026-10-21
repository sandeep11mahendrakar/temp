"""Source closure + dependency inventory, validated from actual filesystem bytes.

No source list argument. AST imports must close over the compiled module set.
No source execution is needed to inventory it. Signature validation binds this
inventory, the lock, the verifier, the entry and the policy together. A local
attacker replacing the verifier/interpreter is outside this process's trust
boundary; an independently pinned launcher/runtime is still an external gate.
"""
from __future__ import annotations
import ast
import hashlib
import importlib.metadata
import json
import os
from pathlib import Path
import stat
import sys
import sysconfig
from policy import (SOURCE_PATHS, DATA_PATHS, STDLIB_IMPORTS,
                    THIRD_PARTY_IMPORTS, DEPENDENCIES)


class ClosureRejected(ValueError):
    pass


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=True).encode('ascii')


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def checked_file(path):
    """Reject links/junctions in every path component, including the root."""
    path = Path(os.path.abspath(path))
    for item in (path, *path.parents):
        info = item.lstat()
        if stat.S_ISLNK(info.st_mode) or getattr(info, 'st_reparse_tag', 0):
            raise ClosureRejected('LINK_OR_REPARSE_PATH')
    if not path.is_file():
        raise ClosureRejected('MISSING_FILE')
    return path


def file_hash(path):
    return sha(checked_file(path).read_bytes())


def source_closure(root):
    root = Path(os.path.abspath(root))
    expected = set(SOURCE_PATHS)
    for item in (root / 'src').iterdir():
        info = item.lstat()
        if not stat.S_ISREG(info.st_mode) or getattr(info, 'st_reparse_tag', 0):
            raise ClosureRejected('UNEXPECTED_SOURCE_DIRECTORY_OR_LINK')
    actual = {p.relative_to(root).as_posix() for p in (root / 'src').rglob('*') if p.is_file()}
    # Bytecode cannot be used to sneak around source integrity. Run with -B.
    if actual != expected - {'entry.py'}:
        raise ClosureRejected('UNEXPECTED_OR_MISSING_SOURCE')
    if sorted(p.name for p in (root / 'data').iterdir()) != ['case_plan.json', 'migration.sql']:
        raise ClosureRejected('UNEXPECTED_DATA')
    modules = {Path(p).stem: p for p in SOURCE_PATHS}
    edges = {}
    for relative in SOURCE_PATHS:
        node = ast.parse(checked_file(root / relative).read_bytes())
        imports = set()
        for item in ast.walk(node):
            if isinstance(item, ast.Import):
                imports.update(alias.name for alias in item.names)
            if isinstance(item, ast.ImportFrom):
                if item.level or not item.module:
                    raise ClosureRejected('RELATIVE_IMPORT_DISALLOWED')
                imports.add(item.module)
            if isinstance(item, ast.Call):
                name = item.func.id if isinstance(item.func, ast.Name) else ''
                if name in ('__import__', 'eval', 'exec', 'compile'):
                    raise ClosureRejected('DYNAMIC_CODE_DISALLOWED')
        local = set()
        for name in imports:
            if name in modules:
                local.add(modules[name])
            elif name not in STDLIB_IMPORTS and name not in THIRD_PARTY_IMPORTS:
                raise ClosureRejected('UNEXPECTED_IMPORT')
        edges[relative] = sorted(local)
    visited = set()

    def visit(relative):
        if relative in visited:
            return
        visited.add(relative)
        for child in edges[relative]:
            visit(child)

    visit('entry.py')
    if visited != expected:
        raise ClosureRejected('UNREACHABLE_DECLARED_SOURCE')
    return edges


def dependency_inventory():
    """Bind entire installed distributions, not just imported top-level modules.

    Includes native extension bytes, dist-info metadata and all dependency
    package members. Never imports a dependency to generate the inventory.
    Version/Requires-Dist changes and added unrecorded package files reject.
    The stdlib/interpreter tree is also hashed, excluding site-packages/cache.
    No binary or dependency is copied into this candidate.
    """
    distributions = {}
    site = Path(sysconfig.get_path('purelib'))
    for name, version in sorted(DEPENDENCIES.items()):
        matches = [d for d in importlib.metadata.distributions(path=[str(site)])
                   if d.metadata['Name'].lower().replace('_', '-') == name]
        if len(matches) != 1:
            raise ClosureRejected('DEPENDENCY_MISSING_OR_AMBIGUOUS')
        dist = matches[0]
        if dist.version != version or not dist.files:
            raise ClosureRejected('DEPENDENCY_VERSION_OR_RECORD')
        files = {}
        scripts = {}
        for member in dist.files:
            rel = Path(str(member))
            if rel.is_absolute() or '..' in rel.parts:
                # Installed cffi records this exact Windows helper. Pin it
                # separately; never generalize traversal to arbitrary paths.
                if name == 'cffi' and rel.as_posix() == '../../Scripts/cffi-gen-src.exe':
                    scripts['Scripts/cffi-gen-src.exe'] = file_hash(Path(sys.base_prefix) / 'Scripts/cffi-gen-src.exe')
                    continue
                raise ClosureRejected('DEPENDENCY_PATH_ESCAPE')
            files[rel.as_posix()] = file_hash(dist.locate_file(member))
        # RECORD alone must not hide added files under package directories.
        tops = {Path(p).parts[0] for p in files}
        actual = set()
        for top in tops:
            path = site / top
            for p in ([path] if path.is_file() else path.rglob('*')):
                if p.is_file():
                    checked_file(p)
                    actual.add(p.relative_to(site).as_posix())
        if actual != set(files):
            raise ClosureRejected('UNRECORDED_DEPENDENCY_FILE')
        distributions[name] = {'version': version, 'requires': sorted(dist.requires or []), 'files': files, 'scripts': scripts}
    stdlib = Path(sysconfig.get_path('stdlib'))
    runtime_files = {}
    for directory, dirs, names in os.walk(stdlib, followlinks=False):
        dirs[:] = sorted(d for d in dirs if d != 'site-packages')
        for d in dirs:
            info = (Path(directory) / d).lstat()
            if stat.S_ISLNK(info.st_mode) or getattr(info, 'st_reparse_tag', 0):
                raise ClosureRejected('RUNTIME_DIRECTORY_LINK')
        for name in sorted(names):
            p = Path(directory) / name
            runtime_files['stdlib/' + p.relative_to(stdlib).as_posix()] = file_hash(p)
    # Windows binary extensions and runtime DLLs live outside Lib/.
    for directory in (Path(sys.base_prefix) / 'DLLs',):
        if directory.is_dir():
            for p in directory.rglob('*'):
                if p.is_file():
                    runtime_files['DLLs/' + p.relative_to(directory).as_posix()] = file_hash(p)
    for p in Path(sys.base_prefix).glob('*.dll'):
        runtime_files[p.name] = file_hash(p)
    runtime_files['interpreter'] = file_hash(sys.executable)
    return {'schema': 1, 'python': sys.version, 'platform': sys.platform,
            'implementation': sys.implementation.name, 'distributions': distributions,
            'runtime_files': runtime_files}


def artifact_inventory(root, *, verify_dependencies=True):
    root = Path(root)
    edges = source_closure(root)
    rows = {p: file_hash(root / p) for p in SOURCE_PATHS + DATA_PATHS}
    if verify_dependencies:
        expected = json.loads(checked_file(root / 'dependency.lock.json').read_bytes())
        if canonical(expected) != canonical(dependency_inventory()):
            raise ClosureRejected('DEPENDENCY_LOCK_MISMATCH')
    # Disabling dependency checks is an inventory/test API only, never entry authorization.
    digest = sha(b'OCDB-R6-CLOSURE-V1\n' + canonical({'files': rows, 'imports': edges}))
    return {'sha256': digest, 'files': rows, 'imports': edges}
