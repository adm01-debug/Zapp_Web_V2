-- Signed Storage URLs are bearer credentials with a short lifetime. Historical
-- clients persisted them in durable rows, so old messages eventually returned
-- HTTP 400. Keep the object identity, discard the query credential and store a
-- stable URL-shaped locator. The authenticated frontend signs it at read time.

SET LOCAL statement_timeout = '60s';

UPDATE public.messages
SET media_url = replace(
  split_part(media_url, '?', 1),
  '/storage/v1/object/sign/',
  '/storage/v1/object/public/'
)
WHERE media_url ~ '^https://tnnnlkbymytvtqngbbqh[.]supabase[.]co/storage/v1/object/sign/(audio-messages|team-chat-files|whatsapp-media)/[^?]+([?].*)?$';

UPDATE public.scheduled_messages
SET media_url = replace(
  split_part(media_url, '?', 1),
  '/storage/v1/object/sign/',
  '/storage/v1/object/public/'
)
WHERE media_url ~ '^https://tnnnlkbymytvtqngbbqh[.]supabase[.]co/storage/v1/object/sign/(audio-messages|team-chat-files|whatsapp-media)/[^?]+([?].*)?$';

UPDATE public.team_messages
SET media_url = replace(
  split_part(media_url, '?', 1),
  '/storage/v1/object/sign/',
  '/storage/v1/object/public/'
)
WHERE media_url ~ '^https://tnnnlkbymytvtqngbbqh[.]supabase[.]co/storage/v1/object/sign/(audio-messages|team-chat-files|whatsapp-media)/[^?]+([?].*)?$';

UPDATE public.knowledge_base_files
SET file_url = replace(
  split_part(file_url, '?', 1),
  '/storage/v1/object/sign/',
  '/storage/v1/object/public/'
)
WHERE file_url ~ '^https://tnnnlkbymytvtqngbbqh[.]supabase[.]co/storage/v1/object/sign/(audio-messages|team-chat-files|whatsapp-media)/[^?]+([?].*)?$';
