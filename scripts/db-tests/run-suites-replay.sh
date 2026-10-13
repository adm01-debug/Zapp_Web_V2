#!/usr/bin/env bash
# t_fceba6d5 — runner das suítes SQL que precisam do SCHEMA COMPLETO (supabase/tests/ e
# scripts/db-tests/). Sobe a imagem do Supabase, faz o bootstrap dos serviços (storage,
# supabase_migrations, app.settings) e aplica TODAS as migrations tolerando as falhas
# conhecidas do replay (drift/dados/cron), então roda cada suíte informada como `postgres`.
#
# Irmão de run-suites-postgres.sh: aquele é para as suítes AUTO-CONTIDAS (PostgreSQL limpo);
# este é para as que dependem do schema do produto. Não roda contra produção: travas de DNS
# e do agendador, iguais às do scripts/db-audit/replay-local.sh.
#
# Uso: bash scripts/db-tests/run-suites-replay.sh <suite.sql> [suite.sql ...]
set -euo pipefail

if [[ "$#" -eq 0 ]]; then
  printf 'usage: %s <suite.sql> [suite.sql ...]\n' "${0##*/}" >&2
  exit 64
fi

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$RAIZ"

# Fixada por digest (indice multi-arch de 17.6.1.159): a tag sozinha não garante o conteúdo.
IMAGEM="${SUITES_REPLAY_IMAGE:-public.ecr.aws/supabase/postgres:17.6.1.159@sha256:86a2e078779e5bdccda1f6f6c5063aa9779a322d1fface5fb408d051909b230f}"
NOME="${SUITES_REPLAY_NOME:-zapp-v2-replay-suites-$$-$RANDOM}"
ROTULO_CHAVE="hermes.t_fceba6d5.replay"
read -r -a PSQL_VARS <<< "${SUITES_PSQL_VARS:-}"

docker rm -f "$NOME" >/dev/null 2>&1 || true
docker run -d --name "$NOME" --label "$ROTULO_CHAVE=$ROTULO_CHAVE" \
  -e POSTGRES_PASSWORD=replay -v "$RAIZ:/repo:ro" "$IMAGEM" >/dev/null
trap 'docker rm -f "$NOME" >/dev/null 2>&1 || true' EXIT

pronto=0
for _ in $(seq 1 90); do
  if docker exec "$NOME" pg_isready -U postgres >/dev/null 2>&1; then pronto=1; break; fi
  sleep 1
done
if [[ "$pronto" -ne 1 ]]; then
  echo "FAIL: postgres do replay não ficou pronto em 90s (container $NOME)" >&2
  exit 2
fi
sleep 5

docker exec -i "$NOME" psql -U supabase_admin -d postgres -q -v ON_ERROR_STOP=1 >/dev/null <<'SQL'
create schema if not exists storage;
create table if not exists storage.buckets(
  id text primary key, name text not null, owner uuid, public boolean default false,
  avif_autodetection boolean default false, file_size_limit bigint, allowed_mime_types text[],
  created_at timestamptz default now(), updated_at timestamptz default now());
create table if not exists storage.objects(
  id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets(id),
  name text, owner uuid, created_at timestamptz default now(), updated_at timestamptz default now(),
  last_accessed_at timestamptz default now(), metadata jsonb, path_tokens text[], version text);
create or replace function storage.foldername(name text) returns text[] language plpgsql as $$
declare p text[]; begin p := string_to_array(name,'/'); return p[1:array_length(p,1)-1]; end $$;
create or replace function storage.filename(name text) returns text language plpgsql as $$
declare p text[]; begin p := string_to_array(name,'/'); return p[array_length(p,1)]; end $$;
create or replace function storage.extension(name text) returns text language plpgsql as $$
declare p text[]; begin p := string_to_array(name,'.'); return p[array_length(p,1)]; end $$;
create schema if not exists supabase_migrations;
create table if not exists supabase_migrations.schema_migrations(
  version text primary key, statements text[], name text);

-- Colunas de auth.users que as migrations referenciam (a imagem traz a tabela, mas não todas
-- as colunas que o Supabase adiciona com o passar das versões).
alter table auth.users add column if not exists banned_until timestamptz;
alter table auth.users add column if not exists banned boolean not null default false;
alter table auth.users add column if not exists phone text;
alter table auth.users add column if not exists email_confirmed_at timestamptz;
alter table auth.users add column if not exists last_sign_in_at timestamptz;
alter table auth.users add column if not exists raw_user_meta_data jsonb not null default '{}'::jsonb;

-- A imagem já traz a publicação supabase_realtime e o pg_cron funcionando. NÃO mexer (medido
-- em 03/10: recriar a publicação/instalar o pg_cron levou 10 migrations a falhar).
alter database postgres set app.settings.trusted_domains = 'localhost,127.0.0.1';
SQL

# TRAVAS CONTRA A PRODUÇÃO (as migrations gravam a URL canônica em jobs do pg_cron, funções e
# segredos; sem travar, o container fica de pé chamando edge functions reais).
docker exec -u 0 "$NOME" sh -c "echo '127.0.0.1 tnnnlkbymytvtqngbbqh.supabase.co tnnnlkbymytvtqngbbqh.functions.supabase.co db.tnnnlkbymytvtqngbbqh.supabase.co' >> /etc/hosts"
docker exec "$NOME" grep -q 'tnnnlkbymytvtqngbbqh' /etc/hosts \
  || { echo "FAIL: trava de DNS não entrou; abortando antes das migrations" >&2; exit 2; }
docker exec -i "$NOME" psql -U supabase_admin -d postgres -q -v ON_ERROR_STOP=1 \
  -c "alter system set cron.launch_active_jobs = off" -c "select pg_reload_conf()" >/dev/null \
  || { echo "FAIL: não consegui desligar o agendador; abortando antes das migrations" >&2; exit 2; }

falhas_migracao=0
total_migracao=0
for f in $(ls supabase/migrations/*.sql | sort); do
  total_migracao=$((total_migracao + 1))
  if ! docker exec -i "$NOME" psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 -q < "$f" >/dev/null 2>&1; then
    falhas_migracao=$((falhas_migracao + 1))
  fi
done
echo "replay: $total_migracao migrations, $falhas_migracao falhas toleradas (drift/dados/cron)"

falhou=0
for suite in "$@"; do
  echo "── suíte: $suite"
  log="$(docker exec -w /repo -i "$NOME" \
    psql -X -q -v ON_ERROR_STOP=1 "${PSQL_VARS[@]}" -U postgres -d postgres < "$RAIZ/$suite" 2>&1)" && rc=0 || rc=$?
  printf '%s\n' "$log"
  if [[ "$rc" -ne 0 ]]; then
    echo "SUITE FALHOU (exit $rc): $suite" >&2
    falhou=1
  elif printf '%s\n' "$log" | grep -qE '(^|[^A-Za-z0-9_])FAIL([^A-Za-z0-9_]|$)'; then
    echo "SUITE FALHOU (marcador FAIL no log): $suite" >&2
    falhou=1
  fi
done

if [[ "$falhou" -eq 0 ]]; then
  echo "run-suites-replay: OK ($# suíte(s))"
else
  echo "run-suites-replay: FALHOU" >&2
fi
exit "$falhou"
