#!/usr/bin/env python3
# t_debaf8a8 - verificacao (negativo) do ajuste do zapp-verify.
# Passo 1: reproduz as linhas de diferenca com o COMPARADOR REAL (extraido de zapp-db-local check)
#          a partir dos manifestos crus, e confere contra o que o check ao vivo gravou.
# Passo 2: calcula as migrations PENDENTES (versao fora do ledger de versoes aplicadas).
# So le arquivos. Sem banco, sem producao, sem escrever fora do meu workspace.
import json, os, re, sys, subprocess, hashlib

SB = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
E = SB + '/entradas'
OUT = SB + '/saida'
os.makedirs(OUT, exist_ok=True)

def sha(p):
    return hashlib.sha256(open(p, 'rb').read()).hexdigest()

# ---- 1. extrai o comparador real do zapp-db-local -------------------------------
ZB = '/home/joquim_ataides'  # placeholder, corrigido abaixo
ZB = os.path.expanduser('~/.local/bin/zapp-db-local')
txt = open(ZB, encoding='utf-8', errors='ignore').read()
m = re.search(r"python3 - \"\$ST/manifest-local.json\".*?<<'PY'\n(.*?)\nPY\n\s*;;", txt, re.S)
if not m:
    sys.exit('nao achei o comparador embutido em zapp-db-local')
comp = SB + '/trab/comparador-real.py'
open(comp, 'w', encoding='utf-8').write(m.group(1) + '\n')
print('comparador real extraido: %d linhas  sha256=%s' % (len(m.group(1).splitlines()), sha(comp)))

# ---- 2. roda o comparador real (manifesto local x retrato canonico da copia) ----
r = subprocess.run(['python3', comp,
                    E + '/manifest-local-live.json',
                    E + '/retrato-canonico-da-copia.json',
                    OUT + '/comparador-diferencas.txt',
                    ''], capture_output=True, text=True)
open(OUT + '/comparador.out', 'w', encoding='utf-8').write(r.stdout + r.stderr)
print('comparador rc=%d' % r.returncode)
print(r.stdout.strip()[:600])

# ---- 3. confere com o que o check ao vivo gravou --------------------------------
def linhas(p):
    return [l.strip() for l in open(p, encoding='utf-8') if l.strip()]
repro = linhas(OUT + '/comparador-diferencas.txt')
vivo = linhas(E + '/check-diferencas-live.txt')
print('reproduzidas=%d  ao vivo=%d  iguais=%s' % (len(repro), len(vivo), repro == vivo))
if repro != vivo:
    print('  so na reproducao:', [x for x in repro if x not in vivo][:5])
    print('  so no ao vivo   :', [x for x in vivo if x not in repro][:5])
open(OUT + '/comparacao.txt', 'w', encoding='utf-8').write(
    'reproduzidas=%d vivo=%d iguais=%s\n' % (len(repro), len(vivo), repro == vivo))

# ---- 4. migrations pendentes (versao fora do ledger de versoes aplicadas) -------
C = '/home/joaquim_ataides/hermes-workspaces/Zapp_Web_V2/indeterminate-optout-outbox-migration-re-26100709037ed9'
prod = set(x for x in open(E + '/ledger-fixture-versoes.txt', encoding='utf-8').read().split() if x)
migs = sorted(f for f in os.listdir(C + '/supabase/migrations') if f.endswith('.sql'))
pend = [f for f in migs if f.split('_')[0] not in prod]
print('ledger=%d versoes | migrations .sql na copia=%d | PENDENTES=%d' % (len(prod), len(migs), len(pend)))
for f in pend:
    print('  pendente: %s' % f)
open(OUT + '/pendentes.txt', 'w', encoding='utf-8').write('\n'.join(pend) + '\n')
open(OUT + '/resumo-passo1.txt', 'w', encoding='utf-8').write(
    'comparador_sha256=%s\nreproduzidas=%d\nvivo=%d\niguais=%s\npendentes=%s\n' % (
        sha(comp), len(repro), len(vivo), repro == vivo, ','.join(pend)))
print('OK passo 1')
