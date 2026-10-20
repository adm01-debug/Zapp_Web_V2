-- 20260902000500_fix_idor_get_connection_functions
-- Fix IDOR: get_connection_qr_code e get_connection_instance restritos ao criador
-- ou admin/supervisor. SQL conforme ledger.

CREATE OR REPLACE FUNCTION public.get_connection_qr_code(_connection_id uuid) RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$ SELECT qr_code FROM public.whatsapp_connections WHERE id = _connection_id AND (created_by = public.get_profile_id_for_user(auth.uid()) OR public.is_admin_or_supervisor(auth.uid())); $function$;

CREATE OR REPLACE FUNCTION public.get_connection_instance(_connection_id uuid) RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$ SELECT instance_id FROM public.whatsapp_connections WHERE id = _connection_id AND (created_by = public.get_profile_id_for_user(auth.uid()) OR public.is_admin_or_supervisor(auth.uid())); $function$;
