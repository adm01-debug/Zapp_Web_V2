#!/usr/bin/env bash
# feat(db): assinaturas de e-mail por usuario (email_signatures) — contrato de acesso.
#
# BLOCO A — estado ANTERIOR (defeito): sem a migration, a tabela public.email_signatures
#           nao existe -> o recurso esta ausente (SELECT como authenticated falha).
# BLOCO B — migration aplicada: RLS ligada; cada usuario so ve/escreve/exclui a PROPRIA
#           assinatura; user_id assume auth.uid() (nao da para forjar autoria); no maximo
#           UMA padrao por usuario (indice unico parcial); html acima de 20000 e nome em
#           branco sao barrados; anon sem acesso. Depois: ROLLBACK extraido do proprio
#           arquivo desfaz tudo; reaplicar e idempotente.
set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
migration="$repo_root/supabase/migrations/20261012115237_email_signatures.sql"
postgres_image="${EMAIL_SIGNATURES_TEST_POSTGRES_IMAGE:-postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a3278a52a7ec49117deedb300e552b24}"
container_name="zapp-v2-email-signatures-test-$$"

cleanup() {
  if [[ "$container_name" =~ ^zapp-v2-email-signatures-test-[0-9]+$ ]]; then
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
as_user() {
  local jwt="$1" sql="$2"
  docker exec "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres \
    -c "SET ROLE authenticated; SELECT set_config('request.jwt.claims', '$jwt', false); $sql"
}
as_role() {
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
  local l="$1" e="$2" j="$3" s="$4" a
  a="$(as_user "$j" "$s" | tail -n1)"
  [[ "$a" == "$e" ]] || fail "$l: esperado '$e', obtido '$a'"
  printf '[PASS] %s\n' "$l"
}
expect_ok_as() { local l="$1" j="$2" s="$3"; as_user "$j" "$s" >/dev/null || fail "$l: deveria ter sucesso (como authenticated)"; printf '[PASS] %s\n' "$l"; }
expect_error_as() {
  local l="$1" needle="$2" j="$3" s="$4" out st
  set +e; out="$(as_user "$j" "$s" 2>&1)"; st=$?; set -e
  (( st == 0 )) && { printf '%s\n' "$out" >&2; fail "$l: deveria falhar, mas passou"; }
  [[ "$out" == *"$needle"* ]] || { printf '%s\n' "$out" >&2; fail "$l: esperava '$needle' no erro"; }
  printf '[PASS] %s\n' "$l"
}
expect_error_role() {
  local l="$1" needle="$2" role="$3" j="$4" s="$5" out st
  set +e; out="$(as_role "$role" "$j" "$s" 2>&1)"; st=$?; set -e
  (( st == 0 )) && { printf '%s\n' "$out" >&2; fail "$l: deveria falhar, mas passou"; }
  [[ "$out" == *"$needle"* ]] || { printf '%s\n' "$out" >&2; fail "$l: esperava '$needle' no erro"; }
  printf '[PASS] %s\n' "$l"
}

command -v docker >/dev/null 2>&1 || fail 'Docker nao esta instalado'
docker info >/dev/null 2>&1 || fail 'Docker daemon nao esta acessivel'
[[ -f "$migration" ]] || fail "migration nao encontrada: $migration"

OWNER="11111111-1111-1111-1111-111111111111"
OTHER="33333333-3333-3333-3333-333333333333"
JWT_OWNER='{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}'
JWT_OTHER='{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}'

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

CREATE OR REPLACE FUNCTION public.update_updated_at_column() RETURNS trigger
  LANGUAGE plpgsql SET search_path TO 'public'
  AS $function$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $function$;

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
SQL
psql_file "$tmp_dir/pre.sql" >/dev/null

# ---------- BLOCO A: sem a migration, a tabela nao existe (vermelho) ----------
expect_error_as 'A1 sem a migration o recurso esta ausente (authenticated)' \
  'does not exist' "$JWT_OWNER" "SELECT count(*) FROM public.email_signatures;"

# ---------- aplica a MIGRATION REAL ----------
psql_file "$migration" >/dev/null

# ---------- BLOCO B: contrato de acesso ----------
expect_value 'B1 RLS ligada na tabela' 't' \
  "SELECT relrowsecurity FROM pg_class WHERE oid = 'public.email_signatures'::regclass;"
expect_value 'B2 indices esperados (unico parcial + user_id)' '2' \
  "SELECT count(*) FROM pg_indexes WHERE tablename = 'email_signatures' AND indexname IN ('email_signatures_one_default_per_user','email_signatures_user_id_idx');"
expect_value 'B3 o unico de padrao e PARCIAL (where is_default)' 't' \
  "SELECT indexdef LIKE '%UNIQUE%' AND indexdef LIKE '%WHERE is_default%' FROM pg_indexes WHERE indexname = 'email_signatures_one_default_per_user';"

# a) dono insere; user_id assume auth.uid() (coluna nao vem no INSERT)
expect_ok_as 'B4 dono insere a propria assinatura' "$JWT_OWNER" \
  "INSERT INTO public.email_signatures(name, html) VALUES ('Assinatura A','<p>a</p>');"
expect_value_as 'B5 user_id gravado = auth.uid() (default)' "$OWNER" "$JWT_OWNER" \
  "SELECT user_id FROM public.email_signatures WHERE name = 'Assinatura A';"

# b) no maximo UMA padrao por usuario (indice unico parcial)
expect_ok_as 'B6 dono marca a primeira como padrao' "$JWT_OWNER" \
  "INSERT INTO public.email_signatures(name, html, is_default) VALUES ('Padrao A','<p>p</p>', true);"
expect_error_as 'B7 segunda padrao do MESMO usuario e barrada (unico parcial)' \
  'duplicate key' "$JWT_OWNER" \
  "INSERT INTO public.email_signatures(name, html, is_default) VALUES ('Padrao A2','<p>p2</p>', true);"
expect_ok_as 'B8 padrao de OUTRO usuario e permitida (indice e por usuario)' "$JWT_OTHER" \
  "INSERT INTO public.email_signatures(name, html, is_default) VALUES ('Padrao B','<p>pb</p>', true);"

# c) INSERT: corrigir o is_default=true de uma linha existente tambem colide
expect_error_as 'B9 virar padrao uma segunda linha do dono tambem colide' \
  'duplicate key' "$JWT_OWNER" \
  "UPDATE public.email_signatures SET is_default = true WHERE name = 'Assinatura A';"

# d) isolamento por dono: otro nao ve a assinatura do dono
expect_value_as 'B10 outro nao ve a assinatura do dono' '0' "$JWT_OTHER" \
  "SELECT count(*) FROM public.email_signatures WHERE name = 'Assinatura A';"
expect_value_as 'B11 outro ve so a propria' '1' "$JWT_OTHER" \
  "SELECT count(*) FROM public.email_signatures;"
expect_value_as 'B12 dono ve so as proprias' '2' "$JWT_OWNER" \
  "SELECT count(*) FROM public.email_signatures;"

# e) outro nao forja autoria
expect_error_as 'B13 outro nao insere com user_id de terceiro' \
  'row-level security' "$JWT_OTHER" \
  "INSERT INTO public.email_signatures(name, html, user_id) VALUES ('Forjado','<p>x</p>','$OWNER');"

# f) outro nao edita nem exclui a linha do dono (0 linhas afetadas)
expect_value_as 'B14 outro nao edita a assinatura do dono (0 linhas)' '0' "$JWT_OTHER" \
  "WITH u AS (UPDATE public.email_signatures SET name = 'hack' WHERE name = 'Assinatura A' RETURNING 1) SELECT count(*) FROM u;"
expect_value 'B15 a assinatura do dono segue intacta' 'Assinatura A' \
  "SELECT name FROM public.email_signatures WHERE user_id = '$OWNER' AND name = 'Assinatura A';"
expect_value_as 'B16 outro nao exclui a assinatura do dono (0 linhas)' '0' "$JWT_OTHER" \
  "WITH d AS (DELETE FROM public.email_signatures WHERE name = 'Assinatura A' RETURNING 1) SELECT count(*) FROM d;"
expect_value 'B17 a assinatura do dono continua existindo' '1' \
  "SELECT count(*) FROM public.email_signatures WHERE name = 'Assinatura A';"

# g) dono edita e exclui o que e seu
expect_ok_as 'B18 dono edita a propria assinatura' "$JWT_OWNER" \
  "UPDATE public.email_signatures SET html = '<p>editado</p>' WHERE name = 'Assinatura A';"
expect_value 'B19 edicao do dono aplicada' '<p>editado</p>' \
  "SELECT html FROM public.email_signatures WHERE name = 'Assinatura A';"
expect_ok_as 'B20 dono exclui a propria assinatura' "$JWT_OWNER" \
  "DELETE FROM public.email_signatures WHERE name = 'Assinatura A';"
expect_value 'B21 exclusao do dono aplicada' '0' \
  "SELECT count(*) FROM public.email_signatures WHERE name = 'Assinatura A';"

# h) limites: html ate 20000 passa; 20001 e nome em branco sao barrados
expect_ok_as 'B22 html de exatamente 20000 e aceito' "$JWT_OWNER" \
  "INSERT INTO public.email_signatures(name, html) VALUES ('Limite', repeat('a', 20000));"
expect_error_as 'B23 html de 20001 e barrado' 'email_signatures_html_len' "$JWT_OWNER" \
  "INSERT INTO public.email_signatures(name, html) VALUES ('Excesso', repeat('a', 20001));"
expect_error_as 'B24 nome em branco e barrado' 'email_signatures_name_not_blank' "$JWT_OWNER" \
  "INSERT INTO public.email_signatures(name, html) VALUES ('   ','<p>x</p>');"

# i) anon: sem grant nenhum
expect_error_role 'B25 anon nao le (sem grant)' 'permission denied' 'anon' '{}' \
  "SELECT count(*) FROM public.email_signatures;"
expect_error_role 'B26 anon nao insere' 'permission denied' 'anon' '{}' \
  "INSERT INTO public.email_signatures(name, html) VALUES ('anon','<p>x</p>');"

# j) trigger de updated_at
expect_ok_as 'B27 dono atualiza o html (dispara gatilho)' "$JWT_OWNER" \
  "UPDATE public.email_signatures SET html = '<p>novo</p>', updated_at = '2000-01-01T00:00:00Z' WHERE name = 'Limite';"
expect_value 'B28 gatilho regravou updated_at' 't' \
  "SELECT updated_at > '2000-01-02'::timestamptz FROM public.email_signatures WHERE name = 'Limite';"

# k) ACL: anon/PUBLIC sem grant; authenticated com os 4 verbos
expect_value 'B29 anon sem SELECT (grant)' 'f' \
  "SELECT has_table_privilege('anon', 'public.email_signatures', 'SELECT');"
expect_value 'B30 authenticated com os 4 verbos' '4' \
  "SELECT count(*) FROM information_schema.role_table_grants WHERE table_name = 'email_signatures' AND grantee = 'authenticated' AND privilege_type IN ('SELECT','INSERT','UPDATE','DELETE');"
expect_value 'B31 PUBLIC nao tem grant' '0' \
  "SELECT count(*) FROM information_schema.role_table_grants WHERE table_name = 'email_signatures' AND grantee = 'PUBLIC';"

# ---------- ROLLBACK extraido do PROPRIO arquivo da migration ----------
sed -n '/^-- Rollback (SQL executável, na ordem):/,/^--$/p' "$migration" | grep '^--   ' | sed 's/^--   //' > "$tmp_dir/rollback.sql"
[[ -s "$tmp_dir/rollback.sql" ]] || fail 'rollback nao extraido do arquivo da migration'
psql_file "$tmp_dir/rollback.sql" >/dev/null
expect_value 'B32 rollback removeu a tabela' '0' \
  "SELECT count(*) FROM pg_class WHERE oid = to_regclass('public.email_signatures');"
expect_value 'B33 rollback removeu as policies' '0' \
  "SELECT count(*) FROM pg_policies WHERE tablename = 'email_signatures';"

# ---------- reaplica (idempotencia pos-rollback) ----------
psql_file "$migration" >/dev/null
expect_value 'B34 reaplicar recria a tabela' '1' \
  "SELECT count(*) FROM pg_class WHERE oid = to_regclass('public.email_signatures');"

printf '== TODOS OS PASSOS PASSARAM ==\n'
