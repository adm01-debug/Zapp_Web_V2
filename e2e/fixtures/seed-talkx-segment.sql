-- Segmento fixo para testes E2E do Talk X
-- created_by = usuário supervisor de teste (e2e.zapp@promobrindes.com.br)
--   profile_id: 2264678e-17f4-4b4e-b89b-5fc4852bfa86
--
-- NUNCA apagar este registro do banco: talkx.spec.ts (7º spec) depende deste ID
-- para selecionar um "Segmento salvo" no step 1 do wizard de Campanha.
--
-- Como aplicar (idempotente — pode rodar mais de uma vez sem efeito colateral):
--   psql $DATABASE_URL -f e2e/fixtures/seed-talkx-segment.sql
-- Ou via MCP db_query:
--   SELECT conteúdo deste arquivo e execute via SUPABASE - ZAPP WEB V2 - MCP

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
)
VALUES (
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
