-- Rollback:
-- DROP POLICY IF EXISTS "Block authenticated gmail inserts" ON public.gmail_accounts;
-- DROP POLICY IF EXISTS "Block authenticated gmail updates" ON public.gmail_accounts;
-- DROP POLICY IF EXISTS "Block authenticated gmail deletes" ON public.gmail_accounts;
-- CREATE POLICY "Block authenticated gmail inserts" ON public.gmail_accounts FOR INSERT TO authenticated WITH CHECK (false);
-- CREATE POLICY "Block authenticated gmail updates" ON public.gmail_accounts FOR UPDATE TO authenticated USING (false);
-- CREATE POLICY "Block authenticated gmail deletes" ON public.gmail_accounts FOR DELETE TO authenticated USING (false);

-- SEC-RLS_TAREFAS_EMAIL_LIGACOES-04: as 3 policies de bloqueio de escrita em gmail_accounts
-- (20260404174826) nasceram PERMISSIVAS, entao qualquer policy permissiva (ex.: "Admins can
-- insert/update/delete gmail accounts", 20260404162353) as anulava. RESTRICTIVE e combinada
-- com AND: a escrita de authenticated fica negada mesmo com policy permissiva na tabela.
-- Escrita legitima segue por service_role (BYPASSRLS).

DROP POLICY IF EXISTS "Block authenticated gmail inserts" ON public.gmail_accounts;
CREATE POLICY "Block authenticated gmail inserts"
ON public.gmail_accounts
AS RESTRICTIVE
FOR INSERT
TO authenticated
WITH CHECK (false);

DROP POLICY IF EXISTS "Block authenticated gmail updates" ON public.gmail_accounts;
CREATE POLICY "Block authenticated gmail updates"
ON public.gmail_accounts
AS RESTRICTIVE
FOR UPDATE
TO authenticated
USING (false);

DROP POLICY IF EXISTS "Block authenticated gmail deletes" ON public.gmail_accounts;
CREATE POLICY "Block authenticated gmail deletes"
ON public.gmail_accounts
AS RESTRICTIVE
FOR DELETE
TO authenticated
USING (false);
