CREATE OR REPLACE FUNCTION public.enforce_multiplix_dispatch_mutability()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  -- #1267: dispensado só quem NÃO é o ator `authenticated`, decidido pelo papel real da sessão.
  IF current_user <> 'authenticated' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- #1267: sessão `authenticated` sem a claim do JWT não é "livre" — é indistinguível de ataque. Nega.
  IF auth.role() IS NULL THEN
    RAISE EXCEPTION 'multiplix_guard_auth_role_undefined' USING ERRCODE = '42501';
  END IF;

  IF auth.role() <> 'authenticated' THEN
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
$function$
