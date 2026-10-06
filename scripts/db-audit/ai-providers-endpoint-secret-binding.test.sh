#!/usr/bin/env bash
# IA-EGRESS-001 (item 20) — "Endpoint e nome de secret configuráveis não têm vinculação
# segura completa". Área: migrations.
#
# Prova, em Postgres 17 descartável, que a CONFIGURAÇÃO PERSISTIDA de `ai_providers`
# deixava um administrador gravar destino/credencial inseguros e que a migration
# `20261006170206_ai_providers_endpoint_secret_binding.sql` passa a barrar isso no banco
# (required_fix: "Validar também a configuração persistida e casos negativos de
# administrador"). Roda como o PAPEL REAL (`authenticated` com JWT de admin), nunca como
# postgres/superusuário.
#
#   BLOCO A — estado ANTERIOR (defeito): sem CHECK, o admin INSERTa endpoint http para o
#             metadata da nuvem (169.254.169.254), IP privado literal, porta 8443 e
#             seleciona SUPABASE_SERVICE_ROLE_KEY como credencial de provedor. Tudo passa.
#   BLOCO B — migration real aplicada: os mesmos INSERTs são recusados; a configuração
#             legítima (provedores atuais, inclusive custom_webhook sem chave e domínio que
#             começa por dígito) continua entrando; `:443` é aceito (mesma porta padrão do
#             código) e `https://10.0.0.1` não é confundido com domínio; o legado é
#             convalidado (VALIDATE) e o rollback do cabeçalho desfaz tudo.

set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
migration="$repo_root/supabase/migrations/20261006170206_ai_providers_endpoint_secret_binding.sql"
postgres_image="${AI_PROVIDER_BINDING_TEST_POSTGRES_IMAGE:-postgres:17-alpine}"
container_name="zapp-v2-ai-provider-binding-test-$$"

cleanup() {
  if [[ "$container_name" =~ ^zapp-v2-ai-provider-binding-test-[0-9]+$ ]]; then
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
as_admin() {
  local sql="$1"
  docker exec "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres \
    -c "SET ROLE authenticated; SELECT set_config('request.jwt.claims', '$ADMIN_JWT', false); $sql"
}
expect_value() {
  local l="$1" e="$2" s="$3" a
  a="$(psql_sql "$s" | tail -n1)"
  [[ "$a" == "$e" ]] || fail "$l: esperado '$e', obtido '$a'"
  printf '[PASS] %s\n' "$l"
}
expect_ok_as() {
  local l="$1" s="$2"
  as_admin "$s" >/dev/null || fail "$l: deveria ter sucesso como authenticated/admin"
  printf '[PASS] %s\n' "$l"
}
expect_error_as() {
  local l="$1" needle="$2" s="$3" out st
  set +e; out="$(as_admin "$s" 2>&1)"; st=$?; set -e
  (( st == 0 )) && { printf '%s\n' "$out" >&2; fail "$l: deveria falhar, mas passou"; }
  [[ "$out" == *"$needle"* ]] || { printf '%s\n' "$out" >&2; fail "$l: esperava '$needle' no erro"; }
  printf '[PASS] %s\n' "$l"
}

command -v docker >/dev/null 2>&1 || fail 'Docker nao esta instalado'
docker info >/dev/null 2>&1 || fail 'Docker daemon nao esta acessivel'
[[ -f "$migration" ]] || fail "migration nao encontrada: $migration"

ADMIN_UUID='99999999-9999-9999-9999-999999999999'
ADMIN_JWT="{\"sub\":\"$ADMIN_UUID\",\"role\":\"authenticated\"}"

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

cat > "$tmp_dir/pre.sql" <<'SQL'
-- Superfície mínima do Supabase + `ai_providers` na forma ANTERIOR à migration
-- (o defeito é a AUSÊNCIA de CHECK; a estrutura da tabela não muda).
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;

CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
  AS $$ SELECT coalesce(
       nullif(current_setting('request.jwt.claim.sub', true), ''),
       nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'
     )::uuid $$;
GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;

CREATE TABLE public.profiles (id uuid PRIMARY KEY DEFAULT gen_random_uuid());
CREATE TABLE public.user_roles (user_id uuid NOT NULL, role text NOT NULL, PRIMARY KEY (user_id, role));

CREATE FUNCTION public.has_role(_user_id uuid, _role text) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
  AS $$ SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role) $$;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, text) TO authenticated, service_role;

CREATE FUNCTION public.update_updated_at_column() RETURNS trigger
  LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

CREATE TYPE public.ai_provider_type AS ENUM (
  'lovable_ai', 'openai_compatible', 'google_gemini', 'custom_webhook', 'custom_agent');

CREATE TABLE public.ai_providers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  provider_type public.ai_provider_type NOT NULL DEFAULT 'lovable_ai',
  api_endpoint TEXT,
  api_key_secret_name TEXT,
  model TEXT,
  system_prompt TEXT,
  config JSONB DEFAULT '{}'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT true,
  is_default BOOLEAN NOT NULL DEFAULT false,
  use_for TEXT[] NOT NULL DEFAULT ARRAY['copilot']::TEXT[],
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE TRIGGER update_ai_providers_updated_at
  BEFORE UPDATE ON public.ai_providers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE FUNCTION public.ensure_single_default_ai_provider() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
  AS $$
  BEGIN
    IF NEW.is_default = true THEN
      UPDATE public.ai_providers SET is_default = false
       WHERE id != NEW.id AND is_default = true AND use_for && NEW.use_for;
    END IF;
    RETURN NEW;
  END $$;

CREATE TRIGGER ensure_single_default_ai_provider
  BEFORE INSERT OR UPDATE ON public.ai_providers
  FOR EACH ROW EXECUTE FUNCTION public.ensure_single_default_ai_provider();

ALTER TABLE public.ai_providers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view AI providers" ON public.ai_providers FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can insert AI providers" ON public.ai_providers FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can update AI providers" ON public.ai_providers FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can delete AI providers" ON public.ai_providers FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_providers TO authenticated;
GRANT SELECT ON public.profiles TO authenticated;
SQL

# Configuração legítima (retrato dos provedores atuais) — tem de continuar entrando depois
# da migration. (a tabela é pequena; o endereço do gateway do lovable_ai é NULL no banco)
cat > "$tmp_dir/seed.sql" <<'SQL'
DELETE FROM public.ai_providers;
DELETE FROM public.user_roles;
DELETE FROM public.profiles;

INSERT INTO public.profiles (id) VALUES ('99999999-9999-9999-9999-999999999999');
INSERT INTO public.user_roles (user_id, role) VALUES ('99999999-9999-9999-9999-999999999999', 'admin');

INSERT INTO public.ai_providers (name, provider_type, api_endpoint, api_key_secret_name, model, is_default, use_for) VALUES
  ('Lovable AI (Padrao)', 'lovable_ai',     NULL,                                        NULL,                    'google/gemini-3-flash-preview', true,  ARRAY['copilot']),
  ('DeepSeek',            'openai_compatible', 'https://api.deepseek.com/v1/chat/completions',   'DEEPSEEK_API_KEY',   'deepseek-chat', false, ARRAY['analysis']),
  ('OpenRouter',          'openai_compatible', 'https://openrouter.ai/api/v1/chat/completions',  'OPENROUTER_API_KEY', 'openai/gpt-4o', false, ARRAY['summary']),
  ('GLM AI',              'openai_compatible', 'https://api.z.ai/api/coding/paas/v4/chat/completions', 'GLM_API_KEY',   'glm-4',         false, ARRAY['tagging']),
  ('Webhook Publico',     'custom_webhook',  'https://hooks.exemplo.test/ai',                   NULL,                    NULL,            false, ARRAY['auto_reply']);
SQL

psql_file "$tmp_dir/pre.sql" >/dev/null
psql_file "$tmp_dir/seed.sql" >/dev/null

printf '\n============ BLOCO A — estado ANTERIOR (defeito) ============\n'

expect_ok_as 'A.1 (DEFEITO) admin grava endpoint HTTP para o metadata da nuvem (169.254.169.254)' \
  "INSERT INTO public.ai_providers (name, provider_type, api_endpoint, use_for) VALUES ('ssrf-meta', 'custom_webhook', 'http://169.254.169.254/latest/meta-data/', ARRAY['copilot']);"
expect_ok_as 'A.2 (DEFEITO) admin grava endpoint em IP privado literal (https://10.1.2.3)' \
  "INSERT INTO public.ai_providers (name, provider_type, api_endpoint, use_for) VALUES ('ssrf-priv', 'custom_webhook', 'https://10.1.2.3/internal', ARRAY['copilot']);"
expect_ok_as 'A.3 (DEFEITO) admin grava endpoint em porta fora do padrão (https://host:8443)' \
  "INSERT INTO public.ai_providers (name, provider_type, api_endpoint, use_for) VALUES ('porta', 'custom_webhook', 'https://exemplo.test:8443/v1', ARRAY['copilot']);"
expect_ok_as 'A.4 (DEFEITO) admin seleciona secret de infraestrutura como credencial de provedor' \
  "INSERT INTO public.ai_providers (name, provider_type, api_endpoint, api_key_secret_name, use_for) VALUES ('exfil', 'openai_compatible', 'https://exemplo.test/v1', 'SUPABASE_SERVICE_ROLE_KEY', ARRAY['copilot']);"
expect_value 'A.5 (DEFEITO) as 4 configurações inseguras ficaram PERSISTIDAS (nenhum CHECK as barra)' '4' \
  "SELECT count(*) FROM public.ai_providers WHERE name IN ('ssrf-meta','ssrf-priv','porta','exfil');"
# limpa o lixo do bloco A: o VALIDATE do bloco B exige que o legado real não viole
psql_sql "DELETE FROM public.ai_providers WHERE name IN ('ssrf-meta','ssrf-priv','porta','exfil');" >/dev/null

printf '\n============ BLOCO B — migration aplicada ============\n'
psql_file "$migration" >/dev/null

expect_error_as 'B.1 endpoint HTTP (metadata) recusado pela constraint do endpoint' \
  'ai_providers_api_endpoint_safe' \
  "INSERT INTO public.ai_providers (name, provider_type, api_endpoint, use_for) VALUES ('ssrf-meta', 'custom_webhook', 'http://169.254.169.254/latest/meta-data/', ARRAY['copilot']);"
expect_error_as 'B.2 IP privado literal (10.0.0.1) recusado' \
  'ai_providers_api_endpoint_safe' \
  "INSERT INTO public.ai_providers (name, provider_type, api_endpoint, use_for) VALUES ('ssrf-priv', 'custom_webhook', 'https://10.0.0.1/v1', ARRAY['copilot']);"
expect_error_as 'B.3 IP do metadata em https recusado (literal completo)' \
  'ai_providers_api_endpoint_safe' \
  "INSERT INTO public.ai_providers (name, provider_type, api_endpoint, use_for) VALUES ('ssrf-meta2', 'custom_webhook', 'https://169.254.169.254/latest/meta-data/', ARRAY['copilot']);"
expect_error_as 'B.3a IPv4 abreviado WHATWG (127.1) recusado' \
  'ai_providers_api_endpoint_safe' \
  "INSERT INTO public.ai_providers (name, provider_type, api_endpoint, use_for) VALUES ('ssrf-loopback-short', 'custom_webhook', 'https://127.1/v1', ARRAY['copilot']);"
expect_error_as 'B.3b IPv4 abreviado WHATWG (169.254.43518) recusado' \
  'ai_providers_api_endpoint_safe' \
  "INSERT INTO public.ai_providers (name, provider_type, api_endpoint, use_for) VALUES ('ssrf-meta-short', 'custom_webhook', 'https://169.254.43518/', ARRAY['copilot']);"
expect_error_as 'B.3c IPv4 hexadecimal WHATWG (0x7f.0.0.1) recusado' \
  'ai_providers_api_endpoint_safe' \
  "INSERT INTO public.ai_providers (name, provider_type, api_endpoint, use_for) VALUES ('ssrf-loopback-hex', 'custom_webhook', 'https://0x7f.0.0.1/', ARRAY['copilot']);"
expect_error_as 'B.3d IPv4 com ponto final WHATWG (10.0.0.1.) recusado' \
  'ai_providers_api_endpoint_safe' \
  "INSERT INTO public.ai_providers (name, provider_type, api_endpoint, use_for) VALUES ('ssrf-priv-trailing-dot', 'custom_webhook', 'https://10.0.0.1./v1', ARRAY['copilot']);"
expect_error_as 'B.3e localhost com ponto final recusado' \
  'ai_providers_api_endpoint_safe' \
  "INSERT INTO public.ai_providers (name, provider_type, api_endpoint, use_for) VALUES ('localhost-trailing-dot', 'custom_webhook', 'https://localhost./v1', ARRAY['copilot']);"
expect_error_as 'B.3f IPv4 abreviado WHATWG (10.1) recusado' \
  'ai_providers_api_endpoint_safe' \
  "INSERT INTO public.ai_providers (name, provider_type, api_endpoint, use_for) VALUES ('ssrf-priv-short', 'custom_webhook', 'https://10.1/v1', ARRAY['copilot']);"
expect_error_as 'B.4 IPv6 literal ([::1]) recusado' \
  'ai_providers_api_endpoint_safe' \
  "INSERT INTO public.ai_providers (name, provider_type, api_endpoint, use_for) VALUES ('ssrf-v6', 'custom_webhook', 'https://[::1]/v1', ARRAY['copilot']);"
expect_error_as 'B.5 porta fora do padrão (8443) recusada' \
  'ai_providers_api_endpoint_safe' \
  "INSERT INTO public.ai_providers (name, provider_type, api_endpoint, use_for) VALUES ('porta', 'custom_webhook', 'https://exemplo.test:8443/v1', ARRAY['copilot']);"
expect_error_as 'B.6 hostname interno/localhost recusado' \
  'ai_providers_api_endpoint_safe' \
  "INSERT INTO public.ai_providers (name, provider_type, api_endpoint, use_for) VALUES ('interno', 'custom_webhook', 'https://servico.internal/v1', ARRAY['copilot']);"
expect_error_as 'B.7 rótulo único (sem domínio) recusado' \
  'ai_providers_api_endpoint_safe' \
  "INSERT INTO public.ai_providers (name, provider_type, api_endpoint, use_for) VALUES ('sem-dominio', 'custom_webhook', 'https://intranet/v1', ARRAY['copilot']);"
expect_error_as 'B.8 credencial embutida na URL (userinfo) recusada' \
  'ai_providers_api_endpoint_safe' \
  "INSERT INTO public.ai_providers (name, provider_type, api_endpoint, use_for) VALUES ('userinfo', 'custom_webhook', 'https://user:senha@exemplo.test/v1', ARRAY['copilot']);"

expect_error_as 'B.9 secret de infraestrutura (SUPABASE_SERVICE_ROLE_KEY) recusado como credencial' \
  'ai_providers_api_key_secret_name_safe' \
  "INSERT INTO public.ai_providers (name, provider_type, api_endpoint, api_key_secret_name, use_for) VALUES ('exfil', 'openai_compatible', 'https://exemplo.test/v1', 'SUPABASE_SERVICE_ROLE_KEY', ARRAY['copilot']);"
expect_error_as 'B.10 GITHUB_TOKEN recusado' \
  'ai_providers_api_key_secret_name_safe' \
  "INSERT INTO public.ai_providers (name, provider_type, api_endpoint, api_key_secret_name, use_for) VALUES ('exfil2', 'openai_compatible', 'https://exemplo.test/v1', 'GITHUB_TOKEN', ARRAY['copilot']);"
expect_error_as 'B.11 TYPES_SYNC_PR_TOKEN recusado (secret não enumerado)' \
  'ai_providers_api_key_secret_name_safe' \
  "INSERT INTO public.ai_providers (name, provider_type, api_endpoint, api_key_secret_name, use_for) VALUES ('exfil3', 'openai_compatible', 'https://exemplo.test/v1', 'TYPES_SYNC_PR_TOKEN', ARRAY['copilot']);"

expect_ok_as 'B.12 :443 explícito é ACEITO (mesma porta padrão do código; antes o SQL recusava)' \
  "INSERT INTO public.ai_providers (name, provider_type, api_endpoint, api_key_secret_name, use_for) VALUES ('porta-443', 'openai_compatible', 'https://provedor.exemplo.test:443/v1', 'OPENAI_API_KEY', ARRAY['copilot']);"
expect_ok_as 'B.13 domínio que COMEÇA por dígito é ACEITO (não é IP literal)' \
  "INSERT INTO public.ai_providers (name, provider_type, api_endpoint, api_key_secret_name, use_for) VALUES ('digito', 'openai_compatible', 'https://1and1.exemplo.test/v1', 'OPENAI_API_KEY', ARRAY['copilot']);"
expect_ok_as 'B.14 provedores atuais seguem graváveis (DeepSeek/OpenRouter/GLM/custom_webhook sem chave)' \
  "INSERT INTO public.ai_providers (name, provider_type, api_endpoint, api_key_secret_name, use_for) VALUES
     ('DeepSeek-2','openai_compatible','https://api.deepseek.com/v1/chat/completions','DEEPSEEK_API_KEY',ARRAY['copilot']),
     ('OpenRouter-2','openai_compatible','https://openrouter.ai/api/v1/chat/completions','OPENROUTER_API_KEY',ARRAY['copilot']),
     ('GLM-2','openai_compatible','https://api.z.ai/api/coding/paas/v4/chat/completions','GLM_API_KEY',ARRAY['copilot']),
     ('Webhook-2','custom_webhook','https://hooks.exemplo.test/ai',NULL,ARRAY['copilot']);"

expect_error_as 'B.15 UPDATE para endpoint inseguro também é barrado (WITH CHECK vale no UPDATE)' \
  'ai_providers_api_endpoint_safe' \
  "UPDATE public.ai_providers SET api_endpoint = 'https://10.9.9.9/v1' WHERE name = 'DeepSeek';"
expect_error_as 'B.16 UPDATE para secret de infraestrutura também é barrado' \
  'ai_providers_api_key_secret_name_safe' \
  "UPDATE public.ai_providers SET api_key_secret_name = 'SUPABASE_SERVICE_ROLE_KEY' WHERE name = 'DeepSeek';"

expect_value 'B.17 as constraints estão CONVALIDADAS contra o legado (convalidated = true)' '2' \
  "SELECT count(*) FROM pg_constraint WHERE conrelid = 'public.ai_providers'::regclass AND contype = 'c' AND conname IN ('ai_providers_api_endpoint_safe','ai_providers_api_key_secret_name_safe') AND convalidated;"
expect_value 'B.18 nenhuma linha existente viola as regras novas (legado limpo)' '0' \
  "SELECT count(*) FROM public.ai_providers WHERE NOT public.ai_provider_endpoint_is_safe(api_endpoint) OR NOT public.ai_provider_secret_name_is_safe(api_key_secret_name);"

printf '\n============ BLOCO C — rollback do cabeçalho desfaz tudo ============\n'
rollback_sql="$(sed -n 's/^-- Rollback: //p' "$migration")"
[[ -n "$rollback_sql" ]] || fail 'a migration nao tem a linha -- Rollback:'
psql_sql "$rollback_sql" >/dev/null
expect_value 'C.1 constraints removidas pelo rollback' '0' \
  "SELECT count(*) FROM pg_constraint WHERE conrelid = 'public.ai_providers'::regclass AND conname IN ('ai_providers_api_endpoint_safe','ai_providers_api_key_secret_name_safe');"
expect_value 'C.2 funcoes de validacao removidas pelo rollback' '0' \
  "SELECT count(*) FROM pg_proc WHERE proname IN ('ai_provider_endpoint_is_safe','ai_provider_secret_name_is_safe');"
expect_ok_as 'C.3 sem a migration o defeito volta: endpoint inseguro grava de novo' \
  "INSERT INTO public.ai_providers (name, provider_type, api_endpoint, api_key_secret_name, use_for) VALUES ('pos-rollback', 'openai_compatible', 'https://10.0.0.1/v1', 'SUPABASE_SERVICE_ROLE_KEY', ARRAY['copilot']);"

printf '\nPASS: IA-EGRESS-001 — a configuracao persistida de ai_providers agora recusa endpoint/credencial inseguros (convalidado contra o legado) e o rollback restaura o estado anterior.\n'
