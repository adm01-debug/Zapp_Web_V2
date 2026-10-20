#!/usr/bin/env bash
# talkx-blacklist-realtime (X069p1 · banco): escopo MINIMO de colunas da publicacao
# Realtime da lista de supressao.
#
# ESCOPO DESTA ENTREGA — leia antes de interpretar um verde:
#   Este harness prova SOMENTE que a migration
#   supabase/migrations/20261011000013_talkx_blacklist_realtime_column_scope.sql
#   publica public.talkx_blacklist na publicacao supabase_realtime com a LISTA MINIMA
#   de colunas (id, contact_id) — so o que a tela usa para reagir quando um telefone
#   entra ou sai da lista. NADA alem disso trafega no evento: nem `phone` (o telefone
#   do contato nao pode ir no payload do Realtime — a policy de SELECT e USING (true)
#   para authenticated), nem os metadados que a tela nao consome (reason, blocked_by,
#   created_at, removed_by, removed_at, origin, campaign_id, reason_code, expires_at,
#   source_message_id).
#
#   Fechado por padrao: se uma DDL futura adicionar coluna que a tela passe a precisar,
#   uma NOVA migration (revisada) estende a lista — coluna nova nunca entra sozinha.
#   O `add table (...)` falha alto se um nome da lista deixar de existir (deriva de
#   DDL vira erro, nao silencio).
#
#   NAO se testa aqui o COMPORTAMENTO da assinatura no navegador (worker de telas/hooks),
#   nem se a RPC de supressao grava a linha — isso e de outros cartoes. Tambem NAO se
#   prova entrega de payload pelo servico Realtime (nao se sobe o container supabase):
#   prova-se a ESTRUTURA que o servico le, `pg_publication_tables.attnames`.
#
# Contrato em PostgreSQL 17 descartavel, no mesmo formato dos testes irmaos
# (scripts/db-audit/talkx-campaign-segments.test.sh): sobe um container com
# wal_level=logical, cria um schema minimo com os objetos que a migration toca, aplica a
# migration REAL e prova cada caso abaixo.
#
# VERMELHO: rode com TALKX_BLACKLIST_REALTIME_TEST_MIGRATION apontando para a migration
# de 12 colunas (.tmp/old-migration-12cols.sql, a entrega recusada) e o harness FALHA no
# caso `scope_minimal` — e a prova de que o aceite (lista minima) depende desta migration.
# Rode apontando para um arquivo vazio e FALHA em `published_with_scope`.
#
# AUSENCIA DE MEDICAO CONTA COMO FALHA: cada caso registra sua execucao em CASES_SEEN e
# o harness FALHA no fim se algum caso esperado nao tiver rodado.

set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
migration="${TALKX_BLACKLIST_REALTIME_TEST_MIGRATION:-$repo_root/supabase/migrations/20261011000013_talkx_blacklist_realtime_column_scope.sql}"
postgres_image="${TALKX_BLACKLIST_REALTIME_TEST_POSTGRES_IMAGE:-postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a3278a52a7ec49117deedb300e552b24}"
container_name="talkx-blacklist-realtime-test-$$"
test_password="talkx_blacklist_realtime_test_only"

cleanup() { docker rm -f "$container_name" >/dev/null 2>&1 || true; }
trap cleanup EXIT

fail() { printf 'FAIL: %s\n' "$1" >&2; exit 1; }
pass() { printf 'PASS: %s\n' "$1"; }
psql_test() { docker exec -i "$container_name" psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres "$@"; }
psql_q() { psql_test -Atqc "$1"; }

# --- registro dos casos (ausencia de medicao = falha) -----------------------
declare -A CASES_SEEN=()
declare -a CASES_EXPECTED=(
  pre_state_absent published_with_scope scope_excludes_phone scope_minimal replay_idempotent rollback_removes
)
case_done() { CASES_SEEN["$1"]=1; }

start_postgres() {
  for attempt in 1 2 3; do
    docker rm -f "$container_name" >/dev/null 2>&1 || true
    # wal_level=logical: `alter publication ... add table (colunas)` so tem semantica real
    # de Realtime com wal_level adequado; caso contrario o servidor emite apenas WARNING.
    if ! docker run -d --name "$container_name" -e POSTGRES_PASSWORD="$test_password" \
         "$postgres_image" postgres -c wal_level=logical >/dev/null; then
      printf 'WARN: container PostgreSQL nao subiu (tentativa %s/3)\n' "$attempt" >&2
      continue
    fi
    for _ in $(seq 1 30); do
      if docker exec "$container_name" psql -X -U postgres -d postgres -Atqc 'SELECT 1' >/dev/null 2>&1; then
        sleep 1
        if docker exec "$container_name" psql -X -U postgres -d postgres -Atqc 'SELECT 1' >/dev/null 2>&1; then
          return 0
        fi
      fi
      sleep 1
    done
    printf 'WARN: PostgreSQL descartavel nao estabilizou (tentativa %s/3)\n' "$attempt" >&2
  done
  return 1
}

command -v docker >/dev/null 2>&1 || fail 'Docker nao esta instalado'
docker info >/dev/null 2>&1 || fail 'Docker daemon nao esta acessivel'
[[ -f "$migration" ]] || fail "migration ausente: $migration"

start_postgres || fail 'PostgreSQL de teste nao iniciou'

# ---------------------------------------------------------------------------
# Schema minimo: a publicacao realtime JA existente (sem talkx_blacklist) e a tabela
# talkx_blacklist com a forma atual (TODAS as colunas reais, INCLUSIVE `phone` e os
# metadados), para que a exclusao de cada coluna na publicacao seja uma escolha medida
# e nao um efeito de a coluna nao existir.
# ---------------------------------------------------------------------------
psql_test >/dev/null <<'SQL'
CREATE TYPE public.talkx_blacklist_reason AS ENUM ('manual', 'optout', 'spam', 'outro');

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL UNIQUE
);

CREATE TABLE public.contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid()
);

CREATE TABLE public.talkx_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid()
);

CREATE TABLE public.talkx_blacklist (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  contact_id uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  reason text DEFAULT 'Solicitacao do cliente',
  blocked_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  removed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  removed_at timestamptz,
  origin text NOT NULL DEFAULT 'manual',
  campaign_id uuid REFERENCES public.talkx_campaigns(id) ON DELETE SET NULL,
  phone text,
  reason_code public.talkx_blacklist_reason,
  expires_at timestamptz,
  source_message_id uuid
);

CREATE PUBLICATION supabase_realtime;
SQL

# A tabela tem `phone` de verdade: sem isso a assercao de exclusao seria vazia.
phone_cols="$(psql_q "SELECT count(*) FROM information_schema.columns
  WHERE table_schema='public' AND table_name='talkx_blacklist' AND column_name='phone'")"
[[ "$phone_cols" == '1' ]] || fail "fixture invalida: talkx_blacklist.phone ausente [obtido: $phone_cols]"

# ---------------------------------------------------------------------------
# (1) ESTADO ANTERIOR: a tabela NAO esta publicada (vermelho antes da migration)
# ---------------------------------------------------------------------------
pub_before="$(psql_q "SELECT count(*) FROM pg_publication_tables
  WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='talkx_blacklist'")"
[[ "$pub_before" == '0' ]] || fail "(1) tabela ja publicada antes da migration [obtido: $pub_before]"
pass '(1) estado anterior: talkx_blacklist NAO estava em supabase_realtime'
case_done pre_state_absent

# ---------------------------------------------------------------------------
# Aplicacao da migration REAL
# ---------------------------------------------------------------------------
psql_test < "$migration" >/dev/null || fail 'migration nao aplicou'
pass '(0) migration aplicada sobre o schema minimo'

# ---------------------------------------------------------------------------
# (2) PUBLICADA: talkx_blacklist consta de pg_publication_tables
# ---------------------------------------------------------------------------
pub_after="$(psql_q "SELECT count(*) FROM pg_publication_tables
  WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='talkx_blacklist'")"
[[ "$pub_after" == '1' ]] || fail "(2) talkx_blacklist NAO entrou em supabase_realtime [obtido: $pub_after]"
pass '(2) talkx_blacklist publicada em supabase_realtime'
case_done published_with_scope

# ---------------------------------------------------------------------------
# (3) ESCOPO SEM TELEFONE: `phone` nao aparece na lista de colunas publicadas
# ---------------------------------------------------------------------------
phone_published="$(psql_q "SELECT count(*) FROM pg_publication_tables
  WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='talkx_blacklist'
    AND 'phone' = ANY (attnames)")"
[[ "$phone_published" == '0' ]] || fail "(3) \`phone\` esta publicado no Realtime [obtido: $phone_published]"
pass '(3) `phone` FORA da lista de colunas publicadas'
case_done scope_excludes_phone

# ---------------------------------------------------------------------------
# (4) ESCOPO MINIMO: EXATAMENTE (contact_id, id) — nada alem do que a tela usa.
# Compara o conjunto publicado com o esperado, ordenado: qualquer coluna a mais
# (reason, blocked_by, created_at, removed_by, removed_at, origin, campaign_id,
# reason_code, expires_at, source_message_id) ou a menos reprova.
# ---------------------------------------------------------------------------
published_cols="$(psql_q "SELECT coalesce(array_to_string(array_agg(a ORDER BY a), ','), '')
  FROM pg_publication_tables,
       LATERAL unnest(attnames) AS a
  WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='talkx_blacklist'")"
[[ "$published_cols" == 'contact_id,id' ]] || fail "(4) publicacao NAO e minima (id, contact_id) [obtido: $published_cols]"
pass '(4) escopo minimo exato: (contact_id, id) e nada mais'
case_done scope_minimal

# ---------------------------------------------------------------------------
# (5) REPLAY: a migration e idempotente (roda 2x sem erro, nao duplica, nao afrouxa)
# ---------------------------------------------------------------------------
psql_test < "$migration" >/dev/null || fail '(5) reaplicacao da migration falhou'
rows_after_replay="$(psql_q "SELECT count(*) FROM pg_publication_tables
  WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='talkx_blacklist'")"
[[ "$rows_after_replay" == '1' ]] || fail "(5) replay duplicou a publicacao [obtido: $rows_after_replay]"
cols_after_replay="$(psql_q "SELECT coalesce(array_to_string(array_agg(a ORDER BY a), ','), '')
  FROM pg_publication_tables,
       LATERAL unnest(attnames) AS a
  WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='talkx_blacklist'")"
[[ "$cols_after_replay" == 'contact_id,id' ]] || fail "(5) replay afrouxou o escopo [obtido: $cols_after_replay]"
pass '(5) replay idempotente: 1 entrada e escopo segue minimo'
case_done replay_idempotent

# ---------------------------------------------------------------------------
# (6) ROLLBACK: a linha `-- Rollback:` do cabecalho da migration, executada de
# verdade, retira a tabela da publicacao (0 linhas em pg_publication_tables)
# ---------------------------------------------------------------------------
rollback_sql="$(sed -n 's/^-- Rollback: //p' "$migration")"
[[ -n "$rollback_sql" ]] || fail '(6) cabecalho da migration sem linha -- Rollback: executavel'
printf '%s\n' "$rollback_sql" | psql_test -v ON_ERROR_STOP=1 >/dev/null || fail '(6) rollback nao executou'
rows_after_rollback="$(psql_q "SELECT count(*) FROM pg_publication_tables
  WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='talkx_blacklist'")"
[[ "$rows_after_rollback" == '0' ]] || fail "(6) rollback nao retirou a tabela da publicacao [obtido: $rows_after_rollback]"
pass '(6) rollback executado: 0 linhas em pg_publication_tables'
case_done rollback_removes
psql_test < "$migration" >/dev/null || fail '(6) reaplicacao apos o rollback falhou'

# ---------------------------------------------------------------------------
# AUSENCIA DE MEDICAO CONTA COMO FALHA
# ---------------------------------------------------------------------------
for c in "${CASES_EXPECTED[@]}"; do
  [[ "${CASES_SEEN[$c]:-}" == '1' ]] || fail "caso de aceite NAO executado: $c (ausencia de medicao)"
done
printf 'PASS: %s/%s casos de aceite medidos\n' "${#CASES_EXPECTED[@]}" "${#CASES_EXPECTED[@]}"

printf 'PASS: talkx_blacklist publicada em supabase_realtime com escopo MINIMO (id, contact_id) — replay idempotente\n'
