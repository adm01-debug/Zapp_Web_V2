-- ============================================================
-- BLOCO 01 — SCHEMA COMPLETO (idempotente, ordem de aplicação)
-- Gerado em: 2026-05-12 11:18:53.788099+00
-- Schema: public
-- 
-- Este arquivo contém o schema completo consolidado:
--   1. Extensions
--   2. Types / Enums
--   3. Tables (CREATE + columns + RLS enable)
--   4. Constraints (PK, UNIQUE, CHECK)
--   5. Indexes
--   6. Foreign Keys
--   7. Functions (utilitárias e de gatilho)
--   8. Triggers
--   9. Views
--  10. RLS Policies
--
-- Aplicar no destino:
--   psql "$DESTINO_URL" -f BLOCO_01_schema_completo.sql
--
-- Alternativa (modular): aplicar BLOCO_11 → BLOCO_12 → BLOCO_13
--                        → BLOCO_10 → BLOCO_05 → BLOCO_08 → BLOCO_09
-- ============================================================


-- ============================================================
-- 1. EXTENSIONS
-- ============================================================
CREATE EXTENSION IF NOT EXISTS "pg_stat_statements";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "supabase_vault";
CREATE EXTENSION IF NOT EXISTS "pg_cron";
CREATE EXTENSION IF NOT EXISTS "pg_net";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- ============================================================
-- 2. TYPES / ENUMS
-- ============================================================
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE t.typname='ai_provider_type' AND n.nspname='public') THEN
        CREATE TYPE public.ai_provider_type AS ENUM ('lovable_ai','openai_compatible','google_gemini','custom_webhook','custom_agent');
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE t.typname='app_role' AND n.nspname='public') THEN
        CREATE TYPE public.app_role AS ENUM ('admin','supervisor','agent','special_agent');
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE t.typname='channel_type' AND n.nspname='public') THEN
        CREATE TYPE public.channel_type AS ENUM ('whatsapp','instagram','telegram','messenger','webchat','email');
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE t.typname='service_account_type' AND n.nspname='public') THEN
        CREATE TYPE public.service_account_type AS ENUM ('google_sheets','google_docs','google_calendar','google_drive','dropbox');
    END IF;
END $$;
ALTER TYPE public.ai_provider_type ADD VALUE IF NOT EXISTS 'lovable_ai';
ALTER TYPE public.ai_provider_type ADD VALUE IF NOT EXISTS 'openai_compatible';
ALTER TYPE public.ai_provider_type ADD VALUE IF NOT EXISTS 'google_gemini';
ALTER TYPE public.ai_provider_type ADD VALUE IF NOT EXISTS 'custom_webhook';
ALTER TYPE public.ai_provider_type ADD VALUE IF NOT EXISTS 'custom_agent';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'admin';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'supervisor';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'agent';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'special_agent';
ALTER TYPE public.channel_type ADD VALUE IF NOT EXISTS 'whatsapp';
ALTER TYPE public.channel_type ADD VALUE IF NOT EXISTS 'instagram';
ALTER TYPE public.channel_type ADD VALUE IF NOT EXISTS 'telegram';
ALTER TYPE public.channel_type ADD VALUE IF NOT EXISTS 'messenger';
ALTER TYPE public.channel_type ADD VALUE IF NOT EXISTS 'webchat';
ALTER TYPE public.channel_type ADD VALUE IF NOT EXISTS 'email';
ALTER TYPE public.service_account_type ADD VALUE IF NOT EXISTS 'google_sheets';
ALTER TYPE public.service_account_type ADD VALUE IF NOT EXISTS 'google_docs';
ALTER TYPE public.service_account_type ADD VALUE IF NOT EXISTS 'google_calendar';
ALTER TYPE public.service_account_type ADD VALUE IF NOT EXISTS 'google_drive';
ALTER TYPE public.service_account_type ADD VALUE IF NOT EXISTS 'dropbox';

-- ============================================================
-- 3. TABLES
-- ============================================================
CREATE TABLE IF NOT EXISTS public.whatsapp_connection_queues ();
CREATE TABLE IF NOT EXISTS public.messages ();
CREATE TABLE IF NOT EXISTS public.conversation_memory ();
CREATE TABLE IF NOT EXISTS public.whatsapp_groups ();
CREATE TABLE IF NOT EXISTS public.conversation_sla ();
CREATE TABLE IF NOT EXISTS public.performance_snapshots ();
CREATE TABLE IF NOT EXISTS public.permissions ();
CREATE TABLE IF NOT EXISTS public.nps_surveys ();
CREATE TABLE IF NOT EXISTS public.csat_surveys ();
CREATE TABLE IF NOT EXISTS public.talkx_blacklist ();
CREATE TABLE IF NOT EXISTS public.agent_skills ();
CREATE TABLE IF NOT EXISTS public.whatsapp_connections ();
CREATE TABLE IF NOT EXISTS public.scheduled_reports ();
CREATE TABLE IF NOT EXISTS public.crisis_room_alerts ();
CREATE TABLE IF NOT EXISTS public.whisper_messages ();
CREATE TABLE IF NOT EXISTS public.contact_purchases ();
CREATE TABLE IF NOT EXISTS public.contact_tags ();
CREATE TABLE IF NOT EXISTS public.whatsapp_flows ();
CREATE TABLE IF NOT EXISTS public.meta_capi_events ();
CREATE TABLE IF NOT EXISTS public.custom_emojis ();
CREATE TABLE IF NOT EXISTS public.calls ();
CREATE TABLE IF NOT EXISTS public.favorite_contacts ();
CREATE TABLE IF NOT EXISTS public.followup_steps ();
CREATE TABLE IF NOT EXISTS public.geo_blocking_settings ();
CREATE TABLE IF NOT EXISTS public.mfa_sessions ();
CREATE TABLE IF NOT EXISTS public.pinned_conversations ();
CREATE TABLE IF NOT EXISTS public.playbooks ();
CREATE TABLE IF NOT EXISTS public.email_threads ();
CREATE TABLE IF NOT EXISTS public.entity_versions ();
CREATE TABLE IF NOT EXISTS public.global_settings ();
CREATE TABLE IF NOT EXISTS public.conversation_events ();
CREATE TABLE IF NOT EXISTS public.scheduled_messages ();
CREATE TABLE IF NOT EXISTS public.scheduled_report_configs ();
CREATE TABLE IF NOT EXISTS public.webauthn_challenges ();
CREATE TABLE IF NOT EXISTS public.webhook_rate_limits ();
CREATE TABLE IF NOT EXISTS public.sales_pipeline_stages ();
CREATE TABLE IF NOT EXISTS public.contact_custom_fields ();
CREATE TABLE IF NOT EXISTS public.campaign_contacts ();
CREATE TABLE IF NOT EXISTS public.campaigns ();
CREATE TABLE IF NOT EXISTS public.contact_notes ();
CREATE TABLE IF NOT EXISTS public.agent_achievements ();
CREATE TABLE IF NOT EXISTS public.team_conversation_members ();
CREATE TABLE IF NOT EXISTS public.message_reactions ();
CREATE TABLE IF NOT EXISTS public.message_templates ();
CREATE TABLE IF NOT EXISTS public.ai_conversation_tags ();
CREATE TABLE IF NOT EXISTS public.goals_configurations ();
CREATE TABLE IF NOT EXISTS public.ip_whitelist ();
CREATE TABLE IF NOT EXISTS public.knowledge_base_articles ();
CREATE TABLE IF NOT EXISTS public.notifications ();
CREATE TABLE IF NOT EXISTS public.queue_goals ();
CREATE TABLE IF NOT EXISTS public.queue_members ();
CREATE TABLE IF NOT EXISTS public.queue_positions ();
CREATE TABLE IF NOT EXISTS public.queue_skill_requirements ();
CREATE TABLE IF NOT EXISTS public.conversation_closures ();
CREATE TABLE IF NOT EXISTS public.automations ();
CREATE TABLE IF NOT EXISTS public.voice_command_logs ();
CREATE TABLE IF NOT EXISTS public.campaign_ab_variants ();
CREATE TABLE IF NOT EXISTS public.conversation_tasks ();
CREATE TABLE IF NOT EXISTS public.channel_connections ();
CREATE TABLE IF NOT EXISTS public.csat_auto_config ();
CREATE TABLE IF NOT EXISTS public.followup_executions ();
CREATE TABLE IF NOT EXISTS public.followup_sequences ();
CREATE TABLE IF NOT EXISTS public.whatsapp_templates ();
CREATE TABLE IF NOT EXISTS public.knowledge_base_files ();
CREATE TABLE IF NOT EXISTS public.rate_limit_configs ();
CREATE TABLE IF NOT EXISTS public.chatbot_executions ();
CREATE TABLE IF NOT EXISTS public.sales_deals ();
CREATE TABLE IF NOT EXISTS public.agent_stats ();
CREATE TABLE IF NOT EXISTS public.sicoob_contact_mapping ();
CREATE TABLE IF NOT EXISTS public.sla_configurations ();
CREATE TABLE IF NOT EXISTS public.reminders ();
CREATE TABLE IF NOT EXISTS public.role_permissions ();
CREATE TABLE IF NOT EXISTS public.user_roles ();
CREATE TABLE IF NOT EXISTS public.user_service_accounts ();
CREATE TABLE IF NOT EXISTS public.warroom_alerts ();
CREATE TABLE IF NOT EXISTS public.deal_activities ();
CREATE TABLE IF NOT EXISTS public.email_labels ();
CREATE TABLE IF NOT EXISTS public.sla_rules ();
CREATE TABLE IF NOT EXISTS public.stickers ();
CREATE TABLE IF NOT EXISTS public.away_messages ();
CREATE TABLE IF NOT EXISTS public.blocked_countries ();
CREATE TABLE IF NOT EXISTS public.blocked_ips ();
CREATE TABLE IF NOT EXISTS public.business_hours ();
CREATE TABLE IF NOT EXISTS public.team_messages ();
CREATE TABLE IF NOT EXISTS public.training_sessions ();
CREATE TABLE IF NOT EXISTS public.auto_close_config ();
CREATE TABLE IF NOT EXISTS public.email_messages ();
CREATE TABLE IF NOT EXISTS public.user_devices ();
CREATE TABLE IF NOT EXISTS public.user_settings ();
CREATE TABLE IF NOT EXISTS public.user_sessions ();
CREATE TABLE IF NOT EXISTS public.connection_health_logs ();
CREATE TABLE IF NOT EXISTS public.allowed_countries ();
CREATE TABLE IF NOT EXISTS public.audio_memes ();
CREATE TABLE IF NOT EXISTS public.audit_logs ();
CREATE TABLE IF NOT EXISTS public.chatbot_flows ();
CREATE TABLE IF NOT EXISTS public.client_wallet_rules ();
CREATE TABLE IF NOT EXISTS public.queues ();
CREATE TABLE IF NOT EXISTS public.payment_links ();
CREATE TABLE IF NOT EXISTS public.products ();
CREATE TABLE IF NOT EXISTS public.team_conversations ();
CREATE TABLE IF NOT EXISTS public.login_attempts ();
CREATE TABLE IF NOT EXISTS public.conversation_snoozes ();
CREATE TABLE IF NOT EXISTS public.profiles ();
CREATE TABLE IF NOT EXISTS public.query_telemetry ();
CREATE TABLE IF NOT EXISTS public.agent_visibility_grants ();
CREATE TABLE IF NOT EXISTS public.contacts ();
CREATE TABLE IF NOT EXISTS public.conversation_analyses ();
CREATE TABLE IF NOT EXISTS public.tags ();
CREATE TABLE IF NOT EXISTS public.talkx_campaigns ();
CREATE TABLE IF NOT EXISTS public.talkx_recipients ();
CREATE TABLE IF NOT EXISTS public.number_reputation ();
CREATE TABLE IF NOT EXISTS public.passkey_credentials ();
CREATE TABLE IF NOT EXISTS public.password_reset_requests ();
CREATE TABLE IF NOT EXISTS public.rate_limit_logs ();
CREATE TABLE IF NOT EXISTS public.ai_providers ();
CREATE TABLE IF NOT EXISTS public.ai_usage_logs ();
CREATE TABLE IF NOT EXISTS public.security_alerts ();
CREATE TABLE IF NOT EXISTS public.channel_routing_rules ();
CREATE TABLE IF NOT EXISTS public.gmail_accounts ();
CREATE TABLE IF NOT EXISTS public.saved_filters ();
ALTER TABLE public.whatsapp_connection_queues ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid() NOT NULL;
ALTER TABLE public.whatsapp_connection_queues ADD COLUMN IF NOT EXISTS whatsapp_connection_id uuid NOT NULL;
ALTER TABLE public.whatsapp_connection_queues ADD COLUMN IF NOT EXISTS queue_id uuid NOT NULL;
ALTER TABLE public.whatsapp_connection_queues ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now() NOT NULL;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid() NOT NULL;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS contact_id uuid;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS whatsapp_connection_id uuid;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS sender text NOT NULL;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS content text NOT NULL;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS message_type text DEFAULT 'text'::text NOT NULL;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS media_url text;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS is_read boolean DEFAULT false;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS agent_id uuid;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS external_id text;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now() NOT NULL;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now() NOT NULL;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS transcription text;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS transcription_status text DEFAULT 'pending'::text;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS status text DEFAULT 'sent'::text;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS status_updated_at timestamp with time zone DEFAULT now();
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS is_deleted boolean DEFAULT false;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS channel_type text DEFAULT 'whatsapp'::text;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS channel_connection_id uuid;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS is_edited boolean DEFAULT false NOT NULL;
ALTER TABLE public.conversation_memory ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid() NOT NULL;
ALTER TABLE public.conversation_memory ADD COLUMN IF NOT EXISTS contact_id uuid NOT NULL;
ALTER TABLE public.conversation_memory ADD COLUMN IF NOT EXISTS facts jsonb DEFAULT '[]'::jsonb;
ALTER TABLE public.conversation_memory ADD COLUMN IF NOT EXISTS objections_handled jsonb DEFAULT '[]'::jsonb;
ALTER TABLE public.conversation_memory ADD COLUMN IF NOT EXISTS promises_made jsonb DEFAULT '[]'::jsonb;
ALTER TABLE public.conversation_memory ADD COLUMN IF NOT EXISTS pending_items jsonb DEFAULT '[]'::jsonb;
ALTER TABLE public.conversation_memory ADD COLUMN IF NOT EXISTS commercial_summary text;
ALTER TABLE public.conversation_memory ADD COLUMN IF NOT EXISTS cumulative_summary text;
ALTER TABLE public.conversation_memory ADD COLUMN IF NOT EXISTS updated_by uuid;
ALTER TABLE public.conversation_memory ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now() NOT NULL;
ALTER TABLE public.conversation_memory ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now() NOT NULL;
ALTER TABLE public.whatsapp_groups ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid() NOT NULL;
ALTER TABLE public.whatsapp_groups ADD COLUMN IF NOT EXISTS whatsapp_connection_id uuid;
ALTER TABLE public.whatsapp_groups ADD COLUMN IF NOT EXISTS group_id text NOT NULL;
ALTER TABLE public.whatsapp_groups ADD COLUMN IF NOT EXISTS name text NOT NULL;
ALTER TABLE public.whatsapp_groups ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE public.whatsapp_groups ADD COLUMN IF NOT EXISTS participant_count integer DEFAULT 0;
ALTER TABLE public.whatsapp_groups ADD COLUMN IF NOT EXISTS avatar_url text;
ALTER TABLE public.whatsapp_groups ADD COLUMN IF NOT EXISTS is_admin boolean DEFAULT false;
ALTER TABLE public.whatsapp_groups ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now() NOT NULL;
ALTER TABLE public.whatsapp_groups ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now() NOT NULL;
ALTER TABLE public.whatsapp_groups ADD COLUMN IF NOT EXISTS category text;
ALTER TABLE public.conversation_sla ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid() NOT NULL;
ALTER TABLE public.conversation_sla ADD COLUMN IF NOT EXISTS contact_id uuid;
ALTER TABLE public.conversation_sla ADD COLUMN IF NOT EXISTS sla_configuration_id uuid;
ALTER TABLE public.conversation_sla ADD COLUMN IF NOT EXISTS first_message_at timestamp with time zone DEFAULT now() NOT NULL;
ALTER TABLE public.conversation_sla ADD COLUMN IF NOT EXISTS first_response_at timestamp with time zone;
ALTER TABLE public.conversation_sla ADD COLUMN IF NOT EXISTS resolved_at timestamp with time zone;
ALTER TABLE public.conversation_sla ADD COLUMN IF NOT EXISTS first_response_breached boolean DEFAULT false;
ALTER TABLE public.conversation_sla ADD COLUMN IF NOT EXISTS resolution_breached boolean DEFAULT false;
ALTER TABLE public.conversation_sla ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now() NOT NULL;
ALTER TABLE public.conversation_sla ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now() NOT NULL;
ALTER TABLE public.performance_snapshots ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid() NOT NULL;
ALTER TABLE public.performance_snapshots ADD COLUMN IF NOT EXISTS profile_id uuid NOT NULL;
ALTER TABLE public.performance_snapshots ADD COLUMN IF NOT EXISTS fcp integer DEFAULT 0;
ALTER TABLE public.performance_snapshots ADD COLUMN IF NOT EXISTS page_load integer DEFAULT 0;
ALTER TABLE public.performance_snapshots ADD COLUMN IF NOT EXISTS dom_ready integer DEFAULT 0;
ALTER TABLE public.performance_snapshots ADD COLUMN IF NOT EXISTS ttfb integer DEFAULT 0;
ALTER TABLE public.performance_snapshots ADD COLUMN IF NOT EXISTS memory_used integer DEFAULT 0;
ALTER TABLE public.performance_snapshots ADD COLUMN IF NOT EXISTS memory_total integer DEFAULT 0;
ALTER TABLE public.performance_snapshots ADD COLUMN IF NOT EXISTS dom_nodes integer DEFAULT 0;
ALTER TABLE public.performance_snapshots ADD COLUMN IF NOT EXISTS network_type text DEFAULT '4g'::text;
ALTER TABLE public.performance_snapshots ADD COLUMN IF NOT EXISTS rtt integer DEFAULT 0;
ALTER TABLE public.performance_snapshots ADD COLUMN IF NOT EXISTS overall_score integer DEFAULT 0;
ALTER TABLE public.performance_snapshots ADD COLUMN IF NOT EXISTS user_agent text;
ALTER TABLE public.performance_snapshots ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now() NOT NULL;
ALTER TABLE public.permissions ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid() NOT NULL;
ALTER TABLE public.permissions ADD COLUMN IF NOT EXISTS name text NOT NULL;
ALTER TABLE public.permissions ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE public.permissions ADD COLUMN IF NOT EXISTS category text DEFAULT 'general'::text NOT NULL;
ALTER TABLE public.permissions ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now() NOT NULL;
ALTER TABLE public.nps_surveys ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid() NOT NULL;
ALTER TABLE public.nps_surveys ADD COLUMN IF NOT EXISTS contact_id uuid NOT NULL;
ALTER TABLE public.nps_surveys ADD COLUMN IF NOT EXISTS agent_id uuid;
ALTER TABLE public.nps_surveys ADD COLUMN IF NOT EXISTS score integer NOT NULL;
ALTER TABLE public.nps_surveys ADD COLUMN IF NOT EXISTS feedback text;
ALTER TABLE public.nps_surveys ADD COLUMN IF NOT EXISTS survey_type text DEFAULT 'manual'::text NOT NULL;
ALTER TABLE public.nps_surveys ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now() NOT NULL;
ALTER TABLE public.csat_surveys ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid() NOT NULL;
ALTER TABLE public.csat_surveys ADD COLUMN IF NOT EXISTS contact_id uuid NOT NULL;
ALTER TABLE public.csat_surveys ADD COLUMN IF NOT EXISTS agent_id uuid NOT NULL;
ALTER TABLE public.csat_surveys ADD COLUMN IF NOT EXISTS rating integer NOT NULL;
ALTER TABLE public.csat_surveys ADD COLUMN IF NOT EXISTS feedback text;
ALTER TABLE public.csat_surveys ADD COLUMN IF NOT EXISTS conversation_resolved_at timestamp with time zone;
ALTER TABLE public.csat_surveys ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now() NOT NULL;
ALTER TABLE public.talkx_blacklist ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid() NOT NULL;
ALTER TABLE public.talkx_blacklist ADD COLUMN IF NOT EXISTS contact_id uuid NOT NULL;
ALTER TABLE public.talkx_blacklist ADD COLUMN IF NOT EXISTS reason text DEFAULT 'Solicitação do cliente'::text;
ALTER TABLE public.talkx_blacklist ADD COLUMN IF NOT EXISTS blocked_by uuid;
ALTER TABLE public.talkx_blacklist ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now() NOT NULL;
ALTER TABLE public.agent_skills ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid() NOT NULL;
ALTER TABLE public.agent_skills ADD COLUMN IF NOT EXISTS profile_id uuid NOT NULL;
ALTER TABLE public.agent_skills ADD COLUMN IF NOT EXISTS skill_name text NOT NULL;
ALTER TABLE public.agent_skills ADD COLUMN IF NOT EXISTS skill_level integer DEFAULT 1;
ALTER TABLE public.agent_skills ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now();
ALTER TABLE public.whatsapp_connections ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid() NOT NULL;
ALTER TABLE public.whatsapp_connections ADD COLUMN IF NOT EXISTS name text NOT NULL;
ALTER TABLE public.whatsapp_connections ADD COLUMN IF NOT EXISTS phone_number text NOT NULL;
ALTER TABLE public.whatsapp_connections ADD COLUMN IF NOT EXISTS instance_id text;
ALTER TABLE public.whatsapp_connections ADD COLUMN IF NOT EXISTS status text DEFAULT 'disconnected'::text;
ALTER TABLE public.whatsapp_connections ADD COLUMN IF NOT EXISTS qr_code text;
ALTER TABLE public.whatsapp_connections ADD COLUMN IF NOT EXISTS is_default boolean DEFAULT false;
ALTER TABLE public.whatsapp_connections ADD COLUMN IF NOT EXISTS created_by uuid;
ALTER TABLE public.whatsapp_connections ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now() NOT NULL;
ALTER TABLE public.whatsapp_connections ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now() NOT NULL;
ALTER TABLE public.whatsapp_connections ADD COLUMN IF NOT EXISTS farewell_message text;
ALTER TABLE public.whatsapp_connections ADD COLUMN IF NOT EXISTS farewell_enabled boolean DEFAULT false;
ALTER TABLE public.whatsapp_connections ADD COLUMN IF NOT EXISTS battery_level integer;
ALTER TABLE public.whatsapp_connections ADD COLUMN IF NOT EXISTS is_plugged boolean;
ALTER TABLE public.whatsapp_connections ADD COLUMN IF NOT EXISTS retry_count integer DEFAULT 0;
ALTER TABLE public.whatsapp_connections ADD COLUMN IF NOT EXISTS max_retries integer DEFAULT 5;
ALTER TABLE public.whatsapp_connections ADD COLUMN IF NOT EXISTS last_health_check timestamp with time zone;
ALTER TABLE public.whatsapp_connections ADD COLUMN IF NOT EXISTS health_status text DEFAULT 'unknown'::text;
ALTER TABLE public.whatsapp_connections ADD COLUMN IF NOT EXISTS health_response_ms integer;
ALTER TABLE public.scheduled_reports ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid() NOT NULL;
ALTER TABLE public.scheduled_reports ADD COLUMN IF NOT EXISTS name text NOT NULL;
ALTER TABLE public.scheduled_reports ADD COLUMN IF NOT EXISTS report_type text DEFAULT 'dashboard_summary'::text NOT NULL;
ALTER TABLE public.scheduled_reports ADD COLUMN IF NOT EXISTS frequency text DEFAULT 'weekly'::text NOT NULL;
ALTER TABLE public.scheduled_reports ADD COLUMN IF NOT EXISTS recipients text[] DEFAULT '{}'::text[] NOT NULL;
ALTER TABLE public.scheduled_reports ADD COLUMN IF NOT EXISTS format text DEFAULT 'pdf'::text NOT NULL;
ALTER TABLE public.scheduled_reports ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true;
ALTER TABLE public.scheduled_reports ADD COLUMN IF NOT EXISTS next_send_at timestamp with time zone;
ALTER TABLE public.scheduled_reports ADD COLUMN IF NOT EXISTS last_sent_at timestamp with time zone;
ALTER TABLE public.scheduled_reports ADD COLUMN IF NOT EXISTS created_by uuid;
ALTER TABLE public.scheduled_reports ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now() NOT NULL;
ALTER TABLE public.scheduled_reports ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now() NOT NULL;
ALTER TABLE public.crisis_room_alerts ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid() NOT NULL;
ALTER TABLE public.crisis_room_alerts ADD COLUMN IF NOT EXISTS severity text DEFAULT 'warning'::text NOT NULL;
ALTER TABLE public.crisis_room_alerts ADD COLUMN IF NOT EXISTS metric_name text NOT NULL;
ALTER TABLE public.crisis_room_alerts ADD COLUMN IF NOT EXISTS metric_value numeric;
ALTER TABLE public.crisis_room_alerts ADD COLUMN IF NOT EXISTS threshold numeric;
ALTER TABLE public.crisis_room_alerts ADD COLUMN IF NOT EXISTS message text NOT NULL;
ALTER TABLE public.crisis_room_alerts ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true;
ALTER TABLE public.crisis_room_alerts ADD COLUMN IF NOT EXISTS acknowledged_by uuid;
ALTER TABLE public.crisis_room_alerts ADD COLUMN IF NOT EXISTS acknowledged_at timestamp with time zone;
ALTER TABLE public.crisis_room_alerts ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now() NOT NULL;
ALTER TABLE public.whisper_messages ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid() NOT NULL;
ALTER TABLE public.whisper_messages ADD COLUMN IF NOT EXISTS contact_id uuid NOT NULL;
ALTER TABLE public.whisper_messages ADD COLUMN IF NOT EXISTS sender_id uuid NOT NULL;
ALTER TABLE public.whisper_messages ADD COLUMN IF NOT EXISTS target_agent_id uuid NOT NULL;
ALTER TABLE public.whisper_messages ADD COLUMN IF NOT EXISTS content text NOT NULL;
ALTER TABLE public.whisper_messages ADD COLUMN IF NOT EXISTS is_read boolean DEFAULT false;
ALTER TABLE public.whisper_messages ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now();
ALTER TABLE public.contact_purchases ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid() NOT NULL;
ALTER TABLE public.contact_purchases ADD COLUMN IF NOT EXISTS contact_id uuid NOT NULL;
ALTER TABLE public.contact_purchases ADD COLUMN IF NOT EXISTS title text NOT NULL;
ALTER TABLE public.contact_purchases ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE public.contact_purchases ADD COLUMN IF NOT EXISTS amount numeric(12,2);
ALTER TABLE public.contact_purchases ADD COLUMN IF NOT EXISTS currency text DEFAULT 'BRL'::text;
ALTER TABLE public.contact_purchases ADD COLUMN IF NOT EXISTS status text DEFAULT 'pending'::text;
ALTER TABLE public.contact_purchases ADD COLUMN IF NOT EXISTS purchase_type text DEFAULT 'purchase'::text;
ALTER TABLE public.contact_purchases ADD COLUMN IF NOT EXISTS deal_id uuid;
ALTER TABLE public.contact_purchases ADD COLUMN IF NOT EXISTS created_by uuid;
ALTER TABLE public.contact_purchases ADD COLUMN IF NOT EXISTS purchased_at timestamp with time zone;
ALTER TABLE public.contact_purchases ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now() NOT NULL;
ALTER TABLE public.contact_purchases ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now() NOT NULL;
ALTER TABLE public.contact_tags ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid() NOT NULL;
ALTER TABLE public.contact_tags ADD COLUMN IF NOT EXISTS contact_id uuid NOT NULL;
ALTER TABLE public.contact_tags ADD COLUMN IF NOT EXISTS tag_id uuid NOT NULL;
ALTER TABLE public.contact_tags ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now() NOT NULL;
ALTER TABLE public.whatsapp_flows ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid() NOT NULL;
ALTER TABLE public.whatsapp_flows ADD COLUMN IF NOT EXISTS name text NOT NULL;
ALTER TABLE public.whatsapp_flows ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE public.whatsapp_flows ADD COLUMN IF NOT EXISTS flow_json jsonb DEFAULT '{}'::jsonb NOT NULL;
ALTER TABLE public.whatsapp_flows ADD COLUMN IF NOT EXISTS screens jsonb DEFAULT '[]'::jsonb NOT NULL;
ALTER TABLE public.whatsapp_flows ADD COLUMN IF NOT EXISTS status text DEFAULT 'draft'::text;
ALTER TABLE public.whatsapp_flows ADD COLUMN IF NOT EXISTS whatsapp_flow_id text;
ALTER TABLE public.whatsapp_flows ADD COLUMN IF NOT EXISTS whatsapp_connection_id uuid;
ALTER TABLE public.whatsapp_flows ADD COLUMN IF NOT EXISTS created_by uuid;
ALTER TABLE public.whatsapp_flows ADD COLUMN IF NOT EXISTS published_at timestamp with time zone;
ALTER TABLE public.whatsapp_flows ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now();
ALTER TABLE public.whatsapp_flows ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now();
ALTER TABLE public.meta_capi_events ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid() NOT NULL;
ALTER TABLE public.meta_capi_events ADD COLUMN IF NOT EXISTS event_name text NOT NULL;
ALTER TABLE public.meta_capi_events ADD COLUMN IF NOT EXISTS event_time timestamp with time zone DEFAULT now();
ALTER TABLE public.meta_capi_events ADD COLUMN IF NOT EXISTS contact_id uuid;
ALTER TABLE public.meta_capi_events ADD COLUMN IF NOT EXISTS pixel_id text;
ALTER TABLE public.meta_capi_events ADD COLUMN IF NOT EXISTS event_source_url text;
ALTER TABLE public.meta_capi_events ADD COLUMN IF NOT EXISTS action_source text DEFAULT 'chat'::text;
ALTER TABLE public.meta_capi_events ADD COLUMN IF NOT EXISTS custom_data jsonb DEFAULT '{}'::jsonb;
ALTER TABLE public.meta_capi_events ADD COLUMN IF NOT EXISTS sent_to_meta boolean DEFAULT false;
ALTER TABLE public.meta_capi_events ADD COLUMN IF NOT EXISTS meta_response jsonb;
ALTER TABLE public.meta_capi_events ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now();
ALTER TABLE public.custom_emojis ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid() NOT NULL;
ALTER TABLE public.custom_emojis ADD COLUMN IF NOT EXISTS name text NOT NULL;
ALTER TABLE public.custom_emojis ADD COLUMN IF NOT EXISTS image_url text NOT NULL;
ALTER TABLE public.custom_emojis ADD COLUMN IF NOT EXISTS category text DEFAULT 'outros'::text;
ALTER TABLE public.custom_emojis ADD COLUMN IF NOT EXISTS is_favorite boolean DEFAULT false;
ALTER TABLE public.custom_emojis ADD COLUMN IF NOT EXISTS use_count integer DEFAULT 0;
ALTER TABLE public.custom_emojis ADD COLUMN IF NOT EXISTS uploaded_by uuid;
ALTER TABLE public.custom_emojis ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now();
ALTER TABLE public.custom_emojis ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now();
ALTER TABLE public.calls ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid() NOT NULL;
ALTER TABLE public.calls ADD COLUMN IF NOT EXISTS contact_id uuid;
ALTER TABLE public.calls ADD COLUMN IF NOT EXISTS agent_id uuid;
ALTER TABLE public.calls ADD COLUMN IF NOT EXISTS whatsapp_connection_id uuid;
ALTER TABLE public.calls ADD COLUMN IF NOT EXISTS direction text NOT NULL;
ALTER TABLE public.calls ADD COLUMN IF NOT EXISTS status text DEFAULT 'ringing'::text NOT NULL;
ALTER TABLE public.calls ADD COLUMN IF NOT EXISTS started_at timestamp with time zone DEFAULT now() NOT NULL;
ALTER TABLE public.calls ADD COLUMN IF NOT EXISTS answered_at timestamp with time zone;
ALTER TABLE public.calls ADD COLUMN IF NOT EXISTS ended_at timestamp with time zone;
ALTER TABLE public.calls ADD COLUMN IF NOT EXISTS duration_seconds integer;
ALTER TABLE public.calls ADD COLUMN IF NOT EXISTS recording_url text;
ALTER TABLE public.calls ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE public.calls ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now() NOT NULL;
ALTER TABLE public.favorite_contacts ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid() NOT NULL;
ALTER TABLE public.favorite_contacts ADD COLUMN IF NOT EXISTS contact_id uuid NOT NULL;
ALTER TABLE public.favorite_contacts ADD COLUMN IF NOT EXISTS user_id uuid NOT NULL;
ALTER TABLE public.favorite_contacts ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now() NOT NULL;
ALTER TABLE public.followup_steps ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid() NOT NULL;
ALTER TABLE public.followup_steps ADD COLUMN IF NOT EXISTS sequence_id uuid NOT NULL;
ALTER TABLE public.followup_steps ADD COLUMN IF NOT EXISTS step_order integer DEFAULT 1 NOT NULL;
ALTER TABLE public.followup_steps ADD COLUMN IF NOT EXISTS delay_hours integer DEFAULT 24 NOT NULL;
ALTER TABLE public.followup_steps ADD COLUMN IF NOT EXISTS message_template text NOT NULL;
ALTER TABLE public.followup_steps ADD COLUMN IF NOT EXISTS message_type text DEFAULT 'text'::text NOT NULL;
ALTER TABLE public.followup_steps ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true;
ALTER TABLE public.followup_steps ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now();
ALTER TABLE public.geo_blocking_settings ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid() NOT NULL;
ALTER TABLE public.geo_blocking_settings ADD COLUMN IF NOT EXISTS mode text DEFAULT 'disabled'::text NOT NULL;
ALTER TABLE public.geo_blocking_settings ADD COLUMN IF NOT EXISTS updated_by uuid;
ALTER TABLE public.geo_blocking_settings ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now() NOT NULL;
ALTER TABLE public.geo_blocking_settings ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now() NOT NULL;
ALTER TABLE public.mfa_sessions ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid() NOT NULL;
ALTER TABLE public.mfa_sessions ADD COLUMN IF NOT EXISTS user_id uuid NOT NULL;
ALTER TABLE public.mfa_sessions ADD COLUMN IF NOT EXISTS factor_id text NOT NULL;
ALTER TABLE public.mfa_sessions ADD COLUMN IF NOT EXISTS verified_at timestamp with time zone;
ALTER TABLE public.mfa_sessions ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now() NOT NULL;
ALTER TABLE public.mfa_sessions ADD COLUMN IF NOT EXISTS expires_at timestamp with time zone DEFAULT (now() + '00:05:00'::interval) NOT NULL;
ALTER TABLE public.pinned_conversations ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid() NOT NULL;
ALTER TABLE public.pinned_conversations ADD COLUMN IF NOT EXISTS contact_id uuid NOT NULL;
ALTER TABLE public.pinned_conversations ADD COLUMN IF NOT EXISTS pinned_by uuid NOT NULL;
ALTER TABLE public.pinned_conversations ADD COLUMN IF NOT EXISTS "position" integer DEFAULT 0 NOT NULL;
ALTER TABLE public.pinned_conversations ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now() NOT NULL;
ALTER TABLE public.playbooks ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid() NOT NULL;
ALTER TABLE public.playbooks ADD COLUMN IF NOT EXISTS name text NOT NULL;
ALTER TABLE public.playbooks ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE public.playbooks ADD COLUMN IF NOT EXISTS category text DEFAULT 'general'::text NOT NULL;
ALTER TABLE public.playbooks ADD COLUMN IF NOT EXISTS steps jsonb DEFAULT '[]'::jsonb NOT NULL;
ALTER TABLE public.playbooks ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true NOT NULL;
ALTER TABLE public.playbooks ADD COLUMN IF NOT EXISTS created_by uuid;
ALTER TABLE public.playbooks ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now() NOT NULL;
ALTER TABLE public.playbooks ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now() NOT NULL;
ALTER TABLE public.email_threads ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid() NOT NULL;
ALTER TABLE public.email_threads ADD COLUMN IF NOT EXISTS gmail_account_id uuid NOT NULL;
ALTER TABLE public.email_threads ADD COLUMN IF NOT EXISTS gmail_thread_id text NOT NULL;
ALTER TABLE public.email_threads ADD COLUMN IF NOT EXISTS contact_id uuid;
ALTER TABLE public.email_threads ADD COLUMN IF NOT EXISTS subject text DEFAULT ''::text NOT NULL;
ALTER TABLE public.email_threads ADD COLUMN IF NOT EXISTS snippet text DEFAULT ''::text NOT NULL;
ALTER TABLE public.email_threads ADD COLUMN IF NOT EXISTS label_ids text[] DEFAULT '{}'::text[] NOT NULL;
ALTER TABLE public.email_threads ADD COLUMN IF NOT EXISTS message_count integer DEFAULT 0 NOT NULL;
ALTER TABLE public.email_threads ADD COLUMN IF NOT EXISTS is_unread boolean DEFAULT true NOT NULL;
ALTER TABLE public.email_threads ADD COLUMN IF NOT EXISTS is_starred boolean DEFAULT false NOT NULL;
ALTER TABLE public.email_threads ADD COLUMN IF NOT EXISTS is_important boolean DEFAULT false NOT NULL;
ALTER TABLE public.email_threads ADD COLUMN IF NOT EXISTS last_message_at timestamp with time zone DEFAULT now() NOT NULL;
ALTER TABLE public.email_threads ADD COLUMN IF NOT EXISTS assigned_to uuid;
ALTER TABLE public.email_threads ADD COLUMN IF NOT EXISTS status text DEFAULT 'open'::text NOT NULL;
ALTER TABLE public.email_threads ADD COLUMN IF NOT EXISTS priority text DEFAULT 'medium'::text NOT NULL;
ALTER TABLE public.email_threads ADD COLUMN IF NOT EXISTS tags text[] DEFAULT '{}'::text[] NOT NULL;
ALTER TABLE public.email_threads ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now() NOT NULL;
ALTER TABLE public.email_threads ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now() NOT NULL;
ALTER TABLE public.entity_versions ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid() NOT NULL;
ALTER TABLE public.entity_versions ADD COLUMN IF NOT EXISTS entity_type text NOT NULL;
ALTER TABLE public.entity_versions ADD COLUMN IF NOT EXISTS entity_id uuid NOT NULL;
ALTER TABLE public.entity_versions ADD COLUMN IF NOT EXISTS version_number integer NOT NULL;
ALTER TABLE public.entity_versions ADD COLUMN IF NOT EXISTS data jsonb DEFAULT '{}'::jsonb NOT NULL;
ALTER TABLE public.entity_versions ADD COLUMN IF NOT EXISTS changed_by uuid;
ALTER TABLE public.entity_versions ADD COLUMN IF NOT EXISTS change_summary text;
ALTER TABLE public.entity_versions ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now() NOT NULL;
ALTER TABLE public.global_settings ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid() NOT NULL;
ALTER TABLE public.global_settings ADD COLUMN IF NOT EXISTS key text NOT NULL;
ALTER TABLE public.global_settings ADD COLUMN IF NOT EXISTS value text;
ALTER TABLE public.global_settings ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE public.global_settings ADD COLUMN IF NOT EXISTS updated_by uuid;
ALTER TABLE public.global_settings ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now() NOT NULL;
ALTER TABLE public.global_settings ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now() NOT NULL;
ALTER TABLE public.conversation_events ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid() NOT NULL;
ALTER TABLE public.conversation_events ADD COLUMN IF NOT EXISTS contact_id uuid NOT NULL;
ALTER TABLE public.conversation_events ADD COLUMN IF NOT EXISTS event_type text NOT NULL;
ALTER TABLE public.conversation_events ADD COLUMN IF NOT EXISTS from_agent_id uuid;
ALTER TABLE public.conversation_events ADD COLUMN IF NOT EXISTS to_agent_id uuid;
ALTER TABLE public.conversation_events ADD COLUMN IF NOT EXISTS from_queue_id uuid;
ALTER TABLE public.conversation_events ADD COLUMN IF NOT EXISTS to_queue_id uuid;
ALTER TABLE public.conversation_events ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}'::jsonb;
ALTER TABLE public.conversation_events ADD COLUMN IF NOT EXISTS performed_by uuid;
ALTER TABLE public.conversation_events ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now() NOT NULL;
ALTER TABLE public.scheduled_messages ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid() NOT NULL;
ALTER TABLE public.scheduled_messages ADD COLUMN IF NOT EXISTS contact_id uuid NOT NULL;
ALTER TABLE public.scheduled_messages ADD COLUMN IF NOT EXISTS content text NOT NULL;
ALTER TABLE public.scheduled_messages ADD COLUMN IF NOT EXISTS message_type text DEFAULT 'text'::text NOT NULL;
ALTER TABLE public.scheduled_messages ADD COLUMN IF NOT EXISTS media_url text;
ALTER TABLE public.scheduled_messages ADD COLUMN IF NOT EXISTS scheduled_at timestamp with time zone NOT NULL;
ALTER TABLE public.scheduled_messages ADD COLUMN IF NOT EXISTS status text DEFAULT 'pending'::text NOT NULL;
ALTER TABLE public.scheduled_messages ADD COLUMN IF NOT EXISTS sent_at timestamp with time zone;
ALTER TABLE public.scheduled_messages ADD COLUMN IF NOT EXISTS error_message text;
ALTER TABLE public.scheduled_messages ADD COLUMN IF NOT EXISTS created_by uuid;
ALTER TABLE public.scheduled_messages ADD COLUMN IF NOT EXISTS whatsapp_connection_id uuid;
ALTER TABLE public.scheduled_messages ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now() NOT NULL;
ALTER TABLE public.scheduled_messages ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now() NOT NULL;
ALTER TABLE public.scheduled_report_configs ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid() NOT NULL;
ALTER TABLE public.scheduled_report_configs ADD COLUMN IF NOT EXISTS name text NOT NULL;
ALTER TABLE public.scheduled_report_configs ADD COLUMN IF NOT EXISTS report_type text DEFAULT 'dashboard'::text NOT NULL;
ALTER TABLE public.scheduled_report_configs ADD COLUMN IF NOT EXISTS frequency text DEFAULT 'weekly'::text NOT NULL;
ALTER TABLE public.scheduled_report_configs ADD COLUMN IF NOT EXISTS recipients text[] DEFAULT '{}'::text[] NOT NULL;
ALTER TABLE public.scheduled_report_configs ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true NOT NULL;
ALTER TABLE public.scheduled_report_configs ADD COLUMN IF NOT EXISTS last_sent_at timestamp with time zone;
ALTER TABLE public.scheduled_report_configs ADD COLUMN IF NOT EXISTS next_send_at timestamp with time zone;
ALTER TABLE public.scheduled_report_configs ADD COLUMN IF NOT EXISTS created_by uuid;
ALTER TABLE public.scheduled_report_configs ADD COLUMN IF NOT EXISTS config jsonb DEFAULT '{}'::jsonb NOT NULL;
ALTER TABLE public.scheduled_report_configs ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now() NOT NULL;
ALTER TABLE public.scheduled_report_configs ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now() NOT NULL;
ALTER TABLE public.webauthn_challenges ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid() NOT NULL;
ALTER TABLE public.webauthn_challenges ADD COLUMN IF NOT EXISTS user_id uuid;
ALTER TABLE public.webauthn_challenges ADD COLUMN IF NOT EXISTS challenge text NOT NULL;
ALTER TABLE public.webauthn_challenges ADD COLUMN IF NOT EXISTS type text NOT NULL;
ALTER TABLE public.webauthn_challenges ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now() NOT NULL;
ALTER TABLE public.webauthn_challenges ADD COLUMN IF NOT EXISTS expires_at timestamp with time zone DEFAULT (now() + '00:05:00'::interval) NOT NULL;
ALTER TABLE public.webhook_rate_limits ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid() NOT NULL;
ALTER TABLE public.webhook_rate_limits ADD COLUMN IF NOT EXISTS instance_id text NOT NULL;
ALTER TABLE public.webhook_rate_limits ADD COLUMN IF NOT EXISTS event_type text NOT NULL;
ALTER TABLE public.webhook_rate_limits ADD COLUMN IF NOT EXISTS event_count integer DEFAULT 1 NOT NULL;
ALTER TABLE public.webhook_rate_limits ADD COLUMN IF NOT EXISTS window_start timestamp with time zone DEFAULT now() NOT NULL;
ALTER TABLE public.webhook_rate_limits ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now() NOT NULL;
ALTER TABLE public.sales_pipeline_stages ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid() NOT NULL;
ALTER TABLE public.sales_pipeline_stages ADD COLUMN IF NOT EXISTS name text NOT NULL;
ALTER TABLE public.sales_pipeline_stages ADD COLUMN IF NOT EXISTS color text DEFAULT '#3b82f6'::text NOT NULL;
ALTER TABLE public.sales_pipeline_stages ADD COLUMN IF NOT EXISTS "position" integer DEFAULT 0 NOT NULL;
ALTER TABLE public.sales_pipeline_stages ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true;
ALTER TABLE public.sales_pipeline_stages ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now();
ALTER TABLE public.sales_pipeline_stages ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now();
ALTER TABLE public.contact_custom_fields ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid() NOT NULL;
ALTER TABLE public.contact_custom_fields ADD COLUMN IF NOT EXISTS contact_id uuid NOT NULL;
ALTER TABLE public.contact_custom_fields ADD COLUMN IF NOT EXISTS field_name text NOT NULL;
ALTER TABLE public.contact_custom_fields ADD COLUMN IF NOT EXISTS field_value text;
ALTER TABLE public.contact_custom_fields ADD COLUMN IF NOT EXISTS field_type text DEFAULT 'text'::text NOT NULL;
ALTER TABLE public.contact_custom_fields ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now() NOT NULL;
ALTER TABLE public.contact_custom_fields ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now() NOT NULL;
ALTER TABLE public.campaign_contacts ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid() NOT NULL;
ALTER TABLE public.campaign_contacts ADD COLUMN IF NOT EXISTS campaign_id uuid NOT NULL;
ALTER TABLE public.campaign_contacts ADD COLUMN IF NOT EXISTS contact_id uuid NOT NULL;
ALTER TABLE public.campaign_contacts ADD COLUMN IF NOT EXISTS status text DEFAULT 'pending'::text NOT NULL;
ALTER TABLE public.campaign_contacts ADD COLUMN IF NOT EXISTS sent_at timestamp with time zone;
ALTER TABLE public.campaign_contacts ADD COLUMN IF NOT EXISTS error_message text;
ALTER TABLE public.campaign_contacts ADD COLUMN IF NOT EXISTS external_id text;
ALTER TABLE public.campaign_contacts ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now() NOT NULL;
ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid() NOT NULL;
ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS name text NOT NULL;
ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS message_content text NOT NULL;
ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS message_type text DEFAULT 'text'::text NOT NULL;
ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS media_url text;
ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS status text DEFAULT 'draft'::text NOT NULL;
ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS scheduled_at timestamp with time zone;
ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS started_at timestamp with time zone;
ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS completed_at timestamp with time zone;
ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS total_contacts integer DEFAULT 0 NOT NULL;
ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS sent_count integer DEFAULT 0 NOT NULL;
ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS delivered_count integer DEFAULT 0 NOT NULL;
ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS read_count integer DEFAULT 0 NOT NULL;
ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS failed_count integer DEFAULT 0 NOT NULL;
ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS whatsapp_connection_id uuid;
ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS created_by uuid;
ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS target_type text DEFAULT 'all'::text NOT NULL;
ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS target_filter jsonb DEFAULT '{}'::jsonb;
ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS send_interval_seconds integer DEFAULT 5;
ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now() NOT NULL;
ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now() NOT NULL;
ALTER TABLE public.contact_notes ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid() NOT NULL;
ALTER TABLE public.contact_notes ADD COLUMN IF NOT EXISTS contact_id uuid NOT NULL;
ALTER TABLE public.contact_notes ADD COLUMN IF NOT EXISTS author_id uuid NOT NULL;
ALTER TABLE public.contact_notes ADD COLUMN IF NOT EXISTS content text NOT NULL;
ALTER TABLE public.contact_notes ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now() NOT NULL;
ALTER TABLE public.contact_notes ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now() NOT NULL;
ALTER TABLE public.agent_achievements ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid() NOT NULL;
ALTER TABLE public.agent_achievements ADD COLUMN IF NOT EXISTS profile_id uuid NOT NULL;
ALTER TABLE public.agent_achievements ADD COLUMN IF NOT EXISTS achievement_type text NOT NULL;
ALTER TABLE public.agent_achievements ADD COLUMN IF NOT EXISTS achievement_name text NOT NULL;
ALTER TABLE public.agent_achievements ADD COLUMN IF NOT EXISTS achievement_description text;
ALTER TABLE public.agent_achievements ADD COLUMN IF NOT EXISTS xp_earned integer DEFAULT 0 NOT NULL;
ALTER TABLE public.agent_achievements ADD COLUMN IF NOT EXISTS earned_at timestamp with time zone DEFAULT now() NOT NULL;
ALTER TABLE public.team_conversation_members ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid() NOT NULL;
ALTER TABLE public.team_conversation_members ADD COLUMN IF NOT EXISTS conversation_id uuid NOT NULL;
ALTER TABLE public.team_conversation_members ADD COLUMN IF NOT EXISTS profile_id uuid NOT NULL;
ALTER TABLE public.team_conversation_members ADD COLUMN IF NOT EXISTS joined_at timestamp with time zone DEFAULT now() NOT NULL;
ALTER TABLE public.team_conversation_members ADD COLUMN IF NOT EXISTS last_read_at timestamp with time zone DEFAULT now();
ALTER TABLE public.team_conversation_members ADD COLUMN IF NOT EXISTS is_muted boolean DEFAULT false;
ALTER TABLE public.message_reactions ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid() NOT NULL;
ALTER TABLE public.message_reactions ADD COLUMN IF NOT EXISTS message_id uuid NOT NULL;
ALTER TABLE public.message_reactions ADD COLUMN IF NOT EXISTS user_id uuid;
ALTER TABLE public.message_reactions ADD COLUMN IF NOT EXISTS contact_id uuid;
ALTER TABLE public.message_reactions ADD COLUMN IF NOT EXISTS emoji text NOT NULL;
ALTER TABLE public.message_reactions ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now() NOT NULL;
ALTER TABLE public.message_templates ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid() NOT NULL;
ALTER TABLE public.message_templates ADD COLUMN IF NOT EXISTS user_id uuid NOT NULL;
ALTER TABLE public.message_templates ADD COLUMN IF NOT EXISTS title text NOT NULL;
ALTER TABLE public.message_templates ADD COLUMN IF NOT EXISTS content text NOT NULL;
ALTER TABLE public.message_templates ADD COLUMN IF NOT EXISTS shortcut text;
ALTER TABLE public.message_templates ADD COLUMN IF NOT EXISTS category text DEFAULT 'general'::text;
ALTER TABLE public.message_templates ADD COLUMN IF NOT EXISTS is_global boolean DEFAULT false;
ALTER TABLE public.message_templates ADD COLUMN IF NOT EXISTS use_count integer DEFAULT 0;
ALTER TABLE public.message_templates ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now() NOT NULL;
ALTER TABLE public.message_templates ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now() NOT NULL;
ALTER TABLE public.ai_conversation_tags ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid() NOT NULL;
ALTER TABLE public.ai_conversation_tags ADD COLUMN IF NOT EXISTS contact_id uuid NOT NULL;
ALTER TABLE public.ai_conversation_tags ADD COLUMN IF NOT EXISTS tag_name text NOT NULL;
ALTER TABLE public.ai_conversation_tags ADD COLUMN IF NOT EXISTS confidence numeric DEFAULT 0.0;
ALTER TABLE public.ai_conversation_tags ADD COLUMN IF NOT EXISTS source text DEFAULT 'ai'::text;
ALTER TABLE public.ai_conversation_tags ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now();
ALTER TABLE public.goals_configurations ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid() NOT NULL;
ALTER TABLE public.goals_configurations ADD COLUMN IF NOT EXISTS profile_id uuid;
ALTER TABLE public.goals_configurations ADD COLUMN IF NOT EXISTS queue_id uuid;
ALTER TABLE public.goals_configurations ADD COLUMN IF NOT EXISTS goal_type text NOT NULL;
ALTER TABLE public.goals_configurations ADD COLUMN IF NOT EXISTS daily_target integer DEFAULT 0 NOT NULL;
ALTER TABLE public.goals_configurations ADD COLUMN IF NOT EXISTS weekly_target integer DEFAULT 0 NOT NULL;
ALTER TABLE public.goals_configurations ADD COLUMN IF NOT EXISTS monthly_target integer DEFAULT 0 NOT NULL;
ALTER TABLE public.goals_configurations ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true;
ALTER TABLE public.goals_configurations ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now() NOT NULL;
ALTER TABLE public.goals_configurations ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now() NOT NULL;
ALTER TABLE public.ip_whitelist ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid() NOT NULL;
ALTER TABLE public.ip_whitelist ADD COLUMN IF NOT EXISTS ip_address text NOT NULL;
ALTER TABLE public.ip_whitelist ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE public.ip_whitelist ADD COLUMN IF NOT EXISTS added_by uuid;
ALTER TABLE public.ip_whitelist ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now() NOT NULL;
ALTER TABLE public.knowledge_base_articles ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid() NOT NULL;
ALTER TABLE public.knowledge_base_articles ADD COLUMN IF NOT EXISTS title text NOT NULL;
ALTER TABLE public.knowledge_base_articles ADD COLUMN IF NOT EXISTS content text NOT NULL;
ALTER TABLE public.knowledge_base_articles ADD COLUMN IF NOT EXISTS category text DEFAULT 'general'::text;
ALTER TABLE public.knowledge_base_articles ADD COLUMN IF NOT EXISTS tags text[] DEFAULT '{}'::text[];
ALTER TABLE public.knowledge_base_articles ADD COLUMN IF NOT EXISTS is_published boolean DEFAULT true;
ALTER TABLE public.knowledge_base_articles ADD COLUMN IF NOT EXISTS embedding_status text DEFAULT 'pending'::text;
ALTER TABLE public.knowledge_base_articles ADD COLUMN IF NOT EXISTS created_by uuid;
ALTER TABLE public.knowledge_base_articles ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now();
ALTER TABLE public.knowledge_base_articles ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now();
ALTER TABLE public.knowledge_base_articles ADD COLUMN IF NOT EXISTS search_vector tsvector DEFAULT ((setweight(to_tsvector('portuguese'::regconfig, COALESCE(title, ''::text)), 'A'::"char") || setweight(to_tsvector('portuguese'::regconfig, COALESCE(category, ''::text)), 'B'::"char")) || setweight(to_tsvector('portuguese'::regconfig, COALESCE(content, ''::text)), 'C'::"char"));
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid() NOT NULL;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS user_id uuid NOT NULL;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS title text NOT NULL;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS message text NOT NULL;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS type text DEFAULT 'info'::text NOT NULL;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS is_read boolean DEFAULT false;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}'::jsonb;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now() NOT NULL;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS read_at timestamp with time zone;
ALTER TABLE public.queue_goals ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid() NOT NULL;
ALTER TABLE public.queue_goals ADD COLUMN IF NOT EXISTS queue_id uuid NOT NULL;
ALTER TABLE public.queue_goals ADD COLUMN IF NOT EXISTS max_waiting_contacts integer DEFAULT 10;
ALTER TABLE public.queue_goals ADD COLUMN IF NOT EXISTS max_avg_wait_minutes integer DEFAULT 15;
ALTER TABLE public.queue_goals ADD COLUMN IF NOT EXISTS min_assignment_rate integer DEFAULT 80;
ALTER TABLE public.queue_goals ADD COLUMN IF NOT EXISTS max_messages_pending integer DEFAULT 50;
ALTER TABLE public.queue_goals ADD COLUMN IF NOT EXISTS alerts_enabled boolean DEFAULT true;
ALTER TABLE public.queue_goals ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now() NOT NULL;
ALTER TABLE public.queue_goals ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now() NOT NULL;
ALTER TABLE public.queue_members ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid() NOT NULL;
ALTER TABLE public.queue_members ADD COLUMN IF NOT EXISTS queue_id uuid NOT NULL;
ALTER TABLE public.queue_members ADD COLUMN IF NOT EXISTS profile_id uuid NOT NULL;
ALTER TABLE public.queue_members ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true;
ALTER TABLE public.queue_members ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now() NOT NULL;
ALTER TABLE public.queue_positions ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid() NOT NULL;
ALTER TABLE public.queue_positions ADD COLUMN IF NOT EXISTS contact_id uuid NOT NULL;
ALTER TABLE public.queue_positions ADD COLUMN IF NOT EXISTS queue_id uuid NOT NULL;
ALTER TABLE public.queue_positions ADD COLUMN IF NOT EXISTS "position" integer DEFAULT 0 NOT NULL;
ALTER TABLE public.queue_positions ADD COLUMN IF NOT EXISTS estimated_wait_minutes integer;
ALTER TABLE public.queue_positions ADD COLUMN IF NOT EXISTS entered_at timestamp with time zone DEFAULT now();
ALTER TABLE public.queue_positions ADD COLUMN IF NOT EXISTS notified boolean DEFAULT false;
ALTER TABLE public.queue_positions ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now();
ALTER TABLE public.queue_skill_requirements ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid() NOT NULL;
ALTER TABLE public.queue_skill_requirements ADD COLUMN IF NOT EXISTS queue_id uuid NOT NULL;
ALTER TABLE public.queue_skill_requirements ADD COLUMN IF NOT EXISTS skill_name text NOT NULL;
ALTER TABLE public.queue_skill_requirements ADD COLUMN IF NOT EXISTS min_level integer DEFAULT 1;
ALTER TABLE public.queue_skill_requirements ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now();
ALTER TABLE public.conversation_closures ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid() NOT NULL;
ALTER TABLE public.conversation_closures ADD COLUMN IF NOT EXISTS contact_id uuid NOT NULL;
ALTER TABLE public.conversation_closures ADD COLUMN IF NOT EXISTS closed_by uuid;
ALTER TABLE public.conversation_closures ADD COLUMN IF NOT EXISTS close_reason text NOT NULL;
ALTER TABLE public.conversation_closures ADD COLUMN IF NOT EXISTS outcome text;
ALTER TABLE public.conversation_closures ADD COLUMN IF NOT EXISTS classification text;
ALTER TABLE public.conversation_closures ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE public.conversation_closures ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now() NOT NULL;
ALTER TABLE public.automations ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid() NOT NULL;
ALTER TABLE public.automations ADD COLUMN IF NOT EXISTS name text NOT NULL;
ALTER TABLE public.automations ADD COLUMN IF NOT EXISTS description text DEFAULT ''::text;
ALTER TABLE public.automations ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true NOT NULL;
ALTER TABLE public.automations ADD COLUMN IF NOT EXISTS trigger_type text DEFAULT 'new_message'::text NOT NULL;
ALTER TABLE public.automations ADD COLUMN IF NOT EXISTS trigger_config jsonb DEFAULT '{}'::jsonb NOT NULL;
ALTER TABLE public.automations ADD COLUMN IF NOT EXISTS actions jsonb DEFAULT '[]'::jsonb NOT NULL;
ALTER TABLE public.automations ADD COLUMN IF NOT EXISTS created_by uuid;
ALTER TABLE public.automations ADD COLUMN IF NOT EXISTS last_triggered_at timestamp with time zone;
ALTER TABLE public.automations ADD COLUMN IF NOT EXISTS trigger_count integer DEFAULT 0 NOT NULL;
ALTER TABLE public.automations ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now() NOT NULL;
ALTER TABLE public.automations ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now() NOT NULL;
ALTER TABLE public.voice_command_logs ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid() NOT NULL;
ALTER TABLE public.voice_command_logs ADD COLUMN IF NOT EXISTS user_id uuid NOT NULL;
ALTER TABLE public.voice_command_logs ADD COLUMN IF NOT EXISTS transcript text NOT NULL;
ALTER TABLE public.voice_command_logs ADD COLUMN IF NOT EXISTS action text NOT NULL;
ALTER TABLE public.voice_command_logs ADD COLUMN IF NOT EXISTS response text;
ALTER TABLE public.voice_command_logs ADD COLUMN IF NOT EXISTS data jsonb DEFAULT '{}'::jsonb;
ALTER TABLE public.voice_command_logs ADD COLUMN IF NOT EXISTS duration_ms integer;
ALTER TABLE public.voice_command_logs ADD COLUMN IF NOT EXISTS success boolean DEFAULT true;
ALTER TABLE public.voice_command_logs ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now();
ALTER TABLE public.campaign_ab_variants ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid() NOT NULL;
ALTER TABLE public.campaign_ab_variants ADD COLUMN IF NOT EXISTS campaign_id uuid NOT NULL;
ALTER TABLE public.campaign_ab_variants ADD COLUMN IF NOT EXISTS variant_name text DEFAULT 'A'::text NOT NULL;
ALTER TABLE public.campaign_ab_variants ADD COLUMN IF NOT EXISTS message_content text NOT NULL;
ALTER TABLE public.campaign_ab_variants ADD COLUMN IF NOT EXISTS media_url text;
ALTER TABLE public.campaign_ab_variants ADD COLUMN IF NOT EXISTS send_count integer DEFAULT 0;
ALTER TABLE public.campaign_ab_variants ADD COLUMN IF NOT EXISTS delivered_count integer DEFAULT 0;
ALTER TABLE public.campaign_ab_variants ADD COLUMN IF NOT EXISTS read_count integer DEFAULT 0;
ALTER TABLE public.campaign_ab_variants ADD COLUMN IF NOT EXISTS response_count integer DEFAULT 0;
ALTER TABLE public.campaign_ab_variants ADD COLUMN IF NOT EXISTS is_winner boolean DEFAULT false;
ALTER TABLE public.campaign_ab_variants ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now() NOT NULL;
ALTER TABLE public.conversation_tasks ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid() NOT NULL;
ALTER TABLE public.conversation_tasks ADD COLUMN IF NOT EXISTS contact_id uuid;
ALTER TABLE public.conversation_tasks ADD COLUMN IF NOT EXISTS title text NOT NULL;
ALTER TABLE public.conversation_tasks ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE public.conversation_tasks ADD COLUMN IF NOT EXISTS assigned_to uuid;
ALTER TABLE public.conversation_tasks ADD COLUMN IF NOT EXISTS created_by uuid;
ALTER TABLE public.conversation_tasks ADD COLUMN IF NOT EXISTS due_date timestamp with time zone;
ALTER TABLE public.conversation_tasks ADD COLUMN IF NOT EXISTS priority text DEFAULT 'medium'::text NOT NULL;
ALTER TABLE public.conversation_tasks ADD COLUMN IF NOT EXISTS status text DEFAULT 'pending'::text NOT NULL;
ALTER TABLE public.conversation_tasks ADD COLUMN IF NOT EXISTS completed_at timestamp with time zone;
ALTER TABLE public.conversation_tasks ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now() NOT NULL;
ALTER TABLE public.conversation_tasks ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now() NOT NULL;
ALTER TABLE public.channel_connections ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid() NOT NULL;
ALTER TABLE public.channel_connections ADD COLUMN IF NOT EXISTS channel_type channel_type NOT NULL;
ALTER TABLE public.channel_connections ADD COLUMN IF NOT EXISTS name text NOT NULL;
ALTER TABLE public.channel_connections ADD COLUMN IF NOT EXISTS status text DEFAULT 'disconnected'::text NOT NULL;
ALTER TABLE public.channel_connections ADD COLUMN IF NOT EXISTS config jsonb DEFAULT '{}'::jsonb;
ALTER TABLE public.channel_connections ADD COLUMN IF NOT EXISTS credentials jsonb DEFAULT '{}'::jsonb;
ALTER TABLE public.channel_connections ADD COLUMN IF NOT EXISTS webhook_url text;
ALTER TABLE public.channel_connections ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true;
ALTER TABLE public.channel_connections ADD COLUMN IF NOT EXISTS created_by uuid;
ALTER TABLE public.channel_connections ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now() NOT NULL;
ALTER TABLE public.channel_connections ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now() NOT NULL;
ALTER TABLE public.channel_connections ADD COLUMN IF NOT EXISTS whatsapp_connection_id uuid;
ALTER TABLE public.channel_connections ADD COLUMN IF NOT EXISTS external_account_id text;
ALTER TABLE public.channel_connections ADD COLUMN IF NOT EXISTS external_page_id text;
ALTER TABLE public.csat_auto_config ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid() NOT NULL;
ALTER TABLE public.csat_auto_config ADD COLUMN IF NOT EXISTS is_enabled boolean DEFAULT false;
ALTER TABLE public.csat_auto_config ADD COLUMN IF NOT EXISTS delay_minutes integer DEFAULT 5;
ALTER TABLE public.csat_auto_config ADD COLUMN IF NOT EXISTS message_template text DEFAULT 'Olá {name}! Como foi seu atendimento? Avalie de 1 a 5 ⭐'::text;
ALTER TABLE public.csat_auto_config ADD COLUMN IF NOT EXISTS whatsapp_connection_id uuid;
ALTER TABLE public.csat_auto_config ADD COLUMN IF NOT EXISTS updated_by uuid;
ALTER TABLE public.csat_auto_config ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now();
ALTER TABLE public.csat_auto_config ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now();
ALTER TABLE public.followup_executions ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid() NOT NULL;
ALTER TABLE public.followup_executions ADD COLUMN IF NOT EXISTS sequence_id uuid NOT NULL;
ALTER TABLE public.followup_executions ADD COLUMN IF NOT EXISTS contact_id uuid NOT NULL;
ALTER TABLE public.followup_executions ADD COLUMN IF NOT EXISTS current_step integer DEFAULT 0;
ALTER TABLE public.followup_executions ADD COLUMN IF NOT EXISTS status text DEFAULT 'pending'::text NOT NULL;
ALTER TABLE public.followup_executions ADD COLUMN IF NOT EXISTS started_at timestamp with time zone DEFAULT now();
ALTER TABLE public.followup_executions ADD COLUMN IF NOT EXISTS next_step_at timestamp with time zone;
ALTER TABLE public.followup_executions ADD COLUMN IF NOT EXISTS completed_at timestamp with time zone;
ALTER TABLE public.followup_executions ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now();
ALTER TABLE public.followup_sequences ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid() NOT NULL;
ALTER TABLE public.followup_sequences ADD COLUMN IF NOT EXISTS name text NOT NULL;
ALTER TABLE public.followup_sequences ADD COLUMN IF NOT EXISTS trigger_event text DEFAULT 'ticket_resolved'::text NOT NULL;
ALTER TABLE public.followup_sequences ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true;
ALTER TABLE public.followup_sequences ADD COLUMN IF NOT EXISTS whatsapp_connection_id uuid;
ALTER TABLE public.followup_sequences ADD COLUMN IF NOT EXISTS created_by uuid;
ALTER TABLE public.followup_sequences ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now();
ALTER TABLE public.followup_sequences ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now();
ALTER TABLE public.whatsapp_templates ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid() NOT NULL;
ALTER TABLE public.whatsapp_templates ADD COLUMN IF NOT EXISTS name text NOT NULL;
ALTER TABLE public.whatsapp_templates ADD COLUMN IF NOT EXISTS category text DEFAULT 'utility'::text NOT NULL;
ALTER TABLE public.whatsapp_templates ADD COLUMN IF NOT EXISTS language text DEFAULT 'pt_BR'::text NOT NULL;
ALTER TABLE public.whatsapp_templates ADD COLUMN IF NOT EXISTS content text NOT NULL;
ALTER TABLE public.whatsapp_templates ADD COLUMN IF NOT EXISTS header_text text;
ALTER TABLE public.whatsapp_templates ADD COLUMN IF NOT EXISTS footer_text text;
ALTER TABLE public.whatsapp_templates ADD COLUMN IF NOT EXISTS buttons jsonb DEFAULT '[]'::jsonb;
ALTER TABLE public.whatsapp_templates ADD COLUMN IF NOT EXISTS variables text[] DEFAULT '{}'::text[];
ALTER TABLE public.whatsapp_templates ADD COLUMN IF NOT EXISTS status text DEFAULT 'draft'::text NOT NULL;
ALTER TABLE public.whatsapp_templates ADD COLUMN IF NOT EXISTS whatsapp_connection_id uuid;
ALTER TABLE public.whatsapp_templates ADD COLUMN IF NOT EXISTS created_by uuid;
ALTER TABLE public.whatsapp_templates ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now() NOT NULL;
ALTER TABLE public.whatsapp_templates ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now() NOT NULL;
ALTER TABLE public.knowledge_base_files ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid() NOT NULL;
ALTER TABLE public.knowledge_base_files ADD COLUMN IF NOT EXISTS article_id uuid;
ALTER TABLE public.knowledge_base_files ADD COLUMN IF NOT EXISTS file_name text NOT NULL;
ALTER TABLE public.knowledge_base_files ADD COLUMN IF NOT EXISTS file_url text NOT NULL;
ALTER TABLE public.knowledge_base_files ADD COLUMN IF NOT EXISTS file_type text;
ALTER TABLE public.knowledge_base_files ADD COLUMN IF NOT EXISTS file_size integer;
ALTER TABLE public.knowledge_base_files ADD COLUMN IF NOT EXISTS processing_status text DEFAULT 'pending'::text;
ALTER TABLE public.knowledge_base_files ADD COLUMN IF NOT EXISTS extracted_text text;
ALTER TABLE public.knowledge_base_files ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now();
ALTER TABLE public.rate_limit_configs ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid() NOT NULL;
ALTER TABLE public.rate_limit_configs ADD COLUMN IF NOT EXISTS name text NOT NULL;
ALTER TABLE public.rate_limit_configs ADD COLUMN IF NOT EXISTS endpoint_pattern text NOT NULL;
ALTER TABLE public.rate_limit_configs ADD COLUMN IF NOT EXISTS max_requests integer DEFAULT 100 NOT NULL;
ALTER TABLE public.rate_limit_configs ADD COLUMN IF NOT EXISTS window_seconds integer DEFAULT 60 NOT NULL;
ALTER TABLE public.rate_limit_configs ADD COLUMN IF NOT EXISTS block_duration_minutes integer DEFAULT 15 NOT NULL;
ALTER TABLE public.rate_limit_configs ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true;
ALTER TABLE public.rate_limit_configs ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now() NOT NULL;
ALTER TABLE public.rate_limit_configs ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now() NOT NULL;
ALTER TABLE public.chatbot_executions ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid() NOT NULL;
ALTER TABLE public.chatbot_executions ADD COLUMN IF NOT EXISTS flow_id uuid NOT NULL;
ALTER TABLE public.chatbot_executions ADD COLUMN IF NOT EXISTS contact_id uuid NOT NULL;
ALTER TABLE public.chatbot_executions ADD COLUMN IF NOT EXISTS current_node_id text;
ALTER TABLE public.chatbot_executions ADD COLUMN IF NOT EXISTS status text DEFAULT 'running'::text NOT NULL;
ALTER TABLE public.chatbot_executions ADD COLUMN IF NOT EXISTS variables jsonb DEFAULT '{}'::jsonb;
ALTER TABLE public.chatbot_executions ADD COLUMN IF NOT EXISTS started_at timestamp with time zone DEFAULT now() NOT NULL;
ALTER TABLE public.chatbot_executions ADD COLUMN IF NOT EXISTS completed_at timestamp with time zone;
ALTER TABLE public.chatbot_executions ADD COLUMN IF NOT EXISTS error_message text;
ALTER TABLE public.chatbot_executions ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now() NOT NULL;
ALTER TABLE public.sales_deals ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid() NOT NULL;
ALTER TABLE public.sales_deals ADD COLUMN IF NOT EXISTS title text NOT NULL;
ALTER TABLE public.sales_deals ADD COLUMN IF NOT EXISTS value numeric(12,2) DEFAULT 0;
ALTER TABLE public.sales_deals ADD COLUMN IF NOT EXISTS currency text DEFAULT 'BRL'::text;
ALTER TABLE public.sales_deals ADD COLUMN IF NOT EXISTS stage_id uuid;
ALTER TABLE public.sales_deals ADD COLUMN IF NOT EXISTS contact_id uuid;
ALTER TABLE public.sales_deals ADD COLUMN IF NOT EXISTS assigned_to uuid;
ALTER TABLE public.sales_deals ADD COLUMN IF NOT EXISTS priority text DEFAULT 'medium'::text;
ALTER TABLE public.sales_deals ADD COLUMN IF NOT EXISTS expected_close_date date;
ALTER TABLE public.sales_deals ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE public.sales_deals ADD COLUMN IF NOT EXISTS tags text[] DEFAULT '{}'::text[];
ALTER TABLE public.sales_deals ADD COLUMN IF NOT EXISTS status text DEFAULT 'open'::text;
ALTER TABLE public.sales_deals ADD COLUMN IF NOT EXISTS won_at timestamp with time zone;
ALTER TABLE public.sales_deals ADD COLUMN IF NOT EXISTS lost_at timestamp with time zone;
ALTER TABLE public.sales_deals ADD COLUMN IF NOT EXISTS lost_reason text;
ALTER TABLE public.sales_deals ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now();
ALTER TABLE public.sales_deals ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now();
ALTER TABLE public.agent_stats ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid() NOT NULL;
ALTER TABLE public.agent_stats ADD COLUMN IF NOT EXISTS profile_id uuid NOT NULL;
ALTER TABLE public.agent_stats ADD COLUMN IF NOT EXISTS xp integer DEFAULT 0 NOT NULL;
ALTER TABLE public.agent_stats ADD COLUMN IF NOT EXISTS level integer DEFAULT 1 NOT NULL;
ALTER TABLE public.agent_stats ADD COLUMN IF NOT EXISTS achievements_count integer DEFAULT 0 NOT NULL;
ALTER TABLE public.agent_stats ADD COLUMN IF NOT EXISTS messages_sent integer DEFAULT 0 NOT NULL;
ALTER TABLE public.agent_stats ADD COLUMN IF NOT EXISTS messages_received integer DEFAULT 0 NOT NULL;
ALTER TABLE public.agent_stats ADD COLUMN IF NOT EXISTS conversations_resolved integer DEFAULT 0 NOT NULL;
ALTER TABLE public.agent_stats ADD COLUMN IF NOT EXISTS avg_response_time_seconds integer DEFAULT 0;
ALTER TABLE public.agent_stats ADD COLUMN IF NOT EXISTS customer_satisfaction_score numeric(3,2) DEFAULT 0;
ALTER TABLE public.agent_stats ADD COLUMN IF NOT EXISTS current_streak integer DEFAULT 0 NOT NULL;
ALTER TABLE public.agent_stats ADD COLUMN IF NOT EXISTS best_streak integer DEFAULT 0 NOT NULL;
ALTER TABLE public.agent_stats ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now() NOT NULL;
ALTER TABLE public.agent_stats ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now() NOT NULL;
ALTER TABLE public.sicoob_contact_mapping ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid() NOT NULL;
ALTER TABLE public.sicoob_contact_mapping ADD COLUMN IF NOT EXISTS contact_id uuid NOT NULL;
ALTER TABLE public.sicoob_contact_mapping ADD COLUMN IF NOT EXISTS sicoob_user_id text NOT NULL;
ALTER TABLE public.sicoob_contact_mapping ADD COLUMN IF NOT EXISTS sicoob_vendedor_id text NOT NULL;
ALTER TABLE public.sicoob_contact_mapping ADD COLUMN IF NOT EXISTS sicoob_singular_id text NOT NULL;
ALTER TABLE public.sicoob_contact_mapping ADD COLUMN IF NOT EXISTS zappweb_agent_id uuid;
ALTER TABLE public.sicoob_contact_mapping ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now();
ALTER TABLE public.sla_configurations ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid() NOT NULL;
ALTER TABLE public.sla_configurations ADD COLUMN IF NOT EXISTS name text NOT NULL;
ALTER TABLE public.sla_configurations ADD COLUMN IF NOT EXISTS first_response_minutes integer DEFAULT 5 NOT NULL;
ALTER TABLE public.sla_configurations ADD COLUMN IF NOT EXISTS resolution_minutes integer DEFAULT 60 NOT NULL;
ALTER TABLE public.sla_configurations ADD COLUMN IF NOT EXISTS priority text DEFAULT 'medium'::text NOT NULL;
ALTER TABLE public.sla_configurations ADD COLUMN IF NOT EXISTS is_default boolean DEFAULT false;
ALTER TABLE public.sla_configurations ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true;
ALTER TABLE public.sla_configurations ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now() NOT NULL;
ALTER TABLE public.sla_configurations ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now() NOT NULL;
ALTER TABLE public.reminders ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid() NOT NULL;
ALTER TABLE public.reminders ADD COLUMN IF NOT EXISTS contact_id uuid;
ALTER TABLE public.reminders ADD COLUMN IF NOT EXISTS profile_id uuid NOT NULL;
ALTER TABLE public.reminders ADD COLUMN IF NOT EXISTS title text NOT NULL;
ALTER TABLE public.reminders ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE public.reminders ADD COLUMN IF NOT EXISTS remind_at timestamp with time zone NOT NULL;
ALTER TABLE public.reminders ADD COLUMN IF NOT EXISTS is_dismissed boolean DEFAULT false NOT NULL;
ALTER TABLE public.reminders ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now() NOT NULL;
ALTER TABLE public.role_permissions ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid() NOT NULL;
ALTER TABLE public.role_permissions ADD COLUMN IF NOT EXISTS role app_role NOT NULL;
ALTER TABLE public.role_permissions ADD COLUMN IF NOT EXISTS permission_id uuid NOT NULL;
ALTER TABLE public.role_permissions ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now() NOT NULL;
ALTER TABLE public.user_roles ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid() NOT NULL;
ALTER TABLE public.user_roles ADD COLUMN IF NOT EXISTS user_id uuid NOT NULL;
ALTER TABLE public.user_roles ADD COLUMN IF NOT EXISTS role app_role DEFAULT 'agent'::app_role NOT NULL;
ALTER TABLE public.user_roles ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now() NOT NULL;
ALTER TABLE public.user_service_accounts ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid() NOT NULL;
ALTER TABLE public.user_service_accounts ADD COLUMN IF NOT EXISTS user_id uuid NOT NULL;
ALTER TABLE public.user_service_accounts ADD COLUMN IF NOT EXISTS service_type service_account_type NOT NULL;
ALTER TABLE public.user_service_accounts ADD COLUMN IF NOT EXISTS account_email text NOT NULL;
ALTER TABLE public.user_service_accounts ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true NOT NULL;
ALTER TABLE public.user_service_accounts ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now() NOT NULL;
ALTER TABLE public.user_service_accounts ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now() NOT NULL;
ALTER TABLE public.warroom_alerts ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid() NOT NULL;
ALTER TABLE public.warroom_alerts ADD COLUMN IF NOT EXISTS alert_type text DEFAULT 'warning'::text NOT NULL;
ALTER TABLE public.warroom_alerts ADD COLUMN IF NOT EXISTS title text NOT NULL;
ALTER TABLE public.warroom_alerts ADD COLUMN IF NOT EXISTS message text NOT NULL;
ALTER TABLE public.warroom_alerts ADD COLUMN IF NOT EXISTS source text;
ALTER TABLE public.warroom_alerts ADD COLUMN IF NOT EXISTS is_read boolean DEFAULT false;
ALTER TABLE public.warroom_alerts ADD COLUMN IF NOT EXISTS dismissed_by uuid;
ALTER TABLE public.warroom_alerts ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now();
ALTER TABLE public.deal_activities ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid() NOT NULL;
ALTER TABLE public.deal_activities ADD COLUMN IF NOT EXISTS deal_id uuid NOT NULL;
ALTER TABLE public.deal_activities ADD COLUMN IF NOT EXISTS activity_type text NOT NULL;
ALTER TABLE public.deal_activities ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE public.deal_activities ADD COLUMN IF NOT EXISTS performed_by uuid;
ALTER TABLE public.deal_activities ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now();
ALTER TABLE public.email_labels ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid() NOT NULL;
ALTER TABLE public.email_labels ADD COLUMN IF NOT EXISTS gmail_account_id uuid NOT NULL;
ALTER TABLE public.email_labels ADD COLUMN IF NOT EXISTS gmail_label_id text NOT NULL;
ALTER TABLE public.email_labels ADD COLUMN IF NOT EXISTS name text NOT NULL;
ALTER TABLE public.email_labels ADD COLUMN IF NOT EXISTS label_type text DEFAULT 'user'::text NOT NULL;
ALTER TABLE public.email_labels ADD COLUMN IF NOT EXISTS color text;
ALTER TABLE public.email_labels ADD COLUMN IF NOT EXISTS message_count integer DEFAULT 0 NOT NULL;
ALTER TABLE public.email_labels ADD COLUMN IF NOT EXISTS unread_count integer DEFAULT 0 NOT NULL;
ALTER TABLE public.email_labels ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now() NOT NULL;
ALTER TABLE public.sla_rules ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid() NOT NULL;
ALTER TABLE public.sla_rules ADD COLUMN IF NOT EXISTS name text NOT NULL;
ALTER TABLE public.sla_rules ADD COLUMN IF NOT EXISTS first_response_minutes integer DEFAULT 5 NOT NULL;
ALTER TABLE public.sla_rules ADD COLUMN IF NOT EXISTS resolution_minutes integer DEFAULT 60 NOT NULL;
ALTER TABLE public.sla_rules ADD COLUMN IF NOT EXISTS priority integer DEFAULT 0 NOT NULL;
ALTER TABLE public.sla_rules ADD COLUMN IF NOT EXISTS contact_id uuid;
ALTER TABLE public.sla_rules ADD COLUMN IF NOT EXISTS company text;
ALTER TABLE public.sla_rules ADD COLUMN IF NOT EXISTS job_title text;
ALTER TABLE public.sla_rules ADD COLUMN IF NOT EXISTS contact_type text;
ALTER TABLE public.sla_rules ADD COLUMN IF NOT EXISTS queue_id uuid;
ALTER TABLE public.sla_rules ADD COLUMN IF NOT EXISTS agent_id uuid;
ALTER TABLE public.sla_rules ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true NOT NULL;
ALTER TABLE public.sla_rules ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now() NOT NULL;
ALTER TABLE public.sla_rules ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now() NOT NULL;
ALTER TABLE public.sla_rules ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}'::jsonb;
ALTER TABLE public.stickers ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid() NOT NULL;
ALTER TABLE public.stickers ADD COLUMN IF NOT EXISTS name text;
ALTER TABLE public.stickers ADD COLUMN IF NOT EXISTS image_url text NOT NULL;
ALTER TABLE public.stickers ADD COLUMN IF NOT EXISTS category text DEFAULT 'geral'::text;
ALTER TABLE public.stickers ADD COLUMN IF NOT EXISTS uploaded_by text;
ALTER TABLE public.stickers ADD COLUMN IF NOT EXISTS is_favorite boolean DEFAULT false;
ALTER TABLE public.stickers ADD COLUMN IF NOT EXISTS use_count integer DEFAULT 0;
ALTER TABLE public.stickers ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now();
ALTER TABLE public.stickers ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now();
ALTER TABLE public.stickers ADD COLUMN IF NOT EXISTS owner_id uuid;
ALTER TABLE public.away_messages ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid() NOT NULL;
ALTER TABLE public.away_messages ADD COLUMN IF NOT EXISTS whatsapp_connection_id uuid NOT NULL;
ALTER TABLE public.away_messages ADD COLUMN IF NOT EXISTS content text DEFAULT 'Estamos fora do horário de atendimento. Retornaremos em breve!'::text;
ALTER TABLE public.away_messages ADD COLUMN IF NOT EXISTS is_enabled boolean DEFAULT true;
ALTER TABLE public.away_messages ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now() NOT NULL;
ALTER TABLE public.away_messages ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now() NOT NULL;
ALTER TABLE public.blocked_countries ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid() NOT NULL;
ALTER TABLE public.blocked_countries ADD COLUMN IF NOT EXISTS country_code text NOT NULL;
ALTER TABLE public.blocked_countries ADD COLUMN IF NOT EXISTS country_name text NOT NULL;
ALTER TABLE public.blocked_countries ADD COLUMN IF NOT EXISTS reason text;
ALTER TABLE public.blocked_countries ADD COLUMN IF NOT EXISTS blocked_by uuid;
ALTER TABLE public.blocked_countries ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now() NOT NULL;
ALTER TABLE public.blocked_ips ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid() NOT NULL;
ALTER TABLE public.blocked_ips ADD COLUMN IF NOT EXISTS ip_address text NOT NULL;
ALTER TABLE public.blocked_ips ADD COLUMN IF NOT EXISTS reason text NOT NULL;
ALTER TABLE public.blocked_ips ADD COLUMN IF NOT EXISTS blocked_by uuid;
ALTER TABLE public.blocked_ips ADD COLUMN IF NOT EXISTS blocked_at timestamp with time zone DEFAULT now() NOT NULL;
ALTER TABLE public.blocked_ips ADD COLUMN IF NOT EXISTS expires_at timestamp with time zone;
ALTER TABLE public.blocked_ips ADD COLUMN IF NOT EXISTS is_permanent boolean DEFAULT false;
ALTER TABLE public.blocked_ips ADD COLUMN IF NOT EXISTS request_count integer DEFAULT 0;
ALTER TABLE public.blocked_ips ADD COLUMN IF NOT EXISTS last_attempt_at timestamp with time zone;
ALTER TABLE public.blocked_ips ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now() NOT NULL;
ALTER TABLE public.business_hours ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid() NOT NULL;
ALTER TABLE public.business_hours ADD COLUMN IF NOT EXISTS whatsapp_connection_id uuid NOT NULL;
ALTER TABLE public.business_hours ADD COLUMN IF NOT EXISTS day_of_week integer NOT NULL;
ALTER TABLE public.business_hours ADD COLUMN IF NOT EXISTS is_open boolean DEFAULT true;
ALTER TABLE public.business_hours ADD COLUMN IF NOT EXISTS open_time time without time zone DEFAULT '09:00:00'::time without time zone;
ALTER TABLE public.business_hours ADD COLUMN IF NOT EXISTS close_time time without time zone DEFAULT '18:00:00'::time without time zone;
ALTER TABLE public.business_hours ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now() NOT NULL;
ALTER TABLE public.business_hours ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now() NOT NULL;
ALTER TABLE public.team_messages ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid() NOT NULL;
ALTER TABLE public.team_messages ADD COLUMN IF NOT EXISTS conversation_id uuid NOT NULL;
ALTER TABLE public.team_messages ADD COLUMN IF NOT EXISTS sender_id uuid NOT NULL;
ALTER TABLE public.team_messages ADD COLUMN IF NOT EXISTS content text NOT NULL;
ALTER TABLE public.team_messages ADD COLUMN IF NOT EXISTS message_type text DEFAULT 'text'::text NOT NULL;
ALTER TABLE public.team_messages ADD COLUMN IF NOT EXISTS reply_to_id uuid;
ALTER TABLE public.team_messages ADD COLUMN IF NOT EXISTS is_edited boolean DEFAULT false;
ALTER TABLE public.team_messages ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now() NOT NULL;
ALTER TABLE public.team_messages ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now() NOT NULL;
ALTER TABLE public.team_messages ADD COLUMN IF NOT EXISTS media_url text;
ALTER TABLE public.team_messages ADD COLUMN IF NOT EXISTS media_type text;
ALTER TABLE public.training_sessions ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid() NOT NULL;
ALTER TABLE public.training_sessions ADD COLUMN IF NOT EXISTS profile_id uuid NOT NULL;
ALTER TABLE public.training_sessions ADD COLUMN IF NOT EXISTS scenario_name text NOT NULL;
ALTER TABLE public.training_sessions ADD COLUMN IF NOT EXISTS scenario_type text DEFAULT 'general'::text;
ALTER TABLE public.training_sessions ADD COLUMN IF NOT EXISTS messages jsonb DEFAULT '[]'::jsonb;
ALTER TABLE public.training_sessions ADD COLUMN IF NOT EXISTS score integer;
ALTER TABLE public.training_sessions ADD COLUMN IF NOT EXISTS feedback text;
ALTER TABLE public.training_sessions ADD COLUMN IF NOT EXISTS status text DEFAULT 'in_progress'::text;
ALTER TABLE public.training_sessions ADD COLUMN IF NOT EXISTS started_at timestamp with time zone DEFAULT now() NOT NULL;
ALTER TABLE public.training_sessions ADD COLUMN IF NOT EXISTS completed_at timestamp with time zone;
ALTER TABLE public.training_sessions ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now() NOT NULL;
ALTER TABLE public.auto_close_config ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid() NOT NULL;
ALTER TABLE public.auto_close_config ADD COLUMN IF NOT EXISTS inactivity_hours integer DEFAULT 24 NOT NULL;
ALTER TABLE public.auto_close_config ADD COLUMN IF NOT EXISTS is_enabled boolean DEFAULT false NOT NULL;
ALTER TABLE public.auto_close_config ADD COLUMN IF NOT EXISTS close_message text DEFAULT 'Conversa encerrada automaticamente por inatividade.'::text;
ALTER TABLE public.auto_close_config ADD COLUMN IF NOT EXISTS updated_by uuid;
ALTER TABLE public.auto_close_config ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now() NOT NULL;
ALTER TABLE public.auto_close_config ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now() NOT NULL;
ALTER TABLE public.email_messages ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid() NOT NULL;
ALTER TABLE public.email_messages ADD COLUMN IF NOT EXISTS thread_id uuid NOT NULL;
ALTER TABLE public.email_messages ADD COLUMN IF NOT EXISTS gmail_message_id text NOT NULL;
ALTER TABLE public.email_messages ADD COLUMN IF NOT EXISTS gmail_account_id uuid NOT NULL;
ALTER TABLE public.email_messages ADD COLUMN IF NOT EXISTS from_address text DEFAULT ''::text NOT NULL;
ALTER TABLE public.email_messages ADD COLUMN IF NOT EXISTS from_name text;
ALTER TABLE public.email_messages ADD COLUMN IF NOT EXISTS to_addresses text[] DEFAULT '{}'::text[] NOT NULL;
ALTER TABLE public.email_messages ADD COLUMN IF NOT EXISTS cc_addresses text[] DEFAULT '{}'::text[] NOT NULL;
ALTER TABLE public.email_messages ADD COLUMN IF NOT EXISTS bcc_addresses text[] DEFAULT '{}'::text[] NOT NULL;
ALTER TABLE public.email_messages ADD COLUMN IF NOT EXISTS reply_to_address text;
ALTER TABLE public.email_messages ADD COLUMN IF NOT EXISTS subject text DEFAULT ''::text NOT NULL;
ALTER TABLE public.email_messages ADD COLUMN IF NOT EXISTS body_text text DEFAULT ''::text NOT NULL;
ALTER TABLE public.email_messages ADD COLUMN IF NOT EXISTS body_html text DEFAULT ''::text NOT NULL;
ALTER TABLE public.email_messages ADD COLUMN IF NOT EXISTS snippet text DEFAULT ''::text NOT NULL;
ALTER TABLE public.email_messages ADD COLUMN IF NOT EXISTS label_ids text[] DEFAULT '{}'::text[] NOT NULL;
ALTER TABLE public.email_messages ADD COLUMN IF NOT EXISTS is_read boolean DEFAULT false NOT NULL;
ALTER TABLE public.email_messages ADD COLUMN IF NOT EXISTS is_starred boolean DEFAULT false NOT NULL;
ALTER TABLE public.email_messages ADD COLUMN IF NOT EXISTS has_attachments boolean DEFAULT false NOT NULL;
ALTER TABLE public.email_messages ADD COLUMN IF NOT EXISTS in_reply_to text;
ALTER TABLE public.email_messages ADD COLUMN IF NOT EXISTS references_header text;
ALTER TABLE public.email_messages ADD COLUMN IF NOT EXISTS internal_date timestamp with time zone DEFAULT now() NOT NULL;
ALTER TABLE public.email_messages ADD COLUMN IF NOT EXISTS direction text DEFAULT 'inbound'::text NOT NULL;
ALTER TABLE public.email_messages ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now() NOT NULL;
ALTER TABLE public.user_devices ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid() NOT NULL;
ALTER TABLE public.user_devices ADD COLUMN IF NOT EXISTS user_id uuid NOT NULL;
ALTER TABLE public.user_devices ADD COLUMN IF NOT EXISTS device_fingerprint text NOT NULL;
ALTER TABLE public.user_devices ADD COLUMN IF NOT EXISTS device_name text;
ALTER TABLE public.user_devices ADD COLUMN IF NOT EXISTS browser text;
ALTER TABLE public.user_devices ADD COLUMN IF NOT EXISTS os text;
ALTER TABLE public.user_devices ADD COLUMN IF NOT EXISTS ip_address text;
ALTER TABLE public.user_devices ADD COLUMN IF NOT EXISTS city text;
ALTER TABLE public.user_devices ADD COLUMN IF NOT EXISTS country text;
ALTER TABLE public.user_devices ADD COLUMN IF NOT EXISTS is_trusted boolean DEFAULT false;
ALTER TABLE public.user_devices ADD COLUMN IF NOT EXISTS first_seen_at timestamp with time zone DEFAULT now() NOT NULL;
ALTER TABLE public.user_devices ADD COLUMN IF NOT EXISTS last_seen_at timestamp with time zone DEFAULT now() NOT NULL;
ALTER TABLE public.user_devices ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now() NOT NULL;
ALTER TABLE public.user_settings ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid() NOT NULL;
ALTER TABLE public.user_settings ADD COLUMN IF NOT EXISTS user_id uuid NOT NULL;
ALTER TABLE public.user_settings ADD COLUMN IF NOT EXISTS business_hours_enabled boolean DEFAULT true;
ALTER TABLE public.user_settings ADD COLUMN IF NOT EXISTS business_hours_start text DEFAULT '09:00'::text;
ALTER TABLE public.user_settings ADD COLUMN IF NOT EXISTS business_hours_end text DEFAULT '18:00'::text;
ALTER TABLE public.user_settings ADD COLUMN IF NOT EXISTS work_days integer[] DEFAULT '{1,2,3,4,5}'::integer[];
ALTER TABLE public.user_settings ADD COLUMN IF NOT EXISTS welcome_message text DEFAULT ''::text;
ALTER TABLE public.user_settings ADD COLUMN IF NOT EXISTS away_message text DEFAULT ''::text;
ALTER TABLE public.user_settings ADD COLUMN IF NOT EXISTS closing_message text DEFAULT ''::text;
ALTER TABLE public.user_settings ADD COLUMN IF NOT EXISTS auto_assignment_enabled boolean DEFAULT true;
ALTER TABLE public.user_settings ADD COLUMN IF NOT EXISTS auto_assignment_method text DEFAULT 'roundrobin'::text;
ALTER TABLE public.user_settings ADD COLUMN IF NOT EXISTS inactivity_timeout integer DEFAULT 30;
ALTER TABLE public.user_settings ADD COLUMN IF NOT EXISTS sound_enabled boolean DEFAULT true;
ALTER TABLE public.user_settings ADD COLUMN IF NOT EXISTS browser_notifications_enabled boolean DEFAULT true;
ALTER TABLE public.user_settings ADD COLUMN IF NOT EXISTS quiet_hours_enabled boolean DEFAULT false;
ALTER TABLE public.user_settings ADD COLUMN IF NOT EXISTS quiet_hours_start text DEFAULT '22:00'::text;
ALTER TABLE public.user_settings ADD COLUMN IF NOT EXISTS quiet_hours_end text DEFAULT '07:00'::text;
ALTER TABLE public.user_settings ADD COLUMN IF NOT EXISTS theme text DEFAULT 'system'::text;
ALTER TABLE public.user_settings ADD COLUMN IF NOT EXISTS language text DEFAULT 'pt-BR'::text;
ALTER TABLE public.user_settings ADD COLUMN IF NOT EXISTS compact_mode boolean DEFAULT false;
ALTER TABLE public.user_settings ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now() NOT NULL;
ALTER TABLE public.user_settings ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now() NOT NULL;
ALTER TABLE public.user_settings ADD COLUMN IF NOT EXISTS sentiment_alert_threshold integer DEFAULT 30;
ALTER TABLE public.user_settings ADD COLUMN IF NOT EXISTS sentiment_alert_enabled boolean DEFAULT true;
ALTER TABLE public.user_settings ADD COLUMN IF NOT EXISTS sentiment_consecutive_count integer DEFAULT 2;
ALTER TABLE public.user_settings ADD COLUMN IF NOT EXISTS tts_voice_id text DEFAULT 'EXAVITQu4vr4xnSDxMaL'::text;
ALTER TABLE public.user_settings ADD COLUMN IF NOT EXISTS tts_speed numeric DEFAULT 1.0;
ALTER TABLE public.user_settings ADD COLUMN IF NOT EXISTS auto_transcription_enabled boolean DEFAULT true;
ALTER TABLE public.user_settings ADD COLUMN IF NOT EXISTS transcription_notification_enabled boolean DEFAULT true;
ALTER TABLE public.user_settings ADD COLUMN IF NOT EXISTS message_sound_type text DEFAULT 'chime'::text;
ALTER TABLE public.user_settings ADD COLUMN IF NOT EXISTS mention_sound_type text DEFAULT 'bell'::text;
ALTER TABLE public.user_settings ADD COLUMN IF NOT EXISTS sla_sound_type text DEFAULT 'alert'::text;
ALTER TABLE public.user_settings ADD COLUMN IF NOT EXISTS goal_sound_type text DEFAULT 'chime'::text;
ALTER TABLE public.user_settings ADD COLUMN IF NOT EXISTS transcription_sound_type text DEFAULT 'soft'::text;
ALTER TABLE public.user_sessions ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid() NOT NULL;
ALTER TABLE public.user_sessions ADD COLUMN IF NOT EXISTS user_id uuid NOT NULL;
ALTER TABLE public.user_sessions ADD COLUMN IF NOT EXISTS device_id uuid;
ALTER TABLE public.user_sessions ADD COLUMN IF NOT EXISTS ip_address text;
ALTER TABLE public.user_sessions ADD COLUMN IF NOT EXISTS user_agent text;
ALTER TABLE public.user_sessions ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true;
ALTER TABLE public.user_sessions ADD COLUMN IF NOT EXISTS started_at timestamp with time zone DEFAULT now() NOT NULL;
ALTER TABLE public.user_sessions ADD COLUMN IF NOT EXISTS last_activity_at timestamp with time zone DEFAULT now() NOT NULL;
ALTER TABLE public.user_sessions ADD COLUMN IF NOT EXISTS expires_at timestamp with time zone DEFAULT (now() + '24:00:00'::interval) NOT NULL;
ALTER TABLE public.user_sessions ADD COLUMN IF NOT EXISTS ended_at timestamp with time zone;
ALTER TABLE public.connection_health_logs ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid() NOT NULL;
ALTER TABLE public.connection_health_logs ADD COLUMN IF NOT EXISTS connection_id uuid NOT NULL;
ALTER TABLE public.connection_health_logs ADD COLUMN IF NOT EXISTS instance_id text NOT NULL;
ALTER TABLE public.connection_health_logs ADD COLUMN IF NOT EXISTS status text DEFAULT 'unknown'::text NOT NULL;
ALTER TABLE public.connection_health_logs ADD COLUMN IF NOT EXISTS response_time_ms integer;
ALTER TABLE public.connection_health_logs ADD COLUMN IF NOT EXISTS error_message text;
ALTER TABLE public.connection_health_logs ADD COLUMN IF NOT EXISTS checked_at timestamp with time zone DEFAULT now() NOT NULL;
ALTER TABLE public.allowed_countries ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid() NOT NULL;
ALTER TABLE public.allowed_countries ADD COLUMN IF NOT EXISTS country_code text NOT NULL;
ALTER TABLE public.allowed_countries ADD COLUMN IF NOT EXISTS country_name text NOT NULL;
ALTER TABLE public.allowed_countries ADD COLUMN IF NOT EXISTS added_by uuid;
ALTER TABLE public.allowed_countries ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now() NOT NULL;
ALTER TABLE public.audio_memes ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid() NOT NULL;
ALTER TABLE public.audio_memes ADD COLUMN IF NOT EXISTS name text NOT NULL;
ALTER TABLE public.audio_memes ADD COLUMN IF NOT EXISTS audio_url text NOT NULL;
ALTER TABLE public.audio_memes ADD COLUMN IF NOT EXISTS category text DEFAULT 'outros'::text NOT NULL;
ALTER TABLE public.audio_memes ADD COLUMN IF NOT EXISTS duration_seconds numeric(6,2);
ALTER TABLE public.audio_memes ADD COLUMN IF NOT EXISTS is_favorite boolean DEFAULT false NOT NULL;
ALTER TABLE public.audio_memes ADD COLUMN IF NOT EXISTS use_count integer DEFAULT 0 NOT NULL;
ALTER TABLE public.audio_memes ADD COLUMN IF NOT EXISTS uploaded_by uuid;
ALTER TABLE public.audio_memes ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now() NOT NULL;
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid() NOT NULL;
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS user_id uuid;
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS action text NOT NULL;
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS entity_type text;
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS entity_id uuid;
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS details jsonb DEFAULT '{}'::jsonb;
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS ip_address text;
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS user_agent text;
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now() NOT NULL;
ALTER TABLE public.chatbot_flows ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid() NOT NULL;
ALTER TABLE public.chatbot_flows ADD COLUMN IF NOT EXISTS name text NOT NULL;
ALTER TABLE public.chatbot_flows ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE public.chatbot_flows ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT false;
ALTER TABLE public.chatbot_flows ADD COLUMN IF NOT EXISTS trigger_type text DEFAULT 'keyword'::text NOT NULL;
ALTER TABLE public.chatbot_flows ADD COLUMN IF NOT EXISTS trigger_value text;
ALTER TABLE public.chatbot_flows ADD COLUMN IF NOT EXISTS nodes jsonb DEFAULT '[]'::jsonb NOT NULL;
ALTER TABLE public.chatbot_flows ADD COLUMN IF NOT EXISTS edges jsonb DEFAULT '[]'::jsonb NOT NULL;
ALTER TABLE public.chatbot_flows ADD COLUMN IF NOT EXISTS variables jsonb DEFAULT '{}'::jsonb;
ALTER TABLE public.chatbot_flows ADD COLUMN IF NOT EXISTS whatsapp_connection_id uuid;
ALTER TABLE public.chatbot_flows ADD COLUMN IF NOT EXISTS created_by uuid;
ALTER TABLE public.chatbot_flows ADD COLUMN IF NOT EXISTS execution_count integer DEFAULT 0;
ALTER TABLE public.chatbot_flows ADD COLUMN IF NOT EXISTS last_executed_at timestamp with time zone;
ALTER TABLE public.chatbot_flows ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now() NOT NULL;
ALTER TABLE public.chatbot_flows ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now() NOT NULL;
ALTER TABLE public.client_wallet_rules ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid() NOT NULL;
ALTER TABLE public.client_wallet_rules ADD COLUMN IF NOT EXISTS name text NOT NULL;
ALTER TABLE public.client_wallet_rules ADD COLUMN IF NOT EXISTS agent_id uuid NOT NULL;
ALTER TABLE public.client_wallet_rules ADD COLUMN IF NOT EXISTS whatsapp_connection_id uuid;
ALTER TABLE public.client_wallet_rules ADD COLUMN IF NOT EXISTS priority integer DEFAULT 0;
ALTER TABLE public.client_wallet_rules ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true;
ALTER TABLE public.client_wallet_rules ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now() NOT NULL;
ALTER TABLE public.queues ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid() NOT NULL;
ALTER TABLE public.queues ADD COLUMN IF NOT EXISTS name text NOT NULL;
ALTER TABLE public.queues ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE public.queues ADD COLUMN IF NOT EXISTS color text DEFAULT '#3B82F6'::text NOT NULL;
ALTER TABLE public.queues ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true;
ALTER TABLE public.queues ADD COLUMN IF NOT EXISTS max_wait_time_minutes integer DEFAULT 30;
ALTER TABLE public.queues ADD COLUMN IF NOT EXISTS priority integer DEFAULT 0;
ALTER TABLE public.queues ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now() NOT NULL;
ALTER TABLE public.queues ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now() NOT NULL;
ALTER TABLE public.payment_links ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid() NOT NULL;
ALTER TABLE public.payment_links ADD COLUMN IF NOT EXISTS title text NOT NULL;
ALTER TABLE public.payment_links ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE public.payment_links ADD COLUMN IF NOT EXISTS amount numeric(12,2) NOT NULL;
ALTER TABLE public.payment_links ADD COLUMN IF NOT EXISTS currency text DEFAULT 'BRL'::text;
ALTER TABLE public.payment_links ADD COLUMN IF NOT EXISTS status text DEFAULT 'active'::text;
ALTER TABLE public.payment_links ADD COLUMN IF NOT EXISTS payment_method text DEFAULT 'pix'::text;
ALTER TABLE public.payment_links ADD COLUMN IF NOT EXISTS payment_url text;
ALTER TABLE public.payment_links ADD COLUMN IF NOT EXISTS external_id text;
ALTER TABLE public.payment_links ADD COLUMN IF NOT EXISTS contact_id uuid;
ALTER TABLE public.payment_links ADD COLUMN IF NOT EXISTS deal_id uuid;
ALTER TABLE public.payment_links ADD COLUMN IF NOT EXISTS created_by uuid;
ALTER TABLE public.payment_links ADD COLUMN IF NOT EXISTS paid_at timestamp with time zone;
ALTER TABLE public.payment_links ADD COLUMN IF NOT EXISTS expires_at timestamp with time zone;
ALTER TABLE public.payment_links ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now();
ALTER TABLE public.payment_links ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now();
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid() NOT NULL;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS name text NOT NULL;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS price numeric(10,2) NOT NULL;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS currency text DEFAULT 'BRL'::text NOT NULL;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS image_url text;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS category text;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS sku text;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS stock_quantity integer DEFAULT 0;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS retailer_id text;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS whatsapp_connection_id uuid;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now() NOT NULL;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now() NOT NULL;
ALTER TABLE public.team_conversations ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid() NOT NULL;
ALTER TABLE public.team_conversations ADD COLUMN IF NOT EXISTS type text DEFAULT 'direct'::text NOT NULL;
ALTER TABLE public.team_conversations ADD COLUMN IF NOT EXISTS name text;
ALTER TABLE public.team_conversations ADD COLUMN IF NOT EXISTS avatar_url text;
ALTER TABLE public.team_conversations ADD COLUMN IF NOT EXISTS created_by uuid;
ALTER TABLE public.team_conversations ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now() NOT NULL;
ALTER TABLE public.team_conversations ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now() NOT NULL;
ALTER TABLE public.login_attempts ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid() NOT NULL;
ALTER TABLE public.login_attempts ADD COLUMN IF NOT EXISTS email text NOT NULL;
ALTER TABLE public.login_attempts ADD COLUMN IF NOT EXISTS ip_address text;
ALTER TABLE public.login_attempts ADD COLUMN IF NOT EXISTS user_agent text;
ALTER TABLE public.login_attempts ADD COLUMN IF NOT EXISTS attempt_count integer DEFAULT 1 NOT NULL;
ALTER TABLE public.login_attempts ADD COLUMN IF NOT EXISTS last_attempt_at timestamp with time zone DEFAULT now() NOT NULL;
ALTER TABLE public.login_attempts ADD COLUMN IF NOT EXISTS locked_until timestamp with time zone;
ALTER TABLE public.login_attempts ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now() NOT NULL;
ALTER TABLE public.login_attempts ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now() NOT NULL;
ALTER TABLE public.conversation_snoozes ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid() NOT NULL;
ALTER TABLE public.conversation_snoozes ADD COLUMN IF NOT EXISTS contact_id uuid NOT NULL;
ALTER TABLE public.conversation_snoozes ADD COLUMN IF NOT EXISTS snoozed_by uuid NOT NULL;
ALTER TABLE public.conversation_snoozes ADD COLUMN IF NOT EXISTS snooze_until timestamp with time zone NOT NULL;
ALTER TABLE public.conversation_snoozes ADD COLUMN IF NOT EXISTS reason text;
ALTER TABLE public.conversation_snoozes ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now() NOT NULL;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid() NOT NULL;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS user_id uuid NOT NULL;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS name text NOT NULL;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS avatar_url text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS role text DEFAULT 'agent'::text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS max_chats integer DEFAULT 5;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now() NOT NULL;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now() NOT NULL;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS job_title text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS department text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS phone text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS access_level text DEFAULT 'basic'::text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS permissions jsonb DEFAULT '{}'::jsonb;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS session_invalidated_at timestamp with time zone;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS birthday date;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS nickname text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS signature text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS can_download boolean DEFAULT false NOT NULL;
ALTER TABLE public.query_telemetry ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid() NOT NULL;
ALTER TABLE public.query_telemetry ADD COLUMN IF NOT EXISTS operation text DEFAULT 'select'::text NOT NULL;
ALTER TABLE public.query_telemetry ADD COLUMN IF NOT EXISTS table_name text;
ALTER TABLE public.query_telemetry ADD COLUMN IF NOT EXISTS rpc_name text;
ALTER TABLE public.query_telemetry ADD COLUMN IF NOT EXISTS duration_ms integer DEFAULT 0 NOT NULL;
ALTER TABLE public.query_telemetry ADD COLUMN IF NOT EXISTS record_count integer;
ALTER TABLE public.query_telemetry ADD COLUMN IF NOT EXISTS query_limit integer;
ALTER TABLE public.query_telemetry ADD COLUMN IF NOT EXISTS query_offset integer;
ALTER TABLE public.query_telemetry ADD COLUMN IF NOT EXISTS count_mode text;
ALTER TABLE public.query_telemetry ADD COLUMN IF NOT EXISTS severity text DEFAULT 'normal'::text NOT NULL;
ALTER TABLE public.query_telemetry ADD COLUMN IF NOT EXISTS error_message text;
ALTER TABLE public.query_telemetry ADD COLUMN IF NOT EXISTS user_id uuid;
ALTER TABLE public.query_telemetry ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now() NOT NULL;
ALTER TABLE public.agent_visibility_grants ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid() NOT NULL;
ALTER TABLE public.agent_visibility_grants ADD COLUMN IF NOT EXISTS agent_id uuid NOT NULL;
ALTER TABLE public.agent_visibility_grants ADD COLUMN IF NOT EXISTS can_see_agent_id uuid NOT NULL;
ALTER TABLE public.agent_visibility_grants ADD COLUMN IF NOT EXISTS granted_by uuid;
ALTER TABLE public.agent_visibility_grants ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now() NOT NULL;
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid() NOT NULL;
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS name text NOT NULL;
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS phone text NOT NULL;
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS avatar_url text;
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS assigned_to uuid;
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS whatsapp_connection_id uuid;
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS tags text[] DEFAULT '{}'::text[];
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now() NOT NULL;
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now() NOT NULL;
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS nickname text;
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS surname text;
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS job_title text;
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS company text;
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS queue_id uuid;
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS contact_type text DEFAULT 'cliente'::text;
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS ai_priority text DEFAULT 'normal'::text;
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS ai_sentiment text DEFAULT 'neutral'::text;
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS channel_type text DEFAULT 'whatsapp'::text;
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS channel_connection_id uuid;
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS group_category text;
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS lead_score integer DEFAULT 0;
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS risk_score integer DEFAULT 0;
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS lead_origin text;
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS consent_status text DEFAULT 'unknown'::text;
ALTER TABLE public.conversation_analyses ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid() NOT NULL;
ALTER TABLE public.conversation_analyses ADD COLUMN IF NOT EXISTS contact_id uuid NOT NULL;
ALTER TABLE public.conversation_analyses ADD COLUMN IF NOT EXISTS analyzed_by uuid;
ALTER TABLE public.conversation_analyses ADD COLUMN IF NOT EXISTS summary text NOT NULL;
ALTER TABLE public.conversation_analyses ADD COLUMN IF NOT EXISTS status text DEFAULT 'pendente'::text NOT NULL;
ALTER TABLE public.conversation_analyses ADD COLUMN IF NOT EXISTS key_points text[] DEFAULT '{}'::text[];
ALTER TABLE public.conversation_analyses ADD COLUMN IF NOT EXISTS next_steps text[] DEFAULT '{}'::text[];
ALTER TABLE public.conversation_analyses ADD COLUMN IF NOT EXISTS sentiment text DEFAULT 'neutro'::text NOT NULL;
ALTER TABLE public.conversation_analyses ADD COLUMN IF NOT EXISTS sentiment_score integer DEFAULT 50;
ALTER TABLE public.conversation_analyses ADD COLUMN IF NOT EXISTS topics text[] DEFAULT '{}'::text[];
ALTER TABLE public.conversation_analyses ADD COLUMN IF NOT EXISTS urgency text DEFAULT 'media'::text;
ALTER TABLE public.conversation_analyses ADD COLUMN IF NOT EXISTS customer_satisfaction integer DEFAULT 3;
ALTER TABLE public.conversation_analyses ADD COLUMN IF NOT EXISTS message_count integer DEFAULT 0;
ALTER TABLE public.conversation_analyses ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now() NOT NULL;
ALTER TABLE public.conversation_analyses ADD COLUMN IF NOT EXISTS department text DEFAULT 'outros'::text;
ALTER TABLE public.conversation_analyses ADD COLUMN IF NOT EXISTS relationship_type text;
ALTER TABLE public.tags ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid() NOT NULL;
ALTER TABLE public.tags ADD COLUMN IF NOT EXISTS name text NOT NULL;
ALTER TABLE public.tags ADD COLUMN IF NOT EXISTS color text DEFAULT '#3b82f6'::text NOT NULL;
ALTER TABLE public.tags ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE public.tags ADD COLUMN IF NOT EXISTS created_by uuid;
ALTER TABLE public.tags ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now() NOT NULL;
ALTER TABLE public.tags ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now() NOT NULL;
ALTER TABLE public.talkx_campaigns ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid() NOT NULL;
ALTER TABLE public.talkx_campaigns ADD COLUMN IF NOT EXISTS name text NOT NULL;
ALTER TABLE public.talkx_campaigns ADD COLUMN IF NOT EXISTS message_template text NOT NULL;
ALTER TABLE public.talkx_campaigns ADD COLUMN IF NOT EXISTS variables_config jsonb DEFAULT '["nome", "apelido", "empresa", "saudacao"]'::jsonb NOT NULL;
ALTER TABLE public.talkx_campaigns ADD COLUMN IF NOT EXISTS typing_delay_min integer DEFAULT 1500 NOT NULL;
ALTER TABLE public.talkx_campaigns ADD COLUMN IF NOT EXISTS typing_delay_max integer DEFAULT 4000 NOT NULL;
ALTER TABLE public.talkx_campaigns ADD COLUMN IF NOT EXISTS send_interval_min integer DEFAULT 5000 NOT NULL;
ALTER TABLE public.talkx_campaigns ADD COLUMN IF NOT EXISTS send_interval_max integer DEFAULT 15000 NOT NULL;
ALTER TABLE public.talkx_campaigns ADD COLUMN IF NOT EXISTS status text DEFAULT 'draft'::text NOT NULL;
ALTER TABLE public.talkx_campaigns ADD COLUMN IF NOT EXISTS total_recipients integer DEFAULT 0 NOT NULL;
ALTER TABLE public.talkx_campaigns ADD COLUMN IF NOT EXISTS sent_count integer DEFAULT 0 NOT NULL;
ALTER TABLE public.talkx_campaigns ADD COLUMN IF NOT EXISTS failed_count integer DEFAULT 0 NOT NULL;
ALTER TABLE public.talkx_campaigns ADD COLUMN IF NOT EXISTS delivered_count integer DEFAULT 0 NOT NULL;
ALTER TABLE public.talkx_campaigns ADD COLUMN IF NOT EXISTS whatsapp_connection_id uuid;
ALTER TABLE public.talkx_campaigns ADD COLUMN IF NOT EXISTS created_by uuid;
ALTER TABLE public.talkx_campaigns ADD COLUMN IF NOT EXISTS started_at timestamp with time zone;
ALTER TABLE public.talkx_campaigns ADD COLUMN IF NOT EXISTS completed_at timestamp with time zone;
ALTER TABLE public.talkx_campaigns ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now() NOT NULL;
ALTER TABLE public.talkx_campaigns ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now() NOT NULL;
ALTER TABLE public.talkx_campaigns ADD COLUMN IF NOT EXISTS media_url text;
ALTER TABLE public.talkx_campaigns ADD COLUMN IF NOT EXISTS media_type text;
ALTER TABLE public.talkx_campaigns ADD COLUMN IF NOT EXISTS scheduled_at timestamp with time zone;
ALTER TABLE public.talkx_recipients ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid() NOT NULL;
ALTER TABLE public.talkx_recipients ADD COLUMN IF NOT EXISTS campaign_id uuid NOT NULL;
ALTER TABLE public.talkx_recipients ADD COLUMN IF NOT EXISTS contact_id uuid NOT NULL;
ALTER TABLE public.talkx_recipients ADD COLUMN IF NOT EXISTS personalized_message text;
ALTER TABLE public.talkx_recipients ADD COLUMN IF NOT EXISTS status text DEFAULT 'pending'::text NOT NULL;
ALTER TABLE public.talkx_recipients ADD COLUMN IF NOT EXISTS sent_at timestamp with time zone;
ALTER TABLE public.talkx_recipients ADD COLUMN IF NOT EXISTS delivered_at timestamp with time zone;
ALTER TABLE public.talkx_recipients ADD COLUMN IF NOT EXISTS error_message text;
ALTER TABLE public.talkx_recipients ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now() NOT NULL;
ALTER TABLE public.talkx_recipients ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now() NOT NULL;
ALTER TABLE public.number_reputation ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid() NOT NULL;
ALTER TABLE public.number_reputation ADD COLUMN IF NOT EXISTS whatsapp_connection_id uuid NOT NULL;
ALTER TABLE public.number_reputation ADD COLUMN IF NOT EXISTS health_score integer DEFAULT 100 NOT NULL;
ALTER TABLE public.number_reputation ADD COLUMN IF NOT EXISTS messages_sent_today integer DEFAULT 0 NOT NULL;
ALTER TABLE public.number_reputation ADD COLUMN IF NOT EXISTS failures_today integer DEFAULT 0 NOT NULL;
ALTER TABLE public.number_reputation ADD COLUMN IF NOT EXISTS complaints_count integer DEFAULT 0 NOT NULL;
ALTER TABLE public.number_reputation ADD COLUMN IF NOT EXISTS warmup_status text DEFAULT 'none'::text NOT NULL;
ALTER TABLE public.number_reputation ADD COLUMN IF NOT EXISTS warmup_day integer DEFAULT 0;
ALTER TABLE public.number_reputation ADD COLUMN IF NOT EXISTS daily_limit integer DEFAULT 200;
ALTER TABLE public.number_reputation ADD COLUMN IF NOT EXISTS last_reset_at timestamp with time zone DEFAULT now();
ALTER TABLE public.number_reputation ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now() NOT NULL;
ALTER TABLE public.number_reputation ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now() NOT NULL;
ALTER TABLE public.passkey_credentials ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid() NOT NULL;
ALTER TABLE public.passkey_credentials ADD COLUMN IF NOT EXISTS user_id uuid NOT NULL;
ALTER TABLE public.passkey_credentials ADD COLUMN IF NOT EXISTS credential_id text NOT NULL;
ALTER TABLE public.passkey_credentials ADD COLUMN IF NOT EXISTS public_key text NOT NULL;
ALTER TABLE public.passkey_credentials ADD COLUMN IF NOT EXISTS counter bigint DEFAULT 0 NOT NULL;
ALTER TABLE public.passkey_credentials ADD COLUMN IF NOT EXISTS device_type text;
ALTER TABLE public.passkey_credentials ADD COLUMN IF NOT EXISTS backed_up boolean DEFAULT false;
ALTER TABLE public.passkey_credentials ADD COLUMN IF NOT EXISTS transports text[];
ALTER TABLE public.passkey_credentials ADD COLUMN IF NOT EXISTS friendly_name text;
ALTER TABLE public.passkey_credentials ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now() NOT NULL;
ALTER TABLE public.passkey_credentials ADD COLUMN IF NOT EXISTS last_used_at timestamp with time zone;
ALTER TABLE public.password_reset_requests ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid() NOT NULL;
ALTER TABLE public.password_reset_requests ADD COLUMN IF NOT EXISTS user_id uuid NOT NULL;
ALTER TABLE public.password_reset_requests ADD COLUMN IF NOT EXISTS email text NOT NULL;
ALTER TABLE public.password_reset_requests ADD COLUMN IF NOT EXISTS reason text;
ALTER TABLE public.password_reset_requests ADD COLUMN IF NOT EXISTS status text DEFAULT 'pending'::text NOT NULL;
ALTER TABLE public.password_reset_requests ADD COLUMN IF NOT EXISTS reviewed_by uuid;
ALTER TABLE public.password_reset_requests ADD COLUMN IF NOT EXISTS reviewed_at timestamp with time zone;
ALTER TABLE public.password_reset_requests ADD COLUMN IF NOT EXISTS rejection_reason text;
ALTER TABLE public.password_reset_requests ADD COLUMN IF NOT EXISTS token_expires_at timestamp with time zone;
ALTER TABLE public.password_reset_requests ADD COLUMN IF NOT EXISTS ip_address text;
ALTER TABLE public.password_reset_requests ADD COLUMN IF NOT EXISTS user_agent text;
ALTER TABLE public.password_reset_requests ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now() NOT NULL;
ALTER TABLE public.password_reset_requests ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now() NOT NULL;
ALTER TABLE public.rate_limit_logs ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid() NOT NULL;
ALTER TABLE public.rate_limit_logs ADD COLUMN IF NOT EXISTS ip_address text NOT NULL;
ALTER TABLE public.rate_limit_logs ADD COLUMN IF NOT EXISTS endpoint text NOT NULL;
ALTER TABLE public.rate_limit_logs ADD COLUMN IF NOT EXISTS user_id uuid;
ALTER TABLE public.rate_limit_logs ADD COLUMN IF NOT EXISTS request_count integer DEFAULT 1 NOT NULL;
ALTER TABLE public.rate_limit_logs ADD COLUMN IF NOT EXISTS blocked boolean DEFAULT false;
ALTER TABLE public.rate_limit_logs ADD COLUMN IF NOT EXISTS user_agent text;
ALTER TABLE public.rate_limit_logs ADD COLUMN IF NOT EXISTS country text;
ALTER TABLE public.rate_limit_logs ADD COLUMN IF NOT EXISTS city text;
ALTER TABLE public.rate_limit_logs ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now() NOT NULL;
ALTER TABLE public.ai_providers ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid() NOT NULL;
ALTER TABLE public.ai_providers ADD COLUMN IF NOT EXISTS name text NOT NULL;
ALTER TABLE public.ai_providers ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE public.ai_providers ADD COLUMN IF NOT EXISTS provider_type ai_provider_type DEFAULT 'lovable_ai'::ai_provider_type NOT NULL;
ALTER TABLE public.ai_providers ADD COLUMN IF NOT EXISTS api_endpoint text;
ALTER TABLE public.ai_providers ADD COLUMN IF NOT EXISTS api_key_secret_name text;
ALTER TABLE public.ai_providers ADD COLUMN IF NOT EXISTS model text;
ALTER TABLE public.ai_providers ADD COLUMN IF NOT EXISTS system_prompt text;
ALTER TABLE public.ai_providers ADD COLUMN IF NOT EXISTS config jsonb DEFAULT '{}'::jsonb;
ALTER TABLE public.ai_providers ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true NOT NULL;
ALTER TABLE public.ai_providers ADD COLUMN IF NOT EXISTS is_default boolean DEFAULT false NOT NULL;
ALTER TABLE public.ai_providers ADD COLUMN IF NOT EXISTS use_for text[] DEFAULT ARRAY['copilot'::text] NOT NULL;
ALTER TABLE public.ai_providers ADD COLUMN IF NOT EXISTS created_by uuid;
ALTER TABLE public.ai_providers ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now() NOT NULL;
ALTER TABLE public.ai_providers ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now() NOT NULL;
ALTER TABLE public.ai_usage_logs ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid() NOT NULL;
ALTER TABLE public.ai_usage_logs ADD COLUMN IF NOT EXISTS user_id uuid;
ALTER TABLE public.ai_usage_logs ADD COLUMN IF NOT EXISTS profile_id uuid;
ALTER TABLE public.ai_usage_logs ADD COLUMN IF NOT EXISTS function_name text NOT NULL;
ALTER TABLE public.ai_usage_logs ADD COLUMN IF NOT EXISTS model text;
ALTER TABLE public.ai_usage_logs ADD COLUMN IF NOT EXISTS input_tokens integer DEFAULT 0;
ALTER TABLE public.ai_usage_logs ADD COLUMN IF NOT EXISTS output_tokens integer DEFAULT 0;
ALTER TABLE public.ai_usage_logs ADD COLUMN IF NOT EXISTS total_tokens integer DEFAULT (input_tokens + output_tokens);
ALTER TABLE public.ai_usage_logs ADD COLUMN IF NOT EXISTS duration_ms integer;
ALTER TABLE public.ai_usage_logs ADD COLUMN IF NOT EXISTS status text DEFAULT 'success'::text NOT NULL;
ALTER TABLE public.ai_usage_logs ADD COLUMN IF NOT EXISTS error_message text;
ALTER TABLE public.ai_usage_logs ADD COLUMN IF NOT EXISTS metadata jsonb;
ALTER TABLE public.ai_usage_logs ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now() NOT NULL;
ALTER TABLE public.security_alerts ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid() NOT NULL;
ALTER TABLE public.security_alerts ADD COLUMN IF NOT EXISTS alert_type text NOT NULL;
ALTER TABLE public.security_alerts ADD COLUMN IF NOT EXISTS severity text DEFAULT 'medium'::text NOT NULL;
ALTER TABLE public.security_alerts ADD COLUMN IF NOT EXISTS title text NOT NULL;
ALTER TABLE public.security_alerts ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE public.security_alerts ADD COLUMN IF NOT EXISTS ip_address text;
ALTER TABLE public.security_alerts ADD COLUMN IF NOT EXISTS user_id uuid;
ALTER TABLE public.security_alerts ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}'::jsonb;
ALTER TABLE public.security_alerts ADD COLUMN IF NOT EXISTS is_resolved boolean DEFAULT false;
ALTER TABLE public.security_alerts ADD COLUMN IF NOT EXISTS resolved_by uuid;
ALTER TABLE public.security_alerts ADD COLUMN IF NOT EXISTS resolved_at timestamp with time zone;
ALTER TABLE public.security_alerts ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now() NOT NULL;
ALTER TABLE public.channel_routing_rules ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid() NOT NULL;
ALTER TABLE public.channel_routing_rules ADD COLUMN IF NOT EXISTS channel_type channel_type NOT NULL;
ALTER TABLE public.channel_routing_rules ADD COLUMN IF NOT EXISTS channel_connection_id uuid;
ALTER TABLE public.channel_routing_rules ADD COLUMN IF NOT EXISTS queue_id uuid;
ALTER TABLE public.channel_routing_rules ADD COLUMN IF NOT EXISTS priority integer DEFAULT 0;
ALTER TABLE public.channel_routing_rules ADD COLUMN IF NOT EXISTS conditions jsonb DEFAULT '{}'::jsonb;
ALTER TABLE public.channel_routing_rules ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true;
ALTER TABLE public.channel_routing_rules ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now() NOT NULL;
ALTER TABLE public.gmail_accounts ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid() NOT NULL;
ALTER TABLE public.gmail_accounts ADD COLUMN IF NOT EXISTS user_id uuid NOT NULL;
ALTER TABLE public.gmail_accounts ADD COLUMN IF NOT EXISTS email_address text NOT NULL;
ALTER TABLE public.gmail_accounts ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true NOT NULL;
ALTER TABLE public.gmail_accounts ADD COLUMN IF NOT EXISTS sync_status text DEFAULT 'pending'::text NOT NULL;
ALTER TABLE public.gmail_accounts ADD COLUMN IF NOT EXISTS last_sync_at timestamp with time zone;
ALTER TABLE public.gmail_accounts ADD COLUMN IF NOT EXISTS last_error text;
ALTER TABLE public.gmail_accounts ADD COLUMN IF NOT EXISTS token_expires_at timestamp with time zone;
ALTER TABLE public.gmail_accounts ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now() NOT NULL;
ALTER TABLE public.gmail_accounts ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now() NOT NULL;
ALTER TABLE public.gmail_accounts ADD COLUMN IF NOT EXISTS access_token_encrypted bytea;
ALTER TABLE public.gmail_accounts ADD COLUMN IF NOT EXISTS refresh_token_encrypted bytea;
ALTER TABLE public.saved_filters ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid() NOT NULL;
ALTER TABLE public.saved_filters ADD COLUMN IF NOT EXISTS user_id uuid NOT NULL;
ALTER TABLE public.saved_filters ADD COLUMN IF NOT EXISTS entity_type text NOT NULL;
ALTER TABLE public.saved_filters ADD COLUMN IF NOT EXISTS name text NOT NULL;
ALTER TABLE public.saved_filters ADD COLUMN IF NOT EXISTS filters jsonb DEFAULT '{}'::jsonb NOT NULL;
ALTER TABLE public.saved_filters ADD COLUMN IF NOT EXISTS is_default boolean DEFAULT false;
ALTER TABLE public.saved_filters ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now() NOT NULL;
ALTER TABLE public.saved_filters ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now() NOT NULL;
ALTER TABLE public.saved_filters ADD COLUMN IF NOT EXISTS is_shared boolean DEFAULT false;
ALTER TABLE public.whatsapp_connection_queues ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_memory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_sla ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.performance_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nps_surveys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.csat_surveys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.talkx_blacklist ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_skills ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scheduled_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crisis_room_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whisper_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contact_purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contact_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_flows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meta_capi_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.custom_emojis ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.calls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.favorite_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.followup_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.geo_blocking_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mfa_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pinned_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.playbooks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.entity_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.global_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scheduled_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scheduled_report_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webauthn_challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhook_rate_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_pipeline_stages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contact_custom_fields ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contact_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_achievements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_conversation_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.message_reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.message_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_conversation_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.goals_configurations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ip_whitelist ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.knowledge_base_articles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.queue_goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.queue_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.queue_positions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.queue_skill_requirements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_closures ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.voice_command_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_ab_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.channel_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.csat_auto_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.followup_executions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.followup_sequences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.knowledge_base_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rate_limit_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chatbot_executions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_deals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sicoob_contact_mapping ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sla_configurations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reminders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_service_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.warroom_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deal_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_labels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sla_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stickers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.away_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blocked_countries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blocked_ips ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_hours ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.training_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.auto_close_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.connection_health_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.allowed_countries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audio_memes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chatbot_flows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_wallet_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.queues ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.login_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_snoozes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.query_telemetry ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_visibility_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_analyses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.talkx_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.talkx_recipients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.number_reputation ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.passkey_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.password_reset_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rate_limit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_providers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_usage_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.security_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.channel_routing_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gmail_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saved_filters ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 4. CONSTRAINTS (PK, UNIQUE, CHECK)
-- ============================================================
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='whatsapp_connection_queues_pkey' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.whatsapp_connection_queues ADD CONSTRAINT whatsapp_connection_queues_pkey PRIMARY KEY (id);
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='whatsapp_connection_queues_whatsapp_connection_id_queue_id_key' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.whatsapp_connection_queues ADD CONSTRAINT whatsapp_connection_queues_whatsapp_connection_id_queue_id_key UNIQUE (whatsapp_connection_id, queue_id);
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='messages_message_type_check' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.messages ADD CONSTRAINT messages_message_type_check CHECK ((message_type = ANY (ARRAY['text'::text, 'image'::text, 'audio'::text, 'video'::text, 'document'::text, 'sticker'::text, 'location'::text, 'contact'::text, 'poll'::text, 'button'::text, 'list'::text, 'reaction'::text, 'vcard'::text, 'ptt'::text, 'link'::text, 'template'::text, 'interactive'::text, 'order'::text, 'product'::text, 'catalog'::text])));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='messages_pkey' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.messages ADD CONSTRAINT messages_pkey PRIMARY KEY (id);
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='messages_sender_check' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.messages ADD CONSTRAINT messages_sender_check CHECK ((sender = ANY (ARRAY['agent'::text, 'contact'::text])));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='conversation_memory_contact_id_key' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.conversation_memory ADD CONSTRAINT conversation_memory_contact_id_key UNIQUE (contact_id);
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='conversation_memory_pkey' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.conversation_memory ADD CONSTRAINT conversation_memory_pkey PRIMARY KEY (id);
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='whatsapp_groups_group_id_key' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.whatsapp_groups ADD CONSTRAINT whatsapp_groups_group_id_key UNIQUE (group_id);
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='whatsapp_groups_pkey' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.whatsapp_groups ADD CONSTRAINT whatsapp_groups_pkey PRIMARY KEY (id);
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='conversation_sla_pkey' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.conversation_sla ADD CONSTRAINT conversation_sla_pkey PRIMARY KEY (id);
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='performance_snapshots_pkey' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.performance_snapshots ADD CONSTRAINT performance_snapshots_pkey PRIMARY KEY (id);
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='permissions_name_key' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.permissions ADD CONSTRAINT permissions_name_key UNIQUE (name);
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='permissions_pkey' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.permissions ADD CONSTRAINT permissions_pkey PRIMARY KEY (id);
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='nps_surveys_pkey' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.nps_surveys ADD CONSTRAINT nps_surveys_pkey PRIMARY KEY (id);
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='nps_surveys_score_check' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.nps_surveys ADD CONSTRAINT nps_surveys_score_check CHECK (((score >= 0) AND (score <= 10)));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='nps_surveys_survey_type_check' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.nps_surveys ADD CONSTRAINT nps_surveys_survey_type_check CHECK ((survey_type = ANY (ARRAY['periodic'::text, 'post_resolution'::text, 'manual'::text])));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='csat_surveys_pkey' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.csat_surveys ADD CONSTRAINT csat_surveys_pkey PRIMARY KEY (id);
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='talkx_blacklist_contact_id_key' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.talkx_blacklist ADD CONSTRAINT talkx_blacklist_contact_id_key UNIQUE (contact_id);
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='talkx_blacklist_pkey' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.talkx_blacklist ADD CONSTRAINT talkx_blacklist_pkey PRIMARY KEY (id);
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='agent_skills_pkey' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.agent_skills ADD CONSTRAINT agent_skills_pkey PRIMARY KEY (id);
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='agent_skills_profile_id_skill_name_key' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.agent_skills ADD CONSTRAINT agent_skills_profile_id_skill_name_key UNIQUE (profile_id, skill_name);
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='whatsapp_connections_pkey' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.whatsapp_connections ADD CONSTRAINT whatsapp_connections_pkey PRIMARY KEY (id);
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='whatsapp_connections_status_check' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.whatsapp_connections ADD CONSTRAINT whatsapp_connections_status_check CHECK ((status = ANY (ARRAY['connected'::text, 'disconnected'::text, 'connecting'::text, 'qr_pending'::text])));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='scheduled_reports_pkey' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.scheduled_reports ADD CONSTRAINT scheduled_reports_pkey PRIMARY KEY (id);
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='crisis_room_alerts_pkey' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.crisis_room_alerts ADD CONSTRAINT crisis_room_alerts_pkey PRIMARY KEY (id);
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='whisper_messages_pkey' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.whisper_messages ADD CONSTRAINT whisper_messages_pkey PRIMARY KEY (id);
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='contact_purchases_pkey' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.contact_purchases ADD CONSTRAINT contact_purchases_pkey PRIMARY KEY (id);
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='contact_tags_contact_id_tag_id_key' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.contact_tags ADD CONSTRAINT contact_tags_contact_id_tag_id_key UNIQUE (contact_id, tag_id);
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='contact_tags_pkey' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.contact_tags ADD CONSTRAINT contact_tags_pkey PRIMARY KEY (id);
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='whatsapp_flows_pkey' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.whatsapp_flows ADD CONSTRAINT whatsapp_flows_pkey PRIMARY KEY (id);
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='meta_capi_events_pkey' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.meta_capi_events ADD CONSTRAINT meta_capi_events_pkey PRIMARY KEY (id);
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='custom_emojis_pkey' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.custom_emojis ADD CONSTRAINT custom_emojis_pkey PRIMARY KEY (id);
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='calls_direction_check' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.calls ADD CONSTRAINT calls_direction_check CHECK ((direction = ANY (ARRAY['inbound'::text, 'outbound'::text])));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='calls_pkey' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.calls ADD CONSTRAINT calls_pkey PRIMARY KEY (id);
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='calls_status_check' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.calls ADD CONSTRAINT calls_status_check CHECK ((status = ANY (ARRAY['ringing'::text, 'answered'::text, 'ended'::text, 'missed'::text, 'busy'::text, 'failed'::text])));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='favorite_contacts_contact_id_user_id_key' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.favorite_contacts ADD CONSTRAINT favorite_contacts_contact_id_user_id_key UNIQUE (contact_id, user_id);
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='favorite_contacts_pkey' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.favorite_contacts ADD CONSTRAINT favorite_contacts_pkey PRIMARY KEY (id);
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='followup_steps_pkey' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.followup_steps ADD CONSTRAINT followup_steps_pkey PRIMARY KEY (id);
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='geo_blocking_settings_mode_check' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.geo_blocking_settings ADD CONSTRAINT geo_blocking_settings_mode_check CHECK ((mode = ANY (ARRAY['disabled'::text, 'whitelist'::text, 'blacklist'::text])));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='geo_blocking_settings_pkey' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.geo_blocking_settings ADD CONSTRAINT geo_blocking_settings_pkey PRIMARY KEY (id);
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='mfa_sessions_pkey' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.mfa_sessions ADD CONSTRAINT mfa_sessions_pkey PRIMARY KEY (id);
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='pinned_conversations_contact_id_pinned_by_key' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.pinned_conversations ADD CONSTRAINT pinned_conversations_contact_id_pinned_by_key UNIQUE (contact_id, pinned_by);
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='pinned_conversations_pkey' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.pinned_conversations ADD CONSTRAINT pinned_conversations_pkey PRIMARY KEY (id);
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='playbooks_pkey' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.playbooks ADD CONSTRAINT playbooks_pkey PRIMARY KEY (id);
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='email_threads_gmail_account_id_gmail_thread_id_key' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.email_threads ADD CONSTRAINT email_threads_gmail_account_id_gmail_thread_id_key UNIQUE (gmail_account_id, gmail_thread_id);
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='email_threads_pkey' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.email_threads ADD CONSTRAINT email_threads_pkey PRIMARY KEY (id);
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='entity_versions_entity_type_entity_id_version_number_key' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.entity_versions ADD CONSTRAINT entity_versions_entity_type_entity_id_version_number_key UNIQUE (entity_type, entity_id, version_number);
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='entity_versions_pkey' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.entity_versions ADD CONSTRAINT entity_versions_pkey PRIMARY KEY (id);
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='global_settings_key_key' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.global_settings ADD CONSTRAINT global_settings_key_key UNIQUE (key);
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='global_settings_pkey' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.global_settings ADD CONSTRAINT global_settings_pkey PRIMARY KEY (id);
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='conversation_events_pkey' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.conversation_events ADD CONSTRAINT conversation_events_pkey PRIMARY KEY (id);
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='scheduled_messages_pkey' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.scheduled_messages ADD CONSTRAINT scheduled_messages_pkey PRIMARY KEY (id);
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='scheduled_report_configs_pkey' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.scheduled_report_configs ADD CONSTRAINT scheduled_report_configs_pkey PRIMARY KEY (id);
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='webauthn_challenges_pkey' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.webauthn_challenges ADD CONSTRAINT webauthn_challenges_pkey PRIMARY KEY (id);
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='webauthn_challenges_type_check' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.webauthn_challenges ADD CONSTRAINT webauthn_challenges_type_check CHECK ((type = ANY (ARRAY['registration'::text, 'authentication'::text])));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='webhook_rate_limits_pkey' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.webhook_rate_limits ADD CONSTRAINT webhook_rate_limits_pkey PRIMARY KEY (id);
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='sales_pipeline_stages_pkey' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.sales_pipeline_stages ADD CONSTRAINT sales_pipeline_stages_pkey PRIMARY KEY (id);
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='contact_custom_fields_pkey' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.contact_custom_fields ADD CONSTRAINT contact_custom_fields_pkey PRIMARY KEY (id);
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='campaign_contacts_pkey' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.campaign_contacts ADD CONSTRAINT campaign_contacts_pkey PRIMARY KEY (id);
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='campaign_contacts_status_check' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.campaign_contacts ADD CONSTRAINT campaign_contacts_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'sent'::text, 'delivered'::text, 'read'::text, 'failed'::text])));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='campaigns_pkey' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.campaigns ADD CONSTRAINT campaigns_pkey PRIMARY KEY (id);
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='campaigns_status_check' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.campaigns ADD CONSTRAINT campaigns_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'scheduled'::text, 'sending'::text, 'completed'::text, 'cancelled'::text, 'paused'::text])));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='campaigns_target_type_check' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.campaigns ADD CONSTRAINT campaigns_target_type_check CHECK ((target_type = ANY (ARRAY['all'::text, 'tag'::text, 'queue'::text, 'custom'::text])));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='contact_notes_pkey' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.contact_notes ADD CONSTRAINT contact_notes_pkey PRIMARY KEY (id);
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='agent_achievements_pkey' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.agent_achievements ADD CONSTRAINT agent_achievements_pkey PRIMARY KEY (id);
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='team_conversation_members_conversation_id_profile_id_key' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.team_conversation_members ADD CONSTRAINT team_conversation_members_conversation_id_profile_id_key UNIQUE (conversation_id, profile_id);
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='team_conversation_members_pkey' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.team_conversation_members ADD CONSTRAINT team_conversation_members_pkey PRIMARY KEY (id);
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='message_reactions_message_id_contact_id_emoji_key' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.message_reactions ADD CONSTRAINT message_reactions_message_id_contact_id_emoji_key UNIQUE (message_id, contact_id, emoji);
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='message_reactions_message_id_user_id_emoji_key' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.message_reactions ADD CONSTRAINT message_reactions_message_id_user_id_emoji_key UNIQUE (message_id, user_id, emoji);
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='message_reactions_pkey' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.message_reactions ADD CONSTRAINT message_reactions_pkey PRIMARY KEY (id);
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='reaction_author_check' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.message_reactions ADD CONSTRAINT reaction_author_check CHECK (((user_id IS NOT NULL) OR (contact_id IS NOT NULL)));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='message_templates_pkey' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.message_templates ADD CONSTRAINT message_templates_pkey PRIMARY KEY (id);
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='ai_conversation_tags_pkey' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.ai_conversation_tags ADD CONSTRAINT ai_conversation_tags_pkey PRIMARY KEY (id);
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='goal_owner_check' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.goals_configurations ADD CONSTRAINT goal_owner_check CHECK ((((profile_id IS NOT NULL) AND (queue_id IS NULL)) OR ((profile_id IS NULL) AND (queue_id IS NOT NULL))));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='goals_configurations_pkey' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.goals_configurations ADD CONSTRAINT goals_configurations_pkey PRIMARY KEY (id);
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='goals_configurations_profile_id_goal_type_key' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.goals_configurations ADD CONSTRAINT goals_configurations_profile_id_goal_type_key UNIQUE (profile_id, goal_type);
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='goals_configurations_queue_id_goal_type_key' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.goals_configurations ADD CONSTRAINT goals_configurations_queue_id_goal_type_key UNIQUE (queue_id, goal_type);
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='ip_whitelist_ip_address_key' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.ip_whitelist ADD CONSTRAINT ip_whitelist_ip_address_key UNIQUE (ip_address);
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='ip_whitelist_pkey' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.ip_whitelist ADD CONSTRAINT ip_whitelist_pkey PRIMARY KEY (id);
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='knowledge_base_articles_pkey' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.knowledge_base_articles ADD CONSTRAINT knowledge_base_articles_pkey PRIMARY KEY (id);
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='notifications_pkey' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.notifications ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='queue_goals_pkey' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.queue_goals ADD CONSTRAINT queue_goals_pkey PRIMARY KEY (id);
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='queue_goals_queue_id_key' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.queue_goals ADD CONSTRAINT queue_goals_queue_id_key UNIQUE (queue_id);
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='queue_members_pkey' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.queue_members ADD CONSTRAINT queue_members_pkey PRIMARY KEY (id);
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='queue_members_queue_id_profile_id_key' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.queue_members ADD CONSTRAINT queue_members_queue_id_profile_id_key UNIQUE (queue_id, profile_id);
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='queue_positions_pkey' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.queue_positions ADD CONSTRAINT queue_positions_pkey PRIMARY KEY (id);
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='queue_skill_requirements_pkey' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.queue_skill_requirements ADD CONSTRAINT queue_skill_requirements_pkey PRIMARY KEY (id);
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='queue_skill_requirements_queue_id_skill_name_key' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.queue_skill_requirements ADD CONSTRAINT queue_skill_requirements_queue_id_skill_name_key UNIQUE (queue_id, skill_name);
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='conversation_closures_pkey' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.conversation_closures ADD CONSTRAINT conversation_closures_pkey PRIMARY KEY (id);
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='automations_pkey' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.automations ADD CONSTRAINT automations_pkey PRIMARY KEY (id);
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='voice_command_logs_pkey' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.voice_command_logs ADD CONSTRAINT voice_command_logs_pkey PRIMARY KEY (id);
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='campaign_ab_variants_pkey' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.campaign_ab_variants ADD CONSTRAINT campaign_ab_variants_pkey PRIMARY KEY (id);
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='conversation_tasks_pkey' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.conversation_tasks ADD CONSTRAINT conversation_tasks_pkey PRIMARY KEY (id);
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='channel_connections_pkey' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.channel_connections ADD CONSTRAINT channel_connections_pkey PRIMARY KEY (id);
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='csat_auto_config_pkey' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.csat_auto_config ADD CONSTRAINT csat_auto_config_pkey PRIMARY KEY (id);
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='followup_executions_pkey' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.followup_executions ADD CONSTRAINT followup_executions_pkey PRIMARY KEY (id);
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='followup_sequences_pkey' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.followup_sequences ADD CONSTRAINT followup_sequences_pkey PRIMARY KEY (id);
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='whatsapp_templates_pkey' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.whatsapp_templates ADD CONSTRAINT whatsapp_templates_pkey PRIMARY KEY (id);
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='knowledge_base_files_pkey' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.knowledge_base_files ADD CONSTRAINT knowledge_base_files_pkey PRIMARY KEY (id);
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='rate_limit_configs_pkey' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.rate_limit_configs ADD CONSTRAINT rate_limit_configs_pkey PRIMARY KEY (id);
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='chatbot_executions_pkey' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.chatbot_executions ADD CONSTRAINT chatbot_executions_pkey PRIMARY KEY (id);
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='chatbot_executions_status_check' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.chatbot_executions ADD CONSTRAINT chatbot_executions_status_check CHECK ((status = ANY (ARRAY['running'::text, 'completed'::text, 'failed'::text, 'paused'::text, 'cancelled'::text])));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='sales_deals_pkey' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.sales_deals ADD CONSTRAINT sales_deals_pkey PRIMARY KEY (id);
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='agent_stats_pkey' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.agent_stats ADD CONSTRAINT agent_stats_pkey PRIMARY KEY (id);
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='agent_stats_profile_id_key' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.agent_stats ADD CONSTRAINT agent_stats_profile_id_key UNIQUE (profile_id);
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='sicoob_contact_mapping_pkey' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.sicoob_contact_mapping ADD CONSTRAINT sicoob_contact_mapping_pkey PRIMARY KEY (id);
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='sicoob_contact_mapping_sicoob_user_id_sicoob_singular_id_key' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.sicoob_contact_mapping ADD CONSTRAINT sicoob_contact_mapping_sicoob_user_id_sicoob_singular_id_key UNIQUE (sicoob_user_id, sicoob_singular_id);
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='sla_configurations_pkey' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.sla_configurations ADD CONSTRAINT sla_configurations_pkey PRIMARY KEY (id);
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='reminders_pkey' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.reminders ADD CONSTRAINT reminders_pkey PRIMARY KEY (id);
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='role_permissions_pkey' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.role_permissions ADD CONSTRAINT role_permissions_pkey PRIMARY KEY (id);
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='role_permissions_role_permission_id_key' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.role_permissions ADD CONSTRAINT role_permissions_role_permission_id_key UNIQUE (role, permission_id);
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='user_roles_pkey' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.user_roles ADD CONSTRAINT user_roles_pkey PRIMARY KEY (id);
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='user_roles_user_id_role_key' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.user_roles ADD CONSTRAINT user_roles_user_id_role_key UNIQUE (user_id, role);
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='user_service_accounts_pkey' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.user_service_accounts ADD CONSTRAINT user_service_accounts_pkey PRIMARY KEY (id);
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='user_service_accounts_user_id_service_type_key' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.user_service_accounts ADD CONSTRAINT user_service_accounts_user_id_service_type_key UNIQUE (user_id, service_type);
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='warroom_alerts_pkey' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.warroom_alerts ADD CONSTRAINT warroom_alerts_pkey PRIMARY KEY (id);
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='deal_activities_pkey' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.deal_activities ADD CONSTRAINT deal_activities_pkey PRIMARY KEY (id);
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='email_labels_gmail_account_id_gmail_label_id_key' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.email_labels ADD CONSTRAINT email_labels_gmail_account_id_gmail_label_id_key UNIQUE (gmail_account_id, gmail_label_id);
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='email_labels_pkey' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.email_labels ADD CONSTRAINT email_labels_pkey PRIMARY KEY (id);
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='sla_rules_pkey' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.sla_rules ADD CONSTRAINT sla_rules_pkey PRIMARY KEY (id);
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='stickers_pkey' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.stickers ADD CONSTRAINT stickers_pkey PRIMARY KEY (id);
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='away_messages_pkey' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.away_messages ADD CONSTRAINT away_messages_pkey PRIMARY KEY (id);
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='away_messages_whatsapp_connection_id_key' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.away_messages ADD CONSTRAINT away_messages_whatsapp_connection_id_key UNIQUE (whatsapp_connection_id);
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='blocked_countries_country_code_key' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.blocked_countries ADD CONSTRAINT blocked_countries_country_code_key UNIQUE (country_code);
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='blocked_countries_pkey' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.blocked_countries ADD CONSTRAINT blocked_countries_pkey PRIMARY KEY (id);
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='blocked_ips_ip_address_key' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.blocked_ips ADD CONSTRAINT blocked_ips_ip_address_key UNIQUE (ip_address);
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='blocked_ips_pkey' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.blocked_ips ADD CONSTRAINT blocked_ips_pkey PRIMARY KEY (id);
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='business_hours_day_of_week_check' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.business_hours ADD CONSTRAINT business_hours_day_of_week_check CHECK (((day_of_week >= 0) AND (day_of_week <= 6)));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='business_hours_pkey' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.business_hours ADD CONSTRAINT business_hours_pkey PRIMARY KEY (id);
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='business_hours_whatsapp_connection_id_day_of_week_key' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.business_hours ADD CONSTRAINT business_hours_whatsapp_connection_id_day_of_week_key UNIQUE (whatsapp_connection_id, day_of_week);
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='team_messages_pkey' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.team_messages ADD CONSTRAINT team_messages_pkey PRIMARY KEY (id);
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='training_sessions_pkey' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.training_sessions ADD CONSTRAINT training_sessions_pkey PRIMARY KEY (id);
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='auto_close_config_pkey' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.auto_close_config ADD CONSTRAINT auto_close_config_pkey PRIMARY KEY (id);
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='email_messages_gmail_account_id_gmail_message_id_key' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.email_messages ADD CONSTRAINT email_messages_gmail_account_id_gmail_message_id_key UNIQUE (gmail_account_id, gmail_message_id);
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='email_messages_pkey' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.email_messages ADD CONSTRAINT email_messages_pkey PRIMARY KEY (id);
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='user_devices_pkey' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.user_devices ADD CONSTRAINT user_devices_pkey PRIMARY KEY (id);
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='user_devices_user_id_device_fingerprint_key' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.user_devices ADD CONSTRAINT user_devices_user_id_device_fingerprint_key UNIQUE (user_id, device_fingerprint);
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='user_settings_pkey' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.user_settings ADD CONSTRAINT user_settings_pkey PRIMARY KEY (id);
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='user_settings_user_id_key' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.user_settings ADD CONSTRAINT user_settings_user_id_key UNIQUE (user_id);
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='user_sessions_pkey' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.user_sessions ADD CONSTRAINT user_sessions_pkey PRIMARY KEY (id);
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='connection_health_logs_pkey' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.connection_health_logs ADD CONSTRAINT connection_health_logs_pkey PRIMARY KEY (id);
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='allowed_countries_country_code_key' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.allowed_countries ADD CONSTRAINT allowed_countries_country_code_key UNIQUE (country_code);
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='allowed_countries_pkey' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.allowed_countries ADD CONSTRAINT allowed_countries_pkey PRIMARY KEY (id);
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='audio_memes_pkey' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.audio_memes ADD CONSTRAINT audio_memes_pkey PRIMARY KEY (id);
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='audit_logs_pkey' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.audit_logs ADD CONSTRAINT audit_logs_pkey PRIMARY KEY (id);
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='chatbot_flows_pkey' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.chatbot_flows ADD CONSTRAINT chatbot_flows_pkey PRIMARY KEY (id);
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='chatbot_flows_trigger_type_check' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.chatbot_flows ADD CONSTRAINT chatbot_flows_trigger_type_check CHECK ((trigger_type = ANY (ARRAY['keyword'::text, 'first_message'::text, 'menu'::text, 'webhook'::text, 'schedule'::text])));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='client_wallet_rules_pkey' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.client_wallet_rules ADD CONSTRAINT client_wallet_rules_pkey PRIMARY KEY (id);
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='queues_pkey' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.queues ADD CONSTRAINT queues_pkey PRIMARY KEY (id);
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='payment_links_pkey' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.payment_links ADD CONSTRAINT payment_links_pkey PRIMARY KEY (id);
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='products_pkey' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.products ADD CONSTRAINT products_pkey PRIMARY KEY (id);
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='products_sku_key' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.products ADD CONSTRAINT products_sku_key UNIQUE (sku);
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='team_conversations_pkey' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.team_conversations ADD CONSTRAINT team_conversations_pkey PRIMARY KEY (id);
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='team_conversations_type_check' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.team_conversations ADD CONSTRAINT team_conversations_type_check CHECK ((type = ANY (ARRAY['direct'::text, 'group'::text])));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='login_attempts_email_key' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.login_attempts ADD CONSTRAINT login_attempts_email_key UNIQUE (email);
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='login_attempts_pkey' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.login_attempts ADD CONSTRAINT login_attempts_pkey PRIMARY KEY (id);
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='conversation_snoozes_pkey' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.conversation_snoozes ADD CONSTRAINT conversation_snoozes_pkey PRIMARY KEY (id);
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='profiles_pkey' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.profiles ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='profiles_role_check' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check CHECK ((role = ANY (ARRAY['admin'::text, 'supervisor'::text, 'agent'::text])));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='profiles_user_id_key' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.profiles ADD CONSTRAINT profiles_user_id_key UNIQUE (user_id);
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='query_telemetry_pkey' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.query_telemetry ADD CONSTRAINT query_telemetry_pkey PRIMARY KEY (id);
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='agent_visibility_grants_agent_id_can_see_agent_id_key' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.agent_visibility_grants ADD CONSTRAINT agent_visibility_grants_agent_id_can_see_agent_id_key UNIQUE (agent_id, can_see_agent_id);
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='agent_visibility_grants_pkey' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.agent_visibility_grants ADD CONSTRAINT agent_visibility_grants_pkey PRIMARY KEY (id);
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='contacts_phone_key' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.contacts ADD CONSTRAINT contacts_phone_key UNIQUE (phone);
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='contacts_phone_unique' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.contacts ADD CONSTRAINT contacts_phone_unique UNIQUE (phone);
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='contacts_pkey' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.contacts ADD CONSTRAINT contacts_pkey PRIMARY KEY (id);
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='conversation_analyses_pkey' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.conversation_analyses ADD CONSTRAINT conversation_analyses_pkey PRIMARY KEY (id);
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='tags_name_key' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.tags ADD CONSTRAINT tags_name_key UNIQUE (name);
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='tags_pkey' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.tags ADD CONSTRAINT tags_pkey PRIMARY KEY (id);
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='talkx_campaigns_pkey' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.talkx_campaigns ADD CONSTRAINT talkx_campaigns_pkey PRIMARY KEY (id);
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='talkx_campaigns_status_check' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.talkx_campaigns ADD CONSTRAINT talkx_campaigns_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'sending'::text, 'paused'::text, 'completed'::text, 'cancelled'::text])));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='talkx_recipients_campaign_id_contact_id_key' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.talkx_recipients ADD CONSTRAINT talkx_recipients_campaign_id_contact_id_key UNIQUE (campaign_id, contact_id);
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='talkx_recipients_pkey' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.talkx_recipients ADD CONSTRAINT talkx_recipients_pkey PRIMARY KEY (id);
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='talkx_recipients_status_check' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.talkx_recipients ADD CONSTRAINT talkx_recipients_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'sending'::text, 'sent'::text, 'delivered'::text, 'failed'::text, 'skipped'::text])));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='number_reputation_pkey' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.number_reputation ADD CONSTRAINT number_reputation_pkey PRIMARY KEY (id);
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='number_reputation_whatsapp_connection_id_key' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.number_reputation ADD CONSTRAINT number_reputation_whatsapp_connection_id_key UNIQUE (whatsapp_connection_id);
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='passkey_credentials_credential_id_key' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.passkey_credentials ADD CONSTRAINT passkey_credentials_credential_id_key UNIQUE (credential_id);
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='passkey_credentials_pkey' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.passkey_credentials ADD CONSTRAINT passkey_credentials_pkey PRIMARY KEY (id);
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='password_reset_requests_pkey' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.password_reset_requests ADD CONSTRAINT password_reset_requests_pkey PRIMARY KEY (id);
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='password_reset_requests_status_check' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.password_reset_requests ADD CONSTRAINT password_reset_requests_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text])));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='rate_limit_logs_pkey' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.rate_limit_logs ADD CONSTRAINT rate_limit_logs_pkey PRIMARY KEY (id);
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='ai_providers_pkey' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.ai_providers ADD CONSTRAINT ai_providers_pkey PRIMARY KEY (id);
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='ai_usage_logs_pkey' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.ai_usage_logs ADD CONSTRAINT ai_usage_logs_pkey PRIMARY KEY (id);
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='security_alerts_pkey' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.security_alerts ADD CONSTRAINT security_alerts_pkey PRIMARY KEY (id);
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='channel_routing_rules_pkey' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.channel_routing_rules ADD CONSTRAINT channel_routing_rules_pkey PRIMARY KEY (id);
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='gmail_accounts_email_address_key' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.gmail_accounts ADD CONSTRAINT gmail_accounts_email_address_key UNIQUE (email_address);
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='gmail_accounts_pkey' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.gmail_accounts ADD CONSTRAINT gmail_accounts_pkey PRIMARY KEY (id);
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='saved_filters_pkey' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.saved_filters ADD CONSTRAINT saved_filters_pkey PRIMARY KEY (id);
    END IF;
END $$;

-- ============================================================
-- 5. INDEXES
-- ============================================================
CREATE INDEX idx_agent_achievements_profile ON public.agent_achievements USING btree (profile_id);
CREATE INDEX idx_agent_stats_level ON public.agent_stats USING btree (level DESC);
CREATE INDEX idx_agent_stats_xp ON public.agent_stats USING btree (xp DESC);
CREATE INDEX idx_ai_usage_logs_created_at ON public.ai_usage_logs USING btree (created_at DESC);
CREATE INDEX idx_ai_usage_logs_function_name ON public.ai_usage_logs USING btree (function_name);
CREATE INDEX idx_ai_usage_logs_profile_id ON public.ai_usage_logs USING btree (profile_id);
CREATE INDEX idx_ai_usage_logs_status ON public.ai_usage_logs USING btree (status);
CREATE INDEX idx_ai_usage_logs_user_id ON public.ai_usage_logs USING btree (user_id);
CREATE INDEX idx_allowed_countries_code ON public.allowed_countries USING btree (country_code);
CREATE INDEX idx_audit_logs_action ON public.audit_logs USING btree (action);
CREATE INDEX idx_audit_logs_created_at ON public.audit_logs USING btree (created_at DESC);
CREATE INDEX idx_audit_logs_user_created ON public.audit_logs USING btree (user_id, created_at DESC);
CREATE INDEX idx_audit_logs_user_id ON public.audit_logs USING btree (user_id);
CREATE INDEX idx_blocked_countries_code ON public.blocked_countries USING btree (country_code);
CREATE INDEX idx_blocked_ips_expires ON public.blocked_ips USING btree (expires_at);
CREATE INDEX idx_blocked_ips_ip ON public.blocked_ips USING btree (ip_address);
CREATE INDEX idx_business_hours_connection ON public.business_hours USING btree (whatsapp_connection_id);
CREATE INDEX idx_campaign_contacts_campaign ON public.campaign_contacts USING btree (campaign_id, status);
CREATE INDEX idx_campaign_contacts_campaign_id ON public.campaign_contacts USING btree (campaign_id);
CREATE INDEX idx_campaign_contacts_status ON public.campaign_contacts USING btree (status);
CREATE INDEX idx_campaigns_created_by ON public.campaigns USING btree (created_by);
CREATE INDEX idx_campaigns_status ON public.campaigns USING btree (status);
CREATE INDEX idx_chatbot_executions_contact_id ON public.chatbot_executions USING btree (contact_id);
CREATE INDEX idx_chatbot_executions_flow_id ON public.chatbot_executions USING btree (flow_id);
CREATE INDEX idx_chatbot_executions_status ON public.chatbot_executions USING btree (status);
CREATE INDEX idx_chatbot_flows_active ON public.chatbot_flows USING btree (is_active);
CREATE INDEX idx_closures_contact ON public.conversation_closures USING btree (contact_id);
CREATE INDEX idx_closures_reason ON public.conversation_closures USING btree (close_reason);
CREATE INDEX idx_contact_custom_fields_contact ON public.contact_custom_fields USING btree (contact_id);
CREATE UNIQUE INDEX idx_contact_custom_fields_unique ON public.contact_custom_fields USING btree (contact_id, field_name);
CREATE INDEX idx_contact_notes_author_id ON public.contact_notes USING btree (author_id);
CREATE INDEX idx_contact_notes_contact_id ON public.contact_notes USING btree (contact_id);
CREATE INDEX idx_contacts_assigned_to ON public.contacts USING btree (assigned_to);
CREATE INDEX idx_contacts_company_trgm ON public.contacts USING gin (company extensions.gin_trgm_ops);
CREATE INDEX idx_contacts_contact_type ON public.contacts USING btree (contact_type);
CREATE INDEX idx_contacts_created_at ON public.contacts USING btree (created_at DESC);
CREATE INDEX idx_contacts_email_trgm ON public.contacts USING gin (email extensions.gin_trgm_ops);
CREATE INDEX idx_contacts_job_title_trgm ON public.contacts USING gin (job_title extensions.gin_trgm_ops);
CREATE INDEX idx_contacts_name_asc ON public.contacts USING btree (name);
CREATE INDEX idx_contacts_name_trgm ON public.contacts USING gin (name extensions.gin_trgm_ops);
CREATE INDEX idx_contacts_nickname_trgm ON public.contacts USING gin (nickname extensions.gin_trgm_ops);
CREATE INDEX idx_contacts_phone_trgm ON public.contacts USING gin (phone extensions.gin_trgm_ops);
CREATE INDEX idx_contacts_queue_id ON public.contacts USING btree (queue_id);
CREATE INDEX idx_contacts_surname_trgm ON public.contacts USING gin (surname extensions.gin_trgm_ops);
CREATE INDEX idx_contacts_type ON public.contacts USING btree (contact_type);
CREATE INDEX idx_conversation_analyses_contact_department ON public.conversation_analyses USING btree (contact_id, department);
CREATE INDEX idx_conversation_analyses_contact_id ON public.conversation_analyses USING btree (contact_id);
CREATE INDEX idx_conversation_analyses_created_at ON public.conversation_analyses USING btree (created_at DESC);
CREATE INDEX idx_conversation_analyses_department ON public.conversation_analyses USING btree (department);
CREATE INDEX idx_conversation_events_contact ON public.conversation_events USING btree (contact_id, created_at DESC);
CREATE INDEX idx_conversation_events_type ON public.conversation_events USING btree (event_type);
CREATE INDEX idx_email_labels_account ON public.email_labels USING btree (gmail_account_id);
CREATE INDEX idx_email_messages_account ON public.email_messages USING btree (gmail_account_id);
CREATE INDEX idx_email_messages_date ON public.email_messages USING btree (internal_date DESC);
CREATE INDEX idx_email_messages_thread ON public.email_messages USING btree (thread_id);
CREATE INDEX idx_email_threads_account ON public.email_threads USING btree (gmail_account_id);
CREATE INDEX idx_email_threads_contact ON public.email_threads USING btree (contact_id);
CREATE INDEX idx_email_threads_last_message ON public.email_threads USING btree (last_message_at DESC);
CREATE INDEX idx_health_logs_checked_at ON public.connection_health_logs USING btree (checked_at DESC);
CREATE INDEX idx_health_logs_connection_checked ON public.connection_health_logs USING btree (connection_id, checked_at DESC);
CREATE INDEX idx_kb_articles_search ON public.knowledge_base_articles USING gin (search_vector);
CREATE INDEX idx_login_attempts_email ON public.login_attempts USING btree (email);
CREATE INDEX idx_login_attempts_locked ON public.login_attempts USING btree (locked_until) WHERE (locked_until IS NOT NULL);
CREATE INDEX idx_message_reactions_message ON public.message_reactions USING btree (message_id);
CREATE INDEX idx_messages_contact_created ON public.messages USING btree (contact_id, created_at DESC);
CREATE INDEX idx_messages_contact_id ON public.messages USING btree (contact_id);
CREATE INDEX idx_messages_content_search ON public.messages USING gin (to_tsvector('portuguese'::regconfig, content));
CREATE INDEX idx_messages_created_at ON public.messages USING btree (created_at DESC);
CREATE INDEX idx_messages_external_id ON public.messages USING btree (external_id);
CREATE INDEX idx_mfa_sessions_user ON public.mfa_sessions USING btree (user_id);
CREATE INDEX idx_notifications_created_at ON public.notifications USING btree (created_at DESC);
CREATE INDEX idx_notifications_is_read ON public.notifications USING btree (is_read);
CREATE INDEX idx_notifications_user_id ON public.notifications USING btree (user_id);
CREATE INDEX idx_nps_surveys_contact ON public.nps_surveys USING btree (contact_id);
CREATE INDEX idx_nps_surveys_created ON public.nps_surveys USING btree (created_at DESC);
CREATE INDEX idx_passkey_credentials_credential_id ON public.passkey_credentials USING btree (credential_id);
CREATE INDEX idx_passkey_credentials_user_id ON public.passkey_credentials USING btree (user_id);
CREATE INDEX idx_password_reset_requests_status ON public.password_reset_requests USING btree (status);
CREATE INDEX idx_password_reset_requests_user ON public.password_reset_requests USING btree (user_id);
CREATE INDEX idx_performance_snapshots_created_at ON public.performance_snapshots USING btree (created_at DESC);
CREATE INDEX idx_performance_snapshots_profile ON public.performance_snapshots USING btree (profile_id);
CREATE INDEX idx_products_active ON public.products USING btree (is_active);
CREATE INDEX idx_products_category ON public.products USING btree (category);
CREATE INDEX idx_profiles_is_active ON public.profiles USING btree (is_active);
CREATE INDEX idx_query_telemetry_created_at ON public.query_telemetry USING btree (created_at DESC);
CREATE INDEX idx_query_telemetry_severity ON public.query_telemetry USING btree (severity);
CREATE INDEX idx_rate_limit_logs_created ON public.rate_limit_logs USING btree (created_at);
CREATE INDEX idx_rate_limit_logs_ip ON public.rate_limit_logs USING btree (ip_address);
CREATE INDEX idx_rate_limit_logs_user ON public.rate_limit_logs USING btree (user_id);
CREATE INDEX idx_rate_limits_instance_window ON public.webhook_rate_limits USING btree (instance_id, window_start DESC);
CREATE INDEX idx_reminders_profile ON public.reminders USING btree (profile_id);
CREATE INDEX idx_reminders_remind_at ON public.reminders USING btree (remind_at);
CREATE INDEX idx_reputation_connection ON public.number_reputation USING btree (whatsapp_connection_id);
CREATE INDEX idx_saved_filters_user_entity ON public.saved_filters USING btree (user_id, entity_type);
CREATE INDEX idx_scheduled_messages_pending ON public.scheduled_messages USING btree (scheduled_at) WHERE (status = 'pending'::text);
CREATE INDEX idx_security_alerts_created ON public.security_alerts USING btree (created_at);
CREATE INDEX idx_security_alerts_type ON public.security_alerts USING btree (alert_type);
CREATE INDEX idx_sla_rules_active ON public.sla_rules USING btree (is_active) WHERE (is_active = true);
CREATE INDEX idx_sla_rules_active_priority ON public.sla_rules USING btree (is_active, priority DESC);
CREATE INDEX idx_sla_rules_agent_id ON public.sla_rules USING btree (agent_id) WHERE (agent_id IS NOT NULL);
CREATE INDEX idx_sla_rules_company ON public.sla_rules USING btree (company) WHERE (company IS NOT NULL);
CREATE INDEX idx_sla_rules_contact_id ON public.sla_rules USING btree (contact_id) WHERE (contact_id IS NOT NULL);
CREATE INDEX idx_sla_rules_queue_id ON public.sla_rules USING btree (queue_id) WHERE (queue_id IS NOT NULL);
CREATE INDEX idx_snoozes_contact ON public.conversation_snoozes USING btree (contact_id);
CREATE INDEX idx_snoozes_until ON public.conversation_snoozes USING btree (snooze_until);
CREATE INDEX idx_stickers_owner_id ON public.stickers USING btree (owner_id) WHERE (owner_id IS NOT NULL);
CREATE INDEX idx_talkx_blacklist_contact ON public.talkx_blacklist USING btree (contact_id);
CREATE INDEX idx_talkx_campaigns_created_by ON public.talkx_campaigns USING btree (created_by);
CREATE INDEX idx_talkx_campaigns_status ON public.talkx_campaigns USING btree (status);
CREATE INDEX idx_talkx_recipients_campaign ON public.talkx_recipients USING btree (campaign_id);
CREATE INDEX idx_talkx_recipients_status ON public.talkx_recipients USING btree (status);
CREATE INDEX idx_tasks_assigned ON public.conversation_tasks USING btree (assigned_to);
CREATE INDEX idx_tasks_contact ON public.conversation_tasks USING btree (contact_id);
CREATE INDEX idx_tasks_status ON public.conversation_tasks USING btree (status);
CREATE INDEX idx_team_members_conversation ON public.team_conversation_members USING btree (conversation_id);
CREATE INDEX idx_team_members_profile ON public.team_conversation_members USING btree (profile_id);
CREATE INDEX idx_team_messages_conversation ON public.team_messages USING btree (conversation_id, created_at DESC);
CREATE INDEX idx_user_devices_fingerprint ON public.user_devices USING btree (device_fingerprint);
CREATE INDEX idx_user_devices_user_id ON public.user_devices USING btree (user_id);
CREATE INDEX idx_user_sessions_active ON public.user_sessions USING btree (is_active) WHERE (is_active = true);
CREATE INDEX idx_user_sessions_user_id ON public.user_sessions USING btree (user_id);
CREATE INDEX idx_versions_date ON public.entity_versions USING btree (created_at DESC);
CREATE INDEX idx_versions_entity ON public.entity_versions USING btree (entity_type, entity_id);
CREATE INDEX idx_voice_command_logs_created_at ON public.voice_command_logs USING btree (created_at DESC);
CREATE INDEX idx_voice_command_logs_user_id ON public.voice_command_logs USING btree (user_id);
CREATE INDEX idx_webauthn_challenges_expires ON public.webauthn_challenges USING btree (expires_at);
CREATE INDEX idx_whatsapp_groups_category ON public.whatsapp_groups USING btree (category);

-- ============================================================
-- 6. FOREIGN KEYS
-- ============================================================
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='agent_achievements_profile_id_fkey' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.agent_achievements ADD CONSTRAINT agent_achievements_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE;
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='agent_skills_profile_id_fkey' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.agent_skills ADD CONSTRAINT agent_skills_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE;
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='agent_stats_profile_id_fkey' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.agent_stats ADD CONSTRAINT agent_stats_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE;
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='agent_visibility_grants_agent_id_fkey' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.agent_visibility_grants ADD CONSTRAINT agent_visibility_grants_agent_id_fkey FOREIGN KEY (agent_id) REFERENCES profiles(id) ON DELETE CASCADE;
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='agent_visibility_grants_can_see_agent_id_fkey' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.agent_visibility_grants ADD CONSTRAINT agent_visibility_grants_can_see_agent_id_fkey FOREIGN KEY (can_see_agent_id) REFERENCES profiles(id) ON DELETE CASCADE;
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='agent_visibility_grants_granted_by_fkey' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.agent_visibility_grants ADD CONSTRAINT agent_visibility_grants_granted_by_fkey FOREIGN KEY (granted_by) REFERENCES profiles(id) ON DELETE SET NULL;
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='ai_conversation_tags_contact_id_fkey' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.ai_conversation_tags ADD CONSTRAINT ai_conversation_tags_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES contacts(id);
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='ai_providers_created_by_fkey' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.ai_providers ADD CONSTRAINT ai_providers_created_by_fkey FOREIGN KEY (created_by) REFERENCES profiles(id);
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='ai_usage_logs_profile_id_fkey' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.ai_usage_logs ADD CONSTRAINT ai_usage_logs_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES profiles(id);
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='allowed_countries_added_by_fkey' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.allowed_countries ADD CONSTRAINT allowed_countries_added_by_fkey FOREIGN KEY (added_by) REFERENCES auth.users(id);
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='audio_memes_uploaded_by_fkey' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.audio_memes ADD CONSTRAINT audio_memes_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES auth.users(id) ON DELETE SET NULL;
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='audit_logs_user_id_fkey' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.audit_logs ADD CONSTRAINT audit_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='auto_close_config_updated_by_fkey' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.auto_close_config ADD CONSTRAINT auto_close_config_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES profiles(id) ON DELETE SET NULL;
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='automations_created_by_fkey' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.automations ADD CONSTRAINT automations_created_by_fkey FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL;
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='away_messages_whatsapp_connection_id_fkey' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.away_messages ADD CONSTRAINT away_messages_whatsapp_connection_id_fkey FOREIGN KEY (whatsapp_connection_id) REFERENCES whatsapp_connections(id) ON DELETE CASCADE;
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='blocked_countries_blocked_by_fkey' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.blocked_countries ADD CONSTRAINT blocked_countries_blocked_by_fkey FOREIGN KEY (blocked_by) REFERENCES auth.users(id);
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='blocked_ips_blocked_by_fkey' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.blocked_ips ADD CONSTRAINT blocked_ips_blocked_by_fkey FOREIGN KEY (blocked_by) REFERENCES auth.users(id) ON DELETE SET NULL;
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='business_hours_whatsapp_connection_id_fkey' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.business_hours ADD CONSTRAINT business_hours_whatsapp_connection_id_fkey FOREIGN KEY (whatsapp_connection_id) REFERENCES whatsapp_connections(id) ON DELETE CASCADE;
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='calls_agent_id_fkey' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.calls ADD CONSTRAINT calls_agent_id_fkey FOREIGN KEY (agent_id) REFERENCES profiles(id) ON DELETE SET NULL;
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='calls_contact_id_fkey' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.calls ADD CONSTRAINT calls_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE SET NULL;
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='calls_whatsapp_connection_id_fkey' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.calls ADD CONSTRAINT calls_whatsapp_connection_id_fkey FOREIGN KEY (whatsapp_connection_id) REFERENCES whatsapp_connections(id) ON DELETE SET NULL;
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='campaign_ab_variants_campaign_id_fkey' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.campaign_ab_variants ADD CONSTRAINT campaign_ab_variants_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE;
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='campaign_contacts_campaign_id_fkey' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.campaign_contacts ADD CONSTRAINT campaign_contacts_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE;
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='campaign_contacts_contact_id_fkey' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.campaign_contacts ADD CONSTRAINT campaign_contacts_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE;
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='campaigns_created_by_fkey' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.campaigns ADD CONSTRAINT campaigns_created_by_fkey FOREIGN KEY (created_by) REFERENCES profiles(id);
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='campaigns_whatsapp_connection_id_fkey' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.campaigns ADD CONSTRAINT campaigns_whatsapp_connection_id_fkey FOREIGN KEY (whatsapp_connection_id) REFERENCES whatsapp_connections(id);
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='channel_connections_created_by_fkey' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.channel_connections ADD CONSTRAINT channel_connections_created_by_fkey FOREIGN KEY (created_by) REFERENCES profiles(id);
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='channel_connections_whatsapp_connection_id_fkey' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.channel_connections ADD CONSTRAINT channel_connections_whatsapp_connection_id_fkey FOREIGN KEY (whatsapp_connection_id) REFERENCES whatsapp_connections(id);
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='channel_routing_rules_channel_connection_id_fkey' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.channel_routing_rules ADD CONSTRAINT channel_routing_rules_channel_connection_id_fkey FOREIGN KEY (channel_connection_id) REFERENCES channel_connections(id);
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='channel_routing_rules_queue_id_fkey' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.channel_routing_rules ADD CONSTRAINT channel_routing_rules_queue_id_fkey FOREIGN KEY (queue_id) REFERENCES queues(id);
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='chatbot_executions_contact_id_fkey' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.chatbot_executions ADD CONSTRAINT chatbot_executions_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE;
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='chatbot_executions_flow_id_fkey' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.chatbot_executions ADD CONSTRAINT chatbot_executions_flow_id_fkey FOREIGN KEY (flow_id) REFERENCES chatbot_flows(id) ON DELETE CASCADE;
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='chatbot_flows_created_by_fkey' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.chatbot_flows ADD CONSTRAINT chatbot_flows_created_by_fkey FOREIGN KEY (created_by) REFERENCES profiles(id);
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='chatbot_flows_whatsapp_connection_id_fkey' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.chatbot_flows ADD CONSTRAINT chatbot_flows_whatsapp_connection_id_fkey FOREIGN KEY (whatsapp_connection_id) REFERENCES whatsapp_connections(id);
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='client_wallet_rules_agent_id_fkey' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.client_wallet_rules ADD CONSTRAINT client_wallet_rules_agent_id_fkey FOREIGN KEY (agent_id) REFERENCES profiles(id) ON DELETE CASCADE;
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='client_wallet_rules_whatsapp_connection_id_fkey' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.client_wallet_rules ADD CONSTRAINT client_wallet_rules_whatsapp_connection_id_fkey FOREIGN KEY (whatsapp_connection_id) REFERENCES whatsapp_connections(id) ON DELETE CASCADE;
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='connection_health_logs_connection_id_fkey' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.connection_health_logs ADD CONSTRAINT connection_health_logs_connection_id_fkey FOREIGN KEY (connection_id) REFERENCES whatsapp_connections(id) ON DELETE CASCADE;
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='contact_custom_fields_contact_id_fkey' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.contact_custom_fields ADD CONSTRAINT contact_custom_fields_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE;
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='contact_notes_author_id_fkey' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.contact_notes ADD CONSTRAINT contact_notes_author_id_fkey FOREIGN KEY (author_id) REFERENCES profiles(id) ON DELETE CASCADE;
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='contact_notes_contact_id_fkey' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.contact_notes ADD CONSTRAINT contact_notes_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE;
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='contact_purchases_contact_id_fkey' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.contact_purchases ADD CONSTRAINT contact_purchases_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE;
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='contact_purchases_created_by_fkey' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.contact_purchases ADD CONSTRAINT contact_purchases_created_by_fkey FOREIGN KEY (created_by) REFERENCES profiles(id);
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='contact_purchases_deal_id_fkey' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.contact_purchases ADD CONSTRAINT contact_purchases_deal_id_fkey FOREIGN KEY (deal_id) REFERENCES sales_deals(id);
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='contact_tags_contact_id_fkey' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.contact_tags ADD CONSTRAINT contact_tags_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE;
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='contact_tags_tag_id_fkey' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.contact_tags ADD CONSTRAINT contact_tags_tag_id_fkey FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE;
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='contacts_assigned_to_fkey' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.contacts ADD CONSTRAINT contacts_assigned_to_fkey FOREIGN KEY (assigned_to) REFERENCES profiles(id) ON DELETE SET NULL;
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='contacts_channel_connection_id_fkey' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.contacts ADD CONSTRAINT contacts_channel_connection_id_fkey FOREIGN KEY (channel_connection_id) REFERENCES channel_connections(id);
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='contacts_queue_id_fkey' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.contacts ADD CONSTRAINT contacts_queue_id_fkey FOREIGN KEY (queue_id) REFERENCES queues(id) ON DELETE SET NULL;
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='contacts_whatsapp_connection_id_fkey' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.contacts ADD CONSTRAINT contacts_whatsapp_connection_id_fkey FOREIGN KEY (whatsapp_connection_id) REFERENCES whatsapp_connections(id) ON DELETE SET NULL;
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='conversation_analyses_analyzed_by_fkey' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.conversation_analyses ADD CONSTRAINT conversation_analyses_analyzed_by_fkey FOREIGN KEY (analyzed_by) REFERENCES profiles(id);
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='conversation_analyses_contact_id_fkey' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.conversation_analyses ADD CONSTRAINT conversation_analyses_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE;
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='conversation_closures_closed_by_fkey' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.conversation_closures ADD CONSTRAINT conversation_closures_closed_by_fkey FOREIGN KEY (closed_by) REFERENCES profiles(id) ON DELETE SET NULL;
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='conversation_closures_contact_id_fkey' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.conversation_closures ADD CONSTRAINT conversation_closures_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE;
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='conversation_events_contact_id_fkey' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.conversation_events ADD CONSTRAINT conversation_events_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE;
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='conversation_events_from_agent_id_fkey' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.conversation_events ADD CONSTRAINT conversation_events_from_agent_id_fkey FOREIGN KEY (from_agent_id) REFERENCES profiles(id);
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='conversation_events_from_queue_id_fkey' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.conversation_events ADD CONSTRAINT conversation_events_from_queue_id_fkey FOREIGN KEY (from_queue_id) REFERENCES queues(id);
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='conversation_events_performed_by_fkey' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.conversation_events ADD CONSTRAINT conversation_events_performed_by_fkey FOREIGN KEY (performed_by) REFERENCES profiles(id);
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='conversation_events_to_agent_id_fkey' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.conversation_events ADD CONSTRAINT conversation_events_to_agent_id_fkey FOREIGN KEY (to_agent_id) REFERENCES profiles(id);
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='conversation_events_to_queue_id_fkey' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.conversation_events ADD CONSTRAINT conversation_events_to_queue_id_fkey FOREIGN KEY (to_queue_id) REFERENCES queues(id);
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='conversation_memory_contact_id_fkey' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.conversation_memory ADD CONSTRAINT conversation_memory_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE;
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='conversation_memory_updated_by_fkey' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.conversation_memory ADD CONSTRAINT conversation_memory_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES profiles(id) ON DELETE SET NULL;
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='conversation_sla_contact_id_fkey' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.conversation_sla ADD CONSTRAINT conversation_sla_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE;
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='conversation_sla_sla_configuration_id_fkey' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.conversation_sla ADD CONSTRAINT conversation_sla_sla_configuration_id_fkey FOREIGN KEY (sla_configuration_id) REFERENCES sla_configurations(id);
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='conversation_snoozes_contact_id_fkey' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.conversation_snoozes ADD CONSTRAINT conversation_snoozes_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE;
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='conversation_snoozes_snoozed_by_fkey' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.conversation_snoozes ADD CONSTRAINT conversation_snoozes_snoozed_by_fkey FOREIGN KEY (snoozed_by) REFERENCES profiles(id) ON DELETE CASCADE;
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='conversation_tasks_assigned_to_fkey' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.conversation_tasks ADD CONSTRAINT conversation_tasks_assigned_to_fkey FOREIGN KEY (assigned_to) REFERENCES profiles(id) ON DELETE SET NULL;
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='conversation_tasks_contact_id_fkey' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.conversation_tasks ADD CONSTRAINT conversation_tasks_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE SET NULL;
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='conversation_tasks_created_by_fkey' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.conversation_tasks ADD CONSTRAINT conversation_tasks_created_by_fkey FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL;
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='crisis_room_alerts_acknowledged_by_fkey' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.crisis_room_alerts ADD CONSTRAINT crisis_room_alerts_acknowledged_by_fkey FOREIGN KEY (acknowledged_by) REFERENCES profiles(id);
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='csat_auto_config_updated_by_fkey' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.csat_auto_config ADD CONSTRAINT csat_auto_config_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES profiles(id);
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='csat_auto_config_whatsapp_connection_id_fkey' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.csat_auto_config ADD CONSTRAINT csat_auto_config_whatsapp_connection_id_fkey FOREIGN KEY (whatsapp_connection_id) REFERENCES whatsapp_connections(id);
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='csat_surveys_agent_id_fkey' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.csat_surveys ADD CONSTRAINT csat_surveys_agent_id_fkey FOREIGN KEY (agent_id) REFERENCES profiles(id) ON DELETE SET NULL;
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='csat_surveys_contact_id_fkey' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.csat_surveys ADD CONSTRAINT csat_surveys_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE;
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='deal_activities_deal_id_fkey' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.deal_activities ADD CONSTRAINT deal_activities_deal_id_fkey FOREIGN KEY (deal_id) REFERENCES sales_deals(id) ON DELETE CASCADE;
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='deal_activities_performed_by_fkey' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.deal_activities ADD CONSTRAINT deal_activities_performed_by_fkey FOREIGN KEY (performed_by) REFERENCES profiles(id) ON DELETE SET NULL;
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='email_labels_gmail_account_id_fkey' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.email_labels ADD CONSTRAINT email_labels_gmail_account_id_fkey FOREIGN KEY (gmail_account_id) REFERENCES gmail_accounts(id) ON DELETE CASCADE;
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='email_messages_gmail_account_id_fkey' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.email_messages ADD CONSTRAINT email_messages_gmail_account_id_fkey FOREIGN KEY (gmail_account_id) REFERENCES gmail_accounts(id) ON DELETE CASCADE;
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='email_messages_thread_id_fkey' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.email_messages ADD CONSTRAINT email_messages_thread_id_fkey FOREIGN KEY (thread_id) REFERENCES email_threads(id) ON DELETE CASCADE;
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='email_threads_contact_id_fkey' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.email_threads ADD CONSTRAINT email_threads_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE SET NULL;
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='email_threads_gmail_account_id_fkey' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.email_threads ADD CONSTRAINT email_threads_gmail_account_id_fkey FOREIGN KEY (gmail_account_id) REFERENCES gmail_accounts(id) ON DELETE CASCADE;
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='favorite_contacts_contact_id_fkey' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.favorite_contacts ADD CONSTRAINT favorite_contacts_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE;
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='favorite_contacts_user_id_fkey' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.favorite_contacts ADD CONSTRAINT favorite_contacts_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='followup_executions_contact_id_fkey' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.followup_executions ADD CONSTRAINT followup_executions_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES contacts(id);
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='followup_executions_sequence_id_fkey' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.followup_executions ADD CONSTRAINT followup_executions_sequence_id_fkey FOREIGN KEY (sequence_id) REFERENCES followup_sequences(id);
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='followup_sequences_created_by_fkey' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.followup_sequences ADD CONSTRAINT followup_sequences_created_by_fkey FOREIGN KEY (created_by) REFERENCES profiles(id);
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='followup_sequences_whatsapp_connection_id_fkey' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.followup_sequences ADD CONSTRAINT followup_sequences_whatsapp_connection_id_fkey FOREIGN KEY (whatsapp_connection_id) REFERENCES whatsapp_connections(id);
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='followup_steps_sequence_id_fkey' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.followup_steps ADD CONSTRAINT followup_steps_sequence_id_fkey FOREIGN KEY (sequence_id) REFERENCES followup_sequences(id) ON DELETE CASCADE;
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='geo_blocking_settings_updated_by_fkey' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.geo_blocking_settings ADD CONSTRAINT geo_blocking_settings_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id);
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='goals_configurations_profile_id_fkey' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.goals_configurations ADD CONSTRAINT goals_configurations_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE;
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='goals_configurations_queue_id_fkey' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.goals_configurations ADD CONSTRAINT goals_configurations_queue_id_fkey FOREIGN KEY (queue_id) REFERENCES queues(id) ON DELETE CASCADE;
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='ip_whitelist_added_by_fkey' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.ip_whitelist ADD CONSTRAINT ip_whitelist_added_by_fkey FOREIGN KEY (added_by) REFERENCES auth.users(id) ON DELETE SET NULL;
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='knowledge_base_articles_created_by_fkey' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.knowledge_base_articles ADD CONSTRAINT knowledge_base_articles_created_by_fkey FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL;
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='knowledge_base_files_article_id_fkey' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.knowledge_base_files ADD CONSTRAINT knowledge_base_files_article_id_fkey FOREIGN KEY (article_id) REFERENCES knowledge_base_articles(id) ON DELETE CASCADE;
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='message_reactions_contact_id_fkey' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.message_reactions ADD CONSTRAINT message_reactions_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE;
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='message_reactions_message_id_fkey' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.message_reactions ADD CONSTRAINT message_reactions_message_id_fkey FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE;
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='message_reactions_user_id_fkey' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.message_reactions ADD CONSTRAINT message_reactions_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='messages_agent_id_fkey' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.messages ADD CONSTRAINT messages_agent_id_fkey FOREIGN KEY (agent_id) REFERENCES profiles(id) ON DELETE SET NULL;
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='messages_channel_connection_id_fkey' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.messages ADD CONSTRAINT messages_channel_connection_id_fkey FOREIGN KEY (channel_connection_id) REFERENCES channel_connections(id);
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='messages_contact_id_fkey' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.messages ADD CONSTRAINT messages_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE;
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='messages_whatsapp_connection_id_fkey' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.messages ADD CONSTRAINT messages_whatsapp_connection_id_fkey FOREIGN KEY (whatsapp_connection_id) REFERENCES whatsapp_connections(id) ON DELETE SET NULL;
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='meta_capi_events_contact_id_fkey' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.meta_capi_events ADD CONSTRAINT meta_capi_events_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE SET NULL;
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='mfa_sessions_user_id_fkey' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.mfa_sessions ADD CONSTRAINT mfa_sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='nps_surveys_agent_id_fkey' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.nps_surveys ADD CONSTRAINT nps_surveys_agent_id_fkey FOREIGN KEY (agent_id) REFERENCES profiles(id);
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='nps_surveys_contact_id_fkey' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.nps_surveys ADD CONSTRAINT nps_surveys_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE;
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='number_reputation_whatsapp_connection_id_fkey' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.number_reputation ADD CONSTRAINT number_reputation_whatsapp_connection_id_fkey FOREIGN KEY (whatsapp_connection_id) REFERENCES whatsapp_connections(id) ON DELETE CASCADE;
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='passkey_credentials_user_id_fkey' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.passkey_credentials ADD CONSTRAINT passkey_credentials_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='password_reset_requests_reviewed_by_fkey' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.password_reset_requests ADD CONSTRAINT password_reset_requests_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES auth.users(id);
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='password_reset_requests_user_id_fkey' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.password_reset_requests ADD CONSTRAINT password_reset_requests_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='payment_links_contact_id_fkey' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.payment_links ADD CONSTRAINT payment_links_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE SET NULL;
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='payment_links_created_by_fkey' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.payment_links ADD CONSTRAINT payment_links_created_by_fkey FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL;
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='payment_links_deal_id_fkey' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.payment_links ADD CONSTRAINT payment_links_deal_id_fkey FOREIGN KEY (deal_id) REFERENCES sales_deals(id) ON DELETE SET NULL;
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='pinned_conversations_contact_id_fkey' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.pinned_conversations ADD CONSTRAINT pinned_conversations_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE;
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='pinned_conversations_pinned_by_fkey' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.pinned_conversations ADD CONSTRAINT pinned_conversations_pinned_by_fkey FOREIGN KEY (pinned_by) REFERENCES profiles(id) ON DELETE CASCADE;
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='playbooks_created_by_fkey' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.playbooks ADD CONSTRAINT playbooks_created_by_fkey FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL;
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='products_whatsapp_connection_id_fkey' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.products ADD CONSTRAINT products_whatsapp_connection_id_fkey FOREIGN KEY (whatsapp_connection_id) REFERENCES whatsapp_connections(id) ON DELETE SET NULL;
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='profiles_user_id_fkey' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.profiles ADD CONSTRAINT profiles_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='queue_goals_queue_id_fkey' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.queue_goals ADD CONSTRAINT queue_goals_queue_id_fkey FOREIGN KEY (queue_id) REFERENCES queues(id) ON DELETE CASCADE;
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='queue_members_profile_id_fkey' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.queue_members ADD CONSTRAINT queue_members_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE;
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='queue_members_queue_id_fkey' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.queue_members ADD CONSTRAINT queue_members_queue_id_fkey FOREIGN KEY (queue_id) REFERENCES queues(id) ON DELETE CASCADE;
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='queue_positions_contact_id_fkey' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.queue_positions ADD CONSTRAINT queue_positions_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES contacts(id);
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='queue_positions_queue_id_fkey' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.queue_positions ADD CONSTRAINT queue_positions_queue_id_fkey FOREIGN KEY (queue_id) REFERENCES queues(id);
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='queue_skill_requirements_queue_id_fkey' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.queue_skill_requirements ADD CONSTRAINT queue_skill_requirements_queue_id_fkey FOREIGN KEY (queue_id) REFERENCES queues(id) ON DELETE CASCADE;
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='rate_limit_logs_user_id_fkey' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.rate_limit_logs ADD CONSTRAINT rate_limit_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='reminders_contact_id_fkey' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.reminders ADD CONSTRAINT reminders_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE SET NULL;
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='reminders_profile_id_fkey' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.reminders ADD CONSTRAINT reminders_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE;
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='role_permissions_permission_id_fkey' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.role_permissions ADD CONSTRAINT role_permissions_permission_id_fkey FOREIGN KEY (permission_id) REFERENCES permissions(id) ON DELETE CASCADE;
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='sales_deals_assigned_to_fkey' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.sales_deals ADD CONSTRAINT sales_deals_assigned_to_fkey FOREIGN KEY (assigned_to) REFERENCES profiles(id) ON DELETE SET NULL;
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='sales_deals_contact_id_fkey' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.sales_deals ADD CONSTRAINT sales_deals_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE;
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='sales_deals_stage_id_fkey' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.sales_deals ADD CONSTRAINT sales_deals_stage_id_fkey FOREIGN KEY (stage_id) REFERENCES sales_pipeline_stages(id) ON DELETE SET NULL;
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='scheduled_messages_contact_id_fkey' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.scheduled_messages ADD CONSTRAINT scheduled_messages_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE;
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='scheduled_messages_created_by_fkey' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.scheduled_messages ADD CONSTRAINT scheduled_messages_created_by_fkey FOREIGN KEY (created_by) REFERENCES profiles(id);
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='scheduled_messages_whatsapp_connection_id_fkey' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.scheduled_messages ADD CONSTRAINT scheduled_messages_whatsapp_connection_id_fkey FOREIGN KEY (whatsapp_connection_id) REFERENCES whatsapp_connections(id);
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='scheduled_report_configs_created_by_fkey' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.scheduled_report_configs ADD CONSTRAINT scheduled_report_configs_created_by_fkey FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL;
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='security_alerts_resolved_by_fkey' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.security_alerts ADD CONSTRAINT security_alerts_resolved_by_fkey FOREIGN KEY (resolved_by) REFERENCES auth.users(id) ON DELETE SET NULL;
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='security_alerts_user_id_fkey' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.security_alerts ADD CONSTRAINT security_alerts_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='sicoob_contact_mapping_contact_id_fkey' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.sicoob_contact_mapping ADD CONSTRAINT sicoob_contact_mapping_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE;
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='sicoob_contact_mapping_zappweb_agent_id_fkey' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.sicoob_contact_mapping ADD CONSTRAINT sicoob_contact_mapping_zappweb_agent_id_fkey FOREIGN KEY (zappweb_agent_id) REFERENCES profiles(id);
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='sla_rules_agent_id_fkey' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.sla_rules ADD CONSTRAINT sla_rules_agent_id_fkey FOREIGN KEY (agent_id) REFERENCES profiles(id) ON DELETE CASCADE;
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='sla_rules_contact_id_fkey' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.sla_rules ADD CONSTRAINT sla_rules_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE;
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='sla_rules_queue_id_fkey' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.sla_rules ADD CONSTRAINT sla_rules_queue_id_fkey FOREIGN KEY (queue_id) REFERENCES queues(id) ON DELETE CASCADE;
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='stickers_owner_id_fkey' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.stickers ADD CONSTRAINT stickers_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES profiles(id) ON DELETE CASCADE;
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='tags_created_by_fkey' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.tags ADD CONSTRAINT tags_created_by_fkey FOREIGN KEY (created_by) REFERENCES profiles(id);
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='talkx_blacklist_blocked_by_fkey' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.talkx_blacklist ADD CONSTRAINT talkx_blacklist_blocked_by_fkey FOREIGN KEY (blocked_by) REFERENCES profiles(id) ON DELETE SET NULL;
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='talkx_blacklist_contact_id_fkey' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.talkx_blacklist ADD CONSTRAINT talkx_blacklist_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE;
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='talkx_campaigns_created_by_fkey' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.talkx_campaigns ADD CONSTRAINT talkx_campaigns_created_by_fkey FOREIGN KEY (created_by) REFERENCES profiles(id);
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='talkx_campaigns_whatsapp_connection_id_fkey' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.talkx_campaigns ADD CONSTRAINT talkx_campaigns_whatsapp_connection_id_fkey FOREIGN KEY (whatsapp_connection_id) REFERENCES whatsapp_connections(id);
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='talkx_recipients_campaign_id_fkey' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.talkx_recipients ADD CONSTRAINT talkx_recipients_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES talkx_campaigns(id) ON DELETE CASCADE;
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='talkx_recipients_contact_id_fkey' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.talkx_recipients ADD CONSTRAINT talkx_recipients_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE;
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='team_conversation_members_conversation_id_fkey' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.team_conversation_members ADD CONSTRAINT team_conversation_members_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES team_conversations(id) ON DELETE CASCADE;
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='team_conversation_members_profile_id_fkey' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.team_conversation_members ADD CONSTRAINT team_conversation_members_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE;
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='team_conversations_created_by_fkey' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.team_conversations ADD CONSTRAINT team_conversations_created_by_fkey FOREIGN KEY (created_by) REFERENCES profiles(id);
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='team_messages_conversation_id_fkey' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.team_messages ADD CONSTRAINT team_messages_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES team_conversations(id) ON DELETE CASCADE;
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='team_messages_reply_to_id_fkey' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.team_messages ADD CONSTRAINT team_messages_reply_to_id_fkey FOREIGN KEY (reply_to_id) REFERENCES team_messages(id);
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='team_messages_sender_id_fkey' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.team_messages ADD CONSTRAINT team_messages_sender_id_fkey FOREIGN KEY (sender_id) REFERENCES profiles(id);
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='training_sessions_profile_id_fkey' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.training_sessions ADD CONSTRAINT training_sessions_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE;
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='user_roles_user_id_fkey' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.user_roles ADD CONSTRAINT user_roles_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='user_sessions_device_id_fkey' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.user_sessions ADD CONSTRAINT user_sessions_device_id_fkey FOREIGN KEY (device_id) REFERENCES user_devices(id) ON DELETE SET NULL;
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='user_settings_user_id_fkey' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.user_settings ADD CONSTRAINT user_settings_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='warroom_alerts_dismissed_by_fkey' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.warroom_alerts ADD CONSTRAINT warroom_alerts_dismissed_by_fkey FOREIGN KEY (dismissed_by) REFERENCES profiles(id);
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='whatsapp_connection_queues_queue_id_fkey' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.whatsapp_connection_queues ADD CONSTRAINT whatsapp_connection_queues_queue_id_fkey FOREIGN KEY (queue_id) REFERENCES queues(id) ON DELETE CASCADE;
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='whatsapp_connection_queues_whatsapp_connection_id_fkey' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.whatsapp_connection_queues ADD CONSTRAINT whatsapp_connection_queues_whatsapp_connection_id_fkey FOREIGN KEY (whatsapp_connection_id) REFERENCES whatsapp_connections(id) ON DELETE CASCADE;
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='whatsapp_connections_created_by_fkey' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.whatsapp_connections ADD CONSTRAINT whatsapp_connections_created_by_fkey FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL;
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='whatsapp_flows_created_by_fkey' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.whatsapp_flows ADD CONSTRAINT whatsapp_flows_created_by_fkey FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL;
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='whatsapp_flows_whatsapp_connection_id_fkey' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.whatsapp_flows ADD CONSTRAINT whatsapp_flows_whatsapp_connection_id_fkey FOREIGN KEY (whatsapp_connection_id) REFERENCES whatsapp_connections(id) ON DELETE SET NULL;
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='whatsapp_groups_whatsapp_connection_id_fkey' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.whatsapp_groups ADD CONSTRAINT whatsapp_groups_whatsapp_connection_id_fkey FOREIGN KEY (whatsapp_connection_id) REFERENCES whatsapp_connections(id) ON DELETE CASCADE;
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='whatsapp_templates_whatsapp_connection_id_fkey' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.whatsapp_templates ADD CONSTRAINT whatsapp_templates_whatsapp_connection_id_fkey FOREIGN KEY (whatsapp_connection_id) REFERENCES whatsapp_connections(id);
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='whisper_messages_contact_id_fkey' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.whisper_messages ADD CONSTRAINT whisper_messages_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES contacts(id);
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='whisper_messages_sender_id_fkey' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.whisper_messages ADD CONSTRAINT whisper_messages_sender_id_fkey FOREIGN KEY (sender_id) REFERENCES profiles(id);
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='whisper_messages_target_agent_id_fkey' AND connamespace='public'::regnamespace) THEN
        ALTER TABLE public.whisper_messages ADD CONSTRAINT whisper_messages_target_agent_id_fkey FOREIGN KEY (target_agent_id) REFERENCES profiles(id);
    END IF;
END $$;

-- ============================================================
-- 7. FUNCTIONS
-- ============================================================
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
$function$
;
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
$function$
;
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
$function$
;
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
$function$
;
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
$function$
;
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
$function$
;
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
$function$
;
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
$function$
;
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
$function$
;
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
$function$
;
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
$function$
;
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
$function$
;
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
$function$
;
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
$function$
;
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
$function$
;
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
$function$
;
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
$function$
;
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
$function$
;
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$
;
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
$function$
;
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
$function$
;
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
$function$
;
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
$function$
;
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
$function$
;
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
$function$
;
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
$function$
;
CREATE OR REPLACE FUNCTION public.get_profile_id_for_user(_user_id uuid)
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT id FROM public.profiles WHERE user_id = _user_id LIMIT 1;
$function$
;
CREATE OR REPLACE FUNCTION public.get_connection_instance(_connection_id uuid)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT instance_id FROM public.whatsapp_connections WHERE id = _connection_id;
$function$
;
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
$function$
;
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
$function$
;
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
$function$
;
CREATE OR REPLACE FUNCTION public.calculate_level(xp_amount integer)
 RETURNS integer
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN GREATEST(1, FLOOR(SQRT(xp_amount / 50.0))::INTEGER + 1);
END;
$function$
;
CREATE OR REPLACE FUNCTION public.get_connection_qr_code(_connection_id uuid)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT qr_code FROM public.whatsapp_connections WHERE id = _connection_id;
$function$
;
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
$function$
;
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
$function$
;
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
$function$
;
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
$function$
;
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
$function$
;
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
$function$
;
CREATE OR REPLACE FUNCTION public.contacts_count_by_type()
 RETURNS TABLE(contact_type text, count bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT COALESCE(c.contact_type, 'cliente') AS contact_type, COUNT(*) AS count
  FROM public.contacts c
  GROUP BY COALESCE(c.contact_type, 'cliente');
$function$
;
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
$function$
;
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
$function$
;
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
$function$
;
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
$function$
;
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
$function$
;
CREATE OR REPLACE FUNCTION public.update_global_settings_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$
;
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
$function$
;
CREATE OR REPLACE FUNCTION public.cleanup_expired_challenges()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
    DELETE FROM public.webauthn_challenges WHERE expires_at < now();
END;
$function$
;
CREATE OR REPLACE FUNCTION public.clear_login_attempts(p_email text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  DELETE FROM public.login_attempts WHERE email = LOWER(p_email);
END;
$function$
;
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
$function$
;
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
$function$
;
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
$function$
;
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
$function$
;
CREATE OR REPLACE FUNCTION public.update_device_last_seen()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
    NEW.last_seen_at = now();
    RETURN NEW;
END;
$function$
;
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
$function$
;
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
$function$
;
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
$function$
;
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
$function$
;
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
$function$
;

-- ============================================================
-- 8. TRIGGERS
-- ============================================================
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='audit_user_role_changes' AND tgrelid='public.user_roles'::regclass) THEN
        CREATE TRIGGER audit_user_role_changes AFTER INSERT OR DELETE OR UPDATE ON public.user_roles FOR EACH ROW EXECUTE FUNCTION audit_role_changes();
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='clear_qr_on_connect_trigger' AND tgrelid='public.whatsapp_connections'::regclass) THEN
        CREATE TRIGGER clear_qr_on_connect_trigger BEFORE UPDATE OF status ON public.whatsapp_connections FOR EACH ROW EXECUTE FUNCTION clear_qr_on_connect();
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='ensure_single_default_ai_provider' AND tgrelid='public.ai_providers'::regclass) THEN
        CREATE TRIGGER ensure_single_default_ai_provider BEFORE INSERT OR UPDATE ON public.ai_providers FOR EACH ROW EXECUTE FUNCTION ensure_single_default_ai_provider();
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='ensure_single_default_filter_trigger' AND tgrelid='public.saved_filters'::regclass) THEN
        CREATE TRIGGER ensure_single_default_filter_trigger BEFORE INSERT OR UPDATE ON public.saved_filters FOR EACH ROW EXECUTE FUNCTION ensure_single_default_filter();
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='on_agent_stats_update_level' AND tgrelid='public.agent_stats'::regclass) THEN
        CREATE TRIGGER on_agent_stats_update_level BEFORE UPDATE OF xp ON public.agent_stats FOR EACH ROW EXECUTE FUNCTION update_agent_level();
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='on_contact_created_auto_assign' AND tgrelid='public.contacts'::regclass) THEN
        CREATE TRIGGER on_contact_created_auto_assign BEFORE INSERT ON public.contacts FOR EACH ROW EXECUTE FUNCTION auto_assign_contact();
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='on_contact_queue_auto_assign' AND tgrelid='public.contacts'::regclass) THEN
        CREATE TRIGGER on_contact_queue_auto_assign BEFORE INSERT ON public.contacts FOR EACH ROW EXECUTE FUNCTION auto_assign_to_queue_agent();
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='on_device_update_last_seen' AND tgrelid='public.user_devices'::regclass) THEN
        CREATE TRIGGER on_device_update_last_seen BEFORE UPDATE ON public.user_devices FOR EACH ROW EXECUTE FUNCTION update_device_last_seen();
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='on_profile_created_init_stats' AND tgrelid='public.profiles'::regclass) THEN
        CREATE TRIGGER on_profile_created_init_stats AFTER INSERT ON public.profiles FOR EACH ROW EXECUTE FUNCTION init_agent_stats();
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='on_profile_update_prevent_escalation' AND tgrelid='public.profiles'::regclass) THEN
        CREATE TRIGGER on_profile_update_prevent_escalation BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION prevent_role_escalation();
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='prevent_privilege_escalation' AND tgrelid='public.profiles'::regclass) THEN
        CREATE TRIGGER prevent_privilege_escalation BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION prevent_profile_privilege_escalation();
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='sanitize_reset_request_trigger' AND tgrelid='public.password_reset_requests'::regclass) THEN
        CREATE TRIGGER sanitize_reset_request_trigger BEFORE INSERT ON public.password_reset_requests FOR EACH ROW EXECUTE FUNCTION sanitize_reset_request();
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='trg_log_assignment_change' AND tgrelid='public.contacts'::regclass) THEN
        CREATE TRIGGER trg_log_assignment_change AFTER UPDATE ON public.contacts FOR EACH ROW EXECUTE FUNCTION log_assignment_change();
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='trg_normalize_contact_phone' AND tgrelid='public.contacts'::regclass) THEN
        CREATE TRIGGER trg_normalize_contact_phone BEFORE INSERT OR UPDATE OF phone ON public.contacts FOR EACH ROW EXECUTE FUNCTION normalize_contact_phone();
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='trg_rate_limit_reset' AND tgrelid='public.password_reset_requests'::regclass) THEN
        CREATE TRIGGER trg_rate_limit_reset BEFORE INSERT ON public.password_reset_requests FOR EACH ROW EXECUTE FUNCTION rate_limit_reset_requests();
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='trg_sicoob_reply' AND tgrelid='public.messages'::regclass) THEN
        CREATE TRIGGER trg_sicoob_reply AFTER INSERT ON public.messages FOR EACH ROW EXECUTE FUNCTION notify_sicoob_on_reply();
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='trigger_global_settings_updated_at' AND tgrelid='public.global_settings'::regclass) THEN
        CREATE TRIGGER trigger_global_settings_updated_at BEFORE UPDATE ON public.global_settings FOR EACH ROW EXECUTE FUNCTION update_global_settings_updated_at();
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='update_agent_stats_updated_at' AND tgrelid='public.agent_stats'::regclass) THEN
        CREATE TRIGGER update_agent_stats_updated_at BEFORE UPDATE ON public.agent_stats FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='update_ai_providers_updated_at' AND tgrelid='public.ai_providers'::regclass) THEN
        CREATE TRIGGER update_ai_providers_updated_at BEFORE UPDATE ON public.ai_providers FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='update_auto_close_config_updated_at' AND tgrelid='public.auto_close_config'::regclass) THEN
        CREATE TRIGGER update_auto_close_config_updated_at BEFORE UPDATE ON public.auto_close_config FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='update_automations_updated_at' AND tgrelid='public.automations'::regclass) THEN
        CREATE TRIGGER update_automations_updated_at BEFORE UPDATE ON public.automations FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='update_away_messages_updated_at' AND tgrelid='public.away_messages'::regclass) THEN
        CREATE TRIGGER update_away_messages_updated_at BEFORE UPDATE ON public.away_messages FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='update_business_hours_updated_at' AND tgrelid='public.business_hours'::regclass) THEN
        CREATE TRIGGER update_business_hours_updated_at BEFORE UPDATE ON public.business_hours FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='update_campaigns_updated_at' AND tgrelid='public.campaigns'::regclass) THEN
        CREATE TRIGGER update_campaigns_updated_at BEFORE UPDATE ON public.campaigns FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='update_channel_connections_updated_at' AND tgrelid='public.channel_connections'::regclass) THEN
        CREATE TRIGGER update_channel_connections_updated_at BEFORE UPDATE ON public.channel_connections FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='update_chatbot_flows_updated_at' AND tgrelid='public.chatbot_flows'::regclass) THEN
        CREATE TRIGGER update_chatbot_flows_updated_at BEFORE UPDATE ON public.chatbot_flows FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='update_contact_custom_fields_updated_at' AND tgrelid='public.contact_custom_fields'::regclass) THEN
        CREATE TRIGGER update_contact_custom_fields_updated_at BEFORE UPDATE ON public.contact_custom_fields FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='update_contact_notes_updated_at' AND tgrelid='public.contact_notes'::regclass) THEN
        CREATE TRIGGER update_contact_notes_updated_at BEFORE UPDATE ON public.contact_notes FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='update_contact_purchases_updated_at' AND tgrelid='public.contact_purchases'::regclass) THEN
        CREATE TRIGGER update_contact_purchases_updated_at BEFORE UPDATE ON public.contact_purchases FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='update_contacts_updated_at' AND tgrelid='public.contacts'::regclass) THEN
        CREATE TRIGGER update_contacts_updated_at BEFORE UPDATE ON public.contacts FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='update_conversation_memory_updated_at' AND tgrelid='public.conversation_memory'::regclass) THEN
        CREATE TRIGGER update_conversation_memory_updated_at BEFORE UPDATE ON public.conversation_memory FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='update_conversation_sla_updated_at' AND tgrelid='public.conversation_sla'::regclass) THEN
        CREATE TRIGGER update_conversation_sla_updated_at BEFORE UPDATE ON public.conversation_sla FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='update_conversation_tasks_updated_at' AND tgrelid='public.conversation_tasks'::regclass) THEN
        CREATE TRIGGER update_conversation_tasks_updated_at BEFORE UPDATE ON public.conversation_tasks FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='update_email_threads_updated_at' AND tgrelid='public.email_threads'::regclass) THEN
        CREATE TRIGGER update_email_threads_updated_at BEFORE UPDATE ON public.email_threads FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='update_geo_blocking_settings_updated_at' AND tgrelid='public.geo_blocking_settings'::regclass) THEN
        CREATE TRIGGER update_geo_blocking_settings_updated_at BEFORE UPDATE ON public.geo_blocking_settings FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='update_gmail_accounts_updated_at' AND tgrelid='public.gmail_accounts'::regclass) THEN
        CREATE TRIGGER update_gmail_accounts_updated_at BEFORE UPDATE ON public.gmail_accounts FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='update_goals_configurations_updated_at' AND tgrelid='public.goals_configurations'::regclass) THEN
        CREATE TRIGGER update_goals_configurations_updated_at BEFORE UPDATE ON public.goals_configurations FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='update_kb_articles_updated_at' AND tgrelid='public.knowledge_base_articles'::regclass) THEN
        CREATE TRIGGER update_kb_articles_updated_at BEFORE UPDATE ON public.knowledge_base_articles FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='update_level_on_xp_change' AND tgrelid='public.agent_stats'::regclass) THEN
        CREATE TRIGGER update_level_on_xp_change BEFORE INSERT OR UPDATE OF xp ON public.agent_stats FOR EACH ROW EXECUTE FUNCTION update_agent_level();
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='update_message_templates_updated_at' AND tgrelid='public.message_templates'::regclass) THEN
        CREATE TRIGGER update_message_templates_updated_at BEFORE UPDATE ON public.message_templates FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='update_messages_updated_at' AND tgrelid='public.messages'::regclass) THEN
        CREATE TRIGGER update_messages_updated_at BEFORE UPDATE ON public.messages FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='update_number_reputation_updated_at' AND tgrelid='public.number_reputation'::regclass) THEN
        CREATE TRIGGER update_number_reputation_updated_at BEFORE UPDATE ON public.number_reputation FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='update_payment_links_updated_at' AND tgrelid='public.payment_links'::regclass) THEN
        CREATE TRIGGER update_payment_links_updated_at BEFORE UPDATE ON public.payment_links FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='update_pipeline_stages_updated_at' AND tgrelid='public.sales_pipeline_stages'::regclass) THEN
        CREATE TRIGGER update_pipeline_stages_updated_at BEFORE UPDATE ON public.sales_pipeline_stages FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='update_playbooks_updated_at' AND tgrelid='public.playbooks'::regclass) THEN
        CREATE TRIGGER update_playbooks_updated_at BEFORE UPDATE ON public.playbooks FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='update_products_updated_at' AND tgrelid='public.products'::regclass) THEN
        CREATE TRIGGER update_products_updated_at BEFORE UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='update_profiles_updated_at' AND tgrelid='public.profiles'::regclass) THEN
        CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='update_queue_goals_updated_at' AND tgrelid='public.queue_goals'::regclass) THEN
        CREATE TRIGGER update_queue_goals_updated_at BEFORE UPDATE ON public.queue_goals FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='update_queues_updated_at' AND tgrelid='public.queues'::regclass) THEN
        CREATE TRIGGER update_queues_updated_at BEFORE UPDATE ON public.queues FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='update_rate_limit_configs_updated_at' AND tgrelid='public.rate_limit_configs'::regclass) THEN
        CREATE TRIGGER update_rate_limit_configs_updated_at BEFORE UPDATE ON public.rate_limit_configs FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='update_sales_deals_updated_at' AND tgrelid='public.sales_deals'::regclass) THEN
        CREATE TRIGGER update_sales_deals_updated_at BEFORE UPDATE ON public.sales_deals FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='update_saved_filters_updated_at' AND tgrelid='public.saved_filters'::regclass) THEN
        CREATE TRIGGER update_saved_filters_updated_at BEFORE UPDATE ON public.saved_filters FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='update_scheduled_messages_updated_at' AND tgrelid='public.scheduled_messages'::regclass) THEN
        CREATE TRIGGER update_scheduled_messages_updated_at BEFORE UPDATE ON public.scheduled_messages FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='update_scheduled_report_configs_updated_at' AND tgrelid='public.scheduled_report_configs'::regclass) THEN
        CREATE TRIGGER update_scheduled_report_configs_updated_at BEFORE UPDATE ON public.scheduled_report_configs FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='update_scheduled_reports_updated_at' AND tgrelid='public.scheduled_reports'::regclass) THEN
        CREATE TRIGGER update_scheduled_reports_updated_at BEFORE UPDATE ON public.scheduled_reports FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='update_sla_configurations_updated_at' AND tgrelid='public.sla_configurations'::regclass) THEN
        CREATE TRIGGER update_sla_configurations_updated_at BEFORE UPDATE ON public.sla_configurations FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='update_sla_rules_updated_at' AND tgrelid='public.sla_rules'::regclass) THEN
        CREATE TRIGGER update_sla_rules_updated_at BEFORE UPDATE ON public.sla_rules FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='update_tags_updated_at' AND tgrelid='public.tags'::regclass) THEN
        CREATE TRIGGER update_tags_updated_at BEFORE UPDATE ON public.tags FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='update_talkx_campaigns_updated_at' AND tgrelid='public.talkx_campaigns'::regclass) THEN
        CREATE TRIGGER update_talkx_campaigns_updated_at BEFORE UPDATE ON public.talkx_campaigns FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='update_talkx_recipients_updated_at' AND tgrelid='public.talkx_recipients'::regclass) THEN
        CREATE TRIGGER update_talkx_recipients_updated_at BEFORE UPDATE ON public.talkx_recipients FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='update_team_conversations_updated_at' AND tgrelid='public.team_conversations'::regclass) THEN
        CREATE TRIGGER update_team_conversations_updated_at BEFORE UPDATE ON public.team_conversations FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='update_team_messages_updated_at' AND tgrelid='public.team_messages'::regclass) THEN
        CREATE TRIGGER update_team_messages_updated_at BEFORE UPDATE ON public.team_messages FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='update_user_devices_last_seen' AND tgrelid='public.user_devices'::regclass) THEN
        CREATE TRIGGER update_user_devices_last_seen BEFORE UPDATE ON public.user_devices FOR EACH ROW EXECUTE FUNCTION update_device_last_seen();
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='update_user_service_accounts_updated_at' AND tgrelid='public.user_service_accounts'::regclass) THEN
        CREATE TRIGGER update_user_service_accounts_updated_at BEFORE UPDATE ON public.user_service_accounts FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='update_user_settings_updated_at' AND tgrelid='public.user_settings'::regclass) THEN
        CREATE TRIGGER update_user_settings_updated_at BEFORE UPDATE ON public.user_settings FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='update_whatsapp_connections_updated_at' AND tgrelid='public.whatsapp_connections'::regclass) THEN
        CREATE TRIGGER update_whatsapp_connections_updated_at BEFORE UPDATE ON public.whatsapp_connections FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='update_whatsapp_flows_updated_at' AND tgrelid='public.whatsapp_flows'::regclass) THEN
        CREATE TRIGGER update_whatsapp_flows_updated_at BEFORE UPDATE ON public.whatsapp_flows FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='update_whatsapp_groups_updated_at' AND tgrelid='public.whatsapp_groups'::regclass) THEN
        CREATE TRIGGER update_whatsapp_groups_updated_at BEFORE UPDATE ON public.whatsapp_groups FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='update_whatsapp_templates_updated_at' AND tgrelid='public.whatsapp_templates'::regclass) THEN
        CREATE TRIGGER update_whatsapp_templates_updated_at BEFORE UPDATE ON public.whatsapp_templates FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
END $$;

-- ============================================================
-- 9. VIEWS
-- ============================================================
CREATE OR REPLACE VIEW public.whatsapp_connections_public AS  SELECT id,
    name,
    status,
    is_default
   FROM whatsapp_connections;
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
CREATE OR REPLACE VIEW public.whatsapp_connections_agent AS  SELECT id,
    name,
    status,
    phone_number,
    is_default
   FROM whatsapp_connections;
CREATE OR REPLACE VIEW public.profiles_public AS  SELECT id,
    user_id,
    name,
    avatar_url,
    is_active,
    department,
    job_title
   FROM profiles;
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

-- ============================================================
-- 10. RLS POLICIES
-- ============================================================
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='whatsapp_connection_queues' AND policyname='Admins can manage connection queues') THEN
        CREATE POLICY "Admins can manage connection queues" ON public.whatsapp_connection_queues AS PERMISSIVE FOR ALL TO authenticated USING (is_admin_or_supervisor(auth.uid()));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='whatsapp_connection_queues' AND policyname='Authenticated can view connection queues') THEN
        CREATE POLICY "Authenticated can view connection queues" ON public.whatsapp_connection_queues AS PERMISSIVE FOR SELECT TO authenticated USING (true);
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='messages' AND policyname='Users can insert messages') THEN
        CREATE POLICY "Users can insert messages" ON public.messages AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((agent_id IS NULL) OR (agent_id IN ( SELECT profiles.id
   FROM profiles
  WHERE (profiles.user_id = auth.uid()))) OR is_admin_or_supervisor(auth.uid())));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='messages' AND policyname='Users can update messages from their assigned contacts') THEN
        CREATE POLICY "Users can update messages from their assigned contacts" ON public.messages AS PERMISSIVE FOR UPDATE TO authenticated USING (((contact_id IN ( SELECT c.id
   FROM contacts c
  WHERE (c.assigned_to IN ( SELECT get_visible_agent_ids(auth.uid()) AS get_visible_agent_ids)))) OR is_admin_or_supervisor(auth.uid())));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='messages' AND policyname='Users can view messages from their assigned contacts') THEN
        CREATE POLICY "Users can view messages from their assigned contacts" ON public.messages AS PERMISSIVE FOR SELECT TO authenticated USING (((contact_id IN ( SELECT c.id
   FROM contacts c
  WHERE (c.assigned_to IN ( SELECT get_visible_agent_ids(auth.uid()) AS get_visible_agent_ids)))) OR is_admin_or_supervisor(auth.uid())));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='messages' AND policyname='messages_select_policy') THEN
        CREATE POLICY messages_select_policy ON public.messages AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM contacts c
  WHERE ((c.id = messages.contact_id) AND (is_admin_or_supervisor(auth.uid()) OR (c.assigned_to = get_profile_id_for_user(auth.uid())) OR (c.assigned_to IS NULL))))));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='conversation_memory' AND policyname='Agents can insert memory for their contacts') THEN
        CREATE POLICY "Agents can insert memory for their contacts" ON public.conversation_memory AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (is_contact_visible_to_user(contact_id, auth.uid()));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='conversation_memory' AND policyname='Agents can update memory for their contacts') THEN
        CREATE POLICY "Agents can update memory for their contacts" ON public.conversation_memory AS PERMISSIVE FOR UPDATE TO authenticated USING (is_contact_visible_to_user(contact_id, auth.uid()));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='conversation_memory' AND policyname='Agents or admins can view memory') THEN
        CREATE POLICY "Agents or admins can view memory" ON public.conversation_memory AS PERMISSIVE FOR SELECT TO authenticated USING ((is_contact_visible_to_user(contact_id, auth.uid()) OR is_admin_or_supervisor(auth.uid())));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='whatsapp_groups' AND policyname='Admins can manage whatsapp groups') THEN
        CREATE POLICY "Admins can manage whatsapp groups" ON public.whatsapp_groups AS PERMISSIVE FOR ALL TO authenticated USING (is_admin_or_supervisor(auth.uid())) WITH CHECK (is_admin_or_supervisor(auth.uid()));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='whatsapp_groups' AND policyname='Authenticated users can view whatsapp groups') THEN
        CREATE POLICY "Authenticated users can view whatsapp groups" ON public.whatsapp_groups AS PERMISSIVE FOR SELECT TO authenticated USING (true);
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='conversation_sla' AND policyname='Admins can insert SLA') THEN
        CREATE POLICY "Admins can insert SLA" ON public.conversation_sla AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (is_admin_or_supervisor(auth.uid()));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='conversation_sla' AND policyname='Admins can update SLA') THEN
        CREATE POLICY "Admins can update SLA" ON public.conversation_sla AS PERMISSIVE FOR UPDATE TO authenticated USING (is_admin_or_supervisor(auth.uid()));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='conversation_sla' AND policyname='Authenticated users can view SLA data') THEN
        CREATE POLICY "Authenticated users can view SLA data" ON public.conversation_sla AS PERMISSIVE FOR SELECT TO authenticated USING (((contact_id IN ( SELECT c.id
   FROM contacts c
  WHERE (c.assigned_to IN ( SELECT p.id
           FROM profiles p
          WHERE (p.user_id = auth.uid()))))) OR is_admin_or_supervisor(auth.uid())));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='performance_snapshots' AND policyname='Admins can delete performance snapshots') THEN
        CREATE POLICY "Admins can delete performance snapshots" ON public.performance_snapshots AS PERMISSIVE FOR DELETE TO authenticated USING (is_admin_or_supervisor(auth.uid()));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='performance_snapshots' AND policyname='Admins can view all performance snapshots') THEN
        CREATE POLICY "Admins can view all performance snapshots" ON public.performance_snapshots AS PERMISSIVE FOR SELECT TO authenticated USING (is_admin_or_supervisor(auth.uid()));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='performance_snapshots' AND policyname='Users can insert own performance snapshots') THEN
        CREATE POLICY "Users can insert own performance snapshots" ON public.performance_snapshots AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((profile_id = ( SELECT profiles.id
   FROM profiles
  WHERE (profiles.user_id = auth.uid())
 LIMIT 1)));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='performance_snapshots' AND policyname='Users can view own performance snapshots') THEN
        CREATE POLICY "Users can view own performance snapshots" ON public.performance_snapshots AS PERMISSIVE FOR SELECT TO authenticated USING ((profile_id = ( SELECT profiles.id
   FROM profiles
  WHERE (profiles.user_id = auth.uid())
 LIMIT 1)));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='permissions' AND policyname='Admins can manage permissions') THEN
        CREATE POLICY "Admins can manage permissions" ON public.permissions AS PERMISSIVE FOR ALL TO authenticated USING (is_admin_or_supervisor(auth.uid())) WITH CHECK (is_admin_or_supervisor(auth.uid()));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='permissions' AND policyname='Authenticated can view permissions') THEN
        CREATE POLICY "Authenticated can view permissions" ON public.permissions AS PERMISSIVE FOR SELECT TO authenticated USING (true);
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='nps_surveys' AND policyname='Admins and own agents can view NPS surveys') THEN
        CREATE POLICY "Admins and own agents can view NPS surveys" ON public.nps_surveys AS PERMISSIVE FOR SELECT TO authenticated USING ((is_admin_or_supervisor(auth.uid()) OR (agent_id = ( SELECT profiles.id
   FROM profiles
  WHERE (profiles.user_id = auth.uid())
 LIMIT 1))));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='nps_surveys' AND policyname='Admins can delete NPS surveys') THEN
        CREATE POLICY "Admins can delete NPS surveys" ON public.nps_surveys AS PERMISSIVE FOR DELETE TO authenticated USING (is_admin_or_supervisor(auth.uid()));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='nps_surveys' AND policyname='Admins can update NPS surveys') THEN
        CREATE POLICY "Admins can update NPS surveys" ON public.nps_surveys AS PERMISSIVE FOR UPDATE TO authenticated USING (is_admin_or_supervisor(auth.uid()));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='nps_surveys' AND policyname='Users can create own NPS surveys') THEN
        CREATE POLICY "Users can create own NPS surveys" ON public.nps_surveys AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((agent_id IS NOT NULL) AND (agent_id IN ( SELECT profiles.id
   FROM profiles
  WHERE (profiles.user_id = auth.uid())))));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='csat_surveys' AND policyname='Users can insert CSAT surveys') THEN
        CREATE POLICY "Users can insert CSAT surveys" ON public.csat_surveys AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((agent_id IS NULL) OR (agent_id IN ( SELECT profiles.id
   FROM profiles
  WHERE (profiles.user_id = auth.uid()))) OR is_admin_or_supervisor(auth.uid())));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='csat_surveys' AND policyname='Users can view own CSAT surveys') THEN
        CREATE POLICY "Users can view own CSAT surveys" ON public.csat_surveys AS PERMISSIVE FOR SELECT TO authenticated USING (((agent_id IN ( SELECT profiles.id
   FROM profiles
  WHERE (profiles.user_id = auth.uid()))) OR is_admin_or_supervisor(auth.uid())));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='talkx_blacklist' AND policyname='Admins can add to blacklist') THEN
        CREATE POLICY "Admins can add to blacklist" ON public.talkx_blacklist AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (is_admin_or_supervisor(auth.uid()));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='talkx_blacklist' AND policyname='Admins can remove from blacklist') THEN
        CREATE POLICY "Admins can remove from blacklist" ON public.talkx_blacklist AS PERMISSIVE FOR DELETE TO authenticated USING (is_admin_or_supervisor(auth.uid()));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='talkx_blacklist' AND policyname='Only admins can view blacklist') THEN
        CREATE POLICY "Only admins can view blacklist" ON public.talkx_blacklist AS PERMISSIVE FOR SELECT TO authenticated USING (is_admin_or_supervisor(auth.uid()));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='agent_skills' AND policyname='Admins can manage skills') THEN
        CREATE POLICY "Admins can manage skills" ON public.agent_skills AS PERMISSIVE FOR ALL TO authenticated USING (is_admin_or_supervisor(auth.uid()));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='agent_skills' AND policyname='Users can view own or admin all skills') THEN
        CREATE POLICY "Users can view own or admin all skills" ON public.agent_skills AS PERMISSIVE FOR SELECT TO authenticated USING (((profile_id IN ( SELECT profiles.id
   FROM profiles
  WHERE (profiles.user_id = auth.uid()))) OR is_admin_or_supervisor(auth.uid())));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='whatsapp_connections' AND policyname='Admin supervisor view connections') THEN
        CREATE POLICY "Admin supervisor view connections" ON public.whatsapp_connections AS PERMISSIVE FOR SELECT TO authenticated USING (is_admin_or_supervisor(auth.uid()));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='whatsapp_connections' AND policyname='Admins can delete connections') THEN
        CREATE POLICY "Admins can delete connections" ON public.whatsapp_connections AS PERMISSIVE FOR DELETE TO authenticated USING (is_admin_or_supervisor(auth.uid()));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='whatsapp_connections' AND policyname='Admins can insert connections') THEN
        CREATE POLICY "Admins can insert connections" ON public.whatsapp_connections AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (is_admin_or_supervisor(auth.uid()));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='whatsapp_connections' AND policyname='Admins can update connections') THEN
        CREATE POLICY "Admins can update connections" ON public.whatsapp_connections AS PERMISSIVE FOR UPDATE TO authenticated USING (is_admin_or_supervisor(auth.uid()));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='scheduled_reports' AND policyname='Admins can insert scheduled reports') THEN
        CREATE POLICY "Admins can insert scheduled reports" ON public.scheduled_reports AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (is_admin_or_supervisor(auth.uid()));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='scheduled_reports' AND policyname='Admins can manage scheduled reports') THEN
        CREATE POLICY "Admins can manage scheduled reports" ON public.scheduled_reports AS PERMISSIVE FOR ALL TO authenticated USING (is_admin_or_supervisor(auth.uid()));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='scheduled_reports' AND policyname='Admins can view scheduled reports') THEN
        CREATE POLICY "Admins can view scheduled reports" ON public.scheduled_reports AS PERMISSIVE FOR SELECT TO authenticated USING (is_admin_or_supervisor(auth.uid()));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='crisis_room_alerts' AND policyname='Admins can delete crisis alerts') THEN
        CREATE POLICY "Admins can delete crisis alerts" ON public.crisis_room_alerts AS PERMISSIVE FOR DELETE TO authenticated USING (is_admin_or_supervisor(auth.uid()));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='crisis_room_alerts' AND policyname='Admins can insert crisis alerts') THEN
        CREATE POLICY "Admins can insert crisis alerts" ON public.crisis_room_alerts AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (is_admin_or_supervisor(auth.uid()));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='crisis_room_alerts' AND policyname='Admins can update crisis alerts') THEN
        CREATE POLICY "Admins can update crisis alerts" ON public.crisis_room_alerts AS PERMISSIVE FOR UPDATE TO authenticated USING (is_admin_or_supervisor(auth.uid()));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='crisis_room_alerts' AND policyname='Authenticated can view crisis alerts') THEN
        CREATE POLICY "Authenticated can view crisis alerts" ON public.crisis_room_alerts AS PERMISSIVE FOR SELECT TO authenticated USING ((auth.uid() IS NOT NULL));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='whisper_messages' AND policyname='Users can delete own whisper messages') THEN
        CREATE POLICY "Users can delete own whisper messages" ON public.whisper_messages AS PERMISSIVE FOR DELETE TO authenticated USING (is_admin_or_supervisor(auth.uid()));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='whisper_messages' AND policyname='Users can insert own whisper messages') THEN
        CREATE POLICY "Users can insert own whisper messages" ON public.whisper_messages AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((sender_id IN ( SELECT profiles.id
   FROM profiles
  WHERE (profiles.user_id = auth.uid()))) OR is_admin_or_supervisor(auth.uid())));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='whisper_messages' AND policyname='Users can view own whisper messages') THEN
        CREATE POLICY "Users can view own whisper messages" ON public.whisper_messages AS PERMISSIVE FOR SELECT TO authenticated USING (((sender_id IN ( SELECT profiles.id
   FROM profiles
  WHERE (profiles.user_id = auth.uid()))) OR (target_agent_id IN ( SELECT profiles.id
   FROM profiles
  WHERE (profiles.user_id = auth.uid()))) OR is_admin_or_supervisor(auth.uid())));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='contact_purchases' AND policyname='Agents can delete purchases for assigned contacts') THEN
        CREATE POLICY "Agents can delete purchases for assigned contacts" ON public.contact_purchases AS PERMISSIVE FOR DELETE TO authenticated USING ((is_contact_visible_to_user(contact_id, auth.uid()) OR is_admin_or_supervisor(auth.uid())));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='contact_purchases' AND policyname='Agents can insert purchases for assigned contacts') THEN
        CREATE POLICY "Agents can insert purchases for assigned contacts" ON public.contact_purchases AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((is_contact_visible_to_user(contact_id, auth.uid()) OR is_admin_or_supervisor(auth.uid())));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='contact_purchases' AND policyname='Agents can update purchases for assigned contacts') THEN
        CREATE POLICY "Agents can update purchases for assigned contacts" ON public.contact_purchases AS PERMISSIVE FOR UPDATE TO authenticated USING ((is_contact_visible_to_user(contact_id, auth.uid()) OR is_admin_or_supervisor(auth.uid())));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='contact_purchases' AND policyname='Agents can view purchases for assigned contacts') THEN
        CREATE POLICY "Agents can view purchases for assigned contacts" ON public.contact_purchases AS PERMISSIVE FOR SELECT TO authenticated USING ((is_contact_visible_to_user(contact_id, auth.uid()) OR is_admin_or_supervisor(auth.uid())));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='contact_tags' AND policyname='Authenticated can delete contact tags') THEN
        CREATE POLICY "Authenticated can delete contact tags" ON public.contact_tags AS PERMISSIVE FOR DELETE TO authenticated USING (((contact_id IN ( SELECT c.id
   FROM contacts c
  WHERE (c.assigned_to IN ( SELECT profiles.id
           FROM profiles
          WHERE (profiles.user_id = auth.uid()))))) OR is_admin_or_supervisor(auth.uid())));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='contact_tags' AND policyname='Users can insert tags for assigned contacts') THEN
        CREATE POLICY "Users can insert tags for assigned contacts" ON public.contact_tags AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((contact_id IN ( SELECT c.id
   FROM contacts c
  WHERE (c.assigned_to IN ( SELECT profiles.id
           FROM profiles
          WHERE (profiles.user_id = auth.uid()))))) OR is_admin_or_supervisor(auth.uid())));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='contact_tags' AND policyname='Users can view contact tags') THEN
        CREATE POLICY "Users can view contact tags" ON public.contact_tags AS PERMISSIVE FOR SELECT TO authenticated USING (((contact_id IN ( SELECT c.id
   FROM contacts c
  WHERE (c.assigned_to IN ( SELECT p.id
           FROM profiles p
          WHERE (p.user_id = auth.uid()))))) OR is_admin_or_supervisor(auth.uid())));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='whatsapp_flows' AND policyname='Admins can manage whatsapp flows') THEN
        CREATE POLICY "Admins can manage whatsapp flows" ON public.whatsapp_flows AS PERMISSIVE FOR ALL TO authenticated USING (is_admin_or_supervisor(auth.uid())) WITH CHECK (is_admin_or_supervisor(auth.uid()));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='whatsapp_flows' AND policyname='Authenticated can view whatsapp flows') THEN
        CREATE POLICY "Authenticated can view whatsapp flows" ON public.whatsapp_flows AS PERMISSIVE FOR SELECT TO authenticated USING (true);
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='meta_capi_events' AND policyname='Admins can manage capi events') THEN
        CREATE POLICY "Admins can manage capi events" ON public.meta_capi_events AS PERMISSIVE FOR ALL TO authenticated USING (is_admin_or_supervisor(auth.uid())) WITH CHECK (is_admin_or_supervisor(auth.uid()));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='meta_capi_events' AND policyname='Admins can view capi events') THEN
        CREATE POLICY "Admins can view capi events" ON public.meta_capi_events AS PERMISSIVE FOR SELECT TO authenticated USING (is_admin_or_supervisor(auth.uid()));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='custom_emojis' AND policyname='Authenticated users can insert custom emojis') THEN
        CREATE POLICY "Authenticated users can insert custom emojis" ON public.custom_emojis AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((uploaded_by = auth.uid()));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='custom_emojis' AND policyname='Authenticated users can update custom emojis') THEN
        CREATE POLICY "Authenticated users can update custom emojis" ON public.custom_emojis AS PERMISSIVE FOR UPDATE TO authenticated USING (((uploaded_by = auth.uid()) OR is_admin_or_supervisor(auth.uid()))) WITH CHECK (((uploaded_by = auth.uid()) OR is_admin_or_supervisor(auth.uid())));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='custom_emojis' AND policyname='Authenticated users can view custom emojis') THEN
        CREATE POLICY "Authenticated users can view custom emojis" ON public.custom_emojis AS PERMISSIVE FOR SELECT TO authenticated USING (true);
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='custom_emojis' AND policyname='Users can delete own or admin custom emojis') THEN
        CREATE POLICY "Users can delete own or admin custom emojis" ON public.custom_emojis AS PERMISSIVE FOR DELETE TO authenticated USING (((uploaded_by = auth.uid()) OR is_admin_or_supervisor(auth.uid())));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='calls' AND policyname='Users can insert calls') THEN
        CREATE POLICY "Users can insert calls" ON public.calls AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((agent_id IN ( SELECT profiles.id
   FROM profiles
  WHERE (profiles.user_id = auth.uid()))) OR is_admin_or_supervisor(auth.uid())));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='calls' AND policyname='Users can update their calls') THEN
        CREATE POLICY "Users can update their calls" ON public.calls AS PERMISSIVE FOR UPDATE TO authenticated USING ((agent_id IN ( SELECT profiles.id
   FROM profiles
  WHERE (profiles.user_id = auth.uid()))));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='calls' AND policyname='Users can view own calls') THEN
        CREATE POLICY "Users can view own calls" ON public.calls AS PERMISSIVE FOR SELECT TO authenticated USING (((agent_id IN ( SELECT profiles.id
   FROM profiles
  WHERE (profiles.user_id = auth.uid()))) OR is_admin_or_supervisor(auth.uid())));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='favorite_contacts' AND policyname='Users can manage own favorites') THEN
        CREATE POLICY "Users can manage own favorites" ON public.favorite_contacts AS PERMISSIVE FOR ALL TO authenticated USING ((user_id = auth.uid()));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='followup_steps' AND policyname='Admins can manage followup steps') THEN
        CREATE POLICY "Admins can manage followup steps" ON public.followup_steps AS PERMISSIVE FOR ALL TO authenticated USING (is_admin_or_supervisor(auth.uid())) WITH CHECK (is_admin_or_supervisor(auth.uid()));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='followup_steps' AND policyname='Admins can view followup steps') THEN
        CREATE POLICY "Admins can view followup steps" ON public.followup_steps AS PERMISSIVE FOR SELECT TO authenticated USING (is_admin_or_supervisor(auth.uid()));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='geo_blocking_settings' AND policyname='Admins can manage geo settings') THEN
        CREATE POLICY "Admins can manage geo settings" ON public.geo_blocking_settings AS PERMISSIVE FOR ALL TO authenticated USING (is_admin_or_supervisor(auth.uid())) WITH CHECK (is_admin_or_supervisor(auth.uid()));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='geo_blocking_settings' AND policyname='Geo blocking visible to admins only') THEN
        CREATE POLICY "Geo blocking visible to admins only" ON public.geo_blocking_settings AS PERMISSIVE FOR SELECT TO authenticated USING (is_admin_or_supervisor(auth.uid()));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='mfa_sessions' AND policyname='Users can manage own MFA sessions') THEN
        CREATE POLICY "Users can manage own MFA sessions" ON public.mfa_sessions AS PERMISSIVE FOR ALL TO authenticated USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='pinned_conversations' AND policyname='Users can manage own pins') THEN
        CREATE POLICY "Users can manage own pins" ON public.pinned_conversations AS PERMISSIVE FOR ALL TO authenticated USING ((pinned_by IN ( SELECT profiles.id
   FROM profiles
  WHERE (profiles.user_id = auth.uid()))));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='playbooks' AND policyname='Admins can delete playbooks') THEN
        CREATE POLICY "Admins can delete playbooks" ON public.playbooks AS PERMISSIVE FOR DELETE TO authenticated USING (is_admin_or_supervisor(auth.uid()));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='playbooks' AND policyname='Admins can manage playbooks') THEN
        CREATE POLICY "Admins can manage playbooks" ON public.playbooks AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (is_admin_or_supervisor(auth.uid()));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='playbooks' AND policyname='Admins can update playbooks') THEN
        CREATE POLICY "Admins can update playbooks" ON public.playbooks AS PERMISSIVE FOR UPDATE TO authenticated USING (is_admin_or_supervisor(auth.uid()));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='playbooks' AND policyname='Authenticated can view playbooks') THEN
        CREATE POLICY "Authenticated can view playbooks" ON public.playbooks AS PERMISSIVE FOR SELECT TO authenticated USING (true);
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='email_threads' AND policyname='Users can delete threads of own accounts') THEN
        CREATE POLICY "Users can delete threads of own accounts" ON public.email_threads AS PERMISSIVE FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1
   FROM gmail_accounts ga
  WHERE ((ga.id = email_threads.gmail_account_id) AND (ga.user_id = auth.uid())))));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='email_threads' AND policyname='Users can insert threads for own accounts') THEN
        CREATE POLICY "Users can insert threads for own accounts" ON public.email_threads AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM gmail_accounts ga
  WHERE ((ga.id = email_threads.gmail_account_id) AND (ga.user_id = auth.uid())))));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='email_threads' AND policyname='Users can update threads of own accounts') THEN
        CREATE POLICY "Users can update threads of own accounts" ON public.email_threads AS PERMISSIVE FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM gmail_accounts ga
  WHERE ((ga.id = email_threads.gmail_account_id) AND ((ga.user_id = auth.uid()) OR is_admin_or_supervisor(auth.uid()))))));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='email_threads' AND policyname='Users can view threads of own accounts') THEN
        CREATE POLICY "Users can view threads of own accounts" ON public.email_threads AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM gmail_accounts ga
  WHERE ((ga.id = email_threads.gmail_account_id) AND ((ga.user_id = auth.uid()) OR is_admin_or_supervisor(auth.uid()))))));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='entity_versions' AND policyname='Admins can view entity versions') THEN
        CREATE POLICY "Admins can view entity versions" ON public.entity_versions AS PERMISSIVE FOR SELECT TO authenticated USING (is_admin_or_supervisor(auth.uid()));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='entity_versions' AND policyname='Block authenticated version inserts') THEN
        CREATE POLICY "Block authenticated version inserts" ON public.entity_versions AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (false);
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='global_settings' AND policyname='Admins can manage global settings') THEN
        CREATE POLICY "Admins can manage global settings" ON public.global_settings AS PERMISSIVE FOR ALL TO authenticated USING (is_admin_or_supervisor(auth.uid()));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='global_settings' AND policyname='Admins can view global settings') THEN
        CREATE POLICY "Admins can view global settings" ON public.global_settings AS PERMISSIVE FOR SELECT TO authenticated USING (is_admin_or_supervisor(auth.uid()));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='conversation_events' AND policyname='Agents or admins can view conversation events') THEN
        CREATE POLICY "Agents or admins can view conversation events" ON public.conversation_events AS PERMISSIVE FOR SELECT TO authenticated USING ((is_contact_visible_to_user(contact_id, auth.uid()) OR is_admin_or_supervisor(auth.uid())));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='conversation_events' AND policyname='Authorized users can insert events') THEN
        CREATE POLICY "Authorized users can insert events" ON public.conversation_events AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((((performed_by IS NULL) OR (performed_by = ( SELECT p.id
   FROM profiles p
  WHERE (p.user_id = auth.uid())
 LIMIT 1))) AND (is_admin_or_supervisor(auth.uid()) OR (contact_id IN ( SELECT c.id
   FROM contacts c
  WHERE (c.assigned_to = ( SELECT p.id
           FROM profiles p
          WHERE (p.user_id = auth.uid())
         LIMIT 1)))))));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='scheduled_messages' AND policyname='Users can create scheduled messages') THEN
        CREATE POLICY "Users can create scheduled messages" ON public.scheduled_messages AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((created_by IN ( SELECT profiles.id
   FROM profiles
  WHERE (profiles.user_id = auth.uid()))) OR is_admin_or_supervisor(auth.uid())));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='scheduled_messages' AND policyname='Users can delete their scheduled messages') THEN
        CREATE POLICY "Users can delete their scheduled messages" ON public.scheduled_messages AS PERMISSIVE FOR DELETE TO authenticated USING (((created_by IN ( SELECT profiles.id
   FROM profiles
  WHERE (profiles.user_id = auth.uid()))) OR is_admin_or_supervisor(auth.uid())));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='scheduled_messages' AND policyname='Users can update their scheduled messages') THEN
        CREATE POLICY "Users can update their scheduled messages" ON public.scheduled_messages AS PERMISSIVE FOR UPDATE TO authenticated USING (((created_by IN ( SELECT profiles.id
   FROM profiles
  WHERE (profiles.user_id = auth.uid()))) OR is_admin_or_supervisor(auth.uid())));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='scheduled_messages' AND policyname='Users can view their scheduled messages') THEN
        CREATE POLICY "Users can view their scheduled messages" ON public.scheduled_messages AS PERMISSIVE FOR SELECT TO authenticated USING (((created_by IN ( SELECT profiles.id
   FROM profiles
  WHERE (profiles.user_id = auth.uid()))) OR is_admin_or_supervisor(auth.uid())));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='scheduled_report_configs' AND policyname='Admin/supervisor can delete report configs') THEN
        CREATE POLICY "Admin/supervisor can delete report configs" ON public.scheduled_report_configs AS PERMISSIVE FOR DELETE TO authenticated USING (is_admin_or_supervisor(auth.uid()));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='scheduled_report_configs' AND policyname='Admin/supervisor can insert report configs') THEN
        CREATE POLICY "Admin/supervisor can insert report configs" ON public.scheduled_report_configs AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (is_admin_or_supervisor(auth.uid()));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='scheduled_report_configs' AND policyname='Admin/supervisor can update report configs') THEN
        CREATE POLICY "Admin/supervisor can update report configs" ON public.scheduled_report_configs AS PERMISSIVE FOR UPDATE TO authenticated USING (is_admin_or_supervisor(auth.uid())) WITH CHECK (is_admin_or_supervisor(auth.uid()));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='scheduled_report_configs' AND policyname='Admins can read report configs') THEN
        CREATE POLICY "Admins can read report configs" ON public.scheduled_report_configs AS PERMISSIVE FOR SELECT TO authenticated USING (is_admin_or_supervisor(auth.uid()));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='webauthn_challenges' AND policyname='Block anon access to webauthn challenges') THEN
        CREATE POLICY "Block anon access to webauthn challenges" ON public.webauthn_challenges AS PERMISSIVE FOR ALL TO anon USING (false) WITH CHECK (false);
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='webauthn_challenges' AND policyname='Users can manage own challenges') THEN
        CREATE POLICY "Users can manage own challenges" ON public.webauthn_challenges AS PERMISSIVE FOR ALL TO authenticated USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='webhook_rate_limits' AND policyname='Admins can delete rate limits') THEN
        CREATE POLICY "Admins can delete rate limits" ON public.webhook_rate_limits AS PERMISSIVE FOR DELETE TO authenticated USING (is_admin_or_supervisor(auth.uid()));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='webhook_rate_limits' AND policyname='Admins can insert rate limits') THEN
        CREATE POLICY "Admins can insert rate limits" ON public.webhook_rate_limits AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (is_admin_or_supervisor(auth.uid()));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='webhook_rate_limits' AND policyname='Admins can update rate limits') THEN
        CREATE POLICY "Admins can update rate limits" ON public.webhook_rate_limits AS PERMISSIVE FOR UPDATE TO authenticated USING (is_admin_or_supervisor(auth.uid()));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='webhook_rate_limits' AND policyname='Admins can view rate limits') THEN
        CREATE POLICY "Admins can view rate limits" ON public.webhook_rate_limits AS PERMISSIVE FOR SELECT TO authenticated USING (is_admin_or_supervisor(auth.uid()));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='sales_pipeline_stages' AND policyname='Admins can manage pipeline stages') THEN
        CREATE POLICY "Admins can manage pipeline stages" ON public.sales_pipeline_stages AS PERMISSIVE FOR ALL TO authenticated USING (is_admin_or_supervisor(auth.uid())) WITH CHECK (is_admin_or_supervisor(auth.uid()));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='sales_pipeline_stages' AND policyname='Authenticated can view pipeline stages') THEN
        CREATE POLICY "Authenticated can view pipeline stages" ON public.sales_pipeline_stages AS PERMISSIVE FOR SELECT TO authenticated USING (true);
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='contact_custom_fields' AND policyname='Authenticated can delete own custom fields') THEN
        CREATE POLICY "Authenticated can delete own custom fields" ON public.contact_custom_fields AS PERMISSIVE FOR DELETE TO authenticated USING (((contact_id IN ( SELECT c.id
   FROM contacts c
  WHERE (c.assigned_to IN ( SELECT profiles.id
           FROM profiles
          WHERE (profiles.user_id = auth.uid()))))) OR is_admin_or_supervisor(auth.uid())));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='contact_custom_fields' AND policyname='Authenticated can update own custom fields') THEN
        CREATE POLICY "Authenticated can update own custom fields" ON public.contact_custom_fields AS PERMISSIVE FOR UPDATE TO authenticated USING (((contact_id IN ( SELECT c.id
   FROM contacts c
  WHERE (c.assigned_to IN ( SELECT profiles.id
           FROM profiles
          WHERE (profiles.user_id = auth.uid()))))) OR is_admin_or_supervisor(auth.uid())));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='contact_custom_fields' AND policyname='Authenticated can view custom fields') THEN
        CREATE POLICY "Authenticated can view custom fields" ON public.contact_custom_fields AS PERMISSIVE FOR SELECT TO authenticated USING (((contact_id IN ( SELECT c.id
   FROM contacts c
  WHERE (c.assigned_to IN ( SELECT p.id
           FROM profiles p
          WHERE (p.user_id = auth.uid()))))) OR is_admin_or_supervisor(auth.uid())));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='contact_custom_fields' AND policyname='Users can insert custom fields for assigned contacts') THEN
        CREATE POLICY "Users can insert custom fields for assigned contacts" ON public.contact_custom_fields AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((contact_id IN ( SELECT c.id
   FROM contacts c
  WHERE (c.assigned_to IN ( SELECT profiles.id
           FROM profiles
          WHERE (profiles.user_id = auth.uid()))))) OR is_admin_or_supervisor(auth.uid())));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='campaign_contacts' AND policyname='Admins can insert campaign contacts') THEN
        CREATE POLICY "Admins can insert campaign contacts" ON public.campaign_contacts AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (is_admin_or_supervisor(auth.uid()));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='campaign_contacts' AND policyname='Admins can manage campaign contacts') THEN
        CREATE POLICY "Admins can manage campaign contacts" ON public.campaign_contacts AS PERMISSIVE FOR ALL TO authenticated USING (is_admin_or_supervisor(auth.uid()));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='campaign_contacts' AND policyname='Admins can view campaign contacts') THEN
        CREATE POLICY "Admins can view campaign contacts" ON public.campaign_contacts AS PERMISSIVE FOR SELECT TO authenticated USING (is_admin_or_supervisor(auth.uid()));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='campaigns' AND policyname='Admins can insert campaigns') THEN
        CREATE POLICY "Admins can insert campaigns" ON public.campaigns AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (is_admin_or_supervisor(auth.uid()));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='campaigns' AND policyname='Admins can manage campaigns') THEN
        CREATE POLICY "Admins can manage campaigns" ON public.campaigns AS PERMISSIVE FOR ALL TO authenticated USING (is_admin_or_supervisor(auth.uid()));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='campaigns' AND policyname='Campaigns visible to admins or creator') THEN
        CREATE POLICY "Campaigns visible to admins or creator" ON public.campaigns AS PERMISSIVE FOR SELECT TO authenticated USING ((is_admin_or_supervisor(auth.uid()) OR (created_by = ( SELECT profiles.id
   FROM profiles
  WHERE (profiles.user_id = auth.uid())
 LIMIT 1))));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='contact_notes' AND policyname='Authenticated users can insert notes') THEN
        CREATE POLICY "Authenticated users can insert notes" ON public.contact_notes AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((author_id IN ( SELECT profiles.id
   FROM profiles
  WHERE (profiles.user_id = auth.uid()))));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='contact_notes' AND policyname='Users can delete their own notes') THEN
        CREATE POLICY "Users can delete their own notes" ON public.contact_notes AS PERMISSIVE FOR DELETE TO authenticated USING ((author_id IN ( SELECT profiles.id
   FROM profiles
  WHERE (profiles.user_id = auth.uid()))));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='contact_notes' AND policyname='Users can update their own notes') THEN
        CREATE POLICY "Users can update their own notes" ON public.contact_notes AS PERMISSIVE FOR UPDATE TO authenticated USING ((author_id IN ( SELECT profiles.id
   FROM profiles
  WHERE (profiles.user_id = auth.uid()))));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='contact_notes' AND policyname='Users can view notes on accessible contacts') THEN
        CREATE POLICY "Users can view notes on accessible contacts" ON public.contact_notes AS PERMISSIVE FOR SELECT TO authenticated USING (((contact_id IN ( SELECT c.id
   FROM contacts c
  WHERE (c.assigned_to IN ( SELECT profiles.id
           FROM profiles
          WHERE (profiles.user_id = auth.uid()))))) OR is_admin_or_supervisor(auth.uid())));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='agent_achievements' AND policyname='Users can insert own achievements') THEN
        CREATE POLICY "Users can insert own achievements" ON public.agent_achievements AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((profile_id IN ( SELECT profiles.id
   FROM profiles
  WHERE (profiles.user_id = auth.uid()))) OR is_admin_or_supervisor(auth.uid())));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='agent_achievements' AND policyname='Users can view own or admin all achievements') THEN
        CREATE POLICY "Users can view own or admin all achievements" ON public.agent_achievements AS PERMISSIVE FOR SELECT TO authenticated USING (((profile_id IN ( SELECT profiles.id
   FROM profiles
  WHERE (profiles.user_id = auth.uid()))) OR is_admin_or_supervisor(auth.uid())));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='team_conversation_members' AND policyname='Admins can update conversation members') THEN
        CREATE POLICY "Admins can update conversation members" ON public.team_conversation_members AS PERMISSIVE FOR UPDATE TO authenticated USING (is_admin_or_supervisor(auth.uid()));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='team_conversation_members' AND policyname='Members and admins can add conversation members') THEN
        CREATE POLICY "Members and admins can add conversation members" ON public.team_conversation_members AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((is_team_conversation_member(auth.uid(), conversation_id) OR is_admin_or_supervisor(auth.uid())));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='team_conversation_members' AND policyname='Members and admins can view conversation members') THEN
        CREATE POLICY "Members and admins can view conversation members" ON public.team_conversation_members AS PERMISSIVE FOR SELECT TO authenticated USING ((is_team_conversation_member(auth.uid(), conversation_id) OR is_admin_or_supervisor(auth.uid())));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='team_conversation_members' AND policyname='Members can leave or admins can remove') THEN
        CREATE POLICY "Members can leave or admins can remove" ON public.team_conversation_members AS PERMISSIVE FOR DELETE TO authenticated USING (((profile_id = ( SELECT profiles.id
   FROM profiles
  WHERE (profiles.user_id = auth.uid())
 LIMIT 1)) OR is_admin_or_supervisor(auth.uid())));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='message_reactions' AND policyname='Users can delete their own reactions') THEN
        CREATE POLICY "Users can delete their own reactions" ON public.message_reactions AS PERMISSIVE FOR DELETE TO authenticated USING ((user_id IN ( SELECT profiles.id
   FROM profiles
  WHERE (profiles.user_id = auth.uid()))));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='message_reactions' AND policyname='Users can insert reactions for assigned contacts') THEN
        CREATE POLICY "Users can insert reactions for assigned contacts" ON public.message_reactions AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((contact_id IN ( SELECT c.id
   FROM contacts c
  WHERE (c.assigned_to IN ( SELECT p.id
           FROM profiles p
          WHERE (p.user_id = auth.uid()))))) OR is_admin_or_supervisor(auth.uid())));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='message_reactions' AND policyname='Users can view reactions on accessible messages') THEN
        CREATE POLICY "Users can view reactions on accessible messages" ON public.message_reactions AS PERMISSIVE FOR SELECT TO authenticated USING (((message_id IN ( SELECT m.id
   FROM messages m
  WHERE (m.contact_id IN ( SELECT c.id
           FROM contacts c
          WHERE ((c.assigned_to IN ( SELECT p.id
                   FROM profiles p
                  WHERE (p.user_id = auth.uid()))) OR (c.assigned_to IS NULL)))))) OR is_admin_or_supervisor(auth.uid())));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='message_reactions' AND policyname='message_reactions_delete_policy') THEN
        CREATE POLICY message_reactions_delete_policy ON public.message_reactions AS PERMISSIVE FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1
   FROM (messages m
     JOIN contacts c ON ((c.id = m.contact_id)))
  WHERE ((m.id = message_reactions.message_id) AND (is_admin_or_supervisor(auth.uid()) OR (c.assigned_to = get_profile_id_for_user(auth.uid())) OR (c.assigned_to IS NULL))))));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='message_reactions' AND policyname='message_reactions_insert_policy') THEN
        CREATE POLICY message_reactions_insert_policy ON public.message_reactions AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM (messages m
     JOIN contacts c ON ((c.id = m.contact_id)))
  WHERE ((m.id = message_reactions.message_id) AND (is_admin_or_supervisor(auth.uid()) OR (c.assigned_to = get_profile_id_for_user(auth.uid())) OR (c.assigned_to IS NULL))))));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='message_reactions' AND policyname='message_reactions_select_policy') THEN
        CREATE POLICY message_reactions_select_policy ON public.message_reactions AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM (messages m
     JOIN contacts c ON ((c.id = m.contact_id)))
  WHERE ((m.id = message_reactions.message_id) AND (is_admin_or_supervisor(auth.uid()) OR (c.assigned_to = get_profile_id_for_user(auth.uid())) OR (c.assigned_to IS NULL))))));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='message_reactions' AND policyname='message_reactions_update_policy') THEN
        CREATE POLICY message_reactions_update_policy ON public.message_reactions AS PERMISSIVE FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM (messages m
     JOIN contacts c ON ((c.id = m.contact_id)))
  WHERE ((m.id = message_reactions.message_id) AND (is_admin_or_supervisor(auth.uid()) OR (c.assigned_to = get_profile_id_for_user(auth.uid())) OR (c.assigned_to IS NULL))))));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='message_templates' AND policyname='Users can create their own templates') THEN
        CREATE POLICY "Users can create their own templates" ON public.message_templates AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((user_id = auth.uid()));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='message_templates' AND policyname='Users can delete their own templates') THEN
        CREATE POLICY "Users can delete their own templates" ON public.message_templates AS PERMISSIVE FOR DELETE TO authenticated USING ((user_id = auth.uid()));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='message_templates' AND policyname='Users can update their own templates') THEN
        CREATE POLICY "Users can update their own templates" ON public.message_templates AS PERMISSIVE FOR UPDATE TO authenticated USING ((user_id = auth.uid()));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='message_templates' AND policyname='Users can view their templates and global ones') THEN
        CREATE POLICY "Users can view their templates and global ones" ON public.message_templates AS PERMISSIVE FOR SELECT TO authenticated USING (((user_id = auth.uid()) OR (is_global = true)));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='ai_conversation_tags' AND policyname='Admins can delete ai tags') THEN
        CREATE POLICY "Admins can delete ai tags" ON public.ai_conversation_tags AS PERMISSIVE FOR DELETE TO authenticated USING (is_admin_or_supervisor(auth.uid()));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='ai_conversation_tags' AND policyname='Admins can update ai tags') THEN
        CREATE POLICY "Admins can update ai tags" ON public.ai_conversation_tags AS PERMISSIVE FOR UPDATE TO authenticated USING (is_admin_or_supervisor(auth.uid()));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='ai_conversation_tags' AND policyname='Agents can delete tags on assigned contacts') THEN
        CREATE POLICY "Agents can delete tags on assigned contacts" ON public.ai_conversation_tags AS PERMISSIVE FOR DELETE TO authenticated USING (((EXISTS ( SELECT 1
   FROM (contacts c
     JOIN profiles p ON ((p.id = c.assigned_to)))
  WHERE ((c.id = ai_conversation_tags.contact_id) AND (p.user_id = auth.uid())))) OR is_admin_or_supervisor(auth.uid())));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='ai_conversation_tags' AND policyname='Authenticated can view ai tags') THEN
        CREATE POLICY "Authenticated can view ai tags" ON public.ai_conversation_tags AS PERMISSIVE FOR SELECT TO authenticated USING (((contact_id IN ( SELECT c.id
   FROM contacts c
  WHERE (c.assigned_to IN ( SELECT p.id
           FROM profiles p
          WHERE (p.user_id = auth.uid()))))) OR is_admin_or_supervisor(auth.uid())));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='ai_conversation_tags' AND policyname='Users can insert ai tags for assigned contacts') THEN
        CREATE POLICY "Users can insert ai tags for assigned contacts" ON public.ai_conversation_tags AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((contact_id IN ( SELECT c.id
   FROM contacts c
  WHERE (c.assigned_to IN ( SELECT profiles.id
           FROM profiles
          WHERE (profiles.user_id = auth.uid()))))) OR is_admin_or_supervisor(auth.uid())));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='goals_configurations' AND policyname='Users can manage their own goals') THEN
        CREATE POLICY "Users can manage their own goals" ON public.goals_configurations AS PERMISSIVE FOR ALL TO authenticated USING (((profile_id IN ( SELECT profiles.id
   FROM profiles
  WHERE (profiles.user_id = auth.uid()))) OR is_admin_or_supervisor(auth.uid()))) WITH CHECK (((profile_id IN ( SELECT profiles.id
   FROM profiles
  WHERE (profiles.user_id = auth.uid()))) OR is_admin_or_supervisor(auth.uid())));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='goals_configurations' AND policyname='Users can view their own goals') THEN
        CREATE POLICY "Users can view their own goals" ON public.goals_configurations AS PERMISSIVE FOR SELECT TO authenticated USING (((profile_id IN ( SELECT profiles.id
   FROM profiles
  WHERE (profiles.user_id = auth.uid()))) OR is_admin_or_supervisor(auth.uid())));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='ip_whitelist' AND policyname='Admins can manage IP whitelist') THEN
        CREATE POLICY "Admins can manage IP whitelist" ON public.ip_whitelist AS PERMISSIVE FOR ALL TO authenticated USING (is_admin_or_supervisor(auth.uid())) WITH CHECK (is_admin_or_supervisor(auth.uid()));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='ip_whitelist' AND policyname='Admins can view IP whitelist') THEN
        CREATE POLICY "Admins can view IP whitelist" ON public.ip_whitelist AS PERMISSIVE FOR SELECT TO authenticated USING (is_admin_or_supervisor(auth.uid()));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='knowledge_base_articles' AND policyname='Admins can manage knowledge base') THEN
        CREATE POLICY "Admins can manage knowledge base" ON public.knowledge_base_articles AS PERMISSIVE FOR ALL TO authenticated USING (is_admin_or_supervisor(auth.uid())) WITH CHECK (is_admin_or_supervisor(auth.uid()));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='knowledge_base_articles' AND policyname='Authenticated can view knowledge base') THEN
        CREATE POLICY "Authenticated can view knowledge base" ON public.knowledge_base_articles AS PERMISSIVE FOR SELECT TO authenticated USING (((is_published = true) OR is_admin_or_supervisor(auth.uid())));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='notifications' AND policyname='Block authenticated notification inserts') THEN
        CREATE POLICY "Block authenticated notification inserts" ON public.notifications AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (false);
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='notifications' AND policyname='Users can delete own notifications') THEN
        CREATE POLICY "Users can delete own notifications" ON public.notifications AS PERMISSIVE FOR DELETE TO authenticated USING ((user_id = auth.uid()));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='notifications' AND policyname='Users can update own notifications') THEN
        CREATE POLICY "Users can update own notifications" ON public.notifications AS PERMISSIVE FOR UPDATE TO authenticated USING ((user_id = auth.uid()));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='notifications' AND policyname='Users can view own notifications') THEN
        CREATE POLICY "Users can view own notifications" ON public.notifications AS PERMISSIVE FOR SELECT TO authenticated USING ((user_id = auth.uid()));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='queue_goals' AND policyname='Admins can manage queue goals') THEN
        CREATE POLICY "Admins can manage queue goals" ON public.queue_goals AS PERMISSIVE FOR ALL TO authenticated USING (is_admin_or_supervisor(auth.uid())) WITH CHECK (is_admin_or_supervisor(auth.uid()));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='queue_goals' AND policyname='Authenticated users can view queue goals') THEN
        CREATE POLICY "Authenticated users can view queue goals" ON public.queue_goals AS PERMISSIVE FOR SELECT TO authenticated USING (true);
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='queue_members' AND policyname='Admins can manage queue members') THEN
        CREATE POLICY "Admins can manage queue members" ON public.queue_members AS PERMISSIVE FOR ALL TO authenticated USING (is_admin_or_supervisor(auth.uid())) WITH CHECK (is_admin_or_supervisor(auth.uid()));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='queue_members' AND policyname='Queue members visible to admins or self') THEN
        CREATE POLICY "Queue members visible to admins or self" ON public.queue_members AS PERMISSIVE FOR SELECT TO authenticated USING ((is_admin_or_supervisor(auth.uid()) OR (profile_id = ( SELECT profiles.id
   FROM profiles
  WHERE (profiles.user_id = auth.uid())
 LIMIT 1))));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='queue_positions' AND policyname='Admins can manage queue positions') THEN
        CREATE POLICY "Admins can manage queue positions" ON public.queue_positions AS PERMISSIVE FOR ALL TO authenticated USING (is_admin_or_supervisor(auth.uid())) WITH CHECK (is_admin_or_supervisor(auth.uid()));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='queue_positions' AND policyname='Users can view queue positions') THEN
        CREATE POLICY "Users can view queue positions" ON public.queue_positions AS PERMISSIVE FOR SELECT TO authenticated USING (((contact_id IN ( SELECT c.id
   FROM contacts c
  WHERE (c.assigned_to IN ( SELECT p.id
           FROM profiles p
          WHERE (p.user_id = auth.uid()))))) OR is_admin_or_supervisor(auth.uid())));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='queue_skill_requirements' AND policyname='Admins can manage queue skills') THEN
        CREATE POLICY "Admins can manage queue skills" ON public.queue_skill_requirements AS PERMISSIVE FOR ALL TO authenticated USING (is_admin_or_supervisor(auth.uid()));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='queue_skill_requirements' AND policyname='Authenticated can view queue skills') THEN
        CREATE POLICY "Authenticated can view queue skills" ON public.queue_skill_requirements AS PERMISSIVE FOR SELECT TO authenticated USING (true);
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='conversation_closures' AND policyname='Agents can create closures for their contacts') THEN
        CREATE POLICY "Agents can create closures for their contacts" ON public.conversation_closures AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (is_contact_visible_to_user(contact_id, auth.uid()));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='conversation_closures' AND policyname='Agents or admins can view closures') THEN
        CREATE POLICY "Agents or admins can view closures" ON public.conversation_closures AS PERMISSIVE FOR SELECT TO authenticated USING ((is_contact_visible_to_user(contact_id, auth.uid()) OR is_admin_or_supervisor(auth.uid())));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='automations' AND policyname='Admin/supervisor can create automations') THEN
        CREATE POLICY "Admin/supervisor can create automations" ON public.automations AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (is_admin_or_supervisor(auth.uid()));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='automations' AND policyname='Admin/supervisor can delete automations') THEN
        CREATE POLICY "Admin/supervisor can delete automations" ON public.automations AS PERMISSIVE FOR DELETE TO authenticated USING (is_admin_or_supervisor(auth.uid()));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='automations' AND policyname='Admin/supervisor can update automations') THEN
        CREATE POLICY "Admin/supervisor can update automations" ON public.automations AS PERMISSIVE FOR UPDATE TO authenticated USING (is_admin_or_supervisor(auth.uid())) WITH CHECK (is_admin_or_supervisor(auth.uid()));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='automations' AND policyname='Automations visible to admins only') THEN
        CREATE POLICY "Automations visible to admins only" ON public.automations AS PERMISSIVE FOR SELECT TO authenticated USING (is_admin_or_supervisor(auth.uid()));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='voice_command_logs' AND policyname='Users can insert own voice logs') THEN
        CREATE POLICY "Users can insert own voice logs" ON public.voice_command_logs AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((auth.uid() = user_id));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='voice_command_logs' AND policyname='Users can read own voice logs') THEN
        CREATE POLICY "Users can read own voice logs" ON public.voice_command_logs AS PERMISSIVE FOR SELECT TO authenticated USING ((auth.uid() = user_id));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='campaign_ab_variants' AND policyname='Authenticated can view AB variants') THEN
        CREATE POLICY "Authenticated can view AB variants" ON public.campaign_ab_variants AS PERMISSIVE FOR SELECT TO authenticated USING ((auth.uid() IS NOT NULL));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='campaign_ab_variants' AND policyname='Campaign owners or admins can delete AB variants') THEN
        CREATE POLICY "Campaign owners or admins can delete AB variants" ON public.campaign_ab_variants AS PERMISSIVE FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1
   FROM campaigns c
  WHERE ((c.id = campaign_ab_variants.campaign_id) AND ((c.created_by = get_profile_id_for_user(auth.uid())) OR is_admin_or_supervisor(auth.uid()))))));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='campaign_ab_variants' AND policyname='Campaign owners or admins can insert AB variants') THEN
        CREATE POLICY "Campaign owners or admins can insert AB variants" ON public.campaign_ab_variants AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM campaigns c
  WHERE ((c.id = campaign_ab_variants.campaign_id) AND ((c.created_by = get_profile_id_for_user(auth.uid())) OR is_admin_or_supervisor(auth.uid()))))));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='campaign_ab_variants' AND policyname='Campaign owners or admins can update AB variants') THEN
        CREATE POLICY "Campaign owners or admins can update AB variants" ON public.campaign_ab_variants AS PERMISSIVE FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM campaigns c
  WHERE ((c.id = campaign_ab_variants.campaign_id) AND ((c.created_by = get_profile_id_for_user(auth.uid())) OR is_admin_or_supervisor(auth.uid()))))));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='conversation_tasks' AND policyname='Agents can create tasks for their contacts') THEN
        CREATE POLICY "Agents can create tasks for their contacts" ON public.conversation_tasks AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (is_contact_visible_to_user(contact_id, auth.uid()));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='conversation_tasks' AND policyname='Agents can update own or assigned tasks') THEN
        CREATE POLICY "Agents can update own or assigned tasks" ON public.conversation_tasks AS PERMISSIVE FOR UPDATE TO authenticated USING (((assigned_to = get_profile_id_for_user(auth.uid())) OR (created_by = get_profile_id_for_user(auth.uid())) OR is_admin_or_supervisor(auth.uid())));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='conversation_tasks' AND policyname='Agents or admins can view tasks') THEN
        CREATE POLICY "Agents or admins can view tasks" ON public.conversation_tasks AS PERMISSIVE FOR SELECT TO authenticated USING ((is_contact_visible_to_user(contact_id, auth.uid()) OR (assigned_to = get_profile_id_for_user(auth.uid())) OR (created_by = get_profile_id_for_user(auth.uid())) OR is_admin_or_supervisor(auth.uid())));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='conversation_tasks' AND policyname='Creators or admins can delete tasks') THEN
        CREATE POLICY "Creators or admins can delete tasks" ON public.conversation_tasks AS PERMISSIVE FOR DELETE TO authenticated USING (((created_by = get_profile_id_for_user(auth.uid())) OR is_admin_or_supervisor(auth.uid())));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='channel_connections' AND policyname='Admins full access to channels') THEN
        CREATE POLICY "Admins full access to channels" ON public.channel_connections AS PERMISSIVE FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='csat_auto_config' AND policyname='Admins can manage csat config') THEN
        CREATE POLICY "Admins can manage csat config" ON public.csat_auto_config AS PERMISSIVE FOR ALL TO authenticated USING (is_admin_or_supervisor(auth.uid()));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='csat_auto_config' AND policyname='Authenticated can view csat config') THEN
        CREATE POLICY "Authenticated can view csat config" ON public.csat_auto_config AS PERMISSIVE FOR SELECT TO authenticated USING (true);
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='followup_executions' AND policyname='Admins can manage followup executions') THEN
        CREATE POLICY "Admins can manage followup executions" ON public.followup_executions AS PERMISSIVE FOR ALL TO authenticated USING (is_admin_or_supervisor(auth.uid())) WITH CHECK (is_admin_or_supervisor(auth.uid()));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='followup_executions' AND policyname='Authenticated can view followup executions') THEN
        CREATE POLICY "Authenticated can view followup executions" ON public.followup_executions AS PERMISSIVE FOR SELECT TO authenticated USING (((contact_id IN ( SELECT c.id
   FROM contacts c
  WHERE (c.assigned_to IN ( SELECT p.id
           FROM profiles p
          WHERE (p.user_id = auth.uid()))))) OR is_admin_or_supervisor(auth.uid())));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='followup_sequences' AND policyname='Admins can manage followup sequences') THEN
        CREATE POLICY "Admins can manage followup sequences" ON public.followup_sequences AS PERMISSIVE FOR ALL TO authenticated USING (is_admin_or_supervisor(auth.uid())) WITH CHECK (is_admin_or_supervisor(auth.uid()));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='followup_sequences' AND policyname='Admins can view followup sequences') THEN
        CREATE POLICY "Admins can view followup sequences" ON public.followup_sequences AS PERMISSIVE FOR SELECT TO authenticated USING (is_admin_or_supervisor(auth.uid()));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='whatsapp_templates' AND policyname='Admins can insert templates') THEN
        CREATE POLICY "Admins can insert templates" ON public.whatsapp_templates AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (is_admin_or_supervisor(auth.uid()));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='whatsapp_templates' AND policyname='Admins can manage templates') THEN
        CREATE POLICY "Admins can manage templates" ON public.whatsapp_templates AS PERMISSIVE FOR ALL TO authenticated USING (is_admin_or_supervisor(auth.uid()));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='whatsapp_templates' AND policyname='Authenticated users can view templates') THEN
        CREATE POLICY "Authenticated users can view templates" ON public.whatsapp_templates AS PERMISSIVE FOR SELECT TO authenticated USING (true);
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='knowledge_base_files' AND policyname='Admins can manage kb files') THEN
        CREATE POLICY "Admins can manage kb files" ON public.knowledge_base_files AS PERMISSIVE FOR ALL TO authenticated USING (is_admin_or_supervisor(auth.uid())) WITH CHECK (is_admin_or_supervisor(auth.uid()));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='knowledge_base_files' AND policyname='Users can view knowledge base files') THEN
        CREATE POLICY "Users can view knowledge base files" ON public.knowledge_base_files AS PERMISSIVE FOR SELECT TO authenticated USING (((article_id IN ( SELECT a.id
   FROM knowledge_base_articles a
  WHERE (a.is_published = true))) OR is_admin_or_supervisor(auth.uid())));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='rate_limit_configs' AND policyname='Admins can manage rate limit configs') THEN
        CREATE POLICY "Admins can manage rate limit configs" ON public.rate_limit_configs AS PERMISSIVE FOR ALL TO authenticated USING (is_admin_or_supervisor(auth.uid())) WITH CHECK (is_admin_or_supervisor(auth.uid()));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='rate_limit_configs' AND policyname='Admins can read rate limit configs') THEN
        CREATE POLICY "Admins can read rate limit configs" ON public.rate_limit_configs AS PERMISSIVE FOR SELECT TO authenticated USING (is_admin_or_supervisor(auth.uid()));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='chatbot_executions' AND policyname='Admins can manage chatbot executions') THEN
        CREATE POLICY "Admins can manage chatbot executions" ON public.chatbot_executions AS PERMISSIVE FOR ALL TO authenticated USING (is_admin_or_supervisor(auth.uid())) WITH CHECK (is_admin_or_supervisor(auth.uid()));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='chatbot_executions' AND policyname='Authenticated can view chatbot executions') THEN
        CREATE POLICY "Authenticated can view chatbot executions" ON public.chatbot_executions AS PERMISSIVE FOR SELECT TO authenticated USING (((contact_id IN ( SELECT c.id
   FROM contacts c
  WHERE (c.assigned_to IN ( SELECT p.id
           FROM profiles p
          WHERE (p.user_id = auth.uid()))))) OR is_admin_or_supervisor(auth.uid())));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='sales_deals' AND policyname='Admins can delete deals') THEN
        CREATE POLICY "Admins can delete deals" ON public.sales_deals AS PERMISSIVE FOR DELETE TO authenticated USING (is_admin_or_supervisor(auth.uid()));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='sales_deals' AND policyname='Users can insert deals') THEN
        CREATE POLICY "Users can insert deals" ON public.sales_deals AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((assigned_to IS NULL) OR (assigned_to IN ( SELECT profiles.id
   FROM profiles
  WHERE (profiles.user_id = auth.uid()))) OR is_admin_or_supervisor(auth.uid())));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='sales_deals' AND policyname='Users can update assigned deals') THEN
        CREATE POLICY "Users can update assigned deals" ON public.sales_deals AS PERMISSIVE FOR UPDATE TO authenticated USING (((assigned_to IN ( SELECT profiles.id
   FROM profiles
  WHERE (profiles.user_id = auth.uid()))) OR is_admin_or_supervisor(auth.uid())));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='sales_deals' AND policyname='Users can view assigned or admin deals') THEN
        CREATE POLICY "Users can view assigned or admin deals" ON public.sales_deals AS PERMISSIVE FOR SELECT TO authenticated USING ((is_admin_or_supervisor(auth.uid()) OR (assigned_to IN ( SELECT profiles.id
   FROM profiles
  WHERE (profiles.user_id = auth.uid())))));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='agent_stats' AND policyname='Only admins can update agent stats') THEN
        CREATE POLICY "Only admins can update agent stats" ON public.agent_stats AS PERMISSIVE FOR UPDATE TO authenticated USING (is_admin_or_supervisor(auth.uid()));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='agent_stats' AND policyname='Users can insert own stats') THEN
        CREATE POLICY "Users can insert own stats" ON public.agent_stats AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((profile_id IN ( SELECT profiles.id
   FROM profiles
  WHERE (profiles.user_id = auth.uid()))) OR is_admin_or_supervisor(auth.uid())));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='agent_stats' AND policyname='Users can view agent stats') THEN
        CREATE POLICY "Users can view agent stats" ON public.agent_stats AS PERMISSIVE FOR SELECT TO authenticated USING (((profile_id IN ( SELECT p.id
   FROM profiles p
  WHERE (p.user_id = auth.uid()))) OR is_admin_or_supervisor(auth.uid())));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='sicoob_contact_mapping' AND policyname='Authenticated users can insert sicoob mappings') THEN
        CREATE POLICY "Authenticated users can insert sicoob mappings" ON public.sicoob_contact_mapping AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (is_admin_or_supervisor(auth.uid()));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='sicoob_contact_mapping' AND policyname='Only admins can view sicoob mappings') THEN
        CREATE POLICY "Only admins can view sicoob mappings" ON public.sicoob_contact_mapping AS PERMISSIVE FOR SELECT TO authenticated USING (is_admin_or_supervisor(auth.uid()));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='sicoob_contact_mapping' AND policyname='Service role can manage sicoob mappings') THEN
        CREATE POLICY "Service role can manage sicoob mappings" ON public.sicoob_contact_mapping AS PERMISSIVE FOR ALL TO service_role USING (true) WITH CHECK (true);
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='sla_configurations' AND policyname='Admins can manage SLA configurations') THEN
        CREATE POLICY "Admins can manage SLA configurations" ON public.sla_configurations AS PERMISSIVE FOR ALL TO authenticated USING (is_admin_or_supervisor(auth.uid())) WITH CHECK (is_admin_or_supervisor(auth.uid()));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='sla_configurations' AND policyname='Authenticated users can view SLA configurations') THEN
        CREATE POLICY "Authenticated users can view SLA configurations" ON public.sla_configurations AS PERMISSIVE FOR SELECT TO authenticated USING (true);
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='reminders' AND policyname='Users can manage own reminders') THEN
        CREATE POLICY "Users can manage own reminders" ON public.reminders AS PERMISSIVE FOR ALL TO authenticated USING ((profile_id IN ( SELECT profiles.id
   FROM profiles
  WHERE (profiles.user_id = auth.uid()))));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='role_permissions' AND policyname='Admins can manage role permissions') THEN
        CREATE POLICY "Admins can manage role permissions" ON public.role_permissions AS PERMISSIVE FOR ALL TO authenticated USING (is_admin_or_supervisor(auth.uid())) WITH CHECK (is_admin_or_supervisor(auth.uid()));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='role_permissions' AND policyname='Authenticated can view role permissions') THEN
        CREATE POLICY "Authenticated can view role permissions" ON public.role_permissions AS PERMISSIVE FOR SELECT TO authenticated USING (true);
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='user_roles' AND policyname='Only admins can manage roles') THEN
        CREATE POLICY "Only admins can manage roles" ON public.user_roles AS PERMISSIVE FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='user_roles' AND policyname='Users view own roles, admins view all') THEN
        CREATE POLICY "Users view own roles, admins view all" ON public.user_roles AS PERMISSIVE FOR SELECT TO authenticated USING (((user_id = auth.uid()) OR is_admin_or_supervisor(auth.uid())));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='user_service_accounts' AND policyname='Admins can view all service accounts') THEN
        CREATE POLICY "Admins can view all service accounts" ON public.user_service_accounts AS PERMISSIVE FOR SELECT TO authenticated USING (is_admin_or_supervisor(auth.uid()));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='user_service_accounts' AND policyname='Only admins can delete service accounts') THEN
        CREATE POLICY "Only admins can delete service accounts" ON public.user_service_accounts AS PERMISSIVE FOR DELETE TO authenticated USING (is_admin_or_supervisor(auth.uid()));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='user_service_accounts' AND policyname='Only admins can insert service accounts') THEN
        CREATE POLICY "Only admins can insert service accounts" ON public.user_service_accounts AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (is_admin_or_supervisor(auth.uid()));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='user_service_accounts' AND policyname='Only admins can update service accounts') THEN
        CREATE POLICY "Only admins can update service accounts" ON public.user_service_accounts AS PERMISSIVE FOR UPDATE TO authenticated USING (is_admin_or_supervisor(auth.uid()));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='user_service_accounts' AND policyname='Users can view own service accounts') THEN
        CREATE POLICY "Users can view own service accounts" ON public.user_service_accounts AS PERMISSIVE FOR SELECT TO authenticated USING ((auth.uid() = user_id));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='warroom_alerts' AND policyname='Admins can delete warroom alerts') THEN
        CREATE POLICY "Admins can delete warroom alerts" ON public.warroom_alerts AS PERMISSIVE FOR DELETE TO authenticated USING (is_admin_or_supervisor(auth.uid()));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='warroom_alerts' AND policyname='Admins can insert alerts') THEN
        CREATE POLICY "Admins can insert alerts" ON public.warroom_alerts AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (is_admin_or_supervisor(auth.uid()));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='warroom_alerts' AND policyname='Admins can update alerts') THEN
        CREATE POLICY "Admins can update alerts" ON public.warroom_alerts AS PERMISSIVE FOR UPDATE TO authenticated USING (is_admin_or_supervisor(auth.uid()));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='warroom_alerts' AND policyname='Admins can view warroom alerts') THEN
        CREATE POLICY "Admins can view warroom alerts" ON public.warroom_alerts AS PERMISSIVE FOR SELECT TO authenticated USING (is_admin_or_supervisor(auth.uid()));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='deal_activities' AND policyname='Admins can view deal activities') THEN
        CREATE POLICY "Admins can view deal activities" ON public.deal_activities AS PERMISSIVE FOR SELECT TO authenticated USING (is_admin_or_supervisor(auth.uid()));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='deal_activities' AND policyname='Agents can view activities on their deals') THEN
        CREATE POLICY "Agents can view activities on their deals" ON public.deal_activities AS PERMISSIVE FOR SELECT TO authenticated USING ((is_admin_or_supervisor(auth.uid()) OR (performed_by = get_profile_id_for_user(auth.uid())) OR (deal_id IN ( SELECT sd.id
   FROM sales_deals sd
  WHERE (sd.assigned_to = get_profile_id_for_user(auth.uid()))))));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='deal_activities' AND policyname='Authenticated can insert deal activities') THEN
        CREATE POLICY "Authenticated can insert deal activities" ON public.deal_activities AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((performed_by IN ( SELECT profiles.id
   FROM profiles
  WHERE (profiles.user_id = auth.uid()))) OR is_admin_or_supervisor(auth.uid())));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='email_labels' AND policyname='Users can manage labels of own accounts') THEN
        CREATE POLICY "Users can manage labels of own accounts" ON public.email_labels AS PERMISSIVE FOR ALL TO authenticated USING ((EXISTS ( SELECT 1
   FROM gmail_accounts ga
  WHERE ((ga.id = email_labels.gmail_account_id) AND (ga.user_id = auth.uid())))));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='email_labels' AND policyname='Users can view labels of own accounts') THEN
        CREATE POLICY "Users can view labels of own accounts" ON public.email_labels AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM gmail_accounts ga
  WHERE ((ga.id = email_labels.gmail_account_id) AND ((ga.user_id = auth.uid()) OR is_admin_or_supervisor(auth.uid()))))));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='sla_rules' AND policyname='Admins and supervisors can delete SLA rules') THEN
        CREATE POLICY "Admins and supervisors can delete SLA rules" ON public.sla_rules AS PERMISSIVE FOR DELETE TO authenticated USING (is_admin_or_supervisor(auth.uid()));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='sla_rules' AND policyname='Admins and supervisors can insert SLA rules') THEN
        CREATE POLICY "Admins and supervisors can insert SLA rules" ON public.sla_rules AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (is_admin_or_supervisor(auth.uid()));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='sla_rules' AND policyname='Admins and supervisors can update SLA rules') THEN
        CREATE POLICY "Admins and supervisors can update SLA rules" ON public.sla_rules AS PERMISSIVE FOR UPDATE TO authenticated USING (is_admin_or_supervisor(auth.uid()));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='sla_rules' AND policyname='SLA rules visible to admins only') THEN
        CREATE POLICY "SLA rules visible to admins only" ON public.sla_rules AS PERMISSIVE FOR SELECT TO authenticated USING (is_admin_or_supervisor(auth.uid()));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='stickers' AND policyname='Authenticated users can view stickers') THEN
        CREATE POLICY "Authenticated users can view stickers" ON public.stickers AS PERMISSIVE FOR SELECT TO authenticated USING (true);
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='stickers' AND policyname='Sticker delete with ownership') THEN
        CREATE POLICY "Sticker delete with ownership" ON public.stickers AS PERMISSIVE FOR DELETE TO authenticated USING (((uploaded_by = (auth.uid())::text) OR is_admin_or_supervisor(auth.uid())));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='stickers' AND policyname='Sticker insert with ownership') THEN
        CREATE POLICY "Sticker insert with ownership" ON public.stickers AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((uploaded_by = (auth.uid())::text) OR is_admin_or_supervisor(auth.uid())));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='stickers' AND policyname='Sticker update with ownership') THEN
        CREATE POLICY "Sticker update with ownership" ON public.stickers AS PERMISSIVE FOR UPDATE TO authenticated USING (((uploaded_by = (auth.uid())::text) OR is_admin_or_supervisor(auth.uid()))) WITH CHECK (((uploaded_by = (auth.uid())::text) OR is_admin_or_supervisor(auth.uid())));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='away_messages' AND policyname='Admins can manage away messages') THEN
        CREATE POLICY "Admins can manage away messages" ON public.away_messages AS PERMISSIVE FOR ALL TO authenticated USING (is_admin_or_supervisor(auth.uid())) WITH CHECK (is_admin_or_supervisor(auth.uid()));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='away_messages' AND policyname='Authenticated users can view away messages') THEN
        CREATE POLICY "Authenticated users can view away messages" ON public.away_messages AS PERMISSIVE FOR SELECT TO authenticated USING (true);
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='blocked_countries' AND policyname='Admins can delete blocked countries') THEN
        CREATE POLICY "Admins can delete blocked countries" ON public.blocked_countries AS PERMISSIVE FOR DELETE TO authenticated USING (is_admin_or_supervisor(auth.uid()));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='blocked_countries' AND policyname='Admins can insert blocked countries') THEN
        CREATE POLICY "Admins can insert blocked countries" ON public.blocked_countries AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (is_admin_or_supervisor(auth.uid()));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='blocked_countries' AND policyname='Admins can view blocked countries') THEN
        CREATE POLICY "Admins can view blocked countries" ON public.blocked_countries AS PERMISSIVE FOR SELECT TO authenticated USING (is_admin_or_supervisor(auth.uid()));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='blocked_ips' AND policyname='Admins can delete blocked IPs') THEN
        CREATE POLICY "Admins can delete blocked IPs" ON public.blocked_ips AS PERMISSIVE FOR DELETE TO authenticated USING (is_admin_or_supervisor(auth.uid()));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='blocked_ips' AND policyname='Admins can insert blocked IPs') THEN
        CREATE POLICY "Admins can insert blocked IPs" ON public.blocked_ips AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (is_admin_or_supervisor(auth.uid()));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='blocked_ips' AND policyname='Admins can update blocked IPs') THEN
        CREATE POLICY "Admins can update blocked IPs" ON public.blocked_ips AS PERMISSIVE FOR UPDATE TO authenticated USING (is_admin_or_supervisor(auth.uid()));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='blocked_ips' AND policyname='Only admins can view blocked IPs') THEN
        CREATE POLICY "Only admins can view blocked IPs" ON public.blocked_ips AS PERMISSIVE FOR SELECT TO authenticated USING (((EXISTS ( SELECT 1
   FROM user_roles
  WHERE ((user_roles.user_id = auth.uid()) AND (user_roles.role = 'admin'::app_role)))) OR is_admin_or_supervisor(auth.uid())));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='business_hours' AND policyname='Admins can manage business hours') THEN
        CREATE POLICY "Admins can manage business hours" ON public.business_hours AS PERMISSIVE FOR ALL TO authenticated USING (is_admin_or_supervisor(auth.uid())) WITH CHECK (is_admin_or_supervisor(auth.uid()));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='business_hours' AND policyname='Authenticated users can view business hours') THEN
        CREATE POLICY "Authenticated users can view business hours" ON public.business_hours AS PERMISSIVE FOR SELECT TO authenticated USING (true);
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='team_messages' AND policyname='Members can send messages') THEN
        CREATE POLICY "Members can send messages" ON public.team_messages AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((is_team_conversation_member(auth.uid(), conversation_id) AND (sender_id = ( SELECT p.id
   FROM profiles p
  WHERE (p.user_id = auth.uid())
 LIMIT 1))));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='team_messages' AND policyname='Members can view conversation messages') THEN
        CREATE POLICY "Members can view conversation messages" ON public.team_messages AS PERMISSIVE FOR SELECT TO authenticated USING (is_team_conversation_member(auth.uid(), conversation_id));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='team_messages' AND policyname='Senders can delete own messages') THEN
        CREATE POLICY "Senders can delete own messages" ON public.team_messages AS PERMISSIVE FOR DELETE TO authenticated USING ((sender_id = ( SELECT p.id
   FROM profiles p
  WHERE (p.user_id = auth.uid())
 LIMIT 1)));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='team_messages' AND policyname='Senders can edit own messages') THEN
        CREATE POLICY "Senders can edit own messages" ON public.team_messages AS PERMISSIVE FOR UPDATE TO authenticated USING ((sender_id = ( SELECT p.id
   FROM profiles p
  WHERE (p.user_id = auth.uid())
 LIMIT 1)));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='training_sessions' AND policyname='Users can delete own training sessions') THEN
        CREATE POLICY "Users can delete own training sessions" ON public.training_sessions AS PERMISSIVE FOR DELETE TO authenticated USING (((profile_id = get_profile_id_for_user(auth.uid())) OR is_admin_or_supervisor(auth.uid())));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='training_sessions' AND policyname='Users can insert own training sessions') THEN
        CREATE POLICY "Users can insert own training sessions" ON public.training_sessions AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((profile_id = get_profile_id_for_user(auth.uid())) OR is_admin_or_supervisor(auth.uid())));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='training_sessions' AND policyname='Users can update own training sessions') THEN
        CREATE POLICY "Users can update own training sessions" ON public.training_sessions AS PERMISSIVE FOR UPDATE TO authenticated USING (((profile_id = get_profile_id_for_user(auth.uid())) OR is_admin_or_supervisor(auth.uid())));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='training_sessions' AND policyname='Users can view own training sessions') THEN
        CREATE POLICY "Users can view own training sessions" ON public.training_sessions AS PERMISSIVE FOR SELECT TO authenticated USING (((profile_id = get_profile_id_for_user(auth.uid())) OR is_admin_or_supervisor(auth.uid())));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='auto_close_config' AND policyname='Admins can manage auto-close config') THEN
        CREATE POLICY "Admins can manage auto-close config" ON public.auto_close_config AS PERMISSIVE FOR ALL TO authenticated USING (is_admin_or_supervisor(auth.uid())) WITH CHECK (is_admin_or_supervisor(auth.uid()));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='auto_close_config' AND policyname='Authenticated users can view auto-close config') THEN
        CREATE POLICY "Authenticated users can view auto-close config" ON public.auto_close_config AS PERMISSIVE FOR SELECT TO authenticated USING (true);
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='email_messages' AND policyname='Users can insert messages for own accounts') THEN
        CREATE POLICY "Users can insert messages for own accounts" ON public.email_messages AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM gmail_accounts ga
  WHERE ((ga.id = email_messages.gmail_account_id) AND (ga.user_id = auth.uid())))));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='email_messages' AND policyname='Users can update messages of own accounts') THEN
        CREATE POLICY "Users can update messages of own accounts" ON public.email_messages AS PERMISSIVE FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM gmail_accounts ga
  WHERE ((ga.id = email_messages.gmail_account_id) AND ((ga.user_id = auth.uid()) OR is_admin_or_supervisor(auth.uid()))))));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='email_messages' AND policyname='Users can view messages of own accounts') THEN
        CREATE POLICY "Users can view messages of own accounts" ON public.email_messages AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM gmail_accounts ga
  WHERE ((ga.id = email_messages.gmail_account_id) AND ((ga.user_id = auth.uid()) OR is_admin_or_supervisor(auth.uid()))))));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='user_devices' AND policyname='Admins can view all user devices') THEN
        CREATE POLICY "Admins can view all user devices" ON public.user_devices AS PERMISSIVE FOR SELECT TO authenticated USING (is_admin_or_supervisor(auth.uid()));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='user_devices' AND policyname='Users can delete their own devices') THEN
        CREATE POLICY "Users can delete their own devices" ON public.user_devices AS PERMISSIVE FOR DELETE TO authenticated USING ((user_id = auth.uid()));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='user_devices' AND policyname='Users can insert their own devices') THEN
        CREATE POLICY "Users can insert their own devices" ON public.user_devices AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((user_id = auth.uid()));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='user_devices' AND policyname='Users can update their own devices') THEN
        CREATE POLICY "Users can update their own devices" ON public.user_devices AS PERMISSIVE FOR UPDATE TO authenticated USING ((user_id = auth.uid()));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='user_devices' AND policyname='Users can view their own devices') THEN
        CREATE POLICY "Users can view their own devices" ON public.user_devices AS PERMISSIVE FOR SELECT TO authenticated USING ((user_id = auth.uid()));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='user_settings' AND policyname='Users can insert their own settings') THEN
        CREATE POLICY "Users can insert their own settings" ON public.user_settings AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((user_id = auth.uid()));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='user_settings' AND policyname='Users can update their own settings') THEN
        CREATE POLICY "Users can update their own settings" ON public.user_settings AS PERMISSIVE FOR UPDATE TO authenticated USING ((user_id = auth.uid()));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='user_settings' AND policyname='Users can view their own settings') THEN
        CREATE POLICY "Users can view their own settings" ON public.user_settings AS PERMISSIVE FOR SELECT TO authenticated USING ((user_id = auth.uid()));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='user_sessions' AND policyname='Authenticated can insert own sessions') THEN
        CREATE POLICY "Authenticated can insert own sessions" ON public.user_sessions AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((user_id = auth.uid()));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='user_sessions' AND policyname='Users can delete their own sessions') THEN
        CREATE POLICY "Users can delete their own sessions" ON public.user_sessions AS PERMISSIVE FOR DELETE TO authenticated USING ((user_id = auth.uid()));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='user_sessions' AND policyname='Users can update their own sessions') THEN
        CREATE POLICY "Users can update their own sessions" ON public.user_sessions AS PERMISSIVE FOR UPDATE TO authenticated USING ((user_id = auth.uid()));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='user_sessions' AND policyname='Users can view their own sessions') THEN
        CREATE POLICY "Users can view their own sessions" ON public.user_sessions AS PERMISSIVE FOR SELECT TO authenticated USING ((user_id = auth.uid()));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='connection_health_logs' AND policyname='Admins can delete health logs') THEN
        CREATE POLICY "Admins can delete health logs" ON public.connection_health_logs AS PERMISSIVE FOR DELETE TO authenticated USING (is_admin_or_supervisor(auth.uid()));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='connection_health_logs' AND policyname='Admins can insert health logs') THEN
        CREATE POLICY "Admins can insert health logs" ON public.connection_health_logs AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (is_admin_or_supervisor(auth.uid()));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='connection_health_logs' AND policyname='Admins can view health logs') THEN
        CREATE POLICY "Admins can view health logs" ON public.connection_health_logs AS PERMISSIVE FOR SELECT TO authenticated USING (is_admin_or_supervisor(auth.uid()));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='allowed_countries' AND policyname='Admins can delete allowed countries') THEN
        CREATE POLICY "Admins can delete allowed countries" ON public.allowed_countries AS PERMISSIVE FOR DELETE TO authenticated USING (is_admin_or_supervisor(auth.uid()));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='allowed_countries' AND policyname='Admins can insert allowed countries') THEN
        CREATE POLICY "Admins can insert allowed countries" ON public.allowed_countries AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (is_admin_or_supervisor(auth.uid()));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='allowed_countries' AND policyname='Admins can view allowed countries') THEN
        CREATE POLICY "Admins can view allowed countries" ON public.allowed_countries AS PERMISSIVE FOR SELECT TO authenticated USING (is_admin_or_supervisor(auth.uid()));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='audio_memes' AND policyname='Authenticated users can insert audio memes') THEN
        CREATE POLICY "Authenticated users can insert audio memes" ON public.audio_memes AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((uploaded_by = auth.uid()));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='audio_memes' AND policyname='Authenticated users can read audio memes') THEN
        CREATE POLICY "Authenticated users can read audio memes" ON public.audio_memes AS PERMISSIVE FOR SELECT TO authenticated USING (true);
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='audio_memes' AND policyname='Authenticated users can update audio memes') THEN
        CREATE POLICY "Authenticated users can update audio memes" ON public.audio_memes AS PERMISSIVE FOR UPDATE TO authenticated USING (((uploaded_by = auth.uid()) OR is_admin_or_supervisor(auth.uid()))) WITH CHECK (((uploaded_by = auth.uid()) OR is_admin_or_supervisor(auth.uid())));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='audio_memes' AND policyname='Users can delete own audio memes') THEN
        CREATE POLICY "Users can delete own audio memes" ON public.audio_memes AS PERMISSIVE FOR DELETE TO authenticated USING (((uploaded_by = auth.uid()) OR is_admin_or_supervisor(auth.uid())));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='audit_logs' AND policyname='Block authenticated deletes on audit_logs') THEN
        CREATE POLICY "Block authenticated deletes on audit_logs" ON public.audit_logs AS PERMISSIVE FOR DELETE TO authenticated USING (false);
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='audit_logs' AND policyname='Block authenticated updates on audit_logs') THEN
        CREATE POLICY "Block authenticated updates on audit_logs" ON public.audit_logs AS PERMISSIVE FOR UPDATE TO authenticated USING (false);
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='audit_logs' AND policyname='Block direct audit log inserts') THEN
        CREATE POLICY "Block direct audit log inserts" ON public.audit_logs AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (false);
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='audit_logs' AND policyname='Only admins can view audit logs') THEN
        CREATE POLICY "Only admins can view audit logs" ON public.audit_logs AS PERMISSIVE FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='chatbot_flows' AND policyname='Admins can insert chatbot flows') THEN
        CREATE POLICY "Admins can insert chatbot flows" ON public.chatbot_flows AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (is_admin_or_supervisor(auth.uid()));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='chatbot_flows' AND policyname='Admins can manage chatbot flows') THEN
        CREATE POLICY "Admins can manage chatbot flows" ON public.chatbot_flows AS PERMISSIVE FOR ALL TO authenticated USING (is_admin_or_supervisor(auth.uid()));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='chatbot_flows' AND policyname='Authenticated can view chatbot flows') THEN
        CREATE POLICY "Authenticated can view chatbot flows" ON public.chatbot_flows AS PERMISSIVE FOR SELECT TO authenticated USING (true);
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='client_wallet_rules' AND policyname='Admins can manage wallet rules') THEN
        CREATE POLICY "Admins can manage wallet rules" ON public.client_wallet_rules AS PERMISSIVE FOR ALL TO authenticated USING (is_admin_or_supervisor(auth.uid())) WITH CHECK (is_admin_or_supervisor(auth.uid()));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='client_wallet_rules' AND policyname='Wallet rules visible to admins only') THEN
        CREATE POLICY "Wallet rules visible to admins only" ON public.client_wallet_rules AS PERMISSIVE FOR SELECT TO authenticated USING (is_admin_or_supervisor(auth.uid()));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='queues' AND policyname='Admins can manage queues') THEN
        CREATE POLICY "Admins can manage queues" ON public.queues AS PERMISSIVE FOR ALL TO authenticated USING (is_admin_or_supervisor(auth.uid())) WITH CHECK (is_admin_or_supervisor(auth.uid()));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='queues' AND policyname='Authenticated users can view queues') THEN
        CREATE POLICY "Authenticated users can view queues" ON public.queues AS PERMISSIVE FOR SELECT TO authenticated USING (true);
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='payment_links' AND policyname='Admins can delete payment links') THEN
        CREATE POLICY "Admins can delete payment links" ON public.payment_links AS PERMISSIVE FOR DELETE TO authenticated USING (is_admin_or_supervisor(auth.uid()));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='payment_links' AND policyname='Authenticated can insert payment links') THEN
        CREATE POLICY "Authenticated can insert payment links" ON public.payment_links AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((created_by IN ( SELECT profiles.id
   FROM profiles
  WHERE (profiles.user_id = auth.uid()))) OR is_admin_or_supervisor(auth.uid())));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='payment_links' AND policyname='Users can update own payment links') THEN
        CREATE POLICY "Users can update own payment links" ON public.payment_links AS PERMISSIVE FOR UPDATE TO authenticated USING (((created_by IN ( SELECT profiles.id
   FROM profiles
  WHERE (profiles.user_id = auth.uid()))) OR is_admin_or_supervisor(auth.uid())));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='payment_links' AND policyname='Users can view own payment links') THEN
        CREATE POLICY "Users can view own payment links" ON public.payment_links AS PERMISSIVE FOR SELECT TO authenticated USING (((created_by IN ( SELECT profiles.id
   FROM profiles
  WHERE (profiles.user_id = auth.uid()))) OR is_admin_or_supervisor(auth.uid())));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='products' AND policyname='Admins can insert products') THEN
        CREATE POLICY "Admins can insert products" ON public.products AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (is_admin_or_supervisor(auth.uid()));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='products' AND policyname='Admins can manage products') THEN
        CREATE POLICY "Admins can manage products" ON public.products AS PERMISSIVE FOR ALL TO authenticated USING (is_admin_or_supervisor(auth.uid())) WITH CHECK (is_admin_or_supervisor(auth.uid()));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='products' AND policyname='Authenticated users can view products') THEN
        CREATE POLICY "Authenticated users can view products" ON public.products AS PERMISSIVE FOR SELECT TO authenticated USING (true);
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='team_conversations' AND policyname='Authenticated users can create conversations') THEN
        CREATE POLICY "Authenticated users can create conversations" ON public.team_conversations AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((created_by = ( SELECT p.id
   FROM profiles p
  WHERE (p.user_id = auth.uid())
 LIMIT 1)));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='team_conversations' AND policyname='Creator can update conversation') THEN
        CREATE POLICY "Creator can update conversation" ON public.team_conversations AS PERMISSIVE FOR UPDATE TO authenticated USING ((created_by = ( SELECT p.id
   FROM profiles p
  WHERE (p.user_id = auth.uid())
 LIMIT 1)));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='team_conversations' AND policyname='Members can view their conversations') THEN
        CREATE POLICY "Members can view their conversations" ON public.team_conversations AS PERMISSIVE FOR SELECT TO authenticated USING ((is_team_conversation_member(auth.uid(), id) OR (created_by = ( SELECT p.id
   FROM profiles p
  WHERE (p.user_id = auth.uid())
 LIMIT 1))));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='login_attempts' AND policyname='Block authenticated inserts on login_attempts') THEN
        CREATE POLICY "Block authenticated inserts on login_attempts" ON public.login_attempts AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (false);
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='login_attempts' AND policyname='Block authenticated updates on login_attempts') THEN
        CREATE POLICY "Block authenticated updates on login_attempts" ON public.login_attempts AS PERMISSIVE FOR UPDATE TO authenticated USING (false);
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='login_attempts' AND policyname='Only admins can delete login attempts') THEN
        CREATE POLICY "Only admins can delete login attempts" ON public.login_attempts AS PERMISSIVE FOR DELETE TO authenticated USING (is_admin_or_supervisor(auth.uid()));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='login_attempts' AND policyname='Only admins can view login attempts') THEN
        CREATE POLICY "Only admins can view login attempts" ON public.login_attempts AS PERMISSIVE FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='conversation_snoozes' AND policyname='Users can create own snoozes') THEN
        CREATE POLICY "Users can create own snoozes" ON public.conversation_snoozes AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((snoozed_by IN ( SELECT profiles.id
   FROM profiles
  WHERE (profiles.user_id = auth.uid()))));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='conversation_snoozes' AND policyname='Users can delete own snoozes') THEN
        CREATE POLICY "Users can delete own snoozes" ON public.conversation_snoozes AS PERMISSIVE FOR DELETE TO authenticated USING ((snoozed_by IN ( SELECT profiles.id
   FROM profiles
  WHERE (profiles.user_id = auth.uid()))));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='conversation_snoozes' AND policyname='Users can view own snoozes') THEN
        CREATE POLICY "Users can view own snoozes" ON public.conversation_snoozes AS PERMISSIVE FOR SELECT TO authenticated USING ((snoozed_by IN ( SELECT profiles.id
   FROM profiles
  WHERE (profiles.user_id = auth.uid()))));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='profiles' AND policyname='Admin supervisor can view all profiles') THEN
        CREATE POLICY "Admin supervisor can view all profiles" ON public.profiles AS PERMISSIVE FOR SELECT TO authenticated USING (is_admin_or_supervisor(auth.uid()));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='profiles' AND policyname='Admins can update any profile') THEN
        CREATE POLICY "Admins can update any profile" ON public.profiles AS PERMISSIVE FOR UPDATE TO authenticated USING (is_admin_or_supervisor(auth.uid())) WITH CHECK (is_admin_or_supervisor(auth.uid()));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='profiles' AND policyname='Block sensitive field changes by non-admins') THEN
        CREATE POLICY "Block sensitive field changes by non-admins" ON public.profiles AS RESTRICTIVE FOR UPDATE TO authenticated WITH CHECK ((is_admin_or_supervisor(auth.uid()) OR ((role = ( SELECT p.role
   FROM profiles p
  WHERE (p.user_id = auth.uid()))) AND (access_level = ( SELECT p.access_level
   FROM profiles p
  WHERE (p.user_id = auth.uid()))) AND (permissions = ( SELECT p.permissions
   FROM profiles p
  WHERE (p.user_id = auth.uid()))) AND (is_active = ( SELECT p.is_active
   FROM profiles p
  WHERE (p.user_id = auth.uid()))))));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='profiles' AND policyname='Users can insert their own profile safely') THEN
        CREATE POLICY "Users can insert their own profile safely" ON public.profiles AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((auth.uid() = user_id) AND ((role IS NULL) OR (role = 'agent'::text)) AND ((access_level IS NULL) OR (access_level = 'basic'::text)) AND ((permissions IS NULL) OR (permissions = '{}'::jsonb))));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='profiles' AND policyname='Users can update own profile') THEN
        CREATE POLICY "Users can update own profile" ON public.profiles AS PERMISSIVE FOR UPDATE TO authenticated USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='profiles' AND policyname='Users can view own profile') THEN
        CREATE POLICY "Users can view own profile" ON public.profiles AS PERMISSIVE FOR SELECT TO authenticated USING ((user_id = auth.uid()));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='query_telemetry' AND policyname='Admins can delete telemetry') THEN
        CREATE POLICY "Admins can delete telemetry" ON public.query_telemetry AS PERMISSIVE FOR DELETE TO authenticated USING (is_admin_or_supervisor(auth.uid()));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='query_telemetry' AND policyname='Users can insert own telemetry') THEN
        CREATE POLICY "Users can insert own telemetry" ON public.query_telemetry AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((user_id = auth.uid()));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='query_telemetry' AND policyname='Users can view own telemetry') THEN
        CREATE POLICY "Users can view own telemetry" ON public.query_telemetry AS PERMISSIVE FOR SELECT TO authenticated USING (((user_id = auth.uid()) OR is_admin_or_supervisor(auth.uid())));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='agent_visibility_grants' AND policyname='Admins and supervisors can manage visibility grants') THEN
        CREATE POLICY "Admins and supervisors can manage visibility grants" ON public.agent_visibility_grants AS PERMISSIVE FOR ALL TO authenticated USING (is_admin_or_supervisor(auth.uid())) WITH CHECK (is_admin_or_supervisor(auth.uid()));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='agent_visibility_grants' AND policyname='Special agents can view own grants') THEN
        CREATE POLICY "Special agents can view own grants" ON public.agent_visibility_grants AS PERMISSIVE FOR SELECT TO authenticated USING ((agent_id IN ( SELECT p.id
   FROM profiles p
  WHERE (p.user_id = auth.uid()))));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='contacts' AND policyname='Admins can view all contacts including unassigned') THEN
        CREATE POLICY "Admins can view all contacts including unassigned" ON public.contacts AS PERMISSIVE FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='contacts' AND policyname='Users can insert contacts') THEN
        CREATE POLICY "Users can insert contacts" ON public.contacts AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((is_admin_or_supervisor(auth.uid()) OR ((assigned_to IS NOT NULL) AND (assigned_to IN ( SELECT profiles.id
   FROM profiles
  WHERE (profiles.user_id = auth.uid()))))));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='contacts' AND policyname='Users can update their assigned contacts') THEN
        CREATE POLICY "Users can update their assigned contacts" ON public.contacts AS PERMISSIVE FOR UPDATE TO authenticated USING (((assigned_to IN ( SELECT get_visible_agent_ids(auth.uid()) AS get_visible_agent_ids)) OR is_admin_or_supervisor(auth.uid())));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='contacts' AND policyname='contacts_select_policy') THEN
        CREATE POLICY contacts_select_policy ON public.contacts AS PERMISSIVE FOR SELECT TO authenticated USING ((is_admin_or_supervisor(auth.uid()) OR (assigned_to = get_profile_id_for_user(auth.uid())) OR (assigned_to IS NULL)));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='conversation_analyses' AND policyname='Authenticated users can view analyses') THEN
        CREATE POLICY "Authenticated users can view analyses" ON public.conversation_analyses AS PERMISSIVE FOR SELECT TO authenticated USING (((contact_id IN ( SELECT c.id
   FROM contacts c
  WHERE (c.assigned_to IN ( SELECT p.id
           FROM profiles p
          WHERE (p.user_id = auth.uid()))))) OR is_admin_or_supervisor(auth.uid())));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='conversation_analyses' AND policyname='Users can insert own analyses') THEN
        CREATE POLICY "Users can insert own analyses" ON public.conversation_analyses AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((analyzed_by IS NULL) OR (analyzed_by IN ( SELECT profiles.id
   FROM profiles
  WHERE (profiles.user_id = auth.uid()))) OR is_admin_or_supervisor(auth.uid())));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='tags' AND policyname='Admins can manage tags') THEN
        CREATE POLICY "Admins can manage tags" ON public.tags AS PERMISSIVE FOR ALL TO authenticated USING (is_admin_or_supervisor(auth.uid())) WITH CHECK (is_admin_or_supervisor(auth.uid()));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='tags' AND policyname='Authenticated users can view tags') THEN
        CREATE POLICY "Authenticated users can view tags" ON public.tags AS PERMISSIVE FOR SELECT TO authenticated USING (true);
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='tags' AND policyname='Users can insert tags') THEN
        CREATE POLICY "Users can insert tags" ON public.tags AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((created_by IS NULL) OR (created_by IN ( SELECT profiles.id
   FROM profiles
  WHERE (profiles.user_id = auth.uid()))) OR is_admin_or_supervisor(auth.uid())));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='talkx_campaigns' AND policyname='Admins can view all campaigns') THEN
        CREATE POLICY "Admins can view all campaigns" ON public.talkx_campaigns AS PERMISSIVE FOR SELECT TO authenticated USING (is_admin_or_supervisor(auth.uid()));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='talkx_campaigns' AND policyname='Users can create campaigns') THEN
        CREATE POLICY "Users can create campaigns" ON public.talkx_campaigns AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((created_by = ( SELECT profiles.id
   FROM profiles
  WHERE (profiles.user_id = auth.uid())
 LIMIT 1)));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='talkx_campaigns' AND policyname='Users can delete own draft campaigns') THEN
        CREATE POLICY "Users can delete own draft campaigns" ON public.talkx_campaigns AS PERMISSIVE FOR DELETE TO authenticated USING (((created_by = ( SELECT profiles.id
   FROM profiles
  WHERE (profiles.user_id = auth.uid())
 LIMIT 1)) AND (status = 'draft'::text)));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='talkx_campaigns' AND policyname='Users can update own campaigns') THEN
        CREATE POLICY "Users can update own campaigns" ON public.talkx_campaigns AS PERMISSIVE FOR UPDATE TO authenticated USING ((created_by = ( SELECT profiles.id
   FROM profiles
  WHERE (profiles.user_id = auth.uid())
 LIMIT 1)));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='talkx_campaigns' AND policyname='Users can view own campaigns') THEN
        CREATE POLICY "Users can view own campaigns" ON public.talkx_campaigns AS PERMISSIVE FOR SELECT TO authenticated USING ((created_by = ( SELECT profiles.id
   FROM profiles
  WHERE (profiles.user_id = auth.uid())
 LIMIT 1)));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='talkx_recipients' AND policyname='Users can delete recipients of own campaigns') THEN
        CREATE POLICY "Users can delete recipients of own campaigns" ON public.talkx_recipients AS PERMISSIVE FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1
   FROM talkx_campaigns tc
  WHERE ((tc.id = talkx_recipients.campaign_id) AND (tc.created_by = ( SELECT profiles.id
           FROM profiles
          WHERE (profiles.user_id = auth.uid())
         LIMIT 1)) AND (tc.status = 'draft'::text)))));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='talkx_recipients' AND policyname='Users can insert recipients to own campaigns') THEN
        CREATE POLICY "Users can insert recipients to own campaigns" ON public.talkx_recipients AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM talkx_campaigns tc
  WHERE ((tc.id = talkx_recipients.campaign_id) AND (tc.created_by = ( SELECT profiles.id
           FROM profiles
          WHERE (profiles.user_id = auth.uid())
         LIMIT 1))))));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='talkx_recipients' AND policyname='Users can update recipients of own campaigns') THEN
        CREATE POLICY "Users can update recipients of own campaigns" ON public.talkx_recipients AS PERMISSIVE FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM talkx_campaigns tc
  WHERE ((tc.id = talkx_recipients.campaign_id) AND (tc.created_by = ( SELECT profiles.id
           FROM profiles
          WHERE (profiles.user_id = auth.uid())
         LIMIT 1))))));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='talkx_recipients' AND policyname='Users can view recipients of own campaigns') THEN
        CREATE POLICY "Users can view recipients of own campaigns" ON public.talkx_recipients AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM talkx_campaigns tc
  WHERE ((tc.id = talkx_recipients.campaign_id) AND ((tc.created_by = ( SELECT profiles.id
           FROM profiles
          WHERE (profiles.user_id = auth.uid())
         LIMIT 1)) OR is_admin_or_supervisor(auth.uid()))))));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='number_reputation' AND policyname='Admins can insert reputation') THEN
        CREATE POLICY "Admins can insert reputation" ON public.number_reputation AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (is_admin_or_supervisor(auth.uid()));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='number_reputation' AND policyname='Admins can update reputation') THEN
        CREATE POLICY "Admins can update reputation" ON public.number_reputation AS PERMISSIVE FOR UPDATE TO authenticated USING (is_admin_or_supervisor(auth.uid()));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='number_reputation' AND policyname='Authenticated can view reputation') THEN
        CREATE POLICY "Authenticated can view reputation" ON public.number_reputation AS PERMISSIVE FOR SELECT TO authenticated USING (true);
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='passkey_credentials' AND policyname='Users can delete own passkeys') THEN
        CREATE POLICY "Users can delete own passkeys" ON public.passkey_credentials AS PERMISSIVE FOR DELETE TO authenticated USING ((user_id = auth.uid()));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='passkey_credentials' AND policyname='Users can insert own passkeys') THEN
        CREATE POLICY "Users can insert own passkeys" ON public.passkey_credentials AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((user_id = auth.uid()));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='passkey_credentials' AND policyname='Users can update own passkeys') THEN
        CREATE POLICY "Users can update own passkeys" ON public.passkey_credentials AS PERMISSIVE FOR UPDATE TO authenticated USING ((user_id = auth.uid()));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='passkey_credentials' AND policyname='Users can view own passkeys') THEN
        CREATE POLICY "Users can view own passkeys" ON public.passkey_credentials AS PERMISSIVE FOR SELECT TO authenticated USING ((user_id = auth.uid()));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='password_reset_requests' AND policyname='Admins can delete password reset requests') THEN
        CREATE POLICY "Admins can delete password reset requests" ON public.password_reset_requests AS PERMISSIVE FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='password_reset_requests' AND policyname='Admins can update reset requests without token access') THEN
        CREATE POLICY "Admins can update reset requests without token access" ON public.password_reset_requests AS PERMISSIVE FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='password_reset_requests' AND policyname='Admins can view reset requests') THEN
        CREATE POLICY "Admins can view reset requests" ON public.password_reset_requests AS PERMISSIVE FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='password_reset_requests' AND policyname='Users can request own password reset') THEN
        CREATE POLICY "Users can request own password reset" ON public.password_reset_requests AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((user_id = auth.uid()));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='rate_limit_logs' AND policyname='Admins can insert rate limit logs') THEN
        CREATE POLICY "Admins can insert rate limit logs" ON public.rate_limit_logs AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (is_admin_or_supervisor(auth.uid()));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='rate_limit_logs' AND policyname='Admins can view rate limit logs') THEN
        CREATE POLICY "Admins can view rate limit logs" ON public.rate_limit_logs AS PERMISSIVE FOR SELECT TO authenticated USING (is_admin_or_supervisor(auth.uid()));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='ai_providers' AND policyname='Admins can delete AI providers') THEN
        CREATE POLICY "Admins can delete AI providers" ON public.ai_providers AS PERMISSIVE FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='ai_providers' AND policyname='Admins can insert AI providers') THEN
        CREATE POLICY "Admins can insert AI providers" ON public.ai_providers AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='ai_providers' AND policyname='Admins can update AI providers') THEN
        CREATE POLICY "Admins can update AI providers" ON public.ai_providers AS PERMISSIVE FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='ai_providers' AND policyname='Admins can view AI providers') THEN
        CREATE POLICY "Admins can view AI providers" ON public.ai_providers AS PERMISSIVE FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='ai_usage_logs' AND policyname='Admins can view all AI usage logs') THEN
        CREATE POLICY "Admins can view all AI usage logs" ON public.ai_usage_logs AS PERMISSIVE FOR SELECT TO authenticated USING (is_admin_or_supervisor(auth.uid()));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='ai_usage_logs' AND policyname='Service role can insert AI usage logs') THEN
        CREATE POLICY "Service role can insert AI usage logs" ON public.ai_usage_logs AS PERMISSIVE FOR INSERT TO service_role WITH CHECK (true);
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='ai_usage_logs' AND policyname='Users can view own AI usage logs') THEN
        CREATE POLICY "Users can view own AI usage logs" ON public.ai_usage_logs AS PERMISSIVE FOR SELECT TO authenticated USING ((user_id = auth.uid()));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='security_alerts' AND policyname='Admins can insert security alerts') THEN
        CREATE POLICY "Admins can insert security alerts" ON public.security_alerts AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (is_admin_or_supervisor(auth.uid()));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='security_alerts' AND policyname='Admins can manage security alerts') THEN
        CREATE POLICY "Admins can manage security alerts" ON public.security_alerts AS PERMISSIVE FOR ALL TO authenticated USING (is_admin_or_supervisor(auth.uid())) WITH CHECK (is_admin_or_supervisor(auth.uid()));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='channel_routing_rules' AND policyname='Admins can manage routing rules') THEN
        CREATE POLICY "Admins can manage routing rules" ON public.channel_routing_rules AS PERMISSIVE FOR ALL TO authenticated USING (is_admin_or_supervisor(auth.uid())) WITH CHECK (is_admin_or_supervisor(auth.uid()));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='channel_routing_rules' AND policyname='Authenticated can view routing rules') THEN
        CREATE POLICY "Authenticated can view routing rules" ON public.channel_routing_rules AS PERMISSIVE FOR SELECT TO authenticated USING (true);
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='gmail_accounts' AND policyname='Block authenticated gmail deletes') THEN
        CREATE POLICY "Block authenticated gmail deletes" ON public.gmail_accounts AS PERMISSIVE FOR DELETE TO authenticated USING (false);
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='gmail_accounts' AND policyname='Block authenticated gmail inserts') THEN
        CREATE POLICY "Block authenticated gmail inserts" ON public.gmail_accounts AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (false);
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='gmail_accounts' AND policyname='Block authenticated gmail updates') THEN
        CREATE POLICY "Block authenticated gmail updates" ON public.gmail_accounts AS PERMISSIVE FOR UPDATE TO authenticated USING (false);
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='gmail_accounts' AND policyname='Service role only for gmail accounts') THEN
        CREATE POLICY "Service role only for gmail accounts" ON public.gmail_accounts AS PERMISSIVE FOR ALL TO service_role USING (true) WITH CHECK (true);
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='gmail_accounts' AND policyname='Users can view their own gmail accounts') THEN
        CREATE POLICY "Users can view their own gmail accounts" ON public.gmail_accounts AS PERMISSIVE FOR SELECT TO authenticated USING ((user_id = auth.uid()));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='saved_filters' AND policyname='Users can delete own saved filters') THEN
        CREATE POLICY "Users can delete own saved filters" ON public.saved_filters AS PERMISSIVE FOR DELETE TO authenticated USING ((user_id = auth.uid()));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='saved_filters' AND policyname='Users can insert own saved filters') THEN
        CREATE POLICY "Users can insert own saved filters" ON public.saved_filters AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((user_id = auth.uid()));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='saved_filters' AND policyname='Users can update own saved filters') THEN
        CREATE POLICY "Users can update own saved filters" ON public.saved_filters AS PERMISSIVE FOR UPDATE TO authenticated USING ((user_id = auth.uid()));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='saved_filters' AND policyname='Users can view own saved filters') THEN
        CREATE POLICY "Users can view own saved filters" ON public.saved_filters AS PERMISSIVE FOR SELECT TO authenticated USING ((user_id = auth.uid()));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='saved_filters' AND policyname='Users can view shared filters') THEN
        CREATE POLICY "Users can view shared filters" ON public.saved_filters AS PERMISSIVE FOR SELECT TO authenticated USING ((is_shared = true));
    END IF;
END $$;

-- ============================================================
-- FIM DO BLOCO 01
-- ============================================================
