import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { axe } from 'vitest-axe';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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

function base() {
  return {
    rules: [
      { id: 'r1', name: 'Regra A', agent_id: 'a1', whatsapp_connection_id: '', priority: 1, is_active: true, agent: { name: 'Vendedor 1' }, connection: null },
      { id: 'r2', name: 'Regra B', agent_id: 'a1', whatsapp_connection_id: 'c1', priority: 2, is_active: false, agent: { name: 'Vendedor 1' }, connection: { id: 'c1', name: 'Conexão 1', phone_number: '+5511999999999' } },
    ],
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
  };
}

describe('ClientWalletView — acessibilidade: aria-label nos seletores, interruptor e excluir', () => {
  afterEach(() => { vi.clearAllMocks(); });

  it('seletor de vendedor tem aria-label', () => {
    const w = base();
    w.isAddDialogOpen = true;
    mockUseClientWallet.mockReturnValue(w);
    render(<ClientWalletView />, { wrapper: Wrapper });
    expect(screen.getByRole('combobox', { name: 'Vendedor' })).toBeInTheDocument();
  });

  it('seletor de conexão WhatsApp tem aria-label com texto visível', () => {
    const w = base();
    w.isAddDialogOpen = true;
    mockUseClientWallet.mockReturnValue(w);
    render(<ClientWalletView />, { wrapper: Wrapper });
    expect(screen.getByRole('combobox', { name: 'Conexão WhatsApp (opcional)' })).toBeInTheDocument();
  });

  it('interruptor de ativar tem aria-label com nome da regra e é único por linha', () => {
    const w = base();
    w.isAddDialogOpen = false;
    mockUseClientWallet.mockReturnValue(w);
    render(<ClientWalletView />, { wrapper: Wrapper });
    expect(screen.getByRole('switch', { name: 'Ativar regra Regra A' })).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'Ativar regra Regra B' })).toBeInTheDocument();
  });

  it('botão excluir tem aria-label com nome da regra e é único por linha', () => {
    const w = base();
    w.isAddDialogOpen = false;
    mockUseClientWallet.mockReturnValue(w);
    render(<ClientWalletView />, { wrapper: Wrapper });
    expect(screen.getByRole('button', { name: 'Excluir regra Regra A' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Excluir regra Regra B' })).toBeInTheDocument();
  });

  it('não viola regras de acessibilidade na tabela de regras', async () => {
    mockUseClientWallet.mockReturnValue(base());
    const { container } = render(<ClientWalletView />, { wrapper: Wrapper });
    const table = container.querySelector('table');
    expect(table).toBeInTheDocument();
    const results = await axe(table!);
    expect(results).toHaveNoViolations();
  });

  it('não viola regras de acessibilidade no diálogo aberto', async () => {
    const w = base();
    w.isAddDialogOpen = true;
    mockUseClientWallet.mockReturnValue(w);
    render(<ClientWalletView />, { wrapper: Wrapper });
    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeInTheDocument();
    const results = await axe(dialog);
    expect(results).toHaveNoViolations();
  });
});
