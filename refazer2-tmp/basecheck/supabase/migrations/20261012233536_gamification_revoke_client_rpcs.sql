-- gamification_revoke_client_rpcs
-- Rollback: devolve o EXECUTE que estas 4 funcoes tinham antes desta migration
--   (estado deixado por 20260930113613: authenticated + service_role; anon e PUBLIC
--   ja estavam fechados). Nenhum dado, tabela ou gatilho e tocado.
-- Rollback (SQL executável, na ordem):
--   grant execute on function public.add_agent_xp(uuid, integer) to authenticated, service_role;
--   grant execute on function public.grant_agent_achievement(uuid, text, text, text, integer) to authenticated, service_role;
--   grant execute on function public.increment_agent_messages(uuid, text) to authenticated, service_role;
--   grant execute on function public.update_agent_streak(uuid, boolean) to authenticated, service_role;
--
-- PROBLEMA (R2-SEC / paridade V3-B1B2): as 4 RPCs de gamificacao eram SECURITY DEFINER com
-- EXECUTE para authenticated. add_agent_xp aceita ate 500 XP por chamada, sem limite de
-- chamadas, para o proprio perfil; grant_agent_achievement de 'daily_goal' rende 500 XP por
-- dia. Assim nivel, XP total e contadores de agent_stats eram forjaveis pelo cliente
-- (o ledger agent_achievements e os gatilhos de servidor nao bastavam para conter).
--
-- CORRECAO: fechar a fronteira invocavel pelo cliente nas 4 funcoes. A pontuacao de verdade
-- ja vem dos gatilhos de servidor (trg_gamification_on_closure / trg_gamification_on_message_sent,
-- SECURITY DEFINER proprios) e da rotina interna grant_agent_achievement_internal, que rodam
-- como owner (postgres) -- nenhum deles depende do EXECUTE de authenticated nas 4 RPCs.
-- service_role permanece com EXECUTE (operacao administrativa fora do bundle do navegador).
--
-- Nao muda corpo de funcao, tabela, policy, gatilho nem GRANT de anon/PUBLIC (que ja estavam
-- fechados por 20260930113613). So o EXECUTE de authenticated.

SET search_path = public, pg_temp;

REVOKE EXECUTE ON FUNCTION public.add_agent_xp(uuid, integer)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.grant_agent_achievement(uuid, text, text, text, integer)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.increment_agent_messages(uuid, text)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_agent_streak(uuid, boolean)
  FROM PUBLIC, anon, authenticated;

-- Explicitos: service_role continua alcancando as 4; nenhum outro papel de cliente.
GRANT EXECUTE ON FUNCTION public.add_agent_xp(uuid, integer)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.grant_agent_achievement(uuid, text, text, text, integer)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.increment_agent_messages(uuid, text)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.update_agent_streak(uuid, boolean)
  TO service_role;
