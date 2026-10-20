-- Reconcilia drift: public.conversation_tasks foi adicionada a publicacao
-- supabase_realtime fora do fluxo arquivo->PR->merge (sem migration registrada).
-- Este arquivo documenta o DDL aplicado diretamente em producao.
-- IMPORTANTE: nao reaplicar manualmente — a tabela ja esta na publicacao.
-- Para verificar: SELECT tablename FROM pg_publication_tables
--   WHERE pubname = 'supabase_realtime' AND tablename = 'conversation_tasks';
ALTER PUBLICATION supabase_realtime ADD TABLE public.conversation_tasks;
