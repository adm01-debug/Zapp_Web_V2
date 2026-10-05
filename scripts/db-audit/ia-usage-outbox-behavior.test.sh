#!/usr/bin/env bash
# Contrato de COMPORTAMENTO da IA-TIMEOUT-001 (item 44) em PostgreSQL de verdade.
#
# Por que este teste existe: os testes Deno de `ai-usage.test.ts` provam o
# caminho do CLIENTE contra um banco falso. Eles não exercitam a migration nem
# a restrição UNIQUE real — foi exatamente esse furo que a revisão apontou. Aqui
# a migration de verdade é aplicada num PostgreSQL descartável (nunca produção)
# e as garantias são provadas no BANCO, com sessões concorrentes de verdade:
#
#   * dois UPSERT concorrentes do MESMO event_id -> 1 linha (nao 2);
#   * conteudo IDENTICO com event_id distinto -> 2 linhas (nao colapsa);
#   * o mesmo event_id repetido na outbox -> 1 linha pendente.
#
# Uso: bash scripts/db-audit/ia-usage-outbox-behavior.test.sh
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
migration="$repo_root/supabase/migrations/20261005183057_ia_timeout_001_event_id_outbox.sql"
acl_migration="$repo_root/supabase/migrations/20261005190058_ia_timeout_001_outbox_acl.sql"
postgres_image="${IA_USAGE_OUTBOX_TEST_POSTGRES_IMAGE:-postgres:17-alpine}"
container_name="ia-usage-outbox-test-$RANDOM-$$"

[ -f "$migration" ] || { echo "migration nao encontrada: $migration" >&2; exit 1; }
[ -f "$acl_migration" ] || { echo "migration nao encontrada: $acl_migration" >&2; exit 1; }

cleanup() { docker rm -f "$container_name" >/dev/null 2>&1 || true; }
trap cleanup EXIT

docker run --rm -d --name "$container_name" -e POSTGRES_PASSWORD=postgres "$postgres_image" >/dev/null

postgres_ready=false
for _ in $(seq 1 90); do
  ready_markers="$(docker logs "$container_name" 2>&1 \
    | grep -c 'database system is ready to accept connections' || true)"
  if [[ "$ready_markers" -ge 2 ]] \
    && docker exec "$container_name" psql -X -U postgres -d postgres -Atqc 'SELECT 1' >/dev/null 2>&1; then
    postgres_ready=true
    break
  fi
  sleep 1
done

if [[ "$postgres_ready" != true ]]; then
  echo "PostgreSQL test container did not reach final readiness." >&2
  docker logs --tail 100 "$container_name" >&2 || true
  exit 1
fi

psql_test() { docker exec -i "$container_name" psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres "$@"; }

# ---- pré-requisitos: papéis do Supabase e um ai_usage_logs mínimo --------------
psql_test >/dev/null <<'SQL'
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN;
CREATE SCHEMA IF NOT EXISTS auth;
CREATE TABLE public.ai_usage_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  profile_id uuid,
  function_name text NOT NULL,
  model text,
  input_tokens integer,
  output_tokens integer,
  duration_ms integer,
  status text NOT NULL DEFAULT 'success',
  error_message text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  request_id uuid,
  job_id uuid,
  attempt smallint,
  created_at timestamptz NOT NULL DEFAULT now()
);
SQL

# ---- as MIGRATIONS DE VERDADE são aplicadas (mesmos arquivos do diff) ----------
psql_test >/dev/null < "$migration"
# Simula o ALTER DEFAULT PRIVILEGES do Supabase: tabela nova nasce com GRANT a
# anon/authenticated. Sem isto, o revoke da migration de ACL nao teria o que
# provar (nao haveria privilegio a remover).
psql_test -q -c "GRANT ALL ON public.ai_usage_outbox TO anon, authenticated;"
psql_test >/dev/null < "$acl_migration"

output="$(
psql_test -At <<'SQL'
-- 1. a coluna e os índices únicos existem (a unicidade é do BANCO)
SELECT 'event_id_column=' || CASE WHEN
  EXISTS (SELECT 1 FROM information_schema.columns
          WHERE table_schema='public' AND table_name='ai_usage_logs' AND column_name='event_id')
THEN 'ok' ELSE 'fail' END;
SELECT 'logs_event_id_unique=' || CASE WHEN
  EXISTS (SELECT 1 FROM pg_indexes
          WHERE schemaname='public' AND indexname='ai_usage_logs_event_id_uidx')
  AND EXISTS (SELECT 1 FROM pg_indexes
          WHERE schemaname='public' AND indexdef LIKE '%UNIQUE%'
            AND indexname='ai_usage_logs_event_id_uidx')
THEN 'ok' ELSE 'fail' END;
SELECT 'outbox_unique=' || CASE WHEN
  EXISTS (SELECT 1 FROM pg_indexes
          WHERE schemaname='public' AND indexname='ai_usage_outbox_event_id_uidx'
            AND indexdef LIKE '%UNIQUE%')
THEN 'ok' ELSE 'fail' END;

-- 1b. ACL endurecida: anon/authenticated sem privilegio; service_role com o caminho
SELECT 'outbox_acl_endurecida=' || CASE WHEN
  NOT has_table_privilege('anon', 'public.ai_usage_outbox', 'SELECT')
  AND NOT has_table_privilege('anon', 'public.ai_usage_outbox', 'INSERT')
  AND NOT has_table_privilege('authenticated', 'public.ai_usage_outbox', 'SELECT')
  AND NOT has_table_privilege('authenticated', 'public.ai_usage_outbox', 'INSERT')
  AND has_table_privilege('service_role', 'public.ai_usage_outbox', 'SELECT')
  AND has_table_privilege('service_role', 'public.ai_usage_outbox', 'INSERT')
  AND has_table_privilege('service_role', 'public.ai_usage_outbox', 'UPDATE')
THEN 'ok' ELSE 'fail' END;

-- 2. conteudo IDENTICO com event_id DISTINTO grava DUAS linhas (nao colapsa por conteudo)
INSERT INTO public.ai_usage_logs (function_name, user_id, model, input_tokens, output_tokens, event_id)
VALUES
  ('ai-proxy', '00000000-0000-0000-0000-0000000000aa', 'gpt-4o-mini', 10, 20,
   'aaaaaaaa-1111-4111-8111-111111111111'),
  ('ai-proxy', '00000000-0000-0000-0000-0000000000aa', 'gpt-4o-mini', 10, 20,
   'bbbbbbbb-2222-4222-8222-222222222222');
SELECT 'conteudo_identico_nao_colapsa=' || CASE WHEN
  (SELECT count(*) FROM public.ai_usage_logs
    WHERE user_id='00000000-0000-0000-0000-0000000000aa') = 2
THEN 'ok' ELSE 'fail' END;

-- 3. UPSERT por event_id: a segunda entrega do MESMO evento e absorvida
INSERT INTO public.ai_usage_logs (function_name, event_id)
VALUES ('ai-proxy', 'cccccccc-3333-4333-8333-333333333333')
ON CONFLICT (event_id) DO NOTHING;
INSERT INTO public.ai_usage_logs (function_name, event_id)
VALUES ('ai-proxy', 'cccccccc-3333-4333-8333-333333333333')
ON CONFLICT (event_id) DO NOTHING;
SELECT 'upsert_absorve_reentrega=' || CASE WHEN
  (SELECT count(*) FROM public.ai_usage_logs
    WHERE event_id='cccccccc-3333-4333-8333-333333333333') = 1
THEN 'ok' ELSE 'fail' END;

-- 4. return=representation: insere devolve a linha; reentrega devolve VAZIO
--    (cada statement tem seu proprio snapshot: o 2o enxerga a linha do 1o)
CREATE TEMP TABLE entrega AS SELECT NULL::uuid AS id WHERE false;
WITH i AS (
  INSERT INTO public.ai_usage_logs (function_name, event_id)
  VALUES ('ai-proxy', 'dddddddd-4444-4444-8444-444444444444')
  ON CONFLICT (event_id) DO NOTHING RETURNING id
) INSERT INTO entrega SELECT id FROM i;
WITH i AS (
  INSERT INTO public.ai_usage_logs (function_name, event_id)
  VALUES ('ai-proxy', 'dddddddd-4444-4444-8444-444444444444')
  ON CONFLICT (event_id) DO NOTHING RETURNING id
) INSERT INTO entrega SELECT id FROM i;
SELECT 'return_representation=' || CASE WHEN
  (SELECT count(*) FROM entrega) = 1
  AND (SELECT count(*) FROM public.ai_usage_logs
        WHERE event_id='dddddddd-4444-4444-8444-444444444444') = 1
THEN 'ok' ELSE 'fail' END;

-- 5. a outbox absorve o mesmo event_id repetido: uma linha pendente por evento
INSERT INTO public.ai_usage_outbox (event_id, payload, motivo)
VALUES ('eeeeeeee-5555-4555-8555-555555555555', '{"linha":{"event_id":"eeeeeeee-5555-4555-8555-555555555555"}}'::jsonb, 'insert_exaurido')
ON CONFLICT (event_id) DO NOTHING;
INSERT INTO public.ai_usage_outbox (event_id, payload, motivo)
VALUES ('eeeeeeee-5555-4555-8555-555555555555', '{"linha":{"event_id":"eeeeeeee-5555-4555-8555-555555555555"}}'::jsonb, 'insert_exaurido')
ON CONFLICT (event_id) DO NOTHING;
SELECT 'outbox_mesmo_evento_uma_linha=' || CASE WHEN
  (SELECT count(*) FROM public.ai_usage_outbox
    WHERE event_id='eeeeeeee-5555-4555-8555-555555555555') = 1
THEN 'ok' ELSE 'fail' END;

-- 6. o registro ENTREGUE que falha de novo volta a fila (PATCH por event_id + processed_at)
UPDATE public.ai_usage_outbox
   SET processed_at = now()
 WHERE event_id = 'eeeeeeee-5555-4555-8555-555555555555';
UPDATE public.ai_usage_outbox
   SET processed_at = NULL, tentativas = 0, motivo = 'pre_pos_insert:de_novo'
 WHERE event_id = 'eeeeeeee-5555-4555-8555-555555555555'
   AND processed_at IS NOT NULL;
SELECT 'outbox_entregue_volta_a_fila=' || CASE WHEN
  (SELECT processed_at IS NULL AND motivo = 'pre_pos_insert:de_novo'
     FROM public.ai_usage_outbox
    WHERE event_id='eeeeeeee-5555-4555-8555-555555555555')
THEN 'ok' ELSE 'fail' END;
SQL
)"

# ---- 7. CONCORRÊNCIA de verdade: duas sessões inserem o MESMO evento em paralelo ----
concurrente_event="ffffffff-6666-4666-8666-666666666666"
for _ in 1 2; do
  docker exec "$container_name" psql -X -U postgres -d postgres -q -c \
    "INSERT INTO public.ai_usage_logs (function_name, event_id)
     VALUES ('ai-proxy', '$concurrente_event')
     ON CONFLICT (event_id) DO NOTHING;" &
done
wait
concorrencia="$(psql_test -At -c "SELECT count(*) FROM public.ai_usage_logs WHERE event_id='$concurrente_event'")"
output+=$'\n'"upserts_concorrentes_mesmo_evento=$([ "$concorrencia" = "1" ] && echo ok || echo fail)"

for proof in event_id_column=ok logs_event_id_unique=ok outbox_unique=ok outbox_acl_endurecida=ok \
  conteudo_identico_nao_colapsa=ok upsert_absorve_reentrega=ok return_representation=ok \
  outbox_mesmo_evento_uma_linha=ok outbox_entregue_volta_a_fila=ok \
  upserts_concorrentes_mesmo_evento=ok; do
  grep -Fx "$proof" <<<"$output" >/dev/null || { echo "Missing proof: $proof" >&2; echo "$output" >&2; exit 1; }
done

echo "$output"
echo "IA-TIMEOUT-001 ai_usage_logs/outbox PostgreSQL 17 behavioral contract: PASS"
