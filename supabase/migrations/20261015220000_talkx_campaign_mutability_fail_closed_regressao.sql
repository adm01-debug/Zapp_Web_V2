-- talkx_campaign_mutability_fail_closed_regressao
-- versão 20261015220000 reservada via supabase_migrations.reserve_migration_version
-- (sessão claude-busy-curie-sf9682), 2026-10-16.
--
-- #1267 (MÉDIO, auditoria adversarial de 29/09) pedia o guard fail-closed do Multiplix.
-- O Multiplix foi corrigido em 20260930300000 e o TalkX, no mesmo padrão, em 20260930420000
-- (enforce_talkx_campaign_mutability e enforce_talkx_recipient_snapshot_mutability).
--
-- REGRESSÃO achada ao investigar #1267 em 16/10: a PRIMEIRA migration que recriou
-- enforce_talkx_campaign_mutability depois do fix — 20261001281230_talkx_campaigns_draft_step_responsible
-- (1º de outubro, menos de 24h depois) — baseou o CREATE OR REPLACE numa referência anterior
-- ao fix e reintroduziu o guard fail-open original:
--
--     IF COALESCE(auth.role(), '') <> 'authenticated' THEN
--       RETURN COALESCE(NEW, OLD);
--     END IF;
--
-- Cada migration seguinte que tocou a função (20261001311230, 20261002381230, 20261003202707,
-- 20261003212707, 20261003222707, 20261003232707) copiou o "corpo vivo" da anterior, carregando
-- a regressão adiante sem ninguém notar — confirmado ao vivo: pg_get_functiondef() no canônico
-- hoje (16/10) mostra o guard fail-open. enforce_talkx_recipient_snapshot_mutability NÃO
-- regrediu (nenhuma migration a recriou depois de 20260930420000) — fica fora deste fix.
--
-- Correção: reaplica o padrão sancionado (current_user, que nunca é NULL e não depende de GUC,
-- decide a dispensa; sessão authenticated sem a claim do JWT falha fechado em vez de passar a
-- linha em silêncio). Nenhuma outra linha da função muda — corpo idêntico ao que está vivo hoje
-- (lease de worker X010, INSERT, DELETE com fuga X026, owner, fugas X_limits/X031, transições,
-- X014/X032/X009, contadores geridos pelo worker).
--
-- Classe: contrato (CREATE OR REPLACE FUNCTION) -> aplicada logo apos o merge e o deploy.
-- rollback: create or replace function public.enforce_talkx_campaign_mutability() returns trigger language plpgsql set search_path to 'public', 'pg_temp' as $f$ BEGIN IF TG_OP = 'UPDATE' AND (NEW.worker_id IS DISTINCT FROM OLD.worker_id OR NEW.worker_lease_expires_at IS DISTINCT FROM OLD.worker_lease_expires_at) AND current_setting('app.talkx_worker_write', true) IS DISTINCT FROM 'on' THEN RAISE EXCEPTION 'talkx_campaign_worker_managed_by_lease' USING ERRCODE = '42501'; END IF; IF COALESCE(auth.role(), '') <> 'authenticated' THEN RETURN COALESCE(NEW, OLD); END IF; IF TG_OP = 'INSERT' THEN IF NEW.status <> 'draft' THEN RAISE EXCEPTION 'talkx_campaign_insert_must_be_draft' USING ERRCODE = '22023'; END IF; IF NEW.total_recipients <> 0 OR NEW.sent_count <> 0 OR NEW.failed_count <> 0 OR NEW.delivered_count <> 0 OR NEW.outcome_unknown_count <> 0 OR NEW.replied_count <> 0 OR NEW.read_count <> 0 OR NEW.skipped_count <> 0 OR NEW.started_at IS NOT NULL OR NEW.completed_at IS NOT NULL THEN RAISE EXCEPTION 'talkx_delivery_state_managed_by_worker' USING ERRCODE = '42501'; END IF; RETURN NEW; END IF; IF TG_OP = 'DELETE' THEN IF OLD.status <> 'draft' AND NOT (OLD.status = 'scheduled' AND current_setting('app.talkx_campaign_delete', true) = 'on') THEN RAISE EXCEPTION 'talkx_campaign_delete_denied' USING ERRCODE = '55000'; END IF; RETURN OLD; END IF; IF NEW.created_by IS DISTINCT FROM OLD.created_by THEN RAISE EXCEPTION 'talkx_campaign_owner_immutable' USING ERRCODE = '42501'; END IF; IF current_setting('app.talkx_limits_write', true) = 'on' THEN IF NOT (EXISTS (SELECT 1 FROM public.profiles profile WHERE profile.user_id = auth.uid() AND profile.is_active = true AND profile.id = NEW.created_by) OR COALESCE(public.is_admin_or_supervisor(auth.uid()), false) IS TRUE) THEN RAISE EXCEPTION 'talkx_campaign_not_authorized' USING ERRCODE = '42501'; END IF; IF NEW.status IS DISTINCT FROM OLD.status THEN RAISE EXCEPTION 'talkx_campaign_transition_denied' USING ERRCODE = '55000'; END IF; IF NEW.total_recipients IS DISTINCT FROM OLD.total_recipients OR NEW.sent_count IS DISTINCT FROM OLD.sent_count OR NEW.failed_count IS DISTINCT FROM OLD.failed_count OR NEW.delivered_count IS DISTINCT FROM OLD.delivered_count OR NEW.outcome_unknown_count IS DISTINCT FROM OLD.outcome_unknown_count OR NEW.replied_count IS DISTINCT FROM OLD.replied_count OR NEW.read_count IS DISTINCT FROM OLD.read_count OR NEW.skipped_count IS DISTINCT FROM OLD.skipped_count OR NEW.started_at IS DISTINCT FROM OLD.started_at OR NEW.completed_at IS DISTINCT FROM OLD.completed_at THEN RAISE EXCEPTION 'talkx_delivery_state_managed_by_worker' USING ERRCODE = '42501'; END IF; RETURN NEW; END IF; IF current_setting('app.talkx_retry_write', true) = 'on' THEN IF COALESCE(public.is_admin_or_supervisor(auth.uid()), false) IS NOT TRUE THEN RAISE EXCEPTION 'talkx_campaign_not_authorized' USING ERRCODE = '42501'; END IF; IF NEW.status IS DISTINCT FROM OLD.status AND NOT (OLD.status = 'completed' AND NEW.status = 'sending') THEN RAISE EXCEPTION 'talkx_campaign_transition_denied' USING ERRCODE = '55000'; END IF; RETURN NEW; END IF; IF OLD.status NOT IN ('draft', 'scheduled') OR NEW.status NOT IN ('draft', 'scheduled') THEN RAISE EXCEPTION 'talkx_campaign_transition_denied' USING ERRCODE = '55000'; END IF; IF NEW.status = 'scheduled' AND COALESCE(public.is_admin_or_supervisor(auth.uid()), false) IS NOT TRUE THEN RAISE EXCEPTION 'talkx_campaign_schedule_role_required' USING ERRCODE = '42501'; END IF; IF NEW.status = 'scheduled' AND NEW.consent_confirmed_at IS NULL THEN RAISE EXCEPTION 'talkx_schedule_requires_consent_confirmation' USING ERRCODE = '22023'; END IF; IF NEW.status = 'scheduled' AND (NEW.scheduled_at IS NULL OR NEW.total_recipients <= 0) THEN RAISE EXCEPTION 'talkx_schedule_requires_audience_and_timestamp' USING ERRCODE = '22023'; END IF; IF NEW.status = 'scheduled' AND NEW.scheduled_at <= statement_timestamp() THEN RAISE EXCEPTION 'talkx_schedule_must_be_future' USING ERRCODE = '22023'; END IF; IF NEW.status = 'scheduled' AND btrim(COALESCE(NEW.message_template, '')) = '' AND NEW.media_url IS NULL THEN RAISE EXCEPTION 'talkx_schedule_requires_message_or_media' USING ERRCODE = '22023'; END IF; IF NEW.total_recipients IS DISTINCT FROM OLD.total_recipients AND current_setting('app.talkx_recipient_snapshot_write', true) IS DISTINCT FROM 'on' THEN RAISE EXCEPTION 'talkx_recipient_count_managed' USING ERRCODE = '42501'; END IF; IF NEW.sent_count IS DISTINCT FROM OLD.sent_count OR NEW.failed_count IS DISTINCT FROM OLD.failed_count OR NEW.delivered_count IS DISTINCT FROM OLD.delivered_count OR NEW.outcome_unknown_count IS DISTINCT FROM OLD.outcome_unknown_count OR NEW.replied_count IS DISTINCT FROM OLD.replied_count OR NEW.read_count IS DISTINCT FROM OLD.read_count OR NEW.skipped_count IS DISTINCT FROM OLD.skipped_count OR NEW.started_at IS DISTINCT FROM OLD.started_at OR NEW.completed_at IS DISTINCT FROM OLD.completed_at THEN RAISE EXCEPTION 'talkx_delivery_state_managed_by_worker' USING ERRCODE = '42501'; END IF; RETURN NEW; END; $f$;
-- Sem BEGIN/COMMIT: o gateway aplica a migration numa unica transacao.

CREATE OR REPLACE FUNCTION public.enforce_talkx_campaign_mutability()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
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

  -- #1267 (regressão de 20261001281230): dispensado só quem NÃO é o ator `authenticated`,
  -- decidido pelo papel REAL da sessão (current_user) — não depende de GUC e nunca é NULL.
  IF current_user <> 'authenticated' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- #1267: sessão `authenticated` sem a claim do JWT não é "livre" — é indistinguível de
  -- ataque. Nega em vez de deixar a linha passar em silêncio.
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
