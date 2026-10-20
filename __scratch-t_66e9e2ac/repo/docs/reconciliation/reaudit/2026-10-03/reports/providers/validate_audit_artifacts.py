"""Validate audit provenance and journals only; does not run source code."""
from pathlib import Path
from collections import Counter
import hashlib
import json
import subprocess

O = Path(__file__).resolve().parent
S = Path('/workspace/scratch/f8f9b9cbce53/reaudit/source')
H = 'da307ba5626dce892f0b37cb6762463f55d14a96'
def git(*args):
    return subprocess.check_output(['git', '-C', str(S), *args], text=True)
assert git('rev-parse','HEAD').strip() == H
tree = {}
for row in git('ls-tree','-r',H).splitlines():
    meta, path = row.split('\t',1)
    tree[path] = meta.split()[2]
loaded = {}
def source(path, sha=None, blob=None):
    if path not in loaded:
        raw = (S/path).read_bytes()
        actual_blob = hashlib.sha1(f'blob {len(raw)}\0'.encode()+raw).hexdigest()
        assert actual_blob == tree[path], path
        loaded[path] = (hashlib.sha256(raw).hexdigest(), actual_blob, len(raw.decode().splitlines()))
    a, b, n = loaded[path]
    if sha: assert sha == a, path
    if blob: assert blob == b, path
    return n

coverage = json.loads((O/'coverage.json').read_text())
findings = json.loads((O/'findings.json').read_text())
assert coverage['head'] == findings['head'] == H
assert coverage['status'] == findings['status'] == 'providers_assigned_scope_complete'
assert len(findings['findings']) == len({f['id'] for f in findings['findings']}) == 66
assert findings['verification']['offline_probes'] == 44
for f in findings['findings']:
    for e in f['evidence']:
        assert e['head'] == H
        n = source(e['path'], e['sha256'])
        assert 1 <= e['line_start'] <= e['line_end'] <= n
for e in coverage['files']:
    assert e['head'] == H
    n = source(e['path'], e['sha256'], e.get('git_blob_sha'))
    assert n == e['line_count']
    for r in e['reviewed_ranges']:
        assert 1 <= r['line_start'] <= r['line_end'] <= n
    if e['level'] == 'semantic_full_file':
        assert [(r['line_start'],r['line_end']) for r in e['reviewed_ranges']] == [(1,n)]
assert dict(Counter(e['level'] for e in coverage['files'])) == coverage['counts']

journals = {}
for filename in ['test-review.json','shell-review.json','database-peer-test-review.json']:
    journal = json.loads((O/filename).read_text())
    assert journal['status'] == 'COMPLETE' and journal['source_head'] == H
    assert journal['tests_executed'] == 0
    total = 0
    for e in journal['files'] + journal.get('supporting_files',[]):
        assert e['review_status'] == 'SEMANTIC_FULL_FILE'
        n = source(e['path'], e['source_sha256'], e['git_blob_sha'])
        assert [(r['line_start'],r['line_end']) for r in e['reviewed_ranges']] == [(1,n)]
        if e in journal['files']: total += n
    assert len(journal['files']) == journal['total_files']
    assert total == journal['total_lines']
    journals[filename] = journal
assert journals['test-review.json']['total_files'] == 76
assert journals['test-review.json']['total_lines'] == 19010
assert journals['shell-review.json']['scripts_executed'] == 0
assert journals['shell-review.json']['total_files'] == 12
assert journals['shell-review.json']['total_lines'] == 3558
assert journals['database-peer-test-review.json']['total_files'] == 20
assert journals['database-peer-test-review.json']['total_lines'] == 1419
assert git('status','--porcelain','--untracked-files=no').strip() == ''
assert git('rev-parse','HEAD').strip() == H
out = dict(source_head=H, status='PASS', tests_read=76, test_lines_read=19010,
    supporting_fixtures_read=4, database_peer_tests_read=20, database_peer_lines_read=1419,
    shell_scripts_read=12, shell_lines_read=3558, tests_executed=0, scripts_executed=0,
    new_probe_executions=0, previous_primary_probes=44, findings=66,
    paths_rechecked_against_HEAD_blobs=len(loaded), source_tracked_changes=0,
    coverage_counts=coverage['counts'],
    checks=['HEAD match before and after validation', 'source blobs for all documented paths match pinned HEAD',
        'source SHA256 and ranges match actual bytes', '76 test, 12 shell and 20 peer-test journals complete with exact line totals',
        '66 unique findings and 44 preserved offline probes', 'coverage counts and completion status consistent', 'tracked source clean'],
    limits=['This validates audit artifacts and provenance, not application behavior. No source scripts, test suites, Docker, database or external services executed.'])
(O/'final-validation.json').write_text(json.dumps(out,ensure_ascii=False,indent=2)+'\n')
tail = json.loads((O/'pending-provider-tail.json').read_text())
tail['shell_review'] = 'completed_12_of_12_3558_lines'
(O/'pending-provider-tail.json').write_text(json.dumps(tail,ensure_ascii=False,indent=2)+'\n')
print(json.dumps(out,ensure_ascii=False))
