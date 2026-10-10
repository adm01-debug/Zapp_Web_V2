-- Create enum for service types
CREATE TYPE public.service_account_type AS ENUM ('google_sheets', 'google_docs', 'google_calendar', 'google_drive', 'dropbox');

-- Create user_service_accounts table
CREATE TABLE public.user_service_accounts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  service_type service_account_type NOT NULL,
  account_email TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (user_id, service_type)
);

-- Enable RLS
ALTER TABLE public.user_service_accounts ENABLE ROW LEVEL SECURITY;

-- Users can view their own service accounts
CREATE POLICY "Users can view own service accounts"
ON public.user_service_accounts
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- Admins can view all service accounts
CREATE POLICY "Admins can view all service accounts"
ON public.user_service_accounts
FOR SELECT
TO authenticated
USING (is_admin_or_supervisor(auth.uid()));

-- Only admins can insert
CREATE POLICY "Only admins can insert service accounts"
ON public.user_service_accounts
FOR INSERT
WITH CHECK (is_admin_or_supervisor(auth.uid()));

-- Only admins can update
CREATE POLICY "Only admins can update service accounts"
ON public.user_service_accounts
FOR UPDATE
USING (is_admin_or_supervisor(auth.uid()));

-- Only admins can delete
CREATE POLICY "Only admins can delete service accounts"
ON public.user_service_accounts
FOR DELETE
USING (is_admin_or_supervisor(auth.uid()));

-- Trigger for updated_at
CREATE TRIGGER update_user_service_accounts_updated_at
BEFORE UPDATE ON public.user_service_accounts
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();