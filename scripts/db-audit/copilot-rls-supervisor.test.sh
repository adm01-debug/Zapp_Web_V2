#!/usr/bin/env bash
# Contrato de RLS das 3 tabelas de SUPERVISOR do Copiloto (Fase 13).
#
# Migration do estado de autoria (o que está em produção hoje):
#   supabase/migrations/20261107133000_fix_copilot_rls_open_policies.sql
#   + supabase/migrations/20261107163000_fix_copilot_rls_wrong_join_column.sql
# Migration objeto deste teste:
#   supabase/migrations/20261115040000_copilot_rls_supervisor.sql
#
# BLOCO A (estado de autoria): o supervisor NÃO vê o pedido de ajuda do vendedor;
#   qualquer vendedor pontua a conversa de qualquer colega e, feito isso, o
#   supervisor não consegue corrigir a nota (PK ocupada + UPDATE exige autoria);
#   qualquer vendedor marca momento de aprendizado na conversa do colega.
# BLOCO B (depois da migration): supervisor vê a fila de ajuda; vendedor só o
#   próprio pedido; só supervisor pontua e marca; outro supervisor corrige a nota
#   e a linha passa a registrar quem corrigiu; o dono da conversa lê a nota e o
#   momento; o outro vendedor não lê nada.
# BLOCO R (rollback do cabeçalho da migration): volta ao estado de autoria.
# BLOCO C: reaplicar a migration é idempotente.

set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
autoria="$repo_root/supabase/migrations/20261107133000_fix_copilot_rls_open_policies.sql"
join_fix="$repo_root/supabase/migrations/20261107163000_fix_copilot_rls_wrong_join_column.sql"
migration="${COPILOT_RLS_TEST_MIGRATION:-$repo_root/supabase/migrations/20261115040000_copilot_rls_supervisor.sql}"
postgres_image="${COPILOT_RLS_TEST_POSTGRES_IMAGE:-postgres:17-alpine}"
container_name="zapp-v2-copilot-rls-test-$$"

cleanup() {
  if [[ "$container_name" =~ ^zapp-v2-copilot-rls-test-[0-9]+$ ]]; then
    docker rm -f "$container_name" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT INT TERM

fail() { printf '[FAIL] %s\n' "$1" >&2; exit 1; }

psql_sql() { docker exec "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres -c "$1"; }
psql_file() { docker exec -i "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres < "$1"; }

expect_value() {
  local label="$1" expected="$2" sql="$3" actual
  actual="$(psql_sql "$sql" | tail -n1)"
  [[ "$actual" == "$expected" ]] || fail "$label: esperado '$expected', obtido '$actual'"
  printf '[PASS] %s\n' "$label"
}

expect_ok() {
  local label="$1" sql="$2"
  psql_sql "$sql" >/dev/null 2>&1 || fail "$label: deveria ter sucesso"
  printf '[PASS] %s\n' "$label"
}

# A RLS tem de RECUSAR: sucesso aqui é a escrita falhar.
expect_negado() {
  local label="$1" sql="$2"
  if psql_sql "$sql" >/dev/null 2>&1; then fail "$label: a escrita passou e deveria ter sido negada"; fi
  printf '[PASS] %s\n' "$label"
}

command -v docker >/dev/null 2>&1 || fail 'Docker nao esta instalado'
docker info >/dev/null 2>&1 || fail 'Docker daemon nao esta acessivel'
for f in "$autoria" "$join_fix" "$migration"; do
  [[ -f "$f" ]] || fail "migration nao encontrada: $f"
done

docker run --rm -d --name "$container_name" -e POSTGRES_PASSWORD=test_only "$postgres_image" >/dev/null

ready_checks=0
for _ in $(seq 1 90); do
  if psql_sql 'SELECT 1' >/dev/null 2>&1; then
    ready_checks=$((ready_checks + 1)); (( ready_checks >= 2 )) && break
  else ready_checks=0; fi
  sleep 1
done
(( ready_checks >= 2 )) || fail 'PostgreSQL descartavel nao ficou pronto'

tmp_dir="$(mktemp -d)"
trap 'rm -rf "$tmp_dir"; cleanup' EXIT INT TERM

VEND_A='11111111-1111-1111-1111-111111111111'
VEND_B='22222222-2222-2222-2222-222222222222'
SUP1='33333333-3333-3333-3333-333333333333'
SUP2='44444444-4444-4444-4444-444444444444'
CONV='55555555-5555-5555-5555-555555555555'

cat > "$tmp_dir/pre.sql" <<SQL
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;

CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
  AS \$\$ SELECT nullif(coalesce(
       nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub',
       nullif(current_setting('request.jwt.claim.sub', true), '')
     ), '')::uuid \$\$;

-- user_roles + is_admin_or_supervisor como em producao (STABLE SECURITY DEFINER).
CREATE TABLE public.user_roles (user_id uuid NOT NULL, role text NOT NULL);
CREATE FUNCTION public.is_admin_or_supervisor(_user_id uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
  AS \$\$ SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role IN ('admin','supervisor')) \$\$;
INSERT INTO public.user_roles (user_id, role) VALUES
  ('$SUP1', 'supervisor'), ('$SUP2', 'admin'), ('$VEND_A', 'agent'), ('$VEND_B', 'agent');

-- As 7 tabelas que a migration de autoria toca + copilot_sessions (join do dono).
CREATE TABLE public.copilot_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL, contact_id uuid NOT NULL, profile_id uuid NOT NULL);
CREATE TABLE public.copilot_help_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL, contact_id uuid NOT NULL, seller_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.copilot_outcomes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL, contact_id uuid NOT NULL, seller_id uuid NOT NULL,
  outcome text NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.copilot_seller_settings (
  seller_id uuid PRIMARY KEY, opted_in boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.copilot_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL, seller_id uuid NOT NULL, tokens integer NOT NULL,
  endpoint text NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.copilot_conversation_scores (
  conversation_id uuid PRIMARY KEY, score integer NOT NULL CHECK (score BETWEEN 1 AND 5),
  scored_by uuid NOT NULL, updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.copilot_learning_moments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL, message_id text NOT NULL,
  tag text NOT NULL CHECK (tag IN ('exemplar','anti_pattern','objection_win','closing_technique')),
  notes text, tagged_by uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.copilot_objection_catalog (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL, objection_type text NOT NULL, treatment_text text NOT NULL,
  submitted_by uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now());

DO \$\$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['copilot_help_requests','copilot_outcomes','copilot_seller_settings',
                           'copilot_usage','copilot_conversation_scores','copilot_learning_moments',
                           'copilot_objection_catalog'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE ON public.%I TO authenticated', t);
  END LOOP;
END \$\$;
GRANT USAGE ON SCHEMA public, auth TO authenticated;
GRANT SELECT ON public.copilot_sessions TO authenticated;

-- A conversa é do VEND_A e ele pediu ajuda ao supervisor.
INSERT INTO public.copilot_sessions (conversation_id, contact_id, profile_id)
  VALUES ('$CONV', gen_random_uuid(), '$VEND_A');
INSERT INTO public.copilot_help_requests (conversation_id, contact_id, seller_id)
  VALUES ('$CONV', gen_random_uuid(), '$VEND_A');
SQL

psql_file "$tmp_dir/pre.sql" >/dev/null
psql_file "$autoria" >/dev/null
psql_file "$join_fix" >/dev/null
printf '[PASS] estado de autoria aplicado (20261107133000 + 20261107163000)\n'

# Helper: roda SQL como `authenticated` com um sub de JWT.
como() { printf "SET LOCAL ROLE authenticated; SET LOCAL request.jwt.claims = '{\"sub\":\"%s\"}'; %s" "$1" "$2"; }
tx() { printf 'BEGIN; %s COMMIT;' "$1"; }

# ---------------------------------------------------------------- BLOCO A
expect_value 'A1 supervisor NAO ve o pedido de ajuda (recurso morto)' '0' \
  "$(tx "$(como "$SUP1" 'SELECT count(*) FROM public.copilot_help_requests;')")"
expect_value 'A1b o proprio vendedor ve o seu pedido' '1' \
  "$(tx "$(como "$VEND_A" 'SELECT count(*) FROM public.copilot_help_requests;')")"
expect_ok 'A2 vendedor B pontua a conversa do colega' \
  "$(tx "$(como "$VEND_B" "INSERT INTO public.copilot_conversation_scores (conversation_id, score, scored_by) VALUES ('$CONV', 5, '$VEND_B');")")"
expect_value 'A3 supervisor nao consegue corrigir a nota (0 linhas)' '0' \
  "$(tx "$(como "$SUP1" "WITH u AS (UPDATE public.copilot_conversation_scores SET score = 2, scored_by = '$SUP1' WHERE conversation_id = '$CONV' RETURNING 1) SELECT count(*) FROM u;")")"
expect_ok 'A4 vendedor B marca momento de aprendizado na conversa do colega' \
  "$(tx "$(como "$VEND_B" "INSERT INTO public.copilot_learning_moments (conversation_id, message_id, tag, tagged_by) VALUES ('$CONV', 'm1', 'anti_pattern', '$VEND_B');")")"

# Limpa o que o estado de autoria permitiu, para o BLOCO B começar do zero.
psql_sql "DELETE FROM public.copilot_conversation_scores; DELETE FROM public.copilot_learning_moments;" >/dev/null

# ---------------------------------------------------------------- BLOCO B
psql_file "$migration" >/dev/null
printf '[PASS] migration aplicada\n'

expect_value 'B1 supervisor ve a fila de pedidos de ajuda' '1' \
  "$(tx "$(como "$SUP1" 'SELECT count(*) FROM public.copilot_help_requests;')")"
expect_value 'B2 vendedor B nao ve o pedido do colega' '0' \
  "$(tx "$(como "$VEND_B" 'SELECT count(*) FROM public.copilot_help_requests;')")"
expect_value 'B2b vendedor A continua vendo o seu pedido' '1' \
  "$(tx "$(como "$VEND_A" 'SELECT count(*) FROM public.copilot_help_requests;')")"

expect_negado 'B3 vendedor B NAO pontua mais a conversa do colega' \
  "$(tx "$(como "$VEND_B" "INSERT INTO public.copilot_conversation_scores (conversation_id, score, scored_by) VALUES ('$CONV', 5, '$VEND_B');")")"
expect_negado 'B3b vendedor nao pontua nem a propria conversa' \
  "$(tx "$(como "$VEND_A" "INSERT INTO public.copilot_conversation_scores (conversation_id, score, scored_by) VALUES ('$CONV', 5, '$VEND_A');")")"
expect_negado 'B3c supervisor nao grava a nota no nome de outra pessoa' \
  "$(tx "$(como "$SUP1" "INSERT INTO public.copilot_conversation_scores (conversation_id, score, scored_by) VALUES ('$CONV', 5, '$VEND_B');")")"
expect_ok 'B4 supervisor pontua a conversa' \
  "$(tx "$(como "$SUP1" "INSERT INTO public.copilot_conversation_scores (conversation_id, score, scored_by) VALUES ('$CONV', 4, '$SUP1');")")"
expect_value 'B5 outro supervisor corrige a nota e a linha registra quem corrigiu' "2|$SUP2" \
  "$(tx "$(como "$SUP2" "UPDATE public.copilot_conversation_scores SET score = 2, scored_by = '$SUP2' WHERE conversation_id = '$CONV'; SELECT score || '|' || scored_by FROM public.copilot_conversation_scores WHERE conversation_id = '$CONV';")")"
expect_value 'B6 dono da conversa le a nota dada a ele' '1' \
  "$(tx "$(como "$VEND_A" 'SELECT count(*) FROM public.copilot_conversation_scores;')")"
expect_value 'B6b vendedor B nao le a nota de outra conversa' '0' \
  "$(tx "$(como "$VEND_B" 'SELECT count(*) FROM public.copilot_conversation_scores;')")"

expect_negado 'B7 vendedor B NAO marca mais momento de aprendizado' \
  "$(tx "$(como "$VEND_B" "INSERT INTO public.copilot_learning_moments (conversation_id, message_id, tag, tagged_by) VALUES ('$CONV', 'm1', 'anti_pattern', '$VEND_B');")")"
expect_ok 'B7b supervisor marca momento de aprendizado' \
  "$(tx "$(como "$SUP1" "INSERT INTO public.copilot_learning_moments (conversation_id, message_id, tag, tagged_by) VALUES ('$CONV', 'm1', 'exemplar', '$SUP1');")")"
expect_value 'B7c dono da conversa le o momento marcado nela' '1' \
  "$(tx "$(como "$VEND_A" 'SELECT count(*) FROM public.copilot_learning_moments;')")"
expect_value 'B7d vendedor B nao le o momento da conversa do colega' '0' \
  "$(tx "$(como "$VEND_B" 'SELECT count(*) FROM public.copilot_learning_moments;')")"

# ---------------------------------------------------------------- BLOCO C
psql_file "$migration" >/dev/null
expect_value 'C reaplicar a migration e idempotente (supervisor segue vendo a fila)' '1' \
  "$(tx "$(como "$SUP1" 'SELECT count(*) FROM public.copilot_help_requests;')")"

# ---------------------------------------------------------------- BLOCO R
# O rollback é o bloco comentado no cabeçalho da migration: extrai e executa.
awk '/^-- Rollback/ {dentro=1; next} dentro && !/^--/ {exit} dentro {sub(/^--   /, ""); print}' \
  "$migration" > "$tmp_dir/rollback.sql"
[[ -s "$tmp_dir/rollback.sql" ]] || fail 'R: bloco de rollback do cabecalho da migration saiu vazio'
psql_file "$tmp_dir/rollback.sql" >/dev/null
psql_sql "DELETE FROM public.copilot_conversation_scores; DELETE FROM public.copilot_learning_moments;" >/dev/null
expect_value 'R rollback devolve o estado de autoria (supervisor volta a nao ver a fila)' '0' \
  "$(tx "$(como "$SUP1" 'SELECT count(*) FROM public.copilot_help_requests;')")"
expect_ok 'R vendedor B volta a poder pontuar a conversa do colega' \
  "$(tx "$(como "$VEND_B" "INSERT INTO public.copilot_conversation_scores (conversation_id, score, scored_by) VALUES ('$CONV', 5, '$VEND_B');")")"

printf '\n[OK] contrato de RLS de supervisor do Copiloto conferido\n'
