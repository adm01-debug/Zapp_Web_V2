import subprocess,json,glob,os,sys,re
from concurrent.futures import ProcessPoolExecutor
S=sys.argv[1]; REPO='/home/user/Zapp_Web_V2'
def run(cmd,inp=None): return subprocess.run(cmd,cwd=REPO,capture_output=True,input=inp).stdout
def norm(l): return re.sub(rb'\s+',b'',l)
def main_lines(path):
    b=run(['git','show',f'origin/main:{path}'])
    return set(norm(l) for l in b.splitlines())
def basename_in_main(path):
    base=os.path.basename(path)
    out=run(['git','ls-tree','-r','--name-only','origin/main']).decode('utf-8','replace').splitlines()
    return [p for p in out if os.path.basename(p)==base and p!=path][:5]
def check_item(path):
    it=json.load(open(path))
    for f in it['files']:
        if f.get('hunk') in ('PRESENT_BYTE','PRESENT_REVERSE_APPLIES','NO_PATCH'): continue
        patch=run(['git','diff',it['merge_base'],it['ref'],'--',f['path']])
        added=[l[1:] for l in patch.splitlines() if l.startswith(b'+') and not l.startswith(b'+++')]
        removed=[l[1:] for l in patch.splitlines() if l.startswith(b'-') and not l.startswith(b'---')]
        sig=lambda ls:[l for l in ls if len(norm(l))>3]
        added=sig(added); removed=sig(removed)
        if f['status']=='DELETED_IN_BRANCH':
            f['line_check']={'note':'branch deletes file; main still has it'}; continue
        ml=main_lines(f['path']) if f['status']!='NEW_FILE_ABSENT_IN_MAIN' else set()
        miss=[l for l in added if norm(l) not in ml]
        still=[l for l in removed if norm(l) in ml]
        f['line_check']={'added':len(added),'missing_in_main':len(miss),'removed':len(removed),'removed_still_in_main':len(still),
                         'missing_sample':[l.decode('utf-8','replace')[:160] for l in miss[:25]],
                         'still_sample':[l.decode('utf-8','replace')[:160] for l in still[:10]]}
        if f['status']=='NEW_FILE_ABSENT_IN_MAIN':
            cands=basename_in_main(f['path']); f['line_check']['same_basename_in_main']=cands
            if cands:
                cl=set(); [cl.update(main_lines(c)) for c in cands]
                f['line_check']['missing_vs_same_basename']=sum(1 for l in added if norm(l) not in cl)
    # item-level verdict refinement
    hard=[f for f in it['files'] if f.get('line_check') and (f['line_check'].get('missing_in_main',0)>0 or f['line_check'].get('removed_still_in_main',0)>0 or 'note' in f['line_check'])]
    if it['auto']=='MISTO_CONFLITO' and not hard: it['auto']='INCORPORADA_PROVA_LINHAS'
    it['n_files_with_gaps']=len(hard)
    it['gap_lines_total']=sum(f['line_check'].get('missing_in_main',0)+f['line_check'].get('removed_still_in_main',0) for f in hard if 'note' not in f['line_check'])
    json.dump(it,open(path,'w'),ensure_ascii=False,indent=1)
    return it['id'],it['auto'],it['n_files_with_gaps'],it['gap_lines_total']
files=sorted(glob.glob(f'{S}/items/*.json'))
with ProcessPoolExecutor(4) as ex: res=list(ex.map(check_item,files))
from collections import Counter
print(Counter(r[1] for r in res))
res.sort(key=lambda r:-r[3])
json.dump(res,open(f'{S}/auto2.json','w'))
print('items with gaps:',sum(1 for r in res if r[2]>0))
print('gap buckets (lines):',Counter(('0' if r[3]==0 else '1-20' if r[3]<=20 else '21-100' if r[3]<=100 else '101-500' if r[3]<=500 else '>500') for r in res))
