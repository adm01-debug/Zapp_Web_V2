-- 20260827210200_email_attachments_table
--
-- Ultima peca do fluxo Gmail: _shared/gmail-helpers.ts:219 faz upsert em
-- email_attachments com onConflict "email_message_id", mas a tabela nao
-- existia (upsert falhava em silencio — o helper nao checa o erro — e anexos
-- nunca eram salvos).
--
-- Colunas ditadas pelo call site: email_message_id, gmail_attachment_id,
-- filename, mime_type, size_bytes. O onConflict exige UNIQUE(email_message_id)
-- (uma linha de anexo por mensagem — e o contrato do codigo como escrito;
-- multi-anexo sobrescreve, comportamento identico ao helper). O indice do
-- UNIQUE tambem cobre a FK (invariante A-08 da auditoria: FK sem indice = 0).

CREATE TABLE public.email_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email_message_id uuid NOT NULL UNIQUE
    REFERENCES public.email_messages(id) ON DELETE CASCADE,
  gmail_attachment_id text NOT NULL,
  filename text,
  mime_type text,
  size_bytes bigint,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.email_attachments IS
  'Metadados de anexos Gmail (sem o binario — fica no Gmail, baixado sob demanda via gmail_attachment_id). UNIQUE(email_message_id) espelha o onConflict do upsert em _shared/gmail-helpers.ts.';

ALTER TABLE public.email_attachments ENABLE ROW LEVEL SECURITY;

-- SELECT: mesmo predicado de email_messages (dono da conta ou admin/supervisor)
CREATE POLICY "Users can view attachments of own accounts"
  ON public.email_attachments FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.email_messages em
    JOIN public.gmail_accounts ga ON ga.id = em.gmail_account_id
    WHERE em.id = email_attachments.email_message_id
      AND (ga.user_id = auth.uid() OR is_admin_or_supervisor(auth.uid()))
  ));

-- INSERT: so o backend (edges com service key). Policy explicita para manter
-- o invariante da auditoria A1.4 (tabela com policy precisa de policy de escrita).
CREATE POLICY "service_role inserts email attachments"
  ON public.email_attachments FOR INSERT TO service_role
  WITH CHECK (true);
