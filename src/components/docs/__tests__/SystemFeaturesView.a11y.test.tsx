import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

// Cartão t_90dcdcc8, item 3: o cabeçalho de seção clicável (expandir/recolher)
// era uma Card/div sem papel nem operação por teclado. Padrão copiado do
// PresetCard.tsx (ThemeCustomizer): role + tabIndex + handler de Enter/Espaço.

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
