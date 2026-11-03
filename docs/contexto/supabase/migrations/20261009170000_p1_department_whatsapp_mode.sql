create or replace function public . get_department_whatsapp_mode ( p_department_id uuid ) returns text language plpgsql stable security definer set search_path = public as $f$
DECLARE
  v_profile_id uuid;
  v_is_admin boolean;
  v_mode text;
BEGIN
  v_profile_id := public.current_profile_id();
  IF v_profile_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
  END IF;
  SELECT (role IN ('admin','supervisor')) INTO v_is_admin
    FROM public.profiles WHERE id = v_profile_id;
  -- Deny-by-default: um profile ausente deixaria v_is_admin NULL e `NOT NULL` nao
  -- dispara o IF (fail-open). `IS NOT TRUE` fecha os dois casos.
  IF v_is_admin IS NOT TRUE THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;
  SELECT whatsapp_mode INTO v_mode FROM public.departments WHERE id = p_department_id;
  RETURN v_mode;
END;
$f$

revoke execute on function public . get_department_whatsapp_mode ( uuid ) from public , anon

grant execute on function public . get_department_whatsapp_mode ( uuid ) to authenticated
