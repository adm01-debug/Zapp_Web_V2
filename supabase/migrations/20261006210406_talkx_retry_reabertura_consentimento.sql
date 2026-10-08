-- talkx_retry_reabertura_consentimento
-- Rollback: 1) DROP FUNCTION public.retry_talkx_recipients(uuid, uuid[], boolean);
--   2) DROP FUNCTION public.resolve_talkx_outcome_unknown(uuid, text, text, boolean, boolean);
--   3) recriar public.enforce_talkx_campaign_mutability() com o corpo vivo de
--      20261003232707 (X032, sem o ramo da reabertura confirmada);
--   4) recriar public.retry_talkx_recipients(uuid, uuid[]) e
--      public.resolve_talkx_outcome_unknown(uuid, text, text, boolean) com os corpos vivos de
--      20261003222707 (X031) e reaplicar os REVOKE/GRANT/COMMENT de la.
--
-- versão 20261006210406 reservada para hermes-talkx-retry-reabertura-consentimento-261006175941ec (hermes-db-migrar --nova)
-- r3_delta_005 (#124, item 124 do BACKLOG_VERIFICADO): Talk X — a reabertura da campanha por
-- retry nao exigia a nova confirmacao de lancamento.
--
-- PROBLEMA (evidencia da auditoria: caderno §11.1, sem mudanca depois de 65679f38):
-- a RPC retry_talkx_recipients (X031) e a resolucao 'retry' de resolve_talkx_outcome_unknown
-- reabrem uma campanha 'completed' -> 'sending' (completed_at zerado, evento 'resumed', o tick
-- volta a disparar mensagem para cliente real) sem passar pelo gate que X032 criou para
-- lancamento (transition_talkx_campaign 'start' e o guard de 'scheduled' exigem
-- consent_confirmed_at/base legal gravados). Ou seja: a reabertura e um novo lancamento, mas
-- nao exigia a nova confirmacao de lancamento do operador.
--
-- ENTREGA (so este problema):
--   (a) retry_talkx_recipients ganha p_confirm_relaunch boolean DEFAULT false. Reabrir campanha
--       'completed' sem a confirmacao explicita -> talkx_relaunch_confirmation_required (22023),
--       sem escrever nada. O retry em campanha 'sending'/'paused' (nao reabre) segue sem exigir
--       confirmacao nova — nenhum comportamento existente fora da reabertura muda;
--   (b) resolve_talkx_outcome_unknown ganha p_confirm_relaunch boolean DEFAULT false com o mesmo
--       gate no ramo 'retry' quando a campanha esta 'completed' (o p_confirm_duplicate_risk
--       continua obrigatorio — as duas confirmacoes sao pedidas juntas);
--   (c) na reabertura confirmada, a MESMA transacao grava o carimbo da nova confirmacao
--       (consent_confirmed_by = operador, consent_confirmed_at = agora) e a trilha ganha
--       'relaunch_confirmed'; a confirmacao anterior continua em talkx_campaign_events;
--   (d) defesa em profundidade: o guard enforce_talkx_campaign_mutability recusa a transicao
--       'completed' -> 'sending' sob app.talkx_retry_write sem o carimbo RENOVADO na mesma
--       transacao — um caminho futuro que reabra pelo GUC sem confirmar nao passa;
--   (e) a assinatura ANTIGA (sem a confirmacao) e DROPADA e o guard final aborta se ela
--       sobreviver: nao ha caminho que reabra sem o gate.
--
-- ASSINATURA POR DEFAULT: p_confirm_relaunch tem DEFAULT false, entao a chamada antiga de 2/4
-- argumentos continua resolvendo — agora fail-closed (recusa a reabertura nao confirmada).
-- Nao ha chamador no repositorio (src/, supabase/functions/) para estes RPCs hoje.
-- Contrato para quem chamar depois: para reabrir campanha concluida e preciso confirmar.
--
-- Regra de reconstrucao: os corpos de retry_talkx_recipients e resolve_talkx_outcome_unknown
-- foram copiados VIVOS de 20261003222707 (X031) e o de enforce_talkx_campaign_mutability de
-- 20261003232707 (X032, o mais recente). So o delta acima foi aplicado. Nao reconstruir.
--
-- COLISAO COM O #123 (R3-DELTA-004, 20261006193650_talkx_retry_lote_ids_inexistentes.sql):
-- aquele cartao recria a MESMA retry_talkx_recipients (assinatura de 2 argumentos) validando
-- o lote pelo conjunto PEDIDO x ENCONTRADO. Por ordem de versao ele e aplicado ANTES desta
-- migration, entao o CREATE OR REPLACE daqui o sobrescreveria: o corpo abaixo ja inclui esse
-- delta (v_pedidos/v_pedidos_nulos/v_validos) e a validacao do lote fica ANTES do gate de
-- reabertura, para lote invalido continuar dando talkx_retry_recipient_not_found. Quando a
-- assinatura for de 3 argumentos, o delta do #123 e o gate do #124 convivem no mesmo corpo.
-- Se o #123 for entregue por outro caminho, reconciliar antes de aplicar (nao reordenar).
--
-- Classe: CONTRATO (DROP FUNCTION + CREATE OR REPLACE FUNCTION + ACL + COMMENT).
-- Idempotente/replayavel: DROP FUNCTION IF EXISTS, CREATE OR REPLACE, guard fail-closed.

-- ─────────────────────────────────────────────────────────────────────────────
-- 0) A assinatura antiga (sem a confirmacao) sai: quem reabre passa pelo gate novo.
-- ─────────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.retry_talkx_recipients(uuid, uuid[]);
DROP FUNCTION IF EXISTS public.resolve_talkx_outcome_unknown(uuid, text, text, boolean);

-- ─────────────────────────────────────────────────────────────────────────────
-- 1) enforce_talkx_campaign_mutability — corpo vivo (20261003232707 / X032) + o ramo
--    da reabertura confirmada (#124). So o ramo novo; nada mais muda.
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
    -- #124 (R3-DELTA-005): defesa em profundidade. A reabertura 'completed' -> 'sending' e um
    -- NOVO lancamento e so passa com o carimbo de consentimento RENOVADO na MESMA transacao
    -- (a RPC so renova o carimbo depois da confirmacao explicita do operador). Um caminho
    -- futuro que ligue app.talkx_retry_write sem confirmar nao reabre a campanha.
    IF OLD.status = 'completed' AND NEW.status = 'sending' THEN
      IF NEW.consent_confirmed_at IS NULL
         OR NEW.consent_confirmed_by IS NULL
         OR NEW.consent_confirmed_at IS NOT DISTINCT FROM OLD.consent_confirmed_at THEN
        RAISE EXCEPTION 'talkx_relaunch_confirmation_required' USING ERRCODE = '22023';
      END IF;
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

  -- X032: agendar exige a confirmacao de consentimento/base legal gravada. Sem ela, a
  -- campanha so pode continuar rascunho.
  IF NEW.status = 'scheduled'
     AND NEW.consent_confirmed_at IS NULL THEN
    RAISE EXCEPTION 'talkx_schedule_requires_consent_confirmation' USING ERRCODE = '22023';
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
-- 2) retry_talkx_recipients — corpo vivo (X031) + p_confirm_relaunch (#124).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.retry_talkx_recipients(
  p_campaign_id      uuid,
  p_recipient_ids    uuid[],
  p_confirm_relaunch boolean DEFAULT false
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_actor       uuid;
  v_campaign    public.talkx_campaigns%ROWTYPE;
  v_pedidos       integer;
  v_pedidos_nulos integer;
  v_validos       integer;
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

  -- Conjunto PEDIDO: ids distintos do array. Nulo nao e destinatario.
  -- (#123 / R3-DELTA-004 — reconstrucao do corpo vivo: 20261006193650 e aplicada ANTES
  --  desta migration pela ordem de versao; sem este delta, o CREATE OR REPLACE daqui
  --  desfaria a validacao fail-closed do lote que o #123 fechou.)
  SELECT count(DISTINCT pedido.id), count(*) FILTER (WHERE pedido.id IS NULL)
    INTO v_pedidos, v_pedidos_nulos
    FROM unnest(p_recipient_ids) AS pedido(id);
  IF v_pedidos_nulos > 0 THEN
    RAISE EXCEPTION 'invalid_talkx_retry_request' USING ERRCODE = '22023';
  END IF;

  -- Conjunto ENCONTRADO na campanha. Todo id pedido precisa existir AQUI:
  -- fail-closed, tudo-ou-nada. Vem ANTES do gate de reabertura do #124 (precedencia
  -- preservada: lote invalido continua dando talkx_retry_recipient_not_found).
  SELECT count(DISTINCT recipient.id)
    INTO v_validos
    FROM public.talkx_recipients AS recipient
   WHERE recipient.campaign_id = p_campaign_id
     AND recipient.id = ANY(p_recipient_ids);
  IF v_validos <> v_pedidos THEN
    RAISE EXCEPTION 'talkx_retry_recipient_not_found' USING ERRCODE = 'P0002';
  END IF;

  -- #124 (R3-DELTA-005): reabrir uma campanha 'completed' e um NOVO lancamento — o retry
  -- volta a disparar mensagem para cliente real depois de a campanha ja ter terminado e
  -- encerrado. Exige a nova confirmacao de lancamento, explicita do operador (mesmo padrao
  -- de p_confirm_duplicate_risk em resolve_talkx_outcome_unknown). Sem ela nada e escrito.
  -- Fica DEPOIS da validacao do lote: lote invalido continua dando
  -- talkx_retry_recipient_not_found, como no #123.
  IF v_campaign.status = 'completed' AND p_confirm_relaunch IS NOT TRUE THEN
    RAISE EXCEPTION 'talkx_relaunch_confirmation_required' USING ERRCODE = '22023';
  END IF;

  -- Valida cada destinatario ANTES de escrever qualquer linha.
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
         -- #124: a reabertura grava o carimbo da NOVA confirmacao (autor + instante). A
         -- confirmacao anterior continua na trilha (talkx_campaign_events), nao se perde.
         consent_confirmed_by = CASE WHEN campaign.status = 'completed' THEN v_actor ELSE campaign.consent_confirmed_by END,
         consent_confirmed_at = CASE WHEN campaign.status = 'completed' THEN statement_timestamp() ELSE campaign.consent_confirmed_at END,
         updated_at    = statement_timestamp()
   WHERE campaign.id = p_campaign_id;

  v_message := jsonb_build_object(
    'action', 'retry_talkx_recipients',
    'count', v_failed + v_skipped,
    'failed', v_failed,
    'skipped', v_skipped,
    'reopened', v_reopened,
    'relaunch_confirmed', v_reopened,
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

REVOKE ALL ON FUNCTION public.retry_talkx_recipients(uuid, uuid[], boolean)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.retry_talkx_recipients(uuid, uuid[], boolean)
  TO authenticated;

COMMENT ON FUNCTION public.retry_talkx_recipients(uuid, uuid[], boolean) IS
  'Talk X (X031 + R3-DELTA-005/#124): reenvio manual em lote de destinatarios failed/skipped (admin/supervisor), teto de 3 por destinatario, revalida supressao/elegibilidade, ajusta contadores e grava evento com ator; reabre campanha completed -> sending SOMENTE com p_confirm_relaunch = true (novo lancamento exige nova confirmacao, que renova consent_confirmed_by/at).';

-- ─────────────────────────────────────────────────────────────────────────────
-- 3) resolve_talkx_outcome_unknown — corpo vivo (X031) + p_confirm_relaunch (#124).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.resolve_talkx_outcome_unknown(
  p_recipient_id           uuid,
  p_resolution             text,
  p_note                   text DEFAULT NULL,
  p_confirm_duplicate_risk boolean DEFAULT false,
  p_confirm_relaunch       boolean DEFAULT false
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
    -- #124 (R3-DELTA-005): com a campanha 'completed' o retry REABRE a campanha — e um novo
    -- lancamento. Exige tambem a nova confirmacao de lancamento do operador; sem ela, nada
    -- e escrito (o destinatario segue outcome_unknown e a campanha segue completed).
    IF v_campaign.status = 'completed' AND p_confirm_relaunch IS NOT TRUE THEN
      RAISE EXCEPTION 'talkx_relaunch_confirmation_required' USING ERRCODE = '22023';
    END IF;

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
           -- #124: reabertura grava o carimbo da NOVA confirmacao (autor + instante).
           consent_confirmed_by = CASE WHEN campaign.status = 'completed' THEN v_actor ELSE campaign.consent_confirmed_by END,
           consent_confirmed_at = CASE WHEN campaign.status = 'completed' THEN statement_timestamp() ELSE campaign.consent_confirmed_at END,
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
    'reopened', v_reopened,
    'relaunch_confirmed', v_reopened
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

REVOKE ALL ON FUNCTION public.resolve_talkx_outcome_unknown(uuid, text, text, boolean, boolean)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resolve_talkx_outcome_unknown(uuid, text, text, boolean, boolean)
  TO authenticated;

COMMENT ON FUNCTION public.resolve_talkx_outcome_unknown(uuid, text, text, boolean, boolean) IS
  'Talk X (X031 + R3-DELTA-005/#124): resolve um destinatario outcome_unknown (admin/supervisor) com mark_sent|mark_failed|retry. retry exige p_confirm_duplicate_risk = true e, quando a campanha esta completed, tambem p_confirm_relaunch = true (novo lancamento). Move outcome_unknown_count para sent_count/failed_count e grava evento com ator.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 4) fail-closed: sem os objetos novos — e com a assinatura antiga ainda viva — a
--    migration aborta em vez de deixar um caminho que reabre sem a confirmacao.
-- ─────────────────────────────────────────────────────────────────────────────
DO $guard$
DECLARE
  v_missing text;
BEGIN
  SELECT string_agg(esperado.assinatura, ', ') INTO v_missing
  FROM (
    VALUES
      ('public.retry_talkx_recipients(uuid,uuid[],boolean)'),
      ('public.resolve_talkx_outcome_unknown(uuid,text,text,boolean,boolean)'),
      ('public.enforce_talkx_campaign_mutability()')
  ) AS esperado(assinatura)
  WHERE to_regprocedure(esperado.assinatura) IS NULL;

  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'talkx_r3delta005_objetos_ausentes: %', v_missing;
  END IF;

  IF to_regprocedure('public.retry_talkx_recipients(uuid,uuid[])') IS NOT NULL
     OR to_regprocedure('public.resolve_talkx_outcome_unknown(uuid,text,text,boolean)') IS NOT NULL THEN
    RAISE EXCEPTION 'talkx_r3delta005_assinatura_antiga_viva';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'talkx_campaigns'
       AND column_name = 'consent_confirmed_at'
  ) OR NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'talkx_campaigns'
       AND column_name = 'consent_confirmed_by'
  ) THEN
    RAISE EXCEPTION 'talkx_r3delta005_colunas_ausentes: public.talkx_campaigns.consent_confirmed_at/consent_confirmed_by (X032)';
  END IF;
END;
$guard$;
