-- Bug encontrado na reconstrucao retroativa de 20260902120000: a policy de
-- INSERT de team_message_reactions compara "tcm.profile_id = tcm.profile_id"
-- (mesma coluna dos dois lados) em vez de comparar contra o profile de quem
-- esta inserindo. O EXISTS de membership sempre e verdadeiro, entao qualquer
-- usuario autenticado pode reagir a mensagens de conversas de equipe das
-- quais nao participa — falha de autorizacao (nao IDOR classico, mas mesma
-- familia: policy que aparenta checar posse/membership e nao checa).
--
-- Fix: reusa is_team_conversation_member (mesma funcao ja usada nas policies
-- de team_messages), em vez de reimplementar o EXISTS com JOIN duplicado em
-- profiles — sugestao do Copilot na revisao da PR, validada contra a funcao
-- ja existente no banco.
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
      SELECT 1 FROM public.team_messages tm
      WHERE tm.id = team_message_reactions.message_id
        AND public.is_team_conversation_member(auth.uid(), tm.conversation_id)
    )
  );
