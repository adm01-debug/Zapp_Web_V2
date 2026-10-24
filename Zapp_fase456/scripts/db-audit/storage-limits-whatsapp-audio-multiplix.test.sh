#!/usr/bin/env bash
# N-010: prova que a migration 20261010130000_storage_limits_whatsapp_audio_multiplix.sql
# fixa file_size_limit em whatsapp-media, audio-messages e multiplix-voice.
#
# RED   — sem a migration, os buckets nao tem teto (file_size_limit NULL): um
#         upload de 30MB passa na checagem (custo sem controle = defeito);
# GREEN — com a migration, o mesmo upload de 30MB e recusado e 1MB passa.
#
# BASELINE REAL (ponto 2 da recusa): os buckets nascem nas migrations reais
#   20251215025014 (audio-messages), 20251223002656 (whatsapp-media) e
#   20261003132707 F64 (multiplix-voice), e ficam privados na migration real
#   20260905030000. O teste extrai os INSERTs reais desses arquivos e aplica
#   a 20260905030000 na integra — nada de bucket inventado a mao. Os arquivos
#   inteiros de seed nao sao aplicaveis isolados: dependem de auth.users e do
#   schema do Supabase, inexistentes no postgres descartavel.
#
# NOTA DE ESCOPO (ponto 1 da recusa): o enforcement real do teto vive na API
# do Supabase Storage (fora do Postgres): a API le
# storage.buckets.file_size_limit e recusa o upload acima do teto. No Postgres
# nao ha trigger nem CHECK que barre o objeto — o que a migration entrega e o
# teto que a API le. A funcao test_upload_gate abaixo (so do teste, nunca da
# migration) espelha exatamente essa checagem da API (bucket + tamanho ->
# recusa quando tamanho > limite) para provar o comportamento no banco local.

set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
migration="$repo_root/supabase/migrations/20261010130000_storage_limits_whatsapp_audio_multiplix.sql"
seed_audio="$repo_root/supabase/migrations/20251215025014_fcc5bc79-55e3-4972-8765-6a7840fdce5a.sql"
seed_wa="$repo_root/supabase/migrations/20251223002656_c427b632-b6ab-4ca4-9b78-38a343925147.sql"
seed_voice="$repo_root/supabase/migrations/20261003132707_f64_voz_assets_e_grants.sql"
privatize="$repo_root/supabase/migrations/20260905030000_private_media_buckets.sql"
postgres_image="${STORAGE_LIMITS_TEST_POSTGRES_IMAGE:-postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a3278a52a7ec49117deedb300e552b24}"
container_name="zapp-v2-storage-limits-wam-$$"
test_password="storage_limits_test_only"

cleanup() { docker rm -f "$container_name" >/dev/null 2>&1 || true; }
trap cleanup EXIT
fail() { printf 'FAIL: %s\n' "$1" >&2; exit 1; }
psql_test() { docker exec -i "$container_name" psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres "$@"; }
psql_sql() { docker exec "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres -c "$1" | tail -n1; }
# Leitura como papel real: a migration roda como dono (owner, como no deploy),
# e as verificacoes leem como authenticated (papel do app), com claims JWT.
as_auth() {
  docker exec "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres \
    -c "SET ROLE authenticated; SET request.jwt.claims TO '{\"sub\":\"00000000-0000-0000-0000-000000000001\",\"role\":\"authenticated\"}';" \
    -c "$1" | tail -n1
}
expect_value() { # id, sql, esperado (leitura como authenticated)
  local id="$1" sql="$2" expected="$3" got
  got="$(as_auth "$sql")"
  [[ "$got" == "$expected" ]] || fail "$id: esperado [$expected], obtido [$got]"
  printf '[PASS] %s\n' "$id"
}
expect_gate_ok() { # id, bucket, tamanho (upload passa)
  local id="$1"
  psql_sql "SELECT test_upload_gate('$2', $3);" >/dev/null \
    || fail "$id: upload de $3 bytes em $2 deveria passar"
  printf '[PASS] %s\n' "$id"
}
expect_gate_refused() { # id, bucket, tamanho (upload acima do teto recusado)
  local id="$1" out status
  set +e
  out="$(psql_sql "SELECT test_upload_gate('$2', $3);" 2>&1)"
  status=$?
  set -e
  [[ $status -ne 0 ]] || fail "$id: upload de $3 bytes em $2 passou sem teto"
  [[ "$out" == *"object too large"* ]] || fail "$id: recusa sem mensagem de teto (saida: $out)"
  printf '[PASS] %s\n' "$id"
}
# Extrai de um arquivo de migration real o statement INSERT que cria o bucket.
extract_bucket_insert() { # arquivo, bucket
  awk -v b="$2" '
    /^INSERT INTO storage\.buckets/ { buf=""; active=1 }
    active { buf = buf $0 "\n" }
    active && /;/ { if (buf ~ b) printf "%s", buf; active=0; buf="" }
  ' "$1"
}

command -v docker >/dev/null 2>&1 || fail 'docker indisponivel'
docker info >/dev/null 2>&1 || fail 'daemon docker indisponivel'
[[ -f "$migration" ]] || fail "migration nao encontrada: $migration"
[[ -f "$seed_audio" ]] || fail "seed real nao encontrada: $seed_audio"
[[ -f "$seed_wa" ]] || fail "seed real nao encontrada: $seed_wa"
[[ -f "$seed_voice" ]] || fail "seed real nao encontrada: $seed_voice"
[[ -f "$privatize" ]] || fail "migration real nao encontrada: $privatize"

if ! docker run -d --rm --name "$container_name" \
  -e POSTGRES_PASSWORD="$test_password" \
  "$postgres_image" >/dev/null; then
  fail 'PostgreSQL de teste nao iniciou'
fi
ready=0
for _ in $(seq 1 30); do
  if docker exec "$container_name" pg_isready -U postgres >/dev/null 2>&1; then ready=1; break; fi
  sleep 1
done
[[ "$ready" == "1" ]] || fail 'PostgreSQL de teste nao iniciou'

# Infraestrutura real do Supabase: o schema storage e a tabela buckets existem
# no servidor e nenhuma migration os cria. O teste declara a tabela no formato
# real (colunas usadas pelos INSERTs reais do repo: id text, name, public,
# file_size_limit, allowed_mime_types).
psql_test -q <<'SQL' >/dev/null
CREATE SCHEMA storage;
CREATE TABLE storage.buckets (
  id text PRIMARY KEY,
  name text UNIQUE NOT NULL,
  public boolean NOT NULL DEFAULT false,
  file_size_limit bigint,
  allowed_mime_types text[]
);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated;
  END IF;
END $$;
GRANT USAGE ON SCHEMA storage TO authenticated;
GRANT SELECT ON storage.buckets TO authenticated;
GRANT USAGE ON SCHEMA public TO authenticated;
SQL

# Gate de upload (somente teste): espelha a checagem que a API do Supabase
# Storage faz antes de aceitar o objeto — tamanho > file_size_limit recusa;
# limite NULL significa sem teto (qualquer tamanho passa = defeito).
psql_test -q <<'SQL' >/dev/null
CREATE OR REPLACE FUNCTION public.test_upload_gate(p_bucket text, p_size bigint)
RETURNS void LANGUAGE plpgsql AS $fn$
DECLARE v_limit bigint;
BEGIN
  SELECT file_size_limit INTO v_limit FROM storage.buckets WHERE name = p_bucket;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'bucket not found: %', p_bucket;
  END IF;
  IF v_limit IS NULL THEN RETURN; END IF;
  IF p_size > v_limit THEN
    RAISE EXCEPTION 'object too large: % bytes exceeds bucket % limit of % bytes', p_size, p_bucket, v_limit;
  END IF;
END $fn$;
SQL

echo ''
echo '============ BLOCO A — baseline real (defeito) ============'
# Cria os tres buckets com os INSERTs REAIS extraidos das migrations de seed.
for spec in "$seed_audio audio-messages" "$seed_wa whatsapp-media" "$seed_voice multiplix-voice"; do
  set -- $spec
  stmt="$(extract_bucket_insert "$1" "$2")"
  [[ -n "$stmt" ]] || fail "A.0 INSERT real de $2 nao extraido de ${1##*/}"
  [[ "$stmt" == *"storage.buckets"* && "$stmt" == *"$2"* ]] \
    || fail "A.0 extracao invalida para $2"
  printf '%s\n' "$stmt" | psql_test -v ON_ERROR_STOP=1 -q >/dev/null \
    || fail "A.0 INSERT real de $2 falhou"
  printf '[PASS] A.0 bucket %s criado pelo INSERT real de %s\n' "$2" "${1##*/}"
done
expect_value 'A.1 whatsapp-media sem file_size_limit (baseline real)' \
  "SELECT file_size_limit IS NULL FROM storage.buckets WHERE name='whatsapp-media';" 't'
expect_value 'A.2 audio-messages sem file_size_limit (baseline real)' \
  "SELECT file_size_limit IS NULL FROM storage.buckets WHERE name='audio-messages';" 't'
expect_value 'A.3 multiplix-voice sem file_size_limit (baseline real)' \
  "SELECT file_size_limit IS NULL FROM storage.buckets WHERE name='multiplix-voice';" 't'
expect_value 'A.4 whatsapp-media nasce public=true na seed real' \
  "SELECT public FROM storage.buckets WHERE name='whatsapp-media';" 't'
# Migration real que fecha os buckets com dados de clientes (aplica na integra:
# e um unico UPDATE, sem dependencias).
psql_test -v ON_ERROR_STOP=1 -q < "$privatize" >/dev/null \
  || fail 'A.5 migration real 20260905030000 falhou'
expect_value 'A.5 whatsapp-media privado apos 20260905030000' \
  "SELECT public FROM storage.buckets WHERE name='whatsapp-media';" 'f'
expect_value 'A.6 audio-messages privado (baseline)' \
  "SELECT public FROM storage.buckets WHERE name='audio-messages';" 'f'
expect_value 'A.7 multiplix-voice privado (baseline)' \
  "SELECT public FROM storage.buckets WHERE name='multiplix-voice';" 'f'
# Sem teto, upload gigante passa = defeito (custo sem controle).
expect_gate_ok 'A.8 upload de 30MB em whatsapp-media passa sem teto (defeito)' 'whatsapp-media' 31457280
expect_gate_ok 'A.9 upload de 30MB em audio-messages passa sem teto (defeito)' 'audio-messages' 31457280
expect_gate_ok 'A.10 upload de 60MB em multiplix-voice passa sem teto (defeito)' 'multiplix-voice' 62914560

echo ''
echo '============ BLOCO B — migration N-010 aplicada ============'
psql_test -v ON_ERROR_STOP=1 -q < "$migration" >/dev/null || fail 'B.0 migration N-010 falhou'
expect_value 'B.1 whatsapp-media=26214400 (25MB)' \
  "SELECT file_size_limit FROM storage.buckets WHERE name='whatsapp-media';" '26214400'
expect_value 'B.2 audio-messages=26214400 (25MB)' \
  "SELECT file_size_limit FROM storage.buckets WHERE name='audio-messages';" '26214400'
expect_value 'B.3 multiplix-voice=52428800 (50MB)' \
  "SELECT file_size_limit FROM storage.buckets WHERE name='multiplix-voice';" '52428800'
# Upload acima do teto recusado; uso legitimo continua passando.
expect_gate_refused 'B.4 upload de 30MB em whatsapp-media recusado' 'whatsapp-media' 31457280
expect_gate_refused 'B.5 upload de 30MB em audio-messages recusado' 'audio-messages' 31457280
expect_gate_refused 'B.6 upload de 60MB em multiplix-voice recusado' 'multiplix-voice' 62914560
expect_gate_ok 'B.7 upload de 1MB em whatsapp-media passa (uso legitimo)' 'whatsapp-media' 1048576

echo ''
echo '============ BLOCO C — rollback extraido do cabecalho ============'
# Nao reescreve SQL a mao: executa exatamente as linhas '--   UPDATE' do
# cabecalho da migration (ponto 3 da recusa).
rollback_sql="$(grep -E '^--   ' "$migration" | sed -E 's/^--   //')"
[[ -n "$rollback_sql" ]] || fail 'C.0 cabecalho da migration sem bloco --   UPDATE'
[[ "$rollback_sql" == *"UPDATE storage.buckets"* ]] || fail 'C.0 rollback extraido nao toca storage.buckets'
printf '%s\n' "$rollback_sql" | psql_test -v ON_ERROR_STOP=1 -q >/dev/null \
  || fail 'C.0 rollback do cabecalho falhou'
expect_value 'C.1 rollback restaura NULL em whatsapp-media' \
  "SELECT file_size_limit IS NULL FROM storage.buckets WHERE name='whatsapp-media';" 't'
expect_value 'C.2 rollback restaura NULL em audio-messages' \
  "SELECT file_size_limit IS NULL FROM storage.buckets WHERE name='audio-messages';" 't'
expect_value 'C.3 rollback restaura NULL em multiplix-voice' \
  "SELECT file_size_limit IS NULL FROM storage.buckets WHERE name='multiplix-voice';" 't'
expect_gate_ok 'C.4 sem teto de novo, 30MB passa (estado anterior restaurado)' 'whatsapp-media' 31457280

echo ''
echo '============ BLOCO D — idempotencia ============'
psql_test -v ON_ERROR_STOP=1 -q < "$migration" >/dev/null || fail 'D.0 reaplicacao falhou'
expect_value 'D.1 reaplicacao: whatsapp-media=26214400' \
  "SELECT file_size_limit FROM storage.buckets WHERE name='whatsapp-media';" '26214400'
expect_value 'D.2 reaplicacao: audio-messages=26214400' \
  "SELECT file_size_limit FROM storage.buckets WHERE name='audio-messages';" '26214400'
expect_value 'D.3 reaplicacao: multiplix-voice=52428800' \
  "SELECT file_size_limit FROM storage.buckets WHERE name='multiplix-voice';" '52428800'

echo ''
echo 'PASS: N-010 — file_size_limit em whatsapp-media (25MB), audio-messages (25MB) e multiplix-voice (50MB); upload acima do teto recusado.'
