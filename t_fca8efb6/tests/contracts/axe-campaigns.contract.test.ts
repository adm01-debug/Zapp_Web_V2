import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const raiz = resolve(__dirname, '..', '..');
const ler = (p: string) => readFileSync(resolve(raiz, p), 'utf8');

// Varredura axe (4.13) da view campaigns (rotulo "Campanhas Classicas"): button-name [critical]
// nos comboboxes — nem o filtro de status da tela nem os selects do CampaignCreateDialog
// tinham nome acessivel (os <Label> do dialog nao estavam associados ao controle).

describe('axe — view campaigns: comboboxes com nome acessivel', () => {
  it('o filtro de status da CampaignsView tem aria-label', () => {
    const v = ler('src/components/campaigns/CampaignsView.tsx');
    const m = v.match(/<SelectTrigger[^>]*className="w-40"[^>]*>/)?.[0] ?? '';
    expect(m).not.toBe('');
    expect(m).toMatch(/aria-label="Filtrar por status"/);
  });

  it('os selects do CampaignCreateDialog tem aria-label', () => {
    const v = ler('src/components/campaigns/CampaignCreateDialog.tsx');
    const sem = [...v.matchAll(/<SelectTrigger>/g)].length;
    expect(sem).toBe(0);
    expect(v).toMatch(/aria-label="Tipo de mensagem"/);
  });
});
