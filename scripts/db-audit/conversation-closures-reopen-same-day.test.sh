#!/usr/bin/env bash
# R2-DB-008 / item 295 (P2) — "Índice de um fechamento por dia impede encerrar
# novamente uma conversa reaberta".
#
# BLOCO A — cadeia REAL sem a correção (20260909220000 + 20260927590000): o
#   índice único diário public.conversation_closures_contact_day_uidx
#   (contact_id, conversation_closure_day(created_at)) rejeita o segundo
#   fechamento do MESMO contato no MESMO dia (23505) e a RPC
#   public.close_conversation_atomic desfaz a transação inteira: a conversa
#   reaberta NÃO encerra de novo (nada fica pela metade). O INSERT direto do
#   auto-close (Edge, client_request_id NULL) cai no mesmo índice.
# BLOCO B — migration aplicada: encerrar→reabrir→encerrar no mesmo dia, com
#   agentes diferentes, grava 2+ fechamentos e 2+ eventos 'close' (nada é
#   perdido); fechamento direto do auto-close SEM reabrir entre tentativas é
#   recusado, mas auto-close→reabrir→auto-close no mesmo dia grava 2 ciclos reais;
#   a unicidade da SOLICITAÇÃO operacional continua (replay devolve o mesmo par,
#   payload diferente com a mesma chave é 23505); os indicadores seguem
#   deduplicados por contato/dia (resolvedToday=1 e soma de resolvedHourly8=1 com
#   3 fechamentos no mesmo dia); a gamificação conversations_resolved só credita
#   uma vez por ciclo real, não por INSERT repetido recusado.
# BLOCO C — o Rollback do cabeçalho da migration roda de verdade: remove a nova
#   guarda, volta o índice (apagando os repetidos do dia), volta a versão anterior
#   de dashboard_kpi (mesmo md5 de pg_get_functiondef) e o segundo fechamento
#   volta a falhar pelo índice diário.

set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
migrations_dir="$repo_root/supabase/migrations"
migration="$migrations_dir/20261007013217_conversation_closures_reopen_same_day.sql"
reconcile="$migrations_dir/20261003272707_reconcile_local_replay_with_canonical.sql"
postgres_image="${CONVERSATION_CLOSURE_TEST_POSTGRES_IMAGE:-postgres:17-alpine}"
container_name="zapp-v2-closure-reopen-test-$$"

cleanup() {
  if [[ "$container_name" =~ ^zapp-v2-closure-reopen-test-[0-9]+$ ]]; then
    docker rm -f "$container_name" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT INT TERM

fail() { printf '[FAIL] %s\n' "$1" >&2; exit 1; }

psql_sql() {
  docker exec "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres -c "$1"
}
psql_file() {
  docker exec -i "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres < "$1"
}
as_role() {  # as_role <papel> <claims-json> <sql>
  local role="$1" jwt="$2" sql="$3"
  docker exec "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres \
    -c "SET ROLE $role; SELECT set_config('request.jwt.claims', '$jwt', false); $sql"
}
expect_value() {
  local l="$1" e="$2" s="$3" a
  a="$(psql_sql "$s" | tail -n1)"
  [[ "$a" == "$e" ]] || fail "$l: esperado '$e', obtido '$a'"
  printf '[PASS] %s\n' "$l"
}
expect_value_as() {
  local l="$1" e="$2" r="$3" j="$4" s="$5" a
  a="$(as_role "$r" "$j" "$s" | tail -n1)"
  [[ "$a" == "$e" ]] || fail "$l: esperado '$e', obtido '$a'"
  printf '[PASS] %s\n' "$l"
}
expect_ok_as() {
  local l="$1" r="$2" j="$3" s="$4"
  as_role "$r" "$j" "$s" >/dev/null || fail "$l: deveria ter sucesso (como $r)"
  printf '[PASS] %s\n' "$l"
}
expect_error_as() {
  local l="$1" needle="$2" r="$3" j="$4" s="$5" out st
  set +e; out="$(as_role "$r" "$j" "$s" 2>&1)"; st=$?; set -e
  (( st == 0 )) && { printf '%s\n' "$out" >&2; fail "$l: deveria falhar, mas passou"; }
  [[ "$out" == *"$needle"* ]] || { printf '%s\n' "$out" >&2; fail "$l: esperava '$needle' no erro"; }
  printf '[PASS] %s\n' "$l"
}
kpi_definition_md5() {
  psql_sql "SELECT md5(pg_get_functiondef('public.dashboard_kpi(timestamptz,uuid,uuid)'::regprocedure));" | tail -n1
}

command -v docker >/dev/null 2>&1 || fail 'Docker nao esta instalado'
docker info >/dev/null 2>&1 || fail 'Docker daemon nao esta acessivel'
[[ -f "$reconcile" ]] || fail "migration de reconciliacao nao encontrada: $reconcile"

printf '== container: %s (imagem %s) ==\n' "$container_name" "$postgres_image"
docker run --rm -d --name "$container_name" -e POSTGRES_PASSWORD=test_only "$postgres_image" >/dev/null

ready=0
for _ in $(seq 1 90); do
  if psql_sql 'SELECT 1' >/dev/null 2>&1; then ready=$((ready + 1)); (( ready >= 2 )) && break; else ready=0; fi
  sleep 1
done
(( ready >= 2 )) || fail 'PostgreSQL descartavel nao ficou pronto de forma estavel'

tmp_dir="$(mktemp -d)"
trap 'rm -rf "$tmp_dir"; cleanup' EXIT INT TERM

cat > "$tmp_dir/pre.sql" <<'SQL'
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO service_role;

CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
  AS $$ SELECT (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid $$;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE
  AS $$ SELECT nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role' $$;
GRANT USAGE ON SCHEMA auth, public TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION auth.uid(), auth.role() TO PUBLIC;

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY, user_id uuid UNIQUE NOT NULL,
  role text NOT NULL DEFAULT 'agent', is_active boolean NOT NULL DEFAULT true
);
CREATE TABLE public.queues (id uuid PRIMARY KEY);
CREATE TABLE public.queue_members (
  queue_id uuid REFERENCES public.queues(id),
  profile_id uuid REFERENCES public.profiles(id), is_active boolean NOT NULL,
  PRIMARY KEY(queue_id, profile_id)
);
CREATE TABLE public.whatsapp_connections (
  id uuid PRIMARY KEY, instance_id text, status text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.contacts (
  id uuid PRIMARY KEY, phone text NOT NULL,
  assigned_to uuid REFERENCES public.profiles(id),
  queue_id uuid REFERENCES public.queues(id),
  whatsapp_connection_id uuid REFERENCES public.whatsapp_connections(id),
  conversation_status text NOT NULL DEFAULT 'open',
  conversation_status_changed_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid REFERENCES public.contacts(id) ON DELETE CASCADE,
  whatsapp_connection_id uuid REFERENCES public.whatsapp_connections(id),
  sender text NOT NULL, content text NOT NULL,
  message_type text NOT NULL DEFAULT 'text', media_url text,
  caption text, media_filename text, media_mimetype text,
  media_type text, media_size integer, ptt boolean NOT NULL DEFAULT false,
  is_read boolean DEFAULT false, agent_id uuid REFERENCES public.profiles(id),
  external_id text, status text DEFAULT 'sent',
  status_updated_at timestamptz DEFAULT now(),
  reply_to_id uuid REFERENCES public.messages(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (sender IN ('agent','contact')),
  media_meta jsonb DEFAULT '{}'::jsonb,
  CHECK (message_type IN ('text','image','audio','video','document','sticker','location','poll','contact'))
);
CREATE TABLE public.conversation_closures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  closed_by uuid REFERENCES public.profiles(id), close_reason text NOT NULL,
  outcome text, classification text, notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.conversation_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  event_type text NOT NULL, performed_by uuid REFERENCES public.profiles(id),
  metadata jsonb DEFAULT '{}'::jsonb, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.conversation_sla (
  contact_id uuid PRIMARY KEY REFERENCES public.contacts(id) ON DELETE CASCADE,
  first_message_at timestamptz, first_response_at timestamptz,
  first_response_breached boolean DEFAULT false
);
CREATE TABLE public.agent_stats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,
  xp integer NOT NULL DEFAULT 0,
  level integer NOT NULL DEFAULT 1,
  achievements_count integer NOT NULL DEFAULT 0,
  messages_sent integer NOT NULL DEFAULT 0,
  messages_received integer NOT NULL DEFAULT 0,
  conversations_resolved integer NOT NULL DEFAULT 0,
  current_streak integer NOT NULL DEFAULT 0,
  best_streak integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.agent_achievements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  achievement_type text NOT NULL,
  achievement_name text NOT NULL,
  achievement_description text,
  xp_earned integer NOT NULL DEFAULT 0,
  earned_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX agent_achievements_non_repeatable_uidx
  ON public.agent_achievements(profile_id, achievement_type)
  WHERE achievement_type NOT IN ('daily_goal', 'streak', 'message_milestone', 'resolution');
CREATE FUNCTION public.grant_agent_achievement(
  p_profile_id uuid, p_type text, p_name text,
  p_description text DEFAULT NULL, p_xp_reward integer DEFAULT 0
) RETURNS json
LANGUAGE sql
AS $$ SELECT json_build_object('alreadyHad', false) $$;

CREATE FUNCTION public.is_admin_or_supervisor(p_user_id uuid) RETURNS boolean
LANGUAGE sql SECURITY DEFINER STABLE SET search_path=public,pg_temp AS $$
  SELECT EXISTS(SELECT 1 FROM public.profiles
    WHERE user_id=p_user_id AND is_active AND role IN ('admin','supervisor'))
$$;
CREATE FUNCTION public.get_profile_id_for_user(p_user_id uuid) RETURNS uuid
LANGUAGE sql SECURITY DEFINER STABLE SET search_path=public,pg_temp AS $$
  SELECT id FROM public.profiles WHERE user_id=p_user_id LIMIT 1
$$;
CREATE FUNCTION public.is_contact_visible_to_user(p_contact_id uuid,p_user_id uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE SET search_path=public,pg_temp AS $$
  SELECT p_user_id=auth.uid() AND EXISTS(
    SELECT 1 FROM public.contacts c WHERE c.id=p_contact_id AND (
      public.is_admin_or_supervisor(p_user_id)
      OR c.assigned_to=public.get_profile_id_for_user(p_user_id)
      OR EXISTS(SELECT 1 FROM public.queue_members qm
        WHERE qm.queue_id=c.queue_id
          AND qm.profile_id=public.get_profile_id_for_user(p_user_id)
          AND qm.is_active)
    )
  )
$$;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.messages,
  public.conversation_closures, public.conversation_events TO authenticated;
GRANT SELECT, UPDATE ON public.contacts TO authenticated;
GRANT SELECT ON public.profiles, public.queue_members,
  public.whatsapp_connections, public.conversation_sla TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
SQL

cat > "$tmp_dir/seed.sql" <<'SQL'
DELETE FROM public.agent_achievements;
DELETE FROM public.agent_stats;
DELETE FROM public.conversation_events;
DELETE FROM public.conversation_closures;
DELETE FROM public.conversation_sla;
DELETE FROM public.contacts;
DELETE FROM public.queue_members;
DELETE FROM public.queues;
DELETE FROM public.whatsapp_connections;
DELETE FROM public.profiles;

INSERT INTO public.profiles(id,user_id,role,is_active) VALUES
 ('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','agent',true),
 ('10000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000002','agent',true),
 ('10000000-0000-0000-0000-000000000003','20000000-0000-0000-0000-000000000003','admin',true);
INSERT INTO public.queues(id) VALUES ('30000000-0000-0000-0000-000000000001');
INSERT INTO public.queue_members(queue_id,profile_id,is_active) VALUES
 ('30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001',true),
 ('30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000002',true);
INSERT INTO public.whatsapp_connections(id,instance_id,status) VALUES
 ('40000000-0000-0000-0000-000000000001','canonical-one','connected');
INSERT INTO public.contacts(id,phone,assigned_to,queue_id,whatsapp_connection_id,conversation_status) VALUES
 ('50000000-0000-0000-0000-000000000001','5511999990001','10000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001','open'),
 ('50000000-0000-0000-0000-000000000002','5511999990002','10000000-0000-0000-0000-000000000002',NULL,'40000000-0000-0000-0000-000000000001','open');
INSERT INTO public.conversation_sla(contact_id,first_message_at,first_response_at,first_response_breached) VALUES
 ('50000000-0000-0000-0000-000000000001', now() - interval '2 hours', now() - interval '90 minutes', false),
 ('50000000-0000-0000-0000-000000000002', now() - interval '2 hours', now() - interval '80 minutes', false);
SQL

psql_file "$tmp_dir/pre.sql" >/dev/null
psql_file "$tmp_dir/seed.sql" >/dev/null

# ── Cadeia REAL de migrations (na ordem do diretório) ─────────────────────────
psql_file "$migrations_dir/20260905090000_contacts_fsm_trigger.sql" >/dev/null
psql_file "$migrations_dir/20260909220000_add_message_delivery_and_atomic_closure_rpcs.sql" >/dev/null
psql_file "$migrations_dir/20260927470000_fix_gamification_closure_upsert_and_backfill.sql" >/dev/null
psql_file "$migrations_dir/20260927510001_add_sync_contact_status_on_closure_trigger.sql" >/dev/null
psql_file "$migrations_dir/20260927590000_conversation_closures_dedupe_and_unique_per_day.sql" >/dev/null
psql_file "$migrations_dir/20260929560000_contacts_conversation_status_and_grants.sql" >/dev/null

# dashboard_kpi vigente (sem a correção): corpo canônico, extraído da migration
# de reconciliação exatamente como faz dashboard-rls-authorization.test.sh.
awk '/CREATE OR REPLACE FUNCTION public.dashboard_kpi/,/\$function\$;/' "$reconcile" > "$tmp_dir/kpi_vigente.sql"
grep -q 'CREATE OR REPLACE FUNCTION public.dashboard_kpi' "$tmp_dir/kpi_vigente.sql" \
  || fail 'extracao de dashboard_kpi da migration de reconciliacao veio vazia'
grep -q '\$function\$;' "$tmp_dir/kpi_vigente.sql" || fail 'extracao de dashboard_kpi nao fechou o corpo'
psql_file "$tmp_dir/kpi_vigente.sql" >/dev/null
KPI_MD5_VIGENTE="$(kpi_definition_md5)"
[[ "$KPI_MD5_VIGENTE" =~ ^[0-9a-f]{32}$ ]] || fail "md5 de dashboard_kpi inesperado: $KPI_MD5_VIGENTE"

C1='50000000-0000-0000-0000-000000000001'
C2='50000000-0000-0000-0000-000000000002'
P_A='10000000-0000-0000-0000-000000000001'
P_B='10000000-0000-0000-0000-000000000002'
P_ADM='10000000-0000-0000-0000-000000000003'
JWT_A='{"sub":"20000000-0000-0000-0000-000000000001","role":"authenticated"}'
JWT_B='{"sub":"20000000-0000-0000-0000-000000000002","role":"authenticated"}'
JWT_ADM='{"sub":"20000000-0000-0000-0000-000000000003","role":"authenticated"}'
JWT_SVC='{"role":"service_role"}'
JWT_ANON='{"role":"anon"}'
REQ1='71000000-0000-0000-0000-000000000001'
REQ2='71000000-0000-0000-0000-000000000002'

close_call() {  # close_call <req> <reason> <outcome> <classification> <notes>
  printf "SELECT c.closure_id::text || '|' || c.event_id::text FROM public.close_conversation_atomic('%s','%s','%s','%s','%s','%s') c" \
    "$C1" "$1" "$2" "$3" "$4" "$5"
}
reopen_c1() { psql_sql "UPDATE public.contacts SET conversation_status='open' WHERE id='$C1';" >/dev/null; }
reopen_c2() { psql_sql "UPDATE public.contacts SET conversation_status='open' WHERE id='$C2';" >/dev/null; }

printf '\n============ BLOCO A — estado ANTERIOR (defeito) ============\n'

IDS_A1="$(as_role authenticated "$JWT_A" "$(close_call "$REQ1" resolved sale sales 'ciclo 1')" | tail -n1)"
[[ "$IDS_A1" =~ ^[0-9a-f-]{36}\|[0-9a-f-]{36}$ ]] || fail "A.1 a RPC nao devolveu closure_id|event_id: $IDS_A1"
printf '[PASS] %s\n' 'A.1 1o encerramento pelo dialogo (authenticated, close_conversation_atomic) grava fechamento + evento'
expect_value 'A.2 o contato ficou resolved' 'resolved' \
  "SELECT conversation_status FROM public.contacts WHERE id='$C1';"
expect_value 'A.3 1 fechamento e 1 evento close com o closure_id gravado' '1|1|1' \
  "SELECT count(*)::text || '|' || (SELECT count(*) FROM public.conversation_events e WHERE e.contact_id='$C1' AND e.event_type='close')::text || '|' || (SELECT count(*) FROM public.conversation_events e WHERE e.contact_id='$C1' AND e.closure_id IS NOT NULL)::text FROM public.conversation_closures c WHERE c.contact_id='$C1';"

reopen_c1
expect_value 'A.4 a conversa foi reaberta pela transicao permitida da FSM (resolved -> open)' 'open' \
  "SELECT conversation_status FROM public.contacts WHERE id='$C1';"

expect_error_as 'A.5 (DEFEITO) 2o encerramento no MESMO dia bate no indice unico diario (23505) e a transacao desfaz' \
  'conversation_closures_contact_day_uidx' authenticated "$JWT_A" "$(close_call "$REQ2" resolved sale sales 'ciclo 2')"
expect_value 'A.6 (DEFEITO) nada ficou pela metade: segue com 1 fechamento e 1 evento' '1|1' \
  "SELECT count(*)::text || '|' || (SELECT count(*) FROM public.conversation_events e WHERE e.contact_id='$C1')::text FROM public.conversation_closures c WHERE c.contact_id='$C1';"
expect_value 'A.7 (DEFEITO) a conversa reaberta continua aberta (nao encerrou de novo)' 'open' \
  "SELECT conversation_status FROM public.contacts WHERE id='$C1';"

expect_ok_as 'A.8 auto-close (Edge) INSERE direto o 1o fechamento do dia do contato do agente B' \
  service_role "$JWT_SVC" \
  "INSERT INTO public.conversation_closures(contact_id,close_reason,outcome,notes) VALUES ('$C2','inactivity','auto_closed','Auto-closed after 24h of inactivity');"
expect_error_as 'A.9 (DEFEITO) o 2o fechamento direto do auto-close no mesmo dia cai no MESMO indice diario' \
  'conversation_closures_contact_day_uidx' service_role "$JWT_SVC" \
  "INSERT INTO public.conversation_closures(contact_id,close_reason,outcome,notes) VALUES ('$C2','inactivity','auto_closed','Auto-closed after 48h of inactivity');"
expect_value 'A.10 o contato ficou resolved pelo gatilho e tem 1 fechamento' 'resolved|1' \
  "SELECT (SELECT conversation_status FROM public.contacts WHERE id='$C2') || '|' || (SELECT count(*) FROM public.conversation_closures c WHERE c.contact_id='$C2')::text;"

expect_value_as 'A.11 indicador vigente: resolvedToday do agente A = 1 (1 fechamento no dia)' '1' \
  authenticated "$JWT_A" "SELECT (public.dashboard_kpi(now() - interval '30 days', NULL, NULL) ->> 'resolvedToday');"
psql_file "$tmp_dir/seed.sql" >/dev/null

printf '\n============ BLOCO B — migration aplicada ============\n'
[[ -f "$migration" ]] || fail "migration da correcao nao encontrada: $migration"
psql_file "$migration" >/dev/null

IDS_B1="$(as_role authenticated "$JWT_A" "$(close_call "$REQ1" resolved sale sales 'ciclo 1')" | tail -n1)"
[[ "$IDS_B1" =~ ^[0-9a-f-]{36}\|[0-9a-f-]{36}$ ]] || fail "B.3 a RPC nao devolveu closure_id|event_id: $IDS_B1"
printf '[PASS] %s\n' 'B.3 ciclo 1: encerramento pelo agente A'
reopen_c1
expect_ok_as 'B.4 ciclo 2: a conversa reaberta ENCERRA de novo no mesmo dia (agente A, chave nova)' \
  authenticated "$JWT_A" "$(close_call "$REQ2" resolved follow_up support 'ciclo 2')"
reopen_c1
expect_ok_as 'B.5 ciclo 3: mais um encerramento no mesmo dia, agora por OUTRO agente (B)' \
  authenticated "$JWT_B" "$(close_call '71000000-0000-0000-0000-000000000003' resolved lead_qualified sales 'ciclo 3')"

expect_value 'B.6 3 fechamentos no MESMO dia, 3 eventos close, cada evento ligado ao seu fechamento' '3|3|3' \
  "SELECT count(*)::text || '|' || (SELECT count(*) FROM public.conversation_events e WHERE e.contact_id='$C1' AND e.event_type='close')::text || '|' || (SELECT count(DISTINCT e.closure_id) FROM public.conversation_events e WHERE e.contact_id='$C1')::text FROM public.conversation_closures c WHERE c.contact_id='$C1';"
expect_value 'B.7 os 3 fechamentos ficaram com os 2 agentes e os 3 motivos certos' '2|3' \
  "SELECT (SELECT count(DISTINCT closed_by) FROM public.conversation_closures c WHERE c.contact_id='$C1')::text || '|' || (SELECT count(DISTINCT close_reason || outcome || classification) FROM public.conversation_closures c WHERE c.contact_id='$C1')::text;"
expect_value 'B.8 a conversa terminou resolved' 'resolved' \
  "SELECT conversation_status FROM public.contacts WHERE id='$C1';"

expect_value 'B.9 o indice diario do defeito nao existe mais' '0' \
  "SELECT count(*) FROM pg_indexes WHERE schemaname='public' AND indexname='conversation_closures_contact_day_uidx';"
expect_value 'B.10 a unicidade da SOLICITACAO operacional continua (contact_id, client_request_id)' '1' \
  "SELECT count(*) FROM pg_indexes WHERE schemaname='public' AND indexname='ux_conversation_closures_contact_request';"
KPI_MD5_CORRIGIDO="$(kpi_definition_md5)"
[[ "$KPI_MD5_CORRIGIDO" != "$KPI_MD5_VIGENTE" ]] \
  || fail 'B.11 a migration nao mudou a definicao de dashboard_kpi'
printf '[PASS] B.11 a migration troca a definicao de dashboard_kpi (md5 %s -> %s)\n' \
  "$KPI_MD5_VIGENTE" "$KPI_MD5_CORRIGIDO"

IDS_B3="$(as_role authenticated "$JWT_B" "SELECT c.closure_id::text || '|' || c.event_id::text FROM public.close_conversation_atomic('$C1','71000000-0000-0000-0000-000000000003','resolved','lead_qualified','sales','ciclo 3') c" | tail -n1)"
[[ "$IDS_B3" == "$(psql_sql "SELECT c.id::text || '|' || (SELECT e.id FROM public.conversation_events e WHERE e.closure_id=c.id)::text FROM public.conversation_closures c WHERE c.client_request_id='71000000-0000-0000-0000-000000000003';" | tail -n1)" ]] \
  || fail "B.12 replay deve devolver o MESMO par closure|event (obtido: $IDS_B3)"
printf '[PASS] %s\n' 'B.12 replay da MESMA chave devolve o mesmo par fechamento+evento'
expect_value 'B.13 ...e nao cria linha nova (segue 3 fechamentos)' '3' \
  "SELECT count(*) FROM public.conversation_closures c WHERE c.contact_id='$C1';"
expect_error_as 'B.14 mesma chave com payload diferente e recusada (idempotencia preservada)' \
  'closure_request_id_reused_with_different_payload' authenticated "$JWT_B" \
  "SELECT c.closure_id FROM public.close_conversation_atomic('$C1','71000000-0000-0000-0000-000000000003','no_response',NULL,NULL,NULL) c"
expect_error_as 'B.15 a chave de outro agente tambem e recusada (chave pertence ao solicitante)' \
  'closure_request_id_reused_with_different_payload' authenticated "$JWT_A" \
  "SELECT c.closure_id FROM public.close_conversation_atomic('$C1','71000000-0000-0000-0000-000000000003','resolved','lead_qualified','sales','ciclo 3') c"
expect_error_as 'B.16 encerrar sem reabrir continua proibido (FSM) e nada e gravado' \
  'invalid_transition' authenticated "$JWT_A" "$(close_call '71000000-0000-0000-0000-000000000004' resolved sale sales 'sem reabrir')"
expect_value 'B.17 tentativas recusadas nao deixaram linha nem evento' '3|3' \
  "SELECT count(*)::text || '|' || (SELECT count(*) FROM public.conversation_events e WHERE e.contact_id='$C1')::text FROM public.conversation_closures c WHERE c.contact_id='$C1';"
expect_value 'B.18 gamificacao apos 3 ciclos reais via RPC: agente A=2, agente B=1' '2|1' \
  "SELECT COALESCE((SELECT conversations_resolved FROM public.agent_stats WHERE profile_id='$P_A'),0)::text || '|' || COALESCE((SELECT conversations_resolved FROM public.agent_stats WHERE profile_id='$P_B'),0)::text;"

expect_ok_as 'B.19 auto-close (Edge) grava o 1o fechamento direto do contato B' \
  service_role "$JWT_SVC" \
  "INSERT INTO public.conversation_closures(contact_id,closed_by,close_reason,outcome,notes) VALUES ('$C2','$P_B','inactivity','auto_closed','Auto-closed after 24h of inactivity');"
expect_error_as 'B.20 auto-close repetido SEM reabrir e recusado pela guarda de ciclo' \
  'conversation_closure_requires_reopen' service_role "$JWT_SVC" \
  "INSERT INTO public.conversation_closures(contact_id,closed_by,close_reason,outcome,notes) VALUES ('$C2','$P_B','inactivity','auto_closed','retry sem reabrir');"
expect_value 'B.21 a tentativa repetida sem reabrir nao gravou fechamento nem creditou gamificacao' '1|2' \
  "SELECT (SELECT count(*) FROM public.conversation_closures c WHERE c.contact_id='$C2')::text || '|' || COALESCE((SELECT conversations_resolved FROM public.agent_stats WHERE profile_id='$P_B'),0)::text;"
reopen_c2
expect_ok_as 'B.22 auto-close -> reabrir -> auto-close no MESMO dia grava o 2o ciclo real' \
  service_role "$JWT_SVC" \
  "INSERT INTO public.conversation_closures(contact_id,closed_by,close_reason,outcome,notes) VALUES ('$C2','$P_B','inactivity','auto_closed','Auto-closed after reopen');"
expect_value 'B.23 contato B tem 2 fechamentos no dia e ficou resolved' '2|resolved' \
  "SELECT (SELECT count(*) FROM public.conversation_closures c WHERE c.contact_id='$C2')::text || '|' || (SELECT conversation_status FROM public.contacts WHERE id='$C2');"
expect_value 'B.24 gamificacao do agente B creditou uma vez por ciclo real (C1 + 2 ciclos de C2)' '3' \
  "SELECT COALESCE((SELECT conversations_resolved FROM public.agent_stats WHERE profile_id='$P_B'),0);"

expect_value_as 'B.25 indicador do agente A: 1 contato resolvido no dia apesar de 3 fechamentos' '1' \
  authenticated "$JWT_A" "SELECT (public.dashboard_kpi(now() - interval '30 days', NULL, NULL) ->> 'resolvedToday');"
expect_value_as 'B.26 ...e a soma dos buckets horarios tambem conta 1 (nao dobra)' '1' \
  authenticated "$JWT_A" \
  "SELECT (SELECT sum(v::int) FROM jsonb_array_elements_text(public.dashboard_kpi(now() - interval '30 days', NULL, NULL) -> 'resolvedHourly8') v);"
expect_value 'B.27 ...embora existam 3 fechamentos do contato no dia (deduplicacao e da leitura)' '3' \
  "SELECT count(*) FROM public.conversation_closures c WHERE c.contact_id='$C1' AND (c.created_at AT TIME ZONE 'America/Sao_Paulo')::date = (now() AT TIME ZONE 'America/Sao_Paulo')::date;"
expect_value_as 'B.28 visao de staff (admin): 2 contatos resolvidos no dia (A e B)' '2' \
  authenticated "$JWT_ADM" "SELECT (public.dashboard_kpi(now() - interval '30 days', NULL, NULL) ->> 'resolvedToday');"

expect_ok_as 'B.29 o fechamento gravado pela RPC e reaberto por outro agente segue visivel para o agente A' \
  authenticated "$JWT_A" "SELECT 1 FROM public.conversation_closures c WHERE c.contact_id='$C1';"
expect_value_as 'B.30 authenticated executa dashboard_kpi' '1' \
  authenticated "$JWT_A" "SELECT (public.dashboard_kpi(now() - interval '30 days', NULL, NULL) ->> 'resolvedToday');"
expect_error_as 'B.31 anon nao executa close_conversation_atomic (ACL intacta)' \
  'permission denied' anon "$JWT_ANON" \
  "SELECT c.closure_id FROM public.close_conversation_atomic('$C1','71000000-0000-0000-0000-0000000000aa','resolved',NULL,NULL,NULL) c"
expect_error_as 'B.32 anon nao executa dashboard_kpi (ACL intacta)' \
  'permission denied' anon "$JWT_ANON" "SELECT public.dashboard_kpi(now() - interval '30 days', NULL, NULL);"

printf '\n============ BLOCO C — Rollback do cabecalho ============\n'
awk '/^-- Rollback \(completo\):/{f=1;next} f&&/^--   /{sub(/^--   /,"");print;next} f{exit}' \
  "$migration" > "$tmp_dir/rollback.sql"
grep -q 'conversation_closures_contact_day_uidx' "$tmp_dir/rollback.sql" \
  || fail 'C.1 o bloco Rollback (completo) da migration nao foi extraido'
psql_file "$tmp_dir/rollback.sql" >/dev/null
printf '[PASS] %s\n' 'C.1 o Rollback (completo) do cabecalho roda sem erro'

expect_value 'C.2 o Rollback removeu a guarda de ciclo (trigger e funcao)' '0|0' \
  "SELECT (SELECT count(*) FROM pg_trigger WHERE tgname='trg_reject_repeated_conversation_closure_without_reopen')::text || '|' || (SELECT count(*) FROM pg_proc WHERE proname='reject_repeated_conversation_closure_without_reopen')::text;"
expect_value 'C.3 o indice diario voltou' '1' \
  "SELECT count(*) FROM pg_indexes WHERE schemaname='public' AND indexname='conversation_closures_contact_day_uidx';"
expect_value 'C.4 os fechamentos repetidos do mesmo dia foram consolidados (1 por contato/dia)' '1|1' \
  "SELECT (SELECT count(*) FROM public.conversation_closures c WHERE c.contact_id='$C1')::text || '|' || (SELECT count(*) FROM public.conversation_closures c WHERE c.contact_id='$C2')::text;"
expect_error_as 'C.5 o defeito volta: 2o fechamento no mesmo dia e recusado de novo pelo indice' \
  'conversation_closures_contact_day_uidx' service_role "$JWT_SVC" \
  "INSERT INTO public.conversation_closures(contact_id,close_reason) VALUES ('$C2','inactivity');"
expect_value 'C.6 dashboard_kpi voltou byte a byte a versao anterior' "$KPI_MD5_VIGENTE" \
  "SELECT md5(pg_get_functiondef('public.dashboard_kpi(timestamptz,uuid,uuid)'::regprocedure));"

printf '\nPASS: R2-DB-008 — encerrar→reabrir→encerrar no mesmo dia (agentes diferentes) grava 2+ fechamentos e 2+ eventos,\n'
printf 'a unicidade da solicitacao (contact_id, client_request_id) segue valendo, os indicadores deduplicam por contato/dia\n'
printf 'e o Rollback do cabecalho devolve indice e dashboard_kpi ao estado anterior.\n'
