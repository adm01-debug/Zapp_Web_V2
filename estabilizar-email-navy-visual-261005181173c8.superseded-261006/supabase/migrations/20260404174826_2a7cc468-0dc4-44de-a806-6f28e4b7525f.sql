
-- Block all authenticated DML on gmail_accounts (service_role only)
CREATE POLICY "Block authenticated gmail inserts"
ON public.gmail_accounts
FOR INSERT
TO authenticated
WITH CHECK (false);

CREATE POLICY "Block authenticated gmail updates"
ON public.gmail_accounts
FOR UPDATE
TO authenticated
USING (false);

CREATE POLICY "Block authenticated gmail deletes"
ON public.gmail_accounts
FOR DELETE
TO authenticated
USING (false);
