#!/usr/bin/env python3
"""Deriva as '9 residuais' do check-diferencas REAL (128 linhas).

Definicao usada (a mesma do cartao pai / da tarefa 0): linha do diff real (retrato velho da copia 294
x banco local) cuja CHAVE nao existe no retrato canonico fresco (99ff88bf2) -- isto e, objeto que a
producao ja nao tem e que so o retrato velho carrega.

Entrada: out/A-check-diferencas.txt (real, sha256 cb31c19f...), entradas/retrato-fresco-99ff88bf2.json,
         entradas/manifest-local-1855.json
Saida:   entradas/9-residuais.txt  + relatorio no stdout
"""
import json, sys

linhas = [l.strip() for l in open('out/A-check-diferencas.txt', encoding='utf-8') if l.strip()]
fresco = json.load(open('entradas/retrato-fresco-99ff88bf2.json', encoding='utf-8'))
local = json.load(open('entradas/manifest-local-1855.json', encoding='utf-8'))

res = []
for l in linhas:
    tipo, chave = l.split('|', 1)
    no_fresco = chave in (fresco.get(tipo) or {})
    no_local = chave in (local.get(tipo) or {})
    if not no_fresco:
        res.append((l, tipo, chave, no_fresco, no_local))

open('entradas/9-residuais.txt', 'w', encoding='utf-8').write(''.join(x[0] + '\n' for x in res))
print(f'linhas do check real: {len(linhas)}')
print(f'residuais (chave ausente do retrato fresco): {len(res)}')
print(f'todas tambem ausentes do banco local (ou seja, "so producao"): {all(not x[4] for x in res)}')
for l, tipo, chave, nf, nl in res:
    print(f'  resid={not nf} local={nl}  {tipo}|{chave[:95]}')
