-- sec_rls_revoke_anon_contatos_mensagens
-- Rollback: devolve ao papel anon os privilegios de tabela que ele tinha nas 17 tabelas.
-- Rollback (SQL executável, na ordem):
--   GRANT ALL PRIVILEGES ON TABLE public.conversation_events, public.contact_custom_fields, public.contact_identity_map, public.conversation_closures, public.conversation_memory, public.conversation_sla, public.conversation_snoozes, public.conversation_tasks, public.favorite_contacts, public.pinned_conversations, public.message_reactions, public.message_templates, public.scheduled_messages, public.campaign_contacts, public.contact_purchases, public.sicoob_contact_mapping, public.ai_conversation_tags TO anon;
--
-- SEC-RLS_CONTATOS_MENSAGENS-05 (P2): o papel `anon` tinha TODOS os privilegios de tabela
-- (inclusive TRUNCATE, que IGNORA RLS) nas 17 tabelas de contatos/mensagens listadas no achado.
-- Este REVOKE alinha-as ao padrao ja aplicado em contacts/messages/contact_notes (so authenticated).
-- Nenhuma rota publica legitima depende destas tabelas (nao ha policy nem RPC executavel por anon
-- que as leia; a revisao de 07/10 ja mediu routine_grants com EXECUTE para anon = zero).

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
