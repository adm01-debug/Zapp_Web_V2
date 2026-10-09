#!/usr/bin/env bash
# TC-005 / R2-AUTH-017 — item 56: "Gerenciamento de departamento esta inacessivel e contem
# contratos de banco invalidos" (docs/reconciliation/reports/team-chat/CODE_DATABASE_TRUTH_TEAM_CHAT.md:92).
# Parte de BANCO (plano F10, docs/audits/PLANO_TEAM_CHAT_FINALIZACAO_100_ETAPAS_2026-09-29.md:46).
#
# DEFEITO (contrato de banco): a unica LEITURA do WhatsApp de departamento e
# public.get_department_whatsapp_credentials(uuid) — service_role-only (20260928550000) e devolve
# o SEGREDO em claro. Chamada pela aba como `authenticated`, devolve access_denied; abri-la ao
# authenticated exporia a chave. E set_department_whatsapp_config nao registra auditoria.
#
# DEFEITO 2 (contrato INCOERENTE entre leitura e escrita, refazer 1): a leitura nova autoriza por
# public.is_admin_or_supervisor(auth.uid()) (fonte public.user_roles) enquanto a escrita decidia por
# profiles.role — o mesmo admin lia e nao escrevia. E a auditoria registrava has_api_key como
# "parametro enviado", nao como ESTADO ARMAZENADO: chamada com p_api_key NULL num departamento que
# ja tinha chave gravava has_api_key = false.
#
# ESTE CONTRATO roda em PostgreSQL descartavel (docker) e aplica o ARQUIVO REAL da migration
#   supabase/migrations/20261006213734_team_chat_f10_department_whatsapp_safe_config.sql
# sobre um estado ANTERIOR fiel ao canonico (pre.sql), executando como os PAPEIS REAIS
# (`SET ROLE authenticated` + request.jwt.claims; postgres para as sondagens de CHECK/ACL).
# NENHUMA credencial de producao entra aqui.
#
# BLOCO A — estado ANTERIOR: prova o DEFEITO (a RPC segura nao existe; a unica leitura recusa o
#           admin da tela; ADMIN CANONICO (user_roles) LE mas NAO escreve; nao ha auditoria; o CHECK
#           nao conhece 'whatsapp_updated') e, em A.6, instala a versao RECUSADA da escrita para
#           provar que ela media o PARAMETRO e nao o estado (has_api_key = false com chave gravada).
# BLOCO B — migration aplicada: LEITURA e ESCRITA pela MESMA guarda canonica
#           (public.is_admin_or_supervisor(auth.uid())): Eva, admin so em user_roles, LE e ESCREVE;
#           agente puro e negado nas DUAS; admin so em profiles.role nao autoriza nenhuma das duas.
#           Le 3 colunas SEM a chave; a escrita audita 'whatsapp_updated' sem a chave, com
#           has_api_key medindo o ESTADO ARMAZENADO (RETURNING do UPDATE); as duas funcoes ficam com
#           SET search_path = public, pg_temp; o CHECK aceita o verbo e as linhas LEGADAS seguem
#           validas; as 2 colunas de segredo seguem fechadas a authenticated.
# BLOCO C — ROLLBACK: a linha "-- Rollback:" do arquivo e executada de verdade e devolve o estado
#           anterior (funcao removida, CHECK sem o verbo novo, guarda da escrita de volta a
#           profiles.role e search_path original).
#
# Uso: bash scripts/db-audit/team-chat-department-whatsapp-safe-config.test.sh
#      TC005_WHATSAPP_TEST_POSTGRES_IMAGE=postgres:17-alpine   (default)

set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
migration="$repo_root/supabase/migrations/20261006213734_team_chat_f10_department_whatsapp_safe_config.sql"
postgres_image="${TC005_WHATSAPP_TEST_POSTGRES_IMAGE:-postgres:17-alpine}"
container_name="zapp-v2-tc005-whatsapp-test-$$"
tmp_base="${TMPDIR:-$repo_root/.tmp}"
tmp_dir="$tmp_base/zapp-v2-tc005-whatsapp-test.$$"

cleanup() {
  if [[ "$container_name" =~ ^zapp-v2-tc005-whatsapp-test-[0-9]+$ ]]; then
    docker rm -f "$container_name" >/dev/null 2>&1 || true
  fi
  case "$tmp_dir" in */zapp-v2-tc005-whatsapp-test.*) rm -rf -- "$tmp_dir" ;; esac
}
trap cleanup EXIT INT TERM

fail() { printf '[FAIL] %s\n' "$1" >&2; exit 1; }
pass() { printf '[PASS] %s\n' "$1"; }

psql_db()  { docker exec "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d "$1" -c "$2"; }
psql_file_db() { docker exec -i "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d "$1" < "$2"; }
as_user() {
  local jwt="$1" sql="$2"
  docker exec "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres \
    -c "SET ROLE authenticated; SELECT set_config('request.jwt.claims', '$jwt', false); $sql"
}
expect_value() { # label expected sql
  local l="$1" e="$2" s="$3" a; a="$(psql_db postgres "$s" | tail -n1)"
  [[ "$a" == "$e" ]] || fail "$l: esperado '$e', obtido '$a'"; pass "$l"
}
expect_value_as() { # label expected jwt sql
  local l="$1" e="$2" j="$3" s="$4" a; a="$(as_user "$j" "$s" | tail -n1)"
  [[ "$a" == "$e" ]] || fail "$l: esperado '$e', obtido '$a'"; pass "$l"
}
expect_error_as() { # label needle jwt sql
  local l="$1" needle="$2" j="$3" s="$4" out st
  set +e; out="$(as_user "$j" "$s" 2>&1)"; st=$?; set -e
  (( st == 0 )) && { printf '%s\n' "$out" >&2; fail "$l: deveria falhar, mas passou"; }
  [[ "$out" == *"$needle"* ]] || { printf '%s\n' "$out" >&2; fail "$l: esperava '$needle' no erro"; }
  pass "$l"
}
expect_error_sql() { # label needle sql  (como postgres — sondagem de CHECK)
  local l="$1" needle="$2" s="$3" out st
  set +e; out="$(psql_db postgres "$s" 2>&1)"; st=$?; set -e
  (( st == 0 )) && { printf '%s\n' "$out" >&2; fail "$l: deveria falhar, mas passou"; }
  [[ "$out" == *"$needle"* ]] || { printf '%s\n' "$out" >&2; fail "$l: esperava '$needle' no erro"; }
  pass "$l"
}
expect_col_priv() { # label role col priv expected
  local l="$1" role="$2" col="$3" priv="$4" expected="$5" a
  a="$(psql_db postgres "SELECT has_column_privilege('$role','public.departments','$col','$priv')" | tail -n1)"
  [[ "$a" == "$expected" ]] || fail "$l: has_column_privilege($role, departments.$col, $priv) = $a, esperado $expected"
  pass "$l"
}

command -v docker >/dev/null 2>&1 || fail 'Docker nao esta instalado'
docker info >/dev/null 2>&1 || fail 'Docker daemon nao esta acessivel'
[[ -f "$migration" ]] || fail "migration nao encontrada: $migration"
# O arquivo tem de carregar a linha de rollback executavel (afirmacao, nao contagem).
head -5 "$migration" | grep -qE '^-- Rollback: [^[:space:]]' || fail 'o arquivo perdeu a linha "-- Rollback:" executavel'

mkdir -p "$tmp_dir"

docker run --rm -d --name "$container_name" -e POSTGRES_PASSWORD=tc005_test_only "$postgres_image" >/dev/null

ready=0
for _ in $(seq 1 90); do
  if psql_db postgres 'SELECT 1' >/dev/null 2>&1; then ready=$((ready + 1)); (( ready >= 2 )) && break; else ready=0; fi
  sleep 1
done
(( ready >= 2 )) || fail "PostgreSQL descartavel ($postgres_image) nao ficou pronto"

# ── estado ANTERIOR, fiel ao canonico ───────────────────────────────────────────────────────
# Papeis sao globais do cluster: criados UMA vez (antes do schema, que vai em cada base).
psql_db postgres 'CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS;' >/dev/null

cat > "$tmp_dir/pre.sql" <<'SQL'
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
  AS $$ SELECT coalesce(
       nullif(current_setting('request.jwt.claim.sub', true), ''),
       nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'
     )::uuid $$;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE
  AS $$ SELECT coalesce(
       nullif(current_setting('request.jwt.claim.role', true), ''),
       nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'
     )::text $$;
GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  name text,
  role text DEFAULT 'agent',
  department_id uuid,
  is_active boolean DEFAULT true
);
CREATE TABLE public.user_roles (
  user_id uuid NOT NULL,
  role text NOT NULL,
  PRIMARY KEY (user_id, role)
);
CREATE TABLE public.departments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  whatsapp_mode text,
  whatsapp_api_key text,
  whatsapp_instance_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.departments
  ADD CONSTRAINT departments_whatsapp_mode_check CHECK (whatsapp_mode IN ('none','evolution','official'));
CREATE TABLE public.department_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  department_id uuid NOT NULL REFERENCES public.departments(id) ON DELETE CASCADE,
  action text NOT NULL,
  profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  profile_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);
-- vocabulario CANONICO de hoje (12 verbos), sem 'whatsapp_updated' (20260928530000)
ALTER TABLE public.department_audit_logs ADD CONSTRAINT department_audit_logs_action_check CHECK (action IN ('accept_invite','create_invite','join_department','leave_department','remove_member','update_settings','delete_department','create_department','update_role','kick_member','create_group','delete_group'));

CREATE OR REPLACE FUNCTION public.current_profile_id() RETURNS uuid
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
  AS $function$ SELECT id FROM public.profiles WHERE user_id = auth.uid() LIMIT 1; $function$;
REVOKE EXECUTE ON FUNCTION public.current_profile_id() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_profile_id() TO authenticated;

CREATE OR REPLACE FUNCTION public.is_admin_or_supervisor(_user_id uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
  AS $function$ SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role IN ('admin','supervisor')); $function$;
GRANT EXECUTE ON FUNCTION public.is_admin_or_supervisor(uuid) TO authenticated, service_role;

-- LEITURA canonica ANTES: service_role-only e com o segredo em claro (20260928550000)
CREATE OR REPLACE FUNCTION public.get_department_whatsapp_credentials(p_department_id uuid) RETURNS jsonb
  LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $f$
DECLARE v_row public.departments%ROWTYPE;
BEGIN
  IF current_setting('request.jwt.claims', true)::jsonb ->> 'role' <> 'service_role' THEN
    RAISE EXCEPTION 'access_denied';
  END IF;
  SELECT * INTO v_row FROM public.departments WHERE id = p_department_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  RETURN jsonb_build_object('whatsapp_mode', v_row.whatsapp_mode, 'whatsapp_api_key', v_row.whatsapp_api_key, 'whatsapp_instance_id', v_row.whatsapp_instance_id);
END; $f$;
REVOKE EXECUTE ON FUNCTION public.get_department_whatsapp_credentials(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_department_whatsapp_credentials(uuid) TO service_role;

-- ESCRITA canonica ANTES: guarda por profiles.role, SEM auditoria (20260928540000)
CREATE OR REPLACE FUNCTION public.set_department_whatsapp_config(p_department_id uuid, p_whatsapp_mode text, p_api_key text DEFAULT NULL::text, p_instance_id text DEFAULT NULL::text) RETURNS jsonb
  LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $f$
DECLARE v_profile_id uuid; v_is_admin boolean;
BEGIN
  v_profile_id := public.current_profile_id();
  IF v_profile_id IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated'); END IF;
  SELECT (role IN ('admin','supervisor')) INTO v_is_admin FROM public.profiles WHERE id = v_profile_id;
  IF NOT v_is_admin THEN RETURN jsonb_build_object('ok', false, 'error', 'not_authorized'); END IF;
  IF p_whatsapp_mode NOT IN ('none','evolution','official') THEN RETURN jsonb_build_object('ok', false, 'error', 'invalid_mode'); END IF;
  UPDATE public.departments SET whatsapp_mode = p_whatsapp_mode, whatsapp_api_key = COALESCE(p_api_key, whatsapp_api_key), whatsapp_instance_id = COALESCE(p_instance_id, whatsapp_instance_id), updated_at = now() WHERE id = p_department_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'department_not_found'); END IF;
  RETURN jsonb_build_object('ok', true);
END; $f$;
REVOKE EXECUTE ON FUNCTION public.set_department_whatsapp_config(uuid, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_department_whatsapp_config(uuid, text, text, text) TO authenticated;

-- ACL canonica de departments (l11 / 20260930530000 ja aplicada): authenticated sem INSERT/UPDATE
-- nas 2 colunas de segredo, com concessao por COLUNA nas seguras.
GRANT INSERT (id, name, is_active, whatsapp_mode, created_at, updated_at) ON public.departments TO authenticated;
GRANT UPDATE (id, name, is_active, whatsapp_mode, created_at, updated_at) ON public.departments TO authenticated;
REVOKE INSERT (whatsapp_api_key, whatsapp_instance_id), UPDATE (whatsapp_api_key, whatsapp_instance_id) ON public.departments FROM authenticated;
GRANT SELECT ON public.departments TO authenticated;
GRANT SELECT ON public.profiles TO authenticated;
SQL

cat > "$tmp_dir/seed.sql" <<'SQL'
DELETE FROM public.department_audit_logs;
DELETE FROM public.user_roles;
DELETE FROM public.departments;
DELETE FROM public.profiles;

INSERT INTO public.profiles (id, user_id, name, role, department_id, is_active) VALUES
  ('a0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Atila', 'agent', 'd0000000-0000-0000-0000-000000000001', true),
  ('a0000000-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222', 'Dora',  'admin', 'd0000000-0000-0000-0000-000000000001', true),
  ('a0000000-0000-0000-0000-000000000003', '33333333-3333-3333-3333-333333333333', 'Eva',   'agent', 'd0000000-0000-0000-0000-000000000001', true);

-- Admin CANONICO (fonte user_roles; profiles.role segue 'agent')
INSERT INTO public.user_roles (user_id, role) VALUES ('33333333-3333-3333-3333-333333333333', 'admin');

INSERT INTO public.departments (id, name, is_active, whatsapp_mode, whatsapp_api_key, whatsapp_instance_id) VALUES
  ('d0000000-0000-0000-0000-000000000001', 'Comercial', true, 'evolution', 'SEGREDO-EVOLUTION-123', 'inst-1'),
  ('d0000000-0000-0000-0000-000000000002', 'Suporte',   true, NULL,        NULL,                    NULL);

-- DADO LEGADO: verbo ANTIGO ja gravado (o ADD CONSTRAINT da migration tem de aceita-lo)
INSERT INTO public.department_audit_logs (department_id, action, profile_id, details)
VALUES ('d0000000-0000-0000-0000-000000000001', 'create_invite', 'a0000000-0000-0000-0000-000000000002', '{"legacy":true}');
SQL

# A versao RECUSADA da escrita (refazer 1, commit 04134d5e8): guarda por profiles.role e auditoria
# medindo o PARAMETRO da chamada. So existe aqui para provar, em A.6, o defeito que ela carregava.
cat > "$tmp_dir/escrita-recusada.sql" <<'SQL'
ALTER TABLE public.department_audit_logs DROP CONSTRAINT IF EXISTS department_audit_logs_action_check;
ALTER TABLE public.department_audit_logs ADD CONSTRAINT department_audit_logs_action_check CHECK (action IN (
  'accept_invite','create_invite','join_department','leave_department','remove_member','update_settings',
  'delete_department','create_department','update_role','kick_member','create_group','delete_group',
  'whatsapp_updated'));
CREATE OR REPLACE FUNCTION public.set_department_whatsapp_config(
  p_department_id uuid, p_whatsapp_mode text, p_api_key text DEFAULT NULL::text, p_instance_id text DEFAULT NULL::text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $f$
DECLARE
  v_profile_id uuid;
  v_is_admin   boolean;
BEGIN
  v_profile_id := public.current_profile_id();
  IF v_profile_id IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated'); END IF;
  SELECT (role IN ('admin','supervisor')) INTO v_is_admin FROM public.profiles WHERE id = v_profile_id;
  IF NOT v_is_admin THEN RETURN jsonb_build_object('ok', false, 'error', 'not_authorized'); END IF;
  IF p_whatsapp_mode NOT IN ('none','evolution','official') THEN RETURN jsonb_build_object('ok', false, 'error', 'invalid_mode'); END IF;
  UPDATE public.departments SET whatsapp_mode = p_whatsapp_mode, whatsapp_api_key = COALESCE(p_api_key, whatsapp_api_key), whatsapp_instance_id = COALESCE(p_instance_id, whatsapp_instance_id), updated_at = now() WHERE id = p_department_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'department_not_found'); END IF;
  INSERT INTO public.department_audit_logs(department_id, action, profile_id, details)
  VALUES (p_department_id, 'whatsapp_updated', v_profile_id, jsonb_build_object('mode', p_whatsapp_mode, 'has_api_key', (p_api_key IS NOT NULL)));
  RETURN jsonb_build_object('ok', true);
END; $f$;
SQL

psql_file_db postgres "$tmp_dir/pre.sql" >/dev/null
psql_file_db postgres "$tmp_dir/seed.sql" >/dev/null

ATILA='{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}'
DORA='{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}'
EVA='{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}'
DEP1='d0000000-0000-0000-0000-000000000001'
DEP2='d0000000-0000-0000-0000-000000000002'

printf '\n============ BLOCO A — estado ANTERIOR (o defeito de contrato) ============\n'
expect_value 'A.1 a RPC de leitura segura get_department_whatsapp_config NAO existe' 't' \
  "SELECT to_regprocedure('public.get_department_whatsapp_config(uuid)') IS NULL;"

expect_error_as 'A.2 (DEFEITO) a unica leitura (get_department_whatsapp_credentials) recusa o admin da tela' \
  'permission denied' "$EVA" "SELECT public.get_department_whatsapp_credentials('$DEP1');"

expect_value_as 'A.3 a escrita canonica responde ok para o admin de profiles.role (o grant existe)' 'true' "$DORA" \
  "SELECT (public.set_department_whatsapp_config('$DEP1','official',NULL,NULL)->>'ok');"
expect_value_as 'A.3b (DEFEITO) o admin CANONICO (Eva, so em user_roles) NAO consegue escrever' 'not_authorized' "$EVA" \
  "SELECT (public.set_department_whatsapp_config('$DEP1','official',NULL,NULL)->>'error');"
expect_value 'A.4 (DEFEITO) a escrita NAO deixou rastro de auditoria' '0' \
  "SELECT count(*) FROM public.department_audit_logs WHERE action='whatsapp_updated';"
expect_error_sql 'A.5 (DEFEITO) o CHECK nem conhece o verbo whatsapp_updated' 'check constraint' \
  "INSERT INTO public.department_audit_logs (department_id, action, details) VALUES ('$DEP1','whatsapp_updated','{}');"

# A.6 — o defeito da AUDITORIA da versao recusada: ela gravava has_api_key do PARAMETRO enviado.
# Instala-se aquela versao (com o CHECK ja ampliado, como a migration faz) e chama-se com p_api_key
# NULL num departamento que JA TEM chave: o estado gravado continua com chave e a auditoria diz o
# contrario. Sem essa medicao o campo pareceria correto.
psql_file_db postgres "$tmp_dir/escrita-recusada.sql" >/dev/null
expect_value_as 'A.6 chamada com p_api_key NULL num departamento que JA tem chave (estado real true)' 'true' "$DORA" \
  "SELECT public.set_department_whatsapp_config('$DEP1','evolution',NULL,NULL)->>'ok';"
expect_value 'A.6b (DEFEITO) a auditoria da versao recusada grava has_api_key=false com chave ARMAZENADA' 'true|false' \
  "SELECT (SELECT (NULLIF(whatsapp_api_key,'') IS NOT NULL)::text FROM public.departments WHERE id='$DEP1') || '|' || COALESCE((SELECT details->>'has_api_key' FROM public.department_audit_logs WHERE action='whatsapp_updated'),'-');"

printf '\n============ BLOCO B — migration aplicada ============\n'
psql_file_db postgres "$migration" >/dev/null
psql_file_db postgres "$tmp_dir/seed.sql" >/dev/null
pass 'B.0 a migration real aplicou (com o dado legado presente) sem erro'

expect_value_as 'B.1 admin CANONICO (user_roles) le 3 colunas: mode|instance_id|has_api_key' 'evolution|inst-1|true' "$EVA" \
  "SELECT mode||'|'||coalesce(instance_id,'')||'|'||has_api_key FROM public.get_department_whatsapp_config('$DEP1');"
expect_value_as 'B.2 o retorno NAO contem a chave' 'f' "$EVA" \
  "SELECT ((public.get_department_whatsapp_config('$DEP1'))::text LIKE '%SEGREDO-EVOLUTION-123%');"
expect_value_as 'B.3 departamento sem chave devolve has_api_key falso' '||false' "$EVA" \
  "SELECT coalesce(mode,'')||'|'||coalesce(instance_id,'')||'|'||has_api_key FROM public.get_department_whatsapp_config('$DEP2');"
expect_value_as 'B.4 departamento inexistente devolve 0 linhas (sem erro)' '0' "$EVA" \
  "SELECT count(*) FROM public.get_department_whatsapp_config('d0000000-0000-0000-0000-0000000000ff');"

expect_error_as 'B.5 AGENTE recebe negacao explicita (not_authorized) na LEITURA' 'not_authorized' "$ATILA" \
  "SELECT * FROM public.get_department_whatsapp_config('$DEP1');"
expect_error_as 'B.5b admin so em profiles.role (Dora) tambem NAO le: leitura usa user_roles' 'not_authorized' "$DORA" \
  "SELECT * FROM public.get_department_whatsapp_config('$DEP1');"
expect_error_as 'B.6 a leitura bruta segue service_role-only (authenticated barrado)' 'permission denied' "$ATILA" \
  "SELECT public.get_department_whatsapp_credentials('$DEP1');"

# ── coerencia de guarda: o MESMO ator tem o MESMO veredito nas duas operacoes ──
expect_value_as 'B.7 o admin CANONICO (Eva) ESCREVE (mesma guarda da leitura)' 'true' "$EVA" \
  "SELECT (public.set_department_whatsapp_config('$DEP1','official','NOVA-CHAVE-999','inst-9')->>'ok');"
expect_value_as 'B.7b o AGENTE puro e negado na ESCRITA (mesmo veredito da leitura)' 'not_authorized' "$ATILA" \
  "SELECT (public.set_department_whatsapp_config('$DEP1','official','OUTRA-CHAVE',NULL)->>'error');"
expect_value_as 'B.7c admin so em profiles.role (Dora) NAO escreve: escrita usa user_roles' 'not_authorized' "$DORA" \
  "SELECT (public.set_department_whatsapp_config('$DEP1','official','MAIS-UMA-CHAVE',NULL)->>'error');"

expect_value 'B.8 a escrita agora AUDITA whatsapp_updated (1 linha)' '1' \
  "SELECT count(*) FROM public.department_audit_logs WHERE action='whatsapp_updated';"
expect_value 'B.9 a auditoria NAO guarda a chave' 'f' \
  "SELECT (details::text LIKE '%NOVA-CHAVE-999%' OR details::text LIKE '%SEGREDO-EVOLUTION-123%') FROM public.department_audit_logs WHERE action='whatsapp_updated';"
expect_value 'B.10 a auditoria guarda o modo e o ator' 'official|true' \
  "SELECT (details->>'mode')||'|'||(details->>'has_api_key') FROM public.department_audit_logs WHERE action='whatsapp_updated';"

# ── has_api_key mede o ESTADO ARMAZENADO, nao o parametro (o defeito do refazer 1) ──
expect_value_as 'B.10a chamada com p_api_key NULL num departamento COM chave armazenada' 'true' "$EVA" \
  "SELECT public.set_department_whatsapp_config('$DEP1','evolution',NULL,NULL)->>'ok';"
expect_value 'B.10b a auditoria registra has_api_key = true (chave continua ARMAZENADA) e nao o parametro NULL' 'true|true|2' \
  "SELECT (SELECT (NULLIF(whatsapp_api_key,'') IS NOT NULL)::text FROM public.departments WHERE id='$DEP1') || '|' || (SELECT details->>'has_api_key' FROM public.department_audit_logs WHERE action='whatsapp_updated' ORDER BY created_at DESC, id DESC LIMIT 1) || '|' || (SELECT count(*)::text FROM public.department_audit_logs WHERE action='whatsapp_updated' AND details->>'has_api_key'='true');"
expect_value_as 'B.10c departamento SEM chave: a escrita com p_api_key NULL responde ok' 'true' "$EVA" \
  "SELECT public.set_department_whatsapp_config('$DEP2','evolution',NULL,NULL)->>'ok';"
expect_value 'B.10d a auditoria discrimina: o par sem chave grava false' 'evolution|false' \
  "SELECT (details->>'mode')||'|'||(details->>'has_api_key') FROM public.department_audit_logs WHERE action='whatsapp_updated' AND details->>'has_api_key'='false' ORDER BY created_at DESC, id DESC LIMIT 1;"
expect_value 'B.11 as linhas LEGADAS (verbo antigo) sobreviveram ao ADD CONSTRAINT' '1' \
  "SELECT count(*) FROM public.department_audit_logs WHERE action='create_invite';"

expect_col_priv 'B.12 authenticated NAO tem INSERT na chave'   authenticated whatsapp_api_key    INSERT f
expect_col_priv 'B.13 authenticated NAO tem UPDATE na chave'   authenticated whatsapp_api_key    UPDATE f
expect_col_priv 'B.14 authenticated NAO tem INSERT na instancia' authenticated whatsapp_instance_id INSERT f
expect_col_priv 'B.15 authenticated NAO tem UPDATE na instancia' authenticated whatsapp_instance_id UPDATE f
expect_col_priv 'B.16 authenticated segue gravando whatsapp_mode' authenticated whatsapp_mode UPDATE t

expect_value 'B.17 as DUAS funcoes ficam com SET search_path = public, pg_temp' \
  'get_department_whatsapp_config:search_path=public, pg_temp|set_department_whatsapp_config:search_path=public, pg_temp' \
  "SELECT string_agg(proname||':'||array_to_string(proconfig,','), '|' ORDER BY proname) FROM pg_proc WHERE proname IN ('get_department_whatsapp_config','set_department_whatsapp_config');"

printf '\n============ BLOCO C — rollback executa e devolve o estado ============\n'
# O rollback REAL, extraido da linha do cabecalho, e aplicado sobre o estado JA migrado
# (o bloco C e o ultimo: desfazer aqui nao afeta as provas acima).
sed -n '1,5p' "$migration" | sed -n 's/^-- Rollback: //p' > "$tmp_dir/rollback.sql"
grep -q 'DROP FUNCTION IF EXISTS public.get_department_whatsapp_config' "$tmp_dir/rollback.sql" || fail 'rollback vazio/invalido'
psql_file_db postgres "$tmp_dir/rollback.sql" >/dev/null
pass 'C.1 a linha -- Rollback: executou no PostgreSQL sem erro'
[[ "$(psql_db postgres "SELECT to_regprocedure('public.get_department_whatsapp_config(uuid)') IS NULL" | tail -n1)" == t ]] ||
  fail 'C.2 rollback nao removeu get_department_whatsapp_config'
pass 'C.2 rollback removeu a RPC segura'
set +e
out="$(psql_db postgres "INSERT INTO public.department_audit_logs (department_id, action, details) VALUES ('$DEP1','whatsapp_updated','{}');" 2>&1)"; st=$?
set -e
(( st != 0 )) && [[ "$out" == *"check constraint"* ]] || fail 'C.3 rollback nao restaurou o CHECK antigo'
pass 'C.3 rollback restaurou o CHECK sem o verbo novo'
[[ "$(psql_db postgres "SELECT position('whatsapp_updated' in pg_get_constraintdef(oid)) FROM pg_constraint WHERE conname='department_audit_logs_action_check'" | tail -n1)" == 0 ]] ||
  fail 'C.4 o CHECK do rollback ainda cita whatsapp_updated'
pass 'C.4 o CHECK restaurado nao cita whatsapp_updated'

# C.5/C.6 — o rollback tem de devolver a guarda ORIGINAL da escrita (profiles.role), nao a canonica.
expect_value_as 'C.5 o admin canonico (Eva) volta a ser NEGADO na escrita apos o rollback' 'not_authorized' "$EVA" \
  "SELECT (public.set_department_whatsapp_config('$DEP1','official',NULL,NULL)->>'error');"
expect_value_as 'C.5b o admin de profiles.role (Dora) volta a escrever apos o rollback' 'true' "$DORA" \
  "SELECT (public.set_department_whatsapp_config('$DEP1','official',NULL,NULL)->>'ok');"
expect_value 'C.6 o rollback devolve o search_path original da escrita (public)' 'search_path=public' \
  "SELECT array_to_string(proconfig,',') FROM pg_proc WHERE proname='set_department_whatsapp_config';"

printf '\nPASS: TC-005 (F10) — leitura segura do WhatsApp de departamento so p/ admin/supervisor, sem chave;\n'
printf 'agente com negacao explicita na leitura E na escrita; escrita auditada sem segredo e com has_api_key\n'
printf 'medindo o estado ARMAZENADO; LEITURA e ESCRITA na mesma guarda canonica (user_roles); CHECK ampliado\n'
printf 'aceitando o legado; ACL do segredo fechada; e o rollback do arquivo restaura guarda, CHECK e\n'
printf 'search_path originais.\n'
