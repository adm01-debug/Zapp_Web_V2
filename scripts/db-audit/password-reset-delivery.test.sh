#!/usr/bin/env bash
# R2-AUTH-007 (item 73) — "Aprovar recuperacao gera link que a UI descarta e anuncia
# email nao enviado": sem colunas de entrega o banco nao registra nem distingue
# 'sent' de 'failed', e a view segura nao expoe o estado para a UI refletir.
#
# Roda no mesmo container, em dois blocos:
#   BLOCO A — estado ANTERIOR (defeito), fiel ao canonico de hoje
#             (20260411111454 + security_invoker): a tabela nao tem
#             delivery_status/delivered_at/delivery_error e a view nao expoe
#             nenhum estado de entrega.
#   BLOCO B — migration aplicada: as 3 colunas existem, o CHECK so aceita
#             queued/sent/failed, a view expoe delivery_status/delivered_at,
#             security_invoker segue ligado e os GRANT SELECT continuam.
#   BLOCO B2 — segunda migration (20261005234417) aplicada: a view volta ao
#             contrato de hoje ACRESCENTANDO as colunas de entrega — ip_address
#             e user_agent continuam expostos (o painel mostra "IP:"), o que o
#             cartao original nao pedia mudar.
#   BLOCO C — o SQL do cabecalho Rollback da primeira migration restaura a view
#             anterior (com ip_address/user_agent e sem estado de entrega) e
#             dropa as 3 colunas.
#   BLOCO D — o Rollback do cabecalho da segunda migration desfaz so a parte
#             dela: a view volta a forma deixada pela primeira (com as colunas de
#             entrega, sem ip_address/user_agent) e o COMMENT anterior volta.

set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
migration="$repo_root/supabase/migrations/20261005232640_password_reset_delivery_status.sql"
migration2="$repo_root/supabase/migrations/20261005234417_password_reset_safe_view_keep_ip.sql"
postgres_image="${PASSWORD_RESET_DELIVERY_TEST_POSTGRES_IMAGE:-postgres:17-alpine}"
container_name="zapp-v2-password-reset-delivery-$$"

cleanup() {
  if [[ "$container_name" =~ ^zapp-v2-password-reset-delivery-[0-9]+$ ]]; then
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
expect_error() {
  local l="$1" needle="$2" s="$3" out st
  set +e; out="$(psql_sql "$s" 2>&1)"; st=$?; set -e
  (( st == 0 )) && { printf '%s\n' "$out" >&2; fail "$l: deveria falhar, mas passou"; }
  [[ "$out" == *"$needle"* ]] || { printf '%s\n' "$out" >&2; fail "$l: esperava '$needle' no erro"; }
  printf '[PASS] %s\n' "$l"
}

extrair_rollback() {  # extrair_rollback <migration> <destino>
  # Extrai o SQL de rollback: as linhas "--   <sql>" que seguem o marcador
  # "-- Rollback (completo):" ate a primeira linha que nao e SQL indentado.
  awk '
    /^-- Rollback \(completo\):/ { in_rb=1; next }
    in_rb && /^--   / { sub(/^--   /, ""); print; next }
    in_rb { in_rb=0 }
  ' "$1" > "$2"
}

command -v docker >/dev/null 2>&1 || fail 'Docker nao esta instalado'
docker info >/dev/null 2>&1 || fail 'Docker daemon nao esta acessivel'
[[ -f "$migration" ]] || fail "migration nao encontrada: $migration"
[[ -f "$migration2" ]] || fail "migration nao encontrada: $migration2"

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

# Superficie minima fiel ao estado de HOJE (pre-migration):
#   - tabela na forma atual (13 colunas; reset_token ja saiu em 20260411111454)
#   - RLS e as policies atuais (admin ve/atualiza/apaga; dono insere)
#   - view password_reset_requests_safe na forma atual (20260411111454), com
#     security_invoker e os GRANT SELECT para authenticated/service_role
cat > "$tmp_dir/pre.sql" <<'SQL'
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;

CREATE SCHEMA auth;
CREATE TABLE auth.users (id uuid PRIMARY KEY DEFAULT gen_random_uuid());
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
  AS $$ SELECT coalesce(
       nullif(current_setting('request.jwt.claim.sub', true), ''),
       nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'
     )::uuid $$;
GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;

CREATE TYPE public.app_role AS ENUM ('admin', 'supervisor', 'agent');
CREATE TABLE public.user_roles (
  user_id uuid NOT NULL,
  role public.app_role NOT NULL,
  PRIMARY KEY (user_id, role)
);

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  );
$function$;

CREATE OR REPLACE FUNCTION public.is_admin_or_supervisor(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role IN ('admin', 'supervisor')
  );
$function$;

CREATE TABLE public.password_reset_requests (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  reason text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_by uuid REFERENCES auth.users(id),
  reviewed_at timestamptz,
  rejection_reason text,
  token_expires_at timestamptz,
  ip_address text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.password_reset_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view reset requests"
ON public.password_reset_requests FOR SELECT TO authenticated
USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can request own password reset"
ON public.password_reset_requests FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Admins can update reset requests without token access"
ON public.password_reset_requests FOR UPDATE TO authenticated
USING (has_role(auth.uid(), 'admin'))
WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete password reset requests"
ON public.password_reset_requests FOR DELETE TO authenticated
USING (has_role(auth.uid(), 'admin'));

-- View na forma de HOJE (20260411111454): inclui ip_address/user_agent. O Bloco B
-- mostra a 1a migration recriando a view sem eles; o Bloco B2 mostra a 2a migration
-- devolvendo o contrato de hoje + as colunas de entrega (aditivo puro).
CREATE VIEW public.password_reset_requests_safe WITH (security_invoker = on) AS
SELECT id, user_id, email, reason, status, reviewed_by, reviewed_at,
       rejection_reason, token_expires_at, ip_address, user_agent, created_at, updated_at
FROM public.password_reset_requests;

GRANT SELECT ON public.password_reset_requests_safe TO authenticated;
GRANT SELECT ON public.password_reset_requests_safe TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.password_reset_requests TO authenticated;

INSERT INTO auth.users (id) VALUES
  ('66666666-6666-6666-6666-666666666666'),
  ('11111111-1111-1111-1111-111111111111');
INSERT INTO public.user_roles (user_id, role) VALUES
  ('66666666-6666-6666-6666-666666666666', 'admin');
INSERT INTO public.password_reset_requests (id, user_id, email, reason, status)
VALUES ('aaaaaaaa-0000-0000-0000-0000000000aa', '11111111-1111-1111-1111-111111111111',
        'fulano@example.com', 'esqueci', 'pending');
SQL

psql_file "$tmp_dir/pre.sql" >/dev/null

ADM='{"sub":"66666666-6666-6666-6666-666666666666","role":"authenticated"}'

printf '\n============ BLOCO A — estado ANTERIOR (defeito) ============\n'

expect_value 'A.1 (DEFEITO) a tabela nao tem coluna de estado de entrega' '0' \
  "SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='password_reset_requests' AND column_name IN ('delivery_status','delivered_at','delivery_error');"
expect_value 'A.2 (DEFEITO) a view nao expoe nenhum estado de entrega' '0' \
  "SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='password_reset_requests_safe' AND column_name IN ('delivery_status','delivered_at','delivery_error');"
expect_value_as 'A.3 admin le a view hoje (controle: superficie existe)' '1' \
  "$ADM" "SELECT count(*) FROM public.password_reset_requests_safe WHERE email='fulano@example.com';"

printf '\n============ BLOCO B — migration aplicada ============\n'
psql_file "$migration" >/dev/null

expect_value 'B.1 as 3 colunas de entrega existem' '3' \
  "SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='password_reset_requests' AND column_name IN ('delivery_status','delivered_at','delivery_error');"
expect_value 'B.2 CHECK existe e cobre delivery_status' '1' \
  "SELECT count(*) FROM pg_constraint WHERE conname='password_reset_requests_delivery_status_check';"

psql_sql "UPDATE public.password_reset_requests SET delivery_status='queued' WHERE id='aaaaaaaa-0000-0000-0000-0000000000aa';" >/dev/null
expect_value 'B.3a CHECK aceita queued' 'queued' \
  "SELECT delivery_status FROM public.password_reset_requests WHERE id='aaaaaaaa-0000-0000-0000-0000000000aa';"
psql_sql "UPDATE public.password_reset_requests SET delivery_status='sent' WHERE id='aaaaaaaa-0000-0000-0000-0000000000aa';" >/dev/null
expect_value 'B.3b CHECK aceita sent' 'sent' \
  "SELECT delivery_status FROM public.password_reset_requests WHERE id='aaaaaaaa-0000-0000-0000-0000000000aa';"
psql_sql "UPDATE public.password_reset_requests SET delivery_status='failed' WHERE id='aaaaaaaa-0000-0000-0000-0000000000aa';" >/dev/null
expect_value 'B.3c CHECK aceita failed' 'failed' \
  "SELECT delivery_status FROM public.password_reset_requests WHERE id='aaaaaaaa-0000-0000-0000-0000000000aa';"
expect_error 'B.4 CHECK rejeita valor invalido' 'password_reset_requests_delivery_status_check' \
  "UPDATE public.password_reset_requests SET delivery_status='bouncing' WHERE id='aaaaaaaa-0000-0000-0000-0000000000aa';"
psql_sql "UPDATE public.password_reset_requests SET delivery_status=NULL WHERE id='aaaaaaaa-0000-0000-0000-0000000000aa';" >/dev/null
expect_value 'B.5 NULL continua aceito (linhas antigas)' 't' \
  "SELECT delivery_status IS NULL FROM public.password_reset_requests WHERE id='aaaaaaaa-0000-0000-0000-0000000000aa';"

expect_value 'B.6 a view expoe as 2 colunas de entrega' '2' \
  "SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='password_reset_requests_safe' AND column_name IN ('delivery_status','delivered_at');"
expect_value 'B.7 (so a 1a migration) a view recriada ficou sem ip_address/user_agent/reset_token' '0' \
  "SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='password_reset_requests_safe' AND column_name IN ('ip_address','user_agent','reset_token');"
expect_value 'B.8 security_invoker segue ligado' 't' \
  "SELECT 'security_invoker=on' = ANY(reloptions) FROM pg_class WHERE relname='password_reset_requests_safe';"
expect_value 'B.9 GRANT SELECT para authenticated e service_role seguem' '2' \
  "SELECT count(*) FROM information_schema.role_table_grants WHERE table_schema='public' AND table_name='password_reset_requests_safe' AND privilege_type='SELECT' AND grantee IN ('authenticated','service_role');"
expect_value_as 'B.10 admin le o estado de entrega pela view (papel de usuario)' 'failed' \
  "$ADM" "UPDATE public.password_reset_requests SET delivery_status='failed' WHERE id='aaaaaaaa-0000-0000-0000-0000000000aa'; SELECT delivery_status FROM public.password_reset_requests_safe WHERE id='aaaaaaaa-0000-0000-0000-0000000000aa';"

printf '\n============ BLOCO B2 — 2a migration: view de volta ao contrato de hoje + entrega ============\n'
psql_file "$migration2" >/dev/null

expect_value 'B2.1 a view volta a expor ip_address/user_agent (contrato de hoje preservado)' '2' \
  "SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='password_reset_requests_safe' AND column_name IN ('ip_address','user_agent');"
expect_value 'B2.2 e segue expondo as 2 colunas de entrega' '2' \
  "SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='password_reset_requests_safe' AND column_name IN ('delivery_status','delivered_at');"
expect_value 'B2.3 security_invoker segue ligado' 't' \
  "SELECT 'security_invoker=on' = ANY(reloptions) FROM pg_class WHERE relname='password_reset_requests_safe';"
expect_value 'B2.4 GRANT SELECT para authenticated e service_role seguem' '2' \
  "SELECT count(*) FROM information_schema.role_table_grants WHERE table_schema='public' AND table_name='password_reset_requests_safe' AND privilege_type='SELECT' AND grantee IN ('authenticated','service_role');"
expect_value_as 'B2.5 admin le IP e estado de entrega pela view (papel de usuario)' 'failed|10.0.0.9' \
  "$ADM" "UPDATE public.password_reset_requests SET delivery_status='failed', ip_address='10.0.0.9' WHERE id='aaaaaaaa-0000-0000-0000-0000000000aa'; SELECT delivery_status || '|' || ip_address FROM public.password_reset_requests_safe WHERE id='aaaaaaaa-0000-0000-0000-0000000000aa';"

printf '\n============ BLOCO C — Rollback da 2a migration ============\n'
extrair_rollback "$migration2" "$tmp_dir/rollback2.sql"
grep -q 'DROP VIEW' "$tmp_dir/rollback2.sql" || fail 'rollback da 2a migration nao recria a view'
grep -q 'COMMENT ON VIEW' "$tmp_dir/rollback2.sql" || fail 'rollback da 2a migration nao volta o COMMENT'
psql_file "$tmp_dir/rollback2.sql" >/dev/null

expect_value 'C.1 rollback da 2a migration: view volta sem ip_address/user_agent' '0' \
  "SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='password_reset_requests_safe' AND column_name IN ('ip_address','user_agent');"
expect_value 'C.2 e com as colunas de entrega (estado deixado pela 1a)' '2' \
  "SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='password_reset_requests_safe' AND column_name IN ('delivery_status','delivered_at');"
expect_value 'C.3 GRANT SELECT da view restaurada' '2' \
  "SELECT count(*) FROM information_schema.role_table_grants WHERE table_schema='public' AND table_name='password_reset_requests_safe' AND privilege_type='SELECT' AND grantee IN ('authenticated','service_role');"
expect_value 'C.4 COMMENT anterior volta' 'Safe view hiding reset_token, ip_address, and user_agent columns' \
  "SELECT obj_description('public.password_reset_requests_safe'::regclass,'pg_class');"
expect_value_as 'C.5 admin segue lendo a view' '1' \
  "$ADM" "SELECT count(*) FROM public.password_reset_requests_safe WHERE email='fulano@example.com';"

printf '\n============ BLOCO D — Rollback da 1a migration ============\n'
extrair_rollback "$migration" "$tmp_dir/rollback.sql"
grep -q 'DROP VIEW' "$tmp_dir/rollback.sql" || fail 'rollback do cabecalho nao contem o recria da view'
grep -q 'DROP COLUMN' "$tmp_dir/rollback.sql" || fail 'rollback do cabecalho nao dropa as colunas'
psql_file "$tmp_dir/rollback.sql" >/dev/null

expect_value 'D.1 rollback removeu as 3 colunas' '0' \
  "SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='password_reset_requests' AND column_name IN ('delivery_status','delivered_at','delivery_error');"
expect_value 'D.2 rollback removeu o CHECK' '0' \
  "SELECT count(*) FROM pg_constraint WHERE conname='password_reset_requests_delivery_status_check';"
expect_value 'D.3 rollback restaurou a view anterior (com ip_address/user_agent de volta)' '2' \
  "SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='password_reset_requests_safe' AND column_name IN ('ip_address','user_agent');"
expect_value 'D.4 view restaurada nao carrega coluna de entrega' '0' \
  "SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='password_reset_requests_safe' AND column_name IN ('delivery_status','delivered_at');"
expect_value 'D.5 GRANT SELECT da view restaurada' '2' \
  "SELECT count(*) FROM information_schema.role_table_grants WHERE table_schema='public' AND table_name='password_reset_requests_safe' AND privilege_type='SELECT' AND grantee IN ('authenticated','service_role');"
expect_value_as 'D.6 admin volta a ler a view restaurada' '1' \
  "$ADM" "SELECT count(*) FROM public.password_reset_requests_safe WHERE email='fulano@example.com';"

printf '\n[OK] password-reset-delivery: todos os blocos passaram\n'
