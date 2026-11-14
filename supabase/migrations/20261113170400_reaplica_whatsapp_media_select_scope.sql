-- Reaplica 20261011010000_fix_whatsapp_media_select_contact_scope (achado 01 P1 de
-- docs/audits/SEGURANCA_DEFINER_GRANTS_STORAGE_2026-10-07.md): escopo por contato na leitura de
-- midia privada do Storage (buckets whatsapp-media e audio-messages).
--
-- POR QUE EXISTE: o ledger registrou a versao 20261011010000 com statements NULL e o estado vivo
-- de producao NAO bate com o arquivo. Prova (SELECT em producao, 2026-11-14):
--   SELECT version, statements IS NULL FROM supabase_migrations.schema_migrations
--    WHERE version = '20261011010000';                       -> 20261011010000 | true
--   SELECT qual FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects'
--    AND policyname = 'whatsapp media readable via visible message';
--     -> predicado ANTIGO de 20261003142707: so casa media_url de QUALQUER mensagem visivel com o
--        caminho do objeto; sem is_contact_visible_to_user, sem storage.foldername e sem m.sender.
-- Efeito: um atendente le o binario de um contato que nao atende, desde que uma mensagem visivel a
-- ele carregue a URL daquele objeto.
--
-- O QUE FAZ: recria a policy com o MESMO nome e o corpo byte-identico ao de 20261011010000
-- (DROP POLICY IF EXISTS + CREATE POLICY: idempotente, pode rodar 2x). Nenhuma migration posterior
-- a 20261011010000 redefine esta policy (git grep em origin/main), entao nada posterior e desfeito.
-- Nao toca nas policies "Users can read assigned whatsapp media"/"... audio messages"
-- (20261011003024, ja aplicadas e conferidas no estado vivo) nem na RPC irma
-- enqueue_outbound_message (20261010211000, ja viva com media_url_out_of_contact_scope).
--
-- EFEITO EM DADOS LEGADOS (medido em producao, so leitura): mensagens com media_url para pasta
-- legada deixam de ser liberadas POR ESTA POLICY quando sender = 'agent' (911 linhas, 4 delas
-- stickers) e quando sao stickers recebidos na pasta `stickers/`, que nao e igual ao message_type
-- 'sticker' (480 linhas); a ultima dessas mensagens e de 2026-10-02. Midia recebida nova ja grava em
-- `<contato>/<tipo>/...` (supabase/functions/_shared/evolution-media.ts:79), mas sticker recebido
-- AINDA grava em `stickers/` (supabase/functions/_shared/evolution-webhook-messages.ts:1342). Para
-- admin/supervisor e para o atendente atribuido ao contato nada muda (policies "assigned"); quem
-- perde o acesso a esses arquivos e o membro de fila / gestor que ve o contato sem ser o atribuido.
-- E o desenho do arquivo original (o ramo legado so vale para midia recebida com pasta = tipo).
--
-- Rollback (SQL executavel, na ordem) — volta ao predicado vivo antes desta migration:
--   DROP POLICY IF EXISTS "whatsapp media readable via visible message" ON storage.objects;
--   CREATE POLICY "whatsapp media readable via visible message" ON storage.objects FOR SELECT TO authenticated USING (objects.bucket_id = ANY (ARRAY['whatsapp-media'::text, 'audio-messages'::text]) AND EXISTS (SELECT 1 FROM public.messages m WHERE m.media_url IS NOT NULL AND (right(m.media_url, length('/' || objects.bucket_id || '/' || objects.name)) = '/' || objects.bucket_id || '/' || objects.name OR position('/' || objects.bucket_id || '/' || objects.name || '?' IN m.media_url) > 0 OR right(m.media_url, length('/' || objects.bucket_id || '/' || replace(objects.name, ' ', '%20'))) = '/' || objects.bucket_id || '/' || replace(objects.name, ' ', '%20') OR position('/' || objects.bucket_id || '/' || replace(objects.name, ' ', '%20') || '?' IN m.media_url) > 0)));
--
-- CLASSE: contrato (contem drop policy) — aplicar so depois do merge, pelo fluxo de
-- docs/agentes/banco.md. storage.objects e lida o tempo todo: lock_timeout curto evita fila de
-- leitores atras do AccessExclusiveLock do DROP/CREATE POLICY.

SET LOCAL lock_timeout = '3s';

DROP POLICY IF EXISTS "whatsapp media readable via visible message" ON storage.objects;

CREATE POLICY "whatsapp media readable via visible message"
ON storage.objects FOR SELECT TO authenticated
USING (
  objects.bucket_id = ANY (ARRAY['whatsapp-media'::text, 'audio-messages'::text])
  AND EXISTS (
    SELECT 1
    FROM public.messages m
    WHERE m.media_url IS NOT NULL
      AND public.is_contact_visible_to_user(m.contact_id, auth.uid()) IS TRUE
      AND (
        -- caminho novo `<contactId>/...`: a pasta do objeto e o contato da PROPRIA mensagem
        m.contact_id::text = (storage.foldername(objects.name))[1]
        -- caminho legado `<messageType>/...`: vale SOMENTE para mensagem recebida (sender='contact')
        -- cuja pasta do objeto e o proprio message_type -- sem isso, uma mensagem de SAIDA (agent)
        -- forjada/propria com message_type igual ao nome da pasta liberaria objeto alheio.
        OR (m.sender = 'contact' AND (storage.foldername(objects.name))[1] = m.message_type)
      )
      AND (
        right(m.media_url, length('/' || objects.bucket_id || '/' || objects.name))
          = '/' || objects.bucket_id || '/' || objects.name
        OR position('/' || objects.bucket_id || '/' || objects.name || '?' IN m.media_url) > 0
        OR right(m.media_url, length('/' || objects.bucket_id || '/' || replace(objects.name, ' ', '%20')))
          = '/' || objects.bucket_id || '/' || replace(objects.name, ' ', '%20')
        OR position('/' || objects.bucket_id || '/' || replace(objects.name, ' ', '%20') || '?' IN m.media_url) > 0
      )
  )
);
