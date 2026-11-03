-- Piso de admin (achado P2 da auditoria de 24/09): admin_set_role permitia
-- rebaixar todos os outros admins e ficar como unico administrador, sem
-- aviso nem trava -- se esse ultimo admin fosse desativado por outro
-- caminho, a instalacao perdia administracao. Preserva o corpo original,
-- so acrescenta a checagem de "pelo menos 1 admin" antes de rebaixar.

CREATE OR REPLACE FUNCTION public.admin_set_role(_user_id uuid, _role app_role)
 RETURNS TABLE(out_user_id uuid, out_old_role app_role, out_new_role app_role)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_caller uuid := auth.uid();
  v_old    public.app_role;
  v_admin_count int;
BEGIN
  -- Exige sessao JWT real: service_role sem JWT tem auth.uid() nulo e cai aqui.
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'jwt_session_required'
      USING HINT = 'admin_set_role exige sessao autenticada; service_role sem JWT nao pode usar esta RPC';
  END IF;

  IF NOT public.is_admin(v_caller) THEN
    RAISE EXCEPTION 'admin_required';
  END IF;

  -- Nao permite que um admin remova o proprio admin e trave a instalacao.
  IF _user_id = v_caller AND _role <> 'admin'::public.app_role THEN
    RAISE EXCEPTION 'cannot_demote_self';
  END IF;

  SELECT ur.role INTO v_old FROM public.user_roles ur WHERE ur.user_id = _user_id LIMIT 1;

  -- Piso de admin: nao deixa zerar o ultimo administrador da instalacao.
  IF v_old = 'admin'::public.app_role AND _role <> 'admin'::public.app_role THEN
    SELECT count(*) INTO v_admin_count FROM public.user_roles ur WHERE ur.role = 'admin'::public.app_role;
    IF v_admin_count <= 1 THEN
      RAISE EXCEPTION 'cannot_demote_last_admin'
        USING HINT = 'a instalacao precisa de pelo menos 1 administrador';
    END IF;
  END IF;

  IF v_old IS NULL THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (_user_id, _role);
  ELSIF v_old IS DISTINCT FROM _role THEN
    UPDATE public.user_roles ur SET role = _role WHERE ur.user_id = _user_id;
  END IF;

  -- audit_user_role_changes dispara sozinho no INSERT/UPDATE acima, ja com
  -- changed_by = auth.uid() preenchido (sessao JWT garantida no guard).
  RETURN QUERY SELECT _user_id, v_old, _role;
END;
$function$
