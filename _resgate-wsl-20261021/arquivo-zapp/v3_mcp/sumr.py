#!/usr/bin/env python3
"""Resumo compacto: para cada funcao do dump, mostra RETURNS e as keys jsonb / tabelas lidas."""
import re, sys
from analyze import load

funcs = load()
pat_keys = re.compile(r"jsonb_build_object\s*\(")
REL = re.compile(r'(?i)\b(from|join)\s+([a-z_][a-z0-9_.]*)')

def keys_of(body):
    ks = []
    for m in pat_keys.finditer(body):
        seg = body[m.end():m.end()+600]
        ks += re.findall(r"'([a-z_][a-z0-9_]*)'\s*,", seg)[:14]
    return sorted(set(ks))[:16]

def returns_of(body):
    m = re.search(r'RETURNS\s+(TABLE\s*\(([^)]*)\)|SETOF\s+\S+|jsonb|json|text|uuid|integer|bigint|boolean|void|timestamp[^,\n]*)', body, re.S)
    if not m:
        return '?'
    r = m.group(1).replace('\n', ' ')
    return re.sub(r'\s+', ' ', r)[:300]

for h in sorted(funcs):
    b = funcs[h]
    rels = sorted(set(x[1] for x in REL.findall(b)))
    if len(sys.argv) > 1 and not any(a in h for a in sys.argv[1:]):
        continue
    print('### ' + h)
    print('  RET:', returns_of(b))
    if keys_of(b):
        print('  KEYS:', ','.join(keys_of(b)))
    print('  FROM:', ','.join(rels[:12]))
