-- Rollback: remover colunas import_batch_id e removal_reason, drop da trigger, function e policy
-- Rollback (SQL executável, na ordem):
--   DROP POLICY IF EXISTS talkx_blacklist_no_delete ON public.talkx_blacklist;
--   DROP TRIGGER IF EXISTS trg_talkx_blacklist_audit ON public.talkx_blacklist;
--   DROP FUNCTION IF EXISTS public.talkx_blacklist_audit_trigger();
--   ALTER TABLE public.talkx_blacklist DROP COLUMN IF EXISTS import_batch_id;
--   ALTER TABLE public.talkx_blacklist DROP COLUMN IF EXISTS removal_reason;

-- =============================================================================
-- Talk X blacklist: trilha de auditoria e trigger de normalização
-- =============================================================================

-- 1. Novas colunas para trilha de auditoria
ALTER TABLE public.talkx_blacklist
  ADD COLUMN IF NOT EXISTS import_batch_id uuid,
  ADD COLUMN IF NOT EXISTS removal_reason text;

-- 2. Trigger function: normaliza phone, preenche reason_code, força blocked_by/removed_by
CREATE OR REPLACE FUNCTION public.talkx_blacklist_audit_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Normaliza telefone: só dígitos, valida formato 10-15 dígitos
  IF NEW.phone IS NOT NULL THEN
    NEW.phone := regexp_replace(NEW.phone, '[^0-9]', '', 'g');
    IF NEW.phone !~ '^[0-9]{10,15}$' THEN
      NEW.phone := NULL;
    END IF;
  END IF;

  -- Preenche reason_code a partir de origin quando nulo
  IF NEW.reason_code IS NULL AND NEW.origin IS NOT NULL THEN
    BEGIN
      NEW.reason_code := NEW.origin::public.talkx_blacklist_reason;
    EXCEPTION WHEN others THEN
      NULL; -- origin não mapeia para enum, deixa reason_code nulo
    END;
  END IF;

  -- Força blocked_by para auth.uid() em INSERT
  IF TG_OP = 'INSERT' AND NEW.blocked_by IS NULL THEN
    NEW.blocked_by := auth.uid();
  END IF;

  -- Força removed_by para auth.uid() quando removed_at é preenchido
  IF NEW.removed_at IS NOT NULL AND NEW.removed_by IS NULL THEN
    NEW.removed_by := auth.uid();
  END IF;

  RETURN NEW;
END;
$$;

-- 3. Trigger BEFORE INSERT OR UPDATE
CREATE TRIGGER trg_talkx_blacklist_audit
  BEFORE INSERT OR UPDATE ON public.talkx_blacklist
  FOR EACH ROW
  EXECUTE FUNCTION public.talkx_blacklist_audit_trigger();

-- 4. Rejeita DELETE físico — só remoção lógica via removed_at
CREATE POLICY talkx_blacklist_no_delete
  ON public.talkx_blacklist
  FOR DELETE
  TO authenticated
  USING (false);