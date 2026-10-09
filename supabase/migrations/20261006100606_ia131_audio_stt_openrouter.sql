-- ia131_audio_stt_openrouter
-- Rollback: update public.ai_providers set config = jsonb_set(coalesce(config, '{}'::jsonb), '{capabilities,modalities}', '["vision"]'::jsonb, true), updated_at = now() where id = 'f99209ea-294d-4124-b480-b3ecf60c9049';

-- IA-131 / IA-AUDIO-001 — habilita ANÁLISE DE ÁUDIO no provedor OpenRouter.
--
-- Defeito corrigido no mesmo cartão: o classificador de áudio-meme inferia a
-- categoria apenas pelo nome/URL do arquivo (metadados) e a resposta não dizia
-- de onde vinha. Agora o áudio autorizado do Storage é baixado no servidor e
-- embutido na mensagem como parte `input_audio`; a modalidade `audio_stt` é
-- exatamente a que o `ai-proxy` reconhece para entrada de áudio, e é ela que o
-- despacho central exige para resolver o provedor — sem candidato que a declare,
-- a chamada falha FECHADA (NO_PROVIDER) em vez de mandar áudio ao provedor de
-- texto.
--
-- Mesmo provedor/modelo já usado para visão (não é credencial nova): o modelo
-- `google/gemini-3.8-flash` declara, na API de modelos do OpenRouter, entrada
-- `[text, image, video, file, audio]` — o áudio entra pelo mesmo caminho.
--
-- `jsonb_set` (e não `||`) para acrescentar `audio_stt` ao array EXISTENTE sem
-- apagar `headers` nem outras capacidades já declaradas; rodar duas vezes dá o
-- mesmo resultado (idempotente).
--
-- Classe: aditiva (DML com WHERE por id).

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
