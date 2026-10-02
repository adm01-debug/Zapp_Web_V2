#!/usr/bin/env bash
# Harness descartavel: V25 — talkx_campaigns.owner + save_talkx_campaign_draft grava owner.
# Prova: RED antes (coluna owner nao existe);
#        GREEN depois: coluna owner uuid com FK p/ public.profiles(id),
#        RPC grava owner no INSERT e no UPDATE, owner entra na comparacao de
#        idempotencia (replay trocando SOMENTE owner conflita) e a FK rejeita
#        owner que nao existe em public.profiles.
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
fail() { printf '[FALHA] %s\n' "$1" >&2; exit 1; }
psql_test() { docker exec -i "$cid" psql -X -q -v ON_ERROR_STOP=0 -U postgres -d postgres "$@"; }

test_password='talkx_v25_test_only'
cid="talkx-v25-$RANDOM$RANDOM"
cleanup() { if [[ "$cid" =~ ^talkx-v25-[0-9]+$ ]]; then docker rm -f "$cid" >/dev/null 2>&1 || true; fi; }
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

# ---- identificadores do teste ----
profile_a='40000000-0000-0000-0000-00000000000a'
user_a='50000000-0000-0000-0000-00000000000a'
profile_b='40000000-0000-0000-0000-00000000000b'
user_b='50000000-0000-0000-0000-00000000000b'
creation_key='60000000-0000-0000-0000-00000000000c'
creation_key_fk='60000000-0000-0000-0000-00000000000d'
ghost_owner='99999999-9999-9999-9999-999999999999'

# ---- fixtures minimos (o suficiente para a RPC do editor rodar) ----
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
-- Sem a coluna owner: a V25 que a adiciona.
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

-- RPC ANTES da V25: corpo da V23 (nao conhece owner).
CREATE FUNCTION public.save_talkx_campaign_draft(
  p_campaign_id uuid, p_expected_revision bigint, p_creation_key uuid, p_payload jsonb
) RETURNS TABLE(campaign_id uuid, revision bigint, creation_replayed boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $f$
DECLARE v_campaign public.talkx_campaigns%ROWTYPE;
BEGIN
  IF p_campaign_id IS NULL THEN
    INSERT INTO public.talkx_campaigns (name, message_template, objective, audience_source, audience_filters, draft_step, status, created_by, draft_creation_key, revision)
    VALUES (NULLIF(btrim(p_payload ->> 'name'), ''), p_payload ->> 'message_template', p_payload ->> 'objective',
            p_payload ->> 'audience_source', COALESCE(p_payload -> 'audience_filters', '{}'::jsonb),
            NULLIF(p_payload ->> 'draft_step', '')::integer,
            'draft', (SELECT profile.id FROM public.profiles profile WHERE profile.user_id = auth.uid() LIMIT 1), p_creation_key, 1)
    RETURNING * INTO v_campaign;
  ELSE
    UPDATE public.talkx_campaigns campaign SET audience_filters = COALESCE(p_payload -> 'audience_filters', '{}'::jsonb),
      revision = campaign.revision + 1, updated_at = statement_timestamp()
    WHERE campaign.id = p_campaign_id RETURNING * INTO v_campaign;
  END IF;
  RETURN QUERY SELECT v_campaign.id, v_campaign.revision, false;
END;
$f$;

INSERT INTO public.profiles (id, user_id) VALUES
  ('40000000-0000-0000-0000-00000000000a', '50000000-0000-0000-0000-00000000000a'),
  ('40000000-0000-0000-0000-00000000000b', '50000000-0000-0000-0000-00000000000b');
SQL

# ---- RED: a coluna owner nao existe antes da migration ----
red_err="$(psql_test -Atqc "SELECT owner FROM public.talkx_campaigns LIMIT 1" 2>&1 || true)"
[[ "$red_err" == *'does not exist'* ]] || fail "RED: coluna owner deveria nao existir antes da V25 (got $red_err)"

# ---- GREEN: aplica a migration V25 ----
psql_test < "$repo_root/supabase/migrations/20261001271230_talkx_v25_campaign_owner.sql" >/dev/null \
  || fail 'migration V25 nao aplicou (GREEN)'

# Estrutura: coluna owner do tipo uuid
owner_type="$(psql_test -Atqc "SELECT data_type FROM information_schema.columns WHERE table_schema='public' AND table_name='talkx_campaigns' AND column_name='owner'")"
[[ "$owner_type" == 'uuid' ]] || fail "GREEN: coluna owner deveria ser uuid (got '$owner_type')"

# Estrutura: FK de owner -> public.profiles(id), ON DELETE SET NULL
fk_def="$(psql_test -Atqc "SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid='public.talkx_campaigns'::regclass AND contype='f' AND pg_get_constraintdef(oid) ILIKE '%owner%profiles%' LIMIT 1")"
[[ "$fk_def" == *'owner'* && "$fk_def" == *'profiles'* ]] || fail "GREEN: FK de owner para public.profiles ausente (got '$fk_def')"
[[ "$fk_def" == *'ON DELETE SET NULL'* ]] || fail "GREEN: FK de owner deveria ser ON DELETE SET NULL (got '$fk_def')"

# INSERT grava owner (perfil A)
out1="$(psql_test -Atq <<SQL
BEGIN;
SET LOCAL request.jwt.claim.role='authenticated';
SET LOCAL request.jwt.claim.sub='$user_a';
SELECT campaign_id::text || '|' || revision::text || '|' || creation_replayed::text
  FROM public.save_talkx_campaign_draft(NULL, NULL, '$creation_key',
    '{"name":"Rascunho V25","message_template":"oi","objective":"vendas","audience_source":"contacts","audience_filters":{"city":"Recife"},"draft_step":2,"owner":"$profile_a"}'::jsonb);
COMMIT;
SQL
)"
c1_id="${out1%%|*}"; rest="${out1#*|}"; c1_rev="${rest%%|*}"; c1_replay="${rest#*|}"
[[ "$c1_id" =~ ^[0-9a-f-]{36}$ ]] || fail "GREEN: INSERT deveria devolver campaign_id valido (got '$out1')"
[[ "$c1_replay" == 'false' ]] || fail "GREEN: INSERT deveria devolver creation_replayed=false (got '$out1')"

owner1="$(psql_test -Atqc "SELECT owner FROM public.talkx_campaigns WHERE id='$c1_id'")"
[[ "$owner1" == "$profile_a" ]] || fail "GREEN: INSERT deveria gravar owner=perfil A ($profile_a) (got '$owner1')"

# UPDATE grava owner novo (perfil B) — mesma creation key, so o owner muda
out2="$(psql_test -Atq <<SQL
BEGIN;
SET LOCAL request.jwt.claim.role='authenticated';
SET LOCAL request.jwt.claim.sub='$user_a';
SELECT campaign_id::text || '|' || revision::text || '|' || creation_replayed::text
  FROM public.save_talkx_campaign_draft('$c1_id', 1, '$creation_key',
    '{"name":"Rascunho V25","message_template":"oi","objective":"vendas","audience_source":"contacts","audience_filters":{"city":"Recife"},"draft_step":2,"owner":"$profile_b"}'::jsonb);
COMMIT;
SQL
)"
c2_id="${out2%%|*}"; rest="${out2#*|}"; c2_rev="${rest%%|*}"; c2_replay="${rest#*|}"
[[ "$c2_id" == "$c1_id" ]] || fail "GREEN: UPDATE deveria devolver o mesmo campaign_id (got '$out2')"
[[ "$c2_replay" == 'false' ]] || fail "GREEN: UPDATE deveria devolver creation_replayed=false (got '$out2')"

owner2="$(psql_test -Atqc "SELECT owner FROM public.talkx_campaigns WHERE id='$c1_id'")"
[[ "$owner2" == "$profile_b" ]] || fail "GREEN: UPDATE deveria gravar owner=perfil B ($profile_b) (got '$owner2')"

# Revisao: trocar somente o owner entre as duas chamadas avanca a revision
[[ "$c2_rev" =~ ^[0-9]+$ && "$c1_rev" =~ ^[0-9]+$ ]] || fail "GREEN: revisoes deveriam ser inteiras (c1='$c1_rev' c2='$c2_rev')"
[[ "$c2_rev" -gt "$c1_rev" ]] || fail "GREEN: revision da 2a chamada (owner B) deveria ser > 1a (owner A) (got c1=$c1_rev c2=$c2_rev)"

# Idempotencia: replay com o MESMO payload (owner B) nao recalcula nada
out3="$(psql_test -Atq <<SQL
BEGIN;
SET LOCAL request.jwt.claim.role='authenticated';
SET LOCAL request.jwt.claim.sub='$user_a';
SELECT campaign_id::text || '|' || revision::text || '|' || creation_replayed::text
  FROM public.save_talkx_campaign_draft(NULL, NULL, '$creation_key',
    '{"name":"Rascunho V25","message_template":"oi","objective":"vendas","audience_source":"contacts","audience_filters":{"city":"Recife"},"draft_step":2,"owner":"$profile_b"}'::jsonb);
COMMIT;
SQL
)"
c3_rev="${out3#*|}"; c3_rev="${c3_rev%%|*}"; c3_replay="${out3##*|}"
[[ "$c3_replay" == 'true' ]] || fail "GREEN: replay identico deveria devolver creation_replayed=true (got '$out3')"
[[ "$c3_rev" == "$c2_rev" ]] || fail "GREEN: replay identico nao deveria avancar revision (got '$out3')"

# Idempotencia: trocar SOMENTE o owner no replay conta como mudanca (conflito)
conflict_err="$(psql_test -Atq 2>&1 <<SQL || true
BEGIN;
SET LOCAL request.jwt.claim.role='authenticated';
SET LOCAL request.jwt.claim.sub='$user_a';
SELECT campaign_id
  FROM public.save_talkx_campaign_draft(NULL, NULL, '$creation_key',
    '{"name":"Rascunho V25","message_template":"oi","objective":"vendas","audience_source":"contacts","audience_filters":{"city":"Recife"},"draft_step":2,"owner":"$profile_a"}'::jsonb);
COMMIT;
SQL
)"
[[ "$conflict_err" == *'talkx_draft_creation_key_payload_conflict'* ]] || fail "GREEN: replay trocando SOMENTE owner deveria conflitar (got '$conflict_err')"

# Integridade: owner inexistente em public.profiles e rejeitado pela FK
fk_err="$(psql_test -Atq 2>&1 <<SQL || true
BEGIN;
SET LOCAL request.jwt.claim.role='authenticated';
SET LOCAL request.jwt.claim.sub='$user_a';
SELECT campaign_id
  FROM public.save_talkx_campaign_draft(NULL, NULL, '$creation_key_fk',
    '{"name":"Rascunho V25 FK","message_template":"oi","objective":"vendas","audience_source":"contacts","audience_filters":{"city":"Recife"},"draft_step":2,"owner":"$ghost_owner"}'::jsonb);
COMMIT;
SQL
)"
[[ "$fk_err" == *'foreign key'* || "$fk_err" == *'talkx_campaigns_owner_fkey'* ]] || fail "GREEN: owner inexistente deveria violar a FK de owner (got '$fk_err')"

ghost_rows="$(psql_test -Atqc "SELECT count(*) FROM public.talkx_campaigns WHERE name='Rascunho V25 FK'")"
[[ "$ghost_rows" == '0' ]] || fail "GREEN: INSERT com owner inexistente nao deveria criar linha (got $ghost_rows)"

echo '[OK] Talk X V25: talkx_campaigns.owner (uuid, FK->profiles) existe e save_talkx_campaign_draft grava owner no INSERT/UPDATE e na idempotencia.'
