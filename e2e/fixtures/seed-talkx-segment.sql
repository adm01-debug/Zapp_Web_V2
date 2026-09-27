-- Segmento fixo para testes E2E do módulo Talk X.
-- NUNCA apagar este registro em produção — os specs de e2e/talkx.spec.ts dependem dele.
-- Aplicado via MCP (supabase db_query) em 2026-09-27.
-- Idempotente: ON CONFLICT (id) DO NOTHING.
INSERT INTO talkx_segments (
  id,
  name,
  description,
  origin,
  status,
  is_favorite,
  rules,
  estimated_count,
  created_by
) VALUES (
  '621521f3-e9c9-49c2-834e-cea07545d476',
  '[E2E] Segmento de Teste',
  'Segmento fixo para testes automatizados — nao apagar',
  'zapp',
  'active',
  false,
  '{"groups": []}',
  1,
  '2264678e-17f4-4b4e-b89b-5fc4852bfa86'
)
ON CONFLICT (id) DO NOTHING;
