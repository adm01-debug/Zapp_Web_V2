-- audio_memes_bucket_limits_admin_delete
-- Rollback: remove a policy de DELETE dos admins e devolve o bucket audio-memes ao estado anterior (sem file_size_limit e sem allowed_mime_types, seguindo public = true); a policy do proprio dono ("Users can delete own audio memes") nao e tocada.
-- Rollback (SQL executavel, na ordem):
--   drop policy if exists "Admins can delete any audio meme" on storage.objects;
--   update storage.buckets set file_size_limit = null, allowed_mime_types = null where id = 'audio-memes';
--
-- Fecha dois furos do bucket `audio-memes` (criado em 20260511233306_0e3f3b66):
--
-- 1) DELETE sem admin/supervisor. A policy "Users can delete own audio memes" so vale para
--    `foldername(name)[1] = auth.uid()`. O admin que tenta apagar o meme de outro usuario e
--    recusado pelo Storage e o app cai no toast "arquivo ficou orfao" (useAudioMemes.ts).
--    Objeto antigo gravado na RAIZ do bucket (nome sem pasta) tambem fica inapagavel por
--    qualquer um: `foldername` devolve array vazio e a comparacao com auth.uid() e falsa.
-- 2) Limite so no navegador. O bucket e `public = true` e nunca teve `file_size_limit` nem
--    `allowed_mime_types`: o teto de 5 MB e o filtro `audio/*` existiam apenas no cliente —
--    qualquer token autenticado subia arquivo de qualquer tipo/tamanho por chamada direta ao
--    Storage. O PK-26 (chat_media_buckets_limits.sql) cobre so whatsapp-media e audio-messages.
--
-- ADITIVA e idempotente: nao altera a policy existente, nao toca em dado, nao mexe em GRANT
-- (policy nao e ACL) e mantem o bucket PUBLICO para leitura — a URL publica esta gravada em
-- audio_memes.audio_url. A decisao de migrar para URL assinada e do dono (registrada no relato).

-- 1) DELETE por admin/supervisor, em qualquer nome do bucket (inclusive na raiz).
--    Policy permissiva: SOMA-SE a "Users can delete own audio memes", entao o dono continua
--    apagando o proprio arquivo. anon nao entra (FOR DELETE TO authenticated).
DROP POLICY IF EXISTS "Admins can delete any audio meme" ON storage.objects;
CREATE POLICY "Admins can delete any audio meme" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'audio-memes'
    AND public.is_admin_or_supervisor((SELECT auth.uid()))
  );

-- 2) Limite de tamanho e tipo passam a valer no servidor (a Storage API le estas colunas
--    antes de gravar o objeto). Guarda: falhar alto se o bucket nao existir, em vez de
--    aplicar uma migration que nao faz nada.
DO $guarda$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'audio-memes') THEN
    RAISE EXCEPTION 'bucket audio-memes ausente: aplique as migrations anteriores antes desta';
  END IF;
END
$guarda$;

UPDATE storage.buckets
   SET file_size_limit   = 5242880,             -- 5 MB
       allowed_mime_types = ARRAY['audio/*']    -- so audio (exclui executavel/imagem/video)
 WHERE id = 'audio-memes';
