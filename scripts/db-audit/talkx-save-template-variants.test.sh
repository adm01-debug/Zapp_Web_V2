#!/usr/bin/env bash
# Harness descartavel (postgres:17-alpine): public.save_talkx_template_variants.
# RED: a migration anterior falha as provas novas (id preservado, sucesso 2/3, payload
# invalido, peso nulo/0, id nao-uuid). GREEN: a migration nova passa todas.
# A chamada da RPC sai de `SET LOCAL ROLE authenticated` + claims (auth.uid() real).
# Casos: (a) EXECUTE p/ authenticated; (b) anon sem EXECUTE; (c) not_authorized;
# (d) template_not_found; (e) stale_template; (f) 0 variantes; (g) variante com
# destinatario nao removida; (h) pesos != 100; (i) sem controle; (j) invalid_label;
# (k) duplicate_label; (l) variant_not_found; (m) payload nao-array; (n) peso nulo/<=0;
# (o) id nao-uuid; (p) sucesso 2 variantes; (q) sucesso 3 variantes; (r) id preservado;
# (u) destinatario com variant_id NULL + []; (v) peso gigante/>100; (w) troca A<->B.
# (s) remocao sem destinatario; (t) id preservado com label trocado.
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
migration="${TALKX_VARIANTS_MIGRATION_FILE:-$repo_root/supabase/migrations/20261010151242_save_talkx_template_variants.sql}"
fail() { printf '[FALHA] %s\n' "$1" >&2; failures=$((failures + 1)); }
failures=0
psql_test() { docker exec -i "$container_name" psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres "$@"; }

test_password='talkx_variants_test_only'
container_name="talkx-variants-$RANDOM$RANDOM"
cleanup() { if [[ "$container_name" =~ ^talkx-variants-[0-9]+$ ]]; then docker rm -f "$container_name" >/dev/null 2>&1 || true; fi; }
trap cleanup EXIT INT TERM

command -v docker >/dev/null 2>&1 || fail 'Docker nao esta instalado'
docker info >/dev/null 2>&1 || fail 'Docker daemon nao acessivel'
docker run --rm -d --name "$container_name" -e POSTGRES_PASSWORD="$test_password" ${POSTGRES_TEST_IMAGE:-postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a3278a52a7ec49117deedb300e552b24} >/dev/null

ready=false
for _ in $(seq 1 90); do
  markers="$(docker logs "$container_name" 2>&1 | grep -c 'database system is ready to accept connections' || true)"
  if [[ "$markers" -ge 2 ]] && docker exec "$container_name" psql -X -U postgres -d postgres -Atqc 'SELECT 1' >/dev/null 2>&1; then
    ready=true; break
  fi
  sleep 1
done
[[ "$ready" == true ]] || fail 'PostgreSQL 17 descartavel nao ficou pronto'

# ---- identificadores do teste ----
profile_owner='40000000-0000-0000-0000-000000000001'
user_owner='50000000-0000-0000-0000-000000000001'
profile_admin='40000000-0000-0000-0000-000000000002'
user_admin='50000000-0000-0000-0000-000000000002'
profile_other='40000000-0000-0000-0000-000000000003'
user_other='50000000-0000-0000-0000-000000000003'
template_id='60000000-0000-0000-0000-000000000001'
variant_id='70000000-0000-0000-0000-000000000001'
recipient_id='80000000-0000-0000-0000-000000000001'

# ---- fixtures minimos: auth, profiles, roles, tabelas talkx ----
psql_test >/dev/null <<'SQL'
CREATE SCHEMA auth;
GRANT USAGE ON SCHEMA auth TO PUBLIC;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.role', true), '')::text
$$;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
CREATE ROLE service_role NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE anon NOLOGIN;

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL,
  role text NOT NULL DEFAULT 'agent'
);

CREATE TABLE public.user_roles (
  user_id uuid NOT NULL,
  role text NOT NULL,
  PRIMARY KEY (user_id, role)
);

CREATE FUNCTION public.is_admin_or_supervisor(_user_id uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role IN ('admin', 'supervisor')
  )
$$;
GRANT EXECUTE ON FUNCTION public.is_admin_or_supervisor(uuid) TO authenticated, anon, service_role;

CREATE TABLE public.talkx_templates (
  id uuid PRIMARY KEY,
  name text NOT NULL,
  category text NOT NULL DEFAULT 'geral',
  content text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'draft',
  created_by uuid REFERENCES public.profiles(id),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.talkx_template_variants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES public.talkx_templates(id) ON DELETE CASCADE,
  label text NOT NULL CHECK (label IN ('A', 'B', 'C')),
  content text NOT NULL DEFAULT '',
  media_url text,
  media_type text,
  weight integer NOT NULL DEFAULT 100 CHECK (weight > 0 AND weight <= 100),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (template_id, label)
);

CREATE TABLE public.talkx_recipients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES public.talkx_templates(id) ON DELETE CASCADE,
  variant_id uuid REFERENCES public.talkx_template_variants(id) ON DELETE SET NULL,
  contact_id uuid,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- RLS ligado; a RPC e SECURITY DEFINER (roda como o dono), logo nao depende de policy no harness.
ALTER TABLE public.talkx_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.talkx_template_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.talkx_recipients ENABLE ROW LEVEL SECURITY;
SQL

# ---- criacao do owner, admin e outro usuario ----
psql_test >/dev/null <<SQL
INSERT INTO public.profiles (id, user_id, role) VALUES
  ('$profile_owner', '$user_owner', 'agent'),
  ('$profile_admin', '$user_admin', 'admin'),
  ('$profile_other', '$user_other', 'agent');
INSERT INTO public.user_roles (user_id, role) VALUES ('$user_admin', 'admin');
INSERT INTO public.talkx_templates (id, name, category, content, status, created_by)
VALUES ('$template_id', 'template teste', 'geral', 'conteudo original', 'approved', '$profile_owner');
SQL

# ---- aplicar a migration da funcao ----
[[ -f "$migration" ]] || fail "migration ausente: $migration"
psql_test < "$migration" >/dev/null || fail 'GREEN: a migration save_talkx_template_variants falhou ao aplicar'

# ---- helpers ----
call_rpc() { # $1=template $2=uid $3=expected_updated_at $4=variants json
  local sql
  sql="$(printf 'BEGIN; SET LOCAL ROLE authenticated; SET LOCAL request.jwt.claim.sub = %s; SET LOCAL request.jwt.claim.role = %s; SELECT public.save_talkx_template_variants(%s::uuid, %s, %s::jsonb); COMMIT;' \
    "'$2'" "'authenticated'" "'$1'" "$3" "'$4'")"
  psql_test -Atqc "$sql" || true
}
assert_ok()  { [[ "$1" == *'"ok": true'*  ]] || fail "$2: esperava ok=true (got: $1)"; }
assert_err() { [[ "$1" == *'"ok": false'* ]] || fail "$3: esperava ok=false (got: $1)"; [[ "$1" == *"$2"* ]] || fail "$3: esperava $2 (got: $1)"; }
variant_count() { psql_test -Atqc "SELECT COUNT(*) FROM public.talkx_template_variants WHERE template_id = '$template_id'"; }
expected_ts() { psql_test -Atqc "SELECT updated_at FROM public.talkx_templates WHERE id = '$template_id'"; }
expected_arg() { printf "'%s'::timestamptz" "$(expected_ts)"; }

# (a) authenticated tem EXECUTE
[[ "$(psql_test -Atqc "SELECT has_function_privilege('authenticated', 'public.save_talkx_template_variants(uuid, timestamptz, jsonb)', 'EXECUTE')")" == 't' ]] \
  || fail 'GREEN: authenticated deveria ter EXECUTE na RPC'

# (b) anon nao tem EXECUTE
[[ "$(psql_test -Atqc "SELECT has_function_privilege('anon', 'public.save_talkx_template_variants(uuid, timestamptz, jsonb)', 'EXECUTE')")" == 'f' ]] \
  || fail 'GREEN: anon nao deveria ter EXECUTE na RPC'

# (c) usuario sem permissao -> not_authorized
assert_err "$(call_rpc "$template_id" "$user_other" NULL '[{"label":"A","content":"conteudo","weight":100}]')" not_authorized 'usuario sem permissao'

# (d) template inexistente -> template_not_found
assert_err "$(call_rpc '00000000-0000-0000-0000-000000000099' "$user_owner" NULL '[{"label":"A","content":"conteudo","weight":100}]')" template_not_found 'template inexistente'

# (e) optimistic locking -> stale_template
psql_test -Atqc "UPDATE public.talkx_templates SET updated_at = '2020-01-01' WHERE id = '$template_id'" >/dev/null
assert_err "$(call_rpc "$template_id" "$user_owner" "'2019-01-01'::timestamptz" '[{"label":"A","content":"conteudo","weight":100}]')" stale_template 'updated_at divergido'
psql_test -Atqc "UPDATE public.talkx_templates SET updated_at = now() WHERE id = '$template_id'" >/dev/null

# (f) 0 variantes permitido
psql_test -Atqc "DELETE FROM public.talkx_template_variants WHERE template_id = '$template_id'" >/dev/null
r="$(call_rpc "$template_id" "$user_owner" "$(expected_arg)" '[]')"
assert_ok "$r" '0 variantes'
[[ "$(variant_count)" == 0 ]] || fail '0 variantes: esperava 0 linhas'

# (g) variante com destinatario nao pode ser removida
psql_test >/dev/null <<SQL
INSERT INTO public.talkx_template_variants (id, template_id, label, content, weight)
VALUES ('$variant_id', '$template_id', 'A', 'conteudo variante', 100);
INSERT INTO public.talkx_recipients (id, template_id, variant_id) VALUES ('$recipient_id', '$template_id', '$variant_id');
SQL
assert_err "$(call_rpc "$template_id" "$user_owner" "$(expected_arg)" '[]')" talkx_variant_in_use 'variante com destinatario'
psql_test >/dev/null <<SQL
DELETE FROM public.talkx_recipients WHERE id = '$recipient_id';
DELETE FROM public.talkx_template_variants WHERE id = '$variant_id';
SQL

# (h) pesos != 100
assert_err "$(call_rpc "$template_id" "$user_owner" "$(expected_arg)" '[{"label":"A","content":"conteudo","weight":50},{"label":"B","content":"","weight":40}]')" weights_must_sum_to_100 'peso != 100'

# (i) sem controle
assert_err "$(call_rpc "$template_id" "$user_owner" "$(expected_arg)" '[{"label":"A","content":"","weight":50},{"label":"B","content":"","weight":50}]')" exactly_one_variant_must_have_content 'conteudo vazio'

# (j) label invalido
assert_err "$(call_rpc "$template_id" "$user_owner" NULL '[{"label":"D","content":"conteudo","weight":50},{"label":"A","content":"","weight":50}]')" invalid_label 'label invalido'

# (k) label duplicado
assert_err "$(call_rpc "$template_id" "$user_owner" NULL '[{"label":"A","content":"conteudo A","weight":50},{"label":"A","content":"","weight":50}]')" duplicate_label 'label duplicado'

# (l) id inexistente -> variant_not_found
assert_err "$(call_rpc "$template_id" "$user_owner" NULL '[{"id":"00000000-0000-0000-0000-000000000099","label":"A","content":"conteudo","weight":50},{"label":"B","content":"","weight":50}]')" variant_not_found 'id inexistente'

# (p) sucesso: 2 variantes, um controle, soma 100
psql_test -Atqc "DELETE FROM public.talkx_template_variants WHERE template_id = '$template_id'" >/dev/null
r="$(call_rpc "$template_id" "$user_owner" "$(expected_arg)" '[{"label":"A","content":"conteudo A","weight":60},{"label":"B","content":"","weight":40}]')"
assert_ok "$r" 'sucesso 2 variantes'
[[ "$r" == *'"saved_count": 2'* ]] || fail "2 variantes: esperava saved_count 2 (got: $r)"
[[ "$(variant_count)" == 2 ]] || fail '2 variantes: esperava 2 linhas'
id_a="$(psql_test -Atqc "SELECT id FROM public.talkx_template_variants WHERE template_id = '$template_id' AND label = 'A'")"

# (q) sucesso: 3 variantes (atualiza A por id, cria B e C)
r="$(call_rpc "$template_id" "$user_owner" "$(expected_arg)" '[{"id":"'"$id_a"'","label":"A","content":"conteudo A v2","weight":40},{"label":"B","content":"","weight":30},{"label":"C","content":"","weight":30}]')"
assert_ok "$r" 'sucesso 3 variantes'
[[ "$r" == *'"saved_count": 3'* ]] || fail "3 variantes: esperava saved_count 3 (got: $r)"
[[ "$(variant_count)" == 3 ]] || fail '3 variantes: esperava 3 linhas'

# (r) id existente preservado com conteudo novo
r="$(call_rpc "$template_id" "$user_owner" "$(expected_arg)" '[{"id":"'"$id_a"'","label":"A","content":"conteudo A v3","weight":40},{"label":"B","content":"","weight":30},{"label":"C","content":"","weight":30}]')"
assert_ok "$r" 'id preservado'
[[ "$(variant_count)" == 3 ]] || fail 'id preservado: contagem mudou'
[[ "$(psql_test -Atqc "SELECT content FROM public.talkx_template_variants WHERE id = '$id_a'")" == 'conteudo A v3' ]] || fail 'id preservado: conteudo nao atualizado'
[[ "$(psql_test -Atqc "SELECT COUNT(*) FROM public.talkx_template_variants WHERE id = '$id_a'")" == 1 ]] || fail 'id preservado: id sumiu'

# (s) variante sem destinatario e removida (B e C saem, voltam como novos)
r="$(call_rpc "$template_id" "$user_owner" "$(expected_arg)" '[{"id":"'"$id_a"'","label":"A","content":"conteudo A v3","weight":60},{"label":"B","content":"","weight":40}]')"
assert_ok "$r" 'remocao sem destinatario'
[[ "$(variant_count)" == 2 ]] || fail 'remocao: esperava 2 linhas'
[[ "$(psql_test -Atqc "SELECT COUNT(*) FROM public.talkx_template_variants WHERE template_id = '$template_id' AND label = 'C'")" == 0 ]] || fail 'remocao: label C deveria sumir'
id_b="$(psql_test -Atqc "SELECT id FROM public.talkx_template_variants WHERE template_id = '$template_id' AND label = 'B'")"

# (t) id existente preservado com label trocado (A -> C), sem colisao
r="$(call_rpc "$template_id" "$user_owner" "$(expected_arg)" '[{"id":"'"$id_a"'","label":"C","content":"conteudo A v4","weight":60},{"id":"'"$id_b"'","label":"B","content":"","weight":40}]')"
assert_ok "$r" 'id preservado com label trocado'
[[ "$(psql_test -Atqc "SELECT label FROM public.talkx_template_variants WHERE id = '$id_a'")" == 'C' ]] || fail 'label trocado: id_a deveria estar em C'
[[ "$(psql_test -Atqc "SELECT label FROM public.talkx_template_variants WHERE id = '$id_b'")" == 'B' ]] || fail 'label trocado: id_b deveria seguir em B'
[[ "$(variant_count)" == 2 ]] || fail 'label trocado: esperava 2 linhas'

# (m) payload nao-array -> invalid_variants_payload
assert_err "$(call_rpc "$template_id" "$user_owner" NULL '{"a":1}')" invalid_variants_payload 'payload nao-array'

# (n) peso nulo / <= 0 -> invalid_weight
assert_err "$(call_rpc "$template_id" "$user_owner" NULL '[{"label":"A","content":"conteudo","weight":null},{"label":"B","content":"","weight":100}]')" invalid_weight 'peso nulo'
assert_err "$(call_rpc "$template_id" "$user_owner" NULL '[{"label":"A","content":"conteudo","weight":0},{"label":"B","content":"","weight":100}]')" invalid_weight 'peso zero'

# (o) id nao-uuid -> invalid_variant_id
assert_err "$(call_rpc "$template_id" "$user_owner" NULL '[{"id":"nao-uuid","label":"A","content":"conteudo","weight":50},{"label":"B","content":"","weight":50}]')" invalid_variant_id 'id nao-uuid'

# (v) peso gigante ou > 100 -> invalid_weight (sem excecao integer out of range)
assert_err "$(call_rpc "$template_id" "$user_owner" NULL '[{"label":"A","content":"conteudo","weight":99999999999},{"label":"B","content":"","weight":1}]')" invalid_weight 'peso gigante'
assert_err "$(call_rpc "$template_id" "$user_owner" NULL '[{"label":"A","content":"conteudo","weight":101},{"label":"B","content":"","weight":0}]')" invalid_weight 'peso > 100'

# (w) troca de label entre duas sobreviventes (A->B e B->A) -> label_conflict, sem unique_violation
psql_test -Atqc "DELETE FROM public.talkx_template_variants WHERE template_id = '$template_id'" >/dev/null
psql_test >/dev/null <<SQL
INSERT INTO public.talkx_template_variants (template_id, label, content, weight)
VALUES ('$template_id', 'A', 'conteudo A', 50),
       ('$template_id', 'B', '', 50);
SQL
swap_a="$(psql_test -Atqc "SELECT id FROM public.talkx_template_variants WHERE template_id = '$template_id' AND label = 'A'")"
swap_b="$(psql_test -Atqc "SELECT id FROM public.talkx_template_variants WHERE template_id = '$template_id' AND label = 'B'")"
assert_err "$(call_rpc "$template_id" "$user_owner" "$(expected_arg)" '[{"id":"'"$swap_a"'","label":"B","content":"conteudo A","weight":50},{"id":"'"$swap_b"'","label":"A","content":"","weight":50}]')" label_conflict 'troca A<->B'
[[ "$(variant_count)" == 2 ]] || fail 'troca A<->B: esperava 2 linhas intactas'
[[ "$(psql_test -Atqc "SELECT label FROM public.talkx_template_variants WHERE id = '$swap_a'")" == 'A' ]] || fail 'troca A<->B: id_a deveria seguir em A'
[[ "$(psql_test -Atqc "SELECT label FROM public.talkx_template_variants WHERE id = '$swap_b'")" == 'B' ]] || fail 'troca A<->B: id_b deveria seguir em B'

# (u) destinatario sem variante (variant_id NULL) nao bloqueia salvar []
psql_test >/dev/null <<SQL
INSERT INTO public.talkx_recipients (id, template_id, variant_id) VALUES ('80000000-0000-0000-0000-000000000002', '$template_id', NULL);
SQL
r="$(call_rpc "$template_id" "$user_owner" "$(expected_arg)" '[]')"
assert_ok "$r" 'destinatario sem variante + []'
[[ "$(variant_count)" == 0 ]] || fail 'destinatario sem variante: esperava 0 linhas'
psql_test -Atqc "DELETE FROM public.talkx_recipients WHERE template_id = '$template_id'" >/dev/null

if [[ "$failures" -eq 0 ]]; then
  printf '[OK] save_talkx_template_variants: todas as provas GREEN passaram\n'
else
  printf '[FALHA] save_talkx_template_variants: %s prova(s) falharam\n' "$failures" >&2
  exit 1
fi
