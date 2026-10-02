#!/usr/bin/env bash
# F57 do Bloco F (docs/multiplix/PLANO_FINALIZACAO_MULTIPLIX_100_ETAPAS_2026-09-29.md).
#
# Prova, em PostgreSQL 17 descartavel, o contrato da FILA POR ITEM do Multiplix
# (multiplix_delivery_items + as RPCs de claim/complete/reschedule/sweep do F32b):
#   1. dois workers nao pegam o mesmo item;
#   2. lease expira e o item volta, e token vencido nao completa;
#   3. pausa: item em voo termina, pending nao avanca;
#   4. cancel encerra pendentes sem tocar no que ja foi ao provedor;
#   5. timeout -> outcome_unknown SEM reenvio (a simulacao nao duplica).
#
# Herda o harness e o fixture de infraestrutura do multiplix-rls.test.sh (mesma infra
# Supabase: auth, vault, cron, pg_net) e acrescenta as migrations do modelo v2
# (F30 enums, F31 colunas, F32a tabela de itens, F32b RPCs da fila), que o harness
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
  [ -f "$file" ] || fail "migration ausente: $1"
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
if [ -n "$REVOKE_MIGRATION" ]; then
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
# F57: as migrations do modelo v2 (Bloco C/D) que o harness irmao nao aplica. Entram
# DEPOIS do bloco do revoke acima de proposito: e a 20260929850000 (revoke das escritas
# de destinatario) que dropa a policy 'Users can insert recipients into own dispatches',
# e a f30 altera o TIPO da coluna status de multiplix_recipients — com a policy viva, o
# ALTER falha com 'cannot alter type of a column used in a policy definition'.
# A F31 acrescenta FK real em multiplix_dispatches.whatsapp_connection_id, e a f32b
# referencia a conexao. Em producao essa tabela existe (e do modulo de conexoes); o
# fixture deste harness nao a criava porque o modelo antigo guardava o id solto. Minimo
# suficiente: id + status, que e o que as migrations desta tarefa consultam.
psql_test >/dev/null <<'SQL'
-- Em Supabase o pgcrypto vive no schema 'extensions' (a f32a chama extensions.digest
-- para a idempotency_key). O harness irmao nao precisava disso porque so mexia no
-- modelo antigo.
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

CREATE TABLE IF NOT EXISTS public.whatsapp_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  status text NOT NULL DEFAULT 'connected',
  instance_id text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
INSERT INTO public.whatsapp_connections (id, status, instance_id)
VALUES ('70000000-0000-0000-0000-000000000001', 'connected', 'inst-f57')
ON CONFLICT (id) DO NOTHING;
SQL

migration "20261001201230_f30_multiplix_enums_modelo_v2.sql"
migration "20261001211230_f31_multiplix_dispatch_recipient_columns.sql"
migration "20261001221230_f32a_multiplix_delivery_items_table.sql"
migration "20261001231230_f32b_multiplix_item_queue_rpcs.sql"
# F59: conserta transition_multiplix_dispatch, que a f30 deixou quebrada ao converter
# status para enum (42804). Sem ela, os casos 3 e 4 deste teste nao tem como passar — e
# e justamente o teste que expoe o defeito.
migration "20261002521230_f59_transition_dispatch_enum_cast.sql"


# ── F57: fila POR ITEM (multiplix_delivery_items) ──────────────────────────────
# Fixture proprio: um dispatch NOVO em 'sending' com conexao, dois blocos com id
# conhecido e dois destinatarios. Nao reaproveita o dispatch 3000...0001 porque os
# testes de destinatario acima o deixam cancelado — e um dispatch cancelado nao
# exercita o claim.
psql_test >/dev/null <<'SQL'
SET request.jwt.claim.role='service_role';
INSERT INTO public.multiplix_dispatches (id, name, message_template, status, created_by, total_recipients, whatsapp_connection_id)
VALUES ('30000000-0000-0000-0000-000000000020', 'Fila por item', 'Oi {{empresa}}', 'sending',
        '10000000-0000-0000-0000-00000000000a', 2, '70000000-0000-0000-0000-000000000001');
INSERT INTO public.multiplix_blocks (id, dispatch_id, block_order, block_type, template_text) VALUES
  ('60000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000020', 0, 'text', 'bloco 1'),
  ('60000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000020', 1, 'text', 'bloco 2');
INSERT INTO public.multiplix_recipients (id, dispatch_id, company_id, destino_e164, status, created_at) VALUES
  -- 'pending' de proposito: o alvo deste teste e a fila de ITENS. Com 'sending' o
  -- CHECK multiplix_recipients_delivery_claim_state (f30) exigiria as 4 colunas de
  -- claim preenchidas — quem reivindica e o ITEM, nao o destinatario.
  ('40000000-0000-0000-0000-000000000021', '30000000-0000-0000-0000-000000000020', '50000000-0000-0000-0000-000000000021', '+5511900000021', 'pending', statement_timestamp()),
  ('40000000-0000-0000-0000-000000000022', '30000000-0000-0000-0000-000000000020', '50000000-0000-0000-0000-000000000022', '+5511900000022', 'pending', statement_timestamp());
INSERT INTO public.multiplix_delivery_items (id, dispatch_id, recipient_id, block_id, dispatch_version, status, external_id) VALUES
  ('80000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000020', '40000000-0000-0000-0000-000000000021', '60000000-0000-0000-0000-000000000001', 1, 'pending', 'ext-fila-1'),
  ('80000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000020', '40000000-0000-0000-0000-000000000022', '60000000-0000-0000-0000-000000000001', 1, 'pending', 'ext-fila-2');
SQL

item1='80000000-0000-0000-0000-000000000001'
item2='80000000-0000-0000-0000-000000000002'
disp='30000000-0000-0000-0000-000000000020'
is_uuid='^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'

# (1) Dois workers NAO pegam o mesmo item.
token_a="$(psql_test -Atqc "$service_session SELECT claim_token FROM public.claim_multiplix_item('$disp','$item1','worker-a',90);" 2>&1 || true)"
[[ "$token_a" =~ $is_uuid ]] || fail "F57.1: claim nao devolveu claim_token para item pending elegivel (veio: $token_a)"
segundo="$(psql_test -Atqc "$service_session SELECT claim_token FROM public.claim_multiplix_item('$disp','$item1','worker-b',90);" 2>&1 || true)"
[[ ! "$segundo" =~ $is_uuid ]] \
  || fail 'F57.1: o SEGUNDO worker recebeu um claim_token do item que o primeiro ja tinha reivindicado'
# Controle positivo: sem isto, a recusa acima passaria por qualquer outro motivo
# (id errado, dispatch fora de 'sending') sem provar nada sobre a exclusividade.
token_b="$(psql_test -Atqc "$service_session SELECT claim_token FROM public.claim_multiplix_item('$disp','$item2','worker-b',90);" 2>&1 || true)"
[[ "$token_b" =~ $is_uuid ]] || fail "F57.1: worker-b nao conseguiu pegar o OUTRO item (controle positivo) — veio: $token_b"
[[ "$token_a" != "$token_b" ]] || fail 'F57.1: dois itens distintos receberam o mesmo claim_token'

# (2) Lease expira: token vencido nao completa e o item volta para a fila.
psql_test >/dev/null <<SQL
$service_session
UPDATE public.multiplix_delivery_items
   SET lease_until = statement_timestamp() - interval '1 second'
 WHERE id = '$item1';
SQL
psql_test -q <<SQL >/dev/null 2>&1 || true
$service_session
SELECT public.complete_multiplix_item('$item1','$token_a'::uuid,'sent',NULL);
SQL
[[ "$(psql_test -Atqc "SELECT status FROM public.multiplix_delivery_items WHERE id='$item1';")" == 'sending' ]] \
  || fail 'F57.2: complete_multiplix_item aceitou claim_token de lease vencido (o item saiu de sending)'
token_a2="$(psql_test -Atqc "$service_session SELECT claim_token FROM public.claim_multiplix_item('$disp','$item1','worker-a',90);" 2>&1 || true)"
[[ "$token_a2" =~ $is_uuid ]] || fail "F57.2: lease vencido NAO devolveu o item para a fila (veio: $token_a2)"
[[ "$token_a2" != "$token_a" ]] || fail 'F57.2: o re-claim devolveu o MESMO token, entao o lease nao foi renovado'

# (3) Pausa: item em voo nao e interrompido e pending nao avanca.
# Deixa o item2 em voo (POST feito) e o item1 pendente; pausa o disparo; o pending
# nao pode ser claimado novo enquanto pausado e o que ja foi ao provedor fica como esta.
psql_test >/dev/null <<SQL
$service_session
SELECT public.mark_multiplix_item_dispatch_started('$item2','$token_b'::uuid);
SQL
pause_out="$(psql_test -Atqc "$service_session SELECT current_status FROM public.transition_multiplix_dispatch('$disp','pause');" 2>&1 || true)"
[[ "$pause_out" == 'paused' ]] || fail "F57.3: pause nao transicionou o disparo para paused (saida: $pause_out)"
[[ "$(psql_test -Atqc "SELECT status FROM public.multiplix_delivery_items WHERE id='$item2';")" == 'sending' ]] \
  || fail 'F57.3: a pausa interrompeu item que ja estava em voo no provedor'
claim_pausado="$(psql_test -Atqc "$service_session SELECT claim_token FROM public.claim_multiplix_item('$disp','$item1','worker-c',90);" 2>&1 || true)"
[[ ! "$claim_pausado" =~ $is_uuid ]] \
  || fail 'F57.3: disparo PAUSADO ainda entregou item pending para um worker (a pausa parou no meio do ciclo)'
psql_test >/dev/null <<SQL
$service_session
SELECT public.transition_multiplix_dispatch('$disp','start');
SQL

# (4) Cancel encerra pendentes e nao toca no que ja foi ao provedor.
[[ "$(psql_test -Atqc "$service_session SELECT current_status FROM public.transition_multiplix_dispatch('$disp','cancel');" 2>&1 || true)" == 'cancelled' ]] \
  || fail 'F57.4: cancel nao transicionou o disparo'
[[ "$(psql_test -Atqc "SELECT count(*) FROM public.multiplix_delivery_items WHERE id='$item1' AND status='cancelled';")" == '1' ]] \
  || fail 'F57.4: cancel deixou item pending na fila (o item1 deveria ser cancelled)'
[[ "$(psql_test -Atqc "SELECT status FROM public.multiplix_delivery_items WHERE id='$item2';")" == 'sending' ]] \
  || fail 'F57.4: cancel mexeu em item que ja tinha ido ao provedor'

# (5) Timeout -> outcome_unknown SEM reenvio.
# O item2 esta 'sending' com POST feito e lease vencido: e exatamente o caso de
# "nao sei se saiu". O sweeper tem de fecha-lo como outcome_unknown (nunca pending)
# e um novo claim NAO pode reenvia-lo — e aqui que a simulacao deixaria de duplicar.
psql_test >/dev/null <<SQL
$service_session
UPDATE public.multiplix_delivery_items
   SET lease_until = statement_timestamp() - interval '1 second'
 WHERE id = '$item2';
SQL
[[ "$(psql_test -Atqc "$service_session SELECT public.sweep_multiplix_stuck_items(500);" 2>&1 || true)" == '1' ]] \
  || fail 'F57.5: o sweeper de itens nao fechou o item preso'
[[ "$(psql_test -Atqc "SELECT status FROM public.multiplix_delivery_items WHERE id='$item2';")" == 'outcome_unknown' ]] \
  || fail 'F57.5: item com POST feito e lease vencido nao virou outcome_unknown'
reenvio="$(psql_test -Atqc "$service_session SELECT claim_token FROM public.claim_multiplix_item('$disp','$item2','worker-d',90);" 2>&1 || true)"
[[ ! "$reenvio" =~ $is_uuid ]] \
  || fail 'F57.5: item outcome_unknown voltou para a fila e seria REENVIADO (duplicaria a mensagem)'

printf 'PASS: fila por item — dois workers nao pegam o mesmo item, lease vencido nao completa e devolve o item a fila (renovando o token), pausa nao entrega pending novo sem interromper o que esta em voo, cancel encerra pendentes sem tocar no que foi ao provedor, e timeout vira outcome_unknown sem reenvio (F57)\n'

