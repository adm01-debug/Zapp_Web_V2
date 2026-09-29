-- =============================================================================
-- W4 / performance -- Onda 2: fixture de schema para o banco DESCARTAVEL.
-- =============================================================================
-- Objetivo: reproduzir, em PostgreSQL 17 descartavel, o ambiente minimo em que
-- `public.search_contacts` executa, com o MESMO tipo de plano e o MESMO tipo de
-- avaliacao por linha que o banco canonico -- sem tocar no banco canonico.
--
-- FIDELIDADE: as tabelas e o predicado sao copiados por nome/tipo do
-- `supabase/schema-manifest.json` (estado do canonico) e das migrations. AS
-- FUNCOES NAO SAO TRANSCRITAS AQUI: o build (`build_defs.py`) extrai os corpos
-- literais das migrations e os concatena em `generated/02-functions.sql`.
--
-- NAO-FIDELIDADE DECLARADA (deliberada):
--   * `auth.uid()` e uma EMULACAO do helper do Supabase (le o claim do JWT de um
--     GUC). O original vive no schema `auth` gerenciado pela plataforma, nao nas
--     migrations deste repo. Custo: 1 chamada STABLE por avaliacao, igual.
--   * FKs para tabelas que nao participam da query sao omitidas
--     (whatsapp_connections, channel_connections): FK nao altera plano de leitura.
--   * `extensions.pg_trgm` e criado no schema `extensions`, como no canonico
--     (`USING gin (col extensions.gin_trgm_ops)`).
--   * RLS e criado com as policies reais, mas o dono do schema no teste e
--     superuser (RLS nao forcado) -- como no canonico (owner postgres,
--     relforcerowsecurity=false). O predicado que `search_contacts` avalia por
--     linha e proprio da FUNCAO (SECURITY DEFINER), nao da RLS, entao o custo
--     medido e o custo real do RPC.
-- =============================================================================

\set ON_ERROR_STOP on

CREATE SCHEMA IF NOT EXISTS auth;
CREATE SCHEMA IF NOT EXISTS extensions;

-- Papeis do Supabase usados pelos GRANT/REVOKE das migrations (so nomes).
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role NOLOGIN; END IF;
END
$do$;

CREATE EXTENSION IF NOT EXISTS pgcrypto SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_trgm SCHEMA extensions;

-- --- auth.uid(): emulacao do helper Supabase ---------------------------------
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid
LANGUAGE sql STABLE
AS $fn$
  SELECT COALESCE(
    NULLIF(current_setting('request.jwt.claim.sub', true), ''),
    (NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$fn$;

CREATE TABLE auth.users (
  id uuid PRIMARY KEY,
  email text
);

-- --- tabelas de apoio --------------------------------------------------------
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  full_name text,
  nickname text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  role text
);

CREATE TABLE public.agent_visibility_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid,                 -- profile_id do dono do grant
  can_see_agent_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.queues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text
);

CREATE TABLE public.queue_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  queue_id uuid REFERENCES public.queues(id) ON DELETE CASCADE,
  profile_id uuid,
  is_active boolean DEFAULT true
);

-- --- audit_logs: DDL literal de 20251215025014 ------------------------------
CREATE TABLE public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id UUID,
  details JSONB DEFAULT '{}',
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Indices de audit_logs que existem no canonico (20260511233446) -- afetam o
-- custo do INSERT do trigger, entao precisam existir para medir de verdade.
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON public.audit_logs USING btree (action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON public.audit_logs USING btree (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_created ON public.audit_logs USING btree (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON public.audit_logs USING btree (user_id);

-- --- contacts: colunas por nome/tipo do schema-manifest.json -----------------
CREATE TABLE public.contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  nickname text,
  surname text,
  job_title text,
  company text,
  phone text NOT NULL UNIQUE,
  email text,
  avatar_url text,
  assigned_to uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  queue_id uuid REFERENCES public.queues(id) ON DELETE SET NULL,
  whatsapp_connection_id uuid,
  channel_connection_id uuid,
  channel_type text DEFAULT 'whatsapp',
  tags text[] DEFAULT '{}',
  notes text,
  contact_type text DEFAULT 'cliente',
  consent_status text DEFAULT 'unknown',
  lead_origin text,
  lead_score integer DEFAULT 0,
  risk_score integer DEFAULT 0,
  ai_priority text DEFAULT 'normal',
  ai_sentiment text DEFAULT 'neutral',
  group_category text,
  is_lid_legacy boolean NOT NULL DEFAULT false,
  conversation_status text NOT NULL DEFAULT 'open',
  conversation_status_changed_at timestamptz DEFAULT now(),
  latitude double precision,
  longitude double precision,
  address text,
  address_number text,
  neighborhood text,
  city text,
  state text,
  postal_code text,
  avatar_fetch_attempted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
