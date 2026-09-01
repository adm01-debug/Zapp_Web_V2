-- Migration: add_last_sender_to_email_threads
-- Versão: 20260901100001
-- Aplicada em produção: 2026-09-01 (banco tnnnlkbymytvtqngbbqh)
--
-- Adiciona last_from_name e last_from_address em email_threads
-- para eliminar o join/N+1 na listagem de threads e corrigir
-- o bug de exibição de remetente (D5: snippet.split(' ')[0]).

ALTER TABLE public.email_threads
  ADD COLUMN IF NOT EXISTS last_from_name   TEXT,
  ADD COLUMN IF NOT EXISTS last_from_address TEXT;

-- Backfill: mensagem mais recente de cada thread
UPDATE public.email_threads t
SET
  last_from_name    = sub.from_name,
  last_from_address = sub.from_address
FROM (
  SELECT DISTINCT ON (m.thread_id)
    m.thread_id,
    m.from_name,
    m.from_address
  FROM public.email_messages m
  ORDER BY m.thread_id, m.internal_date DESC
) sub
WHERE t.id = sub.thread_id;

-- Trigger para manter as colunas atualizadas no insert/update de mensagens
CREATE OR REPLACE FUNCTION public.sync_thread_last_sender()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_latest RECORD;
BEGIN
  SELECT from_name, from_address
    INTO v_latest
    FROM public.email_messages
   WHERE thread_id = NEW.thread_id
   ORDER BY internal_date DESC
   LIMIT 1;

  IF FOUND THEN
    UPDATE public.email_threads
       SET last_from_name    = v_latest.from_name,
           last_from_address = v_latest.from_address
     WHERE id = NEW.thread_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_thread_last_sender ON public.email_messages;
CREATE TRIGGER trg_sync_thread_last_sender
  AFTER INSERT OR UPDATE OF from_name, from_address, internal_date
  ON public.email_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_thread_last_sender();
