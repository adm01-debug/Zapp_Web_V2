#!/usr/bin/env bash
# Item 44 (IA-TIMEOUT-001) — a OUTBOX DURÁVEL do log essencial de IA não existia.
#
# Contexto medido: `supabase/functions/_shared/ai-usage.ts` (já na ponta, commit
# c8c6018f9) grava em `public.ai_usage_outbox` a linha do log essencial que não pôde
# ser entregue e só dá baixa (`processed_at`) depois de entregar. NENHUMA migration
# criava a tabela: o POST batia num alvo inexistente e o `catch` do código engolia a
# falha — o log essencial continuava best effort (o defeito do item 44).
#
#   BLOCO A — estado ANTERIOR (defeito): o alvo da outbox não existe e a escrita do
#             service_role falha; a perda é silenciosa.
#   BLOCO B — migration aplicada: a tabela nasce com o contrato de colunas que o
#             código da ponta usa, RLS ligada, escrita/leitura SÓ do service_role
#             (anon e authenticated revogados, inclusive contra os privilégios
#             PADRÃO do Supabase), a consulta da fila devolve só pendentes, entrada
#             inválida é recusada e a linha `-- Rollback:` desfaz tudo.
set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
mapfile -t migrations < <(ls "$repo_root"/supabase/migrations/*_ia_usage_outbox_duravel.sql 2>/dev/null || true)
if (( ${#migrations[@]} != 1 )); then
  printf '[FAIL] esperava exatamente 1 migration *_ia_usage_outbox_duravel.sql, achei %d\n' "${#migrations[@]}" >&2
  exit 1
fi
migration="${migrations[0]}"
postgres_image="${IA_USAGE_OUTBOX_TEST_POSTGRES_IMAGE:-postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a3278a52a7ec49117deedb300e552b24}"
container_name="zapp-v2-ia-usage-outbox-test-$$"

cleanup() {
  if [[ "$container_name" =~ ^zapp-v2-ia-usage-outbox-test-[0-9]+$ ]]; then
    docker rm -f "$container_name" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT INT TERM

fail() { printf '[FAIL] %s\n' "$1" >&2; exit 1; }

psql_sql() {
  docker exec "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres -c "$1"
}
psql_file() {
  docker exec -i "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres < "$1"
}
as_role() {
  local role="$1" sql="$2"
  docker exec "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres \
    -c "SET ROLE $role; $sql"
}
expect_value() {
  local l="$1" e="$2" s="$3" a
  a="$(psql_sql "$s" | tail -n1)"
  [[ "$a" == "$e" ]] || fail "$l: esperado '$e', obtido '$a'"
  printf '[PASS] %s\n' "$l"
}
expect_value_as() {
  local l="$1" e="$2" role="$3" s="$4" a
  a="$(as_role "$role" "$s" | tail -n1)"
  [[ "$a" == "$e" ]] || fail "$l: esperado '$e', obtido '$a'"
  printf '[PASS] %s\n' "$l"
}
expect_ok_as() { local l="$1" role="$2" s="$3"; as_role "$role" "$s" >/dev/null || fail "$l: deveria ter sucesso como $role"; printf '[PASS] %s\n' "$l"; }
expect_error_as() {
  local l="$1" needle="$2" role="$3" s="$4" out st
  set +e; out="$(as_role "$role" "$s" 2>&1)"; st=$?; set -e
  (( st == 0 )) && { printf '%s\n' "$out" >&2; fail "$l: deveria falhar como $role, mas passou"; }
  [[ "$out" == *"$needle"* ]] || { printf '%s\n' "$out" >&2; fail "$l: esperava '$needle' no erro"; }
  printf '[PASS] %s\n' "$l"
}

command -v docker >/dev/null 2>&1 || fail 'Docker nao esta instalado'
docker info >/dev/null 2>&1 || fail 'Docker daemon nao esta acessivel'
[[ -f "$migration" ]] || fail "migration nao encontrada: $migration"

printf '== migration: %s ==\n' "${migration#"$repo_root"/}"
printf '== container: %s (imagem %s) ==\n' "$container_name" "$postgres_image"
docker run --rm -d --name "$container_name" -e POSTGRES_PASSWORD=test_only "$postgres_image" >/dev/null

ready=0
for _ in $(seq 1 90); do
  if psql_sql 'SELECT 1' >/dev/null 2>&1; then ready=$((ready + 1)); (( ready >= 2 )) && break; else ready=0; fi
  sleep 1
done
(( ready >= 2 )) || fail 'PostgreSQL descartavel nao ficou pronto de forma estavel'

tmp_dir="$(mktemp -d)"
trap 'rm -rf "$tmp_dir"; cleanup' EXIT INT TERM

pre_out="$(psql_sql 'SELECT 1')"
[[ "$pre_out" == "1" ]] || fail 'PostgreSQL descartavel nao respondeu ao SELECT 1'

# Ambiente fiel ao Supabase no que interessa a esta migration: os papeis da API
# existem e o schema public concede USAGE; os privilégios PADRÃO do Supabase dão
# ALL em toda tabela nova para anon, authenticated e service_role (é contra isso
# que os REVOKEs da migration têm de valer).
cat > "$tmp_dir/pre.sql" <<'SQL'
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
SQL
psql_file "$tmp_dir/pre.sql" >/dev/null

printf '\n============ BLOCO A — estado ANTERIOR (defeito) ============\n'

expect_value 'A.1 (DEFEITO) nenhuma migration criou o alvo da outbox: a tabela nao existe' '0' \
  "SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname='public' AND c.relname='ai_usage_outbox';"
expect_error_as 'A.2 (DEFEITO) a escrita do service_role falha e o codigo engole: consumo pago vira so log da funcao' \
  'does not exist' service_role \
  "INSERT INTO public.ai_usage_outbox (payload, motivo) VALUES (jsonb_build_object('linha', jsonb_build_object('function_name','ai-proxy')), 'insert_falhou');"

printf '\n============ BLOCO B — migration aplicada ============\n'
psql_file "$migration" >/dev/null

expect_value 'B.1 a tabela da outbox existe depois da migration' '1' \
  "SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname='public' AND c.relname='ai_usage_outbox';"
expect_value 'B.2 RLS ligada na tabela nova' 't' \
  "SELECT relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname='public' AND c.relname='ai_usage_outbox';"

expect_ok_as 'B.3 service_role enfileira uma pendencia (payload + motivo)' service_role \
  "INSERT INTO public.ai_usage_outbox (payload, motivo) VALUES (jsonb_build_object('linha', jsonb_build_object('function_name','ai-proxy')), 'insert_falhou');"
expect_value 'B.4 defaults do codigo: tentativas=0 e processed_at NULL (pendente)' '0|t' \
  "SELECT tentativas, processed_at IS NULL FROM public.ai_usage_outbox ORDER BY created_at DESC LIMIT 1;"
expect_value_as 'B.5 a consulta da fila (processed_at=is.null, tentativas,created_at) devolve a pendencia' '1' service_role \
  "SELECT count(*) FROM public.ai_usage_outbox WHERE processed_at IS NULL;"

expect_ok_as 'B.6 service_role da baixa gravando processed_at' service_role \
  "UPDATE public.ai_usage_outbox SET processed_at = now() WHERE processed_at IS NULL;"
expect_value 'B.7 ...e o pendente sai da fila' '0' \
  "SELECT count(*) FROM public.ai_usage_outbox WHERE processed_at IS NULL;"

expect_value 'B.8 ACL: service_role tem SELECT' 't' "SELECT has_table_privilege('service_role','public.ai_usage_outbox','SELECT');"
expect_value 'B.9 ACL: service_role tem INSERT/UPDATE/DELETE' 't' \
  "SELECT has_table_privilege('service_role','public.ai_usage_outbox','INSERT') AND has_table_privilege('service_role','public.ai_usage_outbox','UPDATE') AND has_table_privilege('service_role','public.ai_usage_outbox','DELETE');"
expect_value 'B.10 ACL: anon NAO tem SELECT (contra o privilegio PADRAO do Supabase)' 'f' \
  "SELECT has_table_privilege('anon','public.ai_usage_outbox','SELECT');"
expect_value 'B.11 ACL: authenticated NAO tem SELECT' 'f' \
  "SELECT has_table_privilege('authenticated','public.ai_usage_outbox','SELECT');"
expect_value 'B.12 ACL: authenticated NAO tem INSERT' 'f' \
  "SELECT has_table_privilege('authenticated','public.ai_usage_outbox','INSERT');"

expect_error_as 'B.13 anon lendo a fila: permission denied' 'permission denied' anon \
  "SELECT count(*) FROM public.ai_usage_outbox;"
expect_error_as 'B.14 authenticated escrevendo na fila: permission denied' 'permission denied' authenticated \
  "INSERT INTO public.ai_usage_outbox (payload, motivo) VALUES (jsonb_build_object('x',1), 'y');"

expect_error_as 'B.15 (entrada invalida) payload NULL e recusado' 'not-null' service_role \
  "INSERT INTO public.ai_usage_outbox (payload, motivo) VALUES (NULL, 'y');"
expect_error_as 'B.16 (entrada invalida) motivo NULL e recusado' 'not-null' service_role \
  "INSERT INTO public.ai_usage_outbox (payload, motivo) VALUES (jsonb_build_object('x',1), NULL);"

# A policy é quem abre a LINHA para o service_role: mesmo sem BYPASSRLS ele enxerga;
# sem a policy, o GRANT sozinho não devolve linha nenhuma.
psql_sql 'ALTER ROLE service_role NOBYPASSRLS;' >/dev/null
expect_ok_as 'B.17 sem BYPASSRLS o service_role continua lendo (a policy cobre o papel)' service_role \
  "SELECT count(*) FROM public.ai_usage_outbox;"
psql_sql 'DROP POLICY ai_usage_outbox_service_role ON public.ai_usage_outbox;' >/dev/null
expect_value_as 'B.18 sem a policy o GRANT nao basta: service_role volta a ver ZERO linhas' '0' service_role \
  "SELECT count(*) FROM public.ai_usage_outbox;"

printf '\n============ Rollback ============\n'
rollback_line="$(grep -m1 '^-- Rollback:' "$migration")"
[[ -n "$rollback_line" ]] || fail 'a migration nao traz a linha -- Rollback:'
rollback_sql="${rollback_line#-- Rollback: }"
psql_sql "$rollback_sql" >/dev/null
expect_value 'R.1 o Rollback da migration devolve o banco ao estado anterior (tabela inexistente)' '0' \
  "SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname='public' AND c.relname='ai_usage_outbox';"
expect_value 'R.2 ...e nenhuma policy orfa sobrou' '0' \
  "SELECT count(*) FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid WHERE c.relname='ai_usage_outbox';"

printf '\nPASS: item 44 — a outbox durável do log essencial de IA existe, só o service_role a acessa (nem pelos privilégios padrão do Supabase), a fila devolve só pendentes e o Rollback desfaz tudo.\n'
