#!/usr/bin/env python3
"""Validate and reconcile review artifacts without equating inventory with proof.

Reads the pinned product checkout and review files; writes only the audit output.
Usage: python consolidate_reaudit.py --source CHECKOUT --audit-root AUDIT \
         --prior PRIOR_DOCS --out AUDIT/consolidated [--allow-in-progress]
"""
from pathlib import Path
import argparse
import collections
import csv
import gzip
import hashlib
import json
import re
import subprocess

p = argparse.ArgumentParser(description=__doc__)
for arg in ('source', 'audit-root', 'prior', 'out'):
    p.add_argument('--' + arg, required=True)
p.add_argument('--allow-in-progress', action='store_true')
a = p.parse_args()
source, root, prior, out = [Path(x).resolve() for x in (a.source, a.audit_root, a.prior, a.out)]
out.mkdir(parents=True, exist_ok=True)

def read_json(path):
    return json.loads(path.read_text())

def sha256(data):
    return hashlib.sha256(data).hexdigest()

def blob_sha(data):
    return hashlib.sha1(b'blob ' + str(len(data)).encode() + b'\0' + data).hexdigest()

def save(name, obj, compress=False):
    data = (json.dumps(obj, ensure_ascii=False, indent=2) + '\n').encode()
    (out / name).write_bytes(data)
    if compress or len(data) > 200_000:
        with (out / (name + '.gz')).open('wb') as raw:
            with gzip.GzipFile(filename='', fileobj=raw, mode='wb', mtime=0) as f:
                f.write(data)

integrity_path = root / 'source-integrity.json'
integrity = read_json(integrity_path)
head = integrity['head_sha']
observed_head = subprocess.check_output(['git', '-C', str(source), 'rev-parse', 'HEAD'], text=True).strip()
assert observed_head == head, (observed_head, head)
tracked = {r['path']: r for r in integrity['files']}
contents = {}
errors = []
for path, entry in tracked.items():
    b = (source / path).read_bytes()
    if blob_sha(b) != entry['git_blob_sha'] or len(b) != entry['bytes']:
        errors.append({'kind': 'source_integrity', 'path': path})
    contents[path] = b
assert not errors, errors[:10]

previous_findings = read_json(prior / 'FINDINGS.json')['findings']
previous_ids = {re.sub(r'[^A-Z0-9]', '', f['id'].upper()): f['id'] for f in previous_findings}
prior_file_coverage = {r['path']: r for r in read_json(root / 'global/file-evidence-coverage.json')}
microfunctions = read_json(root / 'global/microfunctions.json')
microfiles = {r['path']: r for r in read_json(root / 'global/microfunction-files.json')}
delta = read_json(root / 'global/baseline-delta.json')
changed_paths = {r['path'] for r in delta['changed']}
prior_document_commit = '60a5c9fa6769dcd2b706ea33215f6f090d869a78'

def validate_reference(e, context, require_range=False):
    path = e.get('path')
    origin = e.get('origin', 'source')
    if not isinstance(path, str):
        errors.append({'kind': 'missing_path', 'context': context})
        return None
    if origin in ('previous_audit', 'prior_audit', 'prior'):
        q = prior / path
        b = q.read_bytes() if q.is_file() else None
        commit = prior_document_commit
        url_path = 'docs/reconciliation/' + path
        normalized_origin = 'PRIOR_AUDIT_ARTIFACT'
    else:
        b = contents.get(path)
        commit = head
        url_path = path
        normalized_origin = 'PINNED_SOURCE'
    if b is None:
        errors.append({'kind': 'unknown_path', 'context': context, 'path': path, 'origin': origin})
        return None
    lo = e.get('line_start', e.get('start_line', e.get('line')))
    hi = e.get('line_end', e.get('end_line', lo))
    if lo is not None:
        if not (isinstance(lo, int) and isinstance(hi, int) and 0 < lo <= hi <= len(b.splitlines())):
            errors.append({'kind': 'invalid_range', 'context': context, 'path': path, 'range': [lo, hi], 'lines': len(b.splitlines())})
            return None
    elif require_range:
        errors.append({'kind': 'missing_range', 'context': context, 'path': path})
        return None
    observed_blob, observed_sha256 = blob_sha(b), sha256(b)
    for key in ('blob_sha', 'git_blob_sha'):
        if e.get(key) and e[key] != observed_blob:
            errors.append({'kind': 'blob_hash_mismatch', 'context': context, 'path': path, 'field': key})
    for key in ('sha256', 'file_sha256'):
        if e.get(key) and e[key] != observed_sha256:
            errors.append({'kind': 'sha256_mismatch', 'context': context, 'path': path, 'field': key})
    anchor = f'#L{lo}-L{hi}' if lo else ''
    return {'path': path, 'origin': normalized_origin, 'line_start': lo, 'line_end': hi,
            'git_blob_sha': observed_blob, 'sha256': observed_sha256, 'commit': commit,
            'url': f'https://github.com/adm01-debug/Zapp_Web_V2/blob/{commit}/{url_path}{anchor}',
            'purpose': e.get('purpose', e.get('reason', e.get('claim', e.get('observation', e.get('note', ''))))),
            'symbol': e.get('symbol')}

review_ranges = collections.defaultdict(list)
declarations = collections.defaultdict(list)
report_files = []
normalized_findings = []
finding_ids = set()
source_evidence_count = 0
prior_evidence_count = 0

def add_review(path, lo, hi, area, level, basis, symbols=None):
    if path not in contents:
        errors.append({'kind': 'unknown_review_path', 'area': area, 'path': path})
        return
    if not isinstance(lo, int) or not isinstance(hi, int) or not 0 < lo <= hi <= len(contents[path].splitlines()):
        errors.append({'kind': 'review_range', 'area': area, 'path': path, 'range': [lo, hi]})
        return
    review_ranges[path].append({'line_start': lo, 'line_end': hi, 'area': area, 'review_level': level,
                                'basis': basis, 'symbols': symbols or []})

def as_text(value):
    if value is None:
        return ''
    if isinstance(value, str):
        return value
    if isinstance(value, list):
        return '\n'.join(as_text(v) for v in value)
    return json.dumps(value, ensure_ascii=False)

def state_of(f):
    raw = as_text(f.get('classification', f.get('status', f.get('state', '')))).lower()
    if 'refined_prior' in raw:
        return 'REFINEMENT_OF_PRIOR_FINDING'
    if 'hypoth' in raw or 'hipótese' in raw or 'hipotese' in raw:
        return 'HYPOTHESIS_REQUIRES_VALIDATION'
    if 'gap' in raw or 'lacuna' in raw:
        return 'GAP_OR_UNRESOLVED_CONTRACT'
    if 'confirm' in raw or raw in ('novo', 'new', 'refinado', 'refined'):
        return 'CONFIRMED_SOURCE_BEHAVIOR'
    return 'REVIEW_CLASSIFICATION_REQUIRED'

def prior_relationships(f):
    keys = ('prior_comparison', 'previous_audit_crosswalk', 'previous_finding_relationship',
            'related_previous_findings', 'related_findings', 'prior_finding_ids',
            'relation_to_prior_audit', 'previous_findings', 'prior_relationship')
    original = {k: f[k] for k in keys if k in f}
    text = as_text(original)
    found = []
    for normalized, canonical in previous_ids.items():
        flexible = r'[\s_-]*'.join(re.escape(c) for c in normalized)
        if re.search(r'(?<![A-Z0-9])' + flexible + r'(?![A-Z0-9])', text.upper()):
            found.append(canonical)
    return {'prior_finding_ids_located': sorted(found), 'source_assessment': original,
            'same_cause_not_assumed_from_shared_path': True}

for folder in sorted((root / 'reports').iterdir()):
    if not folder.is_dir():
        continue
    area = folder.name
    findings_path, coverage_path = folder / 'findings.json', folder / 'coverage.json'
    if not findings_path.is_file():
        continue
    d = read_json(findings_path)
    status = str(d.get('status', ''))
    if not a.allow_in_progress and ('IN_PROGRESS' in status.upper() or not d.get('findings')):
        errors.append({'kind': 'unfinished_report', 'area': area, 'status': status})
    for q in (findings_path, coverage_path):
        if q.is_file():
            report_files.append({'path': q.relative_to(root).as_posix(), 'sha256': sha256(q.read_bytes()), 'bytes': q.stat().st_size})
    for f in d.get('findings', []):
        fid = f['id']
        if fid in finding_ids:
            errors.append({'kind': 'duplicate_finding_id', 'id': fid})
        finding_ids.add(fid)
        priority = f.get('priority', f.get('severity'))
        if priority not in ('P0', 'P1', 'P2', 'P3'):
            errors.append({'kind': 'invalid_priority', 'id': fid, 'value': priority})
        evidence = []
        for e in f.get('evidence', []):
            v = validate_reference(e, fid)
            if v:
                evidence.append(v)
                if v['origin'] == 'PINNED_SOURCE':
                    source_evidence_count += 1
                    if v['line_start']:
                        add_review(v['path'], v['line_start'], v['line_end'], area, 'TARGETED', 'finding_evidence:' + fid)
                else:
                    prior_evidence_count += 1
        if not evidence:
            errors.append({'kind': 'finding_without_verified_evidence', 'id': fid})
        probes = f.get('probes', f.get('offline_probes', f.get('probe_ids', [])))
        if not probes and isinstance(f.get('offline_reproduction'), dict):
            probes = f['offline_reproduction'].get('probe_ids', [])
        normalized_findings.append({
            'id': fid, 'area': area, 'priority': priority, 'title': f['title'], 'review_state': state_of(f),
            'original_state': f.get('classification', f.get('status', f.get('state'))),
            'preconditions': f.get('preconditions', f.get('precondition', f.get('consumer_and_precondition', ''))),
            'consumer_chain': f.get('consumer_chain', f.get('consumer_flow', f.get('consumer_and_precondition', ''))),
            'observed_source_behavior': f.get('observed_behavior', f.get('failure_and_effect', f.get('cause', f.get('description', f.get('summary', ''))))),
            'impact': f.get('impact', f.get('observable_effect', f.get('effect', ''))),
            'acceptance': f.get('acceptance_criteria', f.get('acceptance', f.get('recommendation', []))),
            'limitations': f.get('limitations', f.get('runtime_unknowns_and_limits', [])),
            'evidence': evidence, 'offline_probe_ids': probes,
            'prior_relationships': prior_relationships(f),
            'current_delta_evidence_paths': sorted({e['path'] for e in evidence if e['origin'] == 'PINNED_SOURCE' and e['path'] in changed_paths}),
            'novel_discovery_does_not_mean_recent_regression': True,
            'source_report': findings_path.relative_to(root).as_posix(),
            'runtime_production_acceptance': 'NOT_PERFORMED',
        })
    if not coverage_path.is_file():
        errors.append({'kind': 'missing_coverage', 'area': area})
        continue
    c = read_json(coverage_path)
    rows = c.get('files', c.get('inventory', c.get('coverage', [])))
    for row in rows:
        path = row.get('path')
        level_raw = str(row.get('review_level', row.get('level', 'STRUCTURAL')))
        level = 'SEMANTIC' if 'semantic' in level_raw.lower() else 'TARGETED' if ('target' in level_raw.lower() or 'selected' in level_raw.lower()) else 'STRUCTURAL'
        if path not in tracked:
            errors.append({'kind': 'unknown_coverage_path', 'area': area, 'path': path})
            continue
        validate_reference(row, 'coverage:' + area)
        declarations[path].append({'area': area, 'declared_level': level, 'original_level': level_raw,
                                    'remaining_gaps': row.get('remaining_gaps', row.get('gaps', row.get('note'))),
                                    'basis': row.get('review_basis', row.get('scope'))})
        if level == 'STRUCTURAL':
            continue
        ranges = row.get('reviewed_ranges', row.get('ranges_read', []))
        if not ranges and isinstance(row.get('line_start'), int):
            ranges = [[row['line_start'], row.get('line_end', row['line_start'])]]
        if not ranges and level == 'SEMANTIC' and area == 'infra':
            # Infra's semantic declaration is explicitly whole-file; this is
            # a reviewer assertion, distinct from a mechanical read journal.
            ranges = [[1, row.get('lines', len(contents[path].splitlines()))]]
        for r in ranges:
            lo, hi = (r[0], r[1]) if isinstance(r, list) else (r.get('line_start', r.get('start_line')), r.get('line_end', r.get('end_line')))
            add_review(path, lo, hi, area, level, 'reviewer_coverage_declaration', row.get('symbols_or_slices_reviewed', row.get('reviewed_symbols', row.get('symbols_or_purposes', []))))

sql_roster = read_json(root / 'reports/database/function_review.json')
for f in sql_roster['functions']:
    level = str(f['coverage_level']).upper()
    if level in ('SEMANTIC', 'TARGETED'):
        e = f['candidate_effective_definition']
        v = validate_reference(e, 'sql:' + f['identity'], require_range=True)
        if v:
            add_review(v['path'], v['line_start'], v['line_end'], 'database', level, 'sql_candidate_definition:' + f['identity'], [f['identity']])

def merged_ranges(rows):
    intervals = sorted((r['line_start'], r['line_end']) for r in rows)
    merged = []
    for lo, hi in intervals:
        if merged and lo <= merged[-1][1] + 1:
            merged[-1][1] = max(merged[-1][1], hi)
        else:
            merged.append([lo, hi])
    return merged

function_rows = []
file_functions = collections.defaultdict(list)
for f in microfunctions:
    rs = review_ranges.get(f['path'], [])
    merged = merged_ranges(rs)
    full = any(lo <= f['line_start'] and hi >= f['line_end'] for lo, hi in merged)
    partial = any(lo <= f['line_end'] and hi >= f['line_start'] for lo, hi in merged)
    state = 'BODY_CONTAINED_IN_REVIEWED_RANGES' if full else 'BODY_PARTIALLY_OVERLAPS_REVIEWED_RANGES' if partial else 'NO_CURRENT_REVIEWED_RANGE_LOCATED'
    r = {k: f[k] for k in ('id', 'path', 'name', 'line_start', 'line_end', 'kind', 'git_blob_sha', 'body_sha256', 'is_test', 'layer', 'branch_nodes', 'await_nodes', 'throw_nodes')}
    r.update(review_span_state=state, reviewing_areas=sorted({x['area'] for x in rs if x['line_start'] <= f['line_end'] and x['line_end'] >= f['line_start']}),
             semantic_acceptance_not_implied=True)
    function_rows.append(r)
    file_functions[f['path']].append(r)

file_rows = []
for path, entry in sorted(tracked.items()):
    data = contents[path]
    binary = b'\0' in data
    lines = len(data.splitlines()) if not binary else None
    rs = review_ranges.get(path, [])
    merged = merged_ranges(rs)
    covered_lines = sum(hi - lo + 1 for lo, hi in merged)
    full_semantic = any(r['review_level'] == 'SEMANTIC' and r['line_start'] == 1 and r['line_end'] == lines for r in rs)
    state = 'WHOLE_FILE_SEMANTIC_REVIEW_DECLARED' if full_semantic else 'REVIEWED_SOURCE_RANGES_LOCATED' if rs else 'STRUCTURAL_INVENTORY_ONLY'
    funcs = file_functions[path]
    file_rows.append({'path': path, 'git_blob_sha': entry['git_blob_sha'], 'bytes': entry['bytes'], 'lines': lines,
                      'binary': binary, 'language_extension': Path(path).suffix or '(none)',
                      'current_review_state': state, 'reviewed_line_union': merged, 'reviewed_line_count': covered_lines,
                      'review_declarations': declarations.get(path, []), 'reviewed_ranges': rs,
                      'js_ts_functions': len(funcs), 'function_span_states': dict(collections.Counter(f['review_span_state'] for f in funcs)),
                      'is_test_js_ts': microfiles.get(path, {}).get('is_test'),
                      'prior_evidence_state': prior_file_coverage.get(path, {}).get('previous_evidence_state'),
                      'changed_since_previous_baseline': path in changed_paths})

folder_acc = collections.defaultdict(list)
for f in file_rows:
    parent = Path(f['path']).parent
    while True:
        folder_acc[parent.as_posix()].append(f)
        if parent.as_posix() == '.':
            break
        parent = parent.parent
folder_rows = [{'folder': name, 'tracked_descendant_files': len(rows),
                'file_review_states': dict(collections.Counter(r['current_review_state'] for r in rows)),
                'js_ts_bodies': sum(r['js_ts_functions'] for r in rows)} for name, rows in sorted(folder_acc.items())]

remaining_production_files = []
for f in file_rows:
    if f['is_test_js_ts'] is False and f['js_ts_functions']:
        uncontained = [x for x in file_functions[f['path']] if x['review_span_state'] != 'BODY_CONTAINED_IN_REVIEWED_RANGES']
        if uncontained:
            remaining_production_files.append({'path': f['path'], 'bodies_without_containing_review_span': len(uncontained),
                                               'branch_nodes_in_those_bodies': sum(x['branch_nodes'] for x in uncontained),
                                               'await_nodes_in_those_bodies': sum(x['await_nodes'] for x in uncontained),
                                               'review_state': f['current_review_state'], 'lines': f['lines']})
remaining_production_files.sort(key=lambda f: (-f['branch_nodes_in_those_bodies'], -f['await_nodes_in_those_bodies'], f['path']))

normalized_findings.sort(key=lambda f: (f['priority'], f['area'], f['id']))
summary = {'schema_version': 1, 'source_head': head, 'previous_source_head': delta['previous_commit'],
           'source_integrity_sha256': sha256(integrity_path.read_bytes()), 'tracked_files_verified': len(tracked),
           'source_hash_mismatches': 0, 'findings': len(normalized_findings),
           'by_priority': dict(collections.Counter(f['priority'] for f in normalized_findings)),
           'by_review_state': dict(collections.Counter(f['review_state'] for f in normalized_findings)),
           'by_area': dict(collections.Counter(f['area'] for f in normalized_findings)),
           'validated_source_evidence_references': source_evidence_count, 'validated_prior_artifact_references': prior_evidence_count,
           'file_review_states': dict(collections.Counter(f['current_review_state'] for f in file_rows)),
           'all_js_ts_bodies': len(function_rows), 'non_test_js_ts_bodies': sum(not f['is_test'] for f in function_rows),
           'function_span_states_all': dict(collections.Counter(f['review_span_state'] for f in function_rows)),
           'function_span_states_non_test': dict(collections.Counter(f['review_span_state'] for f in function_rows if not f['is_test'])),
           'sql_function_review': sql_roster['coverage_counts'],
           'remaining_non_test_js_ts_files_with_uncontained_bodies': len(remaining_production_files),
           'previous_findings_preserved': len(previous_findings), 'review_inputs': report_files,
           'validation_errors': len(errors), 'in_progress_artifacts_allowed': a.allow_in_progress,
           'limits': ['A file or body inside a reviewed source range is not a claim that every input, branch or microfeature was executed.',
                      'Review declarations preserve each reviewer’s own scope. A journal read or AST extraction alone does not promote a file to semantic review.',
                      'SQL definitions are lexical candidates reconciled with migration history; this is not an execution of migrations or a claim about live schema.',
                      'Static findings, unresolved contracts and hypotheses are counted separately. Related records across layers are not automatically distinct incidents.',
                      'No runtime production acceptance, provider operation, deployment, database write, message send or product fix was performed.']}
save('validation-errors.json', errors)
save('summary.json', summary)
save('findings-index.json', {'schema_version': 1, 'source_head': head, 'findings': normalized_findings})
save('file-review-matrix.json', file_rows, compress=True)
save('function-review-matrix.json', function_rows, compress=True)
save('folder-review-matrix.json', folder_rows)
save('remaining-production-review.json', remaining_production_files)
with (out / 'findings-index.csv').open('w', newline='') as fp:
    w = csv.writer(fp)
    w.writerow(['id', 'priority', 'area', 'review_state', 'title', 'first_evidence_url', 'source_report'])
    for f in normalized_findings:
        w.writerow([f['id'], f['priority'], f['area'], f['review_state'], f['title'], f['evidence'][0]['url'] if f['evidence'] else '', f['source_report']])
print(json.dumps({k: v for k, v in summary.items() if k not in ('review_inputs', 'limits')}, ensure_ascii=False, indent=2))
if errors:
    raise SystemExit('Validation failed; see ' + str(out / 'validation-errors.json'))
