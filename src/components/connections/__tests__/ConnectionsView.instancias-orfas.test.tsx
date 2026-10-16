import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import React from 'react';

/**
 * PM-37 (parte de tela do PM-36): a tela de Conexões passa a mostrar as
 * instâncias sem correspondência — as que existem só no provedor ou só no
 * banco (`reconcile-instances`, edge `evolution-api`, só leitura) — e só para
 * quem a edge autoriza (admin/supervisor). O Zapp NÃO importa instâncias: a
 * única ação é remover a LINHA local órfã, reaproveitando o handleDelete do
 * gerenciador e a confirmação em duas etapas já existente.
 *
 * A prova renderiza o componente REAL (ConnectionsView + ConnectionDeleteDialog).
 */
const h = vi.hoisted(() => ({
  toast: vi.fn(),
  invoke: vi.fn(),
  role: { isAdmin: true, isSupervisor: true },
  connections: [] as Array<Record<string, unknown>>,
  handleDelete: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => {
      const chain: Record<string, unknown> = {};
      chain.select = () => chain;
      chain.eq = () => chain;
      chain.maybeSingle = () => Promise.resolve({ data: { value: 'true' }, error: null });
      return chain;
    },
    functions: { invoke: h.invoke },
  },
}));
vi.mock('@/hooks/ui/use-toast', () => ({ toast: h.toast }));

vi.mock('@/hooks/system/useUserRole', () => ({
  useUserRole: () => ({ ...h.role, roles: [], loading: false }),
}));

vi.mock('@/hooks/inbox/useConnectionsManager', () => ({
  useConnectionsManager: () => ({
    connections: h.connections,
    loading: false,
    isAddDialogOpen: false,
    setIsAddDialogOpen: vi.fn(),
    qrCodeDialog: { open: false, status: 'loading', qrCode: null, connectionName: '', errorMessage: '' },
    newConnection: { name: '', phone_number: '' },
    setNewConnection: vi.fn(),
    isCreating: false,
    syncingHistory: null,
    setSyncingHistory: vi.fn(),
    evolutionLoading: false,
    handleAddConnection: vi.fn(),
    handleShowQrCode: vi.fn(),
    handleRefreshQrCode: vi.fn(),
    handleCopyId: vi.fn(),
    handleDisconnect: vi.fn(),
    handleSetDefault: vi.fn(),
    handleDelete: h.handleDelete,
    closeQrDialog: vi.fn(),
  }),
}));

vi.mock('framer-motion', () => ({
  motion: { div: ({ children }: { children?: React.ReactNode }) => <div>{children}</div> },
}));
vi.mock('@/components/ui/motion', () => ({
  motion: { div: ({ children }: { children?: React.ReactNode }) => <div>{children}</div> },
  StaggeredList: ({ children, className }: { children?: React.ReactNode; className?: string }) => <div className={className}>{children}</div>,
  StaggeredItem: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock('@/components/ui/dropdown-menu', () => ({
  DropdownMenu: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuTrigger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuItem: ({ children, onClick, disabled }: { children: React.ReactNode; onClick?: () => void; disabled?: boolean }) => (
    <button type="button" role="menuitem" onClick={onClick} disabled={disabled}>{children}</button>
  ),
  DropdownMenuSeparator: () => <hr />,
}));
vi.mock('../BusinessHoursIndicator', () => ({ BusinessHoursIndicator: () => null }));
vi.mock('../BusinessHoursDialog', () => ({ BusinessHoursDialog: () => null }));
vi.mock('../ConnectionQueuesDialog', () => ({ ConnectionQueuesDialog: () => null }));
vi.mock('../InstanceSettingsDialog', () => ({ InstanceSettingsDialog: () => null }));
vi.mock('../NumberReputationMonitor', () => ({ NumberReputationMonitor: () => null }));
vi.mock('@/components/effects/AuroraBorealis', () => ({ AuroraBorealis: () => null }));
vi.mock('@/components/dashboard/FloatingParticles', () => ({ FloatingParticles: () => null }));

import { ConnectionsView } from '../ConnectionsView';

function renderView() {
  return render(
    <MemoryRouter>
      <ConnectionsView />
    </MemoryRouter>,
  );
}

const fantasma = {
  id: 'conn-fantasma', name: 'Fantasma', phone_number: '+55 11 90000-0000', instance_id: 'inst-fantasma',
  status: 'disconnected', is_default: false, created_at: '2026-10-08T00:00:00Z',
};

const divergencia = { so_no_provedor: ['inst-so-provedor'], so_no_banco: ['inst-fantasma'] };

beforeEach(() => {
  cleanup();
  h.toast.mockClear();
  h.invoke.mockReset();
  h.handleDelete.mockReset();
  h.role = { isAdmin: true, isSupervisor: true };
  h.connections = [{ ...fantasma }];
});

describe('ConnectionsView — instâncias sem correspondência (PM-37)', () => {
  it('admin vê o bloco, e "Verificar agora" traz as duas listas da edge', async () => {
    h.invoke.mockResolvedValue({ data: divergencia, error: null });
    renderView();

    fireEvent.click(await screen.findByText('Verificar agora'));

    await waitFor(() => expect(h.invoke).toHaveBeenCalledWith('evolution-api', expect.objectContaining({
      body: { action: 'reconcile-instances' },
    })));
    expect(await screen.findByText('Só no provedor (1)')).toBeTruthy();
    expect(screen.getByText('inst-so-provedor')).toBeTruthy();
    expect(screen.getByText('Só no banco (1)')).toBeTruthy();
    // o id aparece na lista do bloco (o cartão da conexão também o exibe)
    expect(screen.getAllByText('inst-fantasma').length).toBeGreaterThan(0);
    // o Zapp não importa instâncias: nenhuma ação de importar é oferecida
    expect(screen.queryByRole('button', { name: /importar/i })).toBeNull();
  });

  it('agente não vê o bloco nem chama a comparação de instâncias', async () => {
    h.role = { isAdmin: false, isSupervisor: false };
    renderView();

    expect(await screen.findByText('Conexões WhatsApp')).toBeTruthy();
    expect(screen.queryByText('Instâncias sem correspondência')).toBeNull();
    expect(screen.queryByText('Verificar agora')).toBeNull();
    expect(h.invoke).not.toHaveBeenCalledWith('evolution-api', expect.objectContaining({
      body: { action: 'reconcile-instances' },
    }));
  });

  it('remover a linha órfã exige a confirmação em duas etapas e reaproveita o handleDelete', async () => {
    h.invoke.mockResolvedValue({ data: divergencia, error: null });
    renderView();

    fireEvent.click(await screen.findByText('Verificar agora'));
    fireEvent.click(await screen.findByText('Remover linha órfã'));

    // primeiro clique não apaga nada: abre a confirmação com o nome exato
    expect(await screen.findByText('Excluir Fantasma?')).toBeTruthy();
    expect(h.handleDelete).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText(/Digite/i), { target: { value: 'Fantasma' } });
    fireEvent.click(screen.getByRole('button', { name: 'Excluir conexão' }));

    await waitFor(() => expect(h.handleDelete).toHaveBeenCalledTimes(1));
    expect(h.handleDelete).toHaveBeenCalledWith(expect.objectContaining({ id: 'conn-fantasma', instance_id: 'inst-fantasma' }));
  });

  it('erro lógico da edge (200 com error no corpo) vira aviso, sem lista inventada', async () => {
    h.invoke.mockResolvedValue({ data: { error: true, message: 'Provedor indisponível.' }, error: null });
    renderView();

    fireEvent.click(await screen.findByText('Verificar agora'));

    const aviso = await screen.findByRole('alert');
    expect(aviso.textContent).toBe('Provedor indisponível.');
    expect(screen.queryByText(/^Só no provedor/)).toBeNull();
  });
});
