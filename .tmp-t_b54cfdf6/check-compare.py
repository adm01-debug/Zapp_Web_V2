import json,sys
loc=json.load(open(sys.argv[1])); prod=json.load(open(sys.argv[2])); tot=0; chaves=[]
aceitas=set()
if sys.argv[4]:
    aceitas={l.strip() for l in open(sys.argv[4], encoding='utf-8') if l.strip() and not l.lstrip().startswith('#')}
for s in prod:
    if not isinstance(prod[s],dict) or s=='database_identity': continue
    a,b=prod[s],loc.get(s,{})
    sp=sorted(set(a)-set(b)); sl=sorted(set(b)-set(a)); df=sorted(k for k in set(a)&set(b) if a[k]!=b[k]); n=len(sp)+len(sl)+len(df); tot+=n
    chaves+=[f"{s}|{x}" for x in sp+sl+df]
    if n:
        print(f"[{s}] só produção={len(sp)} só local={len(sl)} diferentes={len(df)}")
        for lab,l in (('só produção',sp),('só local',sl),('diferente',df)):
            for x in l[:8]: print(f"    {lab}: {x[:110]}{'  (aceita)' if f'{s}|{x}' in aceitas else ''}")
open(sys.argv[3],'w',encoding='utf-8').write(''.join(c+'\n' for c in chaves))
fora=[c for c in chaves if c not in aceitas]; sobra=sorted(aceitas-set(chaves))
if tot==0: print("ESTRUTURA: IDÊNTICA ao retrato da produção")
elif not fora: print(f"ESTRUTURA: {tot} diferença(s), todas na lista de aceitas")
else: print(f"ESTRUTURA: {tot} diferença(s) em relação ao retrato da produção" + (f" ({len(fora)} fora da lista de aceitas)" if aceitas else ""))
if sobra: print(f"aviso: {len(sobra)} linha(s) da lista de aceitas não apareceram como diferença")
sys.exit(0 if not fora else 1)
