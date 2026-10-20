
-- Create enum for provider types
CREATE TYPE public.ai_provider_type AS ENUM (
  'lovable_ai',
  'openai_compatible',
  'google_gemini',
  'custom_webhook',
  'custom_agent'
);

-- Create table for AI provider configurations
CREATE TABLE public.ai_providers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  provider_type public.ai_provider_type NOT NULL DEFAULT 'lovable_ai',
  api_endpoint TEXT,
  api_key_secret_name TEXT,
  model TEXT,
  system_prompt TEXT,
  config JSONB DEFAULT '{}'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT true,
  is_default BOOLEAN NOT NULL DEFAULT false,
  use_for TEXT[] NOT NULL DEFAULT ARRAY['copilot']::TEXT[],
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.ai_providers ENABLE ROW LEVEL SECURITY;

-- Only admins can manage AI providers
CREATE POLICY "Admins can view AI providers"
  ON public.ai_providers FOR SELECT
  TO authenticated
  USING (public.is_admin_or_supervisor(auth.uid()));

CREATE POLICY "Admins can insert AI providers"
  ON public.ai_providers FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update AI providers"
  ON public.ai_providers FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete AI providers"
  ON public.ai_providers FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Trigger for updated_at
CREATE TRIGGER update_ai_providers_updated_at
  BEFORE UPDATE ON public.ai_providers
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Ensure only one default provider per use_for category
CREATE OR REPLACE FUNCTION public.ensure_single_default_ai_provider()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.is_default = true THEN
    UPDATE public.ai_providers
    SET is_default = false
    WHERE id != NEW.id
      AND is_default = true
      AND use_for && NEW.use_for;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER ensure_single_default_ai_provider
  BEFORE INSERT OR UPDATE ON public.ai_providers
  FOR EACH ROW
  EXECUTE FUNCTION public.ensure_single_default_ai_provider();

-- Insert the default Lovable AI provider
INSERT INTO public.ai_providers (name, description, provider_type, is_active, is_default, use_for)
VALUES (
  'Lovable AI (Padrão)',
  'IA integrada do Lovable Cloud — sem necessidade de configuração adicional.',
  'lovable_ai',
  true,
  true,
  ARRAY['copilot', 'analysis', 'summary', 'tagging', 'auto_reply']
);
