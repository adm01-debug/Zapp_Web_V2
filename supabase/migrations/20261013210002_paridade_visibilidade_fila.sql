-- paridade_visibilidade_fila
-- Rollback: dropa as policies de paridade e recria, exatamente como estavam, a SELECT de conversation_sla, a SELECT de followup_executions, a INSERT de conversation_events e as INSERT de storage em whatsapp-media/audio-messages.
-- Rollback (SQL executável, na ordem):
--   DROP POLICY IF EXISTS "conversation_sla_select_policy" ON public.conversation_sla;
--   CREATE POLICY "conversation_sla_select_policy" ON public.conversation_sla FOR SELECT TO authenticated USING (is_admin_or_supervisor(auth.uid()) OR contact_id IN (SELECT c.id FROM public.contacts c WHERE c.assigned_to IN (SELECT get_visible_agent_ids(auth.uid()))));
--   DROP POLICY IF EXISTS "Authenticated can view followup executions" ON public.followup_executions;
--   CREATE POLICY "Authenticated can view followup executions" ON public.followup_executions FOR SELECT TO authenticated USING (contact_id IN (SELECT c.id FROM public.contacts c WHERE c.assigned_to IN (SELECT p.id FROM public.profiles p WHERE p.user_id = auth.uid())) OR is_admin_or_supervisor(auth.uid()));
--   DROP POLICY IF EXISTS "Authorized users can insert events" ON public.conversation_events;
--   CREATE POLICY "Authorized users can insert events" ON public.conversation_events FOR INSERT TO authenticated WITH CHECK ((performed_by IS NULL OR performed_by = (SELECT p.id FROM profiles p WHERE p.user_id = auth.uid() LIMIT 1)) AND (is_admin_or_supervisor(auth.uid()) OR contact_id IN (SELECT c.id FROM contacts c WHERE c.assigned_to = (SELECT p.id FROM profiles p WHERE p.user_id = auth.uid() LIMIT 1))));
--   DROP POLICY IF EXISTS "Users can upload assigned whatsapp media" ON storage.objects;
--   CREATE POLICY "Users can upload assigned whatsapp media" ON storage.objects FOR INSERT TO authenticated WITH CHECK (((bucket_id = 'whatsapp-media'::text) AND (is_admin_or_supervisor(auth.uid()) OR ((storage.foldername(name))[1] IN (SELECT (c.id)::text AS id FROM contacts c WHERE (c.assigned_to IN (SELECT p.id FROM profiles p WHERE (p.user_id = auth.uid()))))) OR ((storage.foldername(name))[1] = (auth.uid())::text))));
--   DROP POLICY IF EXISTS "Users can upload assigned audio messages" ON storage.objects;
--   CREATE POLICY "Users can upload assigned audio messages" ON storage.objects FOR INSERT TO authenticated WITH CHECK (((bucket_id = 'audio-messages'::text) AND (is_admin_or_supervisor(auth.uid()) OR ((storage.foldername(name))[1] IN (SELECT (c.id)::text AS id FROM contacts c WHERE (c.assigned_to IN (SELECT p.id FROM profiles p WHERE (p.user_id = auth.uid()))))) OR ((storage.foldername(name))[1] = (auth.uid())::text))));
--
-- Paridade de visibilidade da fila (V3 -> V2). O agente que ATENDE a conversa a enxerga
-- (SELECT de `messages`/`conversations` usa `is_contact_visible_to_user`, que inclui o membro
-- ATIVO da fila do contato — 20260909200000, linhas 75-81), mas três leituras/escritas do
-- mesmo contato ficavam presas à carteira (só `assigned_to`):
-- - conversation_sla SELECT  (20260830110000, narrow: admin OR contact_id IN get_visible_agent_ids)
-- - followup_executions SELECT (20260318121108, narrow: idem)
-- - conversation_events INSERT (20260412170036, "Authorized users can insert events": performed_by = próprio
--  perfil E contato na carteira — sem caminho de fila)
-- - storage INSERT em whatsapp-media/audio-messages (20260511233306: só aceita pasta de contato
--  ATRIBUÍDO ou a própria; o app sobe em `${contactId}/...` — useFileUploadLogic.ts:142,
--  ChatPanel.tsx:348 —, então o anexo do agente de fila sem atribuição era RECUSADO).
--
-- Correção: alinhar as quatro ao predicado único `is_contact_visible_to_user(contact_id, auth.uid())`.
-- `contact_custom_fields` fica de fora: é o cartão PB-26 (não duplicar). A SELECT de
-- conversation_events já está alinhada (20260925150000 renomeou a policy de `is_contact_visible_to_user`
-- para conversation_events_select_policy) — não é tocada aqui.
--
-- Sem mudança de GRANT/ACL de tabela; só o EXECUTE do helper é reafirmado (idempotente). Nenhuma
-- migration anterior é editada. Aditiva.

SET search_path = public, pg_catalog;

-- ------------------------------------------------------------------ conversation_sla (SELECT)
DROP POLICY IF EXISTS "conversation_sla_select_policy" ON public.conversation_sla;
CREATE POLICY "conversation_sla_select_policy" ON public.conversation_sla
  FOR SELECT TO authenticated
  USING (
    public.is_admin_or_supervisor(auth.uid())
    OR public.is_contact_visible_to_user(contact_id, auth.uid())
  );

-- ------------------------------------------------------------------ followup_executions (SELECT)
DROP POLICY IF EXISTS "Authenticated can view followup executions" ON public.followup_executions;
CREATE POLICY "Authenticated can view followup executions" ON public.followup_executions
  FOR SELECT TO authenticated
  USING (
    public.is_admin_or_supervisor(auth.uid())
    OR public.is_contact_visible_to_user(contact_id, auth.uid())
  );

-- ------------------------------------------------------------------ conversation_events (INSERT)
-- Policy vigente: "Authorized users can insert events" (20260412170036) — performed_by = próprio perfil
-- E contato na carteira (sem fila). Agora troca o ramo de contato pelo predicado único, mantendo a
-- autoria (performed_by): membro da fila insere evento do contato que enxerga; agente sem relação é negado.
DROP POLICY IF EXISTS "Authorized users can insert events" ON public.conversation_events;
CREATE POLICY "Authorized users can insert events" ON public.conversation_events
  FOR INSERT TO authenticated
  WITH CHECK (
    (
      performed_by IS NULL
      OR performed_by = (SELECT p.id FROM public.profiles p WHERE p.user_id = auth.uid() LIMIT 1)
    )
    AND public.is_contact_visible_to_user(contact_id, auth.uid())
  );

-- ------------------------------------------------------------------ storage INSERT (whatsapp-media)
-- Aceita a pasta de um contato visível (carteira OU fila), a própria pasta e admin/supervisor.
-- Comparação em texto (c.id::text = pasta) para não estourar cast em caminhos legados
-- (`image/<msgId>.ext`), que simplesmente não casam.
DROP POLICY IF EXISTS "Users can upload assigned whatsapp media" ON storage.objects;
CREATE POLICY "Users can upload assigned whatsapp media" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'whatsapp-media'::text
    AND (
      public.is_admin_or_supervisor(auth.uid())
      OR (storage.foldername(objects.name))[1] = (auth.uid())::text
      OR EXISTS (
        SELECT 1 FROM public.contacts c
        WHERE c.id::text = (storage.foldername(objects.name))[1]
          AND public.is_contact_visible_to_user(c.id, auth.uid())
      )
    )
  );

-- ------------------------------------------------------------------ storage INSERT (audio-messages)
DROP POLICY IF EXISTS "Users can upload assigned audio messages" ON storage.objects;
CREATE POLICY "Users can upload assigned audio messages" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'audio-messages'::text
    AND (
      public.is_admin_or_supervisor(auth.uid())
      OR (storage.foldername(objects.name))[1] = (auth.uid())::text
      OR EXISTS (
        SELECT 1 FROM public.contacts c
        WHERE c.id::text = (storage.foldername(objects.name))[1]
          AND public.is_contact_visible_to_user(c.id, auth.uid())
      )
    )
  );

-- ------------------------------------------------------------------ grants explícitos
REVOKE ALL ON FUNCTION public.is_contact_visible_to_user(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_contact_visible_to_user(uuid, uuid) TO authenticated, service_role;
