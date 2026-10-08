#!/usr/bin/env bash
# SL-029 (inventario S2-8) — Teste de restore de backup com evidencia.
#
# Executa a RECEITA documentada em docs/BACKUP-RECOVERY-STRATEGY.md contra um
# PostgreSQL 17 DESCARTAVEL (container proprio, criado e destruido por este
# processo) e prova que o banco restaurado reproduz, sem sobra nem falta, o
# esquema e os DADOS do banco de origem:
#   - backup  : `pg_dump -F c -f <arquivo>`      (documento, secao 1.3)
#   - restore : `pg_restore -c -d <destino>`     (documento, secao 3.2)
#
# Por que existe: a auditoria de 05/09/2026 (S2-8) registrou "sem registro de
# restore realmente executado". O unico registro no codigo era o rotulo
# `backups: 'NOT_VERIFIED_RESTORE_REQUIRED'` em scripts/db-audit/check-runtime-config.mjs.
# Este drill fecha a lacuna da RECEITA: a partir daqui o caminho backup -> restore
# tem prova executada e repetivel, com o numero de linhas e o conteudo conferidos
# contra um valor esperado que NAO vem do codigo sob teste.
#
# Limite (nao afrouxar): isto NAO restaura o backup de PRODUCAO. Restaurar a
# producao (PITR / ambiente separado) e acao do dono e continua pendente — por
# isso o rotulo `backups: NOT_VERIFIED_RESTORE_REQUIRED` permanece como esta.
#
# Sem rede com o banco real: o container e exclusivo (nome com $$), sem volume,
# com `--rm`, e o dump nunca sai dele. Nenhum dado de cliente participa — a
# origem e sintetica e criada aqui.

set -euo pipefail

POSTGRES_IMAGE="${BACKUP_DRILL_POSTGRES_IMAGE:-postgres:17-alpine}"
CONTAINER="zapp-v2-backup-restore-drill-$$"
DUMP_PATH="/tmp/backup.drill.dump"

# Fonte independente do codigo sob teste: o conteudo que o teste INSERE e espera
# de volta. Se o restore perder ou corromper linhas, a comparacao acusa.
EXPECTED_ROWS=3
EXPECTED_DIGEST='+5511990000001,+5511990000002,+5511990000003'

cleanup() {
  case "$CONTAINER" in
    zapp-v2-backup-restore-drill-[0-9]*)
      docker rm -f -- "$CONTAINER" >/dev/null 2>&1 || true
      ;;
  esac
}
trap cleanup EXIT

falhar() { echo "FALHOU: $*" >&2; exit 1; }

sql_no_destino() { # sql_no_destino <banco> <consulta>  -> saida crua (-At)
  docker exec "$CONTAINER" psql -X -At -v ON_ERROR_STOP=1 -U postgres -d "$1" -c "$2"
}

echo "[drill] subindo PostgreSQL descartavel ($POSTGRES_IMAGE) em $CONTAINER"
docker run --rm -d --name "$CONTAINER" \
  -e POSTGRES_PASSWORD=drill-disposable-only "$POSTGRES_IMAGE" >/dev/null

ready=false
for _attempt in $(seq 1 60); do
  # A imagem oficial aceita conexoes em um servidor temporario durante o initdb.
  # Aguarde o marcador que separa esse processo do servidor PostgreSQL final.
  container_logs="$(docker logs "$CONTAINER" 2>&1 || true)"
  if [[ "$container_logs" == *'PostgreSQL init process complete; ready for start up.'* ]] &&
    docker exec "$CONTAINER" \
      psql -X -At -v ON_ERROR_STOP=1 -U postgres -d postgres -c 'SELECT 1' >/dev/null 2>&1; then
    ready=true
    break
  fi
  sleep 1
done
[[ "$ready" == true ]] || falhar 'PostgreSQL de teste nao ficou pronto em 60 segundos.'

# ── Banco de origem: esquema com constraint, indice, RLS e policy ─────────────
docker exec -i "$CONTAINER" psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres >/dev/null <<'SQL'
CREATE DATABASE origem;
SQL

docker exec -i "$CONTAINER" psql -X -v ON_ERROR_STOP=1 -U postgres -d origem >/dev/null <<'SQL'
CREATE TABLE public.contacts (
  id bigint GENERATED ALWAYS AS IDENTITY,
  phone text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT contacts_pkey PRIMARY KEY (id),
  CONSTRAINT contacts_phone_unique UNIQUE (phone)
);
CREATE INDEX contacts_created_at_idx ON public.contacts (created_at DESC);
ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY contacts_select ON public.contacts FOR SELECT USING (true);
INSERT INTO public.contacts (phone)
VALUES ('+5511990000001'), ('+5511990000002'), ('+5511990000003');
SQL

# Guarda de vacuidade: sem isto, um backup "vazio" (0 linhas) passaria como verde.
origem_rows="$(sql_no_destino origem 'SELECT count(*) FROM public.contacts')"
[[ "$origem_rows" == "$EXPECTED_ROWS" ]] ||
  falhar "origem com $origem_rows linha(s); esperado $EXPECTED_ROWS — o backup nao teria o que provar."
echo "[drill] origem: $origem_rows linhas (esperado $EXPECTED_ROWS)"

# ── Backup (documento, 1.3: pg_dump -F c -f <arquivo>) ───────────────────────
docker exec "$CONTAINER" pg_dump -U postgres -d origem -F c -f "$DUMP_PATH"
dump_bytes="$(docker exec "$CONTAINER" stat -c %s "$DUMP_PATH")"
(( dump_bytes > 0 )) || falhar 'o dump saiu vazio.'
objetos="$(docker exec "$CONTAINER" pg_restore --list "$DUMP_PATH" | grep -c '^[0-9]' || true)"
(( objetos > 0 )) || falhar 'o dump nao lista nenhum objeto — arquivo de backup invalido.'
echo "[drill] backup: ${dump_bytes} bytes, ${objetos} objeto(s) no arquivo"

# ── Restore (documento, 3.2: pg_restore -c -d <destino>) ─────────────────────
# `--if-exists` apenas troca os DROP por DROP ... IF EXISTS: o destino e um banco
# novo (limpo), entao sem ele o pg_restore sairia com erro de "does not exist" no
# inicio e o exit code mentiria. A semantica de "limpar antes de restaurar"
# continua a mesma do documento.
docker exec -i "$CONTAINER" psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres >/dev/null <<'SQL'
CREATE DATABASE restaurado;
SQL
docker exec "$CONTAINER" pg_restore -U postgres -d restaurado -c --if-exists "$DUMP_PATH"

# ── Prova 1: os dados voltaram, linha por linha ──────────────────────────────
restaurado_rows="$(sql_no_destino restaurado 'SELECT count(*) FROM public.contacts')"
[[ "$restaurado_rows" == "$EXPECTED_ROWS" ]] ||
  falhar "restaurado com $restaurado_rows linha(s); esperado $EXPECTED_ROWS."
restaurado_digest="$(sql_no_destino restaurado "SELECT string_agg(phone, ',' ORDER BY phone) FROM public.contacts")"
[[ "$restaurado_digest" == "$EXPECTED_DIGEST" ]] ||
  falhar "conteudo do restaurado difere do esperado: [$restaurado_digest] != [$EXPECTED_DIGEST]."
echo "[drill] restaurado: $restaurado_rows linhas, digest ok"

# ── Prova 2: o esquema voltou (constraint, indice, RLS e policy) ─────────────
restaurado_constraint="$(sql_no_destino restaurado "SELECT count(*) FROM pg_constraint WHERE conname = 'contacts_phone_unique'")"
[[ "$restaurado_constraint" == 1 ]] || falhar 'a constraint contacts_phone_unique nao foi restaurada.'
restaurado_index="$(sql_no_destino restaurado "SELECT count(*) FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'contacts_created_at_idx'")"
[[ "$restaurado_index" == 1 ]] || falhar 'o indice contacts_created_at_idx nao foi restaurado.'
restaurado_rls="$(sql_no_destino restaurado "SELECT relrowsecurity FROM pg_class WHERE oid = 'public.contacts'::regclass")"
[[ "$restaurado_rls" == t ]] || falhar 'a RLS de public.contacts nao foi restaurada.'
restaurado_policy="$(sql_no_destino restaurado "SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'contacts' AND policyname = 'contacts_select'")"
[[ "$restaurado_policy" == 1 ]] || falhar 'a policy contacts_select nao foi restaurada.'
echo "[drill] esquema ok: constraint, indice, rls=on e policy presentes"

# ── Prova 3: a constraint restaurada AGE (nao e so catalogo) ─────────────────
# A tabela ja foi provada existente acima (linhas + digest); aqui o INSERT
# duplicado tem que ser RECUSADO — "aceitou" so aconteceria com a unicidade
# perdida no restore.
if docker exec "$CONTAINER" \
  psql -X -v ON_ERROR_STOP=1 -U postgres -d restaurado \
  -c "INSERT INTO public.contacts (phone) VALUES ('+5511990000001')" >/dev/null 2>&1; then
  falhar 'a unicidade de phone sumiu no restore: o INSERT duplicado foi aceito.'
fi
echo "[drill] unicidade restaurada e em vigor (duplicata recusada)"

echo "OK: drill de restore de backup (pg_dump -F c -> pg_restore -c) reproduziu esquema e dados"
