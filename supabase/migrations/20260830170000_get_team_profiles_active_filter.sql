-- get_team_profiles: filtrar apenas agentes ativos.
--
-- PROBLEMA: a funcao listava todos os profiles incluindo inativos, expondo
-- dados de ex-agentes (is_active=false) a qualquer usuario autenticado via
-- SECURITY DEFINER que bypassa o RLS SELECT da tabela profiles.
-- O RLS so permite admin/supervisor ver todos ou cada usuario ver o proprio;
-- get_team_profiles bypassava isso e listava absolutamente tudo.
--
-- FIX: WHERE p.is_active = true, alinhando com NewConversationDialog e
-- AddMembersDialog que ja filtram .eq('is_active', true) nas queries diretas.
--
-- Assinatura identica (sem impacto em schema-catalog.json nem no guard).
-- Idempotente via CREATE OR REPLACE.

CREATE OR REPLACE FUNCTION public.get_team_profiles()
RETURNS TABLE(
  id uuid, user_id uuid, name text, email text, avatar_url text,
  role text, is_active boolean, department text, job_title text,
  phone text, max_chats integer, created_at timestamp with time zone
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  -- Filtra apenas agentes ativos: inativos nao devem aparecer em listas de equipe.
  SELECT
    p.id, p.user_id, p.name, p.email, p.avatar_url, p.role,
    p.is_active, p.department, p.job_title, p.phone, p.max_chats, p.created_at
  FROM public.profiles p
  WHERE p.is_active = true;
$function$;
