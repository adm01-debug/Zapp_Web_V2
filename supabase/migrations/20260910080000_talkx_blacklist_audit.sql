-- E56: audit log de supressão -- removed_by + removed_at
ALTER TABLE public.talkx_blacklist
  ADD COLUMN IF NOT EXISTS removed_by  uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS removed_at  timestamptz;

-- Soft-delete: marcar como removido sem apagar (preserva historico de supressão)
-- A funcao de remoção do cliente passa a fazer UPDATE em vez de DELETE
-- DELETE real só ocorre via job de limpeza (E89+)

-- 3. Adicionar auto_optout ao CHECK constraint de origin (precisa dropar e recriar)
ALTER TABLE public.talkx_blacklist DROP CONSTRAINT IF EXISTS talkx_blacklist_origin_check;
ALTER TABLE public.talkx_blacklist
  ADD CONSTRAINT talkx_blacklist_origin_check
  CHECK (origin IN ('manual', 'optout', 'system', 'lgpd', 'list', 'auto_optout'));

-- 4. RLS UPDATE policy para soft-delete
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'talkx_blacklist_update' AND tablename = 'talkx_blacklist') THEN
    CREATE POLICY "talkx_blacklist_update"
      ON public.talkx_blacklist FOR UPDATE
      TO authenticated
      USING (public.is_admin_or_supervisor(auth.uid()))
      WITH CHECK (public.is_admin_or_supervisor(auth.uid()));
  END IF;
END $$;
