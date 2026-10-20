-- Create queue_goals table for metrics thresholds
CREATE TABLE public.queue_goals (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  queue_id UUID NOT NULL REFERENCES public.queues(id) ON DELETE CASCADE UNIQUE,
  max_waiting_contacts INTEGER DEFAULT 10,
  max_avg_wait_minutes INTEGER DEFAULT 15,
  min_assignment_rate INTEGER DEFAULT 80,
  max_messages_pending INTEGER DEFAULT 50,
  alerts_enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.queue_goals ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Authenticated users can view queue goals"
ON public.queue_goals FOR SELECT
USING (true);

CREATE POLICY "Admins can manage queue goals"
ON public.queue_goals FOR ALL
USING (is_admin_or_supervisor(auth.uid()));

-- Update timestamp trigger
CREATE TRIGGER update_queue_goals_updated_at
BEFORE UPDATE ON public.queue_goals
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.queue_goals;