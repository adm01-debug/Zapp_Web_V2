#!/usr/bin/env bash
# Harness descartável: V23 — rascunho restaura filtros e passo (coluna draft_step).
# Prova: antes da migration a coluna nao existe (RED);
#        depois, save_talkx_campaign_draft grava draft_step no INSERT e no UPDATE,
#        rejeita passo fora de 1..4 e o CHECK do banco idem.
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
fail() { printf '[FAIL] %s\n' "$1" >&2; exit 1; }
psql_test() { docker exec -i "$cid" psql -X -q -v ON_ERROR_STOP=0 -U postgres -d postgres "$@"; }

test_password='talkx_v23_test_only'
cid="talkx-v23-$RANDOM$RANDOM"
cleanup() { if [[ "$cid" =~ ^talkx-v23-[0-9]+$ ]]; then docker rm -f "$cid" >/dev/null 2>&1 || true; fi; }
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

-- RPC ANTES da V23: aceita o payload mas nao conhece draft_step.
CREATE FUNCTION public.save_talkx_campaign_draft(
  p_campaign_id uuid, p_expected_revision bigint, p_creation_key uuid, p_payload jsonb
) RETURNS TABLE(campaign_id uuid, revision bigint, creation_replayed boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $f$
DECLARE v_campaign public.talkx_campaigns%ROWTYPE;
BEGIN
  IF p_campaign_id IS NULL THEN
    INSERT INTO public.talkx_campaigns (name, message_template, objective, audience_source, audience_filters, status, created_by, draft_creation_key, revision)
    VALUES (NULLIF(btrim(p_payload ->> 'name'), ''), p_payload ->> 'message_template', p_payload ->> 'objective',
            p_payload ->> 'audience_source', COALESCE(p_payload -> 'audience_filters', '{}'::jsonb),
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

INSERT INTO public.profiles (id, user_id) VALUES ('40000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001');
SQL

# ---- RED: a coluna draft_step nao existe antes da migration ----
red_err="$(psql_test -Atqc "SELECT draft_step FROM public.talkx_campaigns LIMIT 1" 2>&1 || true)"
[[ "$red_err" == *'does not exist'* ]] || fail "RED: coluna draft_step deveria nao existir antes da V23 (got $red_err)"

# ---- GREEN: aplica a migration V23 ----
psql_test < "$repo_root/supabase/migrations/20260930770000_talkx_v23_draft_step.sql" >/dev/null \
  || fail 'migration V23 nao aplicou (GREEN)'

# INSERT grava o passo
psql_test -Atqc "BEGIN; SET LOCAL request.jwt.claim.role='authenticated'; SET LOCAL request.jwt.claim.sub='50000000-0000-0000-0000-000000000001'; SELECT campaign_id FROM public.save_talkx_campaign_draft(NULL, NULL, '60000000-0000-0000-0000-000000000001', '{\"name\":\"Rascunho V23\",\"message_template\":\"oi\",\"objective\":\"vendas\",\"audience_source\":\"contacts\",\"audience_filters\":{\"city\":\"Recife\"},\"draft_step\":3}'::jsonb); COMMIT;" | tail -1 >/dev/null

inserted_step="$(psql_test -Atqc "SELECT draft_step FROM public.talkx_campaigns WHERE name='Rascunho V23'")"
[[ "$inserted_step" == '3' ]] || fail "GREEN: INSERT deveria gravar draft_step=3 (got $inserted_step)"

filters_ok="$(psql_test -Atqc "SELECT audience_filters ->> 'city' FROM public.talkx_campaigns WHERE name='Rascunho V23'")"
[[ "$filters_ok" == 'Recife' ]] || fail "GREEN: audience_filters deveria preservar city=Recife (got $filters_ok)"

# UPDATE grava o passo novo
campaign_id="$(psql_test -Atqc "SELECT id FROM public.talkx_campaigns WHERE name='Rascunho V23'")"
psql_test -Atqc "BEGIN; SET LOCAL request.jwt.claim.role='authenticated'; SET LOCAL request.jwt.claim.sub='50000000-0000-0000-0000-000000000001'; SELECT campaign_id FROM public.save_talkx_campaign_draft('$campaign_id', 1, NULL, '{\"name\":\"Rascunho V23\",\"message_template\":\"oi\",\"objective\":\"vendas\",\"audience_source\":\"contacts\",\"audience_filters\":{\"city\":\"Recife\"},\"draft_step\":2}'::jsonb); COMMIT;" >/dev/null

updated_step="$(psql_test -Atqc "SELECT draft_step FROM public.talkx_campaigns WHERE id='$campaign_id'")"
[[ "$updated_step" == '2' ]] || fail "GREEN: UPDATE deveria gravar draft_step=2 (got $updated_step)"

# passo invalido pela RPC
invalid_err="$(psql_test -Atqc "BEGIN; SET LOCAL request.jwt.claim.role='authenticated'; SET LOCAL request.jwt.claim.sub='50000000-0000-0000-0000-000000000001'; SELECT campaign_id FROM public.save_talkx_campaign_draft('$campaign_id', 2, NULL, '{\"name\":\"Rascunho V23\",\"message_template\":\"oi\",\"objective\":\"vendas\",\"audience_source\":\"contacts\",\"draft_step\":9}'::jsonb); COMMIT;" 2>&1 || true)"
[[ "$invalid_err" == *'invalid_talkx_campaign_draft'* ]] || fail "GREEN: draft_step=9 deveria ser rejeitado pela RPC (got $invalid_err)"

# CHECK do banco barra escrita direta fora de 1..4
check_err="$(psql_test -Atqc "UPDATE public.talkx_campaigns SET draft_step = 9 WHERE id='$campaign_id'" 2>&1 || true)"
[[ "$check_err" == *'talkx_campaigns_draft_step_range'* ]] || fail "GREEN: CHECK deveria barrar draft_step=9 direto (got $check_err)"

echo '[OK] Talk X V23: save_talkx_campaign_draft grava draft_step (INSERT/UPDATE) e 1..4 e obrigatorio.'
