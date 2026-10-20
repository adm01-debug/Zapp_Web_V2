-- ai_providers: registrar mudancas feitas direto no banco em 2026-08-29
-- 1. Lovable AI desativada (sem key, fallback migrado para OpenRouter)
UPDATE public.ai_providers
  SET is_active = false
  WHERE provider_type = 'lovable_ai';

-- 2. GLM AI: endpoint correto do Coding Plan
UPDATE public.ai_providers
  SET api_endpoint = 'https://api.z.ai/api/coding/paas/v4/chat/completions'
  WHERE name = 'GLM AI';

-- 3. OpenRouter: config.headers correto (nao extra_headers)
UPDATE public.ai_providers
  SET config = '{"headers":{"HTTP-Referer":"https://zappweb.com.br","X-Title":"ZappWeb"}}'::jsonb
  WHERE name = 'OpenRouter';
