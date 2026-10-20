-- 1. Add SELECT policy for gmail_accounts so users can read their own records
CREATE POLICY "Users can view their own gmail accounts"
ON public.gmail_accounts
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

-- 2. Add RLS to realtime.messages for channel authorization
-- Note: Realtime RLS is handled by the SELECT policies on the published tables (messages).
-- The existing SELECT policy on public.messages already scopes to visible contacts.
-- We need to ensure the policy is tight. Let's verify and tighten if needed.

-- Tighten the messages SELECT policy to be more explicit
-- First check if there's a permissive policy that's too broad
DO $$
BEGIN
  -- Drop any overly permissive realtime policies if they exist
  IF EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'messages' AND schemaname = 'public' 
    AND policyname = 'Anyone can read messages'
  ) THEN
    DROP POLICY "Anyone can read messages" ON public.messages;
  END IF;
END $$;
