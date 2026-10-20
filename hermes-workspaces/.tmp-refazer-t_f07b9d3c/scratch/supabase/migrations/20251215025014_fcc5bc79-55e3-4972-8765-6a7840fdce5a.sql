-- Create app_role enum
CREATE TYPE public.app_role AS ENUM ('admin', 'supervisor', 'agent');

-- Create user_roles table (separate from profiles for security)
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL DEFAULT 'agent',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

-- Enable RLS
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Security definer function to check roles (prevents infinite recursion)
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- Check if user is admin or supervisor
CREATE OR REPLACE FUNCTION public.is_admin_or_supervisor(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role IN ('admin', 'supervisor')
  )
$$;

-- Policies for user_roles
CREATE POLICY "Users can view all roles" 
ON public.user_roles FOR SELECT 
TO authenticated 
USING (true);

CREATE POLICY "Admins can manage roles" 
ON public.user_roles FOR ALL 
TO authenticated 
USING (public.is_admin_or_supervisor(auth.uid()));

-- Create audit_logs table
CREATE TABLE public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity_type TEXT, -- 'connection', 'contact', 'message', 'login', etc.
  entity_id UUID,
  details JSONB DEFAULT '{}',
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Only admins can view audit logs
CREATE POLICY "Admins can view audit logs" 
ON public.audit_logs FOR SELECT 
TO authenticated 
USING (public.is_admin_or_supervisor(auth.uid()));

-- Anyone can insert (for logging actions)
CREATE POLICY "Authenticated users can insert audit logs" 
ON public.audit_logs FOR INSERT 
TO authenticated 
WITH CHECK (auth.uid() = user_id);

-- Create index for faster queries
CREATE INDEX idx_audit_logs_user_id ON public.audit_logs(user_id);
CREATE INDEX idx_audit_logs_action ON public.audit_logs(action);
CREATE INDEX idx_audit_logs_created_at ON public.audit_logs(created_at DESC);

-- Trigger to assign default role on signup
CREATE OR REPLACE FUNCTION public.handle_new_user_role()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'agent');
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created_role
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_role();

-- Create storage bucket for audio messages
INSERT INTO storage.buckets (id, name, public) 
VALUES ('audio-messages', 'audio-messages', false);

-- Storage policies for audio messages
CREATE POLICY "Authenticated users can upload audio" 
ON storage.objects FOR INSERT 
TO authenticated 
WITH CHECK (bucket_id = 'audio-messages');

CREATE POLICY "Authenticated users can view audio" 
ON storage.objects FOR SELECT 
TO authenticated 
USING (bucket_id = 'audio-messages');

-- Create calls table for VoIP tracking
CREATE TABLE public.calls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
  agent_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  whatsapp_connection_id UUID REFERENCES public.whatsapp_connections(id) ON DELETE SET NULL,
  direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  status TEXT NOT NULL DEFAULT 'ringing' CHECK (status IN ('ringing', 'answered', 'ended', 'missed', 'busy', 'failed')),
  started_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  answered_at TIMESTAMP WITH TIME ZONE,
  ended_at TIMESTAMP WITH TIME ZONE,
  duration_seconds INTEGER,
  recording_url TEXT,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.calls ENABLE ROW LEVEL SECURITY;

-- Policies for calls
CREATE POLICY "Users can view calls" 
ON public.calls FOR SELECT 
TO authenticated 
USING (true);

CREATE POLICY "Users can insert calls" 
ON public.calls FOR INSERT 
TO authenticated 
WITH CHECK (true);

CREATE POLICY "Users can update their calls" 
ON public.calls FOR UPDATE 
TO authenticated 
USING (agent_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid()));

-- Enable realtime for calls
ALTER PUBLICATION supabase_realtime ADD TABLE public.calls;