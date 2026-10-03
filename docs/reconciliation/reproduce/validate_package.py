#!/usr/bin/env python3
"""Read-only integrity check of a downloaded reconciliation package."""
import argparse, collections, gzip, hashlib, json, pathlib, re, subprocess

parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--package',type=pathlib.Path,default=pathlib.Path(__file__).resolve().parents[1])
parser.add_argument('--repo',type=pathlib.Path,help='Optional checkout containing all pinned Git source objects.')
parser.add_argument('--output',type=pathlib.Path,help='Optional JSON result path; omit for stdout only.')
args=parser.parse_args();d=args.package.resolve();errors=[];checks={}
def load(p):return json.loads(p.read_text())
def require(ok,label):
    checks[label]=bool(ok)
    if not ok:errors.append(label)
master=load(d/'MASTER_LEDGER.json');registry=load(d/'PLAN_REGISTRY.json')
full=json.loads(gzip.decompress((d/master['complete_requirements_and_assessments']).read_bytes()))
findings=load(d/'FINDINGS.json')['findings'];plans=registry['plans'];by_id={x['id']:x for x in full}
require(len(full)==len(by_id)==master['coverage']['task_records'],'unique_and_complete_task_ids')
require(collections.Counter(x['status'] for x in full)==master['status_counts'],'status_counts')
require(len(plans)==registry['resolved_plans']==master['coverage']['source_plans_resolved'],'plan_counts')
require(all(x.get('rationale') for x in full),'nonempty_assessments')
require(len({f['id'] for f in findings})==len(findings),'unique_finding_ids')
compact=[]
for p in plans:
    packet=load(d/p['task_file']);rows=packet['tasks'];compact+=rows
    require(packet['plan']==p and len(rows)==p['observed_tasks'],'plan_'+p['record_id'])
    require(collections.Counter(x['status'] for x in rows)==p['status_counts'],'plan_status_'+p['record_id'])
require({x['canonical_id'] for x in compact}==set(by_id),'compact_and_full_ids_match')
require(all(all(x.get(k) for k in ['implementation','testing','runtime','documentation','acceptance']) for x in compact),'five_evidence_dimensions')
require(all(x['status']==by_id[x['canonical_id']]['status'] for x in compact),'compact_and_full_status_match')
current={'CURRENT_REFERENCE','CURRENT_EXTERNAL_REFERENCE','CROSS_MODULE_REFERENCE_PROGRAM','OVERLAPPING_CURRENT_REFERENCES','ARCHITECTURE_DECISION_REQUIRED','OFF_MAIN_REFERENCE_WITH_SEPARATE_DELIVERIES'}
require(all(x['review_level']!='LINEAGE_AND_SOURCE_RECONCILIATION_ONLY' for x in full if x['authority'] in current),'all_current_sources_have_individual_assessments')
for f in findings:
    for ref in f.get('affected_task_keys',[]):
        if ref.get('status')=='UNRESOLVED_REFERENCE':continue
        cid=ref.get('canonical_id')
        require(cid in by_id,'finding_ref_'+f['id']+'_'+str(cid))

json_count=gzip_count=0
for f in d.rglob('*'):
    if not f.is_file():continue
    if f.suffix=='.json':load(f);json_count+=1
    if f.name.endswith('.json.gz'):json.loads(gzip.decompress(f.read_bytes()));gzip_count+=1
broken=[]
for f in d.rglob('*.md'):
    # Exact historical sources can retain locators that belonged to another checkout.
    if any(v in f.relative_to(d).parts for v in ['history','sources']):continue
    for target in re.findall(r'(?<!!)\[[^\]\n]*\]\(([^)]+)\)',f.read_text()):
        p=target.split('#',1)[0]
        if not p or ':' in p or p.startswith('//'):continue
        if not (f.parent/p).exists():broken.append({'file':f.relative_to(d).as_posix(),'target':p})
require(not broken,'active_markdown_link_targets')

source_refs=source_ranges=0
if args.repo:
    for p in plans:
        if p.get('source_kind')=='EXTERNAL_USER_DOCUMENT':
            raw=(d/'sources/Plano_Dashboard_100_Etapas_2026-09-30.md').read_bytes()
            require(hashlib.sha256(raw).hexdigest()==p['source_sha256'],'source_hash_'+p['record_id'])
        else:
            proc=subprocess.run(['git','show',p['definition_ref']+':'+p['path']],cwd=args.repo,capture_output=True)
            require(proc.returncode==0,'source_read_'+p['record_id'])
            if proc.returncode:continue
            raw=proc.stdout;blob=hashlib.sha1(b'blob '+str(len(raw)).encode()+b'\0'+raw).hexdigest()
            if p.get('source_sha'):require(blob==p['source_sha'],'source_hash_'+p['record_id'])
        source_refs+=1;lines=raw.decode().splitlines()
        for t in full:
            if t['plan_path']!=p['path']:continue
            start=t['line'];end=t.get('end_line',start)
            require(1<=start<=end<=len(lines),'source_range_'+t['id']);source_ranges+=1

manifest=d/'evidence/ARTIFACT_MANIFEST.json';manifest_checked=0
if manifest.exists():
    for entry in load(manifest)['files']:
        p=d/entry['path']
        require(p.exists(),'artifact_exists_'+entry['path'])
        if p.exists():
            require(hashlib.sha256(p.read_bytes()).hexdigest()==entry['sha256'],'artifact_hash_'+entry['path'])
            manifest_checked+=1
report={'result':'PASS' if not errors else 'FAIL','baseline_main_sha':master['baseline_main_sha'],
 'task_records':len(full),'plans':len(plans),'findings':len(findings),'checks':len(checks),
 'json_files_parsed':json_count,'gzip_json_files_parsed':gzip_count,
 'source_refs_checked':source_refs,'source_ranges_checked':source_ranges,
 'artifact_hashes_checked':manifest_checked,'errors':errors,'broken_active_markdown_links':broken,
 'scope':'Package integrity only. Does not execute product code, tests, network calls or SQL.'}
out=json.dumps(report,ensure_ascii=False,indent=2)+'\n'
if args.output:args.output.write_text(out)
print(out,end='')
raise SystemExit(bool(errors))
