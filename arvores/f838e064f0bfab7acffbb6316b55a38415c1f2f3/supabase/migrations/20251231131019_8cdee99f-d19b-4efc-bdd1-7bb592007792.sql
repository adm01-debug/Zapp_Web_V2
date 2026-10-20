-- Create table for allowed countries (whitelist)
CREATE TABLE public.allowed_countries (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  country_code TEXT NOT NULL UNIQUE,
  country_name TEXT NOT NULL,
  added_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.allowed_countries ENABLE ROW LEVEL SECURITY;

-- Only admins can view allowed countries
CREATE POLICY "Admins can view allowed countries"
ON public.allowed_countries
FOR SELECT
USING (public.is_admin_or_supervisor(auth.uid()));

-- Only admins can insert allowed countries
CREATE POLICY "Admins can insert allowed countries"
ON public.allowed_countries
FOR INSERT
WITH CHECK (public.is_admin_or_supervisor(auth.uid()));

-- Only admins can delete allowed countries
CREATE POLICY "Admins can delete allowed countries"
ON public.allowed_countries
FOR DELETE
USING (public.is_admin_or_supervisor(auth.uid()));

-- Create geo blocking settings table
CREATE TABLE public.geo_blocking_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  mode TEXT NOT NULL DEFAULT 'disabled' CHECK (mode IN ('disabled', 'whitelist', 'blacklist')),
  updated_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.geo_blocking_settings ENABLE ROW LEVEL SECURITY;

-- Admins can manage settings
CREATE POLICY "Admins can manage geo settings"
ON public.geo_blocking_settings
FOR ALL
USING (public.is_admin_or_supervisor(auth.uid()));

-- Anyone can view settings (for checking)
CREATE POLICY "Anyone can view geo settings"
ON public.geo_blocking_settings
FOR SELECT
USING (true);

-- Insert default settings
INSERT INTO public.geo_blocking_settings (mode) VALUES ('disabled');

-- Create function to check if country is allowed based on mode
CREATE OR REPLACE FUNCTION public.is_country_allowed(check_country_code TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  geo_mode TEXT;
BEGIN
  -- Get current geo blocking mode
  SELECT mode INTO geo_mode FROM public.geo_blocking_settings LIMIT 1;
  
  -- If disabled, allow all
  IF geo_mode IS NULL OR geo_mode = 'disabled' THEN
    RETURN true;
  END IF;
  
  -- If whitelist mode, check if country is in allowed list
  IF geo_mode = 'whitelist' THEN
    RETURN EXISTS (
      SELECT 1 FROM public.allowed_countries
      WHERE country_code = UPPER(check_country_code)
    );
  END IF;
  
  -- If blacklist mode, check if country is NOT in blocked list
  IF geo_mode = 'blacklist' THEN
    RETURN NOT EXISTS (
      SELECT 1 FROM public.blocked_countries
      WHERE country_code = UPPER(check_country_code)
    );
  END IF;
  
  RETURN true;
END;
$$;

-- Add index for faster lookups
CREATE INDEX idx_allowed_countries_code ON public.allowed_countries(country_code);