DROP FUNCTION public.get_team_profiles();

CREATE FUNCTION public.get_team_profiles()
RETURNS TABLE(id uuid, user_id uuid, name text, email text, avatar_url text, role text, is_active boolean, department text, department_id uuid, job_title text, phone text, max_chats integer, created_at timestamp with time zone)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  -- Filtra apenas agentes ativos: inativos nao devem aparecer em listas de equipe.
  -- Email/telefone só voltam para quem é admin; demais authenticated recebem NULL.
  SELECT
    p.id, p.user_id, p.name,
    CASE WHEN public.is_admin(auth.uid()) THEN p.email ELSE NULL END AS email,
    p.avatar_url, p.role,
    p.is_active, p.department, p.department_id, p.job_title,
    CASE WHEN public.is_admin(auth.uid()) THEN p.phone ELSE NULL END AS phone,
    p.max_chats, p.created_at
  FROM public.profiles p
  WHERE p.is_active = true;
$function$;

REVOKE EXECUTE ON FUNCTION public.get_team_profiles() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_team_profiles() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_team_profiles() TO service_role;
