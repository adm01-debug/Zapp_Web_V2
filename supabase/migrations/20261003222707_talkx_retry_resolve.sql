-- talkx_retry_resolve
-- versão 20261003222707 reservada para hermes-talkx-retry-resolve-2610032120b213 em 2026-10-03T21:56:52-03:00 (hermes-db-migrar --nova)
-- talkx_x031_retry_resolve
-- Etapa X031 (F03-integridade-observabilidade-e-ensaio-real.md, seção X031)
-- Fase 3 · Camada banco · DDL: sim · Deploy de edge: não
-- Fecha CAP-047, CAP-048, CAP-049. Exige antes X012, X024.
-- rollback: 1) DROP FUNCTION public.resolve_talkx_outcome_unknown(uuid,text,text,boolean), public.retry_talkx_recipients(uuid,uuid[]); 2) recriar public.enforce_talkx_campaign_mutability() com o corpo vivo de 20261003212707 (sem o ramo app.talkx_retry_write); 3) ALTER TABLE public.talkx_recipients DROP COLUMN IF EXISTS manual_retry_count.
--
-- Delta real desta etapa (a V19 20260930630000 já entrega retry_talkx_recipient(uuid)
-- service_role que reabre failed/outcome_unknown com attempt_count<3; a X024 já
-- entrega a transition com ator/motivo):
--   1. coluna public.talkx_recipients.manual_retry_count smallint NOT NULL DEFAULT 0.
--   2. RPC retry_talkx_recipients(p_campaign_id, p_recipient_ids uuid[]) (admin/supervisor):
--      aceita destinatários 'failed' e 'skipped', até 3 reenvios MANUAIS por destinatário,
--      revalida supressão (talkx_blacklist) e elegibilidade (contato existente/não excluído),
--      devolve para 'pending' com retry_after = statement_timestamp(), ajusta failed_count/
--      skipped_count da campanha e grava evento com ator e quantidade. Se a campanha está
--      'completed' reabre para 'sending' com evento 'resumed' — o tick continua o envio,
--      sem edge nova.
--   3. RPC resolve_talkx_outcome_unknown(p_recipient_id, p_resolution, p_note,
--      p_confirm_duplicate_risk) (admin/supervisor) com mark_sent|mark_failed|retry;
--      'retry' exige p_confirm_duplicate_risk = true; move outcome_unknown_count para o
--      contador de destino e grava evento com ator.
--   4. enforce_talkx_campaign_mutability ganha a fuga transacional app.talkx_retry_write
--      (corpo vivo de 20261003212707 + ramo novo) para a RPC poder ajustar contadores e
--      reabrir 'completed' -> 'sending' sem afrouxar o caminho direto do cliente; defesa em
--      profundidade exige admin/supervisor e a transição só é permitida nesse par.
--
-- Regra de reconstrução: o corpo de enforce_talkx_campaign_mutability foi copiado da
-- migration VIVA 20261003212707 (a mais recente) e recebeu SÓ o ramo novo. Não reconstruir.
--
-- Classe: CONTRATO (ADD COLUMN + CREATE OR REPLACE FUNCTION + CREATE TRIGGER). Idempotente/replayável.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1) talkx_recipients.manual_retry_count
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.talkx_recipients
  ADD COLUMN IF NOT EXISTS manual_retry_count smallint NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.talkx_recipients.manual_retry_count IS
  'Reenvios MANUAIS de um destinatário em estado terminal (failed/skipped) — teto de 3 (X031).';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2) enforce_talkx_campaign_mutability — corpo vivo (20261003212707) + ramo
--    app.talkx_retry_write (X031). Só a RPC de retry/resolução liga a fuga,
--    de forma transacional, e só admin/supervisor pode reabrir completed->sending.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.enforce_talkx_campaign_mutability()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $function$
BEGIN
  -- X010: worker_id/worker_lease_expires_at NUNCA são escritos à mão. Só a RPC de
  -- lease (claim/release) liga app.talkx_worker_write, de forma transacional. Vale
  -- para QUALQUER papel — inclusive service_role — porque a trava é por campanha,
  -- não por destinatário.
  IF TG_OP = 'UPDATE'
     AND (NEW.worker_id IS DISTINCT FROM OLD.worker_id
          OR NEW.worker_lease_expires_at IS DISTINCT FROM OLD.worker_lease_expires_at)
     AND current_setting('app.talkx_worker_write', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'talkx_campaign_worker_managed_by_lease' USING ERRCODE = '42501';
  END IF;

  IF COALESCE(auth.role(), '') <> 'authenticated' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'draft' THEN
      RAISE EXCEPTION 'talkx_campaign_insert_must_be_draft' USING ERRCODE = '22023';
    END IF;
    IF NEW.total_recipients <> 0
       OR NEW.sent_count <> 0
       OR NEW.failed_count <> 0
       OR NEW.delivered_count <> 0
       OR NEW.outcome_unknown_count <> 0
       OR NEW.replied_count <> 0
       OR NEW.read_count <> 0
       OR NEW.skipped_count <> 0
       OR NEW.started_at IS NOT NULL
       OR NEW.completed_at IS NOT NULL THEN
      RAISE EXCEPTION 'talkx_delivery_state_managed_by_worker' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    -- X026: além do rascunho, a RPC delete_talkx_campaign pode apagar 'scheduled'
    -- (sem envio). A fuga é transacional (app.talkx_campaign_delete) e NUNCA cobre
    -- 'sending'/'paused'/'completed'/'cancelled' — esses continuam recusados aqui.
    IF OLD.status <> 'draft'
       AND NOT (OLD.status = 'scheduled'
                AND current_setting('app.talkx_campaign_delete', true) = 'on') THEN
      RAISE EXCEPTION 'talkx_campaign_delete_denied' USING ERRCODE = '55000';
    END IF;
    RETURN OLD;
  END IF;

  IF NEW.created_by IS DISTINCT FROM OLD.created_by THEN
    RAISE EXCEPTION 'talkx_campaign_owner_immutable' USING ERRCODE = '42501';
  END IF;

  -- Escape hatch sancionado: só a RPC update_talkx_campaign_limits liga essa flag
  -- (transacional, nunca vaza para outra sessão). Ele permite os limites mudarem em
  -- qualquer status, mas status/dono/estado de entrega continuam geridos pelo worker
  -- e pelo dono. Defesa em profundidade (achado #6): o GUC sozinho não basta — o
  -- chamador precisa ser o dono da campanha (perfil ativo) ou admin/supervisor.
  IF current_setting('app.talkx_limits_write', true) = 'on' THEN
    IF NOT (
      EXISTS (
        SELECT 1
          FROM public.profiles profile
         WHERE profile.user_id = auth.uid()
           AND profile.is_active = true
           AND profile.id = NEW.created_by
      )
      OR COALESCE(public.is_admin_or_supervisor(auth.uid()), false) IS TRUE
    ) THEN
      RAISE EXCEPTION 'talkx_campaign_not_authorized' USING ERRCODE = '42501';
    END IF;
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      RAISE EXCEPTION 'talkx_campaign_transition_denied' USING ERRCODE = '55000';
    END IF;
    IF NEW.total_recipients IS DISTINCT FROM OLD.total_recipients
       OR NEW.sent_count IS DISTINCT FROM OLD.sent_count
       OR NEW.failed_count IS DISTINCT FROM OLD.failed_count
       OR NEW.delivered_count IS DISTINCT FROM OLD.delivered_count
       OR NEW.outcome_unknown_count IS DISTINCT FROM OLD.outcome_unknown_count
       OR NEW.replied_count IS DISTINCT FROM OLD.replied_count
       OR NEW.read_count IS DISTINCT FROM OLD.read_count
       OR NEW.skipped_count IS DISTINCT FROM OLD.skipped_count
       OR NEW.started_at IS DISTINCT FROM OLD.started_at
       OR NEW.completed_at IS DISTINCT FROM OLD.completed_at THEN
      RAISE EXCEPTION 'talkx_delivery_state_managed_by_worker' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  -- X031: fuga sancionada do retry/resolução. Só a RPC retry_talkx_recipients /
  -- resolve_talkx_outcome_unknown liga app.talkx_retry_write (transacional). Ela
  -- permite (a) ajustar os contadores de entrega e (b) reabrir 'completed' -> 'sending';
  -- NENHUMA outra transição passa por aqui. Defesa em profundidade: além do GUC, o
  -- chamador precisa ser admin/supervisor.
  IF current_setting('app.talkx_retry_write', true) = 'on' THEN
    IF COALESCE(public.is_admin_or_supervisor(auth.uid()), false) IS NOT TRUE THEN
      RAISE EXCEPTION 'talkx_campaign_not_authorized' USING ERRCODE = '42501';
    END IF;
    IF NEW.status IS DISTINCT FROM OLD.status
       AND NOT (OLD.status = 'completed' AND NEW.status = 'sending') THEN
      RAISE EXCEPTION 'talkx_campaign_transition_denied' USING ERRCODE = '55000';
    END IF;
    RETURN NEW;
  END IF;

  IF OLD.status NOT IN ('draft', 'scheduled')
     OR NEW.status NOT IN ('draft', 'scheduled') THEN
    RAISE EXCEPTION 'talkx_campaign_transition_denied' USING ERRCODE = '55000';
  END IF;

  -- X014: agendar (ou manter agendado) é ato de admin/supervisor. A RLS de UPDATE
  -- também exige o papel; aqui é defesa em profundidade contra quem alcança a
  -- tabela por caminho que não passe pela policy.
  IF NEW.status = 'scheduled'
     AND COALESCE(public.is_admin_or_supervisor(auth.uid()), false) IS NOT TRUE THEN
    RAISE EXCEPTION 'talkx_campaign_schedule_role_required' USING ERRCODE = '42501';
  END IF;

  IF NEW.status = 'scheduled'
     AND (NEW.scheduled_at IS NULL OR NEW.total_recipients <= 0) THEN
    RAISE EXCEPTION 'talkx_schedule_requires_audience_and_timestamp' USING ERRCODE = '22023';
  END IF;

  IF NEW.status = 'scheduled'
     AND NEW.scheduled_at <= statement_timestamp() THEN
    RAISE EXCEPTION 'talkx_schedule_must_be_future' USING ERRCODE = '22023';
  END IF;

  -- X009: sair de draft exige mensagem não vazia OU mídia — uma campanha agendada
  -- sem nada para enviar é recusada.
  IF NEW.status = 'scheduled'
     AND btrim(COALESCE(NEW.message_template, '')) = ''
     AND NEW.media_url IS NULL THEN
    RAISE EXCEPTION 'talkx_schedule_requires_message_or_media' USING ERRCODE = '22023';
  END IF;

  IF NEW.total_recipients IS DISTINCT FROM OLD.total_recipients
     AND current_setting('app.talkx_recipient_snapshot_write', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'talkx_recipient_count_managed' USING ERRCODE = '42501';
  END IF;

  IF NEW.sent_count IS DISTINCT FROM OLD.sent_count
     OR NEW.failed_count IS DISTINCT FROM OLD.failed_count
     OR NEW.delivered_count IS DISTINCT FROM OLD.delivered_count
     OR NEW.outcome_unknown_count IS DISTINCT FROM OLD.outcome_unknown_count
     OR NEW.replied_count IS DISTINCT FROM OLD.replied_count
     OR NEW.read_count IS DISTINCT FROM OLD.read_count
     OR NEW.skipped_count IS DISTINCT FROM OLD.skipped_count
     OR NEW.started_at IS DISTINCT FROM OLD.started_at
     OR NEW.completed_at IS DISTINCT FROM OLD.completed_at THEN
    RAISE EXCEPTION 'talkx_delivery_state_managed_by_worker' USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.enforce_talkx_campaign_mutability() FROM PUBLIC;

DROP TRIGGER IF EXISTS enforce_talkx_campaign_mutability ON public.talkx_campaigns;
CREATE TRIGGER enforce_talkx_campaign_mutability
  BEFORE INSERT OR DELETE OR UPDATE ON public.talkx_campaigns
  FOR EACH ROW EXECUTE FUNCTION public.enforce_talkx_campaign_mutability();

-- ─────────────────────────────────────────────────────────────────────────────
-- 3) retry_talkx_recipients — reenvio manual em lote (admin/supervisor).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.retry_talkx_recipients(
  p_campaign_id   uuid,
  p_recipient_ids uuid[]
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_actor       uuid;
  v_campaign    public.talkx_campaigns%ROWTYPE;
  v_found       integer;
  v_valid       integer;
  v_failed      integer;
  v_skipped     integer;
  v_reopened    boolean := false;
  v_message     jsonb;
  rec           record;
BEGIN
  IF COALESCE(auth.role(), '') <> 'authenticated' OR auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication_required' USING ERRCODE = '42501';
  END IF;

  SELECT profile.id INTO v_actor
    FROM public.profiles profile
   WHERE profile.user_id = auth.uid()
     AND profile.is_active = true
   LIMIT 1
   FOR SHARE;
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'active_profile_not_found' USING ERRCODE = '42501';
  END IF;
  IF COALESCE(public.is_admin_or_supervisor(auth.uid()), false) IS NOT TRUE THEN
    RAISE EXCEPTION 'talkx_retry_role_required' USING ERRCODE = '42501';
  END IF;

  IF p_campaign_id IS NULL
     OR p_recipient_ids IS NULL
     OR array_length(p_recipient_ids, 1) IS NULL
     OR array_length(p_recipient_ids, 1) > 500 THEN
    RAISE EXCEPTION 'invalid_talkx_retry_request' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_campaign
    FROM public.talkx_campaigns AS campaign
   WHERE campaign.id = p_campaign_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'talkx_campaign_not_found' USING ERRCODE = 'P0002';
  END IF;
  -- Retry manual só faz sentido em campanha que já rodou. Rascunho/agendada nunca
  -- enviou; cancelada é terminal.
  IF v_campaign.status NOT IN ('sending', 'paused', 'completed') THEN
    RAISE EXCEPTION 'talkx_campaign_not_retryable_from_%', v_campaign.status USING ERRCODE = '55000';
  END IF;

  -- Todos os ids precisam existir na campanha (fail-closed, tudo-ou-nada).
  SELECT count(*), count(*) FILTER (WHERE recipient.campaign_id = p_campaign_id)
    INTO v_found, v_valid
    FROM public.talkx_recipients AS recipient
   WHERE recipient.id = ANY(p_recipient_ids);
  IF v_found <> v_valid THEN
    RAISE EXCEPTION 'talkx_retry_recipient_not_found' USING ERRCODE = 'P0002';
  END IF;

  -- Valida cada destinatário ANTES de escrever qualquer linha.
  FOR rec IN
    SELECT recipient.id, recipient.status, recipient.manual_retry_count, recipient.contact_id
      FROM public.talkx_recipients AS recipient
     WHERE recipient.campaign_id = p_campaign_id
       AND recipient.id = ANY(p_recipient_ids)
     FOR UPDATE
  LOOP
    IF rec.status NOT IN ('failed', 'skipped') THEN
      RAISE EXCEPTION 'talkx_retry_recipient_not_terminal' USING ERRCODE = '55000';
    END IF;
    IF rec.manual_retry_count >= 3 THEN
      RAISE EXCEPTION 'talkx_retry_limit_reached' USING ERRCODE = '55000';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.contacts AS contact
       WHERE contact.id = rec.contact_id
         AND contact.deleted_at IS NULL
    ) THEN
      RAISE EXCEPTION 'talkx_retry_recipient_ineligible' USING ERRCODE = '55000';
    END IF;
    IF EXISTS (
      SELECT 1
        FROM public.talkx_blacklist AS blacklist
        LEFT JOIN public.contacts AS contact ON contact.id = rec.contact_id
       WHERE blacklist.removed_at IS NULL
         AND (blacklist.expires_at IS NULL OR blacklist.expires_at > statement_timestamp())
         AND (
           blacklist.contact_id = rec.contact_id
           OR (
             NULLIF(regexp_replace(COALESCE(blacklist.phone, ''), '\D', '', 'g'), '') IS NOT NULL
             AND contact.id IS NOT NULL
             AND regexp_replace(COALESCE(blacklist.phone, ''), '\D', '', 'g') = regexp_replace(COALESCE(contact.phone, ''), '\D', '', 'g')
           )
         )
    ) THEN
      RAISE EXCEPTION 'talkx_retry_recipient_suppressed' USING ERRCODE = '55000';
    END IF;
  END LOOP;

  SELECT count(*) FILTER (WHERE recipient.status = 'failed'),
         count(*) FILTER (WHERE recipient.status = 'skipped')
    INTO v_failed, v_skipped
    FROM public.talkx_recipients AS recipient
   WHERE recipient.campaign_id = p_campaign_id
     AND recipient.id = ANY(p_recipient_ids);

  UPDATE public.talkx_recipients AS recipient
     SET status                    = 'pending',
         retry_after               = statement_timestamp(),
         manual_retry_count        = recipient.manual_retry_count + 1,
         error_message             = NULL,
         provider_dispatch_started_at = NULL,
         delivery_claim_token      = NULL,
         delivery_claimed_at       = NULL,
         delivery_claim_expires_at = NULL,
         delivery_claimed_by       = NULL,
         updated_at                = statement_timestamp()
   WHERE recipient.campaign_id = p_campaign_id
     AND recipient.id = ANY(p_recipient_ids);

  v_reopened := (v_campaign.status = 'completed');

  -- Fuga transacional do guard para ajustar contadores e reabrir a campanha.
  PERFORM set_config('app.talkx_retry_write', 'on', true);
  UPDATE public.talkx_campaigns AS campaign
     SET failed_count  = GREATEST(campaign.failed_count - v_failed, 0),
         skipped_count = GREATEST(campaign.skipped_count - v_skipped, 0),
         status        = CASE WHEN campaign.status = 'completed' THEN 'sending' ELSE campaign.status END,
         completed_at  = CASE WHEN campaign.status = 'completed' THEN NULL ELSE campaign.completed_at END,
         updated_at    = statement_timestamp()
   WHERE campaign.id = p_campaign_id;

  v_message := jsonb_build_object(
    'action', 'retry_talkx_recipients',
    'count', v_failed + v_skipped,
    'failed', v_failed,
    'skipped', v_skipped,
    'reopened', v_reopened,
    'recipient_ids', to_jsonb(p_recipient_ids)
  );

  INSERT INTO public.talkx_campaign_events (campaign_id, event_type, message, actor_id)
  VALUES (p_campaign_id, 'note', v_message::text, v_actor);

  IF v_reopened THEN
    INSERT INTO public.talkx_campaign_events (campaign_id, event_type, message, actor_id)
    VALUES (p_campaign_id, 'resumed', NULL, v_actor);
  END IF;

  RETURN v_message;
END;
$function$;

REVOKE ALL ON FUNCTION public.retry_talkx_recipients(uuid, uuid[])
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.retry_talkx_recipients(uuid, uuid[])
  TO authenticated;

COMMENT ON FUNCTION public.retry_talkx_recipients(uuid, uuid[]) IS
  'Talk X (X031): reenvio manual em lote de destinatários failed/skipped (admin/supervisor), teto de 3 por destinatário, revalida supressão/elegibilidade, ajusta contadores e grava evento com ator; reabre campanha completed -> sending.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 4) resolve_talkx_outcome_unknown — decisão humana do estado ambíguo.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.resolve_talkx_outcome_unknown(
  p_recipient_id           uuid,
  p_resolution             text,
  p_note                   text DEFAULT NULL,
  p_confirm_duplicate_risk boolean DEFAULT false
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_actor     uuid;
  v_recipient public.talkx_recipients%ROWTYPE;
  v_campaign  public.talkx_campaigns%ROWTYPE;
  v_reopened  boolean := false;
  v_new_status text;
  v_resolution text;
  v_message   jsonb;
BEGIN
  IF COALESCE(auth.role(), '') <> 'authenticated' OR auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication_required' USING ERRCODE = '42501';
  END IF;

  SELECT profile.id INTO v_actor
    FROM public.profiles profile
   WHERE profile.user_id = auth.uid()
     AND profile.is_active = true
   LIMIT 1
   FOR SHARE;
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'active_profile_not_found' USING ERRCODE = '42501';
  END IF;
  IF COALESCE(public.is_admin_or_supervisor(auth.uid()), false) IS NOT TRUE THEN
    RAISE EXCEPTION 'talkx_outcome_role_required' USING ERRCODE = '42501';
  END IF;

  IF p_recipient_id IS NULL OR p_resolution IS NULL
     OR p_resolution NOT IN ('mark_sent', 'mark_failed', 'retry') THEN
    RAISE EXCEPTION 'invalid_talkx_outcome_resolution' USING ERRCODE = '22023';
  END IF;
  IF length(COALESCE(p_note, '')) > 500 THEN
    RAISE EXCEPTION 'invalid_talkx_outcome_note' USING ERRCODE = '22023';
  END IF;
  IF p_resolution = 'retry' AND p_confirm_duplicate_risk IS NOT TRUE THEN
    RAISE EXCEPTION 'talkx_duplicate_risk_confirmation_required' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_recipient
    FROM public.talkx_recipients AS recipient
   WHERE recipient.id = p_recipient_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'talkx_recipient_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF v_recipient.status <> 'outcome_unknown' THEN
    RAISE EXCEPTION 'talkx_recipient_not_outcome_unknown' USING ERRCODE = '55000';
  END IF;

  SELECT * INTO v_campaign
    FROM public.talkx_campaigns AS campaign
   WHERE campaign.id = v_recipient.campaign_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'talkx_campaign_not_found' USING ERRCODE = 'P0002';
  END IF;

  PERFORM set_config('app.talkx_retry_write', 'on', true);

  IF p_resolution = 'mark_sent' THEN
    UPDATE public.talkx_recipients AS recipient
       SET status = 'sent',
           sent_at = COALESCE(recipient.sent_at, statement_timestamp()),
           error_message = NULL,
           delivery_claim_token = NULL,
           delivery_claimed_at = NULL,
           delivery_claim_expires_at = NULL,
           delivery_claimed_by = NULL,
           updated_at = statement_timestamp()
     WHERE recipient.id = p_recipient_id;

    UPDATE public.talkx_campaigns AS campaign
       SET outcome_unknown_count = GREATEST(campaign.outcome_unknown_count - 1, 0),
           sent_count = campaign.sent_count + 1,
           updated_at = statement_timestamp()
     WHERE campaign.id = v_recipient.campaign_id;
    v_new_status := 'sent';
    v_resolution := 'mark_sent';

  ELSIF p_resolution = 'mark_failed' THEN
    UPDATE public.talkx_recipients AS recipient
       SET status = 'failed',
           error_message = COALESCE(NULLIF(btrim(p_note), ''), 'Resolvido manualmente como falha'),
           delivery_claim_token = NULL,
           delivery_claimed_at = NULL,
           delivery_claim_expires_at = NULL,
           delivery_claimed_by = NULL,
           updated_at = statement_timestamp()
     WHERE recipient.id = p_recipient_id;

    UPDATE public.talkx_campaigns AS campaign
       SET outcome_unknown_count = GREATEST(campaign.outcome_unknown_count - 1, 0),
           failed_count = campaign.failed_count + 1,
           updated_at = statement_timestamp()
     WHERE campaign.id = v_recipient.campaign_id;
    v_new_status := 'failed';
    v_resolution := 'mark_failed';

  ELSE
    -- retry: confirmação explícita de risco de mensagem em dobro já exigida acima.
    UPDATE public.talkx_recipients AS recipient
       SET status = 'pending',
           retry_after = statement_timestamp(),
           manual_retry_count = recipient.manual_retry_count + 1,
           error_message = NULL,
           provider_dispatch_started_at = NULL,
           delivery_claim_token = NULL,
           delivery_claimed_at = NULL,
           delivery_claim_expires_at = NULL,
           delivery_claimed_by = NULL,
           updated_at = statement_timestamp()
     WHERE recipient.id = p_recipient_id;

    v_reopened := (v_campaign.status = 'completed');

    UPDATE public.talkx_campaigns AS campaign
       SET outcome_unknown_count = GREATEST(campaign.outcome_unknown_count - 1, 0),
           status = CASE WHEN campaign.status = 'completed' THEN 'sending' ELSE campaign.status END,
           completed_at = CASE WHEN campaign.status = 'completed' THEN NULL ELSE campaign.completed_at END,
           updated_at = statement_timestamp()
     WHERE campaign.id = v_recipient.campaign_id;
    v_new_status := 'pending';
    v_resolution := 'retry';
  END IF;

  v_message := jsonb_build_object(
    'action', 'resolve_talkx_outcome_unknown',
    'recipient_id', p_recipient_id,
    'resolution', v_resolution,
    'note', p_note,
    'new_status', v_new_status,
    'reopened', v_reopened
  );

  INSERT INTO public.talkx_campaign_events (campaign_id, event_type, message, actor_id)
  VALUES (v_recipient.campaign_id, 'note', v_message::text, v_actor);

  IF v_reopened THEN
    INSERT INTO public.talkx_campaign_events (campaign_id, event_type, message, actor_id)
    VALUES (v_recipient.campaign_id, 'resumed', NULL, v_actor);
  END IF;

  RETURN v_message;
END;
$function$;

REVOKE ALL ON FUNCTION public.resolve_talkx_outcome_unknown(uuid, text, text, boolean)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resolve_talkx_outcome_unknown(uuid, text, text, boolean)
  TO authenticated;

COMMENT ON FUNCTION public.resolve_talkx_outcome_unknown(uuid, text, text, boolean) IS
  'Talk X (X031): resolve um destinatário outcome_unknown (admin/supervisor) com mark_sent|mark_failed|retry. retry exige p_confirm_duplicate_risk=true. Move outcome_unknown_count para sent_count/failed_count e grava evento com ator.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 5) fail-closed: sem os objetos/coluna da etapa, a migration aborta.
-- ─────────────────────────────────────────────────────────────────────────────
DO $guard$
DECLARE
  v_missing text;
BEGIN
  SELECT string_agg(esperado.assinatura, ', ') INTO v_missing
  FROM (
    VALUES
      ('public.retry_talkx_recipients(uuid,uuid[])'),
      ('public.resolve_talkx_outcome_unknown(uuid,text,text,boolean)'),
      ('public.enforce_talkx_campaign_mutability()')
  ) AS esperado(assinatura)
  WHERE to_regprocedure(esperado.assinatura) IS NULL;

  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'talkx_x031_objetos_ausentes: %', v_missing;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'talkx_recipients'
       AND column_name = 'manual_retry_count'
  ) THEN
    RAISE EXCEPTION 'talkx_x031_coluna_ausente: public.talkx_recipients.manual_retry_count';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgname = 'enforce_talkx_campaign_mutability'
       AND tgrelid = 'public.talkx_campaigns'::regclass
  ) THEN
    RAISE EXCEPTION 'talkx_x031_trigger_ausente: enforce_talkx_campaign_mutability';
  END IF;
END;
$guard$;
