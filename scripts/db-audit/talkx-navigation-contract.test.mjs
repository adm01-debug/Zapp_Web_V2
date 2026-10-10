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
  assert.match(view, /status === 'scheduled' \? 'scheduled' : 'running'/);
  assert.match(view, /writeRoutes\(\{ wizard: null, screen: \{ campaignId: id, screen:/);
  assert.match(view, /screenForStatus\(campaign\.status\)/);
  assert.match(view, /backToList\(\);/);
  assert.match(scheduled, /onStatusChange: \(campaign: TalkXCampaign\)/);
  assert.doesNotMatch(scheduled, /campaign\.status !== 'scheduled'\) onLaunch\(/);
});
