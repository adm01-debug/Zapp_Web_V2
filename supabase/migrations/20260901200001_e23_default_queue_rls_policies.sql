-- e23_default_queue_rls_policies
-- Migration legada: statements não foram rastreados no ledger (statements=null).
-- SQL reconstituído a partir do estado atual do banco (pg_policies) em 2026-09-01.
-- Adiciona políticas RLS padrão para as tabelas de fila.
-- AVISO: verificação de hash desabilitada pelo check-migration-drift (ledger sem statements).

-- queues
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='queues' AND policyname='Admins can manage queues') THEN
    CREATE POLICY "Admins can manage queues"
      ON public.queues FOR ALL TO authenticated
      USING (is_admin_or_supervisor(auth.uid()))
      WITH CHECK (is_admin_or_supervisor(auth.uid()));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='queues' AND policyname='Authenticated users can view queues') THEN
    CREATE POLICY "Authenticated users can view queues"
      ON public.queues FOR SELECT TO authenticated
      USING (true);
  END IF;
END $$;

-- queue_members
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='queue_members' AND policyname='Admins can manage queue members') THEN
    CREATE POLICY "Admins can manage queue members"
      ON public.queue_members FOR ALL TO authenticated
      USING (is_admin_or_supervisor(auth.uid()))
      WITH CHECK (is_admin_or_supervisor(auth.uid()));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='queue_members' AND policyname='Queue members visible to admins or self') THEN
    CREATE POLICY "Queue members visible to admins or self"
      ON public.queue_members FOR SELECT TO authenticated
      USING (is_admin_or_supervisor(auth.uid()) OR profile_id = (SELECT id FROM profiles WHERE user_id = auth.uid() LIMIT 1));
  END IF;
END $$;

-- queue_goals
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='queue_goals' AND policyname='Admins can manage queue goals') THEN
    CREATE POLICY "Admins can manage queue goals"
      ON public.queue_goals FOR ALL TO authenticated
      USING (is_admin_or_supervisor(auth.uid()))
      WITH CHECK (is_admin_or_supervisor(auth.uid()));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='queue_goals' AND policyname='Authenticated users can view queue goals') THEN
    CREATE POLICY "Authenticated users can view queue goals"
      ON public.queue_goals FOR SELECT TO authenticated
      USING (true);
  END IF;
END $$;

-- queue_positions
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='queue_positions' AND policyname='Admins can manage queue positions') THEN
    CREATE POLICY "Admins can manage queue positions"
      ON public.queue_positions FOR ALL TO authenticated
      USING (is_admin_or_supervisor(auth.uid()))
      WITH CHECK (is_admin_or_supervisor(auth.uid()));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='queue_positions' AND policyname='Users can view queue positions') THEN
    CREATE POLICY "Users can view queue positions"
      ON public.queue_positions FOR SELECT TO authenticated
      USING (contact_id IN (SELECT c.id FROM contacts c WHERE c.assigned_to IN (SELECT p.id FROM profiles p WHERE p.user_id = auth.uid())) OR is_admin_or_supervisor(auth.uid()));
  END IF;
END $$;

-- queue_skill_requirements
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='queue_skill_requirements' AND policyname='Admins can manage queue skills') THEN
    CREATE POLICY "Admins can manage queue skills"
      ON public.queue_skill_requirements FOR ALL TO authenticated
      USING (is_admin_or_supervisor(auth.uid()));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='queue_skill_requirements' AND policyname='Authenticated can view queue skills') THEN
    CREATE POLICY "Authenticated can view queue skills"
      ON public.queue_skill_requirements FOR SELECT TO authenticated
      USING (true);
  END IF;
END $$;
