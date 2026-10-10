-- 20260929590000_multiplix_mutability_guard
-- Bloco A (F05) do docs/multiplix/PLANO_FINALIZACAO_MULTIPLIX_100_ETAPAS_2026-09-29.md.
--
-- Achado da auditoria de 2026-09-29 (item 5): staff com UPDATE direto na tabela
-- dribla o motor de envio. `UPDATE multiplix_dispatches SET status='sending'` por
-- um admin/supervisor nunca passa por transition_multiplix_dispatch (que exige
-- service_role), `message_template` era editavel durante o envio (o worker rele o
-- template a cada destinatario — multiplix-send/index.ts), `sent_count`/`failed_*`
-- aceitavam escrita manual, e em multiplix_recipients o UPDATE permitia
-- `sent -> pending` (reenvio cego) e a troca de `destino_e164` (reenvio para outro
-- numero), enquanto o INSERT nao exigia dispatch em rascunho.
--
-- Mesmo padrao de enforce_talkx_campaign_mutability (20260911130000): a guarda so
-- se aplica ao ator `authenticated`. service_role (worker, RPCs do motor, pg_cron)
-- e o dono postgres continuam escrevendo livremente — o caminho legitimo de
-- escrita de staff passa a ser exclusivamente as RPCs SECURITY DEFINER.
--
-- Nenhuma linha nas tabelas (0 dispatches/0 recipients): aplicar isto nao bloqueia
-- nenhuma escrita existente em producao.

CREATE OR REPLACE FUNCTION public.enforce_multiplix_dispatch_mutability()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF COALESCE(auth.role(), '') <> 'authenticated' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'draft' THEN
      RAISE EXCEPTION 'multiplix_dispatch_insert_must_be_draft' USING ERRCODE = '22023';
    END IF;
    IF NEW.total_recipients <> 0
       OR NEW.sent_count <> 0
       OR NEW.failed_count <> 0
       OR NEW.delivered_count <> 0
       OR NEW.outcome_unknown_count <> 0
       OR NEW.started_at IS NOT NULL
       OR NEW.completed_at IS NOT NULL THEN
      RAISE EXCEPTION 'multiplix_delivery_state_managed_by_worker' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    IF OLD.status <> 'draft' THEN
      RAISE EXCEPTION 'multiplix_dispatch_delete_denied' USING ERRCODE = '55000';
    END IF;
    RETURN OLD;
  END IF;

  IF NEW.created_by IS DISTINCT FROM OLD.created_by THEN
    RAISE EXCEPTION 'multiplix_dispatch_owner_immutable' USING ERRCODE = '42501';
  END IF;

  -- Transicao de status: quem muda draft/scheduled/sending/paused e a RPC
  -- transition_multiplix_dispatch (service_role). Staff so alterna o rotulo
  -- entre rascunho e agendado.
  IF OLD.status NOT IN ('draft', 'scheduled') OR NEW.status NOT IN ('draft', 'scheduled') THEN
    RAISE EXCEPTION 'multiplix_dispatch_transition_denied' USING ERRCODE = '55000';
  END IF;

  -- Conteudo e publico congelam fora do rascunho: o worker le o template a cada
  -- item, entao editar durante o envio muda o que sai no meio do disparo.
  IF OLD.status <> 'draft' AND (
    NEW.message_template IS DISTINCT FROM OLD.message_template
    OR NEW.media_url IS DISTINCT FROM OLD.media_url
    OR NEW.media_type IS DISTINCT FROM OLD.media_type
    OR NEW.audience_filters IS DISTINCT FROM OLD.audience_filters
    OR NEW.whatsapp_connection_id IS DISTINCT FROM OLD.whatsapp_connection_id
    OR NEW.name IS DISTINCT FROM OLD.name
  ) THEN
    RAISE EXCEPTION 'multiplix_dispatch_content_locked' USING ERRCODE = '42501';
  END IF;

  IF NEW.scheduled_at IS DISTINCT FROM OLD.scheduled_at
     AND OLD.status <> 'draft'
     AND NOT (NEW.status = 'scheduled' AND OLD.status = 'draft') THEN
    RAISE EXCEPTION 'multiplix_dispatch_schedule_locked' USING ERRCODE = '42501';
  END IF;

  IF NEW.sent_count IS DISTINCT FROM OLD.sent_count
     OR NEW.failed_count IS DISTINCT FROM OLD.failed_count
     OR NEW.delivered_count IS DISTINCT FROM OLD.delivered_count
     OR NEW.outcome_unknown_count IS DISTINCT FROM OLD.outcome_unknown_count
     OR NEW.total_recipients IS DISTINCT FROM OLD.total_recipients
     OR NEW.started_at IS DISTINCT FROM OLD.started_at
     OR NEW.paused_at IS DISTINCT FROM OLD.paused_at
     OR NEW.completed_at IS DISTINCT FROM OLD.completed_at
     OR NEW.pause_reason IS DISTINCT FROM OLD.pause_reason THEN
    RAISE EXCEPTION 'multiplix_delivery_state_managed_by_worker' USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.enforce_multiplix_recipient_mutability()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_dispatch_status text;
BEGIN
  IF COALESCE(auth.role(), '') <> 'authenticated' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- Sem caso de uso legitimo para staff reescrever destinatario: o estado de
  -- entrega e do worker (claim/lease/snapshot) e o UPDATE direto permitia
  -- sent -> pending (reenvio) e troca de destino_e164 (reenvio para outro numero).
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'multiplix_recipient_update_denied' USING ERRCODE = '42501';
  END IF;

  SELECT dispatch.status INTO v_dispatch_status
    FROM public.multiplix_dispatches AS dispatch
   WHERE dispatch.id = COALESCE(NEW.dispatch_id, OLD.dispatch_id);

  IF v_dispatch_status IS DISTINCT FROM 'draft' THEN
    RAISE EXCEPTION 'multiplix_recipient_%_requires_draft', lower(TG_OP) USING ERRCODE = '55000';
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$function$;

DROP TRIGGER IF EXISTS enforce_multiplix_dispatch_mutability ON public.multiplix_dispatches;
CREATE TRIGGER enforce_multiplix_dispatch_mutability
  BEFORE INSERT OR UPDATE OR DELETE ON public.multiplix_dispatches
  FOR EACH ROW EXECUTE FUNCTION public.enforce_multiplix_dispatch_mutability();

DROP TRIGGER IF EXISTS enforce_multiplix_recipient_mutability ON public.multiplix_recipients;
CREATE TRIGGER enforce_multiplix_recipient_mutability
  BEFORE INSERT OR UPDATE OR DELETE ON public.multiplix_recipients
  FOR EACH ROW EXECUTE FUNCTION public.enforce_multiplix_recipient_mutability();
