-- finalize_goal_notification_and_reaction_backup_policies
-- Rollback:
--   DROP POLICY IF EXISTS "No client access to reaction rollback backup"
--     ON public._rb_message_reactions_one_per_agent_20261107121000;
--   CREATE POLICY "Block authenticated notification inserts"
--     ON public.notifications FOR INSERT TO authenticated WITH CHECK (false);
--
-- Policies PERMISSIVE da mesma ação são combinadas com OR. Depois da policy
-- estreita de conquista de meta, a policy legada WITH CHECK (false) deixou de
-- bloquear qualquer coisa e passou apenas a duplicar avaliação/alerta. A
-- policy estreita permanece a única autorização de INSERT autenticado.
-- O backup de rollback já tinha ACL revogada e RLS ativa; a policy explícita
-- fail-closed documenta e preserva o deny-all mesmo se uma ACL for concedida
-- acidentalmente no futuro.

SET search_path = public, pg_temp;

DROP POLICY IF EXISTS "Block authenticated notification inserts"
  ON public.notifications;

DROP POLICY IF EXISTS "No client access to reaction rollback backup"
  ON public._rb_message_reactions_one_per_agent_20261107121000;
CREATE POLICY "No client access to reaction rollback backup"
ON public._rb_message_reactions_one_per_agent_20261107121000
FOR ALL
TO anon, authenticated
USING (false)
WITH CHECK (false);

COMMENT ON POLICY "No client access to reaction rollback backup"
  ON public._rb_message_reactions_one_per_agent_20261107121000 IS
  'Backup privado de rollback: clientes anon/authenticated nunca podem ler ou alterar linhas.';
