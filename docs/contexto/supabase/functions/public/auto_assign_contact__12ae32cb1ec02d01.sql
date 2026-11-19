CREATE OR REPLACE FUNCTION public.auto_assign_contact()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  assigned_agent_id UUID;
BEGIN
  -- Find the first matching active rule for the connection
  SELECT agent_id INTO assigned_agent_id
  FROM public.client_wallet_rules
  WHERE is_active = true
    AND (whatsapp_connection_id IS NULL OR whatsapp_connection_id = NEW.whatsapp_connection_id)
  ORDER BY priority DESC, created_at ASC
  LIMIT 1;
  
  -- If a rule matches and contact has no assignment, assign it
  IF assigned_agent_id IS NOT NULL AND NEW.assigned_to IS NULL THEN
    NEW.assigned_to := assigned_agent_id;
  END IF;
  
  RETURN NEW;
END;
$function$
