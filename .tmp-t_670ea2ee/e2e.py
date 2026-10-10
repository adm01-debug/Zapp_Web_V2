#!/usr/bin/env python3
# t_670ea2ee — EXECUCAO CRUA dos scripts REAIS (instalado x artefato), ponta a ponta, com colaboradores
# stubados (zapp-db-local/ler/guard, node, bun). O exit code e o resultado.txt vem do PROPRIO portao.
# Nada de producao, nada em ~/.local/bin, nada de projeto: HOME e $W sao sandbox.
import os, re, json, glob, stat, shutil, hashlib, subprocess, sys

WS = '/mnt/c/Users/Joaquim Ataides/AppData/Local/hermes/kanban/boards/zapp-web-v2/workspaces/t_c5a96aba'
ME = WS + '/.tmp/t_670ea2ee'
B  = '/home/joaquim_ataides/hermes-workspaces/Zapp_Web_V2/.tmp-baseline-t_4df2fc8d'
EN = B + '/entradas'
HOJE = '/home/joaquim_ataides/.local/bin/zapp-verify'
NOVO = '/home/joaquim_ataides/hermes-workspaces/Zapp_Web_V2/.tmp-t_8d3ddc95/ENTREGA/zapp-verify.novo'
NOME = 'v2-26100617458c7f'
SAIDA = ME + '/saida'
os.makedirs(SAIDA, exist_ok=True)
LOG = []

def say(s=''):
    print(s); LOG.append(s)

def sha(p): return hashlib.sha256(open(p, 'rb').read()).hexdigest()

# ---- stubs ------------------------------------------------------------------
BIN = ME + '/bin'
shutil.rmtree(BIN, ignore_errors=True); os.makedirs(BIN)
def stub(nome, corpo):
    p = BIN + '/' + nome
    open(p, 'w').write('#!/usr/bin/env bash\n' + corpo)
    os.chmod(p, 0o755)
stub('zapp-db-guard', 'exit 0\n')
stub('node', 'exit 0\n')
stub('bun', 'exit 0\n')
stub('zapp-db-ler', '''if [ "${STUB_LEDGER:-ok}" = "bloqueado" ]; then
  echo "R1: leitura de producao bloqueada ao agente (rc=77)" >&2; exit 77
fi
python3 - "$STUB_LEDGER_VERSOES" <<'PY'
import json,sys
v=[x for x in open(sys.argv[1]).read().split() if x.strip()]
print(json.dumps({"rows":[{"v":",".join(v)}]}))
PY
''')
stub('zapp-db-local', '''sub="${1:-}"; W="${2:-}"; N="${3:-}"
ST="$HOME/.local/share/zapp-local/stacks/$N/estado"; mkdir -p "$ST"
case "$sub" in
  travas) echo "travas: OK (stub)"; exit 0;;
  check)
    [ -n "${STUB_CHECK:-}" ] && cp "$STUB_CHECK" "$ST/check-diferencas.txt"
    printf '%s\\n' "$W" > "$ST/copia.txt"
    [ -n "${STUB_FALHAS:-}" ] && cp "$STUB_FALHAS" "$ST/falhas.tsv"
    echo "ESTRUTURA: banco local difere do retrato canonico da copia ($(wc -l < "$ST/check-diferencas.txt") linha(s)) [stub]"
    exit "${STUB_CHECK_RC:-1}";;
esac
exit 0
''')

say('== 6. EXECUCAO PONTA A PONTA do portao REAL (colaboradores stubados; HOME/$W em sandbox) ==')
say('fontes: HOJE=%s (%s)' % (HOJE, sha(HOJE)[:16]))
say('        NOVO=%s (%s)' % (NOVO, sha(NOVO)[:16]))
say('invocacao: bash <script> <copia> <nome> --rapido  |  PATH=<stubs>:$PATH  |  HOME=sandbox por cenario')

EDGE_ARV = ME + '/edge/arvore'
open(ME + '/edge/ledger.txt', 'w').write('0001\n')          # 0001 aplicada / 9001 pendente
CEN = [
    ('1. 9 residuais',       'HOJE', HOJE, ME + '/arvore-velho',  ME + '/check9.txt',           'ok',        B + '/ledger-fixture-versoes.txt'),
    ('2. 9 residuais',       'NOVO', NOVO, ME + '/arvore-velho',  ME + '/check9.txt',           'ok',        B + '/ledger-fixture-versoes.txt'),
    ('3. A-128 velho',       'HOJE', HOJE, ME + '/arvore-velho',  ME + '/checkA.txt',           'ok',        B + '/ledger-fixture-versoes.txt'),
    ('4. A-128 velho',       'NOVO', NOVO, ME + '/arvore-velho',  ME + '/checkA.txt',           'ok',        B + '/ledger-fixture-versoes.txt'),
    ('5. B-2 fresco',        'HOJE', HOJE, ME + '/arvore-fresco', ME + '/checkB.txt',           'ok',        B + '/ledger-fixture-versoes.txt'),
    ('6. B-2 fresco',        'NOVO', NOVO, ME + '/arvore-fresco', ME + '/checkB.txt',           'ok',        B + '/ledger-fixture-versoes.txt'),
    ('7. 9 residuais LEDGER BLOQUEADO', 'NOVO', NOVO, ME + '/arvore-velho', ME + '/check9.txt', 'bloqueado', B + '/ledger-fixture-versoes.txt'),
    ('8. B-2 fresco LEDGER BLOQUEADO',  'NOVO', NOVO, ME + '/arvore-fresco', ME + '/checkB.txt','bloqueado', B + '/ledger-fixture-versoes.txt'),
    ('9. bordas E1-E6',      'HOJE', HOJE, EDGE_ARV,             ME + '/edge/st/check-bordas.txt', 'ok',     ME + '/edge/ledger.txt'),
    ('10. bordas E1-E6',     'NOVO', NOVO, EDGE_ARV,             ME + '/edge/st/check-bordas.txt', 'ok',     ME + '/edge/ledger.txt'),
]
say('')
say('%-34s %-5s %-6s %-16s %s' % ('cenario', 'quem', 'exit', 'veredito', 'linha do banco_local no resultado.txt'))
say('-' * 136)
for i, (cen, tag, script, arv, chk, led, ledfile) in enumerate(CEN, 1):
    home = ME + '/home-c%02d' % i
    shutil.rmtree(home, ignore_errors=True); os.makedirs(home)
    chave = 'PATH'
    env = dict(os.environ)
    env.update({'HOME': home, chave: BIN + ':' + os.environ.get(chave, ''),
                'STUB_LEDGER': led, 'STUB_LEDGER_VERSOES': ledfile, 'STUB_CHECK': chk,
                'STUB_FALHAS': B + '/entradas/falhas.tsv', 'STUB_CHECK_RC': '1'})
    r = subprocess.run(['bash', script, arv, NOME, '--rapido'], capture_output=True, text=True, env=env)
    out = r.stdout + r.stderr
    open(SAIDA + '/e2e-%02d-%s.out' % (i, tag), 'w').write(
        'CMD: bash %s %s %s --rapido\nEXIT: %d\n--- stdout+stderr ---\n%s' % (script, arv, NOME, r.returncode, out))
    res = sorted(glob.glob(home + '/.local/state/zapp-verify/*/resultado.txt'))
    linha = ''
    if res:
        txt = open(res[0]).read()
        m = [l for l in txt.splitlines() if 'banco_local' in l]
        linha = m[-1] if m else ''
    vered = 'VERMELHO' if r.returncode else 'verde'
    if 'FALHOU' in linha: vered = 'VERMELHO(FALHOU)'
    elif 'AVISO' in linha: vered = 'verde(AVISO)'
    say('%-34s %-5s %-6d %-16s %s' % (cen, tag, r.returncode, vered, linha[:86]))
    for lg in glob.glob(home + '/.local/state/zapp-verify/*/banco_local.log'):
        shutil.copy(lg, SAIDA + '/e2e-%02d-%s-banco_local.log' % (i, tag))

say('')
say('== 7. o que o portao REAL imprime no veredito (extrato do log do passo banco_local) ==')
for i, tag in ((1, 'HOJE'), (2, 'NOVO'), (4, 'NOVO'), (7, 'NOVO')):
    p = SAIDA + '/e2e-%02d-%s-banco_local.log' % (i, tag)
    if os.path.exists(p):
        t = open(p, encoding='utf-8', errors='ignore').read().strip()
        say('   cenario %d (%s): %s' % (i, tag, t.replace('\n', ' | ')[:230]))

open(SAIDA + '/E2E.txt', 'w').write('\n'.join(LOG) + '\n')
say('')
say('evidencias em %s/E2E.txt e e2e-*.out / e2e-*-banco_local.log' % SAIDA)
