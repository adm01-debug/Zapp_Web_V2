-- email_rls_remover_ramo_admin
-- Rollback: recria as 4 policies com o ramo OR public.is_admin_or_supervisor(auth.uid()); o SQL executavel esta nas linhas abaixo e restaura o estado de 20260403105341.
-- Rollback (SQL executavel, na ordem):
--   DROP POLICY IF EXISTS "Users can view threads of own accounts" ON public.email_threads;
--   DROP POLICY IF EXISTS "Users can update threads of own accounts" ON public.email_threads;
--   DROP POLICY IF EXISTS "Users can view messages of own accounts" ON public.email_messages;
--   DROP POLICY IF EXISTS "Users can update messages of own accounts" ON public.email_messages;
--   CREATE POLICY "Users can view threads of own accounts" ON public.email_threads FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.gmail_accounts ga WHERE ga.id = gmail_account_id AND (ga.user_id = auth.uid() OR public.is_admin_or_supervisor(auth.uid()))));
--   CREATE POLICY "Users can update threads of own accounts" ON public.email_threads FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM public.gmail_accounts ga WHERE ga.id = gmail_account_id AND (ga.user_id = auth.uid() OR public.is_admin_or_supervisor(auth.uid()))));
--   CREATE POLICY "Users can view messages of own accounts" ON public.email_messages FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.gmail_accounts ga WHERE ga.id = gmail_account_id AND (ga.user_id = auth.uid() OR public.is_admin_or_supervisor(auth.uid()))));
--   CREATE POLICY "Users can update messages of own accounts" ON public.email_messages FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM public.gmail_accounts ga WHERE ga.id = gmail_account_id AND (ga.user_id = auth.uid() OR public.is_admin_or_supervisor(auth.uid()))));
-- N-147: o ramo is_admin_or_supervisor(auth.uid()) das policies de SELECT e UPDATE
-- de email_threads e email_messages nao funciona na pratica (admin enxerga o proprio
-- e-mail, nao o de todos). As policies passam a exigir somente ga.user_id = auth.uid().
-- INSERT/DELETE nao mudam.

DROP POLICY IF EXISTS "Users can view threads of own accounts" ON public.email_threads;
DROP POLICY IF EXISTS "Users can update threads of own accounts" ON public.email_threads;
DROP POLICY IF EXISTS "Users can view messages of own accounts" ON public.email_messages;
DROP POLICY IF EXISTS "Users can update messages of own accounts" ON public.email_messages;

CREATE POLICY "Users can view threads of own accounts"
  ON public.email_threads FOR SELECT
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.gmail_accounts ga WHERE ga.id = gmail_account_id AND ga.user_id = auth.uid())
  );

CREATE POLICY "Users can update threads of own accounts"
  ON public.email_threads FOR UPDATE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.gmail_accounts ga WHERE ga.id = gmail_account_id AND ga.user_id = auth.uid())
  );

CREATE POLICY "Users can view messages of own accounts"
  ON public.email_messages FOR SELECT
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.gmail_accounts ga WHERE ga.id = gmail_account_id AND ga.user_id = auth.uid())
  );

CREATE POLICY "Users can update messages of own accounts"
  ON public.email_messages FOR UPDATE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.gmail_accounts ga WHERE ga.id = gmail_account_id AND ga.user_id = auth.uid())
  );
