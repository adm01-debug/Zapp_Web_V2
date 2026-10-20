"""Check recorded source pins, ranges and review ledgers without executing product code."""
from pathlib import Path
import collections
import datetime
import hashlib
import json
import subprocess

OUT = Path(__file__).resolve().parent
BASE = OUT.parents[1]
SRC = BASE / 'source'
HEAD = 'da307ba5626dce892f0b37cb6762463f55d14a96'
assert subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=SRC, text=True).strip() == HEAD
assert not subprocess.check_output(['git', 'status', '--porcelain'], cwd=SRC, text=True).strip()
pins = {x['path']: x for x in json.loads((BASE / 'source-integrity.json').read_text())['files']}
cache = {}

def source(path):
    if path not in cache:
        raw = (SRC / path).read_bytes()
        blob = hashlib.sha1(b'blob ' + str(len(raw)).encode() + b'\0' + raw).hexdigest()
        assert blob == pins[path]['git_blob_sha'], path
        cache[path] = (blob, hashlib.sha256(raw).hexdigest(), len(raw.decode().splitlines()))
    return cache[path]

cv = json.loads((OUT / 'coverage.json').read_text())
findings = json.loads((OUT / 'findings.json').read_text())['findings']
assert len({x['id'] for x in findings}) == len(findings)
for f in cv['files']:
    blob, sha, n = source(f['path'])
    assert blob == f['blob_sha'] and n == f['line_count'], f['path']
    covered = set()
    for r in f['reviewed_ranges']:
        assert 1 <= r['start_line'] <= r['end_line'] <= n, (f['path'], r)
        covered.update(range(r['start_line'], r['end_line'] + 1))
    if f['review_level'] == 'semantic':
        assert len(covered) == n, (f['path'], len(covered), n)
spans = 0
for f in findings:
    for e in f['evidence']:
        blob, _, n = source(e['path'])
        assert blob == e['blob_sha'] and 1 <= e['start_line'] <= e['end_line'] <= n, (f['id'], e)
        spans += 1
counts = dict(collections.Counter(f['review_level'] for f in cv['files']))
assert counts == cv['counts']
validation = json.loads((OUT / 'validation-latest.json').read_text())
validation.update(validated_at=datetime.datetime.now(datetime.timezone.utc).isoformat(), source_head=HEAD,
                  source_status='clean', findings=len(findings), evidence_spans=spans,
                  files_hashed=len(cv['files']), coverage_counts=counts, live_calls=0,
                  product_changes=0, new_probe_runs=0)
for name, expected, lines, key, execution in [
    ('test-review', 88, 14464, 'test_review', 'test_execution'),
    ('database-peer-test-review', 52, 4169, 'database_peer_test_review', 'test_execution'),
    ('shell-review', 12, 3546, 'shell_review', 'script_execution'),
    ('style-review', 2, 1027, 'style_review', 'runtime_execution'),
]:
    d = json.loads((OUT / (name + '.json')).read_text())
    assert d['status'] == 'COMPLETE' and len(d['files']) == expected
    assert d['actual_lines_read'] == lines
    total = 0
    for f in d['files']:
        blob, sha, n = source(f['path'])
        assert (blob, sha, n) == (f['git_blob_sha'], f['source_sha256'], f['line_count']), f['path']
        assert f['reviewed_ranges'] == [[1, n]] and f[execution] == 'NOT_EXECUTED'
        assert all(f[k] for k in ['proves', 'mocks_and_fixtures', 'positive_controls', 'limits'])
        total += n
    assert total == lines
    validation[key] = dict(status='COMPLETE', files=expected, actual_lines_read=lines,
                           source_pins_verified=expected, **{execution: 'NOT_EXECUTED'})
    if key == 'database_peer_test_review':
        validation[key]['coverage_owned_by'] = 'database'
    for suffix in ['.json', '.md']:
        if name + suffix not in validation['report_files']:
            validation['report_files'].append(name + suffix)
(OUT / 'validation-latest.json').write_text(json.dumps(validation, ensure_ascii=False, indent=2) + '\n')
print(json.dumps(dict(findings=len(findings), evidence_spans=spans, coverage_files=len(cv['files']),
                     counts=counts, status='VALID', source_status='clean', product_execution=False)))
