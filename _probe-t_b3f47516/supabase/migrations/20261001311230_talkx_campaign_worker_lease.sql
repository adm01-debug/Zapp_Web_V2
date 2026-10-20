-- talkx_campaign_worker_lease
-- versão 20261001311230 reservada para hermes-worker-lease-261001224970f0 em 2026-10-01T22:50:03-03:00 (hermes-db-migrar --nova)
-- rollback: 1) recrie public.enforce_talkx_campaign_mutability com o corpo de 20261001281230_talkx_campaigns_draft_step_responsible.sql (sem a guarda de worker);
--   2) recrie public.transition_talkx_campaign com o corpo de 20260930650000_talkx_v12_server_lifecycle_events.sql;
--   3) remova as RPCs novas (`DROP ROUTINE public.claim_talkx_campaign_worker(uuid, text, integer);`,
--      `DROP ROUTINE public.release_talkx_campaign_worker(uuid, text);`, `DROP ROUTINE public.talkx_next_recipients(uuid, integer);` e
--      `DROP ROUTINE public.get_talkx_cron_secret();`);
--   4) ALTER TABLE public.talkx_campaigns DROP COLUMN IF EXISTS worker_lease_expires_at, DROP COLUMN IF EXISTS worker_id;
--   5) DELETE FROM vault.secrets WHERE name = 'talkx_cron_secret'.
--
-- X010 (Fase 2 · Tela motor · banco). Fecha CAP-007 e CAP-098.
--
-- HOJE: transition_talkx_campaign('start') recusava a origem sending e o teste
-- fixava essa recusa (scripts/db-audit/talkx-campaign-transitions.test.sh:78); não
-- havia trava por campanha, então dois workers no MESMO sending só ficavam separados
-- pelo lease por destinatário; a fila era lida por SELECT direto na edge; e não
-- existia segredo de cron dedicado do Talk X.
--
-- FAZER (esta migration):
--   (a) transition_talkx_campaign devolve sending->sending sem erro e sem tocar
--       started_at quando ação=start e a campanha já está sending (retomada
--       idempotente). O corpo é o de 20260930650000 (V12), reescrito aqui como
--       CONTRATO para que a X010 fique autossuficiente; as assinaturas legadas de
--       2 e 3 args são derrubadas para manter UMA assinatura viva (o guard
--       scripts/db-audit/check-talkx-transition-contract.sql exige exatamente a de
--       4 args com 2 DEFAULTs).
--   (b) colunas talkx_campaigns.worker_id text e worker_lease_expires_at timestamptz,
--       protegidas em enforce_talkx_campaign_mutability: só a RPC de lease escreve
--       nelas, ligando o escape hatch GUC app.talkx_worker_write (transacional).
--   (c) RPCs só service_role: claim_talkx_campaign_worker (verdadeiro só sem lease
--       vivo de outro worker; renova o próprio), release_talkx_campaign_worker e
--       talkx_next_recipients (próximos pending ou sending com lease vencido sem
--       dispatch, retry_after vencido, ordenados por created_at,id, com os dados do
--       contato que o envio usa).
--   (d) segredo talkx_cron_secret no Vault (criado se não existir, mesmo padrão de
--       20260927320000_multiplix_cron_scheduler) e get_talkx_cron_secret() só para
--       service_role.
--
-- Classe: contrato (CREATE OR REPLACE FUNCTION + DROP FUNCTION de overload legado).
-- nomes-antigos-conferidos: transition_talkx_campaign — as assinaturas legadas de 2/3 args já foram removidas em produção (20260929420000/V12); o DROP IF EXISTS é no-op defensivo para ambiente antigo; a assinatura de 4 args (usada pelo talkx-send) permanece e é recriada por CREATE OR REPLACE logo abaixo.

-- (a) transition_talkx_campaign: retomada idempotente de start -----------------
-- Derruba as assinaturas legadas (2 args de 20260911150000, 3 args de 20260916210000)
-- para deixar viva só a de 4 args — a mesma que o talkx-send chama. IF EXISTS:
-- em produção elas já foram removidas por 20260929420000/V12.
DROP FUNCTION IF EXISTS public.transition_talkx_campaign(uuid, text);
DROP FUNCTION IF EXISTS public.transition_talkx_campaign(uuid, text, text);

CREATE OR REPLACE FUNCTION public.transition_talkx_campaign(
  p_campaign_id uuid,
  p_action      text,
  p_pause_reason text DEFAULT NULL,
  p_actor_id     uuid DEFAULT NULL
)
RETURNS TABLE(campaign_id uuid, previous_status text, current_status text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_campaign public.talkx_campaigns%ROWTYPE;
  v_next_status text;
  v_event_type  text;
  v_event_msg   text;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'service_role_required' USING ERRCODE = '42501';
  END IF;
  IF p_campaign_id IS NULL OR p_action NOT IN ('start', 'pause', 'cancel') THEN
    RAISE EXCEPTION 'invalid_talkx_campaign_transition' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_campaign
  FROM public.talkx_campaigns AS campaign
  WHERE campaign.id = p_campaign_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'talkx_campaign_not_found' USING ERRCODE = 'P0002';
  END IF;
  CASE p_action
    WHEN 'start' THEN
      IF v_campaign.status = 'sending' THEN
        -- X010: retomada idempotente — já enviando, a transição é no-op e NÃO toca
        -- em started_at (o UPDATE abaixo nem chega a rodar).
        RETURN QUERY SELECT p_campaign_id, 'sending', 'sending';
        RETURN;
      END IF;
      IF v_campaign.status NOT IN ('draft', 'scheduled', 'paused') THEN
        RAISE EXCEPTION 'talkx_campaign_start_denied_from_%', v_campaign.status USING ERRCODE = '55000';
      END IF;
      IF btrim(COALESCE(v_campaign.message_template, '')) = '' THEN
        RAISE EXCEPTION 'talkx_campaign_message_required' USING ERRCODE = '22023';
      END IF;
      IF v_campaign.total_recipients <= 0
         OR NOT EXISTS (
           SELECT 1 FROM public.talkx_recipients AS recipient
           WHERE recipient.campaign_id = p_campaign_id
         ) THEN
        RAISE EXCEPTION 'talkx_campaign_recipients_required' USING ERRCODE = '22023';
      END IF;
      v_next_status := 'sending';
      v_event_type := CASE WHEN v_campaign.status = 'paused' THEN 'resumed' ELSE 'started' END;
      v_event_msg := NULL;
    WHEN 'pause' THEN
      IF v_campaign.status <> 'sending' THEN
        RAISE EXCEPTION 'talkx_campaign_pause_denied_from_%', v_campaign.status USING ERRCODE = '55000';
      END IF;
      v_next_status := 'paused';
      v_event_type := 'paused';
      v_event_msg := p_pause_reason;
    WHEN 'cancel' THEN
      IF v_campaign.status NOT IN ('draft', 'scheduled', 'sending', 'paused') THEN
        RAISE EXCEPTION 'talkx_campaign_cancel_denied_from_%', v_campaign.status USING ERRCODE = '55000';
      END IF;
      v_next_status := 'cancelled';
      v_event_type := 'cancelled';
      v_event_msg := NULL;
      -- V14: marca pendentes como cancelados na MESMA transação (estado terminal).
      UPDATE public.talkx_recipients AS recipient
      SET status = 'cancelled'
      WHERE recipient.campaign_id = p_campaign_id
        AND recipient.status = 'pending';
  END CASE;
  UPDATE public.talkx_campaigns AS campaign
  SET status       = v_next_status,
      pause_reason = CASE WHEN p_action = 'pause' THEN p_pause_reason ELSE NULL END,
      started_at   = CASE WHEN p_action = 'start'
        THEN COALESCE(campaign.started_at, statement_timestamp())
        ELSE campaign.started_at END,
      paused_at    = CASE WHEN p_action = 'pause' THEN statement_timestamp() ELSE campaign.paused_at END,
      updated_at   = statement_timestamp()
  WHERE campaign.id = p_campaign_id;

  INSERT INTO public.talkx_campaign_events (campaign_id, event_type, message, actor_id)
  VALUES (p_campaign_id, v_event_type, v_event_msg, p_actor_id);

  RETURN QUERY SELECT p_campaign_id, v_campaign.status, v_next_status;
END;
$$;

REVOKE ALL ON FUNCTION public.transition_talkx_campaign(uuid, text, text, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.transition_talkx_campaign(uuid, text, text, uuid)
  TO service_role;

-- (b) colunas de lease por campanha --------------------------------------------
ALTER TABLE public.talkx_campaigns
  ADD COLUMN IF NOT EXISTS worker_id text,
  ADD COLUMN IF NOT EXISTS worker_lease_expires_at timestamptz;

COMMENT ON COLUMN public.talkx_campaigns.worker_id IS
  'Worker que detém a trava da campanha (X010). Gerido só pela RPC de lease (claim/release).';
COMMENT ON COLUMN public.talkx_campaigns.worker_lease_expires_at IS
  'Vencimento do lease do worker (X010). Lease vencido ou nulo libera a campanha para outro worker.';

CREATE INDEX IF NOT EXISTS idx_talkx_campaigns_worker_lease
  ON public.talkx_campaigns (worker_lease_expires_at)
  WHERE worker_id IS NOT NULL;

-- (b) enforce_talkx_campaign_mutability: worker_id/worker_lease_expires_at só pela RPC
-- Corpo idêntico ao de 20261001281230 (X009), acrescido do bloco de worker no topo.
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
       OR NEW.started_at IS NOT NULL
       OR NEW.completed_at IS NOT NULL THEN
      RAISE EXCEPTION 'talkx_delivery_state_managed_by_worker' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    IF OLD.status <> 'draft' THEN
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
     OR NEW.started_at IS DISTINCT FROM OLD.started_at
     OR NEW.completed_at IS DISTINCT FROM OLD.completed_at THEN
    RAISE EXCEPTION 'talkx_delivery_state_managed_by_worker' USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS enforce_talkx_campaign_mutability ON public.talkx_campaigns;
CREATE TRIGGER enforce_talkx_campaign_mutability
  BEFORE INSERT OR DELETE OR UPDATE ON public.talkx_campaigns
  FOR EACH ROW EXECUTE FUNCTION public.enforce_talkx_campaign_mutability();

-- (c) claim_talkx_campaign_worker: trava por campanha --------------------------
-- Verdadeiro quando a campanha está sending e não há lease vivo de OUTRO worker;
-- renova o próprio lease sempre. Falso quando a campanha não está sending, não
-- existe, ou o lease de outro worker ainda está vivo.
CREATE OR REPLACE FUNCTION public.claim_talkx_campaign_worker(
  p_campaign_id  uuid,
  p_worker       text,
  p_lease_seconds integer DEFAULT 90
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_campaign public.talkx_campaigns%ROWTYPE;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'service_role_required' USING ERRCODE = '42501';
  END IF;
  IF p_campaign_id IS NULL
     OR p_worker IS NULL OR p_worker !~ '^[A-Za-z0-9._:@/-]{1,100}$'
     OR p_lease_seconds IS NULL OR p_lease_seconds NOT BETWEEN 30 AND 300 THEN
    RAISE EXCEPTION 'invalid_talkx_campaign_claim' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_campaign
  FROM public.talkx_campaigns AS campaign
  WHERE campaign.id = p_campaign_id
  FOR UPDATE;

  IF NOT FOUND OR v_campaign.status <> 'sending' THEN
    RETURN false;
  END IF;

  -- Lease vivo de OUTRO worker: recusa. Para o próprio, sempre renova.
  IF v_campaign.worker_id IS NOT NULL
     AND v_campaign.worker_id IS DISTINCT FROM p_worker
     AND v_campaign.worker_lease_expires_at IS NOT NULL
     AND v_campaign.worker_lease_expires_at > statement_timestamp() THEN
    RETURN false;
  END IF;

  -- Escape hatch do gatilho: só a RPC de lease escreve as colunas de worker.
  PERFORM set_config('app.talkx_worker_write', 'on', true);

  UPDATE public.talkx_campaigns AS campaign
  SET worker_id                = p_worker,
      worker_lease_expires_at  = statement_timestamp() + make_interval(secs => p_lease_seconds),
      updated_at               = statement_timestamp()
  WHERE campaign.id = p_campaign_id;

  RETURN true;
END;
$function$;

-- (c) release_talkx_campaign_worker: solta a trava do próprio worker -----------
CREATE OR REPLACE FUNCTION public.release_talkx_campaign_worker(
  p_campaign_id uuid,
  p_worker      text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'service_role_required' USING ERRCODE = '42501';
  END IF;
  IF p_campaign_id IS NULL
     OR p_worker IS NULL OR btrim(p_worker) = '' THEN
    RAISE EXCEPTION 'invalid_talkx_campaign_release' USING ERRCODE = '22023';
  END IF;

  PERFORM set_config('app.talkx_worker_write', 'on', true);

  UPDATE public.talkx_campaigns AS campaign
  SET worker_id               = NULL,
      worker_lease_expires_at = NULL,
      updated_at              = statement_timestamp()
  WHERE campaign.id = p_campaign_id
    AND campaign.worker_id = p_worker;

  RETURN FOUND;
END;
$function$;

-- (c) talkx_next_recipients: fila do worker ------------------------------------
-- Próximos destinatários elegíveis da campanha (que precisa estar sending):
--   * pending com retry_after vencido ou nulo; ou
--   * sending com lease por destinatário vencido e SEM dispatch iniciado.
-- Nunca devolve destinatário com provider_dispatch_started_at preenchido.
-- Ordenados por created_at,id (a mesma ordem que a edge usava no SELECT direto).
CREATE OR REPLACE FUNCTION public.talkx_next_recipients(
  p_campaign_id uuid,
  p_limit       integer DEFAULT 20
)
RETURNS TABLE(
  recipient_id          uuid,
  contact_id            uuid,
  status                text,
  attempt_count         integer,
  retry_after           timestamptz,
  personalized_message  text,
  contact_name          text,
  contact_nickname      text,
  contact_phone         text,
  contact_company       text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_now timestamptz := statement_timestamp();
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'service_role_required' USING ERRCODE = '42501';
  END IF;
  IF p_campaign_id IS NULL THEN
    RAISE EXCEPTION 'invalid_talkx_campaign_id' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  SELECT recipient.id,
         recipient.contact_id,
         recipient.status,
         recipient.attempt_count,
         recipient.retry_after,
         recipient.personalized_message,
         contact.name,
         contact.nickname,
         contact.phone,
         contact.company
  FROM public.talkx_recipients AS recipient
  JOIN public.talkx_campaigns AS campaign ON campaign.id = recipient.campaign_id
  LEFT JOIN public.contacts AS contact ON contact.id = recipient.contact_id
  WHERE recipient.campaign_id = p_campaign_id
    AND campaign.status = 'sending'
    AND recipient.provider_dispatch_started_at IS NULL
    AND (
      (
        recipient.status = 'pending'
        AND (recipient.retry_after IS NULL OR recipient.retry_after <= v_now)
      )
      OR
      (
        recipient.status = 'sending'
        AND recipient.delivery_claim_expires_at IS NOT NULL
        AND recipient.delivery_claim_expires_at <= v_now
      )
    )
  ORDER BY recipient.created_at, recipient.id
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 20), 1), 200);
END;
$function$;

-- (d) segredo de cron do Talk X no Vault --------------------------------------
-- Mesmo padrão de 20260927320000_multiplix_cron_scheduler: gera dentro do banco e
-- só cria se não existir.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'talkx_cron_secret') THEN
    PERFORM vault.create_secret(
      md5(random()::text) || md5(random()::text),
      'talkx_cron_secret'
    );
  END IF;
END;
$$;

-- Leitura pela edge (service_role). SECURITY DEFINER + EXECUTE só para service_role:
-- é o que deixa a função ler o Vault sem expor vault.decrypted_secrets a anon/authenticated.
CREATE OR REPLACE FUNCTION public.get_talkx_cron_secret()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $function$
  SELECT decrypted_secret
  FROM vault.decrypted_secrets
  WHERE name = 'talkx_cron_secret'
  LIMIT 1
$function$;

-- ACL das RPCs de service_role -------------------------------------------------
REVOKE ALL ON FUNCTION public.claim_talkx_campaign_worker(uuid, text, integer)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.release_talkx_campaign_worker(uuid, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.talkx_next_recipients(uuid, integer)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_talkx_cron_secret()
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.claim_talkx_campaign_worker(uuid, text, integer)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.release_talkx_campaign_worker(uuid, text)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.talkx_next_recipients(uuid, integer)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.get_talkx_cron_secret()
  TO service_role;

-- Fail-closed: se qualquer nome sumir (ex.: um CREATE OR REPLACE que não colou),
-- a migration aborta em vez de deixar o contrato pela metade.
DO $$
DECLARE
  v_missing text;
BEGIN
  SELECT string_agg(assinatura, ', ') INTO v_missing
  FROM (
    VALUES
      ('public.transition_talkx_campaign(uuid,text,text,uuid)'),
      ('public.claim_talkx_campaign_worker(uuid,text,integer)'),
      ('public.release_talkx_campaign_worker(uuid,text)'),
      ('public.talkx_next_recipients(uuid,integer)'),
      ('public.get_talkx_cron_secret()')
  ) AS esperado(assinatura)
  WHERE to_regprocedure(assinatura) IS NULL;

  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'talkx_worker_lease_rpcs_ausentes: %', v_missing;
  END IF;
END;
$$;
