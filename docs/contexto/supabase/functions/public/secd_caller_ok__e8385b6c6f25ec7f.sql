CREATE OR REPLACE FUNCTION public.secd_caller_ok(p_subject_user_id uuid, p_admin_only boolean)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT CASE
           -- contexto interno: cron, service_role, gatilho/funcao DEFINER (sem JWT de usuario)
           WHEN auth.uid() IS NULL THEN true
           -- admin/supervisor pode consultar qualquer sujeito
           WHEN EXISTS (
             SELECT 1 FROM public.user_roles ur
             WHERE ur.user_id = auth.uid() AND ur.role IN ('admin', 'supervisor')
           ) THEN true
           -- dado sensivel de administracao: so admin/supervisor
           WHEN p_admin_only THEN false
           -- sem sujeito: exige sessao com perfil (usuario logado de verdade)
           WHEN p_subject_user_id IS NULL THEN EXISTS (
             SELECT 1 FROM public.profiles pr WHERE pr.user_id = auth.uid()
           )
           -- sujeito de outro usuario: negado
           ELSE p_subject_user_id = auth.uid()
         END;
$function$
