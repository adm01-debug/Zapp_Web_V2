-- GAP-04 parcial auditoria 02/09/2026: team-chat-files sem restricao MIME.
-- Bucket publico com null allowed_mime_types permite upload de qualquer tipo,
-- incluindo executaveis. 0 objetos existentes, safe para restringir.
--
-- whatsapp-media nao restringido porque usa application/octet-stream para
-- audio do WhatsApp (368 objetos existentes). Restringir quebraria uploads
-- de audio via webhook da Evolution API. Requer Phase 2 (audit de MIME por
-- tipo de mensagem e ajuste no edge function).
UPDATE storage.buckets
SET allowed_mime_types = ARRAY[
  'image/jpeg','image/png','image/webp','image/gif','image/svg+xml',
  'video/mp4','video/webm','video/quicktime',
  'audio/ogg','audio/mpeg','audio/wav','audio/aac',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain','text/csv',
  'application/zip','application/x-zip-compressed'
]
WHERE name = 'team-chat-files';
