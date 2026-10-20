CREATE OR REPLACE FUNCTION public.set_conversation_status(p_contact_id UUID, p_next TEXT, p_reason TEXT DEFAULT NULL) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $$ DECLARE v_current TEXT; v_allowed BOOLEAN := FALSE; BEGIN SELECT conversation_status INTO v_current FROM public.contacts WHERE id = p_contact_id FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'contact not found: %', p_contact_id; END IF; IF v_current = 'open' AND p_next IN ('waiting', 'resolved', 'archived') THEN v_allowed := TRUE; END IF; IF v_current = 'waiting' AND p_next IN ('open', 'resolved') THEN v_allowed := TRUE; END IF; IF v_current = 'resolved' AND p_next IN ('open', 'archived') THEN v_allowed := TRUE; END IF; IF v_current = 'archived' AND p_next = 'open' THEN v_allowed := TRUE; END IF; IF NOT v_allowed THEN RAISE EXCEPTION 'invalid transition % -> %', v_current, p_next; END IF; UPDATE public.contacts SET conversation_status = p_next, conversation_status_changed_at = NOW() WHERE id = p_contact_id; IF p_next = 'resolved' THEN INSERT INTO public.conversation_closures (contact_id, close_reason) VALUES (p_contact_id, COALESCE(p_reason, 'resolved')) ON CONFLICT DO NOTHING; END IF; END; $$;

CREATE OR REPLACE FUNCTION public.record_failed_login(p_email TEXT, p_ip_address TEXT DEFAULT NULL, p_user_agent TEXT DEFAULT NULL) RETURNS TABLE(is_locked BOOLEAN, locked_until TIMESTAMP WITH TIME ZONE, attempts INTEGER) LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$ DECLARE v_new_count INTEGER; v_locked_until TIMESTAMP WITH TIME ZONE; v_max_attempts CONSTANT INTEGER := 5; BEGIN INSERT INTO public.login_attempts AS la (email, ip_address, user_agent, attempt_count, last_attempt_at, updated_at) VALUES (LOWER(p_email), p_ip_address, p_user_agent, 1, now(), now()) ON CONFLICT (email) DO UPDATE SET attempt_count = CASE WHEN la.locked_until IS NOT NULL AND la.locked_until > now() THEN la.attempt_count WHEN la.locked_until IS NOT NULL AND la.locked_until <= now() THEN 1 ELSE LEAST(la.attempt_count + 1, 10000) END, locked_until = CASE WHEN la.locked_until IS NOT NULL AND la.locked_until <= now() THEN NULL ELSE la.locked_until END, last_attempt_at = now(), ip_address = COALESCE(EXCLUDED.ip_address, la.ip_address), user_agent = COALESCE(EXCLUDED.user_agent, la.user_agent), updated_at = now() RETURNING la.attempt_count, la.locked_until INTO v_new_count, v_locked_until; IF v_locked_until IS NULL AND v_new_count >= v_max_attempts THEN v_locked_until := now() + (POWER(2, LEAST(v_new_count - v_max_attempts, 10))::INTEGER * INTERVAL '1 minute'); UPDATE public.login_attempts SET locked_until = v_locked_until, updated_at = now() WHERE email = LOWER(p_email); END IF; RETURN QUERY SELECT (v_locked_until IS NOT NULL AND v_locked_until > now()), v_locked_until, v_new_count; END; $$;

DROP POLICY IF EXISTS "Service role only for gmail accounts" ON public.gmail_accounts;

DROP POLICY IF EXISTS "service_role_full_access" ON public.contact_identity_map;

DROP POLICY IF EXISTS "Service role can manage sicoob mappings" ON public.sicoob_contact_mapping;

DROP POLICY IF EXISTS "service_role_full" ON public.webhook_failures;

DROP POLICY IF EXISTS "service_role manages link preview cache" ON public.link_preview_cache;

CREATE INDEX IF NOT EXISTS idx_calls_answered_by ON public.calls (answered_by) WHERE answered_by IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_email_threads_gmail_account_id ON public.email_threads (gmail_account_id);

CREATE INDEX IF NOT EXISTS idx_talkx_campaign_events_campaign_id ON public.talkx_campaign_events (campaign_id);

CREATE INDEX IF NOT EXISTS idx_talkx_link_clicks_link_id ON public.talkx_link_clicks (link_id);

CREATE INDEX IF NOT EXISTS idx_talkx_template_versions_template_id ON public.talkx_template_versions (template_id);

REVOKE EXECUTE ON FUNCTION public.talkx_campaign_report(uuid) FROM anon;

REVOKE EXECUTE ON FUNCTION public.talkx_overview_stats(timestamptz, timestamptz) FROM anon;

REVOKE EXECUTE ON FUNCTION public.talkx_segment_tags(uuid) FROM anon;

GRANT EXECUTE ON FUNCTION public.talkx_campaign_report(uuid) TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.talkx_overview_stats(timestamptz, timestamptz) TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.talkx_segment_tags(uuid) TO authenticated, service_role;
