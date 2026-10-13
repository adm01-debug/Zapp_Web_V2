import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import React from 'react';

/**
 * t_b41eed0b — o clique em "Sincronizar Histórico" contra a Evolution GO:
 * a função responde 200 com `{ success: false, notSupported: true }`, que o
 * código antigo tratava como sucesso ("Sincronização concluída! 0 mensagens").
 * Agora avisa o usuário em pt-BR e esconde a ação.
 */
const h = vi.hoisted(() => ({
  toast: vi.fn(),
  invoke: vi.fn(),
  connections: [] as Array<Record<string, unknown>>,
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
    handleDelete: vi.fn(),
    closeQrDialog: vi.fn(),
  }),
}));

vi.mock('@/hooks/system/useUserRole', () => ({
  useUserRole: () => ({ isAdmin: true, isSupervisor: true, roles: ['admin'], loading: false }),
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

const conexao = {
  id: 'conn-1', name: 'Principal', phone_number: '+55 11 90000-0000', instance_id: 'inst-1',
  status: 'connected', is_default: false, created_at: '2026-10-08T00:00:00Z',
};

beforeEach(() => {
  cleanup();
  h.toast.mockClear();
  h.invoke.mockReset();
  h.connections = [{ ...conexao }];
});

describe('ConnectionsView — histórico não suportado (Evolution GO)', () => {
  it('notSupported vira aviso e NÃO anuncia sincronização concluída', async () => {
    h.invoke.mockResolvedValue({
      data: { success: false, notSupported: true, message: 'Histórico não é suportado na GO.' },
      error: null,
    });
    renderView();

    fireEvent.click(await screen.findByText('Sincronizar Histórico'));

    await waitFor(() => expect(h.invoke).toHaveBeenCalledWith('evolution-sync', expect.objectContaining({
      body: expect.objectContaining({ action: 'sync-all-messages', instanceName: 'inst-1' }),
    })));
    await waitFor(() => expect(h.toast).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Histórico não suportado', description: 'Histórico não é suportado na GO.' }),
    ));
    expect(h.toast).not.toHaveBeenCalledWith(expect.objectContaining({ title: 'Sincronização concluída!' }));
    // a ação some depois do aviso
    await waitFor(() => expect(screen.queryByText('Sincronizar Histórico')).toBeNull());
  });

  it('sucesso real continua anunciando a sincronização', async () => {
    h.invoke.mockResolvedValue({ data: { success: true, totalSynced: 12, totalContacts: 3 }, error: null });
    renderView();

    fireEvent.click(await screen.findByText('Sincronizar Histórico'));

    await waitFor(() => expect(h.toast).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Sincronização concluída!', description: '12 mensagens sincronizadas de 3 contatos.' }),
    ));
    expect(screen.getByText('Sincronizar Histórico')).toBeTruthy();
  });
});

describe('ConnectionsView — health check por conexão', () => {
  it('"Checar agora" chama a função de health check já existente', async () => {
    h.invoke.mockResolvedValue({ data: { connections: [{}, {}] }, error: null });
    renderView();

    fireEvent.click(await screen.findByText('Checar agora'));

    await waitFor(() => expect(h.invoke).toHaveBeenCalledWith('connection-health-check', expect.objectContaining({ method: 'POST' })));
    await waitFor(() => expect(h.toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Health check concluído' })));
  });
});
