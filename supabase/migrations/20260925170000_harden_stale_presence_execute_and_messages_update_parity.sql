-- Fecha 2 dos 3 achados de RLS/grants da auditoria adversarial de 25/09.
-- O terceiro (profiles.email/phone visivel a supervisor via SELECT direto
-- na tabela, contornando a mascara de get_team_profiles()) fica pendente
-- de decisao de produto: 86 chamadas a .from('profiles') no front, varias
-- delas selecionando email/phone fora da RPC (ex: TeamMemberDetails.tsx),
-- sem dar pra saber sem revisar rota a rota se sao admin-only ou tambem
-- usadas por supervisor -- nao e um fix de causa raiz sem essa resposta.

-- 1) expire_stale_agent_presence() (SECURITY DEFINER) so e chamado pelo
-- job pg_cron 'expire-stale-agent-presence' (a cada 2min, como postgres).
-- A migration que criou a funcao (20260925100542_agent_presence_server_ttl)
-- nao revogou o EXECUTE que Postgres concede a PUBLIC por padrao em
-- CREATE FUNCTION -- qualquer client anon podia chamar a RPC direto e
-- forcar presenca offline, sem nenhum caller legitimo depender disso.
REVOKE EXECUTE ON FUNCTION public.expire_stale_agent_presence() FROM PUBLIC;

-- 2) messages: a policy de UPDATE nao tinha o branch de fila ativa que
-- SELECT ("messages_select_policy") e INSERT ("Users can insert
-- messages") ja tem -- inconsistencia que impedia um agente de fila (nao
-- dono do contato, mas com acesso via queue_members ativo) editar uma
-- mensagem que ele mesmo ja pode ver e criar. Mesma condicao das outras
-- duas policies, copiada literalmente.
ALTER POLICY "Users can update messages from their assigned contacts" ON public.messages
  USING (
    (contact_id IN (
      SELECT c.id FROM contacts c
      WHERE c.assigned_to IN (SELECT get_visible_agent_ids(auth.uid()))
    ))
    OR is_admin_or_supervisor(auth.uid())
    OR (EXISTS (
      SELECT 1 FROM contacts c
      JOIN queue_members qm ON qm.queue_id = c.queue_id
      WHERE c.id = messages.contact_id
        AND qm.profile_id = get_profile_id_for_user(auth.uid())
        AND qm.is_active = true
    ))
  );
