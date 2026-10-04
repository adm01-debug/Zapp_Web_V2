from pathlib import Path
import json, hashlib, subprocess, datetime

out = Path(__file__).resolve().parent
root = out.parents[1] / 'source'
manifest = json.loads((root.parent / 'source-integrity.json').read_text())
sha = manifest['head_sha']
assert subprocess.check_output(['git', '-C', str(root), 'rev-parse', 'HEAD'], text=True).strip() == sha
assert subprocess.check_output(['git', '-C', str(root), 'status', '--porcelain'], text=True) == ''
by_path = {f['path']: f['git_blob_sha'] for f in manifest['files']}
for path, expected in by_path.items():
    raw = (root / path).read_bytes()
    observed = hashlib.sha1(b'blob ' + str(len(raw)).encode() + b'\0' + raw).hexdigest()
    assert observed == expected, path

findings = json.loads((out / 'findings.json').read_text())
coverage = json.loads((out / 'coverage.json').read_text())
comparison = json.loads((out / 'baseline-comparison.json').read_text())
assert findings['source_sha'] == coverage['source_sha'] == sha
count = len(findings['findings'])
assert findings['finding_count'] == count
assert [x['id'] for x in findings['findings']] == [f'R2-INB-{i:03}' for i in range(1, count + 1)]
by_coverage_path = {x['path']: x for x in coverage['files']}
uncovered = []
for finding in findings['findings']:
    for evidence in finding['evidence']:
        assert evidence['source_sha'] == sha and evidence['blob_sha'] == by_path[evidence['path']]
        assert 1 <= evidence['line_start'] <= evidence['line_end'] <= len((root / evidence['path']).read_text().splitlines())
        row = by_coverage_path[evidence['path']]
        if row['review_level'] == 'structural' or not any(
            span['line_start'] <= evidence['line_start'] and span['line_end'] >= evidence['line_end']
            for span in row['reviewed_ranges']
        ):
            uncovered.append((finding['id'], evidence['path'], evidence['line_start'], evidence['line_end']))
assert not uncovered, uncovered

all_probes = []
for sub in ['probes', 'probes/pass2', 'probes/pass3', 'probes/pass4', 'probes/pass5']:
    results = json.loads((out / sub / 'results.json').read_text())
    pins = json.loads((out / sub / 'pins.json').read_text())
    assert results['source_sha'] == sha
    assert results['integrity']['runner_sha256'] == hashlib.sha256((out / sub / 'run.mjs').read_bytes()).hexdigest()
    assert results['integrity']['pins_sha256'] == hashlib.sha256((out / sub / 'pins.json').read_bytes()).hexdigest()
    assert all(by_path[path] == value for path, value in pins['files'].items())
    all_probes += [case['id'] for case in results['results']]
assert len(all_probes) == len(set(all_probes)) == findings['offline_probes']
assert all(set(f['offline_reproduction']['probe_ids']) <= set(all_probes) for f in findings['findings'])
original = json.loads((out / 'checkpoints/pass1/original-probe-manifest.json').read_text())
for item in original['files']:
    assert item['sha256'] == hashlib.sha256((out / item['path']).read_bytes()).hexdigest(), item['path']
pass2_checkpoint = json.loads((out / 'checkpoints/pass2/deliverable-manifest.json').read_text())
for item in pass2_checkpoint['files']:
    if item['path'].startswith('probes/'):
        assert item['sha256'] == hashlib.sha256((out / item['path']).read_bytes()).hexdigest(), item['path']
prior_findings = json.loads((out / 'checkpoints/pass2/findings.json').read_text())['findings']
assert findings['findings'][:len(prior_findings)] == prior_findings
pass3_checkpoint = json.loads((out / 'checkpoints/pass3/deliverable-manifest.json').read_text())
for item in pass3_checkpoint['files']:
    if item['path'].startswith('probes/'):
        assert item['sha256'] == hashlib.sha256((out / item['path']).read_bytes()).hexdigest(), item['path']
pass3_findings = json.loads((out / 'checkpoints/pass3/findings.json').read_text())['findings']
for index, previous in enumerate(pass3_findings):
    if previous['id'] not in {'R2-INB-042', 'R2-INB-043'}:
        assert findings['findings'][index] == previous, previous['id']
pass4_checkpoint = json.loads((out / 'checkpoints/pass4/deliverable-manifest.json').read_text())
for item in pass4_checkpoint['files']:
    if item['path'].startswith('probes/'):
        assert item['sha256'] == hashlib.sha256((out / item['path']).read_bytes()).hexdigest(), item['path']
pass4_findings = json.loads((out / 'checkpoints/pass4/findings.json').read_text())['findings']
assert findings['findings'][:len(pass4_findings)] == pass4_findings
pass5_checkpoint = json.loads((out / 'checkpoints/pass5/deliverable-manifest.json').read_text())
for item in pass5_checkpoint['files']:
    if item['path'].startswith('probes/'):
        assert item['sha256'] == hashlib.sha256((out / item['path']).read_bytes()).hexdigest(), item['path']
pass5_findings = json.loads((out / 'checkpoints/pass5/findings.json').read_text())['findings']
assert len(pass5_findings) == count == len(all_probes) == 64
assert findings['findings'] == pass5_findings
pass5_review = json.loads((out / 'pass5-reviewed.json').read_text())
assert pass5_review['source_sha'] == sha
for path, record in pass5_review['files'].items():
    row = by_coverage_path[path]
    if record['review_level'] == 'semantic':
        assert row['review_level'] == 'semantic', path
        assert row['reviewed_ranges'] == [{'line_start': 1, 'line_end': row['line_count']}], path
notes = json.loads((out / 'pass5-notes.json').read_text())
assert notes['source_sha'] == sha and notes['counted_as_new_findings'] is False
for note in notes['notes']:
    assert set(note['offline_probe_ids']) <= set(all_probes)
    for evidence in note['evidence']:
        assert evidence['source_sha'] == sha and evidence['blob_sha'] == by_path[evidence['path']]
        row = by_coverage_path[evidence['path']]
        assert any(span['line_start'] <= evidence['line_start'] <= evidence['line_end'] <= span['line_end'] for span in row['reviewed_ranges']), (note['id'], evidence)
communication_batch = ['useAudioMemes', 'useMediaElementVolume', 'useMediaVolume', 'useMicrophoneGuard', 'useSpeechToText', 'useTextToSpeech', 'useTranscriptionNotifications', 'useVoiceAgent']
for name in communication_batch:
    row = by_coverage_path[f'src/hooks/communication/{name}.ts']
    assert row['review_level'] == 'semantic'
    assert row['reviewed_ranges'] == [{'line_start': 1, 'line_end': row['line_count']}]
assert all(row['identical_to_baseline'] for row in comparison['files'])
media_batch = [
    'src/components/settings/media-library/useMediaLibrary.ts',
    'src/components/settings/media-library/useMediaUpload.ts',
    'src/components/settings/media-library/AIGenerateDialog.tsx',
    'src/components/settings/media-library/StatsCards.tsx',
    'src/hooks/sticker-picker/useStickerPicker.ts',
]
for path in media_batch:
    row = by_coverage_path[path]
    assert row['review_level'] == 'semantic'
    assert row['reviewed_ranges'] == [{'line_start': 1, 'line_end': row['line_count']}]

# The fixed test roster is a separate semantic reading deliverable, not suite execution.
roster_raw = (out / 'test-review-roster.json').read_bytes()
roster = json.loads(roster_raw)
tests = json.loads((out / 'test-review.json').read_text())
assert roster['source_head'] == tests['source_head'] == sha
assert tests['roster_sha256'] == hashlib.sha256(roster_raw).hexdigest()
assert tests['status'] == 'SEMANTIC_REVIEW_COMPLETE' and tests['tests_executed'] is False
assert len(roster['files']) == len(tests['files']) == 125
assert tests['counts'] == {'SEMANTIC_REVIEW_COMPLETE': 125}
assert tests['reviewer_counts'] == {'inbox': 80, 'root': 45}
assert len({row['path'] for row in tests['files']}) == 125
assert tests['actual_lines_read'] == tests['allocated_lines'] == sum(row['line_count'] for row in tests['files']) == 18903
peer_cache = {}
for index, (allocated, row) in enumerate(zip(roster['files'], tests['files']), 1):
    assert row['index'] == index and row['path'] == allocated['path']
    raw = (root / row['path']).read_bytes()
    assert row['git_blob_sha'] == allocated['git_blob_sha'] == by_path[row['path']]
    assert row['source_sha256'] == allocated['source_sha256'] == hashlib.sha256(raw).hexdigest()
    assert row['line_count'] == allocated['line_end'] == len(raw.decode().splitlines())
    full_range = [{'line_start': 1, 'line_end': row['line_count']}]
    assert row['reviewed_ranges'] == full_range and row['review_status'] == 'SEMANTIC_REVIEW_COMPLETE'
    assert row['test_execution'] == 'NOT_EXECUTED' and row['adjudication'].strip() and row['limits']
    assert by_coverage_path[row['path']]['review_level'] == 'semantic'
    assert by_coverage_path[row['path']]['reviewed_ranges'] == full_range
    if index <= 80:
        assert row['reviewer'] == 'inbox' and row['review_basis'] == 'DIRECT_SEMANTIC_READING'
        assert row['proves'] and row['mocks_and_fixtures']
    else:
        assert row['reviewer'] == 'root' and row['review_basis'] == 'PEER_SEMANTIC_REVIEW'
        peer_raw = (out / row['peer_record']).read_bytes()
        assert row['peer_record_sha256'] == hashlib.sha256(peer_raw).hexdigest()
        peer = peer_cache.setdefault(row['peer_record'], json.loads(peer_raw))
        assert peer['source_head'] == sha and peer['status'] == 'COMPLETED_REVIEW_PASS'
        match = [item for item in peer['files'] if item['roster_index'] == index - 1]
        assert len(match) == 1 and match[0]['path'] == row['path']
        assert row['peer_adjudication'] == match[0]['adjudication']
        assert row['adjudication'] == '\n\n'.join(match[0]['adjudication'])
support = json.loads((out / 'test-support-reviewed.json').read_text())
assert support['source_head'] == sha
for row in support['files']:
    raw = (root / row['path']).read_bytes()
    assert row['git_blob_sha'] == by_path[row['path']]
    assert row['source_sha256'] == hashlib.sha256(raw).hexdigest()
    assert row['line_count'] == len(raw.decode().splitlines())
    assert by_coverage_path[row['path']]['reviewed_ranges'] == [{'line_start': 1, 'line_end': row['line_count']}]

shell_roster_raw = (out / 'shell-review-roster.json').read_bytes()
shell_roster = json.loads(shell_roster_raw)
shell = json.loads((out / 'shell-review.json').read_text())
assert shell['source_head'] == shell_roster['source_head'] == sha
assert shell['allocation_roster_sha256'] == hashlib.sha256(shell_roster_raw).hexdigest()
assert shell['status'] == 'COMPLETED_REVIEW_PASS' and shell['tests_executed'] == 0
assert shell['reviewed_files'] == shell['total_files'] == len(shell['files']) == len(shell_roster['files']) == 12
assert shell['actual_lines_read'] == sum(row['line_end'] for row in shell['files']) == 3553
assert shell['reviewer_counts'] == {'inbox': 6, 'database': 6}
assert not shell['pending_indices']
for index, (allocated, row) in enumerate(zip(shell_roster['files'], shell['files'])):
    assert row['roster_index'] == index and row['path'] == allocated['path']
    raw = (root / row['path']).read_bytes()
    assert row['source_sha256'] == allocated['source_sha256'] == hashlib.sha256(raw).hexdigest()
    assert row['git_blob_sha'] == allocated['git_blob_sha'] == by_path[row['path']]
    assert row['line_end'] == allocated['line_end'] == len(raw.decode().splitlines())
    assert row['review_status'] == 'SEMANTIC_FILE_REVIEW' and not row['runtime_executed']
    assert row['adjudication'] and row['limits']
    assert row['reviewed_ranges'] == [{'line_start': 1, 'line_end': row['line_end']}]
    assert by_coverage_path[row['path']]['review_level'] == 'semantic'
    assert by_coverage_path[row['path']]['reviewed_ranges'] == row['reviewed_ranges']
    if index < 6:
        assert row['reviewer'] == 'inbox'
    else:
        assert row['reviewer'] == 'database' and row['review_basis'] == 'PEER_SEMANTIC_REVIEW'
        peer_raw = (out / row['peer_record']).read_bytes()
        assert row['peer_record_sha256'] == hashlib.sha256(peer_raw).hexdigest()
        peer = json.loads(peer_raw)
        match = [item for item in peer['files'] if item['roster_index_zero_based'] == index]
        assert len(match) == 1 and row['peer_row'] == match[0]
        assert row['adjudication'] == [match[0]['adjudication']]
shell_support = json.loads((out / 'shell-support-reviewed.json').read_text())
assert shell_support['source_head'] == sha
for row in shell_support['files']:
    raw = (root / row['path']).read_bytes()
    assert row['git_blob_sha'] == by_path[row['path']]
    assert row['source_sha256'] == hashlib.sha256(raw).hexdigest()
    assert row['line_count'] == len(raw.decode().splitlines())
    assert by_coverage_path[row['path']]['reviewed_ranges'] == row['reviewed_ranges']

record = {
    'source_sha': sha,
    'verified_at': datetime.datetime.now(datetime.timezone.utc).isoformat(),
    'all_tracked_files_checked': len(by_path),
    'source_blob_mismatches': [],
    'source_git_status_clean': True,
    'findings': count,
    'evidence_ranges_covered': True,
    'compared_to_baseline': len(comparison['files']),
    'all_identical_to_baseline': True,
    'offline_probes': len(all_probes),
    'original_20_probe_artifacts_unchanged': True,
    'previous_28_probe_artifacts_unchanged': True,
    'previous_41_probe_artifacts_unchanged': True,
    'previous_49_probe_artifacts_unchanged': True,
    'all_64_probe_artifacts_unchanged_since_pass5': True,
    'all_64_findings_unchanged_since_pass5': True,
    'previous_53_findings_unchanged': True,
    'previous_39_findings_unchanged': True,
    'pass3_findings_only_extensions': ['R2-INB-042', 'R2-INB-043'],
    'communication_batch_full_semantic_files': len(communication_batch),
    'media_batch_full_semantic_files': len(media_batch),
    'pass5_full_semantic_files': sum(row['review_level'] == 'semantic' for row in pass5_review['files'].values()),
    'coverage_counts': coverage['review_counts'],
    'test_roster_files_semantically_adjudicated': len(tests['files']),
    'test_roster_lines_semantically_adjudicated': tests['actual_lines_read'],
    'test_reviewers': tests['reviewer_counts'],
    'peer_review_records_with_verified_hashes': len(peer_cache),
    'test_support_files_reviewed': len(support['files']),
    'shell_roster_files_semantically_adjudicated': 12,
    'shell_roster_lines_semantically_adjudicated': shell['actual_lines_read'],
    'shell_reviewers': shell['reviewer_counts'],
    'shell_support_sql_files_reviewed': len(shell_support['files']),
    'shell_scripts_executed': False,
    'sql_executed': False,
    'test_suites_executed': False,
}
(out / 'source-integrity-verification.json').write_text(json.dumps(record, ensure_ascii=False, indent=2) + '\n')
print(json.dumps(record, ensure_ascii=False))
