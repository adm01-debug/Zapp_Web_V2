-- Etapas 23+48: coluna message_id_header + índice em email_messages
-- message_id_header armazena o header RFC Message-ID (<CA+...@mail.gmail.com>)
-- necessário para In-Reply-To correto (RFC 5322)
ALTER TABLE public.email_messages
  ADD COLUMN IF NOT EXISTS message_id_header text;

-- Índice para query de mensagens por thread em ordem cronológica
CREATE INDEX IF NOT EXISTS idx_email_messages_thread_date
  ON public.email_messages (thread_id, internal_date ASC);
