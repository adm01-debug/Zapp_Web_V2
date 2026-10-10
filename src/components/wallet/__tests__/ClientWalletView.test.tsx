import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { axe } from 'vitest-axe';
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
    rules: [
      { id: 'r1', name: 'Regra A', agent_id: 'a1', whatsapp_connection_id: '', priority: 1, is_active: true, agent: { name: 'Vendedor 1' }, connection: null },
      { id: 'r2', name: 'Regra B', agent_id: 'a1', whatsapp_connection_id: 'c1', priority: 2, is_active: false, agent: { name: 'Vendedor 1' }, connection: { name: 'Conexão 1' } },
    ],
    agents: [{ id: 'a1', name: 'Vendedor 1' }],
    connections: [{ id: 'c1', name: 'Conexão 1', phone_number: '+551****9999' }],
    loading: false,
    isAddDialogOpen: false,
    newRule: { name: '', agent_id: '', whatsapp_connection_id: '', priority: 0 },
    setIsAddDialogOpen: vi.fn(),
    setNewRule: vi.fn(),
    handleToggleActive: vi.fn(),
    handleDeleteRule: vi.fn(),
    handleAddRule: vi.fn(),
  });

  it('seletor de vendedor tem nome "Vendedor"', () => {
    const w = base();
    w.isAddDialogOpen = true;
    mockUseClientWallet.mockReturnValue(w);
    render(<ClientWalletView />, { wrapper: Wrapper });
    expect(screen.getByRole('combobox', { name: 'Vendedor' })).toBeInTheDocument();
  });

  it('seletor de conexão começa com o texto visível', () => {
    const w = base();
    w.isAddDialogOpen = true;
    mockUseClientWallet.mockReturnValue(w);
    render(<ClientWalletView />, { wrapper: Wrapper });
    expect(screen.getByRole('combobox', { name: 'Conexão WhatsApp (opcional)' })).toBeInTheDocument();
  });

  it('cada interruptor leva o nome da própria regra', () => {
    mockUseClientWallet.mockReturnValue(base());
    render(<ClientWalletView />, { wrapper: Wrapper });
    expect(screen.getByRole('switch', { name: 'Ativar regra Regra A' })).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'Ativar regra Regra B' })).toBeInTheDocument();
  });

  it('cada botão excluir leva o nome da própria regra', () => {
    mockUseClientWallet.mockReturnValue(base());
    render(<ClientWalletView />, { wrapper: Wrapper });
    expect(screen.getByRole('button', { name: 'Excluir regra Regra A' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Excluir regra Regra B' })).toBeInTheDocument();
  });

  it('axe: zero violações de nome na tabela de regras', async () => {
    mockUseClientWallet.mockReturnValue(base());
    const { container } = render(<ClientWalletView />, { wrapper: Wrapper });
    const results = await axe(container, {
      rules: { 'color-contrast': { enabled: false } },
    });
    const semNome = results.violations.filter((v) =>
      ['button-name', 'aria-input-field-name', 'aria-toggle-field-name', 'aria-command-name'].includes(v.id),
    );
    expect(semNome).toEqual([]);
  });

  it('axe: zero violações de nome com o diálogo aberto', async () => {
    const w = base();
    w.isAddDialogOpen = true;
    mockUseClientWallet.mockReturnValue(w);
    const { container } = render(<ClientWalletView />, { wrapper: Wrapper });
    const results = await axe(container, {
      rules: { 'color-contrast': { enabled: false } },
    });
    const semNome = results.violations.filter((v) =>
      ['button-name', 'aria-input-field-name', 'aria-toggle-field-name', 'aria-command-name'].includes(v.id),
    );
    expect(semNome).toEqual([]);
  });
});
