-- Lacuna L8 da matriz docs/ia/IA-004-matriz-autorizacao.md (caso de aceite N6).
--
-- As policies de SELECT de conversation_analyses e ai_conversation_tags decidem
-- visibilidade por UM unico ramo: contato ATRIBUIDO ao agente
--   contact_id IN (SELECT c.id FROM contacts c WHERE c.assigned_to IN (...))
--   OR is_admin_or_supervisor(auth.uid())
-- Ignoram o ramo de FILA (queue_members) e o de carteira concedida
-- (agent_visibility_grants) que o resto do sistema usa via is_contact_visible_to_user.
--
-- Consequencia real (write sem read): a 20260930100000 endureceu o INSERT para
-- exigir is_contact_visible_to_user(contact_id, auth.uid()) — que INCLUI fila.
-- Hoje o agente que enxerga o contato SO por fila grava a analise de IA do contato
-- e nao consegue ler o proprio registro (SELECT nao conhece fila).
--
-- Correcao: alinhar as DUAS policies de SELECT ao MESMO predicado do INSERT.
-- E superconjunto estrito do predicado atual:
--   * contato atribuido  -> get_visible_agent_ids() inclui o proprio profile;
--   * admin/supervisor   -> dentro do helper;
--   * ADICIONA fila e carteira concedida;
--   * o helper exige _user_id = auth.uid() -> sem impersonacao.
-- O helper e SECURITY DEFINER, entao some a dependencia de o chamador ter SELECT
-- em contacts/profiles que o subselect inline exigia.
--
-- Consumidores preservados: useConversationAnalyses.ts, useLatestAnalysis.ts,
-- useAIStats.ts, AutoTicketClassifier.tsx, contact.service.ts.
-- Sem BEGIN/COMMIT: o gateway aplica a migration numa unica transacao.

DROP POLICY "Authenticated users can view analyses" ON public.conversation_analyses;

CREATE POLICY "Authenticated users can view analyses" ON public.conversation_analyses
  FOR SELECT TO authenticated
  USING ( public.is_contact_visible_to_user(contact_id, auth.uid()) );

DROP POLICY "Authenticated can view ai tags" ON public.ai_conversation_tags;

CREATE POLICY "Authenticated can view ai tags" ON public.ai_conversation_tags
  FOR SELECT TO authenticated
  USING ( public.is_contact_visible_to_user(contact_id, auth.uid()) );
