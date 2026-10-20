-- ============================================================
-- BLOCO 04 — FUNCTIONS (idempotente via CREATE OR REPLACE)
-- Schema: public  |  Total: 59 functions
-- Aplicar:  psql "$DESTINO_URL" -f BLOCO_04_functions.sql
-- Cada bloco mostra SECURITY DEFINER/INVOKER e search_path (quando setado).
-- ============================================================

-- --------------------------------------------------------
-- public.audit_role_changes()
-- SECURITY DEFINER  |  search_path: set
-- --------------------------------------------------------
CREATE OR REPLACE FUNCTION public.audit_role_changes()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'DELETE' THEN
    INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, details)
    VALUES (
      auth.uid(),
      'role_deleted',
      'user_roles',
      OLD.id::text,
      jsonb_build_object('user_id', OLD.user_id, 'role', OLD.role)
    );
    RETURN OLD;
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, details)
    VALUES (
      auth.uid(),
      'role_updated',
      'user_roles',
      NEW.id::text,
      jsonb_build_object(
        'user_id', NEW.user_id,
        'old_role', OLD.role,
        'new_role', NEW.role
      )
    );
    RETURN NEW;
  ELSIF TG_OP = 'INSERT' THEN
    INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, details)
    VALUES (
      auth.uid(),
      'role_created',
      'user_roles',
      NEW.id::text,
      jsonb_build_object('user_id', NEW.user_id, 'role', NEW.role)
    );
    RETURN NEW;
  END IF;
  RETURN NULL;
END;
$function$;

-- --------------------------------------------------------
-- public.auto_assign_contact()
-- SECURITY DEFINER  |  search_path: set
-- --------------------------------------------------------
CREATE OR REPLACE FUNCTION public.auto_assign_contact()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
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
$function$;

-- --------------------------------------------------------
-- public.auto_assign_to_queue_agent()
-- SECURITY DEFINER  |  search_path: set
-- --------------------------------------------------------
CREATE OR REPLACE FUNCTION public.auto_assign_to_queue_agent()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  assigned_agent_id UUID;
BEGIN
  -- If contact has a queue but no assigned agent, find least busy agent
  IF NEW.queue_id IS NOT NULL AND NEW.assigned_to IS NULL THEN
    SELECT qm.profile_id INTO assigned_agent_id
    FROM public.queue_members qm
    JOIN public.profiles p ON p.id = qm.profile_id
    WHERE qm.queue_id = NEW.queue_id
      AND qm.is_active = true
      AND p.is_active = true
    ORDER BY (
      SELECT COUNT(*) FROM public.contacts c 
      WHERE c.assigned_to = qm.profile_id
    ) ASC
    LIMIT 1;
    
    IF assigned_agent_id IS NOT NULL THEN
      NEW.assigned_to := assigned_agent_id;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$function$;

-- --------------------------------------------------------
-- public.calculate_level(xp_amount integer)
-- SECURITY INVOKER  |  search_path: set
-- --------------------------------------------------------
CREATE OR REPLACE FUNCTION public.calculate_level(xp_amount integer)
 RETURNS integer
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN GREATEST(1, FLOOR(SQRT(xp_amount / 50.0))::INTEGER + 1);
END;
$function$;

-- --------------------------------------------------------
-- public.cleanup_expired_challenges()
-- SECURITY DEFINER  |  search_path: set
-- --------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cleanup_expired_challenges()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
    DELETE FROM public.webauthn_challenges WHERE expires_at < now();
END;
$function$;

-- --------------------------------------------------------
-- public.clear_login_attempts(p_email text)
-- SECURITY DEFINER  |  search_path: set
-- --------------------------------------------------------
CREATE OR REPLACE FUNCTION public.clear_login_attempts(p_email text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  DELETE FROM public.login_attempts WHERE email = LOWER(p_email);
END;
$function$;

-- --------------------------------------------------------
-- public.clear_qr_on_connect()
-- SECURITY DEFINER  |  search_path: set
-- --------------------------------------------------------
CREATE OR REPLACE FUNCTION public.clear_qr_on_connect()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.status = 'connected' AND OLD.status != 'connected' AND NEW.qr_code IS NOT NULL THEN
    NEW.qr_code := NULL;
  END IF;
  RETURN NEW;
END;
$function$;

-- --------------------------------------------------------
-- public.contacts_count_by_type()
-- SECURITY DEFINER  |  search_path: set
-- --------------------------------------------------------
CREATE OR REPLACE FUNCTION public.contacts_count_by_type()
 RETURNS TABLE(contact_type text, count bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT COALESCE(c.contact_type, 'cliente') AS contact_type, COUNT(*) AS count
  FROM public.contacts c
  GROUP BY COALESCE(c.contact_type, 'cliente');
$function$;

-- --------------------------------------------------------
-- public.decrypt_gmail_token(p_encrypted bytea)
-- SECURITY DEFINER  |  search_path: set
-- --------------------------------------------------------
CREATE OR REPLACE FUNCTION public.decrypt_gmail_token(p_encrypted bytea)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF p_encrypted IS NULL THEN RETURN NULL; END IF;
  RETURN pgp_sym_decrypt(p_encrypted, current_setting('app.encryption_key', true));
END;
$function$;

-- --------------------------------------------------------
-- public.encrypt_gmail_token(p_token text)
-- SECURITY DEFINER  |  search_path: set
-- --------------------------------------------------------
CREATE OR REPLACE FUNCTION public.encrypt_gmail_token(p_token text)
 RETURNS bytea
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF p_token IS NULL THEN RETURN NULL; END IF;
  RETURN pgp_sym_encrypt(p_token, current_setting('app.encryption_key', true));
END;
$function$;

-- --------------------------------------------------------
-- public.ensure_single_default_ai_provider()
-- SECURITY DEFINER  |  search_path: set
-- --------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ensure_single_default_ai_provider()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.is_default = true THEN
    UPDATE public.ai_providers
    SET is_default = false
    WHERE id != NEW.id
      AND is_default = true
      AND use_for && NEW.use_for;
  END IF;
  RETURN NEW;
END;
$function$;

-- --------------------------------------------------------
-- public.ensure_single_default_filter()
-- SECURITY DEFINER  |  search_path: set
-- --------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ensure_single_default_filter()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.is_default = true THEN
    UPDATE public.saved_filters
    SET is_default = false
    WHERE user_id = NEW.user_id
      AND entity_type = NEW.entity_type
      AND id != NEW.id
      AND is_default = true;
  END IF;
  RETURN NEW;
END;
$function$;

-- --------------------------------------------------------
-- public.get_channel_credentials(_connection_id uuid)
-- SECURITY DEFINER  |  search_path: set
-- --------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_channel_credentials(_connection_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT is_admin_or_supervisor(auth.uid()) THEN
    RETURN NULL;
  END IF;
  RETURN (SELECT credentials FROM public.channel_connections WHERE id = _connection_id);
END;
$function$;

-- --------------------------------------------------------
-- public.get_channel_credentials_safe(p_channel_id uuid)
-- SECURITY DEFINER  |  search_path: set
-- --------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_channel_credentials_safe(p_channel_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$;

-- --------------------------------------------------------
-- public.get_connection_instance(_connection_id uuid)
-- SECURITY DEFINER  |  search_path: set
-- --------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_connection_instance(_connection_id uuid)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT instance_id FROM public.whatsapp_connections WHERE id = _connection_id;
$function$;

-- --------------------------------------------------------
-- public.get_connection_qr_code(_connection_id uuid)
-- SECURITY DEFINER  |  search_path: set
-- --------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_connection_qr_code(_connection_id uuid)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT qr_code FROM public.whatsapp_connections WHERE id = _connection_id;
$function$;

-- --------------------------------------------------------
-- public.get_own_gmail_accounts()
-- SECURITY DEFINER  |  search_path: set
-- --------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_own_gmail_accounts()
 RETURNS TABLE(id uuid, user_id uuid, email_address text, is_active boolean, sync_status text, last_sync_at timestamp with time zone, last_error text, token_expires_at timestamp with time zone, created_at timestamp with time zone, updated_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT id, user_id, email_address, is_active, sync_status,
         last_sync_at, last_error, token_expires_at, created_at, updated_at
  FROM public.gmail_accounts
  WHERE user_id = auth.uid();
$function$;

-- --------------------------------------------------------
-- public.get_own_lockout_status(p_email text)
-- SECURITY DEFINER  |  search_path: set
-- --------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_own_lockout_status(p_email text)
 RETURNS TABLE(attempt_count integer, locked_until timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT la.attempt_count, la.locked_until
  FROM login_attempts la
  WHERE la.email = p_email
  ORDER BY la.created_at DESC
  LIMIT 1;
$function$;

-- --------------------------------------------------------
-- public.get_own_reset_requests()
-- SECURITY DEFINER  |  search_path: set
-- --------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_own_reset_requests()
 RETURNS SETOF password_reset_requests
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT id, user_id, email, reason, status, reviewed_by, reviewed_at,
         rejection_reason, NULL::text as reset_token, token_expires_at,
         ip_address, user_agent, created_at, updated_at
  FROM public.password_reset_requests
  WHERE user_id = auth.uid();
$function$;

-- --------------------------------------------------------
-- public.get_profile_id_for_user(_user_id uuid)
-- SECURITY DEFINER  |  search_path: set
-- --------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_profile_id_for_user(_user_id uuid)
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT id FROM public.profiles WHERE user_id = _user_id LIMIT 1;
$function$;

-- --------------------------------------------------------
-- public.get_profile_role_for_check(p_user_id uuid)
-- SECURITY DEFINER  |  search_path: set
-- --------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_profile_role_for_check(p_user_id uuid)
 RETURNS TABLE(role text, access_level text, permissions jsonb)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT p.role, p.access_level, p.permissions
  FROM profiles p
  WHERE p.user_id = p_user_id
  LIMIT 1;
$function$;

-- --------------------------------------------------------
-- public.get_reset_requests_safe()
-- SECURITY DEFINER  |  search_path: set
-- --------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_reset_requests_safe()
 RETURNS TABLE(id uuid, user_id uuid, email text, reason text, status text, reviewed_by uuid, reviewed_at timestamp with time zone, rejection_reason text, has_token boolean, token_expires_at timestamp with time zone, ip_address text, user_agent text, created_at timestamp with time zone, updated_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT 
    prr.id, prr.user_id, prr.email, prr.reason, prr.status,
    prr.reviewed_by, prr.reviewed_at, prr.rejection_reason,
    (prr.reset_token IS NOT NULL) AS has_token,
    prr.token_expires_at, prr.ip_address, prr.user_agent,
    prr.created_at, prr.updated_at
  FROM public.password_reset_requests prr;
$function$;

-- --------------------------------------------------------
-- public.get_team_profiles()
-- SECURITY DEFINER  |  search_path: set
-- --------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_team_profiles()
 RETURNS TABLE(id uuid, user_id uuid, name text, email text, avatar_url text, role text, is_active boolean, department text, job_title text, phone text, max_chats integer, created_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT 
    p.id, p.user_id, p.name, p.email, p.avatar_url, p.role,
    p.is_active, p.department, p.job_title, p.phone, p.max_chats, p.created_at
  FROM public.profiles p;
$function$;

-- --------------------------------------------------------
-- public.get_visible_agent_ids(_user_id uuid)
-- SECURITY DEFINER  |  search_path: set
-- --------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_visible_agent_ids(_user_id uuid)
 RETURNS SETOF uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT p.id FROM public.profiles p WHERE p.user_id = _user_id
  UNION
  SELECT avg.can_see_agent_id
  FROM public.agent_visibility_grants avg
  JOIN public.profiles p ON p.id = avg.agent_id
  WHERE p.user_id = _user_id
    AND EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = _user_id AND ur.role = 'special_agent'
    )
$function$;

-- --------------------------------------------------------
-- public.handle_new_user()
-- SECURITY DEFINER  |  search_path: set
-- --------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.profiles (user_id, name, email)
  VALUES (
    NEW.id, 
    COALESCE(NEW.raw_user_meta_data ->> 'name', NEW.email),
    NEW.email
  );
  RETURN NEW;
END;
$function$;

-- --------------------------------------------------------
-- public.handle_new_user_role()
-- SECURITY DEFINER  |  search_path: set
-- --------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user_role()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'agent');
  RETURN NEW;
END;
$function$;

-- --------------------------------------------------------
-- public.has_role(_user_id uuid, _role app_role)
-- SECURITY DEFINER  |  search_path: set
-- --------------------------------------------------------
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$function$;

-- --------------------------------------------------------
-- public.init_agent_stats()
-- SECURITY DEFINER  |  search_path: set
-- --------------------------------------------------------
CREATE OR REPLACE FUNCTION public.init_agent_stats()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.agent_stats (profile_id)
  VALUES (NEW.id)
  ON CONFLICT (profile_id) DO NOTHING;
  RETURN NEW;
END;
$function$;

-- --------------------------------------------------------
-- public.is_account_locked(check_email text)
-- SECURITY DEFINER  |  search_path: set
-- --------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_account_locked(check_email text)
 RETURNS TABLE(is_locked boolean, locked_until timestamp with time zone, attempts integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_attempt RECORD;
BEGIN
  SELECT la.attempt_count, la.locked_until, la.last_attempt_at
  INTO v_attempt
  FROM public.login_attempts la
  WHERE la.email = LOWER(check_email);
  
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, NULL::TIMESTAMP WITH TIME ZONE, 0;
    RETURN;
  END IF;
  
  -- Check if still locked
  IF v_attempt.locked_until IS NOT NULL AND v_attempt.locked_until > now() THEN
    RETURN QUERY SELECT true, v_attempt.locked_until, v_attempt.attempt_count;
    RETURN;
  END IF;
  
  -- Not locked
  RETURN QUERY SELECT false, NULL::TIMESTAMP WITH TIME ZONE, v_attempt.attempt_count;
END;
$function$;

-- --------------------------------------------------------
-- public.is_admin_or_supervisor(_user_id uuid)
-- SECURITY DEFINER  |  search_path: set
-- --------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_admin_or_supervisor(_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role IN ('admin', 'supervisor')
  )
$function$;

-- --------------------------------------------------------
-- public.is_contact_visible_to_user(_contact_id uuid, _user_id uuid)
-- SECURITY DEFINER  |  search_path: set
-- --------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_contact_visible_to_user(_contact_id uuid, _user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.contacts c
    JOIN public.profiles p ON p.id = c.assigned_to
    WHERE c.id = _contact_id AND p.user_id = _user_id
  ) OR public.is_admin_or_supervisor(_user_id);
$function$;

-- --------------------------------------------------------
-- public.is_country_allowed(check_country_code text)
-- SECURITY DEFINER  |  search_path: set
-- --------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_country_allowed(check_country_code text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  geo_mode TEXT;
BEGIN
  -- Get current geo blocking mode
  SELECT mode INTO geo_mode FROM public.geo_blocking_settings LIMIT 1;
  
  -- If disabled, allow all
  IF geo_mode IS NULL OR geo_mode = 'disabled' THEN
    RETURN true;
  END IF;
  
  -- If whitelist mode, check if country is in allowed list
  IF geo_mode = 'whitelist' THEN
    RETURN EXISTS (
      SELECT 1 FROM public.allowed_countries
      WHERE country_code = UPPER(check_country_code)
    );
  END IF;
  
  -- If blacklist mode, check if country is NOT in blocked list
  IF geo_mode = 'blacklist' THEN
    RETURN NOT EXISTS (
      SELECT 1 FROM public.blocked_countries
      WHERE country_code = UPPER(check_country_code)
    );
  END IF;
  
  RETURN true;
END;
$function$;

-- --------------------------------------------------------
-- public.is_country_blocked(check_country_code text)
-- SECURITY DEFINER  |  search_path: set
-- --------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_country_blocked(check_country_code text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.blocked_countries
    WHERE country_code = UPPER(check_country_code)
  )
$function$;

-- --------------------------------------------------------
-- public.is_ip_blocked(check_ip text)
-- SECURITY DEFINER  |  search_path: set
-- --------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_ip_blocked(check_ip text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.blocked_ips
    WHERE ip_address = check_ip
    AND (expires_at IS NULL OR expires_at > now())
  )
$function$;

-- --------------------------------------------------------
-- public.is_ip_whitelisted(check_ip text)
-- SECURITY DEFINER  |  search_path: set
-- --------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_ip_whitelisted(check_ip text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.ip_whitelist
    WHERE ip_address = check_ip
  )
$function$;

-- --------------------------------------------------------
-- public.is_team_conversation_member(_user_id uuid, _conversation_id uuid)
-- SECURITY DEFINER  |  search_path: set
-- --------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_team_conversation_member(_user_id uuid, _conversation_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.team_conversation_members tcm
    JOIN public.profiles p ON p.id = tcm.profile_id
    WHERE tcm.conversation_id = _conversation_id
      AND p.user_id = _user_id
  );
$function$;

-- --------------------------------------------------------
-- public.is_within_business_hours(connection_id uuid)
-- SECURITY DEFINER  |  search_path: set
-- --------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_within_business_hours(connection_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_current_day INTEGER;
  v_current_time TIME;
  v_is_open BOOLEAN;
  v_open_at TIME;
  v_close_at TIME;
BEGIN
  -- Get current day of week (0=Sunday) and time in Brazil timezone
  v_current_day := EXTRACT(DOW FROM now() AT TIME ZONE 'America/Sao_Paulo');
  v_current_time := (now() AT TIME ZONE 'America/Sao_Paulo')::TIME;
  
  -- Check business hours for this day
  SELECT bh.is_open, bh.open_time, bh.close_time
  INTO v_is_open, v_open_at, v_close_at
  FROM business_hours bh
  WHERE bh.whatsapp_connection_id = connection_id
  AND bh.day_of_week = v_current_day;
  
  -- If no configuration found, assume open (default behavior)
  IF NOT FOUND THEN
    RETURN true;
  END IF;
  
  -- If marked as closed
  IF NOT v_is_open THEN
    RETURN false;
  END IF;
  
  -- Check if current time is within open hours
  RETURN v_current_time >= v_open_at AND v_current_time <= v_close_at;
END;
$function$;

-- --------------------------------------------------------
-- public.log_assignment_change()
-- SECURITY DEFINER  |  search_path: set
-- --------------------------------------------------------
CREATE OR REPLACE FUNCTION public.log_assignment_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF OLD.assigned_to IS DISTINCT FROM NEW.assigned_to THEN
    INSERT INTO public.conversation_events (
      contact_id, event_type, from_agent_id, to_agent_id, performed_by, metadata
    ) VALUES (
      NEW.id,
      CASE
        WHEN OLD.assigned_to IS NULL THEN 'assign'
        WHEN NEW.assigned_to IS NULL THEN 'unassign'
        ELSE 'transfer'
      END,
      OLD.assigned_to,
      NEW.assigned_to,
      COALESCE(NEW.assigned_to, OLD.assigned_to),
      jsonb_build_object('old_queue', OLD.queue_id, 'new_queue', NEW.queue_id)
    );
  END IF;

  -- Log queue changes
  IF OLD.queue_id IS DISTINCT FROM NEW.queue_id THEN
    INSERT INTO public.conversation_events (
      contact_id, event_type, from_queue_id, to_queue_id, performed_by, metadata
    ) VALUES (
      NEW.id,
      'queue_transfer',
      OLD.queue_id,
      NEW.queue_id,
      NEW.assigned_to,
      jsonb_build_object('agent', NEW.assigned_to)
    );
  END IF;

  RETURN NEW;
END;
$function$;

-- --------------------------------------------------------
-- public.log_audit_event(p_action text, p_entity_type text, p_entity_id text, p_details jsonb, p_user_agent text)
-- SECURITY DEFINER  |  search_path: set
-- --------------------------------------------------------
CREATE OR REPLACE FUNCTION public.log_audit_event(p_action text, p_entity_type text DEFAULT NULL::text, p_entity_id text DEFAULT NULL::text, p_details jsonb DEFAULT NULL::jsonb, p_user_agent text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN;
  END IF;
  
  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, details, user_agent)
  VALUES (v_user_id, p_action, p_entity_type, p_entity_id, p_details, p_user_agent);
END;
$function$;

-- --------------------------------------------------------
-- public.mask_channel_credentials()
-- SECURITY DEFINER  |  search_path: set
-- --------------------------------------------------------
CREATE OR REPLACE FUNCTION public.mask_channel_credentials()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- This is a SELECT trigger workaround - credentials masking is handled via the safe view
  RETURN NEW;
END;
$function$;

-- --------------------------------------------------------
-- public.normalize_contact_phone()
-- SECURITY INVOKER  |  search_path: set
-- --------------------------------------------------------
CREATE OR REPLACE FUNCTION public.normalize_contact_phone()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.phone IS NOT NULL THEN
    NEW.phone := regexp_replace(NEW.phone, '[^0-9]', '', 'g');
  END IF;
  RETURN NEW;
END;
$function$;

-- --------------------------------------------------------
-- public.notify_sicoob_on_reply()
-- SECURITY DEFINER  |  search_path: set
-- --------------------------------------------------------
CREATE OR REPLACE FUNCTION public.notify_sicoob_on_reply()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_contact_type text;
  v_supabase_url text;
BEGIN
  IF NEW.sender = 'agent' AND NEW.channel_type = 'internal_chat' THEN
    SELECT contact_type INTO v_contact_type
    FROM public.contacts
    WHERE id = NEW.contact_id;

    IF v_contact_type = 'sicoob_gifts' THEN
      v_supabase_url := 'https://tnnnlkbymytvtqngbbqh.supabase.co';

      PERFORM extensions.http_post(
        url := v_supabase_url || '/functions/v1/sicoob-bridge-reply',
        body := jsonb_build_object(
          'contact_id', NEW.contact_id,
          'content', NEW.content,
          'message_id', NEW.id,
          'agent_id', NEW.agent_id,
          'created_at', NEW.created_at
        )::text,
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
        )::jsonb
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

-- --------------------------------------------------------
-- public.prevent_profile_privilege_escalation()
-- SECURITY DEFINER  |  search_path: set
-- --------------------------------------------------------
CREATE OR REPLACE FUNCTION public.prevent_profile_privilege_escalation()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- If role, permissions, or access_level are being changed
  IF (OLD.role IS DISTINCT FROM NEW.role) OR 
     (OLD.permissions IS DISTINCT FROM NEW.permissions) OR 
     (OLD.access_level IS DISTINCT FROM NEW.access_level) THEN
    -- Only allow if user is admin or supervisor
    IF NOT is_admin_or_supervisor(auth.uid()) THEN
      RAISE EXCEPTION 'Only administrators can modify role, permissions, or access_level';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

-- --------------------------------------------------------
-- public.prevent_role_escalation()
-- SECURITY DEFINER  |  search_path: set
-- --------------------------------------------------------
CREATE OR REPLACE FUNCTION public.prevent_role_escalation()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- If role is being changed, only allow admins/supervisors
  IF OLD.role IS DISTINCT FROM NEW.role THEN
    IF NOT public.is_admin_or_supervisor(auth.uid()) THEN
      -- Silently revert the role change
      NEW.role := OLD.role;
    END IF;
  END IF;
  
  -- Also prevent non-admins from changing access_level and permissions
  IF OLD.access_level IS DISTINCT FROM NEW.access_level THEN
    IF NOT public.is_admin_or_supervisor(auth.uid()) THEN
      NEW.access_level := OLD.access_level;
    END IF;
  END IF;
  
  IF OLD.permissions IS DISTINCT FROM NEW.permissions THEN
    IF NOT public.is_admin_or_supervisor(auth.uid()) THEN
      NEW.permissions := OLD.permissions;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

-- --------------------------------------------------------
-- public.rate_limit_reset_requests()
-- SECURITY DEFINER  |  search_path: set
-- --------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rate_limit_reset_requests()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_pending_count integer;
BEGIN
  SELECT COUNT(*) INTO v_pending_count
  FROM public.password_reset_requests
  WHERE user_id = NEW.user_id
    AND status = 'pending'
    AND created_at > now() - interval '1 hour';

  IF v_pending_count >= 3 THEN
    RAISE EXCEPTION 'Too many pending reset requests. Please wait before trying again.';
  END IF;

  RETURN NEW;
END;
$function$;

-- --------------------------------------------------------
-- public.reassign_absent_agents(inactive_minutes integer)
-- SECURITY DEFINER  |  search_path: set
-- --------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reassign_absent_agents(inactive_minutes integer DEFAULT 30)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_absent RECORD;
  v_new_agent UUID;
  v_reassigned INTEGER := 0;
  v_contact RECORD;
BEGIN
  FOR v_absent IN
    SELECT p.id AS agent_id
    FROM profiles p
    WHERE p.is_active = true
      AND p.last_seen_at IS NOT NULL
      AND p.last_seen_at < now() - (inactive_minutes || ' minutes')::interval
      AND EXISTS (SELECT 1 FROM contacts c WHERE c.assigned_to = p.id)
  LOOP
    FOR v_contact IN
      SELECT c.id, c.queue_id
      FROM contacts c
      WHERE c.assigned_to = v_absent.agent_id
    LOOP
      SELECT qm.profile_id INTO v_new_agent
      FROM queue_members qm
      JOIN profiles p ON p.id = qm.profile_id
      WHERE (v_contact.queue_id IS NULL OR qm.queue_id = v_contact.queue_id)
        AND qm.is_active = true
        AND p.is_active = true
        AND p.id != v_absent.agent_id
        AND (p.last_seen_at IS NULL OR p.last_seen_at > now() - (inactive_minutes || ' minutes')::interval)
      ORDER BY (
        SELECT COUNT(*) FROM contacts cc WHERE cc.assigned_to = qm.profile_id
      ) ASC
      LIMIT 1;

      IF v_new_agent IS NOT NULL THEN
        UPDATE contacts SET assigned_to = v_new_agent WHERE id = v_contact.id;

        INSERT INTO conversation_events (contact_id, event_type, from_agent_id, to_agent_id, metadata)
        VALUES (v_contact.id, 'absence_reassign', v_absent.agent_id, v_new_agent,
                jsonb_build_object('reason', 'agent_inactive', 'inactive_minutes', inactive_minutes));

        v_reassigned := v_reassigned + 1;
      END IF;
    END LOOP;
  END LOOP;

  RETURN v_reassigned;
END;
$function$;

-- --------------------------------------------------------
-- public.reassign_overloaded_agents()
-- SECURITY DEFINER  |  search_path: set
-- --------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reassign_overloaded_agents()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_overloaded RECORD;
  v_new_agent UUID;
  v_reassigned INTEGER := 0;
  v_contact RECORD;
BEGIN
  -- Encontrar agentes sobrecarregados
  FOR v_overloaded IN
    SELECT p.id AS agent_id, p.max_chats,
           COUNT(c.id) AS current_chats
    FROM profiles p
    JOIN contacts c ON c.assigned_to = p.id
    WHERE p.is_active = true
      AND p.max_chats IS NOT NULL
      AND p.max_chats > 0
    GROUP BY p.id, p.max_chats
    HAVING COUNT(c.id) > p.max_chats
  LOOP
    -- Para cada conversa excedente, reatribuir
    FOR v_contact IN
      SELECT c.id, c.queue_id
      FROM contacts c
      WHERE c.assigned_to = v_overloaded.agent_id
      ORDER BY c.updated_at ASC
      LIMIT (v_overloaded.current_chats - v_overloaded.max_chats)
    LOOP
      -- Encontrar agente com menor carga na mesma fila
      SELECT qm.profile_id INTO v_new_agent
      FROM queue_members qm
      JOIN profiles p ON p.id = qm.profile_id
      WHERE (v_contact.queue_id IS NULL OR qm.queue_id = v_contact.queue_id)
        AND qm.is_active = true
        AND p.is_active = true
        AND p.id != v_overloaded.agent_id
        AND (p.max_chats IS NULL OR (
          SELECT COUNT(*) FROM contacts cc WHERE cc.assigned_to = p.id
        ) < p.max_chats)
      ORDER BY (
        SELECT COUNT(*) FROM contacts cc WHERE cc.assigned_to = qm.profile_id
      ) ASC
      LIMIT 1;

      IF v_new_agent IS NOT NULL THEN
        UPDATE contacts SET assigned_to = v_new_agent WHERE id = v_contact.id;

        INSERT INTO conversation_events (contact_id, event_type, from_agent_id, to_agent_id, metadata)
        VALUES (v_contact.id, 'overload_reassign', v_overloaded.agent_id, v_new_agent,
                jsonb_build_object('reason', 'max_chats_exceeded', 'max_chats', v_overloaded.max_chats));

        v_reassigned := v_reassigned + 1;
      END IF;
    END LOOP;
  END LOOP;

  RETURN v_reassigned;
END;
$function$;

-- --------------------------------------------------------
-- public.record_failed_login(p_email text, p_ip_address text, p_user_agent text)
-- SECURITY DEFINER  |  search_path: set
-- --------------------------------------------------------
CREATE OR REPLACE FUNCTION public.record_failed_login(p_email text, p_ip_address text DEFAULT NULL::text, p_user_agent text DEFAULT NULL::text)
 RETURNS TABLE(is_locked boolean, locked_until timestamp with time zone, attempts integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_attempt RECORD;
  v_new_count INTEGER;
  v_lock_duration INTERVAL;
  v_locked_until TIMESTAMP WITH TIME ZONE;
  v_max_attempts INTEGER := 5;
BEGIN
  -- Get existing attempts
  SELECT la.attempt_count, la.locked_until, la.last_attempt_at
  INTO v_attempt
  FROM public.login_attempts la
  WHERE la.email = LOWER(p_email);
  
  IF NOT FOUND THEN
    -- First failed attempt
    INSERT INTO public.login_attempts (email, ip_address, user_agent, attempt_count)
    VALUES (LOWER(p_email), p_ip_address, p_user_agent, 1);
    
    RETURN QUERY SELECT false, NULL::TIMESTAMP WITH TIME ZONE, 1;
    RETURN;
  END IF;
  
  -- If previous lock expired, reset count
  IF v_attempt.locked_until IS NOT NULL AND v_attempt.locked_until <= now() THEN
    v_new_count := 1;
  ELSE
    v_new_count := v_attempt.attempt_count + 1;
  END IF;
  
  -- Calculate lock duration with exponential backoff
  IF v_new_count >= v_max_attempts THEN
    -- Lock duration: 2^(attempts - max_attempts) minutes, starting at 1 minute
    -- 5 attempts = 1 min, 6 = 2 min, 7 = 4 min, 8 = 8 min, etc.
    v_lock_duration := (POWER(2, LEAST(v_new_count - v_max_attempts, 10)))::INTEGER * INTERVAL '1 minute';
    v_locked_until := now() + v_lock_duration;
  ELSE
    v_locked_until := NULL;
  END IF;
  
  -- Update attempt record
  UPDATE public.login_attempts
  SET 
    attempt_count = v_new_count,
    last_attempt_at = now(),
    locked_until = v_locked_until,
    ip_address = COALESCE(p_ip_address, login_attempts.ip_address),
    user_agent = COALESCE(p_user_agent, login_attempts.user_agent),
    updated_at = now()
  WHERE email = LOWER(p_email);
  
  RETURN QUERY SELECT 
    v_locked_until IS NOT NULL AND v_locked_until > now(),
    v_locked_until,
    v_new_count;
END;
$function$;

-- --------------------------------------------------------
-- public.sanitize_reset_request()
-- SECURITY DEFINER  |  search_path: set
-- --------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sanitize_reset_request()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Authenticated users cannot set their own tokens - only server/service role can
  IF auth.uid() IS NOT NULL THEN
    NEW.reset_token := NULL;
    NEW.token_expires_at := NULL;
    NEW.reviewed_by := NULL;
    NEW.reviewed_at := NULL;
    NEW.rejection_reason := NULL;
    NEW.status := 'pending';
  END IF;
  RETURN NEW;
END;
$function$;

-- --------------------------------------------------------
-- public.search_contacts(search_term text, contact_type_filter text, company_filter text, job_title_filter text, tag_filter text, date_from timestamp with time zone, sort_field text, sort_direction text, page_size integer, page_offset integer)
-- SECURITY DEFINER  |  search_path: set
-- --------------------------------------------------------
CREATE OR REPLACE FUNCTION public.search_contacts(search_term text DEFAULT ''::text, contact_type_filter text DEFAULT NULL::text, company_filter text DEFAULT NULL::text, job_title_filter text DEFAULT NULL::text, tag_filter text DEFAULT NULL::text, date_from timestamp with time zone DEFAULT NULL::timestamp with time zone, sort_field text DEFAULT 'name'::text, sort_direction text DEFAULT 'asc'::text, page_size integer DEFAULT 50, page_offset integer DEFAULT 0)
 RETURNS TABLE(id uuid, name text, nickname text, surname text, job_title text, company text, phone text, email text, avatar_url text, tags text[], notes text, contact_type text, created_at timestamp with time zone, updated_at timestamp with time zone, total_count bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_total bigint;
  v_search text;
BEGIN
  v_search := COALESCE(NULLIF(TRIM(search_term), ''), NULL);
  
  -- Get total count first
  SELECT COUNT(*) INTO v_total
  FROM public.contacts c
  WHERE
    (v_search IS NULL OR (
      c.name ILIKE '%' || v_search || '%' OR
      c.nickname ILIKE '%' || v_search || '%' OR
      c.surname ILIKE '%' || v_search || '%' OR
      c.phone ILIKE '%' || v_search || '%' OR
      c.email ILIKE '%' || v_search || '%' OR
      c.company ILIKE '%' || v_search || '%' OR
      c.job_title ILIKE '%' || v_search || '%'
    ))
    AND (contact_type_filter IS NULL OR c.contact_type = contact_type_filter)
    AND (company_filter IS NULL OR c.company = company_filter)
    AND (job_title_filter IS NULL OR c.job_title = job_title_filter)
    AND (tag_filter IS NULL OR tag_filter = ANY(c.tags))
    AND (date_from IS NULL OR c.created_at >= date_from);

  RETURN QUERY
  SELECT
    c.id, c.name, c.nickname, c.surname, c.job_title, c.company,
    c.phone, c.email, c.avatar_url, c.tags, c.notes, c.contact_type,
    c.created_at, c.updated_at,
    v_total AS total_count
  FROM public.contacts c
  WHERE
    (v_search IS NULL OR (
      c.name ILIKE '%' || v_search || '%' OR
      c.nickname ILIKE '%' || v_search || '%' OR
      c.surname ILIKE '%' || v_search || '%' OR
      c.phone ILIKE '%' || v_search || '%' OR
      c.email ILIKE '%' || v_search || '%' OR
      c.company ILIKE '%' || v_search || '%' OR
      c.job_title ILIKE '%' || v_search || '%'
    ))
    AND (contact_type_filter IS NULL OR c.contact_type = contact_type_filter)
    AND (company_filter IS NULL OR c.company = company_filter)
    AND (job_title_filter IS NULL OR c.job_title = job_title_filter)
    AND (tag_filter IS NULL OR tag_filter = ANY(c.tags))
    AND (date_from IS NULL OR c.created_at >= date_from)
  ORDER BY
    CASE WHEN sort_field = 'name' AND sort_direction = 'asc' THEN c.name END ASC,
    CASE WHEN sort_field = 'name' AND sort_direction = 'desc' THEN c.name END DESC,
    CASE WHEN sort_field = 'created_at' AND sort_direction = 'asc' THEN c.created_at END ASC,
    CASE WHEN sort_field = 'created_at' AND sort_direction = 'desc' THEN c.created_at END DESC,
    CASE WHEN sort_field = 'updated_at' AND sort_direction = 'desc' THEN c.updated_at END DESC,
    c.name ASC
  LIMIT page_size
  OFFSET page_offset;
END;
$function$;

-- --------------------------------------------------------
-- public.search_knowledge_base(search_query text, max_results integer)
-- SECURITY DEFINER  |  search_path: set
-- --------------------------------------------------------
CREATE OR REPLACE FUNCTION public.search_knowledge_base(search_query text, max_results integer DEFAULT 5)
 RETURNS TABLE(id uuid, title text, content text, category text, tags text[], rank real)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT 
    a.id, a.title, a.content, a.category, a.tags,
    ts_rank(a.search_vector, websearch_to_tsquery('portuguese', search_query)) AS rank
  FROM public.knowledge_base_articles a
  WHERE a.is_published = true
    AND (
      a.search_vector @@ websearch_to_tsquery('portuguese', search_query)
      OR a.title ILIKE '%' || search_query || '%'
      OR a.content ILIKE '%' || search_query || '%'
    )
  ORDER BY rank DESC
  LIMIT max_results;
$function$;

-- --------------------------------------------------------
-- public.skill_based_assign(p_queue_id uuid)
-- SECURITY DEFINER  |  search_path: set
-- --------------------------------------------------------
CREATE OR REPLACE FUNCTION public.skill_based_assign(p_queue_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_agent_id UUID;
BEGIN
  SELECT qm.profile_id INTO v_agent_id
  FROM public.queue_members qm
  JOIN public.profiles p ON p.id = qm.profile_id
  WHERE qm.queue_id = p_queue_id
    AND qm.is_active = true
    AND p.is_active = true
    AND NOT EXISTS (
      SELECT 1 FROM public.queue_skill_requirements qsr
      WHERE qsr.queue_id = p_queue_id
      AND NOT EXISTS (
        SELECT 1 FROM public.agent_skills ags
        WHERE ags.profile_id = qm.profile_id
        AND ags.skill_name = qsr.skill_name
        AND ags.skill_level >= qsr.min_level
      )
    )
  ORDER BY (
    SELECT COUNT(*) FROM public.contacts c 
    WHERE c.assigned_to = qm.profile_id
  ) ASC
  LIMIT 1;
  
  IF v_agent_id IS NULL THEN
    SELECT qm.profile_id INTO v_agent_id
    FROM public.queue_members qm
    JOIN public.profiles p ON p.id = qm.profile_id
    WHERE qm.queue_id = p_queue_id
      AND qm.is_active = true
      AND p.is_active = true
    ORDER BY (
      SELECT COUNT(*) FROM public.contacts c 
      WHERE c.assigned_to = qm.profile_id
    ) ASC
    LIMIT 1;
  END IF;
  
  RETURN v_agent_id;
END;
$function$;

-- --------------------------------------------------------
-- public.update_agent_level()
-- SECURITY DEFINER  |  search_path: set
-- --------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_agent_level()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  NEW.level := calculate_level(NEW.xp);
  RETURN NEW;
END;
$function$;

-- --------------------------------------------------------
-- public.update_device_last_seen()
-- SECURITY INVOKER  |  search_path: set
-- --------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_device_last_seen()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
    NEW.last_seen_at = now();
    RETURN NEW;
END;
$function$;

-- --------------------------------------------------------
-- public.update_global_settings_updated_at()
-- SECURITY INVOKER  |  search_path: set
-- --------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_global_settings_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;

-- --------------------------------------------------------
-- public.update_own_profile(p_display_name text, p_avatar_url text, p_phone text, p_email text, p_signature text, p_birthday text)
-- SECURITY DEFINER  |  search_path: set
-- --------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_own_profile(p_display_name text DEFAULT NULL::text, p_avatar_url text DEFAULT NULL::text, p_phone text DEFAULT NULL::text, p_email text DEFAULT NULL::text, p_signature text DEFAULT NULL::text, p_birthday text DEFAULT NULL::text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_profile_id UUID;
BEGIN
  SELECT id INTO v_profile_id FROM profiles WHERE user_id = auth.uid();
  IF v_profile_id IS NULL THEN
    RETURN FALSE;
  END IF;

  UPDATE profiles SET
    display_name = COALESCE(p_display_name, display_name),
    avatar_url = COALESCE(p_avatar_url, avatar_url),
    phone = COALESCE(p_phone, phone),
    email = COALESCE(p_email, email),
    signature = COALESCE(p_signature, signature),
    birthday = COALESCE(p_birthday, birthday),
    updated_at = now()
  WHERE id = v_profile_id;

  RETURN TRUE;
END;
$function$;

-- --------------------------------------------------------
-- public.update_updated_at_column()
-- SECURITY INVOKER  |  search_path: set
-- --------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;

-- --------------------------------------------------------
-- public.user_has_permission(_user_id uuid, _permission_name text)
-- SECURITY DEFINER  |  search_path: set
-- --------------------------------------------------------
CREATE OR REPLACE FUNCTION public.user_has_permission(_user_id uuid, _permission_name text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 
    FROM public.user_roles ur
    JOIN public.role_permissions rp ON rp.role = ur.role
    JOIN public.permissions p ON p.id = rp.permission_id
    WHERE ur.user_id = _user_id AND p.name = _permission_name
  )
$function$;

-- --------------------------------------------------------
-- public.validate_reset_token(p_token text)
-- SECURITY DEFINER  |  search_path: set
-- --------------------------------------------------------
CREATE OR REPLACE FUNCTION public.validate_reset_token(p_token text)
 RETURNS uuid
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid;
  v_hashed text;
BEGIN
  v_hashed := encode(extensions.digest(p_token::bytea, 'sha256'), 'hex');
  
  SELECT user_id INTO v_user_id
  FROM public.password_reset_requests
  WHERE reset_token = v_hashed
    AND status = 'pending'
    AND token_expires_at > now()
  LIMIT 1;
  
  RETURN v_user_id;
END;
$function$;

-- ============================================================
-- FIM BLOCO 04
-- ============================================================