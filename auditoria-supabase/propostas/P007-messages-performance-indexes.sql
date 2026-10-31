-- PROPOSTA P007 — NÃO APLICADA — Auditoria 2026-10-22
-- Objeto: public.messages — índice para get_last_message_dates (P01) + remoção de índices sem uso (P05)
-- Problema 1 (P01): Função get_last_message_dates tem avg 2427ms, 719 chamadas, total ~29 min acumulados.
--   Causa provável: sequential scan em messages filtrando por contact_id sem índice composto.
--
--   Evidência:
--     db_slow_queries: calls=719, mean_ms=2427.5, total_ms=1_745_373.8
--     Função: public.get_last_message_dates
--
-- Problema 2 (P05): 4 índices trgm e dedup com 0 scans registrados consomem 13.8 MB e geram
--   write amplification em cada INSERT/UPDATE/DELETE:
--     idx_messages_content_trgm (5000 kB, 0 scans)
--     idx_messages_media_url_trgm (4368 kB, 0 scans)
--     ux_messages_dedup (4400 kB, 0 scans)
--     idx_messages_transcription_trgm (88 kB, 0 scans)
--
-- Impacto se não corrigido: Maior gargalo de negócio do banco (P01) + 13.8 MB de overhead (P05).
--
-- ROLLBACK para índice composto:
--   DROP INDEX IF EXISTS idx_messages_contact_created;
--
-- ROLLBACK para drops de índices (recriar se necessário):
--   CREATE INDEX idx_messages_content_trgm ON public.messages USING gin(content gin_trgm_ops);
--   CREATE INDEX idx_messages_media_url_trgm ON public.messages USING gin(media_url gin_trgm_ops);
--   CREATE UNIQUE INDEX ux_messages_dedup ON public.messages (...); -- verificar colunas originais
--   CREATE INDEX idx_messages_transcription_trgm ON public.messages USING gin(transcription gin_trgm_ops);
--
-- ATENÇÃO ANTES DE APLICAR:
--   1. Confirmar corpo de get_last_message_dates:
--      SELECT pg_get_functiondef('get_last_message_dates'::regproc);
--   2. Confirmar que os índices trgm realmente não têm feature ativa:
--      grep -r 'ilike\|%\|trgm\|similarity\|content.*search\|busca' src/ --include='*.ts' | grep -v '.test.'
--   3. Para ux_messages_dedup: confirmar se a unicidade é ainda necessária (apenas 6 linhas vivas).
--   4. NOTA: Usar CREATE INDEX (não CONCURRENTLY) — gateway envolve em transação (CLAUDE.md regra 5).

-- Parte 1: criar índice composto para get_last_message_dates
-- (ajustar colunas conforme o body real da função)
CREATE INDEX IF NOT EXISTS idx_messages_contact_created
  ON public.messages (contact_id, created_at DESC);

-- Parte 2: dropar índices trgm sem uso (descomente após confirmar ausência de feature de busca)
-- DROP INDEX IF EXISTS public.idx_messages_content_trgm;
-- DROP INDEX IF EXISTS public.idx_messages_media_url_trgm;
-- DROP INDEX IF EXISTS public.idx_messages_transcription_trgm;

-- Parte 3: avaliar ux_messages_dedup (descomente após confirmar necessidade com n_live_tup=6)
-- DROP INDEX IF EXISTS public.ux_messages_dedup;
