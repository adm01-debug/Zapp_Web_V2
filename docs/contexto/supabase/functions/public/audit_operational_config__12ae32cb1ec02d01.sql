CREATE OR REPLACE FUNCTION public.audit_operational_config()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_entity    text := TG_TABLE_NAME;
  v_op        text := lower(TG_OP);
  v_action    text;
  v_entity_id uuid;
  v_details   jsonb;
  v_before    jsonb;
  v_after     jsonb;
  v_changed   jsonb := '{}'::jsonb;
  v_key       text;
  v_actor     jsonb;
BEGIN
  v_entity_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.id ELSE NEW.id END;

  v_action := CASE v_entity
                WHEN 'queues'                     THEN 'queue'
                WHEN 'queue_members'              THEN 'queue_member'
                WHEN 'whatsapp_connection_queues'  THEN 'connection_queue'
                WHEN 'rate_limit_configs'         THEN 'rate_limit_config'
                ELSE v_entity
              END
              || '_'
              || CASE
                   WHEN v_entity = 'whatsapp_connection_queues'
                     THEN CASE v_op WHEN 'insert' THEN 'linked'
                                    WHEN 'delete' THEN 'unlinked'
                                    ELSE 'updated' END
                   WHEN v_op = 'insert' THEN 'created'
                   WHEN v_op = 'update' THEN 'updated'
                   WHEN v_op = 'delete' THEN 'deleted'
                   ELSE v_op
                 END;

  IF TG_OP = 'INSERT' THEN
    v_details := jsonb_build_object('op', v_op, 'new', to_jsonb(NEW));
  ELSIF TG_OP = 'DELETE' THEN
    v_details := jsonb_build_object('op', v_op, 'old', to_jsonb(OLD));
  ELSE
    v_before := to_jsonb(OLD);
    v_after  := to_jsonb(NEW);
    FOR v_key IN SELECT jsonb_object_keys(v_after) LOOP
      IF v_key <> 'updated_at'
         AND (v_after -> v_key) IS DISTINCT FROM (v_before -> v_key) THEN
        v_changed := v_changed || jsonb_build_object(
          v_key, jsonb_build_object('old', v_before -> v_key, 'new', v_after -> v_key));
      END IF;
    END LOOP;
    v_details := jsonb_build_object('op', v_op, 'changed', v_changed);
  END IF;

  v_actor := jsonb_build_object(
    'actor_kind', CASE WHEN auth.uid() IS NOT NULL THEN 'jwt' ELSE 'service_role_or_direct_sql' END,
    'actor_db_role', current_user,
    'actor_app_name', nullif(current_setting('application_name', true), ''),
    'actor_addr', coalesce(host(inet_client_addr()), 'local')
  );

  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, details)
  VALUES (auth.uid(), v_action, v_entity, v_entity_id, v_details || v_actor);

  RETURN NULL;
END;
$function$
