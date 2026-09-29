-- =============================================================================
-- W4 -- Equivalencia funcional das variantes (prova de que a medicao compara
-- o MESMO resultado, nao versoes que respondem outra coisa).
--   psql -v uid=<uuid> -f 08-equivalencia.sql
-- =============================================================================
\set ON_ERROR_STOP on
SELECT set_config('request.jwt.claim.sub', :'uid', false);

\pset border 2
WITH params AS (
  SELECT * FROM (VALUES
    ('sem_filtro',     NULL,    NULL,   NULL, NULL, NULL, NULL),
    ('termo_nome_5ch', 'silva', NULL,   NULL, NULL, NULL, NULL),
    ('filtro_tipo',    NULL,    'lead', NULL, NULL, NULL, NULL),
    ('filtro_tag',     NULL,    NULL,   NULL, NULL, 'vip', NULL),
    ('combinado',      'silva', 'lead', NULL, NULL, 'vip', (now() - interval '90 days'))
  ) t(name, search_term, ctype, company, job_title, tag, date_from)
), sorts AS (
  SELECT * FROM (VALUES ('name','asc'),('name','desc'),('created_at','asc'),
                        ('created_at','desc'),('updated_at','asc'),('updated_at','desc')
                ) v(sort_field, sort_dir)
), cmp AS (
  SELECT p.name AS cenario, s.sort_field, s.sort_dir,
    (SELECT md5(string_agg(x.id::text, ',' ORDER BY x.ord))
       FROM (SELECT id, row_number() OVER () AS ord
             FROM public.search_contacts(p.search_term, p.ctype, p.company, p.job_title, p.tag, p.date_from, s.sort_field, s.sort_dir, 50, 0) LIMIT 50) x) AS v0,
    (SELECT md5(string_agg(x.id::text, ',' ORDER BY x.ord))
       FROM (SELECT id, row_number() OVER () AS ord
             FROM public.w4_v2_branches(p.search_term, p.ctype, p.company, p.job_title, p.tag, p.date_from, s.sort_field, s.sort_dir, 50, 0) LIMIT 50) x) AS v2,
    (SELECT md5(string_agg(x.id::text, ',' ORDER BY x.ord))
       FROM (SELECT id, row_number() OVER () AS ord
             FROM public.w4_v3_nocount(p.search_term, p.ctype, p.company, p.job_title, p.tag, p.date_from, s.sort_field, s.sort_dir, 50, 0) LIMIT 50) x) AS v3,
    (SELECT max(total_count) FROM public.search_contacts(p.search_term, p.ctype, p.company, p.job_title, p.tag, p.date_from, s.sort_field, s.sort_dir, 50, 0)) AS tc_v0,
    (SELECT max(total_count) FROM public.w4_v2_branches(p.search_term, p.ctype, p.company, p.job_title, p.tag, p.date_from, s.sort_field, s.sort_dir, 50, 0)) AS tc_v2,
    (SELECT max(total_count) FROM public.w4_v3_nocount(p.search_term, p.ctype, p.company, p.job_title, p.tag, p.date_from, s.sort_field, s.sort_dir, 50, 0)) AS tc_v3,
    (SELECT max(total_count) FROM public.w4_v1_inline(p.search_term, p.ctype, p.company, p.job_title, p.tag, p.date_from, s.sort_field, s.sort_dir, 50, 0)) AS tc_v1
  FROM params p CROSS JOIN sorts s
)
SELECT cenario, sort_field, sort_dir,
       (v0 = v2) AS ids_v0_eq_v2,
       (v0 = v3) AS ids_v0_eq_v3,
       tc_v0, tc_v1, tc_v2, tc_v3,
       (tc_v0 = tc_v1 AND tc_v0 = tc_v2 AND tc_v0 = tc_v3) AS total_count_igual
FROM cmp
ORDER BY cenario, sort_field, sort_dir;

-- Deliberadamente DIFERENTE: sort_field='company'.
-- v0 (vigente) NAO tem ramo para 'company' -> cai no tiebreaker `c.name ASC`.
-- v2/v3 implementam company de verdade. Prova do no-op do vigente:
SELECT 'sort_field=company reproduzido pelo vigente' AS prova,
       (SELECT md5(string_agg(x.id::text, ',')) FROM (SELECT id
          FROM public.search_contacts(NULL,NULL,NULL,NULL,NULL,NULL,'company','asc',50,0) LIMIT 50) x) AS md5_company_asc,
       (SELECT md5(string_agg(x.id::text, ',')) FROM (SELECT id
          FROM public.search_contacts(NULL,NULL,NULL,NULL,NULL,NULL,'company','desc',50,0) LIMIT 50) x) AS md5_company_desc,
       (SELECT md5(string_agg(x.id::text, ',')) FROM (SELECT id
          FROM public.search_contacts(NULL,NULL,NULL,NULL,NULL,NULL,'name','asc',50,0) LIMIT 50) x) AS md5_name_asc;
