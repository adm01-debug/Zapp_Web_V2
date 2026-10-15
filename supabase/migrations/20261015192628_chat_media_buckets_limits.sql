-- Limites de TIPO e TAMANHO no SERVIDOR (storage.buckets) dos buckets de midia
-- do chat: whatsapp-media e audio-messages (cartao PK-26).
-- Rollback: restaura file_size_limit e allowed_mime_types para NULL nos dois buckets (estado anterior).
-- Rollback (SQL executável, na ordem):
--   UPDATE storage.buckets SET file_size_limit = NULL, allowed_mime_types = NULL WHERE id = 'whatsapp-media';
--   UPDATE storage.buckets SET file_size_limit = NULL, allowed_mime_types = NULL WHERE id = 'audio-messages';
--
-- DEFEITO. A migration 20260905030000 fechou `public` dos buckets de dado de
-- cliente mas nao definiu `file_size_limit` nem `allowed_mime_types`: os dois
-- ficaram NULL. Sem esses campos o Supabase Storage aceita objeto de QUALQUER
-- tamanho e QUALQUER tipo (inclusive executavel) de qualquer cliente
-- autenticado que chame o Storage direto. A unica validacao viva hoje e a do
-- navegador (src/utils/whatsappFileTypes.ts, validateFile) — que o invasor
-- simplesmente nao usa.
--
-- LISTA (paridade com o catalogo do front, getAllowedMimeTypes):
--   imagem   image/jpeg, image/png, image/webp
--   video    video/mp4, video/3gpp
--   audio    audio/aac, audio/amr, audio/mpeg, audio/ogg, audio/opus, audio/mp4
--   documento application/pdf, application/msword, .docx, .xls, .xlsx, .ppt,
--             .pptx, text/plain, text/csv, application/zip, application/x-rar-compressed,
--             application/vnd.rar
-- audio/webm e audio/wav entram so no audio-messages: a Edge
--   recover-corrupted-audios grava audio/webm ali (contentType decidido pelas
--   magic bytes do arquivo). Executavel (application/x-msdownload & cia) fica
--   fora do whatsapp-media de proposito: era o furo do bucket aberto.
--
-- TAMANHO. whatsapp-media: 104857600 (100 MB) = teto do maior tipo do catalogo
-- (documento). audio-messages: 26214400 (25 MB) = teto do front para audio
-- (16 MB) com margem para o audio RECEBIDO (que nao passa pelo front).
--
-- NOTA DE ESCOPO (efeito colateral conhecido, fora desta area): a Edge
-- evolution-media (_shared/evolution-media.ts) grava documento recebido com
-- contentType 'application/octet-stream' quando a resposta do CDN nao traz
-- Content-Type (linhas 69-70 e 122-124) — esse envio passa a ser recusado pelo
-- Storage. O caminho do front e o do mimetypeHint da Evolution mandam MIME
-- real; o ajuste do fallback e da area de Edge (registrado em comentario no
-- cartao). Sem a allowlist o furo e maior: o bucket aceita qualquer binario.
UPDATE storage.buckets
SET file_size_limit = 104857600,
    allowed_mime_types = ARRAY[
      'image/jpeg','image/png','image/webp',
      'video/mp4','video/3gpp',
      'audio/aac','audio/amr','audio/mpeg','audio/ogg','audio/opus','audio/mp4',
      'application/pdf','application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-powerpoint',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'text/plain','text/csv',
      'application/zip','application/x-rar-compressed','application/vnd.rar'
    ]
WHERE id = 'whatsapp-media';

UPDATE storage.buckets
SET file_size_limit = 26214400,
    allowed_mime_types = ARRAY[
      'audio/aac','audio/amr','audio/mpeg','audio/ogg','audio/opus','audio/mp4',
      'audio/webm','audio/wav'
    ]
WHERE id = 'audio-messages';
