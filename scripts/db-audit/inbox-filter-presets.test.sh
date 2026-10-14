#!/usr/bin/env bash

# Presets de filtro da inbox em public.saved_filters (entity_type='inbox'):
# forma do JSON, nao-compartilhamento e teto por usuario.
#
# O que prova, em PostgreSQL 17 descartavel, aplicando as migrations REAIS:
#   A  as base (20260315163251, 20260315172343, 20260402110743) e a nova
#      (20261014021029) aplicam sem erro;
#   B  isolamento por usuario (RLS real, com GRANT presente como no
#      PostgREST): dono ve/grava o proprio preset; outro authenticated nao ve,
#      nao altera e nao apaga; `anon` nao ve nem insere; spoof de user_id e
#      barrado pelo WITH CHECK;
#   C  forma do JSON: chave desconhecida (etiquetas), array, valor nao-string e
#      data fora do ISO sao recusados; preset valido passa; 'contacts' fica fora;
#   D  preset de inbox nunca e compartilhado (is_shared=true recusado), entao a
#      policy "Users can view shared filters" nao vaza preset de inbox;
#   E  teto de 50 por usuario: 50 passa, 51 falha, o teto e por usuario, nao
#      conta 'contacts' e INSERT multi-linha (bloco) tambem falha;
#   F  depois de remover um, o usuario volta a poder inserir;
#   G  a funcao do limite e SECURITY DEFINER com search_path fixo e sem EXECUTE
#      para PUBLIC/anon/authenticated; as 5 policies originais seguem de pe.
#
# Nao toca banco real: container postgres:17-alpine efemero, derrubado no fim.

set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
mig_base_table="$repo_root/supabase/migrations/20260315163251_4cfe886d-c2c6-45f1-b3a9-fe5e6bf89611.sql"
mig_base_triggers="$repo_root/supabase/migrations/20260315172343_620fdf49-ed46-4dd2-a33e-d1cd4bd89870.sql"
mig_shared="$repo_root/supabase/migrations/20260402110743_10db3425-4045-47ad-bb82-2e48423bcf9f.sql"
mig_nova="$repo_root/supabase/migrations/20261014021029_saved_filters_inbox_presets.sql"

postgres_image="${INBOX_PRESETS_TEST_POSTGRES_IMAGE:-postgres:17-alpine}"
container_name="zapp-v2-inbox-presets-test-$$"

cleanup() {
  if [[ "$container_name" =~ ^zapp-v2-inbox-presets-test-[0-9]+$ ]]; then
    docker rm -f "$container_name" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT INT TERM

fail() {
  printf '[FAIL] %s\n' "$1" >&2
  exit 1
}

psql_sql() {
  docker exec "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres -c "$1"
}

psql_file() {
  docker exec -i "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres < "$1"
}

expect_failure() {
  local label="$1" sql="$2" output status
  set +e
  output="$(psql_sql "$sql" 2>&1)"
  status=$?
  set -e
  if (( status == 0 )); then
    printf '%s\n' "$output" >&2
    fail "$label deveria falhar"
  fi
  printf '[PASS] %s\n' "$label"
}

for f in "$mig_base_table" "$mig_base_triggers" "$mig_shared" "$mig_nova"; do
  [[ -f "$f" ]] || fail "migration ausente: $f"
done

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

# --- Stubs do entorno (roles, auth.uid, tabelas/funcoes que as base tocam) -----
psql_sql "
  CREATE EXTENSION IF NOT EXISTS pgcrypto;
  CREATE SCHEMA auth;
  CREATE ROLE anon NOLOGIN;
  CREATE ROLE authenticated NOLOGIN;
  CREATE ROLE service_role NOLOGIN BYPASSRLS;
  CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
    AS \$\$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid \$\$;
  CREATE TABLE auth.users (id uuid PRIMARY KEY);
  CREATE TABLE public.profiles (id uuid PRIMARY KEY, user_id uuid);
  CREATE TABLE public.contacts (id uuid PRIMARY KEY, assigned_to uuid, queue_id uuid);
  CREATE TABLE public.messages (id uuid PRIMARY KEY, contact_id uuid, created_at timestamptz, external_id text);
  CREATE TABLE public.audit_logs (id uuid PRIMARY KEY, user_id uuid, created_at timestamptz);
  CREATE TABLE public.campaign_contacts (id uuid PRIMARY KEY, campaign_id uuid, status text);
  CREATE TABLE public.agent_stats (id uuid PRIMARY KEY, xp integer);
  CREATE TABLE public.user_devices (id uuid PRIMARY KEY);
  CREATE TABLE public.queues (id uuid PRIMARY KEY);
  CREATE TABLE public.tags (id uuid PRIMARY KEY);
  CREATE TABLE public.whatsapp_connections (id uuid PRIMARY KEY);
  CREATE TABLE public.whatsapp_groups (id uuid PRIMARY KEY);
  CREATE TABLE public.products (id uuid PRIMARY KEY);
  CREATE TABLE public.campaigns (id uuid PRIMARY KEY);
  CREATE TABLE public.chatbot_flows (id uuid PRIMARY KEY);
  CREATE TABLE public.sla_configurations (id uuid PRIMARY KEY);
  CREATE TABLE public.user_settings (id uuid PRIMARY KEY);
  CREATE TABLE public.business_hours (id uuid PRIMARY KEY);
  CREATE TABLE public.away_messages (id uuid PRIMARY KEY);
  CREATE TABLE public.scheduled_messages (id uuid PRIMARY KEY);
  CREATE TABLE public.whatsapp_templates (id uuid PRIMARY KEY);
  CREATE TABLE public.contact_notes (id uuid PRIMARY KEY);
  CREATE TABLE public.queue_goals (id uuid PRIMARY KEY);
  CREATE TABLE public.auto_close_config (id uuid PRIMARY KEY);
  CREATE TABLE public.scheduled_reports (id uuid PRIMARY KEY);
  CREATE TABLE public.conversation_sla (id uuid PRIMARY KEY);
  CREATE TABLE public.goals_configurations (id uuid PRIMARY KEY);
  CREATE TABLE public.geo_blocking_settings (id uuid PRIMARY KEY);
  CREATE TABLE public.rate_limit_configs (id uuid PRIMARY KEY);
  CREATE TABLE public.message_templates (id uuid PRIMARY KEY);
  CREATE FUNCTION public.update_updated_at_column() RETURNS trigger LANGUAGE plpgsql AS \$\$ BEGIN RETURN NEW; END \$\$;
  CREATE FUNCTION public.auto_assign_contact() RETURNS trigger LANGUAGE plpgsql AS \$\$ BEGIN RETURN NEW; END \$\$;
  CREATE FUNCTION public.auto_assign_to_queue_agent() RETURNS trigger LANGUAGE plpgsql AS \$\$ BEGIN RETURN NEW; END \$\$;
  CREATE FUNCTION public.prevent_role_escalation() RETURNS trigger LANGUAGE plpgsql AS \$\$ BEGIN RETURN NEW; END \$\$;
  CREATE FUNCTION public.init_agent_stats() RETURNS trigger LANGUAGE plpgsql AS \$\$ BEGIN RETURN NEW; END \$\$;
  CREATE FUNCTION public.update_agent_level() RETURNS trigger LANGUAGE plpgsql AS \$\$ BEGIN RETURN NEW; END \$\$;
  CREATE FUNCTION public.update_device_last_seen() RETURNS trigger LANGUAGE plpgsql AS \$\$ BEGIN RETURN NEW; END \$\$;
  CREATE FUNCTION public.handle_new_user() RETURNS trigger LANGUAGE plpgsql AS \$\$ BEGIN RETURN NEW; END \$\$;
  CREATE FUNCTION public.handle_new_user_role() RETURNS trigger LANGUAGE plpgsql AS \$\$ BEGIN RETURN NEW; END \$\$;
" >/dev/null

# --- Aplica as migrations REAIS, na ordem, e prova que aplicam sem erro -------
psql_file "$mig_base_table"  >/dev/null
psql_file "$mig_base_triggers" >/dev/null
psql_file "$mig_shared"      >/dev/null
psql_file "$mig_nova"        >/dev/null
printf '[PASS] migrations base + nova aplicam sem erro\n'

# Grants como no PostgREST (a RLS e quem decide); sem isto a prova de enforcement
# viraria "permission denied" e nao testaria as policies.
psql_sql "GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;" >/dev/null

u_a='11111111-1111-1111-1111-1111111111a1'
u_b='11111111-1111-1111-1111-1111111111b2'
u_c='11111111-1111-1111-1111-1111111111c3'
u_d='11111111-1111-1111-1111-1111111111d4'

# --- B. Isolamento por usuario (RLS real) ------------------------------------
psql_sql "SET ROLE authenticated; SET request.jwt.claim.sub='$u_a';
  INSERT INTO public.saved_filters (user_id, entity_type, name, filters)
  VALUES ('$u_a', 'inbox', 'Meu preset A', '{\"chip\":\"novos\"}'::jsonb);" >/dev/null
psql_sql "SET ROLE authenticated; SET request.jwt.claim.sub='$u_b';
  INSERT INTO public.saved_filters (user_id, entity_type, name, filters)
  VALUES ('$u_b', 'inbox', 'Preset B', '{}'::jsonb);" >/dev/null

[[ "$(psql_sql "SET ROLE authenticated; SET request.jwt.claim.sub='$u_a'; SELECT count(*) FROM public.saved_filters WHERE entity_type='inbox';")" == '1' ]] \
  || fail 'dono nao viu o proprio preset'
[[ "$(psql_sql "SET ROLE authenticated; SET request.jwt.claim.sub='$u_b'; SELECT count(*) FROM public.saved_filters WHERE user_id='$u_a';")" == '0' ]] \
  || fail 'B leu preset de A (vazamento)'
[[ "$(psql_sql "SET ROLE authenticated; SET request.jwt.claim.sub='$u_b'; WITH c AS (UPDATE public.saved_filters SET name='x' WHERE user_id='$u_a' RETURNING 1) SELECT count(*) FROM c;")" == '0' ]] \
  || fail 'B alterou preset de A'
[[ "$(psql_sql "SET ROLE authenticated; SET request.jwt.claim.sub='$u_b'; WITH c AS (DELETE FROM public.saved_filters WHERE user_id='$u_a' RETURNING 1) SELECT count(*) FROM c;")" == '0' ]] \
  || fail 'B apagou preset de A'
expect_failure 'B nao insere preset com user_id de A (spoof)' \
  "SET ROLE authenticated; SET request.jwt.claim.sub='$u_b'; INSERT INTO public.saved_filters (user_id, entity_type, name, filters) VALUES ('$u_a','inbox','spoof','{}'::jsonb);"

[[ "$(psql_sql "SET ROLE anon; SELECT count(*) FROM public.saved_filters;")" == '0' ]] || fail 'anon leu presets'
expect_failure 'anon nao insere preset de inbox' \
  "SET ROLE anon; INSERT INTO public.saved_filters (user_id, entity_type, name, filters) VALUES ('$u_a','inbox','anon','{}'::jsonb);"

[[ "$(psql_sql "SET ROLE service_role; SELECT count(*) FROM public.saved_filters WHERE user_id IN ('$u_a','$u_b');")" == '2' ]] \
  || fail 'service_role nao leu os dois presets (BYPASSRLS)'

# a policy de shared nao vaza preset de inbox de terceiros
[[ "$(psql_sql "SET ROLE authenticated; SET request.jwt.claim.sub='$u_a'; SELECT count(*) FROM public.saved_filters WHERE user_id='$u_b';")" == '0' ]] \
  || fail 'preset de B apareceu para A'

# --- C. Forma do JSON --------------------------------------------------------
psql_sql "SET ROLE authenticated; SET request.jwt.claim.sub='$u_a';
  INSERT INTO public.saved_filters (user_id, entity_type, name, filters)
  VALUES ('$u_a','inbox','completo','{\"chip\":\"novos\",\"queue\":\"$u_a\",\"type\":\"open\",\"attendee\":\"$u_a\",\"date_from\":\"2026-10-01\",\"date_to\":\"2026-10-13\"}'::jsonb);" >/dev/null \
  || fail 'preset valido com todas as chaves foi recusado'
printf '[PASS] preset valido com todas as chaves aceitas\n'

expect_failure 'chave desconhecida (etiquetas) recusada' \
  "INSERT INTO public.saved_filters (user_id, entity_type, name, filters) VALUES ('$u_a','inbox','x','{\"tags\":[\"vip\"]}'::jsonb);"
expect_failure 'filters como array recusado' \
  "INSERT INTO public.saved_filters (user_id, entity_type, name, filters) VALUES ('$u_a','inbox','x','[1,2]'::jsonb);"
expect_failure 'chip nao-string recusado' \
  "INSERT INTO public.saved_filters (user_id, entity_type, name, filters) VALUES ('$u_a','inbox','x','{\"chip\":7}'::jsonb);"
expect_failure 'date_from fora do ISO recusado' \
  "INSERT INTO public.saved_filters (user_id, entity_type, name, filters) VALUES ('$u_a','inbox','x','{\"date_from\":\"01/10/2026\"}'::jsonb);"
psql_sql "INSERT INTO public.saved_filters (user_id, entity_type, name, filters) VALUES ('$u_a','contacts','c','{\"tags\":[\"vip\"],\"qualquer\":1}'::jsonb);" >/dev/null \
  || fail 'linha de contacts foi barrada pelo CHECK de inbox'
printf '[PASS] CHECK nao afeta entity_type <> inbox\n'

# --- D. Nao-compartilhamento -------------------------------------------------
expect_failure 'preset de inbox com is_shared=true recusado' \
  "INSERT INTO public.saved_filters (user_id, entity_type, name, filters, is_shared) VALUES ('$u_a','inbox','shared','{}'::jsonb, true);"
psql_sql "INSERT INTO public.saved_filters (user_id, entity_type, name, filters, is_shared) VALUES ('$u_a','contacts','shared-contacts','{}'::jsonb, true);" >/dev/null \
  || fail 'contacts com is_shared=true foi barrado'
printf '[PASS] is_shared=true segue permitido fora do inbox\n'

# --- E. Teto por usuario -----------------------------------------------------
psql_sql "INSERT INTO public.saved_filters (user_id, entity_type, name, filters)
  SELECT '$u_c', 'inbox', 'p'||g, '{}'::jsonb FROM generate_series(1,50) g;" >/dev/null \
  || fail '50 presets validos recusados'
[[ "$(psql_sql "SELECT count(*) FROM public.saved_filters WHERE user_id='$u_c' AND entity_type='inbox';")" == '50' ]] \
  || fail 'contagem apos 50 presets divergente'
expect_failure '51o preset do mesmo usuario recusado' \
  "INSERT INTO public.saved_filters (user_id, entity_type, name, filters) VALUES ('$u_c','inbox','p51','{}'::jsonb);"
psql_sql "INSERT INTO public.saved_filters (user_id, entity_type, name, filters) VALUES ('$u_b','inbox','extra','{}'::jsonb);" >/dev/null \
  || fail 'teto vazou para outro usuario'
printf '[PASS] teto e por usuario (B ainda insere)\n'

psql_sql "INSERT INTO public.saved_filters (user_id, entity_type, name, filters)
  SELECT '$u_c', 'contacts', 'c'||g, '{}'::jsonb FROM generate_series(1,60) g;" >/dev/null \
  || fail 'teto contou linhas de contacts'
printf '[PASS] teto nao conta entity_type = contacts\n'

expect_failure 'INSERT multi-linha acima do teto recusado em bloco' \
  "INSERT INTO public.saved_filters (user_id, entity_type, name, filters)
   SELECT '$u_d', 'inbox', 'b'||g, '{}'::jsonb FROM generate_series(1,60) g;"
[[ "$(psql_sql "SELECT count(*) FROM public.saved_filters WHERE user_id='$u_d';")" == '0' ]] \
  || fail 'bloco recusado deixou linha parcial'
printf '[PASS] bloco acima do teto e atomico (nenhuma linha parcial)\n'

# --- F. Remover libera espaco -------------------------------------------------
psql_sql "DELETE FROM public.saved_filters WHERE user_id='$u_c' AND entity_type='inbox' AND name='p1';" >/dev/null
psql_sql "INSERT INTO public.saved_filters (user_id, entity_type, name, filters) VALUES ('$u_c','inbox','p51b','{}'::jsonb);" >/dev/null \
  || fail 'apos remover um, usuario nao conseguiu inserir de novo'
printf '[PASS] remover um preset libera espaco\n'

# --- G. Contrato da funcao e integridade das policies ------------------------
[[ "$(psql_sql "SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='enforce_inbox_preset_limit' AND p.prosecdef AND 'search_path=pg_catalog, public'=ANY(p.proconfig);")" == '1' ]] \
  || fail 'funcao do limite nao e SECURITY DEFINER com search_path fixo'
[[ "$(psql_sql "SELECT count(*) FROM information_schema.routine_privileges WHERE routine_schema='public' AND routine_name='enforce_inbox_preset_limit' AND grantee IN ('PUBLIC','anon','authenticated');")" == '0' ]] \
  || fail 'PUBLIC/anon/authenticated conservou EXECUTE na funcao do limite'
[[ "$(psql_sql "SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename='saved_filters';")" == '5' ]] \
  || fail 'as 5 policies originais de saved_filters nao seguem de pe'
[[ "$(psql_sql "SELECT relrowsecurity FROM pg_class WHERE oid='public.saved_filters'::regclass;")" == 't' ]] \
  || fail 'RLS de saved_filters desligado'
printf '[PASS] funcao SECURITY DEFINER sem EXECUTE publico; 5 policies e RLS intactos\n'

printf 'Inbox filter presets PostgreSQL 17 behavioral contract: PASS\n'
