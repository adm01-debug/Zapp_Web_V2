-- Objetivo: RPCs get_department_whatsapp_credentials e get_department_whatsapp_api_key (service_role only)
-- Estado ao vivo antes: função com tipo errado — DROP + CREATE
-- Rollback: DROP FUNCTION public.get_department_whatsapp_credentials(uuid); DROP FUNCTION public.get_department_whatsapp_api_key(uuid)

DROP FUNCTION IF EXISTS public.get_department_whatsapp_credentials(uuid);

CREATE FUNCTION public.get_department_whatsapp_credentials(p_department_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $f$
DECLARE
  v_row public.departments%ROWTYPE;
BEGIN
  IF current_setting('request.jwt.claims', true)::jsonb ->> 'role' <> 'service_role' THEN
    RAISE EXCEPTION 'access_denied';
  END IF;
  SELECT * INTO v_row FROM public.departments WHERE id = p_department_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  RETURN jsonb_build_object(
    'whatsapp_mode', v_row.whatsapp_mode,
    'whatsapp_api_key', v_row.whatsapp_api_key,
    'whatsapp_instance_id', v_row.whatsapp_instance_id
  );
END;
$f$;

REVOKE EXECUTE ON FUNCTION public.get_department_whatsapp_credentials(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_department_whatsapp_credentials(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.get_department_whatsapp_api_key(p_department_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $f$
DECLARE
  v_key text;
BEGIN
  IF current_setting('request.jwt.claims', true)::jsonb ->> 'role' <> 'service_role' THEN
    RAISE EXCEPTION 'access_denied';
  END IF;
  SELECT whatsapp_api_key INTO v_key FROM public.departments WHERE id = p_department_id;
  RETURN v_key;
END;
$f$;

REVOKE EXECUTE ON FUNCTION public.get_department_whatsapp_api_key(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_department_whatsapp_api_key(uuid) TO service_role;
