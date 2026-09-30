-- migration: 20260930100000
-- Lacuna L3 da matriz docs/ia/IA-004-matriz-autorizacao.md (caso de aceite N14).
--
-- A policy de INSERT de public.conversation_analyses
-- ("Users can insert own analyses", definida em 20260317222757_41908e22-...sql) tem:
--
--   WITH CHECK (
--     analyzed_by IS NULL
--     OR analyzed_by IN (SELECT profiles.id FROM profiles WHERE profiles.user_id = auth.uid())
--     OR is_admin_or_supervisor(auth.uid())
--   )
--
-- …ou seja: NAO olha o contato. Qualquer `authenticated` grava análise de IA —
-- inclusive resumo/sentimento (PII de conversa) — para QUALQUER contact_id, e ainda
-- pode gravar com `analyzed_by IS NULL`, forjando um registro de IA sem autor. E como
-- a tabela esta sem FORCE ROW LEVEL SECURITY, so a policy (e o grant) separam o
-- usuario do dado.
--
-- Correcao: a analise passa a exigir
--   (a) autoria REAL: analyzed_by = get_profile_id_for_user(auth.uid())
--       (helper caller-bound: nao da para apontar autoria para outra pessoa, e NULL cai);
--   (b) contato no escopo do chamador: is_contact_visible_to_user(contact_id, auth.uid())
--       (o mesmo predicado da policy de SELECT; ja cobre admin/supervisor).
--
-- Consumidor legitimo preservado: src/hooks/chat/useConversationAnalyses.ts (saveAnalysis)
-- grava sempre com o proprio profile; o caminho de servico (edge function
-- `ai-conversation-analysis`, service_role) nem passa por RLS.
--
-- Endurecimento no mesmo tema, seguindo a convencao ja aplicada a `contacts`
-- (20260929560000_...:78): REVOKE de `anon` na tabela — `anon` tinha INSERT/UPDATE/
-- DELETE/TRUNCATE/SELECT concedidos e so a RLS o segurava.
--
-- Sem BEGIN/COMMIT: o gateway aplica a migration numa unica transacao (o DROP e o
-- CREATE da policy acontecem sem janela em que a tabela fique sem policy).

DROP POLICY "Users can insert own analyses" ON public.conversation_analyses;

CREATE POLICY "Users can insert own analyses" ON public.conversation_analyses
  FOR INSERT
  TO authenticated
  WITH CHECK (
    analyzed_by = public.get_profile_id_for_user(auth.uid())
    AND public.is_contact_visible_to_user(contact_id, auth.uid())
  );

REVOKE ALL ON public.conversation_analyses FROM anon;
