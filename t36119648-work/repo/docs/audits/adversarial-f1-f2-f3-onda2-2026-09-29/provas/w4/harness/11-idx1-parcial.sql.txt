-- =============================================================================
-- W4 -- FASE idx1: "trgm parcial" (2 colunas) -- a mudanca MINIMA que alguem
-- faria olhando para os termos mais comuns (nome e empresa).
-- =============================================================================
-- Hipotese a TESTAR: com 2 indices dos 7 ramos do OR cobertos, o planner AINDA
-- nao pode montar BitmapOr (cada ramo de um OR precisa ser indexavel para o OR
-- inteiro virar bitmap). Se a hipotese estiver certa, o plano continua Seq Scan.
\set ON_ERROR_STOP on
\timing on
CREATE INDEX IF NOT EXISTS idx_w4_contacts_name_trgm
  ON public.contacts USING gin (name extensions.gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_w4_contacts_company_trgm
  ON public.contacts USING gin (company extensions.gin_trgm_ops);
\timing off
ANALYZE public.contacts;
