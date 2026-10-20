-- Reconstrucao retroativa (GAP: aplicado via db_batch_query direto em producao
-- em 02/09/2026, sem arquivo commitado). Ledger nao tem SQL capturado
-- (statements = NULL), entao esta migration entra em migration-evidence.json
-- como ledger-only/name-and-file-pinned.
--
-- Parte "realtime_indexes" reconstruida com certeza a partir do catalogo vivo
-- (unicos indices novos em contacts/messages sem migration correspondente).
--
-- Parte "secdef search_path" NAO reconstruida por DDL aqui: nao ha baseline
-- historico para saber com precisao quais funcoes SECURITY DEFINER foram
-- alteradas nesse momento especifico (varias ja tinham search_path fixado por
-- migrations anteriores). Verificado ao vivo em 02/09/2026 que 0 funcoes
-- SECURITY DEFINER do schema public estao hoje sem search_path (query:
-- pg_proc.prosecdef=true AND proconfig sem 'search_path=%'), confirmando que
-- o estado final esta correto — mas sem certeza suficiente do delta exato
-- para reproduzir como DDL idempotente sem risco de sobrescrever alteracoes
-- nao relacionadas. Registrado aqui apenas como nota de auditoria.

CREATE INDEX IF NOT EXISTS idx_contacts_updated_at
  ON public.contacts (updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_messages_unread_contact
  ON public.messages (is_read, sender, contact_id)
  WHERE is_read = false AND sender = 'contact';
