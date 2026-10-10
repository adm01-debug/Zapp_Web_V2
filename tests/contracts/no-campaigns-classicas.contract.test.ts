import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const raiz = resolve(__dirname, '..', '..');
const ler = (p: string) => readFileSync(resolve(raiz, p), 'utf8');

// Contrato da remoção de "Campanhas Clássicas" (o Talk X é o sistema de Campanhas ativo).
// Este teste falha na base (ainda havia CampaignsView e a entrada de menu) e passa depois
// da remoção — é a prova de que o módulo não voltou por acidente.

describe('Campanhas Clássicas não existe mais no app', () => {
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
});
