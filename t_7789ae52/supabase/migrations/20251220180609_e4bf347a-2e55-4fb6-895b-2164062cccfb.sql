-- Create user_settings table for persisting user preferences
CREATE TABLE public.user_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Business hours settings
  business_hours_enabled BOOLEAN DEFAULT true,
  business_hours_start TEXT DEFAULT '09:00',
  business_hours_end TEXT DEFAULT '18:00',
  work_days INTEGER[] DEFAULT '{1,2,3,4,5}',
  
  -- Message settings
  welcome_message TEXT DEFAULT '',
  away_message TEXT DEFAULT '',
  closing_message TEXT DEFAULT '',
  
  -- Automation settings
  auto_assignment_enabled BOOLEAN DEFAULT true,
  auto_assignment_method TEXT DEFAULT 'roundrobin',
  inactivity_timeout INTEGER DEFAULT 30,
  
  -- Notification settings
  sound_enabled BOOLEAN DEFAULT true,
  browser_notifications_enabled BOOLEAN DEFAULT true,
  quiet_hours_enabled BOOLEAN DEFAULT false,
  quiet_hours_start TEXT DEFAULT '22:00',
  quiet_hours_end TEXT DEFAULT '07:00',
  
  -- Appearance settings
  theme TEXT DEFAULT 'system',
  language TEXT DEFAULT 'pt-BR',
  compact_mode BOOLEAN DEFAULT false,
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  
  UNIQUE(user_id)
);

-- Enable RLS
ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;

-- Users can view only their own settings
CREATE POLICY "Users can view their own settings"
  ON public.user_settings
  FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert their own settings
CREATE POLICY "Users can insert their own settings"
  ON public.user_settings
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own settings
CREATE POLICY "Users can update their own settings"
  ON public.user_settings
  FOR UPDATE
  USING (auth.uid() = user_id);

-- Trigger for updated_at
CREATE TRIGGER update_user_settings_updated_at
  BEFORE UPDATE ON public.user_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();