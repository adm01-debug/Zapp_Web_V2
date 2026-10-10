
-- 1. Gmail: replace the blocking policy with a user-scoped one
-- Users should read their own accounts via the safe view, not the raw table
-- Keep the "false" policy to block direct raw table access
-- The gmail_accounts_safe view already handles this correctly

-- 2. WhatsApp connections: add agent-facing read policy for non-sensitive fields
-- Create a safe view for agents
CREATE OR REPLACE VIEW public.whatsapp_connections_agent AS
SELECT 
  id,
  name,
  status,
  phone_number,
  is_default
FROM public.whatsapp_connections;

-- Grant access to the view
GRANT SELECT ON public.whatsapp_connections_agent TO authenticated;

-- 3. Channel connections: create a safe view without credentials
CREATE OR REPLACE VIEW public.channel_connections_safe AS
SELECT 
  id,
  channel_type,
  name,
  status,
  is_active,
  external_account_id,
  external_page_id,
  webhook_url,
  whatsapp_connection_id,
  created_at,
  updated_at,
  created_by
FROM public.channel_connections;

GRANT SELECT ON public.channel_connections_safe TO authenticated;

-- Create a SECURITY DEFINER function for credential access (admin only)
CREATE OR REPLACE FUNCTION public.get_channel_credentials_safe(p_channel_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only admins can access credentials
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Access denied: admin role required';
  END IF;
  
  RETURN (
    SELECT credentials 
    FROM public.channel_connections 
    WHERE id = p_channel_id
  );
END;
$$;
