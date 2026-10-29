import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
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
  it('tem um painel por aba; só o ativo é visível e os inativos ficam ocultos (hidden)', () => {
    render(<QuarantinePanel />);

    const tabs = screen.getAllByRole('tab');
    expect(tabs).toHaveLength(5);

    // Só o painel da aba ativa é acessível; os inativos continuam montados, porém ocultos.
    expect(screen.getAllByRole('tabpanel')).toHaveLength(1);
    expect(screen.getAllByRole('tabpanel', { hidden: true })).toHaveLength(5);

    const selected = screen.getByRole('tab', { selected: true });
    const panel = screen.getByRole('tabpanel');
    expect(panel).toHaveAttribute('aria-labelledby', selected.id);
    expect(panel).not.toHaveAttribute('hidden');

    for (const tab of tabs) {
      const controlled = document.getElementById(tab.getAttribute('aria-controls') as string);
      expect(controlled).not.toBeNull();
      expect(controlled).toHaveAttribute('role', 'tabpanel');
      if (tab === selected) {
        expect(controlled).not.toHaveAttribute('hidden');
      } else {
        expect(controlled).toHaveAttribute('hidden');
      }
    }
  });

  it('clicar em cada aba ativa o painel correspondente', () => {
    render(<QuarantinePanel />);

    for (const tab of screen.getAllByRole('tab')) {
      fireEvent.mouseDown(tab);
      expect(screen.getAllByRole('tabpanel')).toHaveLength(1);
      const panel = screen.getByRole('tabpanel');
      expect(panel).toHaveAttribute('aria-labelledby', tab.id);
      expect(panel).not.toHaveAttribute('hidden');
      expect(document.getElementById(tab.getAttribute('aria-controls') as string)).toBe(panel);
    }
  });
});
