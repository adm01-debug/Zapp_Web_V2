-- r2_db_022_storage_acl
-- Rollback: recriar as policies antigas a partir das migrations 20260930700000
--   ("Users can read assigned whatsapp media" / "Users can read assigned audio messages")
--   e 20261003142707 ("whatsapp media readable via visible message"), com os predicados
--   originais baseados em messages.media_url (LIKE/substring/right/position).
--
-- R2-DB-022 B (P1) — fecha a ACL de LEITURA dos buckets privados de mídia do WhatsApp.
--
-- PROBLEMA. As três policies de SELECT de storage.objects autorizavam leitura por
-- referência REASSOCIÁVEL em public.messages.media_url:
--   * "whatsapp media readable via visible message" (20261003142707) confiava em
--     media_url (right/position, incl. variantes com '?' e '%20');
--   * "Users can read assigned whatsapp media" e "Users can read assigned audio messages"
--     (20260930700000) tinham fallback `m.media_url LIKE '%/' || name` (sufixo ambíguo).
-- Como policies SELECT combinam por OR, um agente autenticado A que conhece o path de um
-- objeto privado de B fabrica uma mensagem visível (para um contato que A enxerga) com
-- media_url apontando para o objeto de B e passa a ler o objeto de B.
--
-- DECISÃO (2026-10-04, decomposição R2-DB-022, cartão t_e1faafc7):
--   * Locator de agente é autorizado pela propriedade CANÔNICA do objeto: bucket permitido
--     + primeiro segmento do object path igual a um contact_id que o usuário realmente
--     enxerga (public.is_contact_visible_to_user). Sem media_url, sem referência.
--   * Mídia RECEBIDA legada (sem prefixo de contato: image/video/document/sticker/audio/...)
--     continua suportada apenas por associação de origem recebida confiável (sender='contact'
--     + external_id não nulo, criados pela ingestão privilegiada) e comparação EXATA de
--     bucket/path (sufixo integral '/storage/v1/object/public/<bucket>/<name>'). Nunca
--     LIKE, substring, sufixo ambíguo, variante '?'/'%20' ou media_url de agente.
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
