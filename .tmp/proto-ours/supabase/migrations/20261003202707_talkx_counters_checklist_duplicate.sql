-- talkx_counters_checklist_duplicate
-- versão 20261003202707 reservada para hermes-talkx-contadores-checklist-duplicar-26100316270863 em 2026-10-03T17:23:14-03:00 (hermes-db-migrar --nova)
-- talkx_v4_x026_contadores_checklist_duplicar
-- Etapa X026 (F03-integridade-observabilidade-e-ensaio-real.md, seção X026)
-- Fase 3 · Camada banco + front (hook) · DDL: sim · Deploy de edge: não
-- Fecha CAP-056, CAP-079, CAP-106, CAP-107, CAP-109.
--
-- Delta real desta etapa (a V15 20260930750000, já aplicada, põe replied_count no
-- guard e dropa increment_talkx_template_use):
--   1. coluna public.talkx_campaigns.skipped_count int NOT NULL DEFAULT 0 + backfill;
--   2. claim_talkx_recipient incrementa skipped_count no ramo BLOQUEADO (lista negra);
--   3. complete_talkx_recipient('skipped') incrementa skipped_count;
--   4. replied_count E skipped_count entram no guard enforce_talkx_campaign_mutability;
--   5. RPC log_talkx_campaign_checklist(p_campaign_id, p_items jsonb) grava 'checklist' com ator;
--   6. RPC duplicate_talkx_campaign(p_campaign_id) cria rascunho sem destinatários/agendamento;
--   7. RPC delete_talkx_campaign(p_campaign_id) aceita 'draft' e 'scheduled';
--   8. policy de INSERT de eventos de 'authenticated' limitada a note|checklist|segments_reviewed.
--
-- Regra de reconstrução: os corpos de claim_talkx_recipient, complete_talkx_recipient e
-- enforce_talkx_campaign_mutability foram copiados das migrations VIVAS (20260912110000,
-- 20260911190000 e 20261002381230, conferidos contra pg_get_functiondef do banco canônico)
-- e receberam SÓ o delta. Não reconstruir de memória.
--
-- Classe: CONTRATO (CREATE OR REPLACE FUNCTION + DROP FUNCTION + CREATE POLICY).
-- Aplicar após o deploy do front que deixa de chamar increment_talkx_template_use
-- (o front já não a chama desde a V15; o DROP abaixo é idempotente/replayável).
--
-- rollback: 1) recriar a policy "talkx_campaign_events_insert" de 20260929730000 (sem o filtro event_type); 2) DROP FUNCTION public.duplicate_talkx_campaign(uuid), public.delete_talkx_campaign(uuid), public.log_talkx_campaign_checklist(uuid,jsonb); 3) recriar enforce_talkx_campaign_mutability() com o corpo de 20261002381230, claim_talkx_recipient com o de 20260912110000 e complete_talkx_recipient com o de 20260911190000 (todos sem o delta de skipped_count/fuga); 4) ALTER TABLE public.talkx_campaigns DROP COLUMN IF EXISTS skipped_count.
-- Detalhe dos passos de desfazer:
--   1. DROP POLICY IF EXISTS "talkx_campaign_events_insert" e recriar a policy vigente
--      (corpo de 20260929730000_talkx_events_contract_v11.sql: sem o filtro event_type);
--   2. DROP FUNCTION public.duplicate_talkx_campaign(uuid);
--   3. DROP FUNCTION public.delete_talkx_campaign(uuid);
--   4. DROP FUNCTION public.log_talkx_campaign_checklist(uuid, jsonb);
--   5. recriar public.enforce_talkx_campaign_mutability() com o corpo de 20261002381230
--      (sem skipped_count e sem a fuga app.talkx_campaign_delete no ramo DELETE);
--   6. recriar public.claim_talkx_recipient(uuid,uuid,text,integer) com o corpo de
--      20260912110000 (sem a CTE 'skipped' que soma skipped_count);
--   7. recriar public.complete_talkx_recipient(uuid,uuid,text,text) com o corpo de
--      20260911190000 (sem o ramo skipped_count);
--   8. ALTER TABLE public.talkx_campaigns DROP COLUMN IF EXISTS skipped_count;
--   9. (increment_talkx_template_use não volta — a V15 a removeu de propósito.)

-- ─────────────────────────────────────────────────────────────────────────────
-- 1) skipped_count + backfill por agregação
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.talkx_campaigns
  ADD COLUMN IF NOT EXISTS skipped_count integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.talkx_campaigns.skipped_count IS
  'Destinatários pulados pelo motor (lista negra/opt-out) — gerido pelo worker/RPC, nunca pelo cliente (X026).';

-- Backfill: o contador reflete o que já existe em talkx_recipients.status='skipped'.
UPDATE public.talkx_campaigns AS campaign
   SET skipped_count = agregado.cnt
  FROM (
    SELECT recipient.campaign_id, count(*)::integer AS cnt
      FROM public.talkx_recipients AS recipient
     WHERE recipient.status = 'skipped'
     GROUP BY recipient.campaign_id
  ) AS agregado
 WHERE campaign.id = agregado.campaign_id
   AND campaign.skipped_count IS DISTINCT FROM agregado.cnt;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2) DROP increment_talkx_template_use — idempotente (a V15 já a removeu).
--    Mantido aqui como contrato explícito da etapa; o front nunca mais a chama.
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF to_regprocedure('public.increment_talkx_template_use(uuid)') IS NOT NULL THEN
    REVOKE ALL ON FUNCTION public.increment_talkx_template_use(uuid)
      FROM PUBLIC, anon, authenticated, service_role;
    DROP FUNCTION public.increment_talkx_template_use(uuid);
  END IF;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3) enforce_talkx_campaign_mutability — guard com replied_count + skipped_count.
--    Corpo vivo (20261002381230) + delta:
--      (a) skipped_count no bloco INSERT de estado zerado;
--      (b) skipped_count nos dois blocos de contadores geridos pelo worker;
--      (c) fuga transacional app.talkx_campaign_delete para permitir à RPC apagar
--          campanha 'scheduled' (a RLS continua exigindo 'draft'; a RPC é o único
--          caminho sancionado, e nunca apaga 'sending').
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
       OR NEW.skipped_count IS DISTINCT FROM OLD.skipped_count
       OR NEW.started_at IS DISTINCT FROM OLD.started_at
       OR NEW.completed_at IS DISTINCT FROM OLD.completed_at THEN
      RAISE EXCEPTION 'talkx_delivery_state_managed_by_worker' USING ERRCODE = '42501';
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
-- 4) claim_talkx_recipient — soma skipped_count no ramo BLOQUEADO.
--    Corpo vivo (20260912110000) + CTE 'skipped'. Assinatura preservada.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.claim_talkx_recipient(
  p_campaign_id uuid,
  p_recipient_id uuid,
  p_worker text,
  p_lease_seconds integer DEFAULT 90
) RETURNS TABLE(
  recipient_id uuid,
  contact_id uuid,
  claim_token uuid,
  claim_expires_at timestamptz,
  delivery_attempt_count integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'service_role_required' USING ERRCODE = '42501';
  END IF;
  IF p_campaign_id IS NULL OR p_recipient_id IS NULL
     OR p_worker IS NULL OR p_worker !~ '^[A-Za-z0-9._:@/-]{1,100}$'
     OR p_lease_seconds IS NULL OR p_lease_seconds NOT BETWEEN 30 AND 300 THEN
    RAISE EXCEPTION 'invalid_talkx_delivery_claim' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  WITH candidate AS (
    SELECT recipient.id, recipient.contact_id
    FROM public.talkx_recipients AS recipient
    JOIN public.talkx_campaigns AS campaign ON campaign.id = recipient.campaign_id
    WHERE recipient.campaign_id = p_campaign_id
      AND recipient.id = p_recipient_id
      AND campaign.status = 'sending'
      AND (
        recipient.status = 'pending'
        OR (
          recipient.status = 'sending'
          AND recipient.delivery_claim_expires_at <= statement_timestamp()
          AND recipient.provider_dispatch_started_at IS NULL
        )
      )
    ORDER BY recipient.created_at, recipient.id
    FOR UPDATE OF recipient SKIP LOCKED
    LIMIT 1
  ), blocked AS (
    UPDATE public.talkx_recipients AS recipient
       SET status = 'skipped',
           error_message = 'Contato na lista negra (opt-out)',
           delivery_claim_token = NULL,
           delivery_claimed_at = NULL,
           delivery_claim_expires_at = NULL,
           delivery_claimed_by = NULL,
           updated_at = statement_timestamp()
      FROM candidate
      LEFT JOIN public.contacts AS contact ON contact.id = candidate.contact_id
     WHERE recipient.id = candidate.id
       AND EXISTS (
         SELECT 1
         FROM public.talkx_blacklist AS blacklist
         WHERE blacklist.removed_at IS NULL
           AND (blacklist.expires_at IS NULL OR blacklist.expires_at > statement_timestamp())
           AND (
             blacklist.contact_id = candidate.contact_id
             OR (
               NULLIF(regexp_replace(COALESCE(blacklist.phone, ''), '\D', '', 'g'), '') IS NOT NULL
               AND contact.id IS NOT NULL
               AND regexp_replace(COALESCE(blacklist.phone, ''), '\D', '', 'g') = regexp_replace(COALESCE(contact.phone, ''), '\D', '', 'g')
             )
           )
       )
    RETURNING recipient.id
  ), skipped AS (
    -- X026: destinatário pulado pelo claim entra no contador skipped_count.
    UPDATE public.talkx_campaigns AS campaign
       SET skipped_count = campaign.skipped_count + pulados.cnt,
           updated_at = statement_timestamp()
      FROM (SELECT count(*)::integer AS cnt FROM blocked) AS pulados
     WHERE campaign.id = p_campaign_id
       AND pulados.cnt > 0
    RETURNING campaign.id
  ), claimed AS (
    UPDATE public.talkx_recipients AS recipient
       SET status = 'sending',
           delivery_claim_token = gen_random_uuid(),
           delivery_claimed_at = statement_timestamp(),
           delivery_claim_expires_at = statement_timestamp() + make_interval(secs => p_lease_seconds),
           delivery_claimed_by = p_worker,
           delivery_attempt_count = recipient.delivery_attempt_count + 1,
           provider_dispatch_started_at = NULL,
           updated_at = statement_timestamp()
      FROM candidate
     WHERE recipient.id = candidate.id
       AND NOT EXISTS (SELECT 1 FROM blocked)
    RETURNING recipient.*
  )
  SELECT claimed.id, claimed.contact_id, claimed.delivery_claim_token,
         claimed.delivery_claim_expires_at, claimed.delivery_attempt_count
  FROM claimed;
END;
$function$;

REVOKE ALL ON FUNCTION public.claim_talkx_recipient(uuid, uuid, text, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_talkx_recipient(uuid, uuid, text, integer)
  TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5) complete_talkx_recipient — soma skipped_count quando p_status='skipped'.
--    Corpo vivo (20260911190000) + ramo skipped_count. Assinatura preservada.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.complete_talkx_recipient(
  p_recipient_id uuid,
  p_claim_token uuid,
  p_status text,
  p_error_message text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_campaign_id uuid;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'service_role_required' USING ERRCODE = '42501';
  END IF;
  IF p_recipient_id IS NULL OR p_claim_token IS NULL
     OR p_status IS NULL OR p_status NOT IN ('sent', 'failed', 'skipped', 'outcome_unknown')
     OR length(COALESCE(p_error_message, '')) > 1000 THEN
    RAISE EXCEPTION 'invalid_talkx_delivery_completion' USING ERRCODE = '22023';
  END IF;

  UPDATE public.talkx_recipients AS recipient
  SET status = p_status,
      sent_at = CASE WHEN p_status = 'sent' THEN statement_timestamp() ELSE recipient.sent_at END,
      error_message = CASE WHEN p_status = 'sent' THEN NULL ELSE NULLIF(btrim(p_error_message), '') END,
      delivery_claim_token = NULL,
      delivery_claimed_at = NULL,
      delivery_claim_expires_at = NULL,
      delivery_claimed_by = NULL,
      delivery_last_claim_token = p_claim_token,
      updated_at = statement_timestamp()
  WHERE recipient.id = p_recipient_id
    AND recipient.status = 'sending'
    AND recipient.delivery_claim_token = p_claim_token
  RETURNING recipient.campaign_id INTO v_campaign_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'talkx_delivery_claim_conflict' USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.talkx_campaigns AS campaign
  SET sent_count = campaign.sent_count + CASE WHEN p_status = 'sent' THEN 1 ELSE 0 END,
      failed_count = campaign.failed_count + CASE WHEN p_status = 'failed' THEN 1 ELSE 0 END,
      outcome_unknown_count = campaign.outcome_unknown_count + CASE WHEN p_status = 'outcome_unknown' THEN 1 ELSE 0 END,
      skipped_count = campaign.skipped_count + CASE WHEN p_status = 'skipped' THEN 1 ELSE 0 END,
      updated_at = statement_timestamp()
  WHERE campaign.id = v_campaign_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.complete_talkx_recipient(uuid, uuid, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_talkx_recipient(uuid, uuid, text, text)
  TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6) log_talkx_campaign_checklist — grava o evento 'checklist' com ator.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.log_talkx_campaign_checklist(
  p_campaign_id uuid,
  p_items jsonb
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_actor_profile_id uuid;
  v_campaign_owner uuid;
  v_event_id uuid;
BEGIN
  IF COALESCE(auth.role(), '') <> 'authenticated' OR auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication_required' USING ERRCODE = '42501';
  END IF;

  SELECT profile.id INTO v_actor_profile_id
    FROM public.profiles profile
   WHERE profile.user_id = auth.uid()
     AND profile.is_active = true
   LIMIT 1
   FOR SHARE;
  IF v_actor_profile_id IS NULL THEN
    RAISE EXCEPTION 'active_profile_not_found' USING ERRCODE = '42501';
  END IF;

  IF p_campaign_id IS NULL OR p_items IS NULL THEN
    RAISE EXCEPTION 'invalid_talkx_checklist_payload' USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(p_items) <> 'array' THEN
    RAISE EXCEPTION 'invalid_talkx_checklist_payload' USING ERRCODE = '22023';
  END IF;
  IF jsonb_array_length(p_items) > 200 OR pg_column_size(p_items) > 16384 THEN
    RAISE EXCEPTION 'invalid_talkx_checklist_payload' USING ERRCODE = '22023';
  END IF;

  SELECT campaign.created_by INTO v_campaign_owner
    FROM public.talkx_campaigns AS campaign
   WHERE campaign.id = p_campaign_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'talkx_campaign_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF v_campaign_owner IS DISTINCT FROM v_actor_profile_id
     AND COALESCE(public.is_admin_or_supervisor(auth.uid()), false) IS NOT TRUE THEN
    RAISE EXCEPTION 'talkx_campaign_not_authorized' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.talkx_campaign_events (campaign_id, event_type, actor_id, message)
  VALUES (p_campaign_id, 'checklist', v_actor_profile_id, p_items::text)
  RETURNING id INTO v_event_id;

  RETURN v_event_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.log_talkx_campaign_checklist(uuid, jsonb)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.log_talkx_campaign_checklist(uuid, jsonb)
  TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 7) duplicate_talkx_campaign — cria um rascunho novo copiando mensagem, mídia,
--    segmentos, limites e janela; SEM destinatários e SEM agendamento.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.duplicate_talkx_campaign(p_campaign_id uuid)
RETURNS public.talkx_campaigns
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_actor_profile_id uuid;
  v_source public.talkx_campaigns%ROWTYPE;
  v_new public.talkx_campaigns%ROWTYPE;
  v_now timestamptz := statement_timestamp();
BEGIN
  IF COALESCE(auth.role(), '') <> 'authenticated' OR auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication_required' USING ERRCODE = '42501';
  END IF;

  SELECT profile.id INTO v_actor_profile_id
    FROM public.profiles profile
   WHERE profile.user_id = auth.uid()
     AND profile.is_active = true
   LIMIT 1
   FOR SHARE;
  IF v_actor_profile_id IS NULL THEN
    RAISE EXCEPTION 'active_profile_not_found' USING ERRCODE = '42501';
  END IF;
  -- X014: criar rascunho é ato de admin/supervisor (a RLS de INSERT também exige).
  IF COALESCE(public.is_admin_or_supervisor(auth.uid()), false) IS NOT TRUE THEN
    RAISE EXCEPTION 'talkx_campaign_role_required' USING ERRCODE = '42501';
  END IF;

  IF p_campaign_id IS NULL THEN
    RAISE EXCEPTION 'talkx_campaign_not_found' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_source
    FROM public.talkx_campaigns AS campaign
   WHERE campaign.id = p_campaign_id
   FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'talkx_campaign_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF v_source.created_by IS DISTINCT FROM v_actor_profile_id
     AND COALESCE(public.is_admin_or_supervisor(auth.uid()), false) IS NOT TRUE THEN
    RAISE EXCEPTION 'talkx_campaign_not_authorized' USING ERRCODE = '42501';
  END IF;

  -- Copia configuração (mensagem, mídia, segmento, limites e janela). NÃO copia
  -- destinatários (total_recipients=0), agendamento (scheduled_at nulo), estado de
  -- entrega nem autoria: o novo rascunho pertence a quem duplicou.
  INSERT INTO public.talkx_campaigns (
    name, message_template, description, objective, audience_source,
    audience_filters, segment_id, template_id, template_version_id,
    whatsapp_connection_id, media_url, media_type, schedule_timezone,
    send_window_start, send_window_end, business_hours_only, speed_profile,
    typing_delay_min, typing_delay_max, send_interval_min, send_interval_max,
    respect_suppression, confirm_consent, draft_step, owner, responsible_id,
    status, created_by, draft_creation_key, revision, created_at, updated_at
  ) VALUES (
    left(v_source.name || ' (cópia)', 200), v_source.message_template, v_source.description,
    v_source.objective, v_source.audience_source, v_source.audience_filters,
    v_source.segment_id, v_source.template_id, v_source.template_version_id,
    v_source.whatsapp_connection_id, v_source.media_url, v_source.media_type,
    v_source.schedule_timezone, v_source.send_window_start, v_source.send_window_end,
    v_source.business_hours_only, v_source.speed_profile, v_source.typing_delay_min,
    v_source.typing_delay_max, v_source.send_interval_min, v_source.send_interval_max,
    v_source.respect_suppression, v_source.confirm_consent, v_source.draft_step,
    v_actor_profile_id, v_actor_profile_id,
    'draft', v_actor_profile_id, gen_random_uuid(), 1, v_now, v_now
  )
  RETURNING * INTO v_new;

  RETURN v_new;
END;
$function$;

REVOKE ALL ON FUNCTION public.duplicate_talkx_campaign(uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.duplicate_talkx_campaign(uuid)
  TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 8) delete_talkx_campaign — aceita 'draft' e 'scheduled' (sem envio).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.delete_talkx_campaign(p_campaign_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_actor_profile_id uuid;
  v_campaign public.talkx_campaigns%ROWTYPE;
BEGIN
  IF COALESCE(auth.role(), '') <> 'authenticated' OR auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication_required' USING ERRCODE = '42501';
  END IF;

  SELECT profile.id INTO v_actor_profile_id
    FROM public.profiles profile
   WHERE profile.user_id = auth.uid()
     AND profile.is_active = true
   LIMIT 1
   FOR SHARE;
  IF v_actor_profile_id IS NULL THEN
    RAISE EXCEPTION 'active_profile_not_found' USING ERRCODE = '42501';
  END IF;
  -- X014: excluir campanha é ato de admin/supervisor (a RLS de DELETE também exige).
  IF COALESCE(public.is_admin_or_supervisor(auth.uid()), false) IS NOT TRUE THEN
    RAISE EXCEPTION 'talkx_campaign_role_required' USING ERRCODE = '42501';
  END IF;

  IF p_campaign_id IS NULL THEN
    RAISE EXCEPTION 'talkx_campaign_not_found' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_campaign
    FROM public.talkx_campaigns AS campaign
   WHERE campaign.id = p_campaign_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'talkx_campaign_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF v_campaign.created_by IS DISTINCT FROM v_actor_profile_id
     AND COALESCE(public.is_admin_or_supervisor(auth.uid()), false) IS NOT TRUE THEN
    RAISE EXCEPTION 'talkx_campaign_not_authorized' USING ERRCODE = '42501';
  END IF;

  -- Só rascunho ou agendamento sem envio. Campanha em voo/concluída não se apaga.
  IF v_campaign.status NOT IN ('draft', 'scheduled') THEN
    RAISE EXCEPTION 'talkx_campaign_not_deletable' USING ERRCODE = '55000';
  END IF;

  -- Fuga transacional lida pelo guard (enforce_talkx_campaign_mutability) para o
  -- ramo DELETE aceitar 'scheduled' sem afrouxar o caminho direto do cliente.
  PERFORM set_config('app.talkx_campaign_delete', 'on', true);
  DELETE FROM public.talkx_campaigns WHERE id = p_campaign_id;

  RETURN p_campaign_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.delete_talkx_campaign(uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_talkx_campaign(uuid)
  TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 9) Policy de INSERT de eventos — 'authenticated' só grava note|checklist|
--    segments_reviewed. Corpo vivo (20260929730000) + filtro de event_type.
--    O ciclo de vida e a trilha de supressão são gravados pelo SERVIDOR (trigger
--    SECURITY DEFINER / RPCs), que não passam por RLS.
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "talkx_campaign_events_insert" ON public.talkx_campaign_events;
CREATE POLICY "talkx_campaign_events_insert" ON public.talkx_campaign_events FOR INSERT TO authenticated
  WITH CHECK (
    event_type IN ('note', 'checklist', 'segments_reviewed')
    AND (
      EXISTS (SELECT 1 FROM public.talkx_campaigns tc WHERE tc.id = talkx_campaign_events.campaign_id
        AND (tc.created_by = (SELECT p.id FROM public.profiles p WHERE p.user_id = auth.uid() LIMIT 1) OR public.is_admin_or_supervisor(auth.uid())))
      OR (talkx_campaign_events.campaign_id IS NULL AND public.is_admin_or_supervisor(auth.uid()))
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 10) fail-closed: sem os objetos da etapa, a migration aborta em vez de deixar
--     o contrato pela metade.
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_missing text;
BEGIN
  SELECT string_agg(assinatura, ', ') INTO v_missing
  FROM (
    VALUES
      ('public.duplicate_talkx_campaign(uuid)'),
      ('public.delete_talkx_campaign(uuid)'),
      ('public.log_talkx_campaign_checklist(uuid,jsonb)'),
      ('public.claim_talkx_recipient(uuid,uuid,text,integer)'),
      ('public.complete_talkx_recipient(uuid,uuid,text,text)'),
      ('public.enforce_talkx_campaign_mutability()')
  ) AS esperado(assinatura)
  WHERE to_regprocedure(assinatura) IS NULL;

  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'talkx_x026_rpcs_ausentes: %', v_missing;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'talkx_campaigns'
       AND column_name = 'skipped_count'
  ) THEN
    RAISE EXCEPTION 'talkx_x026_coluna_ausente: public.talkx_campaigns.skipped_count';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'talkx_campaign_events'
       AND policyname = 'talkx_campaign_events_insert'
  ) THEN
    RAISE EXCEPTION 'talkx_x026_policy_ausente: talkx_campaign_events_insert';
  END IF;

  IF to_regprocedure('public.increment_talkx_template_use(uuid)') IS NOT NULL THEN
    RAISE EXCEPTION 'talkx_x026_increment_ainda_existe: public.increment_talkx_template_use(uuid)';
  END IF;
END;
$$;
