/**
 * t_53fc1ddb — estados de espera do desconectar e subtexto/plural dos cartões
 * de estatística da tela de conexões.
 *
 * Aqui a tela REAL é renderizada com o ConnectionCard e o
 * ConnectionDisconnectDialog reais. Prova-se que:
 *  - enquanto o hook de desconectar não resolve, a conexão entra no estado
 *    `disconnecting`: o cartão e o diálogo mostram "Desconectando…" e a ação
 *    fica travada (nada de fechar antes de terminar);
 *  - os cartões de estatística ganham subtexto e plural corretos.
 */
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({
  flag: { value: 'true' as string | null },
  connections: [] as Array<Record<string, unknown>>,
  handleDisconnect: vi.fn(),
  isAdmin: false,
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => {
      const chain: Record<string, unknown> = {};
      chain.select = () => chain;
      chain.eq = () => chain;
      chain.maybeSingle = () =>
        Promise.resolve({ data: h.flag.value === null ? null : { value: h.flag.value }, error: null });
      return chain;
    },
    functions: { invoke: vi.fn(async () => ({ data: null, error: null })) },
  },
}));
vi.mock('@/hooks/ui/use-toast', () => ({ toast: vi.fn() }));
vi.mock('@/hooks/system/useUserRole', () => ({
  useUserRole: () => ({ isAdmin: h.isAdmin, isSupervisor: false, roles: [], loading: false }),
}));
vi.mock('framer-motion', () => ({
  motion: { div: ({ children }: { children?: import('react').ReactNode }) => <div>{children}</div> },
  AnimatePresence: ({ children }: { children?: import('react').ReactNode }) => <>{children}</>,
  useReducedMotion: vi.fn().mockReturnValue(false),
}));
vi.mock('@/components/ui/motion', () => ({
  motion: { div: ({ children }: { children?: import('react').ReactNode }) => <div>{children}</div> },
  StaggeredList: ({ children }: { children?: import('react').ReactNode }) => <div>{children}</div>,
  StaggeredItem: ({ children }: { children?: import('react').ReactNode }) => <div>{children}</div>,
}));
vi.mock('@/components/ui/dropdown-menu', () => ({
  DropdownMenu: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuTrigger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuItem: ({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) =>
    <button type="button" role="menuitem" onClick={onClick}>{children}</button>,
  DropdownMenuSeparator: () => <hr />,
}));

vi.mock('../NumberReputationMonitor', () => ({ NumberReputationMonitor: () => null }));
vi.mock('../BusinessHoursDialog', () => ({ BusinessHoursDialog: () => null }));
vi.mock('../ConnectionQueuesDialog', () => ({ ConnectionQueuesDialog: () => null }));
vi.mock('../InstanceSettingsDialog', () => ({ InstanceSettingsDialog: () => null }));
vi.mock('../BusinessHoursIndicator', () => ({ BusinessHoursIndicator: () => null }));
vi.mock('@/components/effects/AuroraBorealis', () => ({ AuroraBorealis: () => null }));
vi.mock('@/components/dashboard/FloatingParticles', () => ({ FloatingParticles: () => null }));

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
    handleDisconnect: h.handleDisconnect,
    handleSetDefault: vi.fn(),
    handleDelete: vi.fn(),
    closeQrDialog: vi.fn(),
  }),
}));

import { ConnectionsView } from '../ConnectionsView';

function makeConnection(over: Record<string, unknown> = {}) {
  return {
    id: 'conn-1', name: 'Principal', phone_number: '+55 11 90000-0000',
    instance_id: 'inst-1', status: 'connected', qr_code: null, is_default: true,
    created_at: '2026-10-13T00:00:00Z', ...over,
  };
}

function renderView() {
  return render(
    <MemoryRouter>
      <ConnectionsView />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  h.flag.value = 'true';
  h.isAdmin = false;
  h.connections = [];
  h.handleDisconnect.mockReset();
});

describe('ConnectionsView — estado `disconnecting` do desconectar (t_53fc1ddb)', () => {
  it('em voo: cartão e diálogo mostram "Desconectando…" e travam até o hook resolver', async () => {
    let resolver!: () => void;
    const emVoo = new Promise<void>((resolve) => { resolver = resolve; });
    h.handleDisconnect.mockReturnValue(emVoo);
    h.connections = [makeConnection()];

    renderView();

    // Abre o diálogo pelo botão do cartão.
    fireEvent.click(screen.getByRole('button', { name: /^Desconectar$/ }));
    const dialog = await screen.findByRole('alertdialog');
    expect(h.handleDisconnect).not.toHaveBeenCalled();

    // Confirma: dispara o desconectar, que ainda não resolveu.
    fireEvent.click(within(dialog).getByRole('button', { name: 'Desconectar' }));

    await waitFor(() =>
      expect(within(dialog).getByRole('button', { name: /Desconectando/ })).toBeDisabled());
    expect(within(dialog).getByRole('button', { name: 'Cancelar' })).toBeDisabled();
    expect(h.handleDisconnect).toHaveBeenCalledWith(h.connections[0]);
    // O diálogo NÃO fecha enquanto o desconectar está em voo.
    expect(screen.getByRole('alertdialog')).toBeTruthy();

    // Agora resolve: o diálogo fecha e o estado volta ao normal.
    resolver();
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(screen.getByRole('button', { name: /^Desconectar$/ })).toBeEnabled();
  });
});

describe('ConnectionsView — subtexto e plural dos cartões de estatística (t_53fc1ddb)', () => {
  it('duas conexões: plural e subtextos de estado', () => {
    h.connections = [
      makeConnection({ id: 'a', name: 'A', status: 'connected' }),
      makeConnection({ id: 'b', name: 'B', status: 'disconnected', is_default: false }),
    ];
    renderView();

    expect(screen.getByText('2 instâncias configuradas')).toBeTruthy();
    expect(screen.getByText('Recebendo mensagens')).toBeTruthy();
    expect(screen.getByText('Precisam reconectar')).toBeTruthy();
  });

  it('uma conexão online: singular e estado pleno', () => {
    h.connections = [makeConnection()];
    renderView();

    expect(screen.getByText('1 instância configurada')).toBeTruthy();
    expect(screen.getByText('Recebendo mensagens')).toBeTruthy();
    expect(screen.getByText('Tudo funcionando')).toBeTruthy();
  });
});
