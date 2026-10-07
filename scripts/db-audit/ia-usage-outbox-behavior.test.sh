#!/usr/bin/env bash
# Contrato de COMPORTAMENTO da IA-TIMEOUT-001 (item 44) em PostgreSQL de verdade.
#
# Por que este teste existe: os testes Deno de `ai-usage.test.ts` provam o
# caminho do CLIENTE contra um banco falso. Eles não exercitam a migration nem
# a restrição UNIQUE real — foi exatamente esse furo que a revisão apontou. Aqui
# as migrations de verdade são aplicadas num PostgreSQL descartável (nunca
# produção) e as garantias são provadas no BANCO, com papéis reais:
#
#   * defeito pré-ACL: `authenticated` e `anon` leem/gravam a fila interna;
#   * pós-ACL: só `service_role` (com exatamente SELECT/INSERT/UPDATE/DELETE)
#     opera a outbox; anon/authenticated/PUBLIC recebem permission denied;
#   * rollback REAL: o SQL da linha `-- Rollback:` do próprio arquivo de ACL é
#     executado e o estado volta ao medido (service_role=ALL, demais fechados);
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
CREATE ROLE public_probe NOLOGIN;
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

# ---- estado anterior fiel: o default privileges MEDIDO no banco local da ----
# tarefa ({postgres=ALL, authenticated=ALL, service_role=ALL} em tabela nova de
# public; anon nao recebe nada por default). Sem isto, o revoke da migration de
# ACL nao teria privilegio a remover e o teste nao provaria o defeito.
psql_test -q -c "ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT ALL ON TABLES TO authenticated, service_role;"

# ---- a migration do cartao pai e aplicada (mesmo arquivo do diff) -------------
psql_test >/dev/null < "$migration"

# Prova que o estado anterior reproduzido bate com o MEDIDO no banco local da
# tarefa: {postgres=ALL(dono), authenticated=ALL, service_role=ALL}, anon e
# PUBLIC sem privilegio, RLS desligada e zero policies — privilegio a
# privilegio via has_table_privilege, sem depender de deparse de relacl.
estado_anterior="$(psql_test -At <<'SQL'
SELECT 'estado_anterior_medido=' || CASE WHEN
  (SELECT count(*) FROM (VALUES ('SELECT'),('INSERT'),('UPDATE'),('DELETE'),
    ('TRUNCATE'),('REFERENCES'),('TRIGGER'),('MAINTAIN')) AS p(priv)
   WHERE has_table_privilege('authenticated','public.ai_usage_outbox',p.priv)) = 8
  AND (SELECT count(*) FROM (VALUES ('SELECT'),('INSERT'),('UPDATE'),('DELETE'),
    ('TRUNCATE'),('REFERENCES'),('TRIGGER'),('MAINTAIN')) AS p(priv)
   WHERE has_table_privilege('service_role','public.ai_usage_outbox',p.priv)) = 8
  AND NOT EXISTS (SELECT 1 FROM (VALUES ('anon'),('public_probe')) AS r(rol)
    CROSS JOIN (VALUES ('SELECT'),('INSERT'),('UPDATE'),('DELETE'),
      ('TRUNCATE'),('REFERENCES'),('TRIGGER'),('MAINTAIN')) AS p(priv)
    WHERE has_table_privilege(r.rol,'public.ai_usage_outbox',p.priv))
  AND NOT (SELECT relrowsecurity FROM pg_class
           WHERE oid = 'public.ai_usage_outbox'::regclass)
  AND NOT EXISTS (SELECT 1 FROM pg_policies
                  WHERE schemaname='public' AND tablename='ai_usage_outbox')
THEN 'ok' ELSE 'fail' END;
SQL
)"
grep -Fx 'estado_anterior_medido=ok' <<<"$estado_anterior" >/dev/null || {
  echo "Estado anterior nao reproduz o medido no banco local:" >&2
  echo "$estado_anterior" >&2
  exit 1
}

# Pior caso de proposito: prova que o REVOKE da migration de ACL alcanca
# qualquer papel, e nao so o que o default privileges concedeu.
psql_test -q -c "GRANT ALL ON public.ai_usage_outbox TO anon;"

# ---- BLOCO A: o DEFEITO existe ANTES da migration de ACL, com papel real ------
# RLS esta desligada nesse ponto; quem tem GRANT de tabela entra. Se estes
# statements nao rodarem, nao ha vermelho que a migration de ACL vire verde.
pre_acl_proof="$(psql_test -qAt <<'SQL'
SET ROLE authenticated;
SELECT 'pre_acl_authenticated_select=' || CASE WHEN count(*) >= 0 THEN 'ok' ELSE 'fail' END
  FROM public.ai_usage_outbox;
WITH i AS (
  INSERT INTO public.ai_usage_outbox (payload, motivo)
  VALUES ('{}'::jsonb, 'pre_acl_authenticated') RETURNING 1
) SELECT 'pre_acl_authenticated_insert=' || CASE WHEN count(*) = 1 THEN 'ok' ELSE 'fail' END FROM i;
WITH u AS (
  UPDATE public.ai_usage_outbox SET tentativas = tentativas + 1
   WHERE motivo = 'pre_acl_authenticated' RETURNING 1
) SELECT 'pre_acl_authenticated_update=' || CASE WHEN count(*) = 1 THEN 'ok' ELSE 'fail' END FROM u;
RESET ROLE;
SET ROLE anon;
SELECT 'pre_acl_anon_select=' || CASE WHEN count(*) >= 0 THEN 'ok' ELSE 'fail' END
  FROM public.ai_usage_outbox;
WITH i AS (
  INSERT INTO public.ai_usage_outbox (payload, motivo)
  VALUES ('{}'::jsonb, 'pre_acl_anon') RETURNING 1
) SELECT 'pre_acl_anon_insert=' || CASE WHEN count(*) = 1 THEN 'ok' ELSE 'fail' END FROM i;
WITH u AS (
  UPDATE public.ai_usage_outbox SET tentativas = tentativas + 1
   WHERE motivo = 'pre_acl_anon' RETURNING 1
) SELECT 'pre_acl_anon_update=' || CASE WHEN count(*) = 1 THEN 'ok' ELSE 'fail' END FROM u;
RESET ROLE;
SQL
)"

for proof in pre_acl_authenticated_select=ok pre_acl_authenticated_insert=ok \
  pre_acl_authenticated_update=ok pre_acl_anon_select=ok pre_acl_anon_insert=ok \
  pre_acl_anon_update=ok; do
  grep -Fx "$proof" <<<"$pre_acl_proof" >/dev/null || {
    echo "Defeito pre-ACL nao provado (faltou: $proof)" >&2
    echo "$pre_acl_proof" >&2
    exit 1
  }
done

# ---- a migration de ACL de verdade e aplicada (mesmo arquivo do diff) --------
psql_test >/dev/null < "$acl_migration"

# ---- BLOCO B: depois da ACL ---------------------------------------------------
# O caminho autorizado precisa funcionar sob o papel real, não como postgres
# (dono/superusuário contorna RLS e esconderia uma policy quebrada).
service_role_proof="$(psql_test -qAt <<'SQL'
SET ROLE service_role;
WITH inserted AS (
  INSERT INTO public.ai_usage_outbox (event_id, payload, motivo)
  VALUES (
    '99999999-7777-4777-8777-777777777777',
    '{"linha":{"event_id":"99999999-7777-4777-8777-777777777777"}}'::jsonb,
    'prova_service_role'
  )
  RETURNING 1
)
SELECT 'service_role_insert=' || CASE WHEN count(*) = 1 THEN 'ok' ELSE 'fail' END FROM inserted;
SELECT 'service_role_select=' || CASE WHEN count(*) = 1 THEN 'ok' ELSE 'fail' END
  FROM public.ai_usage_outbox
 WHERE event_id = '99999999-7777-4777-8777-777777777777';
WITH updated AS (
  UPDATE public.ai_usage_outbox
     SET tentativas = tentativas + 1
   WHERE event_id = '99999999-7777-4777-8777-777777777777'
  RETURNING 1
)
SELECT 'service_role_update=' || CASE WHEN count(*) = 1 THEN 'ok' ELSE 'fail' END FROM updated;
RESET ROLE;
SQL
)"

for proof in service_role_insert=ok service_role_select=ok service_role_update=ok; do
  grep -Fx "$proof" <<<"$service_role_proof" >/dev/null || {
    echo "Missing proof: $proof" >&2
    echo "$service_role_proof" >&2
    exit 1
  }
done

# PUBLIC é um pseudo-papel e não aceita SET ROLE. public_probe não recebe
# nenhum GRANT próprio, portanto exercita exclusivamente o que PUBLIC herdaria.
access_proof=""
expect_permission_denied() {
  local role="$1" action="$2" sql="$3" error
  if error="$(psql_test -qAt -c "SET ROLE $role; $sql" 2>&1)"; then
    echo "$role conseguiu $action em public.ai_usage_outbox" >&2
    exit 1
  fi
  grep -Fq 'permission denied for table ai_usage_outbox' <<<"$error" || {
    echo "$role falhou em $action por motivo inesperado: $error" >&2
    exit 1
  }
  access_proof+="${role}_${action}_denied=ok"$'\n'
}

for denied_role in public_probe anon authenticated; do
  expect_permission_denied "$denied_role" select \
    "SELECT count(*) FROM public.ai_usage_outbox;"
  expect_permission_denied "$denied_role" insert \
    "INSERT INTO public.ai_usage_outbox (payload, motivo) VALUES ('{}'::jsonb, 'deve_falhar');"
  expect_permission_denied "$denied_role" update \
    "UPDATE public.ai_usage_outbox SET tentativas = tentativas + 1;"
done

# Estado do banco: RLS ligada e policy do service_role existem (estado de
# catalogo, nao texto de pg_policies.qual) e nao resta grant direto a PUBLIC.
acl_state="$(psql_test -At <<'SQL'
SELECT 'outbox_rls_ligada=' || CASE WHEN
  (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.ai_usage_outbox'::regclass)
THEN 'ok' ELSE 'fail' END;
SELECT 'outbox_policy_service_role=' || CASE WHEN
  EXISTS (SELECT 1 FROM pg_policies
          WHERE schemaname = 'public' AND tablename = 'ai_usage_outbox'
            AND policyname = 'Service role can manage AI usage outbox'
            AND 'service_role' = ANY(roles))
THEN 'ok' ELSE 'fail' END;
SELECT 'outbox_acl_sem_grant_public=' || CASE WHEN
  NOT EXISTS (
    SELECT 1
      FROM pg_class AS c
      CROSS JOIN LATERAL aclexplode(
        COALESCE(c.relacl, acldefault('r', c.relowner))
      ) AS acl
     WHERE c.oid = 'public.ai_usage_outbox'::regclass
       AND acl.grantee = 0
  )
THEN 'ok' ELSE 'fail' END;
SQL
)"

# Matriz de privilegios por papel: has_table_privilege chamado privilegio a
# privilegio (sem depender de semantica de lista), para cada papel do contrato.
priv_matrix() {
  psql_test -At <<'SQL'
SELECT r.rol || '_' || lower(p.priv) || '=' ||
       CASE WHEN has_table_privilege(r.rol, 'public.ai_usage_outbox', p.priv)
            THEN 't' ELSE 'f' END
  FROM (VALUES ('anon'), ('authenticated'), ('public_probe'), ('service_role')) AS r(rol)
  CROSS JOIN (VALUES ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'),
                     ('TRUNCATE'), ('REFERENCES'), ('TRIGGER'), ('MAINTAIN')) AS p(priv)
  ORDER BY r.rol, p.priv;
SQL
}

# expect_privs <matrix> <papel> "<privilegios esperados=t, separados por espaco>"
expect_privs() {
  local matrix="$1" role="$2" allow="$3" priv expect
  for priv in select insert update delete truncate references trigger maintain; do
    expect=f
    case " $allow " in *" $priv "*) expect=t ;; esac
    grep -Fxq "${role}_${priv}=${expect}" <<<"$matrix" || {
      echo "privilegio inesperado: ${role}_${priv} deveria ser ${expect}" >&2
      echo "$matrix" >&2
      exit 1
    }
  done
}

acl_matrix="$(priv_matrix)"
expect_privs "$acl_matrix" anon ""
expect_privs "$acl_matrix" authenticated ""
expect_privs "$acl_matrix" public_probe ""
expect_privs "$acl_matrix" service_role "select insert update delete"
acl_matrix_proof="acl_matrix_fechada=ok"$'\n'"service_role_acl_exata=ok"

# ---- BLOCO C: ROLLBACK DE VERDADE ---------------------------------------------
# O SQL de rollback e EXTRAIDO da linha `-- Rollback:` do proprio arquivo da
# migration (se o arquivo mudar, o teste executa o texto novo — nunca uma copia
# a mao) e roda como postgres com ON_ERROR_STOP=1.
rollback_sql="$(grep -m1 '^-- Rollback:' "$acl_migration" | sed -e 's/^-- Rollback:[[:space:]]*//')"
if [ -z "$rollback_sql" ]; then
  echo "linha '-- Rollback:' nao encontrada em $acl_migration" >&2
  exit 1
fi
printf '%s\n' "$rollback_sql" | psql_test >/dev/null

# Depois do rollback: (1) policy sumiu e relrowsecurity=false; (2) o privilegio
# do service_role voltou ao estado anterior exato (ALL = os 8 privilegios de
# tabela verdadeiros); (3) anon, authenticated e public_probe continuam SEM
# nenhum privilegio — isso e ordem do cartao ("nao conceder privilegio a anon,
# authenticated ou public no estado final nem no rollback"): devolver-lhes o
# ALL do default privileges seria recriar o defeito que a migration corrige.
rollback_state="$(psql_test -At <<'SQL'
SELECT 'rollback_sem_policy=' || CASE WHEN
  NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.ai_usage_outbox'::regclass)
  AND NOT EXISTS (SELECT 1 FROM pg_policies
                  WHERE schemaname = 'public' AND tablename = 'ai_usage_outbox')
THEN 'ok' ELSE 'fail' END;
SQL
)"

rb_matrix="$(priv_matrix)"
expect_privs "$rb_matrix" service_role "select insert update delete truncate references trigger maintain"
expect_privs "$rb_matrix" anon ""
expect_privs "$rb_matrix" authenticated ""
expect_privs "$rb_matrix" public_probe ""
rollback_proof="${rollback_state}"$'\n'"rollback_service_role_restaurado=ok"
rollback_proof+=$'\n'"rollback_anon_authenticated_fechados=ok"

# Reaplica a migration de ACL: o estado final tem de voltar igual (RLS ligada,
# policy presente, service_role com os 4 privilegios, demais fechados) — isso
# prova idempotencia; em seguida o rollback roda DE NOVO sem erro.
psql_test >/dev/null < "$acl_migration"
reidem_state="$(psql_test -At <<'SQL'
SELECT 'reidempotencia=' || CASE WHEN
  (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.ai_usage_outbox'::regclass)
  AND EXISTS (SELECT 1 FROM pg_policies
              WHERE schemaname = 'public' AND tablename = 'ai_usage_outbox'
                AND policyname = 'Service role can manage AI usage outbox'
                AND 'service_role' = ANY(roles))
THEN 'ok' ELSE 'fail' END;
SQL
)"
reidem_matrix="$(priv_matrix)"
expect_privs "$reidem_matrix" service_role "select insert update delete"
expect_privs "$reidem_matrix" anon ""
expect_privs "$reidem_matrix" authenticated ""
expect_privs "$reidem_matrix" public_probe ""
printf '%s\n' "$rollback_sql" | psql_test >/dev/null
rollback_proof+=$'\n'"${reidem_state}"$'\n'"rollback_reexecutavel=ok"
# Deixa o banco no estado final endurecido para as provas de comportamento.
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
output+=$'\n'"$estado_anterior"
output+=$'\n'"$pre_acl_proof"
output+=$'\n'"$service_role_proof"
output+=$'\n'"${access_proof%$'\n'}"
output+=$'\n'"$acl_state"
output+=$'\n'"$acl_matrix_proof"
output+=$'\n'"$rollback_proof"

# ---- 7. CONCORRÊNCIA de verdade: duas sessões inserem o MESMO evento em paralelo ----
concorrencia_event="ffffffff-6666-4666-8666-666666666666"
for _ in 1 2; do
  docker exec "$container_name" psql -X -U postgres -d postgres -q -c \
    "INSERT INTO public.ai_usage_logs (function_name, event_id)
     VALUES ('ai-proxy', '$concorrencia_event')
     ON CONFLICT (event_id) DO NOTHING;" &
done
wait
concorrencia="$(psql_test -At -c "SELECT count(*) FROM public.ai_usage_logs WHERE event_id='$concorrencia_event'")"
output+=$'\n'"upserts_concorrentes_mesmo_evento=$([ "$concorrencia" = "1" ] && echo ok || echo fail)"

for proof in event_id_column=ok logs_event_id_unique=ok outbox_unique=ok \
  estado_anterior_medido=ok \
  pre_acl_authenticated_select=ok pre_acl_authenticated_insert=ok pre_acl_authenticated_update=ok \
  pre_acl_anon_select=ok pre_acl_anon_insert=ok pre_acl_anon_update=ok \
  service_role_insert=ok service_role_select=ok service_role_update=ok \
  public_probe_select_denied=ok public_probe_insert_denied=ok public_probe_update_denied=ok \
  anon_select_denied=ok anon_insert_denied=ok anon_update_denied=ok \
  authenticated_select_denied=ok authenticated_insert_denied=ok authenticated_update_denied=ok \
  outbox_rls_ligada=ok outbox_policy_service_role=ok outbox_acl_sem_grant_public=ok \
  acl_matrix_fechada=ok service_role_acl_exata=ok \
  rollback_sem_policy=ok rollback_service_role_restaurado=ok \
  rollback_anon_authenticated_fechados=ok reidempotencia=ok rollback_reexecutavel=ok \
  conteudo_identico_nao_colapsa=ok upsert_absorve_reentrega=ok return_representation=ok \
  outbox_mesmo_evento_uma_linha=ok outbox_entregue_volta_a_fila=ok \
  upserts_concorrentes_mesmo_evento=ok; do
  grep -Fx "$proof" <<<"$output" >/dev/null || { echo "Missing proof: $proof" >&2; echo "$output" >&2; exit 1; }
done

echo "$output"
echo "IA-TIMEOUT-001 ai_usage_outbox ACL PostgreSQL 17 behavioral contract: PASS"
