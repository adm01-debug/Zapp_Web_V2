-- funcoes_definer_pg_temp_search_path
-- Rollback: devolve o search_path anterior (public, sem pg_temp) nas 9 funcoes.
-- Rollback (SQL executavel, na ordem):
--   ALTER FUNCTION public.is_within_business_hours(uuid) SET search_path = public;
--   ALTER FUNCTION public.get_profile_role_for_check(uuid) SET search_path = public;
--   ALTER FUNCTION public.update_own_profile(text, text, text, text, text, text) SET search_path = public;
--   ALTER FUNCTION public.reassign_overloaded_agents() SET search_path = public;
--   ALTER FUNCTION public.reassign_absent_agents(integer) SET search_path = public;
--   ALTER FUNCTION public.grant_agent_achievement(uuid, text, text, text, integer) SET search_path = public;
--   ALTER FUNCTION public.update_agent_streak(uuid, boolean) SET search_path = public;
--   ALTER FUNCTION public.increment_agent_resolutions(uuid) SET search_path = public;
--   ALTER FUNCTION public.get_own_lockout_status(text) SET search_path = public;
--
-- SEC-DEFINER_GRANTS_STORAGE-04 (P2, defesa em profundidade). 9 funcoes SECURITY DEFINER
-- de public referenciam tabela/visao sem qualificar o schema e declaravam
-- `SET search_path = public` SEM pg_temp. Quando pg_temp nao esta no caminho, ele e
-- pesquisado PRIMEIRO para nomes de relacao nao qualificados: uma tabela temporaria
-- criada na sessao pode substituir a tabela real dentro da funcao DEFINER (ex.: uma
-- `CREATE TEMP TABLE agent_stats` forjada faria update_agent_streak/grant_agent_achievement
-- lerem o estado falso). Listar pg_temp explicitamente ao FIM do search_path faz o
-- Postgres pesquisar pg_temp por ULTIMO em vez de primeiro.
--
-- Aqui NAO ha mudanca de corpo, grant nem ACL: so o `search_path` declarado de cada
-- funcao (ALTER FUNCTION ... SET search_path), sobre a assinatura exata em vigor no repo.

ALTER FUNCTION public.is_within_business_hours(uuid) SET search_path = public, pg_temp;
ALTER FUNCTION public.get_profile_role_for_check(uuid) SET search_path = public, pg_temp;
ALTER FUNCTION public.update_own_profile(text, text, text, text, text, text) SET search_path = public, pg_temp;
ALTER FUNCTION public.reassign_overloaded_agents() SET search_path = public, pg_temp;
ALTER FUNCTION public.reassign_absent_agents(integer) SET search_path = public, pg_temp;
ALTER FUNCTION public.grant_agent_achievement(uuid, text, text, text, integer) SET search_path = public, pg_temp;
ALTER FUNCTION public.update_agent_streak(uuid, boolean) SET search_path = public, pg_temp;
ALTER FUNCTION public.increment_agent_resolutions(uuid) SET search_path = public, pg_temp;
ALTER FUNCTION public.get_own_lockout_status(text) SET search_path = public, pg_temp;
