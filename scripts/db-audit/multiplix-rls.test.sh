#!/usr/bin/env bash
# F20 do Bloco A (docs/multiplix/PLANO_FINALIZACAO_MULTIPLIX_100_ETAPAS_2026-09-29.md).
#
# Prova, em PostgreSQL 17 descartavel, o contrato de acesso e de fila do modulo
# Multiplix: grants/RLS/FORCE (F01/F02), policies (F03/F04), guarda de
# mutabilidade (F05), criacao transacional idempotente com teto (F08), fila
# (F11b/F12/F13/F14) e scheduler (F10/F17).
#
# Diferente dos harnesses irmãos, este NAO recria as tabelas do modulo a mao:
# aplica as 10 migrations ja existentes em main na ordem de version, cria o
# pre-estado que o Supabase teria naquele ponto (grants default para
# anon/authenticated) e so entao aplica as migrations desta tarefa. Assim o teste
# cobre tambem a divergencia de replay documentada em F04 (a 20260927210000
# recria policies sem TO authenticated; a 20260927130001 as tinha criado com).
set -euo pipefail

repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
migrations_dir="$repo_root/supabase/migrations"
postgres_image="${MULTIPLIX_RLS_TEST_POSTGRES_IMAGE:-postgres:17-alpine}"
container_name="multiplix-rls-test-$$"
test_password="multiplix_rls_test_only"

cleanup() { docker rm -f "$container_name" >/dev/null 2>&1 || true; }
trap cleanup EXIT
fail() { printf 'FAIL: %s\n' "$1" >&2; exit 1; }
psql_test() { docker exec -i "$container_name" psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres "$@"; }

migration() {
  local file="$migrations_dir/$1"
  [[ -f "$file" ]] || fail "migration ausente: $1"
  printf '  · %s\n' "$1" >&2
  psql_test < "$file" >/dev/null
}

start_postgres() {
  for attempt in 1 2 3; do
    docker rm -f "$container_name" >/dev/null 2>&1 || true
    if ! docker run -d --name "$container_name" -e POSTGRES_PASSWORD="$test_password" "$postgres_image" >/dev/null; then
      printf 'WARN: PostgreSQL container failed to start (attempt %s/3)\n' "$attempt" >&2
      continue
    fi
    for _ in $(seq 1 15); do
      if docker exec "$container_name" psql -X -U postgres -d postgres -Atqc 'SELECT 1' >/dev/null 2>&1; then
        sleep 1
        if docker exec "$container_name" psql -X -U postgres -d postgres -Atqc 'SELECT 1' >/dev/null 2>&1; then
          return 0
        fi
      fi
      sleep 1
    done
    printf 'WARN: PostgreSQL bootstrap was not stable (attempt %s/3)\n' "$attempt" >&2
    docker logs "$container_name" >&2 || true
  done
  return 1
}

start_postgres || fail 'PostgreSQL de teste não iniciou'

# ── infraestrutura que o Supabase fornece (auth, vault, cron, pg_net) ──────────
psql_test >/dev/null <<'SQL'
CREATE SCHEMA auth;
CREATE SCHEMA vault;
CREATE SCHEMA net;
CREATE SCHEMA cron;

CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$
  SELECT coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')
  )::text
$$;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$$;

CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE ROLE service_role;
-- No Supabase o service_role tem BYPASSRLS: e assim que a edge (service key)
-- escreve direto nas tabelas do modulo sem policy para ele.
ALTER ROLE service_role BYPASSRLS;

-- Em producao o schema auth e legivel pelos roles da API (as policies chamam
-- auth.uid()); sem isso o harness falharia com "permission denied for schema auth"
-- em vez de exercitar a regra que o teste quer provar.
GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;

CREATE TYPE public.app_role AS ENUM ('admin', 'supervisor', 'agent', 'special_agent');
CREATE TABLE public.profiles (id uuid PRIMARY KEY, user_id uuid NOT NULL);
CREATE TABLE public.user_roles (user_id uuid NOT NULL, role public.app_role NOT NULL);
CREATE TABLE public.permissions (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text UNIQUE NOT NULL, description text, category text, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.role_permissions (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), role public.app_role NOT NULL, permission_id uuid NOT NULL REFERENCES public.permissions(id), created_at timestamptz NOT NULL DEFAULT now());

CREATE FUNCTION public.is_admin_or_supervisor(_user_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role IN ('admin', 'supervisor'))
$$;
-- A 20261001261230 (F35, publicos) usa has_role nas policies de leitura
-- compartilhada; assinatura real: public.has_role(_user_id uuid, _role app_role)
-- (20251215025014). Mesmo estilo dos outros stubs do harness.
CREATE FUNCTION public.has_role(_user_id uuid, _role public.app_role) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;
CREATE FUNCTION public.user_has_permission(_user_id uuid, _permission_name text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur
    JOIN public.role_permissions rp ON rp.role = ur.role
    JOIN public.permissions p ON p.id = rp.permission_id
    WHERE ur.user_id = _user_id AND p.name = _permission_name
  )
$$;
CREATE FUNCTION public.update_updated_at_column() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = statement_timestamp(); RETURN NEW; END
$$;

CREATE TABLE public.talkx_settings (key text PRIMARY KEY, value jsonb NOT NULL, description text, updated_at timestamptz NOT NULL DEFAULT now());
INSERT INTO public.talkx_settings (key, value) VALUES
  ('daily_limit_per_connection', '500'::jsonb),
  ('business_hours', '{"tz":"America/Sao_Paulo","start":"08:00","end":"18:00","days":[1,2,3,4,5]}'::jsonb);
CREATE TABLE public.talkx_campaigns (id uuid PRIMARY KEY, whatsapp_connection_id uuid);
CREATE TABLE public.talkx_recipients (id uuid PRIMARY KEY, campaign_id uuid NOT NULL, sent_at timestamptz);

CREATE TABLE vault.secrets (name text PRIMARY KEY);
CREATE TABLE vault.decrypted_secrets (name text PRIMARY KEY, decrypted_secret text);
CREATE FUNCTION vault.create_secret(secret text, name text) RETURNS void LANGUAGE sql AS $$
  INSERT INTO vault.secrets (name) VALUES (name) ON CONFLICT DO NOTHING;
  INSERT INTO vault.decrypted_secrets (name, decrypted_secret) VALUES (name, secret) ON CONFLICT DO NOTHING;
$$;
INSERT INTO vault.decrypted_secrets (name, decrypted_secret) VALUES
  ('zapp_anon_key', 'anon-key-de-teste');
CREATE TABLE cron.jobs (jobname text PRIMARY KEY, schedule text, command text);
CREATE FUNCTION cron.schedule(jobname text, schedule text, command text) RETURNS bigint LANGUAGE sql AS $$
  INSERT INTO cron.jobs (jobname, schedule, command) VALUES (jobname, schedule, command)
  ON CONFLICT (jobname) DO UPDATE SET schedule = excluded.schedule, command = excluded.command
  RETURNING 1::bigint;
$$;
CREATE TABLE net.requests (id bigserial PRIMARY KEY, url text, body jsonb, headers jsonb);
CREATE FUNCTION net.http_post(url text, body jsonb DEFAULT '{}'::jsonb, headers jsonb DEFAULT '{}'::jsonb, timeout_milliseconds integer DEFAULT 5000)
  RETURNS bigint LANGUAGE sql AS $$
  INSERT INTO net.requests (url, body, headers) VALUES (url, body, headers) RETURNING id;
$$;

-- A publication realtime existe vazia; a 20260926230000 adiciona as tabelas.
CREATE PUBLICATION supabase_realtime;

-- Atores: A = admin dono; B = supervisor nao-dono; C = operador sem papel de staff
-- (agent que nunca criou nada); D = dono NAO-staff (special_agent que criou um
-- disparo quando era staff e hoje so enxerga o proprio — cobre o ramo "dono" da
-- policy de SELECT, que nao exige papel).
INSERT INTO public.profiles (id, user_id) VALUES
  ('10000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-00000000000a'),
  ('10000000-0000-0000-0000-00000000000b', '20000000-0000-0000-0000-00000000000b'),
  ('10000000-0000-0000-0000-00000000000c', '20000000-0000-0000-0000-00000000000c'),
  ('10000000-0000-0000-0000-00000000000d', '20000000-0000-0000-0000-00000000000d');
INSERT INTO public.user_roles (user_id, role) VALUES
  ('20000000-0000-0000-0000-00000000000a', 'admin'),
  ('20000000-0000-0000-0000-00000000000b', 'supervisor'),
  ('20000000-0000-0000-0000-00000000000c', 'agent'),
  ('20000000-0000-0000-0000-00000000000d', 'special_agent');
GRANT ALL ON public.profiles, public.user_roles, public.role_permissions, public.permissions TO authenticated;
SQL

# ── as 10 migrations do modulo ja em main, na ordem de version ─────────────────
migration "20260926150000_seed_multiplix_audience_permissions.sql"
migration "20260926161000_multiplix_dispatches_schema.sql"
migration "20260926180000_multiplix_send_engine.sql"
migration "20260926230000_multiplix_realtime_publication.sql"
migration "20260926430000_multiplix_delivery_receipts.sql"
migration "20260927130001_multiplix_rls_fix_public_to_authenticated.sql"
migration "20260927210000_multiplix_rls_hardening_realtime_pii.sql"
migration "20260927280000_multiplix_blocks_table.sql"
migration "20260927320000_multiplix_cron_scheduler.sql"
migration "20260927600000_fix_multiplix_dispatch_start_sending.sql"

# ── pre-estado Supabase no ponto em que esta tarefa entra ──────────────────────
psql_test >/dev/null <<'SQL'
-- Default privilege do Supabase: anon e authenticated nascem com TUDO nas tabelas
-- novas do schema public, inclusive TRUNCATE/REFERENCES/TRIGGER (achado 1).
GRANT ALL ON public.multiplix_dispatches, public.multiplix_recipients, public.multiplix_blocks TO anon;
GRANT ALL ON public.multiplix_dispatches, public.multiplix_recipients, public.multiplix_blocks TO authenticated;
-- service_role tambem nasce com ALL no Supabase (o worker escreve por ai) e a
-- migration de hardening nao revoga nada dele.
GRANT ALL ON public.multiplix_dispatches, public.multiplix_recipients, public.multiplix_blocks TO service_role;
GRANT ALL ON public.talkx_settings, public.talkx_campaigns, public.talkx_recipients TO service_role;
GRANT SELECT ON public.talkx_settings, public.talkx_campaigns, public.talkx_recipients TO authenticated;

INSERT INTO public.multiplix_dispatches (id, name, message_template, status, created_by, total_recipients, whatsapp_connection_id) VALUES
  ('30000000-0000-0000-0000-000000000001', 'Disparo do A', 'Oi {{empresa}}', 'sending', '10000000-0000-0000-0000-00000000000a', 1, '70000000-0000-0000-0000-000000000001'),
  ('30000000-0000-0000-0000-000000000002', 'Rascunho do A', 'Oi {{empresa}}', 'draft', '10000000-0000-0000-0000-00000000000a', 0, NULL),
  ('30000000-0000-0000-0000-000000000003', 'Rascunho do B', 'Oi {{empresa}}', 'draft', '10000000-0000-0000-0000-00000000000b', 0, NULL),
  ('30000000-0000-0000-0000-000000000004', 'Rascunho do D', 'Oi {{empresa}}', 'draft', '10000000-0000-0000-0000-00000000000d', 1, NULL);
INSERT INTO public.multiplix_recipients (id, dispatch_id, company_id, company_name_snapshot, destino_e164, status) VALUES
  ('40000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001', 'Empresa 1', '+5511990000001', 'pending'),
  ('40000000-0000-0000-0000-00000000000d', '30000000-0000-0000-0000-000000000004', '50000000-0000-0000-0000-00000000000d', 'Empresa do D', NULL, 'pending');
INSERT INTO public.multiplix_blocks (dispatch_id, block_order, block_type, template_text) VALUES
  ('30000000-0000-0000-0000-000000000002', 0, 'text', 'bloco do A'),
  ('30000000-0000-0000-0000-000000000003', 0, 'text', 'bloco do B');
SQL

# ── as migrations DESTA tarefa, na ordem de version ────────────────────────────
migration "20260929570000_multiplix_hardening_grants_rls_blocks.sql"
migration "20260929580000_multiplix_policies_consolidation.sql"
migration "20260929590000_multiplix_mutability_guard.sql"
migration "20260929600000_multiplix_send_engine_fixes.sql"
migration "20260929610000_multiplix_cron_window_and_limits.sql"
migration "20260929620000_multiplix_realtime_column_scope.sql"
migration "20260929630000_multiplix_create_draft.sql"
migration "20260929640000_multiplix_dispatch_manage_all_permission.sql"
migration "20260930300000_multiplix_guards_fail_closed.sql"
# F17b/F17c: substitui o corpo de trigger_pending_multiplix_dispatches() pela
# versao com guard de conexao e retomada por cota — e a version mais alta da
# tarefa e tem de entrar depois das demais do bloco DDL.
migration "20260930560000_f17b_f17c_conexao_unica_e_cota.sql"
# F35 (Bloco C): publicos (audiencias) do modelo v2 — cria as DUAS tabelas novas
# (multiplix_audiences, multiplix_audience_members), o trigger de validacao, os
# grants e o contrato de acesso com FORCE RLS. Version mais alta do fixture
# (20261001261230); entra por ultimo na ordem de version. E ela que liga o FORCE
# RLS das duas tabelas que a assercao F02 (linha ~236) passa a exigir.
migration "20261001261230_f35_multiplix_audiences.sql"

# A revogacao da escrita direta em multiplix_recipients (F08, segunda metade) so
# existe depois que a edge que cria o disparo esta DEPLOYADA — ela entra no PR de
# edge/front, nao no de DDL. O bloco abaixo acompanha o que estiver no repo: sem
# o arquivo, o teste cobra o estado ANTERIOR (INSERT/UPDATE ainda concedidos);
# com o arquivo, cobra anon/authenticated sem o caminho de escrita.
REVOKE_MIGRATION="$(ls "$migrations_dir"/*_multiplix_revoke_recipient_writes.sql 2>/dev/null | head -1 || true)"
if [[ -n "$REVOKE_MIGRATION" ]]; then
  migration "$(basename "$REVOKE_MIGRATION")"
  RECIPIENT_WRITES_REVOKED=true
else
  RECIPIENT_WRITES_REVOKED=false
fi

admin_a="SET ROLE authenticated; SET request.jwt.claim.role='authenticated'; SET request.jwt.claim.sub='20000000-0000-0000-0000-00000000000a';"
supervisor_b="SET ROLE authenticated; SET request.jwt.claim.role='authenticated'; SET request.jwt.claim.sub='20000000-0000-0000-0000-00000000000b';"
agent_c="SET ROLE authenticated; SET request.jwt.claim.role='authenticated'; SET request.jwt.claim.sub='20000000-0000-0000-0000-00000000000c';"
service_session="SET ROLE service_role; SET request.jwt.claim.role='service_role';"
anon_session="SET ROLE anon; SET request.jwt.claim.role='anon';"
owner_d="SET ROLE authenticated; SET request.jwt.claim.role='authenticated'; SET request.jwt.claim.sub='20000000-0000-0000-0000-00000000000d';"

# ── F01/F02: anon fora, sem TRUNCATE, FORCE RLS ligado ─────────────────────────
[[ "$(psql_test -Atqc "SELECT count(*) FROM information_schema.role_table_grants WHERE table_schema='public' AND table_name LIKE 'multiplix%' AND grantee='anon'")" == '0' ]] \
  || fail 'anon ainda tem grant em tabela do Multiplix (F01)'
[[ "$(psql_test -Atqc "SELECT count(*) FROM information_schema.role_table_grants WHERE table_schema='public' AND table_name LIKE 'multiplix%' AND grantee='authenticated' AND privilege_type IN ('TRUNCATE','REFERENCES','TRIGGER')")" == '0' ]] \
  || fail 'authenticated ainda tem TRUNCATE/REFERENCES/TRIGGER (F01)'
[[ "$(psql_test -Atqc "SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname IN ('multiplix_dispatches','multiplix_recipients','multiplix_blocks','multiplix_audiences','multiplix_audience_members') AND c.relforcerowsecurity")" == '5' ]] \
  || fail 'FORCE ROW LEVEL SECURITY ausente nas cinco tabelas (F02)'
# F35: as duas tabelas de fila/evento ficam SEM FORCE RLS de proposito — sao escritas por
# RPCs SECURITY DEFINER (rodam como owner), e com FORCE o owner passaria a respeitar as
# policies e o worker pararia de conseguir claim/complete. O fixture DESTE arquivo cobre o
# nucleo do Multiplix e nao cria essas duas tabelas (o ENABLE RLS delas vem das migrations
# f32a/f34, fora da lista daqui); a cobertura de fila e do multiplix-delivery-leases.test.sh
# (F57). Quando elas existirem aqui, RLS ligado e obrigatorio — tabela de fila nua seria
# regressao — e a existencia das RPCs e o que sustenta a excecao do FORCE.
if [[ "$(psql_test -Atqc "SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname IN ('multiplix_delivery_items','multiplix_events')")" == '2' ]]; then
  [[ "$(psql_test -Atqc "SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname IN ('multiplix_delivery_items','multiplix_events') AND c.relrowsecurity")" == '2' ]] \
    || fail 'multiplix_delivery_items/multiplix_events sem RLS ligado (F35)'
  [[ "$(psql_test -Atqc "SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.prosecdef AND (p.prosrc ILIKE '%multiplix_delivery_items%' OR p.prosrc ILIKE '%multiplix_events%')")" -ge 1 ]] \
    || fail 'nenhuma RPC SECURITY DEFINER toca delivery_items/events: a excecao do FORCE RLS perdeu o motivo (F35)'
fi
anon_truncate="$(psql_test -v VERBOSITY=verbose -c "$anon_session TRUNCATE public.multiplix_recipients;" 2>&1 || true)"
[[ "$anon_truncate" == *permission*denied* ]] || fail 'anon truncou a fila do Multiplix'
anon_read="$(psql_test -Atqc "$anon_session SELECT count(*) FROM public.multiplix_dispatches;" 2>&1 || true)"
[[ "$anon_read" == *permission*denied* || "$anon_read" == '0' ]] || fail 'anon leu dispatches'

# ── F03: blocos exigem staff e rascunho ────────────────────────────────────────
[[ "$(psql_test -Atqc "SELECT count(*) FROM pg_policies WHERE tablename='multiplix_blocks' AND 'public' = ANY(roles)")" == '0' ]] \
  || fail 'policy de multiplix_blocks ainda TO public (F03)'
[[ "$(psql_test -Atqc "$agent_c SELECT count(*) FROM public.multiplix_blocks;")" == '0' ]] || fail 'agent (nao-staff) viu blocos'
[[ "$(psql_test -Atqc "$supervisor_b SELECT count(*) FROM public.multiplix_blocks;")" == '2' ]] \
  || fail 'supervisor (staff) deveria ler os blocos de todos os disparos'
agent_insert_blocks="$(psql_test -Atqc "$agent_c INSERT INTO public.multiplix_blocks (dispatch_id, block_order, block_type, template_text) VALUES ('30000000-0000-0000-0000-000000000003', 5, 'text', 'invasao') RETURNING 1;" 2>&1 || true)"
[[ "$agent_insert_blocks" != '1' ]] || fail 'agent inseriu bloco em rascunho alheio'

# ── F20: leitura escopada ao dono (agent sem disparo lê zero; dono não-staff só o próprio)
# A policy de SELECT tem dois ramos permissivos: "Admins can view all dispatches"
# (staff-wide, via is_admin_or_supervisor: admin/supervisor) e "Users can view own
# dispatches" (dono, sem exigir papel). O ramo staff-wide já tem controle positivo em
# F03 (supervisor lê os blocos de todos os disparos); aqui se prova o ramo do dono:
# quem NÃO é staff enxerga SOMENTE o disparo que criou — o disparo de OUTRO criador
# devolve zero linhas nas duas tabelas.
agent_rows_dispatches="$(psql_test -Atqc "$agent_c SELECT count(*) FROM public.multiplix_dispatches;" 2>&1 || true)"
[[ "$agent_rows_dispatches" == '0' ]] || fail "agent (sem disparo proprio) leu multiplix_dispatches (F20): $agent_rows_dispatches"
agent_rows_recipients="$(psql_test -Atqc "$agent_c SELECT count(*) FROM public.multiplix_recipients;" 2>&1 || true)"
[[ "$agent_rows_recipients" == '0' ]] || fail "agent (sem disparo proprio) leu multiplix_recipients (F20): $agent_rows_recipients"
agent_truncate="$(psql_test -v VERBOSITY=verbose -c "$agent_c TRUNCATE public.multiplix_recipients;" 2>&1 || true)"
[[ "$agent_truncate" == *permission*denied* ]] || fail 'agent truncou a fila do Multiplix (F20)'

# Dono NÃO-staff (D): o disparo do colega A devolve zero nas duas tabelas...
owner_d_other_dispatches="$(psql_test -Atqc "$owner_d SELECT count(*) FROM public.multiplix_dispatches WHERE created_by='10000000-0000-0000-0000-00000000000a';" 2>&1 || true)"
[[ "$owner_d_other_dispatches" == '0' ]] || fail "dono não-staff leu o disparo de outro criador (F20): $owner_d_other_dispatches"
owner_d_other_recipients="$(psql_test -Atqc "$owner_d SELECT count(*) FROM public.multiplix_recipients r JOIN public.multiplix_dispatches d ON d.id = r.dispatch_id WHERE d.created_by='10000000-0000-0000-0000-00000000000a';" 2>&1 || true)"
[[ "$owner_d_other_recipients" == '0' ]] || fail "dono não-staff leu destinatario de outro criador (F20): $owner_d_other_recipients"
# ...e o próprio continua visível (controle positivo: sem ele a asserção acima passaria
# só por a RLS estar negando tudo).
owner_d_own_dispatches="$(psql_test -Atqc "$owner_d SELECT count(*) FROM public.multiplix_dispatches;" 2>&1 || true)"
[[ "$owner_d_own_dispatches" == '1' ]] || fail "dono não-staff não viu o proprio disparo (F20): $owner_d_own_dispatches"
owner_d_own_recipients="$(psql_test -Atqc "$owner_d SELECT count(*) FROM public.multiplix_recipients;" 2>&1 || true)"
[[ "$owner_d_own_recipients" == '1' ]] || fail "dono não-staff não viu os proprios destinatarios (F20): $owner_d_own_recipients"

# ── F04: replay limpo nao termina com policy TO public ─────────────────────────
# (9 nascem TO authenticated; 7 sobrevivem quando a revogacao de F08 ja existe.)
[[ "$(psql_test -Atqc "SELECT count(*) FROM pg_policies WHERE tablename LIKE 'multiplix%' AND 'public' = ANY(roles)")" == '0' ]] \
  || fail 'replay limpo terminou com policy TO public (F04)'
EXPECTED_POLICIES=9
if [[ "$RECIPIENT_WRITES_REVOKED" = true ]]; then EXPECTED_POLICIES=7; fi
[[ "$(psql_test -Atqc "SELECT count(*) FROM pg_policies WHERE tablename IN ('multiplix_dispatches','multiplix_recipients') AND 'authenticated' = ANY(roles)")" == "$EXPECTED_POLICIES" ]] \
  || fail "replay limpo nao terminou com $EXPECTED_POLICIES policies TO authenticated (F04/F08)"
if [[ "$RECIPIENT_WRITES_REVOKED" = true ]]; then
  [[ "$(psql_test -Atqc "SELECT count(*) FROM information_schema.role_table_grants WHERE table_name='multiplix_recipients' AND grantee='authenticated' AND privilege_type IN ('INSERT','UPDATE')")" == '0' ]] \
    || fail 'authenticated ainda tem INSERT/UPDATE em multiplix_recipients depois da revogacao (F08)'
  [[ "$(psql_test -Atqc "SELECT count(*) FROM information_schema.role_table_grants WHERE table_name='multiplix_recipients' AND grantee='authenticated' AND privilege_type IN ('SELECT','DELETE')")" == '2' ]] \
    || fail 'a revogacao tirou SELECT/DELETE legitimos de multiplix_recipients (F08)'
else
  [[ "$(psql_test -Atqc "SELECT count(*) FROM information_schema.role_table_grants WHERE table_name='multiplix_recipients' AND grantee='authenticated' AND privilege_type IN ('INSERT','UPDATE')")" == '2' ]] \
    || fail 'REVOKE de F08 aplicado sem a migration de revogacao (o PR de DDL nao pode tirar a escrita direta)'
fi

# ── F15: realtime sem PII ──────────────────────────────────────────────────────
# attnames NULL = tabela publicada com TODAS as colunas.
pub_disp="$(psql_test -Atqc "SELECT coalesce(array_to_string(attnames, ','), 'TODAS') FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename='multiplix_dispatches'")"
pub_recip="$(psql_test -Atqc "SELECT coalesce(array_to_string(attnames, ','), 'TODAS') FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename='multiplix_recipients'")"
[[ "$pub_disp" != 'TODAS' ]] || fail 'realtime publica TODAS as colunas de multiplix_dispatches (F15)'
[[ "$pub_recip" != 'TODAS' ]] || fail 'realtime publica TODAS as colunas de multiplix_recipients (F15)'
[[ "$pub_disp" != *message_template* && "$pub_disp" != *audience_filters* ]] \
  || fail 'realtime ainda publica message_template/audience_filters (F15)'
[[ "$pub_recip" != *destino_e164* && "$pub_recip" != *personalized_message* && "$pub_recip" != *delivery_claim_token* ]] \
  || fail 'realtime ainda publica PII de multiplix_recipients (F15)'
# Contrapeso: o recorte nao pode ter ficado largo demais e derrubado o monitor.
for col in id status sent_count failed_count delivered_count updated_at; do
  [[ "$pub_disp" == *"$col"* ]] || fail "realtime deixou de publicar $col em multiplix_dispatches (F15)"
done
for col in id status; do
  [[ "$pub_recip" == *"$col"* ]] || fail "realtime deixou de publicar $col em multiplix_recipients (F15)"
done

# ── F05: guarda de mutabilidade ────────────────────────────────────────────────
staff_status_update="$(psql_test -v VERBOSITY=verbose -c "$admin_a UPDATE public.multiplix_dispatches SET status='sending' WHERE id='30000000-0000-0000-0000-000000000002';" 2>&1 || true)"
[[ "$staff_status_update" == *multiplix_dispatch_transition_denied* ]] || fail 'staff conseguiu forcar status por UPDATE direto (F05)'
staff_template_update="$(psql_test -v VERBOSITY=verbose -c "$admin_a UPDATE public.multiplix_dispatches SET message_template='outro' WHERE id='30000000-0000-0000-0000-000000000001';" 2>&1 || true)"
[[ "$staff_template_update" == *multiplix_dispatch_content_locked* || "$staff_template_update" == *multiplix_dispatch_transition_denied* ]] \
  || fail 'staff editou template de disparo em envio (F05)'
staff_counter_update="$(psql_test -v VERBOSITY=verbose -c "$admin_a UPDATE public.multiplix_dispatches SET sent_count=99 WHERE id='30000000-0000-0000-0000-000000000002';" 2>&1 || true)"
[[ "$staff_counter_update" == *multiplix_delivery_state_managed_by_worker* ]] || fail 'staff escreveu contador do worker (F05)'
staff_recipient_update="$(psql_test -v VERBOSITY=verbose -c "$admin_a UPDATE public.multiplix_recipients SET status='pending' WHERE id='40000000-0000-0000-0000-000000000001';" 2>&1 || true)"
[[ "$staff_recipient_update" == *permission*denied* || "$staff_recipient_update" == *multiplix_recipient_update_denied* ]] \
  || fail 'staff reescreveu destinatario em envio (F05/F08)'
staff_recipient_insert="$(psql_test -v VERBOSITY=verbose -c "$admin_a INSERT INTO public.multiplix_recipients (dispatch_id, company_id, destino_e164, status) VALUES ('30000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000009', '+5511990000009', 'pending');" 2>&1 || true)"
[[ "$staff_recipient_insert" == *permission*denied* || "$staff_recipient_insert" == *multiplix_recipient_insert_requires_draft* ]] \
  || fail 'staff inseriu destinatario em disparo fora de rascunho'
draft_update="$(psql_test -Atqc "$admin_a UPDATE public.multiplix_dispatches SET name='Rascunho renomeado' WHERE id='30000000-0000-0000-0000-000000000002' RETURNING name;")"
[[ "$draft_update" == 'Rascunho renomeado' ]] || fail 'staff perdeu a escrita legitima no proprio rascunho'

# ── F08: criacao transacional, idempotente, com teto ───────────────────────────
created="$(psql_test -Atqc "$service_session SELECT dispatch_id || ':' || recipient_count || ':' || created FROM public.multiplix_create_draft('Disparo novo', 'Oi {{empresa}}', '[
  {\"company_id\":\"50000000-0000-0000-0000-000000000011\",\"company_name\":\"Empresa 11\",\"destino_e164\":\"+5511990000011\",\"destino_origem\":\"contato_whatsapp\",\"elegibilidade\":\"apto\"},
  {\"company_id\":\"50000000-0000-0000-0000-000000000012\",\"company_name\":\"Empresa 12\",\"destino_e164\":null,\"destino_origem\":\"sem_destino\",\"elegibilidade\":\"destino_invalido\"},
  {\"company_id\":\"50000000-0000-0000-0000-000000000013\",\"company_name\":\"Empresa 13\",\"destino_e164\":\"+5511990000013\",\"destino_origem\":\"contato_whatsapp\",\"elegibilidade\":\"apto\"}
]'::jsonb, '90000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-00000000000a');")"
[[ "$created" == *':2:true' ]] || fail "create_draft nao criou os 2 destinatarios aptos: $created"
new_dispatch="${created%%:*}"
[[ "$(psql_test -Atqc "SELECT count(*) FROM public.multiplix_recipients WHERE dispatch_id='$new_dispatch'")" == '2' ]] \
  || fail 'destinatario marcado como nao-apto entrou na fila'
[[ "$(psql_test -Atqc "SELECT total_recipients FROM public.multiplix_dispatches WHERE id='$new_dispatch'")" == '2' ]] \
  || fail 'total_recipients divergiu dos destinatarios inseridos'
[[ "$(psql_test -Atqc "SELECT count(*) FROM public.multiplix_recipients WHERE dispatch_id='$new_dispatch' AND destino_e164 IS NULL")" == '0' ]] \
  || fail 'linha sem destino entrou na fila'

again="$(psql_test -Atqc "$service_session SELECT dispatch_id || ':' || created FROM public.multiplix_create_draft('Disparo novo', 'Oi {{empresa}}', '[{\"company_id\":\"50000000-0000-0000-0000-000000000011\",\"destino_e164\":\"+5511990000011\",\"elegibilidade\":\"apto\"}]'::jsonb, '90000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-00000000000a');")"
[[ "$again" == "$new_dispatch:false" ]] || fail "create_draft nao foi idempotente: $again"
[[ "$(psql_test -Atqc "SELECT count(*) FROM public.multiplix_dispatches WHERE client_request_id='90000000-0000-0000-0000-000000000001'")" == '1' ]] \
  || fail 'dois POSTs iguais criaram dois disparos'
over_limit="$(psql_test -v VERBOSITY=verbose -c "$service_session SELECT public.multiplix_create_draft('Acima do teto', 'Oi', jsonb_agg(jsonb_build_object('company_id', gen_random_uuid()::text, 'elegibilidade', 'apto')), '90000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-00000000000a') FROM generate_series(1,201);" 2>&1 || true)"
[[ "$over_limit" == *multiplix_over_recipient_limit* ]] || fail 'teto de 200 destinatarios nao foi aplicado (F17)'
[[ "$(psql_test -Atqc "SELECT count(*) FROM public.multiplix_dispatches WHERE client_request_id='90000000-0000-0000-0000-000000000002'")" == '0' ]] \
  || fail 'disparo acima do teto foi criado parcialmente'
no_eligible="$(psql_test -v VERBOSITY=verbose -c "$service_session SELECT public.multiplix_create_draft('Sem aptos', 'Oi', '[{\"company_id\":\"50000000-0000-0000-0000-000000000014\",\"elegibilidade\":\"fora_do_escopo\"}]'::jsonb, '90000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-00000000000a');" 2>&1 || true)"
[[ "$no_eligible" == *multiplix_draft_no_eligible_recipients* ]] || fail 'disparo sem destinatario apto foi aceito'
staff_create="$(psql_test -v VERBOSITY=verbose -c "$admin_a SELECT public.multiplix_create_draft('Pelo navegador', 'Oi', '[]'::jsonb, '90000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-00000000000a');" 2>&1 || true)"
[[ "$staff_create" == *permission*denied* || "$staff_create" == *service_role_required* ]] \
  || fail 'staff chamou a RPC de criacao sem a service key'

# ── F11b/F12/F13/F14: fila ────────────────────────────────────────────────────
psql_test >/dev/null <<'SQL'
SET request.jwt.claim.role='service_role';
INSERT INTO public.multiplix_recipients (id, dispatch_id, company_id, destino_e164, status, retry_after, created_at)
VALUES
  ('40000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000002', '+5511990000002', 'pending', statement_timestamp() + interval '10 minutes', statement_timestamp() + interval '1 second'),
  ('40000000-0000-0000-0000-000000000003', '30000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000003', '+5511990000003', 'pending', NULL, statement_timestamp() + interval '2 seconds'),
  ('40000000-0000-0000-0000-000000000004', '30000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000004', '+5511990000004', 'pending', NULL, statement_timestamp() + interval '3 seconds');
SQL
[[ "$(psql_test -Atqc "$service_session SELECT count(*) FROM public.claim_multiplix_recipient('30000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000002','worker-a',90);")" == '0' ]] \
  || fail 'claim pegou item em backoff (F12)'
# Controle positivo: o MESMO item, com o backoff vencido, e reivindicavel. Sem
# isto a assercao acima passaria por qualquer outro motivo (dispatch fora de
# 'sending', id errado) sem provar nada sobre o retry_after.
psql_test >/dev/null <<'SQL'
SET request.jwt.claim.role='service_role';
UPDATE public.multiplix_recipients
   SET retry_after = statement_timestamp() - interval '1 second'
 WHERE id = '40000000-0000-0000-0000-000000000002';
SQL
[[ -n "$(psql_test -Atqc "$service_session SELECT claim_token FROM public.claim_multiplix_recipient('30000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000002','worker-a',90);")" ]] \
  || fail 'item com backoff vencido segue inelegivel: a recusa anterior nao provava o retry_after (F12)'
claim_token="$(psql_test -Atqc "$service_session SELECT claim_token FROM public.claim_multiplix_recipient('30000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000003','worker-b',90);")"
[[ -n "$claim_token" ]] || fail 'claim nao pegou item pendente elegivel'
psql_test >/dev/null <<SQL
$service_session
SELECT public.mark_multiplix_recipient_dispatch_started('40000000-0000-0000-0000-000000000003','$claim_token'::uuid);
UPDATE public.multiplix_recipients
   SET delivery_claim_expires_at = statement_timestamp() - interval '1 second'
 WHERE id = '40000000-0000-0000-0000-000000000003';
SQL
[[ "$(psql_test -Atqc "$service_session SELECT public.sweep_multiplix_stuck_recipients(500);")" == '1' ]] \
  || fail 'sweeper nao fechou o item preso (F11b)'
[[ "$(psql_test -Atqc "SELECT status || ':' || (delivery_claim_token IS NULL)::text FROM public.multiplix_recipients WHERE id='40000000-0000-0000-0000-000000000003'")" == 'outcome_unknown:true' ]] \
  || fail 'item preso nao virou outcome_unknown'
[[ "$(psql_test -Atqc "SELECT outcome_unknown_count FROM public.multiplix_dispatches WHERE id='30000000-0000-0000-0000-000000000001'")" == '1' ]] \
  || fail 'sweeper nao contabilizou o item no disparo'
[[ "$(psql_test -Atqc "$service_session SELECT count(*) FROM public.claim_multiplix_recipient('30000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000003','worker-c',90);")" == '0' ]] \
  || fail 'item com POST feito voltou para a fila (risco de reenvio)'

[[ "$(psql_test -Atqc "$service_session SELECT current_status FROM public.transition_multiplix_dispatch('30000000-0000-0000-0000-000000000001','cancel');")" == 'cancelled' ]] \
  || fail 'cancel nao transicionou o disparo'
[[ "$(psql_test -Atqc "SELECT count(*) FROM public.multiplix_recipients WHERE dispatch_id='30000000-0000-0000-0000-000000000001' AND status IN ('pending','sending')")" == '0' ]] \
  || fail 'cancel deixou destinatario pendente na fila (F14)'
[[ "$(psql_test -Atqc "SELECT status FROM public.multiplix_recipients WHERE id='40000000-0000-0000-0000-000000000003'")" == 'outcome_unknown' ]] \
  || fail 'cancel mexeu em item que ja tinha ido ao provedor'

psql_test >/dev/null <<'SQL'
SET request.jwt.claim.role='service_role';
INSERT INTO public.multiplix_dispatches (id, name, message_template, status, created_by, total_recipients)
VALUES ('30000000-0000-0000-0000-000000000010', 'Parcial', 'Oi', 'sending', '10000000-0000-0000-0000-00000000000a', 2);
INSERT INTO public.multiplix_recipients (id, dispatch_id, company_id, status, sent_at)
VALUES
  ('40000000-0000-0000-0000-000000000010', '30000000-0000-0000-0000-000000000010', '50000000-0000-0000-0000-000000000010', 'sent', statement_timestamp()),
  ('40000000-0000-0000-0000-000000000011', '30000000-0000-0000-0000-000000000010', '50000000-0000-0000-0000-000000000011', 'failed', NULL);
UPDATE public.multiplix_dispatches SET sent_count=1, failed_count=1 WHERE id='30000000-0000-0000-0000-000000000010';
SQL
[[ "$(psql_test -Atqc "$service_session SELECT public.complete_multiplix_dispatch_if_drained('30000000-0000-0000-0000-000000000010');")" == 't' ]] \
  || fail 'disparo drenado nao foi encerrado'
[[ "$(psql_test -Atqc "SELECT status FROM public.multiplix_dispatches WHERE id='30000000-0000-0000-0000-000000000010'")" == 'completed_with_failures' ]] \
  || fail 'disparo com falha foi marcado como sucesso (F13)'

# ── F10/F17: scheduler promove agendado, retoma janela e limita por conexao ────
psql_test >/dev/null <<'SQL'
SET request.jwt.claim.role='service_role';
INSERT INTO public.multiplix_dispatches (id, name, message_template, status, created_by, total_recipients, scheduled_at, whatsapp_connection_id)
VALUES ('30000000-0000-0000-0000-000000000020', 'Agendado', 'Oi', 'scheduled', '10000000-0000-0000-0000-00000000000a', 1, statement_timestamp() - interval '1 minute', '70000000-0000-0000-0000-000000000001');
INSERT INTO public.multiplix_recipients (id, dispatch_id, company_id, status)
VALUES ('40000000-0000-0000-0000-000000000020', '30000000-0000-0000-0000-000000000020', '50000000-0000-0000-0000-000000000020', 'pending');
INSERT INTO public.multiplix_dispatches (id, name, message_template, status, created_by, total_recipients, pause_reason, send_window_start, send_window_end)
VALUES
  ('30000000-0000-0000-0000-000000000021', 'Janela aberta', 'Oi', 'paused', '10000000-0000-0000-0000-00000000000a', 1, 'outside_window', NULL, NULL),
  ('30000000-0000-0000-0000-000000000022', 'Janela fechada', 'Oi', 'paused', '10000000-0000-0000-0000-00000000000a', 1, 'outside_window', '00:00', '00:00');
INSERT INTO public.multiplix_recipients (id, dispatch_id, company_id, status)
VALUES
  ('40000000-0000-0000-0000-000000000021', '30000000-0000-0000-0000-000000000021', '50000000-0000-0000-0000-000000000021', 'pending'),
  ('40000000-0000-0000-0000-000000000022', '30000000-0000-0000-0000-000000000022', '50000000-0000-0000-0000-000000000022', 'pending');
SQL
psql_test >/dev/null <<'SQL'
SET request.jwt.claim.role='service_role';
SELECT public.trigger_pending_multiplix_dispatches();
SQL
[[ "$(psql_test -Atqc "SELECT status FROM public.multiplix_dispatches WHERE id='30000000-0000-0000-0000-000000000020'")" == 'sending' ]] \
  || fail 'disparo agendado nao foi promovido pelo cron (F10a)'
# F10b + F17b: a retomada por janela exige que NAO haja outro dispatch enviando —
# o candidato ...021 e de conexao NULL, e NULL e coringa nos DOIS sentidos (o worker
# resolve NULL para "primeira conexao conectada", que pode ser justamente a conexao
# do ...020, promovido no mesmo tick pelo F10a). Encerrando o ...020, a retomada por
# janela acontece no tick seguinte — que e o que a F10b quer provar.
psql_test >/dev/null <<'SQL'
SET request.jwt.claim.role='service_role';
UPDATE public.multiplix_dispatches SET status='cancelled' WHERE id='30000000-0000-0000-0000-000000000020';
SQL
psql_test >/dev/null <<'SQL'
SET request.jwt.claim.role='service_role';
SELECT public.trigger_pending_multiplix_dispatches();
SQL
[[ "$(psql_test -Atqc "SELECT status FROM public.multiplix_dispatches WHERE id='30000000-0000-0000-0000-000000000021'")" == 'sending' ]] \
  || fail 'disparo pausado por janela nao retomou com a janela aberta e nenhum envio em curso (F10b/F17b)'
[[ "$(psql_test -Atqc "SELECT status FROM public.multiplix_dispatches WHERE id='30000000-0000-0000-0000-000000000022'")" == 'paused' ]] \
  || fail 'disparo retomou com a janela fechada'
[[ "$(psql_test -Atqc "SELECT count(DISTINCT url) FROM net.requests")" == '1' ]] \
  || fail 'cron nao chamou a edge pela URL do vault (F17)'
[[ "$(psql_test -Atqc "SELECT count(*) FROM net.requests r WHERE r.url IS DISTINCT FROM (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='multiplix_send_url')")" == '0' ]] \
  || fail 'cron nao usou a rota do vault (URL literal no SQL)'
[[ "$(psql_test -Atqc "SELECT count(*) FROM (SELECT d.whatsapp_connection_id FROM net.requests r JOIN public.multiplix_dispatches d ON d.id = (r.body->>'dispatchId')::uuid WHERE d.whatsapp_connection_id IS NOT NULL GROUP BY d.whatsapp_connection_id HAVING count(*) > 1) dup")" == '0' ]] \
  || fail 'cron disparou mais de um dispatch por conexao no mesmo tick (F17)'
usage="$(psql_test -Atqc "$service_session WITH uso AS (SELECT public.multiplix_connection_daily_usage('70000000-0000-0000-0000-000000000001') AS j) SELECT (j ->> 'limit') || ':' || (j ->> 'sent') || ':' || (j ->> 'remaining') FROM uso;")"
[[ "$usage" == '500:0:500' ]] || fail "leitura de consumo diario divergiu: $usage"
[[ "$(psql_test -Atqc "SELECT public.multiplix_dispatch_window_is_open('30000000-0000-0000-0000-000000000021')")" == 't' ]] \
  || fail 'helper de janela nao abriu com send_window nulo'
[[ "$(psql_test -Atqc "SELECT public.multiplix_dispatch_window_is_open('30000000-0000-0000-0000-000000000022')")" == 'f' ]] \
  || fail 'helper de janela abriu com start = end'

# ── F17b: no maximo UM 'sending' por conexao por tick (o fan-out ja deduplicava
# o POST; o que a F17b fecha e o ESTADO — duas linhas 'sending' na mesma conexao
# significam duas edges na MESMA instancia do WhatsApp). A prova e do guard de
# estado: com dois agendados vencidos na mesma conexao, so o primeiro promove.
c1='70000000-0000-0000-0000-0000000000c1'
# O guard trata QUALQUER 'sending' como bloqueio (inclusive os que os casos
# anteriores deixaram, e.g. 020/021): a suite parte de estado limpo.
psql_test >/dev/null <<'SQL'
SET request.jwt.claim.role='service_role';
UPDATE public.multiplix_dispatches SET status='cancelled' WHERE status='sending';
INSERT INTO public.multiplix_dispatches (id, name, message_template, status, created_by, total_recipients, scheduled_at, whatsapp_connection_id) VALUES
  ('30000000-0000-0000-0000-0000000000b1', 'F17b S1', 'Oi', 'scheduled', '10000000-0000-0000-0000-00000000000a', 1, statement_timestamp() - interval '2 minutes', '70000000-0000-0000-0000-0000000000c1'),
  ('30000000-0000-0000-0000-0000000000b2', 'F17b S2', 'Oi', 'scheduled', '10000000-0000-0000-0000-00000000000a', 1, statement_timestamp() - interval '1 minute', '70000000-0000-0000-0000-0000000000c1');
INSERT INTO public.multiplix_recipients (id, dispatch_id, company_id, status) VALUES
  ('40000000-0000-0000-0000-0000000000b1', '30000000-0000-0000-0000-0000000000b1', '50000000-0000-0000-0000-0000000000b1', 'pending'),
  ('40000000-0000-0000-0000-0000000000b2', '30000000-0000-0000-0000-0000000000b2', '50000000-0000-0000-0000-0000000000b2', 'pending');
SQL
psql_test >/dev/null <<'SQL'
SET request.jwt.claim.role='service_role';
SELECT public.trigger_pending_multiplix_dispatches();
SQL
[[ "$(psql_test -Atqc "SELECT count(*) FROM public.multiplix_dispatches WHERE whatsapp_connection_id='$c1' AND status='sending'")" == '1' ]] \
  || fail 'F17b: dois agendados vencidos na MESMA conexao viraram dois sending no mesmo tick'
[[ "$(psql_test -Atqc "SELECT count(*) FROM public.multiplix_dispatches WHERE whatsapp_connection_id='$c1' AND status='scheduled'")" == '1' ]] \
  || fail 'F17b: o segundo agendado da mesma conexao nao ficou em scheduled'
[[ "$(psql_test -Atqc "SELECT status FROM public.multiplix_dispatches WHERE id='30000000-0000-0000-0000-0000000000b1'")" == 'sending' ]] \
  || fail 'F17b: o agendado mais antigo (primeiro da fila) nao foi o promovido'
[[ "$(psql_test -Atqc "SELECT status FROM public.multiplix_dispatches WHERE id='30000000-0000-0000-0000-0000000000b2'")" == 'scheduled' ]] \
  || fail 'F17b: o segundo agendado promoveu a despeito do sending na mesma conexao'

# F17b — NULL e coringa de proposito: o composer nao oferece escolha de conexao
# (whatsapp_connection_id nasce NULL) e o worker resolve NULL para "primeira
# conexao conectada", que pode ser a conexao de OUTRO dispatch. Um 'sending' de
# conexao NULL tem de bloquear QUALQUER candidato; e nenhum candidato entra
# enquanto existir esse 'sending' NULL.
psql_test >/dev/null <<'SQL'
SET request.jwt.claim.role='service_role';
UPDATE public.multiplix_dispatches SET status='cancelled' WHERE id='30000000-0000-0000-0000-0000000000b2';
INSERT INTO public.multiplix_dispatches (id, name, message_template, status, created_by, total_recipients, scheduled_at, whatsapp_connection_id) VALUES
  ('30000000-0000-0000-0000-0000000000b3', 'F17b sending NULL', 'Oi', 'sending', '10000000-0000-0000-0000-00000000000a', 1, NULL, NULL),
  ('30000000-0000-0000-0000-0000000000b5', 'F17b cand C2', 'Oi', 'scheduled', '10000000-0000-0000-0000-00000000000a', 1, statement_timestamp() - interval '3 minutes', '70000000-0000-0000-0000-0000000000c2'),
  ('30000000-0000-0000-0000-0000000000b4', 'F17b cand NULL', 'Oi', 'scheduled', '10000000-0000-0000-0000-00000000000a', 1, statement_timestamp() - interval '1 minute', NULL);
INSERT INTO public.multiplix_recipients (id, dispatch_id, company_id, status) VALUES
  ('40000000-0000-0000-0000-0000000000b3', '30000000-0000-0000-0000-0000000000b3', '50000000-0000-0000-0000-0000000000b3', 'pending'),
  ('40000000-0000-0000-0000-0000000000b4', '30000000-0000-0000-0000-0000000000b4', '50000000-0000-0000-0000-0000000000b4', 'pending'),
  ('40000000-0000-0000-0000-0000000000b5', '30000000-0000-0000-0000-0000000000b5', '50000000-0000-0000-0000-0000000000b5', 'pending');
SQL
psql_test >/dev/null <<'SQL'
SET request.jwt.claim.role='service_role';
SELECT public.trigger_pending_multiplix_dispatches();
SQL
[[ "$(psql_test -Atqc "SELECT status FROM public.multiplix_dispatches WHERE id='30000000-0000-0000-0000-0000000000b4'")" == 'scheduled' ]] \
  || fail 'F17b: candidato de conexao NULL entrou havendo um sending de conexao NULL ativo (NULL nao foi coringa)'
# O candidato de C2 NAO pode ser explicado pela igualdade de conexao (C2 <> C1 do
# dispatch b1 que tambem esta 'sending'): so a clausula do NULL o bloqueia.
[[ "$(psql_test -Atqc "SELECT status FROM public.multiplix_dispatches WHERE id='30000000-0000-0000-0000-0000000000b5'")" == 'scheduled' ]] \
  || fail 'F17b: candidato em conexao C2 entrou havendo um sending de conexao NULL (o NULL nao foi wildcard)'
# Controle positivo: removido o sending NULL, o candidato de C2 promove — sem isto
# a recusa anterior poderia ser por qualquer outro motivo do candidato.
psql_test >/dev/null <<'SQL'
SET request.jwt.claim.role='service_role';
UPDATE public.multiplix_dispatches SET status='cancelled' WHERE id='30000000-0000-0000-0000-0000000000b3';
SQL
psql_test >/dev/null <<'SQL'
SET request.jwt.claim.role='service_role';
SELECT public.trigger_pending_multiplix_dispatches();
SQL
[[ "$(psql_test -Atqc "SELECT status FROM public.multiplix_dispatches WHERE id='30000000-0000-0000-0000-0000000000b5'")" == 'sending' ]] \
  || fail 'F17b: candidato de C2 nao promoveu depois de removido o sending NULL (a recusa anterior nao provava o wildcard)'

# F17b — o coringa tem de valer nos DOIS sentidos. Achado do agente de teste em
# 01/10/2026: a primeira versao da migration comparava com IS NOT DISTINCT FROM, o
# que bloqueia um candidato NULL apenas quando existe um 'sending' tambem NULL. Um
# candidato NULL contra um 'sending' de conexao CONCRETA passava — e o worker
# resolve NULL para "primeira conexao conectada", que pode ser justamente essa
# conexao. Aqui ha dois 'sending' concretos (b1 em C1, b5 em C2): o candidato NULL
# vencido nao pode promover.
psql_test >/dev/null <<'SQL'
SET request.jwt.claim.role='service_role';
INSERT INTO public.multiplix_dispatches (id, name, message_template, status, created_by, total_recipients, scheduled_at, whatsapp_connection_id) VALUES
  ('30000000-0000-0000-0000-0000000000b6', 'F17b cand NULL vs concretos', 'Oi', 'scheduled', '10000000-0000-0000-0000-00000000000a', 1, statement_timestamp() - interval '4 minutes', NULL);
INSERT INTO public.multiplix_recipients (id, dispatch_id, company_id, status) VALUES
  ('40000000-0000-0000-0000-0000000000b6', '30000000-0000-0000-0000-0000000000b6', '50000000-0000-0000-0000-0000000000b6', 'pending');
SQL
psql_test >/dev/null <<'SQL'
SET request.jwt.claim.role='service_role';
SELECT public.trigger_pending_multiplix_dispatches();
SQL
[[ "$(psql_test -Atqc "SELECT count(*) FROM public.multiplix_dispatches WHERE status='sending'")" == '2' ]] \
  || fail 'F17b: um candidato de conexao NULL promoveu havendo sending de conexao concreta (guard assimetrico)'
[[ "$(psql_test -Atqc "SELECT status FROM public.multiplix_dispatches WHERE id='30000000-0000-0000-0000-0000000000b6'")" == 'scheduled' ]] \
  || fail 'F17b: candidato de conexao NULL contra sending concreto nao ficou em scheduled'

# Encerra os candidatos vencidos que sobraram (b4 e b6): eles seguem com scheduled_at
# no passado e seriam promovidos no primeiro tick depois que a base ficasse sem
# 'sending' — virando um 'sending' NULL que, pelo coringa dos dois sentidos, bloquearia
# os casos de cota/janela seguintes. Estado limpo entre blocos.
psql_test >/dev/null <<'SQL'
SET request.jwt.claim.role='service_role';
UPDATE public.multiplix_dispatches SET status='cancelled'
 WHERE id IN ('30000000-0000-0000-0000-0000000000b4', '30000000-0000-0000-0000-0000000000b6');
SQL

# ── F17c: pausa por daily_limit volta quando ha cota ──────────────────────────
# Antes so pause_reason='outside_window' retomava. A pausa por cota (auto-pausa
# do worker) ficava parada para SEMPRE, mesmo com a cota virando no dia seguinte.
# A retomada usa a MESMA medicao do worker (multiplix_connection_daily_usage).
cd_open='70000000-0000-0000-0000-0000000000d1'
cd_zero='70000000-0000-0000-0000-0000000000d2'
psql_test >/dev/null <<'SQL'
SET request.jwt.claim.role='service_role';
UPDATE public.multiplix_dispatches SET status='cancelled' WHERE status='sending';
INSERT INTO public.multiplix_dispatches (id, name, message_template, status, created_by, total_recipients, pause_reason, whatsapp_connection_id, send_window_start, send_window_end) VALUES
  ('30000000-0000-0000-0000-0000000000e1', 'F17c cota disponivel', 'Oi', 'paused', '10000000-0000-0000-0000-00000000000a', 1, 'daily_limit', '70000000-0000-0000-0000-0000000000d1', NULL, NULL),
  ('30000000-0000-0000-0000-0000000000e2', 'F17c cota esgotada', 'Oi', 'paused', '10000000-0000-0000-0000-00000000000a', 1, 'daily_limit', '70000000-0000-0000-0000-0000000000d2', NULL, NULL),
  ('30000000-0000-0000-0000-0000000000e3', 'F17c janela fechada', 'Oi', 'paused', '10000000-0000-0000-0000-00000000000a', 1, 'daily_limit', '70000000-0000-0000-0000-0000000000d3', '00:00', '00:00');
INSERT INTO public.multiplix_recipients (id, dispatch_id, company_id, status) VALUES
  ('40000000-0000-0000-0000-0000000000e1', '30000000-0000-0000-0000-0000000000e1', '50000000-0000-0000-0000-0000000000e1', 'pending'),
  ('40000000-0000-0000-0000-0000000000e2', '30000000-0000-0000-0000-0000000000e2', '50000000-0000-0000-0000-0000000000e2', 'pending'),
  ('40000000-0000-0000-0000-0000000000e3', '30000000-0000-0000-0000-0000000000e3', '50000000-0000-0000-0000-0000000000e3', 'pending');
-- Esgota a cota de cd_zero: 500 enviados hoje com limit=500 -> remaining 0.
INSERT INTO public.multiplix_recipients (dispatch_id, company_id, status, sent_at)
SELECT '30000000-0000-0000-0000-0000000000e2', gen_random_uuid(), 'sent', statement_timestamp()
  FROM generate_series(1, 500);
SQL
cota_zero="$(psql_test -Atqc "$service_session WITH u AS (SELECT public.multiplix_connection_daily_usage('$cd_zero') AS j) SELECT (j ->> 'limit') || ':' || (j ->> 'sent') || ':' || (j ->> 'remaining') FROM u;")"
[[ "$cota_zero" == '500:500:0' ]] || fail "F17c: pre-condicao de cota esgotada divergiu: $cota_zero"
cota_open="$(psql_test -Atqc "$service_session WITH u AS (SELECT public.multiplix_connection_daily_usage('$cd_open') AS j) SELECT (j ->> 'limit') || ':' || (j ->> 'sent') || ':' || (j ->> 'remaining') FROM u;")"
[[ "$cota_open" == '500:0:500' ]] || fail "F17c: pre-condicao de cota disponivel divergiu: $cota_open"
psql_test >/dev/null <<'SQL'
SET request.jwt.claim.role='service_role';
SELECT public.trigger_pending_multiplix_dispatches();
SQL
[[ "$(psql_test -Atqc "SELECT status FROM public.multiplix_dispatches WHERE id='30000000-0000-0000-0000-0000000000e1'")" == 'sending' ]] \
  || fail 'F17c: pausa por daily_limit nao retomou apesar de remaining > 0 e janela aberta'
[[ "$(psql_test -Atqc "SELECT status || ':' || coalesce(pause_reason, 'null') FROM public.multiplix_dispatches WHERE id='30000000-0000-0000-0000-0000000000e2'")" == 'paused:daily_limit' ]] \
  || fail 'F17c: pausa por daily_limit retomou (ou perdeu o motivo) com a cota esgotada — controle negativo'
[[ "$(psql_test -Atqc "SELECT status FROM public.multiplix_dispatches WHERE id='30000000-0000-0000-0000-0000000000e3'")" == 'paused' ]] \
  || fail 'F17c: pausa por daily_limit retomou com a janela fechada (start = end)'

# Higiene de estado: o guard da F17b bloqueia retomada/promocao enquanto existir
# QUALQUER 'sending' (NULL e coringa nos dois sentidos), entao os casos de janela
# que vem depois precisam de uma base sem 'sending' — mesmo cuidado que os blocos
# da F17b ja tomam ao comecar. Sem isto o caso F10b (pre-existente) falha por
# contaminacao de estado, nao por regressao.
psql_test >/dev/null <<'SQL'
SET request.jwt.claim.role='service_role';
UPDATE public.multiplix_dispatches SET status='cancelled' WHERE status='sending';
SQL

# ── F06: permissao nova criada e atribuida a admin ────────────────────────────
[[ "$(psql_test -Atqc "SELECT count(*) FROM public.permissions WHERE name='multiplix.dispatch.manage_all'")" == '1' ]] \
  || fail 'permissao multiplix.dispatch.manage_all nao foi criada'
[[ "$(psql_test -Atqc "SELECT public.user_has_permission('20000000-0000-0000-0000-00000000000a','multiplix.dispatch.manage_all')")" == 't' ]] \
  || fail 'admin nao recebeu multiplix.dispatch.manage_all'
[[ "$(psql_test -Atqc "SELECT public.user_has_permission('20000000-0000-0000-0000-00000000000b','multiplix.dispatch.manage_all')")" == 'f' ]] \
  || fail 'supervisor recebeu poder sobre disparo alheio'

# ── #1267: guards FAIL-OPEN por GUC — prova antes/depois no MESMO container ────
# Sessao com o papel `authenticated` e o `sub` do admin (para a RLS de UPDATE passar), mas SEM a
# claim `role`: e o estado em que `auth.role()` e NULL. Antes, o guard fazia COALESCE(..., '') -> ''
# e `'' <> 'authenticated'` era verdadeiro: a guarda DESAPARECIA e o staff escrevia por cima do motor.
sem_claim="SET ROLE authenticated; SET request.jwt.claim.sub='20000000-0000-0000-0000-00000000000a';"
dispatch_alvo='30000000-0000-0000-0000-000000000002'

# (1) ESTADO ANTERIOR: reaplica a migration do guard original para voltar ao predicado fail-open.
migration "20260929590000_multiplix_mutability_guard.sql"
psql_test -Atqc "UPDATE public.multiplix_dispatches SET status='draft' WHERE id='$dispatch_alvo';" >/dev/null
vazou="$(psql_test -Atqc "$sem_claim UPDATE public.multiplix_dispatches SET status='sending' WHERE id='$dispatch_alvo' RETURNING 1;" 2>&1 || true)"
[[ "$vazou" == '1' ]] || fail "#1267: o defeito nao reproduziu (a escrita sem claim deveria passar antes do fix): $vazou"
[[ "$(psql_test -Atqc "SELECT status FROM public.multiplix_dispatches WHERE id='$dispatch_alvo';")" == 'sending' ]] \
  || fail '#1267: o defeito nao reproduziu (o status nao mudou para sending)'

# (2) ESTADO CORRIGIDO: aplica a migration desta tarefa e repete exatamente a mesma escrita.
migration "20260930300000_multiplix_guards_fail_closed.sql"
psql_test -Atqc "UPDATE public.multiplix_dispatches SET status='draft' WHERE id='$dispatch_alvo';" >/dev/null
fechou="$(psql_test -Atqc "$sem_claim UPDATE public.multiplix_dispatches SET status='sending' WHERE id='$dispatch_alvo' RETURNING 1;" 2>&1 || true)"
[[ "$fechou" != '1' ]] || fail '#1267: a escrita sem claim continuou passando (guard ainda fail-open)'
[[ "$fechou" == *multiplix_guard_auth_role_undefined* ]] || fail "#1267: esperava multiplix_guard_auth_role_undefined, veio: $fechou"
[[ "$(psql_test -Atqc "SELECT status FROM public.multiplix_dispatches WHERE id='$dispatch_alvo';")" == 'draft' ]] \
  || fail '#1267: a linha mudou de estado mesmo com o guard fechado'

# (3) Caminhos DISPENSADOS seguem livres: o dono postgres (migrations, backfill, TODOS os jobs do
# pg_cron de hoje) e o service_role (worker e RPCs do motor).
[[ "$(psql_test -Atqc "UPDATE public.multiplix_dispatches SET status='scheduled' WHERE id='$dispatch_alvo' RETURNING 1;" 2>&1 || true)" == '1' ]] \
  || fail '#1267: postgres (dono/migrations/cron) perdeu a escrita livre'
[[ "$(psql_test -Atqc "SET ROLE service_role; UPDATE public.multiplix_dispatches SET status='draft' WHERE id='$dispatch_alvo' RETURNING 1;" 2>&1 || true)" == '1' ]] \
  || fail '#1267: service_role (worker/RPCs do motor) perdeu a escrita livre'

# (4) Regressao: o staff COM a claim continua bloqueado como antes (o check do F05 acima).
staff_com_claim="$(psql_test -v VERBOSITY=verbose -c "$admin_a UPDATE public.multiplix_dispatches SET status='sending' WHERE id='$dispatch_alvo';" 2>&1 || true)"
[[ "$staff_com_claim" == *multiplix_dispatch_transition_denied* ]] \
  || fail '#1267: o guard deixou de valer para o staff com claim (regressao do F05)'
[[ "$(psql_test -Atqc "SELECT status FROM public.multiplix_dispatches WHERE id='$dispatch_alvo';")" == 'draft' ]] \
  || fail '#1267: status final inesperado'

printf 'PASS: Multiplix hardening — anon sem acesso, FORCE RLS, policies TO authenticated no replay limpo, guarda de mutabilidade (fail-closed por papel real desde #1267), criacao transacional idempotente com teto, fila (retry_after/sweeper/cancel/parcial), escopo de leitura (agent sem disparo lê zero; dono não-staff só o próprio) e scheduler por janela, cota e ritmo por conexao (F17b/F17c)\n'
