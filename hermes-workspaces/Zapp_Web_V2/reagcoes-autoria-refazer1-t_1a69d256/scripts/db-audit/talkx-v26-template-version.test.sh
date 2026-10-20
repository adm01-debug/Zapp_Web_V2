#!/usr/bin/env bash
# Harness descartavel: V26 — talkx_campaigns.template_version_id + save_talkx_campaign_draft grava a versao.
# Prova: RED antes (coluna template_version_id nao existe);
#        GREEN depois: coluna template_version_id uuid com FK p/ public.talkx_template_versions(id),
#        RPC grava template_version_id no INSERT e no UPDATE, template_version_id entra na
#        comparacao de idempotencia (replay trocando SOMENTE template_version_id conflita),
#        a FK rejeita versao inexistente e ON DELETE SET NULL zera a coluna quando a
#        versao referenciada e apagada.
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
fail() { printf '[FALHA] %s\n' "$1" >&2; exit 1; }
psql_test() { docker exec -i "$cid" psql -X -q -v ON_ERROR_STOP=0 -U postgres -d postgres "$@"; }

test_password='talkx_v26_test_only'
cid="talkx-v26-$RANDOM$RANDOM"
cleanup() { if [[ "$cid" =~ ^talkx-v26-[0-9]+$ ]]; then docker rm -f "$cid" >/dev/null 2>&1 || true; fi; }
trap cleanup EXIT INT TERM

command -v docker >/dev/null 2>&1 || fail 'Docker nao esta instalado'
docker info >/dev/null 2>&1 || fail 'Docker daemon nao acessivel'
docker run --rm -d --name "$cid" -e POSTGRES_PASSWORD="$test_password" postgres:17-alpine >/dev/null

ready=false
for _ in $(seq 1 90); do
  markers="$(docker logs "$cid" 2>&1 | grep -c 'database system is ready to accept connections' || true)"
  if [[ "$markers" -ge 2 ]] && docker exec "$cid" psql -X -U postgres -d postgres -Atqc 'SELECT 1' >/dev/null 2>&1; then
    ready=true; break
  fi
  sleep 1
done
[[ "$ready" == true ]] || fail 'PostgreSQL 17 descartavel nao ficou pronto'

# ---- identificadores do teste ---- #
profile_a='40000000-0000-0000-0000-00000000000a'
user_a='50000000-0000-0000-0000-00000000000a'
creation_key='60000000-0000-0000-0000-00000000000c'
creation_key_fk='60000000-0000-0000-0000-00000000000d'
template_id='70000000-0000-0000-0000-000000000001'
version_1='80000000-0000-0000-0000-000000000001'
version_2='80000000-0000-0000-0000-000000000002'
ghost_version='99999999-9999-9999-9999-999999999999'

# ---- fixtures minimos (o suficiente para a RPC do editor rodar) ---- #
psql_test >/dev/null <<'SQL'
CREATE SCHEMA auth;
GRANT USAGE ON SCHEMA auth TO PUBLIC;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.role', true), '')::text
$$;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
CREATE ROLE service_role NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE anon NOLOGIN;

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  is_active boolean NOT NULL DEFAULT true
);
CREATE TABLE public.whatsapp_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  status text NOT NULL DEFAULT 'connected',
  instance_id text
);
-- Templates + versoes (a FK da V26 aponta para talkx_template_versions.id).
CREATE TABLE public.talkx_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL
);
CREATE TABLE public.talkx_template_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES public.talkx_templates(id) ON DELETE CASCADE,
  version_number integer NOT NULL,
  name text NOT NULL,
  content text NOT NULL,
  category text NOT NULL DEFAULT 'marketing',
  status text NOT NULL DEFAULT 'draft',
  media_url text,
  media_type text,
  tags text[] NOT NULL DEFAULT '{}',
  custom_variables text[] NOT NULL DEFAULT '{}',
  saved_by uuid,
  created_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  description text
);
-- talkx_campaigns ja com owner (V25 aplicada), SEM template_version_id: e a V26 que a adiciona.
CREATE TABLE public.talkx_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  message_template text NOT NULL,
  description text,
  objective text NOT NULL DEFAULT 'engajamento',
  audience_source text NOT NULL DEFAULT 'contacts',
  audience_filters jsonb NOT NULL DEFAULT '{}'::jsonb,
  segment_id uuid,
  template_id uuid,
  whatsapp_connection_id uuid,
  media_url text,
  media_type text,
  scheduled_at timestamptz,
  schedule_timezone text NOT NULL DEFAULT 'America/Sao_Paulo',
  send_window_start time,
  send_window_end time,
  business_hours_only boolean NOT NULL DEFAULT false,
  speed_profile text NOT NULL DEFAULT 'moderate',
  typing_delay_min integer NOT NULL DEFAULT 1500,
  typing_delay_max integer NOT NULL DEFAULT 4000,
  send_interval_min integer NOT NULL DEFAULT 8000,
  send_interval_max integer NOT NULL DEFAULT 20000,
  respect_suppression boolean NOT NULL DEFAULT true,
  confirm_consent boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'draft',
  created_by uuid,
  draft_creation_key uuid,
  draft_step integer,
  owner uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  revision bigint NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT statement_timestamp()
);
CREATE UNIQUE INDEX talkx_campaigns_creation_key_uniq
  ON public.talkx_campaigns (created_by, draft_creation_key)
  WHERE draft_creation_key IS NOT NULL;
CREATE FUNCTION public.is_admin_or_supervisor(p_user uuid) RETURNS boolean
  LANGUAGE sql STABLE AS $$ SELECT true $$;
CREATE FUNCTION public.is_valid_talkx_schedule_timezone(p_tz text) RETURNS boolean
  LANGUAGE sql STABLE AS $$ SELECT p_tz ~ '^[A-Za-z]+/[A-Za-z_]+$' $$;

-- Stub da RPC ANTES da V26: mesma assinatura, mas nao conhece template_version_id.
-- (A V26 substitui este corpo por CREATE OR REPLACE.)
CREATE FUNCTION public.save_talkx_campaign_draft(
  p_campaign_id uuid, p_expected_revision bigint, p_creation_key uuid, p_payload jsonb
) RETURNS TABLE(campaign_id uuid, revision bigint, creation_replayed boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $f$
BEGIN
  RAISE EXCEPTION 'talkx_v26_stub_rpc_nao_substituida' USING ERRCODE = '0A000';
END;
$f$;

INSERT INTO public.profiles (id, user_id) VALUES
  ('40000000-0000-0000-0000-00000000000a', '50000000-0000-0000-0000-00000000000a');

INSERT INTO public.talkx_templates (id, name) VALUES
  ('70000000-0000-0000-0000-000000000001', 'Template V26');

INSERT INTO public.talkx_template_versions
  (id, template_id, version_number, name, content, category, status, tags, custom_variables)
VALUES
  ('80000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000001', 1,
   'Boas-vindas v1', 'Ola {{nome}}', 'marketing', 'approved', '{}', '{"nome"}'),
  ('80000000-0000-0000-0000-000000000002', '70000000-0000-0000-0000-000000000001', 2,
   'Boas-vindas v2', 'Oi {{nome}}!', 'marketing', 'approved', '{}', '{"nome"}');
SQL

# ---- RED: a coluna template_version_id nao existe antes da migration ---- #
red_err="$(psql_test -Atqc "SELECT template_version_id FROM public.talkx_campaigns LIMIT 1" 2>&1 || true)"
[[ "$red_err" == *'does not exist'* ]] || fail "RED: coluna template_version_id deveria nao existir antes da V26 (got $red_err)"

# ---- GREEN: aplica a migration V26 ---- #
psql_test < "$repo_root/supabase/migrations/20261001291230_talkx_v26_template_version.sql" >/dev/null \
  || fail 'migration V26 nao aplicou (GREEN)'

# Estrutura: coluna template_version_id do tipo uuid
col_type="$(psql_test -Atqc "SELECT data_type FROM information_schema.columns WHERE table_schema='public' AND table_name='talkx_campaigns' AND column_name='template_version_id'")"
[[ "$col_type" == 'uuid' ]] || fail "GREEN: coluna template_version_id deveria ser uuid (got '$col_type')"

# Estrutura: FK de template_version_id -> public.talkx_template_versions(id), ON DELETE SET NULL
fk_def="$(psql_test -Atqc "SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid='public.talkx_campaigns'::regclass AND contype='f' AND pg_get_constraintdef(oid) ILIKE '%template_version_id%talkx_template_versions%' LIMIT 1")"
[[ "$fk_def" == *'template_version_id'* && "$fk_def" == *'talkx_template_versions'* ]] || fail "GREEN: FK de template_version_id para public.talkx_template_versions ausente (got '$fk_def')"
[[ "$fk_def" == *'ON DELETE SET NULL'* ]] || fail "GREEN: FK de template_version_id deveria ser ON DELETE SET NULL (got '$fk_def')"

# INSERT grava template_version_id (versao 1)
out1="$(psql_test -Atq <<SQL
BEGIN;
SET LOCAL request.jwt.claim.role='authenticated';
SET LOCAL request.jwt.claim.sub='$user_a';
SELECT campaign_id::text || '|' || revision::text || '|' || creation_replayed::text
  FROM public.save_talkx_campaign_draft(NULL, NULL, '$creation_key',
    '{"name":"Rascunho V26","message_template":"oi","objective":"vendas","audience_source":"contacts","audience_filters":{"city":"Recife"},"draft_step":2,"template_version_id":"$version_1"}'::jsonb);
COMMIT;
SQL
)"
c1_id="${out1%%|*}"; rest="${out1#*|}"; c1_rev="${rest%%|*}"; c1_replay="${rest#*|}"
[[ "$c1_id" =~ ^[0-9a-f-]{36}$ ]] || fail "GREEN: INSERT deveria devolver campaign_id valido (got '$out1')"
[[ "$c1_replay" == 'false' ]] || fail "GREEN: INSERT deveria devolver creation_replayed=false (got '$out1')"

ver1="$(psql_test -Atqc "SELECT template_version_id FROM public.talkx_campaigns WHERE id='$c1_id'")"
[[ "$ver1" == "$version_1" ]] || fail "GREEN: INSERT deveria gravar template_version_id=versao 1 ($version_1) (got '$ver1')"

# UPDATE grava template_version_id novo (versao 2) — mesma creation key, so a versao muda
out2="$(psql_test -Atq <<SQL
BEGIN;
SET LOCAL request.jwt.claim.role='authenticated';
SET LOCAL request.jwt.claim.sub='$user_a';
SELECT campaign_id::text || '|' || revision::text || '|' || creation_replayed::text
  FROM public.save_talkx_campaign_draft('$c1_id', 1, '$creation_key',
    '{"name":"Rascunho V26","message_template":"oi","objective":"vendas","audience_source":"contacts","audience_filters":{"city":"Recife"},"draft_step":2,"template_version_id":"$version_2"}'::jsonb);
COMMIT;
SQL
)"
c2_id="${out2%%|*}"; rest="${out2#*|}"; c2_rev="${rest%%|*}"; c2_replay="${rest#*|}"
[[ "$c2_id" == "$c1_id" ]] || fail "GREEN: UPDATE deveria devolver o mesmo campaign_id (got '$out2')"
[[ "$c2_replay" == 'false' ]] || fail "GREEN: UPDATE deveria devolver creation_replayed=false (got '$out2')"

ver2="$(psql_test -Atqc "SELECT template_version_id FROM public.talkx_campaigns WHERE id='$c1_id'")"
[[ "$ver2" == "$version_2" ]] || fail "GREEN: UPDATE deveria gravar template_version_id=versao 2 ($version_2) (got '$ver2')"

# Revisao: trocar somente a versao entre as duas chamadas avanca a revision
[[ "$c1_rev" =~ ^[0-9]+$ && "$c2_rev" =~ ^[0-9]+$ ]] || fail "GREEN: revisoes deveriam ser inteiras (c1='$c1_rev' c2='$c2_rev')"
[[ "$c2_rev" -gt "$c1_rev" ]] || fail "GREEN: revision da 2a chamada (versao 2) deveria ser > 1a (versao 1) (got c1=$c1_rev c2=$c2_rev)"

# Idempotencia: replay com o MESMO payload (versao 2) nao recalcula nada
out3="$(psql_test -Atq <<SQL
BEGIN;
SET LOCAL request.jwt.claim.role='authenticated';
SET LOCAL request.jwt.claim.sub='$user_a';
SELECT campaign_id::text || '|' || revision::text || '|' || creation_replayed::text
  FROM public.save_talkx_campaign_draft(NULL, NULL, '$creation_key',
    '{"name":"Rascunho V26","message_template":"oi","objective":"vendas","audience_source":"contacts","audience_filters":{"city":"Recife"},"draft_step":2,"template_version_id":"$version_2"}'::jsonb);
COMMIT;
SQL
)"
c3_rev="${out3#*|}"; c3_rev="${c3_rev%%|*}"; c3_replay="${out3##*|}"
[[ "$c3_replay" == 'true' ]] || fail "GREEN: replay identico deveria devolver creation_replayed=true (got '$out3')"
[[ "$c3_rev" == "$c2_rev" ]] || fail "GREEN: replay identico nao deveria avancar revision (got '$out3')"

# Idempotencia: trocar SOMENTE template_version_id no replay conta como mudanca (conflito)
conflict_err="$(psql_test -Atq 2>&1 <<SQL || true
BEGIN;
SET LOCAL request.jwt.claim.role='authenticated';
SET LOCAL request.jwt.claim.sub='$user_a';
SELECT campaign_id
  FROM public.save_talkx_campaign_draft(NULL, NULL, '$creation_key',
    '{"name":"Rascunho V26","message_template":"oi","objective":"vendas","audience_source":"contacts","audience_filters":{"city":"Recife"},"draft_step":2,"template_version_id":"$version_1"}'::jsonb);
COMMIT;
SQL
)"
[[ "$conflict_err" == *'talkx_draft_creation_key_payload_conflict'* ]] || fail "GREEN: replay trocando SOMENTE template_version_id deveria conflitar (got '$conflict_err')"

# Integridade: template_version_id inexistente e rejeitado pela FK
fk_err="$(psql_test -Atq 2>&1 <<SQL || true
BEGIN;
SET LOCAL request.jwt.claim.role='authenticated';
SET LOCAL request.jwt.claim.sub='$user_a';
SELECT campaign_id
  FROM public.save_talkx_campaign_draft(NULL, NULL, '$creation_key_fk',
    '{"name":"Rascunho V26 FK","message_template":"oi","objective":"vendas","audience_source":"contacts","audience_filters":{"city":"Recife"},"draft_step":2,"template_version_id":"$ghost_version"}'::jsonb);
COMMIT;
SQL
)"
[[ "$fk_err" == *'foreign key'* || "$fk_err" == *'talkx_campaigns_template_version_id_fkey'* ]] || fail "GREEN: template_version_id inexistente deveria violar a FK (got '$fk_err')"

ghost_rows="$(psql_test -Atqc "SELECT count(*) FROM public.talkx_campaigns WHERE name='Rascunho V26 FK'")"
[[ "$ghost_rows" == '0' ]] || fail "GREEN: INSERT com template_version_id inexistente nao deveria criar linha (got $ghost_rows)"

# ON DELETE SET NULL: apagar a versao referenciada (versao 2) zera a coluna, sem quebrar
psql_test -Atqc "DELETE FROM public.talkx_template_versions WHERE id='$version_2'" >/dev/null
gone="$(psql_test -Atqc "SELECT count(*) FROM public.talkx_template_versions WHERE id='$version_2'")"
[[ "$gone" == '0' ]] || fail "GREEN: a versao 2 deveria ter sido apagada (got rows=$gone)"
after="$(psql_test -Atqc "SELECT COALESCE(template_version_id::text, 'NULL') FROM public.talkx_campaigns WHERE id='$c1_id'")"
[[ "$after" == 'NULL' ]] || fail "GREEN: ON DELETE SET NULL deveria zerar template_version_id apos apagar a versao 2 (got '$after')"

echo '[OK] Talk X V26: talkx_campaigns.template_version_id (uuid, FK->talkx_template_versions, ON DELETE SET NULL) existe e save_talkx_campaign_draft grava a versao no INSERT/UPDATE e na idempotencia.'
