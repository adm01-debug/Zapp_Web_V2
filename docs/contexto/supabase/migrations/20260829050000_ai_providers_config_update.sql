UPDATE public.ai_providers SET is_active = false WHERE provider_type = 'lovable_ai'

UPDATE public.ai_providers SET api_endpoint = 'https://api.z.ai/api/coding/paas/v4/chat/completions' WHERE name = 'GLM AI'

UPDATE public.ai_providers SET config = '{"headers":{"HTTP-Referer":"https://zappweb.com.br","X-Title":"ZappWeb"}}'::jsonb WHERE name = 'OpenRouter'
