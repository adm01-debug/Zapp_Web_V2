-- S3-01 (auditoria 2026-10-22): department_invites aceitava INSERT e DELETE de qualquer
-- usuario autenticado (dept_invites_insert_authenticated WITH CHECK true,
-- dept_invites_delete_authenticated USING true). O codigo do convite e credencial de
-- entrada no departamento.
--
-- Decisao do dono (01/11/2026): somente admin cria e apaga convites.
--
-- Ha duas tabelas de convite. O aceite (accept_department_invite) le
-- department_invitations; department_invites e legada (o front gravava nela e o
-- convite nunca era aceito). O front passa a criar pela RPC
-- create_department_invite, que grava em department_invitations. Esta migration
-- fecha a escrita nas DUAS tabelas e restringe a RPC a admin.
-- public.is_admin(uuid) = papel 'admin' em public.user_roles.
-- department_invites.created_by referencia profiles(id), nao auth.uid().
--
-- Rollback (department_invites):
--   DROP POLICY dept_invites_insert_admin ON public.department_invites;
--   DROP POLICY dept_invites_delete_admin ON public.department_invites;
--   CREATE POLICY dept_invites_insert_authenticated ON public.department_invites
--     FOR INSERT TO authenticated WITH CHECK (true);
--   CREATE POLICY dept_invites_delete_authenticated ON public.department_invites
--     FOR DELETE TO authenticated USING (true);

DROP POLICY IF EXISTS "dept_invites_insert_authenticated" ON public.department_invites;
DROP POLICY IF EXISTS "dept_invites_delete_authenticated" ON public.department_invites;

CREATE POLICY "dept_invites_insert_admin" ON public.department_invites
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_admin(auth.uid())
    AND (
      created_by IS NULL
      OR created_by IN (SELECT p.id FROM public.profiles p WHERE p.user_id = auth.uid())
    )
  );

CREATE POLICY "dept_invites_delete_admin" ON public.department_invites
  FOR DELETE TO authenticated
  USING (public.is_admin(auth.uid()));

-- department_invitations: leitura segue admin/supervisor (como hoje); escrita direta
-- pelo cliente so admin. As RPCs (SECURITY DEFINER) continuam gravando.
-- Rollback:
--   DROP POLICY department_invitations_select_admin_supervisor ON public.department_invitations;
--   DROP POLICY department_invitations_write_admin ON public.department_invitations;
--   CREATE POLICY department_invitations_admin_all ON public.department_invitations
--     FOR ALL TO authenticated USING (is_admin_or_supervisor(auth.uid()))
--     WITH CHECK (is_admin_or_supervisor(auth.uid()));
DROP POLICY IF EXISTS "department_invitations_admin_all" ON public.department_invitations;

CREATE POLICY "department_invitations_select_admin_supervisor" ON public.department_invitations
  FOR SELECT TO authenticated
  USING (public.is_admin_or_supervisor(auth.uid()));

CREATE POLICY "department_invitations_write_admin" ON public.department_invitations
  FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

-- create_department_invite: troca so a checagem de permissao
-- (is_admin_or_supervisor -> is_admin). Corpo igual ao de producao em 01/11/2026.
CREATE OR REPLACE FUNCTION public.create_department_invite(p_department_id uuid, p_max_uses integer DEFAULT 1, p_expires_hours integer DEFAULT 72)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_profile_id uuid;
  v_code       text;
  v_invite_id  uuid;
  v_attempt    integer;
begin
  v_profile_id := public.current_profile_id();
  if v_profile_id is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  if not public.is_admin(auth.uid()) then
    return jsonb_build_object('ok', false, 'error', 'not_authorized');
  end if;

  for v_attempt in 1..5 loop
    v_code := upper(substr(translate(encode(gen_random_bytes(16), 'base64'), '+/=', ''), 1, 8));
    begin
      insert into public.department_invitations(
        department_id, code, max_uses, expires_at, created_by, status
      ) values (
        p_department_id,
        v_code,
        greatest(1, p_max_uses),
        now() + (greatest(1, p_expires_hours) || ' hours')::interval,
        v_profile_id,
        'pending'
      )
      returning id into v_invite_id;
      exit;
    exception when unique_violation then
      v_invite_id := null;
    end;
  end loop;

  if v_invite_id is null then
    return jsonb_build_object('ok', false, 'error', 'code_generation_failed');
  end if;

  insert into public.department_audit_logs(department_id, action, profile_id, details)
  values (
    p_department_id,
    'invite_created',
    v_profile_id,
    jsonb_build_object('invite_id', v_invite_id, 'max_uses', greatest(1, p_max_uses))
  );

  return jsonb_build_object('ok', true, 'invite_id', v_invite_id, 'code', v_code);
end;
$function$;
