
-- Remove SELECT policy - code now uses get_own_gmail_accounts RPC
DROP POLICY IF EXISTS "Users can view own gmail account safe" ON public.gmail_accounts;
