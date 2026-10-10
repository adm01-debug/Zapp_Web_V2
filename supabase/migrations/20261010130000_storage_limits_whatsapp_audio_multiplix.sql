-- N-009 (continuacao): whatsapp-media, audio-messages e multiplix-voice
-- sem limite de tamanho. Rollback: restaura file_size_limit para NULL.
-- Rollback (SQL executavel, na ordem):
--   UPDATE storage.buckets SET file_size_limit = NULL WHERE name = 'whatsapp-media';
--   UPDATE storage.buckets SET file_size_limit = NULL WHERE name = 'audio-messages';
--   UPDATE storage.buckets SET file_size_limit = NULL WHERE name = 'multiplix-voice';
-- Bucket privado sem file_size_limit permite upload de qualquer tamanho,
-- incluindo arquivos arbitrariamente grandes que geram custo sem controle.
--
-- whatsapp-media: midia do WhatsApp (imagens, video, documentos); 25MB cobre
-- a maioria dos envios e evita abuso.
--
-- audio-messages: mensagens de voz; 25MB cobre clips longos.
--
-- multiplix-voice: assets de voz gerados por IA; 50MB permite vozes longas
-- e modelos com maior fidelidade.
UPDATE storage.buckets
SET file_size_limit = 26214400
WHERE name = 'whatsapp-media';

UPDATE storage.buckets
SET file_size_limit = 26214400
WHERE name = 'audio-messages';

UPDATE storage.buckets
SET file_size_limit = 52428800
WHERE name = 'multiplix-voice';