ALTER FUNCTION public.mcp_exec(sql text, max_rows integer) SET search_path = pg_catalog, public, pg_temp

ALTER FUNCTION public.mcp_exec_many(statements text[], max_rows integer) SET search_path = pg_catalog, public, pg_temp

ALTER FUNCTION public.effective_role(_user_id uuid) SET search_path = public, pg_temp

ALTER FUNCTION public.get_channel_credentials(_connection_id uuid) SET search_path = public, pg_temp

ALTER FUNCTION public.get_channel_credentials_safe(p_channel_id uuid) SET search_path = public, pg_temp

ALTER FUNCTION public.get_department_whatsapp_api_key(p_department_id uuid) SET search_path = public, pg_temp

ALTER FUNCTION public.get_department_whatsapp_credentials(p_department_id uuid) SET search_path = public, pg_temp

ALTER FUNCTION public.get_gmail_tokens(p_account_id uuid) SET search_path = public, pg_temp

ALTER FUNCTION public.get_profile_role_for_check(p_user_id uuid) SET search_path = public, pg_temp

ALTER FUNCTION public.handle_new_user_role() SET search_path = public, pg_temp

ALTER FUNCTION public.has_role(_user_id uuid, _role app_role) SET search_path = public, pg_temp

ALTER FUNCTION public.is_admin(_user_id uuid) SET search_path = public, pg_temp

ALTER FUNCTION public.is_admin_or_supervisor(_user_id uuid) SET search_path = public, pg_temp

ALTER FUNCTION public.store_gmail_tokens(p_account_id uuid, p_access_token text, p_refresh_token text) SET search_path = public, pg_temp

ALTER FUNCTION public.user_has_permission(_user_id uuid, _permission_name text) SET search_path = public, pg_temp
