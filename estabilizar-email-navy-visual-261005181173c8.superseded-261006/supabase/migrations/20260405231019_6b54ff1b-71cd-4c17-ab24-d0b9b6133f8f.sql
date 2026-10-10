
-- Re-add SELECT for owners - the gmail_accounts_safe view needs it
-- The view (security_invoker) already strips tokens, so this is safe
CREATE POLICY "Users can view own gmail account safe"
ON public.gmail_accounts
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);
