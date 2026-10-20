-- talkx_guards_fail_closed
-- versão 20260930420000 reservada para hermes-talkx-v10-settings-replay-guards-26100108052236 em 2026-10-01T08:06:06-03:00 (hermes-db-migrar --nova)
--
-- MAPA (achado de auditoria, domínio red-team): os dois guards de mutabilidade do Talk X
-- (`enforce_talkx_campaign_mutability`, `enforce_talkx_recipient_snapshot_mutability`)
-- seguem FAIL-OPEN em produção mesmo com a 20260930360000 (V09d) aplicada — ela preservou
-- o predicado fail-open do topo.
--
-- Os dois começam por:
--
--     IF COALESCE(auth.role(), '') <> 'authenticated' THEN
--       RETURN COALESCE(NEW, OLD);          -- passa a linha
--     END IF;
--
-- A intenção é "o guard só vale para o ator `authenticated`; service_role (worker, RPCs do
-- motor, pg_cron) e o dono postgres escrevem livremente". O problema é que `auth.role()` lê
-- a GUC do JWT: sem a GUC o COALESCE vira `''`, `'' <> 'authenticated'` é verdadeiro e o
-- guard desaparece sem erro nenhum — fail-open. Quem chega à tabela numa sessão com o papel
-- `authenticated` mas sem a claim (caminho novo, worker futuro, função que limpa a GUC, job
-- criado como `authenticated`) escreve por cima do estado de envio sem passar por nenhuma
-- checagem de mutabilidade.
--
-- Correção (fail-closed), espelhando o padrão já sancionado no Multiplix
-- (20260930300000_multiplix_guards_fail_closed):
--   1. quem está dispensado passa a ser decidido pelo papel REAL da sessão (`current_user`),
--      que não depende de GUC e nunca é NULL — preserva postgres/service_role/anon;
--   2. se a sessão for mesmo `authenticated` e a claim não estiver definida, levanta erro em
--      vez de liberar a escrita silenciosamente.
-- O resto do corpo é idêntico ao atual (V09d no guard de campanha; 20260911160000 no guard
-- de destinatário) — nenhuma regra de negócio mudou.
--
-- Classe: contrato (CREATE OR REPLACE FUNCTION) -> aplicada logo após o merge e o deploy.
-- rollback: reaplicar os corpos integrais de
--           20260930360000_talkx_enforce_mutability_auth.sql (guard de campanha) e
--           20260911160000_harden_talkx_campaign_insert_and_draft_delete.sql (guard de
--           destinatário). Não cabe SQL curto aqui: os corpos têm ~120 linhas no total.

CREATE OR REPLACE FUNCTION public.enforce_talkx_campaign_mutability()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $function$
BEGIN
  -- MAPA: dispensado só quem NÃO é o ator `authenticated`, pelo papel real da sessão.
  IF current_user <> 'authenticated' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- MAPA: sessão `authenticated` sem a claim do JWT não é "livre" — nega.
  IF auth.role() IS NULL THEN
    RAISE EXCEPTION 'talkx_guard_auth_role_undefined' USING ERRCODE = '42501';
  END IF;

  IF auth.role() <> 'authenticated' THEN
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
  -- (transacional, nunca vaza para outra sessão). Defesa em profundidade (achado #6): o
  -- GUC sozinho não basta — o chamador precisa ser o dono da campanha (perfil ativo) ou
  -- admin/supervisor.
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

CREATE OR REPLACE FUNCTION public.enforce_talkx_recipient_snapshot_mutability()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $function$
BEGIN
  -- MAPA: dispensado só quem NÃO é o ator `authenticated`, pelo papel real da sessão.
  IF current_user <> 'authenticated' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- MAPA: sessão `authenticated` sem a claim do JWT não é "livre" — nega.
  IF auth.role() IS NULL THEN
    RAISE EXCEPTION 'talkx_guard_auth_role_undefined' USING ERRCODE = '42501';
  END IF;

  IF auth.role() <> 'authenticated' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- A partir daqui: authenticated com claim. O guard do snapshot vale.
  IF current_setting('app.talkx_recipient_snapshot_write', true) IS DISTINCT FROM 'on' THEN
    -- O pai não fica mais visível durante um ON DELETE CASCADE. Permite essa única ação
    -- referencial; delete direto de destinatário ainda acha o pai e é rejeitado.
    IF TG_OP = 'DELETE'
       AND NOT EXISTS (
         SELECT 1 FROM public.talkx_campaigns
         WHERE id = OLD.campaign_id
       ) THEN
      RETURN OLD;
    END IF;
    RAISE EXCEPTION 'talkx_recipient_snapshot_required' USING ERRCODE = '42501';
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$function$;
