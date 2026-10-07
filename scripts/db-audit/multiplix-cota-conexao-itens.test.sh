#!/usr/bin/env bash
# MX04 (#48) — "Cota por conexao subconta o novo Multiplix e aceita medicao invalida".
#
# Prova, em PostgreSQL 17 descartavel e com as MIGRATIONS REAIS aplicadas na ordem de
# versao, que a cota por conexao (public.multiplix_connection_daily_usage e
# public.talkx_connection_send_budget):
#   1. conta o ITEM enviado (contrato atual F32/F55: multiplix_delivery_items.sent_at),
#      uma MENSAGEM por bloco — 3 blocos do mesmo destinatario consomem 3, nao 1;
#   2. continua contando o LEGADO (fila por destinatario) sem contar duas vezes quem tem
#      itens;
#   3. e a MESMA fonte para o Talk X (o teto por conexao e compartilhado entre os modulos);
#   4. cobra da primeira conexao conectada o trafego sem conexao carimbada;
#   5. trata medicao invalida com politica explicita (default da funcao) e NUNCA devolve
#      'remaining' ausente ou nao-numerico;
#   6. e o consumidor REAL (o cron F17c) usa esse numero: com a cota exata esgotada, o
#      disparo pausado por daily_limit NAO e retomado; com um envio de folga, e.
#
# As escritas do item usam as RPCs REAIS do worker (claim_multiplix_item ->
# mark_multiplix_item_dispatch_started -> record_multiplix_item_sent), nao INSERT de
# sent_at a mao: e exatamente o carimbo que o worker escreve que a cota deixava de
# enxergar.
#
# Prova do vermelho: MX04_SEM_CORRECAO=true roda a MESMA cadeia sem a migration do MX04
# (todo o resto e identico). O default (usado pelo CI) e false.
set -euo pipefail

repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
migrations_dir="$repo_root/supabase/migrations"
postgres_image="${MX04_COTA_TEST_POSTGRES_IMAGE:-postgres:17-alpine}"
container_name="mx04-cota-test-$$"
test_password="mx04_cota_test_only"
mx04_migration="$migrations_dir/20261006211601_mx04_cota_conexao_itens_e_legado.sql"
MX04_SEM_CORRECAO="${MX04_SEM_CORRECAO:-false}"

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

# ── infraestrutura que o Supabase fornece (auth, vault, cron, pg_net) ───────────
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
-- No Supabase o service_role tem BYPASSRLS: e assim que a edge (service key) escreve
-- direto nas tabelas do modulo sem policy para ele.
ALTER ROLE service_role BYPASSRLS;

GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;

CREATE TYPE public.app_role AS ENUM ('admin', 'supervisor', 'agent', 'special_agent');
CREATE TABLE public.profiles (id uuid PRIMARY KEY, user_id uuid NOT NULL);
CREATE TABLE public.user_roles (user_id uuid NOT NULL, role public.app_role NOT NULL);
CREATE TABLE public.permissions (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text UNIQUE NOT NULL, description text, category text, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.role_permissions (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), role public.app_role NOT NULL, permission_id uuid NOT NULL REFERENCES public.permissions(id), created_at timestamptz NOT NULL DEFAULT now());

CREATE FUNCTION public.is_admin_or_supervisor(_user_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role IN ('admin', 'supervisor'))
$$;
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
CREATE PUBLICATION supabase_realtime;

INSERT INTO public.profiles (id, user_id) VALUES
  ('10000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-00000000000a');
INSERT INTO public.user_roles (user_id, role) VALUES
  ('20000000-0000-0000-0000-00000000000a', 'admin');
GRANT ALL ON public.profiles, public.user_roles, public.role_permissions, public.permissions TO authenticated;
SQL

# ── o modulo do Multiplix como esta na main, na ordem de versao ────────────────
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

# Pre-estado Supabase (privilegios que a migration de hardening depois revoga).
psql_test >/dev/null <<'SQL'
GRANT ALL ON public.multiplix_dispatches, public.multiplix_recipients, public.multiplix_blocks TO anon;
GRANT ALL ON public.multiplix_dispatches, public.multiplix_recipients, public.multiplix_blocks TO authenticated;
GRANT ALL ON public.multiplix_dispatches, public.multiplix_recipients, public.multiplix_blocks TO service_role;
GRANT ALL ON public.talkx_settings, public.talkx_campaigns, public.talkx_recipients TO service_role;
GRANT SELECT ON public.talkx_settings, public.talkx_campaigns, public.talkx_recipients TO authenticated;
SQL

migration "20260929570000_multiplix_hardening_grants_rls_blocks.sql"
migration "20260929580000_multiplix_policies_consolidation.sql"
migration "20260929590000_multiplix_mutability_guard.sql"
migration "20260929600000_multiplix_send_engine_fixes.sql"
# F17: cria public.multiplix_connection_daily_usage (a cota por conexao do Multiplix).
migration "20260929610000_multiplix_cron_window_and_limits.sql"
migration "20260929640000_multiplix_dispatch_manage_all_permission.sql"
# F08 (2a metade): revoga a escrita direta em multiplix_recipients. Entra AQUI porque a
# f30 altera o TIPO da coluna status e o Postgres recusa enquanto a policy
# 'Users can insert recipients into own dispatches' (que usa essa coluna) existir.
migration "20260929850000_multiplix_revoke_recipient_writes.sql"
migration "20260930300000_multiplix_guards_fail_closed.sql"
# F17b/F17c: substitui o corpo de trigger_pending_multiplix_dispatches() pela versao com
# a retomada por cota — e o consumidor real do numero que esta em teste.
migration "20260930560000_f17b_f17c_conexao_unica_e_cota.sql"

# Em producao a tabela de conexoes vem de migrations antigas e a f31 poe FK nela; aqui
# ela nasce minima, com is_default e created_at para distinguir default de primeira connected.
psql_test >/dev/null <<'SQL'
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
CREATE TABLE IF NOT EXISTS public.whatsapp_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  status text NOT NULL DEFAULT 'connected',
  instance_id text,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
INSERT INTO public.whatsapp_connections (id, status, instance_id, is_default, created_at) VALUES
  -- P: a conexao PADRAO, mas NAO e a primeira criada; trafego sem carimbo nao pode
  -- ser cobrado aqui so por is_default.
  ('70000000-0000-0000-0000-000000000001', 'connected', 'inst-padrao', true, statement_timestamp()),
  -- Q: conectada e NAO padrao, criada antes de P; e a primeira connected que o worker
  -- escolheria quando o dispatch ainda nao traz whatsapp_connection_id.
  ('70000000-0000-0000-0000-000000000002', 'connected', 'inst-q', false, statement_timestamp() - interval '1 minute');
SQL

# Modelo v2 do Multiplix: enums (F30), colunas (F31), tabela de itens (F32a) e as RPCs
# da fila por item (F32b) — as RPCs do worker que carimbam sent_at no ITEM.
migration "20261001201230_f30_multiplix_enums_modelo_v2.sql"
migration "20261001211230_f31_multiplix_dispatch_recipient_columns.sql"
migration "20261001221230_f32a_multiplix_delivery_items_table.sql"
migration "20261001231230_f32b_multiplix_item_queue_rpcs.sql"
# F59: a f30 converteu status para enum e deixou transition_multiplix_dispatch com 42804.
# Sem esta migration a retomada do cron falharia dentro do EXCEPTION WHEN OTHERS e o caso
# de cota com folga passaria a falhar por motivo alheio ao MX04.
migration "20261002521230_f59_transition_dispatch_enum_cast.sql"
# X018: cria public.talkx_connection_send_budget (o orcamento compartilhado do Talk X).
migration "20261002551230_talkx_limits_ritmo.sql"

# ── a correcao em teste (MX04) ─────────────────────────────────────────────────
if [[ "$MX04_SEM_CORRECAO" == "true" ]]; then
  printf '  ! MX04_SEM_CORRECAO=true: a migration do MX04 NAO sera aplicada (prova do vermelho)\n' >&2
else
  [[ -f "$mx04_migration" ]] || fail 'migration do MX04 ausente no repositorio'
  migration "$(basename "$mx04_migration")"
fi

service_session="SET ROLE service_role; SET request.jwt.claim.role='service_role';"
anon_session="SET ROLE anon; SET request.jwt.claim.role='anon';"
auth_session="SET ROLE authenticated; SET request.jwt.claim.role='authenticated';"

is_uuid='^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
conn_p='70000000-0000-0000-0000-000000000001'
conn_q='70000000-0000-0000-0000-000000000002'
disp1='30000000-0000-0000-0000-000000000101'
disp_legado='30000000-0000-0000-0000-000000000102'
disp_misto='30000000-0000-0000-0000-000000000103'
disp_nulo='30000000-0000-0000-0000-000000000104'
disp_pausado='30000000-0000-0000-0000-000000000105'
campanha='30000000-0000-0000-0000-000000000201'

# Uso do dia por conexao no formato limit:sent:remaining (o que o worker e o cron leem).
uso_dia() {
  psql_test -Atqc "$service_session WITH u AS (SELECT public.multiplix_connection_daily_usage('$1') AS j) SELECT (j ->> 'limit') || ':' || (j ->> 'sent') || ':' || (j ->> 'remaining') FROM u;" 2>&1 || true
}
# Orcamento do Talk X por conexao no formato day_sent:minute_sent:day_limit.
orcamento() {
  psql_test -Atqc "$service_session WITH b AS (SELECT public.talkx_connection_send_budget('$1') AS j) SELECT (j ->> 'day_sent') || ':' || (j ->> 'minute_sent') || ':' || (j ->> 'day_limit') FROM b;" 2>&1 || true
}
# 'remaining' presente E numerico? (o worker le esse campo e trata ausente como "sem cota")
formato_chave() {
  psql_test -Atqc "$service_session WITH b AS (SELECT public.$2('$1') AS j) SELECT (j ? '$3')::text || ':' || coalesce(jsonb_typeof(j -> '$3'), 'ausente') FROM b;" 2>&1 || true
}
status_dispatch() { psql_test -Atqc "SELECT status || ':' || coalesce(pause_reason, 'null') FROM public.multiplix_dispatches WHERE id = '$1';"; }

# Envio REAL de item pelo caminho do worker: claim -> POST iniciado -> cartimbo 'sent'.
enviar_item() {
  local token
  token="$(psql_test -Atqc "$service_session SELECT claim_token FROM public.claim_multiplix_item('$disp1', '$1', 'mx04-worker', 90);" 2>&1 || true)"
  [[ "$token" =~ $is_uuid ]] || fail "claim do item $1 nao devolveu claim_token (veio: $token)"
  psql_test >/dev/null <<SQL
$service_session
SELECT public.mark_multiplix_item_dispatch_started('$1', '$token'::uuid);
SELECT public.record_multiplix_item_sent('$1', '$token'::uuid, 'ext-$1');
SQL
}

# ── fixture: um disparo com 3 blocos para UM destinatario (3 itens) ────────────
psql_test >/dev/null <<SQL
SET request.jwt.claim.role='service_role';
INSERT INTO public.multiplix_dispatches (id, name, message_template, status, created_by, total_recipients, whatsapp_connection_id)
VALUES ('$disp1', 'MX04 itens', 'Oi {{empresa}}', 'sending', '10000000-0000-0000-0000-00000000000a', 1, '$conn_p');
INSERT INTO public.multiplix_blocks (id, dispatch_id, block_order, block_type, template_text) VALUES
  ('60000000-0000-0000-0000-000000000101', '$disp1', 0, 'text', 'bloco 1'),
  ('60000000-0000-0000-0000-000000000102', '$disp1', 1, 'text', 'bloco 2'),
  ('60000000-0000-0000-0000-000000000103', '$disp1', 2, 'text', 'bloco 3');
INSERT INTO public.multiplix_recipients (id, dispatch_id, company_id, destino_e164, status, created_at) VALUES
  ('40000000-0000-0000-0000-000000000101', '$disp1', '50000000-0000-0000-0000-000000000101', '+551****0101', 'pending', statement_timestamp());
INSERT INTO public.multiplix_delivery_items (id, dispatch_id, recipient_id, block_id, dispatch_version, status) VALUES
  ('80000000-0000-0000-0000-000000000101', '$disp1', '40000000-0000-0000-0000-000000000101', '60000000-0000-0000-0000-000000000101', 1, 'pending'),
  ('80000000-0000-0000-0000-000000000102', '$disp1', '40000000-0000-0000-0000-000000000101', '60000000-0000-0000-0000-000000000102', 1, 'pending'),
  ('80000000-0000-0000-0000-000000000103', '$disp1', '40000000-0000-0000-0000-000000000101', '60000000-0000-0000-0000-000000000103', 1, 'pending');
SQL

echo '(0) objetos e ACL das duas funcoes de cota'
psql_test -Atqc "SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname='public' AND p.proname IN ('multiplix_connection_daily_usage','talkx_connection_send_budget')" | grep -q '^2$' \
  || fail 'funcoes de cota ausentes'
psql_test -Atqc "SELECT has_function_privilege('service_role','public.multiplix_connection_daily_usage(uuid)','EXECUTE')::text || has_function_privilege('anon','public.multiplix_connection_daily_usage(uuid)','EXECUTE')::text || has_function_privilege('authenticated','public.talkx_connection_send_budget(uuid)','EXECUTE')::text" | grep -q '^truefalsefalse$' \
  || fail 'ACL das funcoes de cota divergiu (esperado: service_role sim, anon/authenticated nao)'
psql_test -Atqc "SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname='public' AND p.proname IN ('multiplix_connection_daily_usage','talkx_connection_send_budget') AND p.proacl::text ~ '(\{|,)=X/'" | grep -q '^0$' \
  || fail 'alguma funcao de cota ficou com EXECUTE para PUBLIC'

echo '(1) item enviado entra na cota: 2 de 3 blocos -> sent 2 (antes da correcao: 0)'
enviar_item '80000000-0000-0000-0000-000000000101'
enviar_item '80000000-0000-0000-0000-000000000102'
[[ "$(uso_dia "$conn_p")" == '500:2:498' ]] || fail "cota do dia apos 2 itens: esperado 500:2:498, obtido $(uso_dia "$conn_p")"
[[ "$(orcamento "$conn_p")" == '2:2:500' ]] || fail "orcamento do Talk X apos 2 itens: esperado 2:2:500, obtido $(orcamento "$conn_p")"
[[ "$(formato_chave "$conn_p" multiplix_connection_daily_usage remaining)" == 'true:number' ]] || fail "'remaining' da cota do dia nao veio numerico ($(formato_chave "$conn_p" multiplix_connection_daily_usage remaining))"

echo '(2) N blocos do MESMO destinatario consomem N (mensagem, nao destinatario)'
enviar_item '80000000-0000-0000-0000-000000000103'
[[ "$(psql_test -Atqc "SELECT count(DISTINCT recipient_id) FROM public.multiplix_delivery_items WHERE dispatch_id = '$disp1' AND sent_at IS NOT NULL")" == '1' ]] \
  || fail 'a fixture deveria ter UM destinatario com itens enviados'
[[ "$(uso_dia "$conn_p")" == '500:3:497' ]] || fail "3 blocos de 1 destinatario deveriam consumir 3: obtido $(uso_dia "$conn_p")"

echo '(3) Talk X e Multiplix somam na MESMA conexao (teto compartilhado)'
psql_test >/dev/null <<SQL
SET request.jwt.claim.role='service_role';
INSERT INTO public.talkx_campaigns (id, whatsapp_connection_id) VALUES ('$campanha', '$conn_p');
INSERT INTO public.talkx_recipients (id, campaign_id, sent_at) VALUES
  ('40000000-0000-0000-0000-000000000201', '$campanha', statement_timestamp());
SQL
[[ "$(uso_dia "$conn_p")" == '500:4:496' ]] || fail "Talk X nao somou com o Multiplix: esperado 500:4:496, obtido $(uso_dia "$conn_p")"
[[ "$(orcamento "$conn_p")" == '4:4:500' ]] || fail "orcamento do Talk X deveria ver 4 (3 itens + 1 Talk X): obtido $(orcamento "$conn_p")"

echo '(4) legado (fila por destinatario, sem itens) continua contando'
psql_test >/dev/null <<SQL
SET request.jwt.claim.role='service_role';
INSERT INTO public.multiplix_dispatches (id, name, message_template, status, created_by, total_recipients, whatsapp_connection_id)
VALUES ('$disp_legado', 'MX04 legado', 'Oi', 'completed', '10000000-0000-0000-0000-00000000000a', 4, '$conn_p');
INSERT INTO public.multiplix_recipients (id, dispatch_id, company_id, destino_e164, status, sent_at)
SELECT gen_random_uuid(), '$disp_legado', gen_random_uuid(), '+551****02' || lpad(g::text, 2, '0'), 'sent', statement_timestamp()
  FROM generate_series(1, 4) AS g;
SQL
[[ "$(uso_dia "$conn_p")" == '500:8:492' ]] || fail "legado por destinatario deveria somar 4: esperado 500:8:492, obtido $(uso_dia "$conn_p")"

echo '(5) disparo COM itens nao conta tambem pelos destinatarios (nada duas vezes)'
psql_test >/dev/null <<SQL
SET request.jwt.claim.role='service_role';
INSERT INTO public.multiplix_dispatches (id, name, message_template, status, created_by, total_recipients, whatsapp_connection_id)
VALUES ('$disp_misto', 'MX04 misto', 'Oi', 'completed', '10000000-0000-0000-0000-00000000000a', 1, '$conn_p');
INSERT INTO public.multiplix_recipients (id, dispatch_id, company_id, destino_e164, status, sent_at) VALUES
  ('40000000-0000-0000-0000-000000000103', '$disp_misto', '50000000-0000-0000-0000-000000000103', '+551****0103', 'sent', statement_timestamp()),
  ('40000000-0000-0000-0000-000000000104', '$disp_misto', '50000000-0000-0000-0000-000000000104', '+551****0104', 'sent', statement_timestamp());
INSERT INTO public.multiplix_blocks (id, dispatch_id, block_order, block_type, template_text) VALUES
  ('60000000-0000-0000-0000-000000000104', '$disp_misto', 0, 'text', 'bloco misto');
INSERT INTO public.multiplix_delivery_items (id, dispatch_id, recipient_id, block_id, dispatch_version, status, sent_at) VALUES
  ('80000000-0000-0000-0000-000000000104', '$disp_misto', '40000000-0000-0000-0000-000000000103', '60000000-0000-0000-0000-000000000104', 1, 'sent', statement_timestamp());
SQL
# 2 destinatarios carimbados + 1 item carimbado no MESMO disparo = 1, nao 3.
[[ "$(uso_dia "$conn_p")" == '500:9:491' ]] || fail "disparo com itens contou duas vezes: esperado 500:9:491, obtido $(uso_dia "$conn_p")"

echo '(6) consumo e por conexao: a conexao Q (nao envolvida) segue zerada'
[[ "$(uso_dia "$conn_q")" == '500:0:500' ]] || fail "conexao sem trafego deveria estar zerada: obtido $(uso_dia "$conn_q")"

echo '(7) disparo SEM conexao carimbada consome a primeira conexao conectada, nao a default'
psql_test >/dev/null <<SQL
SET request.jwt.claim.role='service_role';
INSERT INTO public.multiplix_dispatches (id, name, message_template, status, created_by, total_recipients, whatsapp_connection_id)
VALUES ('$disp_nulo', 'MX04 sem conexao', 'Oi', 'completed', '10000000-0000-0000-0000-00000000000a', 1, NULL);
INSERT INTO public.multiplix_recipients (id, dispatch_id, company_id, destino_e164, status) VALUES
  ('40000000-0000-0000-0000-000000000105', '$disp_nulo', '50000000-0000-0000-0000-000000000105', '+551****0105', 'pending');
INSERT INTO public.multiplix_blocks (id, dispatch_id, block_order, block_type, template_text) VALUES
  ('60000000-0000-0000-0000-000000000105', '$disp_nulo', 0, 'text', 'bloco sem conexao'),
  ('60000000-0000-0000-0000-000000000106', '$disp_nulo', 1, 'text', 'bloco sem conexao 2');
INSERT INTO public.multiplix_delivery_items (id, dispatch_id, recipient_id, block_id, dispatch_version, status, sent_at) VALUES
  ('80000000-0000-0000-0000-000000000105', '$disp_nulo', '40000000-0000-0000-0000-000000000105', '60000000-0000-0000-0000-000000000105', 1, 'sent', statement_timestamp()),
  ('80000000-0000-0000-0000-000000000106', '$disp_nulo', '40000000-0000-0000-0000-000000000105', '60000000-0000-0000-0000-000000000106', 1, 'sent', statement_timestamp());
SQL
[[ "$(uso_dia "$conn_p")" == '500:9:491' ]] || fail "trafego sem conexao foi cobrado da conexao default por engano: esperado 500:9:491, obtido $(uso_dia "$conn_p")"
[[ "$(uso_dia "$conn_q")" == '500:2:498' ]] || fail "trafego sem conexao nao foi cobrado da primeira conectada (Q): esperado 500:2:498, obtido $(uso_dia "$conn_q")"

echo '(8) mesmo numero em duas leituras (reinvocacao nao renova saldo aparente)'
[[ "$(uso_dia "$conn_p")" == "$(uso_dia "$conn_p")" ]] || fail 'duas leituras seguidas divergiram'
[[ "$(orcamento "$conn_p")" == "$(orcamento "$conn_p")" ]] || fail 'duas leituras seguidas do orcamento divergiram'

echo '(9) limite exato esgota a cota e o cron NAO retoma o disparo pausado por daily_limit'
psql_test >/dev/null <<SQL
SET request.jwt.claim.role='service_role';
UPDATE public.multiplix_dispatches SET status = 'completed' WHERE status = 'sending';
UPDATE public.talkx_settings SET value = '9'::jsonb WHERE key = 'daily_limit_per_connection';
INSERT INTO public.multiplix_dispatches (id, name, message_template, status, created_by, total_recipients, pause_reason, whatsapp_connection_id)
VALUES ('$disp_pausado', 'MX04 pausado por cota', 'Oi', 'paused', '10000000-0000-0000-0000-00000000000a', 1, 'daily_limit', '$conn_p');
-- A retomada (transition_multiplix_dispatch 'start') exige destinatario para o disparo:
-- sem esta linha o cron falharia por 'multiplix_dispatch_recipients_required' e o caso
-- passaria/falharia por motivo alheio a cota.
INSERT INTO public.multiplix_recipients (id, dispatch_id, company_id, destino_e164, status) VALUES
  ('40000000-0000-0000-0000-000000000106', '$disp_pausado', '50000000-0000-0000-0000-000000000106', '+551****0106', 'pending');
SQL
[[ "$(uso_dia "$conn_p")" == '9:9:0' ]] || fail "no limite exato o remaining deveria ser 0: obtido $(uso_dia "$conn_p")"
psql_test >/dev/null <<SQL
SET request.jwt.claim.role='service_role';
SELECT public.trigger_pending_multiplix_dispatches();
SQL
[[ "$(status_dispatch "$disp_pausado")" == 'paused:daily_limit' ]] \
  || fail "F17c: disparo foi retomado com a cota do dia esgotada (status: $(status_dispatch "$disp_pausado"))"

echo '(10) com um envio de folga o MESMO cron retoma o disparo'
psql_test -Atqc "UPDATE public.talkx_settings SET value = '10'::jsonb WHERE key = 'daily_limit_per_connection';" >/dev/null
[[ "$(uso_dia "$conn_p")" == '10:9:1' ]] || fail "com folga o remaining deveria ser 1: obtido $(uso_dia "$conn_p")"
psql_test >/dev/null <<SQL
SET request.jwt.claim.role='service_role';
SELECT public.trigger_pending_multiplix_dispatches();
SQL
[[ "$(status_dispatch "$disp_pausado")" == 'sending:null' ]] \
  || fail "F17c: disparo pausado por cota nao retomou com remaining > 0 (status: $(status_dispatch "$disp_pausado"))"

echo '(11) medicao invalida: politica explicita (default da funcao) e remaining sempre numerico'
psql_test >/dev/null <<SQL
INSERT INTO public.talkx_settings (key, value, description) VALUES
  ('max_per_minute_per_connection', '6'::jsonb, 'Teto de mensagens por minuto por conexão WhatsApp (Talk X + Multiplix)')
ON CONFLICT (key) DO UPDATE SET value = excluded.value, description = excluded.description;
UPDATE public.talkx_settings SET value = '3000000000'::jsonb WHERE key = 'daily_limit_per_connection';
UPDATE public.talkx_settings SET value = '3000000000'::jsonb WHERE key = 'max_per_minute_per_connection';
SQL
# Multiplix: teto gigante fora de integer seguro -> default 0 (fail-closed); antes da
# correcao a chamada inteira levantava 22003 (integer out of range).
[[ "$(uso_dia "$conn_p")" == '0:9:0' ]] || fail "teto gigante deveria fechar em 0 (fail-closed): obtido $(uso_dia "$conn_p")"
[[ "$(formato_chave "$conn_p" multiplix_connection_daily_usage remaining)" == 'true:number' ]] || fail "'remaining' ausente/nao-numerico com teto gigante ($(formato_chave "$conn_p" multiplix_connection_daily_usage remaining))"
# Talk X: teto gigante -> default documentado da funcao (6/minuto, 500/dia).
[[ "$(orcamento "$conn_p")" == '9:9:500' ]] || fail "defaults do orcamento com medicao invalida divergiram: obtido $(orcamento "$conn_p")"
psql_test -Atqc "$service_session WITH b AS (SELECT public.talkx_connection_send_budget('$conn_p') AS j) SELECT (j ? 'day_remaining')::text || ':' || jsonb_typeof(j -> 'day_remaining') || ':' || jsonb_typeof(j -> 'minute_remaining') || ':' || ((j ->> 'minute_limit')::int)::text FROM b;" | grep -q '^true:number:number:6$' \
  || fail 'orcamento com medicao invalida devolveu remaining ausente ou limite de minuto fora do default 6'
psql_test -Atqc "UPDATE public.talkx_settings SET value = '500'::jsonb WHERE key = 'daily_limit_per_connection'; UPDATE public.talkx_settings SET value = '6'::jsonb WHERE key = 'max_per_minute_per_connection';" >/dev/null
[[ "$(uso_dia "$conn_p")" == '500:9:491' ]] || fail "cotas restauradas divergiram: obtido $(uso_dia "$conn_p")"

echo '(12) quem nao e service_role nao le nem executa a cota'
for sessao in "$anon_session" "$auth_session"; do
  erro="$(psql_test -Atqc "$sessao SELECT public.multiplix_connection_daily_usage('$conn_p');" 2>&1 || true)"
  [[ "$erro" == *"permission denied"* || "$erro" == *"42501"* ]] \
    || fail "papel da API conseguiu executar a cota (resposta: $erro)"
  erro="$(psql_test -Atqc "$sessao SELECT public.talkx_connection_send_budget('$conn_p');" 2>&1 || true)"
  [[ "$erro" == *"permission denied"* || "$erro" == *"42501"* ]] \
    || fail "papel da API conseguiu executar o orcamento do Talk X (resposta: $erro)"
done

printf 'PASS: MX04 — cota por conexao soma ITENS (1 por mensagem), legado sem contar duas vezes, teto compartilhado com o Talk X, trafego sem conexao cobrado da primeira conectada, medicao invalida fail-closed com remaining sempre numerico, e o cron F17c adia o proximo envio no limite exato\n'
