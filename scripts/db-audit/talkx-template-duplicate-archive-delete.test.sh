#!/usr/bin/env bash
# Harness descartável (Docker postgres:17-alpine) — N-127.
#
# Prova, em PostgreSQL 17, o delta do cartão N-127 (duplicar / arquivar /
# excluir template do Talk X) e a correção do portão de saída:
#   RED (antes da migration):
#     - talkx_templates.archived_at NÃO existe;
#     - duplicate_talkx_template NÃO existe;
#     - DELETE direto na tabela (como o dono, via RLS de DELETE) APAGA um template
#       usado em campanha — o buraco que o portão apontou.
#   GREEN (depois da migration):
#     - duplicate_talkx_template copia conteúdo e variantes A/B como rascunho
#       próprio (created_by = chamador, status 'draft', archived_at NULL);
#     - duplicar template alheio sem ser admin/supervisor -> not_authorized;
#     - admin/supervisor duplica template alheio;
#     - archive_talkx_template grava/limpa archived_at e PRESERVA updated_at
#       (a trava otimista da edição não é invalidada por metadado);
#     - DELETE direto de template em campanha -> talkx_template_in_use (trigger
#       BEFORE DELETE), enquanto DELETE direto sem campanha passa;
#     - service_role segue podendo apagar (porta do guard);
#     - delete_talkx_template RPC recusa em campanha e apaga template livre;
#     - guard de UPDATE continua barrando mudança de conteúdo sem snapshot (42501)
#       e libera mudança que toca SOMENTE archived_at;
#     - ACL negar-por-padrão: EXECUTE só para authenticated;
#     - reaplicar a migration não duplica o trigger.
#
# A migration é encontrada pelo marcador interno 'talkx_n127_duplicate_archive_delete'
# (sobrevive ao rename do hermes-db-migrar --nova); fallback para .tmp/n127.sql.
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

migration="$(grep -rlF 'talkx_n127_duplicate_archive_delete' "$repo_root/supabase/migrations" 2>/dev/null | grep -v '/_superseded/' | sort | tail -1 || true)"
if [[ -z "$migration" ]]; then
  migration="$repo_root/.tmp/n127.sql"
fi
[[ -f "$migration" ]] || { printf '[FALHA] migration N-127 nao encontrada (marcador talkx_n127_duplicate_archive_delete)\n' >&2; exit 1; }

fail() { printf '[FALHA] %s\n' "$1" >&2; exit 1; }
pass() { printf '[PASS] %s\n' "$1"; }

cid="talkx-n127-$RANDOM$RANDOM"
cleanup() {
  if [[ "$cid" =~ ^talkx-n127-[0-9]+$ ]]; then
    docker rm -f "$cid" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT INT TERM

psql_exec() { docker exec -i "$cid" psql -X -q -v ON_ERROR_STOP=1 -U postgres -d postgres "$@"; }
psql_raw() { docker exec "$cid" psql -X -Atq -v ON_ERROR_STOP=0 -U postgres -d postgres -c "$1" 2>&1 || true; }
psql_val() { docker exec "$cid" psql -X -Atq -v ON_ERROR_STOP=1 -U postgres -d postgres -c "$1" 2>&1; }
psql_script() { docker exec -i "$cid" psql -X -Atq -v ON_ERROR_STOP=0 -U postgres -d postgres 2>&1 || true; }

assert_eq() {
  local label="$1" expected="$2" actual="$3"
  [[ "$actual" == "$expected" ]] || fail "$label: esperado '$expected', obtido '$actual'"
  pass "$label (= $actual)"
}
assert_has() {
  local label="$1" pattern="$2" actual="$3"
  [[ "$actual" == *"$pattern"* ]] || fail "$label: esperado conter '$pattern', obtido -> $actual"
  pass "$label ($pattern)"
}
assert_not_has() {
  local label="$1" pattern="$2" actual="$3"
  [[ "$actual" != *"$pattern"* ]] || fail "$label: NÃO deveria conter '$pattern' -> $actual"
  pass "$label (sem '$pattern')"
}

command -v docker >/dev/null 2>&1 || fail 'Docker nao esta instalado'
docker info >/dev/null 2>&1 || fail 'Docker daemon nao acessivel'
pg_image="${TALKX_N127_TEST_POSTGRES_IMAGE:-postgres:17-alpine}"
docker run --rm -d --name "$cid" -e POSTGRES_PASSWORD=talkx_n127_test_only "$pg_image" >/dev/null

ready=false
for _ in $(seq 1 90); do
  markers="$(docker logs "$cid" 2>&1 | grep -c 'database system is ready to accept connections' || true)"
  if [[ "$markers" -ge 2 ]] && docker exec "$cid" psql -X -U postgres -d postgres -Atqc 'SELECT 1' >/dev/null 2>&1; then
    ready=true; break
  fi
  sleep 1
done
[[ "$ready" == true ]] || fail 'PostgreSQL 17 descartavel nao ficou pronto'

# ── identificadores ───────────────────────────────────────────────────────────
user_owner='50000000-0000-0000-0000-0000000000a1'
profile_owner='40000000-0000-0000-0000-0000000000a1'
user_other='50000000-0000-0000-0000-0000000000b1'
profile_other='40000000-0000-0000-0000-0000000000b1'
user_admin='50000000-0000-0000-0000-0000000000c1'
profile_admin='40000000-0000-0000-0000-0000000000c1'
t_src='70000000-0000-0000-0000-000000000001'
t_used='70000000-0000-0000-0000-000000000002'
t_bypass='70000000-0000-0000-0000-000000000003'
t_unused='70000000-0000-0000-0000-000000000004'
t_svc='70000000-0000-0000-0000-000000000005'
t_rpc_unused='70000000-0000-0000-0000-000000000006'
c_used='20000000-0000-0000-0000-000000000001'
c_bypass='20000000-0000-0000-0000-000000000002'
c_svc='20000000-0000-0000-0000-000000000003'

# ── fixtures mínimos (o suficiente para o delta do N-127 rodar) ───────────────
psql_exec >/dev/null <<'SQL'
CREATE SCHEMA auth;
GRANT USAGE ON SCHEMA auth TO PUBLIC;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.role', true), '')::text $$;
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;
GRANT USAGE ON SCHEMA public, auth TO anon, authenticated, service_role;

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL,
  is_active boolean NOT NULL DEFAULT true
);

-- Stub de conveniência: admin é quem está nesta tabela (o papel em si já é
-- coberto por outro cartão). O teste controla quem é admin para provar as duas
-- pontas (admin duplica; não-admin não duplica).
CREATE TABLE public.talkx_admin_users (user_id uuid PRIMARY KEY);
CREATE FUNCTION public.is_admin_or_supervisor(_uid uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (SELECT 1 FROM public.talkx_admin_users WHERE user_id = _uid) $$;
GRANT EXECUTE ON FUNCTION public.is_admin_or_supervisor(uuid) TO authenticated;

CREATE FUNCTION public.get_profile_id_for_user(_uid uuid) RETURNS uuid
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT p.id FROM public.profiles p WHERE p.user_id = _uid AND p.is_active LIMIT 1 $$;
GRANT EXECUTE ON FUNCTION public.get_profile_id_for_user(uuid) TO authenticated;

-- Espelha as colunas vivas de talkx_templates, SEM archived_at (adicionada pelo N-127).
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
  custom_variables text[] NOT NULL DEFAULT '{}'::text[],
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.talkx_template_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid,
  name text,
  description text,
  category text,
  content text,
  media_url text,
  media_type text,
  tags text[],
  status text,
  custom_variables text[],
  saved_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.talkx_template_variants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL,
  label text,
  content text,
  media_url text,
  media_type text,
  weight integer NOT NULL DEFAULT 1
);

CREATE TABLE public.talkx_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid REFERENCES public.talkx_templates(id) ON DELETE SET NULL,
  created_by uuid
);

-- Guard de UPDATE no corpo ANTERIOR ao N-127 (sem archived_at): bloqueava
-- qualquer UPDATE sem snapshot autorizado.
CREATE FUNCTION public.guard_talkx_template_update() RETURNS trigger
  LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $function$
BEGIN
  IF current_user = 'service_role'::name THEN RETURN NEW; END IF;
  IF NEW.id IS NOT DISTINCT FROM OLD.id
     AND NEW.name IS NOT DISTINCT FROM OLD.name AND NEW.description IS NOT DISTINCT FROM OLD.description
     AND NEW.category IS NOT DISTINCT FROM OLD.category AND NEW.content IS NOT DISTINCT FROM OLD.content
     AND NEW.media_url IS NOT DISTINCT FROM OLD.media_url AND NEW.media_type IS NOT DISTINCT FROM OLD.media_type
     AND NEW.tags IS NOT DISTINCT FROM OLD.tags AND NEW.status IS NOT DISTINCT FROM OLD.status
     AND NEW.custom_variables IS NOT DISTINCT FROM OLD.custom_variables AND NEW.created_by IS NOT DISTINCT FROM OLD.created_by
     AND NEW.created_at IS NOT DISTINCT FROM OLD.created_at AND NEW.updated_at IS NOT DISTINCT FROM OLD.updated_at
     AND NEW.use_count = OLD.use_count + 1 THEN RETURN NEW; END IF;
  IF NEW.id IS NOT DISTINCT FROM OLD.id AND NEW.created_by IS NOT DISTINCT FROM OLD.created_by
     AND NEW.created_at IS NOT DISTINCT FROM OLD.created_at AND NEW.use_count IS NOT DISTINCT FROM OLD.use_count
     AND EXISTS (SELECT 1 FROM public.talkx_template_versions AS history WHERE history.template_id = OLD.id
       AND history.created_at = statement_timestamp()
       AND history.saved_by = public.get_profile_id_for_user(auth.uid())) THEN RETURN NEW; END IF;
  RAISE EXCEPTION 'talkx_template_update_requires_authorized_rpc' USING ERRCODE = '42501';
END; $function$;
CREATE TRIGGER trg_guard_talkx_template_update BEFORE UPDATE ON public.talkx_templates
  FOR EACH ROW EXECUTE FUNCTION public.guard_talkx_template_update();

-- Trigger de updated_at no corpo ANTERIOR (sempre regrava).
CREATE FUNCTION public.set_talkx_template_updated_at() RETURNS trigger
  LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $function$
BEGIN
  NEW.updated_at := transaction_timestamp();
  RETURN NEW;
END; $function$;
CREATE TRIGGER update_talkx_templates_updated_at BEFORE UPDATE ON public.talkx_templates
  FOR EACH ROW EXECUTE FUNCTION public.set_talkx_template_updated_at();

ALTER TABLE public.talkx_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "talkx_templates_select" ON public.talkx_templates FOR SELECT TO authenticated
  USING (auth.uid() IS NOT NULL);
CREATE POLICY "talkx_templates_delete" ON public.talkx_templates FOR DELETE TO authenticated
  USING (created_by = (SELECT p.id FROM public.profiles p WHERE p.user_id = auth.uid() LIMIT 1)
         OR public.is_admin_or_supervisor(auth.uid()));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.talkx_templates TO authenticated;
-- service_role é bypass (RLS) mas precisa de privilégio na tabela, como no runtime.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.talkx_templates TO service_role;
GRANT SELECT ON public.profiles, public.talkx_campaigns, public.talkx_template_variants TO authenticated;

ALTER TABLE public.talkx_template_variants ENABLE ROW LEVEL SECURITY;
CREATE POLICY "talkx_template_variants_select" ON public.talkx_template_variants FOR SELECT TO authenticated
  USING (auth.uid() IS NOT NULL);
SQL

psql_exec >/dev/null <<SQL
INSERT INTO public.profiles (id, user_id, is_active) VALUES
  ('$profile_owner', '$user_owner', true),
  ('$profile_other', '$user_other', true),
  ('$profile_admin', '$user_admin', true);
INSERT INTO public.talkx_admin_users (user_id) VALUES ('$user_admin');

INSERT INTO public.talkx_templates (id, name, description, category, content, media_url, media_type, tags, status, use_count, custom_variables, created_by)
  VALUES ('$t_src', 'Template N127', 'descricao', 'geral', 'Ola {{nome}}',
          'https://cdn.example.com/a.png', 'image', '{promo}', 'approved', 0, '{cidade}', '$profile_owner');
INSERT INTO public.talkx_template_variants (template_id, label, content, media_url, media_type, weight) VALUES
  ('$t_src', 'A', 'Ola A', 'https://cdn.example.com/a.png', 'image', 1),
  ('$t_src', 'B', 'Ola B', NULL, NULL, 1);

INSERT INTO public.talkx_templates (id, name, content, status, created_by) VALUES
  ('$t_used', 'Usado', 'x', 'approved', '$profile_owner'),
  ('$t_bypass', 'Bypass', 'x', 'approved', '$profile_owner'),
  ('$t_unused', 'Livre', 'x', 'approved', '$profile_owner'),
  ('$t_svc', 'Servico', 'x', 'approved', '$profile_owner'),
  ('$t_rpc_unused', 'Livre RPC', 'x', 'approved', '$profile_owner');

INSERT INTO public.talkx_campaigns (id, template_id, created_by) VALUES
  ('$c_used', '$t_used', '$profile_owner'),
  ('$c_bypass', '$t_bypass', '$profile_owner'),
  ('$c_svc', '$t_svc', '$profile_owner');
SQL

# ═════════════════════════════════════════════════════════════════════════════
# RED — o estado antes da migration reproduz as lacunas do N-127
# ═════════════════════════════════════════════════════════════════════════════
red_col="$(psql_raw "SELECT archived_at FROM public.talkx_templates LIMIT 1")"
assert_has 'RED: archived_at nao existe antes da N-127' 'does not exist' "$red_col"

red_rpc="$(psql_val "SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname = 'duplicate_talkx_template'")"
assert_eq 'RED: duplicate_talkx_template nao existe antes da N-127' '0' "$red_rpc"

red_del="$(psql_script <<SQL
BEGIN;
SET LOCAL role authenticated;
SET LOCAL request.jwt.claim.role = 'authenticated';
SET LOCAL request.jwt.claim.sub = '$user_owner';
DELETE FROM public.talkx_templates WHERE id = '$t_bypass';
COMMIT;
SQL
)"
red_gone="$(psql_val "SELECT count(*) FROM public.talkx_templates WHERE id = '$t_bypass'")"
assert_eq 'RED: DELETE direto apagava template usado em campanha (buraco do portao)' '0' "$red_gone"

# Restaura o template apagado no RED (e o vínculo da campanha) para o GREEN.
psql_exec >/dev/null <<SQL
INSERT INTO public.talkx_templates (id, name, content, status, created_by)
  VALUES ('$t_bypass', 'Bypass', 'x', 'approved', '$profile_owner');
UPDATE public.talkx_campaigns SET template_id = '$t_bypass' WHERE id = '$c_bypass';
SQL

# ═════════════════════════════════════════════════════════════════════════════
# GREEN — aplica a migration N-127
# ═════════════════════════════════════════════════════════════════════════════
psql_exec < "$migration" >/dev/null || fail 'migration N-127 nao aplicou (GREEN)'
pass "migration N-127 aplicada ($(basename "$migration"))"

# ── 1) duplicated: copia conteudo e variantes como rascunho proprio ──────────
dup_out="$(psql_script <<SQL
BEGIN;
SET LOCAL role authenticated;
SET LOCAL request.jwt.claim.role = 'authenticated';
SET LOCAL request.jwt.claim.sub = '$user_owner';
WITH r AS (SELECT public.duplicate_talkx_template('$t_src') AS j)
SELECT (j->>'ok') || '|' || COALESCE(j->>'template_id', '') || '|' || COALESCE(j->>'variants_copied', '') FROM r;
COMMIT;
SQL
)"
dup_line="$(printf '%s\n' "$dup_out" | grep -E '^true\|[0-9a-f-]{36}\|' | tail -1 || true)"
[[ -n "$dup_line" ]] || fail "GREEN: duplicate nao devolveu linha valida -> $dup_out"
IFS='|' read -r dup_ok dup_id dup_variants <<< "$dup_line"
[[ "$dup_id" =~ ^[0-9a-f-]{36}$ ]] || fail "GREEN: duplicate nao devolveu id valido (got '$dup_line')"
assert_eq 'GREEN: duplicar devolve ok=true' 'true' "$dup_ok"
assert_eq 'GREEN: duplicar copia as 2 variantes A/B' '2' "$dup_variants"
dup_row="$(psql_val "SELECT name || '|' || category || '|' || content || '|' || COALESCE(media_type, 'NULL') || '|' || status || '|' || COALESCE(archived_at::text, 'NULL') || '|' || array_to_string(custom_variables, ',') || '|' || created_by::text FROM public.talkx_templates WHERE id = '$dup_id'")"
assert_eq 'GREEN: copia conteudo/status draft/ativa e vira do dono' "Template N127 (cópia)|geral|Ola {{nome}}|image|draft|NULL|cidade|$profile_owner" "$dup_row"
dup_src_alive="$(psql_val "SELECT count(*) FROM public.talkx_templates WHERE id = '$t_src'")"
assert_eq 'GREEN: duplicar preserva o template de origem' '1' "$dup_src_alive"

# ── 2) visibilidade: template alheio sem ser admin -> not_authorized ─────────
dup_deny="$(psql_script <<SQL
BEGIN;
SET LOCAL role authenticated;
SET LOCAL request.jwt.claim.role = 'authenticated';
SET LOCAL request.jwt.claim.sub = '$user_other';
WITH r AS (SELECT public.duplicate_talkx_template('$t_src') AS j)
SELECT (j->>'ok') || '|' || COALESCE(j->>'error', '') FROM r;
COMMIT;
SQL
)"
assert_has 'GREEN: duplicar template alheio sem admin -> false|not_authorized' 'false|not_authorized' "$dup_deny"
dup_deny_count="$(psql_val "SELECT count(*) FROM public.talkx_templates WHERE created_by = '$profile_other'")"
assert_eq 'GREEN: template alheio nao foi copiado' '0' "$dup_deny_count"

# ── 3) admin/supervisor duplica template alheio ──────────────────────────────
dup_admin="$(psql_script <<SQL
BEGIN;
SET LOCAL role authenticated;
SET LOCAL request.jwt.claim.role = 'authenticated';
SET LOCAL request.jwt.claim.sub = '$user_admin';
WITH r AS (SELECT public.duplicate_talkx_template('$t_src') AS j)
SELECT (j->>'ok') FROM r;
COMMIT;
SQL
)"
assert_has 'GREEN: admin duplica template alheio -> true' 'true' "$dup_admin"

# ── 4) arquivar: grava archived_at, sai da lista ativa, PRESERVA updated_at ──
before_updated="$(psql_val "SELECT updated_at::text FROM public.talkx_templates WHERE id = '$t_src'")"
arch="$(psql_script <<SQL
BEGIN;
SET LOCAL role authenticated;
SET LOCAL request.jwt.claim.role = 'authenticated';
SET LOCAL request.jwt.claim.sub = '$user_owner';
SELECT public.archive_talkx_template('$t_src', true)::text;
COMMIT;
SQL
)"
assert_has 'GREEN: archive_talkx_template(true) -> ok' '"ok": true' "$arch"
arch_at="$(psql_val "SELECT COALESCE(archived_at::text, 'NULL') FROM public.talkx_templates WHERE id = '$t_src'")"
[[ "$arch_at" != 'NULL' ]] || fail 'GREEN: archived_at nao foi gravado'
pass "GREEN: archived_at gravado ($arch_at)"
after_updated="$(psql_val "SELECT updated_at::text FROM public.talkx_templates WHERE id = '$t_src'")"
assert_eq 'GREEN: arquivar PRESERVA updated_at (trava de edicao intacta)' "$before_updated" "$after_updated"
active="$(psql_val "SELECT count(*) FROM public.talkx_templates WHERE id = '$t_src' AND archived_at IS NULL")"
assert_eq 'GREEN: template arquivado sai da lista ativa (archived_at IS NULL)' '0' "$active"
content_kept="$(psql_val "SELECT content FROM public.talkx_templates WHERE id = '$t_src'")"
assert_eq 'GREEN: arquivar nao apaga o conteudo' 'Ola {{nome}}' "$content_kept"

# ── 5) desarquivar: limpa archived_at ────────────────────────────────────────
unarch="$(psql_script <<SQL
BEGIN;
SET LOCAL role authenticated;
SET LOCAL request.jwt.claim.role = 'authenticated';
SET LOCAL request.jwt.claim.sub = '$user_owner';
SELECT public.archive_talkx_template('$t_src', false)::text;
COMMIT;
SQL
)"
assert_has 'GREEN: archive_talkx_template(false) -> ok' '"ok": true' "$unarch"
arch_at2="$(psql_val "SELECT COALESCE(archived_at::text, 'NULL') FROM public.talkx_templates WHERE id = '$t_src'")"
assert_eq 'GREEN: desarquivar limpa archived_at' 'NULL' "$arch_at2"

# ── 6) DELETE direto: fecha o buraco (trigger BEFORE DELETE) ─────────────────
green_del="$(psql_script <<SQL
BEGIN;
SET LOCAL role authenticated;
SET LOCAL request.jwt.claim.role = 'authenticated';
SET LOCAL request.jwt.claim.sub = '$user_owner';
DELETE FROM public.talkx_templates WHERE id = '$t_bypass';
COMMIT;
SQL
)"
assert_has 'GREEN: DELETE direto de template em campanha -> talkx_template_in_use' 'talkx_template_in_use' "$green_del"
bypass_alive="$(psql_val "SELECT count(*) FROM public.talkx_templates WHERE id = '$t_bypass'")"
assert_eq 'GREEN: template em campanha continua no banco' '1' "$bypass_alive"

# ── 7) DELETE direto sem campanha continua passando ──────────────────────────
del_unused="$(psql_script <<SQL
BEGIN;
SET LOCAL role authenticated;
SET LOCAL request.jwt.claim.role = 'authenticated';
SET LOCAL request.jwt.claim.sub = '$user_owner';
DELETE FROM public.talkx_templates WHERE id = '$t_unused';
COMMIT;
SQL
)"
assert_not_has 'GREEN: DELETE direto de template sem campanha passa' 'talkx_template_in_use' "$del_unused"
unused_gone="$(psql_val "SELECT count(*) FROM public.talkx_templates WHERE id = '$t_unused'")"
assert_eq 'GREEN: template sem campanha foi removido' '0' "$unused_gone"

# ── 8) service_role segue podendo apagar (porta do guard) ────────────────────
svc_del="$(psql_script <<SQL
BEGIN;
SET LOCAL role service_role;
DELETE FROM public.talkx_templates WHERE id = '$t_svc';
COMMIT;
SQL
)"
assert_not_has 'GREEN: service_role segue apagando template em campanha' 'talkx_template_in_use' "$svc_del"
svc_gone="$(psql_val "SELECT count(*) FROM public.talkx_templates WHERE id = '$t_svc'")"
assert_eq 'GREEN: service_role removeu o template' '0' "$svc_gone"

# ── 9) delete_talkx_template RPC: recusa em campanha, apaga template livre ───
rpc_in_use="$(psql_script <<SQL
BEGIN;
SET LOCAL role authenticated;
SET LOCAL request.jwt.claim.role = 'authenticated';
SET LOCAL request.jwt.claim.sub = '$user_owner';
SELECT public.delete_talkx_template('$t_used')::text;
COMMIT;
SQL
)"
assert_has 'GREEN: delete_talkx_template em campanha -> talkx_template_in_use' 'talkx_template_in_use' "$rpc_in_use"
rpc_used_alive="$(psql_val "SELECT count(*) FROM public.talkx_templates WHERE id = '$t_used'")"
assert_eq 'GREEN: RPC nao apagou o template em campanha' '1' "$rpc_used_alive"

rpc_ok="$(psql_script <<SQL
BEGIN;
SET LOCAL role authenticated;
SET LOCAL request.jwt.claim.role = 'authenticated';
SET LOCAL request.jwt.claim.sub = '$user_owner';
SELECT public.delete_talkx_template('$t_rpc_unused')::text;
COMMIT;
SQL
)"
assert_has 'GREEN: delete_talkx_template em template livre -> ok' '"ok": true' "$rpc_ok"
rpc_free_gone="$(psql_val "SELECT count(*) FROM public.talkx_templates WHERE id = '$t_rpc_unused'")"
assert_eq 'GREEN: RPC removeu o template livre' '0' "$rpc_free_gone"

# ── 10) regressao do guard de UPDATE (conteudo continua travado) ─────────────
guard_content="$(psql_script <<SQL
BEGIN;
UPDATE public.talkx_templates SET content = 'alterado sem snapshot' WHERE id = '$t_used';
COMMIT;
SQL
)"
assert_has 'GREEN: UPDATE de conteudo sem snapshot -> 42501' 'talkx_template_update_requires_authorized_rpc' "$guard_content"
guard_arch="$(psql_script <<SQL
BEGIN;
UPDATE public.talkx_templates SET archived_at = now() WHERE id = '$t_used';
COMMIT;
SQL
)"
assert_not_has 'GREEN: UPDATE que toca SOMENTE archived_at passa pelo guard' 'talkx_template_update_requires_authorized_rpc' "$guard_arch"

# ── 11) ACL: negar por padrao; EXECUTE so para authenticated ─────────────────
acl_anon="$(psql_val "SELECT has_function_privilege('anon', 'public.duplicate_talkx_template(uuid)', 'EXECUTE')::text || has_function_privilege('anon', 'public.delete_talkx_template(uuid)', 'EXECUTE')::text || has_function_privilege('anon', 'public.archive_talkx_template(uuid, boolean)', 'EXECUTE')::text")"
assert_eq 'GREEN: anon sem EXECUTE nas 3 RPCs' 'falsefalsefalse' "$acl_anon"
acl_auth="$(psql_val "SELECT has_function_privilege('authenticated', 'public.duplicate_talkx_template(uuid)', 'EXECUTE')::text || ',' || has_function_privilege('authenticated', 'public.delete_talkx_template(uuid)', 'EXECUTE')::text || ',' || has_function_privilege('authenticated', 'public.archive_talkx_template(uuid, boolean)', 'EXECUTE')::text")"
assert_eq 'GREEN: authenticated com EXECUTE nas 3 RPCs' 'true,true,true' "$acl_auth"
acl_guard="$(psql_val "SELECT has_function_privilege('authenticated', 'public.guard_talkx_template_delete()', 'EXECUTE')::text")"
assert_eq 'GREEN: trigger de DELETE nao e executavel por authenticated' 'false' "$acl_guard"

# ── 12) idempotencia: reaplicar a migration nao duplica o trigger ────────────
psql_exec < "$migration" >/dev/null || fail 'migration N-127 nao reaplicou (idempotencia)'
trig="$(psql_val "SELECT count(*) FROM pg_trigger WHERE tgrelid = 'public.talkx_templates'::regclass AND tgname = 'trg_guard_talkx_template_delete' AND NOT tgisinternal")"
assert_eq 'GREEN: reaplicar nao duplica o trigger de DELETE' '1' "$trig"

echo '[OK] Talk X N-127: duplicar copia conteudo e variantes, arquivar preserva updated_at, DELETE direto de template em campanha e recusado e o guard de conteudo segue travado.'
