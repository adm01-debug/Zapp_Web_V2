-- Migration 20261003142707 — leitura da mídia RECEBIDA do WhatsApp pelo dono da mensagem.
--
-- PROBLEMA. As policies de SELECT de storage.objects autorizam pelo PRIMEIRO segmento do
-- caminho (`storage.foldername(name)[1]` comparado com id de contato atribuído, ou auth.uid()).
-- Mídia recebida da Evolution é gravada em `<messageType>/...` (`image/`, `video/`, `document/`,
-- e áudio em `audio-messages/audio/...`), então o primeiro segmento nunca é um contato: o copy
-- server-side de "encaminhar" falha na LEITURA da origem. Medido nas policies de 20260511233306:
--   "Users can read assigned whatsapp media" e "Users can read assigned audio messages".
--
-- DECISÃO. Joaquim, 03/10/2026, decisão 20261003-094634-3c7e-arquivos-fase7-pr-g: opção A,
-- policy ADITIVA e estreita, sem service role. O EXISTS em public.messages roda como o CHAMADOR
-- — deliberadamente SEM SECURITY DEFINER — para que a RLS de `messages` decida a visibilidade
-- com a regra de atribuição que JÁ EXISTE. Esta migration NÃO cria regra nova de acesso a
-- mensagem: quem não enxerga a linha em `messages` não enxerga o objeto.
--
-- ESCOPO. Só os dois buckets de mídia do WhatsApp, só `TO authenticated`, e só o caminho exato
-- da mensagem. A comparação usa `right(...)`/`position(...)`, NUNCA `LIKE`: nome de objeto com
-- `%` ou `_` não pode virar padrão e conceder leitura de um objeto diferente.
--
-- CLASSE: contrato (contém drop policy) — aplicar depois do merge/deploy.
-- O DROP abaixo é do PRÓPRIO nome desta migration (torna o replay idempotente). Nenhuma policy
-- existente é removida ou alterada.
--
-- rollback: DROP POLICY IF EXISTS "whatsapp media readable via visible message" ON storage.objects;
--
-- (o rollback acima é o caminho de volta completo: esta migration só cria a policy nova.)

DROP POLICY IF EXISTS "whatsapp media readable via visible message" ON storage.objects;

CREATE POLICY "whatsapp media readable via visible message"
ON storage.objects FOR SELECT TO authenticated
USING (
  objects.bucket_id = ANY (ARRAY['whatsapp-media'::text, 'audio-messages'::text])
  AND EXISTS (
    SELECT 1
    FROM public.messages m
    WHERE m.media_url IS NOT NULL
      AND (
        -- caminho exato no fim do locator (caso normal: .../object/public/<bucket>/<path>)
        right(m.media_url, length('/' || objects.bucket_id || '/' || objects.name))
          = '/' || objects.bucket_id || '/' || objects.name
        -- mesmo caminho seguido de query string (ex.: ?download=1)
        OR position('/' || objects.bucket_id || '/' || objects.name || '?' IN m.media_url) > 0
        -- nome com espaço, como o locator o codifica
        OR right(m.media_url, length('/' || objects.bucket_id || '/' || replace(objects.name, ' ', '%20')))
          = '/' || objects.bucket_id || '/' || replace(objects.name, ' ', '%20')
        OR position('/' || objects.bucket_id || '/' || replace(objects.name, ' ', '%20') || '?' IN m.media_url) > 0
      )
  )
);
