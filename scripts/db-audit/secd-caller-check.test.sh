#!/usr/bin/env bash
# M-DB-05 / item 474 — prova, em PostgreSQL 17 descartavel, que as 13 funcoes SECURITY DEFINER de `public`
# executaveis por qualquer usuario logado sem checagem do chamador (MAPA_BANCO secoes 2 e 7, retrato vivo
# 04/10/2026) vazam papel/permissao/config para `authenticated` ANTES da migration e deixam de vazar DEPOIS
# dela. O "antes" e o corpo vivo das 13 (copiado do retrato de producao, identico ao das migrations que as
# definem); o "depois" e SEMPRE o arquivo supabase/migrations/20261007004545_secd_caller_check_13.sql aplicado
# inteiro — nada e recriado dentro do teste.
#
# Grupo A (oraculos de identidade): user_has_permission, is_team_conversation_member -> agente consultando
#   OUTRO usuario deixa de funcionar; o proprio usuario e admin/supervisor seguem.
# Grupo B (sem chamador no app/edge/regra/visao): effective_role, fn_list_audio_meme_categories,
#   is_country_allowed, is_country_blocked, is_ip_blocked, is_ip_whitelisted, notify_searchbox_budget ->
#   EXECUTE de authenticated revogado; quem roda com poder de dono (cron/service_role/gatilho/DEFINER) segue.
# Grupo C (app chama como o proprio usuario): search_knowledge_base passa a respeitar RLS (INVOKER);
#   count_searchbox_sessions_this_month e is_within_business_hours exigem sessao com perfil;
#   talkx_engine_window_open responde false fora de admin/supervisor.

set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
migration="$repo_root/supabase/migrations/20261007004545_secd_caller_check_13.sql"
container_name="zapp-v2-secd-caller-test-$$"
postgres_image="${SECD_CALLER_TEST_POSTGRES_IMAGE:-postgres:17-alpine}"
passed=0

cleanup() {
  if [[ "$container_name" =~ ^zapp-v2-secd-caller-test-[0-9]+$ ]]; then
    docker rm -f "$container_name" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT INT TERM

fail() { printf '[FAIL] %s\n' "$1" >&2; exit 1; }

psql_sql() {
  docker exec "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres -c "$1" 2>&1
}
psql_file() {
  if [[ "$1" == "-" ]]; then
    docker exec -i "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres
  else
    docker exec -i "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres < "$1"
  fi
}
# as_agent <uid> <sql> : roda como `authenticated` com JWT do uid informado
as_agent() {
  local uid="$1" sql="$2"
  psql_sql "SET ROLE authenticated; SET request.jwt.claims = '{\"role\":\"authenticated\",\"sub\":\"$uid\"}'; $sql"
}
expect_value() { # <rotulo> <esperado> <sql>
  local label="$1" expected="$2" sql="$3" actual
  actual="$(psql_sql "$sql" | tail -n1)"
  [[ "$actual" == "$expected" ]] || fail "$label: esperado '$expected', obtido '$actual'"
  ((passed += 1)); printf '[PASS] %s\n' "$label"
}
expect_agent_value() { # <rotulo> <uid> <esperado> <sql>
  local label="$1" uid="$2" expected="$3" sql="$4" actual
  actual="$(as_agent "$uid" "$sql" | tail -n1)"
  [[ "$actual" == "$expected" ]] || fail "$label: esperado '$expected', obtido '$actual'"
  ((passed += 1)); printf '[PASS] %s\n' "$label"
}
expect_agent_error() { # <rotulo> <uid> <trecho> <sql>
  local label="$1" uid="$2" needle="$3" sql="$4" out
  set +e
  out="$(as_agent "$uid" "$sql")"
  local status=$?
  set -e
  (( status != 0 )) || { printf '%s\n' "$out" >&2; fail "$label: deveria falhar, passou"; }
  [[ "$out" == *"$needle"* ]] || { printf '%s\n' "$out" >&2; fail "$label: esperava '$needle' no erro"; }
  ((passed += 1)); printf '[PASS] %s (bloqueado)\n' "$label"
}

command -v docker >/dev/null 2>&1 || fail 'Docker nao esta instalado'
docker info >/dev/null 2>&1 || fail 'Docker daemon nao esta acessivel'
[[ -f "$migration" ]] || fail "migration nao encontrada: $(basename "$migration")"

docker run --rm -d --name "$container_name" -e POSTGRES_PASSWORD=secd_caller_test_only "$postgres_image" >/dev/null
for _ in $(seq 1 60); do
  docker exec "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres -c 'SELECT 1' >/dev/null 2>&1 && break
  sleep 1
done
psql_sql 'SELECT 1' >/dev/null || fail "PostgreSQL descartavel ($postgres_image) nao ficou pronto"

# ── Esqueleto minimo: papeis, auth.uid(), enum e as tabelas que as 13 funcoes leem ───────────────────────
psql_file - <<'SQL' >/dev/null
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;
CREATE SCHEMA auth;
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $f$
  SELECT NULLIF(current_setting('request.jwt.claims', true)::jsonb ->> 'sub', '')::uuid
$f$;
CREATE TYPE public.app_role AS ENUM ('admin', 'supervisor', 'special_agent', 'agent');
CREATE TABLE public.user_roles (id serial PRIMARY KEY, user_id uuid NOT NULL, role public.app_role NOT NULL);
CREATE TABLE public.permissions (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL);
CREATE TABLE public.role_permissions (role public.app_role NOT NULL, permission_id uuid NOT NULL);
CREATE TABLE public.profiles (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid, role text);
CREATE TABLE public.team_conversation_members (
  id serial PRIMARY KEY, conversation_id uuid NOT NULL, profile_id uuid NOT NULL, member_role text);
CREATE TABLE public.knowledge_base_articles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), title text, content text, category text, tags text[],
  is_published boolean DEFAULT true, owner_user_id uuid,
  search_vector tsvector GENERATED ALWAYS AS (to_tsvector('portuguese', coalesce(title,'') || ' ' || coalesce(content,''))) STORED);
CREATE TABLE public.audit_logs (id bigserial PRIMARY KEY, action text, created_at timestamptz DEFAULT now());
CREATE TABLE public.business_hours (
  id serial PRIMARY KEY, whatsapp_connection_id uuid, day_of_week int, is_open boolean,
  open_time time, close_time time);
CREATE TABLE public.talkx_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), schedule_timezone text, send_window_start time,
  send_window_end time, business_hours_only boolean DEFAULT false);
CREATE TABLE public.talkx_settings (key text PRIMARY KEY, value jsonb);
CREATE TABLE public.blocked_ips (id serial PRIMARY KEY, ip_address text, expires_at timestamptz);
CREATE TABLE public.ip_whitelist (id serial PRIMARY KEY, ip_address text);
CREATE TABLE public.blocked_countries (id serial PRIMARY KEY, country_code text);
CREATE TABLE public.allowed_countries (id serial PRIMARY KEY, country_code text);
CREATE TABLE public.geo_blocking_settings (id serial PRIMARY KEY, mode text);
CREATE TABLE public.audio_memes (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), category text);
CREATE TABLE public.notifications (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid, title text,
  message text, type text, metadata jsonb);
CREATE TABLE public.searchbox_usage_daily (id serial PRIMARY KEY, dia date, sessoes integer);
GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated, service_role;
GRANT USAGE ON SCHEMA public, auth TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated, service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated, service_role;
GRANT CREATE ON SCHEMA public TO postgres;
-- policies que as funcoes auxiliares do repo leem (nao e o objeto do cartao; so o suficiente p/ o modelo)
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY profiles_self ON public.profiles FOR SELECT TO authenticated USING (user_id = auth.uid());
-- KB: leitura so do que e do proprio usuario — e o que separa DEFINER (vaza) de INVOKER (respeita)
ALTER TABLE public.knowledge_base_articles ENABLE ROW LEVEL SECURITY;
CREATE POLICY kb_own ON public.knowledge_base_articles FOR SELECT TO authenticated USING (owner_user_id = auth.uid());
SQL

# ── Estado ANTERIOR: as 13 com o corpo vivo de producao (04/10/2026), sem checagem do chamador ───────────
psql_file - <<'SQL' >/dev/null
CREATE OR REPLACE FUNCTION public.effective_role(_user_id uuid) RETURNS public.app_role
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $f$
  SELECT CASE
    WHEN bool_or(role = 'admin'::public.app_role)         THEN 'admin'::public.app_role
    WHEN bool_or(role = 'supervisor'::public.app_role)    THEN 'supervisor'::public.app_role
    WHEN bool_or(role = 'special_agent'::public.app_role) THEN 'special_agent'::public.app_role
    ELSE 'agent'::public.app_role
  END
  FROM public.user_roles WHERE user_id = _user_id
$f$;
CREATE OR REPLACE FUNCTION public.user_has_permission(_user_id uuid, _permission_name text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $f$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur
    JOIN public.role_permissions rp ON rp.role = ur.role
    JOIN public.permissions p ON p.id = rp.permission_id
    WHERE ur.user_id = _user_id AND p.name = _permission_name)
$f$;
CREATE OR REPLACE FUNCTION public.is_team_conversation_member(_user_id uuid, _conversation_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $f$
  SELECT EXISTS (
    SELECT 1 FROM public.team_conversation_members tcm
    JOIN public.profiles p ON p.id = tcm.profile_id
    WHERE tcm.conversation_id = _conversation_id AND p.user_id = _user_id)
$f$;
CREATE OR REPLACE FUNCTION public.search_knowledge_base(search_query text, max_results integer DEFAULT 5)
RETURNS TABLE(id uuid, title text, content text, category text, tags text[], rank real)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $f$
  SELECT a.id, a.title, a.content, a.category, a.tags,
         ts_rank(a.search_vector, websearch_to_tsquery('portuguese', search_query)) AS rank
  FROM public.knowledge_base_articles a
  WHERE a.is_published = true
    AND (a.search_vector @@ websearch_to_tsquery('portuguese', search_query)
         OR a.title ILIKE '%' || search_query || '%' OR a.content ILIKE '%' || search_query || '%')
  ORDER BY rank DESC LIMIT max_results
$f$;
CREATE OR REPLACE FUNCTION public.talkx_engine_window_open(p_campaign_id uuid) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $f$
DECLARE v_tz text; v_start time; v_end time; v_bh_only boolean; v_local timestamp; v_min integer;
        v_bh jsonb; v_days jsonb; v_bstart text; v_bend text; v_bstart_min integer; v_bend_min integer; v_dow integer;
BEGIN
  SELECT COALESCE(NULLIF(c.schedule_timezone, ''), 'America/Sao_Paulo'), c.send_window_start, c.send_window_end,
         COALESCE(c.business_hours_only, false)
    INTO v_tz, v_start, v_end, v_bh_only FROM public.talkx_campaigns AS c WHERE c.id = p_campaign_id;
  IF NOT FOUND THEN RETURN false; END IF;
  v_local := (now() AT TIME ZONE v_tz);
  v_min := EXTRACT(hour FROM v_local)::integer * 60 + EXTRACT(minute FROM v_local)::integer;
  IF v_start IS NOT NULL AND v_end IS NOT NULL THEN
    IF v_min < EXTRACT(hour FROM v_start)::integer * 60 + EXTRACT(minute FROM v_start)::integer
       OR v_min >= EXTRACT(hour FROM v_end)::integer * 60 + EXTRACT(minute FROM v_end)::integer THEN RETURN false; END IF;
  END IF;
  IF v_bh_only THEN
    SELECT s.value INTO v_bh FROM public.talkx_settings AS s WHERE s.key = 'business_hours';
    v_days := COALESCE(v_bh -> 'days', '[1,2,3,4,5]'::jsonb);
    v_bstart := COALESCE(v_bh ->> 'start', '08:00'); v_bend := COALESCE(v_bh ->> 'end', '18:00');
    v_dow := EXTRACT(dow FROM v_local)::integer;
    IF NOT (v_days @> to_jsonb(v_dow)) THEN RETURN false; END IF;
    v_bstart_min := split_part(v_bstart, ':', 1)::integer * 60 + split_part(v_bstart, ':', 2)::integer;
    v_bend_min := split_part(v_bend, ':', 1)::integer * 60 + split_part(v_bend, ':', 2)::integer;
    IF v_min < v_bstart_min OR v_min >= v_bend_min THEN RETURN false; END IF;
  END IF;
  RETURN true;
END $f$;
CREATE OR REPLACE FUNCTION public.count_searchbox_sessions_this_month() RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $f$
  SELECT count(*)::integer FROM public.audit_logs
  WHERE action = 'searchbox_session'
    AND created_at >= date_trunc('month', now() AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'America/Sao_Paulo'
$f$;
CREATE OR REPLACE FUNCTION public.notify_searchbox_budget() RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $f$
DECLARE v_mes text; v_sessoes integer; v_dest record; v_count integer := 0; v_limite integer := 400;
BEGIN
  v_mes := to_char((now() at time zone 'America/Sao_Paulo'), 'YYYY-MM');
  SELECT coalesce(sum(sessoes), 0) INTO v_sessoes FROM public.searchbox_usage_daily
   WHERE dia >= date_trunc('month', (now() at time zone 'America/Sao_Paulo'))::date;
  IF v_sessoes < v_limite THEN RETURN 0; END IF;
  IF EXISTS (SELECT 1 FROM public.notifications WHERE type = 'searchbox_budget_alert' AND metadata->>'mes' = v_mes) THEN
    RETURN 0; END IF;
  FOR v_dest IN SELECT user_id FROM public.profiles WHERE role IN ('admin','supervisor') AND user_id IS NOT NULL LOOP
    INSERT INTO public.notifications (user_id, title, message, type, metadata)
    VALUES (v_dest.user_id, 'Custo do autocomplete de endereco: ' || v_sessoes || ' usos no mes', 'x',
            'searchbox_budget_alert', jsonb_build_object('mes', v_mes, 'sessoes', v_sessoes, 'limite', v_limite));
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END $f$;
CREATE OR REPLACE FUNCTION public.is_country_allowed(check_country_code text) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $f$
DECLARE geo_mode TEXT;
BEGIN
  SELECT mode INTO geo_mode FROM public.geo_blocking_settings LIMIT 1;
  IF geo_mode IS NULL OR geo_mode = 'disabled' THEN RETURN true; END IF;
  IF geo_mode = 'whitelist' THEN
    RETURN EXISTS (SELECT 1 FROM public.allowed_countries WHERE country_code = UPPER(check_country_code));
  END IF;
  IF geo_mode = 'blacklist' THEN
    RETURN NOT EXISTS (SELECT 1 FROM public.blocked_countries WHERE country_code = UPPER(check_country_code));
  END IF;
  RETURN true;
END $f$;
CREATE OR REPLACE FUNCTION public.is_country_blocked(check_country_code text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $f$
  SELECT EXISTS (SELECT 1 FROM public.blocked_countries WHERE country_code = UPPER(check_country_code))
$f$;
CREATE OR REPLACE FUNCTION public.is_ip_blocked(check_ip text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $f$
  SELECT EXISTS (SELECT 1 FROM public.blocked_ips WHERE ip_address = check_ip AND (expires_at IS NULL OR expires_at > now()))
$f$;
CREATE OR REPLACE FUNCTION public.is_ip_whitelisted(check_ip text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $f$
  SELECT EXISTS (SELECT 1 FROM public.ip_whitelist WHERE ip_address = check_ip)
$f$;
CREATE OR REPLACE FUNCTION public.fn_list_audio_meme_categories() RETURNS TABLE(category text, total bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $f$
  SELECT category, COUNT(*)::bigint AS total FROM public.audio_memes GROUP BY category ORDER BY total DESC, category ASC
$f$;
CREATE OR REPLACE FUNCTION public.is_within_business_hours(connection_id uuid) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $f$
DECLARE v_current_day INTEGER; v_current_time TIME; v_is_open BOOLEAN; v_open_at TIME; v_close_at TIME;
BEGIN
  v_current_day := EXTRACT(DOW FROM now() AT TIME ZONE 'America/Sao_Paulo');
  v_current_time := (now() AT TIME ZONE 'America/Sao_Paulo')::TIME;
  SELECT bh.is_open, bh.open_time, bh.close_time INTO v_is_open, v_open_at, v_close_at
    FROM business_hours bh WHERE bh.whatsapp_connection_id = connection_id AND bh.day_of_week = v_current_day;
  IF NOT FOUND THEN RETURN true; END IF;
  IF NOT v_is_open THEN RETURN false; END IF;
  RETURN v_current_time >= v_open_at AND v_current_time <= v_close_at;
END $f$;
GRANT EXECUTE ON FUNCTION public.effective_role(uuid), public.user_has_permission(uuid, text),
  public.is_team_conversation_member(uuid, uuid), public.search_knowledge_base(text, integer),
  public.talkx_engine_window_open(uuid), public.count_searchbox_sessions_this_month(),
  public.notify_searchbox_budget(), public.is_country_allowed(text), public.is_country_blocked(text),
  public.is_ip_blocked(text), public.is_ip_whitelisted(text), public.fn_list_audio_meme_categories(),
  public.is_within_business_hours(uuid) TO authenticated, service_role;
SQL

# ── Fixture ──────────────────────────────────────────────────────────────────────────────────────────────
AGENTE=11111111-1111-1111-1111-111111111111
CHEFE=22222222-2222-2222-2222-222222222222
OUTRO=33333333-3333-3333-3333-333333333333
PERFILESS=aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa
CONV=44444444-4444-4444-4444-444444444444
CAMP=55555555-5555-5555-5555-555555555555
CONN=66666666-6666-6666-6666-666666666666
psql_file - <<SQL >/dev/null
INSERT INTO public.user_roles (user_id, role) VALUES ('$OUTRO', 'admin');
INSERT INTO public.permissions (id, name) VALUES ('77777777-7777-7777-7777-777777777777', 'send_messages');
INSERT INTO public.role_permissions (role, permission_id) VALUES ('admin', '77777777-7777-7777-7777-777777777777');
INSERT INTO public.user_roles (user_id, role) VALUES ('$AGENTE', 'agent');
INSERT INTO public.profiles (id, user_id, role) VALUES ('88888888-8888-8888-8888-888888888888', '$AGENTE', 'agent');
INSERT INTO public.profiles (id, user_id, role) VALUES ('99999999-9999-9999-9999-999999999999', '$CHEFE', 'admin');
INSERT INTO public.user_roles (user_id, role) VALUES ('$CHEFE', 'admin');
INSERT INTO public.team_conversation_members (conversation_id, profile_id, member_role)
  VALUES ('$CONV', '99999999-9999-9999-9999-999999999999', 'owner');
INSERT INTO public.audit_logs (action) VALUES ('searchbox_session');
INSERT INTO public.blocked_ips (ip_address) VALUES ('1.2.3.4');
INSERT INTO public.ip_whitelist (ip_address) VALUES ('1.2.3.4');
INSERT INTO public.blocked_countries (country_code) VALUES ('XX');
INSERT INTO public.allowed_countries (country_code) VALUES ('BR');
INSERT INTO public.geo_blocking_settings (mode) VALUES ('blacklist');
INSERT INTO public.audio_memes (category) VALUES ('risada');
INSERT INTO public.knowledge_base_articles (title, content, owner_user_id, is_published)
  VALUES ('Manual do agente', 'conteudo publico', '$AGENTE', true),
         ('Playbook interno da diretoria', 'conteudo restrito', '$OUTRO', true);
INSERT INTO public.business_hours (whatsapp_connection_id, day_of_week, is_open, open_time, close_time)
  VALUES ('$CONN', EXTRACT(DOW FROM now() AT TIME ZONE 'America/Sao_Paulo')::int, true, '00:00', '23:59');
INSERT INTO public.talkx_campaigns (id, schedule_timezone) VALUES ('$CAMP', 'America/Sao_Paulo');
SQL

# ── VERMELHO: hoje, qualquer usuario logado le papel/permissao/config de outro e da casa ─────────────────
expect_agent_value 'A1 (defeito) agente le papel de outro usuario'              "$AGENTE" 'admin'    "SELECT public.effective_role('$OUTRO')"
expect_agent_value 'A2 (defeito) agente le permissao de outro usuario'          "$AGENTE" 't'        "SELECT public.user_has_permission('$OUTRO','send_messages')"
expect_agent_value 'A3 (defeito) agente le vinculo de outro usuario no chat'    "$AGENTE" 't'        "SELECT public.is_team_conversation_member('$CHEFE','$CONV')"
expect_agent_value 'B1 (defeito) agente le a config de IP bloqueado'            "$AGENTE" 't'        "SELECT public.is_ip_blocked('1.2.3.4')"
expect_agent_value 'B2 (defeito) agente le a whitelist de IP'                   "$AGENTE" 't'        "SELECT public.is_ip_whitelisted('1.2.3.4')"
expect_agent_value 'B3 (defeito) agente le a lista de paises bloqueados'        "$AGENTE" 't'        "SELECT public.is_country_blocked('XX')"
expect_agent_value 'B4 (defeito) agente le a politica de pais'                  "$AGENTE" 'f'        "SELECT public.is_country_allowed('XX')"
expect_agent_value 'B5 (defeito) agente lista categorias de memes'              "$AGENTE" 'risada'   "SELECT category FROM public.fn_list_audio_meme_categories() LIMIT 1"
expect_agent_value 'C1 (defeito) agente le a janela de envio de outra campanha' "$AGENTE" 't'        "SELECT public.talkx_engine_window_open('$CAMP')"
expect_agent_value 'C2 (defeito) DEFINER ignora a RLS da base de conhecimento'  "$AGENTE" '2'        "SELECT count(*) FROM public.search_knowledge_base('conteudo')"
expect_agent_value 'C3 (defeito) agente sem perfil le o consumo do Searchbox'   "$PERFILESS" '1'    "SELECT public.count_searchbox_sessions_this_month()"

# ── Verde: aplica a migration REAL (arquivo inteiro) ─────────────────────────────────────────────────────
psql_file "$migration" >/dev/null
printf '[PASS] migration 20261007004545 aplicada\n'; ((passed += 1))

# A) oraculos de identidade: outro usuario nao; o proprio e o admin sim
expect_agent_error 'A1 agente nao le o papel de outro usuario'        "$AGENTE" 'permission denied' "SELECT public.effective_role('$OUTRO')"
expect_agent_error 'A2 agente nao le a permissao de outro usuario'    "$AGENTE" 'nao autorizada' "SELECT public.user_has_permission('$OUTRO','send_messages')"
expect_agent_value 'A2b agente continua lendo a propria permissao'    "$AGENTE" 'f'     "SELECT public.user_has_permission('$AGENTE','send_messages')"
expect_agent_value 'A2c admin continua lendo a permissao de outro'    "$CHEFE"  't'     "SELECT public.user_has_permission('$OUTRO','send_messages')"
expect_agent_error 'A3 agente nao le o vinculo de outro usuario'      "$AGENTE" 'nao autorizada' "SELECT public.is_team_conversation_member('$CHEFE','$CONV')"
expect_agent_value 'A3b agente continua lendo o proprio vinculo'      "$CHEFE"  't'     "SELECT public.is_team_conversation_member('$CHEFE','$CONV')"

# B) sem chamador no app/edge/regra/visao: EXECUTE de authenticated fechado
expect_agent_error 'B1 config de IP bloqueado nega o agente'           "$AGENTE" 'permission denied' "SELECT public.is_ip_blocked('1.2.3.4')"
expect_agent_error 'B2 whitelist de IP nega o agente'                  "$AGENTE" 'permission denied' "SELECT public.is_ip_whitelisted('1.2.3.4')"
expect_agent_error 'B3 paises bloqueados nega o agente'                "$AGENTE" 'permission denied' "SELECT public.is_country_blocked('XX')"
expect_agent_error 'B4 politica de pais nega o agente'                 "$AGENTE" 'permission denied' "SELECT public.is_country_allowed('XX')"
expect_agent_error 'B5 categorias de memes nega o agente'              "$AGENTE" 'permission denied' "SELECT public.fn_list_audio_meme_categories()"
expect_agent_error 'B6 papel efetivo nega o agente'                    "$AGENTE" 'permission denied' "SELECT public.effective_role('$AGENTE')"
expect_agent_error 'B7 alerta de orcamento do Searchbox nega o agente' "$AGENTE" 'permission denied' "SELECT public.notify_searchbox_budget()"
expect_value 'B8 helper de decisao do chamador nao e RPC' 'f' \
  "SELECT has_function_privilege('authenticated', 'public.secd_caller_ok(uuid, boolean)', 'EXECUTE')"
expect_value 'B9 contextos internos (service_role) seguem com EXECUTE nas 7' 'true' \
  "SELECT bool_and(has_function_privilege('service_role', p, 'EXECUTE'))::text FROM (VALUES
     ('public.effective_role(uuid)'::regprocedure), ('public.fn_list_audio_meme_categories()'::regprocedure),
     ('public.is_country_allowed(text)'::regprocedure), ('public.is_country_blocked(text)'::regprocedure),
     ('public.is_ip_blocked(text)'::regprocedure), ('public.is_ip_whitelisted(text)'::regprocedure),
     ('public.notify_searchbox_budget()'::regprocedure)) AS t(p)"

# C) app chama como o proprio usuario: checagem sem quebrar o fluxo
expect_agent_value 'C1 janela de envio nao e revelada ao agente (fail-closed)' "$AGENTE" 'f' "SELECT public.talkx_engine_window_open('$CAMP')"
expect_agent_value 'C1b admin continua vendo a janela de envio'                "$CHEFE"  't' "SELECT public.talkx_engine_window_open('$CAMP')"
expect_agent_value 'C2 base de conhecimento passa a respeitar a RLS'           "$AGENTE" '1' "SELECT count(*) FROM public.search_knowledge_base('conteudo')"
expect_agent_value 'C3 agente com perfil continua lendo o consumo do Searchbox' "$AGENTE" '1' "SELECT public.count_searchbox_sessions_this_month()"
expect_agent_value 'C4 agente com perfil continua vendo o status de horario'    "$AGENTE" 't' "SELECT public.is_within_business_hours('$CONN')"
expect_agent_error 'C5 chamador sem perfil e barrado no consumo do Searchbox'   "$PERFILESS" 'sem sessao de usuario' "SELECT public.count_searchbox_sessions_this_month()"

printf 'M-DB-05 (13 funcoes SEM checagem do chamador): %s cenarios aprovados.\n' "$passed"
