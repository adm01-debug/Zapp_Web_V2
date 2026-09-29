#!/usr/bin/env bash
# W3 · Replay completo e resiliente da cadeia de migrations em PostgreSQL descartável.
#
# Objetivo: aplicar TODAS as supabase/migrations/*.sql (maxdepth 1, ordem de versão)
# SEM parar no primeiro erro, coletando versão + SQLSTATE + mensagem de cada falha.
#
# Semântica de aplicação (uma transação por arquivo, ON_ERROR_STOP=1): é o que o
# Supabase CLI (`supabase db push` / `db reset`) e o db-migrate do repo fazem —
# `supabase/migrations` é aplicado arquivo a arquivo, cada um atômico. Se um
# arquivo falha, SÓ ele é revertido; a cadeia continua no próximo.
#
# Uso: bash w3-replay.sh <outdir> [migrations_dir]
set -uo pipefail

OUTDIR="${1:?uso: $0 <outdir> [migrations_dir] [platform_dir]}"
MIGDIR="${2:-supabase/migrations}"
PLATDIR="${3:-}"
IMAGE="${W3_PG_IMAGE:-public.ecr.aws/supabase/postgres:17.6.1.159}"
CONTAINER="${W3_CONTAINER:-w3-replay-pg}"

mkdir -p "$OUTDIR/raw"
: > "$OUTDIR/replay.log"
: > "$OUTDIR/failures.tsv"
# bootstrap do harness (tabela do ledger): o repo define exatamente esta forma em
# scripts/db-audit/psql-environment.integration.mjs:64-65 — o Supabase CLI cria o
# mesmo schema/table antes de aplicar a primeira migration.
printf '%s\n' \
  'CREATE SCHEMA IF NOT EXISTS supabase_migrations;' \
  'CREATE TABLE IF NOT EXISTS supabase_migrations.schema_migrations(version text, name text, statements text[]);' \
  > "$OUTDIR/bootstrap.sql"

echo "== subindo container $CONTAINER ($IMAGE)" | tee -a "$OUTDIR/replay.log"
docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
MOUNTS=(-v "$PWD/$MIGDIR:/migrations:ro")
if [ -n "$PLATDIR" ]; then MOUNTS+=(-v "$PWD/$PLATDIR:/platform:ro"); fi
docker run -d --name "$CONTAINER" \
  -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=postgres \
  "${MOUNTS[@]}" \
  "$IMAGE" >/dev/null || { echo "FATAL: docker run falhou"; exit 1; }

ready=false
for i in $(seq 1 180); do
  st=$(docker inspect --format '{{.State.Health.Status}}' "$CONTAINER" 2>/dev/null || echo none)
  if [ "$st" = "healthy" ] && docker exec "$CONTAINER" psql -U postgres -X -At -c 'select 1' >/dev/null 2>&1; then
    # A imagem reinicia o servidor uma vez depois do initdb (instância temporária ->
    # instância real). Exigir healthcheck + 8s de estabilidade evita cair nesse vão.
    sleep 8
    if docker exec "$CONTAINER" psql -U postgres -X -At -c 'select 1' >/dev/null 2>&1; then
      ready=true; echo "READY após ${i}s (health=healthy)" | tee -a "$OUTDIR/replay.log"; break
    fi
  fi
  sleep 1
done
if [ "$ready" != true ]; then echo "FATAL: PostgreSQL não ficou pronto"; exit 1; fi

docker exec -i "$CONTAINER" psql -U postgres -X -q -v ON_ERROR_STOP=1 \
  < "$OUTDIR/bootstrap.sql" >/dev/null || { echo "FATAL: bootstrap falhou"; exit 1; }

# Baseline da plataforma Supabase (auth/storage/realtime): NAO vem do repo e NAO
# existe na imagem supabase/postgres — em producao e no `supabase start` quem cria
# essas tabelas sao os proprios servicos (storage-api, gotrue, realtime) ao subir.
# Aplicamos aqui as migrations `tenant` da imagem storage-api local para que o replay
# meca o REPO, nao a ausencia do servico de storage.
if [ -n "$PLATDIR" ]; then
  echo "== prelude de plataforma: $PLATDIR" | tee -a "$OUTDIR/replay.log"
  # dois subdiretorios: img/ (migrations da propria imagem supabase/postgres, aplicadas
  # como supabase_admin) e storage/ (migrations `tenant` da imagem storage-api,
  # aplicadas com search_path=storage — que e o que o proprio storage-api faz; sem isso
  # `CREATE FUNCTION update_updated_at_column()` cai em public e quebra a 1a migration
  # do repo, que faz CREATE OR REPLACE da mesma funcao).
  for spec in "img:" "storage:storage"; do
    d="${spec%%:*}"; sp="${spec#*:}"
    [ -d "$PLATDIR/$d" ] || continue
    while IFS= read -r p; do
      docker exec -e "PGOPTIONS=${sp:+-c search_path=$sp}" "$CONTAINER" \
        psql -U supabase_admin -d postgres -X -q \
        -v ON_ERROR_STOP=0 -v VERBOSITY=verbose \
        -f "/platform/$d/$(basename "$p")" >> "$OUTDIR/platform.log" 2>&1 \
        && echo "PLATFORM OK $d/$(basename "$p")" >> "$OUTDIR/platform.log" \
        || echo "PLATFORM FAIL $d/$(basename "$p")" >> "$OUTDIR/platform.log"
    done < <(find "$PLATDIR/$d" -maxdepth 1 -type f -name '*.sql' | sort -V)
  done
fi

if [ -n "$PLATDIR" ]; then
  POST=$(docker exec "$CONTAINER" psql -U postgres -X -At -c \
    "select count(*) from information_schema.tables where table_schema='storage' and table_name in ('buckets','objects','migrations')")
  echo "== pos-condicao plataforma: storage{buckets,objects,migrations} presentes = $POST/3" | tee -a "$OUTDIR/replay.log"
fi

docker exec "$CONTAINER" psql -U postgres -X -At \
  -c "select version()" | tee -a "$OUTDIR/replay.log"

total=0; ok=0; fail=0; start_ts=$(date +%s)
while IFS= read -r f; do
  base=$(basename "$f")
  version="${base%%_*}"
  total=$((total+1))
  raw="$OUTDIR/raw/${version}__${base#${version}_}"
  raw="${raw%.sql}.log"
  # NO_ERROR_STOP=0 -> uma execução por arquivo, transação própria, seguimos sempre
  docker exec "$CONTAINER" psql -U postgres -X -q \
    --single-transaction -v ON_ERROR_STOP=1 -v VERBOSITY=verbose \
    -f "/migrations/$base" > "$raw" 2>&1
  rc=$?
  if [ "$rc" -eq 0 ]; then
    ok=$((ok+1))
    printf 'OK\t%s\t%s\n' "$version" "$base" >> "$OUTDIR/replay.log"
    docker exec "$CONTAINER" psql -U postgres -X -q -c \
      "INSERT INTO supabase_migrations.schema_migrations(version,name) VALUES ('$version','${base#${version}_}')" \
      >/dev/null 2>&1 || true
  else
    fail=$((fail+1))
    sqlstate=$(sed -n 's/.*ERROR:  \([0-9A-Z]\{5\}\):.*/\1/p' "$raw" | head -1)
    msg=$(grep -m1 -E 'ERROR:  [0-9A-Z]{5}:' "$raw" | head -1 | sed 's/^.*ERROR:  [0-9A-Z]\{5\}: //')
    [ -z "$msg" ] && msg=$(grep -m1 '^ERROR:' "$raw" | sed 's/^ERROR: *//')
    [ -z "$sqlstate" ] && sqlstate="(sem SQLSTATE)"
    printf 'FAIL\t%s\t%s\t%s\t%s\t%s\n' "$version" "$base" "$sqlstate" "$rc" "$msg" >> "$OUTDIR/replay.log"
    printf '%s\t%s\t%s\t%s\n' "$version" "$base" "$sqlstate" "$msg" >> "$OUTDIR/failures.tsv"
  fi
done < <(find "$MIGDIR" -maxdepth 1 -type f -name '*.sql' | sort)
end_ts=$(date +%s)

echo "== resumo: total=$total ok=$ok fail=$fail duracao=$((end_ts-start_ts))s" | tee -a "$OUTDIR/replay.log"
# deixa o container no ar para as consultas de estado final (--keep) ou derruba
if [ "${W3_KEEP:-1}" != "1" ]; then
  docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
  echo "== container removido" | tee -a "$OUTDIR/replay.log"
fi
