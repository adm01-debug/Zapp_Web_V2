-- Defesa em profundidade (E24, revisao da matriz RLS 2026-09-16): as 3
-- tabelas do E90 (talkx_links, talkx_link_clicks, talkx_conversions) tem
-- RLS habilitado com ZERO policies -- ja nega qualquer leitura/escrita para
-- anon/authenticated independente do grant de tabela existir. Mas o grant
-- de schema padrao do Supabase para anon/authenticated na criacao do objeto
-- (que REVOKE ALL ... FROM PUBLIC nao desfaz -- mesmo gotcha ja corrigido
-- 4x nesta sessao para funcoes) ainda estava presente nessas 3 tabelas.
-- Nao explora nada hoje (RLS ja bloqueia), mas fecha a superficie por
-- completo em vez de depender so do RLS como unica camada.
REVOKE ALL ON public.talkx_links FROM anon, authenticated;
REVOKE ALL ON public.talkx_link_clicks FROM anon, authenticated;
REVOKE ALL ON public.talkx_conversions FROM anon, authenticated;
