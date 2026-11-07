-- goal_notifications_own_insert_policy
-- Rollback: DROP POLICY IF EXISTS "Users can insert own goal notifications" ON public.notifications;
--
-- O cliente de metas grava o aviso durável que alimenta a central de notificações,
-- mas a policy de 20260404174629 bloqueia todo INSERT autenticado. O resultado era
-- sempre HTTP 403, embora o toast local escondesse a falha. Esta exceção é estreita:
-- somente o próprio auth.uid(), type=goal, linha ainda não lida, chave canônica e
-- metadados coerentes. Outras notificações continuam exclusivamente server-side.

SET search_path = public, pg_temp;

DROP POLICY IF EXISTS "Users can insert own goal notifications" ON public.notifications;
CREATE POLICY "Users can insert own goal notifications"
ON public.notifications
FOR INSERT
TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND type = 'goal'
  AND is_read IS NOT TRUE
  AND read_at IS NULL
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
);

COMMENT ON POLICY "Users can insert own goal notifications" ON public.notifications IS
  'Permite ao cliente persistir somente a propria conquista de meta, com identidade e payload canônicos; demais INSERTs autenticados seguem bloqueados.';
