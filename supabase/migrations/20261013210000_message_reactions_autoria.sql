-- message_reactions_autoria
-- Rollback: recria as policies de INSERT/UPDATE/DELETE por mensagem/contato (estado anterior) e as
-- Rollback: redundantes dropadas; nenhum dado é tocado (só policies).
-- Rollback (SQL executável, na ordem):
--   drop policy if exists "message_reactions_insert_policy" on public.message_reactions;
--   drop policy if exists "message_reactions_update_policy" on public.message_reactions;
--   drop policy if exists "message_reactions_delete_policy" on public.message_reactions;
--   create policy "message_reactions_insert_policy" on public.message_reactions for insert to authenticated with check (exists (select 1 from public.messages m join public.contacts c on c.id = m.contact_id where m.id = message_id and (public.is_admin_or_supervisor(auth.uid()) or c.assigned_to = public.get_profile_id_for_user(auth.uid()) or c.assigned_to is null)));
--   create policy "message_reactions_update_policy" on public.message_reactions for update to authenticated using (exists (select 1 from public.messages m join public.contacts c on c.id = m.contact_id where m.id = message_id and (public.is_admin_or_supervisor(auth.uid()) or c.assigned_to = public.get_profile_id_for_user(auth.uid()) or c.assigned_to is null)));
--   create policy "message_reactions_delete_policy" on public.message_reactions for delete to authenticated using (exists (select 1 from public.messages m join public.contacts c on c.id = m.contact_id where m.id = message_id and (public.is_admin_or_supervisor(auth.uid()) or c.assigned_to = public.get_profile_id_for_user(auth.uid()) or c.assigned_to is null)));
--   create policy "Users can insert reactions for assigned contacts" on public.message_reactions for insert to authenticated with check (contact_id in (select c.id from public.contacts c where c.assigned_to in (select p.id from public.profiles p where p.user_id = auth.uid())) or public.is_admin_or_supervisor(auth.uid()));
--   create policy "Users can delete their own reactions" on public.message_reactions for delete to authenticated using (user_id in (select id from public.profiles where user_id = auth.uid()));
--
-- SEC-RLS_CONTATOS_MENSAGENS-04 (P2, docs/audits/SEGURANCA_RLS_CONTATOS_MENSAGENS_2026-10-07.md:112-129):
-- as policies de escrita de `message_reactions` NÃO amarravam `user_id` ao chamador. Como PERMISSIVE soma
-- por OR, bastava UMA passar: um `authenticated` gravava reação com `user_id` de OUTRO perfil
-- (personificação) ou com `user_id` nulo + `contact_id` setado (fingindo "reação do cliente"), e apagava
-- reação de terceiro. `user_id` é FK de `profiles.id` (`20251220181300:29`).
--
-- Correção: uma única policy por comando (INSERT/UPDATE/DELETE), todas `TO authenticated`, exigindo
-- `user_id = public.get_profile_id_for_user(auth.uid())` para o autor; UPDATE/DELETE liberam também
-- `public.is_admin_or_supervisor(auth.uid())` (moderação). O INSERT mantém a visibilidade da mensagem e
-- passa a exigir também que `contact_id` seja o do próprio `message_id` -- o app manda esse valor
-- desnormalizado (`src/hooks/reactions/useReactionMutations.ts:65`, único escritor autenticado, upsert com
-- `contact_id` resolvido da mensagem). Sem isso o upsert do atendente seria negado.
--
-- Nenhum GRANT/papel/ACL é alterado aqui (não há objeto novo); só policies.

SET search_path = public, pg_temp;

-- Redundantes que somavam por OR (INSERT por contato e DELETE legado) + nomes antigos mortos.
DROP POLICY IF EXISTS "Users can insert reactions for assigned contacts" ON public.message_reactions;
DROP POLICY IF EXISTS "Users can add reactions" ON public.message_reactions;
DROP POLICY IF EXISTS "Authenticated users can add reactions" ON public.message_reactions;
DROP POLICY IF EXISTS "Authenticated can insert reactions" ON public.message_reactions;
DROP POLICY IF EXISTS "Users can insert reactions" ON public.message_reactions;
DROP POLICY IF EXISTS "Agents can react to visible messages" ON public.message_reactions;
DROP POLICY IF EXISTS "Users can update reactions" ON public.message_reactions;
DROP POLICY IF EXISTS "Users can delete their own reactions" ON public.message_reactions;
DROP POLICY IF EXISTS "Users can delete reactions" ON public.message_reactions;

-- INSERT: autor = eu; a reação carrega o contato da própria mensagem (ou nenhum); a mensagem tem de ser visível.
DROP POLICY IF EXISTS "message_reactions_insert_policy" ON public.message_reactions;
CREATE POLICY "message_reactions_insert_policy" ON public.message_reactions
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = public.get_profile_id_for_user(auth.uid())
    AND contact_id IS NOT DISTINCT FROM (
      SELECT m.contact_id FROM public.messages m WHERE m.id = message_id
    )
    AND EXISTS (
      SELECT 1 FROM public.messages m
      JOIN public.contacts c ON c.id = m.contact_id
      WHERE m.id = message_id
        AND (
          public.is_admin_or_supervisor(auth.uid())
          OR c.assigned_to = public.get_profile_id_for_user(auth.uid())
          OR c.assigned_to IS NULL
        )
    )
  );

-- UPDATE: só o autor (ou admin/supervisor). O WITH CHECK impede repassar a reação para outro autor/contato.
DROP POLICY IF EXISTS "message_reactions_update_policy" ON public.message_reactions;
CREATE POLICY "message_reactions_update_policy" ON public.message_reactions
  FOR UPDATE TO authenticated
  USING (
    user_id = public.get_profile_id_for_user(auth.uid())
    OR public.is_admin_or_supervisor(auth.uid())
  )
  WITH CHECK (
    public.is_admin_or_supervisor(auth.uid())
    OR (
      user_id = public.get_profile_id_for_user(auth.uid())
      AND contact_id IS NOT DISTINCT FROM (
        SELECT m.contact_id FROM public.messages m WHERE m.id = message_id
      )
    )
  );

-- DELETE: só o autor (ou admin/supervisor).
DROP POLICY IF EXISTS "message_reactions_delete_policy" ON public.message_reactions;
CREATE POLICY "message_reactions_delete_policy" ON public.message_reactions
  FOR DELETE TO authenticated
  USING (
    user_id = public.get_profile_id_for_user(auth.uid())
    OR public.is_admin_or_supervisor(auth.uid())
  );
