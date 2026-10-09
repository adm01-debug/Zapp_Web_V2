-- SEC-STORAGE-01 (t_15a57807): a posse da midia privada e o CAMINHO do objeto, nao a media_url do cliente.
-- Rollback: ALTER POLICY "whatsapp media readable via visible message" ON storage.objects USING (objects.bucket_id = ANY (ARRAY['whatsapp-media'::text, 'audio-messages'::text]) AND EXISTS (SELECT 1 FROM public.messages m WHERE m.media_url IS NOT NULL AND ( right(m.media_url, length('/' || objects.bucket_id || '/' || objects.name)) = '/' || objects.bucket_id || '/' || objects.name OR position('/' || objects.bucket_id || '/' || objects.name || '?' IN m.media_url) > 0 OR right(m.media_url, length('/' || objects.bucket_id || '/' || replace(objects.name, ' ', '%20'))) = '/' || objects.bucket_id || '/' || replace(objects.name, ' ', '%20') OR position('/' || objects.bucket_id || '/' || replace(objects.name, ' ', '%20') || '?' IN m.media_url) > 0 ) )); ALTER POLICY "Users can read assigned whatsapp media" ON storage.objects USING (bucket_id = 'whatsapp-media' AND ( is_admin_or_supervisor(auth.uid()) OR (storage.foldername(name))[1] IN (SELECT c.id::text FROM public.contacts c WHERE c.assigned_to IN (SELECT p.id FROM public.profiles p WHERE p.user_id = auth.uid())) OR EXISTS (SELECT 1 FROM public.messages m JOIN public.contacts c ON c.id = m.contact_id WHERE m.media_url LIKE '%/' || objects.name AND c.assigned_to IN (SELECT p.id FROM public.profiles p WHERE p.user_id = auth.uid())) OR (storage.foldername(name))[1] = auth.uid()::text )); ALTER POLICY "Users can read assigned audio messages" ON storage.objects USING (bucket_id = 'audio-messages' AND ( is_admin_or_supervisor(auth.uid()) OR (storage.foldername(name))[1] IN (SELECT c.id::text FROM public.contacts c WHERE c.assigned_to IN (SELECT p.id FROM public.profiles p WHERE p.user_id = auth.uid())) OR EXISTS (SELECT 1 FROM public.messages m JOIN public.contacts c ON c.id = m.contact_id WHERE m.media_url LIKE '%/' || objects.name AND c.assigned_to IN (SELECT p.id FROM public.profiles p WHERE p.user_id = auth.uid())) ));
-- objeto (pasta de um contato visivel ao chamador), nunca o texto da media_url que o
-- cliente escolhe. Regra posse-por-caminho nos dois sentidos:
--   (a) caminho escopado pelo contato da propria mensagem (`<contact_id>/...`);
--   (b) midia RECEBIDA sem pasta de contato, cujo nome o proprio ingestao derivou do
--       `external_id` da linha — campo que o cliente NAO escreve: a trigger
--       guard_message_provenance_fields (migration 20261006114108) recusa INSERT de
--       authenticated com external_id/media_url e recusa UPDATE desses campos;
--       so o ingest (service_role) e as RPCs SECURITY DEFINER os gravam.
--
-- PROBLEMA. Tres policies de SELECT em storage.objects decidiam a leitura de
-- whatsapp-media/audio-messages pelo TEXTO da `messages.media_url`, campo que o
-- chamador escolhe (enqueue_outbound_message aceita qualquer `^https://`, e a propria
-- `media_url` de uma linha dele): basta inserir mensagem no PROPRIO contato apontando
-- para o objeto de outro contato (`.../<contact_id_alheio>/<arquivo>`) para o EXISTS
-- fechar. A policy "Users can read assigned whatsapp media" (e a gemea de
-- audio-messages) ainda casava o nome do objeto dentro de um padrao LIKE
-- (`m.media_url LIKE '%/' || objects.name`), onde `%`/`_` do nome viram curinga — o
-- mesmo defeito que a policy de 03/10/2026 corrigiu so na policy nova.
--
-- CORRECAO (opcao A do relatorio SEC-DEFINER_GRANTS_STORAGE-01). Nenhuma das tres
-- policies passa a olhar o texto da media_url. A autorizacao vem do CAMINHO:
--   1) "whatsapp media readable via visible message" — exige a mensagem de um contato
--      da visibilidade do chamador (`get_visible_agent_ids(auth.uid())`) E que o objeto
--      pertenca a esse contato: pasta = `m.contact_id` (a) ou nome derivado do
--      `external_id` da propria mensagem (b), para a midia recebida sem pasta.
--   2) "Users can read assigned whatsapp media"/"...audio messages" — perdem o ramo de
--      media_url e ficam com posse por caminho (admin/supervisor, pasta de contato
--      atribuido ao chamador, pasta do proprio auth.uid()).
--
-- O QUE NAO MUDA (prova no teste): agente le a midia dos SEUS contatos (pasta do
-- contato), supervisor/admin le a equipe, e a fila segue com o MESMO resultado de
-- antes (negado: o ramo antigo exigia `assigned_to` do chamador, como este).
-- O QUE MUDA: objeto em pasta que nao e de um contato visivel (ex.: acervo antigo em
-- `image/<id>.jpg` sem `external_id` correspondente, `kb/`) deixa de ser legivel por
-- agente; segue legivel para admin/supervisor.
--
-- CLASSE: contrato (altera policy) — aplicar depois do merge/deploy.
-- Efeitos colaterais: nenhum dado tocado, nenhum GRANT/REVOKE, nenhuma funcao criada
-- ou alterada, nenhuma tabela/tipo/coluna. Só o predicado USING de tres policies de
-- SELECT (nao ha WITH CHECK: sao policies de leitura).

ALTER POLICY "whatsapp media readable via visible message" ON storage.objects
USING (
  objects.bucket_id = ANY (ARRAY['whatsapp-media'::text, 'audio-messages'::text])
  AND EXISTS (
    SELECT 1
    FROM public.messages m
    JOIN public.contacts c ON c.id = m.contact_id
    WHERE m.media_url IS NOT NULL
      AND c.assigned_to IN (SELECT public.get_visible_agent_ids(auth.uid()))
      AND (
        -- (a) midia do proprio contato da mensagem (enviada, encaminhada, recebida de
        --     contato conhecido: a ingestao grava `<contact_id>/<tipo>/<id>.<ext>`)
        (storage.foldername(objects.name))[1] = m.contact_id::text
        -- (b) midia RECEBIDA sem pasta de contato: a ingestao nomeia o objeto a partir
        --     do id da mensagem (`<tipo>/<id>.<ext>`, `stickers/sticker_<id>.webp`),
        --     e `external_id` e imutavel para o cliente (trigger de proveniencia).
        --     O id sanitizado nao pode ser vazio (evita pasta vazia casar com id vazio).
        OR (
          regexp_replace(coalesce(m.external_id, ''), '[^A-Za-z0-9]', '', 'g') <> ''
          AND regexp_replace(
                regexp_replace(regexp_replace(objects.name, '^.*/', ''), '\.[^.]*$', ''),
                '^sticker_', '')
              = regexp_replace(m.external_id, '[^A-Za-z0-9]', '', 'g')
        )
      )
  )
);

ALTER POLICY "Users can read assigned whatsapp media" ON storage.objects
USING (
  bucket_id = 'whatsapp-media'
  AND (
    is_admin_or_supervisor(auth.uid())
    OR (storage.foldername(name))[1] IN (
      SELECT c.id::text FROM public.contacts c
      WHERE c.assigned_to IN (
        SELECT p.id FROM public.profiles p WHERE p.user_id = auth.uid()
      )
    )
    OR (storage.foldername(name))[1] = auth.uid()::text
  )
);

ALTER POLICY "Users can read assigned audio messages" ON storage.objects
USING (
  bucket_id = 'audio-messages'
  AND (
    is_admin_or_supervisor(auth.uid())
    OR (storage.foldername(name))[1] IN (
      SELECT c.id::text FROM public.contacts c
      WHERE c.assigned_to IN (
        SELECT p.id FROM public.profiles p WHERE p.user_id = auth.uid()
      )
    )
  )
);
