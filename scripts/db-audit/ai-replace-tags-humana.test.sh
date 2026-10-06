#!/usr/bin/env bash
# R2-DB-012 (item 297) — a reclassificação de IA não pode converter etiqueta humana
# homônima em etiqueta de IA (e depois apagá-la).
#
# Prova, em PostgreSQL descartável, o ciclo vermelho → verde da correção:
#
#   BLOCO A (VERMELHO) — com a função ANTERIOR (corpo copiado do arquivo do repositório
#     20260930110000_ai_block03_analysis_persistence.sql, aplicado aqui sem edição):
#       * uma etiqueta HUMANA 'vip' (source='human', confiança 0.4) é transformada em
#         source='ai' pela sugestão homônima da IA (o UPSERT conflita por (contact_id, tag_name));
#       * a reclassificação seguinte (p_tags='[]') APAGA essa etiqueta — que era do humano.
#     É o defeito do achado, reproduzido.
#
#   BLOCO B (VERDE) — migration 20261006203249_ai_replace_tags_preserva_humana aplicada:
#       * etiqueta humana/manual homônima sobrevive com source e confiança intactos;
#       * reclassificação vazia limpa SÓ as etiquetas de IA;
#       * etiqueta de IA continua sendo substituída/atualizada (upsert normal, confiança máxima);
#       * uma única linha por (contato, nome) — o índice único segue valendo;
#       * ACL preservada pelo `create or replace` (authenticated/anon sem EXECUTE, service_role com);
#       * p_contact_id nulo continua levantando exceção.
#
#   MUTAÇÃO — remove a cláusula de guarda numa CÓPIA da migration e prova que o teste a pega
#     (a etiqueta humana volta a virar de IA). Confirma por sha256 que o arquivo do repo não muda.
#
# NÃO entra no CI (workflows são território do Joaquim). Roda via Docker local.

set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
migration="$repo_root/supabase/migrations/20261006203249_ai_replace_tags_preserva_humana.sql"
anterior="$repo_root/supabase/migrations/20260930110000_ai_block03_analysis_persistence.sql"
postgres_image="${AI_REPLACE_TAGS_TEST_POSTGRES_IMAGE:-postgres:17-alpine}"

main_container="zapp-v2-aitags-test-$$"
mut_container="zapp-v2-aitags-mut-$$"
target_container=""
cid="11111111-1111-1111-1111-111111111111"

fail() { printf '[FAIL] %s\n' "$1" >&2; exit 1; }

command -v docker >/dev/null 2>&1 || fail 'Docker nao esta instalado'
docker info >/dev/null 2>&1 || fail 'Docker daemon nao esta acessivel'
[[ -f "$migration" ]] || fail "migration nao encontrada: $migration"
[[ -f "$anterior" ]] || fail "migration anterior nao encontrada: $anterior"

remove_container() {
  local name="$1"
  if [[ "$name" =~ ^zapp-v2-aitags-(test|mut)-[0-9]+$ ]]; then
    docker rm -f "$name" >/dev/null 2>&1 || true
  fi
}
cleanup() { remove_container "$main_container"; remove_container "$mut_container"; }
trap cleanup EXIT INT TERM

psql_sql() {
  docker exec "$target_container" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres -c "$1"
}
psql_file() {
  docker exec -i "$target_container" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres < "$1"
}

# expect_value: roda o SQL e compara a última linha do resultado.
expect_value() {
  local label="$1" expected="$2" sql="$3" actual
  actual="$(psql_sql "$sql" | tail -n1)"
  [[ "$actual" == "$expected" ]] || fail "$label: esperado '$expected', obtido '$actual'"
  printf '[PASS] %s\n' "$label"
}
# expect_row: compara um valor JÁ apurado (evita rodar duas vezes a chamada que muta o estado).
expect_row() {
  local label="$1" expected="$2" actual="$3"
  [[ "$actual" == "$expected" ]] || fail "$label: esperado '$expected', obtido '$actual'"
  printf '[PASS] %s\n' "$label"
}
expect_error() {
  local label="$1" needle="$2" sql="$3" output status
  set +e
  output="$(docker exec "$target_container" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres \
    -c '\set VERBOSITY verbose' -c "$sql" 2>&1)"
  status=$?
  set -e
  if (( status == 0 )); then
    printf '%s\n' "$output" >&2
    fail "$label: deveria falhar, mas passou"
  fi
  if [[ "$output" != *"$needle"* ]]; then
    printf '%s\n' "$output" >&2
    fail "$label: esperava '$needle' no erro"
  fi
  printf '[PASS] %s\n' "$label"
}

# "source|confidence" da etiqueta <nome> do contato de teste (NULL vira a string 'NULL').
etiqueta() {
  psql_sql "SELECT coalesce(source,'NULL')||'|'||coalesce(confidence::text,'NULL')
              FROM public.ai_conversation_tags
             WHERE contact_id = '$cid'::uuid AND tag_name = '$1'" | tail -n1
}
conta() {
  psql_sql "SELECT count(*) FROM public.ai_conversation_tags
             WHERE contact_id = '$cid'::uuid AND tag_name = '$1'" | tail -n1
}
chama() {  # chama <jsonb-array> -> campo count do retorno da RPC (muta o estado; chame uma vez)
  psql_sql "SELECT (public.replace_ai_conversation_tags('$cid'::uuid, '$1'::jsonb))->>'count'" | tail -n1
}

# ---------------------------------------------------------------------------
# Pré-estado fiel: tabela de etiquetas com o índice único e o CHECK de origem
# (20260930110000 + 20260930150000), ACL mínima da RPC (só service_role) e o
# corpo ANTERIOR da função, copiado do arquivo do repositório.
# ---------------------------------------------------------------------------
tmp_dir="$(mktemp -d)"
trap 'rm -rf "$tmp_dir"; cleanup' EXIT INT TERM

cat > "$tmp_dir/pre.sql" <<'SQL'
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;

CREATE TABLE public.contacts (
  id uuid PRIMARY KEY,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE public.ai_conversation_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid NOT NULL REFERENCES public.contacts(id),
  tag_name text NOT NULL,
  confidence numeric DEFAULT 0.0,
  source text DEFAULT 'ai',
  created_at timestamptz DEFAULT now()
);
CREATE UNIQUE INDEX ai_conversation_tags_contact_tag_uidx
  ON public.ai_conversation_tags (contact_id, tag_name);
ALTER TABLE public.ai_conversation_tags
  ADD CONSTRAINT ai_conversation_tags_source_known
  CHECK (source is null or source in ('ai', 'human', 'manual'));
ALTER TABLE public.ai_conversation_tags ENABLE ROW LEVEL SECURITY;

INSERT INTO public.contacts (id) VALUES ('11111111-1111-1111-1111-111111111111');
SQL

# Corpo ANTERIOR da função, extraído sem edição do arquivo versionado.
sed -n '/^create function public\.replace_ai_conversation_tags(/,/^\$\$;/p' "$anterior" >> "$tmp_dir/pre.sql"
if ! grep -q 'on conflict (contact_id, tag_name) do update' "$tmp_dir/pre.sql"; then
  fail 'nao consegui extrair o corpo anterior de replace_ai_conversation_tags'
fi
if grep -q 'where public.ai_conversation_tags.source' "$tmp_dir/pre.sql"; then
  fail 'o corpo extraido como ANTERIOR ja contem a guarda (usa a versao corrigida?)'
fi

cat >> "$tmp_dir/pre.sql" <<'SQL'
REVOKE ALL ON FUNCTION public.replace_ai_conversation_tags(uuid, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.replace_ai_conversation_tags(uuid, jsonb) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.replace_ai_conversation_tags(uuid, jsonb) TO service_role;
SQL

boot_container() {
  local name="$1"
  target_container="$name"
  docker run --rm -d --name "$name" -e POSTGRES_PASSWORD=test_only "$postgres_image" >/dev/null
  local ready=0
  for _ in $(seq 1 90); do
    if psql_sql 'SELECT 1' >/dev/null 2>&1; then
      ready=$((ready + 1))
      if (( ready >= 2 )); then break; fi
    else ready=0; fi
    sleep 1
  done
  if (( ready < 2 )); then fail 'PostgreSQL descartavel nao ficou pronto de forma estavel'; fi
  psql_file "$tmp_dir/pre.sql"
}

echo "===== BLOCO A (VERMELHO): o corpo anterior entrega a etiqueta humana para a IA ====="
boot_container "$main_container"

psql_sql "INSERT INTO public.ai_conversation_tags (contact_id, tag_name, confidence, source)
          VALUES ('$cid'::uuid, 'vip', 0.4, 'human')" >/dev/null
expect_row "pré-estado: etiqueta HUMANA 'vip' (source=human, confiança 0.4)" "human|0.4" "$(etiqueta vip)"

expect_row "DEFEITO: sugestão homônima da IA faz a etiqueta humana virar de IA (count=1)" "1" \
  "$(chama '[{"name":"vip","confidence":0.95}]')"
expect_row "DEFEITO: source da etiqueta humana foi forçado para 'ai' (confiança da IA sobrescreveu a humana)" \
  "ai|0.95" "$(etiqueta vip)"

expect_row "DEFEITO: reclassificação vazia da IA APAGA a etiqueta que era humana (count=0)" "0" "$(chama '[]')"
expect_row "DEFEITO: a etiqueta humana 'vip' desapareceu" "0" "$(conta vip)"

echo
echo "===== BLOCO B (VERDE): migration aplicada — a IA não toca etiqueta que não é dela ====="
psql_file "$migration"

expect_value "a função continua existindo" "t" \
  "SELECT to_regprocedure('public.replace_ai_conversation_tags(uuid,jsonb)') IS NOT NULL"

psql_sql "DELETE FROM public.ai_conversation_tags" >/dev/null
psql_sql "INSERT INTO public.ai_conversation_tags (contact_id, tag_name, confidence, source) VALUES
            ('$cid'::uuid, 'vip',         0.4, 'human'),
            ('$cid'::uuid, 'manual-flag', 0.1, 'manual'),
            ('$cid'::uuid, 'ia-antiga',   0.3, 'ai')" >/dev/null

expect_row "sugestão homônima não adota a humana: retorno conta SÓ a etiqueta de IA (count=1)" "1" \
  "$(chama '[{"name":"vip","confidence":0.95},{"name":"ia-nova","confidence":0.8}]')"
expect_row "etiqueta HUMANA homônima sobrevive intacta (source e confiança originais)" "human|0.4" "$(etiqueta vip)"
expect_row "etiqueta MANUAL homônima também sobrevive" "manual|0.1" "$(etiqueta manual-flag)"
expect_row "continua havendo UMA linha por (contato, nome)" "1" "$(conta vip)"
expect_row "etiqueta de IA antiga foi substituída (removida)" "0" "$(conta ia-antiga)"
expect_row "etiqueta nova da IA entrou como source=ai" "ai|0.8" "$(etiqueta ia-nova)"

expect_row "reclassificação vazia limpa SÓ a IA: count=0" "0" "$(chama '[]')"
expect_row "etiqueta humana 'vip' fica de pé na limpeza vazia" "human|0.4" "$(etiqueta vip)"
expect_row "etiqueta manual 'manual-flag' fica de pé na limpeza vazia" "manual|0.1" "$(etiqueta manual-flag)"
expect_value "nenhuma etiqueta de IA sobrou" "0" \
  "SELECT count(*) FROM public.ai_conversation_tags WHERE contact_id = '$cid'::uuid AND source = 'ai'"

psql_sql "INSERT INTO public.ai_conversation_tags (contact_id, tag_name, confidence, source)
          VALUES ('$cid'::uuid, 'ia-nova', 0.2, 'ai')" >/dev/null
expect_row "etiqueta de IA continua sendo atualizada pelo upsert (confiança máxima)" "1" \
  "$(chama '[{"name":"ia-nova","confidence":0.9}]')"
expect_row "confiança da etiqueta de IA atualizada" "ai|0.9" "$(etiqueta ia-nova)"

echo "-- ACL e validação de entrada preservadas pelo create or replace --"
expect_value "authenticated NÃO executa" "f" \
  "SELECT has_function_privilege('authenticated', 'public.replace_ai_conversation_tags(uuid,jsonb)', 'EXECUTE')"
expect_value "anon NÃO executa" "f" \
  "SELECT has_function_privilege('anon', 'public.replace_ai_conversation_tags(uuid,jsonb)', 'EXECUTE')"
expect_value "service_role executa" "t" \
  "SELECT has_function_privilege('service_role', 'public.replace_ai_conversation_tags(uuid,jsonb)', 'EXECUTE')"
expect_error "p_contact_id nulo continua levantando exceção" "p_contact_id" \
  "SELECT public.replace_ai_conversation_tags(NULL::uuid, '[]'::jsonb)"

echo
echo "===== MUTAÇÃO: sem a guarda, o teste pega a etiqueta humana sendo adotada ====="
sed "s/where public\.ai_conversation_tags\.source = 'ai';/where true;/" "$migration" > "$tmp_dir/mut.sql"
if ! grep -q 'where true;' "$tmp_dir/mut.sql"; then
  fail 'mutacao nao aplicada na copia'
fi
if ! grep -q "where public.ai_conversation_tags.source = 'ai';" "$migration"; then
  fail 'original foi tocado (guarda)'
fi
orig_sha="$(sha256sum "$migration" | cut -d' ' -f1)"

boot_container "$mut_container"
psql_file "$tmp_dir/mut.sql"
psql_sql "INSERT INTO public.ai_conversation_tags (contact_id, tag_name, confidence, source)
          VALUES ('$cid'::uuid, 'vip', 0.4, 'human')" >/dev/null
chama '[{"name":"vip","confidence":0.95}]' >/dev/null
expect_row "mutação: sem a guarda, a etiqueta humana volta a virar de IA (o teste a pega)" "ai|0.95" "$(etiqueta vip)"
expect_row "mutação: a limpeza vazia seguinte apaga a etiqueta que era humana (count=0)" "0" "$(chama '[]')"
expect_row "mutação: a etiqueta 'vip' desapareceu de vez" "0" "$(conta vip)"

now_sha="$(sha256sum "$migration" | cut -d' ' -f1)"
if [[ "$orig_sha" != "$now_sha" ]]; then fail 'sha256 da migration mudou durante o teste'; fi
printf '[PASS] sha256 da migration do repo preservado (%s)\n' "${now_sha:0:16}"

echo
echo "OK — reclassificação de IA não converte mais etiqueta humana homônima (vermelho → verde + mutação)."
