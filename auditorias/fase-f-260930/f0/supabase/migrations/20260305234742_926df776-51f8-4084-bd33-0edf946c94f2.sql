
-- Promote user to admin in user_roles
UPDATE public.user_roles SET role = 'admin' WHERE user_id = 'ccd47976-1a04-4722-8e59-87aeb09d748b';

-- Update profile role to admin
UPDATE public.profiles SET role = 'admin' WHERE user_id = 'ccd47976-1a04-4722-8e59-87aeb09d748b';

-- Assign all unassigned contacts to this user's profile
UPDATE public.contacts SET assigned_to = 'bbc5817d-ccbc-4a64-9d24-d5e5a082c501' WHERE assigned_to IS NULL;
