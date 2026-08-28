-- Gmail Integration: accounts, email threads, and message enhancements
-- =====================================================================

-- 1. Gmail accounts table (stores OAuth tokens and sync state per user)
CREATE TABLE public.gmail_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  email_address text NOT NULL,
  access_token text NOT NULL,
  refresh_token text NOT NULL,
  token_expires_at timestamptz NOT NULL,
  history_id text,
  watch_expiration timestamptz,
  scopes text[] DEFAULT '{}',
  is_active boolean DEFAULT true,
  sync_status text DEFAULT 'pending' CHECK (sync_status IN ('pending', 'syncing', 'synced', 'error')),
  last_sync_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(profile_id, email_address)
);

ALTER TABLE public.gmail_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own gmail accounts"
ON public.gmail_accounts FOR SELECT TO authenticated
USING (
  profile_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
  OR EXISTS (SELECT 1 FROM public.profiles WHERE user_id = auth.uid() AND role IN ('admin', 'supervisor'))
);

CREATE POLICY "Users can manage their own gmail accounts"
ON public.gmail_accounts FOR ALL TO authenticated
USING (profile_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid()))
WITH CHECK (profile_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid()));

CREATE INDEX idx_gmail_accounts_profile ON public.gmail_accounts(profile_id);
CREATE INDEX idx_gmail_accounts_email ON public.gmail_accounts(email_address);

-- 2. Email threads table (maps Gmail threads to Zapp conversations)
CREATE TABLE public.email_threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gmail_account_id uuid NOT NULL REFERENCES public.gmail_accounts(id) ON DELETE CASCADE,
  gmail_thread_id text NOT NULL,
  contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
  subject text,
  snippet text,
  label_ids text[] DEFAULT '{}',
  message_count integer DEFAULT 0,
  is_unread boolean DEFAULT true,
  is_starred boolean DEFAULT false,
  is_important boolean DEFAULT false,
  last_message_at timestamptz,
  assigned_to uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  status text DEFAULT 'open' CHECK (status IN ('open', 'pending', 'resolved', 'archived')),
  priority text DEFAULT 'medium' CHECK (priority IN ('high', 'medium', 'low')),
  tags text[] DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(gmail_account_id, gmail_thread_id)
);

ALTER TABLE public.email_threads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view email threads"
ON public.email_threads FOR SELECT TO authenticated USING (true);

CREATE POLICY "Users can manage email threads they have access to"
ON public.email_threads FOR ALL TO authenticated
USING (
  gmail_account_id IN (SELECT id FROM public.gmail_accounts WHERE profile_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid()))
  OR assigned_to IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
  OR EXISTS (SELECT 1 FROM public.profiles WHERE user_id = auth.uid() AND role IN ('admin', 'supervisor'))
)
WITH CHECK (true);

CREATE INDEX idx_email_threads_account ON public.email_threads(gmail_account_id);
CREATE INDEX idx_email_threads_contact ON public.email_threads(contact_id);
CREATE INDEX idx_email_threads_gmail_thread ON public.email_threads(gmail_thread_id);
CREATE INDEX idx_email_threads_status ON public.email_threads(status);
CREATE INDEX idx_email_threads_last_message ON public.email_threads(last_message_at DESC);

-- 3. Email messages table (individual emails within threads)
CREATE TABLE public.email_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid NOT NULL REFERENCES public.email_threads(id) ON DELETE CASCADE,
  gmail_message_id text NOT NULL UNIQUE,
  gmail_account_id uuid NOT NULL REFERENCES public.gmail_accounts(id) ON DELETE CASCADE,
  from_address text NOT NULL,
  from_name text,
  to_addresses text[] DEFAULT '{}',
  cc_addresses text[] DEFAULT '{}',
  bcc_addresses text[] DEFAULT '{}',
  reply_to_address text,
  subject text,
  body_text text,
  body_html text,
  snippet text,
  label_ids text[] DEFAULT '{}',
  is_read boolean DEFAULT false,
  is_starred boolean DEFAULT false,
  has_attachments boolean DEFAULT false,
  in_reply_to text,
  references_header text,
  internal_date timestamptz,
  direction text NOT NULL DEFAULT 'inbound' CHECK (direction IN ('inbound', 'outbound')),
  -- Link to Zapp messages table for unified inbox
  zapp_message_id uuid REFERENCES public.messages(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.email_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view email messages"
ON public.email_messages FOR SELECT TO authenticated USING (true);

CREATE POLICY "Users can manage their email messages"
ON public.email_messages FOR ALL TO authenticated
USING (
  gmail_account_id IN (SELECT id FROM public.gmail_accounts WHERE profile_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid()))
  OR EXISTS (SELECT 1 FROM public.profiles WHERE user_id = auth.uid() AND role IN ('admin', 'supervisor'))
)
WITH CHECK (true);

CREATE INDEX idx_email_messages_thread ON public.email_messages(thread_id);
CREATE INDEX idx_email_messages_gmail_id ON public.email_messages(gmail_message_id);
CREATE INDEX idx_email_messages_account ON public.email_messages(gmail_account_id);
CREATE INDEX idx_email_messages_date ON public.email_messages(internal_date DESC);
CREATE INDEX idx_email_messages_from ON public.email_messages(from_address);

-- 4. Email attachments table
CREATE TABLE public.email_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email_message_id uuid NOT NULL REFERENCES public.email_messages(id) ON DELETE CASCADE,
  gmail_attachment_id text,
  filename text NOT NULL,
  mime_type text,
  size_bytes integer,
  storage_path text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.email_attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view email attachments"
ON public.email_attachments FOR SELECT TO authenticated USING (true);

CREATE POLICY "Users can manage email attachments"
ON public.email_attachments FOR ALL TO authenticated
USING (
  email_message_id IN (
    SELECT id FROM public.email_messages WHERE gmail_account_id IN (
      SELECT id FROM public.gmail_accounts WHERE profile_id IN (
        SELECT id FROM public.profiles WHERE user_id = auth.uid()
      )
    )
  )
)
WITH CHECK (true);

CREATE INDEX idx_email_attachments_message ON public.email_attachments(email_message_id);

-- 5. Email labels table (synced from Gmail)
CREATE TABLE public.email_labels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gmail_account_id uuid NOT NULL REFERENCES public.gmail_accounts(id) ON DELETE CASCADE,
  gmail_label_id text NOT NULL,
  name text NOT NULL,
  label_type text DEFAULT 'user' CHECK (label_type IN ('system', 'user')),
  color text,
  message_count integer DEFAULT 0,
  unread_count integer DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(gmail_account_id, gmail_label_id)
);

ALTER TABLE public.email_labels ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their email labels"
ON public.email_labels FOR SELECT TO authenticated
USING (
  gmail_account_id IN (SELECT id FROM public.gmail_accounts WHERE profile_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid()))
  OR EXISTS (SELECT 1 FROM public.profiles WHERE user_id = auth.uid() AND role IN ('admin', 'supervisor'))
);

CREATE POLICY "Users can manage their email labels"
ON public.email_labels FOR ALL TO authenticated
USING (gmail_account_id IN (SELECT id FROM public.gmail_accounts WHERE profile_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())))
WITH CHECK (gmail_account_id IN (SELECT id FROM public.gmail_accounts WHERE profile_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())));

CREATE INDEX idx_email_labels_account ON public.email_labels(gmail_account_id);

-- 6. Add email-specific fields to messages table for unified inbox
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS email_subject text;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS email_from text;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS email_to text[];
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS email_cc text[];
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS email_html_body text;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS email_thread_id uuid REFERENCES public.email_threads(id) ON DELETE SET NULL;

-- 7. Create storage bucket for email attachments
INSERT INTO storage.buckets (id, name, public) VALUES ('email-attachments', 'email-attachments', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Authenticated users can read email attachments"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'email-attachments');

CREATE POLICY "Authenticated users can upload email attachments"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'email-attachments');

-- 8. Triggers for updated_at
CREATE OR REPLACE FUNCTION public.update_gmail_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_gmail_accounts_updated_at
  BEFORE UPDATE ON public.gmail_accounts
  FOR EACH ROW EXECUTE FUNCTION public.update_gmail_updated_at();

CREATE TRIGGER trigger_email_threads_updated_at
  BEFORE UPDATE ON public.email_threads
  FOR EACH ROW EXECUTE FUNCTION public.update_gmail_updated_at();

-- 9. Enable realtime for email tables
ALTER PUBLICATION supabase_realtime ADD TABLE public.email_threads;
ALTER PUBLICATION supabase_realtime ADD TABLE public.email_messages;
