from pathlib import Path
import argparse, collections, gzip, json, re

parser=argparse.ArgumentParser(description='Compare explicit prior evidence and a structural microfunction catalog without asserting semantic review.')
parser.add_argument('--source',required=True);parser.add_argument('--prior',required=True);parser.add_argument('--catalog',required=True);parser.add_argument('--out',required=True)
a=parser.parse_args();source=Path(a.source).resolve();prior=Path(a.prior).resolve();catalog=Path(a.catalog).resolve();out=Path(a.out).resolve();out.mkdir(parents=True,exist_ok=True)
integrity=json.loads((catalog.parent/'source-integrity.json').read_text())
tracked={x['path']:x for x in integrity['files']};citations=[];seen=set()
def walk(obj,artifact,context=None):
    if isinstance(obj,dict):
        context=obj.get('canonical_id',obj.get('id',context))
        p=obj.get('path');lo=obj.get('line_start',obj.get('line'));hi=obj.get('line_end',obj.get('end_line',lo))
        if isinstance(p,str) and p in tracked:
            lo=lo if isinstance(lo,int) and lo>0 else None;hi=hi if isinstance(hi,int) and hi>0 else lo
            ref=obj.get('ref',obj.get('source_ref'))
            key=(artifact,str(context),p,lo,hi,str(ref),obj.get('kind'))
            if key not in seen:
                seen.add(key);citations.append({'path':p,'line_start':lo,'line_end':hi,'source_artifact':artifact,'record_id':context,'reference':ref,'kind':obj.get('kind'),'relationship':obj.get('relationship')})
        for v in obj.values():walk(v,artifact,context)
    elif isinstance(obj,list):
        for v in obj:walk(v,artifact,context)
input_artifacts=[prior/'FINDINGS.json',prior/'PLAN_REGISTRY.json',*sorted((prior/'tasks').glob('*.json'))]
for p in input_artifacts:walk(json.loads(p.read_text()),p.relative_to(prior).as_posix())
by_path=collections.defaultdict(list)
for c in citations:by_path[c['path']].append(c)
function_rows=json.loads((catalog/'microfunctions.json').read_text());function_evidence=[]
for f in function_rows:
    ranges=[x for x in by_path.get(f['path'],[]) if x['line_start'] and x['line_end']]
    overlaps=[x for x in ranges if x['line_start']<=f['line_end'] and x['line_end']>=f['line_start']]
    containing=[x for x in overlaps if x['line_start']<=f['line_start'] and x['line_end']>=f['line_end']]
    function_evidence.append({'id':f['id'],'path':f['path'],'name':f['name'],'line_start':f['line_start'],'line_end':f['line_end'],'is_test':f['is_test'],'layer':f['layer'],'branch_nodes':f['branch_nodes'],'prior_range_overlaps':len(overlaps),'prior_range_contains_function':bool(containing),'prior_file_reference_only':bool(by_path.get(f['path'])) and not overlaps,'evidence_state':'RANGE_OVERLAP_NOT_SEMANTIC_PROOF' if overlaps else 'NO_PRIOR_MATCHING_LINE_EVIDENCE_LOCATED'})
file_rows=[]
for p,f in tracked.items():
    cs=by_path.get(p,[]);has_lines=any(x['line_start'] for x in cs)
    file_rows.append({'path':p,'git_blob_sha':f['git_blob_sha'],'bytes':f['bytes'],'prior_reference_count':len(cs),'prior_line_reference_count':sum(bool(x['line_start']) for x in cs),'previous_evidence_state':'LINE_REFERENCES_LOCATED' if has_lines else 'PATH_REFERENCES_ONLY' if cs else 'NO_REFERENCE_IN_SELECTED_EVIDENCE_INDEX'})
features=[];features_path='docs/COMPLETE_SYSTEM_FEATURES.md'
by_basename=collections.defaultdict(list)
for p in tracked:
    if not any(t in p for t in ['/__tests__/','.test.','.spec.']):by_basename[Path(p).name].append(p)
for n,line in enumerate((source/features_path).read_text().splitlines(),1):
    m=re.match(r'^\|\s*(\d+\.\d+)\s*\|\s*([^|]+)\|\s*([^|]+)\|\s*(.*?)\s*\|$',line)
    if not m:continue
    fid,title,status,loc=m.groups();paths=re.findall(r'`((?:src|supabase|scripts|infrastructure|e2e|public)/[^`]+)`',loc)
    checks=[]
    for p in paths:
        isdir=p.endswith('/')
        check={'path':p,'exists':any(x.startswith(p) for x in tracked) if isdir else p in tracked,'kind':'directory' if isdir else 'file'}
        if not check['exists']:
            candidates=by_basename.get(Path(p).name,[])
            check.update(same_basename_candidates=candidates,candidate_state='ONE_RELOCATION_CANDIDATE_NOT_SEMANTIC_PROOF' if len(candidates)==1 else 'MULTIPLE_CANDIDATES' if candidates else 'NO_SAME_BASENAME_CANDIDATE')
        checks.append(check)
    disposition='PATH_EXISTS_BEHAVIOR_NOT_CERTIFIED' if checks and all(c['exists'] for c in checks) else 'MISSING_OR_RENAMED_PATH_REFERENCE' if checks else 'NON_FILE_REFERENCE_REQUIRES_CONTRACT_MAPPING'
    features.append({'id':fid,'title':title.strip(),'source_line':n,'claimed_status':status.strip(),'declared_location':loc.strip(),'path_checks':checks,'audit_state':disposition})
non_test=[f for f in function_evidence if not f['is_test']]
summary={'head_sha':integrity['head_sha'],'tracked_files':len(tracked),'indexed_prior_artifacts':len(input_artifacts),'unique_citation_records':len(citations),'files_with_any_prior_reference':sum(bool(f['prior_reference_count']) for f in file_rows),'files_with_prior_line_reference':sum(bool(f['prior_line_reference_count']) for f in file_rows),'files_without_reference_in_selected_index':sum(not f['prior_reference_count'] for f in file_rows),'non_test_functions':len(non_test),'non_test_functions_without_prior_line_overlap':sum(not f['prior_range_overlaps'] for f in non_test),'non_test_functions_with_prior_line_overlap':sum(bool(f['prior_range_overlaps']) for f in non_test),'feature_catalog_rows':len(features),'feature_catalog_claimed_checkmark':sum('✅' in f['claimed_status'] for f in features),'feature_catalog_path_states':dict(collections.Counter(f['audit_state'] for f in features)),'limitations':['Index scans structured path/line records in FINDINGS, PLAN_REGISTRY and 62 task files. Narrative-only citations and earlier chat reasoning can exist outside this index.','Missing a citation in this index is a traceability gap, not proof that nobody previously read the function or file.','Line overlap does not establish semantic review, and containing ranges can be very broad.','Function bodies include callbacks; they are not distinct business capabilities.','The feature catalog is historical source material; a checkmark is not current acceptance. Missing paths may be renamed or removed by a later decision.']}
def save(name,obj):
    b=(json.dumps(obj,ensure_ascii=False,indent=2)+'\n').encode();(out/name).write_bytes(b)
    if len(b)>200000:
        with gzip.GzipFile(filename=str(out/(name+'.gz')),mode='wb',mtime=0,compresslevel=9) as f:f.write(b)
save('prior-citation-index.json',citations);save('file-evidence-coverage.json',file_rows);save('microfunction-evidence-coverage.json',function_evidence);save('feature-catalog-reconciliation.json',features);save('coverage-summary.json',summary)
print(json.dumps(summary,ensure_ascii=False,indent=2))
