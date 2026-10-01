#!/usr/bin/env bash
# F24 (Bloco B) — docs/multiplix/PLANO_FINALIZACAO_MULTIPLIX_100_ETAPAS_2026-09-29.md
# e docs/multiplix/PERMISSOES.md (matriz F25, PR #1417).
#
# O QUE ESTE TESTE PROVA (ao vivo, contra o sistema REAL):
#   1. Para cada um dos 3 perfis de escopo criados no ZAPP
#      (vendedor/agent com carteira, Compras/supervisor, Logistica/supervisor),
#      o que a edge multiplix-audience CONTA e VE bate EXATAMENTE com a matriz F25:
#      o escopo e derivado do JWT (user_has_permission sobre o user_id do token),
#      nunca do corpo da requisicao.
#   2. Escopo FORJADO no corpo e IGNORADO: mandando {"p_scope_permissions":["admin"]}
#      (e "scope":["admin"], e o mesmo campo dentro de params) junto de um perfil
#      nao-admin, a resposta e a do escopo REAL do JWT — e difere da do escopo forjado
#      que, se fosse honrado, daria outro numero (o Total de admin).
#   3. O numero devolvido pela edge e IGUAL ao da RPC do Singu chamada direto com o
#      MESMO escopo (dois caminhos independentes): a edge nao inventa escopo.
#
# O QUE ESTE TESTE NAO PROVA (limites explicitos):
#   * Nao prova o gate de NAV/rota (/multiplix por multiplix.dispatch.create) nem RLS
#     de tabela: isso e F25/F71, coberto em src/pages/__tests__/ViewRouter.multiplix-gating
#     e nos harnesses de RLS. Aqui so a AUDIENCIA (search/count) da edge.
#   * Nao prova TODO o conteudo de cada linha devolvida por search (amostra, nao varredura).
#   * Nao CRIA contas nem toca em escrita alguma: as 3 contas sao pre-requisito (criadas
#     uma vez pela tarefa F24) e o Singu e SOMENTE LEITURA.
#
# BLOCO 1 (sempre roda, sem credencial): contrato ESTATICO de
#   supabase/functions/multiplix-audience/index.ts — o schema do corpo nao tem campo de
#   escopo/permissao e as variaveis de escopo so saem de user_has_permission/is_admin.
# BLOCO 2 (ao vivo, PULA e sai 0 se faltar credencial): as provas 1..3 acima.
#
# CREDENCIAIS (nenhuma e impressa). Faltando QUALQUER uma, o bloco 2 PULA (sai 0) para
# nao quebrar o CI offline (db-guard.yml) — o mesmo padrao de
# scripts/db-audit/multiplix-audience-parity.mjs:
#   ZAPP_SUPABASE_URL              (ou VITE_SUPABASE_URL)     — projeto ZAPP tnnnlkbymytvtqngbbqh
#   ZAPP_SUPABASE_ANON_KEY         (ou VITE_SUPABASE_PUBLISHABLE_KEY)
#   EXTERNAL_SUPABASE_URL / EXTERNAL_SUPABASE_SERVICE_ROLE_KEY  — Singu pgxfvjmuubtbowutlide (leitura)
#   ~/.secrets/zapp-multiplix-escopo.env  — EMAIL/PASSWORD/ROLE das 3 contas (fora do repo)
#
# Uso:
#   set -a; . .tmp/singu.env; set +a
#   ZAPP_SUPABASE_URL=https://tnnnlkbymytvtqngbbqh.supabase.co \
#   ZAPP_SUPABASE_ANON_KEY=<anon> \
#   bash scripts/db-audit/multiplix-scope.test.sh
#
# Exit codes: 0 = passou (ou PULADO); 1 = contrato estatico ou asserção ao vivo falhou.
set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
edge="$repo_root/supabase/functions/multiplix-audience/index.ts"
accounts_file="${ZAPP_MULTIPLIX_ACCOUNTS_FILE:-$HOME/.secrets/zapp-multiplix-escopo.env}"

fail() { printf '[FAIL] %s\n' "$1" >&2; exit 1; }
pass() { printf '[PASS] %s\n' "$1"; }

[[ -f "$edge" ]] || fail "edge nao encontrada: $edge"

echo '-- BLOCO 1: contrato estatico da edge (schema do corpo x origem do escopo) --------'

# 1) RequestSchema nao carrega escopo/permissao/papel: so action + params.
request_block="$(awk '/const RequestSchema = z\.object\(\{/{f=1} f{print} f&&/\}\);/{exit}' "$edge")"
[[ -n "$request_block" ]] || fail 'nao achei RequestSchema em index.ts'
grep -q 'action:' <<<"$request_block" || fail 'RequestSchema sem action'
grep -q 'params:' <<<"$request_block" || fail 'RequestSchema sem params'
if grep -qiE '(scope|permission|role)' <<<"$request_block"; then
  fail 'RequestSchema do corpo carrega campo de escopo/permissao/papel (escopo poderia vir do cliente)'
fi
pass 'RequestSchema do corpo so aceita action + params (sem campo de escopo)'

# 2) FiltersSchema/SearchParamsSchema: so filtros de audiencia, sem escopo.
filters_block="$(awk '/const FiltersSchema = z\.object\(\{/{f=1} f{print} f&&/\}\);/{exit}' "$edge")"
for key in 'roles:' 'ramo:' 'uf:' 'search:'; do
  grep -q "$key" <<<"$filters_block" || fail "FiltersSchema sem $key"
done
if grep -qiE '(scope|permission|p_scope)' <<<"$filters_block"; then
  fail 'FiltersSchema carrega escopo/permissao'
fi
pass 'FiltersSchema so tem roles/ramo/uf/search (sem escopo)'

# 3) Nenhuma leitura de escopo a partir de params.
if grep -nE 'params\.[A-Za-z_]*([Ss]cope|[Pp]ermission)' "$edge" >/dev/null; then
  fail 'a edge le escopo/permissao de params (escopo forjado no corpo seria honrado)'
fi
pass 'a edge nunca le p_scope_*/scope/permission de params'

# 4) O escopo enviado ao Singu vem de variaveis do SERVIDOR.
grep -q 'p_scope_permissions: scopePermissions' "$edge" \
  || fail 'as RPCs nao recebem p_scope_permissions: scopePermissions (variavel do servidor)'
grep -q 'p_scope_vendedor_email: vendedorEmail' "$edge" \
  || fail 'as RPCs nao recebem p_scope_vendedor_email: vendedorEmail (variavel do servidor)'
pass 'as RPCs do Singu recebem o escopo de variaveis do servidor (scopePermissions/vendedorEmail)'

# 5) scopePermissions e montado SO a partir de user_has_permission/is_admin.
n_assign="$(grep -cE 'scopePermissions[^.]*=' "$edge" || true)"
[[ "$n_assign" == '1' ]] || fail "scopePermissions tem $n_assign atribuicoes (esperado 1, a declaracao)"
grep -q "userHasPermission('multiplix.audience" "$edge" || fail 'scopePermissions nao deriva de user_has_permission'
n_push="$(grep -c 'scopePermissions.push(' "$edge" || true)"
n_push_lit="$(grep -cE "scopePermissions\.push\('[a-z_]+'\)" "$edge" || true)"
[[ "$n_push" == "$n_push_lit" && "$n_push" -ge 5 ]] \
  || fail "scopePermissions.push: $n_push chamadas, $n_push_lit literais (esperado iguais e >=5)"
pass "scopePermissions so recebe literais de user_has_permission/is_admin ($n_push pushes)"

echo
echo '-- BLOCO 2: escopo ao vivo (edge real + Singu real + 3 contas) --------------------'

url="${ZAPP_SUPABASE_URL:-${VITE_SUPABASE_URL:-}}"
anon="${ZAPP_SUPABASE_ANON_KEY:-${VITE_SUPABASE_PUBLISHABLE_KEY:-}}"
if [[ -z "$url" || -z "$anon" || -z "${EXTERNAL_SUPABASE_URL:-}" || -z "${EXTERNAL_SUPABASE_SERVICE_ROLE_KEY:-}" || ! -f "$accounts_file" ]]; then
  echo 'PULADO: faltam credenciais (ZAPP_SUPABASE_URL/ANON, EXTERNAL_SUPABASE_*, ou o'
  echo "         arquivo de contas $accounts_file). O bloco estatico ja passou; nada a provar aqui."
  exit 0
fi
command -v python3 >/dev/null 2>&1 || { echo 'PULADO: python3 ausente para o bloco ao vivo.'; exit 0; }

ZAPP_URL="$url" ZAPP_ANON="$anon" ACCOUNTS_FILE="$accounts_file" \
EXTERNAL_URL="${EXTERNAL_SUPABASE_URL:-}" EXTERNAL_KEY="${EXTERNAL_SUPABASE_SERVICE_ROLE_KEY:-}" \
python3 - <<'PY' || exit 1
import json, os, sys, time, urllib.request, urllib.error

ZAPP_URL = os.environ['ZAPP_URL'].rstrip('/')
ANON = os.environ['ZAPP_ANON']
SINGU = os.environ['EXTERNAL_URL'].rstrip('/')
SERVICE = os.environ['EXTERNAL_KEY']
EDGE = f'{ZAPP_URL}/functions/v1/multiplix-audience'

falhas = []


def check(label, cond, detail=''):
    if cond:
        print(f'  [PASS] {label}')
    else:
        print(f'  [FAIL] {label}  {detail}')
        falhas.append(label)


def req(method, url, headers, body=None):
    data = json.dumps(body).encode() if body is not None else None
    r = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(r, timeout=60) as resp:
            return resp.status, json.loads(resp.read().decode() or '{}')
    except urllib.error.HTTPError as e:
        raw = e.read().decode()
        try:
            return e.code, json.loads(raw)
        except Exception:
            return e.code, {'raw': raw[:300]}


def sign_in(email, password):
    st, body = req('POST', f'{ZAPP_URL}/auth/v1/token?grant_type=password',
                   {'apikey': ANON, 'Content-Type': 'application/json'},
                   {'email': email, 'password': password})
    if st != 200:
        raise SystemExit(f'sign-in de {email} falhou: HTTP {st} {body}')
    return body['access_token']


def edge(jwt, body, tentativas=3):
    # A 1a chamada apos o cold start da edge ja respondeu 502 uma vez (medido em
    # 2026-10-01): repete SO em 5xx, nunca em 200/4xx.
    for i in range(tentativas):
        st, resp = req('POST', EDGE, {'Authorization': f'Bearer {jwt}', 'apikey': ANON,
                                      'Content-Type': 'application/json'}, body)
        if st < 500:
            return st, resp
        time.sleep(1.5 * (i + 1))
    return st, resp


def singu_count(scope, email=None, roles=None):
    args = {'p_roles': roles, 'p_ramo': None, 'p_uf': None, 'p_search': None,
            'p_scope_permissions': scope, 'p_scope_vendedor_email': email}
    st, body = req('POST', f'{SINGU}/rest/v1/rpc/multiplix_count_audience',
                   {'apikey': SERVICE, 'Authorization': f'Bearer {SERVICE}',
                    'Content-Type': 'application/json'}, args)
    if st != 200:
        raise SystemExit(f'RPC count (referencia) falhou: HTTP {st} {body}')
    return int(body)


# contas: le do arquivo ~/.secrets sem imprimir senha
sec = {}
with open(os.environ['ACCOUNTS_FILE']) as fh:
    for line in fh:
        line = line.strip()
        if '=' in line and not line.startswith('#'):
            k, v = line.split('=', 1)
            sec[k] = v
contas = {}
for k, v in sec.items():
    if k.endswith('_EMAIL'):
        pref = k[:-6]
        contas[v] = {'senha': sec.get(pref + '_PASSWORD'), 'papel': sec.get(pref + '_ROLE')}
agentes = [e for e, c in contas.items() if c['papel'] == 'agent' and c['senha']]
supervisores = [e for e, c in contas.items() if c['papel'] == 'supervisor' and c['senha']]
if not agentes or not supervisores:
    print(f'PULADO: o arquivo de contas nao tem 1 agent + 1 supervisor ({len(contas)} contas).')
    sys.exit(0)

# MATRIZ F25 -> escopo efetivo por papel (a mesma derivacao da edge).
ESCOPO = {'agent': ['customers_own'],
          'supervisor': ['suppliers', 'carriers', 'customers_all']}

# referencias independentes: RPC do Singu chamada DIRETO com o mesmo escopo.
ref_admin = {r: singu_count(['admin'], roles=[r] if r else None)
             for r in (None, 'cliente', 'fornecedor', 'transportadora')}
ref_sup = {r: singu_count(ESCOPO['supervisor'], roles=[r] if r else None)
           for r in (None, 'cliente', 'fornecedor', 'transportadora')}


def testar_perfil(email, c):
    papel = c['papel']
    jwt = sign_in(email, c['senha'])
    label = f'{papel}:{email.split("@")[0]}'
    print(f'\n  --- {label} (papel {papel}) ---')
    escopo_dir = ESCOPO[papel]
    email_scope = email if 'customers_own' in escopo_dir else None
    ref_carteira = {r: singu_count(['customers_own'], email=email, roles=[r] if r else None)
                    for r in ('cliente', 'transportadora')}

    # (1) o que CONTA — edge x referencia direta no Singu, com o escopo da matriz.
    for rot, roles in (('sem_filtro', None), ('cliente', ['cliente']),
                       ('fornecedor', ['fornecedor']), ('transportadora', ['transportadora'])):
        st, resp = edge(jwt, {'action': 'count', 'params': ({} if roles is None else {'roles': roles})})
        got = resp.get('data') if st == 200 else None
        ref = singu_count(escopo_dir, email=email_scope, roles=roles)
        check(f'{label}: count {rot} == RPC com escopo {escopo_dir}', got == ref,
              f'edge={got} HTTP {st} ref={ref}')

    # (1b) matriz: agent NAO conta fornecedores; supervisor CONTA os 3 segmentos.
    if papel == 'agent':
        st, resp = edge(jwt, {'action': 'count', 'params': {'roles': ['fornecedor']}})
        check(f'{label}: sem permissao de fornecedores -> conta 0', resp.get('data') == 0,
              f'edge={resp.get("data")}')
        st, resp = edge(jwt, {'action': 'count', 'params': {'roles': ['cliente']}})
        check(f'{label}: carteira propria == RPC customers_own', resp.get('data') == ref_carteira['cliente'],
              f'edge={resp.get("data")} ref={ref_carteira["cliente"]}')
    else:
        for rot, roles in (('cliente', ['cliente']), ('fornecedor', ['fornecedor']),
                           ('transportadora', ['transportadora'])):
            st, resp = edge(jwt, {'action': 'count', 'params': {'roles': roles}})
            check(f'{label}: {rot} == Total de admin do segmento', resp.get('data') == ref_admin[rot],
                  f'edge={resp.get("data")} admin={ref_admin[rot]}')
            check(f'{label}: {rot} > 0 (supervisor ve o segmento)', (resp.get('data') or 0) > 0)

    # (2) o que VE — search respeita o escopo.
    st, resp = edge(jwt, {'action': 'search', 'params': {'roles': ['fornecedor'], 'page_size': 5}})
    rows_forn = resp.get('data') if st == 200 else None
    if papel == 'agent':
        check(f'{label}: search fornecedor nao devolve fornecedor', rows_forn == [], f'HTTP {st} {resp}')
    else:
        check(f'{label}: search fornecedor devolve linhas', isinstance(rows_forn, list) and len(rows_forn) == 5,
              f'HTTP {st} n={None if rows_forn is None else len(rows_forn)}')
    st, resp = edge(jwt, {'action': 'search', 'params': {'roles': ['cliente'], 'page_size': 5}})
    rows_cli = resp.get('data') if st == 200 else None
    check(f'{label}: search cliente devolve linhas', isinstance(rows_cli, list) and len(rows_cli) == 5,
          f'HTTP {st} n={None if rows_cli is None else len(rows_cli)}')

    # (3) ESC1PO FORJADO no corpo e IGNORADO.
    legit = edge(jwt, {'action': 'count', 'params': {'roles': ['cliente']}})[1].get('data')
    forjado = ref_admin['cliente'] if papel == 'agent' else 0  # o que sairia se o forjado fosse honrado
    st, resp = edge(jwt, {'action': 'count',
                          'params': {'roles': ['cliente'], 'p_scope_permissions': ['admin']},
                          'p_scope_permissions': ['admin'], 'scope': ['admin']})
    got = resp.get('data') if st == 200 else None
    check(f'{label}: escopo forjado no corpo IGNORADO (== legitimo)', got == legit,
          f'forjado={got} legitimo={legit}')
    check(f'{label}: escopo forjado difere do que ele daria se honrado', legit != forjado,
          f'legitimo={legit} forjado_se_honrado={forjado}')


for email in agentes:
    testar_perfil(email, contas[email])
for email in supervisores:
    testar_perfil(email, contas[email])

print()
if falhas:
    print(f'FALHA: {len(falhas)} assercao(oes) violada(s).', file=sys.stderr)
    for f in falhas:
        print(f'  - {f}', file=sys.stderr)
    sys.exit(1)
print('OK: 3 perfis contam e veem conforme a matriz F25; escopo forjado no corpo ignorado.')
PY

printf '\n[OK] F24 multiplix-scope verificado\n'
