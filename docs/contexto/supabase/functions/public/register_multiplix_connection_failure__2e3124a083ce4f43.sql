CREATE OR REPLACE FUNCTION public.register_multiplix_connection_failure(p_connection_id uuid, p_signal text DEFAULT NULL::text, p_error_class text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_consecutive integer;
  v_ban_signal  boolean;
  v_paused      integer := 0;
BEGIN
  IF p_connection_id IS NULL THEN
    RAISE EXCEPTION 'multiplix_connection_required' USING ERRCODE = '22004';
  END IF;

  -- Sinais que NAO esperam contar tres: banimento temporario e perda de conexao
  -- significam que a instancia ja caiu — insistir so acelera o dano.
  v_ban_signal := p_signal IN ('TemporaryBan', 'ConnectFailure', 'connection_lost', 'banned');

  -- A propria chamada ja e uma falha: registra ANTES de contar, senao quem chama passando
  -- so a classe nunca acumularia (o contador ficaria em 1 para sempre — foi o que o teste
  -- de mutacao pegou). O evento vive preso a um dispatch da conexao porque a trilha exige
  -- dispatch_id; sem dispatch ativo, o vinculo e a propria conexao.
  IF p_error_class = 'permanent' THEN
    INSERT INTO public.multiplix_events (dispatch_id, kind, payload)
    SELECT d.id, 'connection_failure',
           jsonb_build_object('connection_id', p_connection_id,
                              'error_class', p_error_class,
                              'signal', p_signal)
      FROM public.multiplix_dispatches AS d
     WHERE d.whatsapp_connection_id = p_connection_id
     ORDER BY d.updated_at DESC NULLS LAST
     LIMIT 1;
  END IF;

  -- Conta as falhas PERMANENTES desde o ultimo envio que saiu: "consecutivas" nao e
  -- "acumuladas" — uma conexao saudavel com falhas esparsas no dia nao pode ser pausada.
  SELECT count(*) INTO v_consecutive
    FROM public.multiplix_events AS e
   WHERE e.kind = 'connection_failure'
     AND e.payload->>'connection_id' = p_connection_id::text
     AND e.created_at > COALESCE((
           SELECT max(s.created_at)
             FROM public.multiplix_events AS s
             JOIN public.multiplix_dispatches AS sd ON sd.id = s.dispatch_id
            WHERE sd.whatsapp_connection_id = p_connection_id
              AND s.kind IN ('item_sent', 'item_delivered', 'item_read')
         ), '-infinity'::timestamp with time zone);

  IF v_ban_signal OR v_consecutive >= 3 THEN
    v_paused := public.pause_dispatches_for_connection(
      p_connection_id,
      CASE WHEN v_ban_signal THEN 'connection_banned' ELSE 'connection_at_risk' END
    );
    RETURN jsonb_build_object(
      'action', CASE WHEN v_ban_signal THEN 'paused_banned' ELSE 'paused_at_risk' END,
      'consecutive_failures', v_consecutive,
      'signal', p_signal,
      'paused_dispatches', v_paused
    );
  END IF;

  RETURN jsonb_build_object(
    'action', 'counted',
    'consecutive_failures', v_consecutive,
    'signal', p_signal,
    'paused_dispatches', 0
  );
END;
$function$
