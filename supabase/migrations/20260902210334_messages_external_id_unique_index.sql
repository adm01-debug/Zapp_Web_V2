-- Dedup phantom echo rows (sender='contact', content='[Mensagem recebida]')
-- that were created when the agent's outbound message was echoed back as
-- an incoming webhook before the fromMe=true routing fix was deployed.
-- Keeps the agent row; deletes the phantom contact row for the same external_id.
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

DELETE FROM public.messages
WHERE sender = 'contact'
  AND content = '[Mensagem recebida]'
  AND external_id IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.messages m2
    WHERE m2.external_id = messages.external_id
      AND m2.sender = 'agent'
  );

-- Null out external_id on older row for any remaining duplicates
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

-- UNIQUE partial index: prevents duplicate external_ids while allowing NULL (idempotent webhook retries)
CREATE UNIQUE INDEX IF NOT EXISTS messages_external_id_uq
  ON public.messages (external_id)
  WHERE external_id IS NOT NULL;
