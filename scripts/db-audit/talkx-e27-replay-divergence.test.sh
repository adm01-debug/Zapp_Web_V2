#!/usr/bin/env bash
set -Eeuo pipefail

# #464 / CAIXA-7eb1 — Talk X E27: divergencia de replay da publicacao supabase_realtime.
#
# O E27 publicou tres tabelas do Talk X (talkx_campaign_events, talkx_segments,
# talkx_templates) em `supabase_realtime` e essa intencao ficou em DOIS arquivos com o
# mesmo conteudo: 20260927500001 e 20260927570000. No replay o segundo nao aplica
# (`already member of publication`), e ele esta na lista de falhas esperadas
# (replay-known-failures.json / falhas-esperadas.txt do banco local).
#
# Decisao da caixa 20261001-114300-7eb1: NAO editar a migration aplicada para ficar
# idempotente (a guarda recusa `modified`); registrar a divergencia e, SO SE PRECISAR,
# corrigir com migration nova idempotente.
#
# Este teste mede a divergencia nos proprios arquivos e responde "precisa?" com prova,
# em PostgreSQL 17 descartavel:
#   A) 20260927570000 SOZINHA aplica sem erro -> a causa NAO e "a imagem ja traz a
#      publicacao populada" (o motivo que estava registrado); a causa e a irma duplicada.
#   B) 20260927500001 e depois 20260927570000 -> a segunda falha em 42710
#      (`is already member of publication`): as duas declaram o MESMO conjunto de tabelas.
#   C) estado final: a publicacao tem as TRES tabelas do E27 -> o efeito pretendido esta
#      intacto, nada ficou faltando e NENHUMA migration nova e necessaria (uma versao
#      posterior nao desfaz a falha do arquivo anterior, e nao ha intencao perdida).
#   D) registro: a entrada existe e aponta a causa real (irma duplicada), e o
#      classificador do replay trata a falha como esperada (VERDE) e uma falha fora da
#      lista como drift novo (VERMELHO).

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
postgres_image="${TALKX_E27_REPLAY_DIVERGENCE_TEST_POSTGRES_IMAGE:-postgres:17-alpine}"
container_name="zapp-talkx-e27-replay-$RANDOM-$$"

cleanup() {
  if [[ "$container_name" =~ ^zapp-talkx-e27-replay-[0-9]+-[0-9]+$ ]]; then
    docker rm -f "$container_name" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT INT TERM

fail() { printf '[FAIL] %s\n' "$1" >&2; exit 1; }
psql_test() { docker exec -i "$container_name" psql -X -q -v ON_ERROR_STOP=1 -U postgres -d postgres "$@"; }

command -v docker >/dev/null 2>&1 || fail 'Docker nao esta instalado'
docker info >/dev/null 2>&1 || fail 'Docker daemon nao acessivel'

duplicada="$repo_root/supabase/migrations/20260927500001_talkx_e27_realtime_campaign_events.sql"
segunda="$repo_root/supabase/migrations/20260927570000_talkx_e27_realtime_campaign_events.sql"
[[ -f "$duplicada" ]] || fail 'migration 20260927500001 (irma duplicada) nao existe'
[[ -f "$segunda" ]] || fail 'migration 20260927570000 nao existe'
allowlist="$repo_root/scripts/db-audit/replay-known-failures.json"
[[ -f "$allowlist" ]] || fail 'replay-known-failures.json nao existe'

# ---- fixtures: as 3 tabelas do E27 + a publicacao do Realtime --------------------
subir_pg() {
  docker run --rm -d --name "$container_name" -e POSTGRES_PASSWORD=x "$postgres_image" >/dev/null
  local pronto=false
  for _ in $(seq 1 90); do
    if docker exec "$container_name" psql -X -U postgres -d postgres -Atqc 'SELECT 1' >/dev/null 2>&1; then
      pronto=true; break
    fi
    sleep 1
  done
  [[ "$pronto" == true ]] || fail 'PostgreSQL 17 descartavel nao ficou pronto'
  psql_test >/dev/null <<'SQL'
CREATE TABLE public.talkx_campaign_events (id uuid primary key default gen_random_uuid());
CREATE TABLE public.talkx_segments (id uuid primary key default gen_random_uuid());
CREATE TABLE public.talkx_templates (id uuid primary key default gen_random_uuid());
CREATE PUBLICATION supabase_realtime;
SQL
}
tabelas_na_publicacao() {
  psql_test -Atqc "SELECT string_agg(tablename, ',' ORDER BY tablename) FROM pg_publication_tables WHERE pubname = 'supabase_realtime'"
}

# ---- A) a segunda migration SOZINHA aplica: a causa registrada nao se sustenta -----
subir_pg
psql_test --single-transaction < "$segunda" >/dev/null \
  || fail 'A: 20260927570000 sozinha nao aplicou (esperava aplicar: a falha depende da irma)'
[[ "$(tabelas_na_publicacao)" == 'talkx_campaign_events,talkx_segments,talkx_templates' ]] \
  || fail "A: publicacao inesperada apos a segunda sozinha: $(tabelas_na_publicacao)"
docker rm -f "$container_name" >/dev/null

# ---- B) as duas em ordem: a segunda falha em 42710 --------------------------------
subir_pg
psql_test --single-transaction < "$duplicada" >/dev/null \
  || fail 'B: 20260927500001 (irma duplicada) nao aplicou'
erro="$(psql_test --single-transaction < "$segunda" 2>&1 || true)"
printf '%s' "$erro" | grep -q 'already member of publication' \
  || fail "B: a segunda nao falhou em 'already member of publication' (esperava 42710): $erro"

# ---- B2) as duas declaram o MESMO conjunto de tabelas (nada de intencao propria) ---
alvos() { grep -oE 'ADD TABLE public\.[a-z_]+' "$1" | sed 's/ADD TABLE //' | sort -u | tr '\n' ' '; }
[[ "$(alvos "$duplicada")" == "$(alvos "$segunda")" ]] \
  || fail "B2: os arquivos NAO sao duplicados: '$(alvos "$duplicada")' != '$(alvos "$segunda")'"

# ---- C) efeito pretendido intacto: as tres tabelas na publicacao -------------------
publicadas="$(tabelas_na_publicacao)"
[[ "$publicadas" == 'talkx_campaign_events,talkx_segments,talkx_templates' ]] \
  || fail "C: publicacao incompleta apos os dois arquivos: $publicadas"
docker rm -f "$container_name" >/dev/null

# ---- D) registro: entrada honesta + classificador do replay -----------------------
python3 - "$allowlist" "$segunda" <<'PY'
import json, sys
caminho, arquivo = sys.argv[1], sys.argv[2].rsplit('/', 1)[-1]
esperadas = json.load(open(caminho, encoding='utf-8'))['esperadas']
entrada = esperadas.get(arquivo)
if entrada is None:
    sys.exit(f"D: '{arquivo}' NAO esta registrado em replay-known-failures.json")
if entrada.get('categoria') != 'ordem-idempotencia':
    sys.exit(f"D: categoria inesperada: {entrada.get('categoria')!r}")
motivo = entrada.get('motivo', '')
irma = '20260927500001'
if irma not in motivo:
    sys.exit(
        'D: o motivo registrado nao aponta a causa real (a irma duplicada '
        f'{irma}); medido: sozinha a migration aplica. motivo atual: {motivo!r}'
    )
PY

tmpdir="$(mktemp -d)"
trap 'cleanup; rm -rf "$tmpdir"' EXIT INT TERM
printf '%s\tsyntax error at or near "x"\n' "$(basename "$segunda")" > "$tmpdir/erros-esperados.tsv"
saida="$(python3 "$repo_root/scripts/db-audit/replay-classify.py" "$tmpdir/erros-esperados.tsv" "$allowlist" 2>&1)"
printf '%s' "$saida" | grep -q 'REPLAY=verde' \
  || fail "D: a falha do E27 nao foi classificada como esperada: $saida"

printf '%s\n%s\tfailure novo\n' "$(basename "$segunda")" '00000000000000_inexistente.sql' > "$tmpdir/erros-novos.tsv"
if python3 "$repo_root/scripts/db-audit/replay-classify.py" "$tmpdir/erros-novos.tsv" "$allowlist" >"$tmpdir/novos.out" 2>&1; then
  fail 'D: falha fora do allowlist NAO derrubou o replay (o gate perdeu o poder de discriminar)'
fi
grep -q 'REPLAY=VERMELHO' "$tmpdir/novos.out" \
  || fail "D: falha inesperada nao saiu como VERMELHO: $(cat "$tmpdir/novos.out")"

printf '[OK] Talk X E27 (#464): divergencia medida e registrada — 20260927570000 falha em 42710 por causa da irma duplicada 20260927500001; a publicacao termina com as 3 tabelas do E27 e nenhuma migration nova e necessaria.\n'
