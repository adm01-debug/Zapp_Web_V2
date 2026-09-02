-- M2 FIX: IDOR em get_connection_qr_code e get_connection_instance
-- Funções verificavam apenas is_admin_or_supervisor(auth.uid()), sem check de
-- propriedade da conexão. Qualquer admin pode ler QR/instance_id de qualquer
-- conexão independente de quem a criou (cross-tenant IDOR).
-- created_by referencia profiles.id → usar get_profile_id_for_user(auth.uid()).
-- Fix: (created_by = profile_do_chamador OR is_admin_or_supervisor).

CREATE OR REPLACE FUNCTION public.get_connection_qr_code(_connection_id uuid)
  RETURNS text
  LANGUAGE sql
  STABLE SECURITY DEFINER
  SET search_path TO 'public'
AS $function$
  SELECT qr_code FROM public.whatsapp_connections
  WHERE id = _connection_id
    AND (
      created_by = public.get_profile_id_for_user(auth.uid())
      OR public.is_admin_or_supervisor(auth.uid())
    );
$function$;

CREATE OR REPLACE FUNCTION public.get_connection_instance(_connection_id uuid)
  RETURNS text
  LANGUAGE sql
  STABLE SECURITY DEFINER
  SET search_path TO 'public'
AS $function$
  SELECT instance_id FROM public.whatsapp_connections
  WHERE id = _connection_id
    AND (
      created_by = public.get_profile_id_for_user(auth.uid())
      OR public.is_admin_or_supervisor(auth.uid())
    );
$function$;
