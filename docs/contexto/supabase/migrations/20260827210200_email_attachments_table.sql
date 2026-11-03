CREATE TABLE public.email_attachments (id, email_message_id UNIQUE FK, gmail_attachment_id, filename, mime_type, size_bytes, created_at)

ENABLE ROW LEVEL SECURITY

CREATE POLICY select authenticated via email_messages/gmail_accounts

CREATE POLICY insert service_role
