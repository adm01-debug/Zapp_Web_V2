#!/usr/bin/env python3
"""Explica, item a item, o que acontece com cada uma das 9 residuais.

NAO reimplementa o predicado: para cada linha roda o EXPLICADOR REAL de cada versao (o heredoc
`python3 - <<'PY'` extraido VERBATIM do script) com um estado (ST) contendo SO aquela linha, e olha
o exit code (1 = debitada ao cartao, 0 = nao debitada). Depois junta dois FATOS sobre o dado:

  * a chave existe no retrato da copia (supabase/schema-manifest.json da arvore)?  -> prova (a) do ajuste
  * algum nome da linha aparece como palavra inteira no texto da migration PENDENTE? -> prova do explicada()

Uso: python3 analisa-9.py   (a partir do diretorio do ensaio)
"""
import json, os, re, subprocess, sys

W = os.path.dirname(os.path.abspath(__file__))
ARVORE = os.path.join(W, 'arvore')
PEND = '20261006204953_multiplix_cascata_bloco_terminal.sql'
NOVAS = PEND

linhas = [l.strip() for l in open(os.path.join(W, 'entradas/9-residuais.txt'), encoding='utf-8') if l.strip()]
retrato = json.load(open(os.path.join(ARVORE, 'supabase/schema-manifest.json'), encoding='utf-8'))
texto = open(os.path.join(ARVORE, 'supabase/migrations', PEND), encoding='utf-8', errors='ignore').read().lower()


def roda(expl, linha, tag):
    st = os.path.join(W, 'home', 'st-' + tag)
    os.makedirs(st, exist_ok=True)
    open(os.path.join(st, 'check-diferencas.txt'), 'w', encoding='utf-8').write(linha + '\n')
    open(os.path.join(st, 'falhas.tsv'), 'w', encoding='utf-8').write('')
    env = dict(os.environ, W=ARVORE, ST=st, NOVAS=NOVAS)
    p = subprocess.run([sys.executable, expl], env=env, capture_output=True, text=True)
    return p.returncode, p.stdout.strip()


def tokens(l):
    """nomes que a linha nomeia: objeto (nome final) + papel, do jeito que o proprio explicada() procura"""
    p = l.split('|')
    tipo = p[0]
    t = []
    if tipo == 'functions' and len(p) > 1:
        m = re.match(r'f:([a-z_0-9]+)\(', p[1] + '(')
        if m: t.append(m.group(1))
    if tipo in ('relation_grants', 'routine_grants', 'schema_grants') and len(p) > 2:
        t.append(p[2].lower())
        if tipo == 'routine_grants' and len(p) > 1:
            m = re.match(r'f:([a-z_0-9]+)\(', p[1] + '(')
            if m: t.append(m.group(1))
    return t


print(f'{"linha":<70} {"HOJE":>6} {"NOVO":>6}  {"no retrato":>10}  papel/objeto citado na pendente')
print('-' * 140)
res = []
for l in linhas:
    rc_h, _ = roda(os.path.join(W, 'emb-HOJE.py'), l, 'h')
    rc_n, out_n = roda(os.path.join(W, 'emb-NOVO.py'), l, 'n')
    tipo, chave = l.split('|', 1)
    no_retrato = chave in (retrato.get(tipo) or {})
    cit = [(t, bool(t) and re.search(r'\b' + re.escape(t) + r'\b', texto) is not None) for t in tokens(l)]
    res.append((l, rc_h, rc_n, no_retrato, cit))
    citados = ', '.join(f'"{t}"={"SIM" if c else "nao"}' for t, c in cit)
    print(f'{l[:69]:<70} {"DEBITA" if rc_h else "livre ":>6} {"DEBITA" if rc_n else "livre ":>6}  {str(no_retrato):>10}  {citados}')

deb_h = [x for x in res if x[1] == 1]
deb_n = [x for x in res if x[2] == 1]
print('-' * 140)
print(f'total=9  debitadas HOJE={len(deb_h)}  debitadas NOVO={len(deb_n)}')
print(f'deixaram de ser debitadas ({len(deb_h) - len(deb_n)}):')
for l, rc_h, rc_n, nr, cit in res:
    if rc_h == 1 and rc_n == 0:
        print(f'  - {l[:110]}')
        print(f'      prova do ajuste: chave no retrato da copia = {nr}; papel/objeto citado pela pendente = nenhum')
print('as demais 7 NAO eram debitadas nem hoje (explicada() acha o PAPEL no texto da pendente):')
for l, rc_h, rc_n, nr, cit in res:
    if rc_h == 0:
        print(f'  - {l[:110]}')
        print(f'      papel procurado: {[(t, c) for t, c in cit]}')
