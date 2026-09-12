#!/usr/bin/env bash
set -euo pipefail

repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
migration="$repo_root/supabase/migrations/20260912130000_harden_talkx_draft_save.sql"
postgres_image="${TALKX_DRAFT_SAVE_TEST_POSTGRES_IMAGE:-postgres:17-alpine}"
container_name="talkx-draft-save-test-$$"
test_password="talkx_draft_save_test_only"

cleanup() { docker rm -f "$container_name" >/dev/null 2>&1 || true; }
trap cleanup EXIT
fail() { printf 'FAIL: %s\n' "$1" >&2; exit 1; }
psql_test() { docker exec -i "$container_name" psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres "$@"; }

docker run --rm -d --name "$container_name" -e POSTGRES_PASSWORD="$test_password" "$postgres_image" >/dev/null
for _ in $(seq 1 30); do
  if docker exec "$container_name" psql -X -U postgres -d postgres -Atqc 'SELECT 1' >/dev/null 2>&1; then break; fi
  sleep 1
done
docker exec "$container_name" psql -X -U postgres -d postgres -Atqc 'SELECT 1' >/dev/null 2>&1 || fail 'PostgreSQL de teste não iniciou'

psql_test >/dev/null <<'SQL'
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$
  SELECT COALESCE(NULLIF(current_setting('request.jwt.claim.role', true), ''), current_user)
$$;
CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE ROLE service_role;
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL UNIQUE,
  is_active boolean NOT NULL DEFAULT true
);
CREATE FUNCTION public.get_profile_id_for_user(uuid) RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT id FROM public.profiles WHERE user_id = $1
$$;
CREATE FUNCTION public.is_admin_or_supervisor(uuid) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT false $$;
CREATE FUNCTION public.is_valid_talkx_schedule_timezone(text) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT $1 = 'America/Sao_Paulo' $$;
CREATE TABLE public.whatsapp_connections (
  id uuid PRIMARY KEY,
  status text NOT NULL,
  instance_id text
);
INSERT INTO public.whatsapp_connections (id, status, instance_id) VALUES
  ('50000000-0000-0000-0000-000000000001', 'connected', 'evolution-live'),
  ('50000000-0000-0000-0000-000000000002', 'disconnected', 'evolution-offline'),
  ('50000000-0000-0000-0000-000000000003', 'connected', '   ');
CREATE TABLE public.talkx_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  message_template text NOT NULL,
  variables_config jsonb NOT NULL DEFAULT '[]'::jsonb,
  typing_delay_min integer NOT NULL,
  typing_delay_max integer NOT NULL,
  send_interval_min integer NOT NULL,
  send_interval_max integer NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  total_recipients integer NOT NULL DEFAULT 0,
  sent_count integer NOT NULL DEFAULT 0,
  failed_count integer NOT NULL DEFAULT 0,
  delivered_count integer NOT NULL DEFAULT 0,
  outcome_unknown_count integer NOT NULL DEFAULT 0,
  whatsapp_connection_id uuid,
  created_by uuid,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  description text,
  objective text NOT NULL DEFAULT 'engajamento',
  audience_source text NOT NULL DEFAULT 'contacts',
  audience_filters jsonb NOT NULL DEFAULT '{}'::jsonb,
  segment_id uuid,
  template_id uuid,
  media_url text,
  media_type text,
  scheduled_at timestamptz,
  schedule_timezone text NOT NULL DEFAULT 'America/Sao_Paulo',
  send_window_start time,
  send_window_end time,
  business_hours_only boolean NOT NULL DEFAULT false,
  speed_profile text NOT NULL DEFAULT 'moderate'
);
INSERT INTO public.profiles (id, user_id) VALUES
  ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001'),
  ('10000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000002');
GRANT USAGE ON SCHEMA public, auth TO authenticated;
SQL

psql_test < "$migration" >/dev/null

anon_can_execute="$(psql_test -Atqc "SELECT has_function_privilege('anon', 'public.save_talkx_campaign_draft(uuid, bigint, uuid, jsonb)', 'EXECUTE')")"
authenticated_can_execute="$(psql_test -Atqc "SELECT has_function_privilege('authenticated', 'public.save_talkx_campaign_draft(uuid, bigint, uuid, jsonb)', 'EXECUTE')")"
[[ "$anon_can_execute" == 'f' ]] || fail 'anon recebeu EXECUTE na RPC de rascunho'
[[ "$authenticated_can_execute" == 't' ]] || fail 'authenticated não recebeu EXECUTE na RPC de rascunho'

owner_session="SET ROLE authenticated; SET request.jwt.claim.role='authenticated'; SET request.jwt.claim.sub='20000000-0000-0000-0000-000000000001';"
other_session="SET ROLE authenticated; SET request.jwt.claim.role='authenticated'; SET request.jwt.claim.sub='20000000-0000-0000-0000-000000000002';"
creation_key='30000000-0000-0000-0000-000000000001'
payload='{"name":"Rascunho resiliente","message_template":"Olá {{nome}}","description":null,"objective":"vendas","audience_source":"contacts","audience_filters":{},"segment_id":null,"template_id":null,"whatsapp_connection_id":null,"media_url":null,"media_type":null,"scheduled_at":null,"schedule_timezone":"America/Sao_Paulo","send_window_start":null,"send_window_end":null,"business_hours_only":false,"speed_profile":"moderate","typing_delay_min":1500,"typing_delay_max":4000,"send_interval_min":8000,"send_interval_max":20000}'

first="$(psql_test -Atqc "$owner_session SELECT campaign_id || ':' || revision || ':' || creation_replayed FROM public.save_talkx_campaign_draft(NULL, NULL, '$creation_key'::uuid, '$payload'::jsonb);")"
[[ "$first" == *':1:false' ]] || fail 'primeiro create não criou revisão 1'
campaign_id="${first%%:*}"

replayed="$(psql_test -Atqc "$owner_session SELECT campaign_id || ':' || revision || ':' || creation_replayed FROM public.save_talkx_campaign_draft(NULL, NULL, '$creation_key'::uuid, '$payload'::jsonb);")"
[[ "$replayed" == "$campaign_id:1:true" ]] || fail 'retry idempotente criou outro rascunho ou alterou revisão'
[[ "$(psql_test -Atqc "SELECT count(*) FROM public.talkx_campaigns WHERE created_by='10000000-0000-0000-0000-000000000001'")" == '1' ]] || fail 'mesma chave criou mais de uma campanha'

conflict_payload="${payload/Rascunho resiliente/Rascunho conflitante}"
creation_conflict="$(psql_test -v VERBOSITY=verbose -c "$owner_session SELECT * FROM public.save_talkx_campaign_draft(NULL, NULL, '$creation_key'::uuid, '$conflict_payload'::jsonb);" 2>&1 || true)"
[[ "$creation_conflict" == *talkx_draft_creation_key_payload_conflict* ]] || fail 'retry com payload divergente sobrescreveu ou não sinalizou conflito'

other="$(psql_test -Atqc "$other_session SELECT campaign_id || ':' || revision || ':' || creation_replayed FROM public.save_talkx_campaign_draft(NULL, NULL, '$creation_key'::uuid, '$payload'::jsonb);")"
[[ "${other%%:*}" != "$campaign_id" && "$other" == *':1:false' ]] || fail 'chave de criação vazou entre atores'

updated_payload="${payload/Rascunho resiliente/Rascunho atualizado}"
updated="$(psql_test -Atqc "$owner_session SELECT campaign_id || ':' || revision || ':' || creation_replayed FROM public.save_talkx_campaign_draft('$campaign_id'::uuid, 1, NULL, '$updated_payload'::jsonb);")"
[[ "$updated" == "$campaign_id:2:false" ]] || fail 'update com revisão atual não avançou para revisão 2'
[[ "$(psql_test -Atqc "SELECT name FROM public.talkx_campaigns WHERE id='$campaign_id'")" == 'Rascunho atualizado' ]] || fail 'update não persistiu o payload validado'

stale="$(psql_test -v VERBOSITY=verbose -c "$owner_session SELECT * FROM public.save_talkx_campaign_draft('$campaign_id'::uuid, 1, NULL, '$payload'::jsonb);" 2>&1 || true)"
[[ "$stale" == *talkx_campaign_stale_revision* ]] || fail 'revisão antiga sobrescreveu edição recente'
[[ "$(psql_test -Atqc "SELECT name FROM public.talkx_campaigns WHERE id='$campaign_id'")" == 'Rascunho atualizado' ]] || fail 'tentativa stale alterou o rascunho'

forbidden="$(psql_test -v VERBOSITY=verbose -c "$other_session SELECT * FROM public.save_talkx_campaign_draft('$campaign_id'::uuid, 2, NULL, '$payload'::jsonb);" 2>&1 || true)"
[[ "$forbidden" == *talkx_campaign_not_authorized* ]] || fail 'outro ator editou rascunho alheio'

invalid="$(psql_test -v VERBOSITY=verbose -c "$owner_session SELECT * FROM public.save_talkx_campaign_draft(NULL, NULL, '30000000-0000-0000-0000-000000000009'::uuid, '{\"name\":\"x\"}'::jsonb);" 2>&1 || true)"
[[ "$invalid" == *invalid_talkx_campaign_draft* ]] || fail 'payload incompleto foi aceito'

connected_payload="$(printf '%s' "$payload" | sed 's/"whatsapp_connection_id":null/"whatsapp_connection_id":"50000000-0000-0000-0000-000000000001"/')"
connected="$(psql_test -Atqc "$owner_session SELECT campaign_id || ':' || revision || ':' || creation_replayed FROM public.save_talkx_campaign_draft(NULL, NULL, '30000000-0000-0000-0000-000000000010'::uuid, '$connected_payload'::jsonb);")"
[[ "$connected" == *':1:false' ]] || fail 'conexão WhatsApp viva foi rejeitada'

unavailable_payload="$(printf '%s' "$payload" | sed 's/"whatsapp_connection_id":null/"whatsapp_connection_id":"50000000-0000-0000-0000-000000000002"/')"
unavailable_connection="$(psql_test -v VERBOSITY=verbose -c "$owner_session SELECT * FROM public.save_talkx_campaign_draft(NULL, NULL, '30000000-0000-0000-0000-000000000011'::uuid, '$unavailable_payload'::jsonb);" 2>&1 || true)"
[[ "$unavailable_connection" == *selected_whatsapp_connection_unavailable* ]] || fail 'conexão WhatsApp indisponível foi aceita'

blank_instance_payload="$(printf '%s' "$payload" | sed 's/"whatsapp_connection_id":null/"whatsapp_connection_id":"50000000-0000-0000-0000-000000000003"/')"
blank_instance="$(psql_test -v VERBOSITY=verbose -c "$owner_session SELECT * FROM public.save_talkx_campaign_draft(NULL, NULL, '30000000-0000-0000-0000-000000000012'::uuid, '$blank_instance_payload'::jsonb);" 2>&1 || true)"
[[ "$blank_instance" == *selected_whatsapp_connection_unavailable* ]] || fail 'conexão WhatsApp sem instância foi aceita'

whitespace_payload="$(printf '%s' "$payload" | sed 's/"message_template":"[^"]*"/"message_template":"   "/')"
whitespace_message="$(psql_test -v VERBOSITY=verbose -c "$owner_session SELECT * FROM public.save_talkx_campaign_draft(NULL, NULL, '30000000-0000-0000-0000-000000000013'::uuid, '$whitespace_payload'::jsonb);" 2>&1 || true)"
[[ "$whitespace_message" == *invalid_talkx_campaign_draft* ]] || fail 'mensagem composta apenas de espaços foi aceita'

inactive_profile="$(psql_test -v VERBOSITY=verbose -c "UPDATE public.profiles SET is_active=false WHERE user_id='20000000-0000-0000-0000-000000000001'; $owner_session SELECT * FROM public.save_talkx_campaign_draft(NULL, NULL, '30000000-0000-0000-0000-000000000014'::uuid, '$payload'::jsonb);" 2>&1 || true)"
[[ "$inactive_profile" == *active_profile_not_found* ]] || fail 'perfil inativo ainda conseguiu salvar rascunho'

printf 'PASS: Talk X draft save enforces grants, active identity and live connection, recovers idempotent creates, scopes keys per actor, rejects divergent retries, and fences stale writes\n'
