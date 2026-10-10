#!/usr/bin/env python3
# Perfil por TIPO das linhas do check e o que o filtro de HOJE (explicada()) nunca consegue atribuir.
import collections, sys, json

linhas = [l.strip() for l in open(sys.argv[1], encoding='utf-8') if l.strip()]

# tipos que a funcao explicada() do zapp-verify trata (linhas 85..102 do arquivo, sha 70c0b223)
TRATADOS = {'functions', 'columns', 'indexes', 'constraints', 'defaults', 'policies', 'triggers',
            'relation_grants', 'routine_grants', 'schema_grants', 'default_grants'}

por_tipo = collections.Counter(l.split('|', 1)[0] for l in linhas)
print("=== linhas por tipo (total %d) ===" % len(linhas))
for t, n in por_tipo.most_common():
    print("  %-18s %3d   %s" % (t, n, 'tratado por explicada()' if t in TRATADOS else 'NAO TRATADO por explicada()'))

nao_tratados = [l for l in linhas if l.split('|', 1)[0] not in TRATADOS]
print()
print("linhas de tipo NAO TRATADO por explicada() (nunca atribuiveis a migration pendente): %d" % len(nao_tratados))
for l in nao_tratados:
    print("  " + l)
