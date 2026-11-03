CREATE OR REPLACE FUNCTION public.is_contact_visible_to_user(_contact_id uuid, _user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT _user_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.contacts AS contact
      WHERE contact.id = _contact_id
        AND (
          public.is_admin_or_supervisor(_user_id)
          OR contact.assigned_to IN (
            SELECT public.get_visible_agent_ids(_user_id)
          )
          OR EXISTS (
            SELECT 1
            FROM public.queue_members AS member
            WHERE member.queue_id = contact.queue_id
              AND member.profile_id = public.get_profile_id_for_user(_user_id)
              AND member.is_active = true
          )
        )
    );
$function$
