#!/usr/bin/env python3
"""Execute the pinned original audit validator on isolated synthetic packages.
No network, repository writes or product/database execution occurs.
"""
from __future__ import annotations
import argparse
import gzip
import hashlib
import importlib.util
import json
import pathlib
import sys
import tempfile

EXPECTED_SOURCE_SHA256 = '4c40b6ec8b22684a81ecc507b72867fc79216a85645a550e42daf079e1e0bdbe'
PIN = 'dc2d19ee5bd018e1aebaf6c66211657218bc6b51'

def put_json(root: pathlib.Path, name: str, obj: object) -> None:
    path = root / name
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

def seed(root: pathlib.Path) -> None:
    plan = {
        'record_id': 'P001', 'path': 'README.md', 'definition_ref': 'a' * 40,
        'task_file': 'tasks/P001.json', 'observed_tasks': 1,
        'status_counts': {'PARTIAL': 1}, 'source_kind': 'GIT',
    }
    put_json(root, 'MASTER_LEDGER.json', {
        'baseline_main_sha': 'a' * 40,
        'complete_requirements_and_assessments': 'evidence/TASK_LEDGER_FULL.json.gz',
        'coverage': {'task_records': 1, 'source_plans_resolved': 1},
        'status_counts': {'PARTIAL': 1},
    })
    put_json(root, 'PLAN_REGISTRY.json', {'resolved_plans': 1, 'plans': [plan]})
    full = [{
        'id': 'P001:T001', 'status': 'PARTIAL', 'rationale': 'Synthetic consistency fixture',
        'authority': 'CURRENT_REFERENCE', 'review_level': 'INDIVIDUAL',
        'plan_path': 'README.md', 'line': 1,
    }]
    (root / 'evidence').mkdir(exist_ok=True)
    (root / 'evidence/TASK_LEDGER_FULL.json.gz').write_bytes(
        gzip.compress(json.dumps(full).encode('utf-8'), mtime=0))
    compact = {'canonical_id': 'P001:T001', 'status': 'PARTIAL'}
    for dimension in ('implementation', 'testing', 'runtime', 'documentation', 'acceptance'):
        compact[dimension] = {'status': 'NOT_VERIFIED'}
    put_json(root, 'tasks/P001.json', {'plan': plan, 'tasks': [compact]})
    put_json(root, 'FINDINGS.json', {'findings': []})
    (root / 'README.md').write_text('# Synthetic validation fixture\n', encoding='utf-8')

def add_complete_manifest(root: pathlib.Path) -> None:
    entries = []
    for path in sorted(root.rglob('*')):
        if path.is_file() and path.name != 'ARTIFACT_MANIFEST.json':
            raw = path.read_bytes()
            entries.append({'path': path.relative_to(root).as_posix(),
                            'bytes': len(raw), 'sha256': hashlib.sha256(raw).hexdigest()})
    put_json(root, 'evidence/ARTIFACT_MANIFEST.json', {
        'file_count': len(entries), 'bytes_of_hashed_files': sum(e['bytes'] for e in entries),
        'files': entries,
    })

def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('validator', type=pathlib.Path, help='Unchanged original validate_package.py')
    parser.add_argument('--output', type=pathlib.Path)
    args = parser.parse_args()
    source = args.validator.resolve(strict=True)
    raw = source.read_bytes()
    digest = hashlib.sha256(raw).hexdigest()
    if digest != EXPECTED_SOURCE_SHA256:
        raise SystemExit('Source hash mismatch; refusing to test a different validator')
    spec = importlib.util.spec_from_file_location('pinned_audit_validator', source)
    if spec is None or spec.loader is None:
        raise SystemExit('Could not load the verified validator')
    module = importlib.util.module_from_spec(spec)
    previous_cache_flag = sys.dont_write_bytecode
    sys.dont_write_bytecode = True
    try:
        spec.loader.exec_module(module)
    finally:
        sys.dont_write_bytecode = previous_cache_flag
    cases = []
    definitions = [
        ('AUD-CTRL-01', 'complete_manifest', 'PASS'),
        ('AUD-REPRO-01', 'missing_manifest', 'PASS'),
        ('AUD-REPRO-02', 'extra_unlisted_file', 'PASS'),
        ('AUD-REPRO-03', 'duplicate_manifest_entry', 'PASS'),
        ('AUD-REPRO-04', 'wrong_manifest_totals', 'PASS'),
        ('AUD-CTRL-02', 'tampered_listed_file', 'FAIL'),
        ('AUD-CTRL-03', 'missing_listed_file', 'FAIL'),
    ]
    for case_id, mode, expected_observed in definitions:
        with tempfile.TemporaryDirectory(prefix='zapp-manifest-audit-') as temp:
            root = pathlib.Path(temp)
            seed(root)
            if mode != 'missing_manifest':
                add_complete_manifest(root)
            if mode == 'extra_unlisted_file':
                (root / 'UNLISTED_EVIDENCE.txt').write_text('Unhashed additional evidence.\n', encoding='utf-8')
            elif mode in ('duplicate_manifest_entry', 'wrong_manifest_totals'):
                manifest_path = root / 'evidence/ARTIFACT_MANIFEST.json'
                manifest = json.loads(manifest_path.read_text(encoding='utf-8'))
                if mode == 'duplicate_manifest_entry':
                    manifest['files'].append(dict(manifest['files'][0]))
                    manifest['file_count'] = len(manifest['files'])
                    manifest['bytes_of_hashed_files'] = sum(e['bytes'] for e in manifest['files'])
                else:
                    manifest['file_count'] = 999
                    manifest['bytes_of_hashed_files'] = 0
                put_json(root, 'evidence/ARTIFACT_MANIFEST.json', manifest)
            elif mode == 'tampered_listed_file':
                (root / 'README.md').write_text('# Replaced after manifest generation\n', encoding='utf-8')
            elif mode == 'missing_listed_file':
                (root / 'README.md').unlink()
            module.PACKAGE_ROOT = root
            result = module.validate()
            cases.append({
                'id': case_id, 'scenario': mode, 'observed_result': result['result'],
                'expected_observed_result': expected_observed,
                'desired_integrity_result': 'FAIL' if case_id.startswith('AUD-REPRO') else expected_observed,
                'observed_matches_reproduction': result['result'] == expected_observed,
                'artifact_hashes_checked': result['artifact_hashes_checked'],
                'errors': result['errors'],
            })
    output = {
        'scope': 'Actual unmodified audit validator executed on isolated synthetic packages; not the complete real audit package.',
        'validator_pin': PIN, 'validator_path': 'docs/reconciliation/reproduce/validate_package.py',
        'validator_sha256': digest,
        'validator_git_blob': hashlib.sha1(b'blob ' + str(len(raw)).encode() + b'\0' + raw).hexdigest(),
        'cases': cases,
        'all_reproductions_matched': all(c['observed_matches_reproduction'] for c in cases),
        'product_code_changed': False, 'production_accessed': False,
    }
    text = json.dumps(output, indent=2, ensure_ascii=False) + '\n'
    print(text, end='')
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(text, encoding='utf-8')
    return 0 if output['all_reproductions_matched'] else 1

if __name__ == '__main__':
    raise SystemExit(main())
