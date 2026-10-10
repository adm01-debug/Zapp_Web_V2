-- Fase 6 do plano de busca (docs/mapa/PLANO_BUSCA_SEARCHBOX_50_ETAPAS.md), E42: colunas
-- aditivas e nullable para guardar a coordenada do contato quando o operador escolhe uma
-- sugestao do autocomplete de endereco (ContactForm.tsx) via Mapbox Search Box /retrieve.
-- Sem backfill: contatos antigos ficam com latitude/longitude NULL ate serem reeditados —
-- geocodificar em massa custaria sessoes de Search Box sem necessidade real (ver plano, regra 1).
--
-- NAO APLICADA em producao por esta sessao: o Supabase MCP conectado nao e o
-- "SUPABASE - ZAPP WEB V2 - MCP" oficial (schema divergente confirmado -- ver corpo da PR).
-- Quem for aplicar: usar o MCP correto do projeto ou supabase/migrations + scripts/db-audit/
-- register-migration.mjs --apply, e so entao seguir com o merge desta PR.

ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS latitude double precision,
  ADD COLUMN IF NOT EXISTS longitude double precision;
