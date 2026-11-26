-- talkx_campaign_pace_orcamento_interno
-- Rollback (SQL executavel, na ordem):
--   1) CREATE OR REPLACE FUNCTION public.talkx_campaign_pace(uuid) com
--      RETURN public.talkx_connection_send_budget(v_connection_id) no fim
--      (corpo integral em supabase/migrations/20261002551230_talkx_limits_ritmo.sql:208-249);
--   2) CREATE OR REPLACE FUNCTION public.talkx_connection_send_budget(uuid) com o corpo
--      inline do bloco (a) desta migracao, mantendo o check de service_role;
--   3) DROP FUNCTION IF EXISTS public.talkx_connection_send_budget_internal(uuid);

-- BUG CORRIGIDO: public.talkx_campaign_pace aceita admin/supervisor (GRANT para
-- authenticated + gate is_admin_or_supervisor), mas o ultimo passo do corpo e
-- RETURN public.talkx_connection_send_budget(v_connection_id) — e essa funcao
-- abre com "IF COALESCE(auth.role(), '') <> 'service_role' THEN RAISE EXCEPTION
-- 'service_role_required'". auth.role() le o claim do JWT da REQUISICAO, nao o
-- dono do SECURITY DEFINER: o ramo admin/supervisor do gate e codigo morto e
-- todo admin recebe 42501 service_role_required, entao o orcamento por campanha
-- nunca chegou a uma tela. (ACL de talkx_connection_send_budget em producao:
-- postgres + service_role apenas — authenticated nem tem EXECUTE nela.)
--
-- Correcao minima: o miolo do orcamento vira
-- public.talkx_connection_send_budget_internal(uuid), SEM gate de papel e SEM
-- grant para anon/authenticated; talkx_connection_send_budget continua sendo o
-- wrapper de service_role (mesmo check, mesma resposta) e talkx_campaign_pace
-- passa a chamar a interna. O motor (supabase/functions/talkx-send) chama o
-- wrapper como service_role e nao muda de comportamento.

BEGIN;

-- ============================================================================
-- (a) miolo do orcamento — mesmas contas, sem check de papel
-- ============================================================================
CREATE OR REPLACE FUNCTION public.talkx_connection_send_budget_internal(p_connection_id uuid)
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

COMMENT ON FUNCTION public.talkx_connection_send_budget_internal(uuid) IS
  'Miolo de talkx_connection_send_budget sem gate de papel. Chamar apenas de funcoes SECURITY DEFINER que ja validaram admin/supervisor ou service_role; nao tem grant para anon/authenticated.';

REVOKE ALL ON FUNCTION public.talkx_connection_send_budget_internal(uuid)
  FROM PUBLIC, anon, authenticated;

-- ============================================================================
-- (b) wrapper de service_role — mesmo contrato de antes
-- ============================================================================
CREATE OR REPLACE FUNCTION public.talkx_connection_send_budget(p_connection_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'service_role_required' USING ERRCODE = '42501';
  END IF;

  RETURN public.talkx_connection_send_budget_internal(p_connection_id);
END;
$function$;

REVOKE ALL ON FUNCTION public.talkx_connection_send_budget(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.talkx_connection_send_budget(uuid)
  TO service_role;

-- ============================================================================
-- (c) talkx_campaign_pace — gate de admin/supervisor + miolo interno
-- ============================================================================
CREATE OR REPLACE FUNCTION public.talkx_campaign_pace(p_campaign_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_connection_id uuid;
BEGIN
  IF COALESCE(auth.role(), '') = 'service_role' THEN
    NULL; -- service_role passa direto
  ELSIF COALESCE(public.is_admin_or_supervisor(auth.uid()), false) IS NOT TRUE THEN
    RAISE EXCEPTION 'talkx_campaign_role_required' USING ERRCODE = '42501';
  END IF;

  SELECT campaign.whatsapp_connection_id
    INTO v_connection_id
    FROM public.talkx_campaigns campaign
   WHERE campaign.id = p_campaign_id;

  IF v_connection_id IS NULL THEN
    RETURN jsonb_build_object(
      'minute_limit', 0, 'minute_sent', 0, 'minute_remaining', 0,
      'day_limit', 0, 'day_sent', 0, 'day_remaining', 0, 'next_day_at', null
    );
  END IF;

  RETURN public.talkx_connection_send_budget_internal(v_connection_id);
END;
$function$;

REVOKE ALL ON FUNCTION public.talkx_campaign_pace(uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.talkx_campaign_pace(uuid)
  TO service_role, authenticated;

COMMIT;