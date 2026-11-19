CREATE OR REPLACE FUNCTION public.current_profile_id() RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$ SELECT id FROM public.profiles WHERE user_id = auth.uid() LIMIT 1 $$

REVOKE EXECUTE ON FUNCTION public.current_profile_id() FROM PUBLIC

REVOKE EXECUTE ON FUNCTION public.current_profile_id() FROM anon

GRANT EXECUTE ON FUNCTION public.current_profile_id() TO authenticated
