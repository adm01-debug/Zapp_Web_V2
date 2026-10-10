-- ============================================================
-- BLOCO 15 — TRIGGERS E FUNÇÕES DE GATILHO (idempotente)
-- Gerado em: 2026-05-12 11:14:01.536096+00
-- Schema: public
-- Aplicar: psql "$DESTINO_URL" -f BLOCO_15_triggers.sql
-- ============================================================
-- public.log_assignment_change
CREATE OR REPLACE FUNCTION public.log_assignment_change() RETURNS trigger LANGUAGE plpgsql AS $function$
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
-- public.normalize_contact_phone
CREATE OR REPLACE FUNCTION public.normalize_contact_phone() RETURNS trigger LANGUAGE plpgsql AS $function$
BEGIN
  IF NEW.phone IS NOT NULL THEN
    NEW.phone := regexp_replace(NEW.phone, '[^0-9]', '', 'g');
  END IF;
  RETURN NEW;
END;
$function$;
-- public.mask_channel_credentials
CREATE OR REPLACE FUNCTION public.mask_channel_credentials() RETURNS trigger LANGUAGE plpgsql AS $function$
BEGIN
  -- This is a SELECT trigger workaround - credentials masking is handled via the safe view
  RETURN NEW;
END;
$function$;
-- public.prevent_role_escalation
CREATE OR REPLACE FUNCTION public.prevent_role_escalation() RETURNS trigger LANGUAGE plpgsql AS $function$
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
-- public.notify_sicoob_on_reply
CREATE OR REPLACE FUNCTION public.notify_sicoob_on_reply() RETURNS trigger LANGUAGE plpgsql AS $function$
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
-- public.rate_limit_reset_requests
CREATE OR REPLACE FUNCTION public.rate_limit_reset_requests() RETURNS trigger LANGUAGE plpgsql AS $function$
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
-- public.prevent_profile_privilege_escalation
CREATE OR REPLACE FUNCTION public.prevent_profile_privilege_escalation() RETURNS trigger LANGUAGE plpgsql AS $function$
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
-- public.update_updated_at_column
CREATE OR REPLACE FUNCTION public.update_updated_at_column() RETURNS trigger LANGUAGE plpgsql AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;
-- public.ensure_single_default_ai_provider
CREATE OR REPLACE FUNCTION public.ensure_single_default_ai_provider() RETURNS trigger LANGUAGE plpgsql AS $function$
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
-- public.ensure_single_default_filter
CREATE OR REPLACE FUNCTION public.ensure_single_default_filter() RETURNS trigger LANGUAGE plpgsql AS $function$
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
-- public.sanitize_reset_request
CREATE OR REPLACE FUNCTION public.sanitize_reset_request() RETURNS trigger LANGUAGE plpgsql AS $function$
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
-- public.audit_role_changes
CREATE OR REPLACE FUNCTION public.audit_role_changes() RETURNS trigger LANGUAGE plpgsql AS $function$
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
-- public.auto_assign_contact
CREATE OR REPLACE FUNCTION public.auto_assign_contact() RETURNS trigger LANGUAGE plpgsql AS $function$
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
-- public.update_agent_level
CREATE OR REPLACE FUNCTION public.update_agent_level() RETURNS trigger LANGUAGE plpgsql AS $function$
BEGIN
  NEW.level := calculate_level(NEW.xp);
  RETURN NEW;
END;
$function$;
-- public.update_global_settings_updated_at
CREATE OR REPLACE FUNCTION public.update_global_settings_updated_at() RETURNS trigger LANGUAGE plpgsql AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;
-- public.auto_assign_to_queue_agent
CREATE OR REPLACE FUNCTION public.auto_assign_to_queue_agent() RETURNS trigger LANGUAGE plpgsql AS $function$
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
-- public.clear_qr_on_connect
CREATE OR REPLACE FUNCTION public.clear_qr_on_connect() RETURNS trigger LANGUAGE plpgsql AS $function$
BEGIN
  IF NEW.status = 'connected' AND OLD.status != 'connected' AND NEW.qr_code IS NOT NULL THEN
    NEW.qr_code := NULL;
  END IF;
  RETURN NEW;
END;
$function$;
-- public.handle_new_user_role
CREATE OR REPLACE FUNCTION public.handle_new_user_role() RETURNS trigger LANGUAGE plpgsql AS $function$
BEGIN
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'agent');
  RETURN NEW;
END;
$function$;
-- public.init_agent_stats
CREATE OR REPLACE FUNCTION public.init_agent_stats() RETURNS trigger LANGUAGE plpgsql AS $function$
BEGIN
  INSERT INTO public.agent_stats (profile_id)
  VALUES (NEW.id)
  ON CONFLICT (profile_id) DO NOTHING;
  RETURN NEW;
END;
$function$;
-- public.update_device_last_seen
CREATE OR REPLACE FUNCTION public.update_device_last_seen() RETURNS trigger LANGUAGE plpgsql AS $function$
BEGIN
    NEW.last_seen_at = now();
    RETURN NEW;
END;
$function$;
-- public.handle_new_user
CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS trigger LANGUAGE plpgsql AS $function$
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
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'audit_user_role_changes' AND tgrelid = 'public.user_roles'::regclass) THEN
        CREATE TRIGGER audit_user_role_changes AFTER INSERT OR DELETE OR UPDATE ON public.user_roles FOR EACH ROW EXECUTE FUNCTION audit_role_changes();
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'clear_qr_on_connect_trigger' AND tgrelid = 'public.whatsapp_connections'::regclass) THEN
        CREATE TRIGGER clear_qr_on_connect_trigger BEFORE UPDATE OF status ON public.whatsapp_connections FOR EACH ROW EXECUTE FUNCTION clear_qr_on_connect();
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'ensure_single_default_ai_provider' AND tgrelid = 'public.ai_providers'::regclass) THEN
        CREATE TRIGGER ensure_single_default_ai_provider BEFORE INSERT OR UPDATE ON public.ai_providers FOR EACH ROW EXECUTE FUNCTION ensure_single_default_ai_provider();
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'ensure_single_default_filter_trigger' AND tgrelid = 'public.saved_filters'::regclass) THEN
        CREATE TRIGGER ensure_single_default_filter_trigger BEFORE INSERT OR UPDATE ON public.saved_filters FOR EACH ROW EXECUTE FUNCTION ensure_single_default_filter();
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'on_agent_stats_update_level' AND tgrelid = 'public.agent_stats'::regclass) THEN
        CREATE TRIGGER on_agent_stats_update_level BEFORE UPDATE OF xp ON public.agent_stats FOR EACH ROW EXECUTE FUNCTION update_agent_level();
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'on_contact_created_auto_assign' AND tgrelid = 'public.contacts'::regclass) THEN
        CREATE TRIGGER on_contact_created_auto_assign BEFORE INSERT ON public.contacts FOR EACH ROW EXECUTE FUNCTION auto_assign_contact();
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'on_contact_queue_auto_assign' AND tgrelid = 'public.contacts'::regclass) THEN
        CREATE TRIGGER on_contact_queue_auto_assign BEFORE INSERT ON public.contacts FOR EACH ROW EXECUTE FUNCTION auto_assign_to_queue_agent();
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'on_device_update_last_seen' AND tgrelid = 'public.user_devices'::regclass) THEN
        CREATE TRIGGER on_device_update_last_seen BEFORE UPDATE ON public.user_devices FOR EACH ROW EXECUTE FUNCTION update_device_last_seen();
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'on_profile_created_init_stats' AND tgrelid = 'public.profiles'::regclass) THEN
        CREATE TRIGGER on_profile_created_init_stats AFTER INSERT ON public.profiles FOR EACH ROW EXECUTE FUNCTION init_agent_stats();
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'on_profile_update_prevent_escalation' AND tgrelid = 'public.profiles'::regclass) THEN
        CREATE TRIGGER on_profile_update_prevent_escalation BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION prevent_role_escalation();
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'prevent_privilege_escalation' AND tgrelid = 'public.profiles'::regclass) THEN
        CREATE TRIGGER prevent_privilege_escalation BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION prevent_profile_privilege_escalation();
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'sanitize_reset_request_trigger' AND tgrelid = 'public.password_reset_requests'::regclass) THEN
        CREATE TRIGGER sanitize_reset_request_trigger BEFORE INSERT ON public.password_reset_requests FOR EACH ROW EXECUTE FUNCTION sanitize_reset_request();
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_log_assignment_change' AND tgrelid = 'public.contacts'::regclass) THEN
        CREATE TRIGGER trg_log_assignment_change AFTER UPDATE ON public.contacts FOR EACH ROW EXECUTE FUNCTION log_assignment_change();
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_normalize_contact_phone' AND tgrelid = 'public.contacts'::regclass) THEN
        CREATE TRIGGER trg_normalize_contact_phone BEFORE INSERT OR UPDATE OF phone ON public.contacts FOR EACH ROW EXECUTE FUNCTION normalize_contact_phone();
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_rate_limit_reset' AND tgrelid = 'public.password_reset_requests'::regclass) THEN
        CREATE TRIGGER trg_rate_limit_reset BEFORE INSERT ON public.password_reset_requests FOR EACH ROW EXECUTE FUNCTION rate_limit_reset_requests();
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_sicoob_reply' AND tgrelid = 'public.messages'::regclass) THEN
        CREATE TRIGGER trg_sicoob_reply AFTER INSERT ON public.messages FOR EACH ROW EXECUTE FUNCTION notify_sicoob_on_reply();
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trigger_global_settings_updated_at' AND tgrelid = 'public.global_settings'::regclass) THEN
        CREATE TRIGGER trigger_global_settings_updated_at BEFORE UPDATE ON public.global_settings FOR EACH ROW EXECUTE FUNCTION update_global_settings_updated_at();
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_agent_stats_updated_at' AND tgrelid = 'public.agent_stats'::regclass) THEN
        CREATE TRIGGER update_agent_stats_updated_at BEFORE UPDATE ON public.agent_stats FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_ai_providers_updated_at' AND tgrelid = 'public.ai_providers'::regclass) THEN
        CREATE TRIGGER update_ai_providers_updated_at BEFORE UPDATE ON public.ai_providers FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_auto_close_config_updated_at' AND tgrelid = 'public.auto_close_config'::regclass) THEN
        CREATE TRIGGER update_auto_close_config_updated_at BEFORE UPDATE ON public.auto_close_config FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_automations_updated_at' AND tgrelid = 'public.automations'::regclass) THEN
        CREATE TRIGGER update_automations_updated_at BEFORE UPDATE ON public.automations FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_away_messages_updated_at' AND tgrelid = 'public.away_messages'::regclass) THEN
        CREATE TRIGGER update_away_messages_updated_at BEFORE UPDATE ON public.away_messages FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_business_hours_updated_at' AND tgrelid = 'public.business_hours'::regclass) THEN
        CREATE TRIGGER update_business_hours_updated_at BEFORE UPDATE ON public.business_hours FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_campaigns_updated_at' AND tgrelid = 'public.campaigns'::regclass) THEN
        CREATE TRIGGER update_campaigns_updated_at BEFORE UPDATE ON public.campaigns FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_channel_connections_updated_at' AND tgrelid = 'public.channel_connections'::regclass) THEN
        CREATE TRIGGER update_channel_connections_updated_at BEFORE UPDATE ON public.channel_connections FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_chatbot_flows_updated_at' AND tgrelid = 'public.chatbot_flows'::regclass) THEN
        CREATE TRIGGER update_chatbot_flows_updated_at BEFORE UPDATE ON public.chatbot_flows FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_contact_custom_fields_updated_at' AND tgrelid = 'public.contact_custom_fields'::regclass) THEN
        CREATE TRIGGER update_contact_custom_fields_updated_at BEFORE UPDATE ON public.contact_custom_fields FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_contact_notes_updated_at' AND tgrelid = 'public.contact_notes'::regclass) THEN
        CREATE TRIGGER update_contact_notes_updated_at BEFORE UPDATE ON public.contact_notes FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_contact_purchases_updated_at' AND tgrelid = 'public.contact_purchases'::regclass) THEN
        CREATE TRIGGER update_contact_purchases_updated_at BEFORE UPDATE ON public.contact_purchases FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_contacts_updated_at' AND tgrelid = 'public.contacts'::regclass) THEN
        CREATE TRIGGER update_contacts_updated_at BEFORE UPDATE ON public.contacts FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_conversation_memory_updated_at' AND tgrelid = 'public.conversation_memory'::regclass) THEN
        CREATE TRIGGER update_conversation_memory_updated_at BEFORE UPDATE ON public.conversation_memory FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_conversation_sla_updated_at' AND tgrelid = 'public.conversation_sla'::regclass) THEN
        CREATE TRIGGER update_conversation_sla_updated_at BEFORE UPDATE ON public.conversation_sla FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_conversation_tasks_updated_at' AND tgrelid = 'public.conversation_tasks'::regclass) THEN
        CREATE TRIGGER update_conversation_tasks_updated_at BEFORE UPDATE ON public.conversation_tasks FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_email_threads_updated_at' AND tgrelid = 'public.email_threads'::regclass) THEN
        CREATE TRIGGER update_email_threads_updated_at BEFORE UPDATE ON public.email_threads FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_geo_blocking_settings_updated_at' AND tgrelid = 'public.geo_blocking_settings'::regclass) THEN
        CREATE TRIGGER update_geo_blocking_settings_updated_at BEFORE UPDATE ON public.geo_blocking_settings FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_gmail_accounts_updated_at' AND tgrelid = 'public.gmail_accounts'::regclass) THEN
        CREATE TRIGGER update_gmail_accounts_updated_at BEFORE UPDATE ON public.gmail_accounts FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_goals_configurations_updated_at' AND tgrelid = 'public.goals_configurations'::regclass) THEN
        CREATE TRIGGER update_goals_configurations_updated_at BEFORE UPDATE ON public.goals_configurations FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_kb_articles_updated_at' AND tgrelid = 'public.knowledge_base_articles'::regclass) THEN
        CREATE TRIGGER update_kb_articles_updated_at BEFORE UPDATE ON public.knowledge_base_articles FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_level_on_xp_change' AND tgrelid = 'public.agent_stats'::regclass) THEN
        CREATE TRIGGER update_level_on_xp_change BEFORE INSERT OR UPDATE OF xp ON public.agent_stats FOR EACH ROW EXECUTE FUNCTION update_agent_level();
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_message_templates_updated_at' AND tgrelid = 'public.message_templates'::regclass) THEN
        CREATE TRIGGER update_message_templates_updated_at BEFORE UPDATE ON public.message_templates FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_messages_updated_at' AND tgrelid = 'public.messages'::regclass) THEN
        CREATE TRIGGER update_messages_updated_at BEFORE UPDATE ON public.messages FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_number_reputation_updated_at' AND tgrelid = 'public.number_reputation'::regclass) THEN
        CREATE TRIGGER update_number_reputation_updated_at BEFORE UPDATE ON public.number_reputation FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_payment_links_updated_at' AND tgrelid = 'public.payment_links'::regclass) THEN
        CREATE TRIGGER update_payment_links_updated_at BEFORE UPDATE ON public.payment_links FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_pipeline_stages_updated_at' AND tgrelid = 'public.sales_pipeline_stages'::regclass) THEN
        CREATE TRIGGER update_pipeline_stages_updated_at BEFORE UPDATE ON public.sales_pipeline_stages FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_playbooks_updated_at' AND tgrelid = 'public.playbooks'::regclass) THEN
        CREATE TRIGGER update_playbooks_updated_at BEFORE UPDATE ON public.playbooks FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_products_updated_at' AND tgrelid = 'public.products'::regclass) THEN
        CREATE TRIGGER update_products_updated_at BEFORE UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_profiles_updated_at' AND tgrelid = 'public.profiles'::regclass) THEN
        CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_queue_goals_updated_at' AND tgrelid = 'public.queue_goals'::regclass) THEN
        CREATE TRIGGER update_queue_goals_updated_at BEFORE UPDATE ON public.queue_goals FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_queues_updated_at' AND tgrelid = 'public.queues'::regclass) THEN
        CREATE TRIGGER update_queues_updated_at BEFORE UPDATE ON public.queues FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_rate_limit_configs_updated_at' AND tgrelid = 'public.rate_limit_configs'::regclass) THEN
        CREATE TRIGGER update_rate_limit_configs_updated_at BEFORE UPDATE ON public.rate_limit_configs FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_sales_deals_updated_at' AND tgrelid = 'public.sales_deals'::regclass) THEN
        CREATE TRIGGER update_sales_deals_updated_at BEFORE UPDATE ON public.sales_deals FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_saved_filters_updated_at' AND tgrelid = 'public.saved_filters'::regclass) THEN
        CREATE TRIGGER update_saved_filters_updated_at BEFORE UPDATE ON public.saved_filters FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_scheduled_messages_updated_at' AND tgrelid = 'public.scheduled_messages'::regclass) THEN
        CREATE TRIGGER update_scheduled_messages_updated_at BEFORE UPDATE ON public.scheduled_messages FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_scheduled_report_configs_updated_at' AND tgrelid = 'public.scheduled_report_configs'::regclass) THEN
        CREATE TRIGGER update_scheduled_report_configs_updated_at BEFORE UPDATE ON public.scheduled_report_configs FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_scheduled_reports_updated_at' AND tgrelid = 'public.scheduled_reports'::regclass) THEN
        CREATE TRIGGER update_scheduled_reports_updated_at BEFORE UPDATE ON public.scheduled_reports FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_sla_configurations_updated_at' AND tgrelid = 'public.sla_configurations'::regclass) THEN
        CREATE TRIGGER update_sla_configurations_updated_at BEFORE UPDATE ON public.sla_configurations FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_sla_rules_updated_at' AND tgrelid = 'public.sla_rules'::regclass) THEN
        CREATE TRIGGER update_sla_rules_updated_at BEFORE UPDATE ON public.sla_rules FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_tags_updated_at' AND tgrelid = 'public.tags'::regclass) THEN
        CREATE TRIGGER update_tags_updated_at BEFORE UPDATE ON public.tags FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_talkx_campaigns_updated_at' AND tgrelid = 'public.talkx_campaigns'::regclass) THEN
        CREATE TRIGGER update_talkx_campaigns_updated_at BEFORE UPDATE ON public.talkx_campaigns FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_talkx_recipients_updated_at' AND tgrelid = 'public.talkx_recipients'::regclass) THEN
        CREATE TRIGGER update_talkx_recipients_updated_at BEFORE UPDATE ON public.talkx_recipients FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_team_conversations_updated_at' AND tgrelid = 'public.team_conversations'::regclass) THEN
        CREATE TRIGGER update_team_conversations_updated_at BEFORE UPDATE ON public.team_conversations FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_team_messages_updated_at' AND tgrelid = 'public.team_messages'::regclass) THEN
        CREATE TRIGGER update_team_messages_updated_at BEFORE UPDATE ON public.team_messages FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_user_devices_last_seen' AND tgrelid = 'public.user_devices'::regclass) THEN
        CREATE TRIGGER update_user_devices_last_seen BEFORE UPDATE ON public.user_devices FOR EACH ROW EXECUTE FUNCTION update_device_last_seen();
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_user_service_accounts_updated_at' AND tgrelid = 'public.user_service_accounts'::regclass) THEN
        CREATE TRIGGER update_user_service_accounts_updated_at BEFORE UPDATE ON public.user_service_accounts FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_user_settings_updated_at' AND tgrelid = 'public.user_settings'::regclass) THEN
        CREATE TRIGGER update_user_settings_updated_at BEFORE UPDATE ON public.user_settings FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_whatsapp_connections_updated_at' AND tgrelid = 'public.whatsapp_connections'::regclass) THEN
        CREATE TRIGGER update_whatsapp_connections_updated_at BEFORE UPDATE ON public.whatsapp_connections FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_whatsapp_flows_updated_at' AND tgrelid = 'public.whatsapp_flows'::regclass) THEN
        CREATE TRIGGER update_whatsapp_flows_updated_at BEFORE UPDATE ON public.whatsapp_flows FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_whatsapp_groups_updated_at' AND tgrelid = 'public.whatsapp_groups'::regclass) THEN
        CREATE TRIGGER update_whatsapp_groups_updated_at BEFORE UPDATE ON public.whatsapp_groups FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
END $$;
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_whatsapp_templates_updated_at' AND tgrelid = 'public.whatsapp_templates'::regclass) THEN
        CREATE TRIGGER update_whatsapp_templates_updated_at BEFORE UPDATE ON public.whatsapp_templates FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
END $$;
