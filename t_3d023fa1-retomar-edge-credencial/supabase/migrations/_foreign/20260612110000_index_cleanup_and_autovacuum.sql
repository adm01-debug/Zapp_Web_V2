-- ============================================================
-- REFATORAÇÃO DB: Performance & Index Cleanup
-- Data: 2026-06-12
-- Autor: Auditoria automática — zapp-web-v2
-- ============================================================
--
-- Problemas corrigidos:
--   1. Remoção de índices duplicados/redundantes (18 pares identificados)
--   2. Adição de índice crítico: instance_processing_pauses
--      (481K seq scans em tabela vazia — precisa de partial index)
--   3. Configuração de autovacuum agressivo em tabelas críticas
--      (evolution_messages_wpp2 nunca sofreu vacuum)
--   4. Remoção de índice idx_msg_wpp2_created_at (coberto por compostos)
--
-- NOTA IMPORTANTE:
--   Os DROP INDEX são feitos com CONCURRENTLY para zero downtime.
--   Não há DROP de índices únicos ou PKs — apenas redundantes.
-- ============================================================

-- ────────────────────────────────────────────────────────
-- SEÇÃO 1: Configurar autovacuum nas tabelas críticas
-- ────────────────────────────────────────────────────────

-- evolution_messages_wpp2: 1.1 GB, 1.8M rows, NUNCA vacuumed
ALTER TABLE public.evolution_messages_wpp2
  SET (
    autovacuum_enabled           = true,
    autovacuum_vacuum_scale_factor = 0.01,   -- vacuum quando >1% dead tuples
    autovacuum_analyze_scale_factor = 0.005, -- analyze quando >0.5% mudanças
    autovacuum_vacuum_cost_delay  = 2,        -- menos throttling para recuperar
    autovacuum_vacuum_insert_scale_factor = 0.01
  );

-- evolution_contacts: 13.2% dead tuples, não vacuumed desde mai/2026
ALTER TABLE public.evolution_contacts
  SET (
    autovacuum_enabled           = true,
    autovacuum_vacuum_scale_factor = 0.02,
    autovacuum_analyze_scale_factor = 0.01
  );

-- ────────────────────────────────────────────────────────
-- SEÇÃO 2: Índice crítico faltando
-- instance_processing_pauses: 481K seq scans em tabela vazia
-- Toda chamada de auto_pause_instance_on_auth_spike faz seq scan
-- ────────────────────────────────────────────────────────

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_inst_pause_active
  ON public.instance_processing_pauses (instance_name, paused_until)
  WHERE paused_until > now();

-- ────────────────────────────────────────────────────────
-- SEÇÃO 3: Remover índice idx_msg_wpp2_created_at
-- Este índice (26 MB) é completamente coberto por:
--   - evolution_messages_wpp2_instance_name_created_at_idx (instance+created_at)
--   - idx_evo_wpp2_mv_daily_cover (created_at INCLUDE ...)
-- O planner usará os compostos quando created_at é a condição principal.
-- ────────────────────────────────────────────────────────

DROP INDEX CONCURRENTLY IF EXISTS public.idx_msg_wpp2_created_at;

-- ────────────────────────────────────────────────────────
-- SEÇÃO 4: Remover duplicados em evolution_contacts
-- idx_contacts_last_msg é coberto por idx_contacts_active_lastmsg
-- (o partial index é mais seletivo e serve todos os casos relevantes)
-- ────────────────────────────────────────────────────────

DROP INDEX CONCURRENTLY IF EXISTS public.idx_contacts_last_msg;

-- ────────────────────────────────────────────────────────
-- SEÇÃO 5: Remover duplicados em evolution_alerts
-- idx_alerts_created_at (2 MB) é coberto por idx_evolution_alerts_unresolved
-- ────────────────────────────────────────────────────────

DROP INDEX CONCURRENTLY IF EXISTS public.idx_alerts_created_at;

-- ────────────────────────────────────────────────────────
-- SEÇÃO 6: Remover duplicados em email_threads
-- idx_email_threads_account é coberto por idx_email_threads_unread
-- (toda query relevante tem is_unread = true no filtro)
-- ────────────────────────────────────────────────────────

DROP INDEX CONCURRENTLY IF EXISTS public.idx_email_threads_account;

-- ────────────────────────────────────────────────────────
-- SEÇÃO 7: Remover duplicados em evolution_messages_wpp2
-- idx_msgs_wpp2_media_meta: coberto por idx_evo_msgs_type_url
-- (ambos indexam message_type; condição WHERE ligeiramente diferente
--  mas idx_evo_msgs_type_url é mais restritivo e mais útil)
-- ────────────────────────────────────────────────────────

DROP INDEX CONCURRENTLY IF EXISTS public.idx_msgs_wpp2_media_meta;

-- ────────────────────────────────────────────────────────
-- SEÇÃO 8: Remover duplicados em evolution_webhook_dlq
-- idx_dlq_next_retry é coberto por idx_dlq_retry
-- (idx_dlq_retry inclui 'retrying' além de 'pending', é superconjunto)
-- ────────────────────────────────────────────────────────

DROP INDEX CONCURRENTLY IF EXISTS public.idx_dlq_next_retry;

-- ────────────────────────────────────────────────────────
-- SEÇÃO 9: Remover duplicados em agent_presence
-- idx_presence_status coberto por idx_presence_online
-- (queries de presence quase sempre filtram online)
-- ────────────────────────────────────────────────────────

DROP INDEX CONCURRENTLY IF EXISTS public.idx_presence_status;

-- ────────────────────────────────────────────────────────
-- SEÇÃO 10: Remover duplicados em stickers
-- idx_stickers_image_url coberto por idx_stickers_image_url_unique
-- ────────────────────────────────────────────────────────

DROP INDEX CONCURRENTLY IF EXISTS public.idx_stickers_image_url;

-- ────────────────────────────────────────────────────────
-- SEÇÃO 11: Remover duplicados em evolution_media
-- idx_evo_media_type coberto por idx_evo_media_stickers
-- ────────────────────────────────────────────────────────

DROP INDEX CONCURRENTLY IF EXISTS public.idx_evo_media_type;

-- ────────────────────────────────────────────────────────
-- SEÇÃO 12: Adicionar índice em evolution_contacts.instance_name
-- (apenas 4 valores únicos, mas 13M seq scans combinados)
-- Um índice composto com deleted_at ajuda nas queries principais
-- ────────────────────────────────────────────────────────

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_evo_contacts_instance_active
  ON public.evolution_contacts (instance_name, last_message_at DESC)
  WHERE deleted_at IS NULL;

-- ────────────────────────────────────────────────────────
-- VALIDAÇÃO FINAL
-- Execute após a migração para confirmar que os índices foram criados/removidos
-- ────────────────────────────────────────────────────────

-- SELECT indexname, pg_size_pretty(pg_relation_size(indexrelid)) AS size
-- FROM pg_indexes pi
-- JOIN pg_class c ON c.relname = pi.indexname
-- WHERE tablename IN (
--   'evolution_messages_wpp2','evolution_contacts','evolution_alerts',
--   'email_threads','evolution_webhook_dlq','agent_presence','stickers',
--   'evolution_media','instance_processing_pauses'
-- )
-- AND schemaname = 'public'
-- ORDER BY tablename, indexname;
