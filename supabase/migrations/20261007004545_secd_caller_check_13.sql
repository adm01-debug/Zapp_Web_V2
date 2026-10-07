-- secd_caller_check_13 — fecha M-DB-05 / item 474: 13 funcoes SECURITY DEFINER de public executaveis por
-- qualquer usuario logado sem checagem do chamador (vazamento de papel/permissao/config; MAPA_BANCO secoes 2 e 7,
-- retrato vivo 04/10/2026; nada tocava estes objetos desde entao).
-- Rollback: GRANT EXECUTE ON FUNCTION public.effective_role(uuid) TO authenticated; GRANT EXECUTE ON FUNCTION public.fn_list_audio_meme_categories() TO authenticated; GRANT EXECUTE ON FUNCTION public.is_country_allowed(text) TO authenticated; GRANT EXECUTE ON FUNCTION public.is_country_blocked(text) TO authenticated; GRANT EXECUTE ON FUNCTION public.is_ip_blocked(text) TO authenticated; GRANT EXECUTE ON FUNCTION public.is_ip_whitelisted(text) TO authenticated; GRANT EXECUTE ON FUNCTION public.notify_searchbox_budget() TO authenticated; CREATE OR REPLACE FUNCTION public.user_has_permission(_user_id uuid, _permission_name text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$ SELECT EXISTS (SELECT 1 FROM public.user_roles ur JOIN public.role_permissions rp ON rp.role = ur.role JOIN public.permissions p ON p.id = rp.permission_id WHERE ur.user_id = _user_id AND p.name = _permission_name) $$; CREATE OR REPLACE FUNCTION public.is_team_conversation_member(_user_id uuid, _conversation_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$ SELECT EXISTS (SELECT 1 FROM public.team_conversation_members tcm JOIN public.profiles p ON p.id = tcm.profile_id WHERE tcm.conversation_id = _conversation_id AND p.user_id = _user_id) $$; CREATE OR REPLACE FUNCTION public.search_knowledge_base(search_query text, max_results integer DEFAULT 5) RETURNS TABLE(id uuid, title text, content text, category text, tags text[], rank real) LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$ SELECT a.id, a.title, a.content, a.category, a.tags, ts_rank(a.search_vector, websearch_to_tsquery('portuguese', search_query)) AS rank FROM public.knowledge_base_articles a WHERE a.is_published = true AND (a.search_vector @@ websearch_to_tsquery('portuguese', search_query) OR a.title ILIKE '%' || search_query || '%' OR a.content ILIKE '%' || search_query || '%') ORDER BY rank DESC LIMIT max_results $$; CREATE OR REPLACE FUNCTION public.count_searchbox_sessions_this_month() RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$ SELECT count(*)::integer FROM public.audit_logs WHERE action = 'searchbox_session' AND created_at >= date_trunc('month', now() AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'America/Sao_Paulo' $$; CREATE OR REPLACE FUNCTION public.is_within_business_hours(connection_id uuid) RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$ DECLARE v_current_day INTEGER; v_current_time TIME; v_is_open BOOLEAN; v_open_at TIME; v_close_at TIME; BEGIN v_current_day := EXTRACT(DOW FROM now() AT TIME ZONE 'America/Sao_Paulo'); v_current_time := (now() AT TIME ZONE 'America/Sao_Paulo')::TIME; SELECT bh.is_open, bh.open_time, bh.close_time INTO v_is_open, v_open_at, v_close_at FROM business_hours bh WHERE bh.whatsapp_connection_id = connection_id AND bh.day_of_week = v_current_day; IF NOT FOUND THEN RETURN true; END IF; IF NOT v_is_open THEN RETURN false; END IF; RETURN v_current_time >= v_open_at AND v_current_time <= v_close_at; END $$; CREATE OR REPLACE FUNCTION public.talkx_engine_window_open(p_campaign_id uuid) RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $$ DECLARE v_tz text; v_start time; v_end time; v_bh_only boolean; v_local timestamp; v_min integer; v_bh jsonb; v_days jsonb; v_bstart text; v_bend text; v_bstart_min integer; v_bend_min integer; v_dow integer; BEGIN SELECT COALESCE(NULLIF(c.schedule_timezone, ''), 'America/Sao_Paulo'), c.send_window_start, c.send_window_end, COALESCE(c.business_hours_only, false) INTO v_tz, v_start, v_end, v_bh_only FROM public.talkx_campaigns AS c WHERE c.id = p_campaign_id; IF NOT FOUND THEN RETURN false; END IF; v_local := (now() AT TIME ZONE v_tz); v_min := EXTRACT(hour FROM v_local)::integer * 60 + EXTRACT(minute FROM v_local)::integer; IF v_start IS NOT NULL AND v_end IS NOT NULL THEN IF v_min < EXTRACT(hour FROM v_start)::integer * 60 + EXTRACT(minute FROM v_start)::integer OR v_min >= EXTRACT(hour FROM v_end)::integer * 60 + EXTRACT(minute FROM v_end)::integer THEN RETURN false; END IF; END IF; IF v_bh_only THEN SELECT s.value INTO v_bh FROM public.talkx_settings AS s WHERE s.key = 'business_hours'; v_days := COALESCE(v_bh -> 'days', '[1,2,3,4,5]'::jsonb); v_bstart := COALESCE(v_bh ->> 'start', '08:00'); v_bend := COALESCE(v_bh ->> 'end', '18:00'); v_dow := EXTRACT(dow FROM v_local)::integer; IF NOT (v_days @> to_jsonb(v_dow)) THEN RETURN false; END IF; v_bstart_min := split_part(v_bstart, ':', 1)::integer * 60 + split_part(v_bstart, ':', 2)::integer; v_bend_min := split_part(v_bend, ':', 1)::integer * 60 + split_part(v_bend, ':', 2)::integer; IF v_min < v_bstart_min OR v_min >= v_bend_min THEN RETURN false; END IF; END IF; RETURN true; END $$; DROP FUNCTION IF EXISTS public.secd_caller_ok(uuid, boolean);
--
-- ESTRATEGIA por grupo (as 13 de MAPA_BANCO secao 7; talkx_engine_cron_runs e M-DB-03, fora deste cartao):
--   A) ORACULOS DE IDENTIDADE (papel/permissao/membership de OUTRO usuario): passam a exigir que o sujeito
--      consultado seja o proprio chamador (ou admin/supervisor, ou contexto interno). Sao 2: user_has_permission,
--      is_team_conversation_member. effective_role NAO tem nenhum chamador no repo (o gatilho sync_profile_role
--      reimplementa a regra inline) -> entra no grupo B.
--   B) SEM CHAMADOR NO APP/EDGE/REGRA/VISAO -> EXECUTE de authenticated revogado (a funcao continua existindo e
--      segue alcancavel por quem roda com poder de dono: postgres, service_role, gatilhos e funcoes DEFINER).
--      Sao 7: effective_role, fn_list_audio_meme_categories, is_country_allowed, is_country_blocked, is_ip_blocked,
--      is_ip_whitelisted, notify_searchbox_budget.
--   C) APP CHAMA COMO O PROPRIO USUARIO (nao da para revogar sem quebrar tela): ganham checagem explicita.
--      search_knowledge_base deixa de ser DEFINER (passa a respeitar a RLS de knowledge_base_articles);
--      count_searchbox_sessions_this_month e is_within_business_hours exigem sessao com perfil;
--      talkx_engine_window_open (lida pela view security_invoker talkx_engine_health) responde false a quem nao
--      e admin/supervisor, sem erro (fail-closed, sem superficie de excecao para quem so le a view).
--
-- Nao mexe em anon/PUBLIC alem do que a guarda check-secdef-public-execute ja exige (hoje OK). Nenhuma escrita
-- de dado, nenhum GRANT novo. Prova: scripts/db-audit/secd-caller-check.test.sh (vermelho antes, verde depois).

-- ---------------------------------------------------------------------------
-- 0. Auxiliar de decisao do chamador. Nao e RPC: EXECUTE fechado por assinatura.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.secd_caller_ok(p_subject_user_id uuid, p_admin_only boolean)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
  SELECT CASE
           -- contexto interno: cron, service_role, gatilho/funcao DEFINER (sem JWT de usuario)
           WHEN auth.uid() IS NULL THEN true
           -- admin/supervisor pode consultar qualquer sujeito
           WHEN EXISTS (
             SELECT 1 FROM public.user_roles ur
             WHERE ur.user_id = auth.uid() AND ur.role IN ('admin', 'supervisor')
           ) THEN true
           -- dado sensivel de administracao: so admin/supervisor
           WHEN p_admin_only THEN false
           -- sem sujeito: exige sessao com perfil (usuario logado de verdade)
           WHEN p_subject_user_id IS NULL THEN EXISTS (
             SELECT 1 FROM public.profiles pr WHERE pr.user_id = auth.uid()
           )
           -- sujeito de outro usuario: negado
           ELSE p_subject_user_id = auth.uid()
         END;
$function$;

REVOKE ALL ON FUNCTION public.secd_caller_ok(uuid, boolean) FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.secd_caller_ok(uuid, boolean) IS
'M-DB-05: decide se o chamador pode ver dado de identidade/permissao/config. Interno (auth.uid() nulo) e admin/supervisor passam; agente so consulta o proprio sujeito; admin_only barra agente.';

-- ---------------------------------------------------------------------------
-- A) Oraculos de identidade: papel/permissao/membership de outro usuario
-- ---------------------------------------------------------------------------

-- A1. user_has_permission — src/services/role.service.ts e src/hooks/system/usePermissions.ts chamam com o
-- proprio user.id; edge com chave de servico (auth.uid() nulo) segue funcionando.
CREATE OR REPLACE FUNCTION public.user_has_permission(_user_id uuid, _permission_name text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.secd_caller_ok(_user_id, false) THEN
    RAISE EXCEPTION 'user_has_permission: consulta de permissao de outro usuario nao autorizada'
      USING ERRCODE = '42501';
  END IF;
  RETURN EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.role_permissions rp ON rp.role = ur.role
    JOIN public.permissions p ON p.id = rp.permission_id
    WHERE ur.user_id = _user_id AND p.name = _permission_name
  );
END;
$function$;

-- A2. is_team_conversation_member — usada em 5 policies SEMPRE com auth.uid() (o proprio chamador).
CREATE OR REPLACE FUNCTION public.is_team_conversation_member(_user_id uuid, _conversation_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.secd_caller_ok(_user_id, false) THEN
    RAISE EXCEPTION 'is_team_conversation_member: consulta de vinculo de outro usuario nao autorizada'
      USING ERRCODE = '42501';
  END IF;
  RETURN EXISTS (
    SELECT 1 FROM public.team_conversation_members tcm
    JOIN public.profiles p ON p.id = tcm.profile_id
    WHERE tcm.conversation_id = _conversation_id
      AND p.user_id = _user_id
  );
END;
$function$;

-- ---------------------------------------------------------------------------
-- B) Sem chamador no app/edge/regra/visao: EXECUTE de authenticated revogado
-- ---------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.effective_role(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_list_audio_meme_categories() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.is_country_allowed(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.is_country_blocked(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.is_ip_blocked(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.is_ip_whitelisted(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_searchbox_budget() FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- C) App chama como o proprio usuario: checagem explicita, sem revogar EXECUTE
-- ---------------------------------------------------------------------------

-- C1. search_knowledge_base — a policy "Authenticated can view knowledge base" ja filtra is_published=true
-- (o corpo ja filtra igual). Mantida a regra, deixa de bypassar RLS: passa a rodar como o chamador.
CREATE OR REPLACE FUNCTION public.search_knowledge_base(search_query text, max_results integer DEFAULT 5)
RETURNS TABLE(id uuid, title text, content text, category text, tags text[], rank real)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO 'public'
AS $function$
  SELECT 
    a.id, a.title, a.content, a.category, a.tags,
    ts_rank(a.search_vector, websearch_to_tsquery('portuguese', search_query)) AS rank
  FROM public.knowledge_base_articles a
  WHERE a.is_published = true
    AND (
      a.search_vector @@ websearch_to_tsquery('portuguese', search_query)
      OR a.title ILIKE '%' || search_query || '%'
      OR a.content ILIKE '%' || search_query || '%'
    )
  ORDER BY rank DESC
  LIMIT max_results;
$function$;

-- C2. count_searchbox_sessions_this_month — banner de custo do autocomplete (src/lib/mapboxCostGuard.ts) roda
-- para qualquer agente logado; a checagem exige sessao com perfil.
CREATE OR REPLACE FUNCTION public.count_searchbox_sessions_this_month()
RETURNS integer
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.secd_caller_ok(NULL, false) THEN
    RAISE EXCEPTION 'count_searchbox_sessions_this_month: chamador sem sessao de usuario'
      USING ERRCODE = '42501';
  END IF;
  RETURN (
    SELECT count(*)::integer
    FROM public.audit_logs
    WHERE action = 'searchbox_session'
      AND created_at >= date_trunc('month', now() AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'America/Sao_Paulo'
  );
END;
$function$;

-- C3. is_within_business_hours — selo da inbox (src/components/inbox/BusinessHoursBadge.tsx) roda para qualquer
-- agente logado; a checagem exige sessao com perfil.
CREATE OR REPLACE FUNCTION public.is_within_business_hours(connection_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_current_day INTEGER;
  v_current_time TIME;
  v_is_open BOOLEAN;
  v_open_at TIME;
  v_close_at TIME;
BEGIN
  IF NOT public.secd_caller_ok(NULL, false) THEN
    RAISE EXCEPTION 'is_within_business_hours: chamador sem sessao de usuario'
      USING ERRCODE = '42501';
  END IF;

  -- Get current day of week (0=Sunday) and time in Brazil timezone
  v_current_day := EXTRACT(DOW FROM now() AT TIME ZONE 'America/Sao_Paulo');
  v_current_time := (now() AT TIME ZONE 'America/Sao_Paulo')::TIME;

  -- Check business hours for this day
  SELECT bh.is_open, bh.open_time, bh.close_time
  INTO v_is_open, v_open_at, v_close_at
  FROM business_hours bh
  WHERE bh.whatsapp_connection_id = connection_id
  AND bh.day_of_week = v_current_day;

  -- If no configuration found, assume open (default behavior)
  IF NOT FOUND THEN
    RETURN true;
  END IF;

  -- If marked as closed
  IF NOT v_is_open THEN
    RETURN false;
  END IF;

  -- Check if current time is within open hours
  RETURN v_current_time >= v_open_at AND v_current_time <= v_close_at;
END;
$function$;

-- C4. talkx_engine_window_open — lida pela view security_invoker talkx_engine_health (sem leitor no app).
-- Nao levanta erro: responde false a quem nao e admin/supervisor, para a view seguir consultavel (fail-closed).
CREATE OR REPLACE FUNCTION public.talkx_engine_window_open(p_campaign_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_tz         text;
  v_start      time;
  v_end        time;
  v_bh_only    boolean;
  v_local      timestamp;
  v_min        integer;
  v_bh         jsonb;
  v_days       jsonb;
  v_bstart     text;
  v_bend       text;
  v_bstart_min integer;
  v_bend_min   integer;
  v_dow        integer;
BEGIN
  -- M-DB-05: a janela de envio de QUALQUER campanha nao e dado de agente.
  IF NOT public.secd_caller_ok(NULL, true) THEN
    RETURN false;
  END IF;

  SELECT COALESCE(NULLIF(c.schedule_timezone, ''), 'America/Sao_Paulo'),
         c.send_window_start,
         c.send_window_end,
         COALESCE(c.business_hours_only, false)
    INTO v_tz, v_start, v_end, v_bh_only
    FROM public.talkx_campaigns AS c
   WHERE c.id = p_campaign_id;
  IF NOT FOUND THEN
    RETURN false;
  END IF;

  v_local := (now() AT TIME ZONE v_tz);
  v_min := EXTRACT(hour FROM v_local)::integer * 60 + EXTRACT(minute FROM v_local)::integer;

  IF v_start IS NOT NULL AND v_end IS NOT NULL THEN
    IF v_min < EXTRACT(hour FROM v_start)::integer * 60 + EXTRACT(minute FROM v_start)::integer
       OR v_min >= EXTRACT(hour FROM v_end)::integer * 60 + EXTRACT(minute FROM v_end)::integer THEN
      RETURN false;
    END IF;
  END IF;

  IF v_bh_only THEN
    SELECT s.value INTO v_bh FROM public.talkx_settings AS s WHERE s.key = 'business_hours';
    v_days := COALESCE(v_bh -> 'days', '[1,2,3,4,5]'::jsonb);
    v_bstart := COALESCE(v_bh ->> 'start', '08:00');
    v_bend := COALESCE(v_bh ->> 'end', '18:00');
    v_dow := EXTRACT(dow FROM v_local)::integer;
    IF NOT (v_days @> to_jsonb(v_dow)) THEN
      RETURN false;
    END IF;
    v_bstart_min := split_part(v_bstart, ':', 1)::integer * 60 + split_part(v_bstart, ':', 2)::integer;
    v_bend_min := split_part(v_bend, ':', 1)::integer * 60 + split_part(v_bend, ':', 2)::integer;
    IF v_min < v_bstart_min OR v_min >= v_bend_min THEN
      RETURN false;
    END IF;
  END IF;

  RETURN true;
END;
$function$;
