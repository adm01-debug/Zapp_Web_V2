import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ClientWalletView } from '../ClientWalletView';

const mockUseClientWallet = vi.fn();
vi.mock('@/hooks/business/useClientWallet', () => ({
  useClientWallet: (...args: unknown[]) => mockUseClientWallet(...args),
}));

function Wrapper({ children }: { children: React.ReactNode }) {
  return <MemoryRouter>{children}</MemoryRouter>;
}

describe('ClientWalletView — acessibilidade: aria-label nos seletores, interruptor e excluir', () => {
  const base = () => ({
    rules: [{ id: 'r1', name: 'Regra A', agent_id: 'a1', whatsapp_connection_id: '', priority: 1, is_active: true, agent: { name: 'Vendedor 1' }, connection: null }],
    agents: [{ id: 'a1', name: 'Vendedor 1' }],
    connections: [{ id: 'c1', name: 'Conexão 1', phone_number: '+5511999999999' }],
    loading: false,
    isAddDialogOpen: false,
    newRule: { name: '', agent_id: '', whatsapp_connection_id: '', priority: 0 },
    setIsAddDialogOpen: vi.fn(),
    setNewRule: vi.fn(),
    handleToggleActive: vi.fn(),
    handleDeleteRule: vi.fn(),
    handleAddRule: vi.fn(),
  });

  it('seletor de vendedor tem aria-label', () => {
    const w = base();
    w.isAddDialogOpen = true;
    mockUseClientWallet.mockReturnValue(w);
    render(<ClientWalletView />, { wrapper: Wrapper });
    expect(screen.getByRole('combobox', { name: 'Selecione um vendedor' })).toBeInTheDocument();
  });

  it('seletor de conexão WhatsApp tem aria-label', () => {
    const w = base();
    w.isAddDialogOpen = true;
    mockUseClientWallet.mockReturnValue(w);
    render(<ClientWalletView />, { wrapper: Wrapper });
    expect(screen.getByRole('combobox', { name: 'Selecione a conexão WhatsApp' })).toBeInTheDocument();
  });

  it('interruptor de ativar tem aria-label', () => {
    mockUseClientWallet.mockReturnValue(base());
    render(<ClientWalletView />, { wrapper: Wrapper });
    expect(screen.getByRole('switch', { name: 'Ativar regra' })).toBeInTheDocument();
  });

  it('botão excluir tem aria-label', () => {
    mockUseClientWallet.mockReturnValue(base());
    render(<ClientWalletView />, { wrapper: Wrapper });
    expect(screen.getByRole('button', { name: 'Excluir regra' })).toBeInTheDocument();
  });
});