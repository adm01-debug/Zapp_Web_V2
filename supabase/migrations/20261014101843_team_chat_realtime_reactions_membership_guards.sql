-- team_chat_realtime_reactions_membership_guards
-- Rollback: desfaz, na ordem inversa, a publicacao do Realtime + as REPLICA IDENTITY + as policies trocadas/removidas.
-- CREATE POLICY team_message_reactions_select ON public.team_message_reactions FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.team_messages tm JOIN public.team_conversation_members tcm ON tcm.conversation_id = tm.conversation_id JOIN public.profiles p ON p.id = tcm.profile_id WHERE tm.id = team_message_reactions.message_id AND p.user_id = auth.uid()));
-- CREATE POLICY team_message_reactions_delete ON public.team_message_reactions FOR DELETE TO authenticated USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = team_message_reactions.profile_id AND p.user_id = auth.uid()));
-- DROP POLICY IF EXISTS team_messages_update_own ON public.team_messages;
-- CREATE POLICY team_messages_update_own ON public.team_messages FOR UPDATE TO authenticated USING (sender_id = public.current_profile_id()) WITH CHECK (sender_id = public.current_profile_id());
-- DROP POLICY IF EXISTS "Senders can delete own messages" ON public.team_messages;
-- CREATE POLICY "Senders can delete own messages" ON public.team_messages FOR DELETE TO authenticated USING (sender_id = (SELECT p.id FROM public.profiles p WHERE p.user_id = auth.uid() LIMIT 1));
-- ALTER TABLE public.team_messages REPLICA IDENTITY DEFAULT;
-- ALTER TABLE public.team_message_reactions REPLICA IDENTITY DEFAULT;
-- ALTER PUBLICATION supabase_realtime DROP TABLE public.team_message_reactions;
--
-- Os dois CREATE POLICY de `team_message_reactions_*` acima recriam as duplicatas removidas no
-- passo 4 (as canônicas `reactions_select`/`reactions_delete` nunca são tocadas). Nenhum DADO muda,
-- então não há valor antigo a devolver — o rollback é só de estrutura, na ordem inversa.
--
-- Item "Team Chat — realtime das reações, exclusão chegando ao painel e permissão de ex-membro".
-- Quatro achados, TODOS confirmados contra o banco local da tarefa antes de qualquer edição
-- (pg_publication_tables, pg_class.relreplident, pg_policies — ver o .test.sh deste cartão):
--   1) `team_message_reactions` NUNCA entrou em `supabase_realtime` (a migration 20260929240000/E34
--      publicou team_messages, team_conversations, team_conversation_members e team_message_receipts;
--      a tabela de reações ficou de fora). O canal `team-reactions-<id>` de `useTeamMessageReactions.ts`
--      se inscreve em `postgres_changes` dessa tabela e nunca recebia evento.
--   2) `team_messages` voltou a REPLICA IDENTITY DEFAULT na migration 20260929410000/E47. O canal de
--      `useTeamMessages.ts` filtra por `conversation_id=eq.<id>`; com DEFAULT o evento DELETE leva só a
--      PK (sem conversation_id), o filtro não casa e a exclusão de outro membro não chega ao painel.
--   3) UPDATE (`team_messages_update_own`) e DELETE ("Senders can delete own messages") de `team_messages`
--      checavam SÓ `sender_id`. MEDIDO no banco local: hoje o ex-membro NÃO edita nem apaga — quem barra
--      é a policy de SELECT (exige vínculo), porque o Postgres aplica a leitura ao UPDATE/DELETE. O furo
--      é LATENTE: os dois comandos não têm trava própria e passam a valer para o ex-membro no dia em que
--      a leitura ficar mais ampla (o .test.sh prova os dois cenários, com e sem leitura ampliada).
--   4) `team_message_reactions` carregava DUAS policies PERMISSIVE de SELECT (`reactions_select` +
--      `team_message_reactions_select`) e DUAS de DELETE (`reactions_delete` +
--      `team_message_reactions_delete`). PERMISSIVE soma por OR, então a leitura e a remoção ficavam a
--      cargo das duas — hoje equivalentes, mas qualquer edição futura em uma só reabre o furo sem
--      ninguém ver. A duplicata de INSERT já havia sido removida em 20260930260000.
--
-- Correção (só o necessário; nada de DDL fora disto):
--   * publica a tabela de reações e devolve REPLICA IDENTITY FULL às duas tabelas de realtime;
--   * UPDATE/DELETE de team_messages passam a exigir vínculo ativo com a conversa;
--   * uma policy por comando em team_message_reactions (sumindo as reconstruídas).
-- Sem BEGIN/COMMIT: o gateway aplica a migration numa única transação; qualquer erro desfaz tudo.

-- 1) Realtime: `team_message_reactions` entra na publicação. Idempotente: já membro -> no-op.
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.team_message_reactions;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;

-- 2) REPLICA IDENTITY FULL nas duas tabelas que os painéis assinam com filtro por `conversation_id`
--    (o DELETE precisa carregar a coluna do filtro e as colunas que a checagem de RLS do Realtime lê).
--    Custo: o WAL passa a registrar a linha VELHA inteira em cada UPDATE/DELETE. `team_messages` é
--    append-mostly (edição/apagar são raros) e `team_message_reactions` só muda ao reagir/desreagir —
--    volume compatível com o que o módulo já usava antes de E47 (`team_messages` era FULL até 29/09).
ALTER TABLE public.team_messages REPLICA IDENTITY FULL;
ALTER TABLE public.team_message_reactions REPLICA IDENTITY FULL;

-- 3) team_messages: ex-membro não edita nem apaga. `sender_id` continua obrigatório; soma-se o vínculo
--    com a conversa (mesma função das policies de SELECT/INSERT). Membro ativo: idêntico a antes.
DROP POLICY IF EXISTS "Senders can delete own messages" ON public.team_messages;
CREATE POLICY "Senders can delete own messages" ON public.team_messages
  FOR DELETE TO authenticated
  USING (
    sender_id = public.current_profile_id()
    AND public.is_team_conversation_member(auth.uid(), conversation_id)
  );

DROP POLICY IF EXISTS team_messages_update_own ON public.team_messages;
CREATE POLICY team_messages_update_own ON public.team_messages
  FOR UPDATE TO authenticated
  USING (
    sender_id = public.current_profile_id()
    AND public.is_team_conversation_member(auth.uid(), conversation_id)
  )
  WITH CHECK (
    sender_id = public.current_profile_id()
    AND public.is_team_conversation_member(auth.uid(), conversation_id)
  );

-- 4) team_message_reactions: uma PERMISSIVE por comando. Some com as reconstruídas (20260902120000);
--    ficam as canônicas de 30/09 (`reactions_select`/`reactions_delete`), com semântica preservada.
DROP POLICY IF EXISTS team_message_reactions_select ON public.team_message_reactions;
DROP POLICY IF EXISTS team_message_reactions_delete ON public.team_message_reactions;
