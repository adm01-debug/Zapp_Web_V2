-- Create goals_configurations table for custom goals
CREATE TABLE public.goals_configurations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  profile_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  queue_id UUID REFERENCES public.queues(id) ON DELETE CASCADE,
  goal_type TEXT NOT NULL,
  daily_target INTEGER NOT NULL DEFAULT 0,
  weekly_target INTEGER NOT NULL DEFAULT 0,
  monthly_target INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(profile_id, goal_type),
  UNIQUE(queue_id, goal_type),
  CONSTRAINT goal_owner_check CHECK (
    (profile_id IS NOT NULL AND queue_id IS NULL) OR
    (profile_id IS NULL AND queue_id IS NOT NULL)
  )
);

-- Enable RLS
ALTER TABLE public.goals_configurations ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Users can view their own goals"
ON public.goals_configurations
FOR SELECT
USING (
  profile_id IN (SELECT id FROM profiles WHERE user_id = auth.uid())
  OR queue_id IN (SELECT queue_id FROM queue_members qm JOIN profiles p ON qm.profile_id = p.id WHERE p.user_id = auth.uid())
  OR is_admin_or_supervisor(auth.uid())
);

CREATE POLICY "Users can manage their own goals"
ON public.goals_configurations
FOR ALL
USING (
  profile_id IN (SELECT id FROM profiles WHERE user_id = auth.uid())
  OR is_admin_or_supervisor(auth.uid())
);

-- Trigger for updated_at
CREATE TRIGGER update_goals_configurations_updated_at
  BEFORE UPDATE ON public.goals_configurations
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();