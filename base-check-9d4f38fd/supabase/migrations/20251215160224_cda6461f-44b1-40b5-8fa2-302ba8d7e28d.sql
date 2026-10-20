-- Create message_templates table
CREATE TABLE public.message_templates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  shortcut TEXT,
  category TEXT DEFAULT 'general',
  is_global BOOLEAN DEFAULT false,
  use_count INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.message_templates ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view their own templates and global templates
CREATE POLICY "Users can view their templates and global ones"
ON public.message_templates
FOR SELECT
USING (user_id = auth.uid() OR is_global = true);

-- Policy: Users can create their own templates
CREATE POLICY "Users can create their own templates"
ON public.message_templates
FOR INSERT
WITH CHECK (user_id = auth.uid());

-- Policy: Users can update their own templates
CREATE POLICY "Users can update their own templates"
ON public.message_templates
FOR UPDATE
USING (user_id = auth.uid());

-- Policy: Users can delete their own templates
CREATE POLICY "Users can delete their own templates"
ON public.message_templates
FOR DELETE
USING (user_id = auth.uid());

-- Trigger for updated_at
CREATE TRIGGER update_message_templates_updated_at
BEFORE UPDATE ON public.message_templates
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();