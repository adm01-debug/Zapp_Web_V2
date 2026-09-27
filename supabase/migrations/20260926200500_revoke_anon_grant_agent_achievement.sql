-- Hardening: remove EXECUTE de anon/authenticated/PUBLIC em grant_agent_achievement.
-- Achado de auditoria (2026-09-26): função SECURITY DEFINER sem nenhum guard de
-- autorização além de checar se p_profile_id existe. anon tinha EXECUTE, então
-- qualquer requisição anônima via /rest/v1/rpc/grant_agent_achievement conseguia
-- inflar XP/conquista de QUALQUER perfil (e para os tipos 'daily_goal', 'streak',
-- 'message_milestone', 'resolution' nem há dedupliçao, permitindo repetição
-- ilimitada). Confirmado que a função só é chamada internamente por outras
-- funções de trigger (gamification_triggers_eventos_reais.sql via PERFORM) —
-- nenhum código de app (frontend/edge function) a chama diretamente, logo
-- revogar de anon e authenticated não quebra nada. service_role e o dono da
-- função continuam podendo executá-la.
-- Correção (review P1, chatgpt-codex-connector): revogar só de anon/authenticated
-- não bastava — as duas roles herdam EXECUTE de PUBLIC por padrão no Postgres, e
-- PUBLIC tinha EXECUTE nesta função (confirmado via has_function_privilege antes
-- deste commit). Sem revogar de PUBLIC também, anon/authenticated continuariam
-- executando a função normalmente.
REVOKE EXECUTE ON FUNCTION public.grant_agent_achievement(uuid, text, text, text, integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.grant_agent_achievement(uuid, text, text, text, integer) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.grant_agent_achievement(uuid, text, text, text, integer) FROM PUBLIC;
