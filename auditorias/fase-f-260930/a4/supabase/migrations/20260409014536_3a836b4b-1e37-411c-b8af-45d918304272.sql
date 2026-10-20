
-- 1. Conversation Snoozes
CREATE TABLE public.conversation_snoozes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  contact_id UUID NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  snoozed_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  snooze_until TIMESTAMP WITH TIME ZONE NOT NULL,
  reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.conversation_snoozes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own snoozes" ON public.conversation_snoozes FOR SELECT TO authenticated USING (snoozed_by IN (SELECT id FROM public.profiles WHERE user_id = auth.uid()));
CREATE POLICY "Users can create own snoozes" ON public.conversation_snoozes FOR INSERT TO authenticated WITH CHECK (snoozed_by IN (SELECT id FROM public.profiles WHERE user_id = auth.uid()));
CREATE POLICY "Users can delete own snoozes" ON public.conversation_snoozes FOR DELETE TO authenticated USING (snoozed_by IN (SELECT id FROM public.profiles WHERE user_id = auth.uid()));
CREATE INDEX idx_snoozes_until ON public.conversation_snoozes(snooze_until);
CREATE INDEX idx_snoozes_contact ON public.conversation_snoozes(contact_id);

-- 2. Pinned Conversations
CREATE TABLE public.pinned_conversations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  contact_id UUID NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  pinned_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(contact_id, pinned_by)
);
ALTER TABLE public.pinned_conversations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own pins" ON public.pinned_conversations FOR ALL TO authenticated USING (pinned_by IN (SELECT id FROM public.profiles WHERE user_id = auth.uid()));

-- 3. Favorite Contacts
CREATE TABLE public.favorite_contacts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  contact_id UUID NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(contact_id, user_id)
);
ALTER TABLE public.favorite_contacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own favorites" ON public.favorite_contacts FOR ALL TO authenticated USING (user_id = auth.uid());

-- 4. Conversation Tasks
CREATE TABLE public.conversation_tasks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  assigned_to UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  due_date TIMESTAMP WITH TIME ZONE,
  priority TEXT NOT NULL DEFAULT 'medium',
  status TEXT NOT NULL DEFAULT 'pending',
  completed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.conversation_tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can view tasks" ON public.conversation_tasks FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can create tasks" ON public.conversation_tasks FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update tasks" ON public.conversation_tasks FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated can delete tasks" ON public.conversation_tasks FOR DELETE TO authenticated USING (true);
CREATE INDEX idx_tasks_contact ON public.conversation_tasks(contact_id);
CREATE INDEX idx_tasks_assigned ON public.conversation_tasks(assigned_to);
CREATE INDEX idx_tasks_status ON public.conversation_tasks(status);

-- 5. Reminders
CREATE TABLE public.reminders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  remind_at TIMESTAMP WITH TIME ZONE NOT NULL,
  is_dismissed BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.reminders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own reminders" ON public.reminders FOR ALL TO authenticated USING (profile_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid()));
CREATE INDEX idx_reminders_remind_at ON public.reminders(remind_at);
CREATE INDEX idx_reminders_profile ON public.reminders(profile_id);

-- 6. Conversation Closures
CREATE TABLE public.conversation_closures (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  contact_id UUID NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  closed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  close_reason TEXT NOT NULL,
  outcome TEXT,
  classification TEXT,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.conversation_closures ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can view closures" ON public.conversation_closures FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can create closures" ON public.conversation_closures FOR INSERT TO authenticated WITH CHECK (true);
CREATE INDEX idx_closures_contact ON public.conversation_closures(contact_id);
CREATE INDEX idx_closures_reason ON public.conversation_closures(close_reason);

-- 7. Conversation Memory
CREATE TABLE public.conversation_memory (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  contact_id UUID NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE UNIQUE,
  facts JSONB DEFAULT '[]'::jsonb,
  objections_handled JSONB DEFAULT '[]'::jsonb,
  promises_made JSONB DEFAULT '[]'::jsonb,
  pending_items JSONB DEFAULT '[]'::jsonb,
  commercial_summary TEXT,
  cumulative_summary TEXT,
  updated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.conversation_memory ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can view memory" ON public.conversation_memory FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can upsert memory" ON public.conversation_memory FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update memory" ON public.conversation_memory FOR UPDATE TO authenticated USING (true);

-- 8. Playbooks
CREATE TABLE public.playbooks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL DEFAULT 'general',
  steps JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.playbooks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can view playbooks" ON public.playbooks FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can manage playbooks" ON public.playbooks FOR INSERT TO authenticated WITH CHECK (public.is_admin_or_supervisor(auth.uid()));
CREATE POLICY "Admins can update playbooks" ON public.playbooks FOR UPDATE TO authenticated USING (public.is_admin_or_supervisor(auth.uid()));
CREATE POLICY "Admins can delete playbooks" ON public.playbooks FOR DELETE TO authenticated USING (public.is_admin_or_supervisor(auth.uid()));

-- 9. Add fields to contacts
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS lead_score INTEGER DEFAULT 0;
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS risk_score INTEGER DEFAULT 0;
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS lead_origin TEXT;
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS consent_status TEXT DEFAULT 'unknown';

-- 10. Number Reputation
CREATE TABLE public.number_reputation (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  whatsapp_connection_id UUID NOT NULL REFERENCES public.whatsapp_connections(id) ON DELETE CASCADE UNIQUE,
  health_score INTEGER NOT NULL DEFAULT 100,
  messages_sent_today INTEGER NOT NULL DEFAULT 0,
  failures_today INTEGER NOT NULL DEFAULT 0,
  complaints_count INTEGER NOT NULL DEFAULT 0,
  warmup_status TEXT NOT NULL DEFAULT 'none',
  warmup_day INTEGER DEFAULT 0,
  daily_limit INTEGER DEFAULT 200,
  last_reset_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.number_reputation ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can view reputation" ON public.number_reputation FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can upsert reputation" ON public.number_reputation FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update reputation" ON public.number_reputation FOR UPDATE TO authenticated USING (true);
CREATE INDEX idx_reputation_connection ON public.number_reputation(whatsapp_connection_id);

-- Triggers for updated_at
CREATE TRIGGER update_conversation_tasks_updated_at BEFORE UPDATE ON public.conversation_tasks FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_conversation_memory_updated_at BEFORE UPDATE ON public.conversation_memory FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_playbooks_updated_at BEFORE UPDATE ON public.playbooks FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_number_reputation_updated_at BEFORE UPDATE ON public.number_reputation FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
