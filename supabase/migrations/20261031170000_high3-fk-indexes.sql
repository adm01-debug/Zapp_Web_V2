-- HIGH-3: 57 foreign-key columns without a covering index
-- Detected live on 2026-11-01 via information_schema + pg_index.
-- Per CLAUDE.md: CREATE INDEX (not CONCURRENTLY) — gateway wraps in transaction.

CREATE INDEX IF NOT EXISTS idx_ai_model_prices_provider_id
  ON public.ai_model_prices (provider_id);

CREATE INDEX IF NOT EXISTS idx_calls_answered_by
  ON public.calls (answered_by);

CREATE INDEX IF NOT EXISTS idx_contacts_ai_projection_analysis_id
  ON public.contacts (ai_projection_analysis_id);

CREATE INDEX IF NOT EXISTS idx_conversation_events_closure_id
  ON public.conversation_events (closure_id);

CREATE INDEX IF NOT EXISTS idx_conversation_events_from_queue_id
  ON public.conversation_events (from_queue_id);

CREATE INDEX IF NOT EXISTS idx_conversation_events_to_queue_id
  ON public.conversation_events (to_queue_id);

CREATE INDEX IF NOT EXISTS idx_conversation_tasks_migrated_from_reminder_id
  ON public.conversation_tasks (migrated_from_reminder_id);

CREATE INDEX IF NOT EXISTS idx_copilot_feedback_created_by
  ON public.copilot_feedback (created_by);

CREATE INDEX IF NOT EXISTS idx_crm_contact_links_linked_by
  ON public.crm_contact_links (linked_by);

CREATE INDEX IF NOT EXISTS idx_crm_sync_outbox_contact_id
  ON public.crm_sync_outbox (contact_id);

CREATE INDEX IF NOT EXISTS idx_department_invitations_used_by
  ON public.department_invitations (used_by);

CREATE INDEX IF NOT EXISTS idx_gmail_oauth_states_user_id
  ON public.gmail_oauth_states (user_id);

CREATE INDEX IF NOT EXISTS idx_instance_pauses_paused_by
  ON public.instance_pauses (paused_by);

CREATE INDEX IF NOT EXISTS idx_instance_pauses_resumed_by
  ON public.instance_pauses (resumed_by);

CREATE INDEX IF NOT EXISTS idx_message_pins_pinned_by
  ON public.message_pins (pinned_by);

CREATE INDEX IF NOT EXISTS idx_message_reports_resolved_by
  ON public.message_reports (resolved_by);

CREATE INDEX IF NOT EXISTS idx_messages_audio_meme_id
  ON public.messages (audio_meme_id);

CREATE INDEX IF NOT EXISTS idx_messages_channel_connection_id
  ON public.messages (channel_connection_id);

CREATE INDEX IF NOT EXISTS idx_messages_reply_to_id
  ON public.messages (reply_to_id);

CREATE INDEX IF NOT EXISTS idx_messages_whatsapp_group_id
  ON public.messages (whatsapp_group_id);

CREATE INDEX IF NOT EXISTS idx_multiplix_delivery_items_block_id
  ON public.multiplix_delivery_items (block_id);

CREATE INDEX IF NOT EXISTS idx_multiplix_delivery_items_recipient_id
  ON public.multiplix_delivery_items (recipient_id);

CREATE INDEX IF NOT EXISTS idx_multiplix_delivery_items_voice_asset_id
  ON public.multiplix_delivery_items (voice_asset_id);

CREATE INDEX IF NOT EXISTS idx_multiplix_dispatches_whatsapp_connection_id
  ON public.multiplix_dispatches (whatsapp_connection_id);

CREATE INDEX IF NOT EXISTS idx_multiplix_events_recipient_id
  ON public.multiplix_events (recipient_id);

CREATE INDEX IF NOT EXISTS idx_profiles_department_id
  ON public.profiles (department_id);

CREATE INDEX IF NOT EXISTS idx_queues_overflow_queue_id
  ON public.queues (overflow_queue_id);

CREATE INDEX IF NOT EXISTS idx_reminders_migrated_task_id
  ON public.reminders (migrated_task_id);

CREATE INDEX IF NOT EXISTS idx_sla_alert_events_queue_id
  ON public.sla_alert_events (queue_id);

CREATE INDEX IF NOT EXISTS idx_sla_alert_events_resolved_by
  ON public.sla_alert_events (resolved_by);

CREATE INDEX IF NOT EXISTS idx_sla_rules_agent_id
  ON public.sla_rules (agent_id);

CREATE INDEX IF NOT EXISTS idx_sla_rules_contact_id
  ON public.sla_rules (contact_id);

CREATE INDEX IF NOT EXISTS idx_sla_rules_queue_id
  ON public.sla_rules (queue_id);

CREATE INDEX IF NOT EXISTS idx_stickers_owner_id
  ON public.stickers (owner_id);

CREATE INDEX IF NOT EXISTS idx_talkx_blacklist_contact_id
  ON public.talkx_blacklist (contact_id);

CREATE INDEX IF NOT EXISTS idx_talkx_campaigns_cancelled_by
  ON public.talkx_campaigns (cancelled_by);

CREATE INDEX IF NOT EXISTS idx_talkx_campaigns_consent_confirmed_by
  ON public.talkx_campaigns (consent_confirmed_by);

CREATE INDEX IF NOT EXISTS idx_talkx_campaigns_launch_confirmed_by
  ON public.talkx_campaigns (launch_confirmed_by);

CREATE INDEX IF NOT EXISTS idx_talkx_campaigns_launched_by
  ON public.talkx_campaigns (launched_by);

CREATE INDEX IF NOT EXISTS idx_talkx_campaigns_owner
  ON public.talkx_campaigns (owner);

CREATE INDEX IF NOT EXISTS idx_talkx_campaigns_paused_by
  ON public.talkx_campaigns (paused_by);

CREATE INDEX IF NOT EXISTS idx_talkx_campaigns_recurrence_next
  ON public.talkx_campaigns (recurrence_next_campaign_id);

CREATE INDEX IF NOT EXISTS idx_talkx_campaigns_responsible_id
  ON public.talkx_campaigns (responsible_id);

CREATE INDEX IF NOT EXISTS idx_talkx_campaigns_template_version_id
  ON public.talkx_campaigns (template_version_id);

CREATE INDEX IF NOT EXISTS idx_talkx_links_created_by
  ON public.talkx_links (created_by);

CREATE INDEX IF NOT EXISTS idx_talkx_optout_keywords_created_by
  ON public.talkx_optout_keywords (created_by);

CREATE INDEX IF NOT EXISTS idx_talkx_segment_versions_created_by
  ON public.talkx_segment_versions (created_by);

CREATE INDEX IF NOT EXISTS idx_talkx_segments_published_by
  ON public.talkx_segments (published_by);

CREATE INDEX IF NOT EXISTS idx_talkx_templates_current_version_id
  ON public.talkx_templates (current_version_id);

CREATE INDEX IF NOT EXISTS idx_talkx_test_sends_campaign_id
  ON public.talkx_test_sends (campaign_id);

CREATE INDEX IF NOT EXISTS idx_talkx_test_sends_connection_id
  ON public.talkx_test_sends (connection_id);

CREATE INDEX IF NOT EXISTS idx_talkx_test_sends_template_id
  ON public.talkx_test_sends (template_id);

CREATE INDEX IF NOT EXISTS idx_team_conversations_department_id
  ON public.team_conversations (department_id);

CREATE INDEX IF NOT EXISTS idx_team_conversations_direct_member_a
  ON public.team_conversations (direct_member_a);

CREATE INDEX IF NOT EXISTS idx_team_conversations_direct_member_b
  ON public.team_conversations (direct_member_b);

CREATE INDEX IF NOT EXISTS idx_team_message_receipts_conversation_id
  ON public.team_message_receipts (conversation_id);

CREATE INDEX IF NOT EXISTS idx_team_messages_reply_to_id
  ON public.team_messages (reply_to_id);
