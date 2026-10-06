#!/usr/bin/env bash
# R2-DB-013 / item 298 (P2, area migrations) — "Segundo UPDATE do template pode ser
# rejeitado pela guarda de snapshot da propria RPC".
#
# Harness descartavel (postgres:17-alpine). Aplica as MIGRATIONS REAIS:
#   1) 20260909210000_canonicalize_talkx_template_history.sql
#      cria public.guard_talkx_template_update() e o trigger
#      trg_guard_talkx_template_update, o trigger update_talkx_templates_updated_at
#      (cujo set_talkx_template_updated_at() grava transaction_timestamp()) e a RPC;
#   2) 20261001381230_talkx_current_version_backfill_fix.sql
#      cria talkx_templates.current_version_id, o backfill e a versao da RPC que
#      arquiva tambem o estado NOVO (onde o defeito vive);
#   3) a migration da CORRECAO (20261006231521_...), so no bloco GREEN.
# A RPC e sempre chamada como o PAPEL REAL 'authenticated' (SET LOCAL ROLE +
# request.jwt.claims), nunca como postgres.
#
# Blocos (cada um em container proprio, sem estado compartilhado):
#   RED   — com as migrations reais aplicadas, a chamada da RPC FALHA com 42501
#           talkx_template_update_requires_authorized_rpc: o 2o UPDATE (SET
#           current_version_id) nao acha snapshot com created_at = statement_timestamp().
#   GREEN — com a correcao aplicada, a MESMA chamada passa; o conteudo vivo muda, a
#           versao NOVA existe e vira current_version_id, o version_number devolvido e
#           o da versao viva, o updated_at devolvido e o persistido, e uma 2a edicao
#           tambem passa (nao e sorte de um unico carimbo).
#   DENTES— a mutation que volta o created_at do estado NOVO para o updated_at
#           persistido (comportamento antigo) derruba exatamente a prova GREEN.
set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
migration_guard="$repo_root/supabase/migrations/20260909210000_canonicalize_talkx_template_history.sql"
migration_v3="$repo_root/supabase/migrations/20261001381230_talkx_current_version_backfill_fix.sql"
migration_fix="${TALKX_SECOND_UPDATE_FIX_FILE:-$repo_root/supabase/migrations/20261006231521_talkx_template_snapshot_second_update.sql}"
postgres_image="${TALKX_SECOND_UPDATE_POSTGRES_IMAGE:-postgres:17-alpine}"
tmp_dir="${TALKX_SECOND_UPDATE_TMPDIR:-${TMPDIR:-$repo_root/.tmp}}"

fail() { printf '[FALHA] %s\n' "$1" >&2; exit 1; }
ok() { printf '[OK] %s\n' "$1"; }
brief() {
  local filtered
  filtered="$(printf '%s' "$1" | grep -E '^(ERROR|DETAIL|HINT|FALHA|NOTICE)' | head -4 | tr '\n' ' ' || true)"
  if [[ -n "$filtered" ]]; then printf '%s' "$filtered"; else printf '%s' "${1:0:400}"; fi
}

cid=''
work_dir=''
containers=()
cleanup() {
  local c
  for c in "${containers[@]:-}"; do
    if [[ "$c" =~ ^talkx-2upd-[0-9]+$ ]]; then docker rm -f "$c" >/dev/null 2>&1 || true; fi
  done
  if [[ -n "$work_dir" && "$work_dir" == "$tmp_dir"/talkx-2upd-mut.* ]]; then
    rm -rf -- "$work_dir"
  fi
}
trap cleanup EXIT INT TERM

command -v docker >/dev/null 2>&1 || fail 'Docker nao esta instalado'
docker info >/dev/null 2>&1 || fail 'Docker daemon nao acessivel'
[[ -f "$migration_guard" ]] || fail "migration nao encontrada: $migration_guard"
[[ -f "$migration_v3" ]] || fail "migration nao encontrada: $migration_v3"
[[ -f "$migration_fix" ]] || fail "migration da correcao nao encontrada: $migration_fix"
[[ -n "$tmp_dir" && "$tmp_dir" != '/' ]] || fail "TMPDIR invalido: '$tmp_dir'"
mkdir -p "$tmp_dir"
work_dir="$(mktemp -d "$tmp_dir/talkx-2upd-mut.XXXXXX")"

test_password='talkx_second_update_test_only'
db_name='postgres'
user_a='20000000-0000-0000-0000-000000000001'
profile_a='10000000-0000-0000-0000-000000000001'
t_a='30000000-0000-0000-0000-000000000001'

psql_test()   { docker exec -i "$cid" psql -X -q -v ON_ERROR_STOP=1 -U postgres -d "$db_name" "$@"; }
psql_value()  { docker exec -i "$cid" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d "$db_name" -c "$1"; }

new_container() {
  local name="talkx-2upd-$RANDOM$RANDOM" ready=false
  docker run --rm -d --name "$name" -e POSTGRES_PASSWORD="$test_password" "$postgres_image" >/dev/null
  containers+=("$name")
  cid="$name"
  for _ in $(seq 1 90); do
    if [[ "$(docker logs "$name" 2>&1 | grep -c 'database system is ready to accept connections' || true)" -ge 2 ]] \
       && docker exec "$name" psql -X -U postgres -d "$db_name" -Atqc 'SELECT 1' >/dev/null 2>&1; then
      ready=true; break
    fi
    sleep 1
  done
  [[ "$ready" == true ]] || fail "PostgreSQL descartavel nao ficou pronto ($name)"
}

# Fixture pre-canonizacao: mesmo ponto de partida do runtime real (tabelas ja
# existentes, sem os triggers/guards que a migration 20260909210000 instala).
setup_fixture() {
  psql_test >/dev/null <<'SQL'
SET client_min_messages TO warning;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;
CREATE SCHEMA auth;
GRANT USAGE ON SCHEMA public, auth TO anon, authenticated, service_role;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('request.jwt.claim.role', true), '') $$;
GRANT EXECUTE ON FUNCTION auth.uid(), auth.role() TO PUBLIC;

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL UNIQUE,
  role text NOT NULL,
  is_active boolean NOT NULL DEFAULT true
);
CREATE TABLE public.talkx_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  category text NOT NULL DEFAULT 'geral',
  content text NOT NULL,
  media_url text,
  media_type text,
  tags text[] NOT NULL DEFAULT '{}'::text[],
  status text NOT NULL DEFAULT 'approved',
  use_count integer NOT NULL DEFAULT 0,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.talkx_template_variants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES public.talkx_templates(id) ON DELETE CASCADE,
  label text NOT NULL CHECK (label IN ('A','B','C')),
  content text NOT NULL,
  media_url text,
  media_type text,
  weight integer NOT NULL DEFAULT 50 CHECK (weight > 0 AND weight <= 100),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (template_id, label)
);
CREATE FUNCTION public.get_profile_id_for_user(p_user_id uuid) RETURNS uuid
LANGUAGE sql SECURITY DEFINER STABLE SET search_path=public,pg_temp AS $$
  SELECT id FROM public.profiles WHERE user_id=p_user_id AND is_active=true LIMIT 1 $$;
CREATE FUNCTION public.is_admin_or_supervisor(p_user_id uuid) RETURNS boolean
LANGUAGE sql SECURITY DEFINER STABLE SET search_path=public,pg_temp AS $$
  SELECT EXISTS(
    SELECT 1 FROM public.profiles
    WHERE user_id=p_user_id AND is_active=true AND role IN ('admin','supervisor')
  ) $$;

-- ACL medido do runtime: DML amplo para authenticated/service_role em talkx_templates.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.talkx_templates TO authenticated, service_role;
GRANT SELECT ON public.profiles TO authenticated, service_role;

INSERT INTO public.profiles(id,user_id,role) VALUES
  ('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','agent');
INSERT INTO public.talkx_templates(id,name,description,category,content,status,created_by,created_at,updated_at)
VALUES ('30000000-0000-0000-0000-000000000001','Original','old desc','sales','Old content','approved',
        '10000000-0000-0000-0000-000000000001','2026-09-09T10:00:00Z','2026-09-09T10:00:00Z');
SQL
}

apply_real_migrations() {
  psql_test < "$migration_guard" >/dev/null || fail "a migration real 20260909210000 nao aplicou"
  psql_test < "$migration_v3" >/dev/null || fail "a migration real 20261001381230 nao aplicou"
}

# Chama a RPC canonica como 'authenticated' (papel real), numa transacao so.
# Devolve em stdout a linha "template_id|updated_at|version_number" ou o erro.
call_rpc_as_authenticated() {
  local expected="$1" content="$2" name="$3"
  docker exec -i "$cid" psql -X -qAt -v ON_ERROR_STOP=0 -U postgres -d "$db_name" 2>&1 <<SQL
BEGIN;
SET LOCAL request.jwt.claim.role = 'authenticated';
SET LOCAL request.jwt.claim.sub = '$user_a';
SET LOCAL ROLE authenticated;
SELECT template_id::text || '|' || updated_at::text || '|' || version_number::text
  FROM public.update_talkx_template_with_snapshot(
    '$t_a', '$expected'::timestamptz, '$name', NULL, 'sales', '$content',
    NULL, NULL, '{}'::text[], 'approved', '{}'::text[]);
COMMIT;
SQL
}

expected_updated_at() { psql_value "SELECT updated_at::text FROM public.talkx_templates WHERE id='$t_a'"; }
live_content()        { psql_value "SELECT content FROM public.talkx_templates WHERE id='$t_a'"; }
max_version()         { psql_value "SELECT COALESCE(max(version_number),0) FROM public.talkx_template_versions WHERE template_id='$t_a'"; }
current_version_row() { psql_value "SELECT COALESCE(v.version_number::text,'<null>') || '|' || COALESCE(v.content,'<null>') FROM public.talkx_templates t LEFT JOIN public.talkx_template_versions v ON v.id = t.current_version_id WHERE t.id='$t_a'"; }

# ---------------------------------------------------------------------------
# Blocos
# ---------------------------------------------------------------------------
assert_guard_active() {
  local n
  n="$(psql_value "SELECT count(*) FROM pg_trigger WHERE tgrelid='public.talkx_templates'::regclass AND tgname='trg_guard_talkx_template_update' AND NOT tgisinternal")"
  [[ "$n" == '1' ]] || fail "o guard trg_guard_talkx_template_update nao esta ativo (got '$n') — a prova seria vazia"
}

run_case_red() {
  new_container
  setup_fixture
  apply_real_migrations
  assert_guard_active

  local before_content before_cur expected out
  before_content="$(live_content)"
  before_cur="$(current_version_row)"
  expected="$(expected_updated_at)"

  out="$(call_rpc_as_authenticated "$expected" 'Conteudo NOVO' 'Novo nome')"
  [[ "$out" == *'talkx_template_update_requires_authorized_rpc'* ]] \
    || fail "RED: esperava o 2o UPDATE recusado pelo guard com 42501 (saida: $(brief "$out"))"

  [[ "$(live_content)" == "$before_content" ]] || fail "RED: o conteudo vivo nao deveria mudar (rollback)"
  [[ "$(current_version_row)" == "$before_cur" ]] || fail "RED: current_version_id nao deveria mudar (rollback)"
  ok "RED: RPC canonica recusada com 42501 talkx_template_update_requires_authorized_rpc no 2o UPDATE (SET current_version_id) — defeito reproduzido; nada persistiu ($(brief "$out"))"
}

assert_rpc_works() {
  local out expected max_before expected_ret ret_tid ret_ts ret_v live
  expected="$(expected_updated_at)"
  max_before="$(max_version)"

  out="$(call_rpc_as_authenticated "$expected" 'Conteudo NOVO' 'Novo nome')"
  [[ "$out" == "$t_a|"* ]] || fail "GREEN: a RPC deveria ter sucesso e devolver o template_id (saida: $(brief "$out"))"
  ret_tid="${out%%|*}"; rest="${out#*|}"; ret_ts="${rest%%|*}"; ret_v="${rest##*|}"
  [[ "$ret_tid" == "$t_a" ]] || fail "GREEN: template_id devolvido errado (got '$out')"

  expected_ret=$((max_before + 2))
  [[ "$ret_v" == "$expected_ret" ]] || fail "GREEN: version_number devolvido deveria ser o da versao VIVA v$expected_ret (got '$out')"

  live="$(live_content)"
  [[ "$live" == 'Conteudo NOVO' ]] || fail "GREEN: o conteudo vivo deveria mudar (got '$live')"

  local new_rows
  new_rows="$(psql_value "SELECT count(*) FROM public.talkx_template_versions WHERE template_id='$t_a' AND content='Conteudo NOVO'")"
  [[ "$new_rows" == '1' ]] || fail "GREEN: deveria existir exatamente 1 versao com o conteudo NOVO (got $new_rows)"

  local cur
  cur="$(current_version_row)"
  [[ "$cur" == "$expected_ret|Conteudo NOVO" ]] || fail "GREEN: current_version_id deveria apontar p/ v$expected_ret com o conteudo novo (got '$cur')"

  local persisted
  persisted="$(expected_updated_at)"
  [[ "$ret_ts" == "$persisted" ]] || fail "GREEN: o updated_at devolvido ('$ret_ts') deve ser o PERSISTIDO ('$persisted')"

  # 2a edicao: prova que nao e sorte de um unico carimbo de tempo.
  local expected2 max2 out2 ret_v2 cur2
  expected2="$persisted"
  max2="$(max_version)"
  out2="$(call_rpc_as_authenticated "$expected2" 'Conteudo NOVO 2' 'Novo nome 2')"
  [[ "$out2" == "$t_a|"* ]] || fail "GREEN: a 2a edicao deveria ter sucesso (saida: $(brief "$out2"))"
  ret_v2="${out2##*|}"
  [[ "$ret_v2" == "$((max2 + 2))" ]] || fail "GREEN: 2a edicao deveria devolver v$((max2 + 2)) (got '$out2')"
  [[ "$(live_content)" == 'Conteudo NOVO 2' ]] || fail "GREEN: o conteudo vivo da 2a edicao esta errado"
  cur2="$(current_version_row)"
  [[ "$cur2" == "$ret_v2|Conteudo NOVO 2" ]] || fail "GREEN: current_version_id deveria apontar p/ v$ret_v2 (got '$cur2')"
  [[ "$(max_version)" == "$ret_v2" ]] || fail "GREEN: o ponteiro deveria estar na MAIOR versao"

  # O guard NAO foi afrouxado: UPDATE direto como authenticated segue recusado.
  local hack
  hack="$(docker exec -i "$cid" psql -X -qAt -v ON_ERROR_STOP=0 -U postgres -d "$db_name" 2>&1 <<SQL
BEGIN;
SET LOCAL request.jwt.claim.role = 'authenticated';
SET LOCAL request.jwt.claim.sub = '$user_a';
SET LOCAL ROLE authenticated;
UPDATE public.talkx_templates SET content='hack' WHERE id='$t_a';
COMMIT;
SQL
)"
  [[ "$hack" == *'talkx_template_update_requires_authorized_rpc'* ]] \
    || fail "GREEN: UPDATE direto como authenticated deveria continuar recusado (saida: $(brief "$hack"))"
  [[ "$(live_content)" == 'Conteudo NOVO 2' ]] || fail "GREEN: o UPDATE direto nao podia ter efeito"
  ok "GREEN: 1a e 2a edicoes passam pela RPC; conteudo vivo muda, versao NOVA existe e vira current_version_id, version_number devolvido e o da versao viva, updated_at devolvido e o persistido, e o UPDATE direto segue barrado pelo guard."
}

run_case_green() {
  new_container
  setup_fixture
  apply_real_migrations
  psql_test < "$migration_fix" >/dev/null || fail "a migration da correcao nao aplicou"
  assert_guard_active
  assert_rpc_works
}

run_case_teeth() {
  local label="$1" file="$2"
  new_container
  setup_fixture
  apply_real_migrations
  psql_test < "$file" >/dev/null || fail "DENTES $label: a migration mutada nem aplicou"
  assert_guard_active
  local out code
  code=0
  out="$(assert_rpc_works 2>&1)" || code=$?
  [[ "$code" != 0 ]] || fail "DENTES $label: SOBREVIVEU — a mutation nao derrubou a prova."
  [[ "$out" == *'talkx_template_update_requires_authorized_rpc'* ]] \
    || fail "DENTES $label: a prova caiu, mas com outra mensagem (saida: $(brief "$out"))"
  ok "DENTES $label: com o created_at do estado NOVO voltado para o updated_at persistido, a RPC e recusada de novo pelo guard — a linha e load-bearing."
}

build_mutations() {
  local mut="$work_dir/fix-snapshot-novo-com-updated-at.sql"
  # So a 2a insercao (o snapshot do estado NOVO): troca `v_statement_at` por
  # `v_updated_at` no primeiro INSERT que segue a linha marcadora do estado NOVO.
  awk '
    !/^--/ && /v_version_number \+ 1, btrim\(p_name\)/ { marca=1 }
    marca && /v_actor_profile_id, v_statement_at/ {
      sub(/v_actor_profile_id, v_statement_at/, "v_actor_profile_id, v_updated_at"); marca=0
    }
    { print }
  ' "$migration_fix" > "$mut"
  cmp -s "$migration_fix" "$mut" && fail 'MUTACAO snapshot-novo-com-updated-at nao alterou o arquivo (ancora invalida)'
  [[ "$(grep -v '^--' "$mut" | grep -c 'v_actor_profile_id, v_updated_at')" == '1' ]] \
    || fail 'MUTACAO snapshot-novo-com-updated-at nao atingiu exatamente 1 insercao'
  [[ "$(grep -v '^--' "$mut" | grep -c 'v_actor_profile_id, v_statement_at')" == '1' ]] \
    || fail 'MUTACAO snapshot-novo-com-updated-at mexeu em mais de uma insercao'
  mut_fix="$mut"
}

printf '== talkx_template_snapshot_second_update: harness (postgres:17-alpine) ==\n'
printf 'guard real : %s\n' "$migration_guard"
printf 'rpc defeito: %s\n' "$migration_v3"
printf 'correcao   : %s\n' "$migration_fix"

build_mutations
printf '\n-- rodada 1/3: RED (migrations reais, sem a correcao) --\n'
run_case_red
printf '\n-- rodada 2/3: GREEN (com a correcao) --\n'
run_case_green
printf '\n-- rodada 3/3: DENTES (mutation do snapshot do estado NOVO) --\n'
run_case_teeth 'snapshot-novo-com-updated-at' "$mut_fix"

printf '\n'
ok 'R2-DB-013: defeito reproduzido (RED 42501) e corrigido (GREEN); o guard de snapshot continua barrando UPDATE direto.'
