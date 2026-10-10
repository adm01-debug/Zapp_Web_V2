-- Create scheduled_messages table
CREATE TABLE public.scheduled_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  contact_id UUID NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  message_type TEXT NOT NULL DEFAULT 'text',
  media_url TEXT,
  scheduled_at TIMESTAMP WITH TIME ZONE NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', -- pending, sent, failed, cancelled
  sent_at TIMESTAMP WITH TIME ZONE,
  error_message TEXT,
  created_by UUID REFERENCES public.profiles(id),
  whatsapp_connection_id UUID REFERENCES public.whatsapp_connections(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.scheduled_messages ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Users can view their scheduled messages"
ON public.scheduled_messages FOR SELECT
USING (
  created_by IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
  OR is_admin_or_supervisor(auth.uid())
);

CREATE POLICY "Users can create scheduled messages"
ON public.scheduled_messages FOR INSERT
WITH CHECK (
  created_by IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
);

CREATE POLICY "Users can update their scheduled messages"
ON public.scheduled_messages FOR UPDATE
USING (
  created_by IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
  OR is_admin_or_supervisor(auth.uid())
);

CREATE POLICY "Users can delete their scheduled messages"
ON public.scheduled_messages FOR DELETE
USING (
  created_by IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
  OR is_admin_or_supervisor(auth.uid())
);

-- Trigger for updated_at
CREATE TRIGGER update_scheduled_messages_updated_at
  BEFORE UPDATE ON public.scheduled_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Index for efficient querying of pending messages
CREATE INDEX idx_scheduled_messages_pending 
ON public.scheduled_messages(scheduled_at) 
WHERE status = 'pending';