-- =============================================================================
-- W4 -- DRIVER do benchmark. Parametros:
--   -v phase=<rotulo>   -v variant=<v0|v1|v2|v3>   -v matrix=<core|extra|all>
--   -v uid=<uuid-do-chamador>   -v caller=<agent|admin>   [-v runs=6]
-- =============================================================================
-- Mede tempo de parede (clock_timestamp) de `runs` execucoes do RPC por cenario,
-- depois de 1 execucao de aquecimento. O plano e o detalhe de buffers saem de
-- `EXPLAIN (ANALYZE, BUFFERS)` capturado fora deste driver (mesmas consultas).
-- =============================================================================
\set ON_ERROR_STOP on

\if :{?runs}
\else
\set runs 6
\endif

-- `offs`: offsets de paginacao a varrer (ex.: '0,500' ou '0').
\if :{?offs}
\else
\set offs 0,500
\endif

-- `extras`: =0 pula a execucao de aquecimento e a chamada extra que registra
-- rows_out/total_count (usado no modo reduzido de volumes grandes).
\if :{?extras}
\else
\set extras 1
\endif

CREATE TEMP TABLE w4_cfg AS
SELECT :'phase'::text  AS phase,
       :'variant'::text AS variant,
       :'matrix'::text AS matrix_name,
       :'caller'::text AS caller,
       :runs::int      AS runs,
       COALESCE(NULLIF(:'offs', ''), '0,500')::text AS offs,
       :extras::int = 1 AS extras;

SELECT set_config('request.jwt.claim.sub', :'uid', false) AS uid_definido;

-- CENARIOS ------------------------------------------------------------------
CREATE TEMP TABLE w4_scen (
  name text, matrices text[], search_term text, ctype text, company text,
  job_title text, tag text, date_from timestamptz, nota text
);
INSERT INTO w4_scen VALUES
 ('sem_filtro',       ARRAY['core','extra','mini','foco','foco0'], NULL,   NULL,   NULL, NULL, NULL, NULL,
  'estado inicial da lista (todos os filtros NULL)'),
 ('termo_nome_5ch',   ARRAY['core','extra','mini','foco','foco0'], 'silva', NULL,  NULL, NULL, NULL, NULL,
  'busca livre com 5 caracteres, casa ~13% das linhas'),
 ('termo_empresa',    ARRAY['core','extra','foco0'], 'acme',  NULL,  NULL, NULL, NULL, NULL,
  'termo que casa ~11% (Acme Corp)'),
 ('filtro_tipo',      ARRAY['core','extra','foco0'], NULL,   'lead', NULL, NULL, NULL, NULL,
  'aba de tipo (~20% das linhas)'),
 ('filtro_tag',       ARRAY['core','extra','foco0'], NULL,   NULL,   NULL, NULL, 'vip', NULL,
  'tag vip (~9%)'),
 ('intervalo_data',   ARRAY['core','extra','foco0'], NULL,   NULL,   NULL, NULL, NULL,
  (now() - interval '90 days'),
  'created_at >= 90 dias (~21% das linhas)'),
 ('combinado',        ARRAY['core','extra','mini','foco','foco0'], 'silva', 'lead', NULL, NULL, 'vip',
  (now() - interval '90 days'),
  'termo + tipo + tag + data (o caso mais restritivo)'),
 ('termo_nome_2ch',   ARRAY['extra'], 'si', NULL, NULL, NULL, NULL, NULL,
  'TRILHA pg_trgm: 2 caracteres NAO produzem trigrama'),
 ('termo_nome_3ch',   ARRAY['extra'], 'sil', NULL, NULL, NULL, NULL, NULL,
  'TRILHA pg_trgm: 3 caracteres = trigrama minimo'),
 ('termo_telefone',   ARRAY['extra'], '55119', NULL, NULL, NULL, NULL, NULL,
  'termo que casa so na coluna phone (~90%)'),
 ('empresa_igual',    ARRAY['extra'], NULL, NULL, 'Acme Corp', NULL, NULL, NULL,
  'company_filter = (igualdade, nao ILIKE)'),
 ('cargo_igual',      ARRAY['extra'], NULL, NULL, NULL, 'Gerente', NULL, NULL,
  'job_title_filter = (igualdade)');

CREATE TEMP TABLE w4_sorts AS
SELECT * FROM (VALUES
 ('name','asc'), ('name','desc'),
 ('created_at','asc'), ('created_at','desc'),
 ('company','asc'), ('company','desc')
) v(sort_field, sort_dir);

-- DRIVER ---------------------------------------------------------------------
DO $do$
DECLARE
  cfg            w4_cfg;
  sc             w4_scen;
  srt            w4_sorts;
  v_off          integer;
  i              integer;
  t0             timestamptz;
  ms             double precision;
  n_rows         integer;
  n_total        bigint;
  v_overhead     double precision;
BEGIN
  SELECT * INTO cfg FROM w4_cfg;

  -- custo do proprio invólucro de medicao (PERFORM count(*) sobre SELECT 1)
  t0 := clock_timestamp();
  PERFORM count(*) FROM (SELECT 1) x;
  v_overhead := 1000 * extract(epoch FROM clock_timestamp() - t0);
  RAISE NOTICE 'overhead do invólucro de medicao: % ms', round(v_overhead::numeric, 4);
  INSERT INTO w4_bench(phase, variant, caller, scenario, sort_field, sort_dir, page_offset, run, ms, rows_out, total_count)
  VALUES (cfg.phase, cfg.variant, cfg.caller, '__overhead_wrapper__', '-', '-', -1, 0, v_overhead, 0, 0);

  FOR sc IN SELECT * FROM w4_scen WHERE cfg.matrix_name = 'all' OR cfg.matrix_name = ANY(matrices) LOOP
    FOR srt IN SELECT * FROM w4_sorts LOOP
      FOREACH v_off IN ARRAY string_to_array(cfg.offs, ',')::int[] LOOP

        -- 1 execucao de aquecimento (nao medida)
        IF cfg.extras THEN
        IF cfg.variant = 'v0' THEN
          PERFORM count(*) FROM public.search_contacts(sc.search_term, sc.ctype, sc.company, sc.job_title, sc.tag, sc.date_from, srt.sort_field, srt.sort_dir, 50, v_off);
        ELSIF cfg.variant = 'v1' THEN
          PERFORM count(*) FROM public.w4_v1_inline(sc.search_term, sc.ctype, sc.company, sc.job_title, sc.tag, sc.date_from, srt.sort_field, srt.sort_dir, 50, v_off);
        ELSIF cfg.variant = 'v2' THEN
          PERFORM count(*) FROM public.w4_v2_branches(sc.search_term, sc.ctype, sc.company, sc.job_title, sc.tag, sc.date_from, srt.sort_field, srt.sort_dir, 50, v_off);
        ELSIF cfg.variant = 'v3' THEN
          PERFORM count(*) FROM public.w4_v3_nocount(sc.search_term, sc.ctype, sc.company, sc.job_title, sc.tag, sc.date_from, srt.sort_field, srt.sort_dir, 50, v_off);
        ELSE
          RAISE EXCEPTION 'variante desconhecida: %', cfg.variant;
        END IF;
        END IF;  -- cfg.extras (aquecimento)

        -- `runs` execucoes medidas
        FOR i IN 1..cfg.runs LOOP
          t0 := clock_timestamp();
          IF cfg.variant = 'v0' THEN
            PERFORM count(*) FROM public.search_contacts(sc.search_term, sc.ctype, sc.company, sc.job_title, sc.tag, sc.date_from, srt.sort_field, srt.sort_dir, 50, v_off);
          ELSIF cfg.variant = 'v1' THEN
            PERFORM count(*) FROM public.w4_v1_inline(sc.search_term, sc.ctype, sc.company, sc.job_title, sc.tag, sc.date_from, srt.sort_field, srt.sort_dir, 50, v_off);
          ELSIF cfg.variant = 'v2' THEN
            PERFORM count(*) FROM public.w4_v2_branches(sc.search_term, sc.ctype, sc.company, sc.job_title, sc.tag, sc.date_from, srt.sort_field, srt.sort_dir, 50, v_off);
          ELSE
            PERFORM count(*) FROM public.w4_v3_nocount(sc.search_term, sc.ctype, sc.company, sc.job_title, sc.tag, sc.date_from, srt.sort_field, srt.sort_dir, 50, v_off);
          END IF;
          ms := 1000 * extract(epoch FROM clock_timestamp() - t0);
          INSERT INTO w4_bench(phase, variant, caller, scenario, sort_field, sort_dir, page_offset, run, ms, rows_out, total_count)
          VALUES (cfg.phase, cfg.variant, cfg.caller, sc.name, srt.sort_field, srt.sort_dir, v_off, i, ms, NULL, NULL);
        END LOOP;

        -- chamada extra (FORA da medicao) so para registrar linhas e total_count
        IF cfg.extras THEN
        IF cfg.variant = 'v0' THEN
          SELECT count(*), max(total_count) INTO n_rows, n_total FROM public.search_contacts(sc.search_term, sc.ctype, sc.company, sc.job_title, sc.tag, sc.date_from, srt.sort_field, srt.sort_dir, 50, v_off);
        ELSIF cfg.variant = 'v1' THEN
          SELECT count(*), max(total_count) INTO n_rows, n_total FROM public.w4_v1_inline(sc.search_term, sc.ctype, sc.company, sc.job_title, sc.tag, sc.date_from, srt.sort_field, srt.sort_dir, 50, v_off);
        ELSIF cfg.variant = 'v2' THEN
          SELECT count(*), max(total_count) INTO n_rows, n_total FROM public.w4_v2_branches(sc.search_term, sc.ctype, sc.company, sc.job_title, sc.tag, sc.date_from, srt.sort_field, srt.sort_dir, 50, v_off);
        ELSE
          SELECT count(*), max(total_count) INTO n_rows, n_total FROM public.w4_v3_nocount(sc.search_term, sc.ctype, sc.company, sc.job_title, sc.tag, sc.date_from, srt.sort_field, srt.sort_dir, 50, v_off);
        END IF;

        UPDATE w4_bench SET rows_out = n_rows, total_count = n_total
        WHERE phase = cfg.phase AND scenario = sc.name AND sort_field = srt.sort_field
          AND sort_dir = srt.sort_dir AND page_offset = v_off AND rows_out IS NULL;
        END IF;  -- cfg.extras (rows_out/total_count)
      END LOOP;
    END LOOP;
  END LOOP;
END;
$do$;

-- RESUMO: p50 / p95 / min / max por cenario x ordenacao x offset.
\pset border 2
SELECT b.phase, b.variant, b.caller, b.scenario, b.sort_field, b.sort_dir, b.page_offset,
       count(*) AS execucoes,
       round(percentile_cont(0.5) WITHIN GROUP (ORDER BY ms)::numeric, 2) AS p50_ms,
       round(percentile_cont(0.95) WITHIN GROUP (ORDER BY ms)::numeric, 2) AS p95_ms,
       round(min(ms)::numeric, 2) AS min_ms,
       round(max(ms)::numeric, 2) AS max_ms,
       max(b.rows_out) AS linhas,
       max(b.total_count) AS total_count
FROM w4_bench b
WHERE b.scenario <> '__overhead_wrapper__'
  AND b.phase = (SELECT phase FROM w4_cfg)
GROUP BY 1,2,3,4,5,6,7
ORDER BY p95_ms DESC;
