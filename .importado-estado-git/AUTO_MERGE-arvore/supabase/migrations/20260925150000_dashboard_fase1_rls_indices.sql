-- Dashboard 50 etapas — Fase 1 (E07-E11): RLS duplicada + índices ausentes
-- Ref: claude/PLANO_DASHBOARD_50_ETAPAS.md
--
-- Validado em produção antes deste patch (25/09/2026):
--   - conversation_sla_select_policy usa get_visible_agent_ids() (self + grants de special_agent),
--     que é superset de "Authenticated users can view SLA data" (só self). Drop seguro (E07).
--   - is_contact_visible_to_user() = is_admin_or_supervisor() OR assigned_to IN get_visible_agent_ids()
--     OR membro ativo da fila do contato — é superset estrito de conversation_events_select_policy
--     (que não tem o caminho de fila). Drop da estreita é seguro (E08).
--   - idx_closures_created_at, idx_sla_first_message_at, idx_events_created_at: nenhum dos três
--     existe hoje (conferido via pg_indexes) e as 3 colunas existem nas tabelas (E09-E11).
--
-- Desvio da regra "índices sempre CONCURRENTLY" do plano: o mecanismo que aplica estas migrations
-- em produção no merge para main não foi identificado (não é a Action db-migrate.yml, que é manual);
-- não há garantia de que execute fora de bloco de transação, e CREATE INDEX CONCURRENTLY dentro de
-- transação FALHA a migration inteira. As 3 tabelas são pequenas (maior é conversation_events,
-- 168 kB) — lock de CREATE INDEX simples é da ordem de milissegundos. Optou-se por não-concorrente
-- para não arriscar a migration inteira por um índice. Registrado para Joaquim revisar no PR.

-- E07: policy redundante em conversation_sla (subconjunto estrito de conversation_sla_select_policy)
DROP POLICY IF EXISTS "Authenticated users can view SLA data" ON public.conversation_sla;

-- E08: consolidar as 2 policies SELECT de conversation_events em uma, mantendo o caminho de fila
-- (só existe em "Agents or admins can view conversation events" via is_contact_visible_to_user)
DROP POLICY IF EXISTS "conversation_events_select_policy" ON public.conversation_events;
ALTER POLICY "Agents or admins can view conversation events" ON public.conversation_events
  RENAME TO conversation_events_select_policy;

-- E09
CREATE INDEX IF NOT EXISTS idx_closures_created_at
  ON public.conversation_closures (created_at DESC);

-- E10
CREATE INDEX IF NOT EXISTS idx_sla_first_message_at
  ON public.conversation_sla (first_message_at DESC);

-- E11
CREATE INDEX IF NOT EXISTS idx_events_created_at
  ON public.conversation_events (created_at DESC);
