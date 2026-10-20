-- security_alerts_self_select
-- Rollback: volta o estado anterior — security_alerts fica só com as policies de admin/supervisor (o dono deixa de ler os próprios alertas).
-- Rollback (SQL executavel, na ordem):
--   drop policy if exists security_alerts_self_select on public.security_alerts;
--
-- Paridade V3 -> V2 (auditoria do doc 26, achados HZ3-013 / HZ5-11).
--
-- DEFEITO: public.security_alerts só tinha 'Admins can manage security alerts'
-- (FOR ALL, admin/supervisor) e 'Admins can insert security alerts'. Não havia
-- leitura para o DONO do alerta: um agente comum consultava a tabela sem erro e
-- recebia lista vazia, então a tela SecurityOverview mostrava sempre "sem
-- atividades suspeitas" — mesmo com detect-new-device e o limite de taxa
-- gravando alertas com user_id = ele mesmo.
--
-- CONSERTO (só ADITIVO): uma policy de SELECT para o dono. Nada de UPDATE/DELETE
-- para o dono — resolver o alerta continua sendo de admin/supervisor (a policy
-- FOR ALL existente segue intacta). Nenhum GRANT novo: 'authenticated' já tem
-- SELECT na tabela (GRANT do PostgREST), então a RLS é a única barreira — e por
-- isso nada é concedido a 'anon'.
--
-- Alerta com user_id NULL (os de sistema) continua visível só para
-- admin/supervisor: NULL = auth.uid() não é TRUE, então a policy do dono não o
-- libera. Sem índice novo: o filtro do dono é user_id, e
-- idx_security_alerts_user_id já é previsto em
-- 20260827120000_fk_indexes_backfill.sql (aquela migration cuida dos índices de
-- FK; aqui ficam só a policy).

drop policy if exists security_alerts_self_select on public.security_alerts;

create policy security_alerts_self_select
  on public.security_alerts
  for select
  to authenticated
  using (user_id = (select auth.uid()));

comment on policy security_alerts_self_select on public.security_alerts is
  'Dono do alerta (user_id = auth.uid()) lê os próprios alertas de segurança; resolver continua com admin/supervisor.';
