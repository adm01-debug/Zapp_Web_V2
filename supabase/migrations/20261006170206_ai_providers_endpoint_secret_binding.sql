-- ai_providers_endpoint_secret_binding (IA-EGRESS-001 / item 20)
-- Rollback: ALTER TABLE public.ai_providers DROP CONSTRAINT IF EXISTS ai_providers_api_endpoint_safe; ALTER TABLE public.ai_providers DROP CONSTRAINT IF EXISTS ai_providers_api_key_secret_name_safe; DROP FUNCTION IF EXISTS public.ai_provider_endpoint_is_safe(text); DROP FUNCTION IF EXISTS public.ai_provider_secret_name_is_safe(text);

-- IA-EGRESS-001: `ai_providers.api_endpoint` e `ai_providers.api_key_secret_name` são
-- configuráveis pelo painel administrativo e eram persistidos sem nenhuma validação de
-- banco ("Vinculação segura completa" — required_fix: "Validar também a configuração
-- persistida e casos negativos de administrador"). Estas constraints passam a BINDAR o
-- que fica gravado na tabela:
--   * api_key_secret_name — ALLOWLIST POSITIVA de credenciais de provedor de IA.
--     É lista positiva de propósito: uma lista negativa deixaria passar qualquer
--     secret de INFRAESTRUTURA que ninguém enumerou (GITHUB_TOKEN,
--     TYPES_SYNC_PR_TOKEN, SUPABASE_SERVICE_ROLE_KEY...). Nome NULL é permitido
--     (provedor sem chave, ex.: custom_webhook público). Provedor novo ⇒ acrescente
--     o nome da chave na função abaixo.
--   * api_endpoint — só HTTPS, sem credencial embutida (userinfo), sem literal de
--     IPv4/IPv6, host com domínio (não rótulo único) e porta explícita igual a 443
--     (ou ausente). NULL é permitido (provedor lovable_ai usa o gateway interno).
--     Host interno/localhost é recusado.
-- A validação de egress no runtime (DNS resolvido, redirect e IP privado alcançável
-- por hostname) é a defesa primária e vive no dispatcher de Edge Functions; esta
-- constraint é a defesa no ponto de gravação, para que uma configuração privilegiada
-- errada/maliciosa não chegue sequer a ser persistida.
--
-- Duas etapas (NOT VALID + VALIDATE): o ADD não trava a tabela por tempo longo e o
-- VALIDATE confirma, contra as linhas que JÁ existem, que ninguém viola a regra nova
-- (é a prova do legado no momento da migration; se alguma linha violasse, a migration
-- abortaria em vez de deixar a constraint como letra morta).

CREATE OR REPLACE FUNCTION public.ai_provider_secret_name_is_safe(secret_name text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $fn$
  SELECT secret_name IS NULL OR secret_name = ANY (ARRAY[
    'DEEPSEEK_API_KEY',
    'GLM_API_KEY',
    'GROQ_API_KEY',
    'LOVABLE_API_KEY',
    'OPENAI_API_KEY',
    'OPENROUTER_API_KEY'
  ]::text[]);
$fn$;

CREATE OR REPLACE FUNCTION public.ai_provider_endpoint_is_safe(endpoint text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $fn$
  SELECT endpoint IS NULL OR (
    lower(endpoint) !~ '^https://([^/?#]*\.)?(localhost|local|internal|lan|home|corp|intranet)([:/?#]|$)'
    AND EXISTS (
      SELECT 1
      FROM (SELECT (regexp_match(lower(endpoint), '^https://([^/?#]+)'))[1] AS authority) AS e
      WHERE e.authority IS NOT NULL
        -- sem credencial embutida (userinfo: user:senha@host)
        AND position('@' IN e.authority) = 0
        -- sem literal de IPv4 (ex.: 10.0.0.1 ou 10.0.0.1:443)
        AND e.authority !~ '^[0-9]{1,3}(\.[0-9]{1,3}){3}(:[0-9]+)?$'
        -- sem literal de IPv6 (na URL vem sempre entre colchetes)
        AND e.authority !~ '^\['
        -- host tem de ser nome com domínio público (não rótulo único)
        AND position('.' IN e.authority) > 0
        -- porta explícita: só a padrão do https (443); qualquer outra é recusada
        AND (position(':' IN e.authority) = 0 OR e.authority ~ ':443$')
    )
  );
$fn$;

ALTER TABLE public.ai_providers
  DROP CONSTRAINT IF EXISTS ai_providers_api_key_secret_name_safe;
ALTER TABLE public.ai_providers
  ADD CONSTRAINT ai_providers_api_key_secret_name_safe
  CHECK (public.ai_provider_secret_name_is_safe(api_key_secret_name)) NOT VALID;
ALTER TABLE public.ai_providers
  VALIDATE CONSTRAINT ai_providers_api_key_secret_name_safe;

ALTER TABLE public.ai_providers
  DROP CONSTRAINT IF EXISTS ai_providers_api_endpoint_safe;
ALTER TABLE public.ai_providers
  ADD CONSTRAINT ai_providers_api_endpoint_safe
  CHECK (public.ai_provider_endpoint_is_safe(api_endpoint)) NOT VALID;
ALTER TABLE public.ai_providers
  VALIDATE CONSTRAINT ai_providers_api_endpoint_safe;
