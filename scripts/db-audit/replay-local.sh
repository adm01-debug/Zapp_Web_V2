#!/usr/bin/env bash
# E24 - Replay LOCAL e descartavel das migrations (nunca no banco canonico).
#
# Sobe a imagem do Supabase (que traz roles, schema auth e as extensoes), aplica todas as
# migrations em ordem e reporta ok/falha por arquivo. Container proprio, removido no fim.
#
# Uso:  bash scripts/db-audit/replay-local.sh
# Saida: replay.log + replay-falhas.txt no diretorio atual.
#
# LIMITE CONHECIDO (ver docs/audits/REPLAY_LOCAL_MIGRATIONS_2026-10-03.md): o schema `storage`
# e o `supabase_migrations` nao existem neste container, porque sao criados pelos servicos do
# Supabase. Migrations que dependem deles falham por lacuna do harness, nao por divergencia.
set -u
NOME=hermes-e24-replay
PORTA="${REPLAY_PORTA:-5499}"
LOG="$PWD/replay.log"
FALHAS="$PWD/replay-falhas.txt"

docker rm -f "$NOME" >/dev/null 2>&1
: > "$LOG"; : > "$FALHAS"

echo "subindo $NOME na porta $PORTA" | tee -a "$LOG"
docker run -d --name "$NOME" -e POSTGRES_PASSWORD=replay   -p "127.0.0.1:$PORTA:5432" public.ecr.aws/supabase/postgres:17.6.1.159 >>"$LOG" 2>&1

for i in $(seq 1 90); do
  docker exec "$NOME" pg_isready -U postgres >/dev/null 2>&1 && { echo "postgres pronto (${i}s)" | tee -a "$LOG"; break; }
  sleep 1
done
sleep 5

TOTAL=$(ls supabase/migrations/*.sql | wc -l)
echo "aplicando $TOTAL migrations no banco postgres" | tee -a "$LOG"
OK=0; FALHA=0
for f in $(ls supabase/migrations/*.sql | sort); do
  if docker exec -i "$NOME" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -q < "$f" >>"$LOG" 2>&1; then
    OK=$((OK+1))
  else
    FALHA=$((FALHA+1)); echo "$(basename "$f")" >> "$FALHAS"
  fi
done
echo "RESULTADO: $OK ok, $FALHA falha(s) de $TOTAL" | tee -a "$LOG"
echo "--- erros mais comuns ---" >> "$LOG"
grep -oE 'ERROR:  [a-z "_.]{10,70}' "$LOG" | sort | uniq -c | sort -rn | head -10 >> "$LOG"
docker rm -f "$NOME" >/dev/null 2>&1
echo "container removido" >> "$LOG"
