"""Read-only source provenance + durable semantic-reading journal.

Accepts a JSON array on stdin. No test suite or application module is executed.
An empty array initializes pending entries without claiming any reading.
"""
from pathlib import Path
from hashlib import sha1, sha256
from collections import Counter
import json
import subprocess
import sys

OUT = Path(__file__).resolve().parent
SOURCE = Path('/workspace/scratch/f8f9b9cbce53/reaudit/source')
ROSTER = OUT / 'test-review-roster.json'
HEAD = 'da307ba5626dce892f0b37cb6762463f55d14a96'
assert subprocess.check_output(['git', '-C', str(SOURCE), 'rev-parse', 'HEAD'], text=True).strip() == HEAD
roster_bytes = ROSTER.read_bytes()
roster = json.loads(roster_bytes)
assert roster['source_head'] == HEAD
destination = OUT / 'test-review.json'
if destination.exists():
    journal = json.loads(destination.read_text())
    assert journal['source_head'] == HEAD
    assert journal['roster_sha256'] == sha256(roster_bytes).hexdigest()
else:
    journal = dict(schema_version=1, source_head=HEAD, source_root=str(SOURCE),
        roster=str(ROSTER), roster_sha256=sha256(roster_bytes).hexdigest(),
        status='READING_IN_PROGRESS', tests_executed=0, files=[],
        limits=['Assertions, mocks and fixtures are read statically. No suite, provider, live DB or browser executed.',
                'Allocation, source-hash verification and test existence are not semantic review or runtime acceptance.'])
    for index, entry in enumerate(roster['files'], 1):
        journal['files'].append(dict(index=index, path=entry['path'], source_head=HEAD,
            git_blob_sha=entry['git_blob_sha'], source_sha256=entry['source_sha256'],
            total_lines=entry['line_end'], review_status='PENDING_READING', reviewed_ranges=[]))

updates = json.load(sys.stdin)
assert isinstance(updates, list)
for update in updates:
    if 'index' in update:
        entry = journal['files'][update['index'] - 1]
        assert entry['index'] == update['index']
    else:
        relative = update['path']
        assert not Path(relative).is_absolute() and '..' not in Path(relative).parts
        raw_support = (SOURCE / relative).read_bytes()
        pinned = subprocess.check_output(['git','-C',str(SOURCE),'rev-parse',HEAD+':'+relative],text=True).strip()
        assert sha1(f'blob {len(raw_support)}\0'.encode()+raw_support).hexdigest() == pinned
        support = journal.setdefault('supporting_files',[])
        entry = next((e for e in support if e['path']==relative),None)
        if entry is None:
            entry = dict(path=relative, source_head=HEAD, git_blob_sha=pinned,
                source_sha256=sha256(raw_support).hexdigest(),total_lines=len(raw_support.decode().splitlines()),
                review_status='PENDING_READING',reviewed_ranges=[])
            support.append(entry)
    raw = (SOURCE / entry['path']).read_bytes()
    assert sha1(f'blob {len(raw)}\0'.encode() + raw).hexdigest() == entry['git_blob_sha']
    assert sha256(raw).hexdigest() == entry['source_sha256']
    assert len(raw.decode().splitlines()) == entry['total_lines']
    assert update.get('review_status') in ('SEMANTIC_FULL_FILE', 'SEMANTIC_SELECTED_RANGES', 'DELEGATED_WHOLE_FILE')
    if update['review_status'] == 'SEMANTIC_FULL_FILE':
        assert all(update.get(key) for key in ['assertions_reviewed','mocks_and_fixtures','adjudication','limits'])
        update['reviewed_ranges'] = [{'line_start': 1, 'line_end': entry['total_lines'],
                                     'symbols': update['assertions_reviewed']}]
    elif update['review_status'] == 'DELEGATED_WHOLE_FILE':
        assert update.get('delegation_evidence')
    else:
        assert update.get('reviewed_ranges')
    entry.update(update)
    entry['source_hash_rechecked_before_record'] = True

counts = Counter(entry['review_status'] for entry in journal['files'])
journal['counts'] = dict(counts)
journal['total_files'] = len(journal['files'])
journal['total_lines'] = sum(entry['total_lines'] for entry in journal['files'])
journal['fully_read_lines'] = sum(entry['total_lines'] for entry in journal['files'] if entry['review_status'] == 'SEMANTIC_FULL_FILE')
journal['status'] = 'COMPLETE' if not counts['PENDING_READING'] and not counts['SEMANTIC_SELECTED_RANGES'] else 'READING_IN_PROGRESS'
destination.write_text(json.dumps(journal, ensure_ascii=False, indent=2) + '\n')
report = ['# Leitura dos testes de provedores e integrações',
          f'\nHEAD `{HEAD}`; roster com {journal["total_files"]} arquivos / {journal["total_lines"]} linhas.',
          f'\nEstado: **{journal["status"]}**. Contagem: `{dict(counts)}`. Nenhuma suíte foi executada.',
          '\nAlocação e hash conferido não equivalem a leitura. Somente entradas com faixas/asserções efetivamente revistas integram cobertura semântica.']
for entry in journal['files'] + journal.get('supporting_files',[]):
    ordinal = f'{entry["index"]:02}' if 'index' in entry else 'Dependência lida'
    report += [f'\n## {ordinal} — {entry["path"]}',
               f'\n**{entry["review_status"]}** · {entry["total_lines"]} linhas · SHA-256 `{entry["source_sha256"]}`.']
    for key, label in [('assertions_reviewed','Asserções'),('mocks_and_fixtures','Mocks e fixtures'),
                       ('adjudication','Adjudicação'),('limits','Limites'),('related_findings','Achados relacionados'),
                       ('delegation_evidence','Delegação')]:
        value = entry.get(key)
        if value:
            report.append(f'\n**{label}:** ' + ('; '.join(map(str,value)) if isinstance(value,list) else str(value)))
(OUT / 'test-review.md').write_text('\n'.join(report) + '\n')
print(json.dumps({'counts':dict(counts),'fully_read_lines':journal['fully_read_lines'],'test_execution':0}))
