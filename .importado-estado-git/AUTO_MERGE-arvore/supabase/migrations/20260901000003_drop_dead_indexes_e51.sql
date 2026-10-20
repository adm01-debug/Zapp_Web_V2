-- E51: Remover índices mortos (0 scans em produção, desperdício de WAL/memória)
-- idx_messages_content_search: GIN full-text, 896 kB, nunca usado via app
-- idx_messages_audio_meme: btree audio_meme_id, 8 kB, 0 scans
-- idx_messages_media_type: btree media_type, 8 kB, 0 scans
DROP INDEX IF EXISTS public.idx_messages_content_search;
DROP INDEX IF EXISTS public.idx_messages_audio_meme;
DROP INDEX IF EXISTS public.idx_messages_media_type;
