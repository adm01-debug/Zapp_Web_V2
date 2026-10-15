#!/usr/bin/env bash
# PE-SQL-010 (refazer t_592aa1bc) — "Trilha de auditoria administrativa": a trilha
# cobria papeis, permissoes, contatos e departamento, mas NADA auditava as acoes
# administrativas de perfil (is_active/access_level/max_chats/can_download),
# visibilidade de agente (agent_visibility_grants), configuracoes globais
# (global_settings.value) e rede (ip_whitelist, blocked_ips, blocked_countries,
# geo_blocking_settings, rate_limit_configs).
#
# Roda o MESMO roteiro no mesmo container descartavel, em tres blocos:
#   BLOCO A — estado ANTERIOR (defeito): sem os gatilhos, escritas administrativas
#             como authenticated/service_role nao deixam nenhuma linha em audit_logs.
#   BLOCO B — migration 20261013042745_audit_admin_changes.sql aplicada (o proprio
#             arquivo de supabase/migrations, sem copia): os 8 gatilhos gravam a
#             trilha via funcao SECURITY DEFINER; INSERT direto em audit_logs
#             continua negado pela policy real "Block direct audit log inserts".
#   BLOCO C — rollback: o bloco `-- Rollback:` extraido do cabecalho da migration
#             remove os 8 gatilhos + funcao; a migration reaplica limpo (idempotente).
#
# Ambiente fiel ao canonico: shapes/RLS/policies copiados das migrations reais
# (audit_logs 20251215025014, profiles 20251215024517, seguranca 20251231115910,
# blocked_countries 20251231130733, geo 20251231131019, global_settings
# 20260315193759, agent_visibility_grants 20260329175910, policy 20260410111418).
# Desvios documentados: FKs para auth.users viram uuid simples (sem o schema auth
# do Supabase no PG descartavel); policies admin-gadas por
# is_admin_or_supervisor()/user_roles omitidas — escritas que em producao saem do
# caminho admin/service sao exercidas como service_role (BYPASSRLS, como em prod).

set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
migration="$repo_root/supabase/migrations/20261013042745_audit_admin_changes.sql"
postgres_image="${AUDIT_ADMIN_CHANGES_TEST_POSTGRES_IMAGE:-postgres:17-alpine}"
container_name="zapp-v2-audit-admin-changes-test-$$"

cleanup() {
  if [[ "$container_name" =~ ^zapp-v2-audit-admin-changes-test-[0-9]+$ ]]; then
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
as_user() {
  local jwt="$1" sql="$2"
  docker exec "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres \
    -c "SET ROLE authenticated; SELECT set_config('request.jwt.claims', '$jwt', false); $sql"
}
as_svc() {
  docker exec "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres \
    -c "SET ROLE service_role; $1"
}
expect_value() {
  local l="$1" e="$2" s="$3" a
  a="$(psql_sql "$s" | tail -n1)"
  [[ "$a" == "$e" ]] || fail "$l: esperado '$e', obtido '$a'"
  printf '[PASS] %s\n' "$l"
}
expect_value_as() {
  local l="$1" e="$2" j="$3" s="$4" a
  a="$(as_user "$j" "$s" | tail -n1)"
  [[ "$a" == "$e" ]] || fail "$l: esperado '$e', obtido '$a'"
  printf '[PASS] %s\n' "$l"
}
expect_value_svc() {
  local l="$1" e="$2" s="$3" a
  a="$(as_svc "$s" | tail -n1)"
  [[ "$a" == "$e" ]] || fail "$l: esperado '$e', obtido '$a'"
  printf '[PASS] %s\n' "$l"
}
expect_ok_as() { local l="$1" j="$2" s="$3"; as_user "$j" "$s" >/dev/null || fail "$l: deveria ter sucesso (como authenticated)"; printf '[PASS] %s\n' "$l"; }
expect_ok_svc() { local l="$1" s="$2"; as_svc "$s" >/dev/null || fail "$l: deveria ter sucesso (como service_role)"; printf '[PASS] %s\n' "$l"; }
expect_error_as() {
  local l="$1" needle="$2" j="$3" s="$4" out st
  set +e; out="$(as_user "$j" "$s" 2>&1)"; st=$?; set -e
  (( st == 0 )) && { printf '%s\n' "$out" >&2; fail "$l: deveria falhar, mas passou"; }
  [[ "$out" == *"$needle"* ]] || { printf '%s\n' "$out" >&2; fail "$l: esperava '$needle' no erro"; }
  printf '[PASS] %s\n' "$l"
}

command -v docker >/dev/null 2>&1 || fail 'Docker nao esta instalado'
docker info >/dev/null 2>&1 || fail 'Docker daemon nao esta acessivel'
[[ -f "$migration" ]] || fail "migration nao encontrada: $migration"

printf '== container: %s (imagem %s) ==\n' "$container_name" "$postgres_image"
docker run --rm -d --name "$container_name" -e POSTGRES_PASSWORD=test_only "$postgres_image" >/dev/null

ready=0
for _ in $(seq 1 90); do
  if psql_sql 'SELECT 1' >/dev/null 2>&1; then ready=$((ready + 1)); (( ready >= 2 )) && break; else ready=0; fi
  sleep 1
done
(( ready >= 2 )) || fail 'PostgreSQL descartavel nao ficou pronto de forma estavel'

tmp_dir="$(mktemp -d)"
trap 'rm -rf "$tmp_dir"; cleanup' EXIT INT TERM

JWT_SUB='11111111-1111-1111-1111-111111111111'
JWT='{"sub":"'"$JWT_SUB"'","role":"authenticated"}'

cat > "$tmp_dir/pre.sql" <<'SQL'
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;
GRANT CONNECT ON DATABASE postgres TO anon, authenticated, service_role;
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

-- Shim de auth.* (mesmo padrao dos demais .test.sh): le o JWT da sessao.
CREATE SCHEMA auth;
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
$$ SELECT NULLIF(current_setting('request.jwt.claims', true)::json->>'sub', '')::uuid $$;
CREATE OR REPLACE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS
$$ SELECT NULLIF(current_setting('request.jwt.claims', true)::json->>'role', '')::text $$;

-- audit_logs: shape fiel a 20251215025014 (sem FK auth.users/storage nem realtime).
CREATE TABLE public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id TEXT,
  details JSONB DEFAULT '{}',
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
-- Policy real, verbatim da migration 20260410111418: nega INSERT do cliente.
CREATE POLICY "Block direct audit log inserts"
ON public.audit_logs
FOR INSERT
TO authenticated
WITH CHECK (false);
GRANT SELECT ON public.audit_logs TO authenticated;
-- INSERT liberado de proposito no harness: a negacao tem de vir da POLICY real
-- "Block direct audit log inserts" (WITH CHECK false), nao da falta de GRANT.
GRANT INSERT ON public.audit_logs TO authenticated;

-- update_updated_at_column: verbatim da migration de profiles (20251215024517).
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ language 'plpgsql';
-- trigger_global_settings_updated_at: verbatim da migration 20260315193759.
CREATE OR REPLACE FUNCTION public.trigger_global_settings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- profiles: colunas reais (base 20251215024517 + access_level/is_active de
-- 20251215030017 + can_download de 20260406200144). Sem FK auth.users.
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  name TEXT,
  email TEXT,
  avatar_url TEXT,
  role TEXT DEFAULT 'user',
  max_chats INTEGER DEFAULT 5,
  access_level TEXT DEFAULT 'basic',
  is_active BOOLEAN DEFAULT true,
  can_download BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
-- Policies reais, verbatim da migration de profiles (so usam auth.uid()).
CREATE POLICY "Users can view own profile" ON public.profiles
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own profile" ON public.profiles
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE USING (auth.uid() = user_id);
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- agent_visibility_grants: shape fiel a 20260329175910 (sem FK auth.users).
CREATE TABLE public.agent_visibility_grants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL,
  granted_by UUID,
  department_id UUID,
  granted_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(agent_id, department_id)
);
ALTER TABLE public.agent_visibility_grants ENABLE ROW LEVEL SECURITY;

-- global_settings: shape fiel a 20260315193759.
CREATE TABLE public.global_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT UNIQUE NOT NULL,
  value TEXT,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.global_settings ENABLE ROW LEVEL SECURITY;
-- Policy real, verbatim: leitura liberada; escrita sem policy (só service_role).
CREATE POLICY "Allow authenticated users to read global settings"
  ON public.global_settings FOR SELECT TO authenticated USING (true);
CREATE TRIGGER trigger_update_global_settings_updated_at
  BEFORE UPDATE ON public.global_settings
  FOR EACH ROW EXECUTE FUNCTION public.trigger_global_settings_updated_at();

-- ip_whitelist / blocked_ips / rate_limit_configs: shapes fieis a 20251231115910
-- (sem FK auth.users). Policies de SELECT reais, verbatim; escrita admin-gada
-- omitida (exige user_roles/is_admin_or_supervisor) — exercida como service_role.
CREATE TABLE public.ip_whitelist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ip_address TEXT NOT NULL UNIQUE,
  description TEXT,
  added_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.ip_whitelist ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can view IP whitelist" ON public.ip_whitelist
  FOR SELECT USING (true);

CREATE TABLE public.blocked_ips (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ip_address TEXT NOT NULL UNIQUE,
  reason TEXT NOT NULL,
  blocked_by UUID,
  blocked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ,
  is_permanent BOOLEAN DEFAULT false,
  request_count INTEGER DEFAULT 0,
  last_attempt_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.blocked_ips ENABLE ROW LEVEL SECURITY;

-- blocked_countries: shape fiel a 20251231130733 (sem FK auth.users).
CREATE TABLE public.blocked_countries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  country_code TEXT NOT NULL UNIQUE,
  country_name TEXT NOT NULL,
  reason TEXT,
  blocked_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.blocked_countries ENABLE ROW LEVEL SECURITY;

-- geo_blocking_settings: shape fiel a 20251231131019.
CREATE TABLE public.geo_blocking_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  is_enabled BOOLEAN DEFAULT false,
  default_action TEXT DEFAULT 'allow' CHECK (default_action IN ('allow', 'block')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.geo_blocking_settings ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.rate_limit_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  endpoint_pattern TEXT NOT NULL,
  max_requests INTEGER NOT NULL DEFAULT 100,
  window_seconds INTEGER NOT NULL DEFAULT 60,
  block_duration_minutes INTEGER NOT NULL DEFAULT 15,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.rate_limit_configs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can view rate limit configs" ON public.rate_limit_configs
  FOR SELECT USING (true);
CREATE TRIGGER update_rate_limit_configs_updated_at
  BEFORE UPDATE ON public.rate_limit_configs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Grants de escrita do caminho autenticado (padrao do Supabase para tabelas public).
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.agent_visibility_grants TO authenticated;
GRANT SELECT ON public.global_settings TO authenticated;
GRANT SELECT ON public.ip_whitelist TO authenticated;
GRANT SELECT ON public.blocked_ips TO authenticated;
GRANT SELECT ON public.blocked_countries TO authenticated;
GRANT SELECT ON public.geo_blocking_settings TO authenticated;
GRANT SELECT ON public.rate_limit_configs TO authenticated;
-- service_role em producao escreve via BYPASSRLS + grants amplos: espelha aqui.
GRANT ALL ON public.profiles TO service_role;
GRANT ALL ON public.agent_visibility_grants TO service_role;
GRANT ALL ON public.global_settings TO service_role;
GRANT ALL ON public.ip_whitelist TO service_role;
GRANT ALL ON public.blocked_ips TO service_role;
GRANT ALL ON public.blocked_countries TO service_role;
GRANT ALL ON public.geo_blocking_settings TO service_role;
GRANT ALL ON public.rate_limit_configs TO service_role;
SQL
psql_file "$tmp_dir/pre.sql" >/dev/null

audit_count() { psql_sql "SELECT count(*) FROM public.audit_logs $1"; }

echo '== BLOCO A — estado ANTERIOR (defeito): nada e auditado =='
as_user "$JWT" "INSERT INTO public.profiles(id, user_id, name) VALUES ('aaaaaaaa-0000-0000-0000-0000000000a1', '$JWT_SUB', 'Ana');" >/dev/null
expect_ok_as 'A.1 UPDATE is_active passa (sem trilha)' "$JWT" \
  "UPDATE public.profiles SET is_active = false WHERE id = 'aaaaaaaa-0000-0000-0000-0000000000a1';"
as_svc "INSERT INTO public.global_settings(key, value) VALUES ('a_smtp_host', 'smtp.exemplo');" >/dev/null
expect_ok_svc 'A.2 UPDATE de config passa (sem trilha)' \
  "UPDATE public.global_settings SET value = 'outro' WHERE key = 'a_smtp_host';"
expect_ok_svc 'A.3 INSERT em ip_whitelist passa (sem trilha)' \
  "INSERT INTO public.ip_whitelist(ip_address) VALUES ('10.0.0.1');"
[[ "$(audit_count '')" == '0' ]] || fail "A.4 defeito reproduzido: audit_logs deveria estar vazio, tem $(audit_count '')"
printf '[PASS] A.4 audit_logs vazio sem os gatilhos (defeito)\n'

echo '== aplica a migration real do cartao =='
psql_file "$migration" >/dev/null
expect_value 'B.0 oito gatilhos criados' '8' \
  "SELECT count(*) FROM pg_trigger WHERE tgname LIKE 'trg_audit_admin%' AND NOT tgisinternal;"

echo '== BLOCO B — perfis (authenticated com JWT) =='
as_user "$JWT" "INSERT INTO public.profiles(id, user_id, name) VALUES ('bbbbbbbb-0000-0000-0000-0000000000b1', '$JWT_SUB', 'Beto');" >/dev/null
expect_ok_as 'B-P.1 UPDATE is_active=false' "$JWT" \
  "UPDATE public.profiles SET is_active = false WHERE id = 'bbbbbbbb-0000-0000-0000-0000000000b1';"
expect_value 'B-P.2 trilha profiles_update gravada' '1' \
  "SELECT count(*) FROM public.audit_logs WHERE action = 'profiles_update' AND entity_id = 'bbbbbbbb-0000-0000-0000-0000000000b1';"
expect_value 'B-P.3 changed_fields conteve is_active' 't' \
  "SELECT ((details->'changed_fields') ? 'is_active') FROM public.audit_logs WHERE action = 'profiles_update' AND entity_id = 'bbbbbbbb-0000-0000-0000-0000000000b1' ORDER BY created_at DESC LIMIT 1;"
expect_value 'B-P.4 user_id = sub do JWT' "$JWT_SUB" \
  "SELECT user_id::text FROM public.audit_logs WHERE action = 'profiles_update' AND entity_id = 'bbbbbbbb-0000-0000-0000-0000000000b1' ORDER BY created_at DESC LIMIT 1;"
expect_value 'B-P.5 actor_kind = jwt' 'jwt' \
  "SELECT details->>'actor_kind' FROM public.audit_logs WHERE action = 'profiles_update' AND entity_id = 'bbbbbbbb-0000-0000-0000-0000000000b1' ORDER BY created_at DESC LIMIT 1;"
expect_ok_as 'B-P.6 UPDATE so de name (nao vigiada)' "$JWT" \
  "UPDATE public.profiles SET name = 'Beto 2' WHERE id = 'bbbbbbbb-0000-0000-0000-0000000000b1';"
expect_value 'B-P.7 name sozinho nao gera trilha' '1' \
  "SELECT count(*) FROM public.audit_logs WHERE action = 'profiles_update' AND entity_id = 'bbbbbbbb-0000-0000-0000-0000000000b1';"
expect_ok_as 'B-P.8 UPDATE misto (vigiadas + name)' "$JWT" \
  "UPDATE public.profiles SET is_active = true, max_chats = 9, name = 'Beto 3' WHERE id = 'bbbbbbbb-0000-0000-0000-0000000000b1';"
expect_value 'B-P.9 segunda trilha gravada' '2' \
  "SELECT count(*) FROM public.audit_logs WHERE action = 'profiles_update' AND entity_id = 'bbbbbbbb-0000-0000-0000-0000000000b1';"
expect_value 'B-P.10 changed_fields so com as vigiadas' 't' \
  "SELECT ((details->'changed_fields') ?& ARRAY['is_active','max_chats']) AND NOT ((details->'changed_fields') ? 'name') FROM public.audit_logs WHERE action = 'profiles_update' AND entity_id = 'bbbbbbbb-0000-0000-0000-0000000000b1' ORDER BY created_at DESC LIMIT 1;"
as_user "$JWT" "INSERT INTO public.profiles(id, user_id, name) VALUES ('cccccccc-0000-0000-0000-0000000000c1', '$JWT_SUB', 'Cid');" >/dev/null
as_user "$JWT" "DELETE FROM public.profiles WHERE id = 'cccccccc-0000-0000-0000-0000000000c1';" >/dev/null
expect_value 'B-P.11 INSERT/DELETE de perfil nao geram trilha' '0' \
  "SELECT count(*) FROM public.audit_logs WHERE entity_id = 'cccccccc-0000-0000-0000-0000000000c1';"

echo '== BLOCO B — configuracoes globais (service_role) =='
as_svc "INSERT INTO public.global_settings(key, value, description) VALUES ('push_api_token', 'sk-live-SEGREDO-123', 'token');" >/dev/null
expect_ok_svc 'B-G.1 UPDATE de value' \
  "UPDATE public.global_settings SET value = 'sk-live-SEGREDO-456' WHERE key = 'push_api_token';"
gs_row_id="$(psql_sql "SELECT id::text FROM public.global_settings WHERE key = 'push_api_token';")"
expect_value 'B-G.2 trilha global_settings_update no id da linha' \
  "$gs_row_id" \
  "SELECT entity_id FROM public.audit_logs WHERE action = 'global_settings_update' ORDER BY created_at DESC LIMIT 1;"
expect_value 'B-G.2b details guarda a CHAVE (nome, nao segredo)' 'push_api_token' \
  "SELECT details->>'key' FROM public.audit_logs WHERE action = 'global_settings_update' ORDER BY created_at DESC LIMIT 1;"
expect_value 'B-G.3 details sem a chave value' 'f' \
  "SELECT (details ? 'value') FROM public.audit_logs WHERE action = 'global_settings_update' ORDER BY created_at DESC LIMIT 1;"
expect_value 'B-G.4 segredo nao vaza no details' '0' \
  "SELECT count(*) FROM public.audit_logs WHERE action = 'global_settings_update' AND details::text LIKE '%sk-live-SEGREDO-%';"
expect_value 'B-G.5 user_id NULL (service_role)' '0' \
  "SELECT count(*) FROM public.audit_logs WHERE action = 'global_settings_update' AND user_id IS NOT NULL;"
expect_value 'B-G.6 actor_kind service_role_or_direct_sql' 'service_role_or_direct_sql' \
  "SELECT details->>'actor_kind' FROM public.audit_logs WHERE action = 'global_settings_update' ORDER BY created_at DESC LIMIT 1;"
expect_ok_svc 'B-G.7 UPDATE so de description' \
  "UPDATE public.global_settings SET description = 'outra' WHERE key = 'push_api_token';"
expect_value 'B-G.8 UPDATE de description tambem audita (nome do campo, sem valor)' '2' \
  "SELECT count(*) FROM public.audit_logs WHERE action = 'global_settings_update';"
expect_value 'B-G.8b changed_fields da 2a trilha = description' 't' \
  "SELECT ((details->'changed_fields') ? 'description') FROM public.audit_logs WHERE action = 'global_settings_update' ORDER BY created_at DESC LIMIT 1;"

echo '== BLOCO B — rede e agentes (service_role) =='
expect_ok_svc 'B-N.1 INSERT ip_whitelist' \
  "INSERT INTO public.ip_whitelist(id, ip_address) VALUES ('d0000000-0000-0000-0000-0000000000d1', '203.0.113.7');"
expect_value 'B-N.2 trilha ip_whitelist_insert' '1' \
  "SELECT count(*) FROM public.audit_logs WHERE action = 'ip_whitelist_insert' AND entity_id = 'd0000000-0000-0000-0000-0000000000d1';"
expect_ok_svc 'B-N.3 INSERT blocked_ips' \
  "INSERT INTO public.blocked_ips(id, ip_address, reason) VALUES ('d0000000-0000-0000-0000-0000000000d2', '198.51.100.9', 'abuso');"
expect_value 'B-N.4 trilha blocked_ips_insert' '1' \
  "SELECT count(*) FROM public.audit_logs WHERE action = 'blocked_ips_insert' AND entity_id = 'd0000000-0000-0000-0000-0000000000d2';"
expect_ok_svc 'B-N.5 INSERT blocked_countries' \
  "INSERT INTO public.blocked_countries(id, country_code, country_name) VALUES ('d0000000-0000-0000-0000-0000000000d3', 'XX', 'Xlandia');"
expect_value 'B-N.6 trilha blocked_countries_insert' '1' \
  "SELECT count(*) FROM public.audit_logs WHERE action = 'blocked_countries_insert' AND entity_id = 'd0000000-0000-0000-0000-0000000000d3';"
expect_ok_svc 'B-N.7 INSERT geo_blocking_settings' \
  "INSERT INTO public.geo_blocking_settings(id, is_enabled) VALUES ('d0000000-0000-0000-0000-0000000000d4', true);"
expect_value 'B-N.8 trilha geo_blocking_settings_insert' '1' \
  "SELECT count(*) FROM public.audit_logs WHERE action = 'geo_blocking_settings_insert' AND entity_id = 'd0000000-0000-0000-0000-0000000000d4';"
expect_ok_svc 'B-N.9 INSERT rate_limit_configs' \
  "INSERT INTO public.rate_limit_configs(id, name, endpoint_pattern) VALUES ('d0000000-0000-0000-0000-0000000000d5', 'Teste', '/t/*');"
expect_value 'B-N.10 trilha rate_limit_configs_insert' '1' \
  "SELECT count(*) FROM public.audit_logs WHERE action = 'rate_limit_configs_insert' AND entity_id = 'd0000000-0000-0000-0000-0000000000d5';"
expect_ok_svc 'B-N.11 INSERT agent_visibility_grants' \
  "INSERT INTO public.agent_visibility_grants(id, agent_id) VALUES ('d0000000-0000-0000-0000-0000000000d6', 'e0000000-0000-0000-0000-0000000000e1');"
expect_value 'B-N.12 trilha agent_visibility_grants_insert' '1' \
  "SELECT count(*) FROM public.audit_logs WHERE action = 'agent_visibility_grants_insert' AND entity_id = 'd0000000-0000-0000-0000-0000000000d6';"
expect_ok_svc 'B-N.13 DELETE agent_visibility_grants' \
  "DELETE FROM public.agent_visibility_grants WHERE id = 'd0000000-0000-0000-0000-0000000000d6';"
expect_value 'B-N.14 trilha agent_visibility_grants_delete' '1' \
  "SELECT count(*) FROM public.audit_logs WHERE action = 'agent_visibility_grants_delete' AND entity_id = 'd0000000-0000-0000-0000-0000000000d6';"
expect_ok_svc 'B-N.15 UPDATE em tabela de rede (tambem audita)' \
  "UPDATE public.ip_whitelist SET description = 'x' WHERE id = 'd0000000-0000-0000-0000-0000000000d1';"
expect_value 'B-N.16 trilha ip_whitelist_update gravada' '1' \
  "SELECT count(*) FROM public.audit_logs WHERE action = 'ip_whitelist_update' AND entity_id = 'd0000000-0000-0000-0000-0000000000d1';"

echo '== BLOCO B — antifalsificacao e seguranca da funcao =='
expect_error_as 'B-F.1 INSERT direto em audit_logs negado' 'row-level security' "$JWT" \
  "INSERT INTO public.audit_logs(action) VALUES ('forjado');"
expect_value 'B-S.1 funcao e SECURITY DEFINER' 't' \
  "SELECT prosecdef FROM pg_proc WHERE proname = 'audit_admin_change';"
expect_value 'B-S.2 search_path fixo da funcao' 't' \
  "SELECT (proconfig::text LIKE '%search_path=public, pg_temp%') FROM pg_proc WHERE proname = 'audit_admin_change';"
for r in anon authenticated service_role; do
  expect_value "B-S.3 sem EXECUTE para $r" 'f' \
    "SELECT has_function_privilege('$r', 'public.audit_admin_change()', 'EXECUTE');"
done

echo '== BLOCO C — rollback do cabecalho e reaplicacao =='
grep '^--   drop ' "$migration" | sed 's/^--   //' > "$tmp_dir/rollback.sql"
[[ "$(wc -l < "$tmp_dir/rollback.sql")" == '9' ]] || fail "C.0 rollback deveria ter 9 linhas, tem $(wc -l < "$tmp_dir/rollback.sql")"
printf '[PASS] C.0 rollback extraido do cabecalho (9 linhas)\n'
psql_file "$tmp_dir/rollback.sql" >/dev/null
expect_value 'C.1 zero gatilhos apos rollback' '0' \
  "SELECT count(*) FROM pg_trigger WHERE tgname LIKE 'trg_audit_admin%' AND NOT tgisinternal;"
expect_value 'C.2 funcao removida apos rollback' 't' \
  "SELECT to_regprocedure('public.audit_admin_change()') IS NULL;"
psql_file "$migration" >/dev/null
expect_value 'C.3 oito gatilhos de volta (reaplicacao idempotente)' '8' \
  "SELECT count(*) FROM pg_trigger WHERE tgname LIKE 'trg_audit_admin%' AND NOT tgisinternal;"

printf '\nOK: trilha administrativa provada (A: defeito; B: 8 gatilhos; C: rollback+reaplicacao)\n'
