import { describe, expect, it } from 'vitest';
import type { TalkXCampaign } from '@/hooks/integrations/useTalkX';
import { duplicateTalkXCampaignDraft } from '@/components/talkx/talkxCampaignDraft';

const source: TalkXCampaign = {
  id: 'campaign-source',
  name: 'Reativação',
  message_template: 'Olá {{nome}}',
  variables_config: ['nome'],
  typing_delay_min: 1500,
  typing_delay_max: 4000,
  send_interval_min: 8000,
  send_interval_max: 20000,
  status: 'completed',
  total_recipients: 45,
  sent_count: 40,
  failed_count: 3,
  delivered_count: 35,
  outcome_unknown_count: 2,
  whatsapp_connection_id: 'connection-1',
  created_by: 'author-1',
  started_at: '2026-09-12T10:00:00.000Z',
  completed_at: '2026-09-12T11:00:00.000Z',
  created_at: '2026-09-12T09:00:00.000Z',
  updated_at: '2026-09-12T11:00:00.000Z',
  media_url: null,
  media_type: null,
  scheduled_at: '2026-09-15T10:00:00.000Z',
  schedule_timezone: 'America/Sao_Paulo',
  description: 'Mensagem de reativação',
  objective: 'reativacao',
  audience_source: 'segment',
  audience_filters: { lifecycle: 'inactive' },
  segment_id: 'segment-1',
  template_id: 'template-1',
  send_window_start: '08:00:00',
  send_window_end: '18:00:00',
  business_hours_only: true,
  speed_profile: 'moderate',
  paused_at: '2026-09-12T10:30:00.000Z',
  revision: 9,
};

describe('duplicateTalkXCampaignDraft', () => {
  it('copies configuration but never execution, schedule or authorship', () => {
    const duplicate = duplicateTalkXCampaignDraft(source, '2026-09-12T12:00:00.000Z');

    expect(duplicate).toMatchObject({
      id: '',
      name: 'Reativação (cópia)',
      status: 'draft',
      message_template: 'Olá {{nome}}',
      objective: 'reativacao',
      audience_source: 'segment',
      segment_id: 'segment-1',
      template_id: 'template-1',
      created_at: '2026-09-12T12:00:00.000Z',
      updated_at: '2026-09-12T12:00:00.000Z',
    });
    expect(duplicate.total_recipients).toBe(0);
    expect(duplicate.sent_count).toBe(0);
    expect(duplicate.failed_count).toBe(0);
    expect(duplicate.delivered_count).toBe(0);
    expect(duplicate.outcome_unknown_count).toBe(0);
    expect(duplicate.created_by).toBeNull();
    expect(duplicate.started_at).toBeNull();
    expect(duplicate.completed_at).toBeNull();
    expect(duplicate.paused_at).toBeNull();
    expect(duplicate.scheduled_at).toBeNull();
    expect(duplicate.revision).toBeUndefined();
  });
});
