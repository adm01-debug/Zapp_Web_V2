-- team_profiles_department_id
-- Rollback: SQL executável completo no bloco "Rollback" ao fim do cabeçalho —
-- DROP FUNCTION + CREATE FUNCTION com a assinatura anterior (12 colunas, sem
-- department_id) seguidos dos mesmos REVOKE/GRANT canônicos.
-- Cartão #240-B: o contrato de get_team_profiles() ganha a coluna department_id
-- (uuid, anulável) para o Team Chat listar colegas por departamento via RPC
-- segura, sem leitura direta da tabela profiles pelo front. Filtro de ativos,
-- mascaramento de email/telefone para não-admin e os grants são preservados.
--
-- CREATE OR REPLACE não troca o tipo de retorno de função existente (Postgres
-- exige assinatura idêntica), então é DROP + CREATE na mesma transação:
-- o EXECUTE padrão de função nova (PUBLIC) é fechado logo abaixo, e os grants
-- canônicos (authenticated, service_role) são restabelecidos.
--
-- nomes-antigos-conferidos: get_team_profiles — drop e create no mesmo arquivo
-- para ampliar RETURNS TABLE; o nome continua válido e é o mesmo contrato.
--
-- Rollback (restaura assinatura de 12 colunas, corpo e grants anteriores):
--   DROP FUNCTION public.get_team_profiles();
--   CREATE FUNCTION public.get_team_profiles()
--   RETURNS TABLE(id uuid, user_id uuid, name text, email text, avatar_url text,
--     role text, is_active boolean, department text, job_title text, phone text,
--     max_chats integer, created_at timestamp with time zone)
--   LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
--   AS $function$
--     SELECT p.id, p.user_id, p.name,
--       CASE WHEN public.is_admin(auth.uid()) THEN p.email ELSE NULL END AS email,
--       p.avatar_url, p.role, p.is_active, p.department, p.job_title,
--       CASE WHEN public.is_admin(auth.uid()) THEN p.phone ELSE NULL END AS phone,
--       p.max_chats, p.created_at
--     FROM public.profiles p
--     WHERE p.is_active = true;
--   $function$;
--   REVOKE EXECUTE ON FUNCTION public.get_team_profiles() FROM PUBLIC, anon;
--   GRANT EXECUTE ON FUNCTION public.get_team_profiles() TO authenticated;
--   GRANT EXECUTE ON FUNCTION public.get_team_profiles() TO service_role;

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
