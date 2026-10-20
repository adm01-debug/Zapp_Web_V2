
-- =====================================================
-- PHASE 4: Migrate ALL {public} role policies to {authenticated}
-- =====================================================

-- goals_configurations
DROP POLICY IF EXISTS "Users can view their own goals" ON public.goals_configurations;
CREATE POLICY "Users can view their own goals" ON public.goals_configurations
  FOR SELECT TO authenticated
  USING (profile_id IN (SELECT id FROM profiles WHERE user_id = auth.uid()) OR public.is_admin_or_supervisor(auth.uid()));

DROP POLICY IF EXISTS "Users can manage their own goals" ON public.goals_configurations;
CREATE POLICY "Users can manage their own goals" ON public.goals_configurations
  FOR ALL TO authenticated
  USING (profile_id IN (SELECT id FROM profiles WHERE user_id = auth.uid()) OR public.is_admin_or_supervisor(auth.uid()))
  WITH CHECK (profile_id IN (SELECT id FROM profiles WHERE user_id = auth.uid()) OR public.is_admin_or_supervisor(auth.uid()));

-- ip_whitelist
DROP POLICY IF EXISTS "Admins can manage IP whitelist" ON public.ip_whitelist;
CREATE POLICY "Admins can manage IP whitelist" ON public.ip_whitelist
  FOR ALL TO authenticated
  USING (public.is_admin_or_supervisor(auth.uid()))
  WITH CHECK (public.is_admin_or_supervisor(auth.uid()));

-- message_reactions
DROP POLICY IF EXISTS "Users can view reactions on accessible messages" ON public.message_reactions;
CREATE POLICY "Users can view reactions on accessible messages" ON public.message_reactions
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Users can delete their own reactions" ON public.message_reactions;
CREATE POLICY "Users can delete their own reactions" ON public.message_reactions
  FOR DELETE TO authenticated
  USING (user_id IN (SELECT id FROM profiles WHERE user_id = auth.uid()));

-- message_templates
DROP POLICY IF EXISTS "Users can view their templates and global ones" ON public.message_templates;
CREATE POLICY "Users can view their templates and global ones" ON public.message_templates
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR is_global = true);

DROP POLICY IF EXISTS "Users can create their own templates" ON public.message_templates;
CREATE POLICY "Users can create their own templates" ON public.message_templates
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can update their own templates" ON public.message_templates;
CREATE POLICY "Users can update their own templates" ON public.message_templates
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can delete their own templates" ON public.message_templates;
CREATE POLICY "Users can delete their own templates" ON public.message_templates
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- messages (SELECT and UPDATE)
DROP POLICY IF EXISTS "Users can view messages from their assigned contacts" ON public.messages;
CREATE POLICY "Users can view messages from their assigned contacts" ON public.messages
  FOR SELECT TO authenticated
  USING (
    contact_id IN (
      SELECT c.id FROM contacts c
      WHERE c.assigned_to IN (SELECT id FROM profiles WHERE user_id = auth.uid())
    ) OR public.is_admin_or_supervisor(auth.uid())
  );

DROP POLICY IF EXISTS "Users can update messages from their assigned contacts" ON public.messages;
CREATE POLICY "Users can update messages from their assigned contacts" ON public.messages
  FOR UPDATE TO authenticated
  USING (
    contact_id IN (
      SELECT c.id FROM contacts c
      WHERE c.assigned_to IN (SELECT id FROM profiles WHERE user_id = auth.uid())
    ) OR public.is_admin_or_supervisor(auth.uid())
  );

-- mfa_sessions
DROP POLICY IF EXISTS "Users can manage own MFA sessions" ON public.mfa_sessions;
CREATE POLICY "Users can manage own MFA sessions" ON public.mfa_sessions
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- passkey_credentials
DROP POLICY IF EXISTS "Users can view own passkeys" ON public.passkey_credentials;
CREATE POLICY "Users can view own passkeys" ON public.passkey_credentials
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can insert own passkeys" ON public.passkey_credentials;
CREATE POLICY "Users can insert own passkeys" ON public.passkey_credentials
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can update own passkeys" ON public.passkey_credentials;
CREATE POLICY "Users can update own passkeys" ON public.passkey_credentials
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can delete own passkeys" ON public.passkey_credentials;
CREATE POLICY "Users can delete own passkeys" ON public.passkey_credentials
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- permissions
DROP POLICY IF EXISTS "Anyone can view permissions" ON public.permissions;
CREATE POLICY "Authenticated can view permissions" ON public.permissions
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Admins can manage permissions" ON public.permissions;
CREATE POLICY "Admins can manage permissions" ON public.permissions
  FOR ALL TO authenticated
  USING (public.is_admin_or_supervisor(auth.uid()))
  WITH CHECK (public.is_admin_or_supervisor(auth.uid()));

-- products
DROP POLICY IF EXISTS "Authenticated users can view products" ON public.products;
CREATE POLICY "Authenticated users can view products" ON public.products
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Admins can manage products" ON public.products;
CREATE POLICY "Admins can manage products" ON public.products
  FOR ALL TO authenticated
  USING (public.is_admin_or_supervisor(auth.uid()))
  WITH CHECK (public.is_admin_or_supervisor(auth.uid()));

DROP POLICY IF EXISTS "Admins can insert products" ON public.products;
CREATE POLICY "Admins can insert products" ON public.products
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin_or_supervisor(auth.uid()));

-- queue_goals
DROP POLICY IF EXISTS "Authenticated users can view queue goals" ON public.queue_goals;
CREATE POLICY "Authenticated users can view queue goals" ON public.queue_goals
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Admins can manage queue goals" ON public.queue_goals;
CREATE POLICY "Admins can manage queue goals" ON public.queue_goals
  FOR ALL TO authenticated
  USING (public.is_admin_or_supervisor(auth.uid()))
  WITH CHECK (public.is_admin_or_supervisor(auth.uid()));

-- queue_members
DROP POLICY IF EXISTS "Authenticated users can view queue members" ON public.queue_members;
CREATE POLICY "Authenticated users can view queue members" ON public.queue_members
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Admins can manage queue members" ON public.queue_members;
CREATE POLICY "Admins can manage queue members" ON public.queue_members
  FOR ALL TO authenticated
  USING (public.is_admin_or_supervisor(auth.uid()))
  WITH CHECK (public.is_admin_or_supervisor(auth.uid()));

-- queues
DROP POLICY IF EXISTS "Authenticated users can view queues" ON public.queues;
CREATE POLICY "Authenticated users can view queues" ON public.queues
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Admins can manage queues" ON public.queues;
CREATE POLICY "Admins can manage queues" ON public.queues
  FOR ALL TO authenticated
  USING (public.is_admin_or_supervisor(auth.uid()))
  WITH CHECK (public.is_admin_or_supervisor(auth.uid()));

-- rate_limit_configs
DROP POLICY IF EXISTS "Admins can manage rate limit configs" ON public.rate_limit_configs;
CREATE POLICY "Admins can manage rate limit configs" ON public.rate_limit_configs
  FOR ALL TO authenticated
  USING (public.is_admin_or_supervisor(auth.uid()))
  WITH CHECK (public.is_admin_or_supervisor(auth.uid()));

-- rate_limit_logs
DROP POLICY IF EXISTS "Admins can view rate limit logs" ON public.rate_limit_logs;
CREATE POLICY "Admins can view rate limit logs" ON public.rate_limit_logs
  FOR SELECT TO authenticated
  USING (public.is_admin_or_supervisor(auth.uid()));

-- role_permissions
DROP POLICY IF EXISTS "Anyone can view role permissions" ON public.role_permissions;
CREATE POLICY "Authenticated can view role permissions" ON public.role_permissions
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Admins can manage role permissions" ON public.role_permissions;
CREATE POLICY "Admins can manage role permissions" ON public.role_permissions
  FOR ALL TO authenticated
  USING (public.is_admin_or_supervisor(auth.uid()))
  WITH CHECK (public.is_admin_or_supervisor(auth.uid()));

-- scheduled_messages
DROP POLICY IF EXISTS "Users can view their scheduled messages" ON public.scheduled_messages;
CREATE POLICY "Users can view their scheduled messages" ON public.scheduled_messages
  FOR SELECT TO authenticated
  USING (
    created_by IN (SELECT id FROM profiles WHERE user_id = auth.uid())
    OR public.is_admin_or_supervisor(auth.uid())
  );

DROP POLICY IF EXISTS "Users can create scheduled messages" ON public.scheduled_messages;
CREATE POLICY "Users can create scheduled messages" ON public.scheduled_messages
  FOR INSERT TO authenticated
  WITH CHECK (
    created_by IN (SELECT id FROM profiles WHERE user_id = auth.uid())
    OR public.is_admin_or_supervisor(auth.uid())
  );

DROP POLICY IF EXISTS "Users can update their scheduled messages" ON public.scheduled_messages;
CREATE POLICY "Users can update their scheduled messages" ON public.scheduled_messages
  FOR UPDATE TO authenticated
  USING (
    created_by IN (SELECT id FROM profiles WHERE user_id = auth.uid())
    OR public.is_admin_or_supervisor(auth.uid())
  );

DROP POLICY IF EXISTS "Users can delete their scheduled messages" ON public.scheduled_messages;
CREATE POLICY "Users can delete their scheduled messages" ON public.scheduled_messages
  FOR DELETE TO authenticated
  USING (
    created_by IN (SELECT id FROM profiles WHERE user_id = auth.uid())
    OR public.is_admin_or_supervisor(auth.uid())
  );

-- sla_configurations
DROP POLICY IF EXISTS "Authenticated users can view SLA configurations" ON public.sla_configurations;
CREATE POLICY "Authenticated users can view SLA configurations" ON public.sla_configurations
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Admins can manage SLA configurations" ON public.sla_configurations;
CREATE POLICY "Admins can manage SLA configurations" ON public.sla_configurations
  FOR ALL TO authenticated
  USING (public.is_admin_or_supervisor(auth.uid()))
  WITH CHECK (public.is_admin_or_supervisor(auth.uid()));

-- tags
DROP POLICY IF EXISTS "Authenticated users can view tags" ON public.tags;
CREATE POLICY "Authenticated users can view tags" ON public.tags
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Admins can manage tags" ON public.tags;
CREATE POLICY "Admins can manage tags" ON public.tags
  FOR ALL TO authenticated
  USING (public.is_admin_or_supervisor(auth.uid()))
  WITH CHECK (public.is_admin_or_supervisor(auth.uid()));

-- user_devices
DROP POLICY IF EXISTS "Users can view their own devices" ON public.user_devices;
CREATE POLICY "Users can view their own devices" ON public.user_devices
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can insert their own devices" ON public.user_devices;
CREATE POLICY "Users can insert their own devices" ON public.user_devices
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can update their own devices" ON public.user_devices;
CREATE POLICY "Users can update their own devices" ON public.user_devices
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can delete their own devices" ON public.user_devices;
CREATE POLICY "Users can delete their own devices" ON public.user_devices
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- user_settings
DROP POLICY IF EXISTS "Users can view their own settings" ON public.user_settings;
CREATE POLICY "Users can view their own settings" ON public.user_settings
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can insert their own settings" ON public.user_settings;
CREATE POLICY "Users can insert their own settings" ON public.user_settings
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can update their own settings" ON public.user_settings;
CREATE POLICY "Users can update their own settings" ON public.user_settings
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid());
