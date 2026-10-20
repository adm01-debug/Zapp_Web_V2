"""Pin explicit whole-file style/HTML adjudications; never infer reading from parsing."""
from pathlib import Path
import hashlib, json

root = Path(__file__).resolve().parents[1]
out = root / 'reports/root'
integrity = json.loads((root / 'source-integrity.json').read_text())
pins = {r['path']: r for r in integrity['files']}
notes = json.loads((out / 'style-adjudications.json').read_text())
manual_path = out / 'manual-review.json'
manual = json.loads(manual_path.read_text())
mr = {r['path']: r for r in manual['files']}
rows = []
for note in notes:
    path = note['path']; raw = (root / 'source' / path).read_bytes()
    sha = hashlib.sha1(b'blob ' + str(len(raw)).encode() + b'\0' + raw).hexdigest()
    assert sha == pins[path]['git_blob_sha']
    assert len(note['adjudication']) >= 2
    n = len(raw.splitlines())
    row = {**note, 'source_sha256': hashlib.sha256(raw).hexdigest(), 'git_blob_sha': sha,
           'line_start': 1, 'line_end': n, 'reviewed_ranges': [[1, n]],
           'review_status': 'SEMANTIC_FILE_REVIEW', 'reviewer': 'root', 'runtime_executed': False}
    rows.append(row)
    mr[path] = {**row, 'adjudication': ' '.join(note['adjudication']), 'evidence': 'style-review.json'}
data = {'schema_version': 1, 'source_head': integrity['head_sha'], 'status': 'COMPLETED_FINITE_STYLE_READING',
        'reviewed_files': len(rows), 'reviewed_lines': sum(r['line_end'] for r in rows), 'files': rows,
        'limits': 'Static semantic reading; no CSS build, browser computation, screenshot, accessibility acceptance or visual certification.'}
(out / 'style-review.json').write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n')
manual['files'] = list(mr.values())
manual_path.write_text(json.dumps(manual, ensure_ascii=False, indent=2) + '\n')
lines = ['# CSS e referência HTML — leitura complementar', '',
         f"Fonte `{data['source_head']}`; {len(rows)} arquivos, {data['reviewed_lines']} linhas integrais.", '',
         'Leitura de estilos não é homologação visual. A execução de CSS e as preferências reais do navegador não foram testadas.', '']
for r in rows:
    url = f"https://github.com/adm01-debug/Zapp_Web_V2/blob/{data['source_head']}/{r['path']}#L1-L{r['line_end']}"
    lines.extend([f"## [{r['path']}]({url})", '', ' '.join(r['adjudication']), ''])
(out / 'style-review.md').write_text('\n'.join(lines) + '\n')
print(json.dumps({'files': len(rows), 'lines': data['reviewed_lines']}))
