CREATE OR REPLACE FUNCTION public.resumo_orcamento_ia(p_dias integer DEFAULT 30)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_dias integer;
  v_desde timestamptz;
  v_resultado jsonb;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role'
     AND COALESCE(public.is_admin_or_supervisor(auth.uid()), false) IS NOT TRUE THEN
    RAISE EXCEPTION 'ai_budget_role_required' USING ERRCODE = '42501';
  END IF;

  v_dias := GREATEST(1, LEAST(COALESCE(p_dias, 30), 365));
  v_desde := now() - make_interval(days => v_dias);

  WITH base AS (
    SELECT r.id,
           r.function_name,
           r.status,
           r.reserved_tokens,
           r.actual_tokens,
           r.user_id,
           r.created_at,
           r.expires_at
      FROM public.ai_budget_reservations r
     WHERE r.created_at >= v_desde
  ), por_status AS (
    SELECT status,
           count(*)::integer AS execucoes,
           COALESCE(sum(reserved_tokens), 0)::bigint AS reservado,
           COALESCE(sum(actual_tokens), 0)::bigint AS consumido
      FROM base
     GROUP BY status
  ), por_funcao AS (
    SELECT function_name,
           count(*)::integer AS execucoes,
           COALESCE(sum(reserved_tokens), 0)::bigint AS reservado,
           COALESCE(sum(actual_tokens), 0)::bigint AS consumido,
           count(*) FILTER (WHERE status = 'released')::integer AS devolvidas
      FROM base
     GROUP BY function_name
  ), por_dia AS (
    SELECT to_char(date_trunc('day', created_at AT TIME ZONE 'America/Sao_Paulo'), 'YYYY-MM-DD') AS dia,
           count(*)::integer AS execucoes,
           COALESCE(sum(reserved_tokens), 0)::bigint AS reservado,
           COALESCE(sum(actual_tokens), 0)::bigint AS consumido
      FROM base
     GROUP BY 1
  )
  SELECT jsonb_build_object(
    'janela', jsonb_build_object(
      'dias', v_dias,
      'desde', v_desde,
      'execucoes', (SELECT count(*) FROM base),
      'usuarios', (SELECT count(DISTINCT user_id) FROM base),
      'reservado', (SELECT COALESCE(sum(reserved_tokens), 0) FROM base),
      'consumido', (SELECT COALESCE(sum(actual_tokens), 0) FROM base),
      'devolvido', (SELECT COALESCE(sum(reserved_tokens), 0) FROM base WHERE status = 'released'),
      'travadas', (SELECT count(*) FROM public.ai_budget_reservations
                    WHERE status = 'reserved' AND expires_at < now())
    ),
    'por_status', COALESCE((SELECT jsonb_agg(to_jsonb(por_status) ORDER BY execucoes DESC) FROM por_status), '[]'::jsonb),
    'por_funcao', COALESCE((SELECT jsonb_agg(to_jsonb(por_funcao) ORDER BY reservado DESC) FROM por_funcao), '[]'::jsonb),
    'por_dia', COALESCE((SELECT jsonb_agg(to_jsonb(por_dia) ORDER BY dia) FROM por_dia), '[]'::jsonb)
  ) INTO v_resultado;

  RETURN v_resultado;
END;
$function$
