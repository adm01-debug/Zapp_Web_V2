import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { QuarantinePanel } from '../QuarantinePanel';
import type { QuarantineFilter } from '@/hooks/integrations/useQuarantineMedia';

vi.mock('@/hooks/integrations/useQuarantineMedia', () => ({
  useQuarantineMedia: () => {
    const [filter, setFilter] = useState<QuarantineFilter>('pending');
    return {
      records: [],
      total: 0,
      loading: false,
      error: null,
      filter,
      setFilter,
      refresh: vi.fn(),
      decide: vi.fn(),
      pendingCount: 0,
      notConfigured: false,
    };
  },
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

describe('QuarantinePanel — abas de filtro', () => {
  it('todo aria-controls das abas aponta para um painel que existe', () => {
    render(<QuarantinePanel />);

    const tabs = screen.getAllByRole('tab');
    expect(tabs).toHaveLength(5);
    for (const tab of tabs) {
      const controlled = tab.getAttribute('aria-controls');
      expect(controlled).toBeTruthy();
      expect(document.getElementById(controlled as string)).not.toBeNull();
    }
  });

  it('o painel da aba ativa contém a lista e é rotulado pela aba', () => {
    render(<QuarantinePanel />);

    const panels = screen.getAllByRole('tabpanel');
    const activePanel = panels.find(p => p.getAttribute('aria-labelledby') === screen.getByRole('tab', { selected: true }).id);
    expect(activePanel).toBeTruthy();
    expect(activePanel!).toHaveAttribute('aria-labelledby', screen.getByRole('tab', { selected: true }).id);
    expect(activePanel!).toHaveTextContent(/nenhum|vazi|sem /i);
  });

  it('o filtro troca de aba pelo teclado e o aria-controls continua válido', async () => {
    render(<QuarantinePanel />);

    const tabs = screen.getAllByRole('tab');
    tabs[0].focus();
    fireEvent.keyDown(tabs[0], { key: 'ArrowRight' });

    await waitFor(() => expect(tabs[1]).toHaveAttribute('aria-selected', 'true'));
    expect(document.getElementById(tabs[1].getAttribute('aria-controls') as string)).not.toBeNull();
    const panels = screen.getAllByRole('tabpanel');
    const activePanel = panels.find(p => p.getAttribute('aria-labelledby') === tabs[1].id);
    expect(activePanel).toBeTruthy();
    expect(activePanel!).toHaveAttribute('aria-labelledby', tabs[1].id);
  });
});
