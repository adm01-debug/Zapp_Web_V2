-- Create agent_stats table for XP and performance tracking
CREATE TABLE public.agent_stats (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  xp INTEGER NOT NULL DEFAULT 0,
  level INTEGER NOT NULL DEFAULT 1,
  achievements_count INTEGER NOT NULL DEFAULT 0,
  messages_sent INTEGER NOT NULL DEFAULT 0,
  messages_received INTEGER NOT NULL DEFAULT 0,
  conversations_resolved INTEGER NOT NULL DEFAULT 0,
  avg_response_time_seconds INTEGER DEFAULT 0,
  customer_satisfaction_score DECIMAL(3,2) DEFAULT 0,
  current_streak INTEGER NOT NULL DEFAULT 0,
  best_streak INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(profile_id)
);

-- Create achievements table
CREATE TABLE public.agent_achievements (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  achievement_type TEXT NOT NULL,
  achievement_name TEXT NOT NULL,
  achievement_description TEXT,
  xp_earned INTEGER NOT NULL DEFAULT 0,
  earned_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create indexes
CREATE INDEX idx_agent_stats_xp ON public.agent_stats(xp DESC);
CREATE INDEX idx_agent_stats_level ON public.agent_stats(level DESC);
CREATE INDEX idx_agent_achievements_profile ON public.agent_achievements(profile_id);

-- Enable RLS
ALTER TABLE public.agent_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_achievements ENABLE ROW LEVEL SECURITY;

-- RLS policies for agent_stats - everyone can view for leaderboard
CREATE POLICY "Anyone can view agent stats"
ON public.agent_stats
FOR SELECT
USING (true);

CREATE POLICY "Users can update their own stats"
ON public.agent_stats
FOR UPDATE
USING (profile_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid()));

CREATE POLICY "System can insert stats"
ON public.agent_stats
FOR INSERT
WITH CHECK (true);

-- RLS policies for achievements
CREATE POLICY "Anyone can view achievements"
ON public.agent_achievements
FOR SELECT
USING (true);

CREATE POLICY "System can insert achievements"
ON public.agent_achievements
FOR INSERT
WITH CHECK (true);

-- Trigger for updated_at
CREATE TRIGGER update_agent_stats_updated_at
BEFORE UPDATE ON public.agent_stats
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Enable realtime for leaderboard updates
ALTER PUBLICATION supabase_realtime ADD TABLE public.agent_stats;

-- Function to calculate level from XP
CREATE OR REPLACE FUNCTION public.calculate_level(xp_amount INTEGER)
RETURNS INTEGER
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  -- Level formula: each level requires level * 100 XP
  -- Level 1: 0-99 XP, Level 2: 100-299 XP, Level 3: 300-599 XP, etc.
  RETURN GREATEST(1, FLOOR(SQRT(xp_amount / 50.0))::INTEGER + 1);
END;
$$;

-- Trigger to auto-update level when XP changes
CREATE OR REPLACE FUNCTION public.update_agent_level()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.level := calculate_level(NEW.xp);
  RETURN NEW;
END;
$$;

CREATE TRIGGER update_level_on_xp_change
BEFORE INSERT OR UPDATE OF xp ON public.agent_stats
FOR EACH ROW
EXECUTE FUNCTION public.update_agent_level();

-- Function to initialize agent stats when profile is created
CREATE OR REPLACE FUNCTION public.init_agent_stats()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.agent_stats (profile_id)
  VALUES (NEW.id)
  ON CONFLICT (profile_id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER init_stats_on_profile_create
AFTER INSERT ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.init_agent_stats();