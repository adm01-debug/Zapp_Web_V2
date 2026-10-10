-- =============================================================================
-- W4 -- uma chamada do RPC, com `auto_explain` ligado, para capturar o PLANO
-- INTERNO REAL (o EXPLAIN de fora so mostra `Function Scan`). O plano vai para o
-- log do servidor; a evidencia e o trecho do log.
--   -v variant=search_contacts|w4_v1_inline|w4_v2_branches|w4_v3_nocount
--   -v uid=<uuid> [-v term=] [-v ctype=] [-v company=] [-v job=] [-v tag=]
--   [-v date_from=] -v srt=name -v dir=asc -v off=0
-- ATENCAO: com auto_explain ligado, o tempo "actual time" do plano sai inflado
-- pelo proprio logging. O plano (nos, custos, rows, buffers) NAO muda; o tempo
-- valido e o do bench (07-bench.sql).
-- =============================================================================
\set ON_ERROR_STOP on
\if :{?term}\else \set term \endif
\if :{?ctype}\else \set ctype \endif
\if :{?company}\else \set company \endif
\if :{?job}\else \set job \endif
\if :{?tag}\else \set tag \endif
\if :{?date_from}\else \set date_from \endif

LOAD 'auto_explain';
SET auto_explain.log_min_duration = 1;
SET auto_explain.log_analyze = on;
SET auto_explain.log_buffers = on;
SET auto_explain.log_nested_statements = on;
SET auto_explain.log_format = 'text';
SET auto_explain.log_verbose = off;
SET plan_cache_mode = force_generic_plan;

SELECT set_config('request.jwt.claim.sub', :'uid', false);

-- saida de dados descartada: o que interessa e o plano no log do servidor
\o /dev/null
SELECT * FROM public.:"variant"(
  :'term', NULLIF(:'ctype','')::text, NULLIF(:'company','')::text, NULLIF(:'job','')::text,
  NULLIF(:'tag','')::text, NULLIF(:'date_from','')::timestamptz,
  :'srt', :'dir', 50, :off);
\o
