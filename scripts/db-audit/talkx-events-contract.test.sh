#!/usr/bin/env bash
#
# V11 (PLANO_TALKX_V3_100_ETAPAS_2026-09-29): prova, em PostgreSQL 17
# descartável, que o contrato de eventos do Talk X não aceitava o que as etapas
# seguintes precisam e passa a aceitar — e que o alvo do evento continua
# obrigatório:
#
#   ANTES da migration 20260929730000 (estado de produção):
#     - event_type 'resumed_auto' é RECUSADO pelo CHECK de 9 valores;
#     - campaign_id NULO é RECUSADO (NOT NULL);
#     - as colunas entity_type/entity_id não existem.
#   DEPOIS:
#     - os 19 tipos são aceitos;
#     - evento de ENTIDADE (sem campanha) é aceito por admin/supervisor e
#       RECUSADO para quem não é — as policies foram recriadas para isso, porque
#       a regra antiga era um EXISTS em talkx_campaigns que nunca é verdadeiro
#       com campaign_id nulo;
#     - linha sem campanha E sem entidade é recusada (CHECK novo, contra evento
#       órfão);
#     - o ramo de campanha continua funcionando para o dono (regressão da policy
#       recriada).
#
# O fixture espelha a definição VIVA de talkx_campaign_events (colunas, CHECK de
# 9 valores e as duas policies com TO authenticated) e a função VIVA
# is_admin_or_supervisor (SECURITY DEFINER sobre public.user_roles) — não uma
# versão de conveniência em nenhum dos dois casos.

set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
migration="$repo_root/supabase/migrations/20260929730000_talkx_events_contract_v11.sql"
pg_image="${TALKX_EVENTS_CONTRACT_PG_IMAGE:-postgres:17-alpine}"
pg_name="zapp-talkx-events-contract-$$"
passed=0

ADMIN_UID="aaaaaaaa-0000-4000-8000-000000000001"
SUPERVISOR_UID="aaaaaaaa-0000-4000-8000-000000000003"
OWNER_UID="aaaaaaaa-0000-4000-8000-000000000002"
ADMIN_PROFILE="bbbbbbbb-0000-4000-8000-000000000001"
OWNER_PROFILE="bbbbbbbb-0000-4000-8000-000000000002"
CAMPAIGN="cccccccc-0000-4000-8000-000000000001"

cleanup() {
  if [[ "$pg_name" =~ ^zapp-talkx-events-contract-[0-9]+$ ]]; then
    docker rm -f "$pg_name" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT INT TERM

fail() { printf '[FAIL] %s\n' "$1" >&2; exit 1; }
pass() { passed=$((passed + 1)); printf '[PASS] %s\n' "$1"; }

psql_script() { docker exec -i "$pg_name" psql -X -q -v ON_ERROR_STOP=1 -U postgres -d postgres; }
psql_query() { docker exec "$pg_name" psql -X -Atq -v ON_ERROR_STOP=1 -U postgres -d postgres -c "$1"; }

# Executa como um usuário autenticado (RLS valendo), num único -c para os
# SET LOCAL valerem no INSERT/SELECT seguinte.
as_user() {
  local uid="$1" sql="$2"
  docker exec "$pg_name" psql -X -Atq -v ON_ERROR_STOP=1 -U postgres -d postgres \
    -c "SET LOCAL role authenticated; SET LOCAL request.jwt.claim.sub='$uid'; $sql"
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

docker run --rm -d --name "$pg_name" -e POSTGRES_PASSWORD=events_test_only "$pg_image" >/dev/null

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
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;
GRANT USAGE ON SCHEMA public, auth TO anon, authenticated, service_role;

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL,
  name text,
  role text NOT NULL DEFAULT 'agent'
);

-- FONTE DE VERDADE REAL de admin/supervisor, copiada do canônico com
-- pg_get_functiondef (auditoria de 2026-09-29): a função viva é SECURITY DEFINER
-- com search_path fixo e lê public.user_roles — NÃO public.profiles.role. O
-- fixture anterior usava profiles.role com SECURITY INVOKER, então provava os
-- cenários de admin contra uma função que não existe em produção.
CREATE TABLE public.user_roles (
  user_id uuid NOT NULL,
  role text NOT NULL
);
CREATE FUNCTION public.is_admin_or_supervisor(_user_id uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS \$\$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role IN ('admin', 'supervisor')
  ) \$\$;

CREATE TABLE public.talkx_campaigns (
  id uuid PRIMARY KEY,
  name text NOT NULL DEFAULT 'campanha de teste',
  status text NOT NULL DEFAULT 'draft',
  created_by uuid REFERENCES public.profiles(id)
);

-- Definição VIVA de talkx_campaign_events (conferida no banco canônico).
CREATE TABLE public.talkx_campaign_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.talkx_campaigns(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  message text,
  actor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT talkx_campaign_events_type_check CHECK (event_type IN
    ('created','updated','scheduled','started','paused','resumed','cancelled','completed','note'))
);
CREATE INDEX idx_talkx_campaign_events_campaign_created ON public.talkx_campaign_events(campaign_id, created_at DESC);
ALTER TABLE public.talkx_campaign_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "talkx_campaign_events_select" ON public.talkx_campaign_events FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.talkx_campaigns tc WHERE tc.id = talkx_campaign_events.campaign_id
    AND (tc.created_by = (SELECT p.id FROM public.profiles p WHERE p.user_id = auth.uid() LIMIT 1) OR public.is_admin_or_supervisor(auth.uid()))));
CREATE POLICY "talkx_campaign_events_insert" ON public.talkx_campaign_events FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.talkx_campaigns tc WHERE tc.id = talkx_campaign_events.campaign_id
    AND (tc.created_by = (SELECT p.id FROM public.profiles p WHERE p.user_id = auth.uid() LIMIT 1) OR public.is_admin_or_supervisor(auth.uid()))));

GRANT SELECT, INSERT, UPDATE ON public.talkx_campaign_events, public.talkx_campaigns, public.profiles TO authenticated, service_role;

INSERT INTO public.profiles(id, user_id, name, role) VALUES
  ('$ADMIN_PROFILE', '$ADMIN_UID', 'Admin Teste', 'agent'),
  ('$OWNER_PROFILE', '$OWNER_UID', 'Dono Teste', 'agent');
-- profiles.role é LEGADO e fica de propósito como 'agent' nos dois: assim o
-- cenário 'admin grava evento de entidade' só passa se a função consultar
-- user_roles — se o fixture voltar a ler profiles.role, o teste fica vermelho.
-- user_roles NÃO é concedida a authenticated: o cenário 'recusado para quem não
-- é admin' prova também que o SECURITY DEFINER funciona sem o chamador ter
-- privilégio na tabela de papéis.
INSERT INTO public.user_roles(user_id, role) VALUES
  ('$ADMIN_UID', 'admin'),
  ('$SUPERVISOR_UID', 'supervisor');
INSERT INTO public.talkx_campaigns(id, created_by) VALUES ('$CAMPAIGN', '$OWNER_PROFILE');
SQL

# ── ANTES: o estado de produção recusa o que as próximas etapas precisam ──────
assert_fails_like "tipos novos recusados pelo CHECK de 9 valores" 'talkx_campaign_events_type_check' \
  "INSERT INTO public.talkx_campaign_events(campaign_id, event_type) VALUES ('$CAMPAIGN', 'resumed_auto')"
assert_fails_like "campanha nula recusada (NOT NULL)" 'not-null constraint' \
  "INSERT INTO public.talkx_campaign_events(campaign_id, event_type) VALUES (NULL, 'note')"
assert_eq "colunas de entidade ainda não existem" '0' \
  "$(psql_query "SELECT count(*) FROM pg_attribute WHERE attrelid='public.talkx_campaign_events'::regclass AND attname IN ('entity_type','entity_id')")"

# ── migration ────────────────────────────────────────────────────────────────
psql_script < "$migration" >/dev/null
pass 'migration 20260929730000 aplicada'

# ── IDEMPOTÊNCIA: aplicar de novo não pode duplicar constraint nem policy ─────
# A migration roda em banco recém-criado e, num re-run do pipeline (ou num
# replay manual), roda de novo. O auditor de 2026-09-29 provou isso fora do
# repo; aqui fica provado dentro do repo.
psql_script < "$migration" >/dev/null
assert_eq 'migration reaplicada não duplica o CHECK de tipo' '1' \
  "$(psql_query "SELECT count(*) FROM pg_constraint WHERE conrelid='public.talkx_campaign_events'::regclass AND conname='talkx_campaign_events_type_check'")"
assert_eq 'migration reaplicada não duplica o CHECK de alvo' '1' \
  "$(psql_query "SELECT count(*) FROM pg_constraint WHERE conrelid='public.talkx_campaign_events'::regclass AND conname='talkx_campaign_events_target_check'")"
assert_eq 'migration reaplicada não duplica policies' '2' \
  "$(psql_query "SELECT count(*) FROM pg_policy WHERE polrelid='public.talkx_campaign_events'::regclass")"

# ── DEPOIS: os 19 tipos ──────────────────────────────────────────────────────
for tipo in created updated scheduled started paused resumed cancelled completed note \
            scheduled_updated limits_updated connection_failed resumed_auto skipped_suppressed \
            suppression_add suppression_remove suppression_update segments_reviewed checklist; do
  assert_ok "tipo aceito: $tipo" \
    "INSERT INTO public.talkx_campaign_events(campaign_id, event_type) VALUES ('$CAMPAIGN', '$tipo')"
done

# ── DEPOIS: evento de entidade (sem campanha) ────────────────────────────────
assert_eq 'evento de entidade gravado por admin (policy nova)' '1' \
  "$(as_user "$ADMIN_UID" "INSERT INTO public.talkx_campaign_events(campaign_id, event_type, entity_type, entity_id) VALUES (NULL, 'suppression_add', 'suppression', gen_random_uuid()); SELECT count(*) FROM public.talkx_campaign_events WHERE campaign_id IS NULL")"

assert_fails_like 'evento de entidade recusado para quem não é admin' 'row-level security' \
  "SET LOCAL role authenticated; SET LOCAL request.jwt.claim.sub='$OWNER_UID'; INSERT INTO public.talkx_campaign_events(campaign_id, event_type, entity_type, entity_id) VALUES (NULL, 'suppression_add', 'suppression', gen_random_uuid())"

assert_fails_like 'linha sem campanha e sem entidade é recusada' 'talkx_campaign_events_target_check' \
  "INSERT INTO public.talkx_campaign_events(campaign_id, event_type) VALUES (NULL, 'note')"

# ── anon não alcança a trilha (a policy é TO authenticated; anon fica de fora) ─
assert_fails_like 'anon não grava evento nem na própria campanha' 'permission denied' \
  "SET LOCAL role anon; INSERT INTO public.talkx_campaign_events(campaign_id, event_type) VALUES ('$CAMPAIGN', 'note')"

# ── supervisor: o papel vem de user_roles (segundo da lista da função viva) ────
assert_eq 'supervisor grava evento de entidade' '1' \
  "$(as_user "$SUPERVISOR_UID" "INSERT INTO public.talkx_campaign_events(campaign_id, event_type, entity_type, entity_id, message) VALUES (NULL, 'suppression_remove', 'suppression', gen_random_uuid(), 'v11-supervisor'); SELECT count(*) FROM public.talkx_campaign_events WHERE message = 'v11-supervisor'")"

# ── admin em campanha de OUTRO dono (o ramo de campanha não exige ser o dono) ──
assert_eq 'admin grava evento na campanha de outro dono' '1' \
  "$(as_user "$ADMIN_UID" "INSERT INTO public.talkx_campaign_events(campaign_id, event_type, message) VALUES ('$CAMPAIGN', 'note', 'v11-admin-outro-dono'); SELECT count(*) FROM public.talkx_campaign_events WHERE message = 'v11-admin-outro-dono'")"

# ── DEPOIS: o ramo de campanha continua valendo (policy recriada) ─────────────
assert_eq 'dono continua gravando e lendo evento da própria campanha' '1' \
  "$(as_user "$OWNER_UID" "INSERT INTO public.talkx_campaign_events(campaign_id, event_type, message) VALUES ('$CAMPAIGN', 'note', 'v11-owner-check'); SELECT count(*) FROM public.talkx_campaign_events WHERE message = 'v11-owner-check'")"

printf '[OK] Talk X V11: contrato de eventos aceita os 19 tipos, alvo obrigatório e policy de entidade restrita a admin (%s cenarios).\n' "$passed"
