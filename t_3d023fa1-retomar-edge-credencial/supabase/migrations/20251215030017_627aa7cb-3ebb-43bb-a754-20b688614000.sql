-- Add new fields to profiles table
ALTER TABLE public.profiles
ADD COLUMN job_title text,
ADD COLUMN department text,
ADD COLUMN phone text,
ADD COLUMN access_level text DEFAULT 'basic',
ADD COLUMN permissions jsonb DEFAULT '{}',
ADD COLUMN is_active boolean DEFAULT true;

-- Add index for active users
CREATE INDEX idx_profiles_is_active ON public.profiles(is_active);