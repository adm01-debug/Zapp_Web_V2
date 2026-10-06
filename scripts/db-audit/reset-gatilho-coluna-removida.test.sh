#!/usr/bin/env bash
# R2-DB-023 (item 304 / #304, P2) — "Trigger de recuperacao ainda escreve campo removido e bloqueia
# o pedido autenticado" (docs/reconciliation/reaudit/2026-10-03/reports/database/findings.json,
# achado R2-DB-023; consumidor src/pages/ForgotPassword.tsx).
#
# Roda o MESMO roteiro no mesmo container descartavel, em dois blocos:
#   BLOCO A — estado ANTERIOR (defeito), fiel ao canonico:
#             a coluna reset_token ja NAO existe (20260411111454), mas o gatilho BEFORE INSERT
#             public.sanitize_reset_request_trigger continua vivo e o corpo vencedor de
#             public.sanitize_reset_request() (20260410103156) escreve `NEW.reset_token := NULL`
#             quando auth.uid() existe. O plpgsql levanta `record "new" has no field "reset_token"`
#             ANTES de gravar: TODO INSERT na tabela morre — inclusive o do usuario LOGADO
#             (payload valido, email do proprio usuario, permitido pela policy de INSERT).
#   BLOCO B — migration real aplicada: o corpo novo nao cita a coluna removida; o pedido do usuario
#             autenticado passa a persistir como 'pending' e com os campos de revisao/token sempre
#             saneados; o rate limit canonico segue valendo e o caminho sem sessao (resolucao
#             server-side por auth.users) permanece vivo. Nada de DDL/policy: so o corpo da funcao.

set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
migration="${RESET_GATILHO_MIGRATION:-$repo_root/supabase/migrations/20261006231105_recuperacao_gatilho_sem_coluna_removida.sql}"
postgres_image="${RESET_GATILHO_TEST_POSTGRES_IMAGE:-postgres:17-alpine}"
container_name="zapp-v2-reset-gatilho-test-$$"

cleanup() {
  if [[ "$container_name" =~ ^zapp-v2-reset-gatilho-test-[0-9]+$ ]]; then
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
as_role() {  # as_role <papel> <jwt|-> <sql>
  local role="$1" jwt="$2" sql="$3" claims
  if [[ "$jwt" == "-" ]]; then claims=""; else claims="SELECT set_config('request.jwt.claims', '$jwt', false);"; fi
  docker exec "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres \
    -c "SET ROLE $role; $claims $sql"
}
expect_value() {
  local l="$1" e="$2" s="$3" a
  a="$(psql_sql "$s" | tail -n1)"
  [[ "$a" == "$e" ]] || fail "$l: esperado '$e', obtido '$a'"
  printf '[PASS] %s\n' "$l"
}
expect_value_as() {
  local l="$1" e="$2" r="$3" j="$4" s="$5" a
  a="$(as_role "$r" "$j" "$s" | tail -n1)"
  [[ "$a" == "$e" ]] || fail "$l: esperado '$e', obtido '$a'"
  printf '[PASS] %s\n' "$l"
}
expect_error_as() {
  local l="$1" needle="$2" r="$3" j="$4" s="$5" out st
  set +e; out="$(as_role "$r" "$j" "$s" 2>&1)"; st=$?; set -e
  (( st == 0 )) && { printf '%s\n' "$out" >&2; fail "$l: deveria falhar, mas passou"; }
  [[ "$out" == *"$needle"* ]] || { printf '%s\n' "$out" >&2; fail "$l: esperava '$needle' no erro"; }
  printf '[PASS] %s\n' "$l"
}
expect_ok_as() {
  local l="$1" r="$2" j="$3" s="$4"
  as_role "$r" "$j" "$s" >/dev/null || fail "$l: deveria ter sucesso ($r)"
  printf '[PASS] %s\n' "$l"
}

command -v docker >/dev/null 2>&1 || fail 'Docker nao esta instalado'
docker info >/dev/null 2>&1 || fail 'Docker daemon nao esta acessivel'
[[ -f "$migration" ]] || fail "migration nao encontrada: $migration"

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

# ---------------------------------------------------------------------------------------------
# Estado ANTERIOR canonico: papeis da API, auth.users/auth.uid(), password_reset_requests JA SEM a
# coluna reset_token (removida em 20260411111454), a policy de INSERT TO authenticated, os DOIS
# gatilhos REAIS (BEFORE INSERT) e o corpo VIGENTE de sanitize_reset_request — que cita a coluna
# morta reset_token: esse e o defeito.
# ---------------------------------------------------------------------------------------------
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

CREATE TABLE auth.users (
  id uuid PRIMARY KEY,
  email text
);

-- Tabela no estado ATUAL (sem reset_token). Colunas reais da tabela.
CREATE TABLE public.password_reset_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  reason text,
  status text NOT NULL DEFAULT 'pending',
  reviewed_by uuid REFERENCES auth.users(id),
  reviewed_at timestamptz,
  rejection_reason text,
  token_expires_at timestamptz,
  ip_address text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT password_reset_requests_status_check CHECK (status IN ('pending','approved','rejected'))
);
ALTER TABLE public.password_reset_requests ENABLE ROW LEVEL SECURITY;

-- Policy de SELECT do admin (no teste so existe o ramo autenticado comum).
CREATE POLICY "Admins can view reset requests" ON public.password_reset_requests FOR SELECT TO authenticated
  USING (false);
-- Policy de INSERT vigente para o caminho autenticado.
CREATE POLICY "Users can request own password reset" ON public.password_reset_requests FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Corpo VIGENTE (20260410103156): cita NEW.reset_token, coluna ja removida -> ESTE e o defeito.
CREATE OR REPLACE FUNCTION public.sanitize_reset_request()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
BEGIN
  IF auth.uid() IS NOT NULL THEN
    NEW.reset_token := NULL;
    NEW.token_expires_at := NULL;
    NEW.reviewed_by := NULL;
    NEW.reviewed_at := NULL;
    NEW.rejection_reason := NULL;
    NEW.status := 'pending';
  END IF;
  RETURN NEW;
END;
$function$;
CREATE TRIGGER sanitize_reset_request_trigger BEFORE INSERT ON public.password_reset_requests
  FOR EACH ROW EXECUTE FUNCTION public.sanitize_reset_request();

-- Gatilho canonico de rate limit (20260410105209).
CREATE OR REPLACE FUNCTION public.rate_limit_reset_requests()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  v_pending_count integer;
BEGIN
  SELECT COUNT(*) INTO v_pending_count
  FROM public.password_reset_requests
  WHERE user_id = NEW.user_id
    AND status = 'pending'
    AND created_at > now() - interval '1 hour';

  IF v_pending_count >= 3 THEN
    RAISE EXCEPTION 'Too many pending reset requests. Please wait before trying again.';
  END IF;

  RETURN NEW;
END;
$function$;
CREATE TRIGGER trg_rate_limit_reset BEFORE INSERT ON public.password_reset_requests
  FOR EACH ROW EXECUTE FUNCTION public.rate_limit_reset_requests();

-- Grants REAIS da tabela para os papeis da API.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.password_reset_requests TO authenticated, anon, service_role;

-- Regra do repo (20261001191230): funcoes de gatilho sem EXECUTE para os papeis da API.
REVOKE EXECUTE ON FUNCTION public.sanitize_reset_request() FROM PUBLIC, anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.rate_limit_reset_requests() FROM PUBLIC, anon, authenticated, service_role;
SQL

cat > "$tmp_dir/seed.sql" <<'SQL'
DELETE FROM public.password_reset_requests;
DELETE FROM auth.users;

INSERT INTO auth.users (id, email) VALUES
  ('11111111-1111-1111-1111-111111111111', 'ti.existente@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'Outro.Usuario@Example.COM');
SQL

psql_file "$tmp_dir/pre.sql" >/dev/null
psql_file "$tmp_dir/seed.sql" >/dev/null

U_EXISTE='{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}'

printf '\n============ BLOCO A — estado ANTERIOR (defeito) ============\n'

# O usuario LOGADO manda um payload que a RLS PERMITE (user_id = auth.uid(), email do proprio).
# O gatilho cita a coluna removida antes de gravar -> o INSERT inteiro aborta.
expect_error_as 'A.1 (DEFEITO) pedido logado do proprio usuario e abortado: o gatilho cita a coluna removida reset_token' \
  'has no field "reset_token"' authenticated "$U_EXISTE" \
  "INSERT INTO public.password_reset_requests (user_id, email, reason) VALUES ('11111111-1111-1111-1111-111111111111','ti.existente@example.com','auto');"
expect_value 'A.2 (DEFEITO) nenhuma solicitacao foi persistida — o admin nunca recebe o pedido' '0' \
  "SELECT count(*) FROM public.password_reset_requests;"

printf '\n============ BLOCO B — migration aplicada ============\n'
psql_file "$migration" >/dev/null
psql_file "$tmp_dir/seed.sql" >/dev/null

# B.1/B.2 o pedido do usuario LOGADO (o caminho do cartao) passa a persistir, saneado.
expect_ok_as 'B.1 logado registra o proprio pedido (user_id = auth.uid())' \
  authenticated "$U_EXISTE" \
  "INSERT INTO public.password_reset_requests (user_id, email, reason) VALUES ('11111111-1111-1111-1111-111111111111','ti.existente@example.com','auto');"
expect_value 'B.2 o pedido nasceu pending, do proprio usuario, com o motivo' '1|pending|auto' \
  "SELECT count(*)::text||'|'||coalesce(min(status),'-')||'|'||coalesce(min(reason),'-') FROM public.password_reset_requests WHERE user_id='11111111-1111-1111-1111-111111111111';"

# B.3/B.4 o cliente nao forja status/revisao/token — o gatilho continua sendo a fronteira.
expect_ok_as 'B.3 logado tenta forjar status/revisao/token no proprio pedido' \
  authenticated "$U_EXISTE" \
  "INSERT INTO public.password_reset_requests (user_id, email, reason, status, reviewed_by, reviewed_at, rejection_reason, token_expires_at) VALUES ('11111111-1111-1111-1111-111111111111','ti.existente@example.com','forja','approved','11111111-1111-1111-1111-111111111111', now(), 'aprovado por mim', now());"
expect_value 'B.4 ...e a linha nasceu pending e limpa (sanitizacao preservada)' '1|1|1|1|1' \
  "SELECT count(*)::text||'|'||(count(*) FILTER (WHERE status='pending'))::text||'|'||(count(*) FILTER (WHERE reviewed_by IS NULL))::text||'|'||(count(*) FILTER (WHERE reviewed_at IS NULL AND rejection_reason IS NULL))::text||'|'||(count(*) FILTER (WHERE token_expires_at IS NULL))::text FROM public.password_reset_requests WHERE user_id='11111111-1111-1111-1111-111111111111' AND reason='forja';"

# B.5/B.6 rate limit canonico preservado (3 pendentes por hora).
expect_ok_as 'B.5 terceiro pedido pendente do mesmo usuario ainda passa' \
  authenticated "$U_EXISTE" \
  "INSERT INTO public.password_reset_requests (user_id, email, reason) VALUES ('11111111-1111-1111-1111-111111111111','ti.existente@example.com','terceiro');"
expect_error_as 'B.6 o quarto pedido pendente na hora e barrado pelo rate limit do banco' \
  'Too many pending reset requests' authenticated "$U_EXISTE" \
  "INSERT INTO public.password_reset_requests (user_id, email, reason) VALUES ('11111111-1111-1111-1111-111111111111','ti.existente@example.com','quarto');"

# B.7/B.8 caminho SEM sessao (o bloco ELSE da funcao, ja estabelecido pelo cartao irmao) segue vivo:
# o email e resolvido no servidor contra auth.users (service_role bypassa RLS e exercita o gatilho).
expect_ok_as 'B.7 sem sessao: pedido por email de conta existente e resolvido no servidor' \
  service_role - \
  "INSERT INTO public.password_reset_requests (email, reason) VALUES ('  outro.usuario@EXAMPLE.com  ','sem sessao');"
expect_value 'B.8 ...e a linha nasceu com o user_id/email canonicos do auth.users e pending' '1|Outro.Usuario@Example.COM|pending' \
  "SELECT count(*)::text||'|'||coalesce(min(email),'-')||'|'||coalesce(min(status),'-') FROM public.password_reset_requests WHERE user_id='22222222-2222-2222-2222-222222222222';"

# B.9/B.10 conta inexistente nao grava e nao revela (RETURN NULL).
expect_ok_as 'B.9 sem sessao, conta inexistente nao gera erro' \
  service_role - "INSERT INTO public.password_reset_requests (email) VALUES ('ninguem@example.com');"
expect_value 'B.10 ...e nada foi gravado para o email inexistente' '0' \
  "SELECT count(*) FROM public.password_reset_requests WHERE email='ninguem@example.com';"

# B.11 regra do repo: funcao de gatilho sem EXECUTE para os papeis da API.
expect_value 'B.11 gatilho sem EXECUTE para anon nem authenticated (e portanto nem via PUBLIC)' \
  '0|0' \
  "SELECT (has_function_privilege('anon','public.sanitize_reset_request()','EXECUTE'))::int||'|'||(has_function_privilege('authenticated','public.sanitize_reset_request()','EXECUTE'))::int;"

printf '\nPASS: R2-DB-023 — o gatilho de recuperacao nao cita mais a coluna removida reset_token; o pedido do usuario autenticado persiste como solicitacao pendente e saneada, o rate limit canonico segue valendo e o caminho sem sessao continua resolvendo a conta no servidor.\n'
