-- goal_notifications_own_insert_policy
-- Rollback:
--   DROP POLICY IF EXISTS "Users can insert own goal notifications" ON public.notifications;
--   DROP POLICY IF EXISTS "Users can mark own notifications as read" ON public.notifications;
--   CREATE POLICY "Users can update own notifications" ON public.notifications FOR UPDATE TO authenticated USING (user_id = auth.uid());
--   GRANT UPDATE ON public.notifications TO authenticated;
--
-- O cliente de metas grava o aviso durável que alimenta a central de notificações,
-- mas a policy de 20260404174629 bloqueia todo INSERT autenticado. O resultado era
-- sempre HTTP 403, embora o toast local escondesse a falha. Esta exceção é estreita:
-- somente o próprio auth.uid(), type=goal, linha ainda não lida, chave canônica e
-- metadados coerentes e uma configuração de meta ativa/visível. Outras
-- notificações continuam exclusivamente server-side. O UPDATE autenticado fica
-- limitado por coluna ao único fluxo legítimo: marcar a própria linha como lida.

SET search_path = public, pg_temp;

DROP POLICY IF EXISTS "Users can insert own goal notifications" ON public.notifications;
CREATE POLICY "Users can insert own goal notifications"
ON public.notifications
FOR INSERT
TO authenticated
WITH CHECK (
  user_id = (SELECT auth.uid())
  AND type = 'goal'
  AND is_read IS FALSE
  AND read_at IS NULL
  AND created_at BETWEEN now() - interval '5 minutes' AND now() + interval '5 minutes'
  AND length(title) BETWEEN 1 AND 200
  AND length(message) BETWEEN 1 AND 1000
  AND dedupe_key ~ '^goal:v1:[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}:(daily|weekly|monthly):[0-9]{4}-[0-9]{2}-[0-9]{2}$'
  AND jsonb_typeof(metadata) = 'object'
  AND metadata ->> 'goal_id' = split_part(dedupe_key, ':', 3)
  AND metadata ->> 'period' = split_part(dedupe_key, ':', 4)
  AND metadata ->> 'goal_type' IN (
    'messages_sent',
    'conversations_resolved',
    'contacts_handled',
    'resolution_rate',
    'response_time',
    'satisfaction'
  )
  AND jsonb_typeof(metadata -> 'current') = 'number'
  AND jsonb_typeof(metadata -> 'target') = 'number'
  AND octet_length(metadata::text) <= 2048
  AND metadata = jsonb_build_object(
    'goal_id', metadata -> 'goal_id',
    'goal_type', metadata -> 'goal_type',
    'period', metadata -> 'period',
    'current', metadata -> 'current',
    'target', metadata -> 'target'
  )
  AND CASE
    WHEN pg_input_is_valid(split_part(dedupe_key, ':', 5), 'date') THEN
      CASE metadata ->> 'period'
        WHEN 'daily' THEN split_part(dedupe_key, ':', 5)::date
          BETWEEN current_date - 1 AND current_date + 1
        WHEN 'weekly' THEN extract(isodow FROM split_part(dedupe_key, ':', 5)::date) = 1
          AND split_part(dedupe_key, ':', 5)::date BETWEEN current_date - 8 AND current_date + 1
        WHEN 'monthly' THEN extract(day FROM split_part(dedupe_key, ':', 5)::date) = 1
          AND split_part(dedupe_key, ':', 5)::date
            BETWEEN (date_trunc('month', current_date) - interval '1 month')::date
                AND (date_trunc('month', current_date) + interval '1 month')::date
        ELSE false
      END
    ELSE false
  END
  AND EXISTS (
    SELECT 1
    FROM public.goals_configurations AS goal
    WHERE goal.id::text = metadata ->> 'goal_id'
      AND goal.is_active IS TRUE
      AND goal.goal_type = metadata ->> 'goal_type'
      AND (
        goal.profile_id IN (
          SELECT profile.id
          FROM public.profiles AS profile
          WHERE profile.user_id = (SELECT auth.uid())
        )
        OR (
          goal.queue_id IS NOT NULL
          AND (
            public.is_admin_or_supervisor((SELECT auth.uid()))
            OR goal.queue_id IN (
              SELECT membership.queue_id
              FROM public.queue_members AS membership
              JOIN public.profiles AS member_profile
                ON member_profile.id = membership.profile_id
              WHERE member_profile.user_id = (SELECT auth.uid())
            )
          )
        )
      )
      AND metadata -> 'target' = to_jsonb(
        CASE metadata ->> 'period'
          WHEN 'daily' THEN goal.daily_target
          WHEN 'weekly' THEN goal.weekly_target
          WHEN 'monthly' THEN goal.monthly_target
        END
      )
      AND (metadata ->> 'target')::numeric > 0
  )
  AND CASE
    WHEN metadata ->> 'goal_type' = 'response_time' THEN
      (metadata ->> 'current')::numeric > 0
      AND (metadata ->> 'current')::numeric <= (metadata ->> 'target')::numeric
    ELSE
      (metadata ->> 'current')::numeric >= (metadata ->> 'target')::numeric
  END
  AND abs((metadata ->> 'current')::numeric) <= 1000000000000
);

COMMENT ON POLICY "Users can insert own goal notifications" ON public.notifications IS
  'Permite ao cliente persistir somente a propria conquista de uma meta ativa e visivel, com identidade, periodo e payload canônicos; demais INSERTs autenticados seguem bloqueados.';

-- RLS escolhe linhas, não colunas. A policy histórica de UPDATE deixava o dono
-- trocar type/title/message/metadata depois de passar pelo INSERT estreito.
REVOKE UPDATE ON TABLE public.notifications FROM authenticated;
GRANT UPDATE (is_read, read_at) ON TABLE public.notifications TO authenticated;

DROP POLICY IF EXISTS "Users can update own notifications" ON public.notifications;
DROP POLICY IF EXISTS "Users can mark own notifications as read" ON public.notifications;
CREATE POLICY "Users can mark own notifications as read"
ON public.notifications
FOR UPDATE
TO authenticated
USING (user_id = (SELECT auth.uid()))
WITH CHECK (
  user_id = (SELECT auth.uid())
  AND is_read IS TRUE
  AND read_at IS NOT NULL
  AND read_at >= created_at - interval '5 minutes'
  AND read_at <= now() + interval '5 minutes'
);

COMMENT ON POLICY "Users can mark own notifications as read" ON public.notifications IS
  'Authenticated recebe UPDATE somente em is_read/read_at e apenas para concluir a leitura da propria notificacao.';
