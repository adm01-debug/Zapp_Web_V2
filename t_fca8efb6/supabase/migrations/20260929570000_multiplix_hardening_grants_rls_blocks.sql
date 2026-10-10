-- 20260929570000_multiplix_hardening_grants_rls_blocks
-- Bloco A (F01, F02, F03) do docs/multiplix/PLANO_FINALIZACAO_MULTIPLIX_100_ETAPAS_2026-09-29.md.
--
-- F01 — grants. anon tinha SELECT/INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER
-- nas tres tabelas do modulo (default privilege do Supabase). Nada in anon usa o
-- modulo (a edge autentica por x-cron-secret/service-role e o front por JWT) e
-- TRUNCATE nao passa por RLS: qualquer portador da anon key — que e publica por
-- definicao — podia esvaziar a fila de disparo. authenticated fica com o minimo
-- que as policies usam: SELECT/INSERT/UPDATE/DELETE. TRUNCATE, REFERENCES e
-- TRIGGER saem tambem (nao ha caso de uso: nenhuma FK aponta para estas tabelas
-- nem trigger de usuario e criado por staff).
--
-- F02 — FORCE ROW LEVEL SECURITY. As tres tabelas pertencem a postgres; sem
-- FORCE, o dono e isento de RLS. postgres tem BYPASSRLS, entao as RPCs SECURITY
-- DEFINER (dono postgres) continuam escrevendo normalmente — o FORCE nao muda o
-- motor, so fecha a porta para qualquer role proprietaria sem BYPASSRLS.
--
-- F03 — as 4 policies de multiplix_blocks eram TO public (roles={public}), sem
-- gate de staff e sem exigir rascunho: qualquer role — inclusive anon — lia e
-- escrevia blocos de qualquer dispatch. Passam a exigir authenticated +
-- is_admin_or_supervisor + dispatch em 'draft' para escrita.
--
-- Nenhuma linha existe nas tres tabelas (0 dispatches, 0 recipients, 0 blocks):
-- nao ha backfill nem janela de inconsistencia.

-- === F01: anon fora; authenticated so com DML ===
REVOKE ALL ON TABLE public.multiplix_dispatches FROM anon;
REVOKE ALL ON TABLE public.multiplix_recipients FROM anon;
REVOKE ALL ON TABLE public.multiplix_blocks FROM anon;

REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLE public.multiplix_dispatches FROM authenticated;
REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLE public.multiplix_recipients FROM authenticated;
REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLE public.multiplix_blocks FROM authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.multiplix_dispatches TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.multiplix_recipients TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.multiplix_blocks TO authenticated;

-- === F02: FORCE RLS nas tres tabelas ===
ALTER TABLE public.multiplix_dispatches FORCE ROW LEVEL SECURITY;
ALTER TABLE public.multiplix_recipients FORCE ROW LEVEL SECURITY;
ALTER TABLE public.multiplix_blocks FORCE ROW LEVEL SECURITY;

-- === F03: policies de multiplix_blocks ===
DROP POLICY IF EXISTS "Users can view blocks of accessible dispatches" ON public.multiplix_blocks;
CREATE POLICY "Users can view blocks of accessible dispatches" ON public.multiplix_blocks
  FOR SELECT
  TO authenticated
  USING (
    public.is_admin_or_supervisor(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.multiplix_dispatches md
      WHERE md.id = multiplix_blocks.dispatch_id
        AND (
          md.created_by = (SELECT profiles.id FROM public.profiles WHERE profiles.user_id = auth.uid() LIMIT 1)
          OR public.is_admin_or_supervisor(auth.uid())
        )
    )
  );

DROP POLICY IF EXISTS "Users can insert blocks into own draft dispatches" ON public.multiplix_blocks;
CREATE POLICY "Users can insert blocks into own draft dispatches" ON public.multiplix_blocks
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_admin_or_supervisor(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.multiplix_dispatches md
      WHERE md.id = multiplix_blocks.dispatch_id
        AND md.created_by = (SELECT profiles.id FROM public.profiles WHERE profiles.user_id = auth.uid() LIMIT 1)
        AND md.status = 'draft'
    )
  );

DROP POLICY IF EXISTS "Users can update blocks of own draft dispatches" ON public.multiplix_blocks;
CREATE POLICY "Users can update blocks of own draft dispatches" ON public.multiplix_blocks
  FOR UPDATE
  TO authenticated
  USING (
    public.is_admin_or_supervisor(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.multiplix_dispatches md
      WHERE md.id = multiplix_blocks.dispatch_id
        AND md.created_by = (SELECT profiles.id FROM public.profiles WHERE profiles.user_id = auth.uid() LIMIT 1)
        AND md.status = 'draft'
    )
  )
  WITH CHECK (
    public.is_admin_or_supervisor(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.multiplix_dispatches md
      WHERE md.id = multiplix_blocks.dispatch_id
        AND md.created_by = (SELECT profiles.id FROM public.profiles WHERE profiles.user_id = auth.uid() LIMIT 1)
        AND md.status = 'draft'
    )
  );

DROP POLICY IF EXISTS "Users can delete blocks of own draft dispatches" ON public.multiplix_blocks;
CREATE POLICY "Users can delete blocks of own draft dispatches" ON public.multiplix_blocks
  FOR DELETE
  TO authenticated
  USING (
    public.is_admin_or_supervisor(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.multiplix_dispatches md
      WHERE md.id = multiplix_blocks.dispatch_id
        AND md.created_by = (SELECT profiles.id FROM public.profiles WHERE profiles.user_id = auth.uid() LIMIT 1)
        AND md.status = 'draft'
    )
  );
