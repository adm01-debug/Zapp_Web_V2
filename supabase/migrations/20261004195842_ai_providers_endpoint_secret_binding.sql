-- ai_providers_endpoint_secret_binding
-- Rollback: ALTER TABLE public.ai_providers DROP CONSTRAINT IF EXISTS ai_providers_api_endpoint_safe, DROP CONSTRAINT IF EXISTS ai_providers_api_key_secret_name_safe; DROP FUNCTION IF EXISTS public.ai_provider_endpoint_is_safe(text); DROP FUNCTION IF EXISTS public.ai_provider_secret_name_is_safe(text);

-- IA-EGRESS-001: o endpoint (api_endpoint) e o nome do secret (api_key_secret_name)
-- de ai_providers são configuráveis pelo painel e eram usados sem nenhuma validação
-- de banco. Estas constraints vinculam os valores persistidos a destinos/credenciais
-- seguros (defesa em profundidade — a validação de egress no código é a defesa primária):
--   - api_key_secret_name: ALLOWLIST explícita de credenciais de provedor. Lista
--     positiva: qualquer nome que não seja chave de provedor conhecida é recusado,
--     inclusive secrets de infraestrutura que ninguém enumerou (GITHUB_TOKEN,
--     TYPES_SYNC_PR_TOKEN, EXTERNAL_SUPABASE_SERVICE_ROLE_KEY...) — uma lista
--     negativa sempre deixaria o próximo secret criado passando;
--   - api_endpoint: https, sem credencial embutida (@), sem literal de IP, sem
--     porta explícita diferente de 443 e sem hostname interno/localhost.
-- A allowlist espelha AI_PROVIDER_SECRET_ALLOWLIST em
-- supabase/functions/_shared/ai-provider-egress.ts (provedor novo entra nos dois).
-- Os dados atuais de produção (lovable_ai, DeepSeek, GLM, OpenRouter) já satisfazem.

CREATE OR REPLACE FUNCTION public.ai_provider_secret_name_is_safe(secret_name text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT secret_name IS NULL OR secret_name = ANY (ARRAY[
    'DEEPSEEK_API_KEY',
    'GLM_API_KEY',
    'GROQ_API_KEY',
    'LOVABLE_API_KEY',
    'OPENAI_API_KEY',
    'OPENROUTER_API_KEY'
  ]);
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
    -- sem porta explícita (443 é o padrão do https; ":443" também não é aceito aqui)
    AND endpoint !~ '^https://[^/]+:[0-9]+'
    -- sem hostname interno/localhost
    AND endpoint !~* '^https://([^/]*\.)?(localhost|local|internal|lan|home|corp|intranet)([:/]|$)'
  );
$$;

-- Idempotente: o banco local da tarefa pode já ter a constraint (reaplicação do
-- conjunto de migrations); DROP IF EXISTS + ADD é a convenção do repositório.
ALTER TABLE public.ai_providers
  DROP CONSTRAINT IF EXISTS ai_providers_api_key_secret_name_safe;
ALTER TABLE public.ai_providers
  ADD CONSTRAINT ai_providers_api_key_secret_name_safe
  CHECK (public.ai_provider_secret_name_is_safe(api_key_secret_name));

ALTER TABLE public.ai_providers
  DROP CONSTRAINT IF EXISTS ai_providers_api_endpoint_safe;
ALTER TABLE public.ai_providers
  ADD CONSTRAINT ai_providers_api_endpoint_safe
  CHECK (public.ai_provider_endpoint_is_safe(api_endpoint));
