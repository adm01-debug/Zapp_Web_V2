#!/usr/bin/env python3
"""Synthetic controls for the extension verifier; never validate the live database."""
from __future__ import annotations
import hashlib
import json
import pathlib
import sys
import tempfile
import unittest
sys.dont_write_bytecode = True
import verify_bundle as checker


class IntegrityTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp = tempfile.TemporaryDirectory(prefix='zapp-strict-manifest-')
        self.addCleanup(self.temp.cleanup)
        self.root = pathlib.Path(self.temp.name)
        (self.root / 'evidence.txt').write_text('synthetic evidence\n', encoding='utf-8')
        raw = (self.root / 'evidence.txt').read_bytes()
        self.manifest = {'files': [{'path': 'evidence.txt', 'bytes': len(raw),
                                    'sha256': hashlib.sha256(raw).hexdigest()}],
                         'file_count': 1, 'bytes_of_hashed_files': len(raw)}
        self.save()

    def save(self) -> None:
        (self.root / checker.MANIFEST).write_text(json.dumps(self.manifest), encoding='utf-8')

    def test_complete_manifest_passes(self) -> None:
        self.assertEqual(checker.verify(self.root)['result'], 'PASS')

    def test_missing_manifest_rejected(self) -> None:
        (self.root / checker.MANIFEST).unlink()
        with self.assertRaises(ValueError):
            checker.verify(self.root)

    def test_unlisted_extra_rejected(self) -> None:
        (self.root / 'extra.txt').write_text('not listed', encoding='utf-8')
        with self.assertRaises(ValueError):
            checker.verify(self.root)

    def test_duplicate_entry_rejected(self) -> None:
        self.manifest['files'].append(dict(self.manifest['files'][0]))
        self.manifest['file_count'] = 2
        self.manifest['bytes_of_hashed_files'] *= 2
        self.save()
        with self.assertRaises(ValueError):
            checker.verify(self.root)

    def test_wrong_totals_rejected(self) -> None:
        self.manifest['file_count'] = 999
        self.save()
        with self.assertRaises(ValueError):
            checker.verify(self.root)

    def test_modified_evidence_rejected(self) -> None:
        (self.root / 'evidence.txt').write_text('changed', encoding='utf-8')
        with self.assertRaises(ValueError):
            checker.verify(self.root)

    def test_missing_listed_file_rejected(self) -> None:
        (self.root / 'evidence.txt').unlink()
        with self.assertRaises(ValueError):
            checker.verify(self.root)

    def test_parent_traversal_rejected(self) -> None:
        self.manifest['files'][0]['path'] = '../evidence.txt'
        self.save()
        with self.assertRaises(ValueError):
            checker.verify(self.root)

    def test_composed_synthetic_parent(self) -> None:
        with tempfile.TemporaryDirectory(prefix='zapp-parent-') as temp:
            parent = pathlib.Path(temp)
            historical = parent / 'old.txt'
            historical.write_bytes(b'old evidence')
            raw = historical.read_bytes()
            old = {'file_count': 1, 'bytes_of_hashed_files': len(raw), 'files': [
                {'path': 'old.txt', 'bytes': len(raw), 'sha256': hashlib.sha256(raw).hexdigest()}]}
            old_path = parent / checker.BASE_MANIFEST
            old_path.parent.mkdir(parents=True)
            old_path.write_text(json.dumps(old), encoding='utf-8')
            extension = parent / checker.EXTENSION
            extension.mkdir(parents=True)
            for source in self.root.iterdir():
                (extension / source.name).write_bytes(source.read_bytes())
            previous_blob = checker.BASE_BLOB
            checker.BASE_BLOB = checker.blob_sha(old_path.read_bytes())
            try:
                result = checker.verify(extension, parent)
                self.assertTrue(result['historical_package_checked'])
                historical.write_bytes(b'tampered')
                with self.assertRaises(ValueError):
                    checker.verify(extension, parent)
            finally:
                checker.BASE_BLOB = previous_blob


if __name__ == '__main__':
    unittest.main(verbosity=2)
