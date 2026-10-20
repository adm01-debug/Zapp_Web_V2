-- Drop existing policies that allow users to modify their own gmail accounts
DROP POLICY IF EXISTS "Users can insert own gmail accounts" ON public.gmail_accounts;
DROP POLICY IF EXISTS "Users can update own gmail accounts" ON public.gmail_accounts;
DROP POLICY IF EXISTS "Users can delete own gmail accounts" ON public.gmail_accounts;

-- Only admins/supervisors can insert gmail accounts
CREATE POLICY "Only admins can insert gmail accounts"
ON public.gmail_accounts
FOR INSERT
WITH CHECK (is_admin_or_supervisor(auth.uid()));

-- Only admins/supervisors can update gmail accounts
CREATE POLICY "Only admins can update gmail accounts"
ON public.gmail_accounts
FOR UPDATE
USING (is_admin_or_supervisor(auth.uid()));

-- Only admins/supervisors can delete gmail accounts
CREATE POLICY "Only admins can delete gmail accounts"
ON public.gmail_accounts
FOR DELETE
USING (is_admin_or_supervisor(auth.uid()));