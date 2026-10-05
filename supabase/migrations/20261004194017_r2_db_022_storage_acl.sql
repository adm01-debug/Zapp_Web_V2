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
-- R2-DB-022 B (P1) — fecha a ACL de LEITURA dos buckets privados de mídia do WhatsApp.
--
-- DEPENDÊNCIA DE ORDEM (obrigatória — cartão irmão t_d1a95e20, R2-DB-022 fronteira de
-- ESCRITA). A policy (1) só pode confiar em `sender='contact' + external_id` como
-- proveniência da ingestão privilegiada PORQUE a migration
-- 20261004194016_r2_db_022_write_boundary.sql já instalou o trigger
-- trg_guard_message_provenance_fields em public.messages: para current_user fora de
-- postgres/service_role ele bloqueia INSERT com sender <> 'agent' ou
-- external_id/media_url preenchidos e UPDATE de media_url/contact_id/sender/
-- agent_id/external_id (ERRCODE 42501). Sem esse trigger, um authenticated poderia
-- forjar o vínculo e a policy (1) voltaria a ser burlável. O timestamp desta
-- migration é deliberadamente POSTERIOR ao da irmã para que a ordem de aplicação
-- por versão aplique a fronteira de escrita primeiro. Não aplicar sozinha.
--
-- PROBLEMA. As três policies de SELECT de storage.objects autorizavam leitura por
-- referência REASSOCIÁVEL em public.messages.media_url:
--   * "whatsapp media readable via visible message" (20261003142707) confiava em
--     media_url (right/position, incl. variantes com '?' e '%20');
--   * "Users can read assigned whatsapp media" e "Users can read assigned audio messages"
--     (20260930700000) tinham fallback `m.media_url LIKE '%/' || name` (sufixo ambíguo)
--     e, no caso do whatsapp-media, um ramo `foldername(name))[1] = auth.uid()` que
--     autorizava por um segmento de path forjável no upload.
-- Como policies SELECT combinam por OR, um agente autenticado A que conhece o path de um
-- objeto privado de B fabrica uma mensagem visível (para um contato que A enxerga) com
-- media_url apontando para o objeto de B e passa a ler o objeto de B.
--
-- EVIDÊNCIA DE CAMINHO DE UPLOAD (grep do frontend e das edge functions, 05/10/2026).
-- Toda mídia de chat enviada por agente já grava no locator canônico <contact_id>/...:
--   src/components/inbox/useFileUploadLogic.ts:95   whatsapp-media/<contactId>/<id>-<nome>
--   src/components/inbox/ChatPanel.tsx:~215         whatsapp-media/<contact.id>/<id>-<nome> (anexo agendado)
--   src/services/chat.service.ts:112                audio-messages/<contactId>/<ts>.webm
--   src/hooks/inbox/useRealtimeInbox.ts:174         (chama ChatService.uploadAudio com o contactId)
--   src/hooks/communication/useAudioRecorder.ts:109 audio-messages/<conversationId>/<ts>.webm
--     (helper sem chamador fora de testes — o envio real de áudio vai por chat.service)
-- Ingestão privilegiada (service_role) grava mídia recebida em <contact_id>/<type>/<id>
-- (supabase/functions/_shared/evolution-media.ts:79-82) ou, no legado sem contato, em
-- <messageType>/<id> — coberta pela policy (1) somente via origem recebida confiável.
-- EXCEÇÃO conhecida, fora do escopo desta migration (frontend — achado registrado):
--   src/pages/ChatPopup.tsx:148 grava whatsapp-media/audio_<contactId>_<ts>.webm SEM a
--   pasta do contato; sob a policy nova o agente perde a leitura do próprio áudio
--   gravado pelo popup. Corrigir o caminho do upload é tarefa de frontend, não desta
--   migration. Caminhos feature-specific (não são mídia de chat de agente):
--   audio-messages/custom-sounds/ (SoundCustomizationPanel — upload sem leitura por
--   agente), whatsapp-media/kb/ (useKnowledgeBase — consumido via service role) e
--   whatsapp-media/stickers/ (biblioteca de figurinhas, escrita só pela ingestão) —
--   ficam restritos a admin/supervisor; tratamento dedicado é decisão de produto.
--
-- DECISÃO (2026-10-04, decomposição R2-DB-022, cartão t_e1faafc7):
--   * Locator de agente é autorizado pela propriedade CANÔNICA do objeto: bucket permitido
--     + primeiro segmento do object path igual a um contact_id que o usuário realmente
--     enxerga (public.is_contact_visible_to_user). Sem media_url, sem referência.
--   * Mídia RECEBIDA legada (sem prefixo de contato: image/video/document/sticker/audio/...)
--     continua suportada apenas por associação de origem recebida confiável (sender='contact'
--     + external_id não nulo, criados pela ingestão privilegiada — ver DEPENDÊNCIA acima)
--     e comparação EXATA de bucket/path (sufixo integral
--     '/storage/v1/object/public/<bucket>/<name>'). Nunca LIKE, substring, sufixo
--     ambíguo, variante '?'/'%20' ou media_url de agente.
--   * Fail-closed para URL malformada, query/encoding ambíguo, '%', '_', path de outro
--     contato e bucket divergente.
--   * Admin/supervisor mantém exatamente o acesso já previsto (is_admin_or_supervisor),
--     sem ampliar listagem nem escrita.
--   * Nenhuma policy nova depende de UI e nenhuma é SECURITY DEFINER (as funções de
--     visibilidade usadas já existem e não ignoram a RLS de objeto/mensagem).
--
-- Escopo: só as três policies de SELECT dos buckets whatsapp-media e audio-messages.

DROP POLICY IF EXISTS "whatsapp media readable via visible message" ON storage.objects;
DROP POLICY IF EXISTS "Users can read assigned whatsapp media" ON storage.objects;
DROP POLICY IF EXISTS "Users can read assigned audio messages" ON storage.objects;

-- (1) Mídia RECEBIDA legada (sem prefixo de contato) — associação de origem confiável + EXATIDÃO.
CREATE POLICY "whatsapp media readable via visible message"
ON storage.objects FOR SELECT TO authenticated
USING (
  (
    (objects.bucket_id = 'whatsapp-media'
      AND (storage.foldername(objects.name))[1] IN ('image', 'video', 'document', 'sticker'))
    OR (objects.bucket_id = 'audio-messages'
      AND (storage.foldername(objects.name))[1] = 'audio')
  )
  AND EXISTS (
    SELECT 1
    FROM public.messages m
    WHERE m.sender = 'contact'
      AND m.external_id IS NOT NULL
      AND m.media_url IS NOT NULL
      AND m.contact_id IS NOT NULL
      AND public.is_contact_visible_to_user(m.contact_id, auth.uid())
      AND right(m.media_url,
                char_length('/storage/v1/object/public/' || objects.bucket_id || '/' || objects.name))
          = '/storage/v1/object/public/' || objects.bucket_id || '/' || objects.name
  )
);

-- (2) Locator canônico de agente (whatsapp-media): primeiro segmento = contact_id visível.
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

-- (3) Locator canônico de agente (audio-messages): primeiro segmento = contact_id visível.
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
