CREATE OR REPLACE FUNCTION public.get_gmail_tokens(p_account_id uuid) RETURNS TABLE(access_token text, refresh_token text)

CREATE OR REPLACE FUNCTION public.store_gmail_tokens(p_account_id uuid, p_access_token text, p_refresh_token text DEFAULT NULL)

REVOKE PUBLIC/anon/authenticated; GRANT service_role
