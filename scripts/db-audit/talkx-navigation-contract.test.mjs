import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [view, wizard, scheduled, route] = await Promise.all([
  readFile(new URL('../../src/components/talkx/TalkXView.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../../src/components/talkx/TalkXCampaignWizard.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../../src/components/talkx/TalkXCampaignScheduled.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../../src/components/talkx/talkxRoute.ts', import.meta.url), 'utf8'),
]);

test('Talk X routes scheduled, sending, and cancelled campaigns to distinct views', () => {
  assert.match(wizard, /onLaunched\?: \(campaignId: string, status: 'scheduled' \| 'sending'\)/);
  assert.doesNotMatch(wizard, /onLaunched\?\.\(id\); onClose\(\)/);

  // X143: a tela da campanha aberta sai da situação dela (screenForStatus) e o
  // endereço a registra em ?campaign=/?screen= — não há mais topView em useState.
  assert.match(view, /screenForStatus\(/);
  assert.doesNotMatch(view, /setTopView/);
  assert.match(view, /screen: \{ campaignId/);
  // Lançamento imediato abre a tela 12 (Em Andamento); a agendada abre a 10.
  assert.match(view, /'scheduled' : 'running'/);
  assert.match(view, /backToList\(\);/);

  // Situação → tela: agendada é a 10, em andamento a 12, concluída/cancelada o relatório.
  assert.match(route, /case 'scheduled':[\s\S]*?return 'scheduled'/);
  assert.match(route, /case 'cancelled':[\s\S]*?return 'report'/);

  assert.match(scheduled, /onStatusChange: \(campaign: TalkXCampaign\)/);
  assert.doesNotMatch(scheduled, /campaign\.status !== 'scheduled'\) onLaunch\(/);
});
