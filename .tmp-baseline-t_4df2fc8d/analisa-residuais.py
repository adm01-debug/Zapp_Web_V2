#!/usr/bin/env python3
# Analise das linhas do check-diferencas do conjunto v2-26100617458c7f:
# de onde vem cada linha do diff VELHO (128) e o que sobra no diff com o retrato FRESCO (99ff88bf2).
import json, sys, collections

loc = json.load(open(sys.argv[1]))      # manifest-local.json (o banco local do conjunto)
velho = json.load(open(sys.argv[2]))    # supabase/schema-manifest.json da copia (dia/2026-10-06)
fresco = json.load(open(sys.argv[3]))   # supabase/schema-manifest.json de 99ff88bf2 (origin/main)
linhas = [l.strip() for l in open(sys.argv[4], encoding='utf-8') if l.strip()]

def chave_existe(ret, tipo, x):
    d = ret.get(tipo)
    return isinstance(d, dict) and x in d

def classifica(ret, tipo, x):
    d = ret.get(tipo)
    if not isinstance(d, dict): return 'sem-secao'
    b = loc.get(tipo, {})
    if x in d and x in b: return 'diferente' if d[x] != b[x] else 'igual'
    if x in d: return 'so-producao'
    if x in b: return 'so-local'
    return 'ausente-nos-dois'

print("linhas do check (retrato VELHO): %d" % len(linhas))
cont = collections.Counter()
so_velho = []
em_fresco = 0
for l in linhas:
    tipo, x = l.split('|', 1)
    cv = classifica(velho, tipo, x)
    cf = classifica(fresco, tipo, x)
    cont[(cv, cf)] += 1
    if chave_existe(fresco, tipo, x): em_fresco += 1
    else: so_velho.append((l, cv, cf, chave_existe(velho, tipo, x), chave_existe(loc, tipo, x)))
print("linhas cuja chave EXISTE no retrato fresco : %d" % em_fresco)
print("linhas cuja chave NAO existe no retrato fresco: %d" % len(so_velho))
print()
print("=== combinacoes (retrato velho, retrato fresco) ===")
for (cv, cf), n in sorted(cont.items(), key=lambda kv: -kv[1]):
    print("  velho=%-12s fresco=%-18s : %d" % (cv, cf, n))
print()
print("=== as %d linhas cuja chave NAO existe no retrato fresco (\"as 9 residuais\" do pai) ===" % len(so_velho))
for l, cv, cf, in_v, in_l in so_velho:
    print("  %-105s velho=%-11s fresco=%-18s local=%s" % (l[:105], cv, cf, in_l))
print()
print("=== as linhas do diff com o retrato FRESCO (o que o check gera de verdade) ===")
tot = 0
for s, a in fresco.items():
    if not isinstance(a, dict) or s == 'database_identity': continue
    b = loc.get(s, {})
    sp = sorted(set(a) - set(b)); sl = sorted(set(b) - set(a)); df = sorted(k for k in set(a) & set(b) if a[k] != b[k])
    for lab, xs in (('so-producao', sp), ('so-local', sl), ('diferente', df)):
        for x in xs:
            tot += 1
            print("  %-11s %s|%s" % (lab, s, x[:110]))
print("total: %d" % tot)
