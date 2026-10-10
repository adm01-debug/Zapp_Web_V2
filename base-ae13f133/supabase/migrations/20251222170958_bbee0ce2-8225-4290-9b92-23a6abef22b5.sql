-- Create conversation_analyses table for storing AI analysis history
CREATE TABLE public.conversation_analyses (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  contact_id UUID NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  analyzed_by UUID REFERENCES public.profiles(id),
  summary TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pendente',
  key_points TEXT[] DEFAULT '{}',
  next_steps TEXT[] DEFAULT '{}',
  sentiment TEXT NOT NULL DEFAULT 'neutro',
  sentiment_score INTEGER DEFAULT 50,
  topics TEXT[] DEFAULT '{}',
  urgency TEXT DEFAULT 'media',
  customer_satisfaction INTEGER DEFAULT 3,
  message_count INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.conversation_analyses ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can view analyses" 
ON public.conversation_analyses 
FOR SELECT 
USING (true);

CREATE POLICY "Users can insert analyses" 
ON public.conversation_analyses 
FOR INSERT 
WITH CHECK (true);

-- Create index for faster queries
CREATE INDEX idx_conversation_analyses_contact_id ON public.conversation_analyses(contact_id);
CREATE INDEX idx_conversation_analyses_created_at ON public.conversation_analyses(created_at DESC);