-- IA-033 / Bloco 04 PR-4 — habilita VISÃO no provedor OpenRouter.
--
-- Decisão do Joaquim (20261001-184703-ff10, 01/10/2026 18h47): a visão passa a ser
-- atendida por GEMINI FLASH via OpenRouter, que já está ativo e já tem chave —
-- sem criar provedor Google direto e sem credencial nova. O DeepSeek continua
-- sendo o provedor PADRÃO de TEXTO (`is_default = true`), intocado por esta migration.
--
-- Modelo confirmado na API de modelos do OpenRouter em 01/10/2026 (não chutado):
-- `google/gemini-3.8-flash`, created=1788362056, context_length=1048576,
-- architecture.input_modalities = [text, image, video, file, audio] — aceita imagem,
-- que é o requisito dos classificadores. As variantes `google/gemini-3.8-flash:batch`
-- existem e NÃO são usadas aqui.
--
-- Por que `||` e não substituição do config: o OpenRouter já tem
-- `config.headers` (X-Title / HTTP-Referer) usados nas chamadas dele. Trocar o config
-- inteiro apagaria esses cabeçalhos; o operador `||` faz merge do JSONB e preserva o
-- que já existe, acrescentando apenas `capabilities.modalities`.
--
-- Classe: aditiva (DML com `where` por id; não remove nem sobrescreve dado existente).
-- rollback: update public.ai_providers set model = null, config = '{"headers":{"X-Title":"ZappWeb","HTTP-Referer":"https://zappweb.com.br"}}'::jsonb, updated_at = now() where id = 'f99209ea-294d-4124-b480-b3ecf60c9049';

update public.ai_providers
   set model      = 'google/gemini-3.8-flash',
       config     = config || '{"capabilities":{"modalities":["vision"]}}'::jsonb,
       updated_at = now()
 where id = 'f99209ea-294d-4124-b480-b3ecf60c9049'
   and name = 'OpenRouter';
