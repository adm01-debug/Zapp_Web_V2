-- ia009_kill_switch_de_ia
-- Rollback:
--   DELETE FROM public.feature_flags WHERE key IN (
--     'ai.capability.suggest_reply','ai.capability.enhance_message','ai.capability.summary',
--     'ai.capability.conversation_analysis','ai.capability.auto_tag','ai.capability.churn',
--     'ai.capability.classify_tickets','ai.capability.transcribe_audio','ai.capability.voice',
--     'ai.capability.chatbot_l1','ai.capability.classify-emoji','ai.capability.classify-sticker',
--     'ai.capability.classify-audio-meme','ai.capability.ai-proxy','ai.capability.ai-jobs-worker',
--     'ai.provider.openai','ai.provider.gemini','ai.provider.elevenlabs','ai.provider.anthropic',
--     'ai.provider.lovable_ai','ai.provider.custom_webhook','ai.provider.custom_agent');
--
-- IA-009 — kill switch de IA operável NO SERVIDOR (capacidade, provedor e bot).
--
-- Por que esta migration existe: o desenho do IA-009 (docs/ia/IA-009-desligamento-seguro.md
-- §2) define as chaves em `feature_flags` — a tabela que já existe, sem estrutura nova —
-- mas até aqui NENHUMA Edge Function lia a tabela (a chave só escondia o botão no cliente;
-- quem chamasse a função direto continuava consumindo provedor). O leitor do servidor é
-- `supabase/functions/_shared/ai-kill-switch.ts`, consumido pelo despacho central
-- (`generateWithRouting`), pelo `ai-proxy`, pelo `ai-transcribe-audio` e pela pausa de bot
-- do `chatbot-l1`.
--
-- Por que SEMEAR LIGADO: o leitor é FECHADO — chave de capacidade/provedor ausente, falsa
-- ou leitura falhando NEGA (§2.5: "falha de leitura nunca reative efeito automático").
-- Sem estas linhas, o comportamento de hoje (IA rodando) passaria a ser "desligado por
-- omissão". Semear `enabled = true` torna o estado atual EXPLÍCITO e deixa o desligamento
-- ser uma escrita de uma linha, sem deploy — que é o aceite da etapa.
--
-- O que NÃO entra aqui: `ai.bot.<connectionId>` (§2.3) é pausa de UMA conexão, não
-- permissão. A ausência dela não pausa nada (as conexões existentes seguem como estão);
-- quem pausa cria a linha com `enabled = false`. Criar linha por conexão nesta migration
-- seria inventar decisão de operação sobre conexões que não são deste cartão.

INSERT INTO public.feature_flags (key, enabled, description)
VALUES
  -- §2.1 — capacidade por função de IA (despacho central). `ai.capability.<slug>` usa o
  -- slug do desenho; função sem slug declarado lá usa o próprio nome (classify-* e o
  -- proxy genérico), para nenhuma chamada ao provedor ficar sem chave de desligamento.
  ('ai.capability.suggest_reply', true, 'IA-009: capacidade de sugestao de resposta (ai-suggest-reply)'),
  ('ai.capability.enhance_message', true, 'IA-009: capacidade de reescrita/melhoria de mensagem (ai-enhance-message)'),
  ('ai.capability.summary', true, 'IA-009: capacidade de resumo de conversa (ai-conversation-summary)'),
  ('ai.capability.conversation_analysis', true, 'IA-009: capacidade de analise de conversa (ai-conversation-analysis)'),
  ('ai.capability.auto_tag', true, 'IA-009: capacidade de etiquetagem automatica (ai-auto-tag)'),
  ('ai.capability.churn', true, 'IA-009: capacidade de leitura de churn (ai-churn-analysis; hoje calculo local, sem provedor)'),
  ('ai.capability.classify_tickets', true, 'IA-009: capacidade de classificacao de tickets (ai-classify-tickets; hoje calculo local, sem provedor)'),
  ('ai.capability.transcribe_audio', true, 'IA-009: capacidade de transcricao de audio (ai-transcribe-audio)'),
  ('ai.capability.voice', true, 'IA-009: capacidade de voz (voice-agent)'),
  ('ai.capability.chatbot_l1', true, 'IA-009: capacidade do bot nivel 1 (chatbot-l1)'),
  ('ai.capability.classify-emoji', true, 'IA-009: classificacao de emoji por IA (classify-emoji)'),
  ('ai.capability.classify-sticker', true, 'IA-009: classificacao de figurinha por IA (classify-sticker)'),
  ('ai.capability.classify-audio-meme', true, 'IA-009: classificacao de audio/meme por IA (classify-audio-meme)'),
  ('ai.capability.ai-proxy', true, 'IA-009: proxy generico de IA (copilot, ajuda, deteccao de objecao)'),
  ('ai.capability.ai-jobs-worker', true, 'IA-009: identidade reservada da fila de jobs de IA (ai_jobs.function_name)'),
  -- §2.2 — chave de provedor com os nomes do DESENHO (`ai.provider.openai`, `.gemini`,
  -- `.elevenlabs`, `.anthropic`). O `provider_type` do banco usa outro vocabulario, e a
  -- traducao fica em `ai-kill-switch.ts` (AI_PROVIDER_KEY_BY_TYPE). `elevenlabs` entra
  -- porque a transcricao fala com a ElevenLabs fora de `ai_providers`.
  ('ai.provider.openai', true, 'IA-009: provedor OpenAI (provider_type openai_compatible) habilitado'),
  ('ai.provider.gemini', true, 'IA-009: provedor Gemini (provider_type google_gemini) habilitado'),
  ('ai.provider.anthropic', true, 'IA-009: provedor Anthropic habilitado (chave do desenho §2.2)'),
  ('ai.provider.lovable_ai', true, 'IA-009: provedor tipo lovable_ai habilitado'),
  ('ai.provider.custom_webhook', true, 'IA-009: provedor tipo custom_webhook habilitado'),
  ('ai.provider.custom_agent', true, 'IA-009: provedor tipo custom_agent habilitado'),
  ('ai.provider.elevenlabs', true, 'IA-009: provedor ElevenLabs (transcricao de audio) habilitado')
ON CONFLICT (key) DO NOTHING;

COMMENT ON TABLE public.feature_flags IS 'Feature flags globais (key -> enabled). Leitura por qualquer usuario autenticado, escrita apenas admin via RLS. Consumido por useFeatureFlag no front e, desde o IA-009, pelo kill switch de IA no servidor (_shared/ai-kill-switch.ts: ai.capability.* / ai.provider.* / ai.bot.<connectionId>).';
