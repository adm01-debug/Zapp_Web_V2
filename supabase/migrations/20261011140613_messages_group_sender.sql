-- messages_group_sender
-- Rollback: remove as duas colunas aditivas de public.messages; nenhum consumidor fica sem
-- Rollback (SQL executável, na ordem):
--   alter table public.messages drop column if exists sender_display_name;
--   alter table public.messages drop column if exists sender_participant_jid;
--
-- Remetente de grupo no chat (paridade V3 -> V2, decisao do Joaquim 11/10/2026;
-- AUDITORIA_PARIDADE_V3_CHAT_UI_PARTE1/PARTE2_2026-10-11). Hoje public.messages nao
-- guarda quem escreveu DENTRO do grupo: todo recebido aparece como "Contato" e
-- participantes diferentes se fundem num bloco. Duas colunas ADITIVAS e ANULAVEIS
-- (sem backfill, sem NOT NULL, sem default) para o webhook (Edge) preencher depois:
--   sender_participant_jid  -- JID/identificador do participante no provedor (ex.: 5511...@s.whatsapp.net)
--   sender_display_name     -- nome exibido do participante (pushName), so para exibicao
-- Nao ha dado pessoal em log: as colunas vivem em messages, protegidas pela RLS existente.
-- Nenhuma policy nova: as colunas herdam o SELECT/INSERT/UPDATE ja vigentes em messages.
-- Nenhum indice novo: as consultas de conversa continuam filtrando por contact_id
-- (idx_messages_contact_id ja cobre) e agrupam por participante em memoria; nao ha padrao de
-- busca por sender_participant_jid que justifique peso de escrita na tabela mais quente.

alter table public.messages
  add column if not exists sender_participant_jid text,
  add column if not exists sender_display_name text;
