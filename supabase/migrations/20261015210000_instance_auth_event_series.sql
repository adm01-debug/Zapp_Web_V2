-- instance_auth_event_series
-- Rollback: RPC nova, sem tabela alterada — o rollback só dropa a função.
-- Rollback (SQL executável, na ordem):
--   drop function if exists public.instance_auth_event_series(text);
--
-- Serie temporal de eventos de autenticacao por instancia WhatsApp, lida da fonte
-- real public.connection_health_logs (gravada pelo watchdog connection-health-check):
-- 'no_credentials' = Evolution devolveu 401/403; 'disconnected'; 'error'/'timeout'
-- = demais falhas. Coluna auth_failures separa 401/403 do resto, nao um do outro.
-- Aditivo: sem tabela nova. Devolve SO contagens (sem error_message, IP, telefone).
-- Janela '24h' = baldes de 1 h; '7d' = baldes de 1 dia; sem argumento = '24h'.
-- Permissao: so admin/supervisor (42501); janela fora de {'24h','7d'} = 22023.

CREATE OR REPLACE FUNCTION public.instance_auth_event_series(p_window text DEFAULT '24h')
RETURNS TABLE (bucket timestamptz, instance text, auth_failures integer, disconnected integer, errors integer, total integer)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $instance_auth_event_series$
DECLARE v_desde timestamptz; v_passo interval;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin_or_supervisor(auth.uid()) THEN
    RAISE EXCEPTION 'sem_permissao_para_ver_eventos_de_auth' USING ERRCODE = '42501'; END IF;
  IF p_window IS NULL OR p_window NOT IN ('24h', '7d') THEN
    RAISE EXCEPTION 'janela_invalida' USING ERRCODE = '22023'; END IF;
  IF p_window = '24h' THEN v_desde := now() - interval '24 hours'; v_passo := interval '1 hour';
  ELSE v_desde := now() - interval '7 days'; v_passo := interval '1 day'; END IF;
  RETURN QUERY
  SELECT date_bin(v_passo, l.checked_at, timestamptz '2000-01-01 00:00:00+00'),
    l.instance_id,
    count(*) FILTER (WHERE l.status = 'no_credentials')::integer,
    count(*) FILTER (WHERE l.status = 'disconnected')::integer,
    count(*) FILTER (WHERE l.status IN ('error', 'timeout'))::integer,
    count(*)::integer
  FROM public.connection_health_logs l WHERE l.checked_at >= v_desde GROUP BY 1, 2 ORDER BY 1, 2;
END $instance_auth_event_series$;

REVOKE ALL ON FUNCTION public.instance_auth_event_series(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.instance_auth_event_series(text) TO authenticated;
