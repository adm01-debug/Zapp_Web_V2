-- =============================================================================
-- W4 -- Captura de plano: EXPLAIN (ANALYZE, BUFFERS) das 4 variantes, na MESMA
-- sessao em que o uid do chamador e definido.
--   -v uid=<uuid> [-v term=] [-v ctype=] [-v company=] [-v job=] [-v tag=]
--   [-v date_from=<iso>] -v srt=name -v dir=asc -v off=0 [-v label=...]
-- Variaveis vazias viram NULL (NULLIF(...,'')).
-- =============================================================================
\set ON_ERROR_STOP on
\if :{?term}\else \set term \endif
\if :{?ctype}\else \set ctype \endif
\if :{?company}\else \set company \endif
\if :{?job}\else \set job \endif
\if :{?tag}\else \set tag \endif
\if :{?date_from}\else \set date_from \endif
\if :{?label}\else \set label '(sem rotulo)' \endif

SELECT set_config('request.jwt.claim.sub', :'uid', false);

\pset border 0
\pset format unaligned
\pset tuples_only on

\echo
\echo ################################################################
\echo # LABEL: :label
\echo # FILTROS: term=:term ctype=:ctype company=:company job=:job tag=:tag date_from=:date_from
\echo # ORDENACAO: :srt :dir   OFFSET: :off
\echo ################################################################

\echo ======================== V0 vigente ========================
EXPLAIN (ANALYZE, BUFFERS)
SELECT * FROM public.search_contacts(
  :'term', NULLIF(:'ctype',''), NULLIF(:'company',''), NULLIF(:'job',''),
  NULLIF(:'tag',''), NULLIF(:'date_from','')::timestamptz,
  :'srt', :'dir', 50, :off);

\echo ======================== V1 inline ========================
EXPLAIN (ANALYZE, BUFFERS)
SELECT * FROM public.w4_v1_inline(
  :'term', NULLIF(:'ctype',''), NULLIF(:'company',''), NULLIF(:'job',''),
  NULLIF(:'tag',''), NULLIF(:'date_from','')::timestamptz,
  :'srt', :'dir', 50, :off);

\echo ======================== V2 branches ========================
EXPLAIN (ANALYZE, BUFFERS)
SELECT * FROM public.w4_v2_branches(
  :'term', NULLIF(:'ctype',''), NULLIF(:'company',''), NULLIF(:'job',''),
  NULLIF(:'tag',''), NULLIF(:'date_from','')::timestamptz,
  :'srt', :'dir', 50, :off);

\echo ======================== V3 nocount ========================
EXPLAIN (ANALYZE, BUFFERS)
SELECT * FROM public.w4_v3_nocount(
  :'term', NULLIF(:'ctype',''), NULLIF(:'company',''), NULLIF(:'job',''),
  NULLIF(:'tag',''), NULLIF(:'date_from','')::timestamptz,
  :'srt', :'dir', 50, :off);
