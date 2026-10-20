-- ═══════════════════════════════════════════════════════════════════════════════
-- BLOCO 8 — VIEWS / MATERIALIZED VIEWS (8 views)
-- ═══════════════════════════════════════════════════════════════════════════════
-- Idempotente: DROP VIEW IF EXISTS + CREATE OR REPLACE VIEW
-- Ordem: alfabética por nome da view
-- ═══════════════════════════════════════════════════════════════════════════════
-- PRÉ-REQUISITO: BLOCOS 1 a 7 aplicados.
-- ═══════════════════════════════════════════════════════════════════════════════

DROP VIEW IF EXISTS public.channel_connections_safe CASCADE;
CREATE OR REPLACE VIEW public.channel_connections_safe AS  SELECT id,
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
   FROM channel_connections;

DROP VIEW IF EXISTS public.gmail_accounts_safe CASCADE;
CREATE OR REPLACE VIEW public.gmail_accounts_safe AS  SELECT id,
    user_id,
    email_address,
    is_active,
    sync_status,
    last_sync_at,
    last_error,
    token_expires_at,
    created_at,
    updated_at
   FROM gmail_accounts;

DROP VIEW IF EXISTS public.password_reset_requests_safe CASCADE;
CREATE OR REPLACE VIEW public.password_reset_requests_safe AS  SELECT id,
    user_id,
    email,
    reason,
    status,
    reviewed_by,
    reviewed_at,
    rejection_reason,
    token_expires_at,
    ip_address,
    user_agent,
    created_at,
    updated_at
   FROM password_reset_requests;

DROP VIEW IF EXISTS public.profiles_public CASCADE;
CREATE OR REPLACE VIEW public.profiles_public AS  SELECT id,
    user_id,
    name,
    avatar_url,
    is_active,
    department,
    job_title
   FROM profiles;

DROP VIEW IF EXISTS public.whatsapp_connections_agent CASCADE;
CREATE OR REPLACE VIEW public.whatsapp_connections_agent AS  SELECT id,
    name,
    status,
    phone_number,
    is_default
   FROM whatsapp_connections;

DROP VIEW IF EXISTS public.whatsapp_connections_public CASCADE;
CREATE OR REPLACE VIEW public.whatsapp_connections_public AS  SELECT id,
    name,
    status,
    is_default
   FROM whatsapp_connections;

DROP VIEW IF EXISTS public.whatsapp_connections_safe CASCADE;
CREATE OR REPLACE VIEW public.whatsapp_connections_safe AS  SELECT id,
    name,
    phone_number,
    status,
    is_default,
        CASE
            WHEN has_role(auth.uid(), 'admin'::app_role) THEN qr_code
            ELSE NULL::text
        END AS qr_code,
        CASE
            WHEN has_role(auth.uid(), 'admin'::app_role) THEN instance_id
            ELSE NULL::text
        END AS instance_id,
    farewell_message,
    farewell_enabled,
    battery_level,
    is_plugged,
    retry_count,
    max_retries,
    last_health_check,
    health_status,
    health_response_ms,
    created_by,
    created_at,
    updated_at
   FROM whatsapp_connections;


-- ═══════════════════════════════════════════════════════════════════════════════
-- FIM DO BLOCO 8 — 8 views exportadas
-- ═══════════════════════════════════════════════════════════════════════════════
