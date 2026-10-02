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
# F59: a dead letter do Multiplix fica consultavel por funcao (admin/supervisor). A
# ORDEM importa: a f35 e a version mais alta do fixture, entao a f59 entra depois.
migration "20261002651230_f59_dead_letters_consultavel.sql"

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
# F55/F56 (bloco F2): a ESCOLHA do proximo item (list_multiplix_claimable_items, que traz a
# regra de ordem por bloco do F56 para dentro do banco) e o heartbeat de lease do item.
migration "20261002621230_f55_claimable_items_por_bloco.sql"


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
# 'sent' NAO e status de complete_multiplix_item (a RPC so aceita failed|skipped|outcome_unknown;
# quem marca 'sent' e record_multiplix_item_sent). A versao anterior deste caso pedia 'sent' e por
# isso a RPC lancava invalid_multiplix_delivery_completion ANTES de olhar o lease: a assercao
# (item continua 'sending') passava por motivo errado e nao provava nada sobre token vencido.
# Agora usa 'failed', que e rota REAL de fechamento, e exige o conflito de claim.
# O re-claim (outro worker) e o que invalida o token ANTIGO: claim_multiplix_item so recicla
# item com lease vencido e SEM provider_dispatch_started_at, e sempre gera token novo.
token_a2="$(psql_test -Atqc "$service_session SELECT claim_token FROM public.claim_multiplix_item('$disp','$item1','worker-b',90);" 2>&1 || true)"
[[ "$token_a2" =~ $is_uuid ]] || fail "F57.2: lease vencido NAO devolveu o item para a fila (veio: $token_a2)"
[[ "$token_a2" != "$token_a" ]] || fail 'F57.2: o re-claim devolveu o MESMO token, entao o lease nao foi renovado'
# Agora o dono ANTIGO tenta fechar o item que ja e de outro. Isto sim e o que o caso promete —
# e o unico jeito de provar que o token vencido perdeu a validade.
# (Nota: complete_multiplix_item valida status='sending' e lease_token, mas NAO valida
# lease_until; quem torna o token antigo invalido e o re-claim, nao o relogio. A versao
# anterior deste caso pedia p_status 'sent' — que a RPC recusa antes de olhar o claim — e por
# isso passava por motivo errado, sem provar nada.)
fechou="$(psql_test -Atqc "$service_session SELECT public.complete_multiplix_item('$item1','$token_a'::uuid,'failed','lease vencido');" 2>&1 || true)"
[[ "$fechou" == *multiplix_delivery_claim_conflict* ]] \
  || fail "F57.2: o token ANTIGO completou o item que outro worker ja tinha reivindicado (veio: $fechou)"
[[ "$(psql_test -Atqc "SELECT status FROM public.multiplix_delivery_items WHERE id='$item1';")" == 'sending' ]] \
  || fail 'F57.2: complete_multiplix_item fechou o item com claim_token que nao e mais o dono'
token_a="$token_a2"

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

# ══ F55/F56 (bloco F2) · ESCOLHA do proximo item e heartbeat ═══════════════════
# Fixture proprio: dispatch NOVO em 'sending', TRES blocos e UM destinatario, um item por
# bloco. O dispatch anterior termina cancelado, e cancelado nao exercita a escolha.
psql_test >/dev/null <<'SQL'
SET request.jwt.claim.role='service_role';
INSERT INTO public.multiplix_dispatches (id, name, message_template, status, created_by, total_recipients, whatsapp_connection_id)
VALUES ('30000000-0000-0000-0000-000000000030', 'Ordem por bloco', 'Oi', 'sending',
        '10000000-0000-0000-0000-00000000000a', 1, '70000000-0000-0000-0000-000000000001');
INSERT INTO public.multiplix_blocks (id, dispatch_id, block_order, block_type, template_text) VALUES
  ('60000000-0000-0000-0000-000000000031', '30000000-0000-0000-0000-000000000030', 0, 'text', 'b1'),
  ('60000000-0000-0000-0000-000000000032', '30000000-0000-0000-0000-000000000030', 1, 'text', 'b2'),
  ('60000000-0000-0000-0000-000000000033', '30000000-0000-0000-0000-000000000030', 2, 'text', 'b3');
INSERT INTO public.multiplix_recipients (id, dispatch_id, company_id, destino_e164, status, created_at)
VALUES ('40000000-0000-0000-0000-000000000031', '30000000-0000-0000-0000-000000000030', '50000000-0000-0000-0000-000000000031', '+551****0031', 'pending', statement_timestamp());
INSERT INTO public.multiplix_delivery_items (id, dispatch_id, recipient_id, block_id, dispatch_version, status, external_id) VALUES
  ('80000000-0000-0000-0000-000000000031', '30000000-0000-0000-0000-000000000030', '40000000-0000-0000-0000-000000000031', '60000000-0000-0000-0000-000000000031', 1, 'pending', 'o-1'),
  ('80000000-0000-0000-0000-000000000032', '30000000-0000-0000-0000-000000000030', '40000000-0000-0000-0000-000000000031', '60000000-0000-0000-0000-000000000032', 1, 'pending', 'o-2'),
  ('80000000-0000-0000-0000-000000000033', '30000000-0000-0000-0000-000000000030', '40000000-0000-0000-0000-000000000031', '60000000-0000-0000-0000-000000000033', 1, 'pending', 'o-3');
SQL

disp_ord='30000000-0000-0000-0000-000000000030'
o1='80000000-0000-0000-0000-000000000031'
o2='80000000-0000-0000-0000-000000000032'
o3='80000000-0000-0000-0000-000000000033'
ordem() { psql_test -Atqc "$service_session SELECT coalesce(string_agg(item_id::text, ',' ORDER BY block_order), 'VAZIO') FROM public.list_multiplix_claimable_items('$disp_ord', 10);" 2>&1 || true; }

# (F56.1) Com os tres pendentes, so o BLOCO 0 pode ser oferecido.
elegiveis="$(ordem)"
[[ "$elegiveis" == "$o1" ]] \
  || fail "F56.1: a escolha nao respeitou a ordem por bloco — esperava so o item do bloco 0 ($o1), veio: $elegiveis"

# (F56.2) Bloco 0 concluido -> libera o bloco 1 e NADA mais.
tok_o1="$(psql_test -Atqc "$service_session SELECT claim_token FROM public.claim_multiplix_item('$disp_ord','$o1','worker-a',90);" 2>&1 || true)"
[[ "$tok_o1" =~ $is_uuid ]] || fail "F56.2: nao consegui reivindicar o item do bloco 0 (veio: $tok_o1)"
psql_test >/dev/null <<SQL
$service_session
SELECT public.mark_multiplix_item_dispatch_started('$o1','$tok_o1'::uuid);
SELECT public.record_multiplix_item_sent('$o1','$tok_o1'::uuid,'ext-o1');
SQL
elegiveis="$(ordem)"
[[ "$elegiveis" == "$o2" ]] \
  || fail "F56.2: com o bloco 0 'sent', esperava so o item do bloco 1 ($o2), veio: $elegiveis"

# (F56.3) Bloco 1 concluido -> libera o bloco 2 (fim da cadeia).
tok_o2="$(psql_test -Atqc "$service_session SELECT claim_token FROM public.claim_multiplix_item('$disp_ord','$o2','worker-a',90);" 2>&1 || true)"
[[ "$tok_o2" =~ $is_uuid ]] || fail "F56.3: nao consegui reivindicar o item do bloco 1 (veio: $tok_o2)"
psql_test >/dev/null <<SQL
$service_session
SELECT public.mark_multiplix_item_dispatch_started('$o2','$tok_o2'::uuid);
SELECT public.record_multiplix_item_sent('$o2','$tok_o2'::uuid,'ext-o2');
SQL
elegiveis="$(ordem)"
[[ "$elegiveis" == "$o3" ]] \
  || fail "F56.3: com o bloco 1 'sent', esperava o item do bloco 2 ($o3), veio: $elegiveis"

# (F55.1) Heartbeat renova o lease de quem tem o item — e so de quem tem.
tok_o3="$(psql_test -Atqc "$service_session SELECT claim_token FROM public.claim_multiplix_item('$disp_ord','$o3','worker-a',90);" 2>&1 || true)"
[[ "$tok_o3" =~ $is_uuid ]] || fail "F55.1: nao consegui reivindicar o item do bloco 2 (veio: $tok_o3)"
antes="$(psql_test -Atqc "SELECT extract(epoch FROM lease_until)::int FROM public.multiplix_delivery_items WHERE id='$o3';")"
psql_test >/dev/null <<SQL
$service_session
SELECT public.heartbeat_multiplix_item('$o3','$tok_o3'::uuid,180);
SQL
depois="$(psql_test -Atqc "SELECT extract(epoch FROM lease_until)::int FROM public.multiplix_delivery_items WHERE id='$o3';")"
[[ "$depois" -gt "$antes" ]] \
  || fail "F55.1: o heartbeat NAO estendeu o lease (antes=$antes, depois=$depois)"
# Token de outro dono nao renova: renovar por cima roubaria o item de quem o tem agora.
intruso="$(psql_test -Atqc "$service_session SELECT public.heartbeat_multiplix_item('$o3','00000000-0000-0000-0000-0000000000ff'::uuid,180);" 2>&1 || true)"
[[ "$intruso" == 'f' ]] \
  || fail "F55.1: heartbeat com claim_token de OUTRO dono foi aceito (veio: $intruso)"

# ══════════════════════════════════════════════════════════════════════════════
# F59: dead letter consultavel (admin), recalculo de elegibilidade no disparo
# ══════════════════════════════════════════════════════════════════════════════
# is_admin_or_supervisor(auth.uid()) le public.user_roles: o admin do teste precisa estar la.
# Como superusuario: service_role nao tem GRANT em user_roles (nem deve — e tabela de papel).
psql_test >/dev/null <<SQL
INSERT INTO public.user_roles (user_id, role) VALUES
  ('10000000-0000-0000-0000-000000000001', 'admin')
ON CONFLICT DO NOTHING;
SQL
# F59: a supressao (opt-out) vive em talkx_blacklist, que o fixture nao criava — a
# consulta de elegibilidade depende dela, entao ela entra com as colunas que
# talkx_recipient_is_suppressed realmente le (phone normalizado, removed_at, expires_at).
psql_test >/dev/null <<SQL
CREATE TABLE IF NOT EXISTS public.talkx_blacklist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid,
  phone text,
  reason text,
  removed_at timestamp with time zone,
  expires_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
GRANT ALL ON public.talkx_blacklist TO service_role;
SQL

admin_session="SET ROLE authenticated; SET request.jwt.claim.role='authenticated'; SET request.jwt.claim.sub='10000000-0000-0000-0000-000000000001';"
nao_admin_session="SET ROLE authenticated; SET request.jwt.claim.role='authenticated'; SET request.jwt.claim.sub='10000000-0000-0000-0000-0000000000ee';"

# (F59.1) Um item levado a dead letter aparece na consulta, com motivo e quando.
# NAO existe status 'dead_lettered' (nem 'failed_permanent', que o plano citava): o enum
# tem 'failed', e o reschedule marca failed + next_attempt_at=NULL ao esgotar as
# tentativas, devolvendo a ACAO 'dead_lettered'. O dead letter e esse PAR.
psql_test >/dev/null <<SQL
$service_session
UPDATE public.multiplix_delivery_items
   SET status = 'failed',
       next_attempt_at = NULL,
       attempt_count = 3,
       error_class = 'provider_4xx',
       error_message = 'numero inexistente no WhatsApp',
       updated_at = statement_timestamp()
 WHERE id = '$o1';
SQL
linha="$(psql_test -Atqc "$admin_session SELECT item_id || '|' || error_class || '|' || error_message || '|' || (failed_at IS NOT NULL)::text || '|' || (dispatch_id IS NOT NULL)::text || '|' || coalesce(block_order::text,'-') FROM public.list_multiplix_dead_letters(50, NULL);" 2>&1 || true)"
[[ "$linha" == "$o1|provider_4xx|numero inexistente no WhatsApp|true|true|0" ]] \
  || fail "F59.1: dead letter nao saiu na consulta como esperado (veio: $linha)"

# O motivo e o QUANDO sao obrigatorios no diagnostico: um dead letter sem motivo nao
# permite ao operador decidir nada — e sem isso a consulta nao serve para nada.
motivo_vazio="$(psql_test -Atqc "$admin_session SELECT count(*) FROM public.list_multiplix_dead_letters(50, NULL) WHERE failed_at IS NULL OR coalesce(error_message,'') = '';" 2>&1 || true)"
[[ "$motivo_vazio" == "0" ]] \
  || fail "F59.1: $motivo_vazio dead letter(s) sem motivo ou sem data — consulta inutil para diagnostico"

# O criterio do dead letter e o PAR (failed + sem proxima tentativa), nao o status 'failed'
# sozinho: um item que ainda vai ser retentado NAO pode aparecer como dead letter — se
# aparecesse, o operador trataria como perdido algo que o proprio sistema ainda vai tentar.
psql_test >/dev/null <<SQL
$service_session
UPDATE public.multiplix_delivery_items
   SET status = 'failed', next_attempt_at = statement_timestamp() + interval '5 minutes'
 WHERE id = '$o2';
SQL
com_transitorio="$(psql_test -Atqc "$admin_session SELECT count(*) FROM public.list_multiplix_dead_letters(50, NULL);" 2>&1 || true)"
[[ "$com_transitorio" == "1" ]] \
  || fail "F59.2: falha TRANSITORIA (failed COM next_attempt_at) entrou na dead letter (havia $com_transitorio, esperava 1)"

# O contador bate com a consulta (o operador precisa do numero, nao so da lista).
conta="$(psql_test -Atqc "$admin_session SELECT public.count_multiplix_dead_letters(NULL);" 2>&1 | tail -1 || true)"
[[ "$conta" == "1" ]] || fail "F59.2: contador de dead letters divergiu (veio: $conta)"

# (F59.3) O gate e DENTRO da funcao: um authenticated comum nao pode ler dead letter.
# Sem isto, qualquer usuario logado veria falhas de entrega de qualquer disparo.
recusa="$(psql_test -Atqc "$nao_admin_session SELECT count(*) FROM public.list_multiplix_dead_letters(50, NULL);" 2>&1 || true)"
[[ "$recusa" == *multiplix_dead_letters_forbidden* ]] \
  || fail "F59.3: usuario sem admin/supervisor conseguiu consultar a dead letter (veio: $recusa)"
recusa_conta="$(psql_test -Atqc "$nao_admin_session SELECT public.count_multiplix_dead_letters(NULL);" 2>&1 || true)"
[[ "$recusa_conta" == *multiplix_dead_letters_forbidden* ]] \
  || fail "F59.3: usuario sem admin/supervisor conseguiu CONTAR a dead letter (veio: $recusa_conta)"

# (F59.4) Recalculo de ELEGIBILIDADE sem re-resolver publico: um opt-out que chega
# DEPOIS do agendamento passa a constar na supressao, mas NAO mexe na lista do disparo.
# Este e o ponto exato que o dono aprovou — a supressao e consultada na hora do disparo
# (o worker faz isso, provado no F09); o que NAO pode acontecer e o disparo mudar de
# destinatarios sozinho entre o agendamento e a hora de sair.
itens_antes="$(psql_test -Atqc "$service_session SELECT count(*) FROM public.multiplix_delivery_items WHERE dispatch_id='$disp_ord';" 2>&1 | tail -1 || true)"
alvo_r="$(psql_test -Atqc "$service_session SELECT recipient_id FROM public.multiplix_delivery_items WHERE id='$o1';" 2>&1 | tail -1 || true)"
alvo_fone="$(psql_test -Atqc "$service_session SELECT destino_e164 FROM public.multiplix_recipients WHERE id='$alvo_r';" 2>&1 | tail -1 || true)"
[[ -n "$alvo_fone" ]] || fail "F59.4: nao consegui o telefone do destinatario do item (alvo_r=$alvo_r)"
psql_test >/dev/null <<SQL
$service_session
INSERT INTO public.talkx_blacklist (contact_id, phone, reason, removed_at)
VALUES (NULL, '$alvo_fone', 'opt-out pos-agendamento', NULL);
SQL
sup_gravada="$(psql_test -Atqc "$service_session SELECT count(*) FROM public.talkx_blacklist WHERE phone='$alvo_fone' AND removed_at IS NULL;" 2>&1 | tail -1 || true)"
[[ "$sup_gravada" == "1" ]]   || fail "F59.4: o opt-out pos-agendamento nao ficou registrado na supressao (veio: $sup_gravada)"

# (F59.5) A LISTA nao muda: nem o numero de itens, nem o destinatario do item.
itens_depois="$(psql_test -Atqc "$service_session SELECT count(*) FROM public.multiplix_delivery_items WHERE dispatch_id='$disp_ord';" 2>&1 | tail -1 || true)"
[[ "$itens_depois" == "$itens_antes" ]]   || fail "F59.5: o opt-out MUDOU a lista do disparo agendado (itens antes=$itens_antes, depois=$itens_depois) — recalcular elegibilidade nao pode re-resolver publico"
alvo_r_depois="$(psql_test -Atqc "$service_session SELECT recipient_id FROM public.multiplix_delivery_items WHERE id='$o1';" 2>&1 | tail -1 || true)"
[[ "$alvo_r_depois" == "$alvo_r" ]]   || fail "F59.5: o item trocou de destinatario apos o opt-out (antes=$alvo_r, depois=$alvo_r_depois)"

printf 'PASS: fila por item — dois workers nao pegam o mesmo item, lease vencido nao completa e devolve o item a fila (renovando o token), pausa nao entrega pending novo sem interromper o que esta em voo, cancel encerra pendentes sem tocar no que foi ao provedor, e timeout vira outcome_unknown sem reenvio (F57). Escolha do proximo item respeita a ORDEM POR BLOCO do destinatario (bloco k so depois do k-1 sent, tres blocos) e o heartbeat de lease renova so para o dono do claim (F55/F56)\n'

