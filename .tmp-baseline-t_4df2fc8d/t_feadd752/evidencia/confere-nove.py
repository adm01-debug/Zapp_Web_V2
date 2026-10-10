#!/usr/bin/env python3
# Prova, item a item, que as 9 linhas residuais deixam de ser debitadas.
# Cruza a lista das 9 (nove-residuais.txt) com a classificacao por linha de HOJE e do ajuste.
# Uso: python3 confere-nove.py <classif-hoje.out> <classif-novo.out> <nove-residuais.txt>
import sys

def ler_classif(path):
    d = {}
    for ln in open(path, encoding='utf-8'):
        if '\t' not in ln:
            continue
        k, l = ln.rstrip('\n').split('\t', 1)
        if k in ('explicada', 'drift', 'SEM'):
            d[l] = k
    return d

def ler_nove(path):
    out = []
    for ln in open(path, encoding='utf-8'):
        ln = ln.rstrip('\n')
        if not ln or ln.startswith('#'):
            continue
        if '||' in ln:
            ln = ln.split('||')[0].rstrip()
        out.append(ln)
    return out

hoje = ler_classif(sys.argv[1])
novo = ler_classif(sys.argv[2])
nove = ler_nove(sys.argv[3])

print('linhas das 9 residuais: %d' % len(nove))
deb_hoje = deb_novo = 0
for l in nove:
    kh = hoje.get(l, '<ausente no check>')
    kn = novo.get(l, '<ausente no check>')
    if kh == 'SEM':
        deb_hoje += 1
    if kn == 'SEM':
        deb_novo += 1
    print('HOJE=%-8s NOVO=%-6s %s' % (kh, kn, l[:120]))
print()
print('debitadas (SEM) HOJE=%d  NOVO=%d  de %d' % (deb_hoje, deb_novo, len(nove)))
