update public.ai_providers
   set model      = 'google/gemini-3.8-flash',
       config     = config || '{"capabilities":{"modalities":["vision"]}}'::jsonb,
       updated_at = now()
 where id = 'f99209ea-294d-4124-b480-b3ecf60c9049'
   and name = 'OpenRouter'
