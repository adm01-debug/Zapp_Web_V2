# Integridade referencial — E17 (PLANO_MELHORIAS_50)

> Inventário das 51 colunas `public.*.*_id` sem `FOREIGN KEY` declarada (levantamento de
> 26/09, `pg_attribute`/`pg_constraint`). Decisão por coluna: FK criada × justificativa por
> escrito. 0 órfãos confirmados antes de qualquer escrita (ver migration
> `20260926200000_e17_referential_integrity_fks.sql`).

## FK criada (13 colunas — 0 órfãos verificados ao vivo)

| Tabela.coluna | Referencia | ON DELETE |
|---|---|---|
| `ai_usage_logs.user_id` | `auth.users(id)` | CASCADE |
| `gmail_accounts.user_id` | `auth.users(id)` | CASCADE |
| `message_templates.user_id` | `auth.users(id)` | CASCADE |
| `notifications.user_id` | `auth.users(id)` | CASCADE |
| `query_telemetry.user_id` | `auth.users(id)` | CASCADE |
| `saved_filters.user_id` | `auth.users(id)` | CASCADE |
| `user_devices.user_id` | `auth.users(id)` | CASCADE |
| `user_service_accounts.user_id` | `auth.users(id)` | CASCADE |
| `user_sessions.user_id` | `auth.users(id)` | CASCADE |
| `voice_command_logs.user_id` | `auth.users(id)` | CASCADE |
| `webauthn_challenges.user_id` | `auth.users(id)` | CASCADE |
| `performance_snapshots.profile_id` | `public.profiles(id)` | CASCADE |
| `whatsapp_connections.instance_token_secret_id` | `vault.secrets(id)` | SET NULL |

Padrão `NOT VALID` seguido de `VALIDATE CONSTRAINT` na mesma migration (evita lock de scan
na criação; validação já sabida verde pelos 0 órfãos).

## Justificado, sem FK (38 colunas — referência externa ou polimórfica)

| Tabela.coluna | Motivo |
|---|---|
| `audit_logs.entity_id`, `entity_versions.entity_id` | Polimórfico — aponta para várias tabelas diferentes conforme o tipo de entidade auditada; não há uma única FK possível. |
| `calls.provider_event_id` | ID do evento na operadora de telefonia (externo). |
| `campaign_contacts.external_id`, `talkx_recipients.external_id`, `payment_links.external_id` | Identificador do sistema externo (CRM/gateway de pagamento/Evolution), não uma PK local. |
| `catalog_favorites.product_id`, `catalog_send_events.product_id` | Referencia `products` do banco **externo** Catálogo de Produtos (`doufsxqlfjyuvxuezpln`) — FK entre bancos diferentes não é possível no Postgres. |
| `channel_connections.external_account_id`, `channel_connections.external_page_id` | IDs de conta/página na Meta (WhatsApp Business API) — externos. |
| `chatbot_executions.current_node_id` | Aponta para um nó dentro do JSON da definição do fluxo, não uma linha de tabela. |
| `connection_health_logs.instance_id`, `webhook_rate_limits.instance_id`, `whatsapp_connections.instance_id`, `departments.whatsapp_instance_id` | Nome da instância Evolution GO (`PRINCIPAL` etc.) — string livre da API externa, sem tabela local `instances`/`whatsapp_instances` (confirmado: não existe). |
| `conversation_closures.client_request_id` | Chave de idempotência gerada pelo cliente, não referência a outra tabela. |
| `crm_contact_links.external_company_id` / `external_contact_id`, `crm_sync_outbox.external_company_id` / `external_contact_id` / `external_interaction_id` | IDs do CRM externo (Gestão de Clientes/SICOOB) — nome já indica "external". |
| `email_attachments.gmail_attachment_id`, `email_labels.gmail_label_id`, `email_messages.gmail_message_id`, `email_threads.gmail_thread_id`, `gmail_accounts.history_id` | IDs da API do Gmail — externos. |
| `meta_capi_events.pixel_id` | ID do Pixel do Meta Conversions API — externo. |
| `mfa_sessions.factor_id` | Coluna é `text`, não `uuid` — não bate com `auth.mfa_factors.id` (`uuid`); é um identificador de sessão de desafio MFA, não uma FK direta. Fica documentado, sem FK. |
| `passkey_credentials.credential_id` | ID binário/opaco do credential WebAuthn (identifica o próprio registro, não referencia outra tabela). |
| `products.retailer_id` | Sem tabela local `retailers` (confirmado) — referência a um varejista externo/config, não FK interna. |
| `sicoob_contact_mapping.sicoob_singular_id`, `sicoob_contact_mapping.sicoob_user_id`, `sicoob_contact_mapping.sicoob_vendedor_id` | IDs do sistema SICOOB — externos. |
| `user_settings.tts_voice_id` | ID de voz da ElevenLabs (externo) — sem tabela local `voices`. |
| `whatsapp_flows.whatsapp_flow_id`, `whatsapp_groups.group_id` | IDs da API do WhatsApp/Meta — externos. |

## Fechamento

- Inventário completo: **13 FK criadas, 38 justificadas por escrito** — 100% das 51 colunas
  decididas.
- 0 órfãos nas 13 relações declaradas nesta rodada (verificado antes de escrever a migration).
- Migration seguiu a ordem do CLAUDE.md §1.6 (arquivo → PR #855 → merge → apply) e **foi
  aplicada em produção em 26/09** via MCP direto + registro no ledger no mesmo turno (seção
  "Decisões de 2026-09-26" do CLAUDE.md) — as 13 FKs confirmadas ao vivo em `pg_constraint`.

---
*Gerado em 2026-09-26, sessão de execução do `PLANO_MELHORIAS_50_ETAPAS_2026-09-20.md` (E17).*
