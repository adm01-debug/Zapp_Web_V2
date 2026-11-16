# Armadilha 10.1: trabalho que um commit INTERMEDIARIO adicionou e um commit POSTERIOR da propria
# branch removeu. O diff merge-base..tip nao mostra. Procura linhas presentes em algum commit
# intermediario, ausentes no tip da branch E ausentes na main.
import subprocess,json,glob,sys,re,os
from concurrent.futures import ProcessPoolExecutor
S=sys.argv[1]; REPO='/home/user/Zapp_Web_V2'
def g(*a): return subprocess.run(['git',*a],cwd=REPO,capture_output=True).stdout
def norm(l): return re.sub(rb'\s+',b'',l)
def one(path):
    it=json.load(open(path))
    ref=it['ref']; mb=it['merge_base']
    commits=[x.decode() for x in g('rev-list','--reverse','--no-merges',f'{mb}..{ref}').split()]
    tip_c=g('rev-parse',ref).strip().decode()
    commits=[c for c in commits if c!=tip_c]
    if not commits: return None
    achados=[]
    for c in commits:
        for f in g('diff','--name-only',f'{c}~1',c).decode('utf-8','replace').split():
            if not f or f.endswith(('.json','.lock','.md')) or '/_arquivo/' in f: continue
            add=[l[1:] for l in g('diff',f'{c}~1',c,'--',f).splitlines() if l.startswith(b'+') and not l.startswith(b'+++')]
            add=[l for l in add if len(norm(l))>12 and not norm(l).startswith(b'//') and not norm(l).startswith(b'*')]
            if not add: continue
            tip=set(norm(x) for x in g('show',f'{ref}:{f}').splitlines())
            mn=set(norm(x) for x in g('show',f'origin/main:{f}').splitlines())
            perd=[l for l in add if norm(l) not in tip and norm(l) not in mn]
            if perd: achados.append({'commit':c[:9],'arquivo':f,'linhas':len(perd),'amostra':[x.decode('utf-8','replace')[:150] for x in perd[:6]]})
    if not achados: return None
    return {'id':it['id'],'ref':ref,'total_linhas':sum(a['linhas'] for a in achados),'achados':achados}
files=sorted(glob.glob(f'{S}/items/*.json'))
with ProcessPoolExecutor(4) as ex: res=[r for r in ex.map(one,files) if r]
res.sort(key=lambda r:-r['total_linhas'])
json.dump(res,open(f'{S}/perda-intermediaria.json','w'),ensure_ascii=False,indent=1)
print(len(res),'itens com trabalho removido por commit posterior da propria branch')
for r in res[:25]: print(f"  {r['id'][:50]:50} {r['total_linhas']:5}L  {', '.join(sorted({a['arquivo'] for a in r['achados']}))[:110]}")
