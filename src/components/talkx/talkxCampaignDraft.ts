import type { TalkXCampaign } from '@/hooks/integrations/useTalkX';

/**
 * A duplicate starts a new draft. Configuration may be reused, but delivery
 * progress, scheduling and authorship belong exclusively to the source record.
 */
export function duplicateTalkXCampaignDraft(source: TalkXCampaign, now = new Date().toISOString()): TalkXCampaign {
  return {
    ...source,
    id: '',
    name: `${source.name} (cópia)`,
    status: 'draft',
    total_recipients: 0,
    sent_count: 0,
    failed_count: 0,
    delivered_count: 0,
    outcome_unknown_count: 0,
    created_by: null,
    started_at: null,
    completed_at: null,
    paused_at: null,
    scheduled_at: null,
    revision: undefined,
    created_at: now,
    updated_at: now,
  };
}
