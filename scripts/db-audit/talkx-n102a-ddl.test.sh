#!/usr/bin/env bash
set -Eeuo pipefail

# N-102a (fatia de DDL da janela de envio do Talk X) — inventario de melhorias, banco.
#
# A janela de envio precisa guardar os dias da semana (send_weekdays) e o respeito ao
# horario "nao perturbe" (respect_dnd em talkx_campaigns + setting dnd_hours em
# talkx_settings). Sem o DDL, nenhuma RPC da janela compila.
#
# Prova, em PostgreSQL 17 descartavel:
#   RED      — a BASE LEGADA (talkx_campaigns sem as colunas, talkx_settings sem
#              dnd_hours) nao tem o que a migration cria;
#   GREEN    — a migration REAL cria as duas colunas (tipo, NULL/NOT NULL, default
#              true em respect_dnd), o setting dnd_hours e e idempotente (a segunda
#              aplicacao e no-op; a linha legada herda o default sem perder o valor);
#   ACL      — a migration NAO mexe em GRANT/REVOKE: a ACL das duas tabelas fica
#              identica antes/depois e nenhuma coluna nova recebe grant de coluna
#              (nao ha GRANT a authenticated);
#   ROLLBACK — o bloco executavel do cabecalho desfaz (colunas + setting) e a
#              migration reaplica em ciclo completo (ida e volta restauram o schema).
#
# Uso: bash scripts/db-audit/retry-disposable-postgres-test.sh bash scripts/db-audit/talkx-n102a-ddl.test.sh

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
postgres_image="${TALKX_N102A_DDL_TEST_POSTGRES_IMAGE:-postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a3278a52a7ec49117deedb300e552b24}"
container_name="zapp-talkx-n102a-ddl-$RANDOM-$$"
test_password="talkx_n102a_test_only"

cleanup() {
  if [[ "$container_name" =~ ^zapp-talkx-n102a-ddl-[0-9]+-[0-9]+$ ]]; then
    docker rm -f "$container_name" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT INT TERM

fail() { printf '[FAIL] %s\n' "$1" >&2; exit 1; }
psql_test() { docker exec -i "$container_name" psql -X -q -v ON_ERROR_STOP=1 -U postgres -d postgres "$@"; }
psql_atomic_file() { docker exec -i "$container_name" psql -X -q -v ON_ERROR_STOP=1 --single-transaction -U postgres -d postgres < "$1"; }

command -v docker >/dev/null 2>&1 || fail 'Docker nao esta instalado'
docker info >/dev/null 2>&1 || fail 'Docker daemon nao acessivel'
docker run --rm -d --name "$container_name" -e POSTGRES_PASSWORD="$test_password" "$postgres_image" >/dev/null

ready=false
for _ in $(seq 1 90); do
  markers="$(docker logs "$container_name" 2>&1 | grep -c 'database system is ready to accept connections' || true)"
  if [[ "$markers" -ge 2 ]] && docker exec "$container_name" \
    psql -X -U postgres -d postgres -Atqc 'SELECT 1' >/dev/null 2>&1; then
    ready=true
    break
  fi
  sleep 1
done
[[ "$ready" == true ]] || fail 'PostgreSQL 17 descartavel nao ficou pronto'

# ---- base LEGADA: talkx_campaigns sem as colunas novas, talkx_settings sem dnd_hours ----
psql_test >/dev/null <<'SQL'
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN;
CREATE ROLE anon NOLOGIN;

CREATE TABLE public.talkx_campaigns (
  id uuid PRIMARY KEY,
  status text NOT NULL DEFAULT 'draft'
);
INSERT INTO public.talkx_campaigns(id, status) VALUES
  ('30000000-0000-0000-0000-0000000000a1', 'draft');

CREATE TABLE public.talkx_settings (
  key         text PRIMARY KEY,
  value       jsonb NOT NULL,
  description text,
  updated_at  timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.talkx_settings(key, value, description) VALUES
  ('reply_window_hours', '{"hours":48}'::jsonb, 'janela de resposta');
SQL

migration="$repo_root/supabase/migrations/20261011003005_talkx_n102a_ddl.sql"
[[ -f "$migration" ]] || fail 'migration N-102a nao existe'

col_present() { psql_test -Atqc "SELECT count(*) FROM pg_attribute WHERE attrelid='public.talkx_campaigns'::regclass AND attname='$1' AND NOT attisdropped"; }
col_type()    { psql_test -Atqc "SELECT format_type(atttypid, atttypmod) FROM pg_attribute WHERE attrelid='public.talkx_campaigns'::regclass AND attname='$1' AND NOT attisdropped"; }
col_notnull() { psql_test -Atqc "SELECT attnotnull FROM pg_attribute WHERE attrelid='public.talkx_campaigns'::regclass AND attname='$1' AND NOT attisdropped"; }
col_default() { psql_test -Atqc "SELECT pg_get_expr(adbin, adrelid) FROM pg_attrdef WHERE adrelid='public.talkx_campaigns'::regclass AND adnum=(SELECT attnum FROM pg_attribute WHERE attrelid='public.talkx_campaigns'::regclass AND attname='$1')"; }
dnd_rows()    { psql_test -Atqc "SELECT count(*) FROM public.talkx_settings WHERE key='dnd_hours'"; }
relacl()      { psql_test -Atqc "SELECT coalesce(relacl::text, '') FROM pg_class WHERE oid='$1'::regclass"; }

# ---- RED: a base legada nao tem as colunas nem o setting ----
[[ "$(col_present send_weekdays)" == '0' ]] || fail 'RED: send_weekdays ja existia na base legada'
[[ "$(col_present respect_dnd)" == '0' ]] || fail 'RED: respect_dnd ja existia na base legada'
[[ "$(dnd_rows)" == '0' ]] || fail 'RED: o setting dnd_hours ja existia na base legada'

acl_campaigns_before="$(relacl public.talkx_campaigns)"
acl_settings_before="$(relacl public.talkx_settings)"

# ---- GREEN: aplica a migration REAL (atomica) e reaplica (idempotente) ----
psql_atomic_file "$migration" >/dev/null || fail 'N-102a nao aplicou'
psql_test < "$migration" >/dev/null || fail 'N-102a nao e replayavel (segunda aplicacao falhou)'

[[ "$(col_type send_weekdays)" == 'smallint[]' ]] || fail "GREEN: send_weekdays deveria ser smallint[] (got $(col_type send_weekdays))"
[[ "$(col_notnull send_weekdays)" == 'f' ]] || fail 'GREEN: send_weekdays deveria ser nullable'
[[ "$(col_type respect_dnd)" == 'boolean' ]] || fail "GREEN: respect_dnd deveria ser boolean (got $(col_type respect_dnd))"
[[ "$(col_notnull respect_dnd)" == 't' ]] || fail 'GREEN: respect_dnd deveria ser NOT NULL'
[[ "$(col_default respect_dnd)" == 'true' ]] || fail "GREEN: default de respect_dnd deveria ser true (got $(col_default respect_dnd))"

[[ "$(dnd_rows)" == '1' ]] || fail "GREEN: dnd_hours deveria ter exatamente 1 linha (got $(dnd_rows))"
dnd_value="$(psql_test -Atqc "SELECT (value->>'start')||'/'||(value->>'end')||'/'||(value->>'sundays') FROM public.talkx_settings WHERE key='dnd_hours'")"
[[ "$dnd_value" == '22:00/08:00/true' ]] || fail "GREEN: valor de dnd_hours inesperado (got $dnd_value)"

# a linha legada herda o default sem perder o valor existente (nenhum UPDATE em massa)
[[ "$(psql_test -Atqc "SELECT (send_weekdays IS NULL) AND respect_dnd FROM public.talkx_campaigns WHERE id='30000000-0000-0000-0000-0000000000a1'")" == 't' ]] \
  || fail 'GREEN: linha legada nao herdou o default (send_weekdays NULL / respect_dnd true)'

# ---- ACL: a migration nao concede nada (sem GRANT a authenticated) ----
[[ "$(relacl public.talkx_campaigns)" == "$acl_campaigns_before" ]] || fail 'ACL: talkx_campaigns mudou de ACL (GRANT/REVOKE indevido)'
[[ "$(relacl public.talkx_settings)" == "$acl_settings_before" ]] || fail 'ACL: talkx_settings mudou de ACL (GRANT/REVOKE indevido)'
[[ "$(psql_test -Atqc "SELECT count(*) FROM pg_attribute WHERE attrelid='public.talkx_campaigns'::regclass AND attname IN ('send_weekdays','respect_dnd') AND attacl IS NOT NULL")" == '0' ]] \
  || fail 'ACL: coluna nova recebeu GRANT de coluna (deveria seguir so o GRANT da tabela)'

# ---- ROLLBACK: o bloco executavel do cabecalho volta o estado anterior ----
rb_sql="$(grep -E '^--   ' "$migration" | sed -E 's/^--   //')"
[[ -n "$rb_sql" ]] || fail 'ROLLBACK: a migration nao tem bloco de rollback executavel'
printf '%s\n' "$rb_sql" | psql_test >/dev/null || fail 'ROLLBACK: o rollback da migration nao executou'
[[ "$(col_present send_weekdays)" == '0' ]] || fail 'ROLLBACK: send_weekdays nao foi removida'
[[ "$(col_present respect_dnd)" == '0' ]] || fail 'ROLLBACK: respect_dnd nao foi removida'
[[ "$(dnd_rows)" == '0' ]] || fail 'ROLLBACK: o setting dnd_hours nao foi removido'

# ida e volta: reaplica apos o rollback
psql_test < "$migration" >/dev/null || fail 'ROLLBACK: N-102a nao reaplicou apos o rollback'
[[ "$(dnd_rows)" == '1' && "$(col_present respect_dnd)" == '1' ]] || fail 'ROLLBACK: reaplicacao nao restaurou o schema'

printf '[OK] Talk X N-102a: DDL da janela de envio (send_weekdays/respect_dnd + dnd_hours) idempotente na base legada; ACL intacta; rollback e ida-e-volta ok.\n'
