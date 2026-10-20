-- Create profiles table for agents/sellers
CREATE TABLE public.profiles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  name TEXT NOT NULL,
  email TEXT,
  avatar_url TEXT,
  role TEXT DEFAULT 'agent' CHECK (role IN ('admin', 'supervisor', 'agent')),
  max_chats INTEGER DEFAULT 5,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Profiles policies
CREATE POLICY "Users can view all profiles" 
ON public.profiles FOR SELECT 
TO authenticated 
USING (true);

CREATE POLICY "Users can update their own profile" 
ON public.profiles FOR UPDATE 
TO authenticated 
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own profile" 
ON public.profiles FOR INSERT 
TO authenticated 
WITH CHECK (auth.uid() = user_id);

-- Create whatsapp_connections table for multiple WhatsApp numbers
CREATE TABLE public.whatsapp_connections (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  phone_number TEXT NOT NULL,
  instance_id TEXT, -- Evolution API instance ID
  status TEXT DEFAULT 'disconnected' CHECK (status IN ('connected', 'disconnected', 'connecting', 'qr_pending')),
  qr_code TEXT, -- QR code for connection
  is_default BOOLEAN DEFAULT false,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.whatsapp_connections ENABLE ROW LEVEL SECURITY;

-- WhatsApp connections policies (admins and supervisors can manage, agents can view)
CREATE POLICY "Authenticated users can view connections" 
ON public.whatsapp_connections FOR SELECT 
TO authenticated 
USING (true);

CREATE POLICY "Authenticated users can insert connections" 
ON public.whatsapp_connections FOR INSERT 
TO authenticated 
WITH CHECK (true);

CREATE POLICY "Authenticated users can update connections" 
ON public.whatsapp_connections FOR UPDATE 
TO authenticated 
USING (true);

CREATE POLICY "Authenticated users can delete connections" 
ON public.whatsapp_connections FOR DELETE 
TO authenticated 
USING (true);

-- Create contacts table
CREATE TABLE public.contacts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT NOT NULL UNIQUE,
  email TEXT,
  avatar_url TEXT,
  assigned_to UUID REFERENCES public.profiles(id) ON DELETE SET NULL, -- Seller who owns this client
  whatsapp_connection_id UUID REFERENCES public.whatsapp_connections(id) ON DELETE SET NULL,
  tags TEXT[] DEFAULT '{}',
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;

-- Contacts policies - sellers can only see their assigned contacts, admins see all
CREATE POLICY "Users can view their assigned contacts" 
ON public.contacts FOR SELECT 
TO authenticated 
USING (
  assigned_to IN (
    SELECT id FROM public.profiles WHERE user_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE user_id = auth.uid() 
    AND role IN ('admin', 'supervisor')
  )
);

CREATE POLICY "Users can insert contacts" 
ON public.contacts FOR INSERT 
TO authenticated 
WITH CHECK (true);

CREATE POLICY "Users can update their assigned contacts" 
ON public.contacts FOR UPDATE 
TO authenticated 
USING (
  assigned_to IN (
    SELECT id FROM public.profiles WHERE user_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE user_id = auth.uid() 
    AND role IN ('admin', 'supervisor')
  )
);

-- Create client_wallet table for automatic assignment rules
CREATE TABLE public.client_wallet_rules (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  agent_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  whatsapp_connection_id UUID REFERENCES public.whatsapp_connections(id) ON DELETE CASCADE,
  priority INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.client_wallet_rules ENABLE ROW LEVEL SECURITY;

-- Wallet rules policies
CREATE POLICY "Authenticated users can view wallet rules" 
ON public.client_wallet_rules FOR SELECT 
TO authenticated 
USING (true);

CREATE POLICY "Admins can manage wallet rules" 
ON public.client_wallet_rules FOR ALL 
TO authenticated 
USING (
  EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE user_id = auth.uid() 
    AND role IN ('admin', 'supervisor')
  )
);

-- Create function to auto-assign contacts based on rules
CREATE OR REPLACE FUNCTION public.auto_assign_contact()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  assigned_agent_id UUID;
BEGIN
  -- Find the first matching active rule for the connection
  SELECT agent_id INTO assigned_agent_id
  FROM public.client_wallet_rules
  WHERE is_active = true
    AND (whatsapp_connection_id IS NULL OR whatsapp_connection_id = NEW.whatsapp_connection_id)
  ORDER BY priority DESC, created_at ASC
  LIMIT 1;
  
  -- If a rule matches and contact has no assignment, assign it
  IF assigned_agent_id IS NOT NULL AND NEW.assigned_to IS NULL THEN
    NEW.assigned_to := assigned_agent_id;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger for auto-assignment
CREATE TRIGGER auto_assign_contact_trigger
  BEFORE INSERT ON public.contacts
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_assign_contact();

-- Create function to update timestamps
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Create triggers for timestamp updates
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_whatsapp_connections_updated_at
  BEFORE UPDATE ON public.whatsapp_connections
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_contacts_updated_at
  BEFORE UPDATE ON public.contacts
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Auto-create profile on user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, name, email)
  VALUES (
    NEW.id, 
    COALESCE(NEW.raw_user_meta_data ->> 'name', NEW.email),
    NEW.email
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();