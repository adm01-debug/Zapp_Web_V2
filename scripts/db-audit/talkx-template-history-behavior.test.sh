#!/usr/bin/env bash
set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
postgres_image="${TALKX_HISTORY_TEST_POSTGRES_IMAGE:-postgres:17-alpine}"
precreate_runtime="${TALKX_HISTORY_PRECREATE_RUNTIME:-true}"
invalid_prestate="${TALKX_HISTORY_INVALID_PRESTATE:-false}"
container_name="zapp-talkx-history-$RANDOM-$$"
test_password="talkx_history_test_only"
concurrency_dir=""

cleanup() {
  if [[ "$container_name" =~ ^zapp-talkx-history-[0-9]+-[0-9]+$ ]]; then
    docker rm -f "$container_name" >/dev/null 2>&1 || true
  fi
  if [[ "$concurrency_dir" == /tmp/zapp-talkx-history.* ]]; then
    rm -rf -- "$concurrency_dir"
  fi
}
trap cleanup EXIT INT TERM

fail() { printf '[FAIL] %s\n' "$1" >&2; exit 1; }
psql_test() { docker exec -i "$container_name" psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres "$@"; }

command -v docker >/dev/null 2>&1 || fail 'Docker nao esta instalado'
docker info >/dev/null 2>&1 || fail 'Docker daemon nao esta acessivel'
docker run --rm -d --name "$container_name" -e POSTGRES_PASSWORD="$test_password" "$postgres_image" >/dev/null
[[ "$precreate_runtime" == true || "$precreate_runtime" == false ]] \
  || fail 'TALKX_HISTORY_PRECREATE_RUNTIME deve ser true ou false'
[[ "$invalid_prestate" == true || "$invalid_prestate" == false ]] \
  || fail 'TALKX_HISTORY_INVALID_PRESTATE deve ser true ou false'
if [[ "$invalid_prestate" == true && "$precreate_runtime" != true ]]; then
  fail 'TALKX_HISTORY_INVALID_PRESTATE exige TALKX_HISTORY_PRECREATE_RUNTIME=true'
fi

ready=false
for _ in $(seq 1 90); do
  ready_markers="$(docker logs "$container_name" 2>&1 | grep -c 'database system is ready to accept connections' || true)"
  if [ "$ready_markers" -ge 2 ] \
    && docker exec "$container_name" psql -X -U postgres -d postgres -Atqc 'SELECT 1' >/dev/null 2>&1; then
    ready=true
    break
  fi
  sleep 1
done
[ "$ready" = true ] || fail "PostgreSQL descartavel ($postgres_image) nao ficou pronto"

psql_test -v precreate_runtime="$precreate_runtime" -v invalid_prestate="$invalid_prestate" >/dev/null <<'SQL'
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;
CREATE SCHEMA auth;
GRANT USAGE ON SCHEMA public, auth TO anon, authenticated, service_role;

CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('request.jwt.claim.role', true), '')
$$;
GRANT EXECUTE ON FUNCTION auth.uid(), auth.role() TO PUBLIC;

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL UNIQUE,
  role text NOT NULL,
  is_active boolean NOT NULL DEFAULT true
);
CREATE TABLE public.talkx_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  category text NOT NULL DEFAULT 'geral',
  content text NOT NULL,
  media_url text,
  media_type text,
  tags text[] NOT NULL DEFAULT '{}'::text[],
  status text NOT NULL DEFAULT 'approved',
  use_count integer NOT NULL DEFAULT 0,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE FUNCTION public.update_updated_at_column() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := transaction_timestamp();
  RETURN NEW;
END;
$$;
CREATE TRIGGER update_talkx_templates_updated_at
BEFORE UPDATE ON public.talkx_templates
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE FUNCTION public.get_profile_id_for_user(p_user_id uuid) RETURNS uuid
LANGUAGE sql SECURITY DEFINER STABLE SET search_path=public,pg_temp AS $$
  SELECT id FROM public.profiles WHERE user_id=p_user_id AND is_active=true LIMIT 1
$$;
CREATE FUNCTION public.is_admin_or_supervisor(p_user_id uuid) RETURNS boolean
LANGUAGE sql SECURITY DEFINER STABLE SET search_path=public,pg_temp AS $$
  SELECT EXISTS(
    SELECT 1 FROM public.profiles
    WHERE user_id=p_user_id AND is_active=true AND role IN ('admin','supervisor')
  )
$$;

ALTER TABLE public.talkx_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY talkx_templates_select ON public.talkx_templates
  FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);
CREATE POLICY talkx_templates_update ON public.talkx_templates
  FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY talkx_templates_delete ON public.talkx_templates
  FOR DELETE TO authenticated USING (
    created_by = public.get_profile_id_for_user(auth.uid())
    OR public.is_admin_or_supervisor(auth.uid())
  );
GRANT SELECT, INSERT, UPDATE, DELETE ON public.talkx_templates TO authenticated;
GRANT ALL ON public.profiles, public.talkx_templates TO service_role;

INSERT INTO public.profiles(id,user_id,role) VALUES
  ('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','agent'),
  ('10000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000002','agent'),
  ('10000000-0000-0000-0000-000000000003','20000000-0000-0000-0000-000000000003','admin');
INSERT INTO public.talkx_templates(
  id,name,description,category,content,media_url,media_type,tags,status,created_by,
  created_at,updated_at
) VALUES (
  '30000000-0000-0000-0000-000000000001','Original','old description','sales',
  'Old content',NULL,NULL,ARRAY['old'],'approved',
  '10000000-0000-0000-0000-000000000001','2026-09-09T10:00:00Z','2026-09-09T10:00:00Z'
);

-- Estado observado no runtime antes da canonizacao: DDL sem migration,
-- default grants amplos e somente policy de leitura.
\if :precreate_runtime
ALTER TABLE public.talkx_templates
  ADD COLUMN custom_variables text[] NOT NULL DEFAULT '{}'::text[];
CREATE TABLE public.talkx_template_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES public.talkx_templates(id) ON DELETE CASCADE,
  version_number integer NOT NULL,
  name text NOT NULL,
  description text,
  content text NOT NULL,
  category text NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  media_url text,
  media_type text,
  tags text[] NOT NULL DEFAULT '{}'::text[],
  custom_variables text[] NOT NULL DEFAULT '{}'::text[],
  saved_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(template_id, version_number)
);
CREATE INDEX talkx_template_versions_template_id_idx
  ON public.talkx_template_versions(template_id);
ALTER TABLE public.talkx_template_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY talkx_template_versions_select ON public.talkx_template_versions
  FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY talkx_template_versions_insert ON public.talkx_template_versions
  FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
GRANT ALL ON public.talkx_template_versions TO anon, authenticated, service_role;
\endif

\if :invalid_prestate
ALTER TABLE public.talkx_template_versions
  ALTER COLUMN template_id DROP NOT NULL;
INSERT INTO public.talkx_template_versions(
  template_id, version_number, name, description, content, category, status
) VALUES (NULL, 99, 'Orphan', NULL, 'Unsafe', 'sales', 'draft');
\endif
SQL

if [[ "$invalid_prestate" == true ]]; then
  set +e
  invalid_output="$(psql_test < "$repo_root/supabase/migrations/20260909210000_canonicalize_talkx_template_history.sql" 2>&1)"
  invalid_status=$?
  set -e
  [ "$invalid_status" -ne 0 ] || fail 'pre-estado irrecuperavel deveria abortar a migration'
  grep -q 'talkx_template_history_irreconcilable_nulls' <<<"$invalid_output" \
    || fail 'migration nao retornou diagnostico explicito para historico irrecuperavel'
  printf '[OK] Talk X template history: pre-estado irrecuperavel abortado explicitamente, sem fabricar auditoria.\n'
  exit 0
fi

psql_test < "$repo_root/supabase/migrations/20260909210000_canonicalize_talkx_template_history.sql" >/dev/null

structure="$(psql_test -At <<'SQL'
SELECT concat_ws('|',
  current_setting('server_version_num')::integer / 10000,
  (SELECT count(*) FROM pg_policies WHERE schemaname='public'
    AND tablename='talkx_template_versions'
    AND policyname='talkx_template_versions_select'),
  has_table_privilege('authenticated','public.talkx_template_versions','SELECT'),
  has_table_privilege('authenticated','public.talkx_template_versions','INSERT'),
  has_table_privilege('authenticated','public.talkx_template_versions','UPDATE'),
  has_table_privilege('authenticated','public.talkx_template_versions','DELETE'),
  has_table_privilege('anon','public.talkx_template_versions','SELECT'),
  has_function_privilege('authenticated',
    'public.update_talkx_template_with_snapshot(uuid,timestamptz,text,text,text,text,text,text,text[],text,text[])','EXECUTE'),
  has_function_privilege('anon',
    'public.update_talkx_template_with_snapshot(uuid,timestamptz,text,text,text,text,text,text,text[],text,text[])','EXECUTE'),
  (SELECT relrowsecurity FROM pg_class WHERE oid='public.talkx_template_versions'::regclass),
  (SELECT count(*) FROM pg_trigger WHERE tgrelid='public.talkx_template_versions'::regclass
    AND tgname='trg_guard_talkx_template_version_immutable' AND NOT tgisinternal)
);
SQL
)"
[ "$structure" = '17|1|t|f|f|f|f|t|f|t|1' ] || fail "contrato estrutural/ACL inesperado: $structure"

owner_result="$(psql_test -At <<'SQL'
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.role','authenticated',true);
SELECT set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000001',true);
SELECT pg_sleep(0.02);
CREATE TEMP TABLE rpc_result ON COMMIT PRESERVE ROWS AS
SELECT * FROM public.update_talkx_template_with_snapshot(
  '30000000-0000-0000-0000-000000000001','2026-09-09T10:00:00Z',
  'Updated','new description','sales','New content','https://example.test/media.png',
  'image',ARRAY['new'],'review',ARRAY['customer_name']
);
COMMIT;
SELECT 'RPC|' || template_id || '|' || updated_at || '|' || version_number
FROM rpc_result;
SELECT name || '|' || COALESCE(description, '') || '|' || content || '|' || version_number || '|' || saved_by
FROM public.talkx_template_versions;
SELECT name || '|' || content || '|' || status || '|' || custom_variables[1]
FROM public.talkx_templates WHERE id='30000000-0000-0000-0000-000000000001';
SELECT 'TABLE|' || updated_at
FROM public.talkx_templates WHERE id='30000000-0000-0000-0000-000000000001';
SQL
)"
grep -q 'RPC|30000000-0000-0000-0000-000000000001|.*|1' <<<"$owner_result" \
  || fail 'RPC do owner nao retornou versao 1'
grep -q 'Original|old description|Old content|1|10000000-0000-0000-0000-000000000001' <<<"$owner_result" \
  || fail 'snapshot nao preservou o estado anterior/autoria canonica'
grep -q 'Updated|New content|review|customer_name' <<<"$owner_result" \
  || fail 'update atomico nao persistiu o novo estado'
rpc_timestamp="$(sed -n 's/^RPC|[^|]*|\([^|]*\)|1$/\1/p' <<<"$owner_result")"
table_timestamp="$(sed -n 's/^TABLE|//p' <<<"$owner_result")"
[ -n "$rpc_timestamp" ] && [ "$rpc_timestamp" = "$table_timestamp" ] \
  || fail 'RPC nao retornou o updated_at efetivamente persistido pelo trigger'

expect_failure() {
  local expected="$1"
  local sql="$2"
  local output
  set +e
  output="$(printf '%s\n' "$sql" | psql_test 2>&1)"
  local status=$?
  set -e
  [ "$status" -ne 0 ] || fail "cenario deveria falhar: $expected"
  grep -q "$expected" <<<"$output" || fail "erro esperado ausente: $expected"
}

auth_prefix="BEGIN; SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claim.role','authenticated',true);"
expect_failure 'talkx_template_not_authorized' "$auth_prefix SELECT set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000002',true); SELECT * FROM public.update_talkx_template_with_snapshot('30000000-0000-0000-0000-000000000001',(SELECT updated_at FROM public.talkx_templates WHERE id='30000000-0000-0000-0000-000000000001'),'Hijack',NULL,'sales','X',NULL,NULL,'{}','draft','{}'); COMMIT;"
expect_failure 'talkx_template_stale_version' "$auth_prefix SELECT set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000001',true); SELECT * FROM public.update_talkx_template_with_snapshot('30000000-0000-0000-0000-000000000001','2026-09-09T10:00:00Z','Stale',NULL,'sales','X',NULL,NULL,'{}','draft','{}'); COMMIT;"
expect_failure 'invalid_talkx_template' "$auth_prefix SELECT set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000001',true); SELECT * FROM public.update_talkx_template_with_snapshot('30000000-0000-0000-0000-000000000001',(SELECT updated_at FROM public.talkx_templates WHERE id='30000000-0000-0000-0000-000000000001'),'Bad URL',NULL,'sales','X','http://127.0.0.1/private','image','{}','draft','{}'); COMMIT;"
expect_failure 'invalid_talkx_template' "$auth_prefix SELECT set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000001',true); SELECT * FROM public.update_talkx_template_with_snapshot('30000000-0000-0000-0000-000000000001',(SELECT updated_at FROM public.talkx_templates WHERE id='30000000-0000-0000-0000-000000000001'),'Null status',NULL,'sales','X',NULL,NULL,'{}',NULL,'{}'); COMMIT;"
expect_failure 'talkx_template_update_requires_authorized_rpc' "$auth_prefix SELECT set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000001',true); UPDATE public.talkx_templates SET name='Direct bypass' WHERE id='30000000-0000-0000-0000-000000000001'; COMMIT;"
expect_failure 'permission denied' "$auth_prefix SELECT set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000001',true); INSERT INTO public.talkx_template_versions(template_id,version_number,name,content,category) VALUES ('30000000-0000-0000-0000-000000000001',99,'Forged','Forged','sales'); COMMIT;"

# Simula uma funcao SECURITY DEFINER irma, com o mesmo owner da RPC canonica,
# tentando criar um snapshot valido e aproveitar o mesmo statement para alterar
# ownership. O guard da tabela deve limitar a autorizacao aos campos expostos
# pela RPC, em vez de confiar apenas no owner/call context.
psql_test >/dev/null <<'SQL'
CREATE FUNCTION public.simulate_sibling_definer_bypass(p_template_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_template public.talkx_templates%ROWTYPE;
BEGIN
  SELECT * INTO v_template
  FROM public.talkx_templates
  WHERE id = p_template_id;

  INSERT INTO public.talkx_template_versions (
    template_id, version_number, name, description, content, category, status,
    media_url, media_type, tags, custom_variables, saved_by, created_at
  ) VALUES (
    v_template.id,
    (SELECT COALESCE(max(version_number), 0) + 1
       FROM public.talkx_template_versions WHERE template_id = p_template_id),
    v_template.name, v_template.description, v_template.content,
    v_template.category, v_template.status, v_template.media_url,
    v_template.media_type, v_template.tags, v_template.custom_variables,
    public.get_profile_id_for_user(auth.uid()), statement_timestamp()
  );

  UPDATE public.talkx_templates
  SET created_by = '10000000-0000-0000-0000-000000000002'
  WHERE id = p_template_id;
END;
$function$;
GRANT EXECUTE ON FUNCTION public.simulate_sibling_definer_bypass(uuid)
  TO authenticated;
SQL
expect_failure 'talkx_template_update_requires_authorized_rpc' "$auth_prefix SELECT set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000001',true); SELECT public.simulate_sibling_definer_bypass('30000000-0000-0000-0000-000000000001'); COMMIT;"
psql_test >/dev/null <<'SQL'
DROP FUNCTION public.simulate_sibling_definer_bypass(uuid);
SQL

counter_result="$(psql_test -At <<'SQL'
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.role','authenticated',true);
SELECT set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000001',true);
SELECT public.increment_talkx_template_use('30000000-0000-0000-0000-000000000001');
COMMIT;
SELECT use_count FROM public.talkx_templates
WHERE id='30000000-0000-0000-0000-000000000001';
SQL
)"
[ "$(grep -c '^1$' <<<"$counter_result")" -eq 2 ] \
  || { printf '%s\n' "$counter_result" >&2; fail 'contador atomico nao incrementou exatamente uma vez'; }

# Mesmo com grant + policy permissivos reintroduzidos, o trigger invoker bloqueia
# o JWT. set_config em namespace customizado nao altera current_user.
psql_test >/dev/null <<'SQL'
GRANT INSERT ON public.talkx_template_versions TO authenticated;
CREATE POLICY temporary_permissive_insert ON public.talkx_template_versions
  FOR INSERT TO authenticated WITH CHECK (true);
SQL
expect_failure 'talkx_template_history_requires_authorized_rpc' "$auth_prefix SELECT set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000001',true); SELECT set_config('app.zapp_authorized_history','true',true); INSERT INTO public.talkx_template_versions(template_id,version_number,name,content,category) VALUES ('30000000-0000-0000-0000-000000000001',99,'Forged','Forged','sales'); COMMIT;"
psql_test >/dev/null <<'SQL'
DROP POLICY temporary_permissive_insert ON public.talkx_template_versions;
REVOKE INSERT ON public.talkx_template_versions FROM authenticated;
SQL

# Dois writers com o mesmo expected_updated_at: exatamente um vence; o outro
# observa a nova versao e falha por optimistic concurrency.
expected_at="$(psql_test -Atqc "SELECT updated_at FROM public.talkx_templates WHERE id='30000000-0000-0000-0000-000000000001'")"
concurrency_dir="$(mktemp -d /tmp/zapp-talkx-history.XXXXXX)"
concurrent_call() {
  local name="$1"
  printf '%s\n' "$auth_prefix SELECT set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000001',true); SELECT version_number FROM public.update_talkx_template_with_snapshot('30000000-0000-0000-0000-000000000001','$expected_at','$name',NULL,'sales','$name',NULL,NULL,'{}','draft','{}'); COMMIT;" \
    | psql_test >"$concurrency_dir/$name.out" 2>"$concurrency_dir/$name.err"
}

set +e
concurrent_call 'WriterA' & pid_a=$!
concurrent_call 'WriterB' & pid_b=$!
wait "$pid_a"; status_a=$?
wait "$pid_b"; status_b=$?
set -e

if ! { [ "$status_a" -eq 0 ] && [ "$status_b" -ne 0 ]; } \
  && ! { [ "$status_b" -eq 0 ] && [ "$status_a" -ne 0 ]; }; then
  fail "concorrencia deveria produzir um sucesso e uma falha: A=$status_a B=$status_b"
fi
grep -q 'talkx_template_stale_version' "$concurrency_dir"/*.err \
  || fail 'writer perdedor nao falhou por versao obsoleta'

final_state="$(psql_test -Atqc "SELECT count(*) || '|' || max(version_number) || '|' || (SELECT count(*) FROM public.talkx_templates WHERE name IN ('WriterA','WriterB')) FROM public.talkx_template_versions WHERE template_id='30000000-0000-0000-0000-000000000001'")"
[ "$final_state" = '2|2|1' ] || fail "invariante final de concorrencia inesperada: $final_state"

# A imutabilidade do historico nao pode impedir o ON DELETE CASCADE autorizado
# da tabela pai. Um template secundario recebe snapshot e depois e excluido pelo
# owner; template e versao devem desaparecer atomicamente.
cascade_result="$(psql_test -At <<'SQL'
INSERT INTO public.talkx_templates(
  id,name,description,category,content,status,created_by,created_at,updated_at
) VALUES (
  '30000000-0000-0000-0000-000000000002','Cascade','before','sales','Before',
  'approved','10000000-0000-0000-0000-000000000001',
  '2026-09-09T11:00:00Z','2026-09-09T11:00:00Z'
);
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.role','authenticated',true);
SELECT set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000001',true);
SELECT version_number FROM public.update_talkx_template_with_snapshot(
  '30000000-0000-0000-0000-000000000002','2026-09-09T11:00:00Z',
  'Cascade updated','after','sales','After',NULL,NULL,'{}','approved','{}'
);
DELETE FROM public.talkx_templates
WHERE id='30000000-0000-0000-0000-000000000002';
COMMIT;
SELECT
  (SELECT count(*) FROM public.talkx_templates WHERE id='30000000-0000-0000-0000-000000000002')
  || '|' ||
  (SELECT count(*) FROM public.talkx_template_versions WHERE template_id='30000000-0000-0000-0000-000000000002');
SQL
)"
grep -q '^0|0$' <<<"$cascade_result" \
  || { printf '%s\n' "$cascade_result" >&2; fail 'exclusao do template nao propagou o cascade do historico'; }

runtime_proof="$(psql_test -At < "$repo_root/scripts/db-audit/talkx-template-history-runtime.sql")"
RUNTIME_PROOF="$runtime_proof" node --input-type=module <<'NODE'
const proof = JSON.parse(process.env.RUNTIME_PROOF);
const ok = proof.server_major === 17
  && proof.database === 'postgres'
  && proof.table_count === 1
  && proof.custom_variables_column_count === 1
  && proof.history_description_column_count === 1
  && proof.rls_enabled === true
  && proof.policy_count === 1
  && proof.canonical_select_policy_count === 1
  && proof.constraint_count === 3
  && proof.validated_constraint_count === 3
  && proof.foundation_constraint_count === 4
  && proof.function_count === 4
  && proof.safe_function_count === 4
  && proof.immutable_trigger_count === 1
  && proof.template_update_guard_count === 1
  && proof.anon_any_access === false
  && proof.authenticated_select === true
  && proof.authenticated_any_mutation === false
  && proof.authenticated_rpc_execute === true
  && proof.anon_rpc_execute === false
  && proof.authenticated_counter_execute === true
  && proof.anon_counter_execute === false
  && proof.authenticated_guard_execute === false
  && proof.authenticated_update_guard_execute === false
  && proof.definition_sha256 === 'fe8ee233b88420087f7fe0ddfa5edb4784a57af2df1188040f2acba9f77cc337'
  && /^[a-f0-9]{64}$/.test(proof.runtime_sha256 ?? '');
if (!ok) {
  console.error(`runtime proof inesperado: definition_sha256=${proof.definition_sha256}`);
  process.exit(1);
}
NODE

printf '[OK] Talk X template history: ACL, RLS, autoria, atomicidade, imutabilidade e concorrencia validadas no PostgreSQL 17.\n'
