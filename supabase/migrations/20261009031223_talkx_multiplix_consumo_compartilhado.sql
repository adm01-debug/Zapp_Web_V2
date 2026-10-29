-- talkx_multiplix_consumo_compartilhado
-- versão 20261009031223 reservada para hermes-talkx-limites-por-conexao-2610090009214f (hermes-db-migrar --nova)
-- Rollback: recriar as duas RPCs com os corpos anteriores e apagar o helper compartilhado:
--   1) CREATE OR REPLACE FUNCTION public.multiplix_connection_daily_usage(uuid) com o corpo de
--      supabase/migrations/20260929610000_multiplix_cron_window_and_limits.sql (L91–142) e
--      CREATE OR REPLACE FUNCTION public.talkx_connection_send_budget(uuid) com o corpo de
--      supabase/migrations/20261002551230_talkx_limits_ritmo.sql (L129–205);
--   2) DROP FUNCTION IF EXISTS public.talkx_multiplix_connection_sent_count(uuid, timestamp with time zone);
--   Os grants das duas RPCs não mudam (REVOKE de PUBLIC/anon/authenticated; EXECUTE só service_role).

-- ============================================================================
-- X018 / achado MX04 — a fonte compartilhada de consumo por conexão
-- ============================================================================
-- O orçamento por conexão (Talk X + Multiplix) contava o Multiplix por
-- `multiplix_recipients.sent_at`. O worker atual registra o envio em
-- `multiplix_delivery_items.sent_at` (`record_multiplix_item_sent`) e NÃO carimba
-- o recipient — então as mensagens do motor novo desapareciam do teto por minuto
-- e do limite diário, e a reentrada do cron renovava saldo aparente.
--
-- Esta migration fecha a lacuna definindo a UNIDADE e a FONTE:
--   * unidade = MENSAGEM (1 item da fila = 1 mensagem; 1 recipient legado = 1 mensagem),
--     porque um recipient pode ter vários blocos/mensagens;
--   * conexão = a do dispatch (`multiplix_dispatches.whatsapp_connection_id`), que é
--     por onde a mensagem realmente saiu;
--   * as duas RPCs de orçamento passam a ler a MESMA função
--     `talkx_multiplix_connection_sent_count`, para nunca divergirem.
--
-- Sem dupla contagem quando os dois modelos coexistem: um recipient que já tem
-- item enviado é contado pelo item (o legado só conta recipient SEM item enviado).
-- O caminho padrão (service_role) e o formato do jsonb devolvido não mudam.

CREATE OR REPLACE FUNCTION public.talkx_multiplix_connection_sent_count(
  p_connection_id uuid,
  p_since timestamp with time zone
)
RETURNS integer
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_sent integer;
BEGIN
  IF p_connection_id IS NULL THEN
    RAISE EXCEPTION 'invalid_talkx_connection' USING ERRCODE = '22023';
  END IF;

  SELECT
    (SELECT count(*)
       FROM public.talkx_recipients AS recipient
       JOIN public.talkx_campaigns AS campaign ON campaign.id = recipient.campaign_id
      WHERE campaign.whatsapp_connection_id = p_connection_id
        AND recipient.sent_at IS NOT NULL
        AND recipient.sent_at >= p_since)
    +
    (SELECT count(*)
       FROM public.multiplix_delivery_items AS item
       JOIN public.multiplix_dispatches AS dispatch ON dispatch.id = item.dispatch_id
      WHERE dispatch.whatsapp_connection_id = p_connection_id
        AND item.sent_at IS NOT NULL
        AND item.sent_at >= p_since)
    +
    (SELECT count(*)
       FROM public.multiplix_recipients AS recipient
       JOIN public.multiplix_dispatches AS dispatch ON dispatch.id = recipient.dispatch_id
      WHERE dispatch.whatsapp_connection_id = p_connection_id
        AND recipient.sent_at IS NOT NULL
        AND recipient.sent_at >= p_since
        AND NOT EXISTS (
          SELECT 1
            FROM public.multiplix_delivery_items AS item
           WHERE item.recipient_id = recipient.id
             AND item.sent_at IS NOT NULL
        ))
    INTO v_sent;

  RETURN COALESCE(v_sent, 0);
END;
$function$;

REVOKE ALL ON FUNCTION public.talkx_multiplix_connection_sent_count(uuid, timestamp with time zone)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.talkx_multiplix_connection_sent_count(uuid, timestamp with time zone)
  TO service_role;

-- ============================================================================
-- (F17) consumo do dia por conexão (Talk X + Multiplix somados) — mesma fonte
-- ============================================================================
CREATE OR REPLACE FUNCTION public.multiplix_connection_daily_usage(p_connection_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_limit integer;
  v_sent integer;
  v_day_start timestamptz;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'service_role_required' USING ERRCODE = '42501';
  END IF;
  IF p_connection_id IS NULL THEN
    RAISE EXCEPTION 'invalid_multiplix_connection' USING ERRCODE = '22023';
  END IF;

  SELECT COALESCE((settings.value)::text::integer, 0)
    INTO v_limit
    FROM public.talkx_settings AS settings
   WHERE settings.key = 'daily_limit_per_connection';

  -- O teto e por dia local de Sao Paulo (mesma referencia do ADR-007 D2).
  v_day_start := date_trunc('day', statement_timestamp() AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'America/Sao_Paulo';

  v_sent := public.talkx_multiplix_connection_sent_count(p_connection_id, v_day_start);

  RETURN jsonb_build_object(
    'limit', COALESCE(v_limit, 0),
    'sent', COALESCE(v_sent, 0),
    'remaining', GREATEST(COALESCE(v_limit, 0) - COALESCE(v_sent, 0), 0),
    'day_start', v_day_start
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.multiplix_connection_daily_usage(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.multiplix_connection_daily_usage(uuid) TO service_role;

-- ============================================================================
-- (X018) RPC talkx_connection_send_budget — orçamento por minuto/dia da conexão
-- ============================================================================
CREATE OR REPLACE FUNCTION public.talkx_connection_send_budget(p_connection_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_minute_limit integer;
  v_day_limit integer;
  v_minute_sent integer;
  v_day_sent integer;
  v_minute_start timestamptz;
  v_day_start timestamptz;
  v_next_day_at timestamptz;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'service_role_required' USING ERRCODE = '42501';
  END IF;
  IF p_connection_id IS NULL THEN
    RAISE EXCEPTION 'invalid_talkx_connection' USING ERRCODE = '22023';
  END IF;

  SELECT COALESCE((settings.value)::text::integer, 6)
    INTO v_minute_limit
    FROM public.talkx_settings settings
   WHERE settings.key = 'max_per_minute_per_connection';

  SELECT COALESCE((settings.value)::text::integer, 500)
    INTO v_day_limit
    FROM public.talkx_settings settings
   WHERE settings.key = 'daily_limit_per_connection';

  v_minute_start := statement_timestamp() - interval '1 minute';
  v_day_start := date_trunc('day', statement_timestamp() AT TIME ZONE 'America/Sao_Paulo')
                 AT TIME ZONE 'America/Sao_Paulo';
  v_next_day_at := v_day_start + interval '1 day';

  v_minute_sent := public.talkx_multiplix_connection_sent_count(p_connection_id, v_minute_start);
  v_day_sent := public.talkx_multiplix_connection_sent_count(p_connection_id, v_day_start);

  RETURN jsonb_build_object(
    'minute_limit', v_minute_limit,
    'minute_sent', v_minute_sent,
    'minute_remaining', GREATEST(v_minute_limit - v_minute_sent, 0),
    'day_limit', v_day_limit,
    'day_sent', v_day_sent,
    'day_remaining', GREATEST(v_day_limit - v_day_sent, 0),
    'next_day_at', v_next_day_at
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.talkx_connection_send_budget(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.talkx_connection_send_budget(uuid)
  TO service_role;
