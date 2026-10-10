#!/usr/bin/env bash
# talkx-blacklist-realtime (X069p1 · banco): escopo de COLUNAS da publicacao Realtime
# da lista de supressao.
#
# ESCOPO DESTA ENTREGA — leia antes de interpretar um verde:
#   Este harness prova SOMENTE que a migration
#   supabase/migrations/20261011000013_talkx_blacklist_realtime_column_scope.sql
#   publica public.talkx_blacklist na publicacao supabase_realtime com uma LISTA DE
#   COLUNAS que NAO inclui `phone` (o telefone do contato nao pode trafegar no payload
#   do Realtime — a policy de SELECT e USING (true) para authenticated) e que o restante
#   do registro (id, contact_id, reason, ...) segue publicado.
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
# VERMELHO: rode com TALKX_BLACKLIST_REALTIME_TEST_MIGRATION apontando para um arquivo
# vazio (ou qualquer migration que nao publique a tabela) e o harness FALHA no caso
# `published_with_scope` — e a prova de que o aceite depende desta migration.
#
# AUSENCIA DE MEDICAO CONTA COMO FALHA: cada caso registra sua execucao em CASES_SEEN e
# o harness FALHA no fim se algum caso esperado nao tiver rodado.

set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
migration="${TALKX_BLACKLIST_REALTIME_TEST_MIGRATION:-$repo_root/supabase/migrations/20261011000013_talkx_blacklist_realtime_column_scope.sql}"
postgres_image="${TALKX_BLACKLIST_REALTIME_TEST_POSTGRES_IMAGE:-postgres:17-alpine}"
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
  pre_state_absent published_with_scope scope_excludes_phone scope_keeps_registro replay_idempotent
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
# talkx_blacklist com a forma atual (todas as colunas, INCLUSIVE `phone`), para que a
# exclusao do telefone na publicacao seja uma escolha medida e nao um efeito de a coluna
# nao existir.
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
[[ "$phone_published" == '0' ]] || fail "(3) `phone` esta publicado no Realtime [obtido: $phone_published]"
pass '(3) `phone` FORA da lista de colunas publicadas'
case_done scope_excludes_phone

# ---------------------------------------------------------------------------
# (4) ESCOPO MANTEM O REGISTRO: as outras colunas seguem publicadas
# ---------------------------------------------------------------------------
required=(id contact_id reason blocked_by created_at removed_by removed_at origin campaign_id reason_code expires_at source_message_id)
missing=''
for col in "${required[@]}"; do
  hit="$(psql_q "SELECT count(*) FROM pg_publication_tables
    WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='talkx_blacklist'
      AND '$col' = ANY (attnames)")"
  [[ "$hit" == '1' ]] || missing="$missing $col"
done
[[ -z "$missing" ]] || fail "(4) colunas do registro ausentes da publicacao:$missing"
pass '(4) registro publicado sem lacuna (12 colunas, incluindo a PK id)'
case_done scope_keeps_registro

# ---------------------------------------------------------------------------
# (5) REPLAY: a migration e idempotente (roda 2x sem erro e nao duplica/afrouxa)
# ---------------------------------------------------------------------------
psql_test < "$migration" >/dev/null || fail '(5) reaplicacao da migration falhou'
rows_after_replay="$(psql_q "SELECT count(*) FROM pg_publication_tables
  WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='talkx_blacklist'")"
[[ "$rows_after_replay" == '1' ]] || fail "(5) replay duplicou a publicacao [obtido: $rows_after_replay]"
phone_after_replay="$(psql_q "SELECT count(*) FROM pg_publication_tables
  WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='talkx_blacklist'
    AND 'phone' = ANY (attnames)")"
[[ "$phone_after_replay" == '0' ]] || fail "(5) replay reintroduziu `phone` na publicacao [obtido: $phone_after_replay]"
pass '(5) replay idempotente: 1 entrada e `phone` segue fora'
case_done replay_idempotent

# ---------------------------------------------------------------------------
# AUSENCIA DE MEDICAO CONTA COMO FALHA
# ---------------------------------------------------------------------------
for c in "${CASES_EXPECTED[@]}"; do
  [[ "${CASES_SEEN[$c]:-}" == '1' ]] || fail "caso de aceite NAO executado: $c (ausencia de medicao)"
done
printf 'PASS: %s/%s casos de aceite medidos\n' "${#CASES_EXPECTED[@]}" "${#CASES_EXPECTED[@]}"

printf 'PASS: talkx_blacklist publicada em supabase_realtime com lista de colunas SEM phone (replay idempotente)\n'
