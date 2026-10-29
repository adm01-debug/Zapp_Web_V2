-- email_rls_remover_ramo_admin
-- Rollback: recria as 4 policies SELECT/UPDATE de email_threads e email_messages com o ramo OR is_admin_or_supervisor (texto anterior, abaixo).
-- Rollback (SQL executável, na ordem):
--   DROP POLICY IF EXISTS "Users can view threads of own accounts" ON public.email_threads;
--   CREATE POLICY "Users can view threads of own accounts" ON public.email_threads FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.gmail_accounts ga WHERE ga.id = gmail_account_id AND (ga.user_id = auth.uid() OR public.is_admin_or_supervisor(auth.uid()))));
--   DROP POLICY IF EXISTS "Users can update threads of own accounts" ON public.email_threads;
--   CREATE POLICY "Users can update threads of own accounts" ON public.email_threads FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM public.gmail_accounts ga WHERE ga.id = gmail_account_id AND (ga.user_id = auth.uid() OR public.is_admin_or_supervisor(auth.uid()))));
--   DROP POLICY IF EXISTS "Users can view messages of own accounts" ON public.email_messages;
--   CREATE POLICY "Users can view messages of own accounts" ON public.email_messages FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.gmail_accounts ga WHERE ga.id = gmail_account_id AND (ga.user_id = auth.uid() OR public.is_admin_or_supervisor(auth.uid()))));
--   DROP POLICY IF EXISTS "Users can update messages of own accounts" ON public.email_messages;
--   CREATE POLICY "Users can update messages of own accounts" ON public.email_messages FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM public.gmail_accounts ga WHERE ga.id = gmail_account_id AND (ga.user_id = auth.uid() OR public.is_admin_or_supervisor(auth.uid()))));
--
--
-- Cartao N-147 (P3, lista aprovada em 09/10): remover o ramo `OR is_admin_or_supervisor(auth.uid())`
-- das policies SELECT/UPDATE de email_threads e email_messages (criadas em 20260403105341).
--
-- O ramo e INERTE, e por isso esta migration NAO muda quem enxerga o que (so o dono da conta):
-- a policy consulta public.gmail_accounts, que tambem passa por RLS, e o SELECT de gmail_accounts
-- ficou so do dono (user_id = auth.uid(), 20260404173941 e 20260412171141). Para um admin de outra
-- conta o EXISTS nunca acha a linha, entao o `OR` nunca decide nada. Manter o ramo so sugere um
-- acesso de admin que nao existe.
--
-- Fora do escopo: email_attachments (20260827210200) tem o mesmo ramo e fica como esta;
-- is_admin_or_supervisor nao e tocada (outras policies a usam).
-- Prova: scripts/db-audit/email-rls-sem-ramo-admin.test.sh (migrations reais, papel `authenticated`).

DROP POLICY IF EXISTS "Users can view threads of own accounts" ON public.email_threads;
CREATE POLICY "Users can view threads of own accounts"
  ON public.email_threads FOR SELECT
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.gmail_accounts ga WHERE ga.id = gmail_account_id AND ga.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "Users can update threads of own accounts" ON public.email_threads;
CREATE POLICY "Users can update threads of own accounts"
  ON public.email_threads FOR UPDATE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.gmail_accounts ga WHERE ga.id = gmail_account_id AND ga.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "Users can view messages of own accounts" ON public.email_messages;
CREATE POLICY "Users can view messages of own accounts"
  ON public.email_messages FOR SELECT
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.gmail_accounts ga WHERE ga.id = gmail_account_id AND ga.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "Users can update messages of own accounts" ON public.email_messages;
CREATE POLICY "Users can update messages of own accounts"
  ON public.email_messages FOR UPDATE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.gmail_accounts ga WHERE ga.id = gmail_account_id AND ga.user_id = auth.uid())
  );
