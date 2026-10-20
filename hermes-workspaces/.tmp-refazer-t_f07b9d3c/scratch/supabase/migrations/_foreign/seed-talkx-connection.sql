-- Conexão WhatsApp dedicada para E2E — semeada em produção em 2026-09-28.
-- Reproduzir em banco limpo antes de rodar os specs de talkx.spec.ts.
--
-- Pré-requisito: usuário de teste E2E (supervisor) com id 2264678e-17f4-4b4e-b89b-5fc4852bfa86
-- deve existir em auth.users (criado por e2e/auth.setup.ts via auth.signInWithPassword).
--
-- Por que status='connected' é obrigatório:
--   useCampaignEditor.ts filtra .eq('status','connected') + .not('instance_id','is',null)
--   Uma conexão disconnected não aparece no Select de StepAudience → canProceed[1]=false
--   → "Continuar" desabilitado → 7º spec ("wizard avança para step 2") falha.
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
  'connected',
  '2264678e-17f4-4b4e-b89b-5fc4852bfa86',
  now(),
  now()
)
ON CONFLICT (id) DO NOTHING;
