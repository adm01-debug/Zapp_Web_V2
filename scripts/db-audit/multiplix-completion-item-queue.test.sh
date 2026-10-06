#!/usr/bin/env bash
# Item 47 do BACKLOG_VERIFICADO (MX03, P1 funcional):
# "Conclusao usa a fila antiga de recipients apos enviar itens".
#
# Prova, em PostgreSQL 17 descartavel e com a definicao REAL de
# public.complete_multiplix_dispatch_if_drained() (carregada do arquivo de migration, nao copiada):
#   Bloco A (estado vivo, ANTES da migration nova): a conclusao decide por multiplix_recipients e
#     ignora a fila por item. Neste bloco o script exige que a assercao CORRETA FALHE — e o vermelho
#     do defeito.
#   Bloco B (carregando supabase/migrations/*_multiplix_conclusao_fila_itens.sql): as MESMAS
#     assercoes passam (verde) e o caminho legado (dispatch sem itens) continua identico.
#
# Fixture: superficie minima de Supabase + as tabelas que a funcao toca. As colunas de status sao
# text com CHECK espelhando os CHECKs/enums reais; nada aqui substitui a RPC sob teste.
set -euo pipefail

repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
migrations_dir="$repo_root/supabase/migrations"
postgres_image="${MULTIPLIX_COMPLETION_TEST_POSTGRES_IMAGE:-postgres:17-alpine}"
container_name="multiplix-completion-test-$$"
test_password="multiplix_completion_test_only"

cleanup() { docker rm -f "$container_name" >/dev/null 2>&1 || true; }
trap cleanup EXIT
fail() { printf 'FAIL: %s\n' "$1" >&2; exit 1; }
ok() { printf 'ok     %s\n' "$1" >&2; }
psql_test() { docker exec -i "$container_name" psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres "$@"; }

migration() {
  local file="$migrations_dir/$1"
  [[ -f "$file" ]] || fail "migration ausente: $1"
  printf '  · %s\n' "$1" >&2
  psql_test < "$file" >/dev/null
}

start_postgres() {
  for attempt in 1 2 3; do
    docker rm -f "$container_name" >/dev/null 2>&1 || true
    if ! docker run -d --name "$container_name" -e POSTGRES_PASSWORD="$test_password" "$postgres_image" >/dev/null; then
      printf 'WARN: PostgreSQL container failed to start (attempt %s/3)\n' "$attempt" >&2
      continue
    fi
    for _ in $(seq 1 15); do
      if docker exec "$container_name" psql -X -U postgres -d postgres -Atqc 'SELECT 1' >/dev/null 2>&1; then
        sleep 1
        if docker exec "$container_name" psql -X -U postgres -d postgres -Atqc 'SELECT 1' >/dev/null 2>&1; then
          return 0
        fi
      fi
      sleep 1
    done
    printf 'WARN: PostgreSQL bootstrap was not stable (attempt %s/3)\n' "$attempt" >&2
    docker logs "$container_name" >&2 || true
  done
  return 1
}

start_postgres || fail 'PostgreSQL de teste nao iniciou'

# ── superficie minima de Supabase (auth) + as tabelas da conclusao ────────────
psql_test >/dev/null <<'SQL'
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;

CREATE SCHEMA IF NOT EXISTS auth;
CREATE OR REPLACE FUNCTION auth.role() RETURNS text
  LANGUAGE sql STABLE
  AS $$
    SELECT COALESCE(
      current_setting('request.jwt.claim.role', true),
      (NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')
    )
  $$;

CREATE TABLE public.multiplix_dispatches (
  id uuid PRIMARY KEY,
  status text NOT NULL DEFAULT 'draft',
  failed_count integer NOT NULL DEFAULT 0,
  outcome_unknown_count integer NOT NULL DEFAULT 0,
  completed_at timestamp with time zone,
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE public.multiplix_recipients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dispatch_id uuid NOT NULL REFERENCES public.multiplix_dispatches(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending',
  sent_at timestamp with time zone
);

CREATE TABLE public.multiplix_delivery_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dispatch_id uuid NOT NULL REFERENCES public.multiplix_dispatches(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending',
  sent_at timestamp with time zone
);

-- CHECKs de status iguais aos vivos (20260929600000:20-28 e enums do F30/F32)
ALTER TABLE public.multiplix_recipients
  ADD CONSTRAINT multiplix_recipients_status_check
    CHECK (status IN ('pending', 'sending', 'sent', 'delivered', 'failed', 'skipped', 'outcome_unknown', 'cancelled'));
ALTER TABLE public.multiplix_dispatches
  ADD CONSTRAINT multiplix_dispatches_status_check
    CHECK (status IN ('draft', 'scheduled', 'sending', 'paused', 'completed', 'completed_with_failures', 'failed', 'cancelled'));
ALTER TABLE public.multiplix_delivery_items
  ADD CONSTRAINT multiplix_delivery_items_status_check
    CHECK (status IN ('pending', 'sending', 'sent', 'delivered', 'read', 'failed', 'failed_transient', 'outcome_unknown', 'cancelled'));

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
SQL

ok 'fixture (tabelas + auth.role) carregado'

# ── definicao VIVA da RPC (arquivo real; e ela que contem o defeito) ──────────
migration "20260929600000_multiplix_send_engine_fixes.sql"

# ── helpers ──────────────────────────────────────────────────────────────────
D_ITENS_TERMINAIS='47e00000-0000-0000-0000-000000000001'  # itens terminais, recipient ainda pending
D_ITEM_PENDENTE='47e00000-0000-0000-0000-000000000002'    # recipient terminal, item ainda pending
D_ITEM_RETRY='47e00000-0000-0000-0000-000000000005'       # recipient terminal, item failed_transient
D_LEGADO_PENDENTE='47e00000-0000-0000-0000-000000000003'  # sem itens, recipient pending
D_LEGADO_TERMINAL='47e00000-0000-0000-0000-000000000004'  # sem itens, recipient terminal

fixture() { # <dispatch> <itens csv|-> <recipients csv|->
  local d="$1" itens="$2" recs="$3" s
  psql_test -q -c "
    DELETE FROM public.multiplix_delivery_items WHERE dispatch_id = '$d';
    DELETE FROM public.multiplix_recipients     WHERE dispatch_id = '$d';
    DELETE FROM public.multiplix_dispatches     WHERE id = '$d';
    INSERT INTO public.multiplix_dispatches (id, status) VALUES ('$d', 'sending');
  " >/dev/null
  if [ "$itens" != "-" ]; then
    IFS=',' read -r -a lista <<< "$itens"
    for s in "${lista[@]}"; do
      psql_test -q -c "INSERT INTO public.multiplix_delivery_items (dispatch_id, status) VALUES ('$d', '$s');" >/dev/null
    done
  fi
  if [ "$recs" != "-" ]; then
    IFS=',' read -r -a lista <<< "$recs"
    for s in "${lista[@]}"; do
      psql_test -q -c "INSERT INTO public.multiplix_recipients (dispatch_id, status) VALUES ('$d', '$s');" >/dev/null
    done
  fi
}

chama_rpc() { # <dispatch> -> true/false (como service_role, unico com EXECUTE)
  psql_test -qAt \
    -c "SET ROLE service_role" \
    -c "SELECT set_config('request.jwt.claim.role', 'service_role', false)" \
    -c "SELECT public.complete_multiplix_dispatch_if_drained('$1')::text" | tail -1
}

status_dispatch() { psql_test -qAt -c "SELECT status FROM public.multiplix_dispatches WHERE id = '$1'"; }

# ── as MESMAS assercoes nos dois blocos ──────────────────────────────────────
desvios=0
confere() { # <descricao> <esperado> <obtido>
  if [ "$2" = "$3" ]; then
    printf '  ok     %s (esperado=%s)\n' "$1" "$2" >&2
  else
    printf '  DESVIO %s: esperado=%s obtido=%s\n' "$1" "$2" "$3" >&2
    desvios=$((desvios + 1))
  fi
}

camada_correta() {
  desvios=0
  local obtido

  fixture "$D_ITENS_TERMINAIS" 'sent,failed' 'pending'
  obtido=$(chama_rpc "$D_ITENS_TERMINAIS")
  confere 'itens terminais + recipient pending conclui a fila por item' 'true' "$obtido"
  confere 'dispatch com itens terminais vai para completed' 'completed' "$(status_dispatch "$D_ITENS_TERMINAIS")"

  fixture "$D_ITEM_PENDENTE" 'pending' 'sent'
  obtido=$(chama_rpc "$D_ITEM_PENDENTE")
  confere 'item pending bloqueia a conclusao mesmo com recipient terminal' 'false' "$obtido"
  confere 'dispatch com item pending segue sending' 'sending' "$(status_dispatch "$D_ITEM_PENDENTE")"

  fixture "$D_ITEM_RETRY" 'failed_transient' 'sent'
  obtido=$(chama_rpc "$D_ITEM_RETRY")
  confere 'item failed_transient (retry) bloqueia a conclusao' 'false' "$obtido"

  fixture "$D_LEGADO_PENDENTE" '-' 'pending'
  obtido=$(chama_rpc "$D_LEGADO_PENDENTE")
  confere 'legado sem itens: recipient pending bloqueia' 'false' "$obtido"

  fixture "$D_LEGADO_TERMINAL" '-' 'sent,delivered'
  obtido=$(chama_rpc "$D_LEGADO_TERMINAL")
  confere 'legado sem itens: recipients terminais concluem' 'true' "$obtido"

  [ "$desvios" -eq 0 ]
}

# ── Bloco A: o defeito ainda existe (vermelho) ───────────────────────────────
printf '\nBloco A — estado vivo, sem a migration nova\n' >&2
if camada_correta; then
  fail 'a conclusao ja decide pela fila por item: o defeito MX03 nao existe mais neste workspace'
fi
ok "DEFEITO CONFIRMADO (MX03): a conclusao usou a fila antiga de recipients ($desvios desvio(s))"

# ── Bloco B: a migration nova (verde) ───────────────────────────────────────
printf '\nBloco B — com a migration nova\n' >&2
NOVA=$(cd "$migrations_dir" && ls -1 *_multiplix_conclusao_fila_itens.sql | tail -1)
[ -n "$NOVA" ] || fail 'migration nova (*_multiplix_conclusao_fila_itens.sql) nao encontrada'
migration "$NOVA"
camada_correta || fail 'a conclusao continuou errada depois da migration'

# ── protecao: so service_role executa (nao muda) ─────────────────────────────
confere_priv() { # <descricao> <esperado> <obtido>
  [ "$2" = "$3" ] || fail "$1: esperado=$2 obtido=$3"
  ok "$1"
}
confere_priv 'authenticated sem EXECUTE' 'f' \
  "$(psql_test -qAt -c "SELECT has_function_privilege('authenticated', 'public.complete_multiplix_dispatch_if_drained(uuid)', 'EXECUTE')")"
confere_priv 'anon sem EXECUTE' 'f' \
  "$(psql_test -qAt -c "SELECT has_function_privilege('anon', 'public.complete_multiplix_dispatch_if_drained(uuid)', 'EXECUTE')")"

fixture "$D_ITEM_PENDENTE" 'pending' 'sent'
if psql_test -qAt \
  -c "SET ROLE authenticated" \
  -c "SELECT set_config('request.jwt.claims', '{\"role\":\"authenticated\"}', false)" \
  -c "SELECT public.complete_multiplix_dispatch_if_drained('$D_ITEM_PENDENTE')" >/dev/null 2>&1; then
  fail 'authenticated conseguiu chamar a RPC de conclusao'
fi
ok 'authenticated recusado com service_role_required'

printf '\nPASS: conclusao do Multiplix decide pela fila por item quando ela existe (MX03)\n' >&2
