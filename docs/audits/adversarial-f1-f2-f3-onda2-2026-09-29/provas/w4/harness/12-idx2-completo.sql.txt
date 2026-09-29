-- =============================================================================
-- W4 -- FASE idx2: "trgm completo" -- GIN trigram em TODAS as colunas do OR do
-- termo livre (a coluna `email` ja tem `idx_contacts_email_trgm` no canonico).
-- =============================================================================
-- Sem cobrir os 7 ramos, o `ILIKE '%termo%'` nao vira BitmapOr. Este e o conjunto
-- minimo para o termo livre poder usar indice.
\set ON_ERROR_STOP on
\timing on
CREATE INDEX IF NOT EXISTS idx_w4_contacts_name_trgm
  ON public.contacts USING gin (name extensions.gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_w4_contacts_nickname_trgm
  ON public.contacts USING gin (nickname extensions.gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_w4_contacts_surname_trgm
  ON public.contacts USING gin (surname extensions.gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_w4_contacts_phone_trgm
  ON public.contacts USING gin (phone extensions.gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_w4_contacts_company_trgm
  ON public.contacts USING gin (company extensions.gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_w4_contacts_job_title_trgm
  ON public.contacts USING gin (job_title extensions.gin_trgm_ops);
\timing off
ANALYZE public.contacts;
