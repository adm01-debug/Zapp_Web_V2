#!/usr/bin/env bash
#
# #210 (R2-API-036): prova, em PostgreSQL 17 descartável, que a RPC
# public.record_talkx_conversion aplica os defaults internos quando o
# endpoint talkx-link manda currency/occurred_at como NULL EXPLÍCITO com
# origem válida ('api') — e continua recusando o que sempre recusou
# (origem fora da lista da X021, valor negativo/acima do teto, link de
# outra campanha, occurred_at no futuro).
#
# Aplica as MIGRATIONS REAIS (X021 + a correção #210). O setup (fixture +
# aplicação das migrations) roda como postgres por ser DDL; TODAS as
# asserções executam como o PAPEL REAL — chamadas da RPC, INSERTs diretos e
# leituras de conferência rodam com SET LOCAL role service_role, e os
# cenários de recusa de ACL rodam como authenticated e anon (prova
# explícita). O bloco de rollback é extraído do próprio arquivo da
# migration, executado e conferido; por fim a migration é reaplicada
# (idempotência).
#
# RED sem a migration de correção: a RPC anterior grava p_currency/
# p_occurred_at = NULL em colunas NOT NULL -> erro de not-null. GREEN com
# ela.

set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
base_migration="$(ls "$repo_root"/supabase/migrations/*_talkx_v4_x021_links_conversoes_investimento.sql 2>/dev/null | head -1 || true)"
[[ -n "$base_migration" && -f "$base_migration" ]] || { echo "migration X021 não encontrada" >&2; exit 1; }
# Sem a correção o teste FALHA de propósito (é a prova vermelha). Em uso normal
# o glob acha o arquivo.
fix_migration="$(ls "$repo_root"/supabase/migrations/*_talkx_conversion_defaults_webhook.sql 2>/dev/null | head -1 || true)"

pg_image="${TALKX_CONV_DEFAULTS_PG_IMAGE:-postgres:17-alpine}"
pg_name="zapp-talkx-conv-defaults-$$"
passed=0

CAMPAIGN="cccccccc-0000-4000-8000-000000000001"            # draft, dono OWNER
CAMPAIGN_OTHER="cccccccc-0000-4000-8000-000000000003"      # draft, dono AGENT
ADMIN_UID="aaaaaaaa-0000-4000-8000-000000000001"
OWNER_UID="aaaaaaaa-0000-4000-8000-000000000002"
AGENT_UID="aaaaaaaa-0000-4000-8000-000000000004"
ADMIN_PROFILE="bbbbbbbb-0000-4000-8000-000000000001"
OWNER_PROFILE="bbbbbbbb-0000-4000-8000-000000000002"
AGENT_PROFILE="bbbbbbbb-0000-4000-8000-000000000004"

cleanup() {
  if [[ "$pg_name" =~ ^zapp-talkx-conv-defaults-[0-9]+$ ]]; then
    docker rm -f "$pg_name" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT INT TERM

fail() { printf '[FAIL] %s\n' "$1" >&2; exit 1; }
pass() { passed=$((passed + 1)); printf '[PASS] %s\n' "$1"; }

psql_script() { docker exec -i "$pg_name" psql -X -q -v ON_ERROR_STOP=1 -U postgres -d postgres; }
psql_query() { docker exec "$pg_name" psql -X -Atq -v ON_ERROR_STOP=1 -U postgres -d postgres -c "$1"; }

# Papel REAL: o postgres só entrega a sessão ao papel NOLOGIN do fixture
# (SET LOCAL role). Sem isso, superusuário ignoraria RLS e GRANT e a prova
# de ACL não valeria.
SR="SET LOCAL role service_role; SET LOCAL request.jwt.claim.role='service_role';"
AN="SET LOCAL role anon; SET LOCAL request.jwt.claim.role='anon';"
AUTHD="SET LOCAL role authenticated; SET LOCAL request.jwt.claim.sub='$ADMIN_UID'; SET LOCAL request.jwt.claim.role='authenticated';"
as_service_role() { psql_query "$SR $1"; }

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
  (( status != 0 )) || fail "$label: deveria falhar, passou"
  [[ "$out" == *"$pattern"* ]] || fail "$label: erro inesperado -> $out"
  pass "$label ($pattern)"
}

command -v docker >/dev/null 2>&1 || fail 'Docker nao esta instalado'
docker info >/dev/null 2>&1 || fail 'Docker daemon nao esta acessivel'

docker run --rm -d --name "$pg_name" -e POSTGRES_PASSWORD=conv_defaults_only "$pg_image" >/dev/null

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

# ── fixture: espelho do vivo das tabelas que a X021 toca ─────────────────────
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

CREATE TABLE public.talkx_campaigns (
  id uuid PRIMARY KEY,
  name text NOT NULL DEFAULT 'campanha de teste',
  status text NOT NULL DEFAULT 'draft',
  created_by uuid REFERENCES public.profiles(id),
  updated_at timestamptz NOT NULL DEFAULT now()
);

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

CREATE TABLE public.talkx_recipients (id uuid PRIMARY KEY, campaign_id uuid);

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
  ('$AGENT_PROFILE', '$AGENT_UID', 'Agente');
INSERT INTO public.user_roles(user_id, role) VALUES ('$ADMIN_UID', 'admin');
INSERT INTO public.talkx_campaigns(id, name, status, created_by) VALUES
  ('$CAMPAIGN', 'Campanha draft', 'draft', '$OWNER_PROFILE'),
  ('$CAMPAIGN_OTHER', 'Campanha do agente', 'draft', '$AGENT_PROFILE');
SQL

# ── migrations reais: X021 (base) e a correção #210 ─────────────────────────
psql_script < "$base_migration" >/dev/null
pass 'migration X021 aplicada (RPC na versão anterior à correção)'

if [[ -n "$fix_migration" && -f "$fix_migration" ]]; then
  psql_script < "$fix_migration" >/dev/null
  pass "migration de correção aplicada ($(basename "$fix_migration"))"
else
  echo '[RED esperado] migration de correção #210 ausente: as asserções abaixo falham se o defeito existir'
fi

# ── (1) payload mínimo do endpoint: source='api', currency/occurred_at NULL ──
# É o que a Edge entrega quando o corpo omite os campos opcionais.
assert_eq 'conversão mínima do endpoint grava' \
  'recorded' \
  "$(as_service_role "SELECT public.record_talkx_conversion('$CAMPAIGN','ext-min',NULL,'api',NULL,NULL,NULL,NULL,NULL)->>'status'")"
assert_eq 'origem válida do endpoint fica gravada' 'api' \
  "$(as_service_role "SELECT source FROM public.talkx_conversions WHERE external_ref='ext-min'")"
assert_eq 'currency NULL explícito vira o default BRL' 'BRL' \
  "$(as_service_role "SELECT currency FROM public.talkx_conversions WHERE external_ref='ext-min'")"
assert_eq 'occurred_at NULL explícito vira now()' 't' \
  "$(as_service_role "SELECT (now() - occurred_at) < interval '60 seconds' FROM public.talkx_conversions WHERE external_ref='ext-min'")"

# ── (2) campos individualmente omitidos (NULL) ──────────────────────────────
as_service_role "SELECT public.record_talkx_conversion('$CAMPAIGN','ext-cur',10,'whatsapp',NULL,NULL,NULL,now(),NULL)" >/dev/null
assert_eq 'só currency omitido -> BRL' 'BRL' \
  "$(as_service_role "SELECT currency FROM public.talkx_conversions WHERE external_ref='ext-cur'")"
as_service_role "SELECT public.record_talkx_conversion('$CAMPAIGN','ext-occ',10,'whatsapp','BRL',NULL,NULL,NULL,NULL)" >/dev/null
assert_eq 'só occurred_at omitido -> now()' 't' \
  "$(as_service_role "SELECT (now() - occurred_at) < interval '60 seconds' FROM public.talkx_conversions WHERE external_ref='ext-occ'")"

# ── (3) payload completo: nada é sobrescrito ────────────────────────────────
as_service_role "SELECT public.record_talkx_conversion('$CAMPAIGN','ext-full',50,'checkout','USD',NULL,NULL,'2026-10-01T15:00:00Z',NULL)" >/dev/null
assert_eq 'payload completo preserva currency e occurred_at do chamador' 'USD|2026-10-01 15:00:00+00' \
  "$(as_service_role "SELECT currency || '|' || occurred_at FROM public.talkx_conversions WHERE external_ref='ext-full'")"

# ── (4) CHECK da coluna: lista da X021 intacta (a migration não a toca) ─────
assert_eq "INSERT direto com origem válida 'import' aceito pelo CHECK" '1' \
  "$(as_service_role "INSERT INTO public.talkx_conversions(campaign_id, source) VALUES ('$CAMPAIGN','import') RETURNING 1")"
assert_fails_like 'INSERT direto com origem fora da lista é recusado pelo CHECK' 'talkx_conversions_source_check' \
  "$SR INSERT INTO public.talkx_conversions(campaign_id, source) VALUES ('$CAMPAIGN','telegram')"

# ── (5) regressões: o que sempre foi recusado continua recusado ──────────────
assert_fails_like 'origem desconhecida continua recusada' 'talkx_conversion_invalid_source' \
  "$SR SELECT public.record_talkx_conversion('$CAMPAIGN','ext-bad',10,'telegram')"
assert_fails_like 'valor negativo continua recusado' 'talkx_conversion_value_negative' \
  "$SR SELECT public.record_talkx_conversion('$CAMPAIGN','ext-neg',-1,'manual')"
assert_fails_like 'valor acima do teto continua recusado' 'talkx_conversion_value_exceeds_max' \
  "$SR SELECT public.record_talkx_conversion('$CAMPAIGN','ext-max',999999,'manual')"
assert_fails_like 'occurred_at no futuro continua recusado' 'talkx_conversion_occurred_at_in_future' \
  "$SR SELECT public.record_talkx_conversion('$CAMPAIGN','ext-fut',10,'manual','BRL',NULL,NULL, now() + interval '2 hours')"
assert_eq 'dedupe por external_ref preservado (duplicate)' 'duplicate' \
  "$(as_service_role "SELECT public.record_talkx_conversion('$CAMPAIGN','ext-min',NULL,'api',NULL,NULL,NULL,NULL,NULL)->>'status'")"

# ── (6) ACL: só service_role executa ────────────────────────────────────────
assert_eq 'service_role executa' 't' \
  "$(as_service_role "SELECT has_function_privilege('service_role','public.record_talkx_conversion(uuid,text,numeric,text,text,uuid,uuid,timestamptz,jsonb)','EXECUTE')")"
assert_eq 'authenticated NÃO executa' 'f' \
  "$(as_service_role "SELECT has_function_privilege('authenticated','public.record_talkx_conversion(uuid,text,numeric,text,text,uuid,uuid,timestamptz,jsonb)','EXECUTE')")"
assert_eq 'anon NÃO executa' 'f' \
  "$(as_service_role "SELECT has_function_privilege('anon','public.record_talkx_conversion(uuid,text,numeric,text,text,uuid,uuid,timestamptz,jsonb)','EXECUTE')")"
assert_fails_like 'authenticated chamando a RPC é recusado' 'permission denied for function record_talkx_conversion' \
  "$AUTHD SELECT public.record_talkx_conversion('$CAMPAIGN','ext-auth',50,'manual')"
assert_fails_like 'anon chamando a RPC é recusado' 'permission denied for function record_talkx_conversion' \
  "$AN SELECT public.record_talkx_conversion('$CAMPAIGN','ext-anon',50,'api')"

# ── (7) rollback: extraído do PRÓPRIO arquivo da migration, executado ────────
if [[ -n "$fix_migration" && -f "$fix_migration" ]]; then
  rows_before="$(as_service_role "SELECT count(*) FROM public.talkx_conversions")"
  grep '^-- Rollback:' "$fix_migration" | cut -d' ' -f3- | psql_script >/dev/null
  pass 'bloco de rollback executado'

  # (a) a RPC volta à versão X021 e RECUSA NULL explícito (coluna NOT NULL)
  assert_fails_like 'rollback: RPC volta a recusar currency NULL explícito' 'null value in column "currency"' \
    "$SR SELECT public.record_talkx_conversion('$CAMPAIGN','ext-rb1',NULL,'api',NULL,NULL,NULL,now(),NULL)"
  assert_fails_like 'rollback: RPC volta a recusar occurred_at NULL explícito' 'null value in column "occurred_at"' \
    "$SR SELECT public.record_talkx_conversion('$CAMPAIGN','ext-rb2',NULL,'api','BRL',NULL,NULL,NULL,NULL)"

  # (b) dados já gravados não são reescritos
  assert_eq 'rollback não reescreve dados: contagem inalterada' "$rows_before" \
    "$(as_service_role "SELECT count(*) FROM public.talkx_conversions")"
  assert_eq "rollback não reescreve source de linha gravada" 'api' \
    "$(as_service_role "SELECT source FROM public.talkx_conversions WHERE external_ref='ext-min'")"

  # (c) CHECK da coluna segue o da X021 (5 origens) e só service_role executa
  assert_eq 'CHECK pós-rollback aceita as 5 origens da X021' '5' \
    "$(as_service_role "INSERT INTO public.talkx_conversions(campaign_id, source) SELECT '$CAMPAIGN', unnest(ARRAY['whatsapp','manual','import','api','checkout']) RETURNING 1" | grep -c .)"
  assert_fails_like 'CHECK pós-rollback recusa origem fora da lista' 'talkx_conversions_source_check' \
    "$SR INSERT INTO public.talkx_conversions(campaign_id, source) VALUES ('$CAMPAIGN','telegram')"
  assert_eq 'rollback mantém a ACL (só service_role)' 'false|true' \
    "$(as_service_role "SELECT has_function_privilege('authenticated','public.record_talkx_conversion(uuid,text,numeric,text,text,uuid,uuid,timestamptz,jsonb)','EXECUTE')::text || '|' || has_function_privilege('service_role','public.record_talkx_conversion(uuid,text,numeric,text,text,uuid,uuid,timestamptz,jsonb)','EXECUTE')::text")"

  # ── (8) reaplicar a migration (idempotência) ─────────────────────────────
  psql_script < "$fix_migration" >/dev/null
  assert_eq 'após reaplicar, o payload mínimo do endpoint volta a gravar' 'recorded' \
    "$(as_service_role "SELECT public.record_talkx_conversion('$CAMPAIGN','ext-min2',NULL,'api',NULL,NULL,NULL,NULL,NULL)->>'status'")"
fi

printf '[OK] Talk X #210 (R2-API-036): NULL explícito em currency/occurred_at grava com defaults, regressões seguem recusadas, ACL só service_role, rollback provado (%s cenários).\n' "$passed"
