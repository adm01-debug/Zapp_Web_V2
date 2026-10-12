import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ConnectionsView } from '../ConnectionsView';

/**
 * UI-07 (paridade V3 → V2) — diálogo "Adicionar Nova Conexão".
 *
 * O diálogo usava `Input` livre no telefone e só avisava erro por toast
 * (fora do diálogo). Aqui se prova:
 *   - o telefone passa pela máscara `PhoneInput` dentro do diálogo;
 *   - a mensagem de erro vinda da criação aparece DENTRO do diálogo, com
 *     `role="alert"` e `data-testid`, sem fechá-lo;
 *   - sem erro, nenhum alerta é mostrado.
 */
const h = vi.hoisted(() => ({
  setIsAddDialogOpen: vi.fn(),
  setNewConnection: vi.fn(),
  handleAddConnection: vi.fn(),
  addConnectionError: null as string | null,
  newConnection: { name: 'Vendas', phone_number: '' },
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
    functions: { invoke: vi.fn(async () => ({ data: null, error: null })) },
  },
}));

vi.mock('@/hooks/inbox/useConnectionsManager', () => ({
  useConnectionsManager: () => ({
    connections: [],
    loading: false,
    isAddDialogOpen: true,
    setIsAddDialogOpen: h.setIsAddDialogOpen,
    qrCodeDialog: { open: false, status: 'loading', qrCode: null, connectionName: '', errorMessage: '' },
    newConnection: h.newConnection,
    setNewConnection: h.setNewConnection,
    isCreating: false,
    syncingHistory: null,
    setSyncingHistory: vi.fn(),
    evolutionLoading: false,
    handleAddConnection: h.handleAddConnection,
    handleShowQrCode: vi.fn(),
    handleRefreshQrCode: vi.fn(),
    handleCopyId: vi.fn(),
    handleDisconnect: vi.fn(),
    handleSetDefault: vi.fn(),
    handleDelete: vi.fn(),
    closeQrDialog: vi.fn(),
    addConnectionError: h.addConnectionError,
  }),
}));

vi.mock('../NumberReputationMonitor', () => ({ NumberReputationMonitor: () => null }));
vi.mock('../BusinessHoursDialog', () => ({ BusinessHoursDialog: () => null }));
vi.mock('../ConnectionQueuesDialog', () => ({ ConnectionQueuesDialog: () => null }));
vi.mock('../InstanceSettingsDialog', () => ({ InstanceSettingsDialog: () => null }));
vi.mock('../ConnectionCard', () => ({ ConnectionCard: () => null }));
vi.mock('@/components/effects/AuroraBorealis', () => ({ AuroraBorealis: () => null }));
vi.mock('@/components/dashboard/FloatingParticles', () => ({ FloatingParticles: () => null }));

async function renderDialog() {
  render(
    <MemoryRouter>
      <ConnectionsView />
    </MemoryRouter>,
  );
  await waitFor(() => expect(screen.getByText('Adicionar Nova Conexão')).toBeInTheDocument());
}

describe('ConnectionsView — diálogo de nova conexão (UI-07)', () => {
  beforeEach(() => {
    h.addConnectionError = null;
    h.newConnection = { name: 'Vendas', phone_number: '' };
    h.setNewConnection.mockClear();
  });

  it('o telefone do diálogo passa pela máscara (formata o valor que sobe)', async () => {
    await renderDialog();
    const phone = screen.getByPlaceholderText('+55 11 99999-0000') as HTMLInputElement;

    fireEvent.change(phone, { target: { value: '11987654321' } });

    expect(h.setNewConnection).toHaveBeenLastCalledWith({
      name: 'Vendas',
      phone_number: '+55 11 98765-4321',
    });
  });

  it('mostra o erro da criação dentro do diálogo com role=alert, sem fechar', async () => {
    h.addConnectionError = 'Falha ao criar instância na Evolution.';
    await renderDialog();

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Falha ao criar instância na Evolution.');
    expect(alert).toHaveAttribute('data-testid', 'add-connection-error');
    // O diálogo continua aberto.
    expect(screen.getByText('Adicionar Nova Conexão')).toBeInTheDocument();
  });

  it('sem erro não mostra alerta', async () => {
    await renderDialog();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
