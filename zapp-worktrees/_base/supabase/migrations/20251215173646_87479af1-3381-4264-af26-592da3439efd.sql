-- Create SLA configurations table
CREATE TABLE public.sla_configurations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  first_response_minutes INTEGER NOT NULL DEFAULT 5,
  resolution_minutes INTEGER NOT NULL DEFAULT 60,
  priority TEXT NOT NULL DEFAULT 'medium',
  is_default BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.sla_configurations ENABLE ROW LEVEL SECURITY;

-- RLS policies for SLA configurations
CREATE POLICY "Authenticated users can view SLA configurations"
ON public.sla_configurations
FOR SELECT
USING (true);

CREATE POLICY "Admins can manage SLA configurations"
ON public.sla_configurations
FOR ALL
USING (is_admin_or_supervisor(auth.uid()));

-- Create conversation tracking table for SLA
CREATE TABLE public.conversation_sla (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  contact_id UUID REFERENCES public.contacts(id) ON DELETE CASCADE,
  sla_configuration_id UUID REFERENCES public.sla_configurations(id),
  first_message_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  first_response_at TIMESTAMP WITH TIME ZONE,
  resolved_at TIMESTAMP WITH TIME ZONE,
  first_response_breached BOOLEAN DEFAULT false,
  resolution_breached BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.conversation_sla ENABLE ROW LEVEL SECURITY;

-- RLS policies for conversation SLA tracking
CREATE POLICY "Users can view conversation SLA"
ON public.conversation_sla
FOR SELECT
USING (true);

CREATE POLICY "Users can insert conversation SLA"
ON public.conversation_sla
FOR INSERT
WITH CHECK (true);

CREATE POLICY "Users can update conversation SLA"
ON public.conversation_sla
FOR UPDATE
USING (true);

-- Add trigger for updated_at
CREATE TRIGGER update_sla_configurations_updated_at
BEFORE UPDATE ON public.sla_configurations
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_conversation_sla_updated_at
BEFORE UPDATE ON public.conversation_sla
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Insert default SLA configurations
INSERT INTO public.sla_configurations (name, first_response_minutes, resolution_minutes, priority, is_default)
VALUES 
  ('Urgente', 2, 30, 'high', false),
  ('Normal', 5, 60, 'medium', true),
  ('Baixa Prioridade', 15, 120, 'low', false);