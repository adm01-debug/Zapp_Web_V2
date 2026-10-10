#!/usr/bin/env python3
# Classificador por linha do explicador do zapp-verify.
# Recebe um .py = CORPO do explicador (extraido byte a byte do script, sem o bloco final
# que imprime/exit), carrega as funcoes reais e classifica cada linha de check-diferencas.txt.
# Uso: W=<arvore com supabase/schema-manifest.json> ST=<estado com check-diferencas.txt> \
#      NOVAS=<migration pendente> python3 classifica.py <corpo.py>
import os
import sys

emb = sys.argv[1]
body = open(emb, encoding='utf-8').read()
marker = 'pre=[]' if 'pre=[]' in body else 'sem=[]'
i = body.index(marker)
prefix = body[:i]                      # tudo menos o bloco impressao/exit
g = {}
exec(compile(prefix, emb, 'exec'), g)

w = os.environ['W']
st = os.environ['ST']
linhas = [l.strip() for l in open(os.path.join(st, 'check-diferencas.txt'), encoding='utf-8') if l.strip()]

explicada = g.get('explicada')
drift = g.get('drift_canonico')        # ausente no corpo de HOJE (nao existe drift canonico)

n_exp = n_drift = n_sem = 0
classif = {}
for l in linhas:
    if explicada is not None and explicada(l):
        k = 'explicada'
        n_exp += 1
    elif drift is not None and drift(l):
        k = 'drift'
        n_drift += 1
    else:
        k = 'SEM'
        n_sem += 1
    classif[l] = k

print('== corpo=%s' % emb)
print('total=%d explicadas=%d drift_canonico=%d SEM=%d' % (len(linhas), n_exp, n_drift, n_sem))
if w:
    print('retrato=%s' % os.path.join(w, 'supabase', 'schema-manifest.json'))
print('-- classificacao por linha (classe<TAB>linha) --')
for l in linhas:
    print('%s\t%s' % (classif[l], l))
