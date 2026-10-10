-- Create table for WebAuthn/Passkey credentials
CREATE TABLE public.passkey_credentials (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    credential_id TEXT NOT NULL UNIQUE,
    public_key TEXT NOT NULL,
    counter BIGINT NOT NULL DEFAULT 0,
    device_type TEXT,
    backed_up BOOLEAN DEFAULT false,
    transports TEXT[],
    friendly_name TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    last_used_at TIMESTAMP WITH TIME ZONE,
    CONSTRAINT passkey_credentials_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE
);

-- Enable RLS
ALTER TABLE public.passkey_credentials ENABLE ROW LEVEL SECURITY;

-- Users can view their own passkeys
CREATE POLICY "Users can view own passkeys" ON public.passkey_credentials
    FOR SELECT USING (auth.uid() = user_id);

-- Users can insert their own passkeys
CREATE POLICY "Users can insert own passkeys" ON public.passkey_credentials
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Users can update their own passkeys
CREATE POLICY "Users can update own passkeys" ON public.passkey_credentials
    FOR UPDATE USING (auth.uid() = user_id);

-- Users can delete their own passkeys
CREATE POLICY "Users can delete own passkeys" ON public.passkey_credentials
    FOR DELETE USING (auth.uid() = user_id);

-- Create table for WebAuthn challenges (temporary storage)
CREATE TABLE public.webauthn_challenges (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID,
    challenge TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('registration', 'authentication')),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (now() + interval '5 minutes')
);

-- Enable RLS
ALTER TABLE public.webauthn_challenges ENABLE ROW LEVEL SECURITY;

-- Service role can manage challenges (edge functions)
CREATE POLICY "Service can manage challenges" ON public.webauthn_challenges
    FOR ALL USING (true) WITH CHECK (true);

-- Function to clean up expired challenges
CREATE OR REPLACE FUNCTION public.cleanup_expired_challenges()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    DELETE FROM public.webauthn_challenges WHERE expires_at < now();
END;
$$;

-- Index for faster lookups
CREATE INDEX idx_passkey_credentials_user_id ON public.passkey_credentials(user_id);
CREATE INDEX idx_passkey_credentials_credential_id ON public.passkey_credentials(credential_id);
CREATE INDEX idx_webauthn_challenges_expires ON public.webauthn_challenges(expires_at);