ALTER TABLE public.whatsapp_connections
  ADD COLUMN IF NOT EXISTS capabilities jsonb NOT NULL DEFAULT '{}'::jsonb

COMMENT ON COLUMN public.whatsapp_connections.capabilities IS
  'F60: o que esta instancia entrega — {"ptt": true, "document": true, "video": false, "max_chars": 4096, "hourly_limit": 200}. Vazio = nao declarado (trata como desconhecido, nao como "tudo pode").'

ALTER TABLE public.multiplix_events
  DROP CONSTRAINT IF EXISTS multiplix_events_kind_check

ALTER TABLE public.multiplix_events
  ADD CONSTRAINT multiplix_events_kind_check CHECK (kind IN (
    'dispatch_created','dispatch_scheduled','dispatch_started','dispatch_paused','dispatch_resumed',
    'dispatch_completed','dispatch_failed','dispatch_cancelled',
    'recipient_queued','recipient_claimed','recipient_sent','recipient_delivered','recipient_read',
    'recipient_failed','recipient_skipped','recipient_cancelled','recipient_outcome_unknown',
    'item_queued','item_claimed','item_sent','item_delivered','item_read','item_failed',
    'item_rescheduled','item_dead_letter','item_skipped','item_cancelled',
    'connection_at_risk','connection_failure',
    'note'
  ))

CREATE OR REPLACE FUNCTION public.pause_dispatches_for_connection(
  p_connection_id uuid,
  p_reason text
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_paused integer;
BEGIN
  IF p_connection_id IS NULL THEN
    RAISE EXCEPTION 'multiplix_connection_required' USING ERRCODE = '22004';
  END IF;

  WITH alvo AS (
    UPDATE public.multiplix_dispatches
       SET status       = 'paused',
           pause_reason = COALESCE(NULLIF(btrim(p_reason), ''), 'connection_at_risk'),
           paused_at    = statement_timestamp(),
           updated_at   = statement_timestamp()
     WHERE whatsapp_connection_id = p_connection_id
       AND status IN ('scheduled', 'sending')
    RETURNING id
  )
  SELECT count(*) INTO v_paused FROM alvo;

  -- A trilha registra o motivo por dispatch pausado: sem isso, um operador que abre o
  -- disparo depois ve "pausado" e nao sabe que a causa foi a conexao, nao o disparo.
  IF v_paused > 0 THEN
    INSERT INTO public.multiplix_events (dispatch_id, kind, payload)
    SELECT d.id, 'connection_at_risk',
           jsonb_build_object('connection_id', p_connection_id,
                              'reason', COALESCE(NULLIF(btrim(p_reason), ''), 'connection_at_risk'))
      FROM public.multiplix_dispatches AS d
     WHERE d.whatsapp_connection_id = p_connection_id
       AND d.status = 'paused'
       AND d.paused_at >= statement_timestamp() - interval '5 seconds';
  END IF;

  RETURN v_paused;
END;
$function$

CREATE OR REPLACE FUNCTION public.register_multiplix_connection_failure(
  p_connection_id uuid,
  p_signal text DEFAULT NULL,
  p_error_class text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

REVOKE ALL ON FUNCTION public.pause_dispatches_for_connection(uuid, text) FROM PUBLIC, anon, authenticated

REVOKE ALL ON FUNCTION public.register_multiplix_connection_failure(uuid, text, text) FROM PUBLIC, anon, authenticated

GRANT EXECUTE ON FUNCTION public.pause_dispatches_for_connection(uuid, text) TO service_role

GRANT EXECUTE ON FUNCTION public.register_multiplix_connection_failure(uuid, text, text) TO service_role
