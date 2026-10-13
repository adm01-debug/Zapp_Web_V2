#!/usr/bin/env bash
# Paridade V3 -> V2 — alerta de atraso de ENTREGA (public.sla_delivery_rules).
#
# Prova, em PostgreSQL 17 DESCARTÁVEL (docker) e com PAPEL REAL (authenticated / anon /
# service_role via SET ROLE + request.jwt.claim.sub), o contrato da migration
# supabase/migrations/20261011140925_sla_delivery_rules.sql:
#   * a tabela nasce com as colunas/CHECKs do cartão e RLS ligada com política explícita;
#   * leitura por qualquer autenticado; escrita (INSERT/UPDATE/DELETE) só admin/supervisor;
#     anônimo não lê nem escreve (sem privilégio e sem política);
#   * seed aditivo idempotente de uma regra global ativa 30/60;
#   * resolve_sla_delivery_rule(uuid) devolve contato ativo mais recente > global ativa mais
#     recente > padrão 30/60; portão de auth.uid(); anônimo não executa;
#   * a linha "--   " do rollback executa de verdade (tabela some) e a reaplicação é idempotente.
#
# Vermelho (vacuidade): SLA_DELIVERY_SEM_MIGRACAO=1 NÃO aplica a migration e exige que a
# tabela e a RPC não existam — é o estado ANTERIOR (a V2 não tem a tabela).

set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
migration="$repo_root/supabase/migrations/20261011140925_sla_delivery_rules.sql"
postgres_image="${SLA_DELIVERY_TEST_POSTGRES_IMAGE:-postgres:17-alpine}"
container_name="zapp-v2-sla-delivery-test-$$"

cleanup() {
  if [[ "$container_name" =~ ^zapp-v2-sla-delivery-test-[0-9]+$ ]]; then
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
as_user() {
  local jwt="$1" sql="$2"
  docker exec "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres \
    -c "SET ROLE authenticated; SELECT set_config('request.jwt.claim.sub', '$jwt', false); $sql"
}
as_anon() {
  docker exec "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres \
    -c "SET ROLE anon; $1"
}
expect_value() {
  local l="$1" e="$2" s="$3" a
  a="$(psql_sql "$s" | tail -n1)"
  [[ "$a" == "$e" ]] || fail "$l: esperado '$e', obtido '$a'"
  printf '[PASS] %s\n' "$l"
}
expect_value_as() {
  local l="$1" e="$2" j="$3" s="$4" a
  a="$(as_user "$j" "$s" | tail -n1)"
  [[ "$a" == "$e" ]] || fail "$l: esperado '$e', obtido '$a'"
  printf '[PASS] %s\n' "$l"
}
expect_ok_as() { local l="$1" j="$2" s="$3"; as_user "$j" "$s" >/dev/null || fail "$l: deveria ter sucesso (authenticated)"; printf '[PASS] %s\n' "$l"; }
expect_error_as() {
  local l="$1" needle="$2" j="$3" s="$4" out st
  set +e; out="$(as_user "$j" "$s" 2>&1)"; st=$?; set -e
  (( st == 0 )) && { printf '%s\n' "$out" >&2; fail "$l: deveria falhar, mas passou"; }
  [[ "$out" == *"$needle"* ]] || { printf '%s\n' "$out" >&2; fail "$l: esperava '$needle' no erro"; }
  printf '[PASS] %s\n' "$l"
}
expect_error_anon() {
  local l="$1" needle="$2" s="$3" out st
  set +e; out="$(as_anon "$s" 2>&1)"; st=$?; set -e
  (( st == 0 )) && { printf '%s\n' "$out" >&2; fail "$l: deveria falhar, mas passou"; }
  [[ "$out" == *"$needle"* ]] || { printf '%s\n' "$out" >&2; fail "$l: esperava '$needle' no erro"; }
  printf '[PASS] %s\n' "$l"
}

[[ "$container_name" =~ ^zapp-v2-sla-delivery-test-[0-9]+$ ]] || fail 'nome de container inseguro'
command -v docker >/dev/null 2>&1 || fail 'Docker nao esta instalado'
docker info >/dev/null 2>&1 || fail 'Docker daemon nao esta acessivel'
docker run --rm -d --name "$container_name" -e POSTGRES_PASSWORD=test_only "$postgres_image" >/dev/null
ready_checks=0
for _ in $(seq 1 90); do
  if psql_sql 'SELECT 1' >/dev/null 2>&1; then
    ready_checks=$((ready_checks + 1))
    if (( ready_checks >= 2 )); then break; fi
  else
    ready_checks=0
  fi
  sleep 1
done
(( ready_checks >= 2 )) || fail 'PostgreSQL descartavel nao ficou pronto de forma estavel'

ADMIN_JWT='20000000-0000-0000-0000-000000000005'
AGENT_JWT='20000000-0000-0000-0000-000000000002'
CONTACT_A='30000000-0000-0000-0000-000000000001'
CONTACT_B='30000000-0000-0000-0000-000000000002'

psql_sql "
  CREATE EXTENSION IF NOT EXISTS pgcrypto;
  CREATE SCHEMA auth;
  CREATE ROLE anon NOLOGIN;
  CREATE ROLE authenticated NOLOGIN;
  CREATE ROLE service_role NOLOGIN BYPASSRLS;
  CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
    AS \$\$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid \$\$;
  CREATE FUNCTION public.update_updated_at_column() RETURNS trigger LANGUAGE plpgsql
    SET search_path = public AS \$\$ BEGIN NEW.updated_at = now(); RETURN NEW; END \$\$;
  CREATE FUNCTION public.is_admin_or_supervisor(_user_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
    AS \$\$ SELECT _user_id = '$ADMIN_JWT'::uuid \$\$;
  CREATE TABLE public.contacts (id uuid PRIMARY KEY);
  INSERT INTO public.contacts (id) VALUES ('$CONTACT_A'), ('$CONTACT_B');
  GRANT USAGE ON SCHEMA public, auth TO authenticated, anon;
" >/dev/null

# --- vermelho / vacuidade -------------------------------------------------------
if [[ "${SLA_DELIVERY_SEM_MIGRACAO:-}" == '1' ]]; then
  [[ "$(psql_sql "SELECT to_regclass('public.sla_delivery_rules') IS NULL AND to_regprocedure('public.resolve_sla_delivery_rule(uuid)') IS NULL")" == 't' ]] \
    || fail 'vacuidade: sem a migration a tabela/RPC ja existiam'
  printf 'RED (vacuidade): sem a migration nao existem a tabela nem a RPC\n'
  exit 0
fi

psql_file "$migration" >/dev/null

# --- 1. estrutura: colunas, CHECKs, RLS, políticas ------------------------------
expect_value 'tabela existe' 't' "SELECT to_regclass('public.sla_delivery_rules') IS NOT NULL"
expect_value 'RLS ligada' 't' "SELECT relrowsecurity AND relforcerowsecurity IS NOT NULL FROM pg_class WHERE oid='public.sla_delivery_rules'::regclass"
expect_value 'colunas do cartao' 'id|uuid|NO;contact_id|uuid|YES;warning_minutes|integer|NO;breach_minutes|integer|NO;is_active|boolean|NO;created_by|uuid|YES;created_at|timestamp with time zone|NO;updated_at|timestamp with time zone|NO' \
  "SELECT string_agg(column_name||'|'||data_type||'|'||is_nullable, ';' ORDER BY ordinal_position) FROM information_schema.columns WHERE table_schema='public' AND table_name='sla_delivery_rules'"
expect_value '4 politicas explicitas' '4' "SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename='sla_delivery_rules'"
expect_value 'FK de contact_id para contacts (cascade)' 'c|f|a|public|contacts|id' \
  "SELECT con.confdeltype::text||'|'||con.contype::text||'|'||con.confupdtype::text||'|'||rn.nspname||'|'||rc.relname||'|'||ra.attname FROM pg_constraint con JOIN pg_class c ON c.oid=con.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_class rc ON rc.oid=con.confrelid JOIN pg_namespace rn ON rn.oid=rc.relnamespace JOIN pg_attribute ra ON ra.attrelid=rc.oid AND ra.attnum=ANY(con.confkey) WHERE n.nspname='public' AND c.relname='sla_delivery_rules' AND con.contype='f'"

# --- 2. seed aditivo idempotente ------------------------------------------------
expect_value 'seed global 30/60 unico' '1|30|60|true' \
  "SELECT count(*)||'|'||min(warning_minutes)||'|'||min(breach_minutes)||'|'||bool_and(is_active) FROM public.sla_delivery_rules WHERE contact_id IS NULL"

# --- 3. leitura e escrita por papel real ----------------------------------------
expect_value_as 'authenticated (agente) le a config' '1' "$AGENT_JWT" "SELECT count(*) FROM public.sla_delivery_rules"
expect_value_as 'admin le a config' '1' "$ADMIN_JWT" "SELECT count(*) FROM public.sla_delivery_rules"
expect_error_anon 'anon nao le a config' 'permission denied' "SELECT count(*) FROM public.sla_delivery_rules"

expect_error_as 'agente nao cria regra' 'row-level security' "$AGENT_JWT" \
  "INSERT INTO public.sla_delivery_rules (contact_id, warning_minutes, breach_minutes) VALUES (NULL, 45, 90)"
expect_ok_as 'admin cria regra global 45/90' "$ADMIN_JWT" \
  "INSERT INTO public.sla_delivery_rules (contact_id, warning_minutes, breach_minutes, created_by) VALUES (NULL, 45, 90, '$ADMIN_JWT')"
expect_value_as 'agente nao altera regra (0 linhas)' '0' "$AGENT_JWT" \
  "WITH u AS (UPDATE public.sla_delivery_rules SET warning_minutes = 5 WHERE contact_id IS NULL RETURNING 1) SELECT count(*) FROM u"
expect_value 'valor da regra global intacto' '45|90' \
  "SELECT warning_minutes||'|'||breach_minutes FROM public.sla_delivery_rules WHERE contact_id IS NULL"
expect_value_as 'agente nao apaga regra (0 linhas)' '0' "$AGENT_JWT" \
  "WITH d AS (DELETE FROM public.sla_delivery_rules WHERE contact_id IS NULL RETURNING 1) SELECT count(*) FROM d"
expect_error_anon 'anon nao cria regra' 'permission denied' \
  "INSERT INTO public.sla_delivery_rules (contact_id, warning_minutes, breach_minutes) VALUES (NULL, 45, 90)"

# --- 4. checks de faixa ---------------------------------------------------------
expect_error_as 'warning_minutes=0 recusado' 'check constraint' "$ADMIN_JWT" \
  "INSERT INTO public.sla_delivery_rules (warning_minutes, breach_minutes) VALUES (0, 60)"
expect_error_as 'breach < warning recusado' 'check constraint' "$ADMIN_JWT" \
  "INSERT INTO public.sla_delivery_rules (warning_minutes, breach_minutes) VALUES (60, 30)"
expect_error_as 'acima de 10080 recusado' 'check constraint' "$ADMIN_JWT" \
  "INSERT INTO public.sla_delivery_rules (warning_minutes, breach_minutes) VALUES (30, 10081)"

# --- 5. RPC de resolucao --------------------------------------------------------
# Sem regra do contato: cai na global ativa mais recente (a 45/90 que admin acabou de criar).
expect_value_as 'RPC prefere global ativa mais recente' '45|90|global' "$AGENT_JWT" \
  "SELECT warning_minutes||'|'||breach_minutes||'|'||source FROM public.resolve_sla_delivery_rule('$CONTACT_A')"
expect_value_as 'RPC sem contato tambem usa a global' '45|90|global' "$AGENT_JWT" \
  "SELECT warning_minutes||'|'||breach_minutes||'|'||source FROM public.resolve_sla_delivery_rule(NULL)"

# Regra do contato ativa (mais antiga) vence a global.
expect_ok_as 'admin cria regra do contato 10/20' "$ADMIN_JWT" \
  "INSERT INTO public.sla_delivery_rules (contact_id, warning_minutes, breach_minutes) VALUES ('$CONTACT_A', 10, 20)"
expect_value_as 'RPC prefere a regra do contato' "$CONTACT_A|10|20|contact" "$AGENT_JWT" \
  "SELECT contact_id||'|'||warning_minutes||'|'||breach_minutes||'|'||source FROM public.resolve_sla_delivery_rule('$CONTACT_A')"
expect_value_as 'contato sem regra continua na global' '45|90|global' "$AGENT_JWT" \
  "SELECT warning_minutes||'|'||breach_minutes||'|'||source FROM public.resolve_sla_delivery_rule('$CONTACT_B')"

# Entre duas ativas do mesmo contato vale a mais recente.
psql_sql "INSERT INTO public.sla_delivery_rules (contact_id, warning_minutes, breach_minutes, created_at) VALUES ('$CONTACT_A', 12, 24, now() + interval '1 minute')" >/dev/null
expect_value_as 'RPC prefere a regra do contato mais recente' "$CONTACT_A|12|24|contact" "$AGENT_JWT" \
  "SELECT contact_id||'|'||warning_minutes||'|'||breach_minutes||'|'||source FROM public.resolve_sla_delivery_rule('$CONTACT_A')"

# Regra desativada e ignorada; sobra a segunda do contato.
psql_sql "UPDATE public.sla_delivery_rules SET is_active = false WHERE contact_id='$CONTACT_A' AND warning_minutes=12" >/dev/null
expect_value_as 'RPC ignora regra inativa do contato' "$CONTACT_A|10|20|contact" "$AGENT_JWT" \
  "SELECT contact_id||'|'||warning_minutes||'|'||breach_minutes||'|'||source FROM public.resolve_sla_delivery_rule('$CONTACT_A')"

# Sem nenhuma global ativa: padrao 30/60.
psql_sql "UPDATE public.sla_delivery_rules SET is_active = false WHERE contact_id IS NULL" >/dev/null
expect_value_as 'RPC cai no padrao 30/60' '30|60|default' "$AGENT_JWT" \
  "SELECT warning_minutes||'|'||breach_minutes||'|'||source FROM public.resolve_sla_delivery_rule('$CONTACT_B')"

# Portao de auth.uid() e EXECUTE de anon.
expect_error_as 'RPC exige auth.uid()' 'not_authenticated' '00000000-0000-0000-0000-000000000000' \
  "SELECT set_config('request.jwt.claim.sub', '', false); SELECT * FROM public.resolve_sla_delivery_rule(NULL)"
expect_error_anon 'anon nao executa a RPC' 'permission denied' \
  "SELECT * FROM public.resolve_sla_delivery_rule('$CONTACT_A')"
expect_value 'authenticated tem EXECUTE; anon nao' 'true|false' \
  "SELECT has_function_privilege('authenticated','public.resolve_sla_delivery_rule(uuid)','EXECUTE')||'|'||has_function_privilege('anon','public.resolve_sla_delivery_rule(uuid)','EXECUTE')"
expect_value 'PUBLIC nao tem EXECUTE' '0' \
  "SELECT count(*) FROM information_schema.routine_privileges WHERE routine_schema='public' AND routine_name='resolve_sla_delivery_rule' AND grantee='PUBLIC'"
expect_value 'SECURITY DEFINER com search_path pg_catalog, public' 't' \
  "SELECT p.prosecdef AND 'search_path=pg_catalog, public'=ANY(p.proconfig) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='resolve_sla_delivery_rule'"

# ACL de tabela: anon sem nada; authenticated com SELECT/DML.
expect_value 'anon sem privilegio na tabela' 'f' \
  "SELECT has_table_privilege('anon','public.sla_delivery_rules','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')"
expect_value 'authenticated com SELECT/DML' 't' \
  "SELECT has_table_privilege('authenticated','public.sla_delivery_rules','SELECT') AND has_table_privilege('authenticated','public.sla_delivery_rules','INSERT') AND has_table_privilege('authenticated','public.sla_delivery_rules','UPDATE') AND has_table_privilege('authenticated','public.sla_delivery_rules','DELETE')"

# Gatilho de updated_at avanca sozinho.
expect_value_as 'updated_at e mantido pelo gatilho' 't' "$ADMIN_JWT" \
  "WITH up AS (UPDATE public.sla_delivery_rules SET updated_at='2000-01-01T00:00:00Z', warning_minutes=warning_minutes WHERE contact_id='$CONTACT_A' RETURNING updated_at) SELECT bool_and(updated_at > '2000-01-01T00:01:00Z') FROM up"

# --- 6. rollback executavel + reaplicacao idempotente ---------------------------
mapfile -t rollback < <(grep -E '^--   ' "$migration" | sed -E 's/^--   //')
(( ${#rollback[@]} >= 3 )) || fail 'rollback do cabecalho nao tem os 3 statements esperados'
for stmt in "${rollback[@]}"; do
  [[ -n "$stmt" ]] || fail "statement de rollback vazio"
  psql_sql "$stmt" >/dev/null || fail "rollback falhou em: $stmt"
done
expect_value 'rollback removeu a tabela' 't' "SELECT to_regclass('public.sla_delivery_rules') IS NULL"
expect_value 'rollback removeu a RPC' 't' "SELECT to_regprocedure('public.resolve_sla_delivery_rule(uuid)') IS NULL"
printf '[PASS] rollback executavel (tabela e RPC removidas)\n'

psql_file "$migration" >/dev/null
expect_value 'reaplicacao idempotente: 1 global' '1' "SELECT count(*) FROM public.sla_delivery_rules WHERE contact_id IS NULL"
expect_value 'reaplicacao idempotente: ainda 30/60' '30|60' "SELECT warning_minutes||'|'||breach_minutes FROM public.sla_delivery_rules WHERE contact_id IS NULL"

# --- 7. extras: nome, mensagem propria e escopo por instancia/canal -------------
# Contrato da migration supabase/migrations/20261013030417_sla_delivery_rules_extras.sql:
# 3 colunas novas (CHECK aceita NULL = a linha do seed passa sem backfill), RPC trocada por
# (uuid, text) devolvendo nome/mensagem/escopo e respeitando o escopo pedido, precedencia
# contato > global > 30/60 preservada, rollback executavel e reaplicacao idempotente.
migration_extras="$repo_root/supabase/migrations/20261013030417_sla_delivery_rules_extras.sql"

# Vermelho: no estado anterior (so a migration do SD1) as colunas e a RPC com escopo nao existem.
expect_value 'extras: ausentes antes da migration' '0|true' \
  "SELECT (SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='sla_delivery_rules' AND column_name IN ('name','custom_message','applies_to'))::text||'|'||(to_regprocedure('public.resolve_sla_delivery_rule(uuid,text)') IS NULL)::text"

psql_file "$migration_extras" >/dev/null

expect_value 'extras: 3 colunas text opcionais' 'applies_to|text|YES;custom_message|text|YES;name|text|YES' \
  "SELECT string_agg(column_name||'|'||data_type||'|'||is_nullable, ';' ORDER BY column_name) FROM information_schema.columns WHERE table_schema='public' AND table_name='sla_delivery_rules' AND column_name IN ('name','custom_message','applies_to')"
expect_value 'extras: 3 CHECKs por nome' '3' \
  "SELECT count(*) FROM pg_constraint WHERE conrelid='public.sla_delivery_rules'::regclass AND contype='c' AND conname IN ('sla_delivery_rules_name_check','sla_delivery_rules_custom_message_check','sla_delivery_rules_applies_to_check')"
expect_value 'extras: RLS continua ligada com as 4 politicas' 'true|4' \
  "SELECT c.relrowsecurity||'|'||(SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename='sla_delivery_rules') FROM pg_class c WHERE c.oid='public.sla_delivery_rules'::regclass"
expect_value 'extras: a regra que ja existia passou sem backfill (3 campos nulos)' '1|true' \
  "SELECT count(*)::text||'|'||bool_and(name IS NULL AND custom_message IS NULL AND applies_to IS NULL) FROM public.sla_delivery_rules WHERE contact_id IS NULL AND warning_minutes=30 AND breach_minutes=60"

expect_value 'extras: assinatura (uuid, text) existe e a antiga sumiu' 'true|true' \
  "SELECT (to_regprocedure('public.resolve_sla_delivery_rule(uuid,text)') IS NOT NULL)::text||'|'||(to_regprocedure('public.resolve_sla_delivery_rule(uuid)') IS NULL)::text"
expect_value 'extras: retorno ganhou name/custom_message/applies_to' 'true' \
  "SELECT (pg_get_function_result('public.resolve_sla_delivery_rule(uuid,text)'::regprocedure) LIKE '%name text%' AND pg_get_function_result('public.resolve_sla_delivery_rule(uuid,text)'::regprocedure) LIKE '%custom_message text%' AND pg_get_function_result('public.resolve_sla_delivery_rule(uuid,text)'::regprocedure) LIKE '%applies_to text%')::text"
expect_value 'extras: authenticated executa a RPC nova; anon nao' 'true|false' \
  "SELECT has_function_privilege('authenticated','public.resolve_sla_delivery_rule(uuid,text)','EXECUTE')||'|'||has_function_privilege('anon','public.resolve_sla_delivery_rule(uuid,text)','EXECUTE')"
expect_value 'extras: anon segue sem privilegio na tabela' 'f' \
  "SELECT has_table_privilege('anon','public.sla_delivery_rules','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')"

# Fixture: uma regra global COM escopo (inst-1) e uma regra do contato COM escopo (inst-1).
psql_sql "INSERT INTO public.sla_delivery_rules (contact_id, warning_minutes, breach_minutes, name, custom_message, applies_to) VALUES (NULL, 5, 10, 'Regra instancia 1', 'Atencao: seu pedido de entrega esta atrasado.', 'inst-1')" >/dev/null
psql_sql "INSERT INTO public.sla_delivery_rules (contact_id, warning_minutes, breach_minutes, name, applies_to) VALUES ('$CONTACT_A', 7, 9, 'Regra contato A', 'inst-1')" >/dev/null

expect_value_as 'escopo: a regra da instancia vence a regra sem escopo' 'Regra instancia 1|Atencao: seu pedido de entrega esta atrasado.|inst-1|5|10|global' "$AGENT_JWT" \
  "SELECT name||'|'||custom_message||'|'||applies_to||'|'||warning_minutes||'|'||breach_minutes||'|'||source FROM public.resolve_sla_delivery_rule(NULL, 'inst-1')"
expect_value_as 'escopo: outra instancia nao herda a regra de inst-1' '30|60|global' "$AGENT_JWT" \
  "SELECT warning_minutes||'|'||breach_minutes||'|'||source FROM public.resolve_sla_delivery_rule(NULL, 'inst-2')"
expect_value_as 'escopo: sem canal informado a regra de instancia nao vaza' '30|60|global' "$AGENT_JWT" \
  "SELECT warning_minutes||'|'||breach_minutes||'|'||source FROM public.resolve_sla_delivery_rule(NULL)"
expect_value_as 'escopo: precedencia mantida (contato vence global)' "Regra contato A|$CONTACT_A|7|9|inst-1|contact" "$AGENT_JWT" \
  "SELECT name||'|'||contact_id||'|'||warning_minutes||'|'||breach_minutes||'|'||applies_to||'|'||source FROM public.resolve_sla_delivery_rule('$CONTACT_A', 'inst-1')"
expect_value_as 'escopo: regra do contato de outra instancia nao entra' '30|60|global' "$AGENT_JWT" \
  "SELECT warning_minutes||'|'||breach_minutes||'|'||source FROM public.resolve_sla_delivery_rule('$CONTACT_A', 'inst-2')"
expect_value_as 'escopo: contato sem regra usa a global da instancia' '5|10|global' "$AGENT_JWT" \
  "SELECT warning_minutes||'|'||breach_minutes||'|'||source FROM public.resolve_sla_delivery_rule('$CONTACT_B', 'inst-1')"
expect_value_as 'extras: a RPC devolve sempre 1 linha' '1' "$AGENT_JWT" \
  "SELECT count(*) FROM public.resolve_sla_delivery_rule('$CONTACT_A','inst-1')"

# Sem regra ativa: padrao 30/60 sem nome/mensagem/escopo.
psql_sql "UPDATE public.sla_delivery_rules SET is_active=false" >/dev/null
expect_value_as 'extras: padrao 30/60 vem sem nome, mensagem e escopo' 'true|30|60|default' "$AGENT_JWT" \
  "SELECT (name IS NULL AND custom_message IS NULL AND applies_to IS NULL)::text||'|'||warning_minutes||'|'||breach_minutes||'|'||source FROM public.resolve_sla_delivery_rule(NULL)"

# --- 8. validacao das colunas novas --------------------------------------------
expect_error_as 'extras: nome em branco recusado' 'check constraint' "$ADMIN_JWT" \
  "INSERT INTO public.sla_delivery_rules (warning_minutes, breach_minutes, name) VALUES (30, 60, '   ')"
expect_error_as 'extras: mensagem acima de 1000 recusada' 'check constraint' "$ADMIN_JWT" \
  "INSERT INTO public.sla_delivery_rules (warning_minutes, breach_minutes, custom_message) VALUES (30, 60, repeat('a', 1001))"
expect_error_as 'extras: mensagem com tag HTML recusada' 'check constraint' "$ADMIN_JWT" \
  "INSERT INTO public.sla_delivery_rules (warning_minutes, breach_minutes, custom_message) VALUES (30, 60, '<b>Seu pedido atrasou</b>')"
expect_error_as 'extras: escopo com espaco/caractere invalido recusado' 'check constraint' "$ADMIN_JWT" \
  "INSERT INTO public.sla_delivery_rules (warning_minutes, breach_minutes, applies_to) VALUES (30, 60, 'inst 1!')"
expect_ok_as 'extras: texto simples com < isolado e aceito' "$ADMIN_JWT" \
  "INSERT INTO public.sla_delivery_rules (warning_minutes, breach_minutes, custom_message) VALUES (30, 60, 'Prazo de entrega < 2h')"

# --- 9. rollback executavel dos extras + reaplicacao idempotente ----------------
mapfile -t rollback_extras < <(grep -E '^--   ' "$migration_extras" | sed -E 's/^--   //')
(( ${#rollback_extras[@]} >= 7 )) || fail "rollback dos extras nao tem os 7 statements esperados (tem ${#rollback_extras[@]})"
for stmt in "${rollback_extras[@]}"; do
  [[ -n "$stmt" ]] || fail 'statement de rollback dos extras vazio'
  psql_sql "$stmt" >/dev/null || fail "rollback dos extras falhou em: $stmt"
done
expect_value 'rollback dos extras removeu as 3 colunas' '0' \
  "SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='sla_delivery_rules' AND column_name IN ('name','custom_message','applies_to')"
expect_value 'rollback dos extras restaurou resolve_sla_delivery_rule(uuid)' 'true|true' \
  "SELECT (to_regprocedure('public.resolve_sla_delivery_rule(uuid)') IS NOT NULL)::text||'|'||(to_regprocedure('public.resolve_sla_delivery_rule(uuid,text)') IS NULL)::text"
expect_value 'rollback dos extras restaurou os grants da RPC antiga' 'true|false' \
  "SELECT has_function_privilege('authenticated','public.resolve_sla_delivery_rule(uuid)','EXECUTE')||'|'||has_function_privilege('anon','public.resolve_sla_delivery_rule(uuid)','EXECUTE')"
expect_value 'rollback dos extras conservou a tabela e as politicas' 'true|4' \
  "SELECT (to_regclass('public.sla_delivery_rules') IS NOT NULL)::text||'|'||(SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename='sla_delivery_rules')"
expect_value_as 'rollback dos extras: a RPC antiga volta respondendo pelo global' '1|global' "$AGENT_JWT" \
  "SELECT count(*)::text||'|'||min(source) FROM public.resolve_sla_delivery_rule('$CONTACT_B')"

psql_file "$migration_extras" >/dev/null
psql_file "$migration_extras" >/dev/null
expect_value 'extras: reaplicacao idempotente (3 colunas, RPC nova, 4 politicas)' '3|true|4' \
  "SELECT (SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='sla_delivery_rules' AND column_name IN ('name','custom_message','applies_to'))::text||'|'||(to_regprocedure('public.resolve_sla_delivery_rule(uuid,text)') IS NOT NULL)::text||'|'||(SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename='sla_delivery_rules')::text"

printf 'SLA delivery rules PostgreSQL 17 behavioral contract: PASS\n'
