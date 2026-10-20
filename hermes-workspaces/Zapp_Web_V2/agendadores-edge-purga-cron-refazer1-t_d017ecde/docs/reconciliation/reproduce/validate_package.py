#!/usr/bin/env python3
"""Check this reconciliation package; optionally save its fixed validation report."""
import argparse
import collections
import gzip
import hashlib
import json
import os
import pathlib
import re
import subprocess
import tempfile


PACKAGE_ROOT = pathlib.Path(__file__).resolve().parents[1]
REPORT_PATH = 'evidence/artifact-validation.json'
SCOPE = 'Package integrity only. Does not execute product code, tests, network calls or SQL.'


def relative_path(value, label):
    """Accept plain relative POSIX paths, with no traversal or Git syntax."""
    if not isinstance(value, str) or not value:
        raise ValueError(label + ': expected a relative path')
    if any(ord(char) < 32 or ord(char) == 127 for char in value):
        raise ValueError(label + ': control characters are not allowed')
    path = pathlib.PurePosixPath(value)
    if (path.is_absolute() or value.startswith('-') or '\\' in value or ':' in value
            or any(part in ('', '.', '..') for part in value.split('/'))):
        raise ValueError(label + ': unsafe relative path')
    return path


def within_package(candidate, label):
    """Resolve symlinks before checking containment in the fixed package root."""
    resolved = candidate.resolve()
    try:
        resolved.relative_to(PACKAGE_ROOT)
    except ValueError as exc:
        raise ValueError(label + ': path escapes the package root') from exc
    return resolved


def package_path(value, label, required=True):
    path = within_package(PACKAGE_ROOT.joinpath(*relative_path(value, label).parts), label)
    if required and not path.is_file():
        raise ValueError(label + ': expected an existing file')
    return path


def git_source(plan):
    """Only a pinned hexadecimal object ID and a plain repository path reach Git."""
    ref = plan.get('definition_ref')
    if not isinstance(ref, str) or re.fullmatch(r'[0-9a-fA-F]{7,40}', ref) is None:
        raise ValueError('Git source ref: expected a pinned 7-to-40-character hexadecimal ID')
    path = relative_path(plan.get('path'), 'Git source path')
    return ref + ':' + path.as_posix()


def git_executable():
    """Use a system executable, never a name resolved through the caller's PATH."""
    for candidate in (pathlib.Path('/usr/bin/git'), pathlib.Path('/bin/git')):
        if candidate.is_file() and os.access(candidate, os.X_OK):
            return str(candidate.resolve(strict=True))
    raise ValueError('Source validation requires system Git at /usr/bin/git or /bin/git')


def report_destination():
    evidence = PACKAGE_ROOT / 'evidence'
    target = evidence / 'artifact-validation.json'
    if evidence.is_symlink() or not evidence.is_dir() or target.is_symlink():
        raise ValueError('Validation report: evidence must be a real directory and target must not be a symlink')
    package_path(REPORT_PATH, 'Validation report', required=False)
    return target


def save_report(contents):
    """Replace only the fixed report; do not follow an existing target or hard link."""
    target = report_destination()
    temporary = None
    try:
        with tempfile.NamedTemporaryFile(mode='w', encoding='utf-8', dir=target.parent,
                                         prefix='.artifact-validation-', suffix='.tmp', delete=False) as output:
            temporary = pathlib.Path(output.name)
            output.write(contents)
        os.replace(temporary, target)
    finally:
        if temporary is not None:
            temporary.unlink(missing_ok=True)


def load(path):
    return json.loads(path.read_text(encoding='utf-8'))


def validate(repo=None):
    errors, checks = [], {}

    def require(ok, label):
        checks[label] = bool(ok)
        if not ok:
            errors.append(label)

    master = load(package_path('MASTER_LEDGER.json', 'Master ledger'))
    registry = load(package_path('PLAN_REGISTRY.json', 'Plan registry'))
    full_path = package_path(master['complete_requirements_and_assessments'], 'Complete ledger')
    full = json.loads(gzip.decompress(full_path.read_bytes()))
    findings = load(package_path('FINDINGS.json', 'Findings'))['findings']
    plans = registry['plans']
    by_id = {task['id']: task for task in full}

    # Preflight every data-supplied path/ref before reading source objects with Git.
    plan_files, sources = {}, {}
    for plan in plans:
        relative_path(plan['path'], 'Plan source path')
        plan_files[plan['record_id']] = package_path(plan['task_file'], 'Plan task file')
        if plan.get('source_kind') != 'EXTERNAL_USER_DOCUMENT':
            sources[plan['record_id']] = git_source(plan)
    manifest = package_path('evidence/ARTIFACT_MANIFEST.json', 'Artifact manifest', required=False)
    entries = load(manifest)['files'] if manifest.exists() else []
    artifacts = [(entry, package_path(entry['path'], 'Manifest entry', required=False)) for entry in entries]

    require(len(full) == len(by_id) == master['coverage']['task_records'], 'unique_and_complete_task_ids')
    require(collections.Counter(task['status'] for task in full) == master['status_counts'], 'status_counts')
    require(len(plans) == registry['resolved_plans'] == master['coverage']['source_plans_resolved'], 'plan_counts')
    require(all(task.get('rationale') for task in full), 'nonempty_assessments')
    require(len({finding['id'] for finding in findings}) == len(findings), 'unique_finding_ids')
    compact = []
    for plan in plans:
        packet = load(plan_files[plan['record_id']])
        rows = packet['tasks']
        compact.extend(rows)
        require(packet['plan'] == plan and len(rows) == plan['observed_tasks'], 'plan_' + plan['record_id'])
        require(collections.Counter(task['status'] for task in rows) == plan['status_counts'], 'plan_status_' + plan['record_id'])
    require({task['canonical_id'] for task in compact} == set(by_id), 'compact_and_full_ids_match')
    dimensions = ('implementation', 'testing', 'runtime', 'documentation', 'acceptance')
    require(all(all(task.get(key) for key in dimensions) for task in compact), 'five_evidence_dimensions')
    require(all(task['status'] == by_id[task['canonical_id']]['status'] for task in compact), 'compact_and_full_status_match')
    current = {'CURRENT_REFERENCE', 'CURRENT_EXTERNAL_REFERENCE', 'CROSS_MODULE_REFERENCE_PROGRAM',
               'OVERLAPPING_CURRENT_REFERENCES', 'ARCHITECTURE_DECISION_REQUIRED',
               'OFF_MAIN_REFERENCE_WITH_SEPARATE_DELIVERIES'}
    require(all(task['review_level'] != 'LINEAGE_AND_SOURCE_RECONCILIATION_ONLY'
                for task in full if task['authority'] in current), 'all_current_sources_have_individual_assessments')
    for finding in findings:
        for ref in finding.get('affected_task_keys', []):
            if ref.get('status') == 'UNRESOLVED_REFERENCE':
                continue
            cid = ref.get('canonical_id')
            require(cid in by_id, 'finding_ref_' + finding['id'] + '_' + str(cid))

    json_count = gzip_count = 0
    for path in PACKAGE_ROOT.rglob('*'):
        if not path.is_file():
            continue
        safe_path = within_package(path, 'Package inventory file')
        if path.suffix == '.json':
            load(safe_path)
            json_count += 1
        if path.name.endswith('.json.gz'):
            json.loads(gzip.decompress(safe_path.read_bytes()))
            gzip_count += 1
    broken = []
    for path in PACKAGE_ROOT.rglob('*.md'):
        # Exact historical sources retain their original links, not package-relative links.
        if any(part in ('history', 'sources') for part in path.relative_to(PACKAGE_ROOT).parts):
            continue
        safe_path = within_package(path, 'Markdown file')
        for target in re.findall(r'(?<!!)\[[^\]\n]*\]\(([^)]+)\)', safe_path.read_text(encoding='utf-8')):
            relative = target.split('#', 1)[0]
            if not relative or ':' in relative or relative.startswith('//'):
                continue
            # Markdown may use ../ when its resolved destination remains inside the package.
            linked = within_package(path.parent / relative, 'Markdown target')
            if not linked.exists():
                broken.append({'file': path.relative_to(PACKAGE_ROOT).as_posix(), 'target': relative})
    require(not broken, 'active_markdown_link_targets')

    source_refs = source_ranges = 0
    if repo is not None:
        repo = repo.resolve(strict=True)
        if not repo.is_dir():
            raise ValueError('Source checkout: expected a directory')
        executable = git_executable()
        for plan in plans:
            if plan.get('source_kind') == 'EXTERNAL_USER_DOCUMENT':
                raw = package_path('sources/Plano_Dashboard_100_Etapas_2026-09-30.md', 'External source').read_bytes()
                require(hashlib.sha256(raw).hexdigest() == plan['source_sha256'], 'source_hash_' + plan['record_id'])
            else:
                proc = subprocess.run(
                    [executable, '--no-pager', '--no-replace-objects', 'show', '--no-ext-diff',
                     '--no-textconv', '--end-of-options', sources[plan['record_id']]],
                    cwd=repo, capture_output=True, check=False, timeout=30)
                require(proc.returncode == 0, 'source_read_' + plan['record_id'])
                if proc.returncode:
                    continue
                raw = proc.stdout
                # Git's SHA-1 blob identity is a protocol identifier, not a security primitive.
                # Integrity of delivered artifact bytes is checked separately with SHA-256.
                blob = hashlib.sha1(b'blob ' + str(len(raw)).encode() + b'\0' + raw,
                                    usedforsecurity=False).hexdigest()
                if plan.get('source_sha'):
                    require(blob == plan['source_sha'], 'source_hash_' + plan['record_id'])
            source_refs += 1
            lines = raw.decode('utf-8').splitlines()
            for task in full:
                if task['plan_path'] != plan['path']:
                    continue
                start, end = task['line'], task.get('end_line', task['line'])
                require(1 <= start <= end <= len(lines), 'source_range_' + task['id'])
                source_ranges += 1

    manifest_checked = 0
    for entry, path in artifacts:
        require(path.is_file(), 'artifact_exists_' + entry['path'])
        if path.is_file():
            require(hashlib.sha256(path.read_bytes()).hexdigest() == entry['sha256'], 'artifact_hash_' + entry['path'])
            manifest_checked += 1
    return {'result': 'PASS' if not errors else 'FAIL', 'baseline_main_sha': master['baseline_main_sha'],
            'task_records': len(full), 'plans': len(plans), 'findings': len(findings), 'checks': len(checks),
            'json_files_parsed': json_count, 'gzip_json_files_parsed': gzip_count,
            'source_refs_checked': source_refs, 'source_ranges_checked': source_ranges,
            'artifact_hashes_checked': manifest_checked, 'errors': errors,
            'broken_active_markdown_links': broken, 'scope': SCOPE}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--repo', type=pathlib.Path, help='Optional checkout containing all pinned Git source objects.')
    parser.add_argument('--output', action='store_true', help='Also save evidence/artifact-validation.json inside this package.')
    args = parser.parse_args()
    try:
        if args.output:
            report_destination()
        report = validate(args.repo)
        output = json.dumps(report, ensure_ascii=False, indent=2) + '\n'
        if args.output:
            save_report(output)
    except (ValueError, OSError, KeyError, TypeError, UnicodeError, subprocess.SubprocessError) as exc:
        report = {'result': 'FAIL', 'errors': [str(exc)], 'scope': SCOPE}
        output = json.dumps(report, ensure_ascii=False, indent=2) + '\n'
    print(output, end='')
    return int(report['result'] != 'PASS')


if __name__ == '__main__':
    raise SystemExit(main())
