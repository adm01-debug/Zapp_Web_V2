#!/usr/bin/env bash
# IA-131 / IA-AUDIO-001 (item 133) — cadeia REAL do `audio_stt` do OpenRouter.
#
# Prova, em PostgreSQL 17 descartável, o efeito das DUAS migrations JÁ APLICADAS, na ordem em
# que a cadeia de versões as roda:
#   20260930780000_ia033_visao_openrouter.sql    → declara `capabilities.modalities = ["vision"]`
#   20261006100606_ia131_audio_stt_openrouter.sql → habilita `audio_stt` no mesmo provedor
# e trava o resultado que o despacho do `ai-proxy` exige: a modalidade `vision` declarada ANTES
# continua declarada DEPOIS (`preserva modalidades no audio_stt`), `audio_stt` passa a estar,
# nenhuma chave top-level do config se perde, reaplicar não duplica modalidade e outro provedor
# fica intocado.
#
# Por que o arquivo da ia131 NÃO é reescrito aqui: ele está APLICADO (regra 7 — migration
# aplicada é histórico imutável) e o passo "Rejeitar edicao de migration ja existente" do
# `.github/workflows/db-guard.yml` reprova qualquer PR que edite um `supabase/migrations/*.sql`
# existente. A prova da preservação vive neste teste, nunca numa edição de histórico.
#
# Harness de mutação (vermelho→verde): aponte IA131_CHAIN_DIR para uma CÓPIA do diretório de
# migrations com a ia131 alterada (ex.: literal '["audio_stt"]') e as asserções de preservação
# caem; com o diretório real do repositório, verde.
#
# Sem rede e sem banco de produção: só um container descartável local.

set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
chain_dir="${IA131_CHAIN_DIR:-$repo_root/supabase/migrations}"
ia033="$chain_dir/20260930780000_ia033_visao_openrouter.sql"
ia131="$chain_dir/20261006100606_ia131_audio_stt_openrouter.sql"
postgres_image="${IA131_CHAIN_POSTGRES_IMAGE:-postgres:17-alpine}"
container_name="zapp-v2-ia131-cadeia-test-$$"
tmp_dir="$repo_root/.tmp/ia131-cadeia-test-$$"

cleanup() {
  rm -rf "$tmp_dir" >/dev/null 2>&1 || true
  if [[ "$container_name" =~ ^zapp-v2-ia131-cadeia-test-[0-9]+$ ]]; then
    docker rm -f "$container_name" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT INT TERM

fail() { printf '[FAIL] %s\n' "$1" >&2; exit 1; }

psql_sql() {
  docker exec "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres -c "$1"
}

psql_file() {
  docker exec -i "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres < "$1"
}

expect_value() {
  local label="$1" expected="$2" sql="$3" actual
  actual="$(psql_sql "$sql")"
  [[ "$actual" == "$expected" ]] || fail "$label: esperado '$expected', obtido '$actual'"
  printf '[PASS] %s\n' "$label"
}

apply_migration() {
  psql_file "$1" >/dev/null
}

command -v docker >/dev/null 2>&1 || fail 'Docker nao esta instalado'
docker info >/dev/null 2>&1 || fail 'Docker daemon nao esta acessivel'
[[ -f "$ia033" ]] || fail "migration nao encontrada: $ia033"
[[ -f "$ia131" ]] || fail "migration nao encontrada: $ia131"
mkdir -p "$tmp_dir"

printf '== container: %s (imagem %s)\n== cadeia: %s\n' "$container_name" "$postgres_image" "$chain_dir"
docker run --rm -d --name "$container_name" -e POSTGRES_PASSWORD=test_only "$postgres_image" >/dev/null

ready=0
for _ in $(seq 1 90); do
  if psql_sql 'SELECT 1' >/dev/null 2>&1; then
    ready=$((ready + 1))
    (( ready >= 2 )) && break
  else
    ready=0
  fi
  sleep 1
done
(( ready >= 2 )) || fail 'PostgreSQL descartavel nao ficou pronto de forma estavel'

# Tabela minima com as colunas que as duas migrations tocam + a linha do OpenRouter no estado
# que a ia033 documenta no proprio rollback (config com os cabecalhos usados nas chamadas).
psql_sql "
CREATE TABLE public.ai_providers (
  id uuid PRIMARY KEY,
  name text NOT NULL,
  model text,
  config jsonb DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT '2026-01-01 00:00:00+00'
);
INSERT INTO public.ai_providers (id, name, config) VALUES
  (
    'f99209ea-294d-4124-b480-b3ecf60c9049',
    'OpenRouter',
    '{\"headers\":{\"X-Title\":\"ZappWeb\",\"HTTP-Referer\":\"https://zappweb.com.br\"},\"routing\":\"keep\"}'::jsonb
  ),
  (
    '11111111-1111-1111-1111-111111111111',
    'Outro',
    '{\"capabilities\":{\"modalities\":[\"vision\"]},\"routing\":\"keep\"}'::jsonb
  );
" >/dev/null

# ---- passo 1 da cadeia: a modalidade de visao existe ANTES do audio_stt ---------------------
apply_migration "$ia033"
expect_value 'ia033: modalidade vision declarada' 't' "SELECT config->'capabilities'->'modalities' ? 'vision' FROM public.ai_providers WHERE id = 'f99209ea-294d-4124-b480-b3ecf60c9049';"
expect_value 'ia033: cabecalho top-level do config preservado' 'ZappWeb' "SELECT config #>> '{headers,X-Title}' FROM public.ai_providers WHERE id = 'f99209ea-294d-4124-b480-b3ecf60c9049';"

# ---- passo 2 da cadeia: o audio_stt entra sem derrubar o que ja estava declarado -----------
apply_migration "$ia131"
expect_value 'ia131: modalidade vision declarada ANTES continua declarada' 't' "SELECT config->'capabilities'->'modalities' ? 'vision' FROM public.ai_providers WHERE id = 'f99209ea-294d-4124-b480-b3ecf60c9049';"
expect_value 'ia131: audio_stt acrescentado' 't' "SELECT config->'capabilities'->'modalities' ? 'audio_stt' FROM public.ai_providers WHERE id = 'f99209ea-294d-4124-b480-b3ecf60c9049';"
expect_value 'ia131: conjunto final e exatamente vision+audio_stt' 't' "SELECT (config #> '{capabilities,modalities}') @> '[\"vision\",\"audio_stt\"]'::jsonb AND '[\"vision\",\"audio_stt\"]'::jsonb @> (config #> '{capabilities,modalities}') FROM public.ai_providers WHERE id = 'f99209ea-294d-4124-b480-b3ecf60c9049';"
expect_value 'ia131: total de modalidades sem perda e sem sobra' '2' "SELECT jsonb_array_length(config #> '{capabilities,modalities}') FROM public.ai_providers WHERE id = 'f99209ea-294d-4124-b480-b3ecf60c9049';"
expect_value 'ia131: chave top-level do config preservada' 'keep' "SELECT config ->> 'routing' FROM public.ai_providers WHERE id = 'f99209ea-294d-4124-b480-b3ecf60c9049';"
expect_value 'ia131: cabecalho do OpenRouter preservado' 'ZappWeb' "SELECT config #>> '{headers,X-Title}' FROM public.ai_providers WHERE id = 'f99209ea-294d-4124-b480-b3ecf60c9049';"
expect_value 'ia131: outro provedor intocado' 't' "SELECT (config #> '{capabilities,modalities}') @> '[\"vision\"]'::jsonb AND '[\"vision\"]'::jsonb @> (config #> '{capabilities,modalities}') FROM public.ai_providers WHERE id = '11111111-1111-1111-1111-111111111111';"

# ---- reaplicar nao duplica (idempotencia do UPDATE ja aplicado) -----------------------------
apply_migration "$ia131"
expect_value 'ia131: reaplicar mantem exatamente vision+audio_stt' '2' "SELECT jsonb_array_length(config #> '{capabilities,modalities}') FROM public.ai_providers WHERE id = 'f99209ea-294d-4124-b480-b3ecf60c9049';"
expect_value 'ia131: reaplicar nao duplica audio_stt' '1' "SELECT count(*) FROM public.ai_providers p, jsonb_array_elements_text(p.config #> '{capabilities,modalities}') AS m(value) WHERE p.id = 'f99209ea-294d-4124-b480-b3ecf60c9049' AND m.value = 'audio_stt';"

# ---- o config continua sendo o do provedor e nao virou literal ------------------------------
expect_value 'ia131: modelo do OpenRouter segue o definido pela ia033' 'google/gemini-3.8-flash' "SELECT model FROM public.ai_providers WHERE id = 'f99209ea-294d-4124-b480-b3ecf60c9049';"

printf '[PASS] ia131-audio-stt-cadeia: a cadeia real preserva a modalidade vision e acrescenta audio_stt\n'
