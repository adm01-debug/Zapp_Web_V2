#!/usr/bin/env bash
# LGPD (paridade V3 -> V2, doc 01-frontend da V3): fila de pedidos de exclusao
# (public.data_deletion_requests) + historico de privacidade do PROPRIO usuario
# (public.my_privacy_history) + registro de visualizacao da politica
# (public.register_privacy_policy_viewed).
#
# Roda o MESMO roteiro no mesmo container, em dois blocos:
#   BLOCO A — estado ANTERIOR (defeito): nao existe fila (o pedido so vira log) e
#             audit_logs continua admin-only (o titular nao ve o proprio historico).
#   BLOCO B — migration aplicada: titular cria/ve os seus pedidos (nao os de terceiros,
#             nao atualiza nem apaga), admin e supervisor veem e tratam todos, status
#             preso ao CHECK da V3, historico paginado sem dado de terceiros e evento
#             privacy_policy_viewed gravado.
#   BLOCO C — rollback extraido do cabecalho da migration roda e derruba so o que ela criou.

set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
migration="$repo_root/supabase/migrations/20261012135248_lgpd_requests.sql"
postgres_image="${LGPD_DELETION_TEST_POSTGRES_IMAGE:-postgres:17-alpine}"
container_name="zapp-v2-lgpd-deletion-test-$$"

cleanup() {
  if [[ "$container_name" =~ ^zapp-v2-lgpd-deletion-test-[0-9]+$ ]]; then
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
as_anon() {
  local sql="$1"
  docker exec "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres \
    -c "SET ROLE anon; $sql"
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
expect_error_anon() {
  local l="$1" needle="$2" s="$3" out st
  set +e; out="$(as_anon "$s" 2>&1)"; st=$?; set -e
  (( st == 0 )) && { printf '%s\n' "$out" >&2; fail "$l: deveria falhar, mas passou"; }
  [[ "$out" == *"$needle"* ]] || { printf '%s\n' "$out" >&2; fail "$l: esperava '$needle' no erro"; }
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
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

CREATE TABLE auth.users (id uuid PRIMARY KEY);

CREATE TABLE public.user_roles (
  user_id uuid NOT NULL,
  role text NOT NULL,
  PRIMARY KEY (user_id, role)
);

CREATE OR REPLACE FUNCTION public.is_admin_or_supervisor(_user_id uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
  AS $function$
    SELECT EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = _user_id AND role IN ('admin', 'supervisor')
    );
  $function$;
GRANT EXECUTE ON FUNCTION public.is_admin_or_supervisor(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.update_updated_at_column() RETURNS trigger
  LANGUAGE plpgsql AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;

-- public.audit_logs fiel ao real: ledger global, SELECT so para admin/supervisor,
-- INSERT so para service_role (por isso register_privacy_policy_viewed e DEFINER).
CREATE TABLE public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  action text NOT NULL,
  entity_type text,
  entity_id uuid,
  details jsonb,
  ip_address text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY audit_logs_admin_select ON public.audit_logs FOR SELECT TO authenticated
  USING (public.is_admin_or_supervisor(auth.uid()));
CREATE POLICY audit_logs_service_insert ON public.audit_logs FOR INSERT TO service_role
  WITH CHECK (true);
GRANT SELECT ON public.audit_logs TO authenticated;
GRANT SELECT, INSERT ON public.audit_logs TO service_role;
SQL

cat > "$tmp_dir/seed.sql" <<'SQL'
DELETE FROM public.audit_logs;
DELETE FROM public.user_roles;
DELETE FROM auth.users;

INSERT INTO auth.users (id) VALUES
  ('11111111-1111-1111-1111-111111111111'), -- ANA  (titular T1)
  ('22222222-2222-2222-2222-222222222222'), -- BRUNO (titular T2)
  ('33333333-3333-3333-3333-333333333333'), -- CHEFE (admin)
  ('44444444-4444-4444-4444-444444444444'); -- SOFIA (supervisor)

INSERT INTO public.user_roles (user_id, role) VALUES
  ('33333333-3333-3333-3333-333333333333', 'admin'),
  ('44444444-4444-4444-4444-444444444444', 'supervisor');

-- 25 eventos da ANA (historico proprio), recentes, para provar a paginacao de 20.
INSERT INTO public.audit_logs (user_id, action, created_at)
SELECT '11111111-1111-1111-1111-111111111111', 'ana_evento_' || lpad(g::text, 2, '0'), now() - (g * interval '1 minute')
FROM generate_series(1, 25) AS g;

-- 3 eventos do BRUNO, MAIS recentes: se o historico vazasse, apareceriam na pagina 1 da ANA.
INSERT INTO public.audit_logs (user_id, action, created_at) VALUES
  ('22222222-2222-2222-2222-222222222222', 'bruno_segredo', now()),
  ('22222222-2222-2222-2222-222222222222', 'bruno_segredo', now() - interval '1 minute'),
  ('22222222-2222-2222-2222-222222222222', 'bruno_segredo', now() - interval '2 minutes');
SQL

psql_file "$tmp_dir/pre.sql" >/dev/null
psql_file "$tmp_dir/seed.sql" >/dev/null

ANA='{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}'
BRUNO='{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}'
CHEFE='{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}'
SOFIA='{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated"}'

printf '\n============ BLOCO A — estado ANTERIOR (defeito) ============\n'

expect_value 'A.1 (DEFEITO) nao existe fila de pedidos: data_deletion_requests ausente' '' \
  "SELECT to_regclass('public.data_deletion_requests');"
expect_value 'A.2 (DEFEITO) nao existe historico do titular: my_privacy_history ausente' '' \
  "SELECT to_regprocedure('public.my_privacy_history(integer)');"
expect_value 'A.3 (DEFEITO) audit_logs e admin-only: a ANA nao ve NEM o proprio evento' '0' \
  "SET ROLE authenticated; SELECT set_config('request.jwt.claims', '$ANA', false); SELECT count(*) FROM public.audit_logs;"

printf '\n============ BLOCO B — migration aplicada ============\n'
psql_file "$migration" >/dev/null
psql_file "$tmp_dir/seed.sql" >/dev/null

# --- fila: titular cria e ve o que e seu ---
expect_ok_as 'B.1 titular cria o proprio pedido de exclusao' "$ANA" \
  "INSERT INTO public.data_deletion_requests (user_id, motivo) VALUES ('11111111-1111-1111-1111-111111111111', 'quero excluir minha conta e meus dados');"
expect_value 'B.2 pedido nasceu pending (default da V3)' 'pending' \
  "SELECT status FROM public.data_deletion_requests WHERE user_id='11111111-1111-1111-1111-111111111111';"
expect_value 'B.3 prazo = criado + 30 dias' 't' \
  "SELECT (prazo - created_at) BETWEEN interval '29 days 23 hours' AND interval '30 days 1 hour' FROM public.data_deletion_requests WHERE user_id='11111111-1111-1111-1111-111111111111';"
expect_value_as 'B.4 titular ve o proprio pedido (1)' '1' "$ANA" \
  "SELECT count(*) FROM public.data_deletion_requests;"

expect_error_as 'B.5 titular NAO cria pedido em nome de terceiro' 'row-level security' "$ANA" \
  "INSERT INTO public.data_deletion_requests (user_id, motivo) VALUES ('22222222-2222-2222-2222-222222222222', 'pedido forjado');"
expect_value_as 'B.6 outro agente nao ve o pedido alheio (0)' '0' "$BRUNO" \
  "SELECT count(*) FROM public.data_deletion_requests;"

# --- fila: admin e supervisor veem e tratam todos ---
expect_value_as 'B.7 admin ve todos os pedidos' '1' "$CHEFE" \
  "SELECT count(*) FROM public.data_deletion_requests;"
expect_value_as 'B.8 supervisor tambem ve a fila (pedido da auditoria 12/10)' '1' "$SOFIA" \
  "SELECT count(*) FROM public.data_deletion_requests;"

expect_ok_as 'B.9 titular tenta concluir o proprio pedido (UPDATE invisivel, nao autorizado)' "$ANA" \
  "UPDATE public.data_deletion_requests SET status='completed', tratado_em=now() WHERE user_id='11111111-1111-1111-1111-111111111111';"
expect_value_as 'B.10 ...e o pedido segue pending: o titular nao trata a fila' 'pending' "$CHEFE" \
  "SELECT status FROM public.data_deletion_requests WHERE user_id='11111111-1111-1111-1111-111111111111';"

expect_ok_as 'B.11 agente comum tenta tratar pedido alheio (UPDATE invisivel, sem policy)' "$BRUNO" \
  "UPDATE public.data_deletion_requests SET status='completed' WHERE user_id='11111111-1111-1111-1111-111111111111';"
expect_value_as 'B.12 ...e o pedido alheio segue pending: so admin/supervisor tratam' 'pending' "$CHEFE" \
  "SELECT status FROM public.data_deletion_requests WHERE user_id='11111111-1111-1111-1111-111111111111';"

expect_ok_as 'B.13 admin trata o pedido (status + tratado_por + resposta)' "$CHEFE" \
  "UPDATE public.data_deletion_requests SET status='completed', tratado_por='33333333-3333-3333-3333-333333333333', tratado_em=now(), resposta='dados removidos' WHERE user_id='11111111-1111-1111-1111-111111111111';"
expect_value 'B.14 status concluido gravado' 'completed' \
  "SELECT status FROM public.data_deletion_requests WHERE user_id='11111111-1111-1111-1111-111111111111';"
expect_value 'B.15 tratado_por gravado' '33333333-3333-3333-3333-333333333333' \
  "SELECT tratado_por FROM public.data_deletion_requests WHERE user_id='11111111-1111-1111-1111-111111111111';"
expect_value 'B.16 updated_at foi reescrito pelo gatilho' 't' \
  "SELECT updated_at > created_at FROM public.data_deletion_requests WHERE user_id='11111111-1111-1111-1111-111111111111';"

expect_ok_as 'B.17 o BRUNO cria o proprio pedido' "$BRUNO" \
  "INSERT INTO public.data_deletion_requests (user_id, motivo) VALUES ('22222222-2222-2222-2222-222222222222', 'LGPD: remover meus dados');"
expect_ok_as 'B.18 supervisor trata o pedido do BRUNO (em_analise)' "$SOFIA" \
  "UPDATE public.data_deletion_requests SET status='processing' WHERE user_id='22222222-2222-2222-2222-222222222222';"
expect_value_as 'B.19 ...e o status em_analise fica gravado' 'processing' "$BRUNO" \
  "SELECT status FROM public.data_deletion_requests;"

# --- CHECKs de forma (status da V3 e motivo 1..1000) ---
expect_error_as 'B.20 status fora do CHECK da V3 e recusado' 'data_deletion_requests_status_check' "$CHEFE" \
  "INSERT INTO public.data_deletion_requests (user_id, motivo, status) VALUES ('33333333-3333-3333-3333-333333333333', 'x', 'aberto');"
expect_error_as 'B.21 motivo acima de 1000 caracteres e recusado' 'data_deletion_requests_motivo_check' "$CHEFE" \
  "INSERT INTO public.data_deletion_requests (user_id, motivo) VALUES ('33333333-3333-3333-3333-333333333333', repeat('x', 1001));"
expect_error_as 'B.22 motivo vazio (so espacos) e recusado' 'data_deletion_requests_motivo_check' "$CHEFE" \
  "INSERT INTO public.data_deletion_requests (user_id, motivo) VALUES ('33333333-3333-3333-3333-333333333333', '   ');"

# --- ACL: quem pode, quem nao pode, anonimo ---
expect_error_as 'B.23 DELETE de pedido e negado (sem GRANT DELETE para authenticated)' 'permission denied' "$CHEFE" \
  "DELETE FROM public.data_deletion_requests WHERE user_id='11111111-1111-1111-1111-111111111111';"
expect_error_anon 'B.24 anon nao le a fila' 'permission denied' \
  "SELECT count(*) FROM public.data_deletion_requests;"
expect_value 'B.25 ACL: authenticated sem DELETE, anon sem SELECT, service_role com DELETE' 'false|false|true' \
  "SELECT has_table_privilege('authenticated','public.data_deletion_requests','DELETE') || '|' || has_table_privilege('anon','public.data_deletion_requests','SELECT') || '|' || has_table_privilege('service_role','public.data_deletion_requests','DELETE');"

# --- historico do proprio usuario ---
expect_value_as 'B.26 historico do titular nesta pagina = 20 (paginacao), so os eventos dele' '20' "$ANA" \
  "SELECT count(*) FROM public.my_privacy_history(1);"
expect_value_as 'B.27 pagina 2 traz os 5 restantes' '5' "$ANA" \
  "SELECT count(*) FROM public.my_privacy_history(2);"
expect_value_as 'B.28 pagina negativa/zero cai na primeira pagina' '20' "$ANA" \
  "SELECT count(*) FROM public.my_privacy_history(0);"
expect_value_as 'B.29 evento de terceiro (bruno_segredo) NAO aparece no historico da ANA' '0' "$ANA" \
  "SELECT count(*) FROM public.my_privacy_history(1) WHERE action = 'bruno_segredo';"
expect_value_as 'B.30 historico nao expoe details/entity de terceiros (coluna details ausente = 0)' '0' "$ANA" \
  "SELECT count(*) FROM (SELECT * FROM public.my_privacy_history(1)) s WHERE to_jsonb(s) ? 'details';"
expect_value_as 'B.31 o BRUNO so ve os 3 eventos dele' '3' "$BRUNO" \
  "SELECT count(*) FROM public.my_privacy_history(1);"

expect_ok_as 'B.32 registra privacy_policy_viewed para o titular' "$ANA" \
  "SELECT public.register_privacy_policy_viewed();"
expect_value_as 'B.33 ...e o evento entra no proprio historico' 'privacy_policy_viewed' "$ANA" \
  "SELECT action FROM public.my_privacy_history(1) ORDER BY created_at DESC, action DESC LIMIT 1;"
expect_value 'B.34 evento gravado sem dado pessoal (details nulo, entity_type privacy)' 't' \
  "SELECT (details IS NULL AND entity_type = 'privacy') FROM public.audit_logs WHERE action='privacy_policy_viewed' ORDER BY created_at DESC LIMIT 1;"

expect_error_anon 'B.35 anon nao executa my_privacy_history' 'permission denied' \
  "SELECT * FROM public.my_privacy_history(1);"
expect_error_anon 'B.36 anon nao registra visualizacao de politica' 'permission denied' \
  "SELECT public.register_privacy_policy_viewed();"

printf '\n============ BLOCO C — rollback do cabecalho roda ============\n'
sed -n '/^-- Rollback (SQL execut/,/^--$/p' "$migration" | sed -n 's/^--   \(.*\)$/\1/p' > "$tmp_dir/rollback.sql"
grep -q 'drop table if exists public.data_deletion_requests;' "$tmp_dir/rollback.sql" || fail 'C.1 rollback sem DROP da tabela'
psql_file "$tmp_dir/rollback.sql" >/dev/null
printf '[PASS] %s\n' 'C.1 rollback extraido do cabecalho executou sem erro'
expect_value 'C.2 apos o rollback a fila sumiu' '' "SELECT to_regclass('public.data_deletion_requests');"
expect_value 'C.3 apos o rollback my_privacy_history sumiu' '' "SELECT to_regprocedure('public.my_privacy_history(integer)');"
expect_value 'C.4 apos o rollback register_privacy_policy_viewed sumiu' '' "SELECT to_regprocedure('public.register_privacy_policy_viewed()');"
expect_value 'C.5 rollback nao tocou audit_logs (ledger preservado)' '29' \
  "SELECT count(*) FROM public.audit_logs;"

printf '\nPASS: LGPD — fila de exclusao com RLS (titular cria/ve o seu; admin e supervisor tratam; sem DELETE), historico paginado so do proprio usuario e evento privacy_policy_viewed sem dado pessoal; rollback do cabecalho roda.\n'
