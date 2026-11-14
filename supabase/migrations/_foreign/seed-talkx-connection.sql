-- Conexão WhatsApp dedicada para E2E — semeada em produção em 2026-09-28.
-- Reproduzir em banco limpo antes de rodar os specs de talkx.spec.ts.
--
-- Pré-requisito: usuário de teste E2E (supervisor) com id 2264678e-17f4-4b4e-b89b-5fc4852bfa86
-- deve existir em auth.users (criado por e2e/auth.setup.ts via auth.signInWithPassword).
--
-- Status 'disconnected' (auditoria Conversas 2026-11-13, P0-1): com 'connected' em
-- produção, o fallback de envio gravava mensagens REAIS de atendentes nesta conexão de
-- teste (750 'failed' + 157 presas em 'sending'). A suíte E2E logada roda hoje em
-- backend DESCARTÁVEL e semeia lá a própria conexão 'connected' (instance 'E2E_LOCAL',
-- scripts/e2e-isolated/seed-suite.mjs); aqui ela só precisa existir.
-- Nenhum caminho de envio escolhe instance_id 'E2E_FIXTURE'
-- (resolve_outbound_whatsapp_connection, 20261113130000).
--
-- NUNCA apagar esta linha do banco de produção.

INSERT INTO whatsapp_connections (
  id,
  name,
  phone_number,
  instance_id,
  status,
  created_by,
  created_at,
  updated_at
)
VALUES (
  'e2e0e2e0-0000-4000-a000-e2e000000001',
  '[E2E] Conexão WhatsApp Teste',
  '00000000000',
  'E2E_FIXTURE',
  'disconnected',
  '2264678e-17f4-4b4e-b89b-5fc4852bfa86',
  now(),
  now()
)
ON CONFLICT (id) DO NOTHING;
