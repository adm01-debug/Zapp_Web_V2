-- E27: adiciona talkx_campaign_events, talkx_segments e talkx_templates
-- à publicação supabase_realtime.
--
-- talkx_campaigns e talkx_recipients já estão na publicação (a última com
-- filtro de colunas para strip de PII — 20260927420000). As três tabelas
-- adicionadas aqui não contêm tokens de entrega nem mensagem personalizada,
-- logo são publicadas integralmente (sem filtro de coluna).
--
-- Com isso, a publicação cobre todas as tabelas que o canal Realtime do
-- Talk X precisa para manter a UI atualizada em tempo real (E27).

ALTER PUBLICATION supabase_realtime ADD TABLE public.talkx_campaign_events;
ALTER PUBLICATION supabase_realtime ADD TABLE public.talkx_segments;
ALTER PUBLICATION supabase_realtime ADD TABLE public.talkx_templates;
