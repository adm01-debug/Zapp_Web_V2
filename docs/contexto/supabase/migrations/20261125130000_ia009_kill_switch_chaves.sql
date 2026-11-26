-- IA-009 / SL-010 — Sementes das chaves de desligamento da IA
--
-- POR QUE ESTA MIGRATION EXISTE: o gate de IA da main (`_shared/ai-feature-flags.ts`)
-- le `public.feature_flags` por chave e trata AUSENCIA DA LINHA como LIGADO
-- ("sem seed, ausencia e 'o operador nao desligou'"). Consequencia pratica: enquanto a
-- linha nao existe, o operador que desliga a IA com
--   UPDATE public.feature_flags SET enabled = false WHERE key = 'ai.capability.voice';
-- atinge ZERO linhas, NAO recebe erro nenhum, e a IA continua no ar e continuando a
-- custar. O desligamento imediato sem deploy e requisito do cartao (IA-009 secao 2.1).
-- A semente torna cada chave LIGADA (enabled = true) de forma explicita: desligar
-- passa a ser um UPDATE de uma linha, e "ligado" deixa de ser "linha que ninguem criou".
--
-- ESCOPO 1 — CAPACIDADE (`ai.capability.*`, secao 2.1): exatamente as capacidades que
-- o codigo da main consome hoje (AI_CAPABILITY_BY_FUNCTION + `aiCapabilityFlagKey`):
--   suggest_reply, enhance_message, summary, conversation_analysis, auto_tag, churn,
--   classify_tickets, transcribe_audio, voice.
--
-- ESCOPO 2 — PROVEDOR (`ai.provider.*`, secao 2.2): os nomes que o desenho usa,
-- traduzidos a partir do vocabulario fechado de `ai_providers.provider_type`
-- (enum: lovable_ai, openai_compatible, google_gemini, custom_webhook, custom_agent)
-- mais `elevenlabs` — a transcricao fala com a ElevenLabs FORA de `ai_providers`.
-- A traducao vive no codigo (AI_PROVIDER_FLAG_NAME_BY_TYPE): sem ela, a chave que o
-- operador desliga conforme o desenho nao seria a chave consultada.
--
-- O que NAO entra aqui, de proposito:
--   1. `ai.capability.chatbot_l1`: o bot de nivel 1 NAO usa a leitura permissiva —
--      `readChatbotL1Flag` (evolution-webhook-messages.ts) e FECHADA e trata AUSENCIA
--      como DESLIGADO. A linha nao existe hoje: semear `true` LIGARIA o bot em
--      producao (automacao respondendo contato de verdade, com custo). Ligar o bot
--      e decisao de operacao, nao semente.
--   2. `ai.capability.copilot_live`: ja semeada DESLIGADA por
--      20261115010000_copilot_live_motor.sql (custo por mensagem, decisao contraria).
--   3. `ai.provider.anthropic`: nao existe no enum de `ai_providers` e nenhuma Edge
--      chama Anthropic hoje — semear daria linha que o operador desliga sem efeito.
--   4. `ai.bot.<connectionId>` (secao 2.3): pausa de UMA conexao; a ausencia nao pausa
--      nada. Criar linha por conexao aqui seria inventar decisao de operacao.
--   5. `classify-*` e `ai-proxy`: fora do gate por decisao explicita do desenho
--      (funcao sem capacidade declarada nao nasce desligada por engano).
--
-- Reversao:
--   DELETE FROM public.feature_flags
--    WHERE (key LIKE 'ai.capability.%' AND key <> 'ai.capability.copilot_live')
--       OR key LIKE 'ai.provider.%';
--   (volta ao estado "ligado por ausencia", sem alterar comportamento)

INSERT INTO public.feature_flags (key, enabled, description)
VALUES
  -- Capacidades (secao 2.1)
  ('ai.capability.suggest_reply', true, 'IA-009: sugestao de resposta por IA (ai-suggest-reply) habilitada'),
  ('ai.capability.enhance_message', true, 'IA-009: reescrita/melhoria de mensagem por IA (ai-enhance-message) habilitada'),
  ('ai.capability.summary', true, 'IA-009: resumo de conversa por IA (ai-conversation-summary) habilitado'),
  ('ai.capability.conversation_analysis', true, 'IA-009: analise de conversa por IA (ai-conversation-analysis) habilitada'),
  ('ai.capability.auto_tag', true, 'IA-009: etiquetagem automatica por IA (ai-auto-tag) habilitada'),
  ('ai.capability.churn', true, 'IA-009: leitura de churn (ai-churn-analysis; hoje calculo local, sem provedor) habilitada'),
  ('ai.capability.classify_tickets', true, 'IA-009: classificacao de tickets (ai-classify-tickets; hoje calculo local, sem provedor) habilitada'),
  ('ai.capability.transcribe_audio', true, 'IA-009: transcricao de audio por IA (ai-transcribe-audio) habilitada'),
  ('ai.capability.voice', true, 'IA-009/SL-010b: voz e audio da ElevenLabs (voice-agent, elevenlabs-* e voice-changer) habilitados'),
  -- Provedores (secao 2.2) — lidos pelo gate de provedor (_shared/ai-feature-flags.ts)
  ('ai.provider.openai', true, 'IA-009: provedores do tipo openai_compatible (DeepSeek/OpenAI) habilitados'),
  ('ai.provider.gemini', true, 'IA-009: provedores do tipo google_gemini habilitados'),
  ('ai.provider.lovable_ai', true, 'IA-009: provedores do tipo lovable_ai habilitados'),
  ('ai.provider.custom_webhook', true, 'IA-009: provedores do tipo custom_webhook habilitados'),
  ('ai.provider.custom_agent', true, 'IA-009: provedores do tipo custom_agent habilitados'),
  ('ai.provider.elevenlabs', true, 'IA-009: ElevenLabs (transcricao de audio e voz, fora de ai_providers) habilitada')
ON CONFLICT (key) DO NOTHING
