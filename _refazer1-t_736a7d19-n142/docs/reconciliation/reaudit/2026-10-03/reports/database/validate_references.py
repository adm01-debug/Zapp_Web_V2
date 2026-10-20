"""Validate local report source ranges and file digests without executing SQL."""
from pathlib import Path
import collections
import hashlib
import json

OUT=Path(__file__).parent
ROOT=Path('/workspace/scratch/f8f9b9cbce53/reaudit/source')
PREVIOUS=Path('/workspace/scratch/8b95153002da/reconciliation/docs/reconciliation')
cache={}
errors=[]
counts=collections.Counter()

def file_info(path):
    key=str(path)
    if key not in cache:
        raw=path.read_bytes()
        cache[key]=(hashlib.sha256(raw).hexdigest(),len(raw.decode().splitlines()),hashlib.sha1(b'blob '+str(len(raw)).encode()+b'\0'+raw).hexdigest())
    return cache[key]

def walk(value,report,trail='$',inherited=None):
    if isinstance(value,list):
        for i,item in enumerate(value):walk(item,report,trail+f'[{i}]',inherited)
        return
    if not isinstance(value,dict):return
    path=inherited
    if isinstance(value.get('absolute_path'),str):path=Path(value['absolute_path'])
    elif isinstance(value.get('path'),str):
        p=Path(value['path'])
        path=p if p.is_absolute() else (PREVIOUS if value.get('origin')=='previous_audit' else ROOT)/p
    if path is not None:
        pairs=[('line_start','line_end'),('start_line','end_line')]
        needs_range=any(a in value or b in value for a,b in pairs)
        digest_keys=[k for k in ['sha256','file_sha256','source_sha256'] if isinstance(value.get(k),str) and len(value[k])==64]
        blob=value.get('git_blob_sha')
        if needs_range or digest_keys or blob:
            try:
                actual,line_count,actual_blob=file_info(path)
            except Exception as exc:
                errors.append({'report':report,'location':trail,'path':str(path),'error':str(exc)})
            else:
                for a,b in pairs:
                    if a in value or b in value:
                        lo=value.get(a);hi=value.get(b)
                        counts['line_ranges_checked']+=1
                        if not (isinstance(lo,int) and isinstance(hi,int) and 1<=lo<=hi<=line_count):
                            errors.append({'report':report,'location':trail,'path':str(path),'range':[lo,hi],'file_lines':line_count})
                for key in digest_keys:
                    counts['file_hash_references_checked']+=1
                    if value[key]!=actual:
                        errors.append({'report':report,'location':trail,'path':str(path),'hash_field':key,'expected':value[key],'actual':actual})
                if blob:
                    counts['git_blob_references_checked']+=1
                    if blob!=actual_blob:
                        errors.append({'report':report,'location':trail,'path':str(path),'hash_field':'git_blob_sha','expected':blob,'actual':actual_blob})
    for key,item in value.items():
        if isinstance(item,(dict,list)):walk(item,report,trail+'.'+key,path)

for p in sorted(OUT.glob('*.json')):
    if p.name=='reference_validation.json':continue
    obj=json.loads(p.read_text())
    counts['json_artifacts_checked']+=1
    walk(obj,p.name)

findings=json.loads((OUT/'findings.json').read_text())['findings']
ids=[f['id'] for f in findings]
if len(ids)!=len(set(ids)):errors.append({'error':'duplicate finding ID'})
if any(f['runtime_tested'] is not False for f in findings):errors.append({'error':'unexpected runtime-tested claim'})
policies=json.loads((OUT/'policy_review.json').read_text())
dos=json.loads((OUT/'do_review.json').read_text())
functions=json.loads((OUT/'function_review.json').read_text())
assert len(policies['policies'])==446
assert len(policies['source_extras'])==56
assert len(dos['do_blocks'])==107
assert len(functions['functions'])==311

result={
    'source_head':'da307ba5626dce892f0b37cb6762463f55d14a96',
    'scope':'Ranges and SHA256s of local evidence only; not SQL parsing, execution, acceptance, or a production check.',
    'counts':dict(counts),'unique_files_checked':len(cache),'finding_count':len(findings),
    'policy_body_counts':policies['coverage_counts'],'policy_extra_counts':policies['extra_coverage_counts'],
    'do_body_counts':dos['coverage_counts'],'function_body_counts':functions['coverage_counts'],
    'error_count':len(errors),'errors':errors,
}
(OUT/'reference_validation.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
print(json.dumps(result,ensure_ascii=False))
raise SystemExit(bool(errors))
