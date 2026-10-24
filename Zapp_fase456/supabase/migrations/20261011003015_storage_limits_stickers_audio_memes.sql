-- N-009 (SEC-DEFINER_GRANTS_STORAGE-06): buckets publicos de figurinhas e audios-meme sem limite de tamanho nem restricao de MIME.
-- Rollback: UPDATE storage.buckets SET file_size_limit = NULL, allowed_mime_types = NULL WHERE id = 'stickers'; UPDATE storage.buckets SET file_size_limit = NULL, allowed_mime_types = NULL WHERE id = 'audio-memes';
--   UPDATE storage.buckets SET file_size_limit = NULL, allowed_mime_types = NULL WHERE id = 'stickers';
--   UPDATE storage.buckets SET file_size_limit = NULL, allowed_mime_types = NULL WHERE id = 'audio-memes';
-- Bucket com allowed_mime_types NULL permite upload de qualquer tipo,
-- incluindo text/html (vetor de pagina hospedada servida pelo dominio do storage).
-- stickers recebe figurinhas (imagens); audio-memes recebe audios curtos (memes).
-- Limites seguindo o precedente do repo: avatars 5MB + imagens
-- (20260306011524), custom-emojis 500KB + imagens (20260319005455);
-- stickers usa o padrao de imagens do custom-emojis sem svg+xml;
-- audio-memes usa 5MB com os 5 MIMEs de audio da correcao sugerida na auditoria.
UPDATE storage.buckets
SET file_size_limit = 512000,
    allowed_mime_types = ARRAY[
      'image/png','image/webp','image/gif','image/jpeg'
    ]
WHERE id = 'stickers';

UPDATE storage.buckets
SET file_size_limit = 5242880,
    allowed_mime_types = ARRAY[
      'audio/mpeg','audio/ogg','audio/wav','audio/webm','audio/aac'
    ]
WHERE id = 'audio-memes';
