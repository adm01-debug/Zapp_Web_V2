-- P04: Remover índices sem uso (107 MB economizados)
-- Severidade: BAIXA
-- Status: NÃO APLICADA
-- Rollback: ver seção ROLLBACK abaixo
--
-- ATENÇÃO: Antes de dropar qualquer índice:
-- 1. Verificar se é uma constraint de unicidade (unique index)
-- 2. Confirmar que idx_scan=0 não é por reinicialização recente do servidor
-- 3. Verificar se o índice é usado por queries de longa duração não frequentes

-- ============================================================
-- DIAGNÓSTICO (somente leitura):
-- ============================================================

SELECT
  indexrelname, relname, idx_scan,
  pg_size_pretty(pg_relation_size(indexrelid)) as size
FROM pg_stat_user_indexes
WHERE schemaname = 'public' AND idx_scan = 0
  AND indexrelname NOT LIKE '%_pkey'
ORDER BY pg_relation_size(indexrelid) DESC LIMIT 10;

-- ============================================================
-- CANDIDATOS SEGUROS PARA REMOÇÃO (não são unique constraints):
-- ============================================================

/*
-- Verificar antes:
SELECT indexrelname, indisunique
FROM pg_stat_user_indexes si
JOIN pg_index i ON i.indexrelid = si.indexrelid
WHERE si.indexrelname IN (
  'email_attachments_msg_att_key',      -- 61 MB
  'email_messages_body_text_trgm_idx',  -- 17 MB
  'email_attachments_filename_trgm_idx',-- 11 MB
  'idx_messages_content_trgm',          -- 5 MB
  'idx_messages_media_url_trgm',        -- 4.4 MB
  'idx_audit_logs_user_id',             -- 968 kB
  'idx_email_attachments_email_message_id', -- 904 kB
  'idx_messages_whatsapp_connection_id',-- 632 kB
  'idx_contacts_name_asc',              -- 368 kB
  'idx_contacts_email_trgm'             -- 312 kB
);
*/

-- APLICAR (somente após confirmação dos checks acima):
/*
DROP INDEX CONCURRENTLY IF EXISTS public.email_messages_body_text_trgm_idx;
DROP INDEX CONCURRENTLY IF EXISTS public.email_attachments_filename_trgm_idx;
DROP INDEX CONCURRENTLY IF EXISTS public.idx_messages_content_trgm;
DROP INDEX CONCURRENTLY IF EXISTS public.idx_messages_media_url_trgm;
-- NÃO dropar email_attachments_msg_att_key sem verificar se é unique constraint
*/

-- NOTA: CREATE INDEX CONCURRENTLY não funciona via MCP (transação).
-- Usar psql direto ou SQL Editor do painel.

-- ============================================================
-- ROLLBACK (recriar índices se necessário):
-- ============================================================

/*
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_messages_content_trgm
  ON public.messages USING gin (content gin_trgm_ops);

CREATE INDEX CONCURRENTLY IF NOT EXISTS email_messages_body_text_trgm_idx
  ON public.email_messages USING gin (body_text gin_trgm_ops);

-- (repetir para cada índice removido)
*/