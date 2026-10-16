import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const raiz = resolve(__dirname, '..', '..');
const ler = (p: string) => readFileSync(resolve(raiz, p), 'utf8');

// Contrato de que "Campanhas Clássicas" deixou de ser EXPOSTA no produto: o Talk X é o sistema de
// Campanhas ativo e o módulo clássico não tem mais rota, menu, atalho de mobile, prefetch nem
// reexportação de hook. Cada asserção falha na árvore da base (havia tudo isso) e passa depois da
// retirada — é a prova de que a view não volta por acidente para o menu nem para o roteador, que é
// o que o inventário (FEATURE_REGISTRY.md) e o COMPLETE_SYSTEM_FEATURES.md passaram a descrever.

describe('Campanhas Clássicas não é exposta no app', () => {
  it('o menu de navegação não tem mais "Campanhas Clássicas"', () => {
    const nav = ler('src/services/navigation.service.ts');
    expect(nav).not.toMatch(/Campanhas Clássicas/);
    expect(nav).not.toMatch(/id: 'campaigns'/);
  });

  it('não há rota nem registro lazy do componente de Clássicas', () => {
    const router = ler('src/pages/ViewRouter.tsx');
    const lazy = ler('src/pages/lazyViews.ts');
    expect(router).not.toMatch(/CampaignsView/);
    expect(router).not.toMatch(/'campaigns'/);
    expect(lazy).not.toMatch(/CampaignsView/);
    expect(lazy).not.toMatch(/components\/campaigns/);
  });

  it('não há atalho de mobile nem prefetch apontando para a view retirada', () => {
    expect(ler('src/components/mobile/MobileHeader.tsx')).not.toMatch(/campaigns: 'Campanhas'/);
    expect(ler('src/components/mobile/MobileShell.tsx')).not.toMatch(/onNewCampaign/);
    expect(ler('src/hooks/ui/usePrefetchOnHover.ts')).not.toMatch(/campaigns: \[\['campaigns'\]\]/);
  });

  it('o hook do módulo clássico não é mais reexportado pelo barrel de communication', () => {
    expect(ler('src/hooks/communication/index.ts')).not.toMatch(/useCampaigns/);
  });

  it('COMPLETE_SYSTEM_FEATURES.md não anuncia a rota nem o CRUD retirados', () => {
    const doc = ler('docs/COMPLETE_SYSTEM_FEATURES.md');
    expect(doc).not.toMatch(/\?view=campaigns/);
    expect(doc).not.toMatch(/CRUD de campanhas/);
  });

  it('FEATURE_REGISTRY.md lista 52 views e não lista a view campaigns', () => {
    const registro = ler('FEATURE_REGISTRY.md');
    expect(registro).toMatch(/52 views/);
    expect(registro).not.toMatch(/\| `campaigns` \|/);
  });
});
