-- ai_capability_kill_switch
-- Rollback: delete from public.feature_flags where key like 'ai.capability.%';
--
-- SL-009 (inventário B8 · IA / Kill switch · fonte docs/ia/IA-009-desligamento-seguro.md).
--
-- Fecha a lacuna: `feature_flags` era lida só no cliente e, no servidor, só por
-- `crm-integration`. A partir do leitor `supabase/functions/_shared/ai-feature-flags.ts`,
-- cada capacidade de IA é conferida no caminho de execução — antes de reservar
-- orçamento, de bater no contador compartilhado e de chamar o provedor.
--
-- POR QUE ESTAS LINHAS SÃO OBRIGATÓRIAS: o padrão seguro do desenho é
-- "ausência de chave = DESLIGADO" (IA-009 §2.5, mesmo princípio do `fallback = false`
-- do hook do cliente). Publicar o leitor sem estas chaves desligaria 100% da IA
-- no ato. Elas entram LIGADAS para preservar o comportamento atual; desligar é
-- operação de admin na tabela (sem deploy), que é exatamente o kill switch.
--
-- DML aditivo e idempotente: `on conflict (key) do nothing` NÃO sobrescreve uma
-- decisão do operador — se a chave já existe desligada, continua desligada.
-- Nenhum DDL: a tabela `feature_flags` e as policies já existem (20260905060000).
insert into public.feature_flags (key, enabled, description) values
  ('ai.capability.suggest_reply',       true, 'IA: sugestao de resposta (kill switch lido no servidor)'),
  ('ai.capability.enhance_message',     true, 'IA: melhoria de mensagem (kill switch lido no servidor)'),
  ('ai.capability.summary',             true, 'IA: resumo de conversa (kill switch lido no servidor)'),
  ('ai.capability.conversation_analysis', true, 'IA: analise de conversa (kill switch lido no servidor)'),
  ('ai.capability.auto_tag',            true, 'IA: etiquetagem automatica (kill switch lido no servidor)'),
  ('ai.capability.churn',               true, 'IA: analise de churn (kill switch lido no servidor)'),
  ('ai.capability.classify_tickets',    true, 'IA: classificacao de tickets (kill switch lido no servidor)'),
  ('ai.capability.transcribe_audio',    true, 'IA: transcricao de audio (kill switch lido no servidor)'),
  ('ai.capability.voice',               true, 'IA: voz / copiloto de ligacao (kill switch lido no servidor)'),
  ('ai.capability.chatbot_l1',          true, 'IA: chatbot L1 (kill switch lido no servidor)')
on conflict (key) do nothing;
