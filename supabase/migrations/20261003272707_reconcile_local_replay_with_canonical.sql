-- Reconciliacao: faz a reconstrucao local das migrations chegar ao MESMO estado do banco canonico.
--
-- Medido em 04/10/2026 (Desktop/MAPA_ZAPP_V2/MAPA_BANCO_LOCAL.md): reaplicar as migrations do zero
-- produz um banco com 52 funcoes, 5 indices, 3 politicas, 1 coluna, 1 default, 1 constraint e
-- 1 trigger diferentes do canonico. A causa e historica: migrations que falham no replay
-- (replay-known-failures.json) e migrations cujo SQL executado difere do arquivo
-- (migration-evidence.json). O canonico e a fonte de verdade; este arquivo copia dele.
--
-- NO BANCO CANONICO ESTE ARQUIVO NAO MUDA NADA: toda funcao e recriada com o texto que ja esta la
-- (pg_get_functiondef), e todo o resto e condicional (IF NOT EXISTS / IF EXISTS / so quando difere).
-- Prova: schema-manifest.json regenerado depois do apply tem de ser identico ao commitado.

-- 1. Objetos fora de funcoes ---------------------------------------------------------------

create index if not exists idx_reminders_due_pending
  on public.reminders using btree (remind_at) where ((is_dismissed = false) and (notified_at is null));
create index if not exists idx_wc_is_default
  on public.whatsapp_connections using btree (is_default) where (is_default = true);
drop index if exists public.idx_team_conv_direct_member_b;
drop index if exists public.idx_team_msg_receipts_profile_id;

do $reconcile$
begin
  -- indice unico de conquistas: so recria quando o predicado nao e o do canonico
  if not exists (
    select 1 from pg_indexes
     where schemaname = 'public' and indexname = 'ux_agent_achievements_one_time'
       and indexdef like '%resolution\_milestone%'
  ) then
    drop index if exists public.ux_agent_achievements_one_time;
    create unique index ux_agent_achievements_one_time
      on public.agent_achievements using btree (profile_id, achievement_type)
      where (achievement_type <> all (array['daily_goal'::text, 'streak'::text, 'message_milestone'::text, 'resolution'::text, 'resolution_milestone'::text]));
  end if;

  -- team_conversations.metadata e NOT NULL no canonico
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'team_conversations'
       and column_name = 'metadata' and is_nullable = 'YES'
  ) then
    update public.team_conversations set metadata = '{}'::jsonb where metadata is null;
    alter table public.team_conversations alter column metadata set not null;
  end if;

  -- talkx_template_versions.category nao tem default no canonico
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'talkx_template_versions'
       and column_name = 'category' and column_default is not null
  ) then
    alter table public.talkx_template_versions alter column category drop default;
  end if;

  -- trigger de gamificacao: o canonico dispara em INSERT OR UPDATE OF agent_id
  if not exists (
    select 1 from pg_trigger
     where tgname = 'trg_gamification_on_message_sent' and tgrelid = 'public.messages'::regclass
       and pg_get_triggerdef(oid) like '%INSERT OR UPDATE OF agent_id%'
  ) then
    drop trigger if exists trg_gamification_on_message_sent on public.messages;
    create trigger trg_gamification_on_message_sent
      after insert or update of agent_id on public.messages
      for each row execute function public.handle_message_gamification();
  end if;

  -- politicas do Team Chat: o canonico nao tem UPDATE do remetente em team_messages,
  -- tem leitura de recibos por membro, e o INSERT de recibos e TO authenticated com current_profile_id()
  if not exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'team_message_receipts'
       and policyname = 'Members can insert own receipts' and roles = '{authenticated}'
  ) then
    drop policy if exists "Members can insert own receipts" on public.team_message_receipts;
    create policy "Members can insert own receipts" on public.team_message_receipts
      for insert to authenticated
      with check (
        (profile_id = public.current_profile_id())
        and exists (
          select 1
            from public.team_conversation_members mem
            join public.team_messages tm on tm.id = team_message_receipts.message_id
           where mem.conversation_id = tm.conversation_id
             and mem.profile_id = team_message_receipts.profile_id
        )
      );
  end if;

  if not exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'team_message_receipts'
       and policyname = 'Conversation members can read receipts'
  ) then
    create policy "Conversation members can read receipts" on public.team_message_receipts
      for select to authenticated
      using (
        public.is_admin_or_supervisor(auth.uid())
        or exists (
          select 1
            from public.team_conversation_members mem
            join public.team_messages tm on tm.id = team_message_receipts.message_id
           where mem.conversation_id = tm.conversation_id
             and mem.profile_id = public.current_profile_id()
        )
      );
  end if;
end
$reconcile$;

drop policy if exists "Senders can edit own messages" on public.team_messages;
alter table public.talkx_template_versions drop constraint if exists version_positive;

-- 2. Funcoes: texto identico ao do canonico (pg_get_functiondef em 04/10/2026) ---------------

-- accept_department_invite(p_code text)
CREATE OR REPLACE FUNCTION public.accept_department_invite(p_code text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_invite  public.department_invitations%ROWTYPE;
  v_profile_id uuid;
BEGIN
  v_profile_id := public.current_profile_id();
  IF v_profile_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;

  SELECT * INTO v_invite
  FROM public.department_invitations
  WHERE code = upper(trim(p_code))
    AND status = 'pending'
    AND (expires_at IS NULL OR expires_at > now())
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_or_expired_code');
  END IF;

  IF v_invite.use_count >= v_invite.max_uses THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invite_exhausted');
  END IF;

  UPDATE public.department_invitations
  SET
    use_count = use_count + 1,
    used_at   = CASE WHEN use_count + 1 >= max_uses THEN now() ELSE used_at END,
    used_by   = CASE WHEN use_count + 1 >= max_uses THEN v_profile_id ELSE used_by END,
    status    = CASE WHEN use_count + 1 >= max_uses THEN 'used' ELSE status END
  WHERE id = v_invite.id;

  UPDATE public.profiles
  SET department_id = v_invite.department_id
  WHERE id = v_profile_id;

  INSERT INTO public.department_audit_logs(department_id, action, profile_id, details)
  VALUES (
    v_invite.department_id,
    'accept_invite',
    v_profile_id,
    jsonb_build_object('code', v_invite.code, 'invite_id', v_invite.id)
  );

  RETURN jsonb_build_object('ok', true, 'department_id', v_invite.department_id);
END;
$function$;

-- add_agent_xp(p_profile_id uuid, p_xp integer)
CREATE OR REPLACE FUNCTION public.add_agent_xp(p_profile_id uuid, p_xp integer)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_row       agent_stats%ROWTYPE;
  v_new_xp    bigint;
  v_new_level int;
BEGIN
  IF auth.role() = 'anon' OR (
    auth.uid() IS NOT NULL AND NOT (
      p_profile_id IN (SELECT id FROM profiles WHERE user_id = auth.uid())
      OR is_admin_or_supervisor(auth.uid())
    )
  ) THEN
    RAISE EXCEPTION 'permission denied';
  END IF;

  IF p_xp <= 0 THEN
    RAISE EXCEPTION 'p_xp must be a positive integer, got %', p_xp;
  END IF;

  IF p_xp > 500 THEN
    RAISE EXCEPTION 'p_xp exceeds single-call maximum of 500, got %', p_xp;
  END IF;

  SELECT * INTO v_row FROM agent_stats WHERE profile_id = p_profile_id FOR UPDATE;
  IF NOT FOUND THEN RETURN NULL; END IF;

  v_new_xp    := v_row.xp + p_xp;
  v_new_level := GREATEST(1, FLOOR(SQRT(GREATEST(0, v_new_xp) / 50.0))::int + 1);

  UPDATE agent_stats
  SET xp = v_new_xp, level = v_new_level, updated_at = now()
  WHERE profile_id = p_profile_id;

  RETURN json_build_object(
    'newXp',         v_new_xp,
    'newLevel',      v_new_level,
    'previousLevel', v_row.level,
    'leveledUp',     v_new_level > v_row.level
  );
END;
$function$;

-- audit_role_changes()
CREATE OR REPLACE FUNCTION public.audit_role_changes()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ DECLARE v_actor jsonb; BEGIN v_actor := jsonb_build_object('actor_kind', CASE WHEN auth.uid() IS NOT NULL THEN 'jwt' ELSE 'service_role_or_direct_sql' END, 'actor_db_role', current_user, 'actor_app_name', NULLIF(current_setting('application_name', true), ''), 'actor_addr', COALESCE(host(inet_client_addr()), 'local')); IF TG_OP = 'INSERT' THEN INSERT INTO public.audit_logs(user_id, action, entity_type, entity_id, details) VALUES (auth.uid(), 'role_granted', 'user_roles', NEW.id, jsonb_build_object('user_id', NEW.user_id, 'role', NEW.role, 'granted_by', auth.uid()) || v_actor); ELSIF TG_OP = 'DELETE' THEN INSERT INTO public.audit_logs(user_id, action, entity_type, entity_id, details) VALUES (auth.uid(), 'role_revoked', 'user_roles', OLD.id, jsonb_build_object('user_id', OLD.user_id, 'role', OLD.role, 'revoked_by', auth.uid()) || v_actor); ELSIF TG_OP = 'UPDATE' THEN INSERT INTO public.audit_logs(user_id, action, entity_type, entity_id, details) VALUES (auth.uid(), 'role_changed', 'user_roles', NEW.id, jsonb_build_object('user_id', NEW.user_id, 'old_role', OLD.role, 'new_role', NEW.role, 'changed_by', auth.uid()) || v_actor); END IF; RETURN NULL; END; $function$;

-- auto_assign_to_queue_agent()
CREATE OR REPLACE FUNCTION public.auto_assign_to_queue_agent()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ DECLARE assigned_agent_id UUID; effective_queue_id UUID; BEGIN IF NEW.queue_id IS NULL AND NEW.assigned_to IS NULL THEN SELECT id INTO effective_queue_id FROM public.queues WHERE is_active = true ORDER BY priority ASC, created_at ASC LIMIT 1; IF effective_queue_id IS NOT NULL THEN NEW.queue_id := effective_queue_id; END IF; END IF; IF NEW.queue_id IS NOT NULL AND NEW.assigned_to IS NULL THEN SELECT qm.profile_id INTO assigned_agent_id FROM public.queue_members qm JOIN public.profiles p ON p.id = qm.profile_id JOIN public.user_roles ur ON ur.user_id = p.user_id WHERE qm.queue_id = NEW.queue_id AND qm.is_active = true AND p.is_active = true AND ur.role = 'agent' ORDER BY (SELECT COUNT(*) FROM public.contacts c WHERE c.assigned_to = qm.profile_id) ASC LIMIT 1; IF assigned_agent_id IS NOT NULL THEN NEW.assigned_to := assigned_agent_id; END IF; END IF; RETURN NEW; END; $function$;

-- bump_conversation_updated_at()
CREATE OR REPLACE FUNCTION public.bump_conversation_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE public.team_conversations
  SET updated_at = NEW.created_at
  WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$function$;

-- cleanup_expired_challenges()
CREATE OR REPLACE FUNCTION public.cleanup_expired_challenges()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Apenas service_role (webauthn edge) e postgres (cron) podem executar.
  -- Qualquer JWT authenticated bloqueado — não existe call site no front.
  IF (current_setting('request.jwt.claims', true)::jsonb->>'role') = 'authenticated' THEN
    RAISE EXCEPTION 'cleanup_expired_challenges: operacao restrita a service_role';
  END IF;
  DELETE FROM public.webauthn_challenges WHERE expires_at < now();
END;
$function$;

-- cleanup_link_preview_cache()
CREATE OR REPLACE FUNCTION public.cleanup_link_preview_cache()
 RETURNS TABLE(deleted_count integer, remaining_count integer, table_size_bytes bigint, duration_ms integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_start TIMESTAMPTZ := clock_timestamp();
  v_deleted INTEGER := 0;
  v_remaining INTEGER := 0;
  v_size BIGINT := 0;
  v_duration INTEGER := 0;
BEGIN
  -- Apenas cron (postgres) e service_role. Não existe call site no front.
  IF (current_setting('request.jwt.claims', true)::jsonb->>'role') = 'authenticated' THEN
    RAISE EXCEPTION 'cleanup_link_preview_cache: operacao restrita a service_role';
  END IF;
  WITH d AS (
    DELETE FROM public.link_preview_cache WHERE expires_at < now() RETURNING 1
  ) SELECT COUNT(*) INTO v_deleted FROM d;
  SELECT COUNT(*) INTO v_remaining FROM public.link_preview_cache;
  SELECT pg_total_relation_size('public.link_preview_cache') INTO v_size;
  v_duration := EXTRACT(MILLISECONDS FROM (clock_timestamp() - v_start))::INTEGER;
  INSERT INTO public.link_preview_cache_metrics(deleted_count, remaining_count, table_size_bytes, duration_ms)
  VALUES (v_deleted, v_remaining, v_size, v_duration);
  RETURN QUERY SELECT v_deleted, v_remaining, v_size, v_duration;
END;
$function$;

-- clear_login_attempts(p_email text)
CREATE OR REPLACE FUNCTION public.clear_login_attempts(p_email text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Guard: service_role/postgres/supabase_admin podem limpar qualquer email.
  -- authenticated so pode limpar o proprio email (via compare case-insensitive).
  -- cron (session_user='postgres') cai no primeiro ramo e passa.
  -- CORRIGIDO: ->>> nao existe; operador correto e ->>'email' (double arrow).
  IF NOT (
       coalesce(auth.role(), session_user)
         IN ('service_role', 'postgres', 'supabase_admin')
  )
  AND NOT (
       auth.role() = 'authenticated'
       AND LOWER(auth.jwt()->>'email') = LOWER(p_email)
  )
  THEN
    RAISE EXCEPTION 'clear_login_attempts: operacao nao autorizada para role=% email=%',
      coalesce(auth.role(),'none'), p_email;
  END IF;

  DELETE FROM public.login_attempts
  WHERE email = LOWER(p_email);
END;
$function$;

-- conversation_task_set_assignee()
CREATE OR REPLACE FUNCTION public.conversation_task_set_assignee()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$ BEGIN NEW.assigned_to := NEW.created_by; RETURN NEW; END; $function$;

-- conversation_task_state_trigger()
CREATE OR REPLACE FUNCTION public.conversation_task_state_trigger()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$ BEGIN IF NEW.status IS DISTINCT FROM OLD.status THEN NEW.status_changed_at := now(); IF NEW.status = 'doing' AND OLD.started_at IS NULL THEN NEW.started_at := now(); END IF; IF NEW.status IN ('done', 'cancelled') THEN NEW.completed_at := COALESCE(OLD.completed_at, now()); NEW.remind_at := NULL; NEW.notified_at := NULL; END IF; END IF; RETURN NEW; END; $function$;

-- create_department_invite(p_department_id uuid, p_max_uses integer, p_expires_hours integer)
CREATE OR REPLACE FUNCTION public.create_department_invite(p_department_id uuid, p_max_uses integer DEFAULT 1, p_expires_hours integer DEFAULT 72)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_profile_id uuid;
  v_is_admin   boolean;
  v_code       text;
  v_invite_id  uuid;
BEGIN
  v_profile_id := public.current_profile_id();
  IF v_profile_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;

  SELECT (role IN ('admin','supervisor')) INTO v_is_admin
  FROM public.profiles WHERE id = v_profile_id;

  IF NOT v_is_admin THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authorized');
  END IF;

  v_code := upper(substring(replace(encode(gen_random_bytes(9), 'base64'), '/', 'A'), 1, 12));

  INSERT INTO public.department_invitations(
    department_id, code, max_uses, expires_at, created_by, status
  ) VALUES (
    p_department_id,
    v_code,
    GREATEST(1, p_max_uses),
    now() + (p_expires_hours || ' hours')::interval,
    v_profile_id,
    'pending'
  )
  RETURNING id INTO v_invite_id;

  INSERT INTO public.department_audit_logs(department_id, action, profile_id, details)
  VALUES (p_department_id, 'create_invite', v_profile_id,
    jsonb_build_object('invite_id', v_invite_id, 'code', v_code, 'max_uses', p_max_uses));

  RETURN jsonb_build_object('ok', true, 'invite_id', v_invite_id, 'code', v_code);
END;
$function$;

-- current_profile_id()
CREATE OR REPLACE FUNCTION public.current_profile_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$ SELECT id FROM public.profiles WHERE user_id = auth.uid() LIMIT 1; $function$;

-- dashboard_kpi(p_since timestamp with time zone, p_queue uuid, p_agent uuid)
CREATE OR REPLACE FUNCTION public.dashboard_kpi(p_since timestamp with time zone DEFAULT (now() - '1 day'::interval), p_queue uuid DEFAULT NULL::uuid, p_agent uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
DECLARE
  v_today     date    := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_yesterday date    := (now() AT TIME ZONE 'America/Sao_Paulo')::date - 1;
  v_is_staff  boolean := public.is_admin_or_supervisor(auth.uid());
  v_result    jsonb;
BEGIN
  IF NOT v_is_staff THEN
    p_agent := public.get_profile_id_for_user(auth.uid());
  END IF;

  WITH closures AS (
    SELECT
      (cc.created_at AT TIME ZONE 'America/Sao_Paulo')::date AS day,
      extract(hour FROM cc.created_at AT TIME ZONE 'America/Sao_Paulo')::int AS hour,
      cc.contact_id
    FROM public.conversation_closures cc
    JOIN public.contacts ct ON ct.id = cc.contact_id
    WHERE (p_since IS NULL OR cc.created_at >= p_since)
      AND (p_queue IS NULL OR ct.queue_id = p_queue)
      AND ((v_is_staff AND p_agent IS NULL) OR ct.assigned_to = p_agent)
  ),
  sla_rows AS (
    SELECT
      (cs.first_message_at AT TIME ZONE 'America/Sao_Paulo')::date AS day,
      extract(hour FROM cs.first_message_at AT TIME ZONE 'America/Sao_Paulo')::int AS hour,
      cs.first_response_at,
      extract(epoch FROM (cs.first_response_at - cs.first_message_at)) AS response_seconds,
      cs.first_response_breached
    FROM public.conversation_sla cs
    JOIN public.contacts ct ON ct.id = cs.contact_id
    WHERE (p_since IS NULL OR cs.first_message_at >= p_since)
      AND (p_queue IS NULL OR ct.queue_id = p_queue)
      AND ((v_is_staff AND p_agent IS NULL) OR ct.assigned_to = p_agent)
  ),
  resolved_hourly AS (
    SELECT least(7, hour / 3) AS bucket, count(*) AS c
    FROM closures WHERE day = v_today GROUP BY 1
  ),
  answered_today AS (
    SELECT response_seconds
    FROM sla_rows
    WHERE day = v_today AND first_response_at IS NOT NULL
  ),
  answered_yesterday AS (
    SELECT response_seconds
    FROM sla_rows
    WHERE day = v_yesterday AND first_response_at IS NOT NULL
  ),
  response_hourly AS (
    SELECT least(7, hour / 3) AS bucket, avg(response_seconds) AS avg_s
    FROM sla_rows
    WHERE day = v_today AND first_response_at IS NOT NULL
    GROUP BY 1
  )
  SELECT jsonb_build_object(
    'resolvedToday',        (SELECT count(DISTINCT contact_id) FROM closures WHERE day = v_today),
    'resolvedYesterday',    (SELECT count(DISTINCT contact_id) FROM closures WHERE day = v_yesterday),
    'resolvedHourly8',      (SELECT jsonb_agg(coalesce(rh.c, 0) ORDER BY g.b)
                              FROM generate_series(0, 7) g(b)
                              LEFT JOIN resolved_hourly rh ON rh.bucket = g.b),
    'avgResponseToday',     (SELECT round(percentile_cont(0.5) WITHIN GROUP (ORDER BY response_seconds))::int
                              FROM answered_today),
    'avgResponseYesterday', (SELECT round(percentile_cont(0.5) WITHIN GROUP (ORDER BY response_seconds))::int
                              FROM answered_yesterday),
    'p90ResponseToday',     (SELECT round(percentile_cont(0.9) WITHIN GROUP (ORDER BY response_seconds))::int
                              FROM answered_today),
    'responseHourly8',      (SELECT jsonb_agg(round(coalesce(rh.avg_s, 0))::int ORDER BY g.b)
                              FROM generate_series(0, 7) g(b)
                              LEFT JOIN response_hourly rh ON rh.bucket = g.b),
    'slaBreachedToday',     (SELECT count(*) FROM sla_rows WHERE day = v_today AND first_response_breached IS TRUE),
    'answeredTodayCount',   (SELECT count(*) FROM answered_today),
    'answeredYesterdayCount', (SELECT count(*) FROM answered_yesterday)
  ) INTO v_result;

  RETURN v_result;
END;
$function$;

-- dashboard_leaderboard(p_period text, p_limit integer)
CREATE OR REPLACE FUNCTION public.dashboard_leaderboard(p_period text DEFAULT 'week'::text, p_limit integer DEFAULT 10)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
DECLARE
  v_since  timestamptz;
  v_result jsonb;
BEGIN
  IF NOT public.is_admin_or_supervisor(auth.uid()) THEN
    RETURN '[]'::jsonb;
  END IF;

  v_since := CASE p_period
    WHEN 'today' THEN date_trunc('day', now() AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'America/Sao_Paulo'
    WHEN 'month' THEN (date_trunc('day', now() AT TIME ZONE 'America/Sao_Paulo') - interval '29 days') AT TIME ZONE 'America/Sao_Paulo'
    WHEN 'all'   THEN '-infinity'::timestamptz
    ELSE              (date_trunc('day', now() AT TIME ZONE 'America/Sao_Paulo') - interval '6 days') AT TIME ZONE 'America/Sao_Paulo'
  END;

  WITH xp_period AS MATERIALIZED (
    SELECT profile_id,
           coalesce(sum(xp_earned), 0) AS xp,
           count(*) FILTER (WHERE achievement_type = 'resolution') AS resolved
    FROM public.agent_achievements
    WHERE earned_at >= v_since
    GROUP BY profile_id
  ),
  messages_period AS MATERIALIZED (
    SELECT agent_id AS profile_id, count(*) AS messages_handled
    FROM public.messages
    WHERE created_at >= v_since AND sender = 'agent' AND agent_id IS NOT NULL
    GROUP BY agent_id
  ),
  response_period AS MATERIALIZED (
    SELECT ct.assigned_to AS profile_id,
           percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM (cs.first_response_at - cs.first_message_at))) AS median_response_seconds
    FROM public.conversation_sla cs
    JOIN public.contacts ct ON ct.id = cs.contact_id
    WHERE cs.first_message_at >= v_since AND cs.first_response_at IS NOT NULL AND ct.assigned_to IS NOT NULL
    GROUP BY ct.assigned_to
  ),
  csat_period AS MATERIALIZED (
    SELECT agent_id AS profile_id,
           (count(*) FILTER (WHERE rating >= 4))::numeric / count(*) * 100 AS csat_percent
    FROM public.csat_surveys
    WHERE created_at >= v_since AND agent_id IS NOT NULL
    GROUP BY agent_id
  ),
  ranked AS (
    SELECT
      ast.profile_id,
      p.name,
      p.avatar_url AS avatar,
      p.is_active AS is_online,
      ast.level,
      ast.current_streak AS streak,
      ast.achievements_count,
      coalesce(x.xp, 0) AS xp,
      coalesce(x.resolved, 0) AS conversations_resolved,
      coalesce(m.messages_handled, 0) AS messages_handled,
      coalesce(round(r.median_response_seconds)::int, 0) AS avg_response_time,
      coalesce(round(c.csat_percent)::int, 0) AS satisfaction
    FROM public.agent_stats ast
    JOIN public.profiles p ON p.id = ast.profile_id
    LEFT JOIN xp_period x ON x.profile_id = ast.profile_id
    LEFT JOIN messages_period m ON m.profile_id = ast.profile_id
    LEFT JOIN response_period r ON r.profile_id = ast.profile_id
    LEFT JOIN csat_period c ON c.profile_id = ast.profile_id
  )
  SELECT coalesce(jsonb_agg(t), '[]'::jsonb) INTO v_result
  FROM (
    SELECT *, row_number() OVER (ORDER BY xp DESC, conversations_resolved DESC) AS rank
    FROM ranked
    ORDER BY xp DESC, conversations_resolved DESC
    LIMIT p_limit
  ) t;

  RETURN v_result;
END;
$function$;

-- department_audit_logs_fill_profile_name()
CREATE OR REPLACE FUNCTION public.department_audit_logs_fill_profile_name()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.profile_id IS NOT NULL AND NEW.profile_name IS NULL THEN
    SELECT name INTO NEW.profile_name FROM public.profiles WHERE id = NEW.profile_id;
  END IF;
  RETURN NEW;
END;
$function$;

-- find_or_create_direct_conversation(other_profile_id uuid)
CREATE OR REPLACE FUNCTION public.find_or_create_direct_conversation(other_profile_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_my_profile_id uuid;
  v_conv_id uuid;
BEGIN
  v_my_profile_id := public.current_profile_id();
  IF v_my_profile_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;
  IF v_my_profile_id = other_profile_id THEN
    RAISE EXCEPTION 'cannot_create_direct_with_self';
  END IF;
  SELECT c.id INTO v_conv_id
  FROM public.team_conversations c
  JOIN public.team_conversation_members m1 ON m1.conversation_id = c.id AND m1.profile_id = v_my_profile_id
  JOIN public.team_conversation_members m2 ON m2.conversation_id = c.id AND m2.profile_id = other_profile_id
  WHERE c.type = 'direct'
  LIMIT 1;
  IF v_conv_id IS NOT NULL THEN
    RETURN v_conv_id;
  END IF;
  INSERT INTO public.team_conversations(type, created_by)
  VALUES ('direct', v_my_profile_id)
  RETURNING id INTO v_conv_id;
  INSERT INTO public.team_conversation_members(conversation_id, profile_id)
  VALUES (v_conv_id, v_my_profile_id), (v_conv_id, other_profile_id);
  RETURN v_conv_id;
END;
$function$;

-- get_connection_instance(_connection_id uuid)
CREATE OR REPLACE FUNCTION public.get_connection_instance(_connection_id uuid)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT instance_id FROM public.whatsapp_connections
  WHERE id = _connection_id
    AND (
      created_by = public.get_profile_id_for_user(auth.uid())
      OR public.is_admin_or_supervisor(auth.uid())
    );
$function$;

-- get_connection_qr_code(_connection_id uuid)
CREATE OR REPLACE FUNCTION public.get_connection_qr_code(_connection_id uuid)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT qr_code FROM public.whatsapp_connections
  WHERE id = _connection_id
    AND (
      created_by = public.get_profile_id_for_user(auth.uid())
      OR public.is_admin_or_supervisor(auth.uid())
    );
$function$;

-- get_department_whatsapp_api_key(p_department_id uuid)
CREATE OR REPLACE FUNCTION public.get_department_whatsapp_api_key(p_department_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_key text;
BEGIN
  IF current_setting('request.jwt.claims', true)::jsonb ->> 'role' <> 'service_role' THEN
    RAISE EXCEPTION 'access_denied';
  END IF;
  SELECT whatsapp_api_key INTO v_key FROM public.departments WHERE id = p_department_id;
  RETURN v_key;
END;
$function$;

-- get_department_whatsapp_credentials(p_department_id uuid)
CREATE OR REPLACE FUNCTION public.get_department_whatsapp_credentials(p_department_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_row public.departments%ROWTYPE;
BEGIN
  IF current_setting('request.jwt.claims', true)::jsonb ->> 'role' <> 'service_role' THEN
    RAISE EXCEPTION 'access_denied';
  END IF;
  SELECT * INTO v_row FROM public.departments WHERE id = p_department_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  RETURN jsonb_build_object(
    'whatsapp_mode',        v_row.whatsapp_mode,
    'whatsapp_api_key',     v_row.whatsapp_api_key,
    'whatsapp_instance_id', v_row.whatsapp_instance_id
  );
END;
$function$;

-- get_gmail_tokens(p_account_id uuid)
CREATE OR REPLACE FUNCTION public.get_gmail_tokens(p_account_id uuid)
 RETURNS TABLE(access_token text, refresh_token text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  SELECT
    public.decrypt_gmail_token(a.access_token_encrypted),
    public.decrypt_gmail_token(a.refresh_token_encrypted)
  FROM public.gmail_accounts a
  WHERE a.id = p_account_id;
END;
$function$;

-- get_team_conversation_previews()
CREATE OR REPLACE FUNCTION public.get_team_conversation_previews()
 RETURNS TABLE(conversation_id uuid, last_message_id uuid, last_message_content text, last_message_type text, last_message_sender_id uuid, last_message_created_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    tc.id AS conversation_id,
    lm.id AS last_message_id,
    lm.content AS last_message_content,
    lm.message_type AS last_message_type,
    lm.sender_id AS last_message_sender_id,
    lm.created_at AS last_message_created_at
  FROM public.team_conversations tc
  JOIN public.team_conversation_members mem
    ON mem.conversation_id = tc.id
   AND mem.profile_id = (SELECT id FROM public.profiles WHERE user_id = auth.uid())
  LEFT JOIN LATERAL (
    SELECT id, content, message_type, sender_id, created_at
    FROM public.team_messages
    WHERE conversation_id = tc.id
    ORDER BY created_at DESC
    LIMIT 1
  ) lm ON true;
$function$;

-- get_team_inbox()
CREATE OR REPLACE FUNCTION public.get_team_inbox()
 RETURNS TABLE(conversation_id uuid, conversation_type text, conversation_name text, department_id uuid, last_message_at timestamp with time zone, last_message_text text, last_sender_id uuid, unread_count bigint, is_muted boolean, member_count bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_profile_id uuid := public.current_profile_id();
BEGIN
  IF v_profile_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  RETURN QUERY
  SELECT
    c.id,
    c.type,
    c.name,
    c.department_id,
    c.updated_at,
    lm.content,
    lm.sender_id,
    COALESCE(unread.cnt, 0)::bigint,
    COALESCE(m.is_muted, false),
    COALESCE(mc.cnt, 0)::bigint
  FROM public.team_conversations c
  JOIN public.team_conversation_members m
    ON m.conversation_id = c.id AND m.profile_id = v_profile_id
  LEFT JOIN LATERAL (
    SELECT msg.content, msg.sender_id
      FROM public.team_messages msg
     WHERE msg.conversation_id = c.id
     ORDER BY msg.created_at DESC
     LIMIT 1
  ) lm ON true
  LEFT JOIN LATERAL (
    SELECT count(*) AS cnt
      FROM public.team_messages msg
     WHERE msg.conversation_id = c.id
       AND msg.sender_id <> v_profile_id
       AND NOT EXISTS (
         SELECT 1 FROM public.team_message_receipts r
          WHERE r.message_id = msg.id
            AND r.profile_id = v_profile_id
            AND r.status = 'read'
       )
  ) unread ON true
  LEFT JOIN LATERAL (
    SELECT count(*) AS cnt
      FROM public.team_conversation_members mc2
     WHERE mc2.conversation_id = c.id
  ) mc ON true
  ORDER BY c.updated_at DESC NULLS LAST;
END;
$function$;

-- get_team_profiles()
CREATE OR REPLACE FUNCTION public.get_team_profiles()
 RETURNS TABLE(id uuid, user_id uuid, name text, email text, avatar_url text, role text, is_active boolean, department text, job_title text, phone text, max_chats integer, created_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    p.id, p.user_id, p.name,
    CASE WHEN public.is_admin(auth.uid()) THEN p.email ELSE NULL END AS email,
    p.avatar_url, p.role,
    p.is_active, p.department, p.job_title,
    CASE WHEN public.is_admin(auth.uid()) THEN p.phone ELSE NULL END AS phone,
    p.max_chats, p.created_at
  FROM public.profiles p
  WHERE p.is_active = true;
$function$;

-- get_team_unread_counts()
CREATE OR REPLACE FUNCTION public.get_team_unread_counts()
 RETURNS TABLE(conversation_id uuid, unread_count bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    m.conversation_id,
    count(*) AS unread_count
  FROM public.team_messages m
  JOIN public.team_conversation_members mem
    ON mem.conversation_id = m.conversation_id
  WHERE
    mem.profile_id = (SELECT id FROM public.profiles WHERE user_id = auth.uid())
    AND (mem.last_read_at IS NULL OR m.created_at > mem.last_read_at)
    AND m.sender_id <> (SELECT id FROM public.profiles WHERE user_id = auth.uid())
  GROUP BY m.conversation_id;
$function$;

-- handle_conversation_closure_gamification()
CREATE OR REPLACE FUNCTION public.handle_conversation_closure_gamification()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_resolved  bigint;   -- era int (mudado para consistência com agent_stats.conversations_resolved)
BEGIN
  -- Para UPDATE: só contar quando closed_by muda de NULL para NOT NULL
  IF TG_OP = 'UPDATE' AND (OLD.closed_by IS NOT NULL OR NEW.closed_by IS NULL) THEN
    RETURN NEW;
  END IF;

  IF NEW.closed_by IS NOT NULL THEN
    INSERT INTO public.agent_stats (
      profile_id, messages_sent, messages_received,
      conversations_resolved, current_streak, best_streak, updated_at
    )
    VALUES (NEW.closed_by, 0, 0, 1, 0, 0, now())
    ON CONFLICT (profile_id) DO UPDATE
    SET conversations_resolved = public.agent_stats.conversations_resolved + 1,
        updated_at              = now()
    RETURNING conversations_resolved INTO v_resolved;

    IF v_resolved = ANY (ARRAY[1, 10, 50, 100, 500]) THEN
      PERFORM public.grant_agent_achievement(
        NEW.closed_by,
        'resolution_milestone',
        v_resolved || ' Conversas Encerradas',
        'Você encerrou ' || v_resolved || ' conversas!',
        LEAST(100, v_resolved)
      );
    END IF;
  END IF;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Gamificação NUNCA pode reverter fechamento de conversa
  RAISE WARNING 'gamification error in handle_conversation_closure_gamification (closure_id=%): % [%]',
    NEW.id, SQLERRM, SQLSTATE;
  RETURN NEW;
END;
$function$;

-- handle_message_gamification()
CREATE OR REPLACE FUNCTION public.handle_message_gamification()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_new_sent  int;
  v_received  int;
  v_total     int;
  v_agent_id  uuid;
BEGIN
  IF TG_OP = 'UPDATE' AND (OLD.agent_id IS NOT NULL OR NEW.agent_id IS NULL) THEN
    RETURN NEW;
  END IF;
  IF NEW.sender = 'agent' AND NEW.agent_id IS NOT NULL THEN
    INSERT INTO public.agent_stats (profile_id, messages_sent, messages_received, current_streak, best_streak, updated_at)
    VALUES (NEW.agent_id, 1, 0, 1, 1, now())
    ON CONFLICT (profile_id) DO UPDATE
    SET messages_sent  = public.agent_stats.messages_sent + 1,
        current_streak = public.agent_stats.current_streak + 1,
        best_streak    = GREATEST(public.agent_stats.best_streak, public.agent_stats.current_streak + 1),
        updated_at     = now()
    RETURNING messages_sent, messages_received INTO v_new_sent, v_received;
    v_total := v_new_sent + v_received;
    IF v_total = ANY (ARRAY[10, 50, 100, 500, 1000]) THEN
      PERFORM public.grant_agent_achievement(
        NEW.agent_id, 'message_milestone', v_total || ' Mensagens',
        'Você enviou/recebeu ' || v_total || ' mensagens!',
        LEAST(100, v_total / 10)
      );
    END IF;
  ELSIF NEW.sender = 'contact' THEN
    SELECT assigned_to INTO v_agent_id FROM public.contacts WHERE id = NEW.contact_id;
    IF v_agent_id IS NOT NULL THEN
      INSERT INTO public.agent_stats (profile_id, messages_sent, messages_received, current_streak, best_streak, updated_at)
      VALUES (v_agent_id, 0, 1, 0, 0, now())
      ON CONFLICT (profile_id) DO UPDATE
      SET messages_received = public.agent_stats.messages_received + 1,
          updated_at        = now()
      RETURNING messages_sent, messages_received INTO v_new_sent, v_received;
      v_total := v_new_sent + v_received;
      IF v_total = ANY (ARRAY[10, 50, 100, 500, 1000]) THEN
        PERFORM public.grant_agent_achievement(
          v_agent_id, 'message_milestone', v_total || ' Mensagens',
          'Você enviou/recebeu ' || v_total || ' mensagens!',
          LEAST(100, v_total / 10)
        );
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

-- increment_agent_messages(p_profile_id uuid, p_type text)
CREATE OR REPLACE FUNCTION public.increment_agent_messages(p_profile_id uuid, p_type text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_row         agent_stats%ROWTYPE;
  v_new_sent    bigint;
  v_new_recv    bigint;
BEGIN
  IF auth.role() = 'anon' OR (
    auth.uid() IS NOT NULL AND NOT (
      p_profile_id IN (SELECT id FROM profiles WHERE user_id = auth.uid())
      OR is_admin_or_supervisor(auth.uid())
    )
  ) THEN
    RAISE EXCEPTION 'permission denied';
  END IF;

  p_type := lower(p_type);
  IF p_type NOT IN ('sent', 'received') THEN
    RAISE EXCEPTION 'p_type must be ''sent'' or ''received'', got %', p_type;
  END IF;

  SELECT * INTO v_row FROM agent_stats WHERE profile_id = p_profile_id FOR UPDATE;
  IF NOT FOUND THEN RETURN NULL; END IF;

  v_new_sent := COALESCE(v_row.messages_sent, 0);
  v_new_recv := COALESCE(v_row.messages_received, 0);

  IF p_type = 'sent' THEN
    v_new_sent := v_new_sent + 1;
  ELSE
    v_new_recv := v_new_recv + 1;
  END IF;

  UPDATE agent_stats
  SET messages_sent     = v_new_sent,
      messages_received = v_new_recv,
      updated_at        = now()
  WHERE profile_id = p_profile_id;

  RETURN json_build_object('newSent', v_new_sent, 'newReceived', v_new_recv);
END;
$function$;

-- increment_agent_resolutions(p_profile_id uuid)
CREATE OR REPLACE FUNCTION public.increment_agent_resolutions(p_profile_id uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_row agent_stats%ROWTYPE;
BEGIN
  IF auth.role() = 'anon'
     OR (auth.role() = 'authenticated' AND NOT (
           p_profile_id IN (SELECT id FROM profiles WHERE user_id = auth.uid())
           OR is_admin_or_supervisor(auth.uid())
         ))
  THEN RAISE EXCEPTION 'permission denied'; END IF;
  SELECT * INTO v_row FROM agent_stats WHERE profile_id = p_profile_id FOR UPDATE;
  IF NOT FOUND THEN RETURN NULL; END IF;
  UPDATE agent_stats SET conversations_resolved = conversations_resolved + 1, updated_at = now() WHERE profile_id = p_profile_id;
  RETURN json_build_object('newResolutions', v_row.conversations_resolved + 1);
END; $function$;

-- leave_team_group(p_conversation_id uuid)
CREATE OR REPLACE FUNCTION public.leave_team_group(p_conversation_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_profile_id  uuid := public.current_profile_id();
  v_conv        RECORD;
  v_role        text;
  v_owner_count int;
  v_total_count int;
  v_next_owner  uuid;
BEGIN
  IF v_profile_id IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;

  SELECT id, type, created_by INTO v_conv
  FROM public.team_conversations WHERE id = p_conversation_id FOR UPDATE;
  IF v_conv.id IS NULL THEN RAISE EXCEPTION 'conversation_not_found'; END IF;
  IF v_conv.type NOT IN ('group','department') THEN RAISE EXCEPTION 'not_a_group_conversation'; END IF;

  SELECT tcm.role INTO v_role
  FROM public.team_conversation_members tcm
  WHERE tcm.conversation_id = p_conversation_id AND tcm.profile_id = v_profile_id;
  IF v_role IS NULL THEN RAISE EXCEPTION 'not_a_member'; END IF;

  SELECT
    COUNT(*) FILTER (WHERE tcm.role = 'owner') AS owners,
    COUNT(*) AS total
  INTO v_owner_count, v_total_count
  FROM public.team_conversation_members tcm
  WHERE tcm.conversation_id = p_conversation_id;

  IF v_role = 'owner' AND v_owner_count = 1 AND v_total_count > 1 THEN
    SELECT tcm.profile_id INTO v_next_owner
    FROM public.team_conversation_members tcm
    WHERE tcm.conversation_id = p_conversation_id AND tcm.profile_id <> v_profile_id
    ORDER BY tcm.joined_at ASC LIMIT 1;
    UPDATE public.team_conversation_members
      SET role = 'owner'
      WHERE conversation_id = p_conversation_id AND profile_id = v_next_owner;
  END IF;

  DELETE FROM public.team_conversation_members
  WHERE conversation_id = p_conversation_id AND profile_id = v_profile_id;

  IF v_total_count = 1 THEN
    DELETE FROM public.team_conversations WHERE id = p_conversation_id;
    RETURN jsonb_build_object('ok',true,'left',true,'group_deleted',true,'conversation_id',p_conversation_id);
  END IF;

  RETURN jsonb_build_object('ok',true,'left',true,'group_deleted',false,'new_owner',v_next_owner,'conversation_id',p_conversation_id);
END;
$function$;

-- log_audit_event(p_action text, p_entity_type text, p_entity_id text, p_details jsonb, p_user_agent text)
CREATE OR REPLACE FUNCTION public.log_audit_event(p_action text, p_entity_type text DEFAULT NULL::text, p_entity_id text DEFAULT NULL::text, p_details jsonb DEFAULT NULL::jsonb, p_user_agent text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid;
  v_entity_id_uuid uuid;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN;
  END IF;

  -- Converter p_entity_id (text) para uuid com tratamento de valor invalido.
  -- A coluna audit_logs.entity_id e uuid; passar text diretamente causava
  -- "column entity_id is of type uuid but expression is of type text".
  IF p_entity_id IS NOT NULL AND p_entity_id <> '' THEN
    BEGIN
      v_entity_id_uuid := p_entity_id::uuid;
    EXCEPTION WHEN invalid_text_representation THEN
      v_entity_id_uuid := NULL;
    END;
  END IF;

  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, details, user_agent)
  VALUES (v_user_id, p_action, p_entity_type, v_entity_id_uuid, p_details, p_user_agent);
END;
$function$;

-- mcp_exec(sql text, max_rows integer)
CREATE OR REPLACE FUNCTION public.mcp_exec(sql text, max_rows integer DEFAULT 200)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  q text := regexp_replace(sql, '[;\s]+$', '');
  lim int := greatest(coalesce(max_rows, 200), 0);
  rec record; rows jsonb := '[]'::jsonb; n int := 0; affected bigint; t0 timestamptz := clock_timestamp();
begin
  begin
    for rec in execute q loop
      n := n + 1;
      if n <= lim then rows := rows || to_jsonb(rec); end if;
    end loop;
    return jsonb_build_object('rows', rows, 'row_count', n, 'truncated', n > lim, 'ms', round(extract(epoch from clock_timestamp()-t0)*1000));
  exception
    when query_canceled or lock_not_available then raise;
    when others then null;
  end;
  execute q;
  get diagnostics affected = row_count;
  return jsonb_build_object('ok', true, 'rows_affected', affected, 'ms', round(extract(epoch from clock_timestamp()-t0)*1000));
end
$function$;

-- mcp_exec_many(statements text[], max_rows integer)
CREATE OR REPLACE FUNCTION public.mcp_exec_many(statements text[], max_rows integer DEFAULT 100)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare i int; n int := coalesce(array_length(statements, 1), 0); res jsonb := '[]'::jsonb; t0 timestamptz := clock_timestamp();
begin
  for i in 1 .. n loop
    res := res || jsonb_build_object('i', i, 'sql', left(statements[i], 200), 'result', public.mcp_exec(statements[i], max_rows));
  end loop;
  return jsonb_build_object('ok', true, 'count', n, 'results', res, 'ms', round(extract(epoch from clock_timestamp()-t0)*1000));
end $function$;

-- prevent_conversation_task_field_forgery()
CREATE OR REPLACE FUNCTION public.prevent_conversation_task_field_forgery()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$ BEGIN IF NEW.contact_id IS DISTINCT FROM OLD.contact_id AND NEW.contact_id IS NOT NULL AND NOT is_contact_visible_to_user(NEW.contact_id, auth.uid()) THEN RAISE EXCEPTION 'Sem permissao para atribuir este contato a task'; END IF; IF (NEW.assigned_to IS DISTINCT FROM OLD.assigned_to OR NEW.created_by IS DISTINCT FROM OLD.created_by) AND NOT is_admin_or_supervisor(auth.uid()) THEN RAISE EXCEPTION 'Sem permissao para alterar responsavel ou criador da task'; END IF; RETURN NEW; END; $function$;

-- reassign_overloaded_agents()
CREATE OR REPLACE FUNCTION public.reassign_overloaded_agents()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_overloaded RECORD;
  v_new_agent UUID;
  v_reassigned INTEGER := 0;
  v_contact RECORD;
BEGIN
  -- Apenas admin/supervisor (ou service_role/cron). Agentes comuns bloqueados.
  IF (current_setting('request.jwt.claims', true)::jsonb->>'role') = 'authenticated'
     AND NOT public.is_admin_or_supervisor(auth.uid()) THEN
    RAISE EXCEPTION 'reassign_overloaded_agents: requer perfil admin ou supervisor';
  END IF;
  FOR v_overloaded IN
    SELECT p.id AS agent_id, p.max_chats, COUNT(c.id) AS current_chats
    FROM profiles p JOIN contacts c ON c.assigned_to = p.id
    WHERE p.is_active = true AND p.max_chats IS NOT NULL AND p.max_chats > 0
    GROUP BY p.id, p.max_chats HAVING COUNT(c.id) > p.max_chats
  LOOP
    FOR v_contact IN
      SELECT c.id, c.queue_id FROM contacts c WHERE c.assigned_to = v_overloaded.agent_id
      ORDER BY c.updated_at ASC LIMIT (v_overloaded.current_chats - v_overloaded.max_chats)
    LOOP
      SELECT qm.profile_id INTO v_new_agent
      FROM queue_members qm JOIN profiles p ON p.id = qm.profile_id
      WHERE (v_contact.queue_id IS NULL OR qm.queue_id = v_contact.queue_id)
        AND qm.is_active = true AND p.is_active = true AND p.id != v_overloaded.agent_id
        AND (p.max_chats IS NULL OR (SELECT COUNT(*) FROM contacts cc WHERE cc.assigned_to = p.id) < p.max_chats)
      ORDER BY (SELECT COUNT(*) FROM contacts cc WHERE cc.assigned_to = qm.profile_id) ASC LIMIT 1;
      IF v_new_agent IS NOT NULL THEN
        UPDATE contacts SET assigned_to = v_new_agent WHERE id = v_contact.id;
        INSERT INTO conversation_events (contact_id, event_type, from_agent_id, to_agent_id, metadata)
        VALUES (v_contact.id, 'overload_reassign', v_overloaded.agent_id, v_new_agent,
                jsonb_build_object('reason', 'max_chats_exceeded', 'max_chats', v_overloaded.max_chats));
        v_reassigned := v_reassigned + 1;
      END IF;
    END LOOP;
  END LOOP;
  RETURN v_reassigned;
END;
$function$;

-- record_failed_login(p_email text, p_ip_address text, p_user_agent text)
CREATE OR REPLACE FUNCTION public.record_failed_login(p_email text, p_ip_address text DEFAULT NULL::text, p_user_agent text DEFAULT NULL::text)
 RETURNS TABLE(is_locked boolean, locked_until timestamp with time zone, attempts integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_new_count     INTEGER;
  v_locked_until  TIMESTAMP WITH TIME ZONE;
  v_max_attempts  CONSTANT INTEGER := 5;
BEGIN
  INSERT INTO public.login_attempts AS la (
    email, ip_address, user_agent, attempt_count, last_attempt_at, updated_at
  ) VALUES (
    LOWER(p_email), p_ip_address, p_user_agent, 1, now(), now()
  )
  ON CONFLICT (email) DO UPDATE
    SET attempt_count = CASE
          WHEN la.locked_until IS NOT NULL AND la.locked_until > now()
            THEN la.attempt_count
          WHEN la.locked_until IS NOT NULL AND la.locked_until <= now()
            THEN 1
          ELSE LEAST(la.attempt_count + 1, 10000)
        END,
        locked_until = CASE
          WHEN la.locked_until IS NOT NULL AND la.locked_until <= now()
            THEN NULL
          ELSE la.locked_until
        END,
        last_attempt_at = now(),
        ip_address      = COALESCE(EXCLUDED.ip_address, la.ip_address),
        user_agent      = COALESCE(EXCLUDED.user_agent, la.user_agent),
        updated_at      = now()
  RETURNING la.attempt_count, la.locked_until
  INTO v_new_count, v_locked_until;

  IF v_locked_until IS NULL AND v_new_count >= v_max_attempts THEN
    v_locked_until := now() + (
      POWER(2, LEAST(v_new_count - v_max_attempts, 10))::INTEGER * INTERVAL '1 minute'
    );
    UPDATE public.login_attempts
    SET locked_until = v_locked_until,
        updated_at   = now()
    WHERE email = LOWER(p_email);
  END IF;

  RETURN QUERY SELECT
    (v_locked_until IS NOT NULL AND v_locked_until > now()),
    v_locked_until,
    v_new_count;
END;
$function$;

-- record_multiplix_recipient_sent(p_recipient_id uuid, p_claim_token uuid, p_external_id text)
CREATE OR REPLACE FUNCTION public.record_multiplix_recipient_sent(p_recipient_id uuid, p_claim_token uuid, p_external_id text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_dispatch_id uuid;
  v_external_id text := NULLIF(btrim(p_external_id), '');
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'service_role_required' USING ERRCODE = '42501';
  END IF;
  IF p_recipient_id IS NULL OR p_claim_token IS NULL
     OR v_external_id IS NULL OR length(v_external_id) > 512 THEN
    RAISE EXCEPTION 'invalid_multiplix_delivery_receipt' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(v_external_id, 0));
  IF EXISTS (
    SELECT 1
    FROM public.multiplix_recipients AS duplicate
    WHERE duplicate.external_id = v_external_id
      AND duplicate.id <> p_recipient_id
  ) THEN
    RAISE EXCEPTION 'multiplix_provider_receipt_already_recorded' USING ERRCODE = '23505';
  END IF;

  UPDATE public.multiplix_recipients AS recipient
     SET status = 'sent',
         sent_at = statement_timestamp(),
         external_id = v_external_id,
         error_message = NULL,
         delivery_claim_token = NULL,
         delivery_claimed_at = NULL,
         delivery_claim_expires_at = NULL,
         delivery_claimed_by = NULL,
         updated_at = statement_timestamp()
   WHERE recipient.id = p_recipient_id
     AND recipient.status = 'sending'
     AND recipient.delivery_claim_token = p_claim_token
     AND recipient.provider_dispatch_started_at IS NOT NULL
  RETURNING recipient.dispatch_id INTO v_dispatch_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'multiplix_delivery_claim_conflict' USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.multiplix_dispatches AS dispatch
     SET sent_count = dispatch.sent_count + 1,
         updated_at = statement_timestamp()
   WHERE dispatch.id = v_dispatch_id;
END;
$function$;

-- remove_team_member(p_conversation_id uuid, p_profile_id uuid)
CREATE OR REPLACE FUNCTION public.remove_team_member(p_conversation_id uuid, p_profile_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_actor_id    uuid := public.current_profile_id();
  v_conv        RECORD;
  v_actor_role  text;
  v_target_role text;
  v_total_count int;
BEGIN
  IF v_actor_id IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF v_actor_id = p_profile_id THEN RAISE EXCEPTION 'cannot_remove_self'; END IF;

  SELECT id, type, created_by INTO v_conv
  FROM public.team_conversations WHERE id = p_conversation_id FOR UPDATE;
  IF v_conv.id IS NULL THEN RAISE EXCEPTION 'conversation_not_found'; END IF;
  IF v_conv.type NOT IN ('group','department') THEN RAISE EXCEPTION 'not_a_group_conversation'; END IF;

  SELECT tcm.role INTO v_actor_role
  FROM public.team_conversation_members tcm
  WHERE tcm.conversation_id = p_conversation_id AND tcm.profile_id = v_actor_id;
  IF v_actor_role IS NULL THEN RAISE EXCEPTION 'actor_not_a_member'; END IF;

  IF v_actor_role <> 'owner' AND v_conv.created_by <> v_actor_id THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  SELECT tcm.role INTO v_target_role
  FROM public.team_conversation_members tcm
  WHERE tcm.conversation_id = p_conversation_id AND tcm.profile_id = p_profile_id;
  IF v_target_role IS NULL THEN RAISE EXCEPTION 'target_not_a_member'; END IF;

  IF v_actor_role <> 'owner' AND v_target_role = 'owner' THEN
    RAISE EXCEPTION 'cannot_remove_owner';
  END IF;

  DELETE FROM public.team_conversation_members
  WHERE conversation_id = p_conversation_id AND profile_id = p_profile_id;

  SELECT COUNT(*) INTO v_total_count
  FROM public.team_conversation_members WHERE conversation_id = p_conversation_id;

  IF v_total_count = 0 THEN
    DELETE FROM public.team_conversations WHERE id = p_conversation_id;
    RETURN jsonb_build_object('ok',true,'removed',true,'group_deleted',true,'conversation_id',p_conversation_id,'profile_id',p_profile_id);
  END IF;

  RETURN jsonb_build_object('ok',true,'removed',true,'group_deleted',false,'conversation_id',p_conversation_id,'profile_id',p_profile_id);
END;
$function$;

-- search_team_messages(p_conversation_id uuid, p_query text, p_limit integer)
CREATE OR REPLACE FUNCTION public.search_team_messages(p_conversation_id uuid, p_query text, p_limit integer DEFAULT 20)
 RETURNS TABLE(id uuid, sender_id uuid, content text, created_at timestamp with time zone, sender_name text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_profile_id uuid := public.current_profile_id();
BEGIN
  IF v_profile_id IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.team_conversation_members
     WHERE conversation_id = p_conversation_id AND profile_id = v_profile_id
  ) THEN RAISE EXCEPTION 'not_member'; END IF;

  RETURN QUERY
  SELECT m.id, m.sender_id, m.content, m.created_at, p.name
    FROM public.team_messages m
    LEFT JOIN public.profiles p ON p.id = m.sender_id
   WHERE m.conversation_id = p_conversation_id
     AND m.content ILIKE '%' || p_query || '%'
   ORDER BY m.created_at DESC
   LIMIT LEAST(p_limit, 100);
END;
$function$;

-- set_department_whatsapp_config(p_department_id uuid, p_whatsapp_mode text, p_api_key text, p_instance_id text)
CREATE OR REPLACE FUNCTION public.set_department_whatsapp_config(p_department_id uuid, p_whatsapp_mode text, p_api_key text DEFAULT NULL::text, p_instance_id text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_profile_id uuid;
  v_is_admin   boolean;
BEGIN
  v_profile_id := public.current_profile_id();
  IF v_profile_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;

  SELECT (role IN ('admin','supervisor')) INTO v_is_admin
  FROM public.profiles WHERE id = v_profile_id;

  IF NOT v_is_admin THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authorized');
  END IF;

  IF p_whatsapp_mode NOT IN ('none','evolution','official') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_mode');
  END IF;

  UPDATE public.departments
  SET
    whatsapp_mode        = p_whatsapp_mode,
    whatsapp_api_key     = COALESCE(p_api_key, whatsapp_api_key),
    whatsapp_instance_id = COALESCE(p_instance_id, whatsapp_instance_id),
    updated_at           = now()
  WHERE id = p_department_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'department_not_found');
  END IF;

  RETURN jsonb_build_object('ok', true);
END;
$function$;

-- set_team_member_pref(p_conversation_id uuid, p_is_muted boolean)
CREATE OR REPLACE FUNCTION public.set_team_member_pref(p_conversation_id uuid, p_is_muted boolean DEFAULT NULL::boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_profile_id uuid := public.current_profile_id();
BEGIN
  IF v_profile_id IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;

  UPDATE public.team_conversation_members
     SET is_muted = COALESCE(p_is_muted, is_muted)
   WHERE conversation_id = p_conversation_id AND profile_id = v_profile_id;

  IF NOT FOUND THEN RAISE EXCEPTION 'not_member'; END IF;
END;
$function$;

-- set_team_member_role(p_conversation_id uuid, p_profile_id uuid, p_new_role text)
CREATE OR REPLACE FUNCTION public.set_team_member_role(p_conversation_id uuid, p_profile_id uuid, p_new_role text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF p_new_role NOT IN ('owner', 'admin', 'member') THEN
    RAISE EXCEPTION 'invalid role: %', p_new_role;
  END IF;
  IF NOT is_admin_or_supervisor(auth.uid()) THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.team_conversation_members
      WHERE conversation_id = p_conversation_id
        AND profile_id = (SELECT id FROM public.profiles WHERE user_id = auth.uid())
        AND member_role = 'owner'
    ) THEN
      RAISE EXCEPTION 'permission denied';
    END IF;
  END IF;
  UPDATE public.team_conversation_members
  SET    member_role = p_new_role
  WHERE  conversation_id = p_conversation_id
    AND  profile_id      = p_profile_id;
END;
$function$;

-- skill_based_assign(p_queue_id uuid)
CREATE OR REPLACE FUNCTION public.skill_based_assign(p_queue_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_agent_id UUID;
BEGIN
  -- Apenas admin/supervisor (ou service_role). Agentes comuns bloqueados.
  IF (current_setting('request.jwt.claims', true)::jsonb->>'role') = 'authenticated'
     AND NOT public.is_admin_or_supervisor(auth.uid()) THEN
    RAISE EXCEPTION 'skill_based_assign: requer perfil admin ou supervisor';
  END IF;
  SELECT qm.profile_id INTO v_agent_id
  FROM public.queue_members qm JOIN public.profiles p ON p.id = qm.profile_id
  WHERE qm.queue_id = p_queue_id AND qm.is_active = true AND p.is_active = true
    AND NOT EXISTS (
      SELECT 1 FROM public.queue_skill_requirements qsr WHERE qsr.queue_id = p_queue_id
      AND NOT EXISTS (
        SELECT 1 FROM public.agent_skills ags WHERE ags.profile_id = qm.profile_id
        AND ags.skill_name = qsr.skill_name AND ags.skill_level >= qsr.min_level
      )
    )
  ORDER BY (SELECT COUNT(*) FROM public.contacts c WHERE c.assigned_to = qm.profile_id) ASC LIMIT 1;
  IF v_agent_id IS NULL THEN
    SELECT qm.profile_id INTO v_agent_id
    FROM public.queue_members qm JOIN public.profiles p ON p.id = qm.profile_id
    WHERE qm.queue_id = p_queue_id AND qm.is_active = true AND p.is_active = true
    ORDER BY (SELECT COUNT(*) FROM public.contacts c WHERE c.assigned_to = qm.profile_id) ASC LIMIT 1;
  END IF;
  RETURN v_agent_id;
END;
$function$;

-- store_gmail_tokens(p_account_id uuid, p_access_token text, p_refresh_token text)
CREATE OR REPLACE FUNCTION public.store_gmail_tokens(p_account_id uuid, p_access_token text, p_refresh_token text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF p_access_token IS NULL OR p_access_token = '' THEN
    RAISE EXCEPTION 'store_gmail_tokens: p_access_token vazio para conta %', p_account_id;
  END IF;

  UPDATE public.gmail_accounts
  SET access_token_encrypted = public.encrypt_gmail_token(p_access_token),
      refresh_token_encrypted = CASE
        WHEN p_refresh_token IS NULL OR p_refresh_token = ''
        THEN refresh_token_encrypted  -- preserva: Google nao reenviou o refresh
        ELSE public.encrypt_gmail_token(p_refresh_token)
      END,
      updated_at = now()
  WHERE id = p_account_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'store_gmail_tokens: conta % nao encontrada', p_account_id;
  END IF;
END;
$function$;

-- team_message_receipts_update_guard()
CREATE OR REPLACE FUNCTION public.team_message_receipts_update_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF OLD.status = 'read' AND NEW.status <> 'read' THEN
    RAISE EXCEPTION 'Cannot downgrade receipt status from read';
  END IF;
  IF NEW.status = 'read' THEN
    NEW.read_at := COALESCE(NEW.read_at, now());
  END IF;
  RETURN NEW;
END;
$function$;

-- team_messages_edit_guard()
CREATE OR REPLACE FUNCTION public.team_messages_edit_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF OLD.sender_id <> public.current_profile_id() THEN
    RAISE EXCEPTION 'only sender can edit message';
  END IF;
  IF OLD.created_at < now() - interval '48 hours' THEN
    RAISE EXCEPTION 'edit window expired (48h)';
  END IF;
  NEW.is_edited := true;
  NEW.updated_at := now();
  RETURN NEW;
END;
$function$;

-- team_messages_validate_reply_to()
CREATE OR REPLACE FUNCTION public.team_messages_validate_reply_to()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.reply_to_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.team_messages
      WHERE id = NEW.reply_to_id
        AND conversation_id = NEW.conversation_id
    ) THEN
      RAISE EXCEPTION 'reply_to_id must belong to same conversation';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

-- team_reactions_dedup_guard()
CREATE OR REPLACE FUNCTION public.team_reactions_dedup_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.team_message_reactions
     WHERE message_id  = NEW.message_id
       AND profile_id  = NEW.profile_id
       AND emoji       = NEW.emoji
  ) THEN
    RETURN NULL; -- silently ignore duplicate
  END IF;
  RETURN NEW;
END;
$function$;

-- team_receipts_fill_conversation_id()
CREATE OR REPLACE FUNCTION public.team_receipts_fill_conversation_id()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.conversation_id IS NULL THEN
    SELECT tm.conversation_id INTO NEW.conversation_id
    FROM public.team_messages tm WHERE tm.id = NEW.message_id;
  END IF;
  IF NEW.conversation_id IS NULL THEN
    RAISE EXCEPTION 'conversation_id_required: message % has no conversation_id', NEW.message_id;
  END IF;
  RETURN NEW;
END;
$function$;

-- team_receipts_no_own_sender()
CREATE OR REPLACE FUNCTION public.team_receipts_no_own_sender()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.team_messages
     WHERE id = NEW.message_id
       AND sender_id = NEW.profile_id
  ) THEN
    RAISE EXCEPTION 'sender cannot create receipt for own message';
  END IF;
  RETURN NEW;
END;
$function$;

-- transfer_team_conversation_department(p_conversation_id uuid, p_to_department_id uuid)
CREATE OR REPLACE FUNCTION public.transfer_team_conversation_department(p_conversation_id uuid, p_to_department_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_profile_id uuid := public.current_profile_id();
  v_conv RECORD;
  v_result jsonb;
BEGIN
  IF v_profile_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  -- verificar se é admin ou supervisor
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = v_profile_id AND p.role IN ('admin', 'supervisor')
  ) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  SELECT id, type, department_id, metadata
  INTO v_conv
  FROM public.team_conversations
  WHERE id = p_conversation_id
  FOR UPDATE;

  IF v_conv.id IS NULL THEN
    RAISE EXCEPTION 'conversation_not_found';
  END IF;

  IF v_conv.type <> 'department' THEN
    RAISE EXCEPTION 'not_a_department_conversation';
  END IF;

  -- atualizar department_id e metadata
  UPDATE public.team_conversations
  SET
    department_id = p_to_department_id,
    metadata = COALESCE(v_conv.metadata, '{}'::jsonb) || jsonb_build_object(
      'transferred_at', now()::text,
      'transferred_by', v_profile_id,
      'original_department_id', v_conv.department_id
    )
  WHERE id = p_conversation_id
  RETURNING to_json(team_conversations.*) INTO v_result;

  RETURN jsonb_build_object(
    'ok', true,
    'conversation_id', p_conversation_id,
    'from_department_id', v_conv.department_id,
    'to_department_id', p_to_department_id
  );
END;
$function$;

-- update_agent_streak(p_profile_id uuid, p_increment boolean)
CREATE OR REPLACE FUNCTION public.update_agent_streak(p_profile_id uuid, p_increment boolean)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_row agent_stats%ROWTYPE; v_new_streak int; v_new_best_streak int;
BEGIN
  IF auth.role() = 'anon'
     OR (auth.role() = 'authenticated' AND NOT (
           p_profile_id IN (SELECT id FROM profiles WHERE user_id = auth.uid())
           OR is_admin_or_supervisor(auth.uid())
         ))
  THEN RAISE EXCEPTION 'permission denied'; END IF;
  SELECT * INTO v_row FROM agent_stats WHERE profile_id = p_profile_id FOR UPDATE;
  IF NOT FOUND THEN RETURN NULL; END IF;
  v_new_best_streak := COALESCE(v_row.best_streak, 0);
  IF p_increment THEN
    v_new_streak := COALESCE(v_row.current_streak, 0) + 1;
    IF v_new_streak > v_new_best_streak THEN v_new_best_streak := v_new_streak; END IF;
  ELSE v_new_streak := 0; END IF;
  UPDATE agent_stats SET current_streak = v_new_streak, best_streak = v_new_best_streak, updated_at = now() WHERE profile_id = p_profile_id;
  RETURN json_build_object('newStreak', v_new_streak, 'newBestStreak', v_new_best_streak);
END; $function$;

-- 3. Permissoes: no canonico estas funcoes nao tem EXECUTE para anon (no-op la) ---------------
revoke execute on function public.add_wa_tag_if_not_exists(uuid, text, text) from anon;
revoke execute on function public.get_team_conversation_previews() from anon;
revoke execute on function public.get_team_unread_counts() from anon;
revoke execute on function public.remove_wa_label_from_all_contacts(text) from anon;
revoke execute on function public.remove_wa_tag_by_prefix(uuid, text) from anon;
revoke execute on function public.rename_wa_label_on_all_contacts(text, text) from anon;
revoke execute on function public.set_team_member_role(uuid, uuid, text) from anon;
