-- SEC-DEFINER_GRANTS_STORAGE-01: amarra a leitura da midia privada do Storage ao contato dono.
--
-- Rollback: recria a policy "whatsapp media readable via visible message" com o predicado anterior
-- (so compara o texto da URL contra media_url de qualquer mensagem visivel ao chamador).
--
-- Rollback (SQL executavel, na ordem):
--   DROP POLICY IF EXISTS "whatsapp media readable via visible message" ON storage.objects;
--   CREATE POLICY "whatsapp media readable via visible message" ON storage.objects FOR SELECT TO authenticated USING (objects.bucket_id = ANY (ARRAY['whatsapp-media'::text, 'audio-messages'::text]) AND EXISTS (SELECT 1 FROM public.messages m WHERE m.media_url IS NOT NULL AND (right(m.media_url, length('/' || objects.bucket_id || '/' || objects.name)) = '/' || objects.bucket_id || '/' || objects.name OR position('/' || objects.bucket_id || '/' || objects.name || '?' IN m.media_url) > 0 OR right(m.media_url, length('/' || objects.bucket_id || '/' || replace(objects.name, ' ', '%20'))) = '/' || objects.bucket_id || '/' || replace(objects.name, ' ', '%20') OR position('/' || objects.bucket_id || '/' || replace(objects.name, ' ', '%20') || '?' IN m.media_url) > 0)));
--
-- Achado 01 (P1) de docs/audits/SEGURANCA_DEFINER_GRANTS_STORAGE_2026-10-07.md.
--
-- A policy criada em 20261003142707 autorizava a leitura do objeto quando QUALQUER linha de
-- public.messages visivel ao chamador tivesse media_url terminando no caminho do objeto. O
-- media_url e escrito pela RPC public.enqueue_outbound_message (a migration irma tambem fecha
-- a RPC), que aceitava texto do cliente. Assim, um atendente autenticado enfileirava no PROPRIO
-- contato uma mensagem com p_media_url apontando para o objeto de OUTRA conversa; a mensagem
-- (dele, legitima) carregava aquela URL e esta policy liberava o binario de um contato que ele
-- nao atende.
--
-- Correcao: alem do casamento de URL, exigir que a pasta do objeto seja dona do contato da PROPRIA
-- mensagem (m.contact_id = (storage.foldername(objects.name))[1]) -- a confirmacao de atribuicao
-- usa public.is_contact_visible_to_user(m.contact_id, auth.uid()), o mesmo predicado canonico do
-- projeto (admin / atribuido / membro de fila). O caminho LEGADO `<messageType>/...` (midia recebida
-- gravada antes do formato `<contactId>/...`) continua legivel SOMENTE quando a mensagem e recebida
-- (m.sender = 'contact') e a pasta do objeto e o proprio message_type, preservando o encaminhar de
-- midia recebida (PR #1845). O vazamento
-- cruzado nao volta por esse ramo porque a RPC irma recusa URL para pasta de contato alheio e o trigger
-- de proveniencia barra insercao direta.
--
-- NAO mexe nas duas policies de 20260930700000 (o ramo LIKE '%/' || objects.name do achado 02 ja foi
-- tratado em 20261011003024, do cartao t_1561f524); recriar as duas aqui seria duplicar a correcao.

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
