-- 20260929610000_multiplix_cron_window_and_limits
-- Bloco A (F10, F17) do docs/multiplix/PLANO_FINALIZACAO_MULTIPLIX_100_ETAPAS_2026-09-29.md.
-- Achados 14, 15 e 20 da auditoria de 2026-09-29.
--
-- F10a — o cron so pegava status='sending': um dispatch com scheduled_at nunca
-- saia sozinho (o campo era rotulo na tela).
-- F10b — o worker auto-pausa fora da janela e NADA retomava: paused/outside_window
-- ficava parado para sempre, exigindo clique manual no dia seguinte.
-- F17 — o fan-out disparava ate 10 dispatches por tick na MESMA conexao (risco de
-- banimento da instancia), a URL do projeto era literal no SQL e nao existia o
-- teto `multiplix_max_recipients_default` do ADR-007 D2.
--
-- Sobre o Bearer do cron: o plano pede service-role do vault. O vault deste
-- projeto nao guarda a service-role key (so zapp_anon_key, talkx_anon_key,
-- sicoob_service_role_key) e criar esse segredo exige manejar a chave em texto,
-- o que nao cabe a esta tarefa. O caminho autenticado do cron continua sendo o
-- header x-cron-secret (comparado em tempo constante na edge contra o segredo do
-- vault) — a service key nao e necessaria para o cron chamar a edge. Divergencia
-- registrada no relatorio e no corpo do PR.
--
-- ATENCAO (ordem de aplicacao): esta funcao chama as RPCs do motor, que exigem
-- auth.role()='service_role'. pg_cron roda como postgres (dono, sem claim de
-- JWT), entao o papel e declarado localmente com set_config(..., is_local=true)
-- — vale so para a transacao do tick.

-- === F17: teto de destinatarios por dispatch (ADR-007 D2) ===
INSERT INTO public.talkx_settings (key, value, description)
VALUES (
  'multiplix_max_recipients_default',
  '200'::jsonb,
  'Teto de destinatarios por disparo do Multiplix sem confirmacao explicita (ADR-007 D2).'
)
ON CONFLICT (key) DO NOTHING;

-- === F10b: a janela de envio, em SQL, com a MESMA semantica de
-- supabase/functions/_shared/talkx-window.ts (deliveryWindowStatus) ===
CREATE OR REPLACE FUNCTION public.multiplix_dispatch_window_is_open(p_dispatch_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_dispatch public.multiplix_dispatches%ROWTYPE;
  v_tz text;
  v_local timestamp;
  v_minutes integer;
  v_start integer;
  v_end integer;
BEGIN
  SELECT * INTO v_dispatch FROM public.multiplix_dispatches WHERE id = p_dispatch_id;
  IF NOT FOUND THEN
    RETURN false;
  END IF;

  v_tz := COALESCE(NULLIF(btrim(v_dispatch.schedule_timezone), ''), 'America/Sao_Paulo');
  IF NOT EXISTS (SELECT 1 FROM pg_timezone_names WHERE name = v_tz) THEN
    RETURN false; -- fuso invalido fecha a janela (mesma decisao do helper TS)
  END IF;

  v_local := statement_timestamp() AT TIME ZONE v_tz;
  v_minutes := (extract(hour FROM v_local)::integer * 60) + extract(minute FROM v_local)::integer;

  IF v_dispatch.send_window_start IS NOT NULL AND v_dispatch.send_window_end IS NOT NULL THEN
    v_start := (extract(hour FROM v_dispatch.send_window_start)::integer * 60)
             + extract(minute FROM v_dispatch.send_window_start)::integer;
    v_end := (extract(hour FROM v_dispatch.send_window_end)::integer * 60)
           + extract(minute FROM v_dispatch.send_window_end)::integer;
    IF v_minutes < v_start OR v_minutes >= v_end THEN
      RETURN false;
    END IF;
  END IF;

  IF v_dispatch.business_hours_only THEN
    IF extract(isodow FROM v_local)::integer > 5
       OR extract(hour FROM v_local)::integer < 8
       OR extract(hour FROM v_local)::integer >= 18 THEN
      RETURN false;
    END IF;
  END IF;

  RETURN true;
END;
$function$;

REVOKE ALL ON FUNCTION public.multiplix_dispatch_window_is_open(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.multiplix_dispatch_window_is_open(uuid) TO service_role;

-- === F17: consumo do dia por conexao (Talk X + Multiplix somados) ===
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

  SELECT COALESCE(sum(usage.sent), 0)::integer INTO v_sent FROM (
    SELECT count(*) AS sent
      FROM public.talkx_recipients AS recipient
      JOIN public.talkx_campaigns AS campaign ON campaign.id = recipient.campaign_id
     WHERE campaign.whatsapp_connection_id = p_connection_id
       AND recipient.sent_at >= v_day_start
    UNION ALL
    SELECT count(*)
      FROM public.multiplix_recipients AS recipient
      JOIN public.multiplix_dispatches AS dispatch ON dispatch.id = recipient.dispatch_id
     WHERE dispatch.whatsapp_connection_id = p_connection_id
       AND recipient.sent_at >= v_day_start
  ) AS usage;

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

-- === F10/F11b/F17: scheduler ===
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'multiplix_send_url') THEN
    PERFORM vault.create_secret(
      'https://tnnnlkbymytvtqngbbqh.supabase.co/functions/v1/multiplix-send',
      'multiplix_send_url'
    );
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.trigger_pending_multiplix_dispatches()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
DECLARE
  v_dispatch_id uuid;
  v_send_url text;
  v_anon_key text;
  v_cron_secret text;
BEGIN
  -- O scheduler e um chamador privilegiado (EXECUTE so para service_role +
  -- pg_cron). Declara o papel localmente para as RPCs do motor aceitarem a
  -- promocao/retomada; is_local=true limita o efeito a esta transacao.
  PERFORM set_config('request.jwt.claim.role', 'service_role', true);

  -- F11b: fecha item preso (POST feito, lease expirado) antes de qualquer fan-out,
  -- para o dispatch nao ficar preso em 'sending' para sempre.
  PERFORM public.sweep_multiplix_stuck_recipients(500);

  -- F10a: dispatch agendado cujo horario chegou.
  FOR v_dispatch_id IN
    SELECT dispatch.id
      FROM public.multiplix_dispatches AS dispatch
     WHERE dispatch.status = 'scheduled'
       AND dispatch.scheduled_at IS NOT NULL
       AND dispatch.scheduled_at <= statement_timestamp()
     ORDER BY dispatch.scheduled_at
     LIMIT 10
  LOOP
    BEGIN
      PERFORM public.transition_multiplix_dispatch(v_dispatch_id, 'start');
    EXCEPTION WHEN OTHERS THEN
      -- Um dispatch invalido (sem destinatario, sem template) nao pode travar o tick.
      NULL;
    END;
  END LOOP;

  -- F10b: retoma o que o worker auto-pausou fora da janela, mas SO com a janela
  -- aberta de novo — sem isso o cron reabriria o dispatch a cada 2 min e o worker
  -- pausaria de novo (churn de pausa/retomada sem enviar nada).
  FOR v_dispatch_id IN
    SELECT dispatch.id
      FROM public.multiplix_dispatches AS dispatch
     WHERE dispatch.status = 'paused'
       AND dispatch.pause_reason = 'outside_window'
       AND public.multiplix_dispatch_window_is_open(dispatch.id)
     ORDER BY dispatch.updated_at
     LIMIT 10
  LOOP
    BEGIN
      PERFORM public.transition_multiplix_dispatch(v_dispatch_id, 'start');
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END LOOP;

  SELECT decrypted_secret INTO v_send_url
  FROM vault.decrypted_secrets WHERE name = 'multiplix_send_url' LIMIT 1;

  SELECT decrypted_secret INTO v_anon_key
  FROM vault.decrypted_secrets WHERE name = 'zapp_anon_key' LIMIT 1;

  SELECT decrypted_secret INTO v_cron_secret
  FROM vault.decrypted_secrets WHERE name = 'multiplix_cron_secret' LIMIT 1;

  IF v_send_url IS NULL OR v_cron_secret IS NULL THEN
    RETURN; -- sem segredo/rota configurados, nao ha como chamar a edge
  END IF;

  -- F17: no maximo UM dispatch por conexao por tick. Antes eram ate 10 na mesma
  -- instancia — fan-out que derruba a sessao do WhatsApp (bloqueio temporario).
  FOR v_dispatch_id IN
    SELECT ranked.id
      FROM (
        SELECT dispatch.id,
               row_number() OVER (
                 PARTITION BY COALESCE(dispatch.whatsapp_connection_id::text, 'sem-conexao')
                 ORDER BY dispatch.updated_at
               ) AS position
          FROM public.multiplix_dispatches AS dispatch
         WHERE dispatch.status = 'sending'
      ) AS ranked
     WHERE ranked.position <= 1
     ORDER BY ranked.id
     LIMIT 10
  LOOP
    PERFORM net.http_post(
      url := v_send_url,
      body := jsonb_build_object('dispatchId', v_dispatch_id::text, 'action', 'start'),
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'apikey', v_anon_key,
        'Authorization', 'Bearer ' || v_anon_key,
        'x-cron-secret', v_cron_secret
      ),
      timeout_milliseconds := 30000
    );
  END LOOP;
END;
$function$;

REVOKE ALL ON FUNCTION public.trigger_pending_multiplix_dispatches() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.trigger_pending_multiplix_dispatches() TO service_role;
