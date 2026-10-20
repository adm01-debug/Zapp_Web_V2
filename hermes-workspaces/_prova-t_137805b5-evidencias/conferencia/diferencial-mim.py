import os, subprocess, sys, glob

PROVA = os.path.dirname(os.path.abspath(__file__))
STACKS = os.path.expanduser('~/.local/share/zapp-local/stacks')
GERADOS = ('_pkey', '_fkey', '_key', '_check', '_excl')
PAPEIS_PADRAO = ('postgres', 'anon', 'authenticated', 'service_role')

def pendentes(copia):
    out = []
    try:
        for ln in open(os.path.join(copia, '.hermes-tarefa'), encoding='utf-8'):
            if ln.startswith('APLICADA_LOCAL='):
                out.append(ln.split('=', 1)[1].strip().split()[0])
    except OSError:
        pass
    return '\n'.join(out)

def classe(linha):
    tipo, _, resto = linha.partition('|')
    if tipo == 'rls':
        return 'rls'
    if tipo in ('indexes', 'constraints'):
        nome = resto.split('.')[-1].strip('"').lower()
        if nome.endswith(GERADOS):
            return 'nome-gerado'
        return '??'
    if tipo in ('relation_grants', 'routine_grants', 'schema_grants'):
        papel = linha.split('|')[2].lower() if len(linha.split('|')) > 2 else ''
        if papel in PAPEIS_PADRAO:
            return 'acl-padrao'
        return '??'
    return '??'

def vereditos(bloco, w, st, novas):
    env = dict(os.environ, NOVAS=novas, W=w, ST=st)
    r = subprocess.run(['python3', os.path.join(PROVA, 'veredito_linhas.py'),
                        os.path.join(PROVA, 'alvos', 'bloco-%s.py' % bloco)],
                       env=env, capture_output=True, text=True)
    out = {}
    for ln in r.stdout.splitlines():
        v, _, l = ln.partition('\t')
        out[l] = v
    if r.returncode != 0:
        out['<runner_rc>'] = str(r.returncode)
    return out

estados = 0
linhas_total = 0
mudaram = []
regridiram = []
iguais = 0
for est in sorted(glob.glob(os.path.join(STACKS, '*', 'estado'))):
    cdiff = os.path.join(est, 'check-diferencas.txt')
    ctx = os.path.join(est, 'copia.txt')
    if not (os.path.isfile(cdiff) and os.path.isfile(ctx)):
        continue
    copia = open(ctx, encoding='utf-8').read().strip()
    if not (os.path.isdir(copia) and os.path.isfile(os.path.join(copia, '.hermes-tarefa'))):
        continue
    novas = pendentes(copia)
    a = vereditos('atual', copia, est, novas)
    b = vereditos('novo', copia, est, novas)
    estados += 1
    for l in sorted(set(a) | set(b)):
        if l == '*':
            continue
        va, vb = a.get(l, 'FALHOU'), b.get(l, 'FALHOU')
        linhas_total += 1
        if va != vb:
            mudaram.append((est.split('/')[-2], l, va, vb, classe(l)))
            if va in ('EXPLICADA', 'DRIFT') and vb == 'FALHOU':
                regridiram.append((est.split('/')[-2], l, va, vb))
        else:
            iguais += 1
print('estados com copia+.hermes-tarefa:', estados)
print('linhas comparadas:', linhas_total)
print('vereditos iguais:', iguais)
print('mudaram de veredito:', len(mudaram))
for e, l, va, vb, c in mudaram:
    print('  MUDOU [%s] %s -> %s classe=%s :: %s' % (e, va, vb, c, l[:160]))
fora = [m for m in mudaram if m[4] == '??']
print('mudaram FORA das 3 classes:', len(fora))
for m in fora:
    print('  FORA:', m)
print('explicada ANTES e FALHOU DEPOIS:', len(regridiram))
for m in regridiram:
    print('  REGRESSAO:', m)
