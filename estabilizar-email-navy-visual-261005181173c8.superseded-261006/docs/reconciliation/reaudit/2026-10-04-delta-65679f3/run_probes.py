#!/usr/bin/env python3
"""Reproduce seven original-validator scenarios and four original Node tests.
Reads pinned Git objects or verified source copies. No network or product writes.
"""
from __future__ import annotations
import argparse
import hashlib
import json
import os
import pathlib
import platform
import shutil
import subprocess
import sys
import tempfile

CODE_PIN = '65679f38d400f7edc6a071f68554dd3b0372f03f'
AUDIT_PIN = 'dc2d19ee5bd018e1aebaf6c66211657218bc6b51'
FILES = [
    (AUDIT_PIN, 'docs/reconciliation/reproduce/validate_package.py', 'reproduce/validate_package.py',
     '4c40b6ec8b22684a81ecc507b72867fc79216a85645a550e42daf079e1e0bdbe'),
    (CODE_PIN, 'scripts/edge-deploy/deployment-record.mjs', 'scripts/edge-deploy/deployment-record.mjs',
     '65a5490f7299537e3bc60e56463a21b27eb319613ced196ba771d414c3d4ca90'),
    (CODE_PIN, 'scripts/edge-deploy/register-deployment.mjs', 'scripts/edge-deploy/register-deployment.mjs',
     '0a56ca6a0ec5652efe0adef19bfdbf797dc4d935f25a36a781f3f62325471488'),
    (CODE_PIN, 'scripts/edge-deploy/log-injection.unit.mjs', 'scripts/edge-deploy/log-injection.unit.mjs',
     '9b453c7a52fa3101e54b3092820b520a52ba0f7dea1a741f8de60d364dbd55fb'),
]


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument('--repo', type=pathlib.Path, help='Local repository with both pinned Git revisions')
    group.add_argument('--sources', type=pathlib.Path, help='Verified original/ directory included in the ZIP')
    args = parser.parse_args()
    node = shutil.which('node')
    git = shutil.which('git') if args.repo else None
    if not node or (args.repo and not git):
        raise RuntimeError('Node is required; --repo also requires Git with the pinned revisions locally available')
    integrity = []
    with tempfile.TemporaryDirectory(prefix='zapp-r3-reproduce-') as temp:
        root = pathlib.Path(temp)
        for pin, path, local, expected in FILES:
            if args.repo:
                result = subprocess.run([git, '--no-pager', '-C', str(args.repo.resolve()),
                                         'show', '--no-ext-diff', pin + ':' + path],
                                        capture_output=True, timeout=20, check=False)
                if result.returncode:
                    raise RuntimeError('Pinned Git object unavailable: ' + pin + ':' + path)
                raw = result.stdout
            else:
                base = args.sources.resolve(strict=True)
                source = base / local
                if source.is_symlink() or not source.resolve(strict=True).is_relative_to(base):
                    raise RuntimeError('Source path escapes its declared directory')
                raw = source.read_bytes()
            sha = hashlib.sha256(raw).hexdigest()
            if sha != expected:
                raise RuntimeError('Source hash mismatch; refusing execution: ' + path)
            dest = root / local
            dest.parent.mkdir(parents=True, exist_ok=True)
            dest.write_bytes(raw)
            integrity.append({'ref': pin, 'path': path, 'bytes': len(raw), 'sha256': sha,
                              'git_blob_sha': hashlib.sha1(b'blob ' + str(len(raw)).encode()
                                                           + b'\0' + raw).hexdigest()})
        env = {key: value for key, value in os.environ.items()
               if key in ('PATH', 'SystemRoot', 'WINDIR', 'LANG', 'LC_ALL')}
        env.update(HOME=str(root), TMPDIR=str(root), TEMP=str(root), TMP=str(root),
                   PYTHONDONTWRITEBYTECODE='1')
        script = pathlib.Path(__file__).with_name('reproduce_manifest_gap.py')
        audit = subprocess.run([sys.executable, '-B', str(script),
                                str(root / 'reproduce/validate_package.py')],
                               capture_output=True, text=True, env=env, timeout=30, check=False)
        if audit.returncode:
            raise RuntimeError('Original-validator reproduction failed: ' + audit.stderr[:500])
        audit_result = json.loads(audit.stdout)
        tested = subprocess.run([node, '--test', str(root / 'scripts/edge-deploy/log-injection.unit.mjs')],
                                capture_output=True, text=True, env=env, timeout=40, check=False)
        node_version = subprocess.run([node, '--version'], capture_output=True, text=True,
                                      env=env, timeout=5, check=True).stdout.strip()
        node_ok = tested.returncode == 0 and '# tests 4' in tested.stdout and '# pass 4' in tested.stdout
        result = {
            'reference_date': '2026-10-04',
            'code_pin': CODE_PIN, 'audit_pin': AUDIT_PIN,
            'runtime': {'python': platform.python_version(), 'node': node_version},
            'source_integrity': integrity,
            'original_validator': audit_result,
            'node_regression': {'original_test_file_executed': True, 'fetch_stubbed_by_original_tests': True,
                                'exit_code': tested.returncode, 'four_tests_passed': node_ok,
                                'stdout': tested.stdout, 'stderr': tested.stderr},
            'all_reproductions_matched': audit_result['all_reproductions_matched'] and node_ok,
            'production_accessed': False, 'database_executed': False, 'n8n_workflow_executed': False,
            'warning': 'A reproduced validator PASS can be the defect. These results do not certify the full R2 package or production.',
        }
        print(json.dumps(result, indent=2, ensure_ascii=False))
        return 0 if result['all_reproductions_matched'] else 1


if __name__ == '__main__':
    sys.dont_write_bytecode = True
    try:
        raise SystemExit(main())
    except (OSError, ValueError, RuntimeError, subprocess.SubprocessError) as exc:
        print(json.dumps({'result': 'FAIL', 'error': str(exc)}, ensure_ascii=False), file=sys.stderr)
        raise SystemExit(1)
