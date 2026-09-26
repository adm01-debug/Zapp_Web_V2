-- Fecha o achado ALTO da auditoria de 2026-09-26: a FK gmail_accounts_user_id_fkey
-- adicionada pelo E17 (20260926200000) usa ON DELETE CASCADE, e gmail_accounts
-- ja encadeia com 3 FKs pre-existentes tambem CASCADE (email_threads, email_messages,
-- email_labels, todas via gmail_account_id). Medido ao vivo antes deste fix: apagar
-- 1 usuario real apagaria em cascata 1.738 email_threads e 2.229 email_messages, sem
-- soft-delete, sem aviso -- risco de perda de dados irreversivel que nao existia
-- antes do E17 (apagar um usuario deixava as linhas orfas, mas preservadas).
--
-- gmail_accounts.user_id e NOT NULL, entao SET NULL quebraria a constraint na hora
-- do delete. RESTRICT e a troca minima: bloqueia o delete com erro de FK explicito
-- em vez de cascatear silenciosamente -- quem for apagar o usuario precisa primeiro
-- decidir o que fazer com a conta Gmail (ex: apagar gmail_accounts manualmente, o
-- que ainda cascateia threads/mensagens, mas como acao consciente e separada).
-- As outras 12 FKs do E17 (logs/sessoes por usuario, blast radius baixo e esperado
-- desaparecer com o usuario) ficam CASCADE como estavam.
ALTER TABLE public.gmail_accounts
  DROP CONSTRAINT gmail_accounts_user_id_fkey;

ALTER TABLE public.gmail_accounts
  ADD CONSTRAINT gmail_accounts_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE RESTRICT;
