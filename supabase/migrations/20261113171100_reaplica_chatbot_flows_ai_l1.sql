-- reaplica_chatbot_flows_ai_l1
-- Rollback: igual ao da original 20261015211127_chatbot_flows_ai_l1.sql — desfaz o indice unico parcial e devolve o CHECK sem 'ai_l1'. Fluxos 'ai_l1' existentes sao DESLIGADOS e reclassificados como 'keyword' (senao o ADD CONSTRAINT falha), com o gatilho update_chatbot_flows_updated_at desligado so nesta transacao para nao reescrever updated_at.
-- Rollback (SQL executável, na ordem):
--   drop index if exists public.chatbot_flows_ai_l1_one_active_idx;
--   alter table public.chatbot_flows disable trigger update_chatbot_flows_updated_at;
--   update public.chatbot_flows set is_active = false where trigger_type = 'ai_l1';
--   update public.chatbot_flows set trigger_type = 'keyword' where trigger_type = 'ai_l1';
--   alter table public.chatbot_flows drop constraint if exists chatbot_flows_trigger_type_check;
--   alter table public.chatbot_flows add constraint chatbot_flows_trigger_type_check check (trigger_type in ('keyword', 'first_message', 'menu', 'webhook', 'schedule'));
--   alter table public.chatbot_flows enable trigger update_chatbot_flows_updated_at;
--
-- POR QUE EXISTE: o ledger (supabase_migrations.schema_migrations) registrou a versao
-- 20261015211127 (chatbot_flows_ai_l1) com statements NULL, mas o DDL nunca rodou em producao.
-- Prova (SELECT no projeto oficial tnnnlkbymytvtqngbbqh, 2026-11-14):
--   SELECT pg_get_constraintdef(oid) FROM pg_constraint
--    WHERE conname = 'chatbot_flows_trigger_type_check';
--   -> CHECK ((trigger_type = ANY (ARRAY['keyword','first_message','menu','webhook','schedule'])))
--      (sem 'ai_l1')
--   SELECT indexname FROM pg_indexes WHERE tablename = 'chatbot_flows';
--   -> chatbot_flows_pkey, idx_chatbot_flows_active, idx_chatbot_flows_created_by,
--      idx_chatbot_flows_whatsapp_connection_id (sem chatbot_flows_ai_l1_one_active_idx)
--   SELECT array_length(statements,1) FROM supabase_migrations.schema_migrations
--    WHERE version = '20261015211127';  -> NULL
--   SELECT count(*) FROM public.chatbot_flows;  -> 0 (0 'ai_l1', 0 grupos duplicados:
--   o indice unico cria sem conflito)
-- Efeito hoje: ChatbotL1Config.tsx:88 grava trigger_type = 'ai_l1' e o CHECK vivo rejeita com
-- 23514; nenhuma migration posterior em main nem PR aberta mexe nesse CHECK ou indice.
--
-- O QUE FAZ: reaplica, byte-identico, o corpo da original (abaixo). Idempotente: o CHECK e
-- recriado com DROP ... IF EXISTS + ADD (lista nova = superconjunto da viva, valida as linhas
-- existentes) e o indice usa IF NOT EXISTS. Sem GRANT/REVOKE (constraint e indice herdam a
-- ACL da tabela).
--
-- IA-L1 / auditoria de paridade V3->V2: a UI do Chatbot IA grava trigger_type = 'ai_l1'
-- (src/components/settings/ChatbotL1Config.tsx:88) e o CHECK inline da tabela
-- (supabase/migrations/20260315151618_8e3fca18-74ac-4877-84f4-d2a02cfaf24f.sql:46) so
-- aceitava keyword/first_message/menu/webhook/schedule: a primeira gravacao falhava com 23514.
-- A Edge supabase/functions/chatbot-l1/index.ts:87-94 escolhe o fluxo PELA CONEXAO e usa
-- maybeSingle(), que estoura com duas linhas: daí a unicidade de um fluxo 'ai_l1' ATIVO
-- por whatsapp_connection_id. Migration so ADITIVA em relacao ao contrato aceito hoje
-- (a lista nova e um superconjunto da antiga) e sem GRANT/REVOKE: constraint e indice nao
-- tem privilegio proprio, herdam o da tabela (nada a conceder).
SET search_path = public, pg_temp;
SET lock_timeout = '5s';

-- 1) amplia o CHECK com 'ai_l1' (superconjunto da lista original) --------------------------
ALTER TABLE public.chatbot_flows DROP CONSTRAINT IF EXISTS chatbot_flows_trigger_type_check;
ALTER TABLE public.chatbot_flows
  ADD CONSTRAINT chatbot_flows_trigger_type_check
  CHECK (trigger_type IN ('keyword', 'first_message', 'menu', 'webhook', 'schedule', 'ai_l1'));

-- 2) no maximo UM fluxo 'ai_l1' ATIVO por conexao ------------------------------------------
-- Parcial de proposito: vale so para (trigger_type = 'ai_l1' AND is_active IS TRUE) e com
-- conexao nao nula. O fluxo criado pela UI (ChatbotL1Config.tsx:85-94) nasce sem
-- whatsapp_connection_id e continua podendo existir; varios INATIVOS na mesma conexao
-- tambem continuam permitidos (o indice so barra o segundo ATIVO).
CREATE UNIQUE INDEX IF NOT EXISTS chatbot_flows_ai_l1_one_active_idx
  ON public.chatbot_flows (whatsapp_connection_id)
  WHERE trigger_type = 'ai_l1' AND is_active IS TRUE AND whatsapp_connection_id IS NOT NULL;
