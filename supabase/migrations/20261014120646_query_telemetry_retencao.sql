-- query_telemetry_retencao
-- Rollback: devolve a policy de DELETE ao estado anterior (admin OU supervisor), desagenda o job diario e remove as 3 funcoes; nenhum dado de telemetria e apagado.
-- Rollback (SQL executável, na ordem):
--   select cron.unschedule('query-telemetry-retention');
--   drop function if exists public.clear_old_telemetry(integer);
--   drop function if exists public.query_telemetry_retention_tick(integer);
--   drop function if exists public.query_telemetry_purge(integer, uuid, text);
--   drop policy if exists "Admins can delete telemetry" on public.query_telemetry;
--   create policy "Admins can delete telemetry" on public.query_telemetry for delete to authenticated using (public.is_admin_or_supervisor(auth.uid()));
--
-- PROBLEMA: a policy "Admins can delete telemetry" (20260323120607) usa is_admin_or_supervisor
-- — o SUPERVISOR apaga telemetria operacional (evidencia de investigacao/seguranca) e nada fica
-- registrado em audit_logs. O cartao pede: limpeza so por ADMIN, com AUDITORIA (quem, quantas
-- linhas) e RETENCAO automatica de 30 dias.
--
-- ATOMICIDADE: expurgo + registro de auditoria vao na MESMA funcao plpgsql (uma transacao): se a
-- auditoria falhar, o DELETE desfaz junto (testado no BLOCO B da prova). A RPC valida quem chama
-- ANTES de tocar em dado — nega por padrao, com a MESMA resposta para agente/supervisor/anon.
--
-- Classe: ADITIVA (reconstroi a MESMA policy com USING mais estrito + 3 funcoes novas + 1 cron).
-- Nao apaga dado algum. Idempotente/replayavel: DROP POLICY IF EXISTS, CREATE OR REPLACE,
-- cron.schedule com o mesmo nome = UPSERT, rollback com DROP FUNCTION IF EXISTS.

-- ============================================================================
-- 1) DELETE de telemetria so para ADMIN (supervisor deixa de poder)
-- ============================================================================
DROP POLICY IF EXISTS "Admins can delete telemetry" ON public.query_telemetry;
CREATE POLICY "Admins can delete telemetry"
  ON public.query_telemetry FOR DELETE
  TO authenticated
  USING (public.is_admin(auth.uid()));

-- ============================================================================
-- 2) Nucleo do expurgo (interno): apaga o vencido e audita na MESMA transacao
-- ============================================================================
CREATE OR REPLACE FUNCTION public.query_telemetry_purge(p_days integer, p_actor uuid, p_source text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_deleted integer;
BEGIN
  IF p_days IS NULL OR p_days < 1 OR p_days > 3650 THEN
    RAISE EXCEPTION 'invalid_retention_days' USING ERRCODE = '22023';
  END IF;
  IF p_source NOT IN ('manual', 'cron') THEN
    RAISE EXCEPTION 'invalid_purge_source' USING ERRCODE = '22023';
  END IF;

  DELETE FROM public.query_telemetry
   WHERE created_at < now() - make_interval(days => p_days);
  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, details)
  VALUES (
    p_actor,
    'query_telemetry.retention',
    'query_telemetry',
    NULL,
    jsonb_build_object(
      'deleted_count', v_deleted,
      'older_than_days', p_days,
      'source', p_source
    )
  );

  RETURN v_deleted;
END;
$function$;
REVOKE ALL ON FUNCTION public.query_telemetry_purge(integer, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.query_telemetry_purge(integer, uuid, text) TO service_role;

-- ============================================================================
-- 3) RPC da limpeza manual: so admin, auditada (quem + contagem)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.clear_old_telemetry(p_days integer)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;
  RETURN public.query_telemetry_purge(p_days, auth.uid(), 'manual');
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.clear_old_telemetry(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.clear_old_telemetry(integer) TO authenticated;

-- ============================================================================
-- 4) Retencao automatica: 30 dias, 1x/dia (idempotente: mesmo nome = UPSERT)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.query_telemetry_retention_tick(p_days integer DEFAULT 30)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
BEGIN
  RETURN public.query_telemetry_purge(p_days, NULL, 'cron');
END;
$function$;
REVOKE ALL ON FUNCTION public.query_telemetry_retention_tick(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.query_telemetry_retention_tick(integer) TO service_role;

COMMENT ON FUNCTION public.clear_old_telemetry(integer) IS
  'Limpeza manual de public.query_telemetry, so ADMIN (is_admin). Apaga o que passou de p_days, grava quem/quantas linhas em audit_logs (action=query_telemetry.retention) e devolve a contagem, numa unica transacao.';
COMMENT ON FUNCTION public.query_telemetry_retention_tick(integer) IS
  'Retencao automatica da telemetria (30 d por padrao), chamada 1x/dia pelo pg_cron. Apaga e audita numa transacao; reexecutar sem dado vencido = 0.';

DO $$
BEGIN
  PERFORM cron.schedule('query-telemetry-retention', '45 4 * * *', 'select public.query_telemetry_retention_tick()');
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'query_telemetry_retention_cron_schedule_skipped: %', SQLERRM;
END;
$$;
