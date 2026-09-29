-- =============================================================================
-- W4 -- Overhead do trigger `trg_audit_contact_address_change` em UPDATE em massa.
--   psql -v uid=<uuid> -v vol=<n> -v big=<min(3000,vol)> -v reps=8 -f 15-trigger-bench.sql
-- =============================================================================
-- DESENHO (pareado e intercalado -- o ruido de host nao pode virar conclusao):
--   * para cada tamanho de lote k e cada modo, o arm `trigger ON` e o arm
--     `trigger OFF` rodam INTERCALADOS na mesma repeticao (ON, OFF, ON, OFF...).
--     A deriva do host atinge os dois arms igualmente; a diferenca por par e o
--     estimador do custo do trigger.
--   * modos: `change` (address muda -> o trigger INSERE em audit_logs) e
--     `same`   (SET address = address -> o trigger DISPARA e NAO insere).
--   * `insert_only`: INSERT direto em audit_logs das mesmas k linhas, sem UPDATE
--     -- mede so o custo da escrita de auditoria.
--   * k em {1, 1000, big}.  O estado de partida se repete a cada 2 execucoes
--     (o endereco alterna entre dois valores).
--   * resultados persistidos em `w4_trig` (por volume) + NOTICE 'W4TRG|...'.
-- =============================================================================
\set ON_ERROR_STOP on
\if :{?vol}\else \set vol 0 \endif
\if :{?big}\else \set big 3000 \endif
\if :{?reps}\else \set reps 8 \endif

SELECT set_config('request.jwt.claim.sub', :'uid', false);

CREATE TABLE IF NOT EXISTS w4_trig (
  vol integer, arm text, k integer, mode text, rep integer, ms double precision,
  linhas integer, audit_inseridos bigint, ts timestamptz DEFAULT now()
);
DELETE FROM w4_trig WHERE vol = :vol AND arm LIKE 'lote%';

-- psql nao interpola variaveis dentro de dollar-quote: os parametros entram por
-- uma tabela temporaria lida no inicio do bloco.
CREATE TEMP TABLE w4_tcfg AS SELECT :vol::int AS vol, :big::int AS big, :reps::int AS reps;

\timing on
ALTER TABLE public.contacts SET (autovacuum_enabled = false);
VACUUM (ANALYZE) public.contacts;
\timing off

DO $do$
DECLARE
  v_vol   integer;
  v_big   integer;
  v_reps  integer;
  ks      integer[];
  modes   text[]    := ARRAY['change', 'same'];
  k       integer;
  m       text;
  ids     uuid[];
  rep     integer;
  state   text;
  t0      timestamptz;
  ms      double precision;
  nb      bigint;
  na      bigint;
BEGIN
  SELECT vol, big, reps INTO v_vol, v_big, v_reps FROM w4_tcfg;
  ks := ARRAY[1, 1000, v_big];
  FOREACH k IN ARRAY ks LOOP
    SELECT array_agg(id) INTO ids FROM (SELECT id FROM public.contacts ORDER BY id LIMIT k) x;

    FOREACH m IN ARRAY modes LOOP
      FOR rep IN 1..v_reps LOOP
        FOREACH state IN ARRAY ARRAY['ON', 'OFF'] LOOP
          IF state = 'OFF' THEN
            ALTER TABLE public.contacts DISABLE TRIGGER trg_audit_contact_address_change;
          END IF;
          SELECT count(*) INTO nb FROM public.audit_logs;
          t0 := clock_timestamp();
          IF m = 'change' THEN
            UPDATE public.contacts
               SET address = CASE WHEN address LIKE '% [w4]'
                                  THEN left(address, length(address) - 5)
                                  ELSE coalesce(address, '') || ' [w4]' END
             WHERE id = ANY(ids);
          ELSE
            UPDATE public.contacts SET address = address WHERE id = ANY(ids);
          END IF;
          ms := 1000 * extract(epoch FROM clock_timestamp() - t0);
          SELECT count(*) INTO na FROM public.audit_logs;
          IF state = 'OFF' THEN
            ALTER TABLE public.contacts ENABLE TRIGGER trg_audit_contact_address_change;
          END IF;
          INSERT INTO w4_trig(vol, arm, k, mode, rep, ms, linhas, audit_inseridos)
          VALUES (v_vol, 'lote_' || state, k, m, rep, ms, k, na - nb);
          RAISE NOTICE 'W4TRG|vol=%|arm=%|k=%|mode=%|rep=%|ms=%|audit_inseridos=%',
            v_vol, 'lote_' || state, k, m, rep, round(ms::numeric, 3), na - nb;
        END LOOP;
      END LOOP;
    END LOOP;

    -- escrita de auditoria isolada (sem UPDATE)
    FOR rep IN 1..v_reps LOOP
      t0 := clock_timestamp();
      INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, details)
      SELECT auth.uid(), 'w4_probe', 'contacts', c.id,
             jsonb_build_object('contact_id', c.id, 'cleared', false)
      FROM public.contacts c WHERE c.id = ANY(ids);
      ms := 1000 * extract(epoch FROM clock_timestamp() - t0);
      INSERT INTO w4_trig(vol, arm, k, mode, rep, ms, linhas, audit_inseridos)
      VALUES (v_vol, 'insert_only', k, 'insert', rep, ms, k, k);
      RAISE NOTICE 'W4TRG|vol=%|arm=insert_only|k=%|mode=insert|rep=%|ms=%|audit_inseridos=%',
        v_vol, k, rep, round(ms::numeric, 3), k;
    END LOOP;
  END LOOP;
END;
$do$;

\timing on
ALTER TABLE public.contacts SET (autovacuum_enabled = true);
VACUUM (ANALYZE) public.contacts;
\timing off

\pset border 2
SELECT vol, mode, k,
       round(percentile_cont(0.5) WITHIN GROUP (ORDER BY ms)::numeric, 3) AS p50_ms,
       round(percentile_cont(0.5) WITHIN GROUP (ORDER BY ms)
             FILTER (WHERE arm = 'lote_ON')::numeric, 3) AS on_p50,
       round(percentile_cont(0.5) WITHIN GROUP (ORDER BY ms)
             FILTER (WHERE arm = 'lote_OFF')::numeric, 3) AS off_p50,
       round((percentile_cont(0.5) WITHIN GROUP (ORDER BY ms)
              FILTER (WHERE arm = 'lote_ON')
            - percentile_cont(0.5) WITHIN GROUP (ORDER BY ms)
              FILTER (WHERE arm = 'lote_OFF'))::numeric, 3) AS delta_ms,
       round((1000.0 * (percentile_cont(0.5) WITHIN GROUP (ORDER BY ms)
              FILTER (WHERE arm = 'lote_ON')
            - percentile_cont(0.5) WITHIN GROUP (ORDER BY ms)
              FILTER (WHERE arm = 'lote_OFF')) / k)::numeric, 3) AS delta_ms_por_1000
FROM w4_trig
WHERE vol = :vol AND arm IN ('lote_ON', 'lote_OFF')
GROUP BY vol, mode, k
ORDER BY mode, k;

SELECT vol, arm, mode, k,
       round(percentile_cont(0.5) WITHIN GROUP (ORDER BY ms)::numeric, 3) AS p50_ms,
       sum(audit_inseridos) AS audit_inseridos
FROM w4_trig WHERE vol = :vol
GROUP BY vol, arm, mode, k ORDER BY mode, k, arm;
