#!/usr/bin/env bash
# Contrato de public.commit_copilot_tick: fechar um tick do Copiloto é atômico.
#
# Migration objeto deste teste:
#   supabase/migrations/20261115030000_commit_copilot_tick.sql
#
# BLOCO A (como é hoje, em duas chamadas): o UPDATE da sessão passa, o INSERT dos
#   insights falha e o cursor FICA adiantado sem nenhum insight — as mensagens
#   analisadas não voltam ao próximo tick.
# BLOCO B (pela função): mesmo cenário de falha, nada é gravado — a sessão
#   continua na versão anterior e o próximo tick reprocessa.
# BLOCO C (caminho bom): sessão anda uma versão e os insights entram com
#   session_id/profile_id/state_version vindos da sessão, não do payload.
# BLOCO D (trava otimista): versão velha devolve -1 e não escreve nada.
# BLOCO E (patch): campo fora da lista é erro explícito (e não silêncio, que é o
#   padrão do jsonb_populate_record); id/profile_id não são alteráveis.
# BLOCO F (ACL): PUBLIC não executa; service_role executa.
# BLOCO R: o rollback do cabeçalho remove a função.

set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
migration="${COMMIT_TICK_TEST_MIGRATION:-$repo_root/supabase/migrations/20261115030000_commit_copilot_tick.sql}"
postgres_image="${COMMIT_TICK_TEST_POSTGRES_IMAGE:-postgres:17-alpine}"
container_name="zapp-v2-commit-tick-test-$$"

cleanup() {
  if [[ "$container_name" =~ ^zapp-v2-commit-tick-test-[0-9]+$ ]]; then
    docker rm -f "$container_name" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT INT TERM

fail() { printf '[FAIL] %s\n' "$1" >&2; exit 1; }

psql_sql() { docker exec "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres -c "$1"; }
psql_file() { docker exec -i "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres < "$1"; }

expect_value() {
  local label="$1" expected="$2" sql="$3" actual
  actual="$(psql_sql "$sql" | tail -n1)"
  [[ "$actual" == "$expected" ]] || fail "$label: esperado '$expected', obtido '$actual'"
  printf '[PASS] %s\n' "$label"
}

expect_erro() {
  local label="$1" sql="$2"
  if psql_sql "$sql" >/dev/null 2>&1; then fail "$label: deveria ter falhado"; fi
  printf '[PASS] %s\n' "$label"
}

command -v docker >/dev/null 2>&1 || fail 'Docker nao esta instalado'
docker info >/dev/null 2>&1 || fail 'Docker daemon nao esta acessivel'
[[ -f "$migration" ]] || fail "migration nao encontrada: $migration"

docker run --rm -d --name "$container_name" -e POSTGRES_PASSWORD=test_only "$postgres_image" >/dev/null

ready_checks=0
for _ in $(seq 1 90); do
  if psql_sql 'SELECT 1' >/dev/null 2>&1; then
    ready_checks=$((ready_checks + 1)); (( ready_checks >= 2 )) && break
  else ready_checks=0; fi
  sleep 1
done
(( ready_checks >= 2 )) || fail 'PostgreSQL descartavel nao ficou pronto'

tmp_dir="$(mktemp -d)"
trap 'rm -rf "$tmp_dir"; cleanup' EXIT INT TERM

SESSAO='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
DONO='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
OUTRO='cccccccc-cccc-cccc-cccc-cccccccccccc'

# Estrutura real das duas tabelas (colunas e defaults como em producao).
cat > "$tmp_dir/pre.sql" <<SQL
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;

CREATE TABLE public.copilot_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL,
  contact_id uuid NOT NULL,
  profile_id uuid NOT NULL,
  brinde_budget text, brinde_responsible text, brinde_intention text,
  brinde_quantity integer, brinde_deadline date, brinde_delivery text,
  brinde_meter integer NOT NULL DEFAULT 0,
  sale_stage text NOT NULL DEFAULT 'descoberta',
  temperature integer NOT NULL DEFAULT 0,
  state_version integer NOT NULL DEFAULT 0,
  started_at timestamptz NOT NULL DEFAULT now(),
  last_tick_at timestamptz, closed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  brinde_evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  comm_style text, decision_role text, occasion text,
  stakeholders jsonb NOT NULL DEFAULT '[]'::jsonb,
  brinde_state jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_processed_message_at timestamptz,
  intent text, sentiment text, last_contact_message_at timestamptz);

CREATE TABLE public.copilot_insights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL,
  profile_id uuid NOT NULL,
  insight_type text NOT NULL,
  content text NOT NULL,
  source text NOT NULL DEFAULT 'edge',
  model_version text,
  state_version integer NOT NULL DEFAULT 0,
  shown_at timestamptz, used_at timestamptz, dismissed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  tier smallint NOT NULL DEFAULT 1,
  latency_ms integer,
  data jsonb);

INSERT INTO public.copilot_sessions (id, conversation_id, contact_id, profile_id, state_version)
  VALUES ('$SESSAO', gen_random_uuid(), gen_random_uuid(), '$DONO', 7);
SQL

psql_file "$tmp_dir/pre.sql" >/dev/null
printf '[PASS] estrutura das tabelas criada (sessao na versao 7)\n'

patch="{\"state_version\": 8, \"last_tick_at\": \"2026-11-16T01:00:00Z\", \"last_processed_message_at\": \"2026-11-16T00:59:00Z\", \"sale_stage\": \"proposta\", \"temperature\": 80}"
insights_ok="[{\"insight_type\": \"suggestion\", \"content\": \"Mandar a proposta hoje\", \"source\": \"edge\", \"model_version\": \"m1\", \"tier\": 1, \"latency_ms\": 120, \"data\": {\"a\": 1}},
              {\"insight_type\": \"alert\", \"content\": \"Prazo curto\", \"source\": \"edge\", \"model_version\": \"m1\", \"tier\": 2, \"latency_ms\": 200, \"data\": {}}]"
# insight_type NULL viola o NOT NULL: é o modo de falha que o teste usa.
insights_ruim="[{\"content\": \"sem tipo\", \"tier\": 1}]"

# ---------------------------------------------------------------- BLOCO A
# Reproduz o que a edge faz hoje: duas instrucoes, cada uma com seu commit.
psql_sql "UPDATE public.copilot_sessions SET state_version = 8, last_processed_message_at = '2026-11-16T00:59:00Z' WHERE id = '$SESSAO' AND state_version = 7;" >/dev/null
expect_erro 'A1 o INSERT dos insights falha (insight_type NULL)' \
  "INSERT INTO public.copilot_insights (session_id, profile_id, insight_type, content) VALUES ('$SESSAO', '$DONO', NULL, 'sem tipo');"
expect_value 'A2 em duas chamadas o cursor FICA adiantado sem nenhum insight' '8|0' \
  "SELECT s.state_version || '|' || (SELECT count(*) FROM public.copilot_insights) FROM public.copilot_sessions s WHERE s.id = '$SESSAO';"

# Volta a sessao para a versao 7 e aplica a migration.
psql_sql "UPDATE public.copilot_sessions SET state_version = 7, last_processed_message_at = NULL WHERE id = '$SESSAO';" >/dev/null
psql_file "$migration" >/dev/null
printf '[PASS] migration aplicada\n'

# ---------------------------------------------------------------- BLOCO B
expect_erro 'B1 pela funcao, insight invalido derruba o tick inteiro' \
  "SELECT public.commit_copilot_tick('$SESSAO', 7, '$patch'::jsonb, '$insights_ruim'::jsonb);"
expect_value 'B2 nada foi gravado: a sessao continua na versao 7 e sem cursor' '7||0' \
  "SELECT s.state_version || '|' || coalesce(s.last_processed_message_at::text, '') || '|' || (SELECT count(*) FROM public.copilot_insights) FROM public.copilot_sessions s WHERE s.id = '$SESSAO';"

# ---------------------------------------------------------------- BLOCO C
expect_value 'C1 caminho bom devolve o numero de insights gravados' '2' \
  "SELECT public.commit_copilot_tick('$SESSAO', 7, '$patch'::jsonb, '$insights_ok'::jsonb);"
expect_value 'C2 a sessao andou uma versao com o patch aplicado' '8|proposta|80' \
  "SELECT state_version || '|' || sale_stage || '|' || temperature FROM public.copilot_sessions WHERE id = '$SESSAO';"
expect_value 'C3 os insights carregam sessao, dono e versao vindos da sessao' "2|$SESSAO|$DONO|8" \
  "SELECT count(*) || '|' || min(session_id::text) || '|' || min(profile_id::text) || '|' || min(state_version) FROM public.copilot_insights;"
expect_value 'C4 tier/latencia/conteudo do payload chegam intactos' 'alert:2:200|suggestion:1:120' \
  "SELECT string_agg(insight_type || ':' || tier || ':' || latency_ms, '|' ORDER BY insight_type) FROM public.copilot_insights;"
# Em duas instrucoes: na MESMA instrucao a subconsulta leria o snapshot de antes da funcao.
expect_value 'C5 tick sem insight nenhum devolve 0' '0' \
  "SELECT public.commit_copilot_tick('$SESSAO', 8, '{\"state_version\": 9}'::jsonb, '[]'::jsonb);"
expect_value 'C5b e a sessao ainda andou para a versao 9' '9' \
  "SELECT state_version FROM public.copilot_sessions WHERE id = '$SESSAO';"

# ---------------------------------------------------------------- BLOCO D
expect_value 'D1 versao velha devolve -1 (trava otimista)' '-1' \
  "SELECT public.commit_copilot_tick('$SESSAO', 7, '$patch'::jsonb, '$insights_ok'::jsonb);"
expect_value 'D2 e nao escreveu nada: versao 9 e os 2 insights de antes' '9|2' \
  "SELECT s.state_version || '|' || (SELECT count(*) FROM public.copilot_insights) FROM public.copilot_sessions s WHERE s.id = '$SESSAO';"
expect_value 'D3 sessao inexistente devolve -1' '-1' \
  "SELECT public.commit_copilot_tick('99999999-9999-9999-9999-999999999999', 0, '{}'::jsonb, '[]'::jsonb);"

# ---------------------------------------------------------------- BLOCO E
expect_erro 'E1 campo fora da lista do patch e erro, nao silencio' \
  "SELECT public.commit_copilot_tick('$SESSAO', 9, '{\"coluna_inventada\": 1}'::jsonb, '[]'::jsonb);"
expect_erro 'E2 profile_id nao e alteravel pelo patch' \
  "SELECT public.commit_copilot_tick('$SESSAO', 9, '{\"profile_id\": \"$OUTRO\"}'::jsonb, '[]'::jsonb);"
expect_erro 'E3 patch que nao e objeto e erro' \
  "SELECT public.commit_copilot_tick('$SESSAO', 9, '[]'::jsonb, '[]'::jsonb);"
expect_value 'E4 tick com payload apontando outra sessao devolve 1' '1' \
  "SELECT public.commit_copilot_tick('$SESSAO', 9, '{\"state_version\": 10}'::jsonb, '[{\"session_id\": \"99999999-9999-9999-9999-999999999999\", \"profile_id\": \"$OUTRO\", \"insight_type\": \"alert\", \"content\": \"x\", \"tier\": 1}]'::jsonb);"
expect_value 'E4b e o insight foi gravado na sessao certa, com o dono certo' "$SESSAO|$DONO" \
  "SELECT session_id || '|' || profile_id FROM public.copilot_insights WHERE content = 'x';"

# ---------------------------------------------------------------- BLOCO F
expect_value 'F1 EXECUTE nao fica aberto para PUBLIC' 'f' \
  "SELECT has_function_privilege('public', 'public.commit_copilot_tick(uuid, integer, jsonb, jsonb)', 'EXECUTE');"
expect_value 'F2 usuario logado nao fecha tick' 'f' \
  "SELECT has_function_privilege('authenticated', 'public.commit_copilot_tick(uuid, integer, jsonb, jsonb)', 'EXECUTE');"
expect_value 'F3 a edge (service_role) fecha tick' 't' \
  "SELECT has_function_privilege('service_role', 'public.commit_copilot_tick(uuid, integer, jsonb, jsonb)', 'EXECUTE');"
expect_value 'F4 a funcao nao e SECURITY DEFINER' 'f' \
  "SELECT prosecdef FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname = 'commit_copilot_tick';"

# ---------------------------------------------------------------- BLOCO R
awk '/^-- Rollback/ {dentro=1; next} dentro && !/^--/ {exit} dentro {sub(/^--   /, ""); print}' \
  "$migration" > "$tmp_dir/rollback.sql"
[[ -s "$tmp_dir/rollback.sql" ]] || fail 'R: bloco de rollback do cabecalho da migration saiu vazio'
psql_file "$tmp_dir/rollback.sql" >/dev/null
expect_value 'R rollback remove a funcao' '0' \
  "SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname = 'commit_copilot_tick';"

printf '\n[OK] contrato de commit_copilot_tick conferido\n'
