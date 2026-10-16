-- harden_policy_roles_and_message_reactions_clause
-- Rollback: repõe as 9 policies ao papel PUBLIC (estado de autoria em 20260924230500) e devolve message_reactions_select_policy à cláusula antiga (user_id = auth.uid()).
-- Rollback (SQL executável, na ordem):
--   drop policy if exists "message_reactions_select_policy" on public.message_reactions;
--   create policy "message_reactions_select_policy" on public.message_reactions for select to authenticated using (public.is_admin_or_supervisor(auth.uid()) or user_id = auth.uid() or contact_id in (select c.id from public.contacts c where c.assigned_to in (select public.get_visible_agent_ids(auth.uid()))));
--   alter policy "Users can create own snoozes" on public.conversation_snoozes to public;
--   alter policy "Users can view own favorites" on public.favorite_contacts to public;
--   alter policy "Users can create own favorites" on public.favorite_contacts to public;
--   alter policy "Users can update own favorites" on public.favorite_contacts to public;
--   alter policy "Users can delete own favorites" on public.favorite_contacts to public;
--   alter policy "Users can view own pins" on public.pinned_conversations to public;
--   alter policy "Users can create own pins" on public.pinned_conversations to public;
--   alter policy "Users can update own pins" on public.pinned_conversations to public;
--   alter policy "Users can delete own pins" on public.pinned_conversations to public;
--
-- Endurecimento trivial (SEC-RLS_CONTATOS_MENSAGENS-07 e -08):
--
-- 1. TO authenticated nas 9 policies de conversation_snoozes / favorite_contacts /
--    pinned_conversations criadas por 20260924230500. Aquelas CREATE POLICY nao
--    declararam TO, entao nasceram valendo para PUBLIC (inclui anon). Nao ha acesso
--    ampliado hoje (todo predicado exige auth.uid()), mas o padrao e errado.
--    ALTER POLICY ... TO authenticated e idempotente: no replay local a versao
--    20260930142000 (recuperacao do ledger) ja normalizou estas 9 por um bloco
--    dinamico opaco; aqui a normalizacao fica explicita e nominal no repositorio.
--
-- 2. message_reactions_select_policy (criada por 20260830110000) comparava
--    `user_id = auth.uid()`, mas message_reactions.user_id referencia profiles(id)
--    (20251220181300) e nao auth.users(id). A clausula "reações próprias" era sempre
--    falsa (um profiles.id nunca e igual a um auth.uid()), reduzindo a visibilidade de
--    quem apenas reagiu sem ser admin/supervisor nem ter o contato na carteira. O
--    comentario do arquivo original afirmava, incorretamente, que user_id era
--    auth.users.id. A clausula passa a usar public.get_profile_id_for_user(auth.uid()).

-- Item 1: as 9 policies passam a valer so para authenticated.
DO $harden$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT *
    FROM (VALUES
      ('conversation_snoozes', 'Users can create own snoozes'),
      ('favorite_contacts',    'Users can view own favorites'),
      ('favorite_contacts',    'Users can create own favorites'),
      ('favorite_contacts',    'Users can update own favorites'),
      ('favorite_contacts',    'Users can delete own favorites'),
      ('pinned_conversations', 'Users can view own pins'),
      ('pinned_conversations', 'Users can create own pins'),
      ('pinned_conversations', 'Users can update own pins'),
      ('pinned_conversations', 'Users can delete own pins')
    ) AS v(tablename, policyname)
  LOOP
    IF EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = r.tablename
        AND policyname = r.policyname
    ) THEN
      EXECUTE format('ALTER POLICY %I ON public.%I TO authenticated', r.policyname, r.tablename);
    END IF;
  END LOOP;
END
$harden$;

-- Item 2: a clausula "reações próprias" passa a comparar profiles.id com o perfil
-- do chamador (message_reactions.user_id referencia profiles.id).
DROP POLICY IF EXISTS "message_reactions_select_policy" ON public.message_reactions;
CREATE POLICY "message_reactions_select_policy"
  ON public.message_reactions
  FOR SELECT
  TO authenticated
  USING (
    public.is_admin_or_supervisor(auth.uid())
    OR user_id = public.get_profile_id_for_user(auth.uid())
    OR contact_id IN (
      SELECT c.id
      FROM public.contacts c
      WHERE c.assigned_to IN (SELECT public.get_visible_agent_ids(auth.uid()))
    )
  );
