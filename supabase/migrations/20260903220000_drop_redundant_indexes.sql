-- PERF: drop 9 single-column indexes made redundant by composite/unique indexes
-- Each was verified: the covering index has the same leading column (full, non-partial).
-- EXPLAIN on messages.contact_id confirmed planner already uses idx_messages_contact_created.
--
-- Savings: nine index structures a menos. O ganho por linha e por tabela, nao
-- somado: um write em messages economiza uma manutencao de indice, audit_logs
-- economiza duas, email_messages duas. UPDATEs que ficam HOT nao pagavam essas
-- manutencoes de qualquer forma. O ganho real depende do volume de cada tabela.

-- audit_logs: covered by idx_audit_logs_action_created_at (action, created_at)
DROP INDEX IF EXISTS public.idx_audit_logs_action;

-- audit_logs: covered by idx_audit_logs_user_created (user_id, created_at)
DROP INDEX IF EXISTS public.idx_audit_logs_user_id;

-- email_messages: covered by UNIQUE (gmail_account_id, gmail_message_id)
DROP INDEX IF EXISTS public.idx_email_messages_account;

-- email_messages: covered by idx_email_messages_thread_date (thread_id, internal_date)
DROP INDEX IF EXISTS public.idx_email_messages_thread;

-- email_threads: covered by idx_email_threads_account_date (gmail_account_id, last_message_at)
DROP INDEX IF EXISTS public.idx_email_threads_account;

-- login_attempts: covered by UNIQUE login_attempts_email_key (email)
DROP INDEX IF EXISTS public.idx_login_attempts_email;

-- message_reactions: covered by two UNIQUEs with message_id as leading column
DROP INDEX IF EXISTS public.idx_message_reactions_message;

-- messages: covered by idx_messages_contact_created (contact_id, created_at DESC) — full, non-partial
-- EXPLAIN confirmed planner uses idx_messages_contact_created, not this index
DROP INDEX IF EXISTS public.idx_messages_contact_id;

-- team_conversation_members: covered by UNIQUE (conversation_id, profile_id)
DROP INDEX IF EXISTS public.idx_team_members_conversation;
