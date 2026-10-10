#!/usr/bin/env python3
# Repro do cartao t_feadd752 — roda SÓ dentro do workspace do cartao (nada de outro chat, nada de producao).
# 1) extrai o explicador embutido dos DOIS scripts (original instalado x artefato ajustado)
# 2) classifica as 9 linhas residuais com cada um
# 3) controle negativo: objeto novo do cartao continua SEM; objeto ja no retrato canonico vira drift
import os, re, json, shutil, hashlib, subprocess

WS = '/mnt/c/Users/Joaquim Ataides/AppData/Local/hermes/kanban/boards/zapp-web-v2/workspaces/t_c5a96aba'
B = WS + '/.tmp/evidencias-baseline'
R = WS + '/.tmp/repro-t_feadd752'
ENT = WS + '/.tmp/t_feadd752/entrega'
NOVO = ENT + '/zapp-verify.novo'
HOJE = '/home/joaquim_ataides/.local/bin/zapp-verify'
os.makedirs(R, exist_ok=True)


def sha(p):
    return hashlib.sha256(open(p, 'rb').read()).hexdigest()


def extrai(src, dst):
    t = open(src, encoding='utf-8', errors='ignore').read()
    m = re.search(r"python3 - <<'PY'\n(.*?)\nPY\n", t, re.S)
    if not m:
        raise SystemExit('nao achei o heredoc PY em ' + src)
    open(dst, 'w', encoding='utf-8').write(m.group(1) + '\n')
    return len(m.group(1).splitlines())


print('== 0. entradas ==')
print('zapp-verify NOVO sha256 =', sha(NOVO))
print('zapp-verify HOJE sha256 =', sha(HOJE))
n = extrai(NOVO, R + '/emb-novo.py')
m = extrai(HOJE, R + '/emb-hoje.py')
print('explicador extraido: novo=%d linhas  hoje=%d linhas' % (n, m))

# o embutido do artefato tem de ser byte a byte o mesmo que o filtro usado na analise da tarefa 0
fn = B + '/filtro-novo.py'
if os.path.exists(fn):
    print('emb-novo.py == filtro-novo.py ?', open(R + '/emb-novo.py').read().strip() == open(fn).read().strip())

# ---- fixture A: arvore da linha do dia (retrato velho) + a migration pendente do cartao
ARV = R + '/arvore'
if os.path.exists(ARV):
    shutil.rmtree(ARV)
shutil.copytree(B + '/arvore-A', ARV)
os.makedirs(ARV + '/supabase/migrations', exist_ok=True)
PEND = '20261006204953_multiplix_cascata_bloco_terminal.sql'
shutil.copy(B + '/entradas/migration-pendente-20261006204953.sql', ARV + '/supabase/migrations/' + PEND)
ST = R + '/st'
os.makedirs(ST, exist_ok=True)
shutil.copy(B + '/entradas/falhas.tsv', ST + '/falhas.tsv')
nove = [l.strip() for l in open(B + '/nove-residuais.txt', encoding='utf-8') if l.strip() and not l.startswith('#')]
nove = [l.split('  ||')[0].strip() for l in nove]
open(ST + '/check-diferencas.txt', 'w', encoding='utf-8').write('\n'.join(nove) + '\n')
print('\n== 1. fixture A: %d linhas (as 9 residuais) + pendente %s ==' % (len(nove), PEND))

# ---- harness per-line: usa o corpo real do explicador, troca só o laço final
TAIL = """
linhas=[l.strip() for l in open(os.path.join(st,'check-diferencas.txt'),encoding='utf-8') if l.strip()]
c={'explicada':0,'drift':0,'SEM':0}
for l in linhas:
    if explicada(l): print('explicada\\t'+l); c['explicada']+=1
    elif drift_canonico(l): print('drift\\t'+l); c['drift']+=1
    else: print('SEM\\t'+l); c['SEM']+=1
print('total=%d explicadas=%d drift_canonico=%d SEM=%d' % (len(linhas), c['explicada'], c['drift'], c['SEM']))
"""


TAIL_HOJE = """
linhas=[l.strip() for l in open(os.path.join(st,'check-diferencas.txt'),encoding='utf-8') if l.strip()]
c={'explicada':0,'SEM':0}
for l in linhas:
    if explicada(l): print('explicada\\t'+l); c['explicada']+=1
    else: print('SEM\\t'+l); c['SEM']+=1
print('total=%d explicadas=%d SEM=%d' % (len(linhas), c['explicada'], c['SEM']))
"""


def harness(emb, out, w, st, novas):
    src = open(emb, encoding='utf-8').read()
    tem_drift = 'def drift_canonico' in src
    mark = 'pre=[]; sem=[]' if 'pre=[]; sem=[]' in src else 'sem=[]'
    head = src.split(mark)[0]
    open(out, 'w', encoding='utf-8').write(head + (TAIL if tem_drift else TAIL_HOJE))
    env = dict(os.environ, W=w, ST=st, NOVAS=novas)
    r = subprocess.run(['python3', out], capture_output=True, text=True, env=env)
    return r


for rot, emb in (('HOJE', R + '/emb-hoje.py'), ('NOVO', R + '/emb-novo.py')):
    r = harness(emb, R + '/cls-%s.py' % rot, ARV, ST, PEND)
    linhas = r.stdout.strip().splitlines()
    print('\n-- fixture A / %s -- rc=%d' % (rot, r.returncode))
    print(linhas[-1] if linhas else r.stderr.strip()[:300])

# roda os scripts como eles sao (exit code do passo banco_local)
print('\n== 2. execucao crua do explicador (rc = veredito banco_local) ==')
for rot, emb in (('HOJE', R + '/emb-hoje.py'), ('NOVO', R + '/emb-novo.py')):
    env = dict(os.environ, W=ARV, ST=ST, NOVAS=PEND)
    r = subprocess.run(['python3', emb], capture_output=True, text=True, env=env)
    print('%s rc=%d out=%s' % (rot, r.returncode, r.stdout.strip().splitlines()[0] if r.stdout.strip() else r.stderr.strip()[:200]))

# ---- fixture NEGATIVO: 1 objeto novo do cartao (SEM), 1 citado pela pendente (explicada),
#      1 ja no retrato canonico (drift a), 1 de migration ja aplicada na base canonica (drift b)
NEG = R + '/negativo'
if os.path.exists(NEG):
    shutil.rmtree(NEG)
os.makedirs(NEG + '/arvore/supabase/migrations', exist_ok=True)
json.dump({'functions': {'f:consume_gmail_oauth_state(p_user_id uuid, p_state text)': 'x'}},
          open(NEG + '/arvore/supabase/schema-manifest.json', 'w'))
open(NEG + '/arvore/supabase/migrations/29990101000000_cartao_pendente.sql', 'w').write(
    'ALTER TABLE public.sonda_cartao ADD COLUMN col_citada text;\n')
open(NEG + '/arvore/supabase/migrations/20250101000000_base_canonica.sql', 'w').write(
    'CREATE OR REPLACE FUNCTION public.funcao_antiga() RETURNS void LANGUAGE sql AS $$ SELECT 1 $$;\n')
NEGST = NEG + '/st'
os.makedirs(NEGST, exist_ok=True)
open(NEGST + '/check-diferencas.txt', 'w').write(
    'indexes|sonda_cartao.sonda_cartao_pkey\n'
    'columns|r:public.sonda_cartao.col_citada\n'
    'functions|f:consume_gmail_oauth_state(p_user_id uuid, p_state text)\n'
    'routine_grants|f:funcao_antiga()|authenticated|EXECUTE|grantor=postgres\n')
print('\n== 3. fixture NEGATIVO (tem de manter o objeto novo debitado) ==')
for rot, emb in (('HOJE', R + '/emb-hoje.py'), ('NOVO', R + '/emb-novo.py')):
    r = harness(emb, R + '/clsneg-%s.py' % rot, NEG + '/arvore', NEGST, '29990101000000_cartao_pendente.sql')
    print('-- negativo / %s -- rc=%d' % (rot, r.returncode))
    print(r.stdout.strip())
print('\nOK: repro concluida')
