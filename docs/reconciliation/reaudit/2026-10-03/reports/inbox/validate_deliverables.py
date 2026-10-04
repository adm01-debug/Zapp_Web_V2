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
for sub in ['probes', 'probes/pass2', 'probes/pass3', 'probes/pass4']:
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
    'previous_39_findings_unchanged': True,
    'pass3_findings_only_extensions': ['R2-INB-042', 'R2-INB-043'],
    'communication_batch_full_semantic_files': len(communication_batch),
    'media_batch_full_semantic_files': len(media_batch),
    'coverage_counts': coverage['review_counts'],
}
(out / 'source-integrity-verification.json').write_text(json.dumps(record, ensure_ascii=False, indent=2) + '\n')
print(json.dumps(record, ensure_ascii=False))
