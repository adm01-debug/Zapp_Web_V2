import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { axe } from 'vitest-axe';

// Cartão t_90dcdcc8, item 3 [refazer 1]: o cabeçalho de seção clicável (expandir/recolher)
// era uma Card/div sem papel nem operação por teclado. Padrão copiado do
// PresetCard.tsx (ThemeCustomizer): role + tabIndex + handler de Enter/Espaço.
//
// O Card é o REAL (`@/components/ui/card` não é dublado) — o axe enxerga o
// markup de verdade. Só configuração é dublada.

vi.mock('@/config/service_worker', () => ({
  get SERVICE_WORKER_ENABLED() { return false; },
  get PUSH_NOTIFICATIONS_ENABLED() { return false; },
}));

import { SystemFeaturesView } from '@/components/docs/SystemFeaturesView';

/** Cabeçalhos de seção: role="button" cujo nome começa com "<id>. <título>". */
function cardsDeSecao() {
  return screen
    .getAllByRole('button')
    .filter((el) => /^\d+\.\s/.test(el.textContent ?? ''));
}

/** Impactos sérios segundo o aceite (mesma régua da skill de a11y do repo). */
const SERIOUS = new Set(['critical', 'serious']);
const ids = (violations: { id: string }[]) => violations.map((v) => v.id).sort();

describe('SystemFeaturesView — cabeçalho de seção acessível (t_90dcdcc8)', () => {
  it('o cabeçalho de seção é botão com tabIndex e aria-expanded', () => {
    render(<SystemFeaturesView />);
    const cards = cardsDeSecao();
    expect(cards.length).toBeGreaterThan(0);
    expect(cards[0]).toHaveAttribute('tabindex', '0');
    expect(cards[0]).toHaveAttribute('aria-expanded', 'false');
  });

  it('Enter e Espaço expandem e recolhem a seção', () => {
    render(<SystemFeaturesView />);
    const card = cardsDeSecao()[0];

    fireEvent.keyDown(card, { key: 'Enter' });
    expect(card).toHaveAttribute('aria-expanded', 'true');

    fireEvent.keyDown(card, { key: ' ' });
    expect(card).toHaveAttribute('aria-expanded', 'false');
  });
});

describe('SystemFeaturesView — axe: sem violação séria (t_90dcdcc8)', () => {
  it('a lista de seções não tem violações critical/serious', async () => {
    render(<SystemFeaturesView />);

    const results = await axe(document.body);
    expect({
      ...results,
      violations: results.violations.filter((v) => SERIOUS.has(v.impact ?? '')),
    }).toHaveNoViolations();
  });

  /**
   * Controle: prova que o matcher acusa violação REAL. Um `<button>` só de ícone
   * sem nome viola `button-name` (critical) — é exatamente o defeito corrigido.
   * Se o axe nunca rodasse, o controle (e o teste acima) deixaria de reprovar.
   */
  it('controle: um botão só de ícone sem nome CONTÉM button-name', async () => {
    render(
      <button type="button">
        <span data-testid="icone" />
      </button>,
    );
    const results = await axe(document.body);

    expect(ids(results.violations)).toContain('button-name');
  });
});
