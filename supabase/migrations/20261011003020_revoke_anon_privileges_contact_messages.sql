-- revoke_anon_privileges_contact_messages
-- Rollback: devolve a anon os 8 privilegios de tabela que as 17 tabelas tinham antes (SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN).
-- Rollback (SQL executável, na ordem):
--   grant select, insert, update, delete, truncate, references, trigger, maintain on table public.conversation_events, public.contact_custom_fields, public.contact_identity_map, public.conversation_closures, public.conversation_memory, public.conversation_sla, public.conversation_snoozes, public.conversation_tasks, public.favorite_contacts, public.pinned_conversations, public.message_reactions, public.message_templates, public.scheduled_messages, public.campaign_contacts, public.contact_purchases, public.sicoob_contact_mapping, public.ai_conversation_tags to anon;
--
-- SEC-RLS_CONTATOS_MENSAGENS-05 (P2, defesa em profundidade):
-- docs/audits/SEGURANCA_RLS_CONTATOS_MENSAGENS_2026-10-07.md. As 17 tabelas de
-- contatos/mensagens abaixo concedem a `anon` os 8 privilegios de tabela
-- (SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN).
-- Nao e exploravel hoje pelo PostgREST (toda policy do escopo exige auth.uid(), nulo
-- para anon, e o PostgREST nao emite TRUNCATE), mas TRUNCATE ignora RLS e nenhuma
-- policy o barra. Revogar de `anon` alinha ao padrao ja usado em contacts/messages/
-- contact_notes. Nao toca authenticated/service_role, nem policy, RLS, funcao ou coluna.
--
-- Idempotente: REVOKE ALL de um privilegio que ja nao existe e no-op.

BEGIN;

REVOKE ALL PRIVILEGES ON TABLE
  public.conversation_events,
  public.contact_custom_fields,
  public.contact_identity_map,
  public.conversation_closures,
  public.conversation_memory,
  public.conversation_sla,
  public.conversation_snoozes,
  public.conversation_tasks,
  public.favorite_contacts,
  public.pinned_conversations,
  public.message_reactions,
  public.message_templates,
  public.scheduled_messages,
  public.campaign_contacts,
  public.contact_purchases,
  public.sicoob_contact_mapping,
  public.ai_conversation_tags
FROM anon;

COMMIT;
