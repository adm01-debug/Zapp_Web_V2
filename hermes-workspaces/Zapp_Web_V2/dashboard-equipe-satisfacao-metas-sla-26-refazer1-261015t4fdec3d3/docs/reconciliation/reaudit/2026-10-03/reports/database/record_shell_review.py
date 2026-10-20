"""Record a shell source only after whole-file manual reading; never execute it."""
from pathlib import Path
import sys,json,hashlib
OUT=Path(__file__).parent;ROOT=OUT.parents[1]/'source'
roster=json.loads((OUT/'shell-review-roster.json').read_text())
position=int(sys.argv[1]);note=sys.argv[2];row=roster['files'][position-1]
raw=(ROOT/row['path']).read_bytes();assert hashlib.sha256(raw).hexdigest()==row['source_sha256']
assert len(raw.decode().splitlines())==row['line_end']
p=OUT/'shell-review.json'
d=json.loads(p.read_text())if p.exists()else{'schema_version':1,'source_head':roster['source_head'],'files':[],
 'allocated_files':12,'allocated_lines':3546,'shell_executed':False,'sql_executed':False,'runtime_tested':False}
rows={r['path']:r for r in d['files']}
rows[row['path']]={**row,'roster_index':position-1,'reviewer':'database','review_level':'semantic',
 'review_status':'COMPLETED_MANUAL_READING','review_basis':'shell-review.json manual per-file adjudication',
 'reviewed_ranges':[[1,row['line_end']]],'assessment':note,'tests_executed':False,
 'remaining_gaps':['Static manual reading only; harness was not run and does not establish production acceptance.']}
d['files']=sorted(rows.values(),key=lambda r:r['roster_index']);d['read_files']=len(rows)
d['read_lines']=sum(r['line_end']for r in rows.values());d['status']='COMPLETED_MANUAL_READING'if len(rows)==12 else'IN_PROGRESS'
p.write_text(json.dumps(d,ensure_ascii=False,indent=2)+'\n')
md=['# Leitura estática dos scripts shell de banco','',f"Fonte `{d['source_head']}`. {d['read_files']}/12 arquivos, {d['read_lines']}/3546 linhas. Nenhum shell, Docker, PostgreSQL ou SQL executado.",'']
for r in d['files']:md += [f"## {r['path']}",'',f"Leitura 1–{r['line_end']}; SHA-256 `{r['source_sha256']}`; Git blob `{r['git_blob_sha']}`.",'',r['assessment'],'']
(OUT/'shell-review.md').write_text('\n'.join(md)+'\n')
print(json.dumps({'recorded':position,'read_files':d['read_files'],'read_lines':d['read_lines']}))
