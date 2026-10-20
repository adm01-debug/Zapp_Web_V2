#!/usr/bin/env bash
# N-102 (refazer t_b7ce25ec sobre a entrega 26101319059cbc): versiona a prova de que
# supabase/migrations/20261013085500_talkx_n102_window_fixes.sql APLICA em qualquer
# empilhamento e que a restricao de EXECUTE continua valendo quando a funcao existe.
#
# O defeito que este teste guarda (medido na pilha de 14/10, cartao t_ad964aab):
#   psql:<stdin>:30: ERROR:  function public.talkx_campaign_window_open(uuid, timestamp with time zone) does not exist
# A base que CRIA a funcao (20261009203548) nao esta em nenhuma branch dia/, so em branches de
# cartoes recusados/preparacao; sem ela na pilha o REVOKE cru derrubava a aplicacao das migrations.
#
# Blocos:
#   A — banco SEM a funcao: a migration aplica com ON_ERROR_STOP=1, emite o NOTICE de base
#       ausente e NAO cria a funcao (nada de DDL escondido para "fazer passar").
#   B — banco COM a funcao (stub da mesma identidade, ACL de fabrica: EXECUTE para PUBLIC):
#       a migration tira o EXECUTE de PUBLIC/anon/authenticated e deixa so service_role.
#       B0 prova que a assercao nao e vacua: antes da migration anon e authenticated executam.
#   C — replay: aplicar a migration duas vezes seguidas nao da erro (o reconciliar da pilha
#       reaplica o conjunto inteiro quando o ledger diverge).
#   D — rollback: a linha `-- Rollback:` do cabecalho roda nos DOIS estados (com e sem a funcao)
#       e devolve EXECUTE a authenticated.
#   E — a guarda generica scripts/db-audit/check-secdef-public-execute.sql segue verde depois.
#
# Override para a prova de mutacao (RED com a copia anterior, sem a guarda do DO):
#   TALKX_N102_ACL_TEST_MIGRATION=<outra copia do .sql>

set -euo pipefail

repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
migration="${TALKX_N102_ACL_TEST_MIGRATION:-$repo_root/supabase/migrations/20261013085500_talkx_n102_window_fixes.sql}"
guard_sql="$repo_root/scripts/db-audit/check-secdef-public-execute.sql"
postgres_image="${TALKX_N102_ACL_TEST_POSTGRES_IMAGE:-postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a3278a52a7ec49117deedb300e552b24}"

[[ -f "$migration" ]] || { printf 'FAIL: migration nao encontrada: %s\n' "$migration" >&2; exit 1; }
[[ -f "$guard_sql" ]] || { printf 'FAIL: guarda nao encontrada: %s\n' "$guard_sql" >&2; exit 1; }

container_name=''
containers=()
tmp_dir="$(mktemp -d)"

cleanup() {
  local c
  for c in "${containers[@]}"; do docker rm -f "$c" >/dev/null 2>&1 || true; done
  rm -rf "$tmp_dir"
}
trap cleanup EXIT INT TERM

fail() { printf 'FAIL: %s\n' "$1" >&2; exit 1; }
pass() { printf 'PASS: %s\n' "$1"; }

start_postgres() {
  # Requer duas sondas seguidas: o runner as vezes reporta pronto um instante antes do
  # container reiniciar. So o bootstrap e retentado; falha de assercao nunca.
  local attempt
  for attempt in 1 2 3; do
    docker rm -f "$container_name" >/dev/null 2>&1 || true
    if ! docker run -d --name "$container_name" -e POSTGRES_PASSWORD=talkx_n102_acl_test_only "$postgres_image" >/dev/null; then
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

novo_container() {
  container_name="talkx-n102-acl-test-$$${1:+-$1}"
  containers+=("$container_name")
  start_postgres || fail "PostgreSQL de teste nao iniciou ($container_name)"
}

psql_test() { docker exec -i "$container_name" psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres "$@"; }
psql_q() { docker exec -i "$container_name" psql -X -v ON_ERROR_STOP=1 -Atq -U postgres -d postgres -c "$1"; }

# Aplica a MIGRATION REAL como o ledger aplica: ON_ERROR_STOP, qualquer instrucao que falhe
# derruba a aplicacao inteira. Log completo em $1.
aplica_migration() { docker exec -i "$container_name" psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres < "$migration" > "$1" 2>&1; }

# ACL efetiva de uma role na funcao (t/f).
acesso() { psql_q "SELECT has_function_privilege('$1', 'public.talkx_campaign_window_open(uuid,timestamptz)', 'EXECUTE')"; }

# EXECUTE concedido a PUBLIC no ACL explicito da funcao (0 = role PUBLIC).
acesso_public() {
  psql_q "SELECT count(*) FROM aclexplode(coalesce(
            (SELECT proacl FROM pg_proc WHERE oid = 'public.talkx_campaign_window_open(uuid,timestamptz)'::regprocedure),
            acldefault('f', (SELECT proowner FROM pg_proc WHERE oid = 'public.talkx_campaign_window_open(uuid,timestamptz)'::regprocedure)))) a
           WHERE a.grantee = 0 AND a.privilege_type = 'EXECUTE'"
}

roles_sql='CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;'

# ── Bloco A: banco SEM a funcao — o estado da pilha que derrubou o BANCO em 14/10 ──────────
novo_container a
psql_test >/dev/null <<SQL
$roles_sql
SQL

[[ "$(psql_q "SELECT to_regprocedure('public.talkx_campaign_window_open(uuid,timestamptz)') IS NULL")" == 't' ]] \
  || fail 'A.0: pre-condicao falhou (a funcao deveria estar ausente neste banco)'

if ! aplica_migration "$tmp_dir/A.log"; then
  printf -- '--- saida da migration no banco SEM a funcao ---\n' >&2
  cat "$tmp_dir/A.log" >&2
  fail 'A: a migration NAO aplica num banco sem a funcao (o defeito da pilha de 14/10)'
fi
grep -q 'talkx_n102: base 20261009203548 ausente nesta pilha' "$tmp_dir/A.log" \
  || { cat "$tmp_dir/A.log" >&2; fail 'A: faltou o NOTICE de base ausente (a migration passou calada)'; }
[[ "$(psql_q "SELECT to_regprocedure('public.talkx_campaign_window_open(uuid,timestamptz)') IS NULL")" == 't' ]] \
  || fail 'A: a migration CRIOU a funcao (nao pode: o alvo desta migration e so a ACL)'
pass 'A: sem a funcao a migration aplica (NOTICE de base ausente) e nao cria nada'

# ── Bloco D (lado sem a funcao): o `-- Rollback:` nao pode quebrar nesse estado ────────────
rollback_sql="$(sed -n 's/^-- Rollback: //p' "$migration" | head -n1)"
[[ -n "$rollback_sql" ]] || fail 'D: a migration nao traz a linha `-- Rollback:` executavel'
printf '%s\n' "$rollback_sql" | docker exec -i "$container_name" psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres > "$tmp_dir/D1.log" 2>&1 \
  || { cat "$tmp_dir/D1.log" >&2; fail 'D1: o rollback nao roda num banco sem a funcao'; }
pass 'D1: o rollback roda (e nao faz nada) no banco sem a funcao'

# ── Bloco B: banco COM a funcao — a restricao tem de sair do PUBLIC/anon/authenticated ─────
novo_container b
psql_test >/dev/null <<'SQL'
CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE ROLE service_role;
CREATE FUNCTION public.talkx_campaign_window_open(p_campaign_id uuid, p_at timestamptz)
RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$ SELECT true $$;
SQL

[[ "$(acesso anon)" == 't' ]] || fail 'B.0: pre-condicao falhou (anon deveria executar antes da migration)'
[[ "$(acesso authenticated)" == 't' ]] || fail 'B.0: pre-condicao falhou (authenticated deveria executar antes da migration)'
[[ "$(acesso_public)" == '1' ]] || fail 'B.0: pre-condicao falhou (PUBLIC deveria ter EXECUTE de fabrica)'
pass 'B.0: antes da migration a SECURITY DEFINER e executavel por PUBLIC/anon/authenticated'

if ! aplica_migration "$tmp_dir/B.log"; then
  printf -- '--- saida da migration no banco COM a funcao ---\n' >&2
  cat "$tmp_dir/B.log" >&2
  fail 'B: a migration nao aplica com a funcao presente'
fi
[[ "$(acesso anon)" == 'f' ]] || fail 'B: anon continua com EXECUTE'
[[ "$(acesso authenticated)" == 'f' ]] || fail 'B: authenticated continua com EXECUTE (o defeito N-102 de acesso)'
[[ "$(acesso service_role)" == 't' ]] || fail 'B: service_role perdeu o EXECUTE (o unico consumidor real e o talkx-scheduler)'
[[ "$(acesso_public)" == '0' ]] || fail 'B: PUBLIC continua com EXECUTE'
pass 'B: so service_role executa (PUBLIC, anon e authenticated revogados)'

# ── Bloco C: replay da mesma migration (o reconciliar reaplica o conjunto) ─────────────────
if ! aplica_migration "$tmp_dir/C.log"; then
  cat "$tmp_dir/C.log" >&2
  fail 'C: reaplicar a migration deu erro'
fi
[[ "$(acesso authenticated)" == 'f' ]] || fail 'C: o replay devolveu EXECUTE a authenticated'
pass 'C: replay aplica de novo sem erro e sem reabrir o EXECUTE'

# ── Bloco D (lado com a funcao): o `-- Rollback:` devolve a ACL anterior ───────────────────
printf '%s\n' "$rollback_sql" | docker exec -i "$container_name" psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres > "$tmp_dir/D2.log" 2>&1 \
  || { cat "$tmp_dir/D2.log" >&2; fail 'D2: o rollback nao roda com a funcao presente'; }
[[ "$(acesso authenticated)" == 't' ]] || fail 'D2: o rollback nao devolveu o EXECUTE a authenticated'
[[ "$(acesso service_role)" == 'f' ]] || fail 'D2: o rollback deixou o EXECUTE em service_role'
pass 'D2: o rollback restaura a ACL anterior (authenticated com EXECUTE, service_role sem)'

# ── Bloco E: a guarda generica segue verde depois da migration ─────────────────────────────
if ! docker exec -i "$container_name" psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres -f - < "$guard_sql" > "$tmp_dir/E.log" 2>&1; then
  cat "$tmp_dir/E.log" >&2
  fail 'E: a guarda check-secdef-public-execute reprovou o estado depois da migration'
fi
grep -q 'check-secdef-public-execute: OK' "$tmp_dir/E.log" \
  || { cat "$tmp_dir/E.log" >&2; fail 'E: a guarda nao emitiu o OK esperado'; }
pass 'E: check-secdef-public-execute segue verde'

printf 'PASS: N-102 20261013085500_talkx_n102_window_fixes.sql — aplica sem a base, restringe a ACL com a base presente, replay e rollback\n'
