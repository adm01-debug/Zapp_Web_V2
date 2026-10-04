#!/usr/bin/env bash
#
# X021 (PLANO_TALKX_V4_200_ETAPAS_2026-10-01): prova, em PostgreSQL 17
# descartável, que a migration abre no banco a escrita de links (UTM, created_by,
# rótulo único por campanha, slug gerado no servidor), a leitura de cliques e
# conversões (admin/supervisor + dono), a deduplicação de conversões, o teto de
# valor e o investimento por campanha — e que os 8 novos event_type são aceitos.
#
# O fixture espelha a definição VIVA das tabelas do E90 (talkx_links,
# talkx_link_clicks, talkx_conversions) e de talkx_campaign_events (com o CHECK
# de 19 valores do V11), a função VIVA is_admin_or_supervisor (SECURITY DEFINER
# sobre public.user_roles) e um guard de mutabilidade de campanha reduzido ao
# essencial (rejeita mudança de status para `authenticated`) — para provar que
# o talkx_set_campaign_investment grava em campanha `completed` PORQUE é
# SECURITY DEFINER (current_user = owner), não porque o guard está ausente.

set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
# A versão final é reservada pelo hermes-db-migrar --nova; o glob acha qualquer
# versão. Em desenvolvimento dá para apontar para outro lugar via env.
migration="${TALKX_X021_MIGRATION:-$(ls "$repo_root"/supabase/migrations/*_talkx_v4_x021_links_conversoes_investimento.sql 2>/dev/null | head -1)}"
[[ -n "$migration" && -f "$migration" ]] || { echo "migration X021 não encontrada ($migration)" >&2; exit 1; }

pg_image="${TALKX_LINKS_CONV_PG_IMAGE:-postgres:17-alpine}"
pg_name="zapp-talkx-links-conv-$$"
passed=0

ADMIN_UID="aaaaaaaa-0000-4000-8000-000000000001"
OWNER_UID="aaaaaaaa-0000-4000-8000-000000000002"
SUPERVISOR_UID="aaaaaaaa-0000-4000-8000-000000000003"
AGENT_UID="aaaaaaaa-0000-4000-8000-000000000004"
ADMIN_PROFILE="bbbbbbbb-0000-4000-8000-000000000001"
OWNER_PROFILE="bbbbbbbb-0000-4000-8000-000000000002"
SUPERVISOR_PROFILE="bbbbbbbb-0000-4000-8000-000000000003"
AGENT_PROFILE="bbbbbbbb-0000-4000-8000-000000000004"
CAMPAIGN="cccccccc-0000-4000-8000-000000000001"      # draft, dono OWNER
CAMPAIGN_COMPLETED="cccccccc-0000-4000-8000-000000000002"  # completed, dono OWNER
CAMPAIGN_OTHER="cccccccc-0000-4000-8000-000000000003"      # draft, dono AGENT

cleanup() {
  if [[ "$pg_name" =~ ^zapp-talkx-links-conv-[0-9]+$ ]]; then
    docker rm -f "$pg_name" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT INT TERM

fail() { printf '[FAIL] %s\n' "$1" >&2; exit 1; }
pass() { passed=$((passed + 1)); printf '[PASS] %s\n' "$1"; }

psql_script() { docker exec -i "$pg_name" psql -X -q -v ON_ERROR_STOP=1 -U postgres -d postgres; }
psql_query() { docker exec "$pg_name" psql -X -Atq -v ON_ERROR_STOP=1 -U postgres -d postgres -c "$1"; }

as_user() {
  local uid="$1" sql="$2"
  docker exec "$pg_name" psql -X -Atq -v ON_ERROR_STOP=1 -U postgres -d postgres \
    -c "SET LOCAL role authenticated; SET LOCAL request.jwt.claim.sub='$uid'; $sql"
}
as_service_role() {
  local sql="$1"
  docker exec "$pg_name" psql -X -Atq -v ON_ERROR_STOP=1 -U postgres -d postgres \
    -c "SET LOCAL request.jwt.claim.role='service_role'; $sql"
}

assert_eq() {
  local label="$1" expected="$2" actual="$3"
  [[ "$actual" == "$expected" ]] || fail "$label: esperado '$expected', obtido '$actual'"
  pass "$label (= $actual)"
}
assert_fails_like() {
  local label="$1" pattern="$2" sql="$3" out status
  set +e
  out="$(psql_query "$sql" 2>&1)"
  status=$?
  set -e
  if (( status == 0 )); then fail "$label: deveria falhar, passou"; fi
  [[ "$out" == *"$pattern"* ]] || fail "$label: erro inesperado -> $out"
  pass "$label ($pattern)"
}
assert_ok() {
  local label="$1" sql="$2"
  psql_query "$sql" >/dev/null || fail "$label: deveria passar"
  pass "$label"
}

command -v docker >/dev/null 2>&1 || fail 'Docker nao esta instalado'
docker info >/dev/null 2>&1 || fail 'Docker daemon nao esta acessivel'

docker run --rm -d --name "$pg_name" -e POSTGRES_PASSWORD=links_test_only "$pg_image" >/dev/null

ready=false
for _ in $(seq 1 90); do
  markers="$(docker logs "$pg_name" 2>&1 | grep -c 'database system is ready to accept connections' || true)"
  if [[ "$markers" -ge 2 ]] && docker exec "$pg_name" psql -X -U postgres -d postgres -Atqc 'SELECT 1' >/dev/null 2>&1; then
    ready=true
    break
  fi
  sleep 1
done
[[ "$ready" == true ]] || fail 'PostgreSQL de teste não iniciou'

psql_script >/dev/null <<SQL
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS \$\$
  SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid \$\$;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS \$\$
  SELECT COALESCE(current_setting('request.jwt.claim.role', true), '')::text \$\$;
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;
GRANT USAGE ON SCHEMA public, auth TO anon, authenticated, service_role;

CREATE TABLE public.profiles (id uuid PRIMARY KEY, user_id uuid NOT NULL, name text);
CREATE TABLE public.user_roles (user_id uuid NOT NULL, role text NOT NULL);
CREATE FUNCTION public.is_admin_or_supervisor(_user_id uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS \$\$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role IN ('admin','supervisor')) \$\$;

-- talkx_campaigns: espelho do vivo (colunas que as RPCs e o guard tocam)
CREATE TABLE public.talkx_campaigns (
  id uuid PRIMARY KEY,
  name text NOT NULL DEFAULT 'campanha de teste',
  status text NOT NULL DEFAULT 'draft',
  created_by uuid REFERENCES public.profiles(id),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- guard de mutabilidade reduzido ao essencial: rejeita mudança de status para
-- authenticated; quem não é authenticated (incl. o owner da função DEFINER)
-- passa — é o que permite o investment em completed.
CREATE FUNCTION public.enforce_talkx_campaign_mutability() RETURNS trigger
  LANGUAGE plpgsql AS \$\$
BEGIN
  IF current_user <> 'authenticated' THEN RETURN COALESCE(NEW, OLD); END IF;
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION 'talkx_campaign_transition_denied' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END \$\$;
CREATE TRIGGER trg_enforce_campaign_mutability BEFORE UPDATE ON public.talkx_campaigns
  FOR EACH ROW EXECUTE FUNCTION public.enforce_talkx_campaign_mutability();

-- talkx_campaign_events: CHECK de 19 valores (V11) + RLS
CREATE TABLE public.talkx_campaign_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.talkx_campaigns(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  message text,
  actor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT talkx_campaign_events_type_check CHECK (event_type IN
    ('created','updated','scheduled','started','paused','resumed','cancelled','completed','note',
     'scheduled_updated','limits_updated','connection_failed','resumed_auto','skipped_suppressed',
     'suppression_add','suppression_remove','suppression_update','segments_reviewed','checklist'))
);
ALTER TABLE public.talkx_campaign_events ENABLE ROW LEVEL SECURITY;

-- talkx_recipients (minimal, para as FKs do E90)
CREATE TABLE public.talkx_recipients (id uuid PRIMARY KEY, campaign_id uuid);

-- E90: espelho do vivo (RLS on, zero grants para authenticated)
CREATE TABLE public.talkx_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.talkx_campaigns(id) ON DELETE CASCADE,
  label text NOT NULL,
  target_url text NOT NULL,
  slug text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.talkx_link_clicks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  link_id uuid NOT NULL REFERENCES public.talkx_links(id) ON DELETE CASCADE,
  recipient_id uuid REFERENCES public.talkx_recipients(id) ON DELETE SET NULL,
  clicked_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.talkx_conversions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.talkx_campaigns(id) ON DELETE CASCADE,
  recipient_id uuid REFERENCES public.talkx_recipients(id) ON DELETE SET NULL,
  link_id uuid REFERENCES public.talkx_links(id) ON DELETE SET NULL,
  value numeric(12,2),
  source text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.talkx_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.talkx_link_clicks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.talkx_conversions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.talkx_links FROM PUBLIC;
REVOKE ALL ON public.talkx_link_clicks FROM PUBLIC;
REVOKE ALL ON public.talkx_conversions FROM PUBLIC;
GRANT ALL ON public.talkx_links TO service_role;
GRANT ALL ON public.talkx_link_clicks TO service_role;
GRANT ALL ON public.talkx_conversions TO service_role;

CREATE TABLE public.talkx_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  description text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.talkx_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.talkx_settings FROM PUBLIC;
GRANT ALL ON public.talkx_settings TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.talkx_campaigns TO authenticated, service_role;
GRANT SELECT, INSERT ON public.talkx_campaign_events TO authenticated, service_role;
GRANT SELECT ON public.profiles TO authenticated, service_role;

INSERT INTO public.profiles(id, user_id, name) VALUES
  ('$ADMIN_PROFILE', '$ADMIN_UID', 'Admin'),
  ('$OWNER_PROFILE', '$OWNER_UID', 'Dono'),
  ('$SUPERVISOR_PROFILE', '$SUPERVISOR_UID', 'Supervisor'),
  ('$AGENT_PROFILE', '$AGENT_UID', 'Agente');
INSERT INTO public.user_roles(user_id, role) VALUES
  ('$ADMIN_UID', 'admin'),
  ('$SUPERVISOR_UID', 'supervisor');
INSERT INTO public.talkx_campaigns(id, name, status, created_by) VALUES
  ('$CAMPAIGN', 'Campanha draft', 'draft', '$OWNER_PROFILE'),
  ('$CAMPAIGN_COMPLETED', 'Campanha completa', 'completed', '$OWNER_PROFILE'),
  ('$CAMPAIGN_OTHER', 'Campanha do agente', 'draft', '$AGENT_PROFILE');
SQL

# ── migration X021 ──────────────────────────────────────────────────────────
psql_script < "$migration" >/dev/null
pass 'migration X021 aplicada'

# ── idempotência: reaplicar não duplica constraint nem policy ───────────────
psql_script < "$migration" >/dev/null
assert_eq 'reaplicada não duplica o CHECK de event_type' '1' \
  "$(psql_query "SELECT count(*) FROM pg_constraint WHERE conrelid='public.talkx_campaign_events'::regclass AND conname='talkx_campaign_events_type_check'")"
assert_eq 'reaplicada não duplica a policy de links (admins)' '1' \
  "$(psql_query "SELECT count(*) FROM pg_policy WHERE polrelid='public.talkx_links'::regclass AND polname='Admins can view all links'")"

# ── (1) agente sem papel em talkx_upsert_link → 42501 ───────────────────────
assert_fails_like 'agente em talkx_upsert_link é recusado' 'talkx_link_not_authorized' \
  "SET LOCAL role authenticated; SET LOCAL request.jwt.claim.sub='$AGENT_UID'; SELECT public.talkx_upsert_link('$CAMPAIGN_OTHER', 'promo', 'https://example.com', NULL)"

# ── (2) admin cria link (draft) e rótulo repetido → 23505 ───────────────────
assert_ok 'admin cria link na campanha draft' \
  "SET LOCAL role authenticated; SET LOCAL request.jwt.claim.sub='$ADMIN_UID'; SELECT public.talkx_upsert_link('$CAMPAIGN', 'promo', 'https://example.com/promo', NULL, 'wa', 'whatsapp')"
assert_eq 'link criado com slug gerado no servidor' '1' \
  "$(psql_query "SELECT count(*) FROM public.talkx_links WHERE campaign_id='$CAMPAIGN' AND label='promo' AND slug ~ '^[0-9a-f]{10}$'")"
assert_fails_like 'rótulo repetido → 23505' 'duplicate key' \
  "SET LOCAL role authenticated; SET LOCAL request.jwt.claim.sub='$ADMIN_UID'; SELECT public.talkx_upsert_link('$CAMPAIGN', 'promo', 'https://example.com/outra', NULL)"

# ── (3) rótulo/destino inválidos ────────────────────────────────────────────
assert_fails_like 'rótulo inválido recusado' 'talkx_link_invalid_label' \
  "SET LOCAL role authenticated; SET LOCAL request.jwt.claim.sub='$ADMIN_UID'; SELECT public.talkx_upsert_link('$CAMPAIGN', 'Rótulo inválido!', 'https://example.com', NULL)"
assert_fails_like 'destino sem https recusado' 'talkx_link_invalid_target' \
  "SET LOCAL role authenticated; SET LOCAL request.jwt.claim.sub='$ADMIN_UID'; SELECT public.talkx_upsert_link('$CAMPAIGN', 'promo2', 'http://example.com', NULL)"

# ── (4) campanha fora de draft|scheduled recusada ───────────────────────────
assert_fails_like 'link em campanha completed recusado' 'talkx_link_campaign_not_editable' \
  "SET LOCAL role authenticated; SET LOCAL request.jwt.claim.sub='$ADMIN_UID'; SELECT public.talkx_upsert_link('$CAMPAIGN_COMPLETED', 'late', 'https://example.com', NULL)"

# ── (5) leitura de cliques e conversões: supervisor lê alheia, agente não ──
# Cria um clique e uma conversão na campanha do OWNER (via service_role, sem
# depender das RPCs de escrita de link para o clique).
psql_query "INSERT INTO public.talkx_link_clicks(link_id) SELECT id FROM public.talkx_links WHERE campaign_id='$CAMPAIGN'" >/dev/null
psql_query "INSERT INTO public.talkx_conversions(campaign_id, value, source) VALUES ('$CAMPAIGN', 10, 'whatsapp')" >/dev/null

assert_eq 'supervisor lê cliques da campanha alheia' '1' \
  "$(as_user "$SUPERVISOR_UID" "SELECT count(*) FROM public.talkx_link_clicks")"
assert_eq 'supervisor lê conversões da campanha alheia' '1' \
  "$(as_user "$SUPERVISOR_UID" "SELECT count(*) FROM public.talkx_conversions")"
assert_eq 'agente NÃO lê cliques da campanha alheia' '0' \
  "$(as_user "$AGENT_UID" "SELECT count(*) FROM public.talkx_link_clicks")"
assert_eq 'agente NÃO lê conversões da campanha alheia' '0' \
  "$(as_user "$AGENT_UID" "SELECT count(*) FROM public.talkx_conversions")"
assert_eq 'dono lê cliques da própria campanha' '1' \
  "$(as_user "$OWNER_UID" "SELECT count(*) FROM public.talkx_link_clicks")"
assert_eq 'dono lê conversões da própria campanha' '1' \
  "$(as_user "$OWNER_UID" "SELECT count(*) FROM public.talkx_conversions")"

# ── (6) record_talkx_conversion: dedup por external_ref ─────────────────────
as_service_role "SELECT public.record_talkx_conversion('$CAMPAIGN', 'ext-123', 50, 'manual')" >/dev/null
assert_eq 'primeira conversão com external_ref grava' '1' \
  "$(psql_query "SELECT count(*) FROM public.talkx_conversions WHERE external_ref='ext-123'")"
assert_eq 'conversão repetida com o mesmo external_ref devolve duplicate' '{"status": "duplicate"}' \
  "$(as_service_role "SELECT public.record_talkx_conversion('$CAMPAIGN', 'ext-123', 50, 'manual')")"
assert_eq 'conversão repetida NÃO duplica linha (segue 1)' '1' \
  "$(psql_query "SELECT count(*) FROM public.talkx_conversions WHERE external_ref='ext-123'")"

# ── (7) record_talkx_conversion: valor negativo e acima do teto ─────────────
assert_fails_like 'valor negativo recusado' 'talkx_conversion_value_negative' \
  "SET LOCAL request.jwt.claim.role='service_role'; SELECT public.record_talkx_conversion('$CAMPAIGN', 'ext-neg', -5, 'manual')"
assert_fails_like 'valor acima do teto recusado' 'talkx_conversion_value_exceeds_max' \
  "SET LOCAL request.jwt.claim.role='service_role'; SELECT public.record_talkx_conversion('$CAMPAIGN', 'ext-max', 999999, 'manual')"

# ── (8) record_talkx_conversion: link_id de outra campanha recusado ─────────
# cria link na campanha do agente como admin, pega o id
psql_query "SET LOCAL role authenticated; SET LOCAL request.jwt.claim.sub='$ADMIN_UID'; SELECT public.talkx_upsert_link('$CAMPAIGN_OTHER', 'outra', 'https://example.com/outra', NULL)" >/dev/null
LINK_OTHER_ID="$(psql_query "SELECT id FROM public.talkx_links WHERE campaign_id='$CAMPAIGN_OTHER'")"
assert_fails_like 'conversão com link de outra campanha recusado' 'talkx_conversion_link_campaign_mismatch' \
  "SET LOCAL request.jwt.claim.role='service_role'; SELECT public.record_talkx_conversion('$CAMPAIGN', 'ext-link', 50, 'manual', 'BRL', '$LINK_OTHER_ID', NULL, now(), NULL)"

# ── (9) record_talkx_conversion: só service_role ────────────────────────────
assert_fails_like 'record_talkx_conversion por authenticated recusado' 'permission denied for function record_talkx_conversion' \
  "SET LOCAL role authenticated; SET LOCAL request.jwt.claim.sub='$ADMIN_UID'; SELECT public.record_talkx_conversion('$CAMPAIGN', 'ext-auth', 50, 'manual')"

# ── (10) talkx_set_campaign_investment: completed grava e gera evento ───────
assert_eq 'investimento em campanha completed grava' '{"investment": 500, "campaign_id": "'$CAMPAIGN_COMPLETED'"}' \
  "$(as_user "$ADMIN_UID" "SELECT public.talkx_set_campaign_investment('$CAMPAIGN_COMPLETED', 500)")"
assert_eq 'investimento persiste na coluna' '500.00' \
  "$(psql_query "SELECT investment::text FROM public.talkx_campaigns WHERE id='$CAMPAIGN_COMPLETED'")"
assert_eq 'evento investment_updated gerado com ator' '1' \
  "$(psql_query "SELECT count(*) FROM public.talkx_campaign_events WHERE campaign_id='$CAMPAIGN_COMPLETED' AND event_type='investment_updated' AND actor_id='$ADMIN_PROFILE'")"

# ── (11) talkx_set_campaign_investment: agente sem papel recusado ───────────
assert_fails_like 'investimento por agente recusado' 'talkx_investment_not_authorized' \
  "SET LOCAL role authenticated; SET LOCAL request.jwt.claim.sub='$AGENT_UID'; SELECT public.talkx_set_campaign_investment('$CAMPAIGN_OTHER', 100)"

# ── (12) talkx_delete_link: recusa link com clique ──────────────────────────
LINK_WITH_CLICK="$(psql_query "SELECT id FROM public.talkx_links WHERE campaign_id='$CAMPAIGN' AND label='promo'")"
assert_fails_like 'delete de link com cliques recusado' 'talkx_link_has_clicks' \
  "SET LOCAL role authenticated; SET LOCAL request.jwt.claim.sub='$ADMIN_UID'; SELECT public.talkx_delete_link('$LINK_WITH_CLICK')"

# ── (13) 8 novos event_type aceitos ─────────────────────────────────────────
for tipo in link_created link_updated link_deleted investment_updated \
            report_exported report_shared import_created import_completed; do
  assert_ok "tipo aceito: $tipo" \
    "INSERT INTO public.talkx_campaign_events(campaign_id, event_type) VALUES ('$CAMPAIGN', '$tipo')"
done

printf '[OK] Talk X X021: escrita de links, leitura de cliques/conversões, dedup de conversão, teto de valor, investimento e 8 novos event_type (%s cenários).\n' "$passed"
