#!/usr/bin/env bash
# R2-DB-007 (item #78 do BACKLOG_VERIFICADO) - Multiplix: as DUAS rotinas de concluir
# disparo escrevem status (enum) e nao text.
#
# multiplix_dispatches.status e o enum public.multiplix_dispatch_status desde a
# 20261001201230 (f30). As duas rotinas que fecham um disparo DRENADO montam o valor com
#   SET status = CASE WHEN <falhas> > 0 THEN 'completed_with_failures' ELSE 'completed' END
# e, pelo algoritmo de resolucao do CASE, esse resultado e text (os literais nascem
# desconhecidos e o resultado vira text). Text NAO tem cast de atribuicao para enum
# (conversao string -> tipo do usuario e explicita), entao a chamada estoura
#   42804: column "status" is of type multiplix_dispatch_status but expression is of type text
# e o disparo nunca conclui. A f59 corrigiu so transition_multiplix_dispatch; as duas
# rotinas de drenagem ficaram para tras.
#
# Prova no schema com o ENUM REAL (nao fixture com status text): PostgreSQL 17 descartavel,
# aplicando as MIGRATIONS REAIS do repo, chamando a rotina como service_role (dono do
# contrato) sobre disparo drenado e exigindo o status final. Este mesmo arquivo roda
# VERMELHO antes da correcao (a migration *_multiplix_drain_enum_cast.sql ainda nao existe)
# e VERDE depois.
#
# Herda o harness (infra Supabase: auth, vault, cron, pg_net, extensions) do
# multiplix-delivery-leases.test.sh (o 'set -euo pipefail' vem do corpo herdado).
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
migration "20261001251230_f34_multiplix_events_append_only.sql"

# F59 (a correcao IRMA, ja na branch): transition_multiplix_dispatch ganhou o cast.
# Entra aqui para o harness refletir a familia de funcoes no estado em que ela esta.
migration "20261002521230_f59_transition_dispatch_enum_cast.sql"

# A CORRECAO DESTA TAREFA: o cast do CASE de status nas duas rotinas de conclusao.
# Auto-descoberta pelo nome: sem o arquivo, o caso abaixo tem de FALHAR (vermelho).
DRAIN_FIX="$(ls "$migrations_dir"/*_multiplix_drain_enum_cast.sql 2>/dev/null | head -1 || true)"
if [[ -n "$DRAIN_FIX" ]]; then
  migration "$(basename "$DRAIN_FIX")"
else
  printf 'AVISO: a migration de correcao (_multiplix_drain_enum_cast.sql) ainda nao existe - espera-se FALHA (vermelho).\n' >&2
fi

# ==============================================================================
# R2-DB-007 - conclusao de disparo drenado escreve no enum
# ==============================================================================
# Fixture: cada rotina cobre os DOIS ramos do CASE (sem falha -> completed; com falha ->
# completed_with_failures) e o ramo de guarda (fila ainda aberta -> nao conclui).
# As duas rotinas tem contratos diferentes: a legada olha multiplix_recipients; a de itens
# olha multiplix_delivery_items. As duas passam pelo MESMO statement defeituoso.
psql_test >/dev/null <<'SQL'
SET request.jwt.claim.role='service_role';
INSERT INTO public.multiplix_dispatches
  (id, name, message_template, status, created_by, total_recipients, whatsapp_connection_id,
   failed_count, outcome_unknown_count)
VALUES
  ('30000000-0000-0000-0000-0000000d1001','drain legado ok','t','sending','10000000-0000-0000-0000-00000000000a',1,'70000000-0000-0000-0000-000000000001',0,0),
  ('30000000-0000-0000-0000-0000000d1002','drain legado com falhas','t','sending','10000000-0000-0000-0000-00000000000a',1,'70000000-0000-0000-0000-000000000001',1,0),
  ('30000000-0000-0000-0000-0000000d1003','drain legado fila aberta','t','sending','10000000-0000-0000-0000-00000000000a',1,'70000000-0000-0000-0000-000000000001',0,0),
  ('30000000-0000-0000-0000-0000000d1004','drain item ok','t','sending','10000000-0000-0000-0000-00000000000a',1,'70000000-0000-0000-0000-000000000001',0,0),
  ('30000000-0000-0000-0000-0000000d1005','drain item com falhas','t','sending','10000000-0000-0000-0000-00000000000a',1,'70000000-0000-0000-0000-000000000001',1,0),
  ('30000000-0000-0000-0000-0000000d1006','drain item fila aberta','t','sending','10000000-0000-0000-0000-00000000000a',1,'70000000-0000-0000-0000-000000000001',0,0);

INSERT INTO public.multiplix_recipients (id, dispatch_id, company_id, destino_e164, status) VALUES
  ('40000000-0000-0000-0000-0000000d1001','30000000-0000-0000-0000-0000000d1001','50000000-0000-0000-0000-0000000d1001','+5511900000101','sent'),
  ('40000000-0000-0000-0000-0000000d1002','30000000-0000-0000-0000-0000000d1002','50000000-0000-0000-0000-0000000d1002','+5511900000102','failed'),
  ('40000000-0000-0000-0000-0000000d1003','30000000-0000-0000-0000-0000000d1003','50000000-0000-0000-0000-0000000d1003','+5511900000103','pending'),
  ('40000000-0000-0000-0000-0000000d1004','30000000-0000-0000-0000-0000000d1004','50000000-0000-0000-0000-0000000d1004','+5511900000104','sent'),
  ('40000000-0000-0000-0000-0000000d1005','30000000-0000-0000-0000-0000000d1005','50000000-0000-0000-0000-0000000d1005','+5511900000105','failed'),
  ('40000000-0000-0000-0000-0000000d1006','30000000-0000-0000-0000-0000000d1006','50000000-0000-0000-0000-0000000d1006','+5511900000106','sent');

INSERT INTO public.multiplix_blocks (id, dispatch_id, block_order, block_type, template_text) VALUES
  ('60000000-0000-0000-0000-0000000d1004','30000000-0000-0000-0000-0000000d1004',0,'text','b'),
  ('60000000-0000-0000-0000-0000000d1005','30000000-0000-0000-0000-0000000d1005',0,'text','b'),
  ('60000000-0000-0000-0000-0000000d1006','30000000-0000-0000-0000-0000000d1006',0,'text','b');

INSERT INTO public.multiplix_delivery_items
  (id, dispatch_id, recipient_id, block_id, dispatch_version, status) VALUES
  ('80000000-0000-0000-0000-0000000d1004','30000000-0000-0000-0000-0000000d1004','40000000-0000-0000-0000-0000000d1004','60000000-0000-0000-0000-0000000d1004',1,'sent'),
  ('80000000-0000-0000-0000-0000000d1005','30000000-0000-0000-0000-0000000d1005','40000000-0000-0000-0000-0000000d1005','60000000-0000-0000-0000-0000000d1005',1,'failed'),
  ('80000000-0000-0000-0000-0000000d1006','30000000-0000-0000-0000-0000000d1006','40000000-0000-0000-0000-0000000d1006','60000000-0000-0000-0000-0000000d1006',1,'pending');
SQL

estado() { psql_test -Atqc "SELECT status::text || '|' || (completed_at IS NOT NULL)::text FROM public.multiplix_dispatches WHERE id='$1';" 2>&1 | tail -1 || true; }

# -- 1. rotina LEGADA: complete_multiplix_dispatch_if_drained (fila por destinatario) --
r="$(psql_test -Atqc "$service_session SELECT public.complete_multiplix_dispatch_if_drained('30000000-0000-0000-0000-0000000d1001');" 2>&1 | tr '
' ' ' | sed -E 's/^ +| +$//g' || true)"
[[ "$r" == 't' ]] || fail "R2-DB-007.1: concluir disparo drenado SEM falhas nao devolveu true (veio: $r)"
est="$(estado 30000000-0000-0000-0000-0000000d1001)"
[[ "$est" == 'completed|true' ]] || fail "R2-DB-007.1: disparo drenado nao ficou completed com completed_at (veio: $est)"

r="$(psql_test -Atqc "$service_session SELECT public.complete_multiplix_dispatch_if_drained('30000000-0000-0000-0000-0000000d1002');" 2>&1 | tr '
' ' ' | sed -E 's/^ +| +$//g' || true)"
[[ "$r" == 't' ]] || fail "R2-DB-007.2: concluir disparo drenado COM falhas nao devolveu true (veio: $r)"
est="$(estado 30000000-0000-0000-0000-0000000d1002)"
[[ "$est" == 'completed_with_failures|true' ]] || fail "R2-DB-007.2: disparo com falhas nao ficou completed_with_failures (veio: $est)"

# Guarda preservada: com destinatario ainda pending a rotina NAO conclui.
r="$(psql_test -Atqc "$service_session SELECT public.complete_multiplix_dispatch_if_drained('30000000-0000-0000-0000-0000000d1003');" 2>&1 | tr '
' ' ' | sed -E 's/^ +| +$//g' || true)"
[[ "$r" == 'f' ]] || fail "R2-DB-007.3: disparo com fila ABERTA foi concluido (veio: $r)"
est="$(estado 30000000-0000-0000-0000-0000000d1003)"
[[ "$est" == 'sending|false' ]] || fail "R2-DB-007.3: disparo com fila aberta mudou de estado (veio: $est)"

# -- 2. rotina POR ITEM: complete_multiplix_dispatch_if_items_drained --
r="$(psql_test -Atqc "$service_session SELECT public.complete_multiplix_dispatch_if_items_drained('30000000-0000-0000-0000-0000000d1004');" 2>&1 | tr '
' ' ' | sed -E 's/^ +| +$//g' || true)"
[[ "$r" == 't' ]] || fail "R2-DB-007.4: conclusao por item SEM falhas nao devolveu true (veio: $r)"
est="$(estado 30000000-0000-0000-0000-0000000d1004)"
[[ "$est" == 'completed|true' ]] || fail "R2-DB-007.4: disparo drenado (itens) nao ficou completed com completed_at (veio: $est)"

r="$(psql_test -Atqc "$service_session SELECT public.complete_multiplix_dispatch_if_items_drained('30000000-0000-0000-0000-0000000d1005');" 2>&1 | tr '
' ' ' | sed -E 's/^ +| +$//g' || true)"
[[ "$r" == 't' ]] || fail "R2-DB-007.5: conclusao por item COM falhas nao devolveu true (veio: $r)"
est="$(estado 30000000-0000-0000-0000-0000000d1005)"
[[ "$est" == 'completed_with_failures|true' ]] || fail "R2-DB-007.5: disparo (itens) com falhas nao ficou completed_with_failures (veio: $est)"

# Guarda preservada: com item 'pending' a rotina NAO conclui.
r="$(psql_test -Atqc "$service_session SELECT public.complete_multiplix_dispatch_if_items_drained('30000000-0000-0000-0000-0000000d1006');" 2>&1 | tr '
' ' ' | sed -E 's/^ +| +$//g' || true)"
[[ "$r" == 'f' ]] || fail "R2-DB-007.6: disparo com ITEM aberto foi concluido (veio: $r)"
est="$(estado 30000000-0000-0000-0000-0000000d1006)"
[[ "$est" == 'sending|false' ]] || fail "R2-DB-007.6: disparo com item aberto mudou de estado (veio: $est)"

# -- 3. as duas rotinas seguem service_role-only (nao regride o contrato) --
negado="$(psql_test -Atqc "$anon_session SELECT public.complete_multiplix_dispatch_if_drained('30000000-0000-0000-0000-0000000d1001');" 2>&1 | tr '
' ' ' | sed -E 's/^ +| +$//g' || true)"
[[ "$negado" == *permission* || "$negado" == *service_role_required* ]] \
  || fail "R2-DB-007.7: anon conseguiu chamar a rotina de conclusao (veio: $negado)"

# -- 4. o rollback do ARQUIVO roda e devolve de fato o estado anterior --
# Nao basta o rollback ser "existe uma versao antiga em outro arquivo": o bloco tem de
# executar e trazer de volta o corpo que falha. Se o rollback for de fachada, este caso cai.
[[ -n "$DRAIN_FIX" ]] || fail "R2-DB-007.8: sem a migration nao ha rollback a provar (rode depois da correcao)"
ROLLBACK_SQL="$(sed -n 's/^-- rollback: //p' "$DRAIN_FIX")"
[[ -n "$ROLLBACK_SQL" ]] || fail "R2-DB-007.8: a migration nao traz bloco '-- rollback:' executavel"
printf '%s\n' "$ROLLBACK_SQL" | psql_test >/dev/null
psql_test >/dev/null <<'SQL'
SET request.jwt.claim.role='service_role';
UPDATE public.multiplix_dispatches
   SET status = 'sending', completed_at = NULL
 WHERE id = '30000000-0000-0000-0000-0000000d1001';
SQL
volta="$(psql_test -Atqc "$service_session SELECT public.complete_multiplix_dispatch_if_drained('30000000-0000-0000-0000-0000000d1001');" 2>&1 | tr '\n' ' ' || true)"
[[ "$volta" == *'is of type multiplix_dispatch_status but expression is of type text'* ]] \
  || fail "R2-DB-007.8: o rollback nao devolveu o corpo anterior (veio: $volta)"

printf 'PASS: as DUAS rotinas de concluir disparo escrevem no enum real - complete_multiplix_dispatch_if_drained e complete_multiplix_dispatch_if_items_drained concluem drenado sem falhas (completed) e com falhas (completed_with_failures), nao concluem fila aberta e seguem service_role-only; e o rollback do arquivo roda e devolve o corpo anterior (R2-DB-007 / #78)\n'
