-- CHECK constraints em 5 tabelas de alta escrita (messages, contacts, email_messages,
-- audit_logs). 107 de 126 tabelas do banco não tinham nenhum CHECK constraint.
-- Cada constraint abaixo foi validada contra o dataset ao vivo (0 violações) e contra
-- o código-fonte das edge functions que escrevem nessas colunas, antes de aplicar.
--
-- messages e email_threads ficam de fora nesta migration: messages já tem 2 CHECKs
-- (sender, message_type); um terceiro candidato óbvio (content não vazio para
-- message_type='text') tem 17 violações hoje e precisa de limpeza manual antes.
-- email_threads não tem universo de dados suficiente (status/priority com 1 valor
-- observado cada em 263 linhas) para enumerar valores válidos com segurança.

ALTER TABLE public.contacts
  ADD CONSTRAINT contacts_phone_not_empty CHECK (length(btrim(phone)) > 0);

ALTER TABLE public.contacts
  ADD CONSTRAINT contacts_email_format CHECK (
    email IS NULL OR email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'
  );

ALTER TABLE public.email_messages
  ADD CONSTRAINT email_messages_from_format CHECK (
    from_address ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'
  );

ALTER TABLE public.email_messages
  ADD CONSTRAINT email_messages_direction_check CHECK (
    direction IN ('inbound', 'outbound')
  );

ALTER TABLE public.audit_logs
  ADD CONSTRAINT audit_logs_action_not_empty CHECK (length(btrim(action)) > 0);
