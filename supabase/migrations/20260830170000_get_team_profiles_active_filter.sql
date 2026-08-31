-- 20260830170000_get_team_profiles_active_filter
-- CANONIZACAO FORWARD-ONLY (G-03/G-09, veredito da auditoria 2026-08-30):
-- Este SQL entrou no repo como 20260829100000 (PR #59), mas essa versao colidiu
-- com 20260829100000_fix_clear_login_operator_triple_arrow (PR #58), que e a
-- registrada no ledger oficial. Renomeado para versao UNICA 20260830170000.
--
-- Estado runtime verificado em 2026-08-30 (read-only, projeto oficial
-- tnnnlkbymytvtqngbbqh): a funcao JA contem o filtro is_active em producao
-- (pg_get_functiondef hash sha256 0c0d1426...b332616; returned_inactive=0),
-- portanto este arquivo NAO e hotfix de seguranca e sim reconciliacao
-- operacional de replay/ledger (Caso A do veredito).
--
-- Procedimento quando autorizado (Classe C/D):
--   1. Comparar o corpo remoto (pg_get_functiondef) ANTES do CREATE OR REPLACE
--      para nao sobrescrever alteracoes posteriores;
--   2. Aplicar pelo mecanismo oficial de migration (registra o ledger) —
--      NUNCA via INSERT/UPDATE manual em schema_migrations;
--   3. Apos aplicar: conferir funcao, grants, retorno agregado e ledger.
--
-- Conteudo original do PR #59 preservado integralmente abaixo.

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
