"""Build current coverage from explicit, accumulated read notes; no product run."""
from pathlib import Path
from collections import Counter
import hashlib,json
BASE=Path('/workspace/scratch/f8f9b9cbce53/reaudit')
SRC=BASE/'source'; OUT=BASE/'reports/infra'
HEAD='da307ba5626dce892f0b37cb6762463f55d14a96'
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def build():
 targets=json.loads((OUT/'ui-performance-targets.json').read_text())
 notes=json.loads((OUT/'ui-performance-journal.json').read_text())
 primary={r['path']:r for r in targets['targets']}
 inventory=[]
 for path in sorted(set(primary)|set(notes['files'])):
  p=SRC/path; n=len(p.read_text().splitlines()); note=notes['files'].get(path)
  spans=note.get('reviewed_ranges',[[1,n]]) if note else []
  assert all(1<=a<=b<=n for a,b in spans),path
  full=spans==[[1,n]]
  inventory.append(dict(path=path,sha256=sha(p),bytes=p.stat().st_size,lines=n,baseline_sha=HEAD,reviewed_ranges=spans,review_level='semantic' if full else 'targeted' if spans else 'structural',full_file_read=full,primary_delegated=path in primary,layer='ui_performance_delegated' if path in primary else 'ui_performance_support',review_basis=note['assessment'] if note else 'Inventário da matriz global; corpo ainda não lido neste lote.',consumers=note.get('consumers',[]) if note else []))
 reviewed=sum(e['full_file_read'] and e['primary_delegated'] for e in inventory)
 result=dict(schema_version=1,area='infra_ui_performance',baseline_sha=HEAD,state='COMPLETED' if reviewed==len(primary) else 'IN_PROGRESS',primary_files=len(primary),primary_lines=sum(t['lines'] for t in primary.values()),primary_full_file_read=reviewed,primary_remaining=len(primary)-reviewed,counts={'total':len(inventory),**dict(Counter(e['review_level'] for e in inventory))},inventory=inventory,candidate_notes=notes.get('candidate_notes',[]),controls=['Fonte fixa e sem escrita; nenhum script/produto ou endpoint executado.','Arquivo semantic exige faixa integral já lida; inventário pendente continua structural.','Exports/demos sem consumidor produtivo não viram achado de alcançabilidade presumida.'])
 (OUT/'ui-performance-coverage.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
 return result
if __name__=='__main__':
 r=build(); print(json.dumps({k:r[k] for k in ['state','primary_files','primary_full_file_read','primary_remaining','counts']}))
