import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Contrato dos LANDMARKS DO SHELL (regra `region` do axe-core).
 *
 * Medição que originou a correção (Chromium real, app logado, 4 estados de tema — a mesma em todas
 * as telas, porque a origem é o shell e não a tela):
 *
 *   regra `region` — 5 nós por estado, estáveis nos 4 estados e nas 5 telas:
 *     [1] <span class="text-sm font-semibold">⚠️ Conexão "PRINCIPAL" está desconectada!</span>
 *     [2] <span class="text-xs hidden sm:inline">Mensagens não serão enviadas/recebidas.</span>
 *         -> faixa de conexões (src/components/alerts/EvolutionDisconnectBanner.tsx), renderizada
 *            como irmã do <AppShell> em src/pages/Index.tsx, sem papel de landmark
 *     [3] <div class="relative p-8 text-center"> > div:nth-child(2)
 *     [4] <div class="grid grid-cols-3 gap-3 mb-8">
 *     [5] <p class="text-xs text-muted-foreground mt-4">Você pode acessar o tour novamente...</p>
 *         -> modal de boas-vindas (src/components/onboarding/WelcomeModal.tsx) sem role="dialog"
 *
 * Depois da correção: `region` = 0 nas 5 telas. Evidência crua:
 *   ~/evidencias/axe-region/antes/*.json  e  ~/evidencias/axe-region/depois/*.json
 *
 * O `color-contrast` do próprio texto da faixa (branco sobre --destructive, 3,78 claro / 3,00
 * escuro) NÃO entra aqui: é par do token e já está registrado como não corrigido no contrato
 * axe-inbox (fechar exigiria mexer em --destructive, vetado pelo dono do produto).
 */
const raiz = resolve(__dirname, '../..');
const ler = (p: string) => readFileSync(resolve(raiz, p), 'utf8');

describe('contrato: landmarks do shell (regra region do axe)', () => {
  const faixa = ler('src/components/alerts/EvolutionDisconnectBanner.tsx');
  const modal = ler('src/components/onboarding/WelcomeModal.tsx');
  const index = ler('src/pages/Index.tsx');

  it('a faixa de conexões é um landmark nomeado e anuncia o aviso', () => {
    expect(faixa).toMatch(/role="region"/);
    expect(faixa).toMatch(/aria-label="Status das conexões do WhatsApp"/);
    expect(faixa).toMatch(/aria-live="polite"/);
  });

  it('o modal de boas-vindas é UM dialog modal nomeado pelo próprio título', () => {
    expect(modal).toMatch(/role="dialog"/);
    expect(modal).toMatch(/aria-modal="true"/);
    expect(modal).toMatch(/aria-labelledby="welcome-modal-title"/);
    // o alvo do aria-labelledby tem de existir de fato no mesmo arquivo
    expect(modal).toMatch(/id="welcome-modal-title"/);
    // UM dialogo so: o overlay era um segundo role=dialog, o que aninhava dois dialogos e ainda
    // fazia o primeiro match de `[role="dialog"]` ser o elemento errado (foi falha de CI real).
    expect((modal.match(/role="dialog"/g) ?? []).length).toBe(1);
    expect(modal).not.toMatch(/aria-label="Boas-vindas"/);
  });

  it('os dois overlays continuam fora do <AppShell> (são irmãos, e é isso que exige o landmark)', () => {
    expect(index).toMatch(/<EvolutionDisconnectBanner \/>/);
    expect(index).toMatch(/<WelcomeModal/);
  });

  it('o menu principal segue <nav> (papel navigation não é permitido em aside)', () => {
    const sidebar = ler('src/components/layout/Sidebar.tsx');
    expect(sidebar).toMatch(/<nav id="main-navigation" aria-label="Menu de navegação principal"/);
    expect(sidebar).not.toMatch(/<aside id="main-navigation"/);
  });
});
