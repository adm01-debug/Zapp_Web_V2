-- E51: Supresssao v2 — phone avuño, reason_code enum, expires_at, source_message_id

-- 1. Enum reason_code
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'talkx_blacklist_reason') THEN
    CREATE TYPE public.talkx_blacklist_reason AS ENUM (
      'opt_out',
      'invalid_number',
      'manual',
      'lgpd',
      'no_commercial_permission',
      'bounce'
    );
  END IF;
END $$;

-- 2. Novas colunas em talkx_blacklist
ALTER TABLE public.talkx_blacklist
  ADD COLUMN IF NOT EXISTS phone          text,
  ADD COLUMN IF NOT EXISTS reason_code    public.talkx_blacklist_reason,
  ADD COLUMN IF NOT EXISTS expires_at     timestamptz,
  ADD COLUMN IF NOT EXISTS source_message_id uuid REFERENCES public.messages(id) ON DELETE SET NULL;

-- Tornar contact_id nullable (telefone sem contato)
ALTER TABLE public.talkx_blacklist
  ALTER COLUMN contact_id DROP NOT NULL;

-- 3. Check: phone OU contact_id obrigatorio
ALTER TABLE public.talkx_blacklist
  DROP CONSTRAINT IF EXISTS talkx_blacklist_phone_or_contact,
  ADD CONSTRAINT talkx_blacklist_phone_or_contact
    CHECK (phone IS NOT NULL OR contact_id IS NOT NULL);

-- 4. Indice no phone para lookup rápido
CREATE INDEX IF NOT EXISTS idx_talkx_blacklist_phone
  ON public.talkx_blacklist (phone)
  WHERE phone IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_talkx_blacklist_expires_at
  ON public.talkx_blacklist (expires_at)
  WHERE expires_at IS NOT NULL;
