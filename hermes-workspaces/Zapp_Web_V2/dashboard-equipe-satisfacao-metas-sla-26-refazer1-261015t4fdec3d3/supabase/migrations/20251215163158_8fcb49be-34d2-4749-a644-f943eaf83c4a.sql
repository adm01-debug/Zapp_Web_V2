-- Create messages table to store chat messages
CREATE TABLE public.messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  contact_id UUID REFERENCES public.contacts(id) ON DELETE CASCADE,
  whatsapp_connection_id UUID REFERENCES public.whatsapp_connections(id) ON DELETE SET NULL,
  sender TEXT NOT NULL CHECK (sender IN ('agent', 'contact')),
  content TEXT NOT NULL,
  message_type TEXT NOT NULL DEFAULT 'text' CHECK (message_type IN ('text', 'image', 'audio', 'video', 'document', 'sticker')),
  media_url TEXT,
  is_read BOOLEAN DEFAULT false,
  agent_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  external_id TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create indexes for better search performance
CREATE INDEX idx_messages_contact_id ON public.messages(contact_id);
CREATE INDEX idx_messages_content_search ON public.messages USING gin(to_tsvector('portuguese', content));
CREATE INDEX idx_messages_created_at ON public.messages(created_at DESC);

-- Enable RLS
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- Policies for messages
CREATE POLICY "Users can view messages from their assigned contacts"
ON public.messages
FOR SELECT
USING (
  contact_id IN (
    SELECT c.id FROM public.contacts c
    WHERE c.assigned_to IN (SELECT p.id FROM public.profiles p WHERE p.user_id = auth.uid())
  )
  OR EXISTS (
    SELECT 1 FROM public.profiles p 
    WHERE p.user_id = auth.uid() AND p.role IN ('admin', 'supervisor')
  )
);

CREATE POLICY "Users can insert messages"
ON public.messages
FOR INSERT
WITH CHECK (true);

CREATE POLICY "Users can update messages from their assigned contacts"
ON public.messages
FOR UPDATE
USING (
  contact_id IN (
    SELECT c.id FROM public.contacts c
    WHERE c.assigned_to IN (SELECT p.id FROM public.profiles p WHERE p.user_id = auth.uid())
  )
  OR EXISTS (
    SELECT 1 FROM public.profiles p 
    WHERE p.user_id = auth.uid() AND p.role IN ('admin', 'supervisor')
  )
);

-- Trigger for updated_at
CREATE TRIGGER update_messages_updated_at
BEFORE UPDATE ON public.messages
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Enable realtime for messages
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;