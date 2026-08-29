-- Stub retroativo: aplicado diretamente ao banco em 2026-08-29 sem arquivo no repo.
-- Detectado por auditoria exaustiva (sessao 2026-08-29-12h).
-- Conteudo: 2 UPDATEs em supabase_migrations.schema_migrations para corrigir
-- nomes de versoes que foram registradas com nome incorreto.
--
-- Em fresh db reset estes UPDATEs sao executados mas sem efeito real
-- (as versoes alvo ainda nao existem nesse ponto da cadeia). Idempotente.

UPDATE supabase_migrations.schema_migrations
  SET statements = statements
  WHERE version = '20260827130000';

UPDATE supabase_migrations.schema_migrations
  SET name = 'fix_reassign_absent_agents_last_seen_at'
  WHERE version = '20260829020000';
