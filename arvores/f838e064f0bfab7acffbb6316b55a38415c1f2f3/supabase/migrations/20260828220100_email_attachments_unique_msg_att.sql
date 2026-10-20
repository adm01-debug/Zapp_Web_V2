-- 20260828220100_email_attachments_unique_msg_att
--
-- A UNIQUE anterior era so (email_message_id), o que permitia UM anexo por
-- mensagem: o loop de upsert em _shared/gmail-helpers.ts sobrescrevia o anexo
-- anterior a cada iteracao. Um e-mail com 3 anexos gravava 1 linha.
--
-- Troca para a chave natural (email_message_id, gmail_attachment_id).
-- Feito ANTES do fix de onConflict das mensagens: com o onConflict corrigido o
-- loop de anexos passa a executar de fato, e com a UNIQUE antiga estouraria 42P10.
--
-- Seguro: email_attachments tem 0 linhas.

ALTER TABLE public.email_attachments
  DROP CONSTRAINT IF EXISTS email_attachments_email_message_id_key;

ALTER TABLE public.email_attachments
  ADD CONSTRAINT email_attachments_msg_att_key
  UNIQUE (email_message_id, gmail_attachment_id);
