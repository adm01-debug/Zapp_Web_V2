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
# E, na segunda metade (F89), a INTEGRACAO da fila contra o banco:
#   6. o confirm materializa um item por (destinatario APTO x bloco) e nao duplica no 2o clique;
#   7. a drenagem com fila aberta NAO conclui o disparo;
#   8/9. a drenagem ate a conclusao ficam reservadas ao limite conhecido t_1ecff9cb;
#   10. o ACK reconcilia o item que estava em outcome_unknown.
# A drenagem que CONCLUI o disparo segue BLOQUEADA por defeito de producao aberto (42804 na
# RPC de drenagem), registrado no cartao t_1ecff9cb; este harness ainda nao fecha esse criterio.
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
# F59: a dead letter do Multiplix fica consultavel por funcao (admin/supervisor). A
# ORDEM importa: a f35 e a version mais alta do fixture, entao a f59 entra depois.
migration "20261002651230_f59_dead_letters_consultavel.sql"

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

-- F60 aplica DEPOIS deste fixture: no banco real a tabela vem de migration antiga,
-- mas aqui ela e criada como tabela minima — a f60 recebe o ALTER logo abaixo.
CREATE TABLE IF NOT EXISTS public.whatsapp_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  status text NOT NULL DEFAULT 'connected',
  instance_id text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
INSERT INTO public.whatsapp_connections (id, status, instance_id)
VALUES ('70000000-0000-0000-0000-000000000001', 'connected', 'inst-f57'),
       -- conexao PROPRIA dos casos do F60: eles pausam TODOS os dispatches da conexao
       -- (esse e o comportamento sob teste), e usar a conexao do F57 aqui derrubaria a
       -- elegibilidade de um teste que nao tem nada a ver — foi o que aconteceu.
       ('70000000-0000-0000-0000-0000000000c6', 'connected', 'inst-f60'),
       -- e outra PROPRIA dos casos do F62: o F57 escolhe item elegivel por conexao, e
       -- compartilhar a conexao fazia o F62 interferir no claim dele.
       ('70000000-0000-0000-0000-0000000000c2', 'connected', 'inst-f62')
ON CONFLICT (id) DO NOTHING;

SQL


migration "20261001201230_f30_multiplix_enums_modelo_v2.sql"
migration "20261001211230_f31_multiplix_dispatch_recipient_columns.sql"
migration "20261001221230_f32a_multiplix_delivery_items_table.sql"

# replied_at/reply_attribution vem da f51; o harness nao carrega a f51 inteira,
# entao as duas colunas que a F62 usa sao criadas aqui. Sem SET ROLE: ALTER TABLE
# exige o owner da tabela e o service_role nao e.
psql_test >/dev/null <<SQL
ALTER TABLE public.multiplix_delivery_items
  ADD COLUMN IF NOT EXISTS replied_at timestamptz,
  ADD COLUMN IF NOT EXISTS reply_attribution text CHECK (reply_attribution IN ('linked','inferred'));
SQL
migration "20261001231230_f32b_multiplix_item_queue_rpcs.sql"
# F33 (Bloco C): `multiplix_blocks.content jsonb` — o confirm (F51) congela o HASH desse
# conteudo e o worker trava o payload por bloco. Sem ela o confirm nao compila nesta cadeia.
migration "20261001241230_f33_multiplix_blocks_content.sql"
migration "20261001251230_f34_multiplix_events_append_only.sql"
# F51 (Bloco E): a RPC de CONFIRMACAO do disparo — revalida (F49), congela publico/blocos,
# avanca `dispatch_version` e materializa `multiplix_delivery_items` na MESMA transacao.
# Entra so a definicao CONTRATO (f51c): ela e `CREATE OR REPLACE` e traz a ACL, os COMMENTs
# e os triggers de bump de versao. A parte aditiva (f51a) cria a MESMA funcao com
# `CREATE FUNCTION` e abortaria aqui com 42723 (function already exists).
migration "20261002461230_f51c_multiplix_confirm_dispatch_contrato.sql"
# F59: conserta transition_multiplix_dispatch, que a f30 deixou quebrada ao converter
# status para enum (42804). Sem ela, os casos 3 e 4 deste teste nao tem como passar — e
# e justamente o teste que expoe o defeito.
migration "20261002521230_f59_transition_dispatch_enum_cast.sql"
# F58 (Bloco F): a RECONCILIACAO do ACK — `record_multiplix_item_delivered(external_id,
# conexao, evento)` casa o external_id e fecha o item, inclusive o que esta em
# `outcome_unknown` (E87). E a funcao usada pelo caso (10) abaixo.
migration "20261002561230_f58_reconcile_item_receipts.sql"
# F55/F56 (bloco F2): a ESCOLHA do proximo item (list_multiplix_claimable_items, que traz a
# regra de ordem por bloco do F56 para dentro do banco) e o heartbeat de lease do item.
migration "20261002621230_f55_claimable_items_por_bloco.sql"
# A f60 grava na trilha (multiplix_events, da f34) e le os itens (f32a/f32b). A f34 nao
# estava na cadeia deste harness — sem ela a trilha nao existiria e o teste provaria nada.
migration "20261002671230_f60_conexao_capacidades_e_risco.sql"
migration "20261003092707_f62b_leitura_janela_jsonb.sql"


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

# ══════════════════════════════════════════════════════════════════════════════
# F60: capacidades da conexao e conexao em risco (ADR D2.4)
# ══════════════════════════════════════════════════════════════════════════════

# (F60.1) A conexao declara capacidades, e o default e 'vazio' — nao 'tudo pode'.
# Default permissivo seria pior que default vazio: quem nao declarou nao sabe, e tratar
# desconhecido como permitido faz o bloco incompativel chegar na fila.
cap_col="$(psql_test -Atqc "SELECT data_type || '|' || is_nullable || '|' || coalesce(column_default,'-') FROM information_schema.columns WHERE table_schema='public' AND table_name='whatsapp_connections' AND column_name='capabilities';" 2>&1 | tail -1 || true)"
[[ "$cap_col" == "jsonb|NO|'{}'::jsonb" ]] \
  || fail "F60.1: capabilities ausente ou com default errado (veio: $cap_col)"

# (F60.2) Duas falhas permanentes NAO pausam: o limiar e a terceira.
psql_test >/dev/null <<SQL
$service_session
INSERT INTO public.multiplix_dispatches (id, name, message_template, status, created_by, total_recipients, whatsapp_connection_id)
VALUES ('30000000-0000-0000-0000-00000000f600','risco','t','sending','10000000-0000-0000-0000-000000000001',1,'70000000-0000-0000-0000-0000000000c6'),
       ('30000000-0000-0000-0000-00000000f601','risco2','t','scheduled','10000000-0000-0000-0000-000000000001',1,'70000000-0000-0000-0000-0000000000c6')
ON CONFLICT (id) DO NOTHING;
SQL
falha_permanente() {
  psql_test -Atqc "$service_session SELECT public.register_multiplix_connection_failure('70000000-0000-0000-0000-0000000000c6', NULL, 'permanent');" 2>&1 | tail -1
}
r1="$(falha_permanente)"
r2="$(falha_permanente)"
[[ "$r2" == *'"action": "counted"'* ]] \
  || fail "F60.2: duas falhas permanentes ja pausaram (esperava 'counted', veio: $r2)"
pausados_antes="$(psql_test -Atqc "$service_session SELECT count(*) FROM public.multiplix_dispatches WHERE whatsapp_connection_id='70000000-0000-0000-0000-0000000000c6' AND status='paused';" 2>&1 | tail -1 || true)"
[[ "$pausados_antes" == "0" ]] \
  || fail "F60.2: houve dispatch pausado antes da terceira falha ($pausados_antes)"

# (F60.3) A TERCEIRA pausa TODOS os dispatches ativos da conexao, com o motivo certo.
r3="$(falha_permanente)"
[[ "$r3" == *'"paused_at_risk"'* ]] \
  || fail "F60.3: a terceira falha permanente nao marcou a conexao em risco (veio: $r3)"
pausados="$(psql_test -Atqc "$service_session SELECT count(*) FROM public.multiplix_dispatches WHERE id IN ('30000000-0000-0000-0000-00000000f600','30000000-0000-0000-0000-00000000f601') AND status='paused' AND pause_reason='connection_at_risk';" 2>&1 | tail -1 || true)"
[[ "$pausados" == "2" ]] \
  || fail "F60.3: esperava 2 dispatches pausados (sending + scheduled), veio $pausados"

# A trilha registra POR QUE parou: sem isso o operador ve 'pausado' sem causa.
evento="$(psql_test -Atqc "$service_session SELECT count(*) FROM public.multiplix_events WHERE kind='connection_at_risk';" 2>&1 | tail -1 || true)"
[[ "$evento" -ge 1 ]] \
  || fail "F60.3: nenhum evento connection_at_risk registrado na trilha"

# (F60.4) Sinal de banimento NAO espera contar tres: pausa na hora.
psql_test >/dev/null <<SQL
$service_session
UPDATE public.multiplix_dispatches SET status='sending', pause_reason=NULL, paused_at=NULL
 WHERE id='30000000-0000-0000-0000-00000000f600';
SQL
rb="$(psql_test -Atqc "$service_session SELECT public.register_multiplix_connection_failure('70000000-0000-0000-0000-0000000000c6', 'TemporaryBan', NULL);" 2>&1 | tail -1)"
[[ "$rb" == *'"paused_banned"'* ]] \
  || fail "F60.4: TemporaryBan nao pausou imediatamente (veio: $rb)"

# (F60.5) Um sucesso ZERA a contagem: 'consecutivas' nao e 'acumuladas'.
# Sem isto, uma conexao saudavel com falhas esparsas ao longo do dia acabaria pausada.
psql_test >/dev/null <<SQL
$service_session
UPDATE public.multiplix_dispatches SET status='sending', pause_reason=NULL, paused_at=NULL
 WHERE whatsapp_connection_id='70000000-0000-0000-0000-0000000000c6';
INSERT INTO public.multiplix_events (dispatch_id, kind, payload)
VALUES ('30000000-0000-0000-0000-00000000f600','item_sent','{}'::jsonb);
SQL
depois_sucesso="$(falha_permanente)"
[[ "$depois_sucesso" == *'"consecutive_failures": 1'* ]] \
  || fail "F60.5: um sucesso nao zerou a contagem de consecutivas (veio: $depois_sucesso)"

# ==============================================================================
# F62: resposta do contato correlacionada ao ITEM (linked vs inferred)
# ==============================================================================

psql_test <<SQL
$service_session
INSERT INTO public.multiplix_dispatches (id, name, message_template, status, created_by, total_recipients, whatsapp_connection_id)
VALUES ('30000000-0000-0000-0000-00000000f620','f62','t','sending','10000000-0000-0000-0000-000000000001',1,'70000000-0000-0000-0000-0000000000c6')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.multiplix_recipients (id, dispatch_id, company_id, company_name_snapshot, destino_e164, status)
VALUES ('40000000-0000-0000-0000-00000000f620','30000000-0000-0000-0000-00000000f620','50000000-0000-0000-0000-000000000001','Empresa F62','+55 11 99999-0620','pending')
ON CONFLICT (id) DO NOTHING;
-- O bloco precisa existir: o item aponta para ele. Sem este INSERT o SELECT de baixo
-- devolve zero linha, o item nunca nasce e TODOS os casos do F62 falham em cascata.
INSERT INTO public.multiplix_blocks (id, dispatch_id, block_order, block_type, template_text)
VALUES ('60000000-0000-0000-0000-00000000f620','30000000-0000-0000-0000-00000000f620',1,'text','Ola {{empresa}}')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.multiplix_delivery_items (id, dispatch_id, recipient_id, block_id, dispatch_version, status, external_id, sent_at)
VALUES ('80000000-0000-0000-0000-00000000f621','30000000-0000-0000-0000-00000000f620','40000000-0000-0000-0000-00000000f620','60000000-0000-0000-0000-00000000f620',1,'delivered','EXT-F62-LINKED', now() - interval '1 hour')
ON CONFLICT (id) DO NOTHING;
SQL

# (F62.1) Sem citacao: atribui por JANELA + NUMERO e marca `inferred`.
# A flag e o ponto: o operador precisa poder ver que essa atribuicao e palpite, nao certeza.
r="$(psql_test -Atqc "$service_session SELECT public.attribute_multiplix_item_reply('5511999990620','msg-f62-1',NULL);" 2>&1 | tail -1)"
[[ "$r" == *'"attribution": "inferred"'* ]] \
  || fail "F62.1: sem citacao deveria atribuir como inferred (veio: $r)"
[[ "$r" == *'"attributed": true'* ]] \
  || fail "F62.1: nao atribuiu a resposta ao item (veio: $r)"

# (F62.2) Idempotencia: a segunda chegada NAO reescreve (reentrega de webhook e real).
r2="$(psql_test -Atqc "$service_session SELECT public.attribute_multiplix_item_reply('5511999990620','msg-f62-2',NULL);" 2>&1 | tail -1)"
[[ "$r2" == *'"attributed": false'* ]] \
  || fail "F62.2: reentrega deveria devolver attributed=false (veio: $r2)"
attr="$(psql_test -Atqc "$service_session SELECT reply_attribution FROM public.multiplix_delivery_items WHERE id='80000000-0000-0000-0000-00000000f621';" 2>&1 | tail -1)"
[[ "$attr" == "inferred" ]] \
  || fail "F62.2: a atribuicao original foi reescrita (agora: $attr)"

# (F62.3) Com citacao que CASA o external_id: `linked` — a correlacao exata, o caso bom.
psql_test <<SQL
$service_session
UPDATE public.multiplix_delivery_items SET replied_at=NULL, reply_attribution=NULL WHERE id='80000000-0000-0000-0000-00000000f621';
SQL
r3="$(psql_test -Atqc "$service_session SELECT public.attribute_multiplix_item_reply('5511999990620','msg-f62-3','EXT-F62-LINKED');" 2>&1 | tail -1)"
[[ "$r3" == *'"attribution": "linked"'* ]] \
  || fail "F62.3: citacao que casa deveria dar linked (veio: $r3)"

# (F62.4) Citacao que NAO casa cai para `inferred` — nunca inventa `linked`.
psql_test <<SQL
$service_session
UPDATE public.multiplix_delivery_items SET replied_at=NULL, reply_attribution=NULL WHERE id='80000000-0000-0000-0000-00000000f621';
SQL
r4="$(psql_test -Atqc "$service_session SELECT public.attribute_multiplix_item_reply('5511999990620','msg-f62-4','EXT-QUE-NAO-EXISTE');" 2>&1 | tail -1)"
[[ "$r4" == *'"attribution": "inferred"'* ]] \
  || fail "F62.4: citacao que nao casa deveria cair para inferred (veio: $r4)"

# (F62.5) Item FORA DA JANELA nao recebe atribuicao — a resposta nao pode ser pendurada
# num envio de semanas atras so porque foi o ultimo daquele numero.
psql_test <<SQL
$service_session
UPDATE public.multiplix_delivery_items SET replied_at=NULL, reply_attribution=NULL, sent_at = now() - interval '200 hours' WHERE id='80000000-0000-0000-0000-00000000f621';
SQL
r5="$(psql_test -Atqc "$service_session SELECT public.attribute_multiplix_item_reply('5511999990620','msg-f62-5',NULL);" 2>&1 | tail -1)"
[[ "$r5" == *'"attributed": false'* ]] \
  || fail "F62.5: item fora da janela (200h) nao pode ser atribuido (veio: $r5)"

# (F62.6) A resposta de OUTRO contato nao pode fechar este item.
psql_test <<SQL
$service_session
UPDATE public.multiplix_delivery_items SET replied_at=NULL, reply_attribution=NULL, sent_at = now() - interval '1 hour' WHERE id='80000000-0000-0000-0000-00000000f621';
SQL
r6="$(psql_test -Atqc "$service_session SELECT public.attribute_multiplix_item_reply('5511888888888','msg-f62-6',NULL);" 2>&1 | tail -1)"
[[ "$r6" == *'"attributed": false'* ]] \
  || fail "F62.6: contato diferente nao pode atribuir a este item (veio: $r6)"



# ══ F89 (Bloco J) · CONFIRMA → DRENA → RECONCILIA contra o banco de teste ══════
# Ate aqui o arquivo comecava com a fila JA materializada por INSERT direto: provava
# claim/lease/pausa/cancel/sweep/escolha por bloco, mas NAO provava o caminho que
# MATERIALIZA a fila (`multiplix_confirm_dispatch`, F51) nem o que a CONCLUI
# (`complete_multiplix_dispatch_if_items_drained`, F13/F32b). Era exatamente a lacuna
# apontada pelo inventario (F89: "integracao da confirmacao ate dreno atual esta
# quebrada e nao coberta"). Este bloco cobra o ciclo no banco:
#   (6) confirma   -> revalida (F49), avanca a versao e materializa UM item por (apto x
#                     bloco); o 2o clique NAO duplica a fila (idempotencia por dispatch_version);
#   (7) drena      -> com item pendente o disparo NAO pode ser dado como drenado;
#   (8) drenagem completa com sucesso -> reservado ao limite conhecido t_1ecff9cb;
#   (9) drenagem completa com falha parcial -> reservado ao limite conhecido t_1ecff9cb;
#   (10) reconcilia -> o ACK casa o external_id e fecha o item que estava em outcome_unknown.
# As duas drenagens que CONCLUEM o disparo (fila inteira terminal -> 'completed'; com um item
# em outcome_unknown -> 'completed_with_failures') estao BLOQUEADAS por defeito de producao
# aberto — ver a nota logo depois do caso (7).
#
# Fixture: o dispatch nasce em 'scheduled' (estado que o F31 grava no draft.create e que o
# confirm aceita — passo 2 da RPC) e SEM `scheduled_at`: nao ha nada a agendar, entao ele
# vai direto a 'sending', que e o estado de onde a fila drena. Os BLOCOS sao inseridos com o
# dispatch FORA de 'draft' de proposito: o trigger do F05 (bump de versao) so age em
# rascunho e aqui quem versiona e o proprio confirm — o fixture nao pode roubar esse papel.
psql_test >/dev/null <<'SQL'
SET request.jwt.claim.role='service_role';
INSERT INTO public.multiplix_dispatches (id, name, message_template, status, created_by, total_recipients, whatsapp_connection_id)
VALUES ('30000000-0000-0000-0000-000000000040', 'Confirmacao F89', 'Oi {{empresa}}', 'scheduled',
        '10000000-0000-0000-0000-00000000000a', 0, '70000000-0000-0000-0000-000000000001');
INSERT INTO public.multiplix_blocks (id, dispatch_id, block_order, block_type, template_text, content) VALUES
  ('60000000-0000-0000-0000-000000000041', '30000000-0000-0000-0000-000000000040', 0, 'text', 'bloco A', '{"text":"bloco A"}'::jsonb),
  ('60000000-0000-0000-0000-000000000042', '30000000-0000-0000-0000-000000000040', 1, 'text', 'bloco B', '{"text":"bloco B"}'::jsonb);
INSERT INTO public.multiplix_recipients (id, dispatch_id, company_id, company_name_snapshot, destino_e164, singu_contact_id, status, eligibility) VALUES
  ('40000000-0000-0000-0000-000000000041', '30000000-0000-0000-0000-000000000040', '50000000-0000-0000-0000-000000000041', 'Empresa 41', '+551****0041', NULL, 'pending', 'eligible'),
  ('40000000-0000-0000-0000-000000000042', '30000000-0000-0000-0000-000000000040', '50000000-0000-0000-0000-000000000042', 'Empresa 42', '+551****0042', '90000000-0000-0000-0000-000000000042', 'pending', 'eligible'),
  -- e o 3o nao tem pessoa NENHUMA (nem destino, nem contato): o confirm tem de barra-lo na
  -- revalidacao do F49. So PODE haver UM destino nulo por disparo (UNIQUE NULLS NOT DISTINCT),
  -- por isso este e o unico sem destino desta fixture.
  ('40000000-0000-0000-0000-000000000043', '30000000-0000-0000-0000-000000000040', '50000000-0000-0000-0000-000000000043', 'Empresa 43', NULL, NULL, 'pending', 'eligible');

-- Segundo disparo (1 apto x 1 bloco) para o caso de FALHA parcial: a fila dele fecha com um
-- item em outcome_unknown e o disparo NAO pode sair como 'completed'. O 2o destinatario esta
-- SUPRIMIDO: o confirm nao pode enfileira-lo (filtro de elegibilidade do F49).
INSERT INTO public.multiplix_dispatches (id, name, message_template, status, created_by, total_recipients, whatsapp_connection_id)
VALUES ('30000000-0000-0000-0000-000000000041', 'Parcial F89', 'Oi {{empresa}}', 'scheduled',
        '10000000-0000-0000-0000-00000000000a', 0, '70000000-0000-0000-0000-000000000001');
INSERT INTO public.multiplix_blocks (id, dispatch_id, block_order, block_type, template_text, content) VALUES
  ('60000000-0000-0000-0000-000000000043', '30000000-0000-0000-0000-000000000041', 0, 'text', 'bloco unico', '{"text":"bloco unico"}'::jsonb);
INSERT INTO public.multiplix_recipients (id, dispatch_id, company_id, company_name_snapshot, destino_e164, status, eligibility) VALUES
  ('40000000-0000-0000-0000-000000000044', '30000000-0000-0000-0000-000000000041', '50000000-0000-0000-0000-000000000044', 'Empresa 44', '+551****0044', 'pending', 'eligible'),
  ('40000000-0000-0000-0000-000000000045', '30000000-0000-0000-0000-000000000041', '50000000-0000-0000-0000-000000000045', 'Empresa 45', '+551****0045', 'pending', 'suppressed');
SQL

disp_conf='30000000-0000-0000-0000-000000000040'
disp_parc='30000000-0000-0000-0000-000000000041'
ator_a='10000000-0000-0000-0000-00000000000a'
conn='70000000-0000-0000-0000-000000000001'

# (6) CONFIRMA: 2 aptos x 2 blocos = 4 itens, disparo em 'sending', e o 3o destinatario
# (sem destino e sem contato) fica FORA da fila. O esperado e o que a PROPRIA RPC devolve
# depois de revalidar — nao uma copia manual da regra.
conf_out="$(psql_test -Atqc "$service_session SELECT items_created::text||'/'||items_total::text||'/'||status::text||'/'||created::text FROM public.multiplix_confirm_dispatch('$disp_conf','$ator_a', false, 1);" 2>&1 || true)"
[[ "$conf_out" == '4/4/sending/true' ]] \
  || fail "F89.6: o confirm devia materializar 4 itens (2 aptos x 2 blocos), por o disparo em 'sending' e devolver created=true (veio: $conf_out)"
[[ "$(psql_test -Atqc "SELECT count(*) FROM public.multiplix_delivery_items WHERE dispatch_id='$disp_conf';")" == '4' ]] \
  || fail 'F89.6: a fila materializada nao tem 4 itens'
[[ "$(psql_test -Atqc "SELECT count(DISTINCT block_id) FROM public.multiplix_delivery_items WHERE dispatch_id='$disp_conf';")" == '2' ]] \
  || fail 'F89.6: a fila nao cobriu os DOIS blocos do disparo'
[[ "$(psql_test -Atqc "SELECT total_recipients FROM public.multiplix_dispatches WHERE id='$disp_conf';")" == '2' ]] \
  || fail 'F89.6: total_recipients devia contar so os 2 aptos (o 3o nao tem destino nem contato)'
[[ "$(psql_test -Atqc "SELECT count(*) FROM public.multiplix_delivery_items WHERE dispatch_id='$disp_conf' AND recipient_id='40000000-0000-0000-0000-000000000043';")" == '0' ]] \
  || fail 'F89.6: destinatario sem pessoa foi enfileirado — a revalidacao do F49 nao aconteceu'
# 5 cliques = 1 confirmacao: repetir com a MESMA versao revisada nao re-materializa.
conf_2="$(psql_test -Atqc "$service_session SELECT items_created::text||'/'||created::text FROM public.multiplix_confirm_dispatch('$disp_conf','$ator_a', false, 1);" 2>&1 || true)"
[[ "$conf_2" == '0/false' ]] \
  || fail "F89.6: o 2o confirm devia ser idempotente (items_created=0, created=false) — veio: $conf_2"
[[ "$(psql_test -Atqc "SELECT count(*) FROM public.multiplix_delivery_items WHERE dispatch_id='$disp_conf';")" == '4' ]] \
  || fail 'F89.6: o 2o confirm DUPLICOU a fila'
# Confirmar sem destinatario apto e RECUSA, nao "confirmacao vazia" que o worker depois nao drena.
psql_test >/dev/null <<'SQL'
SET request.jwt.claim.role='service_role';
UPDATE public.multiplix_recipients SET eligibility='suppressed'
 WHERE id='40000000-0000-0000-0000-000000000044';
SQL
sem_apto="$(psql_test -Atqc "$service_session SELECT public.multiplix_confirm_dispatch('$disp_parc','$ator_a', false, 1);" 2>&1 || true)"
[[ "$sem_apto" == *multiplix_confirm_no_eligible_recipients* ]] \
  || fail "F89.6: confirm sem destinatario apto devia recusar com no_eligible_recipients (veio: $sem_apto)"
psql_test >/dev/null <<'SQL'
SET request.jwt.claim.role='service_role';
UPDATE public.multiplix_recipients SET eligibility='eligible'
 WHERE id='40000000-0000-0000-0000-000000000044';
SQL
# De volta o apto, o confirm enfileira SO ele: o destinatario SUPRIMIDO (id ...045) fica fora
# da fila e fora da conta do disparo.
conf_parc="$(psql_test -Atqc "$service_session SELECT items_created::text||'/'||status::text FROM public.multiplix_confirm_dispatch('$disp_parc','$ator_a', false, 1);" 2>&1 || true)"
[[ "$conf_parc" == '1/sending' ]] || fail "F89.6: o confirm do disparo com 1 apto devia enfileirar 1 item (veio: $conf_parc)"
[[ "$(psql_test -Atqc "SELECT total_recipients FROM public.multiplix_dispatches WHERE id='$disp_parc';")" == '1' ]] \
  || fail 'F89.6: o destinatario SUPRIMIDO entrou na conta do disparo (total_recipients devia ser 1, nao 2)'
[[ "$(psql_test -Atqc "SELECT count(*) FROM public.multiplix_delivery_items WHERE dispatch_id='$disp_parc' AND recipient_id='40000000-0000-0000-0000-000000000045';")" == '0' ]] \
  || fail 'F89.6: destinatario suprimido foi enfileirado — o filtro de elegibilidade do F49 nao valeu'

# (7) DRENA com a fila aberta: item pendente impede a conclusao.
drena_aberta="$(psql_test -Atqc "$service_session SELECT public.complete_multiplix_dispatch_if_items_drained('$disp_conf')::text;" 2>&1 || true)"
[[ "$drena_aberta" == 'false' ]] \
  || fail "F89.7: disparo com itens pendentes NAO pode ser dado como drenado (veio: $drena_aberta)"
[[ "$(psql_test -Atqc "SELECT status FROM public.multiplix_dispatches WHERE id='$disp_conf';")" == 'sending' ]] \
  || fail 'F89.7: a drenagem recusada mexeu no status do disparo'

# (8)/(9) DRENA ATE A CONCLUSAO — BLOQUEADOS por DEFEITO DE PRODUCAO aberto:
#   ERROR: column "status" is of type multiplix_dispatch_status but expression is of type text
# `complete_multiplix_dispatch_if_items_drained` (f32b, 20261001231230) — e a gemea antiga
# `complete_multiplix_dispatch_if_drained`, que o worker ainda chama — montam o novo status
# num CASE de literais `text` e o ATRIBUEM a coluna ENUM:
#   `SET status = CASE WHEN failed_count + outcome_unknown_count > 0
#                      THEN 'completed_with_failures' ELSE 'completed' END`
# O PostgreSQL resolve esse CASE para `text` e recusa a atribuicao (42804) SEMPRE. Isto e:
# toda vez que a drenagem chega ao UPDATE — exatamente o passo em que ela CONCLUI o disparo
# — a RPC levanta erro. A fila esvazia e o disparo NUNCA conclui; e a "integracao da
# confirmacao ate dreno esta quebrada" que o inventario do F89 aponta. Mesma classe que o F59
# ja consertou em `transition_multiplix_dispatch`
# (`v_next_status::public.multiplix_dispatch_status`, 20261002521230) — aquele caso tinha
# teste; o dreno nao tinha, por isso sobreviveu ate aqui.
# O CONSERTO E DDL (migration) e este cartao proibe DDL: a correcao foi para o cartao
# t_1ecff9cb (fix do cast em complete_multiplix_dispatch_if_*_drained).
#
# Limite conhecido t_1ecff9cb: com o cast no lugar, religar AQUI dois casos de drenagem
# ate a conclusao —
#   (8) fila inteira terminal -> drena_fecha='true', disparo 'completed', sent_count=4 (itens
#       fechados pela rota real: claim_multiplix_item -> mark_multiplix_item_dispatch_started
#       -> record_multiplix_item_sent, na ORDEM POR BLOCO);
#   (9) um item em outcome_unknown (terminal) -> drena='true' e disparo
#       'completed_with_failures' (parcial NUNCA aparece como "Concluido", F13).
# Esses dois casos ficam FORA da execucao (nao fingem passar) enquanto o defeito existir.

# (10) RECONCILIA (outcome_unknown -> ack): o WAMID ja era conhecido quando o timeout
# aconteceu, entao o ACK de entrega tem de casar por external_id e fechar o item. Fixture
# propria: o item nasce JA em outcome_unknown com external_id — o caminho que o LEVA ate ali
# (o sweeper, provado no F57.5) e o caminho que o FECHA sao coisas distintas, e aqui o alvo
# e o ACK.
psql_test >/dev/null <<'SQL'
SET request.jwt.claim.role='service_role';
INSERT INTO public.multiplix_dispatches (id, name, message_template, status, created_by, total_recipients, whatsapp_connection_id)
VALUES ('30000000-0000-0000-0000-000000000042', 'Reconciliacao F89', 'Oi {{empresa}}', 'sending',
        '10000000-0000-0000-0000-00000000000a', 1, '70000000-0000-0000-0000-000000000001');
INSERT INTO public.multiplix_blocks (id, dispatch_id, block_order, block_type, template_text) VALUES
  ('60000000-0000-0000-0000-000000000044', '30000000-0000-0000-0000-000000000042', 0, 'text', 'bloco do ack');
INSERT INTO public.multiplix_recipients (id, dispatch_id, company_id, company_name_snapshot, destino_e164, status) VALUES
  ('40000000-0000-0000-0000-000000000046', '30000000-0000-0000-0000-000000000042', '50000000-0000-0000-0000-000000000046', 'Empresa 46', '+551****0046', 'pending');
INSERT INTO public.multiplix_delivery_items (id, dispatch_id, recipient_id, block_id, dispatch_version, status, external_id, sent_at) VALUES
  ('80000000-0000-0000-0000-000000000041', '30000000-0000-0000-0000-000000000042', '40000000-0000-0000-0000-000000000046', '60000000-0000-0000-0000-000000000044', 1, 'outcome_unknown', 'ext-f89-ack', statement_timestamp());
SQL
item_ack='80000000-0000-0000-0000-000000000041'
# Controle positivo: o item protegido EXISTE e esta exatamente em outcome_unknown — sem isso
# um ACK 'false' abaixo passaria por "item errado" e nao provaria nada sobre o casamento.
[[ "$(psql_test -Atqc "SELECT count(*) FROM public.multiplix_delivery_items WHERE external_id='ext-f89-ack' AND status='outcome_unknown';")" == '1' ]] \
  || fail 'F89.10: fixture inconsistente — o item a reconciliar nao esta em outcome_unknown'
ack="$(psql_test -Atqc "$service_session SELECT public.record_multiplix_item_delivered('ext-f89-ack','$conn','delivered')::text;" 2>&1 || true)"
[[ "$ack" == 'true' ]] || fail "F89.10: o ACK devia reconciliar o item em outcome_unknown (veio: $ack)"
[[ "$(psql_test -Atqc "SELECT status FROM public.multiplix_delivery_items WHERE id='$item_ack';")" == 'delivered' ]] \
  || fail 'F89.10: o item em outcome_unknown nao virou delivered com o ACK'
[[ "$(psql_test -Atqc "SELECT delivered_count FROM public.multiplix_dispatches WHERE id='30000000-0000-0000-0000-000000000042';")" == '1' ]] \
  || fail 'F89.10: o contador de entregues do disparo nao subiu com o ACK'
[[ "$(psql_test -Atqc "SELECT count(*) FROM public.multiplix_delivery_items WHERE dispatch_id='30000000-0000-0000-0000-000000000042' AND status='outcome_unknown';")" == '0' ]] \
  || fail 'F89.10: o item reconciliado continua contado como outcome_unknown'
# Negativo: external_id desconhecido NAO reconcilia NADA (e o item reconciliado segue intacto).
ack_nao="$(psql_test -Atqc "$service_session SELECT public.record_multiplix_item_delivered('ext-f89-nao-existe','$conn','delivered')::text;" 2>&1 || true)"
[[ "$ack_nao" == 'false' ]] || fail "F89.10: ACK de external_id desconhecido nao pode reconciliar (veio: $ack_nao)"
[[ "$(psql_test -Atqc "SELECT status FROM public.multiplix_delivery_items WHERE id='$item_ack';")" == 'delivered' ]] \
  || fail 'F89.10: o ACK desconhecido mexeu no item ja reconciliado'


printf 'PASS: fila por item — dois workers nao pegam o mesmo item, lease vencido nao completa e devolve o item a fila (renovando o token), pausa nao entrega pending novo sem interromper o que esta em voo, cancel encerra pendentes sem tocar no que foi ao provedor, e timeout vira outcome_unknown sem reenvio (F57). Escolha do proximo item respeita a ORDEM POR BLOCO do destinatario (bloco k so depois do k-1 sent, tres blocos) e o heartbeat de lease renova so para o dono do claim (F55/F56). E a INTEGRACAO da fila contra o banco: o confirm revalida e materializa um item por (apto x bloco) sem duplicar no 2o clique (nem enfileirar quem nao tem pessoa), a drenagem com fila aberta NAO conclui o disparo e o ACK reconcilia o item que estava em outcome_unknown (F89; a drenagem ATE a conclusao segue bloqueada por defeito 42804 da RPC — ver limite conhecido t_1ecff9cb neste arquivo)\n'


