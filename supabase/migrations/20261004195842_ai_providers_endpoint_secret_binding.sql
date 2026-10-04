-- ai_providers_endpoint_secret_binding
-- Rollback: ALTER TABLE public.ai_providers DROP CONSTRAINT IF EXISTS ai_providers_api_endpoint_safe, DROP CONSTRAINT IF EXISTS ai_providers_api_key_secret_name_safe; DROP FUNCTION IF EXISTS public.ai_provider_endpoint_is_safe(text); DROP FUNCTION IF EXISTS public.ai_provider_secret_name_is_safe(text);

-- IA-EGRESS-001: o endpoint (api_endpoint) e o nome do secret (api_key_secret_name)
-- de ai_providers são configuráveis pelo painel e eram usados sem nenhuma validação
-- de banco. Estas constraints vinculam os valores persistidos a destinos/credenciais
-- seguros (defesa em profundidade — a validação de egress no código é a defesa primária):
--   - api_key_secret_name: formato de variável de ambiente e FORA da lista de secrets
--     de infraestrutura (ex.: SUPABASE_SERVICE_ROLE_KEY não pode virar credencial);
--   - api_endpoint: https, sem credencial embutida (@) e sem literal de IP (DNS público).
-- Os dados atuais de produção (lovable_ai, DeepSeek, GLM, OpenRouter) já satisfazem.

CREATE OR REPLACE FUNCTION public.ai_provider_secret_name_is_safe(secret_name text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT secret_name IS NULL OR (
    secret_name ~ '^[A-Z][A-Z0-9_]{0,63}$'
    AND NOT (secret_name = ANY (ARRAY[
      'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_ANON_KEY', 'SUPABASE_PUBLISHABLE_KEY',
      'SUPABASE_URL', 'SUPABASE_FUNCTIONS_URL',
      'EVOLUTION_API_KEY', 'EVOLUTION_INSTANCE_TOKEN', 'EVOLUTION_INSTANCE_NAME',
      'EVOLUTION_API_URL', 'EVOLUTION_API_FLAVOR',
      'CRON_SECRET', 'INTERNAL_ALERT_SECRET',
      'PREVIEW_EGRESS_SHARED_SECRET', 'PREVIEW_EGRESS_PROXY_URL',
      'MEDIA_EGRESS_ALLOWED_HOSTS', 'MEDIA_EGRESS_ALLOWED_ORIGINS',
      'TALKX_ENGINE_JWT', 'TALKX_ENGINE_ANON_JWT', 'TALKX_ENGINE_POSTGREST_URL',
      'TALKX_LINK_BASE_URL', 'RESEND_API_KEY',
      'PROMOGIFTS_SUPABASE_SERVICE_ROLE_KEY', 'PROMOGIFTS_SUPABASE_URL',
      'BITRIX_WEBHOOK_URL', 'CHATBOT_L1_WEBHOOK_SECRET'
    ]))
  );
$$;

CREATE OR REPLACE FUNCTION public.ai_provider_endpoint_is_safe(endpoint text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT endpoint IS NULL OR (
    endpoint ~ '^https://'
    AND position('@' in endpoint) = 0
    AND endpoint !~ '^https://[0-9]'
    AND endpoint !~ '^https://\[[0-9a-fA-F:]+\]'
  );
$$;

ALTER TABLE public.ai_providers
  ADD CONSTRAINT ai_providers_api_key_secret_name_safe
  CHECK (public.ai_provider_secret_name_is_safe(api_key_secret_name));

ALTER TABLE public.ai_providers
  ADD CONSTRAINT ai_providers_api_endpoint_safe
  CHECK (public.ai_provider_endpoint_is_safe(api_endpoint));
