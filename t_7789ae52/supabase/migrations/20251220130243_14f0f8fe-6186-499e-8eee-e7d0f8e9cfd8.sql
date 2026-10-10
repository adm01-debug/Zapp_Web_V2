-- Create queues table
CREATE TABLE public.queues (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  color TEXT NOT NULL DEFAULT '#3B82F6',
  is_active BOOLEAN DEFAULT true,
  max_wait_time_minutes INTEGER DEFAULT 30,
  priority INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create queue_members table (agents assigned to queues)
CREATE TABLE public.queue_members (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  queue_id UUID NOT NULL REFERENCES public.queues(id) ON DELETE CASCADE,
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(queue_id, profile_id)
);

-- Add queue_id to contacts for queue assignment
ALTER TABLE public.contacts ADD COLUMN queue_id UUID REFERENCES public.queues(id) ON DELETE SET NULL;

-- Enable RLS on queues
ALTER TABLE public.queues ENABLE ROW LEVEL SECURITY;

-- Queues policies
CREATE POLICY "Authenticated users can view queues"
ON public.queues FOR SELECT
USING (true);

CREATE POLICY "Admins can manage queues"
ON public.queues FOR ALL
USING (is_admin_or_supervisor(auth.uid()));

-- Enable RLS on queue_members
ALTER TABLE public.queue_members ENABLE ROW LEVEL SECURITY;

-- Queue members policies
CREATE POLICY "Authenticated users can view queue members"
ON public.queue_members FOR SELECT
USING (true);

CREATE POLICY "Admins can manage queue members"
ON public.queue_members FOR ALL
USING (is_admin_or_supervisor(auth.uid()));

-- Function to auto-assign contact to least busy agent in queue
CREATE OR REPLACE FUNCTION public.auto_assign_to_queue_agent()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  assigned_agent_id UUID;
BEGIN
  -- If contact has a queue but no assigned agent, find least busy agent
  IF NEW.queue_id IS NOT NULL AND NEW.assigned_to IS NULL THEN
    SELECT qm.profile_id INTO assigned_agent_id
    FROM public.queue_members qm
    JOIN public.profiles p ON p.id = qm.profile_id
    WHERE qm.queue_id = NEW.queue_id
      AND qm.is_active = true
      AND p.is_active = true
    ORDER BY (
      SELECT COUNT(*) FROM public.contacts c 
      WHERE c.assigned_to = qm.profile_id
    ) ASC
    LIMIT 1;
    
    IF assigned_agent_id IS NOT NULL THEN
      NEW.assigned_to := assigned_agent_id;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Trigger for auto-assignment when queue is set
CREATE TRIGGER auto_assign_queue_agent
BEFORE INSERT OR UPDATE OF queue_id ON public.contacts
FOR EACH ROW
EXECUTE FUNCTION public.auto_assign_to_queue_agent();

-- Update timestamp trigger for queues
CREATE TRIGGER update_queues_updated_at
BEFORE UPDATE ON public.queues
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Enable realtime for queues
ALTER PUBLICATION supabase_realtime ADD TABLE public.queues;
ALTER PUBLICATION supabase_realtime ADD TABLE public.queue_members;