
-- Add sharing column
ALTER TABLE public.saved_filters ADD COLUMN IF NOT EXISTS is_shared BOOLEAN DEFAULT false;

-- Allow authenticated users to see shared filters from other users
CREATE POLICY "Users can view shared filters"
ON public.saved_filters FOR SELECT TO authenticated
USING (is_shared = true);
