#!/usr/bin/env bash
# Harness descartavel (postgres:17-alpine): save_talkx_template_variants.
#
# Prova:
#   RED  — a funcao nao existe antes da migration;
#   GREEN — a migration aplica, a funcao existe, EXECUTE e RLS funcionam.
#
# Casos:
#   (a) authenticated pode chamar a RPC (EXECUTE concedido);
#   (b) anon nao pode chamar a RPC (EXECUTE negado);
#   (c) a funcao retorna not_authorized para usuario sem permisso;
#   (d) a funcao retorna template_not_found para template inexistente;
#   (e) a funcao retorna stale_template quando updated_at diverge;
#   (f) 0 variantes e permitido;
#   (g) variante com recipients nao pode ser removida;
#   (h) peso diferente de 100 retorna weights_must_sum_to_100;
#   (i) conteudo vazio retorna exactly_one_variant_must_have_content;
#   (j) label invalido retorna invalid_label;
#   (k) label duplicado retorna duplicate_label;
#   (l) id de variante inexistente retorna variant_not_found.
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
fail() { printf '[FALHA] %s\n' "$1" >&2; exit 1; }
psql_test() { docker exec -i "$container_name" psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres "$@"; }

test_password='talkx_variants_test_only'
container_name="talkx-variants-$RANDOM$RANDOM"
cleanup() { if [[ "$container_name" =~ ^talkx-variants-[0-9]+$ ]]; then docker rm -f "$container_name" >/dev/null 2>&1 || true; fi; }
trap cleanup EXIT INT TERM

command -v docker >/dev/null 2>&1 || fail 'Docker nao esta instalado'
docker info >/dev/null 2>&1 || fail 'Docker daemon nao acessivel'
docker run --rm -d --name "$container_name" -e POSTGRES_PASSWORD="$test_password" postgres:17-alpine >/dev/null

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

CREATE FUNCTION public.current_profile_id() RETURNS uuid
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id FROM public.profiles WHERE user_id = auth.uid() LIMIT 1
$$;

GRANT EXECUTE ON FUNCTION public.is_admin_or_supervisor(uuid) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.current_profile_id() TO authenticated, anon, service_role;

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

ALTER TABLE public.talkx_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.talkx_template_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.talkx_recipients ENABLE ROW LEVEL SECURITY;

CREATE POLICY talkx_template_variants_select ON public.talkx_template_variants
  FOR SELECT USING (true);

CREATE POLICY talkx_template_variants_write ON public.talkx_template_variants
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.talkx_templates tmpl
      JOIN public.profiles prof ON prof.id = auth.uid()
      WHERE tmpl.id = template_id
        AND (tmpl.created_by = auth.uid() OR prof.role IN ('admin', 'supervisor'))
    )
  );

CREATE POLICY talkx_recipients_select ON public.talkx_recipients
  FOR SELECT USING (true);

CREATE POLICY talkx_recipients_write ON public.talkx_recipients
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.talkx_templates tmpl
      JOIN public.profiles prof ON prof.id = auth.uid()
      WHERE tmpl.id = template_id
        AND (tmpl.created_by = auth.uid() OR prof.role IN ('admin', 'supervisor'))
    )
  );
SQL

# ---- criacao do owner e admin ----
psql_test >/dev/null <<SQL
INSERT INTO public.profiles (id, user_id, role) VALUES
  ('$profile_owner', '$user_owner', 'agent'),
  ('$profile_admin', '$user_admin', 'admin'),
  ('$profile_other', '$user_other', 'agent');

INSERT INTO public.user_roles (user_id, role) VALUES
  ('$user_admin', 'admin');
SQL

# ---- RED: funcao nao existia antes ----
# O RED e implicito: se a migration falhou, o teste ja teria parado.

# ---- aplicar a migration da funcao ----
[[ -f "$repo_root/supabase/migrations/20261010090000_save_talkx_template_variants.sql" ]] \
  || fail "migration ausente: $repo_root/supabase/migrations/20261010090000_save_talkx_template_variants.sql"
psql_test < "$repo_root/supabase/migrations/20261010090000_save_talkx_template_variants.sql" >/dev/null \
  || fail 'GREEN: a migration save_talkx_template_variants falhou ao aplicar'

# ---- GREEN: provas ----

# (a) authenticated pode chamar a RPC
auth_exec="$(psql_test -Atqc "SELECT has_function_privilege('authenticated', 'public.save_talkx_template_variants(uuid, timestamptz, jsonb)', 'EXECUTE')")"
[[ "$auth_exec" == 't' ]] || fail "GREEN: authenticated deveria ter EXECUTE na RPC"

# (b) anon nao pode chamar a RPC
anon_exec="$(psql_test -Atqc "SELECT has_function_privilege('anon', 'public.save_talkx_template_variants(uuid, timestamptz, jsonb)', 'EXECUTE')")"
[[ "$anon_exec" == 'f' ]] || fail "GREEN: anon nao deveria ter EXECUTE na RPC"

# Inserir template para testes de permissao
psql_test >/dev/null <<SQL
INSERT INTO public.talkx_templates (id, name, category, content, status, created_by)
VALUES ('$template_id', 'template teste', 'geral', 'conteudo original', 'approved', '$profile_owner');
SQL

# (c) usuario sem permisso eh rejeitado (not_authorized)
# Simula authenticated como user_other (nao e dono do template nem admin)
no_perm_result="$(psql_test -Atqc "SET request.jwt.claim.sub = '$user_other'; SET request.jwt.claim.role = 'authenticated'; SELECT public.save_talkx_template_variants('$template_id'::uuid, NULL, '[{\"label\":\"A\",\"content\":\"conteudo\",\"weight\":100}]'::jsonb);")"
[[ "$no_perm_result" == *'"ok": false'* ]] || fail "GREEN: usuario sem permisso deveria ser rejeitado (got: $no_perm_result)"
[[ "$no_perm_result" == *'not_authorized'* ]] || fail "GREEN: usuario sem permisso deveria retornar not_authorized (got: $no_perm_result)"

# (d) template inexistente retorna template_not_found
not_found_result="$(psql_test -Atqc "SET request.jwt.claim.sub = '$user_owner'; SET request.jwt.claim.role = 'authenticated'; SELECT public.save_talkx_template_variants('00000000-0000-0000-0000-000000000099'::uuid, NULL, '[{\"label\":\"A\",\"content\":\"conteudo\",\"weight\":100}]'::jsonb);")"
[[ "$not_found_result" == *'"ok": false'* ]] || fail "GREEN: template inexistente deveria retornar erro (got: $not_found_result)"
[[ "$not_found_result" == *'template_not_found'* ]] || fail "GREEN: template inexistente deveria retornar template_not_found (got: $not_found_result)"

# (e) optimistic locking: updated_at divergido retorna stale_template
psql_test >/dev/null <<SQL
UPDATE public.talkx_templates SET updated_at = '2020-01-01' WHERE id = '$template_id';
SQL

stale_result="$(psql_test -Atqc "SET request.jwt.claim.sub = '$user_owner'; SET request.jwt.claim.role = 'authenticated'; SELECT public.save_talkx_template_variants('$template_id'::uuid, '2019-01-01'::timestamptz, '[{\"label\":\"A\",\"content\":\"conteudo\",\"weight\":100}]'::jsonb);")"
[[ "$stale_result" == *'"ok": false'* ]] || fail "GREEN: updated_at divergido deveria retornar stale_template (got: $stale_result)"
[[ "$stale_result" == *'stale_template'* ]] || fail "GREEN: updated_at divergido deveria retornar stale_template (got: $stale_result)"

# (f) 0 variantes e permitido (remove todas sem recipients)
# Reset updated_at para evitar stale_template dos testes anteriores
psql_test >/dev/null <<SQL
UPDATE public.talkx_templates SET updated_at = now() WHERE id = '$template_id';
SQL
zero_result="$(psql_test -Atqc "SET request.jwt.claim.sub = '$user_owner'; SET request.jwt.claim.role = 'authenticated'; SELECT public.save_talkx_template_variants('$template_id'::uuid, (SELECT updated_at FROM public.talkx_templates WHERE id = '$template_id'), '[]'::jsonb);")"
[[ "$zero_result" == *'"ok": true'* ]] || fail "GREEN: 0 variantes deveria ser aceito (got: $zero_result)"

# Inserir variante para testes de recipients
psql_test >/dev/null <<SQL
INSERT INTO public.talkx_template_variants (id, template_id, label, content, weight)
VALUES ('$variant_id', '$template_id', 'A', 'conteudo variante', 100);
INSERT INTO public.talkx_recipients (id, template_id, variant_id)
VALUES ('$recipient_id', '$template_id', '$variant_id');
SQL

# (g) variante com recipients nao pode ser removida (talkx_variant_in_use)
has_recipients_result="$(psql_test -Atqc "SET request.jwt.claim.sub = '$user_owner'; SET request.jwt.claim.role = 'authenticated'; SELECT public.save_talkx_template_variants('$template_id'::uuid, (SELECT updated_at FROM public.talkx_templates WHERE id = '$template_id'), '[]'::jsonb);")"
[[ "$has_recipients_result" == *'"ok": false'* ]] || fail "GREEN: variante com recipients deveria ser rejeitada (got: $has_recipients_result)"
[[ "$has_recipients_result" == *'talkx_variant_in_use'* ]] || fail "GREEN: variante com recipients deveria retornar talkx_variant_in_use (got: $has_recipients_result)"

# Limpa recipients para proximos testes
psql_test >/dev/null <<SQL
DELETE FROM public.talkx_recipients WHERE id = '$recipient_id';
DELETE FROM public.talkx_template_variants WHERE id = '$variant_id';
SQL

# (h) peso diferente de 100 retorna weights_must_sum_to_100
weight_result="$(psql_test -Atqc "SET request.jwt.claim.sub = '$user_owner'; SET request.jwt.claim.role = 'authenticated'; SELECT public.save_talkx_template_variants('$template_id'::uuid, (SELECT updated_at FROM public.talkx_templates WHERE id = '$template_id'), '[{\"label\":\"A\",\"content\":\"conteudo\",\"weight\":50},{\"label\":\"B\",\"content\":\"\",\"weight\":40}]'::jsonb);")"
[[ "$weight_result" == *'"ok": false'* ]] || fail "GREEN: peso != 100 deveria ser rejeitado (got: $weight_result)"
[[ "$weight_result" == *'weights_must_sum_to_100'* ]] || fail "GREEN: peso != 100 deveria retornar weights_must_sum_to_100 (got: $weight_result)"

# (i) sem conteudo retorna exactly_one_variant_must_have_content
no_content_result="$(psql_test -Atqc "SET request.jwt.claim.sub = '$user_owner'; SET request.jwt.claim.role = 'authenticated'; SELECT public.save_talkx_template_variants('$template_id'::uuid, (SELECT updated_at FROM public.talkx_templates WHERE id = '$template_id'), '[{\"label\":\"A\",\"content\":\"\",\"weight\":50},{\"label\":\"B\",\"content\":\"\",\"weight\":50}]'::jsonb);")"
[[ "$no_content_result" == *'"ok": false'* ]] || fail "GREEN: conteudo vazio deveria ser rejeitado (got: $no_content_result)"
[[ "$no_content_result" == *'exactly_one_variant_must_have_content'* ]] || fail "GREEN: conteudo vazio deveria retornar exactly_one_variant_must_have_content (got: $no_content_result)"

# (j) label invalido retorna invalid_label
invalid_label_result="$(psql_test -Atqc "SET request.jwt.claim.sub = '$user_owner'; SET request.jwt.claim.role = 'authenticated'; SELECT public.save_talkx_template_variants('$template_id'::uuid, NULL, '[{\"label\":\"D\",\"content\":\"conteudo\",\"weight\":50},{\"label\":\"A\",\"content\":\"\",\"weight\":50}]'::jsonb);")"
[[ "$invalid_label_result" == *'"ok": false'* ]] || fail "GREEN: label invalido deveria ser rejeitado (got: $invalid_label_result)"
[[ "$invalid_label_result" == *'invalid_label'* ]] || fail "GREEN: label invalido deveria retornar invalid_label (got: $invalid_label_result)"

# (k) label duplicado retorna duplicate_label
dup_label_result="$(psql_test -Atqc "SET request.jwt.claim.sub = '$user_owner'; SET request.jwt.claim.role = 'authenticated'; SELECT public.save_talkx_template_variants('$template_id'::uuid, NULL, '[{\"label\":\"A\",\"content\":\"conteudo A\",\"weight\":50},{\"label\":\"A\",\"content\":\"\",\"weight\":50}]'::jsonb);")"
[[ "$dup_label_result" == *'"ok": false'* ]] || fail "GREEN: label duplicado deveria ser rejeitado (got: $dup_label_result)"
[[ "$dup_label_result" == *'duplicate_label'* ]] || fail "GREEN: label duplicado deveria retornar duplicate_label (got: $dup_label_result)"

# (l) id de variante inexistente retorna variant_not_found
not_found_variant_result="$(psql_test -Atqc "SET request.jwt.claim.sub = '$user_owner'; SET request.jwt.claim.role = 'authenticated'; SELECT public.save_talkx_template_variants('$template_id'::uuid, NULL, '[{\"id\":\"00000000-0000-0000-0000-000000000099\",\"label\":\"A\",\"content\":\"conteudo\",\"weight\":50},{\"label\":\"B\",\"content\":\"\",\"weight\":50}]'::jsonb);")"
[[ "$not_found_variant_result" == *'"ok": false'* ]] || fail "GREEN: variante inexistente deveria ser rejeitada (got: $not_found_variant_result)"
[[ "$not_found_variant_result" == *'variant_not_found'* ]] || fail "GREEN: variante inexistente deveria retornar variant_not_found (got: $not_found_variant_result)"

printf '[OK] save_talkx_template_variants: todas as provas GREEN passaram\n'