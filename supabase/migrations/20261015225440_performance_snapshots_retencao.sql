-- performance_snapshots_retencao
-- Rollback: desagenda o job 'performance-snapshots-retention' (se pg_cron existir) e remove a funcao de expurgo; nenhum DADO volta — as linhas que o job ja apagou em producao nao tem rollback (telemetria de desempenho do navegador; a tabela segue com as linhas dos ultimos 7 dias).
-- Rollback (SQL executavel, na ordem):
--   do $$ begin if to_regprocedure('cron.schedule(text,text,text)') is not null then perform cron.unschedule(jobid) from cron.job where jobname = 'performance-snapshots-retention'; end if; end $$;
--   drop function if exists public.performance_snapshots_expurgo(integer, integer);
--
-- PROBLEMA (defeito real, prova no teste): a migration 20260403143300 criou
-- public.performance_snapshots com o comentario "Cleanup: auto-delete snapshots
-- older than 7 days (via scheduled function)" e criou APENAS a policy de DELETE
-- para admins — a "scheduled function" nunca existiu: nenhum job pg_cron, nenhuma
-- funcao. A tela de Telemetria (AdminTelemetriaPage) so limpa public.query_telemetry
-- (botao "Limpar +7d"); nada limpa performance_snapshots, logo a tabela CRESCE
-- PARA SEMPRE (web vitals de cada agente, a cada carga de pagina). Este cartao
-- fecha a retencao automatica da tabela.
--
-- ESCOPO (atencao): a retencao automatica de public.query_telemetry e de OUTRO
-- cartao (branch v2/query-telemetry-retencao-26101408586d38, migration
-- 20261014120646_query_telemetry_retencao.sql: job 'query-telemetry-retention',
-- funcao query_telemetry_retention_tick). Esta migration NAO toca naquela tabela
-- para nao criar um SEGUNDO agendador com intervalo diferente (30 d vs 7 d) sobre
-- a mesma evidencia.
--
-- Classe: ADITIVA. Nao altera tabela, coluna, policy, GRANT de tabela nem dado
-- existente: cria UMA funcao de manutencao e UM job. Idempotente/replayavel
-- (CREATE OR REPLACE; desagenda o job homonimo antes de recriar).
--
-- PERMISSAO: rotina de manutencao, executada so pelo job (dono). EXECUTE e negado
-- a PUBLIC, anon e authenticated pela ASSINATURA EXATA; service_role pode disparar
-- manualmente. A policy "Admins can delete performance snapshots" (20260403143300)
-- continua sendo o caminho de DELETE pela tela — nada muda para ela.
--
-- ATOMICIDADE: uma execucao = UMA transacao (tudo ou nada: se um lote falhar, o
-- expurgo inteiro desfaz e o proximo tick recomeca). O LIMIT por lote limita o
-- tamanho de cada DELETE (WAL/memoria) e o tempo do statement; a ida e volta em
-- lotes continua ate nao sobrar linha vencida.

-- ============================================================================
-- 1) Expurgo em lotes das linhas vencidas (nucleo, interno)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.performance_snapshots_expurgo(
  p_days integer DEFAULT 7,
  p_lote integer DEFAULT 5000
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_corte   timestamptz;
  v_lote    integer;
  v_total   integer := 0;
BEGIN
  -- Entrada invalida: negar por padrao (mesma excecao para qualquer valor ruim).
  IF p_days IS NULL OR p_days < 1 OR p_days > 3650 THEN
    RAISE EXCEPTION 'invalid_retention_days' USING ERRCODE = '22023';
  END IF;
  IF p_lote IS NULL OR p_lote < 1 OR p_lote > 100000 THEN
    RAISE EXCEPTION 'invalid_batch_size' USING ERRCODE = '22023';
  END IF;

  v_corte := now() - make_interval(days => p_days);

  LOOP
    -- DELETE por id: so linhas ja vencidas (created_at < corte), sempre pela
    -- mais antiga, no maximo p_lote por volta.
    DELETE FROM public.performance_snapshots
     WHERE id IN (
       SELECT id
         FROM public.performance_snapshots
        WHERE created_at < v_corte
        ORDER BY created_at
        LIMIT p_lote
     );
    GET DIAGNOSTICS v_lote = ROW_COUNT;
    v_total := v_total + v_lote;
    EXIT WHEN v_lote < p_lote;
  END LOOP;

  RETURN v_total;
END;
$function$;

COMMENT ON FUNCTION public.performance_snapshots_expurgo(integer, integer) IS
  'Retencao de public.performance_snapshots: apaga em lotes (p_lote) as linhas com created_at mais antigo que p_days (7 por padrao) e devolve quantas apagou. Uma transacao (tudo ou nada); reexecutar sem linha vencida = 0.';

REVOKE ALL ON FUNCTION public.performance_snapshots_expurgo(integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.performance_snapshots_expurgo(integer, integer) TO service_role;

-- ============================================================================
-- 2) Retencao automatica: 7 dias, 1x/dia (job novo, nome proprio)
-- ============================================================================
-- A guarda olha a API do agendador (cron.schedule) e nao a extensao instalada:
-- assim a migration agenda sempre que o agendador existir, e a prova consegue
-- exercitar o agendamento com o stub de cron no banco local (pg_cron NAO vem
-- instalado na copia de trabalho; mesma abordagem de db-audit/*cron*.test.sh).
DO $$
BEGIN
  IF to_regprocedure('cron.schedule(text,text,text)') IS NOT NULL THEN
    -- Idempotente: desagenda o job homonimo antes de recriar.
    PERFORM cron.unschedule(jobid)
      FROM cron.job
     WHERE jobname = 'performance-snapshots-retention';
    PERFORM cron.schedule(
      'performance-snapshots-retention',
      '20 4 * * *',
      'select public.performance_snapshots_expurgo()'
    );
  END IF;
END $$;
