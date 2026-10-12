#!/usr/bin/env bash
# Prova, em PostgreSQL 17 descartavel, o contrato das RPCs de demanda do modulo
# de Relatorios: public.dashboard_heatmap(integer) e public.demand_forecast(integer, integer).
#
# O que este harness prova:
#   1. RED-FIRST do bug de fuso: o agrupamento que o cliente fazia
#      (new Date(created_at).getDay()/getHours(), ou seja UTC no navegador) poe a
#      mensagem da fronteira no bucket ERRADO; a RPC a poe no bucket LOCAL correto.
#      Se a implementacao fosse UTC, a prova falharia.
#   2. RED-FIRST de ACL/gate: antes da migration a funcao nem existe.
#   3. Agregacao: inbound por (dia da semana, hora) local; agent e soft-delete ficam fora.
#   4. demand_forecast: 7 dias reais (0 real onde nao houve inbound), previsao pela
#      media do mesmo dia da semana (NULL onde nao ha historico), determinista.
#   5. Permissao: admin/supervisor pode; agente NAO; anon NAO; service_role NAO (nao
#      recebeu GRANT). Mesmo erro para "sem sessao" e "sem papel" (sem oraculo).
#   6. Rollback executavel: as duas linhas do cabecalho removem as funcoes.
set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
migration_file="$repo_root/supabase/migrations/20261012115458_demand_forecast.sql"
postgres_image="${DEMAND_FORECAST_TEST_POSTGRES_IMAGE:-postgres:17-alpine}"
container_name="zapp-demand-forecast-$RANDOM-$$"
test_password="demand_forecast_test_only"

admin_uid='30000000-0000-0000-0000-000000000001'
agent_uid='30000000-0000-0000-0000-000000000002'

cleanup() {
  if [[ "$container_name" =~ ^zapp-demand-forecast-[0-9]+-[0-9]+$ ]]; then
    docker rm -f "$container_name" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT
fail() { printf 'FAIL: %s\n' "$1" >&2; exit 1; }
psql_test() { docker exec -i "$container_name" psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres "$@"; }

[[ -f "$migration_file" ]] || fail 'migration do cartao nao existe'

for attempt in 1 2 3; do
  docker rm -f "$container_name" >/dev/null 2>&1 || true
  if ! docker run -d --name "$container_name" -e POSTGRES_PASSWORD="$test_password" "$postgres_image" >/dev/null; then
    printf 'WARN: container falhou (%s/3)\n' "$attempt" >&2; continue
  fi
  ready=false
  for _ in $(seq 1 30); do
    if docker exec "$container_name" psql -X -U postgres -d postgres -Atqc 'SELECT 1' >/dev/null 2>&1; then
      ready=true; break
    fi
    sleep 1
  done
  [[ "$ready" == true ]] && break
done
[[ "$ready" == true ]] || fail 'PostgreSQL 17 descartavel nao ficou pronto'

# ---------------------------------------------------------------------------
# Fixture minima: auth.uid(), is_admin_or_supervisor (mesma assinatura real),
# user_roles, messages. Roles anon/authenticated/service_role como no Supabase.
# ---------------------------------------------------------------------------
psql_test >/dev/null <<'SQL'
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN;

CREATE TABLE public.user_roles (user_id uuid NOT NULL, role text NOT NULL);
CREATE FUNCTION public.is_admin_or_supervisor(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role IN ('admin','supervisor'))
$$;

CREATE TABLE public.messages (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  sender text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  is_deleted boolean NOT NULL DEFAULT false
);

INSERT INTO public.user_roles(user_id, role) VALUES
  ('30000000-0000-0000-0000-000000000001', 'admin'),
  ('30000000-0000-0000-0000-000000000002', 'agent');
SQL

# ---------------------------------------------------------------------------
# Semente determinista relativa ao dia LOCAL de hoje (America/Sao_Paulo).
# dia_off: 1 = ontem local, 0 = hoje local. Hora = hora LOCAL.
# ---------------------------------------------------------------------------
psql_test >/dev/null <<'SQL'
WITH h AS (SELECT (now() AT TIME ZONE 'America/Sao_Paulo')::date AS hoje)
INSERT INTO public.messages(sender, created_at, is_deleted)
SELECT v.sender,
       ((h.hoje - v.dia_off)::timestamp AT TIME ZONE 'America/Sao_Paulo') + v.hora,
       v.deleted
FROM h, (VALUES
  -- fronteira de fuso: 23h30 local de ONTEM == 02h30 UTC de HOJE
  ('contact', 1, interval '23 hours 30 minutes', false),
  ('contact', 1, interval '23 hours 30 minutes', false),
  ('agent',   1, interval '23 hours 30 minutes', false),
  ('contact', 1, interval '23 hours 30 minutes', true),
  -- demanda dos ultimos dias
  ('contact', 1, interval '10 hours', false),
  ('contact', 1, interval '11 hours', false),
  ('contact', 1, interval '12 hours', false),
  ('contact', 0, interval '10 hours', false),
  ('agent',   0, interval '10 hours', false),
  ('contact', 0, interval '10 hours', true)
) AS v(sender, dia_off, hora, deleted);
SQL

hoje="$(psql_test -Atqc "SELECT (now() AT TIME ZONE 'America/Sao_Paulo')::date")"
dow_local="$(psql_test -Atqc "SELECT extract(dow FROM ('$hoje'::date - 1))::int")"
dow_hoje="$(psql_test -Atqc "SELECT extract(dow FROM '$hoje'::date)::int")"
[[ "$dow_local" != "$dow_hoje" ]] || fail 'harness invalido: buckets local e UTC coincidem'

# ---------------------------------------------------------------------------
# RED-FIRST 1: as RPCs ainda nao existem.
# ---------------------------------------------------------------------------
[[ "$(psql_test -Atqc "SELECT count(*) FROM pg_proc WHERE proname IN ('dashboard_heatmap','demand_forecast')")" == '0' ]] \
  || fail 'harness invalido: as funcoes ja existem antes da migration'
printf '[OK] red-first: as RPCs de demanda nao existem antes da migration.\n'

# ---------------------------------------------------------------------------
# RED-FIRST 2: o agrupamento do cliente (UTC) erra a fronteira de fuso.
# ---------------------------------------------------------------------------
naive="$(psql_test -Atqc "SELECT dow || '|' || hora || '|' || n FROM (SELECT extract(dow FROM created_at)::int AS dow, extract(hour FROM created_at)::int AS hora, count(*) AS n FROM public.messages WHERE sender='contact' AND is_deleted IS NOT TRUE AND created_at >= now() - interval '28 days' GROUP BY 1, 2) t" | grep -x "${dow_hoje}|2|2" || true)"
[[ "$naive" == "${dow_hoje}|2|2" ]] \
  || fail "harness invalido: o agrupamento UTC do cliente deveria dar (dow=${dow_hoje}, hora=2) = 2; veio '$naive'"
printf '[OK] red-first: o bucket do cliente (UTC) e (dow=%s, hora=2); o correto e (dow=%s, hora=23).\n' "$dow_hoje" "$dow_local"

# ---------------------------------------------------------------------------
# Aplica a migration (e prova idempotencia/replay).
# ---------------------------------------------------------------------------
psql_test < "$migration_file" >/dev/null || fail 'a migration nao aplicou'
psql_test < "$migration_file" >/dev/null || fail 'a migration nao e replayavel (segunda aplicacao falhou)'

# ---------------------------------------------------------------------------
# GREEN 1: heatmap por (dia da semana, hora) LOCAL.
# ---------------------------------------------------------------------------
heatmap="$(psql_test -Atq <<SQL
SET ROLE authenticated;
SET request.jwt.claim.sub = '$admin_uid';
SELECT dow || '|' || hour || '|' || value FROM public.dashboard_heatmap(28) ORDER BY dow, hour;
SQL
)"
grep -qx "${dow_local}|23|2" <<<"$heatmap" \
  || fail "dashboard_heatmap nao devolveu o bucket local (dow=$dow_local, hora=23) = 2; veio: $heatmap"
grep -qx "${dow_hoje}|10|1" <<<"$heatmap" \
  || fail "dashboard_heatmap nao devolveu o bucket de hoje (dow=$dow_hoje, hora=10) = 1; veio: $heatmap"
if grep -qx "${dow_hoje}|2|2" <<<"$heatmap"; then
  fail 'dashboard_heatmap caiu no bucket UTC (bug de fuso nao corrigido)'
fi
[[ "$(grep -c '|' <<<"$heatmap")" == '5' ]] \
  || fail "dashboard_heatmap deveria ter 5 buckets (agent e soft-delete fora); veio: $heatmap"
printf '[OK] dashboard_heatmap: bucket local (dow=%s, hora=23)=2 e (dow=%s, hora=10)=1; agent e soft-delete excluidos.\n' "$dow_local" "$dow_hoje"

# ---------------------------------------------------------------------------
# GREEN 2: demand_forecast — 7 dias reais, previsao por dia da semana, determinismo.
# ---------------------------------------------------------------------------
forecast() {
  psql_test -Atq <<SQL
SET ROLE authenticated;
SET request.jwt.claim.sub = '$admin_uid';
SELECT d || '|' || kind || '|' || dow || '|' || coalesce(value::text,'NULL') FROM public.demand_forecast(28, 7) ORDER BY d, kind;
SQL
}
fc1="$(forecast)"
fc2="$(forecast)"
[[ "$fc1" == "$fc2" ]] || fail 'demand_forecast nao e determinista (duas chamadas divergiram)'

[[ "$(grep -c '|actual|' <<<"$fc1")" == '7' ]] || fail "demand_forecast deveria ter 7 dias 'actual'; veio: $fc1"
[[ "$(grep -c '|forecast|' <<<"$fc1")" == '7' ]] || fail "demand_forecast deveria ter 7 dias 'forecast'; veio: $fc1"
[[ "$(grep -c '|actual|.*|5$' <<<"$fc1")" == '1' ]] || fail "ontem deveria ser 5 reais (3 as 10-12h + 2 na fronteira 23h30); veio: $fc1"
[[ "$(grep -c '|actual|.*|1$' <<<"$fc1")" == '1' ]] || fail "hoje deveria ser 1 real; veio: $fc1"
[[ "$(grep -c '|actual|.*|0$' <<<"$fc1")" == '5' ]] || fail "5 dias reais sem inbound deveriam ser 0 real; veio: $fc1"
# previsao: media do mesmo dia da semana na janela -> dow(ontem)=5, dow(hoje)=1, resto NULL
[[ "$(grep -c '|forecast|.*|5$' <<<"$fc1")" == '1' ]] || fail "previsao do dow de ontem deveria ser 5; veio: $fc1"
[[ "$(grep -c '|forecast|.*|NULL$' <<<"$fc1")" == '5' ]] || fail "previsao sem historico deveria ser NULL (nunca 0 inventado); veio: $fc1"
[[ "$(psql_test -Atqc "SELECT count(*) FROM public.messages")" == '10' ]] || fail 'a RPC alterou linhas de messages (nao pode escrever)'
printf '[OK] demand_forecast: 7 reais (ontem=5, hoje=1, 5 zeros), previsao determinista por dow, NULL sem historico.\n'

# ---------------------------------------------------------------------------
# GREEN 3: permissao — admin pode; agente, anon, service_role e sem-sessao NAO.
# ---------------------------------------------------------------------------
erro_como() { # $1 = role, $2 = jwt sub ('' = sem sessao); imprime o NOTICE
  psql_test -Atq 2>&1 <<SQL
SET ROLE $1;
SET request.jwt.claim.sub = '$2';
DO \$\$
BEGIN
  PERFORM * FROM public.dashboard_heatmap(28);
  RAISE NOTICE 'SEM_ERRO';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'ERR:%|%', SQLSTATE, SQLERRM;
END
\$\$;
SQL
}
limpa() { grep -o 'NOTICE:.*' <<<"$1" | sed 's/^NOTICE:[[:space:]]*//' | head -1; }

err_agente="$(limpa "$(erro_como authenticated "$agent_uid")")"
err_sem_sessao="$(limpa "$(erro_como authenticated '')")"
err_anon="$(limpa "$(erro_como anon "$agent_uid")")"
err_service="$(limpa "$(erro_como service_role "$admin_uid")")"

[[ "$err_agente" == 'ERR:42501|acesso restrito a admin/supervisor' ]] \
  || fail "agente deveria receber 42501 'acesso restrito a admin/supervisor'; veio '$err_agente'"
[[ "$err_sem_sessao" == "$err_agente" ]] \
  || fail 'sem sessao deveria receber o MESMO erro do agente (sem oraculo de identidade)'
[[ "$err_anon" == 'ERR:42501|permission denied for function dashboard_heatmap' ]] \
  || fail "anon deveria morrer na ACL (permission denied), antes de qualquer linha; veio '$err_anon'"
[[ "$err_service" == 'ERR:42501|permission denied for function dashboard_heatmap' ]] \
  || fail "service_role nao recebeu GRANT e deveria ser negado na ACL; veio '$err_service'"
[[ "$(psql_test -Atqc "SELECT has_function_privilege('authenticated','public.dashboard_heatmap(integer)','EXECUTE')")" == 't' ]] \
  || fail 'authenticated perdeu o EXECUTE de dashboard_heatmap'
[[ "$(psql_test -Atqc "SELECT has_function_privilege('anon','public.dashboard_heatmap(integer)','EXECUTE')")" == 'f' ]] \
  || fail 'anon ainda tem EXECUTE em dashboard_heatmap'
[[ "$(psql_test -Atqc "SELECT has_function_privilege('authenticated','public.demand_forecast(integer,integer)','EXECUTE')")" == 't' ]] \
  || fail 'authenticated perdeu o EXECUTE de demand_forecast'
[[ "$(psql_test -Atqc "SELECT has_function_privilege('service_role','public.demand_forecast(integer,integer)','EXECUTE')")" == 'f' ]] \
  || fail 'service_role nao deveria ter EXECUTE em demand_forecast'
printf '[OK] permissao: admin/supervisor sim; agente, anon, service_role e sem-sessao nao (42501); mesmo erro sem oraculo.\n'

# ---------------------------------------------------------------------------
# GREEN 4: search_path fixado (SECURITY DEFINER nao herda o do chamador).
# ---------------------------------------------------------------------------
sp="$(psql_test -Atqc "SELECT array_to_string(proconfig, ',') FROM pg_proc WHERE proname='dashboard_heatmap'")"
[[ "$sp" == *'search_path=pg_catalog, public'* ]] || fail "search_path nao fixado em pg_catalog, public; veio '$sp'"
printf '[OK] search_path fixado em pg_catalog, public (SECURITY DEFINER).\n'

# ---------------------------------------------------------------------------
# GREEN 5: rollback do cabecalho e executavel.
# ---------------------------------------------------------------------------
mapfile -t rollback < <(grep -E '^--[[:space:]]+drop function if exists' "$migration_file" | sed 's/^--[[:space:]]*//')
[[ "${#rollback[@]}" == '2' ]] || fail "o cabecalho deveria ter 2 linhas de rollback; veio ${#rollback[@]}"
for stmt in "${rollback[@]}"; do
  psql_test -qc "$stmt" >/dev/null || fail "rollback nao executou: $stmt"
done
[[ "$(psql_test -Atqc "SELECT count(*) FROM pg_proc WHERE proname IN ('dashboard_heatmap','demand_forecast')")" == '0' ]] \
  || fail 'rollback nao removeu as duas funcoes'
printf '[OK] rollback do cabecalho remove as duas funcoes.\n'

printf '[OK] contrato das RPCs de demanda (dashboard_heatmap + demand_forecast) provado em PostgreSQL 17.\n'
