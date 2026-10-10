-- N-009: stickers e audio-memes sem limite de tamanho nem restricao de MIME.
-- Rollback: restaura file_size_limit e allowed_mime_types para NULL nos buckets stickers e audio-memes.
-- Rollback (SQL executavel, na ordem):
--   UPDATE storage.buckets SET file_size_limit = NULL, allowed_mime_types = NULL WHERE name = 'stickers';
--   UPDATE storage.buckets SET file_size_limit = NULL, allowed_mime_types = NULL WHERE name = 'audio-memes';
-- Bucket publico com allowed_mime_types NULL permite upload de qualquer tipo,
-- incluindo text/html (XSS vector em stickers) e arquivos arbitrarios em audio-memes.
--
-- stickers: imagens e animacoes (webm) sao o uso esperado; text/html e executaveis
-- nao devem ser aceitos. Limite de 5MB e suficiente para stickers.
--
-- audio-memes: formatos de audio sao o uso esperado; 25MB cobre clips curtos.
UPDATE storage.buckets
SET file_size_limit = 5242880,
    allowed_mime_types = ARRAY[
      'image/jpeg','image/png','image/webp','image/gif','video/webm'
    ]
WHERE name = 'stickers';

UPDATE storage.buckets
SET file_size_limit = 26214400,
    allowed_mime_types = ARRAY[
      'audio/ogg','audio/mpeg','audio/wav','audio/aac','audio/webm'
    ]
WHERE name = 'audio-memes';