#!/usr/bin/env bash
# R2-DB-003 (cartao t_c1431127, item 28 do BACKLOG_VERIFICADO, P1 seguranca):
# multiplix_resolve_recipients devolvia metadados de empresas e contatos
# classificados FORA do escopo — bastava mandar action=resolve com o UUID de
# outra carteira usando o proprio escopo legitimo.
#
# Este teste EXECUTA a funcao SQL de verdade num PostgreSQL 17 descartavel
# (mesmo padrao de dashboard-rls-authorization.test.sh). Nao le o .sql como
# texto nem procura padroes: sobe o banco, cria o schema minimo que a RPC
# referencia, EXTRAI o corpo da funcao verbatim do arquivo versionado e roda
# assercoes com psql sobre os CAMPOS devolvidos, linha a linha:
#
#   * empresa elegivel (no_escopo AND ativa)   -> sai com company_name,
#     contact_id, empresa_papeis, last_interaction_at, destino_e164 e
#     destino_origem preenchidos (o composer precisa deles).
#   * empresa FORA do escopo (escopo nao-admin) -> sai SO com company_id
#     (eco do id que o proprio chamador enviou) e elegibilidade=
#     'fora_do_escopo'; contact_id, company_name, empresa_papeis,
#     last_interaction_at, destino_e164 e destino_origem sao NULL.
#     E o defeito R2-DB-003: a versao anterior devolvia todos preenchidos.
#   * empresa inativa (status <> 'ativo' ou deleted_at) -> mesma redacao,
#     elegibilidade 'destino_invalido'.
#
# Fonte da funcao EXECUTADA (extraida verbatim, nunca transcrita):
#   supabase/migrations/_foreign/singu/20261005103000_singu_resolve_redige_fora_escopo.sql
# — a versao NOVA, que redige. O espelho multiplix_resolve_recipients.sql e
# conferido contra ela abaixo (divergencia reprova o teste).
#
# SENSIBILIDADE A REGRESSAO (vermelho antes -> verde depois): aponte o
# override para a versao ANTERIOR, que nao redige:
#   MULTIPLIX_RESOLVE_ESCOPO_TEST_FUNCAO_ARQUIVO=\
#     supabase/migrations/_foreign/singu/20261001160000_singu_guard_hmac_escopo.sql \
#     bash scripts/db-audit/multiplix-resolve-escopo.test.sh
# e as assercoes de NULL ficam VERMELHAS (a versao velha preenche os campos).
#
# STUB DELIBERADO: multiplix_validate_scope_signature e recriada como casca
# sem efeito. O guard HMAC do escopo (F22) e provado em outro lugar —
# transacao real no Singu documentada em
# 20261001160000_singu_guard_hmac_escopo.sql e no bloco ao vivo de
# multiplix-scope.test.sh. Sem a casca, este teste dependeria de
# vault.decrypted_secrets e extensions.hmac, que sao infraestrutura do Singu,
# nao o contrato testado aqui (a projecao/redacao das linhas).
#
# Overrides (so para ensaio local de mutacao; CI usa os defaults):
#   MULTIPLIX_RESOLVE_ESCOPO_TEST_FUNCAO_ARQUIVO  caminho do .sql de onde
#                                               extrair a funcao
#   MULTIPLIX_RESOLVE_ESCOPO_TEST_POSTGRES_IMAGE  imagem do postgres descartavel

set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
singu_dir="$repo_root/supabase/migrations/_foreign/singu"
funcao_origem='20261005103000_singu_resolve_redige_fora_escopo.sql'
funcao_arquivo="${MULTIPLIX_RESOLVE_ESCOPO_TEST_FUNCAO_ARQUIVO:-$singu_dir/$funcao_origem}"
postgres_image="${MULTIPLIX_RESOLVE_ESCOPO_TEST_POSTGRES_IMAGE:-postgres:17-alpine}"
container_name="zapp-v2-multiplix-resolve-test-$$"

cleanup() {
  if [[ "$container_name" =~ ^zapp-v2-multiplix-resolve-test-[0-9]+$ ]]; then
    docker rm -f "$container_name" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT INT TERM

fail() { printf '[FAIL] %s\n' "$1" >&2; exit 1; }
pass() { printf '[PASS] %s\n' "$1"; }

psql_sql() {
  docker exec "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres -c "$1"
}
psql_file() {
  docker exec -i "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres < "$1"
}
expect_value() {
  local label="$1" expected="$2" sql="$3" actual
  actual="$(psql_sql "$sql" | tail -n1)"
  [[ "$actual" == "$expected" ]] || fail "$label: esperado '$expected', obtido '$actual'"
  pass "$label"
}

command -v docker >/dev/null 2>&1 || fail 'Docker nao esta instalado'
docker info >/dev/null 2>&1 || fail 'Docker daemon nao esta acessivel'
[[ -f "$funcao_arquivo" ]] || fail "arquivo da funcao nao encontrado: $funcao_arquivo"

# Extracao verbatim: do CREATE OR REPLACE da resolve ate a linha que fecha o
# corpo ($function$ com ou sem ';' — o espelho, gerado por pg_get_functiondef,
# nao tem o ponto-e-virgula). O arquivo pode conter OUTRAS funcoes antes (a
# migration antiga define 4); so a resolve e capturada.
extract_resolve() { # $1 = arquivo .sql, $2 = saida
  awk '/CREATE OR REPLACE FUNCTION public\.multiplix_resolve_recipients/{on=1}
       on{print}
       on && /^\$function\$;?$/{exit}' "$1" > "$2"
  [[ -s "$2" ]] || fail "extracao vazia em $1"
  grep -q 'CREATE OR REPLACE FUNCTION public.multiplix_resolve_recipients' "$2" \
    || fail "extracao de $1 nao pegou o CREATE da resolve"
  grep -qE '^\$function\$;?$' "$2" || fail "extracao de $1 nao fechou o corpo da funcao"
}

tmp_dir="$(mktemp -d)"
trap 'rm -rf "$tmp_dir"; cleanup' EXIT INT TERM

if [[ -z "${MULTIPLIX_RESOLVE_ESCOPO_TEST_FUNCAO_ARQUIVO:-}" ]]; then
  # ── Guardas do repositorio (so fazem sentido sobre a fonte real) ──────────
  # (a) Vigencia: nenhum arquivo DATADO posterior a origem pode redefinir a
  #     funcao — senao o teste extrairia uma versao morta. Os espelhos sem
  #     data (multiplix_*.sql) ficam fora da ordenacao: a paridade deles e
  #     provada em (b), nao pela posicao no diretorio.
  later=''
  while IFS= read -r rel; do
    if grep -qiE '(CREATE( OR REPLACE)? FUNCTION public\.multiplix_resolve_recipients|ALTER FUNCTION[^;]*public\.multiplix_resolve_recipients|DROP FUNCTION[^;]*public\.multiplix_resolve_recipients)' \
       "$singu_dir/$rel"; then
      later+="$rel "
    fi
  done < <(cd "$singu_dir" && ls -1 [0-9]*.sql | sort | awk -v o="$funcao_origem" '$0==o{seen=1; next} seen{print}')
  [[ -z "$later" ]] \
    || fail "guarda de vigencia: multiplix_resolve_recipients redefinida depois de $funcao_origem em: $later"
  pass "vigencia: nenhum arquivo datado posterior a $funcao_origem redefine a funcao"

  # (b) Paridade: o espelho multiplix_resolve_recipients.sql precisa carregar
  #     a MESMA definicao da migration versionada — se divergir, o espelho
  #     (fonte de revisao) vira mentira silenciosa. Normaliza so o ';' final,
  #     que pg_get_functiondef nao emite.
  extract_resolve "$singu_dir/multiplix_resolve_recipients.sql" "$tmp_dir/espelho.sql"
  extract_resolve "$funcao_arquivo" "$tmp_dir/funcao.sql"
  sed -i 's/^\$function\$;$/\$function$/' "$tmp_dir/funcao.sql"
  if ! diff -q "$tmp_dir/funcao.sql" "$tmp_dir/espelho.sql" >/dev/null; then
    diff "$tmp_dir/funcao.sql" "$tmp_dir/espelho.sql" >&2 || true
    fail 'espelho multiplix_resolve_recipients.sql diverge da migration versionada'
  fi
  pass 'paridade: espelho carrega a mesma definicao da migration versionada'
else
  printf '[INFO] override de arquivo (%s): guardas de vigencia/paridade puladas\n' \
    "$(basename "$funcao_arquivo")"
  extract_resolve "$funcao_arquivo" "$tmp_dir/funcao.sql"
fi

# O statement precisa terminar em ';' para o psql executar (a extracao pode
# ter parado num '$function$' sem ponto-e-virgula).
grep -qE '^\$function\$;$' "$tmp_dir/funcao.sql" || printf ';\n' >> "$tmp_dir/funcao.sql"

docker run --rm -d --name "$container_name" -e POSTGRES_PASSWORD=test_only "$postgres_image" >/dev/null

ready_checks=0
for _ in $(seq 1 90); do
  if psql_sql 'SELECT 1' >/dev/null 2>&1; then
    ready_checks=$((ready_checks + 1)); (( ready_checks >= 2 )) && break
  else ready_checks=0; fi
  sleep 1
done
(( ready_checks >= 2 )) || fail 'PostgreSQL descartavel nao ficou pronto de forma estavel'

# ── Schema minimo: so as tabelas/colunas que a funcao referencia ────────────
# As TABELAS sao stubs com as colunas minimas — nao sao o contrato testado.
# O contrato (a projecao/redacao de multiplix_resolve_recipients) e EXTRAIDO
# do arquivo versionado logo abaixo.
cat > "$tmp_dir/pre.sql" <<'SQL'
CREATE TABLE public.companies (
  id uuid PRIMARY KEY,
  name text,
  nome_crm text,
  is_supplier boolean NOT NULL DEFAULT false,
  is_carrier boolean NOT NULL DEFAULT false,
  is_customer boolean NOT NULL DEFAULT false,
  deleted_at timestamptz,
  status text NOT NULL DEFAULT 'ativo'
);
CREATE TABLE public.contacts (
  id uuid PRIMARY KEY,
  company_id uuid REFERENCES public.companies(id),
  whatsapp text,
  last_interaction_at timestamptz,
  deleted_at timestamptz,
  is_duplicate boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.contact_phones (
  contact_id uuid NOT NULL REFERENCES public.contacts(id),
  numero_e164 text,
  is_whatsapp boolean NOT NULL DEFAULT false,
  is_primary boolean NOT NULL DEFAULT false
);
CREATE TABLE public.company_phones (
  company_id uuid NOT NULL REFERENCES public.companies(id),
  numero_e164 text,
  is_whatsapp boolean NOT NULL DEFAULT false,
  is_primary boolean NOT NULL DEFAULT false
);
CREATE TABLE public.customers (
  company_id uuid NOT NULL REFERENCES public.companies(id),
  vendedor_id integer NOT NULL
);
CREATE TABLE public.interactions (
  contact_id uuid NOT NULL REFERENCES public.contacts(id),
  data_interacao timestamptz NOT NULL
);
CREATE TABLE public.users (
  id integer PRIMARY KEY,
  email text NOT NULL,
  is_vendedor boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true
);
-- Casca sem efeito: o guard HMAC do F22 e provado em outro lugar (ver o
-- cabecalho deste teste); aqui ele nao e o contrato sob teste.
CREATE FUNCTION public.multiplix_validate_scope_signature(p_scope_permissions text[], p_scope_vendedor_email text)
RETURNS void LANGUAGE plpgsql AS $$ BEGIN RETURN; END $$;
SQL

psql_file "$tmp_dir/pre.sql" || fail 'falha ao criar o schema minimo'

# A funcao testada e a EXTRAIDA do arquivo versionado — nao uma transcricao.
psql_file "$tmp_dir/funcao.sql" || fail "falha ao aplicar a funcao extraida de $(basename "$funcao_arquivo")"
pass "funcao extraida de $(basename "$funcao_arquivo") aplicada no banco descartavel"

# ── Fixtures deterministicas ────────────────────────────────────────────────
# A  elegivel pelo escopo customers_all (cliente ativa, com contato+telefone)
# B  fora do escopo (fornecedora ativa; o escopo pedido nao cobre suppliers)
# C  inativa por status (cliente, status='inativo')
# E  inativa por deleted_at (cliente, soft-deleted)
# D  cliente da carteira do vendedor 7 (segundo cenario: customers_own)
cat > "$tmp_dir/fixtures.sql" <<'SQL'
INSERT INTO public.companies (id, name, nome_crm, is_supplier, is_carrier, is_customer, status, deleted_at) VALUES
  ('11111111-1111-4111-8111-111111111111', 'Empresa Apta',        'APTA_CRM',  false, false, true,  'ativo',   NULL),
  ('33333333-3333-4333-8333-333333333333', 'Outra Carteira Ltda', 'FORA_CRM',  true,  false, false, 'ativo',   NULL),
  ('55555555-5555-4555-8555-555555555555', 'Inativa SA',          'INAT_CRM',  false, false, true,  'inativo', NULL),
  ('66666666-6666-4666-8666-666666666666', 'Apagada ME',          'APAG_CRM',  false, false, true,  'ativo',   '2026-03-01 00:00:00+00'),
  ('77777777-7777-4777-8777-777777777777', 'Da Carteira',         'CART_CRM',  false, false, true,  'ativo',   NULL);
INSERT INTO public.contacts (id, company_id, whatsapp, last_interaction_at, created_at) VALUES
  ('22222222-2222-4222-8222-222222222221', '11111111-1111-4111-8111-111111111111', '5511900000001', '2026-04-01 10:00:00+00', '2026-01-01 00:00:00+00'),
  ('22222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333333', '5511900000003', '2026-04-02 10:00:00+00', '2026-01-02 00:00:00+00'),
  ('22222222-2222-4222-8222-222222222223', '55555555-5555-4555-8555-555555555555', '5511900000005', '2026-04-03 10:00:00+00', '2026-01-03 00:00:00+00'),
  ('22222222-2222-4222-8222-222222222224', '66666666-6666-4666-8666-666666666666', '5511900000006', '2026-04-04 10:00:00+00', '2026-01-04 00:00:00+00'),
  ('22222222-2222-4222-8222-222222222225', '77777777-7777-4777-8777-777777777777', '5511900000007', '2026-04-05 10:00:00+00', '2026-01-05 00:00:00+00');
INSERT INTO public.contact_phones (contact_id, numero_e164, is_whatsapp, is_primary) VALUES
  ('22222222-2222-4222-8222-222222222221', '5511900000001', true, true);
-- Fornecedora fora do escopo ATE com telefone de empresa e interacao: os
-- metadados existem no banco — e a projecao que nao pode devolver nada.
INSERT INTO public.company_phones (company_id, numero_e164, is_whatsapp, is_primary) VALUES
  ('33333333-3333-4333-8333-333333333333', '5511900000004', true, true);
INSERT INTO public.interactions (contact_id, data_interacao) VALUES
  ('22222222-2222-4222-8222-222222222222', '2026-04-02 12:00:00+00');
INSERT INTO public.users (id, email, is_vendedor, is_active) VALUES
  (7, 'vendedor@zapp.test', true, true);
INSERT INTO public.customers (company_id, vendedor_id) VALUES
  ('77777777-7777-4777-8777-777777777777', 7);
SQL

psql_file "$tmp_dir/fixtures.sql" || fail 'falha ao carregar fixtures'

A='11111111-1111-4111-8111-111111111111'
B='33333333-3333-4333-8333-333333333333'
C='55555555-5555-4555-8555-555555555555'
E='66666666-6666-4666-8666-666666666666'
D='77777777-7777-4777-8777-777777777777'

# A chamada real: escopo nao-admin customers_all, ids das 4 empresas do 1o
# cenario. O guard HMAC (stub) aceita — assinatura nao e o alvo aqui.
RESOLVE_ALL="public.multiplix_resolve_recipients(ARRAY['$A','$B','$C','$E']::uuid[], ARRAY[]::uuid[], ARRAY['customers_all']::text[], NULL::text)"

echo '── cenario 1: escopo customers_all ──'
expect_value 'resolve devolve 4 linhas (uma por empresa do pedido)' '4' \
  "SELECT count(*) FROM $RESOLVE_ALL"

# Empresa elegivel: sai INTEIRA — o composer precisa dos campos.
expect_value 'elegivel: elegibilidade=apto' 'apto' \
  "SELECT elegibilidade FROM $RESOLVE_ALL WHERE company_id = '$A'"
expect_value 'elegivel: company_name preenchido' 'Empresa Apta' \
  "SELECT company_name FROM $RESOLVE_ALL WHERE company_id = '$A'"
expect_value 'elegivel: contact_id preenchido' '22222222-2222-4222-8222-222222222221' \
  "SELECT contact_id::text FROM $RESOLVE_ALL WHERE company_id = '$A'"
expect_value 'elegivel: destino_e164 preenchido' '5511900000001' \
  "SELECT destino_e164 FROM $RESOLVE_ALL WHERE company_id = '$A'"
expect_value 'elegivel: destino_origem=contato_pessoa' 'contato_pessoa' \
  "SELECT destino_origem FROM $RESOLVE_ALL WHERE company_id = '$A'"
expect_value 'elegivel: empresa_papeis={customer}' '{customer}' \
  "SELECT empresa_papeis::text FROM $RESOLVE_ALL WHERE company_id = '$A'"
expect_value 'elegivel: last_interaction_at preenchido' '2026-04-01 10:00:00' \
  "SELECT to_char(last_interaction_at AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS') FROM $RESOLVE_ALL WHERE company_id = '$A'"

# Empresa FORA do escopo: so company_id (eco) + elegibilidade. Os 6 metadados
# precisam ser NULL — a versao anterior (20261001160000) os devolvia
# preenchidos e e exatamente ai que este teste fica vermelho.
expect_value 'fora do escopo: elegibilidade=fora_do_escopo' 'fora_do_escopo' \
  "SELECT elegibilidade FROM $RESOLVE_ALL WHERE company_id = '$B'"
expect_value 'fora do escopo: company_id sai (eco do chamador)' "$B" \
  "SELECT company_id::text FROM $RESOLVE_ALL WHERE company_id = '$B'"
for col in contact_id company_name destino_e164 destino_origem empresa_papeis last_interaction_at; do
  expect_value "fora do escopo: $col = NULL (redigido)" 't' \
    "SELECT $col IS NULL FROM $RESOLVE_ALL WHERE company_id = '$B'"
done

# Empresa inativa (status): dentro do segmento, mas redigida igual.
expect_value 'inativa(status): elegibilidade=destino_invalido' 'destino_invalido' \
  "SELECT elegibilidade FROM $RESOLVE_ALL WHERE company_id = '$C'"
for col in contact_id company_name destino_e164 destino_origem empresa_papeis last_interaction_at; do
  expect_value "inativa(status): $col = NULL (redigido)" 't' \
    "SELECT $col IS NULL FROM $RESOLVE_ALL WHERE company_id = '$C'"
done

# Empresa inativa (deleted_at): mesma redacao.
expect_value 'inativa(deleted_at): elegibilidade=destino_invalido' 'destino_invalido' \
  "SELECT elegibilidade FROM $RESOLVE_ALL WHERE company_id = '$E'"
for col in contact_id company_name destino_e164 destino_origem empresa_papeis last_interaction_at; do
  expect_value "inativa(deleted_at): $col = NULL (redigido)" 't' \
    "SELECT $col IS NULL FROM $RESOLVE_ALL WHERE company_id = '$E'"
done

echo '── cenario 2: escopo customers_own (carteira do vendedor) ──'
RESOLVE_OWN="public.multiplix_resolve_recipients(ARRAY['$D','$B']::uuid[], ARRAY[]::uuid[], ARRAY['customers_own']::text[], 'vendedor@zapp.test')"

expect_value 'carteira: elegibilidade=apto (via customers + users)' 'apto' \
  "SELECT elegibilidade FROM $RESOLVE_OWN WHERE company_id = '$D'"
expect_value 'carteira: company_name preenchido' 'Da Carteira' \
  "SELECT company_name FROM $RESOLVE_OWN WHERE company_id = '$D'"
expect_value 'carteira: empresa_papeis={customer}' '{customer}' \
  "SELECT empresa_papeis::text FROM $RESOLVE_OWN WHERE company_id = '$D'"
expect_value 'carteira: contact_id preenchido' '22222222-2222-4222-8222-222222222225' \
  "SELECT contact_id::text FROM $RESOLVE_OWN WHERE company_id = '$D'"
expect_value 'carteira: fora do escopo segue redigida (company_name NULL)' 't' \
  "SELECT company_name IS NULL FROM $RESOLVE_OWN WHERE company_id = '$B'"
expect_value 'carteira: fora do escopo segue fora_do_escopo' 'fora_do_escopo' \
  "SELECT elegibilidade FROM $RESOLVE_OWN WHERE company_id = '$B'"

# Aceite do R2-DB-003 (item 3): escopo VAZIO — nenhuma permissao de audiencia.
# Ninguem entra no escopo, entao TODA empresa do pedido tem de sair redigida
# (senao o pior caso do defeito e justamente o usuario sem permissao alguma).
echo '── cenario 3: escopo vazio (nenhuma permissao) ──'
RESOLVE_VAZIO="public.multiplix_resolve_recipients(ARRAY['$A','$B']::uuid[], ARRAY[]::uuid[], ARRAY[]::text[], NULL::text)"

expect_value 'escopo vazio: resolve devolve 2 linhas (uma por empresa)' '2' \
  "SELECT count(*) FROM $RESOLVE_VAZIO"
expect_value 'escopo vazio: elegibilidade=fora_do_escopo' 'fora_do_escopo' \
  "SELECT elegibilidade FROM $RESOLVE_VAZIO WHERE company_id = '$A'"
for col in contact_id company_name destino_e164 destino_origem empresa_papeis last_interaction_at; do
  expect_value "escopo vazio: $col = NULL (redigido)" 't' \
    "SELECT $col IS NULL FROM $RESOLVE_VAZIO WHERE company_id = '$A'"
done

# Aceite do R2-DB-003 (item 3): 'suppliers' contra empresa customer-only —
# quem so enxerga fornecedor NAO ve metadado de cliente; e a fornecedora
# (o outro lado) continua saindo inteira, para a redacao nao virar censura.
echo '── cenario 4: escopo suppliers contra empresa customer-only ──'
RESOLVE_SUP="public.multiplix_resolve_recipients(ARRAY['$A','$B']::uuid[], ARRAY[]::uuid[], ARRAY['suppliers']::text[], NULL::text)"

expect_value 'suppliers x cliente: a cliente fica fora_do_escopo' 'fora_do_escopo' \
  "SELECT elegibilidade FROM $RESOLVE_SUP WHERE company_id = '$A'"
for col in contact_id company_name destino_e164 destino_origem empresa_papeis last_interaction_at; do
  expect_value "suppliers x cliente: $col = NULL (redigido)" 't' \
    "SELECT $col IS NULL FROM $RESOLVE_SUP WHERE company_id = '$A'"
done
expect_value 'suppliers x fornecedora: elegibilidade=apto' 'apto' \
  "SELECT elegibilidade FROM $RESOLVE_SUP WHERE company_id = '$B'"
expect_value 'suppliers x fornecedora: company_name sai inteiro' 'Outra Carteira Ltda' \
  "SELECT company_name FROM $RESOLVE_SUP WHERE company_id = '$B'"

printf '\n[OK] multiplix_resolve_recipients redige metadados fora do escopo (R2-DB-003)\n'
