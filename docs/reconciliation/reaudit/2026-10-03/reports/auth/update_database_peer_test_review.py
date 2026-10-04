"""Append human test-source review notes; never execute source or a test suite.

Accept a JSON list on stdin. Each item supplies the stable 1-based roster index,
the ranges actually read, and review observations. Re-run with [] to rebuild.
"""
from pathlib import Path
import collections, datetime, hashlib, json, subprocess, sys

OUT = Path(__file__).resolve().parent
BASE = OUT.parents[1]
SRC = BASE / 'source'
HEAD = 'da307ba5626dce892f0b37cb6762463f55d14a96'
roster = json.loads((OUT / 'database-peer-test-review-roster.json').read_text())
manifest = json.loads((BASE / 'source-integrity.json').read_text())
assert roster['source_head'] == manifest['head_sha'] == HEAD
assert subprocess.check_output(['git', '-C', str(SRC), 'rev-parse', 'HEAD'], text=True).strip() == HEAD
pins = {x['path']: x for x in manifest['files']}
destination = OUT / 'database-peer-test-review.json'
previous = json.loads(destination.read_text()) if destination.exists() else {'files': []}
known = {x['path']: x for x in previous['files']}
patches = json.loads(sys.stdin.read() or '[]')
for patch in patches:
    path = roster['files'][patch.pop('index') - 1]['path']
    item = known.setdefault(path, {})
    item.setdefault('reviewed_ranges', []).extend(patch.pop('ranges', []))
    for k, v in patch.items():
        item[k] = v

def merge_ranges(ranges):
    merged = []
    for a, b in sorted(ranges):
        if merged and a <= merged[-1][1] + 1:
            merged[-1][1] = max(merged[-1][1], b)
        else:
            merged.append([a, b])
    return merged

files = []
for index, allocated in enumerate(roster['files'], 1):
    path = allocated['path']
    raw = (SRC / path).read_bytes()
    blob = hashlib.sha1(b'blob ' + str(len(raw)).encode() + b'\0' + raw).hexdigest()
    sha = hashlib.sha256(raw).hexdigest()
    n = len(raw.decode().splitlines())
    assert blob == pins[path]['git_blob_sha'] == allocated['git_blob_sha']
    assert sha == allocated['source_sha256'] and n == allocated['line_end']
    note = known.get(path, {})
    ranges = merge_ranges(note.get('reviewed_ranges', []))
    assert all(1 <= a <= b <= n for a, b in ranges), path
    complete = ranges == [[1, n]]
    if complete:
        assert note.get('proves') and note.get('mocks_and_fixtures') and note.get('limits'), path
    status = 'SEMANTIC_REVIEW_COMPLETE' if complete else 'READ_IN_PROGRESS' if ranges else 'PENDING_READING'
    files.append(dict(index=index, source_roster_index_zero_based=index+51, reviewer='auth', path=path, source_head=HEAD, git_blob_sha=blob, source_sha256=sha,
                      line_count=n, review_status=status, reviewed_ranges=ranges,
                      test_execution='NOT_EXECUTED', proves=note.get('proves', []),
                      mocks_and_fixtures=note.get('mocks_and_fixtures', []),
                      positive_controls=note.get('positive_controls', []), limits=note.get('limits', []),
                      related_findings=note.get('related_findings', []),
                      observations=note.get('observations', [])))

counts = collections.Counter(x['review_status'] for x in files)
result = dict(schema_version=1, source_head=HEAD, owner='database', reviewer='auth',
              status='COMPLETE' if counts['SEMANTIC_REVIEW_COMPLETE'] == len(files) else 'IN_PROGRESS',
              updated_at=datetime.datetime.now(datetime.timezone.utc).isoformat(),
              method='Manual integral source review of assertions, fixtures, mocks and consumer contracts. Allocation alone confers no review coverage. No suite, browser, service or database executed.',
              allocation_file='database-peer-test-review-roster.json', counts=dict(counts),
              allocated_files=len(files), allocated_lines=sum(x['line_count'] for x in files),
              actual_lines_read=sum(b-a+1 for x in files for a,b in x['reviewed_ranges']), files=files)
destination.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
report = ['# Revisão semântica peer — testes reservados da frente Database', '',
          f'Fonte `{HEAD}`. Estado: **{result["status"]}**. Atualizado em {result["updated_at"]}.', '',
          f'Alocação: {len(files)} arquivos / {result["allocated_lines"]} linhas. Leitura integral concluída: {counts["SEMANTIC_REVIEW_COMPLETE"]}; parcial: {counts["READ_IN_PROGRESS"]}; pendente: {counts["PENDING_READING"]}. Linhas realmente lidas: {result["actual_lines_read"]}.', '',
          'Esta é revisão do código dos testes, não execução ou declaração de que a suíte passa. Assertions e mocks só sustentam o contrato que efetivamente exercitam. Ausência de teste genérico não gera um achado novo por arquivo.', '']
for x in files:
    report += [f'## {x["index"]}. `{x["path"]}`', '',
               f'Estado: {x["review_status"]}; faixas lidas: {x["reviewed_ranges"] or "nenhuma"}; total: {x["line_count"]} linhas; blob: `{x["git_blob_sha"]}`.', '']
    for field, title in [('proves','Contrato exercitado'), ('mocks_and_fixtures','Fixtures e substituições'), ('positive_controls','Controles positivos'), ('limits','Limites e lacunas concretas'), ('observations','Adjudicação')]:
        if x[field]:
            report += [f'**{title}:** ' + ' '.join(x[field]), '']
    if x['related_findings']:
        report += ['Relacionados, sem nova contagem: ' + ', '.join(x['related_findings']) + '.', '']
(OUT / 'database-peer-test-review.md').write_text('\n'.join(report) + '\n')
print(json.dumps({k: result[k] for k in ('status', 'counts', 'actual_lines_read', 'allocated_files', 'allocated_lines')}, ensure_ascii=False))
