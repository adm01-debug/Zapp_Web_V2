\set ON_ERROR_STOP on

-- Prova executavel do refazer t_10045229.
-- Rodar da raiz do repo: psql -X -v ON_ERROR_STOP=1 -f .tmp/proof.sql
-- Cobre:
--   A) base sem #69: migration cria inbound_message_effects + drain; rollback remove so objetos da migration.
--   B) base com outbox #69 preexistente: migration estende CHECK; rollback restaura 3 efeitos sem dropar tabela/dados.
--   C) optout_resolve com reavaliacao indeterminada/erro: drain deixa pendente, preenche last_error e nao marca applied_at.

DROP SCHEMA IF EXISTS auth CASCADE;
DROP SCHEMA IF EXISTS public CASCADE;
CREATE SCHEMA public;
GRANT ALL ON SCHEMA public TO postgres;
GRANT ALL ON SCHEMA public TO public;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role NOLOGIN;
  END IF;
END;
$$;

CREATE SCHEMA auth;
CREATE OR REPLACE FUNCTION auth.role()
RETURNS text
LANGUAGE sql STABLE
AS $$ SELECT nullif(current_setting('request.jwt.claim.role', true), '') $$;

CREATE OR REPLACE FUNCTION public.proof_assert(p_condition boolean, p_message text)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT coalesce(p_condition, false) THEN
    RAISE EXCEPTION 'proof assertion failed: %', p_message;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.phone_variants(p_phone text)
RETURNS text[]
LANGUAGE sql IMMUTABLE
AS $$ SELECT ARRAY[p_phone, regexp_replace(coalesce(p_phone, ''), '\\D', '', 'g')] $$;

CREATE TABLE public.contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  phone text,
  whatsapp_connection_id uuid,
  assigned_to uuid,
  avatar_url text,
  created_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  UNIQUE (phone)
);

CREATE TABLE public.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid,
  whatsapp_connection_id uuid NOT NULL,
  content text,
  message_type text,
  media_url text,
  sender text NOT NULL,
  external_id text NOT NULL,
  status text,
  created_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  UNIQUE (whatsapp_connection_id, external_id, sender)
);

CREATE TABLE public.talkx_recipients (
  contact_id uuid NOT NULL,
  sent_at timestamptz
);

CREATE OR REPLACE FUNCTION public.talkx_suppress_contact(
  p_contact_id uuid,
  p_phone text,
  p_reason text,
  p_reason_code text,
  p_origin text,
  p_message_id uuid
)
RETURNS uuid
LANGUAGE sql
AS $$ SELECT gen_random_uuid() $$;

CREATE OR REPLACE FUNCTION public.attribute_talkx_reply(p_contact_id uuid, p_phone text, p_message_id uuid)
RETURNS jsonb
LANGUAGE sql
AS $$ SELECT jsonb_build_object('attributed', true, 'message_id', p_message_id) $$;

CREATE OR REPLACE FUNCTION public.attribute_multiplix_item_reply(p_phone text, p_message_id text, p_quoted_external_id text)
RETURNS jsonb
LANGUAGE sql
AS $$ SELECT jsonb_build_object('attributed', true, 'message_id', p_message_id, 'quoted_external_id', p_quoted_external_id) $$;

CREATE OR REPLACE FUNCTION public.talkx_match_optout(p_text text)
RETURNS text
LANGUAGE sql STABLE
AS $$ SELECT NULL::text $$;

\echo 'case_a_fresh_without_69_apply'
\ir ../supabase/migrations/20261011180000_indeterminate_optout_outbox.sql
SELECT public.proof_assert(to_regclass('public.inbound_message_effects') IS NOT NULL, 'case A: table was not created on fresh base');
SELECT public.proof_assert(to_regprocedure('public.drain_inbound_message_effects(uuid,text)') IS NOT NULL, 'case A: drain function was not created');
SELECT public.proof_assert(
  EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.inbound_message_effects'::regclass
      AND conname = 'inbound_message_effects_effect_check'
      AND pg_get_constraintdef(oid) LIKE '%optout_resolve%'
  ),
  'case A: CHECK does not allow optout_resolve'
);

DO $rollback_20261011180000$
DECLARE
  v_created_by_this_migration boolean := false;
BEGIN
  DROP FUNCTION IF EXISTS public.ingest_inbound_message(uuid, text, text, text, text, text, text, timestamptz, boolean, text, text, text);
  DROP FUNCTION IF EXISTS public.drain_inbound_message_effects(uuid, text);

  IF to_regclass('public.inbound_message_effects') IS NOT NULL THEN
    v_created_by_this_migration := coalesce(obj_description('public.inbound_message_effects'::regclass, 'pg_class'), '') LIKE '%20261011180000:created-table%';
    IF v_created_by_this_migration THEN
      DROP TABLE public.inbound_message_effects;
    ELSE
      DELETE FROM public.inbound_message_effects WHERE effect = 'optout_resolve';
      ALTER TABLE public.inbound_message_effects
        DROP CONSTRAINT IF EXISTS inbound_message_effects_effect_check,
        ADD CONSTRAINT inbound_message_effects_effect_check
          CHECK (effect IN ('optout_suppress', 'talkx_reply', 'multiplix_reply'));
      COMMENT ON CONSTRAINT inbound_message_effects_effect_check ON public.inbound_message_effects IS NULL;
    END IF;
  END IF;
END;
$rollback_20261011180000$;

SELECT public.proof_assert(to_regclass('public.inbound_message_effects') IS NULL, 'case A rollback: table created by migration was not dropped');
SELECT public.proof_assert(to_regprocedure('public.drain_inbound_message_effects(uuid,text)') IS NULL, 'case A rollback: drain function remained');

\echo 'case_b_preexisting_69_apply_and_rollback'
CREATE TABLE public.inbound_message_effects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  whatsapp_connection_id uuid NOT NULL,
  external_id text NOT NULL,
  effect text NOT NULL CHECK (effect IN ('optout_suppress', 'talkx_reply', 'multiplix_reply')),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  attempts integer NOT NULL DEFAULT 0,
  applied_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT statement_timestamp()
);
COMMENT ON TABLE public.inbound_message_effects IS 'preexisting #69 outbox';
INSERT INTO public.inbound_message_effects (id, whatsapp_connection_id, external_id, effect, payload)
VALUES (
  '40000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001',
  'preexisting-message',
  'talkx_reply',
  '{}'::jsonb
);

\ir ../supabase/migrations/20261011180000_indeterminate_optout_outbox.sql
INSERT INTO public.inbound_message_effects (whatsapp_connection_id, external_id, effect, payload)
VALUES ('10000000-0000-0000-0000-000000000001', 'pending-optout', 'optout_resolve', '{}'::jsonb);
SELECT public.proof_assert(
  EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.inbound_message_effects'::regclass
      AND conname = 'inbound_message_effects_effect_check'
      AND pg_get_constraintdef(oid) LIKE '%optout_resolve%'
  ),
  'case B: migration did not extend preexisting CHECK'
);

DO $rollback_20261011180000$
DECLARE
  v_created_by_this_migration boolean := false;
BEGIN
  DROP FUNCTION IF EXISTS public.ingest_inbound_message(uuid, text, text, text, text, text, text, timestamptz, boolean, text, text, text);
  DROP FUNCTION IF EXISTS public.drain_inbound_message_effects(uuid, text);

  IF to_regclass('public.inbound_message_effects') IS NOT NULL THEN
    v_created_by_this_migration := coalesce(obj_description('public.inbound_message_effects'::regclass, 'pg_class'), '') LIKE '%20261011180000:created-table%';
    IF v_created_by_this_migration THEN
      DROP TABLE public.inbound_message_effects;
    ELSE
      DELETE FROM public.inbound_message_effects WHERE effect = 'optout_resolve';
      ALTER TABLE public.inbound_message_effects
        DROP CONSTRAINT IF EXISTS inbound_message_effects_effect_check,
        ADD CONSTRAINT inbound_message_effects_effect_check
          CHECK (effect IN ('optout_suppress', 'talkx_reply', 'multiplix_reply'));
      COMMENT ON CONSTRAINT inbound_message_effects_effect_check ON public.inbound_message_effects IS NULL;
    END IF;
  END IF;
END;
$rollback_20261011180000$;

SELECT public.proof_assert(to_regclass('public.inbound_message_effects') IS NOT NULL, 'case B rollback: preexisting table was dropped');
SELECT public.proof_assert(
  (SELECT count(*) FROM public.inbound_message_effects WHERE id = '40000000-0000-0000-0000-000000000001') = 1,
  'case B rollback: preexisting row was removed'
);
SELECT public.proof_assert(
  (SELECT count(*) FROM public.inbound_message_effects WHERE effect = 'optout_resolve') = 0,
  'case B rollback: optout_resolve rows remained'
);
SELECT public.proof_assert(
  EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.inbound_message_effects'::regclass
      AND conname = 'inbound_message_effects_effect_check'
      AND pg_get_constraintdef(oid) NOT LIKE '%optout_resolve%'
  ),
  'case B rollback: CHECK still allows optout_resolve'
);
DROP TABLE public.inbound_message_effects;

\echo 'case_c_optout_resolve_error_remains_pending'
\ir ../supabase/migrations/20261011180000_indeterminate_optout_outbox.sql
CREATE OR REPLACE FUNCTION public.talkx_match_optout(p_text text)
RETURNS text
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'indeterminate_mock';
END;
$$;

INSERT INTO public.messages (id, whatsapp_connection_id, sender, external_id, content, created_at)
VALUES (
  '30000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001',
  'contact',
  'case-c-message',
  'talvez remover',
  statement_timestamp()
);

INSERT INTO public.inbound_message_effects (id, whatsapp_connection_id, external_id, effect, payload, created_at)
VALUES (
  '50000000-0000-0000-0000-000000000002',
  '10000000-0000-0000-0000-000000000001',
  'case-c-message',
  'talkx_reply',
  jsonb_build_object(
    'contact_id', '20000000-0000-0000-0000-000000000001',
    'phone', '5511999990001',
    'message_id', '30000000-0000-0000-0000-000000000001'
  ),
  statement_timestamp() - interval '2 seconds'
),
(
  '50000000-0000-0000-0000-000000000003',
  '10000000-0000-0000-0000-000000000001',
  'case-c-message',
  'multiplix_reply',
  jsonb_build_object(
    'phone', '5511999990001',
    'message_id', '30000000-0000-0000-0000-000000000001',
    'quoted_external_id', 'quoted-1'
  ),
  statement_timestamp() - interval '1 second'
),
(
  '50000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001',
  'case-c-message',
  'optout_resolve',
  jsonb_build_object(
    'contact_id', '20000000-0000-0000-0000-000000000001',
    'phone', '5511999990001',
    'message_id', '30000000-0000-0000-0000-000000000001',
    'text', 'talvez remover',
    'quoted_external_id', 'quoted-1'
  ),
  statement_timestamp()
);

SELECT set_config('request.jwt.claim.role', 'service_role', false);
SELECT public.drain_inbound_message_effects('10000000-0000-0000-0000-000000000001', 'case-c-message') AS drain_result;
SELECT public.proof_assert(
  (SELECT applied_at IS NOT NULL AND last_error IS NULL
     FROM public.inbound_message_effects
    WHERE id = '50000000-0000-0000-0000-000000000002'),
  'case C: talkx_reply branch from #69 remains applied'
);
SELECT public.proof_assert(
  (SELECT applied_at IS NOT NULL AND last_error IS NULL
     FROM public.inbound_message_effects
    WHERE id = '50000000-0000-0000-0000-000000000003'),
  'case C: multiplix_reply branch from #69 remains applied'
);
SELECT public.proof_assert(
  (SELECT applied_at IS NULL AND attempts = 1 AND last_error LIKE '%indeterminate_mock%'
   FROM public.inbound_message_effects
   WHERE id = '50000000-0000-0000-0000-000000000001'),
  'case C: optout_resolve error was not kept pending with last_error'
);

\echo 'proof_ok'
