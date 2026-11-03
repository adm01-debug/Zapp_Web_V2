ALTER TABLE public.email_attachments DROP CONSTRAINT IF EXISTS email_attachments_email_message_id_key;

ALTER TABLE public.email_attachments ADD CONSTRAINT email_attachments_msg_att_key UNIQUE (email_message_id, gmail_attachment_id);
