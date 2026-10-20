#!/usr/bin/env python3
"""Strict integrity check for this dated extension, optionally composed with R2.
No network, database access, imports of product code, or file writes.
"""
from __future__ import annotations
import argparse
import hashlib
import json
import pathlib
import re
import sys

BASE_MANIFEST = 'evidence/ARTIFACT_MANIFEST.json'
BASE_BLOB = '5c58c0fca1690c70bd06c8bbd91d3dae17c00100'
EXTENSION = 'reaudit/2026-10-04-delta-65679f3'
MANIFEST = 'MANIFEST.json'


def blob_sha(raw: bytes) -> str:
    return hashlib.sha1(b'blob ' + str(len(raw)).encode('ascii') + b'\0' + raw).hexdigest()


def safe_file(root: pathlib.Path, relative: str) -> pathlib.Path:
    if not isinstance(relative, str) or not relative or '\\' in relative:
        raise ValueError('Invalid relative path')
    name = pathlib.PurePosixPath(relative)
    if name.is_absolute() or '..' in name.parts or name.as_posix() != relative or ':' in relative:
        raise ValueError('Noncanonical or escaping path: ' + relative)
    candidate = root
    for part in name.parts:
        candidate = candidate / part
        if candidate.is_symlink():
            raise ValueError('Symlink rejected: ' + relative)
    if not candidate.is_file():
        raise ValueError('Missing file: ' + relative)
    return candidate


def inventory(root: pathlib.Path) -> set[str]:
    files: set[str] = set()
    for item in root.rglob('*'):
        if item.is_symlink():
            raise ValueError('Symlink rejected: ' + item.relative_to(root).as_posix())
        if item.is_file():
            files.add(item.relative_to(root).as_posix())
    return files


def check_manifest(root: pathlib.Path, manifest_name: str) -> tuple[set[str], int]:
    manifest_path = safe_file(root, manifest_name)
    data = json.loads(manifest_path.read_text(encoding='utf-8'))
    entries = data.get('files')
    if not isinstance(entries, list) or not entries:
        raise ValueError('Manifest requires a nonempty files list')
    paths: set[str] = set()
    byte_count = 0
    for entry in entries:
        name = entry.get('path')
        if name == manifest_name or not isinstance(name, str) or name in paths:
            raise ValueError('Duplicate, invalid or self-referential manifest path')
        path = safe_file(root, name)
        raw = path.read_bytes()
        if type(entry.get('bytes')) is not int or entry['bytes'] != len(raw):
            raise ValueError('Byte count mismatch: ' + name)
        expected = entry.get('sha256')
        if not isinstance(expected, str) or not re.fullmatch('[a-f0-9]{64}', expected):
            raise ValueError('Invalid SHA256: ' + name)
        if hashlib.sha256(raw).hexdigest() != expected:
            raise ValueError('SHA256 mismatch: ' + name)
        if entry.get('git_blob_sha') and blob_sha(raw) != entry['git_blob_sha']:
            raise ValueError('Git blob mismatch: ' + name)
        paths.add(name)
        byte_count += len(raw)
    if type(data.get('file_count')) is not int or data['file_count'] != len(paths):
        raise ValueError('Manifest file_count mismatch')
    if type(data.get('bytes_of_hashed_files')) is not int or data['bytes_of_hashed_files'] != byte_count:
        raise ValueError('Manifest bytes_of_hashed_files mismatch')
    return paths, byte_count


def verify(root: pathlib.Path, audit_root: pathlib.Path | None = None) -> dict:
    if root.is_symlink():
        raise ValueError('Bundle root cannot be a symlink')
    root = root.resolve(strict=True)
    paths, size = check_manifest(root, MANIFEST)
    actual = inventory(root)
    expected = paths | {MANIFEST}
    if actual != expected:
        raise ValueError('Bundle file set mismatch; extra=' + repr(sorted(actual - expected))
                         + '; missing=' + repr(sorted(expected - actual)))
    result = {'result': 'PASS', 'extension_hashes_checked': len(paths),
              'extension_bytes_checked': size, 'historical_package_checked': False}
    if audit_root is not None:
        if audit_root.is_symlink():
            raise ValueError('Audit root cannot be a symlink')
        audit_root = audit_root.resolve(strict=True)
        if root != audit_root / EXTENSION:
            raise ValueError('Extension must be at its declared path under audit_root')
        parent_raw = safe_file(audit_root, BASE_MANIFEST).read_bytes()
        if blob_sha(parent_raw) != BASE_BLOB:
            raise ValueError('Historical manifest differs from pinned R2; reconciliation required')
        previous, previous_bytes = check_manifest(audit_root, BASE_MANIFEST)
        combined = previous | {BASE_MANIFEST} | {EXTENSION + '/' + name for name in expected}
        if inventory(audit_root) != combined:
            raise ValueError('Composed R2 + extension file set mismatch')
        result.update(historical_package_checked=True,
                      historical_hashes_checked=len(previous),
                      historical_bytes_checked=previous_bytes,
                      historical_manifest_blob=BASE_BLOB)
    return result


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', type=pathlib.Path, default=pathlib.Path(__file__).parent)
    parser.add_argument('--audit-root', type=pathlib.Path,
                        help='Optional docs/reconciliation root; verifies every R2 artifact too')
    args = parser.parse_args()
    try:
        result = verify(args.root, args.audit_root)
    except (OSError, ValueError, TypeError, KeyError, AttributeError) as exc:
        print(json.dumps({'result': 'FAIL', 'error': str(exc)}, ensure_ascii=False))
        return 1
    print(json.dumps(result, indent=2, ensure_ascii=False))
    return 0


if __name__ == '__main__':
    sys.dont_write_bytecode = True
    raise SystemExit(main())
