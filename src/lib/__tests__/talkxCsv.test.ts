import { describe, expect, it } from 'vitest';
import type { TalkXCampaign } from '@/hooks/integrations/useTalkX';
import { buildTalkXCampaignCsvBlob } from '../talkxCsv';

async function csvLines(campaign: Partial<TalkXCampaign>): Promise<string[]> {
  const blob = buildTalkXCampaignCsvBlob(
    { name: 'Campanha', schedule_timezone: 'America/Sao_Paulo', ...campaign } as TalkXCampaign,
    null,
    [],
  );
  return (await blob.text()).replace(/^\uFEFF/, '').split('\r\n');
}

describe('buildTalkXCampaignCsvBlob — guard contra fórmula', () => {
  it('célula com fórmula e ";" recebe o prefixo e continua entre aspas (não parte a coluna)', async () => {
    const lines = await csvLines({ name: '=a;b' });
    expect(lines).toContain(`Nome;"'=a;b"`);
  });

  it('célula com fórmula e quebra de linha recebe o prefixo e fica numa célula só', async () => {
    const lines = await csvLines({ name: 'ok', objective: '-x\ny' });
    expect(lines).toContain(`Objetivo;"'-x\ny"`);
  });

  it('célula com fórmula simples só recebe o prefixo, sem aspas', async () => {
    const lines = await csvLines({ name: '+1' });
    expect(lines).toContain(`Nome;'+1`);
  });
});
