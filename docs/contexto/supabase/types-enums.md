# Tipos customizados (enums, domains, composites)

| tipo | kind | valores / definição | usado em |
|---|---|---|---|
| public.ai_provider_type | enum | lovable_ai, openai_compatible, google_gemini, custom_webhook, custom_agent | public.ai_providers.provider_type |
| public.app_role | enum | admin, supervisor, agent | public.contact_protection_policy.scope_role, public.role_permissions.role, public.user_roles.role |
| public.channel_type | enum | whatsapp, instagram, telegram, messenger, webchat, email | public.channel_connections.channel_type, public.channel_connections_safe.channel_type, public.channel_routing_rules.channel_type |
| public.multiplix_block_type | enum | text, voice_ai, audio_recorded, file | public.multiplix_blocks.block_type |
| public.multiplix_dispatch_status | enum | draft, scheduled, sending, paused, completed, completed_with_failures, failed, cancelled | public.multiplix_dispatches.status |
| public.multiplix_eligibility | enum | eligible, no_destination, suppressed, out_of_scope, media_pending, connection_unavailable, requires_template | public.multiplix_recipients.eligibility |
| public.multiplix_item_status | enum | pending, sending, sent, delivered, read, failed, failed_transient, skipped, cancelled, outcome_unknown | public.multiplix_delivery_items.status |
| public.multiplix_recipient_status | enum | pending, sending, sent, delivered, read, failed, skipped, cancelled, outcome_unknown | public.multiplix_recipients.status |
| public.service_account_type | enum | google_sheets, google_docs, google_calendar, google_drive, dropbox | public.user_service_accounts.service_type |
