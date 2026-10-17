#!/usr/bin/env bash
set -Eeuo pipefail

# N-097 / X142 (parte): talkx_campaign_resume_precheck(uuid).
# Prova, em PostgreSQL 17 descartavel e com papel real (SET LOCAL ROLE authenticated +
# claims), que a RPC aponta conexao desconectada, janela fechada e destinatarios
# suprimidos, e que com tudo ok devolve can_resume = true. A funcao de janela vem da
# migration REAL 20261003242707 (bloco c1, extraido por marcadores).

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
migration="${TALKX_RESUME_PRECHECK_MIGRATION:-$repo_root/supabase/migrations/20261013235903_talkx_campaign_resume_precheck.sql}"
window_migration="$repo_root/supabase/migrations/20261003242707_talkx_log_saude_alertas.sql"
postgres_image="${TALKX_RESUME_PRECHECK_TEST_POSTGRES_IMAGE:-postgres:17-alpine}"
container_name="zapp-talkx-resume-precheck-$RANDOM-$$"
test_password="talkx_resume_precheck_test_only"

cleanup() {
  if [[ "$container_name" =~ ^zapp-talkx-resume-precheck-[0-9]+-[0-9]+$ ]]; then
    docker rm -f "$container_name" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT INT TERM

fail() { printf '[FAIL] %s\n' "$1" >&2; exit 1; }
pass() { printf '[PASS] %s\n' "$1"; }
psql_test() { docker exec -i "$container_name" psql -X -q -v ON_ERROR_STOP=1 -U postgres -d postgres "$@"; }
psql_q() { psql_test -Atc "$1"; }

[[ -f "$migration" ]] || fail "migration ausente: $migration"
command -v docker >/dev/null 2>&1 || fail 'Docker nao esta instalado'
docker info >/dev/null 2>&1 || fail 'Docker daemon nao esta acessivel'
docker run --rm -d --name "$container_name" \
  -e POSTGRES_PASSWORD="$test_password" "$postgres_image" >/dev/null

ready=false
for _ in $(seq 1 90); do
  markers="$(docker logs "$container_name" 2>&1 | grep -c 'database system is ready to accept connections' || true)"
  if [[ "$markers" -ge 2 ]] && docker exec "$container_name" \
    psql -X -U postgres -d postgres -Atqc 'SELECT 1' >/dev/null 2>&1; then
    ready=true
    break
  fi
  sleep 1
done
[[ "$ready" == true ]] || fail 'PostgreSQL 17 descartavel nao ficou pronto'

psql_test >/dev/null <<'SQL'
CREATE SCHEMA auth;
GRANT USAGE ON SCHEMA auth TO PUBLIC;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$
  SELECT COALESCE(NULLIF(current_setting('request.jwt.claim.role', true), ''), 'authenticated')
$$;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN;
CREATE ROLE anon NOLOGIN;

CREATE TABLE public.user_roles (user_id uuid NOT NULL, role text NOT NULL);
CREATE FUNCTION public.is_admin_or_supervisor(_user_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role IN ('admin','supervisor'))
$$;

CREATE TABLE public.whatsapp_connections (id uuid PRIMARY KEY, status text);
CREATE TABLE public.contacts (id uuid PRIMARY KEY, phone text NOT NULL);
CREATE TABLE public.talkx_settings (key text PRIMARY KEY, value jsonb);
CREATE TABLE public.talkx_campaigns (
  id uuid PRIMARY KEY,
  whatsapp_connection_id uuid,
  schedule_timezone text,
  send_window_start time,
  send_window_end time,
  business_hours_only boolean NOT NULL DEFAULT false
);
CREATE TABLE public.talkx_recipients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL,
  contact_id uuid NOT NULL,
  segment_id uuid,
  status text NOT NULL DEFAULT 'pending'
);
CREATE TABLE public.talkx_segments (id uuid PRIMARY KEY, name text NOT NULL);
CREATE TABLE public.talkx_campaign_segments (
  campaign_id uuid NOT NULL,
  segment_id uuid NOT NULL,
  position smallint NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  PRIMARY KEY (campaign_id, segment_id)
);
CREATE TABLE public.talkx_blacklist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid,
  phone text,
  removed_at timestamptz,
  expires_at timestamptz
);
SQL

# Funcao de janela REAL (bloco c1 da migration X033).
sed -n '/^CREATE OR REPLACE FUNCTION public.talkx_engine_window_open/,/^\$function\$;/p' "$window_migration" \
  | psql_test >/dev/null
[[ "$(psql_q "SELECT count(*) FROM pg_proc WHERE proname='talkx_engine_window_open'")" == "1" ]] \
  || fail 'funcao de janela real nao foi extraida da migration'

# Empilhamento — o defeito deste cartao. Na pilha do integrador a versao de N-096
# (20261012115900_talkx_campaign_segment_progress.sql) entra ANTES desta migration e as duas
# definem a MESMA RPC. Antes da correcao o CREATE OR REPLACE daqui abortava com
# "cannot change return type of existing function" (psql:<stdin>:157) e derrubava o conjunto.
stacked_migration="$repo_root/supabase/migrations/20261012115900_talkx_campaign_segment_progress.sql"
def_antes=''
if [[ -f "$stacked_migration" ]]; then
  psql_test >/dev/null < "$stacked_migration" \
    || fail 'a versao de N-096 (20261012115900) nao aplicou antes da nossa'
  [[ "$(psql_q "SELECT (to_regprocedure('public.talkx_campaign_segment_progress(uuid)') IS NOT NULL)::text")" == "true" ]] \
    || fail 'a versao de N-096 nao criou talkx_campaign_segment_progress'
  def_antes="$(psql_q "SELECT pg_get_functiondef('public.talkx_campaign_segment_progress(uuid)'::regprocedure)")"
  pass 'empilhamento: a versao de N-096 (20261012115900) entrou na pilha antes da nossa'
else
  printf '[SKIP] empilhamento com 20261012115900: esta copia nao traz essa versao\n'
fi

psql_test >/dev/null < "$migration" \
  || fail "a migration deste cartao nao empilhou sobre esta copia: $migration"
if [[ -n "$def_antes" ]]; then
  def_depois="$(psql_q "SELECT pg_get_functiondef('public.talkx_campaign_segment_progress(uuid)'::regprocedure)")"
  [[ "$def_antes" == "$def_depois" ]] \
    || fail 'a nossa migration NAO pode mudar a definicao vigente da RPC de progresso (N-096)'
  pass 'empilhamento: a RPC de progresso (N-096) fica IDENTICA depois da nossa migration'
fi

psql_test >/dev/null <<'SQL'
INSERT INTO public.user_roles VALUES
  ('aaaaaaaa-0000-4000-8000-000000000001', 'admin'),
  ('aaaaaaaa-0000-4000-8000-000000000002', 'agent');
INSERT INTO public.whatsapp_connections VALUES
  ('c0000000-0000-4000-8000-000000000001', 'connected'),
  ('c0000000-0000-4000-8000-000000000002', 'disconnected');
INSERT INTO public.contacts VALUES
  ('d0000000-0000-4000-8000-000000000001', '5511999990001'),
  ('d0000000-0000-4000-8000-000000000002', '5511999990002');
-- 1 ok | 2 conexao desconectada | 3 janela fechada | 4 suprimido por contato
-- 5 suprimido por telefone (formato diferente) | 6 igual a 5, supressao depois removida
INSERT INTO public.talkx_campaigns (id, whatsapp_connection_id, business_hours_only) VALUES
  ('e0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001', false),
  ('e0000000-0000-4000-8000-000000000002', 'c0000000-0000-4000-8000-000000000002', false),
  ('e0000000-0000-4000-8000-000000000003', 'c0000000-0000-4000-8000-000000000001', true),
  ('e0000000-0000-4000-8000-000000000004', 'c0000000-0000-4000-8000-000000000001', false),
  ('e0000000-0000-4000-8000-000000000005', 'c0000000-0000-4000-8000-000000000001', false),
  ('e0000000-0000-4000-8000-000000000006', 'c0000000-0000-4000-8000-000000000001', false);
-- janela fechada o dia todo: nenhum dia permitido
INSERT INTO public.talkx_settings VALUES ('business_hours', '{"start":"08:00","end":"18:00","days":[]}');
INSERT INTO public.talkx_recipients (campaign_id, contact_id) VALUES
  ('e0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000002'),
  ('e0000000-0000-4000-8000-000000000004', 'd0000000-0000-4000-8000-000000000001'),
  ('e0000000-0000-4000-8000-000000000005', 'd0000000-0000-4000-8000-000000000002'),
  ('e0000000-0000-4000-8000-000000000006', 'd0000000-0000-4000-8000-000000000002');
INSERT INTO public.talkx_blacklist (contact_id, phone) VALUES
  ('d0000000-0000-4000-8000-000000000001', NULL),
  (NULL, '+55 (11) 99999-0002');
SQL
# O contato 2 (campanhas 1, 5, 6) esta suprimido por telefone. Para o caso "tudo ok" a
# campanha 1 tem o destinatario ja enviado.
psql_test -c "UPDATE public.talkx_recipients SET status='sent' WHERE campaign_id='e0000000-0000-4000-8000-000000000001'" >/dev/null

admin='aaaaaaaa-0000-4000-8000-000000000001'
agent='aaaaaaaa-0000-4000-8000-000000000002'

# Chama a RPC como authenticated com o usuario dado e devolve o jsonb.
precheck() {
  psql_q "BEGIN; SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claim.sub','$2',true); SELECT public.talkx_campaign_resume_precheck('e0000000-0000-4000-8000-00000000000$1'); COMMIT;" \
    | grep -E '^\{' | head -1
}
# jq_get <json> <expressao sobre j>
jq_get() { psql_q "SELECT ($2) FROM (SELECT '$1'::jsonb AS j) t"; }

out="$(precheck 1 "$admin")"
[[ "$(jq_get "$out" "j->>'can_resume'")" == "true" ]] || fail "tudo ok deveria devolver can_resume=true: $out"
[[ "$(jq_get "$out" "j->>'blockers'")" == "[]" ]] || fail "tudo ok nao deveria ter blockers: $out"
pass 'tudo ok -> can_resume=true'

out="$(precheck 2 "$admin")"
[[ "$(jq_get "$out" "j->>'can_resume'")" == "false" ]] || fail "desconectada deveria bloquear: $out"
[[ "$(jq_get "$out" "j->'blockers' ? 'connection_not_connected'")" == "t" ]] || fail "falta connection_not_connected: $out"
[[ "$(jq_get "$out" "j->>'connection_status'")" == "disconnected" ]] || fail "connection_status errado: $out"
pass 'conexao desconectada apontada'

out="$(precheck 3 "$admin")"
[[ "$(jq_get "$out" "j->>'window_open'")" == "false" ]] || fail "janela deveria estar fechada: $out"
[[ "$(jq_get "$out" "j->'blockers' ? 'outside_send_window'")" == "t" ]] || fail "falta outside_send_window: $out"
pass 'janela fechada apontada'

out="$(precheck 4 "$admin")"
[[ "$(jq_get "$out" "j->>'suppressed_pending_recipients'")" == "1" ]] || fail "esperava 1 suprimido: $out"
[[ "$(jq_get "$out" "j->'blockers' ? 'recipients_suppressed'")" == "t" ]] || fail "falta recipients_suppressed: $out"
pass 'destinatarios bloqueados por contato apontados'

out="$(precheck 5 "$admin")"
[[ "$(jq_get "$out" "j->>'suppressed_pending_recipients'")" == "1" ]] || fail "supressao por telefone nao detectada: $out"
pass 'destinatarios bloqueados por telefone apontados'

psql_test -c "UPDATE public.talkx_blacklist SET removed_at = now() WHERE phone IS NOT NULL" >/dev/null
out="$(precheck 6 "$admin")"
[[ "$(jq_get "$out" "j->>'can_resume'")" == "true" ]] || fail "supressao removida nao deveria bloquear: $out"
pass 'supressao removida nao bloqueia'

set +e
err="$(psql_test -c "BEGIN; SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claim.sub','$agent',true); SELECT public.talkx_campaign_resume_precheck('e0000000-0000-4000-8000-000000000001'); COMMIT;" 2>&1)"
set -e
[[ "$err" == *talkx_admin_required* ]] || fail "agente comum deveria receber talkx_admin_required: $err"
set +e
err="$(psql_test -c "BEGIN; SET LOCAL ROLE anon; SELECT public.talkx_campaign_resume_precheck('e0000000-0000-4000-8000-000000000001'); COMMIT;" 2>&1)"
set -e
[[ "$err" == *"permission denied"* ]] || fail "anon deveria ser negado por ACL: $err"
set +e
err="$(psql_test -c "BEGIN; SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claim.sub','$admin',true); SELECT public.talkx_campaign_resume_precheck('e0000000-0000-4000-8000-0000000000ff'); COMMIT;" 2>&1)"
set -e
[[ "$err" == *talkx_campaign_not_found* ]] || fail "campanha inexistente deveria falhar: $err"
pass 'ACL: agente e anon recusados; campanha inexistente falha'

# --- talkx_campaign_segment_progress ---------------------------------------------
# Campanha 7: seg B (position 1) todo enviado = done; seg A (position 2) com enviado,
# entregue, falha e pendente = running; seg C (position 3) so pendente = pending.
psql_test >/dev/null <<'SQL'
INSERT INTO public.talkx_campaigns (id, whatsapp_connection_id) VALUES
  ('e0000000-0000-4000-8000-000000000007', 'c0000000-0000-4000-8000-000000000001');
INSERT INTO public.talkx_segments VALUES
  ('50000000-0000-4000-8000-00000000000a', 'Segmento A'),
  ('50000000-0000-4000-8000-00000000000b', 'Segmento B'),
  ('50000000-0000-4000-8000-00000000000c', 'Segmento C');
INSERT INTO public.talkx_campaign_segments (campaign_id, segment_id, position) VALUES
  ('e0000000-0000-4000-8000-000000000007', '50000000-0000-4000-8000-00000000000a', 2),
  ('e0000000-0000-4000-8000-000000000007', '50000000-0000-4000-8000-00000000000b', 1),
  ('e0000000-0000-4000-8000-000000000007', '50000000-0000-4000-8000-00000000000c', 3);
-- (segmento, status): B = sent, delivered | A = delivered, failed, pending, sent | C = pending
INSERT INTO public.talkx_recipients (campaign_id, contact_id, segment_id, status)
SELECT 'e0000000-0000-4000-8000-000000000007', gen_random_uuid(), v.seg::uuid, v.st
  FROM (VALUES
    ('50000000-0000-4000-8000-00000000000b', 'sent'),
    ('50000000-0000-4000-8000-00000000000b', 'delivered'),
    ('50000000-0000-4000-8000-00000000000a', 'delivered'),
    ('50000000-0000-4000-8000-00000000000a', 'failed'),
    ('50000000-0000-4000-8000-00000000000a', 'pending'),
    ('50000000-0000-4000-8000-00000000000a', 'sent'),
    ('50000000-0000-4000-8000-00000000000c', 'pending')
  ) AS v(seg, st);
SQL

# Contrato de leitura do front X149 (src/components/talkx/tracking/talkxSegmentProgress.ts):
# LINHAS com segment_id, position, total, sent, delivered, failed, remaining, percent, status,
# total_segments, pending_segments. E o contrato que ja existe (N-096, 20261012115900); a versao
# anterior desta migration devolvia jsonb e era isso que derrubava o empilhamento.
sig="$(psql_q "SELECT pg_get_function_result('public.talkx_campaign_segment_progress(uuid)'::regprocedure)")"
[[ "$sig" == 'TABLE(segment_id uuid, "position" smallint, total bigint, sent bigint, delivered bigint, failed bigint, remaining bigint, percent numeric, status text, total_segments bigint, pending_segments bigint)' ]] \
  || fail "contrato deveria ser TABLE(...) como o front X149 le; veio: $sig"
pass 'contrato alinhado: TABLE(segment_id, position, total, sent, delivered, failed, remaining, percent, status, total_segments, pending_segments)'

cols='position, total, sent, delivered, failed, remaining, percent, status, total_segments, pending_segments'
admin_sql="BEGIN; SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claim.sub','$admin',true);"
svc_sql="BEGIN; SET LOCAL ROLE service_role; SELECT set_config('request.jwt.claim.role','service_role',true);"
progress() {
  psql_q "$admin_sql SELECT string_agg(concat_ws('|', $cols), ';' ORDER BY position) FROM public.talkx_campaign_segment_progress('e0000000-0000-4000-8000-000000000007'); COMMIT;" \
    | grep -E '^[0-9]' | head -1
}
# B (position 1) = sent+delivered -> done 100.0 | A (position 2) = 4 destinatarios com 1 pendente
# -> running 75.0 | C (position 3) so pendente -> pending 0.0 | pending_segments = A + C = 2.
esperado='1|2|2|1|0|0|100.0|done|3|2;2|4|2|1|1|1|75.0|running|3|2;3|1|0|0|0|1|0.0|pending|3|2'
out="$(progress)"
[[ "$out" == "$esperado" ]] || fail "progresso por segmento: esperado '$esperado', veio '$out'"
pass 'progresso por segmento: ordem por position, contagens, percentual e status'

out_svc="$(psql_q "$svc_sql SELECT string_agg(concat_ws('|', $cols), ';' ORDER BY position) FROM public.talkx_campaign_segment_progress('e0000000-0000-4000-8000-000000000007'); COMMIT;" | grep -E '^[0-9]' | head -1)"
[[ "$out_svc" == "$esperado" ]] || fail "service_role deveria ler o mesmo: '$out_svc'"
pass 'progresso por segmento: service_role le o mesmo'

sem_seg="$(psql_q "$admin_sql SELECT count(*) FROM public.talkx_campaign_segment_progress('e0000000-0000-4000-8000-0000000000ff'); COMMIT;" | grep -E '^[0-9]+$' | tail -1)"
[[ "$sem_seg" == "0" ]] || fail "campanha sem segmentos deveria devolver 0 linhas: '$sem_seg'"
pass 'progresso por segmento: campanha sem segmentos devolve 0 linhas'

set +e
err="$(psql_test -c "BEGIN; SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claim.sub','$agent',true); SELECT public.talkx_campaign_segment_progress('e0000000-0000-4000-8000-000000000007'); COMMIT;" 2>&1)"
set -e
[[ "$err" == *talkx_admin_required* ]] || fail "progresso: agente deveria receber talkx_admin_required: $err"
set +e
err="$(psql_test -c "BEGIN; SET LOCAL ROLE anon; SELECT public.talkx_campaign_segment_progress('e0000000-0000-4000-8000-000000000007'); COMMIT;" 2>&1)"
set -e
[[ "$err" == *"permission denied"* ]] || fail "progresso: anon deveria ser negado: $err"
pass 'progresso: ACL de agente e anon'

# ── Rollback do cabecalho: tem de rodar e devolver o estado anterior ─────────
# O bloco '-- Rollback (SQL executável, na ordem):' e lido como um todo (padrao dos testes
# irmaos: talkx-retry-resolve, conversation-closures-reopen-same-day) e executado inteiro: o
# CREATE OR REPLACE da RPC de progresso ocupa varias linhas '--   '.
rb_sql="$(awk '/^-- Rollback \(SQL/{f=1; next} f && /^--   /{sub(/^--   /, ""); print; next} f{exit}' "$migration")"
[[ -n "$rb_sql" ]] || fail 'bloco de Rollback do cabecalho nao encontrado'
rb_n="$(printf '%s\n' "$rb_sql" | wc -l)"
printf '%s\n' "$rb_sql" | psql_test >/dev/null || fail 'o bloco de Rollback do cabecalho nao rodou'
pass "rollback do cabecalho executou (${rb_n} linhas de SQL)"

[[ "$(psql_q "SELECT (to_regprocedure('public.talkx_campaign_resume_precheck(uuid)') IS NOT NULL)::text")" == "false" ]] \
  || fail 'rollback: talkx_campaign_resume_precheck deveria sumir (funcao nova)'
pass 'rollback: talkx_campaign_resume_precheck some (funcao nova)'

def_volta="$(psql_q "SELECT COALESCE(pg_get_functiondef('public.talkx_campaign_segment_progress(uuid)'::regprocedure), '')")"
[[ -n "$def_volta" ]] \
  || fail 'rollback: a RPC de progresso nao pode ficar ausente (o front X149 le ela)'
[[ "$(psql_q "SELECT pg_get_function_result('public.talkx_campaign_segment_progress(uuid)'::regprocedure)")" == "$sig" ]] \
  || fail 'rollback: o contrato da RPC de progresso nao voltou'
[[ "$(psql_q "SELECT has_function_privilege('anon','public.talkx_campaign_segment_progress(uuid)','EXECUTE')::text")" == "false" ]] \
  || fail 'rollback: anon deveria seguir sem EXECUTE na RPC de progresso'
[[ "$(psql_q "SELECT has_function_privilege('authenticated','public.talkx_campaign_segment_progress(uuid)','EXECUTE')::text")" == "true" ]] \
  || fail 'rollback: authenticated deveria seguir com EXECUTE na RPC de progresso'
if [[ -n "$def_antes" ]]; then
  [[ "$def_antes" == "$def_volta" ]] \
    || fail 'rollback: a definicao da RPC de progresso nao voltou igual ao estado anterior'
  pass 'rollback: RPC de progresso volta IDENTICA (definicao, contrato e ACL) — pilha'
fi
pass 'rollback: estado anterior da RPC de progresso restaurado'

psql_test >/dev/null < "$migration" || fail 'reaplicar a migration depois do rollback falhou'
pass 'rollback: migration reaplicada depois do rollback (idempotencia)'

printf 'talkx-resume-precheck: OK\n'
