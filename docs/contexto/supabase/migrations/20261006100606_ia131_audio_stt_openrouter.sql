update public.ai_providers
   set config = jsonb_set(
         coalesce(config, '{}'::jsonb),
         '{capabilities,modalities}',
         '["vision","audio_stt"]'::jsonb,
         true
       ),
       updated_at = now()
 where id = 'f99209ea-294d-4124-b480-b3ecf60c9049'
   and name = 'OpenRouter';
