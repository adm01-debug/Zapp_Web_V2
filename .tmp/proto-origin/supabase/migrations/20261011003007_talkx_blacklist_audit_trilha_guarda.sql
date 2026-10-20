-- 20261011003007_talkx_blacklist_audit_trilha_guarda (N-107: lista de bloqueio guarda trilha e nao apaga linha)
-- Rollback: DROP POLICY IF EXISTS talkx_blacklist_no_delete ON public.talkx_blacklist; DROP TRIGGER IF EXISTS trg_talkx_blacklist_no_delete ON public.talkx_blacklist; DROP FUNCTION IF EXISTS public.talkx_blacklist_no_delete(); DROP TRIGGER IF EXISTS trg_talkx_blacklist_audit ON public.talkx_blacklist; DROP FUNCTION IF EXISTS public.talkx_blacklist_audit_trigger(); ALTER TABLE public.talkx_blacklist DROP COLUMN IF EXISTS import_batch_id; ALTER TABLE public.talkx_blacklist DROP COLUMN IF EXISTS removal_reason;
-- Rollback (SQL executável, na ordem — espelho comentado da linha 2):
--   DROP POLICY IF EXISTS talkx_blacklist_no_delete ON public.talkx_blacklist;
--   DROP TRIGGER IF EXISTS trg_talkx_blacklist_no_delete ON public.talkx_blacklist;
--   DROP FUNCTION IF EXISTS public.talkx_blacklist_no_delete();
--   DROP TRIGGER IF EXISTS trg_talkx_blacklist_audit ON public.talkx_blacklist;
--   DROP FUNCTION IF EXISTS public.talkx_blacklist_audit_trigger();
--   ALTER TABLE public.talkx_blacklist DROP COLUMN IF EXISTS import_batch_id;
--   ALTER TABLE public.talkx_blacklist DROP COLUMN IF EXISTS removal_reason;

-- =============================================================================
-- N-107 Talk X banco: lista de bloqueio guarda trilha e nao apaga linha.
-- 1) Colunas de trilha: import_batch_id (lote de origem) e removal_reason
--    (motivo do desbloqueio). removed_by/removed_at/blocked_by ja existem
--    (20260409013057 e 20260910080000); esta migration NAO os recria.
-- 2) Trigger BEFORE INSERT OR UPDATE: normaliza phone, preenche reason_code
--    por origin e FORCA a autoria para o perfil do chamador (anti-forja):
--    blocked_by no INSERT (no UPDATE o valor original e preservado quando
--    autenticado) e removed_by SOMENTE na transicao NULL -> preenchido de
--    removed_at; linha ja removida que continua removida preserva
--    removed_by/removed_at. Com auth.uid() nulo (service_role/
--    backend, ex. a RPC talkx_suppress_contact) o valor informado e mantido.
--    A autoria e o profiles.id do chamador (lookup por user_id = auth.uid()),
--    NAO o auth.uid() cru: profiles.id e gen_random_uuid() distinto de
--    auth.users.id (20251215024517) e as colunas referenciam profiles(id);
--    gravar o uid cru quebraria a FK (23503) em todo INSERT autenticado.
--    Sem linha em profiles para o uid, a coluna fica NULL (nula e sem forja).
-- 3) Barreira real contra DELETE fisico: trigger BEFORE DELETE que levanta
--    excecao para QUALQUER papel (authenticated, service_role e dono), mais
--    policy talkx_blacklist_no_delete USING (false) para authenticated.
--    Remocao logica continua via UPDATE de removed_at/removed_by.
-- Idempotente: IF NOT EXISTS / OR REPLACE / DROP IF EXISTS antes do CREATE.
-- =============================================================================

-- 1. Colunas de trilha
ALTER TABLE public.talkx_blacklist
  ADD COLUMN IF NOT EXISTS import_batch_id uuid,
  ADD COLUMN IF NOT EXISTS removal_reason text;

-- 2. Trigger function de auditoria/normalizacao
CREATE OR REPLACE FUNCTION public.talkx_blacklist_audit_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Normaliza telefone: so digitos, formato 10-15 digitos; invalido vira NULL
  IF NEW.phone IS NOT NULL THEN
    NEW.phone := regexp_replace(NEW.phone, '[^0-9]', '', 'g');
    IF NEW.phone !~ '^[0-9]{10,15}$' THEN
      NEW.phone := NULL;
    END IF;
  END IF;

  -- Preenche reason_code a partir de origin quando nulo (ex. 'manual','lgpd');
  -- origin sem correspondente no enum (ex. 'optout','auto_optout') mantem NULL
  IF NEW.reason_code IS NULL AND NEW.origin IS NOT NULL THEN
    BEGIN
      NEW.reason_code := NEW.origin::public.talkx_blacklist_reason;
    EXCEPTION WHEN others THEN
      NULL;
    END;
  END IF;

  -- Forca blocked_by para o perfil do chamador no INSERT (sobrescreve o
  -- valor enviado pelo cliente); com auth.uid() nulo mantem o informado.
  -- No UPDATE o blocked_by original e preservado quando autenticado
  -- (N-107: a trilha de quem bloqueou nao muda depois do INSERT).
  IF TG_OP = 'INSERT' AND auth.uid() IS NOT NULL THEN
    NEW.blocked_by := (SELECT p.id FROM public.profiles p WHERE p.user_id = auth.uid() LIMIT 1);
  ELSIF TG_OP = 'UPDATE' AND auth.uid() IS NOT NULL THEN
    NEW.blocked_by := OLD.blocked_by;
  END IF;

  -- Forca removed_by para o perfil do chamador SOMENTE na transicao
  -- NULL -> preenchido de removed_at (o ato de remover); com auth.uid()
  -- nulo mantem o informado (service_role/backend, ex. talkx_suppress_contact).
  -- Linha ja removida que continua removida preserva a trilha original
  -- (removed_by e removed_at), para que editar removal_reason ou outro
  -- campo nao troque o autor da remocao.
  IF NEW.removed_at IS NOT NULL AND auth.uid() IS NOT NULL
     AND (TG_OP = 'INSERT' OR OLD.removed_at IS NULL) THEN
    NEW.removed_by := (SELECT p.id FROM public.profiles p WHERE p.user_id = auth.uid() LIMIT 1);
  ELSIF TG_OP = 'UPDATE' AND OLD.removed_at IS NOT NULL AND NEW.removed_at IS NOT NULL THEN
    NEW.removed_by := OLD.removed_by;
    NEW.removed_at := OLD.removed_at;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.talkx_blacklist_audit_trigger() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_talkx_blacklist_audit ON public.talkx_blacklist;
CREATE TRIGGER trg_talkx_blacklist_audit
  BEFORE INSERT OR UPDATE ON public.talkx_blacklist
  FOR EACH ROW
  EXECUTE FUNCTION public.talkx_blacklist_audit_trigger();

-- 3. Barreira contra DELETE fisico (vale para todo papel, inclusive
-- service_role e dono da tabela, que passam ao largo do RLS)
CREATE OR REPLACE FUNCTION public.talkx_blacklist_no_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RAISE EXCEPTION 'talkx_blacklist_delete_bloqueado: use remocao logica via removed_at';
END;
$$;

REVOKE ALL ON FUNCTION public.talkx_blacklist_no_delete() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_talkx_blacklist_no_delete ON public.talkx_blacklist;
CREATE TRIGGER trg_talkx_blacklist_no_delete
  BEFORE DELETE ON public.talkx_blacklist
  FOR EACH ROW
  EXECUTE FUNCTION public.talkx_blacklist_no_delete();

DROP POLICY IF EXISTS talkx_blacklist_no_delete ON public.talkx_blacklist;
CREATE POLICY talkx_blacklist_no_delete
  ON public.talkx_blacklist
  FOR DELETE
  TO authenticated
  USING (false);
