-- Create table for geo-blocked countries
CREATE TABLE public.blocked_countries (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  country_code TEXT NOT NULL UNIQUE,
  country_name TEXT NOT NULL,
  reason TEXT,
  blocked_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.blocked_countries ENABLE ROW LEVEL SECURITY;

-- Only admins can view blocked countries
CREATE POLICY "Admins can view blocked countries"
ON public.blocked_countries
FOR SELECT
USING (public.is_admin_or_supervisor(auth.uid()));

-- Only admins can insert blocked countries
CREATE POLICY "Admins can insert blocked countries"
ON public.blocked_countries
FOR INSERT
WITH CHECK (public.is_admin_or_supervisor(auth.uid()));

-- Only admins can delete blocked countries
CREATE POLICY "Admins can delete blocked countries"
ON public.blocked_countries
FOR DELETE
USING (public.is_admin_or_supervisor(auth.uid()));

-- Create function to check if country is blocked
CREATE OR REPLACE FUNCTION public.is_country_blocked(check_country_code TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.blocked_countries
    WHERE country_code = UPPER(check_country_code)
  )
$$;

-- Add index for faster lookups
CREATE INDEX idx_blocked_countries_code ON public.blocked_countries(country_code);