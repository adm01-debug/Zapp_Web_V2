import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const raiz = resolve(__dirname, '..', '..');
const ler = (p: string) => readFileSync(resolve(raiz, p), 'utf8');

// Contrato de que "Campanhas Clássicas" deixou de ser EXPOSTA no produto (o Talk X é o sistema
// de Campanhas ativo). Cada asserção falha na base (havia rota, entrada de menu, atalho de
// mobile, prefetch e reexportação do hook) e passa depois da remoção — é a prova de que a view
// não volta por acidente para o menu nem para o roteador.

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
    expect(lazy).not.toMatch(/CampaignsView/);
    expect(lazy).not.toMatch(/components\/campaigns/);
  });

  it('não há atalho de mobile nem prefetch apontando para a view removida', () => {
    expect(ler('src/components/mobile/MobileHeader.tsx')).not.toMatch(/campaigns: 'Campanhas'/);
    expect(ler('src/components/mobile/MobileShell.tsx')).not.toMatch(/onNewCampaign/);
    expect(ler('src/hooks/ui/usePrefetchOnHover.ts')).not.toMatch(/campaigns: \[\['campaigns'\]\]/);
  });

  it('o hook do módulo clássico não é mais reexportado pelo barrel de communication', () => {
    expect(ler('src/hooks/communication/index.ts')).not.toMatch(/useCampaigns/);
  });

  it('COMPLETE_SYSTEM_FEATURES não anuncia a rota nem as funcionalidades removidas', () => {
    const doc = ler('docs/COMPLETE_SYSTEM_FEATURES.md');
    expect(doc).not.toMatch(/\?view=campaigns/);
    expect(doc).not.toMatch(/CRUD de campanhas/);
  });
});
