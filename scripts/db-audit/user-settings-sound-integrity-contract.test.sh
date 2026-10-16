#!/usr/bin/env bash
# Ensaio de MIGRACAO + REVERSAO do contrato de integridade de som em user_settings.
#
# Ate aqui a migration de contrato
#   20260930350000_user_settings_sound_integridade.sql
# so foi CLASSIFICADA (aditiva x contrato); nunca foi EXECUTADA. Este ensaio roda o
# arquivo de verdade num PostgreSQL descartavel que reproduz o estado do banco canonico
# de 30/09 ANTES do contrato, e assina cada promessa com expect_value/expect_error:
#
#   (1) ANTES: `sound_volume` aceita NULL e um tipo fora do vocabulario entra;
#   (2) DEPOIS: `sound_volume` e NOT NULL (INSERT/UPDATE nulo REJEITADO);
#   (3) DEPOIS: as 5 CHECKs de tipo existem e estao VALIDADAS (pg_constraint.convalidated);
#   (4) DEPOIS: tipo fora do vocabulario e REJEITADO citando a constraint;
#   (5) valor canonico continua ACEITO e o DEFAULT 70 continua preenchendo;
#   (6) nenhuma linha perdida nem criada;
#   (7) a CHECK 10-100 do volume continua de pe (nao foi afrouxada pelo SET NOT NULL);
#   (8) REVERSAO no nivel de schema (drop constraints + drop not null).
#
# No fim prova que o ensaio PEGA O DEFEITO: muta uma COPIA da migration em tmp
#   (a) remove um `validate constraint` -> a constraint existe mas nao fica validada;
#   (b) troca 'soft' -> 'quiet' na CHECK de mensagem -> o valor canonico 'soft' passa a
#       ser REJEITADO;
#   (c) confirma por sha256 que o arquivo do repo NUNCA foi tocado.
#
# Parametro opcional: caminho da migration a ensaiar (default = a do repo).
#
# NAO entra no CI: .github/workflows/db-guard.yml e territorio do Joaquim (mesma
# decisao do ai-block03-vocabulary-contract.test.sh, deste mesmo dia).

set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
migration="${1:-$repo_root/supabase/migrations/20260930350000_user_settings_sound_integridade.sql}"
postgres_image="${SOUND_INTEGRITY_TEST_POSTGRES_IMAGE:-postgres:17-alpine}"

main_container="zapp-v2-soundint-main-test-$$"
mut_a_container="zapp-v2-soundint-muta-test-$$"
mut_b_container="zapp-v2-soundint-mutb-test-$$"
target_container=""

remove_container() {
  local name="$1"
  if [[ "$name" =~ ^zapp-v2-soundint-[a-z0-9]+-test-[0-9]+$ ]]; then
    docker rm -f "$name" >/dev/null 2>&1 || true
  fi
}

cleanup() {
  remove_container "$main_container"
  remove_container "$mut_a_container"
  remove_container "$mut_b_container"
}
trap cleanup EXIT INT TERM

fail() {
  printf '[FAIL] %s\n' "$1" >&2
  exit 1
}

psql_sql() {
  docker exec "$target_container" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres -c "$1"
}

psql_file() {
  docker exec -i "$target_container" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres < "$1"
}

# expect_error: a chamada precisa FALHAR e a mensagem precisa conter `needle`.
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

# expect_value: a ULTIMA linha do resultado precisa ser exatamente `expected`
# (chamadas que preparam a sessao imprimem o proprio retorno antes do resultado).
expect_value() {
  local label="$1" expected="$2" sql="$3" actual
  actual="$(psql_sql "$sql" | tail -n1)"
  if [[ "$actual" != "$expected" ]]; then
    fail "$label: esperado '$expected', obtido '$actual'"
  fi
  printf '[PASS] %s\n' "$label"
}

expect_ok() {
  local label="$1" sql="$2"
  psql_sql "$sql" >/dev/null || fail "$label: deveria ter sucesso"
  printf '[PASS] %s\n' "$label"
}

start_container() {
  local name="$1" ready=0
  docker run --rm -d --name "$name" -e POSTGRES_PASSWORD=test_only "$postgres_image" >/dev/null
  for _ in $(seq 1 90); do
    if docker exec "$name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres -c 'SELECT 1' >/dev/null 2>&1; then
      ready=$((ready + 1))
      if (( ready >= 2 )); then break; fi
    else
      ready=0
    fi
    sleep 1
  done
  (( ready >= 2 )) || fail "PostgreSQL descartavel ($name) nao ficou pronto de forma estavel"
}

command -v docker >/dev/null 2>&1 || fail 'Docker nao esta instalado'
docker info >/dev/null 2>&1 || fail 'Docker daemon nao esta acessivel'
[[ -f "$migration" ]] || fail "migration nao encontrada: $migration"

tmp_dir="$(mktemp -d)"
trap 'rm -rf "$tmp_dir"; cleanup' EXIT INT TERM

sha_before="$(sha256sum "$migration" | cut -d' ' -f1)"
cp "$migration" "$tmp_dir/original.sql"

# ── Estado ANTERIOR fiel ao banco canonico de 30/09 ────────────────────────────
# Colunas e defaults copiados do banco real: sound_volume integer DEFAULT 70 (nullable),
# os cinco *_sound_type text nullable com default, e a CHECK 10-100 ja validada
# (20260929830000). Duas linhas, como o canonico.
cat > "$tmp_dir/pre.sql" <<'SQL'
create table public.user_settings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique,
  sound_enabled boolean default true,
  sound_volume integer default 70,
  message_sound_type text default 'chime',
  mention_sound_type text default 'bell',
  sla_sound_type text default 'alert',
  goal_sound_type text default 'chime',
  transcription_sound_type text default 'soft',
  updated_at timestamptz default now()
);

alter table public.user_settings
  add constraint user_settings_sound_volume_range
  check (sound_volume between 10 and 100);
SQL

cat > "$tmp_dir/seed.sql" <<'SQL'
insert into public.user_settings
  (user_id, sound_volume, message_sound_type, mention_sound_type, sla_sound_type, goal_sound_type, transcription_sound_type)
values
  ('11111111-1111-1111-1111-111111111111', 70, 'chime', 'bell', 'alert', 'chime', 'soft'),
  ('22222222-2222-2222-2222-222222222222', 70, 'chime', 'bell', 'alert', 'chime', 'soft');
SQL

start_container "$main_container"
target_container="$main_container"
psql_file "$tmp_dir/pre.sql"
psql_file "$tmp_dir/seed.sql"

echo
echo '── (1) ANTES do contrato: as duas lacunas existem de verdade ─────────────────────'
expect_value 'ANTES: sound_volume e NULLABLE (attnotnull = f)' 'f' \
  "SELECT attnotnull FROM pg_attribute WHERE attrelid = 'public.user_settings'::regclass AND attname = 'sound_volume'"
expect_value 'ANTES: INSERT com sound_volume NULL e ACEITO' '1' \
  "INSERT INTO public.user_settings (user_id, sound_volume) VALUES ('33333333-3333-3333-3333-333333333333', NULL) RETURNING (sound_volume IS NULL)::int"
expect_ok 'ANTES: tipo fora do vocabulario (ding) e ACEITO' \
  "UPDATE public.user_settings SET message_sound_type = 'ding' WHERE user_id = '33333333-3333-3333-3333-333333333333'"
expect_value 'ANTES: nao existe CHECK de tipo de som' '0' \
  "SELECT count(*) FROM pg_constraint WHERE conrelid = 'public.user_settings'::regclass AND conname LIKE 'user_settings_%_sound_type_valid'"
# limpa o que a secao (1) sujou, senao o SET NOT NULL da migration falharia por culpa do teste.
expect_ok 'ANTES: limpa a linha suja para o SET NOT NULL poder rodar' \
  "DELETE FROM public.user_settings WHERE user_id = '33333333-3333-3333-3333-333333333333'"

echo
echo '── (2) A MIGRATION EXECUTA (classe contrato) ─────────────────────────────────────'
psql_file "$migration" || fail 'a migration do repo nao aplicou no PostgreSQL descartavel'
printf '[PASS] migration aplicada: %s\n' "$(basename "$migration")"

echo
echo '── (3) DEPOIS: invariantes do contrato ──────────────────────────────────────────'
expect_value 'DEPOIS: sound_volume e NOT NULL (attnotnull = t)' 't' \
  "SELECT attnotnull FROM pg_attribute WHERE attrelid = 'public.user_settings'::regclass AND attname = 'sound_volume'"
expect_error 'DEPOIS: INSERT com sound_volume NULL e REJEITADO' \
  'null value in column "sound_volume"' \
  "INSERT INTO public.user_settings (user_id, sound_volume) VALUES ('44444444-4444-4444-4444-444444444444', NULL)"
expect_error 'DEPOIS: UPDATE para sound_volume NULL e REJEITADO' \
  'null value in column "sound_volume"' \
  "UPDATE public.user_settings SET sound_volume = NULL WHERE user_id = '11111111-1111-1111-1111-111111111111'"
expect_value 'DEPOIS: as 5 CHECKs de tipo existem E estao VALIDADAS' '5' \
  "SELECT count(*) FROM pg_constraint WHERE conrelid = 'public.user_settings'::regclass AND conname LIKE 'user_settings_%_sound_type_valid' AND convalidated"
expect_value 'DEPOIS: nenhuma constraint de tipo ficou NOT VALID' '0' \
  "SELECT count(*) FROM pg_constraint WHERE conrelid = 'public.user_settings'::regclass AND conname LIKE 'user_settings_%_sound_type_valid' AND NOT convalidated"

echo
echo '── (4) DEPOIS: o vocabulario e fechado nos cinco tipos ──────────────────────────'
for par in message:ding mention:pop sla:siren goal:fanfare transcription:whoosh; do
  col="${par%%:*}"; bad="${par##*:}"
  expect_error "DEPOIS: ${col}_sound_type REJEITA '${bad}' citando a constraint" \
    "user_settings_${col}_sound_type_valid" \
    "UPDATE public.user_settings SET ${col}_sound_type = '${bad}' WHERE user_id = '11111111-1111-1111-1111-111111111111'"
done
for canon in beep chime bell alert soft; do
  expect_ok "DEPOIS: valor canonico '${canon}' continua ACEITO em message_sound_type" \
    "UPDATE public.user_settings SET message_sound_type = '${canon}' WHERE user_id = '11111111-1111-1111-1111-111111111111'"
done
expect_ok "DEPOIS: restaura 'chime' como no canonico" \
  "UPDATE public.user_settings SET message_sound_type = 'chime' WHERE user_id = '11111111-1111-1111-1111-111111111111'"

echo
echo '── (5) DEPOIS: nada mais mudou (default, faixa 10-100, linhas) ───────────────────'
expect_value 'DEPOIS: o DEFAULT 70 continua preenchendo (INSERT sem a coluna)' '70' \
  "INSERT INTO public.user_settings (user_id) VALUES ('55555555-5555-5555-5555-555555555555') RETURNING sound_volume"
expect_ok 'DEPOIS: limpa a linha do teste de default' \
  "DELETE FROM public.user_settings WHERE user_id = '55555555-5555-5555-5555-555555555555'"
expect_error 'DEPOIS: a CHECK 10-100 do volume continua de pe (500 rejeitado)' \
  'user_settings_sound_volume_range' \
  "UPDATE public.user_settings SET sound_volume = 500 WHERE user_id = '11111111-1111-1111-1111-111111111111'"
expect_error 'DEPOIS: a CHECK 10-100 continua rejeitando abaixo do piso (5)' \
  'user_settings_sound_volume_range' \
  "UPDATE public.user_settings SET sound_volume = 5 WHERE user_id = '11111111-1111-1111-1111-111111111111'"
expect_value 'DEPOIS: as 2 linhas do canonico continuam la, intactas' '2' \
  "SELECT count(*) FROM public.user_settings WHERE sound_volume = 70 AND message_sound_type = 'chime' AND transcription_sound_type = 'soft'"

echo
echo '── (6) REVERSAO no nivel de schema ───────────────────────────────────────────────'
expect_ok 'REVERSAO: drop das 5 CHECKs de tipo' \
  "ALTER TABLE public.user_settings
     DROP CONSTRAINT user_settings_message_sound_type_valid,
     DROP CONSTRAINT user_settings_mention_sound_type_valid,
     DROP CONSTRAINT user_settings_sla_sound_type_valid,
     DROP CONSTRAINT user_settings_goal_sound_type_valid,
     DROP CONSTRAINT user_settings_transcription_sound_type_valid"
expect_ok 'REVERSAO: sound_volume volta a ser NULLABLE' \
  "ALTER TABLE public.user_settings ALTER COLUMN sound_volume DROP NOT NULL"
expect_value 'REVERSAO: nenhuma constraint de tipo restou' '0' \
  "SELECT count(*) FROM pg_constraint WHERE conrelid = 'public.user_settings'::regclass AND conname LIKE 'user_settings_%_sound_type_valid'"
expect_ok 'REVERSAO: tipo legado ding volta a ser ACEITO' \
  "UPDATE public.user_settings SET message_sound_type = 'ding' WHERE user_id = '11111111-1111-1111-1111-111111111111'"
expect_value 'REVERSAO: INSERT com sound_volume NULL volta a ser ACEITO' '1' \
  "INSERT INTO public.user_settings (user_id, sound_volume) VALUES ('66666666-6666-6666-6666-666666666666', NULL) RETURNING (sound_volume IS NULL)::int"

echo
echo '── MUTACOES: prova que o ensaio pega o defeito (copias em tmp, nunca o repo) ────'

mut_a="$tmp_dir/mut_a_sem_validate.sql"
mut_b="$tmp_dir/mut_b_soft_para_quiet.sql"

# (a) remove o PAR que valida a CHECK de mensagem: a linha `ALTER TABLE public.user_settings`
#     E a `  VALIDATE CONSTRAINT ...;` que a segue. Remover só a segunda deixa o
#     `ALTER TABLE` orfao e o arquivo vira erro de sintaxe — foi o que a 1a execucao
#     mostrou ('syntax error at or near "TABLE"'). A constraint continua sendo criada,
#     mas fica NOT VALID.
awk '
  /^ALTER TABLE public\.user_settings$/ { held = $0; next }
  {
    if (held != "") {
      if ($0 == "  VALIDATE CONSTRAINT user_settings_message_sound_type_valid;") { held = ""; next }
      print held; held = ""
    }
    print
  }
  END { if (held != "") print held }
' "$tmp_dir/original.sql" > "$mut_a"
# (b) troca 'soft' -> 'quiet' SO na CHECK de mensagem.
sed "s/CHECK (message_sound_type IN ('beep', 'chime', 'bell', 'alert', 'soft'))/CHECK (message_sound_type IN ('beep', 'chime', 'bell', 'alert', 'quiet'))/" \
  "$tmp_dir/original.sql" > "$mut_b"

[[ "$(grep -c 'VALIDATE CONSTRAINT' "$mut_a" || true)" == '4' ]] \
  || fail 'mutacao (a) nao removeu exatamente uma validacao (devem sobrar 4)'
[[ "$(grep -c '^ALTER TABLE public\.user_settings$' "$mut_a" || true)" == \
   "$(( $(grep -c '^ALTER TABLE public\.user_settings$' "$tmp_dir/original.sql") - 1 ))" ]] \
  || fail 'mutacao (a) nao removeu o ALTER TABLE orfao junto da validacao'
# o par removido tem de ser o da CHECK de MENSAGEM (a de mention continua validada).
[[ "$(grep -c 'VALIDATE CONSTRAINT user_settings_mention_sound_type_valid;' "$mut_a" || true)" == '1' ]] \
  || fail 'mutacao (a) removeu a validacao errada'
grep -q "'beep', 'chime', 'bell', 'alert', 'quiet'" "$mut_b" \
  || fail 'mutacao (b) nao trocou soft->quiet na CHECK de mensagem'
[[ "$(grep -c 'VALIDATE CONSTRAINT' "$mut_b" || true)" == '5' ]] \
  || fail 'mutacao (b) mexeu nas validacoes (devem continuar 5)'

# (a) container novo: a migration mutada APLICA, mas a constraint fica sem validar.
start_container "$mut_a_container"
target_container="$mut_a_container"
psql_file "$tmp_dir/pre.sql"
psql_file "$tmp_dir/seed.sql"
psql_file "$mut_a" || fail 'MUTACAO (a): migration mutada nao aplicou'
mut_a_validated="$(psql_sql "SELECT convalidated FROM pg_constraint WHERE conname = 'user_settings_message_sound_type_valid'")"
if [[ "$mut_a_validated" == 't' ]]; then
  fail 'MUTACAO (a) NAO foi detectada: a CHECK ficou validada mesmo sem a linha de VALIDATE'
fi
[[ "$mut_a_validated" == 'f' ]] \
  || fail "MUTACAO (a): esperava 'f' em convalidated, obtido '$mut_a_validated'"
printf '[PASS] MUTACAO (a): sem o VALIDATE, convalidated = f — a assercao das 5 validades fica VERMELHA\n'

# (b) container novo: a migration mutada aplica, mas 'soft' passa a ser rejeitado.
start_container "$mut_b_container"
target_container="$mut_b_container"
psql_file "$tmp_dir/pre.sql"
psql_file "$tmp_dir/seed.sql"
psql_file "$mut_b" || fail 'MUTACAO (b): migration mutada nao aplicou'
expect_error "MUTACAO (b): com a CHECK mutada, o valor canonico 'soft' e REJEITADO (assercao ficaria VERMELHA)" \
  'user_settings_message_sound_type_valid' \
  "UPDATE public.user_settings SET message_sound_type = 'soft' WHERE user_id = '11111111-1111-1111-1111-111111111111'"

# (c) o arquivo do repo nunca foi tocado.
sha_after="$(sha256sum "$migration" | cut -d' ' -f1)"
[[ "$sha_after" == "$sha_before" ]] || fail 'MUTACAO (c): o arquivo do repo foi alterado'
cmp -s "$tmp_dir/original.sql" "$migration" || fail 'MUTACAO (c): copia pristina difere do repo'
printf '[PASS] MUTACAO (c): arquivo do repo intacto (sha256 %s)\n' "$sha_after"

printf '\n[OK] contrato de integridade de som em user_settings verificado: a migration EXECUTA, faz o que promete e e reversivel\n'
