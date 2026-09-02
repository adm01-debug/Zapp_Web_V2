-- Bug encontrado na reconstrucao retroativa de 20260902120000: a policy de
-- INSERT de team_message_reactions compara "tcm.profile_id = tcm.profile_id"
-- (mesma coluna dos dois lados) em vez de comparar contra o profile de quem
-- esta inserindo. O EXISTS de membership sempre e verdadeiro, entao qualquer
-- usuario autenticado pode reagir a mensagens de conversas de equipe das
-- quais nao participa — falha de autorizacao (nao IDOR classico, mas mesma
-- familia: policy que aparenta checar posse/membership e nao checa).
--
-- Fix: junta profiles para comparar tcm.profile_id contra o profile do
-- auth.uid() atual, mesmo padrao ja usado nas policies de SELECT/DELETE desta
-- tabela.
DROP POLICY IF EXISTS team_message_reactions_insert ON public.team_message_reactions;

CREATE POLICY team_message_reactions_insert ON public.team_message_reactions
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = team_message_reactions.profile_id
        AND p.user_id = auth.uid()
    )
    AND EXISTS (
      SELECT 1
      FROM public.team_messages tm
      JOIN public.team_conversation_members tcm ON tcm.conversation_id = tm.conversation_id
      JOIN public.profiles p2 ON p2.id = tcm.profile_id
      WHERE tm.id = team_message_reactions.message_id
        AND p2.user_id = auth.uid()
    )
  );
