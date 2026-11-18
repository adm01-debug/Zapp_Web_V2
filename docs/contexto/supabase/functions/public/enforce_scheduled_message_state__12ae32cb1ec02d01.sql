CREATE OR REPLACE FUNCTION public.enforce_scheduled_message_state()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_is_dispatcher boolean := current_user NOT IN ('authenticated','anon');
BEGIN
  IF v_is_dispatcher THEN RETURN NEW; END IF;
  IF TG_OP='INSERT' THEN
    IF NEW.status IS DISTINCT FROM 'pending' THEN RAISE EXCEPTION 'scheduled_message_initial_status_must_be_pending' USING ERRCODE='22023'; END IF;
    IF NEW.sent_at IS NOT NULL OR NEW.error_message IS NOT NULL THEN RAISE EXCEPTION 'scheduled_message_initial_row_must_not_carry_delivery_state' USING ERRCODE='22023'; END IF;
    IF NEW.scheduled_at <= now() THEN RAISE EXCEPTION 'scheduled_message_scheduled_at_must_be_future' USING ERRCODE='22023'; END IF;
    IF auth.uid() IS NULL OR public.is_contact_visible_to_user(NEW.contact_id,auth.uid()) IS NOT TRUE THEN RAISE EXCEPTION 'scheduled_message_contact_not_visible' USING ERRCODE='42501'; END IF;
    RETURN NEW;
  END IF;
  IF OLD.status IS DISTINCT FROM 'pending' THEN RAISE EXCEPTION 'scheduled_message_not_pending' USING ERRCODE='42501'; END IF;
  IF NEW.status IS NULL OR NEW.status NOT IN ('pending','cancelled') THEN RAISE EXCEPTION 'scheduled_message_user_transition_not_allowed' USING ERRCODE='42501'; END IF;
  IF NEW.created_by IS DISTINCT FROM OLD.created_by OR NEW.created_at IS DISTINCT FROM OLD.created_at OR NEW.sent_at IS DISTINCT FROM OLD.sent_at OR NEW.error_message IS DISTINCT FROM OLD.error_message THEN RAISE EXCEPTION 'scheduled_message_field_not_editable' USING ERRCODE='42501'; END IF;
  IF NEW.contact_id IS DISTINCT FROM OLD.contact_id AND (auth.uid() IS NULL OR public.is_contact_visible_to_user(NEW.contact_id,auth.uid()) IS NOT TRUE) THEN RAISE EXCEPTION 'scheduled_message_contact_not_visible' USING ERRCODE='42501'; END IF;
  RETURN NEW;
END;
$function$
