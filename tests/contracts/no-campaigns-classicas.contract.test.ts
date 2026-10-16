import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const raiz = resolve(__dirname, '..', '..');
const ler = (p: string) => readFileSync(resolve(raiz, p), 'utf8');

describe('Campanhas Clássicas não existe mais no app', () => {
  it('o menu de navegação não tem mais a entrada legada', () => {
    const nav = ler('src/services/navigation.service.ts');
    expect(nav).not.toMatch(/Campanhas Clássicas/);
    expect(nav).not.toMatch(/id: 'campaigns'/);
    expect(ler('FEATURE_REGISTRY.md')).not.toMatch(/`campaigns`|CampaignsView/);
  });

  it('não há rota, prefetch nem FAB móvel apontando para campaigns', () => {
    expect(ler('src/pages/ViewRouter.tsx')).not.toMatch(/['"]campaigns['"]\s*:/);
    expect(ler('src/pages/lazyViews.ts')).not.toMatch(/CampaignsView|components\/campaigns/);
    expect(ler('src/hooks/ui/usePrefetchOnHover.ts')).not.toMatch(/campaigns:\s*\[\['campaigns'\]\]/);
    expect(ler('src/hooks/communication/index.ts')).not.toMatch(/useCampaigns/);
    expect(ler('src/components/mobile/MobileShell.tsx')).not.toMatch(/setCurrentView\(['"]campaigns['"]\)/);
  });
});