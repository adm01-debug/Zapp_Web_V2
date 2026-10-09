import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { PasswordResetRequestsPanel } from '../PasswordResetRequestsPanel';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        order: vi.fn(() => Promise.resolve({ data: [], error: null })),
      })),
    })),
    functions: { invoke: vi.fn() },
  },
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

describe('PasswordResetRequestsPanel — abas de filtro', () => {
  it('todo aria-controls das abas aponta para um painel que existe', async () => {
    render(<PasswordResetRequestsPanel />);
    await waitFor(() => expect(screen.queryByText('Carregando...')).not.toBeInTheDocument());

    const tabs = screen.getAllByRole('tab');
    expect(tabs).toHaveLength(2);
    for (const tab of tabs) {
      const controlled = tab.getAttribute('aria-controls');
      expect(controlled).toBeTruthy();
      expect(document.getElementById(controlled as string)).not.toBeNull();
    }
  });

  it('o painel da aba ativa é visível e rotulado pela aba', async () => {
    render(<PasswordResetRequestsPanel />);
    await waitFor(() => expect(screen.queryByText('Carregando...')).not.toBeInTheDocument());

    const panels = screen.getAllByRole('tabpanel');
    const activePanel = panels.find(p => p.getAttribute('aria-labelledby') === screen.getByRole('tab', { selected: true }).id);
    expect(activePanel).toBeTruthy();
    expect(activePanel!).toHaveAttribute('aria-labelledby', screen.getByRole('tab', { selected: true }).id);
    expect(activePanel!).toContainElement(screen.getByPlaceholderText('Buscar por email...'));
  });

  it('o filtro troca de aba pelo teclado e o aria-controls continua válido', async () => {
    render(<PasswordResetRequestsPanel />);
    await waitFor(() => expect(screen.queryByText('Carregando...')).not.toBeInTheDocument());

    const [pendentes, todas] = screen.getAllByRole('tab');
    pendentes.focus();
    fireEvent.keyDown(pendentes, { key: 'ArrowRight' });

    await waitFor(() => expect(todas).toHaveAttribute('aria-selected', 'true'));
    expect(document.getElementById(todas.getAttribute('aria-controls') as string)).not.toBeNull();
    const panels = screen.getAllByRole('tabpanel');
    const activePanel = panels.find(p => p.getAttribute('aria-labelledby') === todas.id);
    expect(activePanel).toBeTruthy();
    expect(activePanel!).toHaveAttribute('aria-labelledby', todas.id);
  });
});
