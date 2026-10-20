-- Migration retroativa: DDL aplicada em producao em 2026-09-02 via db_transaction
-- (sessao paralela) e registrada no ledger sem arquivo no repo. Arquivo criado para
-- fechar o drift (DB Live Guard); corpo abaixo e byte-identico ao ledger.

-- Step 1: Null out external_id on older row for non-phantom duplicates
-- (keeps the most recently created record's external_id intact)
UPDATE public.messages
SET external_id = NULL
WHERE id IN (
  SELECT DISTINCT ON (external_id) id
  FROM public.messages
  WHERE external_id IS NOT NULL
    AND external_id IN (
      SELECT external_id FROM public.messages
      WHERE external_id IS NOT NULL
      GROUP BY external_id HAVING COUNT(*) > 1
    )
    AND sender != 'agent'
  ORDER BY external_id, created_at ASC
);

-- Step 2: Delete phantom contact rows echoed from outbound agent messages
-- (sender='contact', content='[Mensagem recebida]' created before fromMe=true fix)
DELETE FROM public.messages
WHERE sender = 'contact'
  AND content = '[Mensagem recebida]'
  AND external_id IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.messages m2
    WHERE m2.external_id = messages.external_id
      AND m2.sender = 'agent'
  );

-- Step 3: For any remaining duplicates, null the older duplicate's external_id
UPDATE public.messages
SET external_id = NULL
WHERE id IN (
  SELECT DISTINCT ON (external_id) id
  FROM public.messages
  WHERE external_id IS NOT NULL
    AND external_id IN (
      SELECT external_id FROM public.messages
      WHERE external_id IS NOT NULL
      GROUP BY external_id HAVING COUNT(*) > 1
    )
  ORDER BY external_id, created_at ASC
);

-- Step 4: Create UNIQUE partial index (only on non-NULL external_id)
CREATE UNIQUE INDEX IF NOT EXISTS messages_external_id_uq
  ON public.messages (external_id)
  WHERE external_id IS NOT NULL;
