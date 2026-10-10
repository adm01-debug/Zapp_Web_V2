-- Create table for password reset requests
CREATE TABLE public.password_reset_requests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  email TEXT NOT NULL,
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_by UUID REFERENCES auth.users(id),
  reviewed_at TIMESTAMP WITH TIME ZONE,
  rejection_reason TEXT,
  reset_token TEXT,
  token_expires_at TIMESTAMP WITH TIME ZONE,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.password_reset_requests ENABLE ROW LEVEL SECURITY;

-- Users can view their own requests
CREATE POLICY "Users can view own reset requests"
ON public.password_reset_requests
FOR SELECT
USING (user_id = auth.uid() OR public.is_admin_or_supervisor(auth.uid()));

-- Anyone can insert (for requesting reset)
CREATE POLICY "Anyone can request reset"
ON public.password_reset_requests
FOR INSERT
WITH CHECK (true);

-- Only admins can update (approve/reject)
CREATE POLICY "Admins can update reset requests"
ON public.password_reset_requests
FOR UPDATE
USING (public.is_admin_or_supervisor(auth.uid()));

-- Add index
CREATE INDEX idx_password_reset_requests_status ON public.password_reset_requests(status);
CREATE INDEX idx_password_reset_requests_user ON public.password_reset_requests(user_id);

-- Enable realtime for notifications
ALTER PUBLICATION supabase_realtime ADD TABLE public.password_reset_requests;