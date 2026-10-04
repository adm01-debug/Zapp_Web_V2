#!/usr/bin/env bash
# E24 - Replay LOCAL e descartavel das migrations (nunca no banco canonico).
#
# Sobe a imagem do Supabase (que traz roles, schemas auth e as extensoes), cria o bootstrap que
# os SERVICOS do Supabase trazem (storage, supabase_migrations, app.settings) e aplica todas as
# migrations em ordem, gravando o ERRO AO LADO DO ARQUIVO.
#
# Uso:   bash scripts/db-audit/replay-local.sh
# Saida: replay.log (resultado + histograma) e replay-erros.tsv (arquivo<TAB>erro) no CWD.
#
# Licoes das rodadas anteriores (ver docs/audits/REPLAY_LOCAL_MIGRATIONS_2026-10-03.md):
#   1. NAO use um banco vazio: as extensoes so podem ser criadas no banco `postgres`, e sem o
#      bootstrap do Supabase o replay acusa centenas de falhas que NAO sao do repositorio.
#   2. Rode como `supabase_admin`: com o usuario `postgres` dezenas de migrations falham por
#      permissao, e o numero final nao significa nada.
set -u
NOME=hermes-e24-replay
PORTA="${REPLAY_PORTA:-5499}"
LOG="$PWD/replay.log"
ERROS="$PWD/replay-erros.tsv"

docker rm -f "$NOME" >/dev/null 2>&1
: > "$LOG"; : > "$ERROS"

echo "subindo $NOME na porta $PORTA" | tee -a "$LOG"
docker run -d --name "$NOME" -e POSTGRES_PASSWORD=replay \
  -p "127.0.0.1:$PORTA:5432" public.ecr.aws/supabase/postgres:17.6.1.159 >>"$LOG" 2>&1

for i in $(seq 1 90); do
  docker exec "$NOME" pg_isready -U postgres >/dev/null 2>&1 && { echo "postgres pronto (${i}s)" | tee -a "$LOG"; break; }
  sleep 1
done
sleep 5

echo "bootstrap dos objetos que os servicos do Supabase trazem" | tee -a "$LOG"
docker exec -i "$NOME" psql -U supabase_admin -d postgres -q >>"$LOG" 2>&1 <<'SQL'
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

-- Colunas de auth.users que as migrations referenciam (a imagem traz a tabela, mas nao todas
-- as colunas que o Supabase adiciona com o passar das versoes).
alter table auth.users add column if not exists banned_until timestamptz;
alter table auth.users add column if not exists banned boolean not null default false;
alter table auth.users add column if not exists phone text;
alter table auth.users add column if not exists email_confirmed_at timestamptz;
alter table auth.users add column if not exists last_sign_in_at timestamptz;
alter table auth.users add column if not exists raw_user_meta_data jsonb not null default '{}'::jsonb;

-- A imagem ja traz a publicacao supabase_realtime populada e o pg_cron funcionando. NAO mexer:
-- tentar recriar (`drop publication` + `create`) ou instalar (`create schema cron` +
-- `create extension pg_cron`) piora o resultado — medido em 03/10: quebrou o pg_cron da imagem
-- e levou 10 migrations a falhar com `cron.schedule(...) does not exist`.

alter database postgres set app.settings.trusted_domains = 'localhost,127.0.0.1';
SQL

TOTAL=$(ls supabase/migrations/*.sql | wc -l)
echo "aplicando $TOTAL migrations" | tee -a "$LOG"
OK=0; FALHA=0
for f in $(ls supabase/migrations/*.sql | sort); do
  SAIDA=$(docker exec -i "$NOME" psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 -q < "$f" 2>&1)
  if [ $? -eq 0 ]; then
    OK=$((OK+1))
  else
    FALHA=$((FALHA+1))
    ERRO=$(printf '%s' "$SAIDA" | grep -m1 "ERROR:" | cut -c1-190 | tr '\t' ' ')
    printf '%s\t%s\n' "$(basename "$f")" "${ERRO:-sem linha ERROR}" >> "$ERROS"
  fi
done
echo "RESULTADO: $OK ok, $FALHA falha(s) de $TOTAL" | tee -a "$LOG"
echo "--- erros mais comuns ---" >> "$LOG"
cut -f2 "$ERROS" | sed 's/ERROR:  //' | sort | uniq -c | sort -rn | head -14 >> "$LOG"

# Classifica contra o allowlist: falha esperada (ja investigada e medida no canonico) x INESPERADA
# (drift novo). So a inesperada derruba o replay - e o que faz deste script um gate.
python3 "$(dirname "$0")/replay-classify.py" "$ERROS" "$(dirname "$0")/replay-known-failures.json" | tee -a "$LOG"
RC=${PIPESTATUS[0]}

docker rm -f "$NOME" >/dev/null 2>&1
echo "container removido" >> "$LOG"

# 0 = verde (nenhuma falha inesperada); 1 = drift novo.
exit "$RC"
