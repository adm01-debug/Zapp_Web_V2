-- Tornar o bucket audio-messages público para que as URLs públicas funcionem
UPDATE storage.buckets SET public = true WHERE id = 'audio-messages';
