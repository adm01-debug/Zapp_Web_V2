import subprocess,json,glob,os,sys,tempfile
from concurrent.futures import ProcessPoolExecutor
S=sys.argv[1]; REPO='/home/user/Zapp_Web_V2'
def run(cmd,env=None,inp=None):
    return subprocess.run(cmd,cwd=REPO,capture_output=True,env=env,input=(inp if inp is None else inp))
def check_item(path):
    it=json.load(open(path))
    idx=tempfile.NamedTemporaryFile(delete=False).name
    env=dict(os.environ,GIT_INDEX_FILE=idx)
    run(['git','read-tree','origin/main'],env=env)
    for f in it['files']:
        if f['status'] in ('IDENTICAL_TO_MAIN',): f['hunk']='PRESENT_BYTE'; continue
        patch=run(['git','diff','--binary',it['merge_base'],it['ref'],'--',f['path']]).stdout
        if not patch.strip(): f['hunk']='NO_PATCH'; continue
        f['patch_lines']=patch.count(b'\n')
        rev=run(['git','apply','--cached','--check','-R'],env=env,inp=patch)
        if rev.returncode==0: f['hunk']='PRESENT_REVERSE_APPLIES'; continue
        fwd=run(['git','apply','--cached','--check'],env=env,inp=patch)
        f['hunk']='ABSENT_APPLIES_CLEAN' if fwd.returncode==0 else 'CONFLICT'
        f['patch_lines']=patch.count(b'\n')
    os.unlink(idx)
    hs=set(f['hunk'] for f in it['files'])
    if not hs: it['auto']='EMPTY'
    elif hs<={'PRESENT_BYTE','PRESENT_REVERSE_APPLIES','NO_PATCH'}: it['auto']='INCORPORADA_PROVA_PATCH'
    elif 'CONFLICT' not in hs: it['auto']='TRABALHO_AUSENTE_APLICA_LIMPO'
    else: it['auto']='MISTO_CONFLITO'
    json.dump(it,open(path,'w'),ensure_ascii=False,indent=1)
    return it['id'],it['auto'],sum(1 for f in it['files'] if f['hunk']=='CONFLICT'),sum(1 for f in it['files'] if f['hunk']=='ABSENT_APPLIES_CLEAN')
files=sorted(glob.glob(f'{S}/items/*.json'))
with ProcessPoolExecutor(4) as ex: res=list(ex.map(check_item,files))
from collections import Counter
print(Counter(r[1] for r in res))
json.dump(res,open(f'{S}/auto.json','w'))
