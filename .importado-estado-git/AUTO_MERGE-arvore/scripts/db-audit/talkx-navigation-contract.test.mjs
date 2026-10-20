import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [view, wizard, scheduled] = await Promise.all([
  readFile(new URL('../../src/components/talkx/TalkXView.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../../src/components/talkx/TalkXCampaignWizard.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../../src/components/talkx/TalkXCampaignScheduled.tsx', import.meta.url), 'utf8'),
]);

test('Talk X routes scheduled, sending, and cancelled campaigns to distinct views', () => {
  assert.match(wizard, /onLaunched\?: \(campaignId: string, status: 'scheduled' \| 'sending'\)/);
  assert.doesNotMatch(wizard, /onLaunched\?\.\(id\); onClose\(\)/);
  assert.match(view, /if \(status === 'scheduled'\) \{[\s\S]*setTopView\('scheduled'\)/);
  assert.match(view, /if \(campaign\.status === 'sending'\) \{[\s\S]*setTopView\('monitor'\)/);
  assert.match(view, /backToList\(\);/);
  assert.match(scheduled, /onStatusChange: \(campaign: TalkXCampaign\)/);
  assert.doesNotMatch(scheduled, /campaign\.status !== 'scheduled'\) onLaunch\(/);
});
