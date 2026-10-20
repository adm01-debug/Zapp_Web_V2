-- =============================================================================
-- W4 -- devolve `public.contacts` ao estado CANONICO de indices: remove apenas o
-- que os scripts 11/12/13 criam (6 GIN trigram + 8 btree ordenados parciais),
-- preservando exatamente o conjunto que existe no HEAD (03-baseline-indexes.sql).
-- =============================================================================
\set ON_ERROR_STOP on
DROP INDEX IF EXISTS public.idx_w4_contacts_name_trgm;
DROP INDEX IF EXISTS public.idx_w4_contacts_company_trgm;
DROP INDEX IF EXISTS public.idx_w4_contacts_job_title_trgm;
DROP INDEX IF EXISTS public.idx_w4_contacts_nickname_trgm;
DROP INDEX IF EXISTS public.idx_w4_contacts_surname_trgm;
DROP INDEX IF EXISTS public.idx_w4_contacts_phone_trgm;
DROP INDEX IF EXISTS public.idx_w4_live_name;
DROP INDEX IF EXISTS public.idx_w4_live_name_desc;
DROP INDEX IF EXISTS public.idx_w4_live_created;
DROP INDEX IF EXISTS public.idx_w4_live_created_desc;
DROP INDEX IF EXISTS public.idx_w4_live_updated_desc;
DROP INDEX IF EXISTS public.idx_w4_live_company;
DROP INDEX IF EXISTS public.idx_w4_live_company_desc;
DROP INDEX IF EXISTS public.idx_w4_live_type;
ANALYZE public.contacts;
