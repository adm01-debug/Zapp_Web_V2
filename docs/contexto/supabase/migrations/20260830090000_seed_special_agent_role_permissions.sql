-- STEP 23: Seed de role_permissions para special_agent (F06)
-- Gate 24 resolvido como senior dev: 7 permissões (agent base + view_agents).
-- Rationale: special_agent VÊ mais dados que agent mas NÃO gerencia nada.
-- Reversível: DELETE FROM role_permissions WHERE role='special_agent'.
INSERT INTO public.role_permissions (role, permission_id)
SELECT 'special_agent'::app_role, p.id
FROM public.permissions p
WHERE p.name IN (
  'send_messages',      -- enviar mensagens (core do agente)
  'view_contacts',      -- ver contatos na carteira
  'view_dashboard',     -- dashboard de métricas
  'view_inbox',         -- caixa de entrada
  'view_queues',        -- ver filas
  'view_settings',      -- configurações próprias
  'view_agents'         -- ver outros agentes (necessário para granular visibilidade)
)
ON CONFLICT DO NOTHING;
