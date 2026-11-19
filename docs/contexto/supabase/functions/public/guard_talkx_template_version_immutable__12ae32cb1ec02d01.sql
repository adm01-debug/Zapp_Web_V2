CREATE OR REPLACE FUNCTION public.guard_talkx_template_version_immutable()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_rpc_owner name;
BEGIN
  SELECT role.rolname INTO v_rpc_owner
  FROM pg_proc procedure
  JOIN pg_roles role ON role.oid = procedure.proowner
  WHERE procedure.oid = 'public.update_talkx_template_with_snapshot(uuid,timestamptz,text,text,text,text,text,text,text[],text,text[])'::regprocedure;

  -- Em um ON DELETE CASCADE o pai ja nao esta visivel. Isso preserva a
  -- exclusao canonica do template, sem permitir DELETE direto do historico
  -- enquanto o pai ainda existe.
  IF TG_OP = 'DELETE' AND NOT EXISTS (
    SELECT 1
    FROM public.talkx_templates AS template
    WHERE template.id = OLD.template_id
  ) THEN
    RETURN OLD;
  END IF;

  IF current_user IS DISTINCT FROM v_rpc_owner
     AND current_user IS DISTINCT FROM 'service_role'::name THEN
    RAISE EXCEPTION 'talkx_template_history_requires_authorized_rpc'
      USING ERRCODE = '42501';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$function$
