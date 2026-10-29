#!/usr/bin/env bash
# Escopo por conexao das RPCs de etiqueta de WhatsApp — item 22 / TRA-006 (P1).
#
# O teste roda o MESMO roteiro no mesmo container descartavel:
#   BLOCO A — estado ANTERIOR a migration: prova o defeito global (rename/delete
#             de label da instancia A varre contatos da instancia B e ate os sem
#             conexao, porque o UPDATE nao filtrava whatsapp_connection_id).
#   BLOCO B — migration aplicada: prova o isolamento por conexao (rename e
#             delete so tocam a conexao passada em p_connection_id), a ACL das
#             assinaturas novas e a remocao das antigas.
#   BLOCO C — ROLLBACK: executa a linha `-- Rollback:` do cabecalho da migration
#             e prova que as assinaturas antigas voltam COM a ACL anterior (sem
#             EXECUTE para PUBLIC). Sem o REVOKE/GRANT na linha, o CREATE depois
#             do DROP deixaria proacl NULL (= EXECUTE para PUBLIC) — regressao
#             reprovada por check-secdef-public-execute.sql.
# Vermelho antes e verde depois saem do mesmo run, no banco de verdade.
#
# O estado anterior e fiel ao banco atual: corpos das RPCs e ACLs de
# 20260930090000_harden_status_and_wa_tag_rpc_authorization.sql (bloqueio de
# anon + require_contact_global_admin), sobre um contacts com
# whatsapp_connection_id.

set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
migration="$repo_root/supabase/migrations/20261005095819_scope_wa_label_rpc_by_connection.sql"
postgres_image="${WA_LABEL_SCOPE_TEST_POSTGRES_IMAGE:-postgres:17-alpine}"
container_name="zapp-v2-wa-label-scope-test-$$"

cleanup() {
  if [[ "$container_name" =~ ^zapp-v2-wa-label-scope-test-[0-9]+$ ]]; then
    docker rm -f "$container_name" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT INT TERM

fail() {
  printf '[FAIL] %s\n' "$1" >&2
  exit 1
}

psql_sql() {
  docker exec "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres -c "$1"
}

psql_file() {
  docker exec -i "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres < "$1"
}

# Erro esperado: exige exit != 0 E o texto/SQLSTATE esperado na mensagem.
expect_error() {
  local label="$1" needle="$2" sql="$3" output status
  set +e
  output="$(docker exec "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres \
    -c '\set VERBOSITY verbose' -c "$sql" 2>&1)"
  status=$?
  set -e
  if (( status == 0 )); then
    printf '%s\n' "$output" >&2
    fail "$label: deveria falhar, mas passou"
  fi
  if [[ "$output" != *"$needle"* ]]; then
    printf '%s\n' "$output" >&2
    fail "$label: esperava '$needle' no erro"
  fi
  printf '[PASS] %s\n' "$label"
}

expect_value() {
  local label="$1" expected="$2" sql="$3" actual
  actual="$(psql_sql "$sql")"
  if [[ "$actual" != "$expected" ]]; then
    fail "$label: esperado '$expected', obtido '$actual'"
  fi
  printf '[PASS] %s\n' "$label"
}

expect_ok() {
  local label="$1" sql="$2"
  psql_sql "$sql" >/dev/null || fail "$label: deveria ter sucesso"
  printf '[PASS] %s\n' "$label"
}

command -v docker >/dev/null 2>&1 || fail 'Docker nao esta instalado'
docker info >/dev/null 2>&1 || fail 'Docker daemon nao esta acessivel'
[[ -f "$migration" ]] || fail "migration nao encontrada: $migration"

docker run --rm -d --name "$container_name" -e POSTGRES_PASSWORD=test_only "$postgres_image" >/dev/null

ready_checks=0
for _ in $(seq 1 90); do
  if psql_sql 'SELECT 1' >/dev/null 2>&1; then
    ready_checks=$((ready_checks + 1))
    if (( ready_checks >= 2 )); then break; fi
  else
    ready_checks=0
  fi
  sleep 1
done
(( ready_checks >= 2 )) || fail 'PostgreSQL descartavel nao ficou pronto de forma estavel'

tmp_dir="$(mktemp -d)"
trap 'rm -rf "$tmp_dir"; cleanup' EXIT INT TERM

# ── Estado ANTERIOR a migration (fiel ao banco atual) ─────────────────────────────────
cat > "$tmp_dir/pre.sql" <<'SQL'
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;

CREATE SCHEMA auth;
-- Contratos reais: sem claims, auth.role() e NULL (por isso o coalesce com session_user
-- no guard privilegiado); auth.uid() le o claim sub.
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
  AS $$ SELECT nullif(coalesce(
       nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub',
       nullif(current_setting('request.jwt.claim.sub', true), '')
     ), '')::uuid $$;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE
  AS $$ SELECT coalesce(
       nullif(current_setting('request.jwt.claim.role', true), ''),
       nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'
     )::text $$;

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL UNIQUE,
  is_active boolean NOT NULL DEFAULT true
);
CREATE TABLE public.user_roles (
  user_id uuid NOT NULL,
  role text NOT NULL,
  PRIMARY KEY (user_id, role)
);
CREATE TABLE public.queues (id uuid PRIMARY KEY);
CREATE TABLE public.queue_members (
  queue_id uuid NOT NULL REFERENCES public.queues(id),
  profile_id uuid NOT NULL REFERENCES public.profiles(id),
  is_active boolean NOT NULL,
  PRIMARY KEY (queue_id, profile_id)
);
CREATE TABLE public.whatsapp_connections (
  id uuid PRIMARY KEY,
  name text
);
CREATE TABLE public.contacts (
  id uuid PRIMARY KEY,
  phone text NOT NULL,
  tags text[],
  assigned_to uuid,
  queue_id uuid,
  whatsapp_connection_id uuid REFERENCES public.whatsapp_connections(id),
  conversation_status text DEFAULT 'open',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.contacts TO authenticated;

-- Predicates: mesmo contrato dos reais (hoisted, caller-bound).
CREATE FUNCTION public.get_profile_id_for_user(_user_id uuid) RETURNS uuid
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public
  AS $$ SELECT id FROM public.profiles WHERE user_id = _user_id LIMIT 1 $$;
CREATE FUNCTION public.get_visible_agent_ids(_user_id uuid) RETURNS SETOF uuid
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public
  AS $$ SELECT id FROM public.profiles WHERE user_id = _user_id $$;
CREATE FUNCTION public.is_admin_or_supervisor(_user_id uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public
  AS $$ SELECT EXISTS (SELECT 1 FROM public.user_roles ur
                       WHERE ur.user_id = _user_id AND ur.role IN ('admin','supervisor')) $$;

-- Helpers de autorizacao criados por 20260930090000, corpos reais byte a byte.
CREATE FUNCTION public.is_privileged_contact_caller()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT coalesce(auth.role(), session_user) = ANY (ARRAY['service_role', 'postgres', 'supabase_admin']);
$$;

CREATE FUNCTION public.require_contact_global_admin()
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  IF public.is_privileged_contact_caller() THEN
    RETURN;
  END IF;

  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication_required' USING ERRCODE = '42501';
  END IF;

  IF NOT public.is_admin_or_supervisor(auth.uid()) THEN
    RAISE EXCEPTION 'admin_required' USING ERRCODE = '42501';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.is_privileged_contact_caller() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_privileged_contact_caller() TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.require_contact_global_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.require_contact_global_admin() TO authenticated, service_role;

-- As DUAS RPCs na versao ANTIGA (global, sem conexao): corpos identicos aos de
-- 20260930090000, com os REVOKE/GRANT que existem hoje.
CREATE FUNCTION public.rename_wa_label_on_all_contacts(p_label_prefix text, p_new_tag text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF auth.role() = 'anon' THEN RAISE EXCEPTION 'permission denied'; END IF;
  PERFORM public.require_contact_global_admin();

  UPDATE public.contacts
  SET tags = ARRAY(SELECT CASE WHEN t LIKE p_label_prefix || '%' THEN p_new_tag ELSE t END FROM unnest(tags) t),
      updated_at = now()
  WHERE EXISTS (SELECT 1 FROM unnest(tags) t WHERE t LIKE p_label_prefix || '%');
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.rename_wa_label_on_all_contacts(text, text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.rename_wa_label_on_all_contacts(text, text) TO authenticated, service_role;

CREATE FUNCTION public.remove_wa_label_from_all_contacts(p_label_prefix text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF auth.role() = 'anon' THEN RAISE EXCEPTION 'permission denied'; END IF;
  PERFORM public.require_contact_global_admin();

  UPDATE public.contacts
  SET tags = ARRAY(SELECT t FROM unnest(tags) t WHERE t NOT LIKE p_label_prefix || '%'), updated_at = now()
  WHERE EXISTS (SELECT 1 FROM unnest(tags) t WHERE t LIKE p_label_prefix || '%');
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.remove_wa_label_from_all_contacts(text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.remove_wa_label_from_all_contacts(text) TO authenticated, service_role;
SQL

cat > "$tmp_dir/seed.sql" <<'SQL'
DELETE FROM public.contacts;
DELETE FROM public.queue_members;
DELETE FROM public.user_roles;
DELETE FROM public.queues;
DELETE FROM public.whatsapp_connections;
DELETE FROM public.profiles;

INSERT INTO public.profiles (id, user_id, is_active) VALUES
  ('a0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', true);  -- ADMIN
INSERT INTO public.user_roles (user_id, role) VALUES
  ('11111111-1111-1111-1111-111111111111', 'admin');

INSERT INTO public.whatsapp_connections (id, name) VALUES
  ('aa000000-0000-0000-0000-000000000001', 'Instancia A'),
  ('aa000000-0000-0000-0000-000000000002', 'Instancia B'),
  ('aa000000-0000-0000-0000-000000000003', 'Instancia sem contatos');

-- 5 contatos, TODOS com a tag wa:5:VIP (o label "5" existe nas duas contas, mas
-- e homonimo: label id e re-numerado por instancia).
INSERT INTO public.contacts (id, phone, tags, whatsapp_connection_id) VALUES
  ('dd000000-0000-0000-0000-000000000001', '5511900000001', ARRAY['wa:5:VIP','x_etiqueta'], 'aa000000-0000-0000-0000-000000000001'), -- C_A1
  ('dd000000-0000-0000-0000-000000000002', '5511900000002', ARRAY['wa:5:VIP'],              'aa000000-0000-0000-0000-000000000001'), -- C_A2
  ('dd000000-0000-0000-0000-000000000003', '5511900000003', ARRAY['wa:5:VIP','outra'],      'aa000000-0000-0000-0000-000000000002'), -- C_B1
  ('dd000000-0000-0000-0000-000000000004', '5511900000004', ARRAY['wa:5:VIP'],              'aa000000-0000-0000-0000-000000000002'), -- C_B2
  ('dd000000-0000-0000-0000-000000000005', '5511900000005', ARRAY['wa:5:VIP'],              NULL);                                   -- C_NULO (sem conexao)
SQL

psql_file "$tmp_dir/pre.sql"
psql_file "$tmp_dir/seed.sql"

ADMIN_CLAIMS="{\"sub\":\"11111111-1111-1111-1111-111111111111\",\"role\":\"authenticated\"}"
CONEXAO_A='aa000000-0000-0000-0000-000000000001'
CONEXAO_B='aa000000-0000-0000-0000-000000000002'
CONEXAO_VAZIA='aa000000-0000-0000-0000-000000000003'

admin() { printf "SET ROLE authenticated; SELECT set_config('request.jwt.claims', '%s', false); %s" "$ADMIN_CLAIMS" "$1"; }

echo '── BLOCO A: comportamento ANTES da migration (o defeito global) ───────────────'

expect_ok 'A1 admin renomeia wa:5: sem escopo de conexao' \
  "$(admin "SELECT public.rename_wa_label_on_all_contacts('wa:5:','wa:5:VIP2');")"
expect_value 'A1 tag nova atingiu os 5 contatos (e o defeito: deveria ser so da instancia)' '5' \
  "SELECT count(*) FROM public.contacts WHERE tags @> ARRAY['wa:5:VIP2']"
expect_value 'A1 contatos da OUTRA conexao tambem foram renomeados' '2' \
  "SELECT count(*) FROM public.contacts WHERE whatsapp_connection_id = '$CONEXAO_B' AND tags @> ARRAY['wa:5:VIP2']"
expect_value 'A1 contato SEM conexao tambem foi varrido' '1' \
  "SELECT count(*) FROM public.contacts WHERE whatsapp_connection_id IS NULL AND tags @> ARRAY['wa:5:VIP2']"

psql_file "$tmp_dir/seed.sql"

expect_ok 'A2 admin remove wa:5: sem escopo de conexao' \
  "$(admin "SELECT public.remove_wa_label_from_all_contacts('wa:5:');")"
expect_value 'A2 tag sumiu dos 5 contatos (idem: apagou nas duas conexoes e no orfao)' '0' \
  "SELECT count(*) FROM public.contacts WHERE EXISTS (SELECT 1 FROM unnest(tags) t WHERE t LIKE 'wa:5:%')"
expect_value 'A2 conexao B perdeu a tag que nao era dela' '0' \
  "SELECT count(*) FROM public.contacts WHERE whatsapp_connection_id = '$CONEXAO_B' AND EXISTS (SELECT 1 FROM unnest(tags) t WHERE t LIKE 'wa:5:%')"

psql_file "$tmp_dir/seed.sql"

echo
echo '── Aplicando a migration ─────────────────────────────────────────────────────────'
psql_file "$migration"

echo
echo '── BLOCO B: comportamento DEPOIS da migration (isolamento por conexao) ───────────'

expect_ok 'B1 rename escopado na CONEXAO_A' \
  "$(admin "SELECT public.rename_wa_label_on_all_contacts('$CONEXAO_A','wa:5:','wa:5:VIP2');")"
expect_value 'B1 so os 2 contatos da conexao A receberam a tag nova' '2' \
  "SELECT count(*) FROM public.contacts WHERE tags @> ARRAY['wa:5:VIP2']"
expect_value 'B1 os 3 demais contatos seguem com wa:5:VIP intacta' '3' \
  "SELECT count(*) FROM public.contacts WHERE tags @> ARRAY['wa:5:VIP']"
expect_value 'B1 conexao B INTACTA' '2' \
  "SELECT count(*) FROM public.contacts WHERE whatsapp_connection_id = '$CONEXAO_B' AND tags @> ARRAY['wa:5:VIP']"
expect_value 'B1 contato sem conexao INTACTO' '1' \
  "SELECT count(*) FROM public.contacts WHERE whatsapp_connection_id IS NULL AND tags @> ARRAY['wa:5:VIP']"

expect_ok 'B2 delete escopado na CONEXAO_B' \
  "$(admin "SELECT public.remove_wa_label_from_all_contacts('$CONEXAO_B','wa:5:');")"
expect_value 'B2 conexao B sem nenhuma tag wa:5:' '0' \
  "SELECT count(*) FROM public.contacts WHERE whatsapp_connection_id = '$CONEXAO_B' AND EXISTS (SELECT 1 FROM unnest(tags) t WHERE t LIKE 'wa:5:%')"
expect_value 'B2 conexao A INTACTA (VIP2 preservado)' '2' \
  "SELECT count(*) FROM public.contacts WHERE whatsapp_connection_id = '$CONEXAO_A' AND tags @> ARRAY['wa:5:VIP2']"
expect_value 'B2 contato sem conexao INTACTO (VIP preservado)' '1' \
  "SELECT count(*) FROM public.contacts WHERE whatsapp_connection_id IS NULL AND tags @> ARRAY['wa:5:VIP']"
expect_value 'B2 demais etiquetas da conexao B preservadas' '1' \
  "SELECT count(*) FROM public.contacts WHERE whatsapp_connection_id = '$CONEXAO_B' AND tags @> ARRAY['outra']"

expect_ok 'B3 rename numa conexao SEM contatos nao altera nada' \
  "$(admin "SELECT public.rename_wa_label_on_all_contacts('$CONEXAO_VAZIA','wa:5:','wa:5:ZZZ');")"
expect_value 'B3 nenhum contato recebeu a tag nova' '0' \
  "SELECT count(*) FROM public.contacts WHERE tags @> ARRAY['wa:5:ZZZ']"
expect_value 'B3 estado das demais conexoes inalterado' '3' \
  "SELECT count(*) FROM public.contacts WHERE EXISTS (SELECT 1 FROM unnest(tags) t WHERE t LIKE 'wa:5:%')"

expect_error 'B4 anon -> rename escopado NEGADO' \
  'permission denied' "SET ROLE anon; SELECT set_config('request.jwt.claims','{\"role\":\"anon\"}',false); SELECT public.rename_wa_label_on_all_contacts('$CONEXAO_A','wa:5:','wa:5:X');"
expect_error 'B4b anon -> remove escopado NEGADO' \
  'permission denied' "SET ROLE anon; SELECT set_config('request.jwt.claims','{\"role\":\"anon\"}',false); SELECT public.remove_wa_label_from_all_contacts('$CONEXAO_A','wa:5:');"

# ACL das assinaturas NOVAS: authenticated e service_role tem EXECUTE; anon e
# PUBLIC nao (proacl IS NULL tambem significaria EXECUTE para PUBLIC).
for fn in \
  "rename_wa_label_on_all_contacts(uuid,text,text)" \
  "remove_wa_label_from_all_contacts(uuid,text)"; do
  expect_value "B5 authenticated tem EXECUTE em $fn" 't' \
    "SELECT has_function_privilege('authenticated','public.$fn','EXECUTE')"
  expect_value "B5 service_role tem EXECUTE em $fn" 't' \
    "SELECT has_function_privilege('service_role','public.$fn','EXECUTE')"
  expect_value "B5 anon NAO tem EXECUTE em $fn" 'f' \
    "SELECT has_function_privilege('anon','public.$fn','EXECUTE')"
  expect_value "B5 PUBLIC sem EXECUTE em $fn (proacl sem grantee 0)" '0' \
    "SELECT count(*) FROM pg_proc p WHERE p.oid = 'public.$fn'::regprocedure AND (p.proacl IS NULL OR EXISTS (SELECT 1 FROM aclexplode(p.proacl) a WHERE a.grantee = 0 AND a.privilege_type = 'EXECUTE'))"
done

expect_value 'B6 assinatura antiga rename(text,text) NAO existe mais' '0' \
  "SELECT count(*) FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND p.proname = 'rename_wa_label_on_all_contacts' AND oidvectortypes(p.proargtypes) = 'text, text'"
expect_value 'B6 assinatura antiga remove(text) NAO existe mais' '0' \
  "SELECT count(*) FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND p.proname = 'remove_wa_label_from_all_contacts' AND oidvectortypes(p.proargtypes) = 'text'"

echo
echo '── BLOCO C: ROLLBACK restaura funcoes antigas COM a ACL (sem PUBLIC) ────────────'

rollback_sql="$(sed -n 's/^-- Rollback: //p' "$migration" | head -1)"
[[ -n "$rollback_sql" ]] || fail 'linha "-- Rollback:" nao encontrada no cabecalho da migration'
psql_sql "$rollback_sql"

expect_value 'C1 assinatura antiga rename(text,text) voltou' '1' \
  "SELECT count(*) FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND p.proname = 'rename_wa_label_on_all_contacts' AND oidvectortypes(p.proargtypes) = 'text, text'"
expect_value 'C1 assinatura antiga remove(text) voltou' '1' \
  "SELECT count(*) FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND p.proname = 'remove_wa_label_from_all_contacts' AND oidvectortypes(p.proargtypes) = 'text'"

for fn in \
  "rename_wa_label_on_all_contacts(text,text)" \
  "remove_wa_label_from_all_contacts(text)"; do
  expect_value "C2 authenticated tem EXECUTE em $fn" 't' \
    "SELECT has_function_privilege('authenticated','public.$fn','EXECUTE')"
  expect_value "C2 service_role tem EXECUTE em $fn" 't' \
    "SELECT has_function_privilege('service_role','public.$fn','EXECUTE')"
  expect_value "C2 anon NAO tem EXECUTE em $fn" 'f' \
    "SELECT has_function_privilege('anon','public.$fn','EXECUTE')"
  # E exatamente a regressao apontada na recusa: sem o REVOKE/GRANT do rollback,
  # o CREATE depois do DROP deixaria proacl NULL -> EXECUTE para PUBLIC.
  expect_value "C2 PUBLIC sem EXECUTE em $fn (proacl sem grantee 0)" '0' \
    "SELECT count(*) FROM pg_proc p WHERE p.oid = 'public.$fn'::regprocedure AND (p.proacl IS NULL OR EXISTS (SELECT 1 FROM aclexplode(p.proacl) a WHERE a.grantee = 0 AND a.privilege_type = 'EXECUTE'))"
done

expect_value 'C3 assinatura nova rename(uuid,text,text) desapareceu' '0' \
  "SELECT count(*) FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND p.proname = 'rename_wa_label_on_all_contacts' AND oidvectortypes(p.proargtypes) = 'uuid, text, text'"
expect_value 'C3 assinatura nova remove(uuid,text) desapareceu' '0' \
  "SELECT count(*) FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND p.proname = 'remove_wa_label_from_all_contacts' AND oidvectortypes(p.proargtypes) = 'uuid, text'"

printf '\n[OK] escopo por conexao das etiquetas de WhatsApp verificado (item 22 / TRA-006)\n'
