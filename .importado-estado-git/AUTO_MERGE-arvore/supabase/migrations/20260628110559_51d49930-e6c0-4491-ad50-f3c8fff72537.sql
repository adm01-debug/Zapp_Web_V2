-- Guard idempotente: ALTER PUBLICATION ... ADD TABLE nao suporta IF NOT EXISTS.
-- Um replay do zero (disaster recovery) pode alcancar esta migration com as
-- tabelas ja adicionadas a publicacao por migrations anteriores no mesmo
-- replay (20251220130243, 20251215163158); sem o guard, a segunda tentativa
-- falha com SQLSTATE 42710 (duplicate_object). Ver
-- scripts/db-audit/migration-evidence.json (pinned-replay, reason=safer-replay)
-- para a divergencia registrada entre este arquivo e o ledger original.
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.queues;
EXCEPTION
  WHEN duplicate_object THEN
    NULL;
END
$$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.queue_members;
EXCEPTION
  WHEN duplicate_object THEN
    NULL;
END
$$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
EXCEPTION
  WHEN duplicate_object THEN
    NULL;
END
$$;

ALTER TABLE public.queues REPLICA IDENTITY FULL;
ALTER TABLE public.queue_members REPLICA IDENTITY FULL;
ALTER TABLE public.messages REPLICA IDENTITY FULL;