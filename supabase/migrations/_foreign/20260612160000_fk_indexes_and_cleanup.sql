-- ============================================================
-- Migration: Second audit wave — FK indexes, realtime cleanup
-- Date: 2026-06-12
-- ============================================================

-- ▸ ADD missing FK indexes (prevents seq scans on JOIN/UPDATE/DELETE)

-- outbound_message_queue.audio_meme_id (FK to audio_memes)
-- Partial index: meme-based messages are rare so the partial is tight
CREATE INDEX IF NOT EXISTS idx_outbound_queue_audio_meme_id
  ON public.outbound_message_queue(audio_meme_id)
  WHERE audio_meme_id IS NOT NULL;

-- ai_providers.created_by (FK to auth.users)
CREATE INDEX IF NOT EXISTS idx_ai_providers_created_by
  ON public.ai_providers(created_by);

-- ▸ DROP additional unused indexes (0 scans, waste write bandwidth)

-- media_download_queue — pending and type indexes (0 scans, 648 KB total)
DROP INDEX IF EXISTS public.idx_mdq_pending;
DROP INDEX IF EXISTS public.idx_mdq_type;

-- Sticker catalog — name trgm (0 scans, 104 KB; catalog is small, LIKE query is fine)
DROP INDEX IF EXISTS public.idx_stickers_name_trgm;

-- Sticker URL unique (0 scans, 64 KB; constraint-backed index handles uniqueness)
DROP INDEX IF EXISTS public.idx_stickers_image_url_unique;

-- Deals products GIN (0 scans, 24 KB)
DROP INDEX IF EXISTS public.idx_deals_products;

-- Audio memes active partial (0 scans, 16 KB; table is small, full scan is fine)
DROP INDEX IF EXISTS public.idx_audio_memes_active;

-- ▸ NOTE: The following were removed from supabase_realtime publication
-- (executed via supabase_db_realtime tool — no SQL needed here):
--   audio_meme_categories, audio_meme_favorites, audio_memes,
--   connection_health_logs, email_tracked_messages, email_tracking_events,
--   evolution_webhook_events_wpp2 (HIGH write volume — big perf win),
--   evolution_settings, sticker_categories, sticker_favorites,
--   stickers, talkx_campaigns
-- Realtime: 50 → 36 → 24 tables
