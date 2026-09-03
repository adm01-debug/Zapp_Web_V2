-- Migration retroativa: DDL aplicada em producao em 2026-09-02 via db_transaction
-- (sessao paralela) e registrada no ledger sem arquivo no repo. Arquivo criado para
-- fechar o drift (DB Live Guard); corpo abaixo e byte-identico ao ledger.

CREATE INDEX IF NOT EXISTS idx_messages_contact_media ON public.messages (contact_id, created_at DESC) WHERE media_url IS NOT NULL
