-- N-009: whatsapp-audio e multiplix-audio sem limite de tamanho nem restricao de MIME.
-- Rollback: restaura file_size_limit e allowed_mime_types para NULL nos buckets whatsapp-audio e multiplix-audio (abaixo).
-- Rollback (SQL executavel, na ordem):
--   UPDATE storage.buckets SET file_size_limit = NULL, allowed_mime_types = NULL WHERE id = 'whatsapp-audio';
--   UPDATE storage.buckets SET file_size_limit = NULL, allowed_mime_types = NULL WHERE id = 'multiplix-audio';
-- Bucket com allowed_mime_types NULL permite upload de qualquer tipo,
-- incluindo text/html (XSS vector). whatsapp-audio recebe audios do WhatsApp
-- via Evolution API; multiplix-audio recebe audios e videos curtos do Multiplix.
UPDATE storage.buckets
SET file_size_limit = 26214400,
    allowed_mime_types = ARRAY[
      'audio/ogg','audio/mpeg','audio/wav','audio/aac','audio/webm'
    ]
WHERE id = 'whatsapp-audio';

UPDATE storage.buckets
SET file_size_limit = 52428800,
    allowed_mime_types = ARRAY[
      'audio/ogg','audio/mpeg','audio/wav','audio/aac','audio/webm','video/mp4','video/webm'
    ]
WHERE id = 'multiplix-audio';
