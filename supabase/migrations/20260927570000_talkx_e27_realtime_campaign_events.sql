-- E27: adiciona talkx_campaign_events, talkx_segments e talkx_templates
-- à publicação supabase_realtime.
--
-- Guard idempotente: ALTER PUBLICATION ... ADD TABLE não suporta IF NOT EXISTS.
-- Um replay do zero (disaster recovery) pode alcançar esta migration com as
-- três tabelas já adicionadas à publicação pela 20260927500001 (mesmo E27,
-- sessão paralela); sem o guard, a segunda tentativa falha com SQLSTATE 42710
-- (duplicate_object). Ver scripts/db-audit/migration-evidence.json
-- (pinned-replay, reason=safer-replay) para a divergência registrada entre
-- este arquivo e o ledger original.
-- rollback: n/a (guarda de replay idempotente; nenhum DDL adicional aplicado — o efeito final é idêntico ao ledger original, apenas o replay do arquivo ficou idempotente)

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.talkx_campaign_events;
EXCEPTION
  WHEN duplicate_object THEN
    NULL;
END
$$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.talkx_segments;
EXCEPTION
  WHEN duplicate_object THEN
    NULL;
END
$$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.talkx_templates;
EXCEPTION
  WHEN duplicate_object THEN
    NULL;
END
$$;
