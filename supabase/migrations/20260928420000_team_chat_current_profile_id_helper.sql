-- E02: Helper function para resolver identity correta do usuário logado
-- profiles.id != auth.uid() — o auth uid fica em profiles.user_id
-- Todas as migrations do Team Chat devem usar current_profile_id() em vez de auth.uid() direto

CREATE OR REPLACE FUNCTION public.current_profile_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM public.profiles WHERE user_id = auth.uid() LIMIT 1
$$;

REVOKE EXECUTE ON FUNCTION public.current_profile_id() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.current_profile_id() FROM anon;
GRANT EXECUTE ON FUNCTION public.current_profile_id() TO authenticated;
