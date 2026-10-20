-- talkx_recipients está em supabase_realtime com lista explícita de colunas que
-- inclui todas as 29 colunas da tabela. PostgreSQL proíbe REPLICA IDENTITY FULL
-- em tabela com column list em publicação (erro 42P10), mesmo que a lista seja
-- completa. Solução: remover a lista explícita da entrada da publicação — publica
-- as mesmas 29 colunas, sem a restrição que conflita com FULL.
-- Mantém REPLICA IDENTITY FULL (necessário para filtros por campaign_id no Realtime).
ALTER PUBLICATION supabase_realtime DROP TABLE public.talkx_recipients;
ALTER PUBLICATION supabase_realtime ADD TABLE public.talkx_recipients;
