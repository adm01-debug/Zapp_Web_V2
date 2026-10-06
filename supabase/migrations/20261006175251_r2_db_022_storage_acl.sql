-- r2_db_022_storage_acl
-- Rollback: executar este bloco (recria as três policies originais, de
--   20260930700000_fix_whatsapp_storage_policies e
--   20261003142707_whatsapp_media_recebida_select_via_messages):
--
--   DROP POLICY IF EXISTS "whatsapp media readable via visible message" ON storage.objects;
--   DROP POLICY IF EXISTS "Users can read assigned whatsapp media" ON storage.objects;
--   DROP POLICY IF EXISTS "Users can read assigned audio messages" ON storage.objects;
--
--   CREATE POLICY "Users can read assigned whatsapp media"
--     ON storage.objects FOR SELECT TO authenticated USING (
--       bucket_id = 'whatsapp-media'
--       AND (
--         is_admin_or_supervisor(auth.uid())
--         OR (storage.foldername(name))[1] IN (
--           SELECT c.id::text FROM public.contacts c
--           WHERE c.assigned_to IN (
--             SELECT p.id FROM public.profiles p WHERE p.user_id = auth.uid()
--           )
--         )
--         OR EXISTS (
--           SELECT 1 FROM public.messages m
--           JOIN public.contacts c ON c.id = m.contact_id
--           WHERE m.media_url LIKE '%/' || objects.name
--             AND c.assigned_to IN (
--               SELECT p.id FROM public.profiles p WHERE p.user_id = auth.uid()
--             )
--         )
--         OR (storage.foldername(name))[1] = auth.uid()::text
--       )
--     );
--
--   CREATE POLICY "Users can read assigned audio messages"
--     ON storage.objects FOR SELECT TO authenticated USING (
--       bucket_id = 'audio-messages'
--       AND (
--         is_admin_or_supervisor(auth.uid())
--         OR (storage.foldername(name))[1] IN (
--           SELECT c.id::text FROM public.contacts c
--           WHERE c.assigned_to IN (
--             SELECT p.id FROM public.profiles p WHERE p.user_id = auth.uid()
--           )
--         )
--         OR EXISTS (
--           SELECT 1 FROM public.messages m
--           JOIN public.contacts c ON c.id = m.contact_id
--           WHERE m.media_url LIKE '%/' || objects.name
--             AND c.assigned_to IN (
--               SELECT p.id FROM public.profiles p WHERE p.user_id = auth.uid()
--             )
--         )
--       )
--     );
--
--   CREATE POLICY "whatsapp media readable via visible message"
--   ON storage.objects FOR SELECT TO authenticated
--   USING (
--     objects.bucket_id = ANY (ARRAY['whatsapp-media'::text, 'audio-messages'::text])
--     AND EXISTS (
--       SELECT 1
--       FROM public.messages m
--       WHERE m.media_url IS NOT NULL
--         AND (
--           right(m.media_url, length('/' || objects.bucket_id || '/' || objects.name))
--             = '/' || objects.bucket_id || '/' || objects.name
--           OR position('/' || objects.bucket_id || '/' || objects.name || '?' IN m.media_url) > 0
--           OR right(m.media_url, length('/' || objects.bucket_id || '/' || replace(objects.name, ' ', '%20')))
--             = '/' || objects.bucket_id || '/' || replace(objects.name, ' ', '%20')
--           OR position('/' || objects.bucket_id || '/' || replace(objects.name, ' ', '%20') || '?' IN m.media_url) > 0
--         )
--     )
--   );
--
-- R2-DB-022 B1 — fecha a ACL de LEITURA dos buckets privados de mídia do WhatsApp.
-- Variante standalone do cartão t_5a58bbda: a migration irmã de fronteira de escrita
-- (trg_guard_message_provenance_fields em public.messages) NÃO existe nesta base, então
-- esta entrega não pode confiar em NENHUM sinal gravado em public.messages.
--
-- PROBLEMA. As policies de SELECT de storage.objects autorizavam leitura por referência
-- REASSOCIÁVEL em public.messages.media_url, e policies permissivas se combinam por OR:
--   * "whatsapp media readable via visible message" (20261003142707) confiava em
--     media_url (right/position, incl. variantes com '?' e '%20'), bastando existir
--     QUALQUER mensagem visível ao chamador apontando para o objeto;
--   * "Users can read assigned whatsapp media" e "Users can read assigned audio messages"
--     (20260930700000) tinham fallback `m.media_url LIKE '%/' || name` (sufixo ambíguo)
--     e, no caso do whatsapp-media, um ramo `foldername(name)[1] = auth.uid()` que
--     autorizava por um segmento de path forjável no upload.
-- Um agente autenticado A que conhece o path de um objeto privado de B insere uma
-- mensagem visível para um contato que A enxerga com media_url apontando para o objeto
-- de B e passa a lê-lo.
--
-- POR QUE NENHUM FALLBACK POR media_url FOI MANTIDO (fail-closed, decisão do cartão).
-- Na base de hoje authenticated consegue gravar o vínculo inteiro: a policy de INSERT
-- de public.messages (20260925120000) não restringe sender/external_id/media_url e o
-- trigger existente (guard_message_delivery_internal_fields, 20260909220000) só cobre
-- campos delivery_*. Não existe coluna em messages que distinga uma linha escrita pela
-- ingestão privilegiada de uma forjada por authenticated — logo "origem recebida
-- confiável" é impossível de provar dentro da policy e TODO ramo que autorize por
-- media_url é forjável. Prova em banco local (pré-migration): INSERT forjado por
-- authenticated A com sender='contact'+external_id+media_url → aceito; SELECT no objeto
-- privado de B → concedido nos dois buckets.
--
-- CONSEQUÊNCIA ASSUMIDA (fail-closed). Mídia recebida LEGADA sem prefixo de contato
-- (whatsapp-media/<messageType>/<id>, audio-messages/audio/<id>) deixa de ser legível
-- por agente — só admin/supervisor a lê — até existir fronteira de escrita que torne a
-- proveniência da mensagem confiável; aí um cartão futuro pode reintroduzir fallback
-- com comparação EXATA. O caminho legítimo ATUAL de mídia recebida
-- (supabase/functions/_shared/evolution-media.ts grava <contact_id>/<messageType>/<id>)
-- e o encaminhamento/cópia que gravam no path do contato continuam legíveis pelo
-- locator canônico abaixo.
--
-- DECISÃO.
--   * Locator de agente só é autorizado pela propriedade CANÔNICA do objeto: bucket
--     permitido + primeiro segmento do object path igual a um contact_id cuja
--     visibilidade o usuário possui (public.is_contact_visible_to_user — agente
--     responsável, fila ativa ou admin/supervisor; caller-bound, exige _user_id =
--     auth.uid()). Sem media_url, sem referência em messages.
--   * Nunca LIKE de sufixo, substring, position, replace, curingas %/_, media_url
--     reassociável, URL malformada, query/encoding ambíguo ou bucket divergente.
--   * Admin/supervisor mantém exatamente o acesso já previsto (is_admin_or_supervisor
--     cobre o bucket inteiro, inclusive paths legados), sem ampliar listagem nem escrita.
--   * Nenhuma policy nova depende de UI e nenhuma é SECURITY DEFINER (as funções de
--     visibilidade usadas já existem e não ignoram a RLS de objeto/mensagem).
--
-- EXCEÇÕES conhecidas, fora do escopo desta migration (achados registrados no cartão):
--   * src/pages/ChatPopup.tsx grava whatsapp-media/audio_<contactId>_<ts>.webm SEM a
--     pasta do contato; sob a policy nova o agente perde a leitura do próprio áudio
--     gravado pelo popup. Corrigir o caminho do upload é tarefa de frontend.
--   * Caminhos feature-specific (whatsapp-media/kb/, whatsapp-media/stickers/,
--     audio-messages/custom-sounds/) ficam restritos a admin/supervisor; tratamento
--     dedicado é decisão de produto.
--
-- Escopo: só as três policies de SELECT dos buckets whatsapp-media e audio-messages.

DROP POLICY IF EXISTS "whatsapp media readable via visible message" ON storage.objects;
DROP POLICY IF EXISTS "Users can read assigned whatsapp media" ON storage.objects;
DROP POLICY IF EXISTS "Users can read assigned audio messages" ON storage.objects;

-- (1) Locator canônico de agente (whatsapp-media): primeiro segmento = contact_id visível.
CREATE POLICY "Users can read assigned whatsapp media"
ON storage.objects FOR SELECT TO authenticated
USING (
  objects.bucket_id = 'whatsapp-media'
  AND (
    public.is_admin_or_supervisor(auth.uid())
    OR EXISTS (
      SELECT 1
      FROM public.contacts c
      WHERE c.id::text = (storage.foldername(objects.name))[1]
        AND public.is_contact_visible_to_user(c.id, auth.uid())
    )
  )
);

-- (2) Locator canônico de agente (audio-messages): primeiro segmento = contact_id visível.
CREATE POLICY "Users can read assigned audio messages"
ON storage.objects FOR SELECT TO authenticated
USING (
  objects.bucket_id = 'audio-messages'
  AND (
    public.is_admin_or_supervisor(auth.uid())
    OR EXISTS (
      SELECT 1
      FROM public.contacts c
      WHERE c.id::text = (storage.foldername(objects.name))[1]
        AND public.is_contact_visible_to_user(c.id, auth.uid())
    )
  )
);
