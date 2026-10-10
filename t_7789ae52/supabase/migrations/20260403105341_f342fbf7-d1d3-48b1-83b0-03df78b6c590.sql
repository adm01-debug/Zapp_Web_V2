-- Gmail Accounts table
CREATE TABLE public.gmail_accounts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  email_address TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  sync_status TEXT NOT NULL DEFAULT 'pending',
  last_sync_at TIMESTAMPTZ,
  last_error TEXT,
  access_token TEXT,
  refresh_token TEXT,
  token_expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(email_address)
);

ALTER TABLE public.gmail_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own gmail accounts"
  ON public.gmail_accounts FOR SELECT
  TO authenticated
  USING (user_id = auth.uid() OR public.is_admin_or_supervisor(auth.uid()));

CREATE POLICY "Users can insert own gmail accounts"
  ON public.gmail_accounts FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own gmail accounts"
  ON public.gmail_accounts FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid() OR public.is_admin_or_supervisor(auth.uid()));

CREATE POLICY "Users can delete own gmail accounts"
  ON public.gmail_accounts FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

CREATE TRIGGER update_gmail_accounts_updated_at
  BEFORE UPDATE ON public.gmail_accounts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Email Threads table
CREATE TABLE public.email_threads (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  gmail_account_id UUID NOT NULL REFERENCES public.gmail_accounts(id) ON DELETE CASCADE,
  gmail_thread_id TEXT NOT NULL,
  contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
  subject TEXT NOT NULL DEFAULT '',
  snippet TEXT NOT NULL DEFAULT '',
  label_ids TEXT[] NOT NULL DEFAULT '{}',
  message_count INTEGER NOT NULL DEFAULT 0,
  is_unread BOOLEAN NOT NULL DEFAULT true,
  is_starred BOOLEAN NOT NULL DEFAULT false,
  is_important BOOLEAN NOT NULL DEFAULT false,
  last_message_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  assigned_to UUID,
  status TEXT NOT NULL DEFAULT 'open',
  priority TEXT NOT NULL DEFAULT 'medium',
  tags TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(gmail_account_id, gmail_thread_id)
);

ALTER TABLE public.email_threads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view threads of own accounts"
  ON public.email_threads FOR SELECT
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.gmail_accounts ga WHERE ga.id = gmail_account_id AND (ga.user_id = auth.uid() OR public.is_admin_or_supervisor(auth.uid())))
  );

CREATE POLICY "Users can insert threads for own accounts"
  ON public.email_threads FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.gmail_accounts ga WHERE ga.id = gmail_account_id AND ga.user_id = auth.uid())
  );

CREATE POLICY "Users can update threads of own accounts"
  ON public.email_threads FOR UPDATE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.gmail_accounts ga WHERE ga.id = gmail_account_id AND (ga.user_id = auth.uid() OR public.is_admin_or_supervisor(auth.uid())))
  );

CREATE POLICY "Users can delete threads of own accounts"
  ON public.email_threads FOR DELETE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.gmail_accounts ga WHERE ga.id = gmail_account_id AND ga.user_id = auth.uid())
  );

CREATE TRIGGER update_email_threads_updated_at
  BEFORE UPDATE ON public.email_threads
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_email_threads_account ON public.email_threads(gmail_account_id);
CREATE INDEX idx_email_threads_contact ON public.email_threads(contact_id);
CREATE INDEX idx_email_threads_last_message ON public.email_threads(last_message_at DESC);

-- Email Messages table
CREATE TABLE public.email_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  thread_id UUID NOT NULL REFERENCES public.email_threads(id) ON DELETE CASCADE,
  gmail_message_id TEXT NOT NULL,
  gmail_account_id UUID NOT NULL REFERENCES public.gmail_accounts(id) ON DELETE CASCADE,
  from_address TEXT NOT NULL DEFAULT '',
  from_name TEXT,
  to_addresses TEXT[] NOT NULL DEFAULT '{}',
  cc_addresses TEXT[] NOT NULL DEFAULT '{}',
  bcc_addresses TEXT[] NOT NULL DEFAULT '{}',
  reply_to_address TEXT,
  subject TEXT NOT NULL DEFAULT '',
  body_text TEXT NOT NULL DEFAULT '',
  body_html TEXT NOT NULL DEFAULT '',
  snippet TEXT NOT NULL DEFAULT '',
  label_ids TEXT[] NOT NULL DEFAULT '{}',
  is_read BOOLEAN NOT NULL DEFAULT false,
  is_starred BOOLEAN NOT NULL DEFAULT false,
  has_attachments BOOLEAN NOT NULL DEFAULT false,
  in_reply_to TEXT,
  references_header TEXT,
  internal_date TIMESTAMPTZ NOT NULL DEFAULT now(),
  direction TEXT NOT NULL DEFAULT 'inbound',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(gmail_account_id, gmail_message_id)
);

ALTER TABLE public.email_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view messages of own accounts"
  ON public.email_messages FOR SELECT
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.gmail_accounts ga WHERE ga.id = gmail_account_id AND (ga.user_id = auth.uid() OR public.is_admin_or_supervisor(auth.uid())))
  );

CREATE POLICY "Users can insert messages for own accounts"
  ON public.email_messages FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.gmail_accounts ga WHERE ga.id = gmail_account_id AND ga.user_id = auth.uid())
  );

CREATE POLICY "Users can update messages of own accounts"
  ON public.email_messages FOR UPDATE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.gmail_accounts ga WHERE ga.id = gmail_account_id AND (ga.user_id = auth.uid() OR public.is_admin_or_supervisor(auth.uid())))
  );

CREATE INDEX idx_email_messages_thread ON public.email_messages(thread_id);
CREATE INDEX idx_email_messages_account ON public.email_messages(gmail_account_id);
CREATE INDEX idx_email_messages_date ON public.email_messages(internal_date DESC);

-- Email Labels table
CREATE TABLE public.email_labels (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  gmail_account_id UUID NOT NULL REFERENCES public.gmail_accounts(id) ON DELETE CASCADE,
  gmail_label_id TEXT NOT NULL,
  name TEXT NOT NULL,
  label_type TEXT NOT NULL DEFAULT 'user',
  color TEXT,
  message_count INTEGER NOT NULL DEFAULT 0,
  unread_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(gmail_account_id, gmail_label_id)
);

ALTER TABLE public.email_labels ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view labels of own accounts"
  ON public.email_labels FOR SELECT
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.gmail_accounts ga WHERE ga.id = gmail_account_id AND (ga.user_id = auth.uid() OR public.is_admin_or_supervisor(auth.uid())))
  );

CREATE POLICY "Users can manage labels of own accounts"
  ON public.email_labels FOR ALL
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.gmail_accounts ga WHERE ga.id = gmail_account_id AND ga.user_id = auth.uid())
  );

CREATE INDEX idx_email_labels_account ON public.email_labels(gmail_account_id);