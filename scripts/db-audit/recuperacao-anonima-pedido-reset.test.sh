#!/usr/bin/env bash
# R2-AUTH-006 (item 72 / P1) — "Recuperacao anonima consulta profiles protegido e nao cria
# solicitacao" (docs/reconciliation/reaudit/2026-10-03/reports/auth/findings.json, achado
# R2-AUTH-006; consumidor src/pages/ForgotPassword.tsx:37-68).
#
# Roda o MESMO roteiro no mesmo container, em dois blocos:
#   BLOCO A — estado ANTERIOR (defeito), fiel ao canonico:
#             * `profiles` esconde a conta de quem nao tem sessao: o SELECT do /forgot-password
#               devolve 0 linhas como anon -> a tela mostra sucesso generico e nem tenta o INSERT;
#             * a policy de INSERT e TO authenticated com `user_id = auth.uid()`: o anon nao tem
#               caminho nenhum para registrar o pedido;
#             * o gatilho public.sanitize_reset_request() escreve em NEW.reset_token, coluna
#               removida em 20260827170000_drop_dead_reset_token_subsystem: ate o caminho
#               authenticated morre em `record "new" has no field "reset_token"`.
#             Resultado: NENHUMA solicitacao e persistida (o pedido nunca chega ao admin).
#   BLOCO B — migration real aplicada: identidade resolvida no servidor (auth.users) para quem
#             nao tem sessao, conta inexistente nao grava e nao revela, o cliente nao forja
#             status/revisao/token nem atribui o pedido a outra conta, e o revisor (service_role)
#             ve a solicitacao pendente. Caminho authenticated ainda usa o rate limit com erro; no caminho anonimo o mesmo limite e silencioso.

set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
migration="${RECUPERACAO_ANONIMA_MIGRATION:-$repo_root/supabase/migrations/20261015182400_recuperacao_anonima_pedido_reset.sql}"
postgres_image="${RECUPERACAO_ANONIMA_TEST_POSTGRES_IMAGE:-postgres:17-alpine}"
container_name="zapp-v2-recuperacao-anonima-test-$$"

cleanup() {
  if [[ "$container_name" =~ ^zapp-v2-recuperacao-anonima-test-[0-9]+$ ]]; then
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
expect_same_success_as() {
  local l="$1" r="$2" j="$3" left_sql="$4" right_sql="$5" left_out right_out left_st right_st
  set +e; left_out="$(as_role "$r" "$j" "$left_sql" 2>&1)"; left_st=$?; set -e
  (( left_st == 0 )) || { printf '%s\n' "$left_out" >&2; fail "$l: caso de referencia deveria passar"; }
  set +e; right_out="$(as_role "$r" "$j" "$right_sql" 2>&1)"; right_st=$?; set -e
  (( right_st == 0 )) || { printf '%s\n' "$right_out" >&2; fail "$l: caso limitado deveria passar em silencio como a referencia"; }
  [[ "$right_out" == "$left_out" ]] || {
    printf 'referencia:\n%s\nlimitado:\n%s\n' "$left_out" "$right_out" >&2
    fail "$l: resposta publica diferente"
  }
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
# Estado ANTERIOR canonico: papeis da API, auth.users/auth.uid(), profiles com as policies TO
# authenticated, password_reset_requests com a policy de INSERT TO authenticated, os DOIS
# gatilhos reais e os grants reais (anon ja tem INSERT de TABELA — o que falta e a policy).
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

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  email text,
  role text DEFAULT 'agent',
  is_active boolean DEFAULT true
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT TO authenticated
  USING (user_id = auth.uid());

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
CREATE POLICY "Admins can view reset requests" ON public.password_reset_requests FOR SELECT TO authenticated
  USING (false);  -- no teste so existe o ramo admin canonico; o foco e o caminho anonimo
CREATE POLICY "Users can request own password reset" ON public.password_reset_requests FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Gatilhos REAIS, com o corpo vigente (a referencia a reset_token E o defeito)
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

-- Grants REAIS da tabela (anon ja tem INSERT de tabela na producao)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.password_reset_requests TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.password_reset_requests TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.password_reset_requests TO service_role;
GRANT SELECT ON public.profiles TO authenticated;
GRANT SELECT ON public.profiles TO anon;
SQL

cat > "$tmp_dir/seed.sql" <<'SQL'
DELETE FROM public.password_reset_requests;
DELETE FROM public.profiles;
DELETE FROM auth.users;

-- U_EXISTE: conta real. O profiles dela tem email NULO (o caso que o cliente lia e nao achava).
-- U_CASE: conta real com email em caixa mista no auth.users.
-- U_OUTRO: conta real, usada para provar que o cliente nao atribui o pedido a outra conta.
INSERT INTO auth.users (id, email) VALUES
  ('11111111-1111-1111-1111-111111111111', 'ti.existente@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'Outro.Usuario@Example.COM'),
  ('33333333-3333-3333-3333-333333333333', 'terceiro@example.com');

INSERT INTO public.profiles (id, user_id, email) VALUES
  ('a0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', NULL),
  ('a0000000-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222', 'divergente@example.com'),
  ('a0000000-0000-0000-0000-000000000003', '33333333-3333-3333-3333-333333333333', 'terceiro@example.com');
SQL

psql_file "$tmp_dir/pre.sql" >/dev/null
psql_file "$tmp_dir/seed.sql" >/dev/null

U_EXISTE='{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}'
U_CASE='{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}'
ANON='{"role":"anon"}'

printf '\n============ BLOCO A — estado ANTERIOR (defeito) ============\n'

expect_value_as 'A.1 (DEFEITO) sem sessao a conta fica invisivel: o SELECT do /forgot-password devolve 0 linhas' \
  '0' anon "$ANON" "SELECT count(*) FROM public.profiles WHERE email = 'ti.existente@example.com';"
expect_error_as 'A.2 (DEFEITO) anon nao tem policy de INSERT: o pedido e recusado pela RLS' \
  'row-level security' anon "$ANON" \
  "INSERT INTO public.password_reset_requests (email, reason, user_agent) VALUES ('ti.existente@example.com','esqueci','probe');"
expect_error_as 'A.3 (DEFEITO) nem logado grava: o gatilho cita a coluna morta reset_token' \
  'has no field "reset_token"' authenticated "$U_EXISTE" \
  "INSERT INTO public.password_reset_requests (user_id, email) VALUES ('11111111-1111-1111-1111-111111111111','ti.existente@example.com');"
expect_value 'A.4 (DEFEITO) nenhuma solicitacao foi persistida — o admin nunca recebe o pedido' '0' \
  "SELECT count(*) FROM public.password_reset_requests;"

expect_ok_as() {  # expect_ok_as <rotulo> <papel> <jwt> <sql>  (sql NAO pode ter RETURNING: o anon nao tem policy de SELECT)
  local l="$1" r="$2" j="$3" s="$4"
  as_role "$r" "$j" "$s" >/dev/null || fail "$l: deveria ter sucesso ($r)"
  printf '[PASS] %s\n' "$l"
}

printf '\n============ BLOCO B — migration aplicada ============\n'
psql_file "$repo_root/supabase/migrations/20261006231105_recuperacao_gatilho_sem_coluna_removida.sql" >/dev/null
psql_file "$migration" >/dev/null
psql_file "$tmp_dir/seed.sql" >/dev/null

# B.1/B.2 caminho feliz do anon: so email/reason/user_agent (sem user_id e sem RETURNING — o
# PostgREST do supabase-js .insert() sem .select() manda return=minimal, ou seja, sem RETURNING)
expect_ok_as 'B.1 anon registra o pedido enviando so o email (user_id resolvido no servidor)' \
  anon "$ANON" \
  "INSERT INTO public.password_reset_requests (email, reason, user_agent) VALUES ('ti.existente@example.com','esqueci','probe');"
expect_value 'B.2 o pedido nasceu pendente, sem revisao, com o email canonico — e o profiles.email dessa conta e NULL' \
  '1|pending|ti.existente@example.com|0|1' \
  "SELECT count(*)::text||'|'||coalesce(min(status),'-')||'|'||coalesce(min(email),'-')||'|'||(coalesce(bool_or(reviewed_by IS NOT NULL),false))::int||'|'||(coalesce(bool_or(reason IS NOT NULL),false))::int FROM public.password_reset_requests WHERE user_id='11111111-1111-1111-1111-111111111111';"

# B.3/B.4 conta inexistente: mesma resposta publica, nada gravado (nao enumera emails)
expect_ok_as 'B.3 anon pedindo por conta inexistente nao recebe erro (nao enumera emails)' \
  anon "$ANON" "INSERT INTO public.password_reset_requests (email) VALUES ('ninguem@example.com');"
expect_value 'B.4 ...e nada foi gravado para o email inexistente' '0' \
  "SELECT count(*) FROM public.password_reset_requests WHERE email='ninguem@example.com';"

# B.5/B.6 o cliente nao forja status/revisao/token nem atribui o pedido a outra conta
expect_ok_as 'B.5 anon tenta forjar status/revisao/token e apontar o pedido para outra conta' \
  anon "$ANON" \
  "INSERT INTO public.password_reset_requests (user_id, email, status, reviewed_by, reviewed_at, rejection_reason, token_expires_at) VALUES ('33333333-3333-3333-3333-333333333333','Outro.Usuario@Example.COM','approved','33333333-3333-3333-3333-333333333333', now(), 'aprovado por mim', now());"
expect_value 'B.6 ...e a linha nasceu pendente e limpa (o gatilho e a fronteira)' '1' \
  "SELECT count(*) FROM public.password_reset_requests WHERE user_id='22222222-2222-2222-2222-222222222222' AND status='pending' AND reviewed_by IS NULL AND reviewed_at IS NULL AND rejection_reason IS NULL AND token_expires_at IS NULL;"
expect_value 'B.7 ...e o user_id informado pelo cliente foi ignorado (vale o dono do email)' '0' \
  "SELECT count(*) FROM public.password_reset_requests WHERE user_id='33333333-3333-3333-3333-333333333333';"

# B.8/B.9 a fronteira nao vira leitura: nem anon nem logado comum veem a fila
expect_value_as 'B.8 anon nao le a fila de solicitacoes (0 linhas)' '0' anon "$ANON" \
  "SELECT count(*) FROM public.password_reset_requests;"
expect_value_as 'B.9 usuario logado comum (nao admin) tambem nao le a fila' '0' authenticated "$U_EXISTE" \
  "SELECT count(*) FROM public.password_reset_requests;"

# B.10 normalizacao: caixa diferente e espacos casam com a conta e gravam o email do auth.users
expect_ok_as 'B.10 email com caixa diferente e espacos casa com a conta (auth.users)' \
  anon "$ANON" \
  "INSERT INTO public.password_reset_requests (email, reason) VALUES ('  outro.usuario@EXAMPLE.com  ','caixa');"
expect_value 'B.11 ...e o email gravado e o canonico do auth.users' '1' \
  "SELECT count(*) FROM public.password_reset_requests WHERE user_id='22222222-2222-2222-2222-222222222222' AND email='Outro.Usuario@Example.COM' AND reason='caixa';"

# B.12/B.13 rate limit anonimo: 3 pendentes por hora; o 4o nao enumera, nao erra e nao grava.
expect_ok_as 'B.12 terceiro pedido pendente do mesmo usuario ainda passa' \
  anon "$ANON" "INSERT INTO public.password_reset_requests (email) VALUES ('outro.usuario@example.com');"
expect_same_success_as 'B.13 quarto pedido anonimo limitado tem a mesma resposta publica de email inexistente' \
  anon "$ANON" \
  "INSERT INTO public.password_reset_requests (email) VALUES ('ninguem-rate-limit@example.com');" \
  "INSERT INTO public.password_reset_requests (email) VALUES ('outro.usuario@example.com');"
expect_value 'B.13b o quarto pedido anonimo limitado nao grava linha' '3' \
  "SELECT count(*) FROM public.password_reset_requests WHERE user_id='22222222-2222-2222-2222-222222222222' AND status='pending';"
expect_value 'B.13c a referencia inexistente tambem nao grava linha' '0' \
  "SELECT count(*) FROM public.password_reset_requests WHERE email='ninguem-rate-limit@example.com';"

# B.14 caminho authenticated segue funcionando (dono do proprio pedido)
expect_ok_as 'B.14 logado ainda registra o proprio pedido (user_id = auth.uid())' \
  authenticated "$U_EXISTE" \
  "INSERT INTO public.password_reset_requests (user_id, email, reason) VALUES ('11111111-1111-1111-1111-111111111111','ti.existente@example.com','logado');"
expect_value 'B.15 o pedido do logado foi gravado como pendente e do proprio usuario' '1' \
  "SELECT count(*) FROM public.password_reset_requests WHERE user_id='11111111-1111-1111-1111-111111111111' AND reason='logado' AND status='pending';"

# B.16/B.17 anon nao apaga nem altera pedido
expect_value_as 'B.16 anon nao consegue UPDATE na fila (RLS nao da linhas)' '0' anon "$ANON" \
  "WITH up AS (UPDATE public.password_reset_requests SET status='approved' RETURNING 1) SELECT count(*) FROM up;"
expect_value_as 'B.17 anon nao consegue DELETE na fila' '0' anon "$ANON" \
  "WITH del AS (DELETE FROM public.password_reset_requests RETURNING 1) SELECT count(*) FROM del;"
expect_value 'B.18 os 5 pedidos seguem pendentes depois das tentativas do anon' '5' \
  "SELECT count(*) FROM public.password_reset_requests WHERE status='pending';"

# B.19 o revisor (service_role, o caminho da edge approve-password-reset) ve a solicitacao
expect_value_as 'B.19 service_role (revisor) ve a solicitacao pendente do pedido anonimo' '1' service_role - \
  "SELECT count(*) FROM public.password_reset_requests WHERE reason='esqueci' AND status='pending';"

# B.20 regra do repo (20261001191230): funcao de gatilho sem EXECUTE para os papeis da API.
# anon e authenticated sao membros de PUBLIC, entao EXECUTE para PUBLIC apareceria como true aqui.
expect_value 'B.20 gatilho sem EXECUTE para anon nem authenticated (e portanto nem via PUBLIC)' \
  '0|0' \
  "SELECT (has_function_privilege('anon','public.sanitize_reset_request()','EXECUTE'))::int||'|'||(has_function_privilege('authenticated','public.sanitize_reset_request()','EXECUTE'))::int;"

printf '\nPASS: R2-AUTH-006 — o pedido anonimo de recuperacao persiste como solicitacao pendente (identidade resolvida no servidor), conta inexistente e conta limitada nao gravam nem enumeram, o cliente nao forja status/revisao/token, a fila nao vaza para anon/logado e o revisor ve o pedido.\n'
