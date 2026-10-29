import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { PasswordResetRequestsPanel } from '../PasswordResetRequestsPanel';

const REQUESTS = [
  {
    id: '1', user_id: 'u1', email: 'pendente@ex.com', reason: null, status: 'pending',
    reviewed_by: null, reviewed_at: null, rejection_reason: null,
    ip_address: null, user_agent: null, created_at: '2026-10-01T10:00:00.000Z',
  },
  {
    id: '2', user_id: 'u2', email: 'aprovada@ex.com', reason: null, status: 'approved',
    reviewed_by: null, reviewed_at: null, rejection_reason: null,
    ip_address: null, user_agent: null, created_at: '2026-10-02T10:00:00.000Z',
  },
];

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        order: vi.fn(() => Promise.resolve({ data: REQUESTS, error: null })),
      })),
    })),
    functions: { invoke: vi.fn() },
  },
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

describe('PasswordResetRequestsPanel — abas de filtro', () => {
  it('tem um painel por aba; só o ativo é visível e o inativo fica oculto (hidden)', async () => {
    render(<PasswordResetRequestsPanel />);
    await waitFor(() => expect(screen.queryByText('Carregando...')).not.toBeInTheDocument());

    const tabs = screen.getAllByRole('tab');
    expect(tabs).toHaveLength(2);

    // Só o painel da aba ativa é acessível; o inativo continua montado, porém oculto.
    expect(screen.getAllByRole('tabpanel')).toHaveLength(1);
    expect(screen.getAllByRole('tabpanel', { hidden: true })).toHaveLength(2);

    const selected = screen.getByRole('tab', { selected: true });
    const panel = screen.getByRole('tabpanel');
    expect(panel).toHaveAttribute('aria-labelledby', selected.id);
    expect(panel).not.toHaveAttribute('hidden');

    // Todo gatilho aponta (aria-controls) para um painel; o do inativo existe mas está oculto.
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

  it('clicar em cada aba ativa o painel correspondente', async () => {
    render(<PasswordResetRequestsPanel />);
    await waitFor(() => expect(screen.queryByText('Carregando...')).not.toBeInTheDocument());

    for (const tab of screen.getAllByRole('tab')) {
      fireEvent.mouseDown(tab);
      expect(screen.getAllByRole('tabpanel')).toHaveLength(1);
      const panel = screen.getByRole('tabpanel');
      expect(panel).toHaveAttribute('aria-labelledby', tab.id);
      expect(panel).not.toHaveAttribute('hidden');
      expect(document.getElementById(tab.getAttribute('aria-controls') as string)).toBe(panel);
    }
  });

  it('cada painel aplica o seu próprio filtro (Pendentes x Todas)', async () => {
    render(<PasswordResetRequestsPanel />);
    await waitFor(() => expect(screen.queryByText('Carregando...')).not.toBeInTheDocument());

    // Aba inicial: Pendentes -> mostra só a pendente.
    expect(screen.getByText('pendente@ex.com')).toBeInTheDocument();
    expect(screen.queryByText('aprovada@ex.com')).not.toBeInTheDocument();

    fireEvent.mouseDown(screen.getByRole('tab', { name: /Todas/ }));

    // Aba Todas -> mostra as duas.
    expect(screen.getByText('pendente@ex.com')).toBeInTheDocument();
    expect(screen.getByText('aprovada@ex.com')).toBeInTheDocument();
  });
});
