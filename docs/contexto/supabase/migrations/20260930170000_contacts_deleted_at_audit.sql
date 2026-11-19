CREATE TABLE IF NOT EXISTS public.contact_deletion_audit (
  id                   bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  contact_id           uuid        NOT NULL,
  operation            text        NOT NULL,
  deleted_at_from      timestamptz,
  deleted_at_to        timestamptz,
  performed_by         uuid,
  performed_by_profile uuid,
          performed_by_db_role text        NOT NULL DEFAULT session_user,
  performed_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT contact_deletion_audit_operation_check
    CHECK (operation IN ('delete', 'restore', 'update_marker', 'purge')),
    CONSTRAINT contact_deletion_audit_shape_check CHECK (
    (operation = 'delete'        AND deleted_at_from IS NULL     AND deleted_at_to IS NOT NULL) OR
    (operation = 'restore'       AND deleted_at_from IS NOT NULL AND deleted_at_to IS NULL)     OR
    (operation = 'purge'         AND deleted_at_from IS NOT DISTINCT FROM deleted_at_to)        OR
    (operation = 'update_marker' AND deleted_at_from IS NOT NULL AND deleted_at_to IS NOT NULL
                                 AND deleted_at_from IS DISTINCT FROM deleted_at_to)
  )
)

ALTER TABLE public.contact_deletion_audit
  ADD COLUMN IF NOT EXISTS performed_by_db_role text NOT NULL DEFAULT session_user

ALTER TABLE public.contact_deletion_audit ENABLE ROW LEVEL SECURITY

REVOKE ALL ON TABLE public.contact_deletion_audit FROM PUBLIC, anon, authenticated, service_role

GRANT SELECT ON TABLE public.contact_deletion_audit TO authenticated

GRANT SELECT, INSERT ON TABLE public.contact_deletion_audit TO service_role

DROP POLICY IF EXISTS contact_deletion_audit_select_admin_supervisor ON public.contact_deletion_audit

CREATE POLICY contact_deletion_audit_select_admin_supervisor
ON public.contact_deletion_audit FOR SELECT TO authenticated
USING (public.is_admin_or_supervisor(auth.uid()))

DROP POLICY IF EXISTS contact_deletion_audit_block_authenticated_insert ON public.contact_deletion_audit

CREATE POLICY contact_deletion_audit_block_authenticated_insert
ON public.contact_deletion_audit FOR INSERT TO authenticated WITH CHECK (false)

DROP POLICY IF EXISTS contact_deletion_audit_block_authenticated_update ON public.contact_deletion_audit

CREATE POLICY contact_deletion_audit_block_authenticated_update
ON public.contact_deletion_audit FOR UPDATE TO authenticated USING (false) WITH CHECK (false)

DROP POLICY IF EXISTS contact_deletion_audit_block_authenticated_delete ON public.contact_deletion_audit

CREATE POLICY contact_deletion_audit_block_authenticated_delete
ON public.contact_deletion_audit FOR DELETE TO authenticated USING (false)

DO $drift_guard$ DECLARE v_faltando text; BEGIN
  SELECT string_agg(esperada.nome, ', ' ORDER BY esperada.nome) INTO v_faltando
  FROM (VALUES ('id'),('contact_id'),('operation'),('deleted_at_from'),('deleted_at_to'),
               ('performed_by'),('performed_by_profile'),('performed_by_db_role'),('performed_at')
       ) AS esperada(nome)
  WHERE NOT EXISTS (
    SELECT 1 FROM pg_attribute a
    JOIN pg_class c     ON c.oid = a.attrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'contact_deletion_audit'
      AND a.attname = esperada.nome AND a.attnum > 0 AND NOT a.attisdropped
  );
  IF v_faltando IS NOT NULL THEN
    RAISE EXCEPTION 'public.contact_deletion_audit tem forma divergente (drift): coluna(s) ausente(s): %. Nao adotar tabela estranha a trilha — reconciliar manualmente.', v_faltando;
  END IF;
END
$drift_guard$

CREATE INDEX IF NOT EXISTS idx_contact_deletion_audit_contact
  ON public.contact_deletion_audit (contact_id, performed_at DESC)

CREATE INDEX IF NOT EXISTS idx_contact_deletion_audit_recent
  ON public.contact_deletion_audit (performed_at DESC)

COMMENT ON TABLE public.contact_deletion_audit IS
  'Trilha append-only de exclusao/restauracao/purge de contato. Gravada por trigger em public.contacts; escrita so via SECURITY DEFINER; leitura so admin/supervisor.'

COMMENT ON COLUMN public.contact_deletion_audit.contact_id IS
  'id de public.contacts no momento do evento. Sem FK de proposito: purga nao pode apagar/rebaixar a trilha.'

COMMENT ON COLUMN public.contact_deletion_audit.operation IS
  'delete = soft-delete (NULL -> ts); restore = ts -> NULL; update_marker = ts trocado por outro ts (adulteracao); purge = DELETE fisico.'

COMMENT ON COLUMN public.contact_deletion_audit.deleted_at_from IS
  'contacts.deleted_at ANTES da mudanca (NULL = contato vivo). Valor gravado pelo CHAMADOR (relogio do cliente) — nao serve como tempo confiavel; use performed_at.'

COMMENT ON COLUMN public.contact_deletion_audit.deleted_at_to IS
  'contacts.deleted_at DEPOIS da mudanca (NULL = contato vivo). Mesma ressalva de relogio do de-from.'

COMMENT ON COLUMN public.contact_deletion_audit.performed_by IS
  'auth.uid() (claim `sub`) do chamador. NULL em TODO purge (DELETE fisico): quem apaga e service_role/postgres/dashboard_user e nenhum carrega `sub`. A autoria desses casos esta em performed_by_db_role.'

COMMENT ON COLUMN public.contact_deletion_audit.performed_by_db_role IS
  'session_user da conexao que executou a mudanca (R3). Sempre preenchido, inclusive no purge — e o unico autor da trilha quando performed_by e NULL.'

COMMENT ON COLUMN public.contact_deletion_audit.performed_by_profile IS
  'public.profiles.id correspondente a performed_by, resolvido na hora do evento.'

CREATE OR REPLACE FUNCTION public.audit_contact_deletion_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$ DECLARE v_operation text; BEGIN
  -- Limpeza (DELETE fisico): registra o marcador que a linha tinha ao ser apagada.
  IF TG_OP = 'DELETE' THEN
    INSERT INTO public.contact_deletion_audit
      (contact_id, operation, deleted_at_from, deleted_at_to, performed_by, performed_by_profile)
    VALUES (
      OLD.id, 'purge', OLD.deleted_at, OLD.deleted_at, auth.uid(),
      (SELECT p.id FROM public.profiles p WHERE p.user_id = auth.uid() LIMIT 1)
    );
    RETURN NULL;
  END IF;

  -- `AFTER UPDATE OF deleted_at` ja limita o disparo aos UPDATEs que citam a coluna no SET;
  -- este teste barra `SET deleted_at = deleted_at` e qualquer UPDATE que cite a coluna sem
  -- alterar o valor. Sem ele o cenario (iii) gravaria sujeira.
  IF OLD.deleted_at IS NOT DISTINCT FROM NEW.deleted_at THEN
    RETURN NULL;
  END IF;

  v_operation := CASE
    WHEN OLD.deleted_at IS NULL THEN 'delete'      -- NULL -> ts  (exclusao)
    WHEN NEW.deleted_at IS NULL THEN 'restore'     -- ts   -> NULL (restauracao)
    ELSE 'update_marker'                           -- ts   -> ts   (marcador reescrito)
  END;

  INSERT INTO public.contact_deletion_audit
    (contact_id, operation, deleted_at_from, deleted_at_to, performed_by, performed_by_profile)
  VALUES (
    NEW.id, v_operation, OLD.deleted_at, NEW.deleted_at, auth.uid(),
    (SELECT p.id FROM public.profiles p WHERE p.user_id = auth.uid() LIMIT 1)
  );

  RETURN NULL;
END;
$function$

REVOKE EXECUTE ON FUNCTION public.audit_contact_deletion_change() FROM PUBLIC, anon, authenticated, service_role

DROP TRIGGER IF EXISTS trg_audit_contact_deletion_change ON public.contacts

CREATE TRIGGER trg_audit_contact_deletion_change
AFTER UPDATE OF deleted_at ON public.contacts
FOR EACH ROW
EXECUTE FUNCTION public.audit_contact_deletion_change()

DROP TRIGGER IF EXISTS trg_audit_contact_purge ON public.contacts

CREATE TRIGGER trg_audit_contact_purge
AFTER DELETE ON public.contacts
FOR EACH ROW
EXECUTE FUNCTION public.audit_contact_deletion_change()
