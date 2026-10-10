
-- Fix: contact_tags SELECT
DROP POLICY IF EXISTS "Authenticated can view contact tags" ON public.contact_tags;
DROP POLICY IF EXISTS "Users can view contact tags" ON public.contact_tags;
CREATE POLICY "Users can view contact tags" ON public.contact_tags
  FOR SELECT TO authenticated
  USING (
    contact_id IN (SELECT c.id FROM contacts c WHERE c.assigned_to IN (SELECT p.id FROM profiles p WHERE p.user_id = auth.uid()))
    OR is_admin_or_supervisor(auth.uid())
  );

-- Fix: queue_positions SELECT
DROP POLICY IF EXISTS "Authenticated can view queue positions" ON public.queue_positions;
DROP POLICY IF EXISTS "Users can view queue positions" ON public.queue_positions;
CREATE POLICY "Users can view queue positions" ON public.queue_positions
  FOR SELECT TO authenticated
  USING (
    contact_id IN (SELECT c.id FROM contacts c WHERE c.assigned_to IN (SELECT p.id FROM profiles p WHERE p.user_id = auth.uid()))
    OR is_admin_or_supervisor(auth.uid())
  );

-- Fix: agent_stats SELECT - own stats or admin
DROP POLICY IF EXISTS "Authenticated can view agent stats" ON public.agent_stats;
DROP POLICY IF EXISTS "Users can view agent stats" ON public.agent_stats;
CREATE POLICY "Users can view agent stats" ON public.agent_stats
  FOR SELECT TO authenticated
  USING (
    profile_id IN (SELECT p.id FROM profiles p WHERE p.user_id = auth.uid())
    OR is_admin_or_supervisor(auth.uid())
  );

-- Fix: warroom_alerts SELECT - admin only
DROP POLICY IF EXISTS "Authenticated can view warroom alerts" ON public.warroom_alerts;
DROP POLICY IF EXISTS "Users can view warroom alerts" ON public.warroom_alerts;
CREATE POLICY "Admins can view warroom alerts" ON public.warroom_alerts
  FOR SELECT TO authenticated
  USING (is_admin_or_supervisor(auth.uid()));

-- Fix: knowledge_base_files SELECT - published or admin
DROP POLICY IF EXISTS "Authenticated can view kb files" ON public.knowledge_base_files;
DROP POLICY IF EXISTS "Users can view knowledge base files" ON public.knowledge_base_files;
CREATE POLICY "Users can view knowledge base files" ON public.knowledge_base_files
  FOR SELECT TO authenticated
  USING (
    article_id IN (SELECT a.id FROM knowledge_base_articles a WHERE a.is_published = true)
    OR is_admin_or_supervisor(auth.uid())
  );
