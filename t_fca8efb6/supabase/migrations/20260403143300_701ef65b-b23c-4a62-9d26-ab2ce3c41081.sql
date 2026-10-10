-- Table to persist frontend performance snapshots
CREATE TABLE public.performance_snapshots (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  profile_id UUID NOT NULL,
  fcp INTEGER DEFAULT 0,
  page_load INTEGER DEFAULT 0,
  dom_ready INTEGER DEFAULT 0,
  ttfb INTEGER DEFAULT 0,
  memory_used INTEGER DEFAULT 0,
  memory_total INTEGER DEFAULT 0,
  dom_nodes INTEGER DEFAULT 0,
  network_type TEXT DEFAULT '4g',
  rtt INTEGER DEFAULT 0,
  overall_score INTEGER DEFAULT 0,
  user_agent TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Index for time-based queries
CREATE INDEX idx_performance_snapshots_created_at ON public.performance_snapshots(created_at DESC);
CREATE INDEX idx_performance_snapshots_profile ON public.performance_snapshots(profile_id);

-- Enable RLS
ALTER TABLE public.performance_snapshots ENABLE ROW LEVEL SECURITY;

-- Admins/supervisors can see all snapshots
CREATE POLICY "Admins can view all performance snapshots"
ON public.performance_snapshots
FOR SELECT
TO authenticated
USING (public.is_admin_or_supervisor(auth.uid()));

-- Agents can view their own snapshots
CREATE POLICY "Users can view own performance snapshots"
ON public.performance_snapshots
FOR SELECT
TO authenticated
USING (profile_id = (SELECT id FROM public.profiles WHERE user_id = auth.uid() LIMIT 1));

-- Anyone authenticated can insert their own snapshots
CREATE POLICY "Users can insert own performance snapshots"
ON public.performance_snapshots
FOR INSERT
TO authenticated
WITH CHECK (profile_id = (SELECT id FROM public.profiles WHERE user_id = auth.uid() LIMIT 1));

-- Cleanup: auto-delete snapshots older than 7 days (via scheduled function)
-- Keep table manageable
CREATE POLICY "Admins can delete performance snapshots"
ON public.performance_snapshots
FOR DELETE
TO authenticated
USING (public.is_admin_or_supervisor(auth.uid()));