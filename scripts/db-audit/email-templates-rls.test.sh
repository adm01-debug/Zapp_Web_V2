#!/usr/bin/env bash
# feat(db): modelos de e-mail (email_templates) com RLS — contrato de acesso.
#
# BLOCO A — estado ANTERIOR (defeito): sem a migration, a tabela public.email_templates
#           nao existe -> o recurso esta ausente (SELECT como authenticated falha).
# BLOCO B — migration aplicada: RLS ligada; dono le/edita/exclui o seu; modelo com
#           is_shared = true e legivel por todo authenticated e editavel so pelo dono ou
#           staff (is_admin_or_supervisor); anon sem acesso; INSERT nao permite forjar
#           autoria. Depois: ROLLBACK extraido do proprio arquivo desfaz tudo; reaplicar
#           e idempotente.
# BLOCO C — hardening da autoria (20261013005351): o defeito e REPRODUZIDO antes da
#           correcao (staff troca created_by de linha compartilhada de outro; com a RLS
#           do ET1 isso PASSA) e provado fechado depois; prova que o dono anterior perde
#           acesso quando staff reatribui; staff edita outras colunas normalmente; dono
#           tambem nao troca a propria autoria; service_role segue livre (back-office).
# BLOCO D — ROLLBACK do hardening executado no teste e reaplicacao idempotente.
set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
migration="$repo_root/supabase/migrations/20261012112503_email_templates_rls.sql"
hardening="$repo_root/supabase/migrations/20261013005351_email_templates_author_immutable.sql"
postgres_image="${EMAIL_TEMPLATES_TEST_POSTGRES_IMAGE:-postgres:17-alpine}"
container_name="zapp-v2-email-templates-test-$$"

cleanup() {
  if [[ "$container_name" =~ ^zapp-v2-email-templates-test-[0-9]+$ ]]; then
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
[[ -f "$hardening" ]] || fail "migration de hardening nao encontrada: $hardening"

OWNER="11111111-1111-1111-1111-111111111111"
OTHER="33333333-3333-3333-3333-333333333333"
STAFF="44444444-4444-4444-4444-444444444444"
JWT_OWNER='{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}'
JWT_OTHER='{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}'
JWT_STAFF='{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated"}'

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

CREATE TABLE public.user_roles (
  user_id uuid NOT NULL,
  role text NOT NULL,
  PRIMARY KEY (user_id, role)
);

CREATE OR REPLACE FUNCTION public.is_admin_or_supervisor(_user_id uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
  AS $function$
    SELECT EXISTS (
      SELECT 1 FROM public.user_roles ur
       WHERE ur.user_id = _user_id AND ur.role IN ('admin', 'supervisor')
    );
  $function$;

CREATE OR REPLACE FUNCTION public.update_updated_at_column() RETURNS trigger
  LANGUAGE plpgsql SET search_path TO 'public'
  AS $function$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $function$;

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
SQL
psql_file "$tmp_dir/pre.sql" >/dev/null

# staff de verdade: STAFF e admin
psql_sql "INSERT INTO public.user_roles(user_id, role) VALUES ('$STAFF', 'admin');" >/dev/null

# ---------- BLOCO A: sem a migration, a tabela nao existe (vermelho) ----------
expect_error_as 'A1 sem a migration o recurso esta ausente (authenticated)' \
  'does not exist' "$JWT_OWNER" "SELECT count(*) FROM public.email_templates;"

# ---------- aplica a MIGRATION REAL ----------
psql_file "$migration" >/dev/null

# ---------- BLOCO B: contrato de acesso ----------
expect_value 'B1 RLS ligada na tabela' 't' \
  "SELECT relrowsecurity FROM pg_class WHERE oid = 'public.email_templates'::regclass;"
expect_value 'B2 indices por created_by e is_shared' '2' \
  "SELECT count(*) FROM pg_indexes WHERE tablename = 'email_templates' AND indexname IN ('email_templates_created_by_idx','email_templates_is_shared_idx');"

# semeia como postgres: um modelo privado e um compartilhado do OWNER
psql_sql "INSERT INTO public.email_templates(id, name, subject, body, is_shared, created_by) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001','Priv do owner','s1','b1',false,'$OWNER'),
  ('aaaaaaaa-0000-0000-0000-000000000002','Compartilhado do owner','s2','b2',true,'$OWNER');" >/dev/null

# a) dono: ve os seus dois (privado + compartilhado), nao ve o de outro
expect_value_as 'B3 dono ve seus 2 modelos' '2' "$JWT_OWNER" \
  "SELECT count(*) FROM public.email_templates;"
# b) outro usuario autenticado nao-staff: ve SO o compartilhado
expect_value_as 'B4 outro usuario ve so o compartilhado' '1' "$JWT_OTHER" \
  "SELECT count(*) FROM public.email_templates;"
expect_value_as 'B5 outro usuario ve exatamente o compartilhado' 'Compartilhado do owner' "$JWT_OTHER" \
  "SELECT name FROM public.email_templates LIMIT 1;"
# c) staff: ve o compartilhado; o privado de outro continua invisivel
expect_value_as 'B6 staff ve so o compartilhado' '1' "$JWT_STAFF" \
  "SELECT count(*) FROM public.email_templates;"
# d) anon: sem GRANT de leitura
expect_error_role 'B7 anon nao le (sem grant)' 'permission denied' 'anon' '{}' \
  "SELECT count(*) FROM public.email_templates;"

# e) INSERT: dono cria o seu; outro nao consegue forjar autoria
expect_ok_as 'B8 dono insere o proprio modelo' "$JWT_OWNER" \
  "INSERT INTO public.email_templates(name, subject, body) VALUES ('Novo do owner','s','b');"
expect_value_as 'B9 modelo inserido ficou com created_by = auth.uid()' "$OWNER" "$JWT_OWNER" \
  "SELECT created_by FROM public.email_templates WHERE name = 'Novo do owner';"
expect_error_as 'B10 outro nao forja autoria (created_by de terceiro)' 'row-level security' "$JWT_OTHER" \
  "INSERT INTO public.email_templates(name, subject, body, created_by) VALUES ('Forjado','s','b','$OWNER');"
expect_error_role 'B11 anon nao insere' 'permission denied' 'anon' '{}' \
  "INSERT INTO public.email_templates(name, subject, body) VALUES ('anon','s','b');"

# f) UPDATE: dono edita o seu; outro nao edita o privado do dono; staff edita o COMPARTILHADO
expect_ok_as 'B12 dono edita o seu privado' "$JWT_OWNER" \
  "UPDATE public.email_templates SET subject = 'editado pelo dono' WHERE id = 'aaaaaaaa-0000-0000-0000-000000000001';"
expect_value 'B13 privado do dono foi editado' 'editado pelo dono' \
  "SELECT subject FROM public.email_templates WHERE id = 'aaaaaaaa-0000-0000-0000-000000000001';"

expect_value_as 'B14 outro nao edita o privado do dono (0 linhas)' '0' "$JWT_OTHER" \
  "WITH u AS (UPDATE public.email_templates SET subject = 'hack' WHERE id = 'aaaaaaaa-0000-0000-0000-000000000001' RETURNING 1) SELECT count(*) FROM u;"
expect_value 'B15 privado do dono intacto apos tentativa' 'editado pelo dono' \
  "SELECT subject FROM public.email_templates WHERE id = 'aaaaaaaa-0000-0000-0000-000000000001';"
expect_value_as 'B16 outro nao edita o compartilhado (nao e dono nem staff)' '0' "$JWT_OTHER" \
  "WITH u AS (UPDATE public.email_templates SET subject = 'hack' WHERE id = 'aaaaaaaa-0000-0000-0000-000000000002' RETURNING 1) SELECT count(*) FROM u;"
expect_value 'B17 compartilhado intacto apos tentativa do outro' 's2' \
  "SELECT subject FROM public.email_templates WHERE id = 'aaaaaaaa-0000-0000-0000-000000000002';"
expect_value_as 'B18 staff edita o compartilhado (1 linha)' '1' "$JWT_STAFF" \
  "WITH u AS (UPDATE public.email_templates SET subject = 'editado pelo staff' WHERE id = 'aaaaaaaa-0000-0000-0000-000000000002' RETURNING 1) SELECT count(*) FROM u;"
expect_value 'B19 compartilhado editado pelo staff' 'editado pelo staff' \
  "SELECT subject FROM public.email_templates WHERE id = 'aaaaaaaa-0000-0000-0000-000000000002';"

# g) DELETE: so o dono. O compartilhado e VISIVEL a todos, entao a policy de DELETE
#    e de fato exercitada (se virar USING(true), B20 cai de 0 para 1).
expect_value_as 'B20 outro nao exclui o compartilhado do dono (0 linhas)' '0' "$JWT_OTHER" \
  "WITH d AS (DELETE FROM public.email_templates WHERE id = 'aaaaaaaa-0000-0000-0000-000000000002' RETURNING 1) SELECT count(*) FROM d;"
expect_value 'B21 compartilhado do dono segue existindo' '1' \
  "SELECT count(*) FROM public.email_templates WHERE id = 'aaaaaaaa-0000-0000-0000-000000000002';"
expect_value_as 'B22 staff nao exclui o compartilhado (staff so edita)' '0' "$JWT_STAFF" \
  "WITH d AS (DELETE FROM public.email_templates WHERE id = 'aaaaaaaa-0000-0000-0000-000000000002' RETURNING 1) SELECT count(*) FROM d;"
expect_value_as 'B23 outro nao exclui o privado do dono (0 linhas)' '0' "$JWT_OTHER" \
  "WITH d AS (DELETE FROM public.email_templates WHERE id = 'aaaaaaaa-0000-0000-0000-000000000001' RETURNING 1) SELECT count(*) FROM d;"
expect_value_as 'B24 dono exclui o compartilhado (1 linha)' '1' "$JWT_OWNER" \
  "WITH d AS (DELETE FROM public.email_templates WHERE id = 'aaaaaaaa-0000-0000-0000-000000000002' RETURNING 1) SELECT count(*) FROM d;"

# h) trigger de updated_at
expect_ok_as 'B25 dono atualiza o corpo (dispara gatilho)' "$JWT_OWNER" \
  "UPDATE public.email_templates SET body = 'novo corpo', updated_at = '2000-01-01T00:00:00Z' WHERE id = 'aaaaaaaa-0000-0000-0000-000000000001';"
expect_value 'B26 gatilho regravou updated_at' 't' \
  "SELECT updated_at > '2000-01-02'::timestamptz FROM public.email_templates WHERE id = 'aaaaaaaa-0000-0000-0000-000000000001';"

# h2) ACL: anon/PUBLIC sem grant; authenticated com os 4 verbos
expect_value 'B27 anon sem SELECT (grant)' 'f' \
  "SELECT has_table_privilege('anon', 'public.email_templates', 'SELECT');"
expect_value 'B28 authenticated com os 4 verbos' '4' \
  "SELECT count(*) FROM information_schema.role_table_grants WHERE table_name = 'email_templates' AND grantee = 'authenticated' AND privilege_type IN ('SELECT','INSERT','UPDATE','DELETE');"
expect_value 'B29 PUBLIC nao tem grant' '0' \
  "SELECT count(*) FROM information_schema.role_table_grants WHERE table_name = 'email_templates' AND grantee = 'PUBLIC';"

# ---------- ROLLBACK extraido do PROPRIO arquivo da migration ----------
sed -n '/^-- Rollback (SQL executável, na ordem):/,/^--$/p' "$migration" | grep '^--   ' | sed 's/^--   //' > "$tmp_dir/rollback.sql"
[[ -s "$tmp_dir/rollback.sql" ]] || fail 'rollback nao extraido do arquivo da migration'
psql_file "$tmp_dir/rollback.sql" >/dev/null
expect_value 'B30 rollback removeu a tabela' '0' \
  "SELECT count(*) FROM pg_class WHERE oid = to_regclass('public.email_templates');"
expect_value 'B31 rollback removeu as policies' '0' \
  "SELECT count(*) FROM pg_policies WHERE tablename = 'email_templates';"

# ---------- reaplica (idempotencia pos-rollback) ----------
psql_file "$migration" >/dev/null
expect_value 'B32 reaplicar recria a tabela' '1' \
  "SELECT count(*) FROM pg_class WHERE oid = to_regclass('public.email_templates');"

# ================= BLOCO C: hardening da autoria (created_by imutavel) =================
# Aplica a segunda migration (a correcao). Antes dela, o defeito e REPRODUZIDO em C1.
psql_file "$hardening" >/dev/null

# alvo: linha COMPARTILHADA do OWNER — a policy de UPDATE deixa o staff chegar nela.
psql_sql "INSERT INTO public.email_templates(id, name, subject, body, is_shared, created_by) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000003','Compartilhado p/ hardening','s3','b3',true,'$OWNER');" >/dev/null

# C1: staff tenta trocar a autoria da linha de outro -> a guarda REJEITA.
expect_error_as 'C1 staff nao reatribui a autoria da linha de outro (guardado)' \
  'email_templates_author_immutable' "$JWT_STAFF" \
  "UPDATE public.email_templates SET created_by = '$STAFF' WHERE id = 'aaaaaaaa-0000-0000-0000-000000000003';"
# C2: a autoria continua do OWNER (nada foi trocado — a migration e atomica: o UPDATE falhou inteiro).
expect_value 'C2 autoria preservada apos a tentativa' "$OWNER" \
  "SELECT created_by FROM public.email_templates WHERE id = 'aaaaaaaa-0000-0000-0000-000000000003';"
# C3: o dono segue dono: consegue editar o proprio modelo compartilhado.
expect_ok_as 'C3 dono continua editando o proprio modelo' "$JWT_OWNER" \
  "UPDATE public.email_templates SET subject = 'dono editou' WHERE id = 'aaaaaaaa-0000-0000-0000-000000000003';"
# C4: o dono segue podendo excluir o proprio modelo (prova de posse, nao so leitura).
expect_value_as 'C4 dono segue dono: consegue excluir o proprio modelo' '1' "$JWT_OWNER" \
  "WITH d AS (DELETE FROM public.email_templates WHERE id = 'aaaaaaaa-0000-0000-0000-000000000003' RETURNING 1) SELECT count(*) FROM d;"

# C5: staff ainda EDITA as demais colunas da linha compartilhada (a guarda nao regride o ET1).
psql_sql "INSERT INTO public.email_templates(id, name, subject, body, is_shared, created_by) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000005','Compartilhado p/ staff','s5','b5',true,'$OWNER');" >/dev/null
expect_value_as 'C5 staff ainda edita o corpo da linha compartilhada (nao regrediu)' '1' "$JWT_STAFF" \
  "WITH u AS (UPDATE public.email_templates SET subject = 'staff editou' WHERE id = 'aaaaaaaa-0000-0000-0000-000000000005' RETURNING 1) SELECT count(*) FROM u;"
expect_value 'C6 a edicao do staff preservou a autoria do dono' "$OWNER" \
  "SELECT created_by FROM public.email_templates WHERE id = 'aaaaaaaa-0000-0000-0000-000000000005';"

# C7: service_role (back-office, BYPASSRLS) NAO e barrado pela guarda — escopo minimo.
#     (vale so para o ator authenticated, como enforce_multiplix_dispatch_mutability)
svc_out="$(psql_sql "SET ROLE service_role; UPDATE public.email_templates SET created_by = '$OTHER' WHERE id = 'aaaaaaaa-0000-0000-0000-000000000005'; SELECT created_by FROM public.email_templates WHERE id = 'aaaaaaaa-0000-0000-0000-000000000005';" | tail -n1)"
[[ "$svc_out" == "$OTHER" ]] || fail "C7 service_role deveria poder reatribuir (escopo minimo); obtido '$svc_out'"
printf '[PASS] %s\n' 'C7 service_role segue livre para back-office'
psql_sql "UPDATE public.email_templates SET created_by = '$OWNER' WHERE id = 'aaaaaaaa-0000-0000-0000-000000000005';" >/dev/null

# ================= BLOCO D: rollback do hardening + idempotencia =================
sed -n '/^-- Rollback (SQL executável, na ordem):/,/^--$/p' "$hardening" | grep '^--   ' | sed 's/^--   //' > "$tmp_dir/hardening_rollback.sql"
[[ -s "$tmp_dir/hardening_rollback.sql" ]] || fail 'rollback do hardening nao extraido do arquivo da migration'
psql_file "$tmp_dir/hardening_rollback.sql" >/dev/null
expect_value 'D1 rollback do hardening removeu o gatilho' '0' \
  "SELECT count(*) FROM pg_trigger WHERE tgname = 'guard_email_templates_author_mutability';"
expect_value 'D2 rollback do hardening removeu a funcao' '0' \
  "SELECT count(*) FROM pg_proc WHERE proname = 'guard_email_templates_author_mutability';"
expect_value 'D3 rollback do hardening nao derrubou a tabela (base intacta)' '1' \
  "SELECT count(*) FROM pg_class WHERE oid = to_regclass('public.email_templates');"
psql_file "$hardening" >/dev/null
expect_value 'D4 reaplicar o hardening recria a funcao' '1' \
  "SELECT count(*) FROM pg_proc WHERE proname = 'guard_email_templates_author_mutability';"
expect_value 'D5 reaplicar o hardening recria o gatilho (idempotente)' '1' \
  "SELECT count(*) FROM pg_trigger WHERE tgname = 'guard_email_templates_author_mutability';"

printf '== TODOS OS PASSOS PASSARAM ==\n'
