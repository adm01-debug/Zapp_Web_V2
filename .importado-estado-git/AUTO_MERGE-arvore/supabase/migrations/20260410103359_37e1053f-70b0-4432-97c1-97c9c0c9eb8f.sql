
-- 1. CAMPAIGNS - restrict to admin/supervisor or creator
DO $$ BEGIN
  EXECUTE (SELECT string_agg(format('DROP POLICY IF EXISTS %I ON public.campaigns', policyname), '; ')
    FROM pg_policies WHERE tablename = 'campaigns' AND cmd = 'SELECT');
END $$;

CREATE POLICY "Campaigns visible to admins or creator"
ON public.campaigns FOR SELECT TO authenticated
USING (
  public.is_admin_or_supervisor(auth.uid())
  OR created_by = (SELECT id FROM public.profiles WHERE user_id = auth.uid() LIMIT 1)
);

-- 2. SLA_RULES - restrict to admin/supervisor
DO $$ BEGIN
  EXECUTE (SELECT string_agg(format('DROP POLICY IF EXISTS %I ON public.sla_rules', policyname), '; ')
    FROM pg_policies WHERE tablename = 'sla_rules' AND cmd = 'SELECT');
END $$;

CREATE POLICY "SLA rules visible to admins only"
ON public.sla_rules FOR SELECT TO authenticated
USING (public.is_admin_or_supervisor(auth.uid()));

-- 3. GEO_BLOCKING_SETTINGS - restrict to admin/supervisor
DO $$ BEGIN
  EXECUTE (SELECT string_agg(format('DROP POLICY IF EXISTS %I ON public.geo_blocking_settings', policyname), '; ')
    FROM pg_policies WHERE tablename = 'geo_blocking_settings' AND cmd = 'SELECT');
END $$;

CREATE POLICY "Geo blocking visible to admins only"
ON public.geo_blocking_settings FOR SELECT TO authenticated
USING (public.is_admin_or_supervisor(auth.uid()));

-- 4. CLIENT_WALLET_RULES - restrict to admin/supervisor
DO $$ BEGIN
  EXECUTE (SELECT string_agg(format('DROP POLICY IF EXISTS %I ON public.client_wallet_rules', policyname), '; ')
    FROM pg_policies WHERE tablename = 'client_wallet_rules' AND cmd = 'SELECT');
END $$;

CREATE POLICY "Wallet rules visible to admins only"
ON public.client_wallet_rules FOR SELECT TO authenticated
USING (public.is_admin_or_supervisor(auth.uid()));

-- 5. AUTOMATIONS - restrict to admin/supervisor
DO $$ BEGIN
  EXECUTE (SELECT string_agg(format('DROP POLICY IF EXISTS %I ON public.automations', policyname), '; ')
    FROM pg_policies WHERE tablename = 'automations' AND cmd = 'SELECT');
END $$;

CREATE POLICY "Automations visible to admins only"
ON public.automations FOR SELECT TO authenticated
USING (public.is_admin_or_supervisor(auth.uid()));

-- 6. QUEUE_MEMBERS - restrict to admin/supervisor or own membership
DO $$ BEGIN
  EXECUTE (SELECT string_agg(format('DROP POLICY IF EXISTS %I ON public.queue_members', policyname), '; ')
    FROM pg_policies WHERE tablename = 'queue_members' AND cmd = 'SELECT');
END $$;

CREATE POLICY "Queue members visible to admins or self"
ON public.queue_members FOR SELECT TO authenticated
USING (
  public.is_admin_or_supervisor(auth.uid())
  OR profile_id = (SELECT id FROM public.profiles WHERE user_id = auth.uid() LIMIT 1)
);
