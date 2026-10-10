-- SEC-STORAGE-01 (achado P1 de docs/audits/SEGURANCA_DEFINER_GRANTS_STORAGE_2026-10-07.md) e destrave do acervo legado (cartao t_e35ed064): a posse da midia privada e o CAMINHO do objeto, e o acervo legado so e liberado por mensagem de ENTRADA de contato visivel.
-- Rollback: ALTER POLICY "whatsapp media readable via visible message" ON storage.objects USING (objects.bucket_id = ANY (ARRAY['whatsapp-media'::text, 'audio-messages'::text]) AND EXISTS (SELECT 1 FROM public.messages m JOIN public.contacts c ON c.id = m.contact_id WHERE m.media_url IS NOT NULL AND c.assigned_to IN (SELECT public.get_visible_agent_ids(auth.uid())) AND ( storage.foldername(objects.name))[1] = m.contact_id::text OR ( regexp_replace(coalesce(m.external_id, ''), '[^A-Za-z0-9]', '', 'g') <> '' AND regexp_replace( regexp_replace(regexp_replace(objects.name, '^.*/', ''), '\.[^.]*$', ''), '^sticker_', '') = regexp_replace(m.external_id, '[^A-Za-z0-9]', '', 'g') ) OR ( m.sender = 'contact' AND ( right(m.media_url, length('/' || objects.bucket_id || '/' || objects.name)) = '/' || objects.bucket_id || '/' || objects.name OR position('/' || objects.bucket_id || '/' || objects.name || '?' IN m.media_url) > 0 OR right(m.media_url, length('/' || objects.bucket_id || '/' || replace(objects.name, ' ', '%20'))) = '/' || objects.bucket_id || '/' || replace(objects.name, ' ', '%20') OR position('/' || objects.bucket_id || '/' || replace(objects.name, ' ', '%20') || '?' IN m.media_url) > 0 ) ) )); ALTER POLICY "Users can read assigned whatsapp media" ON storage.objects USING (bucket_id = 'whatsapp-media' AND ( is_admin_or_supervisor(auth.uid()) OR (storage.foldername(name))[1] IN (SELECT c.id::text FROM public.contacts c WHERE c.assigned_to IN (SELECT p.id FROM public.profiles p WHERE p.user_id = auth.uid())) OR EXISTS (SELECT 1 FROM public.messages m JOIN public.contacts c ON c.id = m.contact_id WHERE m.media_url LIKE '%/' || objects.name AND c.assigned_to IN (SELECT p.id FROM public.profiles p WHERE p.user_id = auth.uid())) OR (storage.foldername(name))[1] = auth.uid()::text )); ALTER POLICY "Users can read assigned audio messages" ON storage.objects USING (bucket_id = 'audio-messages' AND ( is_admin_or_supervisor(auth.uid()) OR (storage.foldername(name))[1] IN (SELECT c.id::text FROM public.contacts c WHERE c.assigned_to IN (SELECT p.id FROM public.profiles p WHERE p.user_id = auth.uid())) OR EXISTS (SELECT 1 FROM public.messages m JOIN public.contacts c ON c.id = m.contact_id WHERE m.media_url LIKE '%/' || objects.name AND c.assigned_to IN (SELECT p.id FROM public.profiles p WHERE p.user_id = auth.uid())) ));
--
-- PROBLEMA (medido na arvore de 09/10/2026). Tres policies de SELECT em storage.objects decidiam a
-- leitura de whatsapp-media/audio-messages pelo TEXTO de `messages.media_url`, campo que o chamador
-- escolhe: `enqueue_outbound_message` (SECURITY DEFINER, 20260930200000:193 GRANT a authenticated)
-- aceita qualquer `^https://` e grava a `media_url` do cliente na linha dele. Basta inserir mensagem
-- no PROPRIO contato apontando para `<contact_id_alheio>/<arquivo>` para o EXISTS fechar e a mídia
-- alheia ser lida. A policy "Users can read assigned whatsapp media" (e a gemea de audio-messages)
-- ainda casava o nome do objeto dentro de um padrao `LIKE '%/' || objects.name`, onde `%`/`_` do
-- nome viram curinga (achado SEC-DEFINER_GRANTS_STORAGE-02).
--
-- CORRECAO. Nenhuma das tres policies decide mais por TEXTO de `media_url` vindo do cliente. A
-- autorizacao vem do CAMINHO do objeto e da visibilidade do contato via
-- `is_contact_visible_to_user` (cobre: atribuido, visibilidade especial e membro ativo de fila):
--   1) "whatsapp media readable via visible message" passa a exigir que o objeto pertenca a uma
--      mensagem de um contato visivel para o chamador (`is_contact_visible_to_user`) e
--      que o objeto seja:
--        (a) da pasta do proprio contato da mensagem (`<contact_id>/...`), ou
--        (b) a midia RECEBIDA nomeada a partir do `external_id` da linha (`<tipo>/<id>.<ext>`,
--            `stickers/sticker_<id>.webp`) — campo que o cliente nao escreve; ou
--        (c) o casamento EXATO do locator (right()/position(), nunca LIKE) de uma mensagem de
--            ENTRADA (`m.sender = 'contact'`) — ramo que devolve ao agente o ACERVO LEGADO
--            (`image/<id>.jpg`) que tem linha de ingestao correspondente.
--   2) "Users can read assigned whatsapp media"/"...audio messages" perdem o ramo de `media_url`
--      (e o `LIKE`) e ficam com posse por caminho: admin/supervisor, pasta de contato atribuido ao
--      chamador, pasta do proprio auth.uid() (so em whatsapp-media, como antes).
--
-- POR QUE O RAMO (c) E SEGURO. `m.sender = 'contact'` so nasce da ingestao, e a ingestao e a unica
-- escrevente desse valor: `ingest_inbound_message` e SECURITY DEFINER e o manifesto commitado
-- (supabase/schema-manifest.json) registra EXECUTE so para `postgres` e `service_role` — nem
-- PUBLIC, nem `anon`, nem `authenticated`. Os outros escreventes de `messages` sao RPCs de envio
-- (enqueue_outbound_message e as primas de 20260909220000/20260909250000/20260930190000), todas
-- gravando `sender = 'agent'` e `external_id = NULL`; o INSERT/UPDATE direto de `authenticated`
-- nao consegue gravar `sender <> 'agent'`, `external_id` nem `media_url` (trigger
-- trg_guard_message_provenance_fields, migration 20261006114108), e o UPDATE da trigger tambem
-- recusa trocar `contact_id`/`sender`/`media_url` de linha existente. Ou seja: so a ingestao
-- (service_role) produz o par que o ramo (c) exige, e ela o produz com o locator do objeto que ela
-- propria acabou de gravar.
--
-- O QUE MUDA. Objeto em pasta que nao e de um contato visivel, SEM mensagem de entrada
-- correspondente (ex.: `kb/`, `custom-sounds/`, `image/<id>.jpg` orfao), deixa de ser legivel por
-- agente; segue legivel para admin/supervisor. MEDIDO em 09/10: em `whatsapp-media/kb/` o leitor e
-- a Edge Function `ai-kb-ingest` (service_role, ignora RLS) e em `audio-messages/custom-sounds/` o
-- arquivo enviado nunca e lido de volta pelo front (SoundCustomizationPanel declara que o som
-- enviado "ainda NAO e aplicado aos alertas"); nenhum desses dois prefixos tem leitor agente no
-- front (git grep em src/), entao nao recebem policy propria.
--
-- CLASSE: contrato (altera policy de leitura) — aplicar depois do merge/deploy.
-- Efeitos colaterais: nenhum dado tocado, nenhum GRANT/REVOKE/papel/ACL, nenhuma funcao criada ou
-- alterada, nenhuma tabela/tipo/coluna, nenhum bucket. So o predicado USING de tres policies de
-- SELECT (nao ha WITH CHECK: sao policies de leitura).

ALTER POLICY "whatsapp media readable via visible message" ON storage.objects
USING (
  objects.bucket_id = ANY (ARRAY['whatsapp-media'::text, 'audio-messages'::text])
  AND EXISTS (
    SELECT 1
    FROM public.messages m
    WHERE m.media_url IS NOT NULL
      AND public.is_contact_visible_to_user(m.contact_id, auth.uid())
      AND (
        -- (a) midia do proprio contato da mensagem (enviada, encaminhada, recebida de contato
        --     conhecido: a ingestao grava `<contact_id>/<tipo>/<id>.<ext>`)
        (storage.foldername(objects.name))[1] = m.contact_id::text
        -- (b) midia RECEBIDA sem pasta de contato, nomeada a partir do `external_id` da linha —
        --     campo imutavel para o cliente (trigger de proveniencia). O id sanitizado nao pode
        --     ser vazio, para pasta vazia nao casar com id vazio.
        OR (
          regexp_replace(coalesce(m.external_id, ''), '[^A-Za-z0-9]', '', 'g') <> ''
          AND regexp_replace(
                regexp_replace(regexp_replace(objects.name, '^.*/', ''), '\.[^.]*$', ''),
                '^sticker_', '')
              = regexp_replace(m.external_id, '[^A-Za-z0-9]', '', 'g')
        )
        -- (c) ACERVO LEGADO: locator EXATO (right()/position(), nenhum LIKE) de mensagem de
        --     ENTRADA (`m.sender = 'contact'`) de contato visivel. Linha de entrada so nasce da
        --     ingestao (service_role); ver o cabecalho.
        OR (
          m.sender = 'contact'
          AND (
            -- caminho exato no fim do locator (caso normal: .../object/public/<bucket>/<path>)
            right(m.media_url, length('/' || objects.bucket_id || '/' || objects.name))
              = '/' || objects.bucket_id || '/' || objects.name
            -- mesmo caminho seguido de query string (ex.: ?download=1)
            OR position('/' || objects.bucket_id || '/' || objects.name || '?' IN m.media_url) > 0
            -- nome com espaco, como o locator o codifica
            OR right(m.media_url, length('/' || objects.bucket_id || '/' || replace(objects.name, ' ', '%20')))
              = '/' || objects.bucket_id || '/' || replace(objects.name, ' ', '%20')
            OR position('/' || objects.bucket_id || '/' || replace(objects.name, ' ', '%20') || '?' IN m.media_url) > 0
          )
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
