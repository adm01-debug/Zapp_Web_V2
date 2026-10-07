#!/usr/bin/env bash
# X057 (Fase 6 · banco): varios segmentos por campanha.
#
# X057a (estrutural, entregue): tabela public.talkx_campaign_segments
# (PK campaign_id+segment_id, unique campaign_id+position, position 1..10,
# check de status), talkx_recipients.segment_id + indice, RLS espelhada,
# backfill de 1 linha por campanha com segment_id e realtime. Mantido verde
# nos blocos (1)-(5).
#
# X057b (esta entrega — COMPORTAMENTO): save_talkx_campaign_draft aceita
# 'segment_ids' no p_payload (array JSON de uuid em ordem de envio, 1..10),
# valida o contrato (22023: lista vazia/fora do tamanho, uuid repetido, item
# nao-uuid, lista em audience_source <> 'segment'), regrava a lista ordenada
# na mesma transacao do rascunho (segment_id da campanha = position 1) e
# snapshot_talkx_campaign_audience resolve os segmentos em ordem de position,
# sem duplicar contato — cada destinatario recebe o segment_id do PRIMEIRO
# segmento que o contem.
#
# Estrutura do harness (mesmo formato dos irmaos talkx-*.test.sh):
#   schema minimo -> migrations REAIS na ordem de versao
#     X057a (estrutura) + cadeia viva das RPCs (X016 -> X017 -> X018 -> X032)
#   -> BLOCO A: prova do defeito nas funcoes VIVAS (a tabela nao e lida nem
#      escrita por ninguem: rascunho com segment_ids cria a campanha mas nao
#      grava a lista; snapshot resolve so o segment_id legado e nao carimba
#      recipients.segment_id)
#   -> aplica a migration X057b REAL
#   -> BLOCO B: aceite do plano (3 segmentos 10/8/5 com 4 repetidos -> 19
#      destinatarios com o segment_id do primeiro segmento que os contem;
#      11 segmentos -> 22023; validacoes, atomicidade, replay e compat)
#   -> BLOCO RB: executa o bloco `-- RB> ` extraido da propria migration e
#      confere que o estado volta ao anterior; reaplicacao e idempotente.
#
# AUSENCIA DE MEDICAO CONTA COMO FALHA: cada caso registra sua execucao em
# CASES_SEEN e o harness FALHA no fim se algum caso esperado nao tiver rodado.

set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
migration_x016="$repo_root/supabase/migrations/20261002391230_talkx_audience_rpc.sql"
migration_x017="$repo_root/supabase/migrations/20261002421230_talkx_audience_snapshot.sql"
migration_x018="$repo_root/supabase/migrations/20261002551230_talkx_limits_ritmo.sql"
migration_x057a="$repo_root/supabase/migrations/20261002641230_talkx_v4_x057_segmentos.sql"
migration_x032="$repo_root/supabase/migrations/20261003232707_talkx_lgpd_consentimento_expurgo.sql"
migration_x057b="$repo_root/supabase/migrations/20261007095927_talkx_v4_x057b_segmentos_salvar_resolver.sql"
postgres_image="${TALKX_CAMPAIGN_SEGMENTS_TEST_POSTGRES_IMAGE:-postgres:17-alpine}"
container_name="talkx-campaign-segments-test-$$"
test_password="talkx_campaign_segments_test_only"

cleanup() { docker rm -f "$container_name" >/dev/null 2>&1 || true; }
trap cleanup EXIT

fail() { printf 'FAIL: %s\n' "$1" >&2; exit 1; }
pass() { printf 'PASS: %s\n' "$1"; }
psql_test() { docker exec -i "$container_name" psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres "$@"; }
psql_q() { psql_test -Atqc "$1"; }
as_user() {
  local jwt_role="$1" jwt_sub="$2" sql="$3"
  docker exec -i "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -v VERBOSITY=verbose -U postgres -d postgres \
    -c "SET ROLE $jwt_role; SET request.jwt.claim.role='$jwt_role'; SET request.jwt.claim.sub='$jwt_sub'; $sql"
}

# --- registro dos casos (ausencia de medicao = falha) -----------------------
declare -A CASES_SEEN=()
declare -a CASES_EXPECTED=(
  table_shape constraints rls_policies recipients_column_index
  backfill_with_segment backfill_without_segment realtime_publication
  defect_draft_ignores_segment_ids defect_snapshot_ignores_segments
  save_writes_ordered_segments save_validates_segment_list
  save_rewrites_and_compat snapshot_resolves_in_order
  snapshot_stamps_first_segment atomicity acl_and_role
  rollback_restores_previous
)
case_done() { CASES_SEEN["$1"]=1; }

expect_error() {
  local label="$1" message="$2" sql="$3" out status
  set +e
  out="$(psql_test -v VERBOSITY=verbose -c "$sql" 2>&1)"
  status=$?
  set -e
  (( status != 0 )) || { printf '%s\n' "$out" >&2; fail "$label: deveria falhar, mas passou"; }
  [[ "$out" == *"$message"* ]] || { printf '%s\n' "$out" >&2; fail "$label: esperava a mensagem '$message'"; }
  pass "$label"
}

expect_error_code_as() {
  local label="$1" errcode="$2" jwt_role="$3" jwt_sub="$4" sql="$5" out status
  set +e
  out="$(as_user "$jwt_role" "$jwt_sub" "$sql" 2>&1)"
  status=$?
  set -e
  (( status != 0 )) || { printf '%s\n' "$out" >&2; fail "$label: deveria falhar, mas passou"; }
  [[ "$out" == *"$errcode"* ]] || { printf '%s\n' "$out" >&2; fail "$label: esperava o SQLSTATE '$errcode'"; }
  pass "$label"
}

expect_value() {
  local label="$1" expected="$2" sql="$3" actual
  actual="$(psql_q "$sql" | tail -n1)"
  [[ "$actual" == "$expected" ]] || fail "$label: esperado '$expected', obtido '$actual'"
  pass "$label"
}

expect_value_as() {
  local label="$1" expected="$2" jwt_role="$3" jwt_sub="$4" sql="$5" actual
  actual="$(as_user "$jwt_role" "$jwt_sub" "$sql" | tail -n1)"
  [[ "$actual" == "$expected" ]] || fail "$label: esperado '$expected', obtido '$actual'"
  pass "$label"
}

start_postgres() {
  for attempt in 1 2 3; do
    docker rm -f "$container_name" >/dev/null 2>&1 || true
    # wal_level=logical: as operacoes de ALTER PUBLICATION da migration (parte 5)
    # so tem semantica real de Realtime com wal_level adequado; replica apenas
    # emite WARNING. O servidor definitivo sobe com logical.
    if ! docker run -d --name "$container_name" -e POSTGRES_PASSWORD="$test_password" \
         "$postgres_image" postgres -c wal_level=logical >/dev/null; then
      printf 'WARN: container PostgreSQL nao subiu (tentativa %s/3)\n' "$attempt" >&2
      continue
    fi
    for _ in $(seq 1 30); do
      if docker exec "$container_name" psql -X -U postgres -d postgres -Atqc 'SELECT 1' >/dev/null 2>&1; then
        sleep 1
        if docker exec "$container_name" psql -X -U postgres -d postgres -Atqc 'SELECT 1' >/dev/null 2>&1; then
          return 0
        fi
      fi
      sleep 1
    done
    printf 'WARN: PostgreSQL descartavel nao estabilizou (tentativa %s/3)\n' "$attempt" >&2
  done
  return 1
}

command -v docker >/dev/null 2>&1 || fail 'Docker nao esta instalado'
docker info >/dev/null 2>&1 || fail 'Docker daemon nao esta acessivel'
for m in "$migration_x016" "$migration_x017" "$migration_x018" "$migration_x057a" "$migration_x032" "$migration_x057b"; do
  [[ -f "$m" ]] || fail "migration ausente: $m"
done

start_postgres || fail 'PostgreSQL de teste nao iniciou'

# ---------------------------------------------------------------------------
# Schema minimo: os objetos que a cadeia toca (talkx_campaigns completo no
# estado pos-X032: consent/max_per_minute; talkx_segments com rules; contacts
# para talkx_audience_query; guardas de mutabilidade como em producao).
# ---------------------------------------------------------------------------
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
CREATE TYPE public.talkx_blacklist_reason AS ENUM
  ('opt_out','invalid_number','manual','lgpd','no_commercial_permission','bounce');

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL UNIQUE,
  is_active boolean NOT NULL DEFAULT true
);
CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  role text NOT NULL,
  UNIQUE (user_id, role)
);
CREATE FUNCTION public.is_admin_or_supervisor(_user_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role IN ('admin', 'supervisor')
  )
$$;
CREATE FUNCTION public.is_valid_talkx_schedule_timezone(text) RETURNS boolean
LANGUAGE sql STABLE AS $$ SELECT $1 = 'America/Sao_Paulo' $$;

CREATE TABLE public.talkx_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  description text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.whatsapp_connections (
  id uuid PRIMARY KEY,
  status text NOT NULL,
  instance_id text
);

CREATE TABLE public.talkx_segments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL DEFAULT 'segmento',
  rules jsonb NOT NULL DEFAULT '{"groups":[]}'::jsonb,
  status text NOT NULL DEFAULT 'active'
);

-- talkx_campaigns no estado pos-X032 (consent_confirmed_*/legal_basis e
-- max_per_minute ja existem em producao quando a X057b chega).
CREATE TABLE public.talkx_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL DEFAULT 'campanha',
  message_template text NOT NULL DEFAULT '',
  description text,
  objective text NOT NULL DEFAULT 'engajamento',
  audience_source text NOT NULL DEFAULT 'contacts',
  audience_filters jsonb NOT NULL DEFAULT '{}'::jsonb,
  segment_id uuid REFERENCES public.talkx_segments(id) ON DELETE SET NULL,
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
  max_per_minute smallint,
  respect_suppression boolean NOT NULL DEFAULT true,
  confirm_consent boolean NOT NULL DEFAULT false,
  legal_basis text,
  consent_confirmed_by uuid,
  consent_confirmed_at timestamptz,
  draft_step smallint NOT NULL DEFAULT 1,
  owner uuid,
  responsible_id uuid,
  template_version_id uuid,
  status text NOT NULL DEFAULT 'draft',
  total_recipients integer NOT NULL DEFAULT 0,
  sent_count integer NOT NULL DEFAULT 0,
  failed_count integer NOT NULL DEFAULT 0,
  delivered_count integer NOT NULL DEFAULT 0,
  outcome_unknown_count integer NOT NULL DEFAULT 0,
  replied_count integer NOT NULL DEFAULT 0,
  read_count integer NOT NULL DEFAULT 0,
  skipped_count integer NOT NULL DEFAULT 0,
  created_by uuid REFERENCES public.profiles(id),
  draft_creation_key uuid,
  revision bigint NOT NULL DEFAULT 1,
  worker_id text,
  worker_lease_expires_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT statement_timestamp()
);
CREATE UNIQUE INDEX talkx_campaigns_created_by_draft_key
  ON public.talkx_campaigns (created_by, draft_creation_key)
  WHERE draft_creation_key IS NOT NULL;

CREATE TABLE public.contacts (
  id uuid PRIMARY KEY,
  name text NOT NULL,
  nickname text,
  phone text NOT NULL,
  company text,
  city text,
  state text,
  email text,
  tags text[],
  assigned_to uuid,
  contact_type text,
  conversation_status text NOT NULL DEFAULT 'open',
  channel_type text,
  lead_origin text,
  consent_status text,
  lead_score integer,
  risk_score integer,
  ai_priority text,
  ai_sentiment text,
  group_category text,
  avatar_url text,
  visible boolean NOT NULL DEFAULT true,
  is_lid_legacy boolean NOT NULL DEFAULT false,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT statement_timestamp()
);
CREATE FUNCTION public.is_contact_visible_to_user(_contact_id uuid, _user_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _user_id = auth.uid()
     AND EXISTS (
       SELECT 1 FROM public.contacts c
       WHERE c.id = _contact_id
         AND (public.is_admin_or_supervisor(_user_id) OR c.visible)
     )
$$;

CREATE TABLE public.talkx_blacklist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid,
  phone text,
  reason text,
  reason_code public.talkx_blacklist_reason,
  origin text NOT NULL DEFAULT 'manual',
  expires_at timestamptz,
  removed_at timestamptz
);

-- talkx_recipients SEM segment_id: a X057a e quem adiciona a coluna.
CREATE TABLE public.talkx_recipients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.talkx_campaigns(id) ON DELETE CASCADE,
  contact_id uuid NOT NULL REFERENCES public.contacts(id),
  status text NOT NULL DEFAULT 'pending',
  sent_at timestamptz,
  UNIQUE (campaign_id, contact_id)
);

-- Guarda de escrita em recipients (estado de producao): DML direto de
-- 'authenticated' exige a GUC transacional app.talkx_recipient_snapshot_write.
CREATE OR REPLACE FUNCTION public.enforce_talkx_recipient_snapshot_mutability()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $function$
BEGIN
  IF current_user <> 'authenticated' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  IF auth.role() IS NULL THEN
    RAISE EXCEPTION 'talkx_guard_auth_role_undefined' USING ERRCODE = '42501';
  END IF;
  IF auth.role() <> 'authenticated' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  IF current_setting('app.talkx_recipient_snapshot_write', true) IS DISTINCT FROM 'on' THEN
    IF TG_OP = 'DELETE'
       AND NOT EXISTS (SELECT 1 FROM public.talkx_campaigns WHERE id = OLD.campaign_id) THEN
      RETURN OLD;
    END IF;
    RAISE EXCEPTION 'talkx_recipient_snapshot_required' USING ERRCODE = '42501';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$function$;
CREATE TRIGGER enforce_talkx_recipient_snapshot_mutability
  BEFORE INSERT OR UPDATE OR DELETE ON public.talkx_recipients
  FOR EACH ROW EXECUTE FUNCTION public.enforce_talkx_recipient_snapshot_mutability();

CREATE PUBLICATION supabase_realtime FOR TABLE public.talkx_recipients;

INSERT INTO public.profiles (id, user_id) VALUES
  ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001'),
  ('10000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000002'),
  ('10000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000003');
INSERT INTO public.user_roles (user_id, role) VALUES
  ('20000000-0000-0000-0000-000000000001', 'admin'),
  ('20000000-0000-0000-0000-000000000002', 'supervisor');

-- Segmentos A/B/C: alvo do backfill da X057a.
INSERT INTO public.talkx_segments (id, name) VALUES
  ('60000000-0000-0000-0000-000000000001', 'Segmento A'),
  ('60000000-0000-0000-0000-000000000002', 'Segmento B'),
  ('60000000-0000-0000-0000-000000000003', 'Segmento C');

-- Segmentos do cenario X057b: regras por tag. A tem 10 contatos (c01..c10),
-- B tem 8 (c08..c15, 3 repetidos com A) e C tem 5 (c14 + c16..c19, 1 repetido
-- com B) -> uniao = 19 contatos, 4 repetidos.
INSERT INTO public.talkx_segments (id, name, rules) VALUES
  ('60000000-0000-0000-0000-0000000000a1', 'Seg A', '{"groups":[{"match":"and","rules":[{"field":"tags","op":"contains","value":"seg-a"}]}]}'::jsonb),
  ('60000000-0000-0000-0000-0000000000a2', 'Seg B', '{"groups":[{"match":"and","rules":[{"field":"tags","op":"contains","value":"seg-b"}]}]}'::jsonb),
  ('60000000-0000-0000-0000-0000000000a3', 'Seg C', '{"groups":[{"match":"and","rules":[{"field":"tags","op":"contains","value":"seg-c"}]}]}'::jsonb);

INSERT INTO public.contacts (id, name, phone, tags) VALUES
  ('30000000-0000-0000-0000-000000000001', 'c01', '5511900000001', '{seg-a}'),
  ('30000000-0000-0000-0000-000000000002', 'c02', '5511900000002', '{seg-a}'),
  ('30000000-0000-0000-0000-000000000003', 'c03', '5511900000003', '{seg-a}'),
  ('30000000-0000-0000-0000-000000000004', 'c04', '5511900000004', '{seg-a}'),
  ('30000000-0000-0000-0000-000000000005', 'c05', '5511900000005', '{seg-a}'),
  ('30000000-0000-0000-0000-000000000006', 'c06', '5511900000006', '{seg-a}'),
  ('30000000-0000-0000-0000-000000000007', 'c07', '5511900000007', '{seg-a}'),
  ('30000000-0000-0000-0000-000000000008', 'c08', '5511900000008', '{seg-a,seg-b}'),
  ('30000000-0000-0000-0000-000000000009', 'c09', '5511900000009', '{seg-a,seg-b}'),
  ('30000000-0000-0000-0000-00000000000a', 'c10', '5511900000010', '{seg-a,seg-b}'),
  ('30000000-0000-0000-0000-00000000000b', 'c11', '5511900000011', '{seg-b}'),
  ('30000000-0000-0000-0000-00000000000c', 'c12', '5511900000012', '{seg-b}'),
  ('30000000-0000-0000-0000-00000000000d', 'c13', '5511900000013', '{seg-b}'),
  ('30000000-0000-0000-0000-00000000000e', 'c14', '5511900000014', '{seg-b,seg-c}'),
  ('30000000-0000-0000-0000-00000000000f', 'c15', '5511900000015', '{seg-b}'),
  ('30000000-0000-0000-0000-000000000010', 'c16', '5511900000016', '{seg-c}'),
  ('30000000-0000-0000-0000-000000000011', 'c17', '5511900000017', '{seg-c}'),
  ('30000000-0000-0000-0000-000000000012', 'c18', '5511900000018', '{seg-c}'),
  ('30000000-0000-0000-0000-000000000013', 'c19', '5511900000019', '{seg-c}');

-- Campanhas com segment_id (alvo do backfill) em varios status, e UMA campanha
-- sem segment_id (origem contacts/crm360) que NAO deve ganhar linha.
INSERT INTO public.talkx_campaigns (id, name, status, audience_source, segment_id, created_by) VALUES
  ('51000000-0000-0000-0000-000000000001', 'Enviando',  'sending', 'segment',  '60000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001'),
  ('51000000-0000-0000-0000-000000000002', 'Pausada',   'paused',  'segment',  '60000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001'),
  ('51000000-0000-0000-0000-000000000003', 'Concluida', 'done',    'segment',  '60000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001'),
  ('51000000-0000-0000-0000-000000000004', 'Rascunho',  'draft',   'segment',  '60000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001'),
  ('51000000-0000-0000-0000-000000000005', 'Sem segmento', 'draft','contacts', NULL,                                  '10000000-0000-0000-0000-000000000001');

GRANT USAGE ON SCHEMA public, auth TO anon, authenticated, service_role;
GRANT SELECT ON public.profiles, public.talkx_campaigns, public.talkx_recipients,
                public.talkx_segments, public.contacts, public.talkx_settings
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_admin_or_supervisor(uuid), auth.uid(), auth.role(),
  public.is_valid_talkx_schedule_timezone(text), public.is_contact_visible_to_user(uuid, uuid)
  TO authenticated, service_role;
SQL

# ---------------------------------------------------------------------------
# X057a REAL (estrutural) — mantem os blocos (1)-(5) verdes.
# ---------------------------------------------------------------------------
psql_test < "$migration_x057a" >/dev/null || fail 'X057a nao aplicou'
pass '(0) X057a aplicada sobre o schema minimo'

# ---------------------------------------------------------------------------
# (1) forma da tabela talkx_campaign_segments: colunas, PK, unique e checks
# ---------------------------------------------------------------------------
table_exists="$(psql_q "SELECT to_regclass('public.talkx_campaign_segments') IS NOT NULL")"
[[ "$table_exists" == 't' ]] || fail '(1) talkx_campaign_segments ausente'

cols="$(psql_q "SELECT count(*) FROM information_schema.columns
  WHERE table_schema='public' AND table_name='talkx_campaign_segments'
    AND column_name IN ('campaign_id','segment_id','position','status','paused_at')")"
[[ "$cols" == '5' ]] || fail "(1) talkx_campaign_segments sem as 5 colunas do contrato [obtido: $cols]"

pk="$(psql_q "SELECT count(*) FROM pg_constraint c
  WHERE c.conrelid='public.talkx_campaign_segments'::regclass AND c.contype='p'
    AND pg_get_constraintdef(c.oid) ILIKE '%campaign_id%'
    AND pg_get_constraintdef(c.oid) ILIKE '%segment_id%'")"
[[ "$pk" == '1' ]] || fail '(1) talkx_campaign_segments sem PRIMARY KEY (campaign_id, segment_id)'

uniq_pos="$(psql_q "SELECT count(*) FROM pg_constraint c
  WHERE c.conrelid='public.talkx_campaign_segments'::regclass AND c.contype='u'
    AND pg_get_constraintdef(c.oid) ILIKE '%campaign_id%'
    AND pg_get_constraintdef(c.oid) ILIKE '%position%'")"
[[ "$uniq_pos" == '1' ]] || fail '(1) talkx_campaign_segments sem UNIQUE (campaign_id, position)'

chk_pos="$(psql_q "SELECT count(*) FROM pg_constraint c
  WHERE c.conrelid='public.talkx_campaign_segments'::regclass AND c.contype='c'
    AND pg_get_constraintdef(c.oid) ILIKE '%position%'
    AND pg_get_constraintdef(c.oid) ILIKE '%10%'")"
[[ "$chk_pos" == '1' ]] || fail '(1) talkx_campaign_segments sem CHECK position entre 1 e 10'

chk_status="$(psql_q "SELECT count(*) FROM pg_constraint c
  WHERE c.conrelid='public.talkx_campaign_segments'::regclass AND c.contype='c'
    AND pg_get_constraintdef(c.oid) ILIKE '%pending%'
    AND pg_get_constraintdef(c.oid) ILIKE '%sending%'
    AND pg_get_constraintdef(c.oid) ILIKE '%paused%'
    AND pg_get_constraintdef(c.oid) ILIKE '%done%'")"
[[ "$chk_status" == '1' ]] || fail '(1) talkx_campaign_segments sem CHECK status in (pending,sending,paused,done)'
pass '(1) talkx_campaign_segments: 5 colunas, PK (campaign_id,segment_id), UNIQUE (campaign_id,position), CHECK position 1..10 e CHECK de status presentes'

# ---------------------------------------------------------------------------
# (2) RLS LIGADA + as 5 policies
# ---------------------------------------------------------------------------
rls_on="$(psql_q "SELECT relrowsecurity FROM pg_class WHERE oid='public.talkx_campaign_segments'::regclass")"
[[ "$rls_on" == 't' ]] || fail '(2) row level security NAO esta ligada em talkx_campaign_segments'

pol_total="$(psql_q "SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename='talkx_campaign_segments'")"
[[ "$pol_total" == '5' ]] || fail "(2) esperava 5 policies em talkx_campaign_segments [obtido: $pol_total]"

for pname in \
  'Admins can view all campaign segments' \
  'Users can view own campaign segments' \
  'Users can create campaign segments' \
  'Users can update own campaign segments' \
  'Users can delete own draft campaign segments'; do
  n="$(psql_q "SELECT count(*) FROM pg_policies WHERE schemaname='public'
    AND tablename='talkx_campaign_segments' AND policyname='$pname'")"
  [[ "$n" == '1' ]] || fail "(2) policy ausente: '$pname'"
done

pol_cmd="$(psql_q "SELECT string_agg(cmd||':'||qtd, ',' ORDER BY cmd) FROM (
  SELECT cmd, count(*) AS qtd FROM pg_policies
   WHERE schemaname='public' AND tablename='talkx_campaign_segments'
   GROUP BY cmd) t")"
[[ "$pol_cmd" == 'DELETE:1,INSERT:1,SELECT:2,UPDATE:1' ]] \
  || fail "(2) distribuicao de comandos das policies diverge [obtido: $pol_cmd]"
pass '(2) RLS ligada + 5 policies (SELECT x2, INSERT, UPDATE, DELETE)'
case_done rls_policies

# ---------------------------------------------------------------------------
# (3) talkx_recipients.segment_id (uuid, anulavel) + indice
# ---------------------------------------------------------------------------
recv="$(psql_q "SELECT data_type||'|'||is_nullable FROM information_schema.columns
  WHERE table_schema='public' AND table_name='talkx_recipients' AND column_name='segment_id'")"
[[ "$recv" == 'uuid|YES' ]] || fail "(3) talkx_recipients.segment_id deveria ser uuid anulavel [obtido: '${recv:-<ausente>}']"

idx_cols="$(psql_q "SELECT string_agg(a.attname, ',' ORDER BY k.ord)
  FROM pg_index i
  JOIN pg_class ic ON ic.oid=i.indexrelid
  JOIN pg_class t  ON t.oid=i.indrelid
  JOIN unnest(i.indkey) WITH ORDINALITY AS k(attnum, ord) ON true
  JOIN pg_attribute a ON a.attrelid=t.oid AND a.attnum=k.attnum
  WHERE ic.relname='idx_talkx_recipients_campaign_segment_status'")"
[[ "$idx_cols" == 'campaign_id,segment_id,status' ]] \
  || fail "(3) indice idx_talkx_recipients_campaign_segment_status ausente/errado [obtido: '${idx_cols:-<ausente>}']"
pass '(3) talkx_recipients.segment_id uuid anulavel + indice (campaign_id, segment_id, status)'
case_done recipients_column_index

# ---------------------------------------------------------------------------
# (4) BACKFILL
# ---------------------------------------------------------------------------
seg1='60000000-0000-0000-0000-000000000001'
seg2='60000000-0000-0000-0000-000000000002'
seg3='60000000-0000-0000-0000-000000000003'
seg_a='60000000-0000-0000-0000-0000000000a1'
seg_b='60000000-0000-0000-0000-0000000000a2'
seg_c='60000000-0000-0000-0000-0000000000a3'
c_sending='51000000-0000-0000-0000-000000000001'
c_paused='51000000-0000-0000-0000-000000000002'
c_done='51000000-0000-0000-0000-000000000003'
c_draft='51000000-0000-0000-0000-000000000004'
c_noseg='51000000-0000-0000-0000-000000000005'

assert_backfill() {
  local campaign="$1" want_seg="$2" want_pos="$3" want_status="$4"
  local n seg pos st
  n="$(psql_q "SELECT count(*) FROM public.talkx_campaign_segments WHERE campaign_id='$campaign'")"
  [[ "$n" == '1' ]] || fail "(4) campanha $campaign deveria ter 1 linha no backfill [obtido: $n]"
  seg="$(psql_q "SELECT segment_id FROM public.talkx_campaign_segments WHERE campaign_id='$campaign'")"
  [[ "$seg" == "$want_seg" ]] || fail "(4) campanha $campaign: segmento errado [obtido: $seg | esperado: $want_seg]"
  pos="$(psql_q "SELECT position FROM public.talkx_campaign_segments WHERE campaign_id='$campaign'")"
  [[ "$pos" == "$want_pos" ]] || fail "(4) campanha $campaign: position esperada $want_pos [obtido: $pos]"
  st="$(psql_q "SELECT status FROM public.talkx_campaign_segments WHERE campaign_id='$campaign'")"
  [[ "$st" == "$want_status" ]] || fail "(4) campanha $campaign: status esperado '$want_status' [obtido: '$st']"
}

assert_backfill "$c_sending" "$seg1" '1' 'sending'
assert_backfill "$c_paused"  "$seg2" '1' 'paused'
assert_backfill "$c_done"    "$seg3" '1' 'done'
assert_backfill "$c_draft"   "$seg1" '1' 'pending'
pass '(4) campanha com segment_id ganha 1 linha: position 1 e status espelhando (sending/paused/done/draft->pending)'
case_done backfill_with_segment

noseg_n="$(psql_q "SELECT count(*) FROM public.talkx_campaign_segments WHERE campaign_id='$c_noseg'")"
[[ "$noseg_n" == '0' ]] || fail "(4) campanha SEM segment_id NAO deveria ganhar linha [obtido: $noseg_n]"
empty_total="$(psql_q "SELECT count(*) FROM public.talkx_campaign_segments")"
[[ "$empty_total" == '4' ]] || fail "(4) backfill deveria ter exatamente 4 linhas (4 campanhas com seg, 1 sem) [obtido: $empty_total]"
pass '(4) campanha SEM segment_id nao ganha linha (4 linhas no total, so as 4 com segment_id)'
case_done backfill_without_segment

# ---------------------------------------------------------------------------
# (2b) as restricoes MORDEM de verdade (prova funcional, mesma tabela de (1))
# ---------------------------------------------------------------------------
psql_q "INSERT INTO public.talkx_campaign_segments (campaign_id, segment_id, position, status)
        VALUES ('$c_noseg','$seg1',1,'pending')" >/dev/null
[[ "$(psql_q "SELECT count(*) FROM public.talkx_campaign_segments WHERE campaign_id='$c_noseg'")" == '1' ]] \
  || fail '(2b) insercao legitima de segmento falhou'

expect_error '(2b) PK (campaign_id,segment_id) duplicada bloqueia' '23505' \
  "INSERT INTO public.talkx_campaign_segments (campaign_id, segment_id, position, status) VALUES ('$c_noseg','$seg1',2,'pending')"
expect_error '(2b) UNIQUE (campaign_id,position) duplicada bloqueia' '23505' \
  "INSERT INTO public.talkx_campaign_segments (campaign_id, segment_id, position, status) VALUES ('$c_noseg','$seg2',1,'pending')"
expect_error '(2b) CHECK position <= 10 bloqueia' '23514' \
  "INSERT INTO public.talkx_campaign_segments (campaign_id, segment_id, position, status) VALUES ('$c_noseg','$seg3',11,'pending')"
expect_error '(2b) CHECK position >= 1 bloqueia' '23514' \
  "INSERT INTO public.talkx_campaign_segments (campaign_id, segment_id, position, status) VALUES ('$c_noseg','$seg3',0,'pending')"
expect_error '(2b) CHECK status in (...) bloqueia' '23514' \
  "INSERT INTO public.talkx_campaign_segments (campaign_id, segment_id, position, status) VALUES ('$c_noseg','$seg3',3,'xpto')"
case_done table_shape
case_done constraints

# ---------------------------------------------------------------------------
# (5) REALTIME: as duas tabelas na publicacao supabase_realtime
# ---------------------------------------------------------------------------
pub_seg="$(psql_q "SELECT count(*) FROM pg_publication_tables
  WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='talkx_campaign_segments'")"
[[ "$pub_seg" == '1' ]] || fail "(5) talkx_campaign_segments NAO esta em supabase_realtime [obtido: $pub_seg]"

pub_rec="$(psql_q "SELECT count(*) FROM pg_publication_tables
  WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='talkx_recipients'")"
[[ "$pub_rec" == '1' ]] || fail "(5) talkx_recipients NAO esta em supabase_realtime [obtido: $pub_rec]"
pass '(5) talkx_campaign_segments e talkx_recipients publicadas em supabase_realtime'
case_done realtime_publication

# ---------------------------------------------------------------------------
# Cadeia viva das RPCs (migrations REAIS na ordem de versao): X016 (motor de
# audiencia), X017 (snapshot + save com supressao), X018 (pace/max_per_minute)
# e X032 (consentimento — ultima redefinicao das funcoes). Estado = producao
# ANTES da X057b.
# ---------------------------------------------------------------------------
for m in "$migration_x016" "$migration_x017" "$migration_x018" "$migration_x032"; do
  psql_test < "$m" >/dev/null || fail "migration nao aplicou: $(basename "$m")"
done
pass '(0) cadeia viva aplicada: X016 -> X017 -> X018 -> X032 (funcoes no estado atual)'

admin_uid='20000000-0000-0000-0000-000000000001'
agent_uid='20000000-0000-0000-0000-000000000003'

save_call() {
  local campaign_id="$1" revision="$2" key="$3" payload="$4"
  as_user authenticated "$admin_uid" \
    "SELECT campaign_id || ':' || revision || ':' || creation_replayed FROM public.save_talkx_campaign_draft($campaign_id, $revision, '$key'::uuid, '$payload'::jsonb);"
}

base_fields='"message_template":"Oi","objective":"vendas"'

# ---------------------------------------------------------------------------
# BLOCO A — o DEFEITO nas funcoes vivas (X057b ainda nao aplicada)
# ---------------------------------------------------------------------------
printf '\n============ BLOCO A — defeito (funcoes ignoram a tabela) ============\n'

# A.1: payload JA traz segment_ids (contrato do plano) — a funcao viva ignora a
# chave, cria a campanha e nao grava nada na tabela.
payload_multi="{\"name\":\"Multi A\",$base_fields,\"audience_source\":\"segment\",\"segment_id\":\"$seg_a\",\"segment_ids\":[\"$seg_a\",\"$seg_b\",\"$seg_c\"]}"
created_a1="$(save_call 'NULL' 'NULL' '30000000-0000-0000-0000-0000000000a1' "$payload_multi")"
camp_a1="${created_a1%%:*}"
[[ "$camp_a1" =~ ^[0-9a-f-]{36}$ ]] || fail "A.1 save nao criou a campanha [obtido: $created_a1]"
expect_value 'A.1 (DEFEITO) rascunho com 3 segment_ids nao grava NADA em talkx_campaign_segments' '0' \
  "SELECT count(*) FROM public.talkx_campaign_segments WHERE campaign_id='$camp_a1'"
case_done defect_draft_ignores_segment_ids

# A.2: snapshot resolve so o segment_id legado (10 contatos de A) e nao carimba
# recipients.segment_id — a uniao ordenada (19) nunca acontece.
as_user authenticated "$admin_uid" "SELECT public.snapshot_talkx_campaign_audience('$camp_a1', 1);" >/dev/null
expect_value 'A.2 (DEFEITO) snapshot resolve so o segment_id legado (10, nao 19)' '10' \
  "SELECT count(*) FROM public.talkx_recipients WHERE campaign_id='$camp_a1'"
expect_value 'A.2 (DEFEITO) nenhum destinatario carimba segment_id' '0' \
  "SELECT count(*) FROM public.talkx_recipients WHERE campaign_id='$camp_a1' AND segment_id IS NOT NULL"
case_done defect_snapshot_ignores_segments

# A.3: 11 segmentos passam sem validacao (a funcao viva nao conhece o limite).
ghosts="\"$seg_a\",\"$seg_b\",\"$seg_c\",\"70000000-0000-0000-0000-000000000001\",\"70000000-0000-0000-0000-000000000002\",\"70000000-0000-0000-0000-000000000003\",\"70000000-0000-0000-0000-000000000004\",\"70000000-0000-0000-0000-000000000005\",\"70000000-0000-0000-0000-000000000006\",\"70000000-0000-0000-0000-000000000007\",\"70000000-0000-0000-0000-000000000008\""
created_a3="$(save_call 'NULL' 'NULL' '30000000-0000-0000-0000-0000000000a3' "{\"name\":\"Onze\",$base_fields,\"audience_source\":\"segment\",\"segment_id\":\"$seg_a\",\"segment_ids\":[$ghosts]}")"
[[ "${created_a3%%:*}" =~ ^[0-9a-f-]{36}$ ]] || fail 'A.3 (DEFEITO esperado) save com 11 segment_ids foi recusado'
pass 'A.3 (DEFEITO) 11 segment_ids aceitos sem 22023 — o limite nao existia'

# ---------------------------------------------------------------------------
# Aplica a migration X057b REAL (o objeto sob teste)
# ---------------------------------------------------------------------------
printf '\n============ BLOCO B — X057b aplicada ============\n'
psql_test < "$migration_x057b" >/dev/null || fail 'X057b nao aplicou'
pass '(0) X057b aplicada sobre a cadeia viva'

# ---------------------------------------------------------------------------
# B.1 salvar: segment_ids grava a lista ordenada; segment_id = position 1
# ---------------------------------------------------------------------------
created_b1="$(save_call 'NULL' 'NULL' '30000000-0000-0000-0000-0000000000b1' "$payload_multi")"
camp_b1="${created_b1%%:*}"
[[ "$created_b1" == *':1:false' ]] || fail "B.1 save nao criou revisao 1 [obtido: $created_b1]"
expect_value 'B.1 campanha guarda segment_id = primeiro da lista' "$seg_a" \
  "SELECT segment_id FROM public.talkx_campaigns WHERE id='$camp_b1'"
expect_value 'B.1 talkx_campaign_segments gravou as 3 linhas' '3' \
  "SELECT count(*) FROM public.talkx_campaign_segments WHERE campaign_id='$camp_b1'"
ordered_b1="$(psql_q "SELECT string_agg(position || ':' || segment_id, ',' ORDER BY position) FROM public.talkx_campaign_segments WHERE campaign_id='$camp_b1'")"
[[ "$ordered_b1" == "1:$seg_a,2:$seg_b,3:$seg_c" ]] || fail "B.1 ordem divergente [obtido: $ordered_b1]"
expect_value 'B.1 status das linhas espelha campanha draft -> pending' '3' \
  "SELECT count(*) FROM public.talkx_campaign_segments WHERE campaign_id='$camp_b1' AND status='pending'"
case_done save_writes_ordered_segments

# B.1b: so a lista (sem segment_id legado) -> primeiro vira o segment_id.
created_b1b="$(save_call 'NULL' 'NULL' '30000000-0000-0000-0000-0000000000b2' "{\"name\":\"So lista\",$base_fields,\"audience_source\":\"segment\",\"segment_ids\":[\"$seg_c\",\"$seg_b\"]}")"
camp_b1b="${created_b1b%%:*}"
expect_value 'B.1b sem segment_id: primeiro da lista vira o segment_id da campanha' "$seg_c" \
  "SELECT segment_id FROM public.talkx_campaigns WHERE id='$camp_b1b'"
ordered_b1b="$(psql_q "SELECT string_agg(position || ':' || segment_id, ',' ORDER BY position) FROM public.talkx_campaign_segments WHERE campaign_id='$camp_b1b'")"
[[ "$ordered_b1b" == "1:$seg_c,2:$seg_b" ]] || fail "B.1b ordem divergente [obtido: $ordered_b1b]"
pass 'B.1b payload so com segment_ids funciona (sem chave legada)'

# B.1c: compatibilidade — so segment_id (payload antigo) grava 1 linha.
created_b1c="$(save_call 'NULL' 'NULL' '30000000-0000-0000-0000-0000000000b4' "{\"name\":\"Legado\",$base_fields,\"audience_source\":\"segment\",\"segment_id\":\"$seg_b\"}")"
camp_b1c="${created_b1c%%:*}"
expect_value 'B.1c payload antigo (so segment_id) grava 1 linha position 1' "1:$seg_b" \
  "SELECT string_agg(position || ':' || segment_id, ',' ORDER BY position) FROM public.talkx_campaign_segments WHERE campaign_id='$camp_b1c'"
case_done save_rewrites_and_compat

# ---------------------------------------------------------------------------
# B.2 validacao (22023) — antes de qualquer escrita
# ---------------------------------------------------------------------------
expect_error_code_as 'B.2 11 segmentos -> 22023' '22023' authenticated "$admin_uid" \
  "SELECT * FROM public.save_talkx_campaign_draft(NULL, NULL, '30000000-0000-0000-0000-0000000000c1'::uuid, '{\"name\":\"Onze B\",$base_fields,\"audience_source\":\"segment\",\"segment_ids\":[$ghosts]}'::jsonb);"
expect_value 'B.2 recusa de 11 segmentos nao gravou campanha nem linhas' '0' \
  "SELECT count(*) FROM public.talkx_campaigns WHERE name='Onze B'"
expect_error_code_as 'B.2 uuid repetido -> 22023' '22023' authenticated "$admin_uid" \
  "SELECT * FROM public.save_talkx_campaign_draft(NULL, NULL, '30000000-0000-0000-0000-0000000000c2'::uuid, '{\"name\":\"Dup\",$base_fields,\"audience_source\":\"segment\",\"segment_ids\":[\"$seg_a\",\"$seg_a\"]}'::jsonb);"
expect_error_code_as 'B.2 item nao-uuid -> 22023' '22023' authenticated "$admin_uid" \
  "SELECT * FROM public.save_talkx_campaign_draft(NULL, NULL, '30000000-0000-0000-0000-0000000000c3'::uuid, '{\"name\":\"Ruim\",$base_fields,\"audience_source\":\"segment\",\"segment_ids\":[\"$seg_a\",\"nao-e-uuid\"]}'::jsonb);"
expect_error_code_as 'B.2 lista vazia com source segment -> 22023' '22023' authenticated "$admin_uid" \
  "SELECT * FROM public.save_talkx_campaign_draft(NULL, NULL, '30000000-0000-0000-0000-0000000000c4'::uuid, '{\"name\":\"Vazia\",$base_fields,\"audience_source\":\"segment\",\"segment_ids\":[]}'::jsonb);"
expect_error_code_as 'B.2 lista em audience_source contacts -> 22023' '22023' authenticated "$admin_uid" \
  "SELECT * FROM public.save_talkx_campaign_draft(NULL, NULL, '30000000-0000-0000-0000-0000000000c5'::uuid, '{\"name\":\"Fora\",$base_fields,\"audience_source\":\"contacts\",\"segment_ids\":[\"$seg_a\"]}'::jsonb);"
expect_error_code_as 'B.2 segment_ids nao-array -> 22023' '22023' authenticated "$admin_uid" \
  "SELECT * FROM public.save_talkx_campaign_draft(NULL, NULL, '30000000-0000-0000-0000-0000000000c6'::uuid, '{\"name\":\"Obj\",$base_fields,\"audience_source\":\"segment\",\"segment_ids\":{\"a\":1}}'::jsonb);"
expect_value 'B.2 nenhuma das recusas gravou campanha' '0' \
  "SELECT count(*) FROM public.talkx_campaigns WHERE name IN ('Onze B','Dup','Ruim','Vazia','Fora','Obj')"

# limite 1..10: 10 segmentos passam (sA..sC + 7 fantasmas precisam existir p/ FK)
for i in 1 2 3 4 5 6 7; do
  psql_q "INSERT INTO public.talkx_segments (id, name) VALUES ('70000000-0000-0000-0000-00000000000$i', 'extra $i')" >/dev/null
done
ten="$seg_a\",\"$seg_b\",\"$seg_c\",\"70000000-0000-0000-0000-000000000001\",\"70000000-0000-0000-0000-000000000002\",\"70000000-0000-0000-0000-000000000003\",\"70000000-0000-0000-0000-000000000004\",\"70000000-0000-0000-0000-000000000005\",\"70000000-0000-0000-0000-000000000006\",\"70000000-0000-0000-0000-000000000007"
created_b10="$(save_call 'NULL' 'NULL' '30000000-0000-0000-0000-0000000000c7' "{\"name\":\"Dez\",$base_fields,\"audience_source\":\"segment\",\"segment_ids\":[\"$ten\"]}")"
camp_b10="${created_b10%%:*}"
expect_value 'B.2 10 segmentos (borda) -> 10 linhas' '10' \
  "SELECT count(*) FROM public.talkx_campaign_segments WHERE campaign_id='$camp_b10'"
case_done save_validates_segment_list

# ---------------------------------------------------------------------------
# B.3 resolver: snapshot une os segmentos em ordem, sem duplicar contato
# ---------------------------------------------------------------------------
snap_json="$(as_user authenticated "$admin_uid" "SELECT public.snapshot_talkx_campaign_audience('$camp_b1', 1);")"
for pair in 'eligible=19' 'suppressed=0' 'skipped_invalid=0'; do
  key="${pair%%=*}"; want="${pair##*=}"
  got="$(as_user authenticated "$admin_uid" "SELECT (public.snapshot_talkx_campaign_audience('$camp_b1', 1) ->> '$key')::bigint;")"
  [[ "$got" == "$want" ]] || fail "B.3 snapshot.$key deveria ser $want [obtido: $got | $snap_json]"
done
expect_value 'B.3 19 destinatarios unicos (10+8+5 menos 4 repetidos)' '19' \
  "SELECT count(*) FROM public.talkx_recipients WHERE campaign_id='$camp_b1'"
expect_value 'B.3 total_recipients = 19' '19' \
  "SELECT total_recipients FROM public.talkx_campaigns WHERE id='$camp_b1'"
case_done snapshot_resolves_in_order

# cada contato carimba o PRIMEIRO segmento (position) que o contem
expect_value 'B.3 contatos marcados com seg A (position 1): c01..c10' '10' \
  "SELECT count(*) FROM public.talkx_recipients WHERE campaign_id='$camp_b1' AND segment_id='$seg_a'"
expect_value 'B.3 contatos marcados com seg B (position 2): c11..c15' '5' \
  "SELECT count(*) FROM public.talkx_recipients WHERE campaign_id='$camp_b1' AND segment_id='$seg_b'"
expect_value 'B.3 contatos marcados com seg C (position 3): c16..c19' '4' \
  "SELECT count(*) FROM public.talkx_recipients WHERE campaign_id='$camp_b1' AND segment_id='$seg_c'"
expect_value 'B.3 c08 (A e B) fica com o primeiro: A' "$seg_a" \
  "SELECT segment_id FROM public.talkx_recipients WHERE campaign_id='$camp_b1' AND contact_id='30000000-0000-0000-0000-000000000008'"
expect_value 'B.3 c14 (B e C) fica com o primeiro: B' "$seg_b" \
  "SELECT segment_id FROM public.talkx_recipients WHERE campaign_id='$camp_b1' AND contact_id='30000000-0000-0000-0000-00000000000e'"
case_done snapshot_stamps_first_segment

# campanha antiga (sem linhas na tabela, so segment_id legado) resolve via
# fallback e carimba o segmento legado.
legacy_camp='51000000-0000-0000-0000-0000000000ff'
psql_q "INSERT INTO public.talkx_campaigns (id, name, status, audience_source, segment_id, created_by, revision)
        VALUES ('$legacy_camp','Antiga sem linhas','draft','segment','$seg_b','10000000-0000-0000-0000-000000000001',7)" >/dev/null
as_user authenticated "$admin_uid" "SELECT public.snapshot_talkx_campaign_audience('$legacy_camp', 7);" >/dev/null
expect_value 'B.3 legado sem linhas: snapshot cai no segment_id legado (8 contatos de B)' '8' \
  "SELECT count(*) FROM public.talkx_recipients WHERE campaign_id='$legacy_camp'"
expect_value 'B.3 legado: destinatarios carimbam o segmento legado' '8' \
  "SELECT count(*) FROM public.talkx_recipients WHERE campaign_id='$legacy_camp' AND segment_id='$seg_b'"

# A campanha do BLOCO A (criada antes da X057b, sem linhas) resolve via o
# fallback legado — e agora carimba segment_id.
as_user authenticated "$admin_uid" "SELECT public.snapshot_talkx_campaign_audience('$camp_a1', 1);" >/dev/null
expect_value 'B.3 re-snapshot da campanha antiga: mesmo universo do legado (10) com carimbo' '10' \
  "SELECT count(*) FROM public.talkx_recipients WHERE campaign_id='$camp_a1' AND segment_id='$seg_a'"

# ---------------------------------------------------------------------------
# B.4 update regrava a lista; trocar de origem limpa as linhas
# ---------------------------------------------------------------------------
upd_b4="$(save_call "'$camp_b1'::uuid" '1' '30000000-0000-0000-0000-0000000000d1' "{\"name\":\"Multi B\",$base_fields,\"audience_source\":\"segment\",\"segment_ids\":[\"$seg_b\",\"$seg_c\"]}")"
[[ "$upd_b4" == "$camp_b1:2:false" ]] || fail "B.4 update nao avancou para rev 2 [obtido: $upd_b4]"
expect_value 'B.4 update regravou a lista (2 linhas, nova ordem)' "1:$seg_b,2:$seg_c" \
  "SELECT string_agg(position || ':' || segment_id, ',' ORDER BY position) FROM public.talkx_campaign_segments WHERE campaign_id='$camp_b1'"
expect_value 'B.4 update moveu o segment_id da campanha para o novo primeiro' "$seg_b" \
  "SELECT segment_id FROM public.talkx_campaigns WHERE id='$camp_b1'"

upd_b4b="$(save_call "'$camp_b1'::uuid" '2' '30000000-0000-0000-0000-0000000000d2' "{\"name\":\"Virou contatos\",$base_fields,\"audience_source\":\"contacts\"}")"
[[ "$upd_b4b" == "$camp_b1:3:false" ]] || fail "B.4 update para contacts falhou [obtido: $upd_b4b]"
expect_value 'B.4 trocar para contacts remove as linhas de segmento' '0' \
  "SELECT count(*) FROM public.talkx_campaign_segments WHERE campaign_id='$camp_b1'"
expect_value 'B.4 segment_id da campanha limpo junto' '0' \
  "SELECT count(*) FROM public.talkx_campaigns WHERE id='$camp_b1' AND segment_id IS NOT NULL"
expect_error_code_as 'B.4 revisao velha (save concorrente) -> 40001' '40001' authenticated "$admin_uid" \
  "SELECT * FROM public.save_talkx_campaign_draft('$camp_b1'::uuid, 1, NULL, '{\"name\":\"Stale\",$base_fields,\"audience_source\":\"segment\",\"segment_ids\":[\"$seg_a\"]}'::jsonb);"
expect_value 'B.4 a escrita stale nao tocou a campanha nem a lista' '0' \
  "SELECT count(*) FROM public.talkx_campaigns WHERE id='$camp_b1' AND (name='Stale' OR segment_id IS NOT NULL)"

# ---------------------------------------------------------------------------
# B.5 atomicidade: erro na segunda escrita nao deixa meio caminho
# ---------------------------------------------------------------------------
created_b5="$(save_call 'NULL' 'NULL' '30000000-0000-0000-0000-0000000000e1' "{\"name\":\"Atomica\",$base_fields,\"audience_source\":\"segment\",\"segment_ids\":[\"$seg_a\"]}")"
camp_b5="${created_b5%%:*}"
expect_error_code_as 'B.5 update com segmento inexistente falha na 2a escrita (FK)' '23503' authenticated "$admin_uid" \
  "SELECT * FROM public.save_talkx_campaign_draft('$camp_b5'::uuid, 1, NULL, '{\"name\":\"Renomeada\",$base_fields,\"audience_source\":\"segment\",\"segment_ids\":[\"$seg_b\",\"70000000-0000-0000-0000-00000000ffff\"]}'::jsonb);"
expect_value 'B.5 campanha nao mudou (rollback da transacao inteira)' 'Atomica' \
  "SELECT name FROM public.talkx_campaigns WHERE id='$camp_b5'"
expect_value 'B.5 revisao nao avancou' '1' \
  "SELECT revision FROM public.talkx_campaigns WHERE id='$camp_b5'"
expect_value 'B.5 lista anterior intacta' "1:$seg_a" \
  "SELECT string_agg(position || ':' || segment_id, ',' ORDER BY position) FROM public.talkx_campaign_segments WHERE campaign_id='$camp_b5'"
case_done atomicity

# ---------------------------------------------------------------------------
# B.6 replay: mesma chave + mesmo payload = replayed; lista divergente = 40001
# ---------------------------------------------------------------------------
created_b6="$(save_call 'NULL' 'NULL' '30000000-0000-0000-0000-0000000000e2' "$payload_multi")"
camp_b6="${created_b6%%:*}"
replay_b6b="$(save_call 'NULL' 'NULL' '30000000-0000-0000-0000-0000000000e2' "$payload_multi")"
[[ "$replay_b6b" == "$camp_b6:1:true" ]] || fail "B.6 replay idempotente divergiu [obtido: $replay_b6b]"
expect_value 'B.6 replay manteve a lista' "1:$seg_a,2:$seg_b,3:$seg_c" \
  "SELECT string_agg(position || ':' || segment_id, ',' ORDER BY position) FROM public.talkx_campaign_segments WHERE campaign_id='$camp_b6'"
expect_error_code_as 'B.6 mesma chave com lista divergente -> 40001' '40001' authenticated "$admin_uid" \
  "SELECT * FROM public.save_talkx_campaign_draft(NULL, NULL, '30000000-0000-0000-0000-0000000000e2'::uuid, '{\"name\":\"Multi A\",$base_fields,\"audience_source\":\"segment\",\"segment_id\":\"$seg_a\",\"segment_ids\":[\"$seg_a\",\"$seg_b\"]}'::jsonb);"

# ---------------------------------------------------------------------------
# B.7 ACL e papel: anon sem EXECUTE; agente sem papel -> 42501
# ---------------------------------------------------------------------------
expect_value 'B.7 anon sem EXECUTE em save_talkx_campaign_draft' 'f' \
  "SELECT has_function_privilege('anon','public.save_talkx_campaign_draft(uuid,bigint,uuid,jsonb)','EXECUTE')"
expect_value 'B.7 anon sem EXECUTE em snapshot_talkx_campaign_audience' 'f' \
  "SELECT has_function_privilege('anon','public.snapshot_talkx_campaign_audience(uuid,bigint)','EXECUTE')"
expect_value 'B.7 authenticated com EXECUTE em save_talkx_campaign_draft' 't' \
  "SELECT has_function_privilege('authenticated','public.save_talkx_campaign_draft(uuid,bigint,uuid,jsonb)','EXECUTE')"
expect_value 'B.7 authenticated com EXECUTE em snapshot_talkx_campaign_audience' 't' \
  "SELECT has_function_privilege('authenticated','public.snapshot_talkx_campaign_audience(uuid,bigint)','EXECUTE')"
expect_error_code_as 'B.7 agente (sem papel) nao salva rascunho' '42501' authenticated "$agent_uid" \
  "SELECT * FROM public.save_talkx_campaign_draft(NULL, NULL, '30000000-0000-0000-0000-0000000000f1'::uuid, '{\"name\":\"X\",$base_fields,\"audience_source\":\"segment\",\"segment_ids\":[\"$seg_a\"]}'::jsonb);"
expect_error_code_as 'B.7 agente (sem papel) nao gera snapshot' '42501' authenticated "$agent_uid" \
  "SELECT public.snapshot_talkx_campaign_audience('$camp_b6', 1);"
case_done acl_and_role

# ---------------------------------------------------------------------------
# BLOCO RB — rollback documentado na migration volta ao estado anterior.
# O '-- Rollback:' manda reaplicar os corpos anteriores que ja estao
# versionados no repo (mesmo padrao de tick-expurgo): o bloco que vai de
# 'CREATE OR REPLACE FUNCTION <nome>' ate o COMMENT, em cada migration
# referenciada. O bloco abaixo extrai e executa exatamente isso.
# ---------------------------------------------------------------------------
printf '\n============ BLOCO RB — rollback executavel ============\n'
extract_fn() {
  awk -v fn="$2" '
    index($0, "CREATE OR REPLACE FUNCTION " fn) == 1 {inblock=1}
    inblock {print}
    inblock && index($0, "COMMENT ON FUNCTION " fn) == 1 {getline; print; exit}
  ' "$1"
}
rollback_sql="$(
  extract_fn "$migration_x032" 'public.save_talkx_campaign_draft'
  echo
  extract_fn "$migration_x017" 'public.snapshot_talkx_campaign_audience'
)"
[[ "$rollback_sql" == *"CREATE OR REPLACE FUNCTION public.save_talkx_campaign_draft"* \
   && "$rollback_sql" == *"CREATE OR REPLACE FUNCTION public.snapshot_talkx_campaign_audience"* ]] \
  || fail 'RB: extracao dos corpos anteriores nao achou as duas funcoes'
printf '%s\n' "$rollback_sql" | psql_test >/dev/null || fail 'RB: bloco de rollback nao executou'

created_rb="$(save_call 'NULL' 'NULL' '30000000-0000-0000-0000-0000000000f2' "$payload_multi")"
camp_rb="${created_rb%%:*}"
expect_value 'RB apos rollback a funcao anterior volta a ignorar segment_ids' '0' \
  "SELECT count(*) FROM public.talkx_campaign_segments WHERE campaign_id='$camp_rb'"
expect_value 'RB ACL restaurada: authenticated segue com EXECUTE' 't' \
  "SELECT has_function_privilege('authenticated','public.save_talkx_campaign_draft(uuid,bigint,uuid,jsonb)','EXECUTE')"
expect_value 'RB ACL restaurada: anon segue sem EXECUTE no snapshot' 'f' \
  "SELECT has_function_privilege('anon','public.snapshot_talkx_campaign_audience(uuid,bigint)','EXECUTE')"

psql_test < "$migration_x057b" >/dev/null || fail 'RB: reaplicacao (idempotencia) falhou'
created_rb2="$(save_call 'NULL' 'NULL' '30000000-0000-0000-0000-0000000000f3' "$payload_multi")"
camp_rb2="${created_rb2%%:*}"
expect_value 'RB reaplicada: lista gravada de novo' '3' \
  "SELECT count(*) FROM public.talkx_campaign_segments WHERE campaign_id='$camp_rb2'"
case_done rollback_restores_previous

# ---------------------------------------------------------------------------
# AUSENCIA DE MEDICAO CONTA COMO FALHA
# ---------------------------------------------------------------------------
for c in "${CASES_EXPECTED[@]}"; do
  [[ "${CASES_SEEN[$c]:-}" == '1' ]] || fail "caso de aceite NAO executado: $c (ausencia de medicao)"
done
printf 'PASS: %s/%s casos de aceite medidos\n' "${#CASES_EXPECTED[@]}" "${#CASES_EXPECTED[@]}"
printf 'PASS: X057 — estrutura (tabela, RLS, coluna, indice, backfill, realtime) + comportamento (salvar lista ordenada, validar 22023, resolver em ordem sem duplicar, atomicidade, compat, rollback)\n'
