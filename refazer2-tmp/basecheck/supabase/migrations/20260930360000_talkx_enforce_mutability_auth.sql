-- 20260930360000_talkx_enforce_mutability_auth
-- V09d do PLANO_TALKX_V3_100_ETAPAS_2026-09-29 — fecha o GAP de autenticação do
-- escape hatch (achado #6 da auditoria adversarial, domínio red-team).
--
-- GAP: o trigger enforce_talkx_campaign_mutability confiava no GUC global
-- `app.talkx_limits_write` como sinal suficiente para liberar a edição de limites em
-- qualquer status. O GUC, porém, é um sinal sem identidade — não autentica QUEM o
-- ligou. A RPC update_talkx_campaign_limits é SECURITY DEFINER e faz a checagem de
-- dono/admin, mas o trigger (que roda como o chamador `authenticated`) não repetia
-- essa checagem: qualquer caminho que ligasse o GUC liberava o UPDATE sem provar
-- ownership.
--
-- Correção (defesa em profundidade): dentro do ramo do escape hatch, exigir que o
-- chamador seja o dono da campanha (perfil ativo = NEW.created_by) OU admin/supervisor,
-- espelhando a checagem de ownership da RPC. O GUC deixa de ser suficiente sozinho.
--
-- Classe: contrato (CREATE OR REPLACE FUNCTION) -> aplicada logo após o merge e o deploy.
-- rollback: restaurar a definição anterior reaplicando o CREATE OR REPLACE FUNCTION
--           da migration 20260930180000_talkx_update_campaign_limits_rpc.sql (trigger V09 original).

CREATE OR REPLACE FUNCTION public.enforce_talkx_campaign_mutability()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $function$
BEGIN
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

  IF NEW.total_recipients IS DISTINCT FROM OLD.total_recipients
     AND current_setting('app.talkx_recipient_snapshot_write', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'talkx_recipient_count_managed' USING ERRCODE = '42501';
  END IF;

  IF NEW.sent_count IS DISTINCT FROM OLD.sent_count
     OR NEW.failed_count IS DISTINCT FROM OLD.failed_count
     OR NEW.delivered_count IS DISTINCT FROM OLD.delivered_count
     OR NEW.outcome_unknown_count IS DISTINCT FROM OLD.outcome_unknown_count
     OR NEW.started_at IS DISTINCT FROM OLD.started_at
     OR NEW.completed_at IS DISTINCT FROM OLD.completed_at THEN
    RAISE EXCEPTION 'talkx_delivery_state_managed_by_worker' USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$function$;
