#!/usr/bin/env python3
"""Casa worktree local do PC do dono com branch remota + veredito do ledger.
Cada token do nome local e procurado como SUBSTRING no nome normalizado da branch
(resolve p0p1 vs p0-p1). Nao inventa: imprime o score para o dono julgar.
"""
import json, re, sys, os
DIR = os.path.dirname(os.path.abspath(__file__))
branches = [l.strip() for l in open(os.path.join(DIR,'branches.txt'),encoding='utf-8') if l.strip()]
led = json.load(open(os.path.join(DIR,'wt-main/analise-prs/resgate-261115/vereditos.json'),encoding='utf-8'))
ents = led if isinstance(led,list) else (led.get('entradas') or led.get('vereditos') or [])
ver = {str(e.get('branch') or e.get('ref') or '').replace('origin/',''): e.get('veredito','?') for e in ents}

PARAR = {'zapp','web','v2','fix','feat','chore','perf','claude','projetos','worktrees','docs'}
def toks(s):
    return [t for t in re.split(r'[^a-z0-9]+', s.lower())
            if t and t not in PARAR and not re.fullmatch(r'2611\d\d|\d{4}|\d{2}', t)]
def plano(s):
    return re.sub(r'[^a-z0-9]', '', s.lower())

for linha in sys.stdin:
    nome = linha.strip().replace('\\','/').rstrip('/')
    if not nome: continue
    base = nome.split('/')[-1]
    t = toks(base)
    melhor, score = None, 0
    for b in branches:
        pb = plano(b)
        s = sum(1 for x in t if len(x) >= 3 and x in pb)
        if s > score: melhor, score = b, s
    if melhor and score >= 2 or (melhor and score == 1 and len(t) == 1):
        print(f"{base:42s} -> {melhor:50s} [{ver.get(melhor,'(fora do ledger)')}]  {score}/{len(t)}")
    else:
        print(f"{base:42s} -> SEM BRANCH REMOTA (nunca empurrada)         {score}/{len(t)}")
