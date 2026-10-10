
-- Follow-up sequences table
CREATE TABLE public.followup_sequences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  trigger_event TEXT NOT NULL DEFAULT 'ticket_resolved',
  is_active BOOLEAN DEFAULT true,
  whatsapp_connection_id UUID REFERENCES public.whatsapp_connections(id),
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Follow-up steps
CREATE TABLE public.followup_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sequence_id UUID NOT NULL REFERENCES public.followup_sequences(id) ON DELETE CASCADE,
  step_order INTEGER NOT NULL DEFAULT 1,
  delay_hours INTEGER NOT NULL DEFAULT 24,
  message_template TEXT NOT NULL,
  message_type TEXT NOT NULL DEFAULT 'text',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Follow-up executions log
CREATE TABLE public.followup_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sequence_id UUID NOT NULL REFERENCES public.followup_sequences(id),
  contact_id UUID NOT NULL REFERENCES public.contacts(id),
  current_step INTEGER DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending',
  started_at TIMESTAMPTZ DEFAULT now(),
  next_step_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Whisper messages (supervisor to agent, invisible to client)
CREATE TABLE public.whisper_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id UUID NOT NULL REFERENCES public.contacts(id),
  sender_id UUID NOT NULL REFERENCES public.profiles(id),
  target_agent_id UUID NOT NULL REFERENCES public.profiles(id),
  content TEXT NOT NULL,
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Queue position tracking
CREATE TABLE public.queue_positions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id UUID NOT NULL REFERENCES public.contacts(id),
  queue_id UUID NOT NULL REFERENCES public.queues(id),
  position INTEGER NOT NULL DEFAULT 0,
  estimated_wait_minutes INTEGER,
  entered_at TIMESTAMPTZ DEFAULT now(),
  notified BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- AI auto-tags 
CREATE TABLE public.ai_conversation_tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id UUID NOT NULL REFERENCES public.contacts(id),
  tag_name TEXT NOT NULL,
  confidence NUMERIC DEFAULT 0.0,
  source TEXT DEFAULT 'ai',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.followup_sequences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.followup_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.followup_executions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whisper_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.queue_positions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_conversation_tags ENABLE ROW LEVEL SECURITY;

-- RLS Policies (authenticated users)
CREATE POLICY "Authenticated users can manage followup_sequences" ON public.followup_sequences FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users can manage followup_steps" ON public.followup_steps FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users can manage followup_executions" ON public.followup_executions FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users can manage whisper_messages" ON public.whisper_messages FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users can manage queue_positions" ON public.queue_positions FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users can manage ai_conversation_tags" ON public.ai_conversation_tags FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Enable realtime for whisper messages
ALTER PUBLICATION supabase_realtime ADD TABLE public.whisper_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.queue_positions;
