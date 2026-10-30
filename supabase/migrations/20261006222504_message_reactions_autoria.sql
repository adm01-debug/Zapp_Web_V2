-- message_reactions: autoria obrigatoria nas escritas (R2-DB-019 / item 302 do BACKLOG_VERIFICADO)
-- Rollback: recria as policies permissivas anteriores (SQL comentado logo abaixo) e remove as
--   tres policies de escrita com autoria criadas aqui. O estado anterior e exatamente:
--   -- 20260413133214 (insert/update/delete por visibilidade da mensagem, sem autoria)
--   DROP POLICY IF EXISTS "message_reactions_insert_policy" ON public.message_reactions;
--   CREATE POLICY "message_reactions_insert_policy" ON public.message_reactions
--     FOR INSERT TO authenticated WITH CHECK (EXISTS (
--       SELECT 1 FROM public.messages m JOIN public.contacts c ON c.id = m.contact_id
--       WHERE m.id = message_id AND (public.is_admin_or_supervisor(auth.uid())
--         OR c.assigned_to = public.get_profile_id_for_user(auth.uid()) OR c.assigned_to IS NULL)));
--   DROP POLICY IF EXISTS "message_reactions_update_policy" ON public.message_reactions;
--   CREATE POLICY "message_reactions_update_policy" ON public.message_reactions
--     FOR UPDATE TO authenticated USING (EXISTS (
--       SELECT 1 FROM public.messages m JOIN public.contacts c ON c.id = m.contact_id
--       WHERE m.id = message_id AND (public.is_admin_or_supervisor(auth.uid())
--         OR c.assigned_to = public.get_profile_id_for_user(auth.uid()) OR c.assigned_to IS NULL)));
--   DROP POLICY IF EXISTS "Users can delete their own reactions" ON public.message_reactions;
--   CREATE POLICY "Users can delete their own reactions" ON public.message_reactions
--     FOR DELETE TO authenticated USING (user_id IN (SELECT id FROM public.profiles WHERE profiles.user_id = auth.uid()));
--   DROP POLICY IF EXISTS "message_reactions_delete_policy" ON public.message_reactions;
--   CREATE POLICY "message_reactions_delete_policy" ON public.message_reactions
--     FOR DELETE TO authenticated USING (EXISTS (
--       SELECT 1 FROM public.messages m JOIN public.contacts c ON c.id = m.contact_id
--       WHERE m.id = message_id AND (public.is_admin_or_supervisor(auth.uid())
--         OR c.assigned_to = public.get_profile_id_for_user(auth.uid()) OR c.assigned_to IS NULL)));
--   -- 20260401003034 (INSERT por contato atribuido, sem amarrar ao message_id)
--   DROP POLICY IF EXISTS "Users can insert reactions for assigned contacts" ON public.message_reactions;
--   CREATE POLICY "Users can insert reactions for assigned contacts" ON public.message_reactions
--     FOR INSERT TO authenticated WITH CHECK (contact_id IN (
--       SELECT c.id FROM public.contacts c WHERE c.assigned_to IN (
--         SELECT p.id FROM public.profiles p WHERE p.user_id = auth.uid())) OR public.is_admin_or_supervisor(auth.uid()));

-- DEFEITO (R2-DB-019). As policies de escrita de public.message_reactions autorizavam pela
-- conversa/contato e nao exigiam o user_id do chamador. Um cliente autenticado, direto na API de
-- dados com o proprio JWT, conseguia: (a) gravar {user_id: <profile de um colega>} e personificar
-- o colega; (b) gravar {user_id: NULL, contact_id: <contato da mensagem>} e falsificar uma reacao
-- do CLIENTE (o front rotula user_id nulo como "Cliente"); (c) autorizar por um contato atribuido
-- a ele e gravar em mensagem de outro contato (policy 20260401003034 nao amarrava contact_id a
-- message_id); (d) alterar/apagar reacao de outro autor em qualquer mensagem visivel, porque as
-- policies permissivas se somam por OR (message_reactions_delete_policy/update_policy por
-- visibilidade de mensagem). O hook legitimo (src/hooks/reactions/useReactionMutations.ts) sempre
-- manda o proprio profile e o contact_id da MENSAGEM — e escolha do cliente, nao defesa do endpoint.
--
-- CORRECAO. Autoria de usuario imposta no banco: toda escrita de `authenticated` exige
-- user_id = public.get_profile_id_for_user(auth.uid()) (predicado canonico e caller-bound, o mesmo
-- das policies de inbox desde 20260909200000). contact_id deixa de ser um caminho alternativo de
-- autorizacao: passa a ter de ser EXATAMENTE o contato da mensagem (nao aceita autorizar por um
-- contato e gravar em outro) e so a origem confiavel do provedor (Evolution/webhook, que usa a
-- service role e portanto BYPASSRLS) pode gravar reacao de CLIENTE com user_id nulo. UPDATE e
-- DELETE ficam restritos a propria autoria. Nenhuma policy existente e afrouxada; a leitura
-- (SELECT) fica como estava.

-- 1. Fora os caminhos de autorizacao que nao olham o autor.
DROP POLICY IF EXISTS "Users can insert reactions for assigned contacts" ON public.message_reactions;
DROP POLICY IF EXISTS "message_reactions_insert_policy" ON public.message_reactions;
DROP POLICY IF EXISTS "message_reactions_update_policy" ON public.message_reactions;
DROP POLICY IF EXISTS "message_reactions_delete_policy" ON public.message_reactions;
DROP POLICY IF EXISTS "Users can delete their own reactions" ON public.message_reactions;

-- 2. INSERT: so a propria autoria, e o contato da reacao tem de ser o da mensagem.
--    contact_id NULO tambem vale: user_id identifica o AUTOR agente e o contato da reacao de
--    agente pode ser nulo (modelo de autoria do item 303: o gatilho message_reactions_normalize_author
--    zera contact_id quando user_id esta preenchido, ANTES do WITH CHECK). A autorizacao nunca
--    vem do contact_id da reacao: vem do contato da MENSAGEM (join abaixo), entao nulo nao abre
--    caminho para outro contato; so um contact_id preenchido e diferente do da mensagem e barrado.
CREATE POLICY "message_reactions_insert_policy" ON public.message_reactions
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = public.get_profile_id_for_user(auth.uid())
    AND EXISTS (
      SELECT 1
        FROM public.messages m
        JOIN public.contacts c ON c.id = m.contact_id
       WHERE m.id = message_reactions.message_id
         AND (message_reactions.contact_id IS NULL OR m.contact_id = message_reactions.contact_id)
         AND (
           public.is_admin_or_supervisor(auth.uid())
           OR c.assigned_to = public.get_profile_id_for_user(auth.uid())
           OR c.assigned_to IS NULL
         )
    )
  );

-- 3. UPDATE: USING restringe a reacao propria (inclusive no ON CONFLICT DO UPDATE do upsert do
--    hook); WITH CHECK impede mover a reacao para outra mensagem/contato ou trocar o autor.
CREATE POLICY "message_reactions_update_policy" ON public.message_reactions
  FOR UPDATE TO authenticated
  USING (
    user_id = public.get_profile_id_for_user(auth.uid())
  )
  WITH CHECK (
    user_id = public.get_profile_id_for_user(auth.uid())
    AND EXISTS (
      SELECT 1
        FROM public.messages m
        JOIN public.contacts c ON c.id = m.contact_id
       WHERE m.id = message_reactions.message_id
         AND (message_reactions.contact_id IS NULL OR m.contact_id = message_reactions.contact_id)
         AND (
           public.is_admin_or_supervisor(auth.uid())
           OR c.assigned_to = public.get_profile_id_for_user(auth.uid())
           OR c.assigned_to IS NULL
         )
    )
  );

-- 4. DELETE: so a reacao propria (a policy antiga por visibilidade de mensagem saiu no passo 1).
CREATE POLICY "message_reactions_delete_policy" ON public.message_reactions
  FOR DELETE TO authenticated
  USING (
    user_id = public.get_profile_id_for_user(auth.uid())
  );

-- 5. A ingestao do provedor segue intacta: o webhook usa SUPABASE_SERVICE_ROLE_KEY
--    (supabase/functions/evolution-webhook/index.ts:65-68), que tem BYPASSRLS — nenhuma policy
--    TO authenticated afeta a gravacao de reacao do CONTATO (user_id nulo).
