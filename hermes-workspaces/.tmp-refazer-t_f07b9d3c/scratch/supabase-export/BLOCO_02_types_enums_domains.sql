-- ============================================================
-- BLOCO 02 — TYPES / ENUMS / DOMAINS (idempotente)
-- Schema: public
-- Domains: 0 | Composite types: 0 | Enums: 4
-- ============================================================
-- Aplicar:
--   psql "$DESTINO_URL" -f BLOCO_02_types_enums_domains.sql
-- Idempotência: usa DO blocks com checagem em pg_type/pg_enum.
-- Para cada enum: cria se não existir; adiciona valores faltantes
-- com ALTER TYPE ... ADD VALUE IF NOT EXISTS (Postgres >= 9.6).
-- ============================================================

-- ------------------------------------------------------------
-- ENUM: public.ai_provider_type
-- ------------------------------------------------------------
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' AND t.typname = 'ai_provider_type'
  ) THEN
    CREATE TYPE public.ai_provider_type AS ENUM (
      'lovable_ai',
      'openai_compatible',
      'google_gemini',
      'custom_webhook',
      'custom_agent'
    );
  END IF;
END $$;

ALTER TYPE public.ai_provider_type ADD VALUE IF NOT EXISTS 'lovable_ai';
ALTER TYPE public.ai_provider_type ADD VALUE IF NOT EXISTS 'openai_compatible';
ALTER TYPE public.ai_provider_type ADD VALUE IF NOT EXISTS 'google_gemini';
ALTER TYPE public.ai_provider_type ADD VALUE IF NOT EXISTS 'custom_webhook';
ALTER TYPE public.ai_provider_type ADD VALUE IF NOT EXISTS 'custom_agent';

-- ------------------------------------------------------------
-- ENUM: public.app_role
-- ------------------------------------------------------------
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' AND t.typname = 'app_role'
  ) THEN
    CREATE TYPE public.app_role AS ENUM (
      'admin',
      'supervisor',
      'agent',
      'special_agent'
    );
  END IF;
END $$;

ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'admin';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'supervisor';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'agent';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'special_agent';

-- ------------------------------------------------------------
-- ENUM: public.channel_type
-- ------------------------------------------------------------
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' AND t.typname = 'channel_type'
  ) THEN
    CREATE TYPE public.channel_type AS ENUM (
      'whatsapp',
      'instagram',
      'telegram',
      'messenger',
      'webchat',
      'email'
    );
  END IF;
END $$;

ALTER TYPE public.channel_type ADD VALUE IF NOT EXISTS 'whatsapp';
ALTER TYPE public.channel_type ADD VALUE IF NOT EXISTS 'instagram';
ALTER TYPE public.channel_type ADD VALUE IF NOT EXISTS 'telegram';
ALTER TYPE public.channel_type ADD VALUE IF NOT EXISTS 'messenger';
ALTER TYPE public.channel_type ADD VALUE IF NOT EXISTS 'webchat';
ALTER TYPE public.channel_type ADD VALUE IF NOT EXISTS 'email';

-- ------------------------------------------------------------
-- ENUM: public.service_account_type
-- ------------------------------------------------------------
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' AND t.typname = 'service_account_type'
  ) THEN
    CREATE TYPE public.service_account_type AS ENUM (
      'google_sheets',
      'google_docs',
      'google_calendar',
      'google_drive',
      'dropbox'
    );
  END IF;
END $$;

ALTER TYPE public.service_account_type ADD VALUE IF NOT EXISTS 'google_sheets';
ALTER TYPE public.service_account_type ADD VALUE IF NOT EXISTS 'google_docs';
ALTER TYPE public.service_account_type ADD VALUE IF NOT EXISTS 'google_calendar';
ALTER TYPE public.service_account_type ADD VALUE IF NOT EXISTS 'google_drive';
ALTER TYPE public.service_account_type ADD VALUE IF NOT EXISTS 'dropbox';

-- ============================================================
-- FIM BLOCO 02
-- DOMAINS:           0 (nenhum domain customizado no schema public)
-- COMPOSITE TYPES:   0 (apenas row types automáticos de tabelas/views)
-- ENUMS:             4 (ai_provider_type, app_role, channel_type, service_account_type)
-- ============================================================
