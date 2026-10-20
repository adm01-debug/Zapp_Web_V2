-- 1. Create missing saved_filters table (referenced by useSavedFilters hook)
CREATE TABLE IF NOT EXISTS public.saved_filters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  entity_type TEXT NOT NULL,
  name TEXT NOT NULL,
  filters JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.saved_filters ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own saved filters"
  ON public.saved_filters FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert own saved filters"
  ON public.saved_filters FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own saved filters"
  ON public.saved_filters FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can delete own saved filters"
  ON public.saved_filters FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

CREATE TRIGGER update_saved_filters_updated_at
  BEFORE UPDATE ON public.saved_filters
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 2. Remove duplicate triggers on contacts
DROP TRIGGER IF EXISTS auto_assign_contact_trigger ON public.contacts;
DROP TRIGGER IF EXISTS auto_assign_queue_agent ON public.contacts;

-- 3. Remove duplicate triggers on profiles  
DROP TRIGGER IF EXISTS init_stats_on_profile_create ON public.profiles;
DROP TRIGGER IF EXISTS prevent_role_escalation_trigger ON public.profiles;

-- 4. Create performance indexes for saved_filters
CREATE INDEX IF NOT EXISTS idx_saved_filters_user_entity ON public.saved_filters(user_id, entity_type);

-- 5. Create missing indexes from spec for performance
CREATE INDEX IF NOT EXISTS idx_messages_contact_created ON public.messages(contact_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_contacts_assigned_to ON public.contacts(assigned_to);
CREATE INDEX IF NOT EXISTS idx_contacts_queue_id ON public.contacts(queue_id);
CREATE INDEX IF NOT EXISTS idx_messages_external_id ON public.messages(external_id) WHERE external_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_created ON public.audit_logs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_campaign_contacts_campaign ON public.campaign_contacts(campaign_id, status);