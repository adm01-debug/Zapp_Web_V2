#!/usr/bin/env python3
# Classifica, linha a linha, o que o EXPLICADOR de cada script faz com as diferencas do fixture.
# Reusa os corpos extraidos VERBATIM dos dois scripts (saida/explicador-{HOJE,NOVO}.py) via exec,
# sem alterar um byte deles. Nada de banco, rede ou producao.
import contextlib, io, os

EV = os.path.dirname(os.path.abspath(__file__))
W = os.path.join(EV, 'fixture', 'copia')
PEND = '20261007095739_cartao_drift_novo.sql'
CEN = [('neg', 'local-neg.json'), ('ctrl', 'local-ctrl.json'), ('misto', 'local-misto.json')]


def classifica(srcpath, cen, rot):
    NOME = 'v2-fixt2fd6-' + cen
    ST = os.path.join(EV, 'home', cen + '-' + rot, '.local/share/zapp-local/stacks', NOME, 'estado')
    os.environ['NOVAS'] = PEND
    os.environ['W'] = W
    os.environ['ST'] = ST
    g = {'__name__': 'explicador'}
    buf = io.StringIO()
    rc = 0
    try:
        with contextlib.redirect_stdout(buf):
            exec(compile(open(srcpath, encoding='utf-8').read(), srcpath, 'exec'), g)
    except SystemExit as e:
        rc = e.code if e.code is not None else 0
    pre = set(g.get('pre') or [])
    sem = set(g.get('sem') or [])
    linhas = [l.strip() for l in open(os.path.join(ST, 'check-diferencas.txt'), encoding='utf-8') if l.strip()]
    cat = {}
    for l in linhas:
        cat[l] = 'SEM (debitada ao cartao)' if l in sem else ('drift (NAO debitada)' if l in pre else 'explicada pela pendente')
    return cat, rc, buf.getvalue()


for cen, lm in CEN:
    hj, rc_hj, out_hj = classifica(os.path.join(EV, 'saida', 'explicador-HOJE.py'), cen, 'HOJE')
    nv, rc_nv, out_nv = classifica(os.path.join(EV, 'saida', 'explicador-NOVO.py'), cen, 'NOVO')
    print('== cenario %s (%s) ==================================================================' % (cen, lm))
    print('   %-62s %-24s %s' % ('linha de diferenca', 'HOJE', 'NOVO'))
    for l in sorted(hj):
        print('   %-62s %-24s %s' % (l[:62], hj[l], nv[l]))
    n_hj = sum(1 for v in hj.values() if v.startswith('SEM'))
    n_nv = sum(1 for v in nv.values() if v.startswith('SEM'))
    print('   -> debitadas ao cartao: HOJE %d de %d | NOVO %d de %d' % (n_hj, len(hj), n_nv, len(nv)))
    print('   -> rc do explicador (= veredito do passo banco_local): HOJE %s | NOVO %s' % (rc_hj, rc_nv))
    print('   -> stdout HOJE : %s' % (out_hj.strip().splitlines()[0] if out_hj.strip() else '(vazio)'))
    print('   -> stdout NOVO : %s' % (' | '.join(out_nv.strip().splitlines()) if out_nv.strip() else '(vazio)'))
    print()
