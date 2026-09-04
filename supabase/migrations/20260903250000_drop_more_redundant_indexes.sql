-- PERF: drop 15 single-column indexes made redundant by composite/unique indexes
-- Discovered by Agent 2 exhaustive validation (round 2)
DROP INDEX IF EXISTS public.idx_allowed_countries_code;        -- UNIQUE allowed_countries_country_code_key
DROP INDEX IF EXISTS public.idx_audio_meme_favorites_user;     -- UNIQUE (user_id, meme_id)
DROP INDEX IF EXISTS public.idx_blocked_countries_code;        -- UNIQUE blocked_countries_country_code_key
DROP INDEX IF EXISTS public.idx_blocked_ips_ip;                -- UNIQUE blocked_ips_ip_address_key
DROP INDEX IF EXISTS public.idx_business_hours_connection;     -- UNIQUE (whatsapp_connection_id, day_of_week)
DROP INDEX IF EXISTS public.idx_campaign_contacts_campaign_id; -- composite (campaign_id, status)
DROP INDEX IF EXISTS public.idx_contact_custom_fields_contact; -- UNIQUE (contact_id, field_name)
DROP INDEX IF EXISTS public.idx_conversation_analyses_contact_id; -- composite (contact_id, department_id)
DROP INDEX IF EXISTS public.idx_email_labels_account;          -- UNIQUE (gmail_account_id, gmail_label_id)
DROP INDEX IF EXISTS public.idx_versions_entity;               -- UNIQUE (entity_type, entity_id, version_number)
DROP INDEX IF EXISTS public.idx_reputation_connection;         -- UNIQUE whatsapp_connection_id
DROP INDEX IF EXISTS public.idx_passkey_credentials_credential_id; -- UNIQUE credential_id
DROP INDEX IF EXISTS public.idx_talkx_blacklist_contact;       -- UNIQUE contact_id
DROP INDEX IF EXISTS public.idx_talkx_recipients_campaign;     -- UNIQUE (campaign_id, contact_id)
DROP INDEX IF EXISTS public.idx_user_devices_user_id;          -- UNIQUE (user_id, device_fingerprint)
