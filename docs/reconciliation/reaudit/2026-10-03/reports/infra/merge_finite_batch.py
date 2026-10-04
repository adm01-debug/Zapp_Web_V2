"""Documentation-only merge utility; imports no product module and runs no product command."""
from pathlib import Path
from collections import Counter, defaultdict
import hashlib, json, re
BASE = Path('/workspace/scratch/f8f9b9cbce53/reaudit')
OUT = BASE / 'reports/infra'
SRC = BASE / 'source'
HEAD = 'da307ba5626dce892f0b37cb6762463f55d14a96'
def digest(p):
    return hashlib.sha256(p.read_bytes()).hexdigest()
def dump(name, data):
    (OUT/name).write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n')
def merge_ranges(spans):
    out=[]
    for a,b in sorted(spans):
        if out and a<=out[-1][1]+1: out[-1][1]=max(out[-1][1],b)
        else: out.append([a,b])
    return out
def merge_batch(prefix, key, title, prior_count, artifacts=()):
    batch=json.loads((OUT/f'{prefix}-findings.json').read_text())
    coverage=json.loads((OUT/f'{prefix}-coverage.json').read_text())
    report=(OUT/f'{prefix}-report.md').read_text()
    new=batch['findings']; ids={f['id'] for f in new}
    main=json.loads((OUT/'findings.json').read_text())
    prior=[f for f in main['findings'] if f['id'] not in ids]
    assert len(prior)==prior_count
    prior_hash=hashlib.sha256(json.dumps(prior,ensure_ascii=False,sort_keys=True).encode()).hexdigest()
    main['findings']=prior+new
    main[key]=dict(coverage=f'{prefix}-coverage.json', findings=f'{prefix}-findings.json', report=f'{prefix}-report.md', added_ids=sorted(ids), preserved_prior_findings_sha256=prior_hash)
    combined=json.loads((OUT/'coverage.json').read_text()); inventory={e['path']:e for e in combined['inventory']}
    for e in coverage['inventory']:
        old=inventory.get(e['path'])
        if old is None:
            inventory[e['path']]=dict(e,binary=False,lexical_signals={})
            continue
        assert old['sha256']==e['sha256']
        spans=old.get('reviewed_ranges',old.get('reviewed_line_ranges',[]))
        if old['review_level']=='semantic' and not spans: spans=[[1,old['lines']]]
        spans=merge_ranges(spans+e['reviewed_ranges'])
        old['reviewed_ranges']=old['reviewed_line_ranges']=spans
        old['full_file_read']=spans==[[1,old['lines']]]
        old['review_level']='semantic' if old['full_file_read'] else 'targeted' if spans else 'structural'
        marker=f' {title}: '
        old['review_basis']=old.get('review_basis','').split(marker)[0]+marker+e['review_basis']
        old[key]=dict(artifact=f'{prefix}-coverage.json',reviewed_ranges=e['reviewed_ranges'])
    combined['inventory']=sorted(inventory.values(),key=lambda e:e['path'])
    cc=Counter(e['review_level'] for e in combined['inventory'])
    combined['counts']={'total':len(inventory),**dict(cc)}
    layers=defaultdict(Counter)
    for e in combined['inventory']: layers[e['layer']][e['review_level']]+=1
    combined['layers']={k:{'total':sum(v.values()),**dict(v)} for k,v in sorted(layers.items())}
    combined[key]=dict(artifact=f'{prefix}-coverage.json',primary_files=coverage['primary_files'],primary_lines=coverage['primary_lines'],primary_remaining_not_fully_read=coverage['primary_remaining'],counts=coverage['counts'])
    source_refs=0
    for f in main['findings']:
        for e in f.get('evidence',[]):
            if e.get('origin','source')!='source': continue
            assert digest(SRC/e['path'])==e['sha256']
            assert 1<=e['line_start']<=e['line_end']<=len((SRC/e['path']).read_text().splitlines())
            source_refs+=1
    for e in combined['inventory']:
        assert digest(SRC/e['path'])==e['sha256'],e['path']
        if not e.get('binary',False):
            assert len((SRC/e['path']).read_text().splitlines())==e['lines'],e['path']
        for a,b in e.get('reviewed_ranges',[]): assert 1<=a<=b<=e['lines']
    main_report=(OUT/'report.md').read_text()
    marker=f'\n## Ampliação finita — {title}\n'
    main_report=main_report.split(marker)[0].rstrip()+'\n'
    sev=Counter(f['severity'] for f in main['findings'])
    main_report=re.sub(r'## Resultado: \d+ mecanismos adicionais \([^\n]+\)',f'## Resultado: {len(main["findings"])} mecanismos adicionais ({sev["P1"]} P1, {sev["P2"]} P2, {sev["P3"]} P3)',main_report,count=1)
    main_report='\n'.join(line for line in main_report.splitlines() if not any(line.startswith(f'| {fid} |') for fid in ids))+'\n'
    table='\n'.join(f'| {f["id"]} | {f["severity"]} | {f["title"]} | novo; {title} |' for f in new)
    main_report=main_report.replace('\n## Evidência executada e limites',table+'\n\n## Evidência executada e limites',1)
    main_report=re.sub(r'Foram inventariados \d+ arquivos: \d+ com revisão semântica, \d+ com revisão dirigida e \d+ com revisão estrutural\.',f'Foram inventariados {len(inventory)} arquivos: {cc["semantic"]} com revisão semântica, {cc["targeted"]} com revisão dirigida e {cc["structural"]} com revisão estrutural.',main_report,count=1)
    start=main_report.index('| Camada | Semântica | Dirigida | Estrutural | Total |');end=main_report.index('\n\nWiring preservado:',start)
    layer_table='| Camada | Semântica | Dirigida | Estrutural | Total |\n|---|---:|---:|---:|---:|\n'+'\n'.join(f'| {k} | {v.get("semantic",0)} | {v.get("targeted",0)} | {v.get("structural",0)} | {v["total"]} |' for k,v in combined['layers'].items())
    main_report=main_report[:start]+layer_table+main_report[end:]+marker+'\n'+report.replace('# ','### ',1)
    dump('findings.json',main);dump('coverage.json',combined);(OUT/'report.md').write_text(main_report)
    integrity=dict(schema_version=1,baseline_sha=HEAD,finding_total=len(main['findings']),finding_counts=dict(sev),coverage_counts=combined['counts'],evidence_refs=sum(len(f.get('evidence',[])) for f in main['findings']),source_evidence_refs=source_refs,source_hashes_checked=len(inventory),added_ids=sorted(ids),primary_files=coverage['primary_files'],primary_lines=coverage['primary_lines'],primary_remaining=coverage['primary_remaining'],preserved_prior_findings_sha256=prior_hash,artifact_hashes={name:digest(OUT/name) for name in ['findings.json','coverage.json','report.md',f'{prefix}-findings.json',f'{prefix}-coverage.json',f'{prefix}-report.md','merge_finite_batch.py',*artifacts]})
    dump(f'{prefix}-integrity.json',integrity)
    return integrity
