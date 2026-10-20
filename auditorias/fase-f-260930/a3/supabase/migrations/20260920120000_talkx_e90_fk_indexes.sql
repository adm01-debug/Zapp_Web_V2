-- E14 (plano 2026-09-20): as 3 unicas FKs de public sem indice no lado
-- filho, todas das tabelas E90 (hoje vazias — custo de criacao zero).
-- Sem estes indices, DELETE/UPDATE em talkx_recipients e talkx_links
-- viraria seq scan nas filhas quando o modulo entrar em producao
-- (ON DELETE SET NULL das tres constraints). CONCURRENTLY nao e usado
-- de proposito: o gateway do MCP envolve tudo em transacao (§1.5) e as
-- tabelas estao vazias.
CREATE INDEX IF NOT EXISTS idx_talkx_link_clicks_recipient_id
  ON public.talkx_link_clicks (recipient_id);
CREATE INDEX IF NOT EXISTS idx_talkx_conversions_recipient_id
  ON public.talkx_conversions (recipient_id);
CREATE INDEX IF NOT EXISTS idx_talkx_conversions_link_id
  ON public.talkx_conversions (link_id);
