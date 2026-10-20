-- Create business_hours table for connection-specific business hours
CREATE TABLE public.business_hours (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  whatsapp_connection_id UUID NOT NULL REFERENCES public.whatsapp_connections(id) ON DELETE CASCADE,
  day_of_week INTEGER NOT NULL CHECK (day_of_week >= 0 AND day_of_week <= 6),
  is_open BOOLEAN DEFAULT true,
  open_time TIME DEFAULT '09:00:00',
  close_time TIME DEFAULT '18:00:00',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  
  UNIQUE(whatsapp_connection_id, day_of_week)
);

-- Create away_messages table for connection-specific away messages
CREATE TABLE public.away_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  whatsapp_connection_id UUID NOT NULL UNIQUE REFERENCES public.whatsapp_connections(id) ON DELETE CASCADE,
  content TEXT DEFAULT 'Estamos fora do horário de atendimento. Retornaremos em breve!',
  is_enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create message_reactions table for persisting reactions
CREATE TABLE public.message_reactions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  message_id UUID NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES public.contacts(id) ON DELETE CASCADE,
  emoji TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  
  -- Either user_id or contact_id must be set
  CONSTRAINT reaction_author_check CHECK (user_id IS NOT NULL OR contact_id IS NOT NULL),
  -- Unique reaction per user/contact per message per emoji
  UNIQUE(message_id, user_id, emoji),
  UNIQUE(message_id, contact_id, emoji)
);

-- Enable RLS on all tables
ALTER TABLE public.business_hours ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.away_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.message_reactions ENABLE ROW LEVEL SECURITY;

-- business_hours policies
CREATE POLICY "Authenticated users can view business hours"
  ON public.business_hours
  FOR SELECT
  USING (true);

CREATE POLICY "Admins can manage business hours"
  ON public.business_hours
  FOR ALL
  USING (is_admin_or_supervisor(auth.uid()));

-- away_messages policies
CREATE POLICY "Authenticated users can view away messages"
  ON public.away_messages
  FOR SELECT
  USING (true);

CREATE POLICY "Admins can manage away messages"
  ON public.away_messages
  FOR ALL
  USING (is_admin_or_supervisor(auth.uid()));

-- message_reactions policies
CREATE POLICY "Users can view reactions on accessible messages"
  ON public.message_reactions
  FOR SELECT
  USING (true);

CREATE POLICY "Users can add reactions"
  ON public.message_reactions
  FOR INSERT
  WITH CHECK (
    user_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
    OR contact_id IS NOT NULL
  );

CREATE POLICY "Users can delete their own reactions"
  ON public.message_reactions
  FOR DELETE
  USING (user_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid()));

-- Triggers for updated_at
CREATE TRIGGER update_business_hours_updated_at
  BEFORE UPDATE ON public.business_hours
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_away_messages_updated_at
  BEFORE UPDATE ON public.away_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Indexes
CREATE INDEX idx_business_hours_connection ON public.business_hours(whatsapp_connection_id);
CREATE INDEX idx_message_reactions_message ON public.message_reactions(message_id);

-- Enable realtime for reactions
ALTER PUBLICATION supabase_realtime ADD TABLE public.message_reactions;