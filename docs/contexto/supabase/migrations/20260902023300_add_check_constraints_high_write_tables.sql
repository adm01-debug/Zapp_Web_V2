ALTER TABLE public.contacts
  ADD CONSTRAINT contacts_phone_not_empty CHECK (length(btrim(phone)) > 0)

ALTER TABLE public.contacts
  ADD CONSTRAINT contacts_email_format CHECK (
    email IS NULL OR email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'
  )

ALTER TABLE public.email_messages
  ADD CONSTRAINT email_messages_from_format CHECK (
    from_address ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'
  )

ALTER TABLE public.email_messages
  ADD CONSTRAINT email_messages_direction_check CHECK (
    direction IN ('inbound', 'outbound')
  )

ALTER TABLE public.audit_logs
  ADD CONSTRAINT audit_logs_action_not_empty CHECK (length(btrim(action)) > 0)
