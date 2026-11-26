CREATE OR REPLACE FUNCTION public.ai_provider_secret_name_is_safe(secret_name text)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
AS $function$
  SELECT secret_name IS NULL OR secret_name = ANY (ARRAY[
    'DEEPSEEK_API_KEY',
    'GLM_API_KEY',
    'GROQ_API_KEY',
    'LOVABLE_API_KEY',
    'OPENAI_API_KEY',
    'OPENROUTER_API_KEY'
  ]);
$function$
